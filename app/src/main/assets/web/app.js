// PouchStream Web Client Application (Bulma CSS Edition)
let currentPath = "";
let currentItems = [];
let lastSignature = null;
let isEditorOpen = false;
let activeEditPath = "";
let rootFolderName = "Home";
let pollInterval = null;

document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

function initApp() {
    fetchInfo();
    loadDirectory("");

    // Setup filter/search listener
    const filterInput = document.getElementById("filterInput");
    if (filterInput) {
        filterInput.addEventListener("input", (e) => {
            filterFileTable(e.target.value.toLowerCase().trim());
        });
    }

    // Setup file input name display
    const fileInput = document.getElementById("uploadFileInput");
    if (fileInput) {
        fileInput.addEventListener("change", () => {
            const display = document.getElementById("uploadFileNameDisplay");
            if (display) {
                if (fileInput.files.length === 1) {
                    display.textContent = fileInput.files[0].name;
                } else if (fileInput.files.length > 1) {
                    display.textContent = `${fileInput.files.length} files selected`;
                } else {
                    display.textContent = "No files selected";
                }
            }
        });
    }

    // Setup Ctrl+S in editor
    window.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
            if (isEditorOpen) {
                e.preventDefault();
                saveEditorContent();
            }
        }
        if (e.key === "Escape") {
            closeAllModals();
        }
    });

    // Start live-update polling (every 2.5 seconds)
    startLivePolling();
}

// ---------------- Modal Handling ----------------

function openModal(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add("is-active");
        if (id === "modal-editor") {
            isEditorOpen = true;
        }
    }
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.remove("is-active");
        if (id === "modal-editor") {
            isEditorOpen = false;
            activeEditPath = "";
        }
        if (id === "modal-video") {
            stopVideo();
        }
    }
}

function closeAllModals() {
    document.querySelectorAll(".modal.is-active").forEach(modal => {
        closeModal(modal.id);
    });
}

// ---------------- Toast Notifications ----------------

function showNotification(message, type = "is-success") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const notif = document.createElement("div");
    notif.className = `notification ${type} is-light py-2 px-4 is-size-7`;
    notif.innerHTML = `
        <button class="delete is-small"></button>
        <span>${message}</span>
    `;

    notif.querySelector(".delete").addEventListener("click", () => notif.remove());

    container.appendChild(notif);
    setTimeout(() => {
        if (notif.parentNode) {
            notif.remove();
        }
    }, 3200);
}

// ---------------- API & Directory Traversal ----------------

async function fetchInfo() {
    try {
        const res = await fetch("/api/info");
        const data = await res.json();
        if (data.folderName) {
            rootFolderName = data.folderName;
            updateBreadcrumbs(currentPath);
        }
    } catch (e) {
        console.warn("Error fetching server info:", e);
    }
}

async function loadDirectory(path, silent = false) {
    if (!silent) {
        renderLoading();
    }

    try {
        const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Failed to load directory");
        }

        const data = await res.json();
        currentPath = data.currentPath || "";
        currentItems = data.items || [];
        lastSignature = data.signature;
        if (data.currentName && !currentPath) {
            rootFolderName = data.currentName;
        }

        updateBreadcrumbs(currentPath);
        renderFileTable(currentItems);

        // Update stats
        const statsEl = document.getElementById("folderStats");
        if (statsEl) {
            statsEl.textContent = `${data.folderCount} folders, ${data.fileCount} files (${formatBytes(data.totalSize)})`;
        }

        const uploadTarget = document.getElementById("uploadTargetFolder");
        if (uploadTarget) {
            uploadTarget.textContent = `Destination: /${currentPath}`;
        }
    } catch (e) {
        if (!silent) {
            renderError(e.message);
        }
    }
}

function startLivePolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
        try {
            const res = await fetch(`/api/poll?path=${encodeURIComponent(currentPath)}`);
            if (res.ok) {
                const data = await res.json();
                if (lastSignature !== null && data.signature !== lastSignature) {
                    lastSignature = data.signature;
                    loadDirectory(currentPath, true);
                }
            }
        } catch (e) {
            // Server may be momentarily unreachable
        }
    }, 2500);
}

