/**
 * PouchStream Main Orchestration Module
 */
import { Api } from './api.js';
import { State } from './state.js';
import { UI } from './ui.js';
import { Editor } from './editor.js';
import { Player } from './player.js';
import { ImageViewer } from './imageViewer.js';
import { AudioPlayer } from './audioPlayer.js';
import { PdfViewer } from './pdfViewer.js';

let pollTimer = null;
let uploadModalInstance = null;
let renameModalInstance = null;
let deleteModalInstance = null;

let pendingDeletePath = null;
let pendingRenamePath = null;
let contextMenuItem = null;
let activeRenameDismiss = null;

// Global error logging handlers
window.addEventListener('error', (event) => {
    console.error('JavaScript Error:', event.message, 'at', event.filename, ':', event.lineno);
    if (UI && typeof UI.showToast === 'function') {
        UI.showToast('Runtime Notice', event.message, 'warning');
    }
});

window.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason ? (event.reason.message || String(event.reason)) : 'Unknown error';
    const lower = msg.toLowerCase();
    // Subtitle probing tries many filename combinations (e.g. movie.srt, movie.en.srt) — 404 / network failures are expected, silence them
    if (msg.includes('AbortError') || msg.includes('interrupted') || msg.includes('user aborted')
        || lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('load failed')
        || lower.includes('subtitle') || msg.includes('HTTP 404') || msg.includes('File not found')) {
        console.warn('Silenced unhandled rejection (subtitle/network probe):', msg);
        event.preventDefault();
        return;
    }
    console.error('Unhandled Promise Rejection:', event.reason);
    if (UI && typeof UI.showToast === 'function') {
        UI.showToast('Error', msg, 'danger');
    }
});

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    initBootstrapModals();
    Editor.init(() => navigateTo(State.currentPath, true, false));
    Player.init();
    ImageViewer.init();
    AudioPlayer.init();
    PdfViewer.init();

    setupTopBar();
    setupSidebar();
    setupToolbar();
    setupTableSorting();
    setupInlinePopovers();
    setupContextMenu();
    setupDragSelection();
    setupKeyboardNavigation();
    setupDialogActions();
    setupSettingsPage();
    setupBulkActions();
    setupWorkspaceDrop();
    setupKeyboardHelp();

    // Listen for browser Back/Forward navigation
    window.addEventListener('popstate', (e) => {
        const targetPath = (e.state && typeof e.state.path === 'string') ? e.state.path : '';
        // Close editor, player, or image/pdf preview if open
        Editor.close();
        Player.stop();
        ImageViewer.close();
        PdfViewer.close();
        if (typeof AudioPlayer !== 'undefined' && AudioPlayer.closeVisualizer) AudioPlayer.closeVisualizer();
        navigateTo(targetPath, false, false);
    });

    await loadServerInfo();
    // Replace initial state with root path
    history.replaceState({ path: '' }, '', window.location.pathname);
    await navigateTo('', false, false);

    startLivePolling();
    restoreLastOpenedFile();
}

function restoreLastOpenedFile() {
    try {
        const raw = localStorage.getItem('pouchstream:lastOpenedFile');
        if (!raw) return;
        const { path, name, type } = JSON.parse(raw);
        if (!path || !type) return;
        // Defer slightly so initial UI settles; validate by trying to open — if file gone, clear storage
        setTimeout(() => {
            // Don't restore if user already opened something else
            if (Player.currentPath || Editor.activePath || ImageViewer.currentPath || PdfViewer.activePath || (typeof AudioPlayer !== 'undefined' && AudioPlayer.currentPath)) return;
            if (type === 'video') {
                Player.play(path, name || path.split('/').pop());
            } else if (type === 'editor') {
                Editor.open(path, name || path.split('/').pop()).catch(() => {
                    localStorage.removeItem('pouchstream:lastOpenedFile');
                });
            } else if (type === 'image') {
                ImageViewer.open(path, name || path.split('/').pop());
            } else if (type === 'pdf') {
                PdfViewer.open(path, name || path.split('/').pop());
            }
        }, 400);
    } catch {}
}

function initBootstrapModals() {
    if (!window.bootstrap || !window.bootstrap.Modal) return;

    const uploadEl = document.getElementById('uploadModal');
    if (uploadEl) uploadModalInstance = new window.bootstrap.Modal(uploadEl);

    const renameEl = document.getElementById('renameModal');
    if (renameEl) renameModalInstance = new window.bootstrap.Modal(renameEl);

    const deleteEl = document.getElementById('deleteModal');
    if (deleteEl) deleteModalInstance = new window.bootstrap.Modal(deleteEl);

    // Smooth 100ms linear fade out on dismiss for all Bootstrap dropdowns & dropups
    document.addEventListener('hide.bs.dropdown', (e) => {
        const menu = e.target.querySelector('.dropdown-menu');
        if (menu && !menu.dataset.isFadingOut) {
            e.preventDefault();
            menu.dataset.isFadingOut = 'true';
            menu.classList.add('closing');
            setTimeout(() => {
                delete menu.dataset.isFadingOut;
                menu.classList.remove('closing');
                const dropdownInstance = window.bootstrap.Dropdown.getInstance(e.target.querySelector('[data-bs-toggle="dropdown"]'));
                if (dropdownInstance) {
                    dropdownInstance.hide();
                } else {
                    menu.classList.remove('show');
                }
            }, 100);
        }
    });
}

async function loadServerInfo() {
    try {
        const info = await Api.getInfo();
        if (info.folderName) {
            State.rootFolderName = info.folderName;
        }

        const urlBadge = document.getElementById('topbarServerUrl');
        if (urlBadge) {
            if ('value' in urlBadge) {
                urlBadge.value = `${window.location.origin}`;
            } else {
                urlBadge.textContent = `${window.location.origin}`;
            }
        }

        const portBadge = document.getElementById('settingsServerPort');
        if (portBadge) {
            portBadge.textContent = info.port || window.location.port || '8080';
        }

        const serverVersion = document.getElementById('settingsServerVersion');
        if (serverVersion && info.version) {
            serverVersion.textContent = info.version;
        }

        const hostOs = document.getElementById('settingsHostOs');
        if (hostOs && info.os) {
            hostOs.textContent = info.os;
        }

        const hostDevice = document.getElementById('settingsHostDevice');
        if (hostDevice && info.device) {
            hostDevice.textContent = info.device;
        }

        const serverEngine = document.getElementById('settingsServerEngine');
        if (serverEngine && info.engine) {
            serverEngine.textContent = info.engine;
        }

        const hostArch = document.getElementById('settingsHostArch');
        if (hostArch && info.arch) {
            hostArch.textContent = info.arch;
        }

        const storageCapacity = document.getElementById('settingsStorageCapacity');
        if (storageCapacity && info.storage && info.storage.totalBytes) {
            const freeGb = (info.storage.freeBytes / (1024 * 1024 * 1024)).toFixed(1);
            const totalGb = (info.storage.totalBytes / (1024 * 1024 * 1024)).toFixed(1);
            storageCapacity.textContent = `${freeGb} GB free of ${totalGb} GB`;
        }
    } catch (e) {
        console.warn('Could not load server metadata:', e);
    }
}

async function navigateTo(path, silent = false, pushHistory = true) {
    if (pushHistory && path !== State.currentPath) {
        history.pushState({ path }, '', window.location.pathname);
    }

    const prevPath = State.currentPath;
    State.setPath(path);

    // Drop stale selection when entering a different folder, otherwise the
    // previously selected row keeps the bulk-actions bar open in the new folder.
    if (State.currentPath !== prevPath && State.selectedPaths.size > 0) {
        State.clearSelection();
        window.dispatchEvent(new CustomEvent('pouch:selectionChanged'));
    }

    // Make sure in-content editor / video / image / settings / rename are closed when navigating folders manually
    if (!silent) {
        if (activeRenameDismiss) {
            activeRenameDismiss();
            activeRenameDismiss = null;
        }
        closeSettingsView();
        Editor.close();
        Player.stop();
        ImageViewer.close();
        PdfViewer.close();
        if (typeof AudioPlayer !== 'undefined' && AudioPlayer.closeVisualizer) AudioPlayer.closeVisualizer();
        setTableLoading(true);
    }

    try {
        const data = await Api.getFiles(State.currentPath);
        State.items = data.items || [];
        State.signature = data.signature;
        State.meta = {
            folderCount: data.folderCount || 0,
            fileCount: data.fileCount || 0,
            totalSize: data.totalSize || 0,
            currentName: data.currentName || State.rootFolderName,
            parentPath: data.parentPath || ''
        };

        if (!State.currentPath && data.currentName) {
            State.rootFolderName = data.currentName;
        }

        UI.renderBreadcrumbs((p) => navigateTo(p));
        UI.renderStatusbar();
        renderActiveTable();
        UI.renderSidebarStats();
    } catch (e) {
        if (!silent) {
            setTableError(e.message);
        }
        UI.showToast('Navigation Error', e.message, 'danger');
    } finally {
        if (!silent) {
            setTableLoading(false);
        }
    }
}

