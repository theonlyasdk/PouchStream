/**
 * PouchStream UI & Presentation Module
 */
import { State } from './state.js';

export const UI = {
    formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
    },

    formatDate(timestamp) {
        if (!timestamp) return '—';
        const d = new Date(timestamp);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
    },

    getSemanticIcon(item) {
        if (item.isDirectory) {
            return 'folder';
        }
        const ext = (item.extension || '').toLowerCase();
        const mime = (item.mimeType || '').toLowerCase();

        if (mime.startsWith('video/') || ['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v'].includes(ext)) {
            return 'videocam';
        }
        if (mime.startsWith('audio/') || ['mp3', 'wav', 'flac', 'ogg', 'aac'].includes(ext)) {
            return 'musical-notes';
        }
        if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
            return 'image';
        }
        if (['pdf'].includes(ext)) {
            return 'document-text';
        }
        if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
            return 'archive';
        }
        if (mime.startsWith('text/') || ['txt', 'md', 'json', 'js', 'html', 'css', 'py', 'java', 'xml'].includes(ext)) {
            return 'code-slash';
        }
        return 'document';
    },

    getIconColor(item) {
        if (item.isDirectory) {
            return '#f59e0b'; // Amber / Gold for folders
        }
        const ext = (item.extension || '').toLowerCase();
        const mime = (item.mimeType || '').toLowerCase();

        if (mime.startsWith('video/') || ['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v'].includes(ext)) {
            return '#ec4899'; // Vibrant Pink / Magenta for videos
        }
        if (mime.startsWith('audio/') || ['mp3', 'wav', 'flac', 'ogg', 'aac'].includes(ext)) {
            return '#a855f7'; // Purple for audio
        }
        if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
            return '#10b981'; // Emerald Green for images
        }
        if (['pdf'].includes(ext)) {
            return '#ef4444'; // Red for PDF documents
        }
        if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
            return '#f97316'; // Orange for archives
        }
        if (mime.startsWith('text/') || ['txt', 'md', 'json', 'js', 'html', 'css', 'py', 'java', 'xml'].includes(ext)) {
            return '#3b82f6'; // Bright Blue for code and text
        }
        return '#9ca3af'; // Neutral Slate for other files
    },

    isVideo(item) {
        if (item.isDirectory) return false;
        const ext = (item.extension || '').toLowerCase();
        const mime = (item.mimeType || '').toLowerCase();
        return mime.startsWith('video/') || ['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v'].includes(ext);
    },

    isAudio(item) {
        if (!item || item.isDirectory) return false;
        const ext = (item.extension || '').toLowerCase();
        const mime = (item.mimeType || '').toLowerCase();
        return mime.startsWith('audio/') || ['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a', 'opus', 'wma'].includes(ext);
    },

    isPdf(item) {
        if (!item || item.isDirectory) return false;
        const ext = (item.extension || '').toLowerCase();
        const mime = (item.mimeType || '').toLowerCase();
        return mime === 'application/pdf' || ext === 'pdf';
    },

    isImage(item) {
        if (item.isDirectory) return false;
        const ext = (item.extension || '').toLowerCase();
        const mime = (item.mimeType || '').toLowerCase();
        return mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'].includes(ext);
    },

    isDoubleClickNav() {
        try {
            return localStorage.getItem('ui.nav:double_click_nav') !== 'false';
        } catch (_) {
            return true;
        }
    },

    isEditable(item) {
        if (item.isDirectory) return false;
        const ext = (item.extension || '').toLowerCase();
        const mime = (item.mimeType || '').toLowerCase();
        return mime.startsWith('text/') || mime === 'application/json' || mime === 'application/javascript'
            || ['txt', 'md', 'json', 'js', 'html', 'css', 'py', 'java', 'kt', 'xml', 'ini', 'conf', 'log', 'sh', 'yaml', 'yml'].includes(ext);
    },

    renderBreadcrumbs(onNavigate) {
        const list = document.getElementById('breadcrumbList');
        if (!list) return;

        list.innerHTML = '';

        // Root crumb
        const rootLi = document.createElement('li');
        rootLi.className = 'breadcrumb-item';
        if (!State.currentPath) {
            rootLi.className += ' active';
            rootLi.setAttribute('aria-current', 'page');
            rootLi.innerHTML = `<ion-icon name="folder" class="me-1"></ion-icon>${this.escapeHtml(State.rootFolderName)}`;
        } else {
            const rootA = document.createElement('a');
            rootA.href = '#';
            rootA.className = 'text-decoration-none';
            rootA.innerHTML = `<ion-icon name="folder" class="me-1"></ion-icon>${this.escapeHtml(State.rootFolderName)}`;
            rootA.addEventListener('click', (e) => {
                e.preventDefault();
                onNavigate('');
            });
            rootLi.appendChild(rootA);
        }
        list.appendChild(rootLi);

        if (State.currentPath) {
            const segments = State.currentPath.split('/');
            let accum = '';
            for (let i = 0; i < segments.length; i++) {
                const seg = segments[i];
                accum += (accum ? '/' : '') + seg;
                const li = document.createElement('li');
                li.className = 'breadcrumb-item';

                if (i === segments.length - 1) {
                    li.className += ' active text-truncate';
                    li.setAttribute('aria-current', 'page');
                    li.innerHTML = `<ion-icon name="folder" class="me-1"></ion-icon>${this.escapeHtml(seg)}`;
                    li.style.maxWidth = '220px';
                } else {
                    const navPath = accum;
                    const a = document.createElement('a');
                    a.href = '#';
                    a.className = 'text-decoration-none';
                    a.innerHTML = `<ion-icon name="folder" class="me-1"></ion-icon>${this.escapeHtml(seg)}`;
                    a.addEventListener('click', (e) => {
                        e.preventDefault();
                        onNavigate(navPath);
                    });
                    li.appendChild(a);
                }
                list.appendChild(li);
            }
        }
    },

    renderStatusbar() {
        const folderStats = document.getElementById('statusFolderStats');
        if (folderStats) {
            const fCount = State.meta.folderCount || 0;
            const fileCount = State.meta.fileCount || 0;
            const folderWord = fCount === 1 ? 'folder' : 'folders';
            const fileWord = fileCount === 1 ? 'file' : 'files';
            folderStats.textContent = `${fCount} ${folderWord}, ${fileCount} ${fileWord} (${this.formatBytes(State.meta.totalSize || 0)})`;
        }
    },

    updateSortIndicators() {
        ['name', 'format', 'size', 'lastModified'].forEach(field => {
            const indicator = document.getElementById(`sortIndicator${field.charAt(0).toUpperCase() + field.slice(1)}`);
            if (indicator) {
                if (State.sortField === field) {
                    const iconName = State.sortOrder === 'asc' ? 'chevron-up' : 'chevron-down';
                    indicator.innerHTML = `<ion-icon name="${iconName}"></ion-icon>`;
                } else {
                    indicator.innerHTML = '';
                }
            }
        });
    },

    renderTable(onNavigate, onPlay, onEdit, onPreviewImage, onDelete, onRename, onContextMenu, onPlayAudio, onPreviewPdf) {
        const tbody = document.getElementById('fileTableBody');
        if (!tbody) return;

        this.updateSortIndicators();
        // update header select-all checkbox
        const chkAll = document.getElementById('chkSelectAll');
        if (chkAll) {
            const allPaths = State.getFilteredItems().map(i => i.path);
            const selCount = allPaths.filter(p => State.selectedPaths.has(p)).length;
            chkAll.checked = allPaths.length > 0 && selCount === allPaths.length;
            chkAll.indeterminate = selCount > 0 && selCount < allPaths.length;
            chkAll.style.visibility = State.selectedPaths.size > 1 ? 'visible' : 'hidden';
        }

        const items = State.getFilteredItems();
        tbody.innerHTML = '';

        // Render Parent row if inside subfolder
        if (State.currentPath) {
            const trParent = document.createElement('tr');
            trParent.className = 'cursor-pointer';
            trParent.setAttribute('data-is-parent', 'true');
            trParent.innerHTML = `
                <td class="text-center text-secondary" style="width: 36px;">
                    <ion-icon name="arrow-up"></ion-icon>
                </td>
                <td colspan="4" class="text-secondary fw-semibold">
                    .. (Parent Directory)
                </td>
                <td class="text-end" style="width: 160px;"></td>
            `;

            // Single click selects parent directory row (or navigates up when double-click nav is off)
            trParent.addEventListener('click', (e) => {
                if (e.target.closest('.inline-rename-input') || e.target.closest('.table-action-group')) return;
                if (!UI.isDoubleClickNav()) {
                    onNavigate(State.meta.parentPath || '');
                    return;
                }
                State.selectedPaths.clear();
                const allRows = tbody.querySelectorAll('tr');
                allRows.forEach(r => r.classList.remove('row-selected'));
                trParent.classList.add('row-selected');
                UI.updateSelectionUI();
            });

            // Double click opens parent directory
            trParent.addEventListener('dblclick', (e) => {
                if (e.target.closest('.inline-rename-input') || e.target.closest('.table-action-group')) return;
                const parent = State.meta.parentPath || '';
                onNavigate(parent);
            });
            tbody.appendChild(trParent);
        }

        if (items.length === 0) {
            const emptyTr = document.createElement('tr');
            emptyTr.className = 'empty-state-row';
            emptyTr.innerHTML = `
                <td colspan="6" class="text-center py-5 text-secondary border-0">
                    <ion-icon name="folder-open" style="font-size: 1.6rem;" class="d-block mx-auto mb-2 text-muted"></ion-icon>
                    <div class="small fw-semibold text-muted">No records match current filter</div>
                </td>
            `;
            tbody.appendChild(emptyTr);
            return;
        }

        items.forEach(item => {
            const tr = document.createElement('tr');
            const isSelected = State.selectedPaths.has(item.path);
            tr.className = `align-middle cursor-pointer ${isSelected ? 'row-selected' : ''}`;
            tr.setAttribute('data-path', item.path);

            const iconName = this.getSemanticIcon(item);
            const iconColor = this.getIconColor(item);
            const isVideo = this.isVideo(item);
            const isAudio = this.isAudio(item);
            const isPdf = this.isPdf(item);
            const isImage = this.isImage(item);
            const isEditable = this.isEditable(item);
            const sizeStr = item.isDirectory ? '—' : this.formatBytes(item.size);
            const dateStr = this.formatDate(item.lastModified);
            const typeStr = item.isDirectory ? 'Directory' : (item.extension ? item.extension.toUpperCase() : 'File');

            const isFav = State.isFavorite(item.path);
            tr.innerHTML = `
                <td class="text-center p-0" style="width:36px; vertical-align:middle; cursor:pointer;" data-icon-cell>
                    <div style="width:22px; height:22px; display:flex; align-items:center; justify-content:center; margin:0 auto;">
                        <ion-icon name="${iconName}" class="row-icon" style="color: ${iconColor}; font-size: 1.15rem; display:${isSelected ? 'none' : 'block'}; line-height:1;"></ion-icon>
                        <input type="checkbox" class="form-check-input row-chk m-0" data-path="${this.escapeHtml(item.path)}" ${isSelected ? 'checked' : ''} style="display:${isSelected ? 'block' : 'none'}; cursor:pointer; width:16px; height:16px; margin:0;">
                    </div>
                </td>
                <td class="text-truncate" style="max-width: 320px; padding-left:11px !important;" title="${this.escapeHtml(item.name)}" data-name-cell>
                    <span class="fw-bold text-body file-name-label">${this.escapeHtml(item.name)}</span>
                    <button type="button" class="btn btn-sm p-0 border-0 bg-transparent ms-2 star-btn ${isFav ? 'is-fav' : ''}" data-star-path="${this.escapeHtml(item.path)}" title="${isFav ? 'Unstar' : 'Star'}">
                        <ion-icon name="${isFav ? 'star' : 'star-outline'}" style="color:${isFav ? '#facc15' : '#6b7280'}; font-size:1rem;"></ion-icon>
                    </button>
                </td>
                <td class="text-muted small text-nowrap" style="width: 100px;">
                    ${typeStr}
                </td>
                <td class="tabular-nums text-muted small text-nowrap" style="width: 110px;">
                    ${sizeStr}
                </td>
                <td class="tabular-nums text-muted small text-nowrap" style="width: 150px;">
                    ${dateStr}
                </td>
                <td class="text-end text-nowrap p-0" style="width: 175px;" onclick="event.stopPropagation()">
                    <div class="table-action-group">
                        ${isVideo ? `
                            <button type="button" class="table-action-btn table-action-btn-primary" title="Stream Video" data-action="stream">
                                <ion-icon name="play"></ion-icon>
                            </button>
                        ` : ''}
                        ${isAudio ? `
                            <button type="button" class="table-action-btn table-action-btn-primary" title="Play Audio" data-action="play-audio">
                                <ion-icon name="musical-notes"></ion-icon>
                            </button>
                        ` : ''}
                        ${isPdf ? `
                            <button type="button" class="table-action-btn table-action-btn-primary" title="Preview PDF" data-action="preview-pdf">
                                <ion-icon name="document-text"></ion-icon>
                            </button>
                        ` : ''}
                        ${isImage ? `
                            <button type="button" class="table-action-btn table-action-btn-primary" title="Preview Picture" data-action="preview-image">
                                <ion-icon name="eye"></ion-icon>
                            </button>
                        ` : ''}
                        ${isEditable ? `
                            <button type="button" class="table-action-btn" title="Edit in Editor" data-action="edit">
                                <ion-icon name="create"></ion-icon>
                            </button>
                        ` : ''}
                        ${item.isDirectory ? `
                            <a href="/api/zip?path=${encodeURIComponent(item.path)}" class="table-action-btn" title="Download Folder as ZIP">
                                <ion-icon name="archive"></ion-icon>
                            </a>
                        ` : `
                            <a href="/api/stream?path=${encodeURIComponent(item.path)}&download=true" class="table-action-btn" title="Download File">
                                <ion-icon name="download"></ion-icon>
                            </a>
                        `}
                        <button type="button" class="table-action-btn" title="Rename" data-action="rename">
                            <ion-icon name="pencil"></ion-icon>
                        </button>
                        <button type="button" class="table-action-btn table-action-btn-danger" title="Delete" data-action="delete">
                            <ion-icon name="trash"></ion-icon>
                        </button>
                    </div>
                </td>
            `;

            // Single click selects item (or opens folders directly when double-click nav is off); double click opens item
            tr.addEventListener('click', (e) => {
                if (e.target.closest('.inline-rename-input') || e.target.closest('.table-action-group')) return;

                if (item.isDirectory && !UI.isDoubleClickNav()) {
                    onNavigate(item.path);
                    return;
                }

                if (e.ctrlKey || e.metaKey) {
                    if (State.selectedPaths.has(item.path)) {
                        State.selectedPaths.delete(item.path);
                    } else {
                        State.selectedPaths.add(item.path);
                    }
                } else if (e.shiftKey) {
                    State.selectedPaths.add(item.path);
                } else {
                    State.selectedPaths.clear();
                    State.selectedPaths.add(item.path);
                }
                UI.updateSelectionUI();
            });

            // Double click opens item
            tr.addEventListener('dblclick', (e) => {
                if (e.target.closest('.inline-rename-input') || e.target.closest('.table-action-group')) return;

                if (item.isDirectory) {
                    onNavigate(item.path);
                } else if (isVideo) {
                    onPlay(item.path, item.name);
                } else if (isAudio) {
                    if (onPlayAudio) onPlayAudio(item.path, item.name);
                } else if (isPdf) {
                    if (onPreviewPdf) onPreviewPdf(item.path, item.name);
                } else if (isImage) {
                    if (onPreviewImage) onPreviewImage(item.path, item.name);
                } else if (isEditable) {
                    onEdit(item.path, item.name);
                }
            });

            // Context menu right-click
            tr.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                State.selectedPaths.clear();
                State.selectedPaths.add(item.path);
                UI.updateSelectionUI();
                if (onContextMenu) {
                    onContextMenu(e, item);
                }
            });

            // Action button delegates
            const btnStream = tr.querySelector('[data-action="stream"]');
            if (btnStream) btnStream.addEventListener('click', () => onPlay(item.path, item.name));

            const btnPlayAudio = tr.querySelector('[data-action="play-audio"]');
            if (btnPlayAudio && onPlayAudio) btnPlayAudio.addEventListener('click', () => onPlayAudio(item.path, item.name));

            const btnPreviewPdf = tr.querySelector('[data-action="preview-pdf"]');
            if (btnPreviewPdf && onPreviewPdf) btnPreviewPdf.addEventListener('click', () => onPreviewPdf(item.path, item.name));

            const btnPreviewImage = tr.querySelector('[data-action="preview-image"]');
            if (btnPreviewImage && onPreviewImage) btnPreviewImage.addEventListener('click', () => onPreviewImage(item.path, item.name));

            const btnEdit = tr.querySelector('[data-action="edit"]');
            if (btnEdit) btnEdit.addEventListener('click', () => onEdit(item.path, item.name));

            const btnRename = tr.querySelector('[data-action="rename"]');
            if (btnRename) btnRename.addEventListener('click', () => onRename(item.path, item.name));

            const btnDelete = tr.querySelector('[data-action="delete"]');
            if (btnDelete) btnDelete.addEventListener('click', () => onDelete(item.path, item.name));

            // Clever icon -> checkbox: click icon toggles selection, hover shows checkbox
            const iconCell = tr.querySelector('[data-icon-cell]');
            const rowIcon = iconCell ? iconCell.querySelector('.row-icon') : null;
            const chk = tr.querySelector('.row-chk');
            const syncIconChk = () => {
                const sel = State.selectedPaths.has(item.path);
                if (rowIcon) rowIcon.style.display = sel ? 'none' : 'block';
                if (chk) { chk.style.display = sel ? 'block' : 'none'; chk.checked = sel; }
            };
            if (iconCell) {
                // Never navigate from the checkbox square (single or double click) — selection only
                iconCell.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                });
                iconCell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (State.selectedPaths.has(item.path)) State.selectedPaths.delete(item.path);
                    else State.selectedPaths.add(item.path);
                    syncIconChk();
                    tr.classList.toggle('row-selected', State.selectedPaths.has(item.path));
                    UI.updateSelectionUI();
                    window.dispatchEvent(new CustomEvent('pouch:selectionChanged'));
                });
                iconCell.addEventListener('mouseenter', () => {
                    if (!State.selectedPaths.has(item.path)) {
                        if (rowIcon) rowIcon.style.display = 'none';
                        if (chk) chk.style.display = 'block';
                    }
                });
                iconCell.addEventListener('mouseleave', () => {
                    if (!State.selectedPaths.has(item.path)) {
                        if (rowIcon) rowIcon.style.display = 'block';
                        if (chk) chk.style.display = 'none';
                    }
                });
            }
            if (chk) {
                chk.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // sync is handled by iconCell click, but also handle direct checkbox click
                    if (chk.checked) State.selectedPaths.add(item.path);
                    else State.selectedPaths.delete(item.path);
                    syncIconChk();
                    tr.classList.toggle('row-selected', State.selectedPaths.has(item.path));
                    UI.updateSelectionUI();
                    window.dispatchEvent(new CustomEvent('pouch:selectionChanged'));
                });
            }
            // Star — favorites (only on hover, stays visible when fav) + pop effect
            const starBtn = tr.querySelector('.star-btn');
            if (starBtn) {
                starBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    State.toggleFavorite(item.path);
                    State.pushRecent(item);
                    const nowFav = State.isFavorite(item.path);
                    starBtn.classList.toggle('is-fav', nowFav);
                    starBtn.innerHTML = `<ion-icon name="${nowFav ? 'star' : 'star-outline'}" style="color:${nowFav ? '#facc15' : '#6b7280'}; font-size:1rem;"></ion-icon>`;
                    starBtn.title = nowFav ? 'Unstar' : 'Star';
                    // pop effect
                    starBtn.classList.remove('fav-pop');
                    void starBtn.offsetWidth;
                    starBtn.classList.add('fav-pop');
                    setTimeout(() => starBtn.classList.remove('fav-pop'), 400);
                    UI.showToast(nowFav ? 'Starred' : 'Unstarred', item.name, nowFav ? 'success' : 'secondary');
                    if (State.activeCategory === 'favorites' && !nowFav) {
                        setTimeout(() => UI.renderTable(onNavigate, onPlay, onEdit, onPreviewImage, onDelete, onRename, onContextMenu, onPlayAudio, onPreviewPdf), 120);
                    }
                });
            }

            tbody.appendChild(tr);
        });
        // notify bulk bar
        window.dispatchEvent(new CustomEvent('pouch:selectionChanged'));
    },

    renderSidebarStats() {
        const statsSummary = document.getElementById('sidebarStatsSummary');
        const statsBytes = document.getElementById('sidebarStatsBytes');
        const rootLabel = document.getElementById('sidebarRootLabel');

        if (statsSummary) {
            statsSummary.textContent = `${State.meta.folderCount} folders, ${State.meta.fileCount} files`;
        }
        if (statsBytes) {
            statsBytes.textContent = this.formatBytes(State.meta.totalSize);
        }
        if (rootLabel) {
            rootLabel.textContent = State.rootFolderName;
        }
    },

    showToast(title, message, variant = 'primary') {
        const container = document.getElementById('toastStack');
        if (!container) return;

        const toastEl = document.createElement('div');
        toastEl.className = 'toast align-items-center mb-2';
        toastEl.setAttribute('role', 'alert');
        toastEl.setAttribute('aria-live', 'assertive');
        toastEl.setAttribute('aria-atomic', 'true');

        let accentColor = '#0d6efd';
        if (variant === 'danger') accentColor = '#dc3545';
        else if (variant === 'success') accentColor = '#198754';
        else if (variant === 'warning') accentColor = '#ffc107';

        toastEl.style.borderLeft = `3px solid ${accentColor}`;

        toastEl.innerHTML = `
            <div class="d-flex align-items-start justify-content-between p-3">
                <div class="toast-body p-0 pe-3 text-white">
                    <div class="fw-bold fs-6 mb-1 text-truncate" style="color: ${accentColor}; font-size: 0.95rem !important;">
                        ${this.escapeHtml(title)}
                    </div>
                    <div class="small lh-sm" style="color: rgba(255, 255, 255, 0.85); font-size: 0.825rem;">
                        ${this.escapeHtml(message)}
                    </div>
                </div>
                <button type="button" class="btn-close btn-close-white ms-auto mt-0" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        `;

        container.appendChild(toastEl);
        if (window.bootstrap && window.bootstrap.Toast) {
            const bsToast = new window.bootstrap.Toast(toastEl, { delay: 3500 });
            toastEl.addEventListener('hide.bs.toast', () => {
                toastEl.classList.add('toast-slide-out');
            });
            toastEl.addEventListener('hidden.bs.toast', () => {
                toastEl.remove();
            });
            bsToast.show();
        } else {
            toastEl.classList.add('show');
            setTimeout(() => {
                toastEl.classList.add('toast-slide-out');
                setTimeout(() => toastEl.remove(), 200);
            }, 3500);
        }
    },

    triggerCopyFeedback(buttonEl, originalHtml) {
        if (!buttonEl) return;
        buttonEl.innerHTML = '<ion-icon name="checkmark-outline" class="text-success"></ion-icon> Copied';
        buttonEl.classList.add('btn-success-subtle');
        setTimeout(() => {
            buttonEl.innerHTML = originalHtml;
            buttonEl.classList.remove('btn-success-subtle');
        }, 1800);
    },

    updateSelectionUI() {
        const rows = document.querySelectorAll('#fileTableBody tr[data-path]');
        rows.forEach(row => {
            const path = row.getAttribute('data-path');
            if (path && State.selectedPaths.has(path)) {
                row.classList.add('row-selected');
            } else {
                row.classList.remove('row-selected');
            }
        });
        if (State.selectedPaths.size > 0) {
            document.querySelector('#fileTableBody tr[data-is-parent]')?.classList.remove('row-selected');
        }
    },

    showPropertiesModal(item) {
        const modalEl = document.getElementById('propertiesModal');
        if (!modalEl) return;

        const propTitleText = document.getElementById('propTitleText');
        const propTypeIcon = document.getElementById('propTypeIcon');
        const propName = document.getElementById('propName');
        const propTypeDesc = document.getElementById('propTypeDesc');
        const propLocation = document.getElementById('propLocation');
        const propSize = document.getElementById('propSize');
        const propContains = document.getElementById('propContains');
        const propModified = document.getElementById('propModified');

        if (item) {
            // Specific item (file or folder)
            const iconName = this.getSemanticIcon(item);
            const iconColor = this.getIconColor(item);
            const isDir = item.isDirectory;
            const parentDir = item.path.includes('/') ? item.path.substring(0, item.path.lastIndexOf('/')) : '/ (Root)';

            if (propTitleText) propTitleText.textContent = isDir ? 'Folder Properties' : 'File Properties';
            if (propTypeIcon) {
                propTypeIcon.setAttribute('name', iconName);
                propTypeIcon.style.color = iconColor;
            }
            if (propName) propName.textContent = item.name;
            if (propTypeDesc) {
                propTypeDesc.textContent = isDir ? 'Folder' : `${(item.extension || 'file').toUpperCase()} File (${item.mimeType || 'unknown'})`;
            }
            if (propLocation) propLocation.textContent = parentDir || '/';
            if (propSize) propSize.textContent = isDir ? '—' : `${this.formatBytes(item.size)} (${item.size || 0} bytes)`;
            if (propContains) propContains.textContent = isDir ? 'Subdirectory item' : 'Single file';
            if (propModified) propModified.textContent = this.formatDate(item.lastModified);
        } else {
            // Current Directory properties
            const curPath = State.currentPath;
            const curName = State.meta.currentName || (curPath ? curPath.split('/').pop() : State.rootFolderName);
            const parentDir = curPath.includes('/') ? curPath.substring(0, curPath.lastIndexOf('/')) : (curPath ? '/ (Root)' : 'Server Root');
            const totalSize = State.meta.totalSize || 0;
            const fCount = State.meta.folderCount || 0;
            const fileCount = State.meta.fileCount || 0;

            if (propTitleText) propTitleText.textContent = 'Directory Properties';
            if (propTypeIcon) {
                propTypeIcon.setAttribute('name', 'folder');
                propTypeIcon.style.color = '#f59e0b';
            }
            if (propName) propName.textContent = curName;
            if (propTypeDesc) propTypeDesc.textContent = 'Folder';
            if (propLocation) propLocation.textContent = parentDir || '/';
            if (propSize) propSize.textContent = `${this.formatBytes(totalSize)} (${totalSize} bytes)`;
            if (propContains) propContains.textContent = `${fCount} folder(s), ${fileCount} file(s)`;
            if (propModified) propModified.textContent = '—';
        }

        if (window.bootstrap && window.bootstrap.Modal) {
            const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
        }
    },

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
};