function updateBreadcrumbs(path) {
    const container = document.getElementById("breadcrumbContainer");
    if (!container) return;

    if (!path) {
        container.innerHTML = `<li class="is-active"><a href="#" aria-current="page">🏠 ${escapeHtml(rootFolderName)}</a></li>`;
        return;
    }

    let html = `<li><a href="#" onclick="navigateTo(''); return false;">🏠 ${escapeHtml(rootFolderName)}</a></li>`;
    const parts = path.split("/");
    let acc = "";
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part) continue;
        acc += (acc ? "/" : "") + part;
        const isLast = i === parts.length - 1;
        if (isLast) {
            html += `<li class="is-active"><a href="#" aria-current="page">${escapeHtml(part)}</a></li>`;
        } else {
            const navAcc = acc;
            html += `<li><a href="#" onclick="navigateTo('${escapeJs(navAcc)}'); return false;">${escapeHtml(part)}</a></li>`;
        }
    }
    container.innerHTML = html;
}

function renderFileTable(items) {
    const tbody = document.getElementById("fileTableBody");
    if (!tbody) return;

    if (!items || items.length === 0) {
        let emptyHtml = `
            <tr>
                <td colspan="4" class="has-text-centered p-6 has-text-grey">
                    <div class="is-size-2 mb-2">📁</div>
                    <div>This folder is empty. Upload files or create folders above.</div>
                </td>
            </tr>
        `;
        if (currentPath) {
            emptyHtml = getParentRowHtml() + emptyHtml;
        }
        tbody.innerHTML = emptyHtml;
        return;
    }

    let rowsHtml = "";
    if (currentPath) {
        rowsHtml += getParentRowHtml();
    }

    items.forEach((item) => {
        const isDir = item.isDirectory;
        const icon = getFileEmoji(item);
        const formattedSize = isDir ? "--" : formatBytes(item.size);
        const formattedDate = item.lastModified ? new Date(item.lastModified).toLocaleString() : "--";
        const isVideo = isVideoFile(item.name, item.mimeType);
        const isEditable = isTextEditable(item.name, item.mimeType);

        let primaryAction = "";
        if (isDir) {
            primaryAction = `onclick="navigateTo('${escapeJs(item.path)}'); return false;"`;
        } else if (isVideo) {
            primaryAction = `onclick="openVideo('${escapeJs(item.path)}', '${escapeJs(item.name)}'); return false;"`;
        } else if (isEditable) {
            primaryAction = `onclick="openEditor('${escapeJs(item.path)}', '${escapeJs(item.name)}'); return false;"`;
        } else {
            primaryAction = `onclick="downloadItem('${escapeJs(item.path)}'); return false;"`;
        }

        rowsHtml += `
            <tr data-name="${escapeHtml(item.name.toLowerCase())}">
                <td>
                    <a href="#" class="has-text-light is-flex is-align-items-center" ${primaryAction}>
                        <span class="mr-2 is-size-5">${icon}</span>
                        <span class="${isDir ? 'has-text-weight-bold has-text-link-light' : ''}">${escapeHtml(item.name)}</span>
                        ${isVideo ? '<span class="tag is-link is-light is-rounded ml-2">Stream</span>' : ''}
                        ${isEditable ? '<span class="tag is-info is-light is-rounded ml-2">Edit</span>' : ''}
                    </a>
                </td>
                <td class="has-text-grey-light is-size-7 is-vcentered">${formattedSize}</td>
                <td class="has-text-grey-light is-size-7 is-vcentered">${formattedDate}</td>
                <td class="has-text-right is-vcentered">
                    <div class="buttons are-small is-right mb-0">
                        ${isVideo ? `
                            <button class="button is-link is-outlined" title="Stream Video" onclick="openVideo('${escapeJs(item.path)}', '${escapeJs(item.name)}')">
                                ▶ Play
                            </button>
                        ` : ''}
                        ${isEditable ? `
                            <button class="button is-info is-outlined" title="Edit in browser" onclick="openEditor('${escapeJs(item.path)}', '${escapeJs(item.name)}')">
                                ✏ Edit
                            </button>
                        ` : ''}
                        ${!isDir ? `
                            <a class="button is-dark" title="Download" href="/api/stream?path=${encodeURIComponent(item.path)}&download=true">
                                ⬇
                            </a>
                        ` : ''}
                        <button class="button is-dark" title="Rename" onclick="renameItem('${escapeJs(item.path)}', '${escapeJs(item.name)}')">
                            ✎
                        </button>
                        <button class="button is-danger is-outlined" title="Delete" onclick="deleteItem('${escapeJs(item.path)}', '${escapeJs(item.name)}')">
                            ✕
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = rowsHtml;
}

function getParentRowHtml() {
    const parentPath = getParentPath(currentPath);
    return `
        <tr>
            <td colspan="4">
                <a href="#" class="has-text-grey-light is-flex is-align-items-center has-text-weight-bold" onclick="navigateTo('${escapeJs(parentPath)}'); return false;">
                    <span class="mr-2">⬆</span>
                    <span>.. (Parent Directory)</span>
                </a>
            </td>
        </tr>
    `;
}

function renderLoading() {
    const tbody = document.getElementById("fileTableBody");
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="has-text-centered p-6 has-text-grey">
                    <div class="loader is-loading is-inline-block"></div>
                    <div class="mt-2">Loading directory...</div>
                </td>
            </tr>
        `;
    }
}

function renderError(msg) {
    const tbody = document.getElementById("fileTableBody");
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="has-text-centered p-6 has-text-danger">
                    <div class="is-size-3 mb-2">⚠</div>
                    <div>${escapeHtml(msg)}</div>
                    <button class="button is-small is-dark mt-3" onclick="loadDirectory(currentPath)">Retry</button>
                </td>
            </tr>
        `;
    }
}

function filterFileTable(query) {
    const rows = document.querySelectorAll("#fileTableBody tr[data-name]");
    rows.forEach(row => {
        const name = row.getAttribute("data-name") || "";
        if (!query || name.includes(query)) {
            row.style.display = "";
        } else {
            row.style.display = "none";
        }
    });
}

function navigateTo(path) {
    const filterInput = document.getElementById("filterInput");
    if (filterInput) filterInput.value = "";
    loadDirectory(path);
}

// ---------------- Video Streaming ----------------

function openVideo(path, name) {
    const videoTitle = document.getElementById("videoTitle");
    const videoPlayer = document.getElementById("videoPlayer");
    const downloadBtn = document.getElementById("videoDownloadBtn");

    if (videoTitle) videoTitle.textContent = name;
    if (downloadBtn) downloadBtn.href = `/api/stream?path=${encodeURIComponent(path)}&download=true`;

    const streamUrl = `/api/stream?path=${encodeURIComponent(path)}`;
    if (videoPlayer) {
        videoPlayer.src = streamUrl;
        videoPlayer.load();
        videoPlayer.play().catch(() => {});
    }

    openModal("modal-video");
}

function stopVideo() {
    const videoPlayer = document.getElementById("videoPlayer");
    if (videoPlayer) {
        videoPlayer.pause();
        videoPlayer.removeAttribute("src");
        videoPlayer.load();
    }
}

// ---------------- In-Editor Text Editing ----------------

async function openEditor(path, name) {
    activeEditPath = path;
    const titleEl = document.getElementById("editorTitle");
    const statusEl = document.getElementById("editorStatus");
    const textarea = document.getElementById("editorTextarea");

    if (titleEl) titleEl.textContent = `Editing: ${name}`;
    if (statusEl) {
        statusEl.textContent = "Loading...";
        statusEl.className = "tag is-warning is-light is-small";
    }
    if (textarea) textarea.value = "";

    openModal("modal-editor");

    try {
        const res = await fetch(`/api/read?path=${encodeURIComponent(path)}`);
        if (!res.ok) throw new Error("Failed to load file content");
        const data = await res.json();
        if (textarea) {
            textarea.value = data.content || "";
        }
        if (statusEl) {
            statusEl.textContent = "Ready";
            statusEl.className = "tag is-success is-light is-small";
        }
    } catch (e) {
        if (statusEl) {
            statusEl.textContent = "Error";
            statusEl.className = "tag is-danger is-light is-small";
        }
        showNotification("Error opening file: " + e.message, "is-danger");
    }
}

async function saveEditorContent() {
    if (!activeEditPath) return;

    const textarea = document.getElementById("editorTextarea");
    const statusEl = document.getElementById("editorStatus");
    const content = textarea ? textarea.value : "";

    if (statusEl) {
        statusEl.textContent = "Saving...";
        statusEl.className = "tag is-warning is-light is-small";
    }

    try {
        const res = await fetch("/api/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: activeEditPath, content: content })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Save failed");
        }

        const saveTime = new Date().toLocaleTimeString();
        if (statusEl) {
            statusEl.textContent = `Saved at ${saveTime}`;
            statusEl.className = "tag is-success is-light is-small";
        }

        showNotification(`Saved "${getFileName(activeEditPath)}" at ${saveTime}`, "is-success");
        loadDirectory(currentPath, true);
    } catch (e) {
        if (statusEl) {
            statusEl.textContent = "Save failed";
            statusEl.className = "tag is-danger is-light is-small";
        }
        showNotification(`Save failed: ${e.message}`, "is-danger");
    }
}

// ---------------- File & Folder Creation / Management ----------------

async function createNewFolder() {
    const input = document.getElementById("newFolderNameInput");
    const name = input ? input.value.trim() : "";
    if (!name) {
        showNotification("Please enter a folder name", "is-warning");
        return;
    }

    try {
        const formData = new FormData();
        formData.append("path", currentPath);
        formData.append("name", name);

        const res = await fetch("/api/create_folder", { method: "POST", body: formData });
        if (!res.ok) throw new Error("Folder creation failed");

        closeModal("modal-new-folder");
        if (input) input.value = "";
        showNotification(`Folder "${name}" created`, "is-success");
        loadDirectory(currentPath);
    } catch (e) {
        showNotification(e.message, "is-danger");
    }
}

async function createNewFile() {
    const input = document.getElementById("newFileNameInput");
    const name = input ? input.value.trim() : "";
    if (!name) {
        showNotification("Please enter a file name", "is-warning");
        return;
    }

    try {
        const formData = new FormData();
        formData.append("path", currentPath);
        formData.append("name", name);

        const res = await fetch("/api/create_file", { method: "POST", body: formData });
        if (!res.ok) throw new Error("File creation failed");

        closeModal("modal-new-file");
        if (input) input.value = "";
        showNotification(`File "${name}" created`, "is-success");
        loadDirectory(currentPath);

        const filePath = currentPath ? `${currentPath}/${name}` : name;
        openEditor(filePath, name);
    } catch (e) {
        showNotification(e.message, "is-danger");
    }
}

async function handleUpload() {
    const fileInput = document.getElementById("uploadFileInput");
    const progressBar = document.getElementById("uploadProgressBar");
    const btnUpload = document.getElementById("btnStartUpload");

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        showNotification("Please select files to upload", "is-warning");
        return;
    }

    const formData = new FormData();
    formData.append("path", currentPath);
    for (let i = 0; i < fileInput.files.length; i++) {
        formData.append(`file_${i}`, fileInput.files[i], fileInput.files[i].name);
    }

    if (progressBar) {
        progressBar.classList.remove("is-hidden");
        progressBar.value = 0;
    }
    if (btnUpload) btnUpload.disabled = true;

    try {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/upload", true);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && progressBar) {
                progressBar.value = Math.round((e.loaded / e.total) * 100);
            }
        };

        xhr.onload = () => {
            if (btnUpload) btnUpload.disabled = false;
            if (progressBar) progressBar.classList.add("is-hidden");

            if (xhr.status >= 200 && xhr.status < 300) {
                closeModal("modal-upload");
                fileInput.value = "";
                const display = document.getElementById("uploadFileNameDisplay");
                if (display) display.textContent = "No files selected";
                showNotification("Files uploaded successfully!", "is-success");
                loadDirectory(currentPath);
            } else {
                showNotification("Upload failed: " + xhr.statusText, "is-danger");
            }
        };

        xhr.onerror = () => {
            if (btnUpload) btnUpload.disabled = false;
            if (progressBar) progressBar.classList.add("is-hidden");
            showNotification("Network error during upload", "is-danger");
        };

        xhr.send(formData);
    } catch (e) {
        if (btnUpload) btnUpload.disabled = false;
        if (progressBar) progressBar.classList.add("is-hidden");
        showNotification(e.message, "is-danger");
    }
}

function deleteItem(path, name) {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;

    const formData = new FormData();
    formData.append("path", path);

    fetch("/api/delete", { method: "POST", body: formData })
        .then(res => {
            if (!res.ok) throw new Error("Delete failed");
            showNotification(`Deleted "${name}"`, "is-success");
            loadDirectory(currentPath);
        })
        .catch(e => showNotification(e.message, "is-danger"));
}

function renameItem(path, currentName) {
    const newName = prompt("Enter new name:", currentName);
    if (!newName || newName.trim() === "" || newName.trim() === currentName) return;

    const formData = new FormData();
    formData.append("path", path);
    formData.append("newName", newName.trim());

    fetch("/api/rename", { method: "POST", body: formData })
        .then(res => {
            if (!res.ok) throw new Error("Rename failed");
            showNotification(`Renamed to "${newName.trim()}"`, "is-success");
            loadDirectory(currentPath);
        })
        .catch(e => showNotification(e.message, "is-danger"));
}

function downloadItem(path) {
    window.location.href = `/api/stream?path=${encodeURIComponent(path)}&download=true`;
}

// ---------------- Helpers & Formatters ----------------

function formatBytes(bytes) {
    if (bytes === 0 || !bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function getFileEmoji(item) {
    if (item.isDirectory) return "📁";
    const ext = (item.extension || "").toLowerCase();

    if (["mp4", "webm", "mkv", "mov", "avi", "m4v"].includes(ext)) return "🎬";
    if (["mp3", "wav", "flac", "ogg", "aac"].includes(ext)) return "🎵";
    if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "🖼️";
    if (["txt", "md", "json", "js", "html", "css", "py", "java", "kt", "xml", "c", "cpp"].includes(ext)) return "📝";
    if (["pdf"].includes(ext)) return "📕";
    if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "📦";
    return "📄";
}

function isVideoFile(name, mime) {
    if (mime && mime.startsWith("video/")) return true;
    const ext = getExtension(name);
    return ["mp4", "webm", "mkv", "mov", "avi", "m4v"].includes(ext);
}

function isTextEditable(name, mime) {
    if (mime && (mime.startsWith("text/") || mime === "application/json" || mime === "application/javascript")) return true;
    const ext = getExtension(name);
    return ["txt", "md", "json", "js", "html", "htm", "css", "py", "java", "kt", "xml", "ini", "conf", "log", "sh", "yaml", "yml"].includes(ext);
}

function getExtension(name) {
    if (!name) return "";
    const idx = name.lastIndexOf(".");
    if (idx === -1) return "";
    return name.substring(idx + 1).toLowerCase();
}

function getFileName(path) {
    if (!path) return "";
    const idx = path.lastIndexOf("/");
    if (idx === -1) return path;
    return path.substring(idx + 1);
}

function getParentPath(path) {
    if (!path) return "";
    const idx = path.lastIndexOf("/");
    if (idx === -1) return "";
    return path.substring(0, idx);
}

function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function escapeJs(str) {
    if (!str) return "";
    return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