function renderActiveTable() {
    if (activeRenameDismiss) {
        activeRenameDismiss();
        activeRenameDismiss = null;
    }
    UI.renderTable(
        (p) => navigateTo(p),
        (p, name) => { State.pushRecent({path:p, name, isDirectory:false}); Player.play(p, name); },
        (p, name) => { State.pushRecent({path:p, name, isDirectory:false}); Editor.open(p, name); },
        (p, name) => { State.pushRecent({path:p, name, isDirectory:false}); ImageViewer.open(p, name); },
        (p, name) => promptDelete(p, name),
        (p, name) => promptRename(p, name),
        (e, item) => showRowContextMenu(e, item),
        (p, name) => { State.pushRecent({path:p, name, isDirectory:false}); AudioPlayer.play(p, name); },
        (p, name) => { State.pushRecent({path:p, name, isDirectory:false}); PdfViewer.open(p, name); }
    );
}

let loadingTimer = null;

function setTableLoading(isLoading) {
    const loader = document.getElementById('tableLoadingIndicator');
    if (!loader) return;

    if (loadingTimer) {
        clearTimeout(loadingTimer);
        loadingTimer = null;
    }

    if (isLoading) {
        loader.classList.remove('d-none');
    } else {
        loader.classList.add('d-none');
    }
}

