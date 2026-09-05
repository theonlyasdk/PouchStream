/**
 * PouchStream API Client Module
 */
export const Api = {
    async getInfo() {
        const res = await fetch('/api/info');
        if (!res.ok) throw new Error('Failed to fetch server information');
        return await res.json();
    },

    async getFiles(path = '') {
        const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}: Failed to read directory`);
        }
        return await res.json();
    },

    async poll(path = '') {
        const res = await fetch(`/api/poll?path=${encodeURIComponent(path)}`);
        if (!res.ok) throw new Error('Poll check failed');
        return await res.json();
    },

    async readFile(path) {
        const res = await fetch(`/api/read?path=${encodeURIComponent(path)}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}: Failed to read file`);
        }
        return await res.json();
    },

    async saveFile(path, content) {
        const res = await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, content })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}: Failed to save file`);
        }
        return await res.json();
    },

    async createFolder(path, name) {
        const formData = new FormData();
        formData.append('path', path);
        formData.append('name', name);
        const res = await fetch('/api/create_folder', { method: 'POST', body: formData });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to create directory');
        }
        return await res.json();
    },

    async createFile(path, name) {
        const formData = new FormData();
        formData.append('path', path);
        formData.append('name', name);
        const res = await fetch('/api/create_file', { method: 'POST', body: formData });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to create file');
        }
        return await res.json();
    },

    async deleteItem(path) {
        const formData = new FormData();
        formData.append('path', path);
        const res = await fetch('/api/delete', { method: 'POST', body: formData });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Delete failed');
        }
        return await res.json();
    },

    async renameItem(path, newName) {
        const formData = new FormData();
        formData.append('path', path);
        formData.append('newName', newName);
        const res = await fetch('/api/rename', { method: 'POST', body: formData });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Rename failed');
        }
        return await res.json();
    },

    uploadFiles(path, fileList, onProgress) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('path', path);
            for (let i = 0; i < fileList.length; i++) {
                formData.append(`file_${i}`, fileList[i], fileList[i].name);
            }

            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/upload', true);

            if (xhr.upload && onProgress) {
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const pct = Math.round((e.loaded / e.total) * 100);
                        onProgress(pct);
                    }
                };
            }

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        resolve(JSON.parse(xhr.responseText));
                    } catch {
                        resolve({ success: true });
                    }
                } else {
                    reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
                }
            };

            xhr.onerror = () => reject(new Error('Network error during file upload'));
            xhr.send(formData);
        });
    }
};