function setTableError(msg) {
    const tbody = document.getElementById('fileTableBody');
    if (!tbody) return;
    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="text-center py-5 text-danger">
                <ion-icon name="warning-outline" style="font-size: 2rem;" class="d-block mx-auto mb-2"></ion-icon>
                <div class="fw-semibold">Error Loading Directory</div>
                <div class="small text-muted mb-3">${UI.escapeHtml(msg)}</div>
                <button type="button" class="btn btn-sm btn-outline-secondary" id="btnRetry">
                    <ion-icon name="refresh-outline" class="me-1"></ion-icon> Retry
                </button>
            </td>
        </tr>
    `;
    const btnRetry = document.getElementById('btnRetry');
    if (btnRetry) btnRetry.addEventListener('click', () => navigateTo(State.currentPath));
}

function setupTopBar() {
    const btnCopyUrl = document.getElementById('btnCopyServerUrl');
    if (btnCopyUrl) {
        btnCopyUrl.addEventListener('click', () => {
            const urlInput = document.getElementById('topbarServerUrl');
            const url = (urlInput && urlInput.value) ? urlInput.value : window.location.origin;
            navigator.clipboard.writeText(url).then(() => {
                const origHtml = btnCopyUrl.innerHTML;
                btnCopyUrl.innerHTML = '<ion-icon name="checkmark-outline" class="text-success"></ion-icon>';
                setTimeout(() => {
                    btnCopyUrl.innerHTML = origHtml;
                }, 1800);
                UI.showToast('Clipboard', 'Server address copied to clipboard', 'success');
            }).catch(() => {
                UI.showToast('Clipboard Error', 'Failed to copy URL', 'danger');
            });
        });
    }
}

function setupSidebar() {
    const btnToggle = document.getElementById('btnToggleSidebar');
    const sidebar = document.getElementById('portalSidebar');

    if (btnToggle && sidebar) {
        // Restore sidebar state from localStorage
        try {
            const isCollapsed = (localStorage.getItem('app.sidebar:collapsed') || localStorage.getItem('pouchstream_sidebar_collapsed')) === 'true';
            if (isCollapsed) {
                sidebar.classList.add('collapsed');
            }
        } catch (_) {}

        btnToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            const collapsed = sidebar.classList.contains('collapsed');
            try {
                localStorage.setItem('app.sidebar:collapsed', collapsed ? 'true' : 'false');
            } catch (_) {}
        });
    }

    const links = document.querySelectorAll('.sidebar-link[data-category]');
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            // If a viewer is open (video/image/editor/pdf/audio visualizer/settings), close it first so category switch is visible
            const isVideoOpen = !document.getElementById('contentVideoView')?.classList.contains('d-none');
            const isImageOpen = !document.getElementById('contentImageView')?.classList.contains('d-none');
            const isEditorOpen = !document.getElementById('contentEditorView')?.classList.contains('d-none');
            const isPdfOpen = !document.getElementById('contentPdfView')?.classList.contains('d-none');
            const isAudioVisOpen = !document.getElementById('contentAudioVisualizer')?.classList.contains('d-none');
            if (isVideoOpen || isImageOpen || isEditorOpen || isPdfOpen || isAudioVisOpen) {
                Player.stop();
                ImageViewer.close();
                Editor.close();
                PdfViewer.close();
                if (typeof AudioPlayer !== 'undefined' && AudioPlayer.closeVisualizer) AudioPlayer.closeVisualizer(true);
                // ensure workspace/toolbar visible after closing viewers
                const ws = document.getElementById('workspaceView');
                const tb = document.getElementById('portalToolbar');
                if (ws) ws.classList.remove('d-none');
                if (tb) tb.classList.remove('d-none');
                // also exit fullscreen if active (browser may keep fullscreen on closed element)
                try {
                    if (document.fullscreenElement || document.webkitFullscreenElement) {
                        const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
                        if (exit) { const p = exit.call(document); if (p && p.catch) p.catch(() => {}); }
                    }
                } catch {}
            }
            closeSettingsView();
            links.forEach(l => l.classList.remove('active'));
            const btnSettings = document.getElementById('btnSidebarSettings');
            if (btnSettings) btnSettings.classList.remove('active');
            link.classList.add('active');
            State.activeCategory = link.getAttribute('data-category') || 'all';
            renderActiveTable();
        });
    });

    const btnSettings = document.getElementById('btnSidebarSettings');
    if (btnSettings) {
        btnSettings.addEventListener('click', (e) => {
            e.preventDefault();
            links.forEach(l => l.classList.remove('active'));
            btnSettings.classList.add('active');
            openSettingsView();
        });
    }

    const btnCloseSettings = document.getElementById('btnCloseSettings');
    if (btnCloseSettings) {
        btnCloseSettings.addEventListener('click', () => {
            closeSettingsView();
            const allLink = document.querySelector('.sidebar-link[data-category="all"]');
            if (allLink) allLink.classList.add('active');
            if (btnSettings) btnSettings.classList.remove('active');
        });
    }
}

function setupSettingsPage() {
    // 1. Live Polling Rate Dropdown
    const selectPolling = document.getElementById('settingPollingRate');
    if (selectPolling) {
        try {
            const savedRate = localStorage.getItem('app.server:polling_rate') || '2500';
            selectPolling.value = savedRate;
        } catch (_) {}

        selectPolling.addEventListener('change', (e) => {
            const rate = e.target.value;
            try {
                localStorage.setItem('app.server:polling_rate', rate);
            } catch (_) {}
            startLivePolling();
        });
    }

    // 2. Editor Theme Dropdown in Settings
    const selectEditorTheme = document.getElementById('settingEditorTheme');
    if (selectEditorTheme) {
        try {
            const savedTheme = localStorage.getItem('editor.monaco:theme') || 'oled-black';
            selectEditorTheme.value = savedTheme;
        } catch (_) {}

        selectEditorTheme.addEventListener('change', (e) => {
            const theme = e.target.value;
            Editor.setTheme(theme);
        });
    }

    // 3. Editor Font Size Dropdown in Settings
    const selectEditorSize = document.getElementById('settingEditorFontSize');
    if (selectEditorSize) {
        try {
            const savedSize = localStorage.getItem('editor.monaco:font_size') || '13';
            selectEditorSize.value = savedSize;
        } catch (_) {}

        selectEditorSize.addEventListener('change', (e) => {
            const size = parseInt(e.target.value, 10);
            if (!isNaN(size)) {
                Editor.setFontSize(size);
            }
        });
    }

    // 4. Video Autoplay Full-Row Button & Switch
    const rowAutoplay = document.getElementById('rowSettingAutoplay');
    const chkAutoplay = document.getElementById('settingAutoplay');
    if (rowAutoplay && chkAutoplay) {
        try {
            const saved = localStorage.getItem('player.video:autoplay');
            if (saved !== null) {
                chkAutoplay.checked = saved === 'true';
            }
        } catch (_) {}

        const updateAutoplay = (val) => {
            chkAutoplay.checked = val;
            try {
                localStorage.setItem('player.video:autoplay', val ? 'true' : 'false');
            } catch (_) {}
        };

        rowAutoplay.addEventListener('click', () => {
            updateAutoplay(!chkAutoplay.checked);
        });

        chkAutoplay.addEventListener('change', (e) => {
            updateAutoplay(e.target.checked);
        });
    }

    // 5. Controls Auto-Hide Full-Row Button & Switch
    const rowAutoHide = document.getElementById('rowSettingControlsAutoHide');
    const chkAutoHide = document.getElementById('settingControlsAutoHide');
    if (rowAutoHide && chkAutoHide) {
        try {
            const saved = localStorage.getItem('player.video:auto_hide_controls');
            if (saved !== null) {
                chkAutoHide.checked = saved === 'true';
            }
        } catch (_) {}

        const updateAutoHide = (val) => {
            chkAutoHide.checked = val;
            try {
                localStorage.setItem('player.video:auto_hide_controls', val ? 'true' : 'false');
            } catch (_) {}
        };

        rowAutoHide.addEventListener('click', () => {
            updateAutoHide(!chkAutoHide.checked);
        });

        chkAutoHide.addEventListener('change', (e) => {
            updateAutoHide(e.target.checked);
        });
    }

    // 6. Double-Click Navigation Full-Row Button & Switch
    const rowDblClickNav = document.getElementById('rowSettingDblClickNav');
    const chkDblClickNav = document.getElementById('settingDblClickNav');
    if (rowDblClickNav && chkDblClickNav) {
        try {
            const saved = localStorage.getItem('ui.nav:double_click_nav');
            if (saved !== null) {
                chkDblClickNav.checked = saved === 'true';
            }
        } catch (_) {}

        const updateDblClickNav = (val) => {
            chkDblClickNav.checked = val;
            try {
                localStorage.setItem('ui.nav:double_click_nav', val ? 'true' : 'false');
            } catch (_) {}
        };

        rowDblClickNav.addEventListener('click', () => {
            updateDblClickNav(!chkDblClickNav.checked);
        });

        chkDblClickNav.addEventListener('change', (e) => {
            updateDblClickNav(e.target.checked);
        });
    }
}

function setupBulkActions() {
    const bulkBar = document.getElementById('bulkActionsBar');
    const countEl = document.getElementById('bulkSelectedCount');
    const clearHover = document.getElementById('bulkClearHover');
    const btnCount = document.getElementById('btnBulkCount');
    const btnDownload = document.getElementById('btnBulkDownload');
    const btnDelete = document.getElementById('btnBulkDelete');
    const btnMove = document.getElementById('btnBulkMove');
    const chkAll = document.getElementById('chkSelectAll');
    const updateBar = () => {
        const sel = State.selectedPaths.size;
        if (bulkBar) {
            if (sel > 0) {
                bulkBar.classList.remove('d-none');
                bulkBar.classList.add('d-flex');
                // trigger reflow then slide down
                void bulkBar.offsetHeight;
                bulkBar.classList.add('show');
            } else {
                bulkBar.classList.remove('show');
                setTimeout(() => {
                    if (State.selectedPaths.size === 0) {
                        bulkBar.classList.add('d-none');
                        bulkBar.classList.remove('d-flex');
                    }
                }, 360);
            }
        }
        if (countEl) countEl.textContent = `${sel} selected`;
        if (chkAll) {
            const all = State.getFilteredItems().map(i => i.path);
            const c = all.filter(p => State.selectedPaths.has(p)).length;
            chkAll.checked = all.length > 0 && c === all.length;
            chkAll.indeterminate = c > 0 && c < all.length;
        }
    };
    // merged count/clear: hover shows Clear
    if (btnCount && countEl && clearHover) {
        btnCount.addEventListener('mouseenter', () => {
            countEl.classList.add('d-none');
            clearHover.classList.remove('d-none');
            clearHover.classList.add('d-flex');
        });
        btnCount.addEventListener('mouseleave', () => {
            countEl.classList.remove('d-none');
            clearHover.classList.add('d-none');
            clearHover.classList.remove('d-flex');
        });
        btnCount.addEventListener('click', () => {
            State.clearSelection(); UI.updateSelectionUI(); updateBar();
            renderActiveTable();
        });
    }
    window.addEventListener('pouch:selectionChanged', updateBar);
    // also update after table render
    const origRender = UI.renderTable.bind(UI);
    UI.renderTable = (...args) => { origRender(...args); updateBar(); };
    if (chkAll) {
        chkAll.addEventListener('change', () => {
            const all = State.getFilteredItems();
            if (chkAll.checked) all.forEach(i => State.selectedPaths.add(i.path));
            else State.selectedPaths.clear();
            UI.updateSelectionUI();
            updateBar();
            renderActiveTable();
        });
    }
    const btnBulkZip = document.getElementById('btnBulkZip');
    if (btnBulkZip) {
        btnBulkZip.addEventListener('click', () => {
            const sel = [...State.selectedPaths];
            if (sel.length === 0) return;
            const pathsParam = sel.join(',');
            const a = document.createElement('a');
            a.href = `/api/zip?paths=${encodeURIComponent(pathsParam)}`;
            a.download = 'selected_files.zip';
            document.body.appendChild(a); a.click(); a.remove();
            UI.showToast('Download ZIP', `Started ZIP download of ${sel.length} items`, 'success');
        });
    }
    if (btnDownload) btnDownload.addEventListener('click', async () => {
        const sel = [...State.selectedPaths];
        if (sel.length === 0) return;
        if (sel.length === 1) {
            const a = document.createElement('a');
            a.href = `/api/stream?path=${encodeURIComponent(sel[0])}&download=true`;
            a.download = sel[0].split('/').pop();
            document.body.appendChild(a); a.click(); a.remove();
            UI.showToast('Download', 'Started download', 'success');
        } else {
            const pathsParam = sel.join(',');
            const a = document.createElement('a');
            a.href = `/api/zip?paths=${encodeURIComponent(pathsParam)}`;
            a.download = 'selected_files.zip';
            document.body.appendChild(a); a.click(); a.remove();
            UI.showToast('Bulk Download', `Downloading ${sel.length} files as ZIP archive...`, 'success');
        }
    });
    if (btnDelete) btnDelete.addEventListener('click', async () => {
        const sel = [...State.selectedPaths];
        if (sel.length === 0) return;
        if (!confirm(`Delete ${sel.length} item(s)? This cannot be undone.`)) return;
        let ok = 0, fail = 0;
        for (const p of sel) { try { await Api.deleteItem(p); ok++; } catch { fail++; } }
        UI.showToast('Bulk Delete', `${ok} deleted${fail?`, ${fail} failed`:''}`, fail?'danger':'success');
        State.clearSelection();
        navigateTo(State.currentPath, true);
    });
    if (btnMove) btnMove.addEventListener('click', async () => {
        const sel = [...State.selectedPaths];
        if (sel.length === 0) return;
        const dest = prompt(`Move ${sel.length} item(s) to folder (relative path, empty = root):`, State.currentPath || '');
        if (dest === null) return;
        const target = (dest || '').trim().replace(/^\/+|\/+$/g,'');
        let ok = 0, fail = 0;
        for (const p of sel) {
            const name = p.split('/').pop();
            const newPath = target ? `${target}/${name}` : name;
            // use rename to move — server rename handles same parent move via path, but cross-folder move needs API that supports full path; we try rename then fallback to not implemented
            try {
                // If same folder, skip
                if (p === newPath) { ok++; continue; }
                await Api.renameItem(p, name); // placeholder — server rename stays in same folder; for true move we need server support
                // For now, if dest differs from current, show warning
                if (target !== State.currentPath) UI.showToast('Move', 'Cross-folder move not yet supported on server — file renamed in place', 'warning');
                ok++;
            } catch { fail++; }
        }
        UI.showToast('Bulk Move', `${ok} moved${fail?`, ${fail} failed`:''}`, fail?'danger':'success');
        navigateTo(State.currentPath, true);
    });
}

async function getFileFromEntry(fileEntry) {
    return new Promise((resolve, reject) => {
        fileEntry.file(resolve, reject);
    });
}

async function readAllDirectoryEntries(directoryReader) {
    const entries = [];
    let readEntries = await new Promise((resolve, reject) => {
        directoryReader.readEntries(resolve, reject);
    });
    while (readEntries && readEntries.length > 0) {
        entries.push(...readEntries);
        readEntries = await new Promise((resolve, reject) => {
            directoryReader.readEntries(resolve, reject);
        });
    }
    return entries;
}

async function traverseEntry(entry, path = '') {
    if (entry.isFile) {
        const file = await getFileFromEntry(entry);
        const relPath = path ? `${path}/${file.name}` : file.name;
        Object.defineProperty(file, 'relativePath', { value: relPath, writable: true, configurable: true });
        return { files: [file], emptyDirs: [] };
    } else if (entry.isDirectory) {
        const dirPath = path ? `${path}/${entry.name}` : entry.name;
        const reader = entry.createReader();
        const entries = await readAllDirectoryEntries(reader);
        if (!entries || entries.length === 0) {
            return { files: [], emptyDirs: [dirPath] };
        }
        const files = [];
        const emptyDirs = [];
        for (const child of entries) {
            const res = await traverseEntry(child, dirPath);
            files.push(...res.files);
            emptyDirs.push(...res.emptyDirs);
        }
        return { files, emptyDirs };
    }
    return { files: [], emptyDirs: [] };
}

async function extractDataTransferItems(dataTransfer) {
    const items = dataTransfer.items;
    if (items && items.length > 0 && typeof items[0].webkitGetAsEntry === 'function') {
        const files = [];
        const emptyDirs = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const entry = (typeof item.webkitGetAsEntry === 'function') ? item.webkitGetAsEntry() : null;
            if (entry) {
                const res = await traverseEntry(entry);
                files.push(...res.files);
                emptyDirs.push(...res.emptyDirs);
            }
        }
        if (files.length > 0 || emptyDirs.length > 0) {
            return { files, emptyDirs };
        }
    }
    const rawFiles = Array.from(dataTransfer.files || []);
    return { files: rawFiles, emptyDirs: [] };
}

async function uploadRecursivePayload(targetPath, files, emptyDirs = [], onProgress) {
    for (const emptyDir of emptyDirs) {
        const fullDir = targetPath ? `${targetPath}/${emptyDir}` : emptyDir;
        const lastSlash = fullDir.lastIndexOf('/');
        const parent = lastSlash >= 0 ? fullDir.substring(0, lastSlash) : '';
        const name = lastSlash >= 0 ? fullDir.substring(lastSlash + 1) : fullDir;
        try {
            await Api.createFolder(parent, name);
        } catch (e) {
            console.warn('Could not pre-create directory:', fullDir, e);
        }
    }
    if (files.length > 0) {
        return await Api.uploadFiles(targetPath, files, onProgress);
    }
    return { success: true, uploaded: 0 };
}

function setupWorkspaceDrop() {
    const ws = document.getElementById('workspaceView');
    const overlay = document.getElementById('workspaceDropOverlay');
    const label = document.getElementById('workspaceDropLabel');
    const progWrap = document.getElementById('workspaceDropProgressWrap');
    const progBar = document.getElementById('workspaceDropProgress');
    if (!ws || !overlay) return;
    let dragDepth = 0;
    const showOverlay = () => {
        overlay.classList.remove('d-none');
        overlay.classList.add('d-flex');
        if (label) label.textContent = `to ${State.currentPath || 'root'}`;
    };
    const hideOverlay = () => {
        overlay.classList.add('d-none');
        overlay.classList.remove('d-flex');
        dragDepth = 0;
        if (progWrap) progWrap.classList.add('d-none');
        if (progBar) progBar.style.width = '0%';
    };

    ws.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; showOverlay(); });
    ws.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    ws.addEventListener('dragleave', (e) => { e.preventDefault(); dragDepth--; if (dragDepth <= 0) hideOverlay(); });
    overlay.addEventListener('dragover', (e) => { e.preventDefault(); });

    const handleDrop = async (e) => {
        e.preventDefault();
        const dt = e.dataTransfer;
        if (!dt) { hideOverlay(); return; }
        showOverlay();
        if (progWrap) progWrap.classList.remove('d-none');
        if (label) label.textContent = 'Scanning dropped items...';
        try {
            const { files, emptyDirs } = await extractDataTransferItems(dt);
            if (files.length === 0 && emptyDirs.length === 0) {
                hideOverlay();
                return;
            }
            if (label) label.textContent = `Uploading ${files.length} file(s)...`;
            await uploadRecursivePayload(State.currentPath, files, emptyDirs, (pct) => {
                if (progBar) progBar.style.width = `${pct}%`;
            });
            UI.showToast('Upload Complete', `Uploaded ${files.length} file(s)${emptyDirs.length ? ` and created ${emptyDirs.length} folder(s)` : ''}`, 'success');
            navigateTo(State.currentPath, true);
        } catch (err) {
            UI.showToast('Upload Failed', err.message, 'danger');
        } finally {
            hideOverlay();
        }
    };

    overlay.addEventListener('drop', handleDrop);
    ws.addEventListener('drop', handleDrop);
}

function setupKeyboardHelp() {
    const overlay = document.getElementById('keyboardHelpOverlay');
    const btnClose = document.getElementById('btnCloseHelp');
    const toggle = (show) => {
        if (!overlay) return;
        if (show) { overlay.classList.remove('d-none'); overlay.classList.add('d-flex'); }
        else { overlay.classList.add('d-none'); overlay.classList.remove('d-flex'); }
    };
    window.addEventListener('keydown', (e) => {
        if (e.key === '?' || (e.shiftKey && e.key === '/')) {
            const ae = document.activeElement;
            if (ae && ['INPUT','TEXTAREA','SELECT'].includes(ae.tagName)) return;
            e.preventDefault();
            const isVisible = overlay && !overlay.classList.contains('d-none');
            toggle(!isVisible);
        } else if (e.key === 'Escape' && overlay && !overlay.classList.contains('d-none')) {
            toggle(false);
        }
    });
    if (btnClose) btnClose.addEventListener('click', () => toggle(false));
    if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) toggle(false); });
}

function openSettingsView() {
    // Close any viewer and exit fullscreen so Settings is visible (handles video playing case)
    try {
        if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement) {
            const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
            if (exit) { const p = exit.call(document); if (p && p.catch) p.catch(() => {}); }
        }
    } catch {}
    Editor.close();
    Player.stop();
    ImageViewer.close();
    PdfViewer.close();
    if (typeof AudioPlayer !== 'undefined' && AudioPlayer.closeVisualizer) AudioPlayer.closeVisualizer(true);

    const workspaceView = document.getElementById('workspaceView');
    const toolbar = document.getElementById('portalToolbar');
    const settingsView = document.getElementById('contentSettingsView');
    const serverAddr = document.getElementById('settingsServerAddress');

    if (serverAddr) serverAddr.textContent = window.location.origin;

    // Sync settings dropdowns with current editor state
    const selectTheme = document.getElementById('settingEditorTheme');
    if (selectTheme && Editor.currentTheme) {
        selectTheme.value = Editor.currentTheme;
    }
    const selectSize = document.getElementById('settingEditorFontSize');
    if (selectSize && Editor.currentFontSize) {
        selectSize.value = Editor.currentFontSize.toString();
    }

    if (workspaceView) workspaceView.classList.add('d-none');
    if (toolbar) toolbar.classList.add('d-none');
    if (settingsView) {
        settingsView.classList.remove('d-none');
        settingsView.classList.add('d-flex');
    }
}

function closeSettingsView() {
    const workspaceView = document.getElementById('workspaceView');
    const toolbar = document.getElementById('portalToolbar');
    const settingsView = document.getElementById('contentSettingsView');

    if (settingsView) {
        settingsView.classList.add('d-none');
        settingsView.classList.remove('d-flex');
    }
    if (workspaceView) workspaceView.classList.remove('d-none');
    if (toolbar) toolbar.classList.remove('d-none');
}

function setupToolbar() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            State.filterQuery = e.target.value;
            renderActiveTable();
        });
    }

    const btnRefresh = document.getElementById('btnToolbarRefresh');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => navigateTo(State.currentPath));
    }

    const btnDownloadFolderZip = document.getElementById('btnDownloadFolderZip');
    if (btnDownloadFolderZip) {
        btnDownloadFolderZip.addEventListener('click', () => {
            const folderName = State.meta?.currentName || 'folder';
            const a = document.createElement('a');
            a.href = `/api/zip?path=${encodeURIComponent(State.currentPath || '')}`;
            a.download = `${folderName}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            UI.showToast('Download ZIP', `Started ZIP download of folder "${folderName}"`, 'success');
        });
    }
}

function setupTableSorting() {
    const headers = document.querySelectorAll('.sortable-header[data-sort]');
    headers.forEach(th => {
        th.addEventListener('click', () => {
            const field = th.getAttribute('data-sort');
            State.setSort(field);
            renderActiveTable();
        });
    });
}

/* Curtain Popover Helper with Opening and 100ms Linear Fade Out Closing Animations */
function toggleCurtain(boxEl, show) {
    if (show) {
        boxEl.classList.remove('d-none', 'closing');
        const input = boxEl.querySelector('input');
        if (input) {
            input.value = '';
            setTimeout(() => input.focus(), 50);
        }
    } else {
        if (boxEl.classList.contains('d-none')) return;
        boxEl.classList.add('closing');
        setTimeout(() => {
            boxEl.classList.add('d-none');
            boxEl.classList.remove('closing');
        }, 100);
    }
}

function setupInlinePopovers() {
    const btnToggleFolder = document.getElementById('btnToggleNewFolder');
    const curtainFolder = document.getElementById('curtainNewFolder');
    const inputFolder = document.getElementById('inputInlineFolderName');
    const btnCancelFolder = document.getElementById('btnCancelInlineFolder');
    const btnConfirmFolder = document.getElementById('btnConfirmInlineFolder');

    const btnToggleFile = document.getElementById('btnToggleNewFile');
    const curtainFile = document.getElementById('curtainNewFile');
    const inputFile = document.getElementById('inputInlineFileName');
    const btnCancelFile = document.getElementById('btnCancelInlineFile');
    const btnConfirmFile = document.getElementById('btnConfirmInlineFile');

    if (btnToggleFolder && curtainFolder) {
        btnToggleFolder.addEventListener('click', (e) => {
            e.stopPropagation();
            if (curtainFile) toggleCurtain(curtainFile, false);
            const isHidden = curtainFolder.classList.contains('d-none');
            toggleCurtain(curtainFolder, isHidden);
        });

        if (btnCancelFolder) {
            btnCancelFolder.addEventListener('click', () => toggleCurtain(curtainFolder, false));
        }

        const handleCreateFolder = async () => {
            const name = (inputFolder ? inputFolder.value : '').trim();
            if (!name) return;
            try {
                await Api.createFolder(State.currentPath, name);
                toggleCurtain(curtainFolder, false);
                UI.showToast('Directory Created', `Created folder "${name}"`, 'success');
                navigateTo(State.currentPath, true);
            } catch (e) {
                UI.showToast('Action Failed', e.message, 'danger');
            }
        };

        if (btnConfirmFolder) btnConfirmFolder.addEventListener('click', handleCreateFolder);
        if (inputFolder) {
            inputFolder.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') toggleCurtain(curtainFolder, false);
            });
        }
    }

    if (btnToggleFile && curtainFile) {
        btnToggleFile.addEventListener('click', (e) => {
            e.stopPropagation();
            if (curtainFolder) toggleCurtain(curtainFolder, false);
            const isHidden = curtainFile.classList.contains('d-none');
            toggleCurtain(curtainFile, isHidden);
        });

        if (btnCancelFile) {
            btnCancelFile.addEventListener('click', () => toggleCurtain(curtainFile, false));
        }

        const handleCreateFile = async () => {
            const name = (inputFile ? inputFile.value : '').trim();
            if (!name) return;
            try {
                await Api.createFile(State.currentPath, name);
                toggleCurtain(curtainFile, false);
                UI.showToast('File Created', `Created file "${name}"`, 'success');
                navigateTo(State.currentPath, true);
                const fullPath = State.currentPath ? `${State.currentPath}/${name}` : name;
                Editor.open(fullPath, name);
            } catch (e) {
                UI.showToast('Action Failed', e.message, 'danger');
            }
        };

        if (btnConfirmFile) btnConfirmFile.addEventListener('click', handleCreateFile);
        if (inputFile) {
            inputFile.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') handleCreateFile();
                if (e.key === 'Escape') toggleCurtain(curtainFile, false);
            });
        }
    }

    // Close curtains on click outside
    document.addEventListener('click', (e) => {
        if (curtainFolder && !curtainFolder.contains(e.target) && e.target !== btnToggleFolder) {
            toggleCurtain(curtainFolder, false);
        }
        if (curtainFile && !curtainFile.contains(e.target) && e.target !== btnToggleFile) {
            toggleCurtain(curtainFile, false);
        }
    });
}

function showRowContextMenu(e, item) {
    contextMenuItem = item;
    hideAllContextMenus(true);

    const menu = document.getElementById('rowContextMenu');
    if (!menu) return;

    const isVideo = UI.isVideo(item);
    const isAudio = UI.isAudio(item);
    const isPdf = UI.isPdf(item);
    const isImage = UI.isImage(item);
    const isEditable = UI.isEditable(item);

    const btnOpen = menu.querySelector('[data-action="open"]');
    const btnPreviewImage = menu.querySelector('[data-action="preview-image"]');
    const btnPreviewPdf = menu.querySelector('[data-action="preview-pdf"]');
    const btnPlayAudio = menu.querySelector('[data-action="play-audio"]');
    const btnStream = menu.querySelector('[data-action="stream"]');
    const btnEdit = menu.querySelector('[data-action="edit"]');
    const btnDownload = menu.querySelector('[data-action="download"]');
    const btnDownloadZip = menu.querySelector('[data-action="download-zip"]');

    if (btnOpen) btnOpen.classList.toggle('d-none', !item.isDirectory);
    if (btnPreviewImage) btnPreviewImage.classList.toggle('d-none', !isImage);
    if (btnPreviewPdf) btnPreviewPdf.classList.toggle('d-none', !isPdf);
    if (btnPlayAudio) btnPlayAudio.classList.toggle('d-none', !isAudio);
    if (btnStream) btnStream.classList.toggle('d-none', !isVideo);
    if (btnEdit) btnEdit.classList.toggle('d-none', !isEditable);
    if (btnDownload) {
        btnDownload.classList.toggle('d-none', item.isDirectory);
        if (!item.isDirectory) {
            btnDownload.href = `/api/stream?path=${encodeURIComponent(item.path)}&download=true`;
        }
    }
    if (btnDownloadZip) {
        const isMultiSelect = State.selectedPaths.size > 1 && State.selectedPaths.has(item.path);
        btnDownloadZip.classList.remove('d-none');
        if (isMultiSelect) {
            btnDownloadZip.innerHTML = '<ion-icon name="archive"></ion-icon> Download Selected as ZIP';
        } else if (item.isDirectory) {
            btnDownloadZip.innerHTML = '<ion-icon name="archive"></ion-icon> Download Folder as ZIP';
        } else {
            btnDownloadZip.innerHTML = '<ion-icon name="archive"></ion-icon> Download as ZIP';
        }
    }

    menu.classList.remove('d-none', 'closing');

    // Position menu and ensure it doesn't overflow viewport
    const menuWidth = 180;
    const menuHeight = 240;
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) {
        x = window.innerWidth - menuWidth - 8;
    }
    if (y + menuHeight > window.innerHeight) {
        y = window.innerHeight - menuHeight - 8;
    }

    menu.style.left = `${Math.max(8, x)}px`;
    menu.style.top = `${Math.max(8, y)}px`;
}

function showEmptyAreaContextMenu(e) {
    contextMenuItem = null;
    hideAllContextMenus(true);

    const menu = document.getElementById('emptyAreaContextMenu');
    if (!menu) return;

    menu.classList.remove('d-none', 'closing');

    const menuWidth = 180;
    const menuHeight = 200;
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) {
        x = window.innerWidth - menuWidth - 8;
    }
    if (y + menuHeight > window.innerHeight) {
        y = window.innerHeight - menuHeight - 8;
    }

    menu.style.left = `${Math.max(8, x)}px`;
    menu.style.top = `${Math.max(8, y)}px`;
}

function hideAllContextMenus(immediate = false) {
    const menus = [
        document.getElementById('rowContextMenu'),
        document.getElementById('emptyAreaContextMenu')
    ];

    menus.forEach(menu => {
        if (!menu || menu.classList.contains('d-none')) return;
        if (immediate) {
            menu.classList.add('d-none');
            menu.classList.remove('closing');
        } else {
            menu.classList.add('closing');
            setTimeout(() => {
                menu.classList.add('d-none');
                menu.classList.remove('closing');
            }, 100);
        }
    });
}

function setupContextMenu() {
    const rowMenu = document.getElementById('rowContextMenu');
    const emptyMenu = document.getElementById('emptyAreaContextMenu');
    const workspace = document.getElementById('workspaceView');

    // Dismiss context menus on outside click with 100ms linear fade out
    document.addEventListener('click', (e) => {
        if ((!rowMenu || !rowMenu.contains(e.target)) && (!emptyMenu || !emptyMenu.contains(e.target))) {
            hideAllContextMenus(false);
        }
    });

    // Right-click on empty area in file browser / workspace
    if (workspace) {
        workspace.addEventListener('contextmenu', (e) => {
            // Check if right click landed on a table row or action button
            if (e.target.closest('#fileTableBody tr')) {
                return; // Handled by row listener
            }
            e.preventDefault();
            showEmptyAreaContextMenu(e);
        });
    }

    // Dismiss if right-clicking outside table rows and workspace
    document.addEventListener('contextmenu', (e) => {
        if (!e.target.closest('#fileTableBody tr') && !e.target.closest('#workspaceView')) {
            hideAllContextMenus();
        }
    });

    // Row Menu Actions
    if (rowMenu) {
        rowMenu.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.getAttribute('data-action');
                if (!contextMenuItem) return;

                const item = contextMenuItem;
                hideAllContextMenus();

                if (action === 'open') {
                    if (item.isDirectory) navigateTo(item.path);
                } else if (action === 'preview-image') {
                    ImageViewer.open(item.path, item.name);
                } else if (action === 'preview-pdf') {
                    PdfViewer.open(item.path, item.name);
                } else if (action === 'play-audio') {
                    AudioPlayer.play(item.path, item.name);
                } else if (action === 'stream') {
                    Player.play(item.path, item.name);
                } else if (action === 'edit') {
                    Editor.open(item.path, item.name);
                } else if (action === 'download-zip') {
                    if (State.selectedPaths.size > 1 && State.selectedPaths.has(item.path)) {
                        const sel = [...State.selectedPaths];
                        const pathsParam = sel.join(',');
                        const a = document.createElement('a');
                        a.href = `/api/zip?paths=${encodeURIComponent(pathsParam)}`;
                        a.download = 'selected_files.zip';
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        UI.showToast('Download ZIP', `Downloading ${sel.length} selected files as ZIP archive...`, 'success');
                    } else {
                        const a = document.createElement('a');
                        a.href = `/api/zip?path=${encodeURIComponent(item.path)}`;
                        a.download = `${item.name || 'archive'}.zip`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        UI.showToast('Download ZIP', `Started ZIP download of "${item.name}"`, 'success');
                    }
                } else if (action === 'rename') {
                    promptRename(item.path, item.name);
                } else if (action === 'delete') {
                    promptDelete(item.path, item.name);
                } else if (action === 'properties') {
                    UI.showPropertiesModal(item);
                }
            });
        });
    }

    // Empty Area Menu Actions
    if (emptyMenu) {
        emptyMenu.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.getAttribute('data-action');
                hideAllContextMenus();

                if (action === 'new-folder') {
                    const curtainFolder = document.getElementById('curtainNewFolder');
                    const curtainFile = document.getElementById('curtainNewFile');
                    if (curtainFile) toggleCurtain(curtainFile, false);
                    if (curtainFolder) toggleCurtain(curtainFolder, true);
                } else if (action === 'new-file') {
                    const curtainFolder = document.getElementById('curtainNewFolder');
                    const curtainFile = document.getElementById('curtainNewFile');
                    if (curtainFolder) toggleCurtain(curtainFolder, false);
                    if (curtainFile) toggleCurtain(curtainFile, true);
                } else if (action === 'upload') {
                    if (uploadModalInstance) uploadModalInstance.show();
                } else if (action === 'download-current-zip') {
                    const folderName = State.meta?.currentName || 'folder';
                    const a = document.createElement('a');
                    a.href = `/api/zip?path=${encodeURIComponent(State.currentPath || '')}`;
                    a.download = `${folderName}.zip`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    UI.showToast('Download ZIP', `Started ZIP download of folder "${folderName}"`, 'success');
                } else if (action === 'refresh') {
                    navigateTo(State.currentPath);
                } else if (action === 'properties') {
                    UI.showPropertiesModal(null);
                }
            });
        });
    }
}

/**
 * Vertical drag-to-select with full-width selection marquee
 */
function setupDragSelection() {
    const workspace = document.getElementById('workspaceView');
    const marquee = document.getElementById('selectionMarquee');
    if (!workspace || !marquee) return;

    let isDragging = false;
    let startY = 0;
    let initialSelectedPaths = new Set();
    let isCtrlPressed = false;
    let isShiftPressed = false;

    workspace.addEventListener('mousedown', (e) => {
        // Only trigger on primary (left) button click
        if (e.button !== 0) return;

        // Don't trigger marquee when clicking buttons, inputs, links, or action groups
        if (e.target.closest('button, a, input, select, textarea, .table-action-group, .portal-context-menu')) {
            return;
        }

        const clickedRow = e.target.closest('#fileTableBody tr[data-path]');
        isCtrlPressed = e.ctrlKey || e.metaKey;
        isShiftPressed = e.shiftKey;

        // If clicking empty area without Ctrl/Shift, clear previous selection
        if (!clickedRow && !isCtrlPressed && !isShiftPressed) {
            State.clearSelection();
            UI.updateSelectionUI();
        }

        // If clicked on a row with Ctrl/Shift, toggle selection immediately
        if (clickedRow) {
            const rowPath = clickedRow.getAttribute('data-path');
            if (isCtrlPressed) {
                State.toggleSelect(rowPath);
                UI.updateSelectionUI();
            } else if (!State.selectedPaths.has(rowPath)) {
                // If clicked normal row that wasn't selected, select only this one
                State.clearSelection();
                State.toggleSelect(rowPath, true);
                UI.updateSelectionUI();
            }
        }

        const wsRect = workspace.getBoundingClientRect();
        isDragging = true;
        // Calculate relative startY inside workspace taking scroll into account
        startY = (e.clientY - wsRect.top) + workspace.scrollTop;
        initialSelectedPaths = new Set(State.selectedPaths);

        marquee.style.top = `${startY}px`;
        marquee.style.height = '0px';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const wsRect = workspace.getBoundingClientRect();
        const currentY = (e.clientY - wsRect.top) + workspace.scrollTop;
        const diffY = Math.abs(currentY - startY);

        // Initiate marquee visibility once dragged past small threshold (4px)
        if (diffY > 4) {
            marquee.classList.remove('d-none');
            const top = Math.max(0, Math.min(startY, currentY));
            const height = diffY;

            marquee.style.top = `${top}px`;
            marquee.style.height = `${height}px`;

            // Calculate vertical bounds within viewport
            const marqueeClientTop = Math.min(
                wsRect.top + (startY - workspace.scrollTop),
                wsRect.top + (currentY - workspace.scrollTop)
            );
            const marqueeClientBottom = marqueeClientTop + height;

            // Find rows intersecting the vertical range
            const rows = document.querySelectorAll('#fileTableBody tr[data-path]');
            const newlySelected = new Set(isCtrlPressed ? initialSelectedPaths : []);

            rows.forEach(row => {
                const rect = row.getBoundingClientRect();
                const path = row.getAttribute('data-path');
                if (!path) return;

                // Vertical intersection test
                const intersects = !(rect.bottom < marqueeClientTop || rect.top > marqueeClientBottom);
                if (intersects) {
                    if (isCtrlPressed && initialSelectedPaths.has(path)) {
                        newlySelected.delete(path);
                    } else {
                        newlySelected.add(path);
                    }
                }
            });

            State.selectedPaths = newlySelected;
            UI.updateSelectionUI();
        }
    });

    const finishDrag = () => {
        if (!isDragging) return;
        isDragging = false;
        marquee.classList.add('d-none');
        marquee.style.height = '0px';
    };

    window.addEventListener('mouseup', finishDrag);
    window.addEventListener('mouseleave', finishDrag);
}

function setupKeyboardNavigation() {
    window.addEventListener('keydown', (e) => {
        const activeRename = activeRenameDismiss || document.querySelector('.inline-rename-input');
        if (activeRename) {
            const renameInput = document.querySelector('.inline-rename-input');
            if (e.key === 'Escape' || e.key === 'Esc' || e.code === 'Escape' || e.keyCode === 27) {
                e.preventDefault();
                e.stopPropagation();
                if (activeRenameDismiss) {
                    activeRenameDismiss();
                } else if (renameInput) {
                    renameInput.dispatchEvent(new CustomEvent('restore-rename'));
                }
                return;
            }
            if (e.key === 'Enter' || e.code === 'Enter' || e.keyCode === 13) {
                e.preventDefault();
                e.stopPropagation();
                if (renameInput) {
                    renameInput.dispatchEvent(new CustomEvent('commit-rename'));
                }
                return;
            }
            // While renaming, do not move table selection
            return;
        }

        // Do not intercept if typing in inputs/textareas or modals are open or video/editor/settings views are active
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT' || activeEl.isContentEditable)) {
            return;
        }

        const workspaceView = document.getElementById('workspaceView');
        if (!workspaceView || workspaceView.classList.contains('d-none')) {
            return;
        }

        const anyModal = document.querySelector('.modal.show');
        if (anyModal) return;

        const rows = Array.from(document.querySelectorAll('#fileTableBody tr[data-path], #fileTableBody tr.cursor-pointer'));
        if (!rows || rows.length === 0) return;

        if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
            if (AudioPlayer.currentPath) {
                e.preventDefault();
                if (e.key === 'ArrowLeft') AudioPlayer.playPrevious();
                else AudioPlayer.playNext();
                return;
            }
        }

        const isUp = e.key === 'ArrowUp';
        const isDown = e.key === 'ArrowDown';
        const isEnter = e.key === 'Enter';
        const isEscape = e.key === 'Escape';
        const isF2 = e.key === 'F2';

        if (!isUp && !isDown && !isEnter && !isEscape && !isF2) return;

        // Find current selected index
        let currentIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            const p = rows[i].getAttribute('data-path');
            if (p && State.selectedPaths.has(p)) {
                currentIndex = i;
                break;
            }
            if (rows[i].classList.contains('row-selected')) {
                currentIndex = i;
                break;
            }
        }

        if (isF2) {
            if (currentIndex >= 0 && currentIndex < rows.length) {
                const targetRow = rows[currentIndex];
                const targetPath = targetRow.getAttribute('data-path');
                if (targetPath) {
                    const item = State.items.find(it => it.path === targetPath);
                    const name = item ? item.name : (targetRow.querySelector('.file-name-label')?.textContent?.trim() || '');
                    if (name) {
                        e.preventDefault();
                        promptRename(targetPath, name);
                    }
                }
            }
            return;
        }

        if (isEscape) {
            e.preventDefault();
            State.selectedPaths.clear();
            rows.forEach(r => r.classList.remove('row-selected'));
            UI.updateSelectionUI();
            return;
        }

        if (isEnter) {
            if (currentIndex >= 0 && currentIndex < rows.length) {
                e.preventDefault();
                rows[currentIndex].dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
            }
            return;
        }

        if (isDown) {
            e.preventDefault();
            let nextIndex = currentIndex + 1;
            if (nextIndex >= rows.length) nextIndex = 0;
            const targetRow = rows[nextIndex];
            const targetPath = targetRow.getAttribute('data-path');

            State.selectedPaths.clear();
            rows.forEach(r => r.classList.remove('row-selected'));

            if (targetPath) {
                State.selectedPaths.add(targetPath);
                targetRow.classList.add('row-selected');
            } else {
                targetRow.classList.add('row-selected');
            }
            UI.updateSelectionUI();
            targetRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else if (isUp) {
            e.preventDefault();
            let prevIndex = currentIndex - 1;
            if (prevIndex < 0) prevIndex = rows.length - 1;
            const targetRow = rows[prevIndex];
            const targetPath = targetRow.getAttribute('data-path');

            State.selectedPaths.clear();
            rows.forEach(r => r.classList.remove('row-selected'));

            if (targetPath) {
                State.selectedPaths.add(targetPath);
                targetRow.classList.add('row-selected');
            } else {
                targetRow.classList.add('row-selected');
            }
            UI.updateSelectionUI();
            targetRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    });
}

function setupDialogActions() {
    // Upload Dropzone & Actions
    const btnConfirmUpload = document.getElementById('btnConfirmUpload');
    const inputUploadFiles = document.getElementById('inputUploadFiles');
    const inputUploadFolder = document.getElementById('inputUploadFolder');
    const btnBrowseFiles = document.getElementById('btnBrowseFiles');
    const btnBrowseFolder = document.getElementById('btnBrowseFolder');
    const uploadDropzone = document.getElementById('uploadDropzone');
    const uploadFilesSummary = document.getElementById('uploadFilesSummary');
    const uploadProgressContainer = document.getElementById('uploadProgressContainer');
    const uploadProgressBar = document.getElementById('uploadProgressBar');
    const uploadStatusText = document.getElementById('uploadStatusText');
    const uploadPercentText = document.getElementById('uploadPercentText');

    let stagedFiles = [];
    let stagedEmptyDirs = [];

    const updateStagedFilesSummary = () => {
        if (!uploadFilesSummary) return;
        const totalItems = stagedFiles.length + stagedEmptyDirs.length;
        if (totalItems === 0) {
            uploadFilesSummary.textContent = 'No files selected';
        } else if (stagedFiles.length === 1 && stagedEmptyDirs.length === 0) {
            const name = stagedFiles[0].relativePath || stagedFiles[0].name;
            uploadFilesSummary.textContent = `${name} (${UI.formatBytes(stagedFiles[0].size)})`;
        } else {
            const totalBytes = stagedFiles.reduce((acc, f) => acc + (f.size || 0), 0);
            uploadFilesSummary.textContent = `${stagedFiles.length} file(s)${stagedEmptyDirs.length ? `, ${stagedEmptyDirs.length} folder(s)` : ''} (${UI.formatBytes(totalBytes)})`;
        }
    };

    const resetUploadForm = () => {
        stagedFiles = [];
        stagedEmptyDirs = [];
        if (inputUploadFiles) inputUploadFiles.value = '';
        if (inputUploadFolder) inputUploadFolder.value = '';
        updateStagedFilesSummary();
        if (uploadProgressContainer) uploadProgressContainer.classList.add('d-none');
        if (uploadProgressBar) {
            uploadProgressBar.style.width = '0%';
            uploadProgressBar.setAttribute('aria-valuenow', '0');
        }
        if (uploadPercentText) uploadPercentText.textContent = '0%';
        if (uploadStatusText) uploadStatusText.textContent = 'Uploading...';
        if (uploadDropzone) uploadDropzone.classList.remove('drag-active');
        if (btnConfirmUpload) btnConfirmUpload.disabled = false;
    };

    if (btnBrowseFiles && inputUploadFiles) {
        btnBrowseFiles.addEventListener('click', (e) => {
            e.stopPropagation();
            inputUploadFiles.click();
        });
    }

    if (btnBrowseFolder && inputUploadFolder) {
        btnBrowseFolder.addEventListener('click', (e) => {
            e.stopPropagation();
            inputUploadFolder.click();
        });
    }

    if (uploadDropzone) {
        uploadDropzone.addEventListener('click', (e) => {
            if (e.target && e.target.id === 'btnBrowseFolder') return;
            if (inputUploadFiles) inputUploadFiles.click();
        });

        uploadDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadDropzone.classList.add('drag-active');
        });

        uploadDropzone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadDropzone.classList.remove('drag-active');
        });

        uploadDropzone.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadDropzone.classList.remove('drag-active');
            if (e.dataTransfer) {
                if (uploadFilesSummary) uploadFilesSummary.textContent = 'Scanning dropped items...';
                const res = await extractDataTransferItems(e.dataTransfer);
                stagedFiles = res.files;
                stagedEmptyDirs = res.emptyDirs;
                updateStagedFilesSummary();
            }
        });
    }

    if (inputUploadFiles) {
        inputUploadFiles.addEventListener('change', () => {
            if (inputUploadFiles.files && inputUploadFiles.files.length > 0) {
                stagedFiles = Array.from(inputUploadFiles.files);
                stagedEmptyDirs = [];
                updateStagedFilesSummary();
            }
        });
    }

    if (inputUploadFolder) {
        inputUploadFolder.addEventListener('change', () => {
            if (inputUploadFolder.files && inputUploadFolder.files.length > 0) {
                stagedFiles = Array.from(inputUploadFolder.files).map(f => {
                    const rel = f.webkitRelativePath || f.name;
                    Object.defineProperty(f, 'relativePath', { value: rel, writable: true, configurable: true });
                    return f;
                });
                stagedEmptyDirs = [];
                updateStagedFilesSummary();
            }
        });
    }

    const uploadModalEl = document.getElementById('uploadModal');
    if (uploadModalEl) {
        uploadModalEl.addEventListener('hidden.bs.modal', () => {
            resetUploadForm();
        });
    }

    if (btnConfirmUpload) {
        btnConfirmUpload.addEventListener('click', async () => {
            const files = stagedFiles.length > 0 ? stagedFiles : (inputUploadFiles ? Array.from(inputUploadFiles.files || []) : []);
            if ((!files || files.length === 0) && stagedEmptyDirs.length === 0) {
                UI.showToast('Upload Warning', 'Please select or drop files or folders to upload', 'warning');
                return;
            }

            btnConfirmUpload.disabled = true;
            if (uploadProgressContainer) uploadProgressContainer.classList.remove('d-none');
            if (uploadStatusText) uploadStatusText.textContent = `Uploading ${files.length} file(s)...`;
            if (uploadProgressBar) uploadProgressBar.style.width = '0%';
            if (uploadPercentText) uploadPercentText.textContent = '0%';

            try {
                await uploadRecursivePayload(State.currentPath, files, stagedEmptyDirs, (pct) => {
                    if (uploadProgressBar) {
                        uploadProgressBar.style.width = `${pct}%`;
                        uploadProgressBar.setAttribute('aria-valuenow', `${pct}`);
                    }
                    if (uploadPercentText) uploadPercentText.textContent = `${pct}%`;
                    if (uploadStatusText) {
                        if (pct >= 100) {
                            uploadStatusText.textContent = 'Finalizing transfer...';
                        } else {
                            uploadStatusText.textContent = `Uploading ${files.length} file(s)...`;
                        }
                    }
                });
                if (uploadModalInstance) uploadModalInstance.hide();
                UI.showToast('Upload Complete', `Uploaded ${files.length} file(s) successfully`, 'success');
                resetUploadForm();
                navigateTo(State.currentPath, true);
            } catch (e) {
                UI.showToast('Upload Error', e.message, 'danger');
                if (btnConfirmUpload) btnConfirmUpload.disabled = false;
            }
        });
    }

    // Rename
    const btnConfirmRename = document.getElementById('btnConfirmRename');
    const inputRename = document.getElementById('inputRename');
    if (btnConfirmRename && inputRename) {
        btnConfirmRename.addEventListener('click', async () => {
            const newName = inputRename.value.trim();
            if (!newName || !pendingRenamePath) return;

            let newPath = newName;
            if (pendingRenamePath.includes('/')) {
                const lastSlash = pendingRenamePath.lastIndexOf('/');
                newPath = pendingRenamePath.substring(0, lastSlash + 1) + newName;
            } else if (State.currentPath) {
                newPath = `${State.currentPath}/${newName}`;
            }

            try {
                await Api.renameItem(pendingRenamePath, newName);
                if (renameModalInstance) renameModalInstance.hide();
                State.selectedPaths.delete(pendingRenamePath);
                State.selectedPaths.add(newPath);
                pendingRenamePath = null;
                UI.showToast('Rename Complete', `Item renamed to "${newName}"`, 'success');
                navigateTo(State.currentPath, true);
            } catch (e) {
                UI.showToast('Rename Failed', e.message, 'danger');
            }
        });
    }

    // Delete
    const btnConfirmDelete = document.getElementById('btnConfirmDelete');
    if (btnConfirmDelete) {
        btnConfirmDelete.addEventListener('click', async () => {
            if (!pendingDeletePath) return;
            try {
                await Api.deleteItem(pendingDeletePath);
                if (deleteModalInstance) deleteModalInstance.hide();
                pendingDeletePath = null;
                UI.showToast('Delete Complete', 'Item was permanently removed', 'success');
                navigateTo(State.currentPath, true);
            } catch (e) {
                UI.showToast('Delete Failed', e.message, 'danger');
            }
        });
    }
}

function promptRename(path, currentName) {
    if (activeRenameDismiss) {
        activeRenameDismiss();
        activeRenameDismiss = null;
    }
    // Clean up any other leftover inline rename inputs in the table DOM
    document.querySelectorAll('.inline-rename-input').forEach(el => {
        const parentCell = el.closest('[data-name-cell]');
        const label = parentCell ? parentCell.querySelector('.file-name-label') : null;
        if (label) label.classList.remove('d-none');
        if (el.parentNode) el.parentNode.removeChild(el);
    });

    const row = document.querySelector(`#fileTableBody tr[data-path="${CSS.escape(path)}"]`);
    const nameCell = row ? row.querySelector('[data-name-cell]') : null;

    if (nameCell) {
        const originalSpan = nameCell.querySelector('.file-name-label');
        if (nameCell.querySelector('.inline-rename-input')) {
            return; // Already in inline rename mode
        }

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'inline-rename-input';
        input.value = currentName;

        let committed = false;
        let isRestoring = false;

        const restoreOriginal = () => {
            if (isRestoring || committed) return;
            isRestoring = true;
            if (activeRenameDismiss === restoreOriginal) {
                activeRenameDismiss = null;
            }
            document.removeEventListener('pointerdown', handleOutsideClick, true);
            input.classList.add('dismissing');
            setTimeout(() => {
                if (originalSpan) originalSpan.classList.remove('d-none');
                if (input.parentNode) {
                    input.parentNode.removeChild(input);
                }
            }, 120);
        };

        activeRenameDismiss = restoreOriginal;

        const commitRename = async () => {
            if (committed || isRestoring) return;
            const newName = input.value.trim();

            if (!newName || newName === currentName) {
                restoreOriginal();
                return;
            }

            committed = true;
            if (activeRenameDismiss === restoreOriginal) {
                activeRenameDismiss = null;
            }
            document.removeEventListener('pointerdown', handleOutsideClick, true);

            // Immediately animate outline dismissal and keep text seamlessly visible with AI chatbot shimmer
            input.classList.add('dismissing');
            if (originalSpan) {
                originalSpan.textContent = newName;
                originalSpan.classList.add('shimmering');
                originalSpan.classList.remove('d-none');
            }

            let newPath = newName;
            if (path.includes('/')) {
                const lastSlash = path.lastIndexOf('/');
                newPath = path.substring(0, lastSlash + 1) + newName;
            } else if (State.currentPath) {
                newPath = `${State.currentPath}/${newName}`;
            }

            State.selectedPaths.delete(path);
            State.selectedPaths.add(newPath);

            setTimeout(() => {
                if (input.parentNode) {
                    input.parentNode.removeChild(input);
                }
            }, 120);

            try {
                await Api.renameItem(path, newName);
                if (originalSpan) {
                    originalSpan.classList.remove('shimmering');
                }
                UI.showToast('Rename Complete', `Item renamed to "${newName}"`, 'success');
                navigateTo(State.currentPath, true);
            } catch (e) {
                if (originalSpan) {
                    originalSpan.classList.remove('shimmering');
                    originalSpan.textContent = currentName;
                    originalSpan.classList.remove('d-none');
                }
                State.selectedPaths.delete(newPath);
                State.selectedPaths.add(path);
                UI.showToast('Rename Failed', e.message, 'danger');
            }
        };

        const handleOutsideClick = (e) => {
            if (!input.contains(e.target)) {
                restoreOriginal();
            }
        };

        input.addEventListener('commit-rename', () => commitRename());
        input.addEventListener('restore-rename', () => restoreOriginal());

        if (originalSpan) {
            input.style.fontWeight = window.getComputedStyle(originalSpan).fontWeight || '600';
            originalSpan.classList.add('d-none');
        }
        nameCell.appendChild(input);
        input.focus();

        // Select file name without extension if present
        const dotIndex = currentName.lastIndexOf('.');
        if (dotIndex > 0) {
            input.setSelectionRange(0, dotIndex);
        } else {
            input.select();
        }

        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('dblclick', (e) => e.stopPropagation());
        input.addEventListener('mousedown', (e) => e.stopPropagation());

        let lastRenameArrowTime = 0;
        let lastRenameArrowKey = null;

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.code === 'Enter' || e.keyCode === 13) {
                e.preventDefault();
                e.stopPropagation();
                commitRename();
            } else if (e.key === 'Escape' || e.key === 'Esc' || e.code === 'Escape' || e.keyCode === 27) {
                e.preventDefault();
                e.stopPropagation();
                restoreOriginal();
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                const now = Date.now();
                if (!e.repeat && lastRenameArrowKey === e.key && (now - lastRenameArrowTime) < 380) {
                    e.preventDefault();
                    e.stopPropagation();
                    const allRows = Array.from(document.querySelectorAll('#fileTableBody tr[data-path]'));
                    const curRowIdx = allRows.indexOf(row);
                    if (curRowIdx >= 0) {
                        let targetIdx = e.key === 'ArrowDown' ? curRowIdx + 1 : curRowIdx - 1;
                        if (targetIdx >= allRows.length) targetIdx = 0;
                        if (targetIdx < 0) targetIdx = allRows.length - 1;
                        const nextRow = allRows[targetIdx];
                        const nextPath = nextRow.getAttribute('data-path');
                        if (nextPath) {
                            const nextItem = State.items.find(it => it.path === nextPath);
                            const nextName = nextItem ? nextItem.name : (nextRow.querySelector('.file-name-label')?.textContent?.trim() || '');
                            restoreOriginal();
                            if (nextName) {
                                promptRename(nextPath, nextName);
                            }
                            return;
                        }
                    }
                }
                lastRenameArrowTime = now;
                lastRenameArrowKey = e.key;
            }
        });

        // Dismiss on blur (outside click / tab out)
        input.addEventListener('blur', () => {
            setTimeout(() => {
                if (!committed && !isRestoring) {
                    restoreOriginal();
                }
            }, 80);
        });

        setTimeout(() => {
            document.addEventListener('pointerdown', handleOutsideClick, true);
        }, 10);
    } else {
        // Fallback to modal rename if row is not in DOM
        pendingRenamePath = path;
        const input = document.getElementById('inputRename');
        if (input) {
            input.value = currentName;
        }
        if (renameModalInstance) {
            renameModalInstance.show();
        }
    }
}

function promptDelete(path, name) {
    pendingDeletePath = path;
    const nameEl = document.getElementById('deleteItemName');
    if (nameEl) {
        nameEl.textContent = name;
    }
    if (deleteModalInstance) {
        deleteModalInstance.show();
    }
}

function startLivePolling() {
    if (pollTimer) clearInterval(pollTimer);

    const rateStr = localStorage.getItem('app.server:polling_rate');
    const intervalMs = rateStr !== null ? parseInt(rateStr, 10) : 2500;

    if (isNaN(intervalMs) || intervalMs <= 0) {
        return; // Polling disabled
    }

    pollTimer = setInterval(async () => {
        try {
            const res = await Api.poll(State.currentPath);
            if (State.signature !== null && res.signature !== State.signature) {
                // If the user is currently editing / renaming, viewing editor/video/image/settings, or a modal is open, postpone background refresh
                const isEditorOpen = !document.getElementById('contentEditorView')?.classList.contains('d-none');
                const isVideoOpen = !document.getElementById('contentVideoView')?.classList.contains('d-none');
                const isImageOpen = !document.getElementById('contentImageView')?.classList.contains('d-none');
                const isPdfOpen = !document.getElementById('contentPdfView')?.classList.contains('d-none');
                const isAudioVisOpen = !document.getElementById('contentAudioVisualizer')?.classList.contains('d-none');
                const isSettingsOpen = !document.getElementById('contentSettingsView')?.classList.contains('d-none');
                const isModalOpen = !!document.querySelector('.modal.show');
                const isRenaming = !!(activeRenameDismiss || document.querySelector('.inline-rename-input'));

                if (isEditorOpen || isVideoOpen || isImageOpen || isPdfOpen || isAudioVisOpen || isSettingsOpen || isModalOpen || isRenaming || State.selectedPaths.size > 0) {
                    return;
                }
                State.signature = res.signature;
                navigateTo(State.currentPath, true);
            }
        } catch {
            // Background poll failure
        }
    }, intervalMs);
}
