/**
 * PouchStream State Management Module
 */
export const State = {
    currentPath: '',
    previousDepth: 0,
    currentDepth: 0,
    slideDirection: 'none', // 'down' | 'up' | 'none'
    rootFolderName: 'Root',
    items: [],
    meta: {
        folderCount: 0,
        fileCount: 0,
        totalSize: 0,
        currentName: 'Root',
        parentPath: ''
    },
    signature: null,
    filterQuery: '',
    activeCategory: 'all', // 'all' | 'video' | 'document' | 'image' | 'archive'
    sortField: 'name', // 'name' | 'format' | 'size' | 'lastModified'
    sortOrder: 'asc', // 'asc' | 'desc'
    selectedPaths: new Set(),
    favorites: new Set(JSON.parse(localStorage.getItem('pouchstream:favorites') || '[]')),
    recent: JSON.parse(localStorage.getItem('pouchstream:recent') || '[]'), // [{path,name,time}]

    saveFavorites() {
        try { localStorage.setItem('pouchstream:favorites', JSON.stringify([...this.favorites])); } catch {}
    },
    saveRecent() {
        try { localStorage.setItem('pouchstream:recent', JSON.stringify(this.recent.slice(0,30))); } catch {}
    },
    toggleFavorite(path) {
        if (this.favorites.has(path)) this.favorites.delete(path); else this.favorites.add(path);
        this.saveFavorites();
    },
    isFavorite(path) { return this.favorites.has(path); },
    pushRecent(item) {
        if (!item || !item.path) return;
        this.recent = this.recent.filter(r => r.path !== item.path);
        this.recent.unshift({ path: item.path, name: item.name, time: Date.now(), isDirectory: !!item.isDirectory });
        if (this.recent.length > 30) this.recent.pop();
        this.saveRecent();
    },

    clearSelection() {
        this.selectedPaths.clear();
    },

    toggleSelect(path, isSelected) {
        if (isSelected === undefined) {
            if (this.selectedPaths.has(path)) {
                this.selectedPaths.delete(path);
            } else {
                this.selectedPaths.add(path);
            }
        } else if (isSelected) {
            this.selectedPaths.add(path);
        } else {
            this.selectedPaths.delete(path);
        }
    },

    setPath(newPath) {
        const cleaned = (newPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        const newDepth = cleaned ? cleaned.split('/').length : 0;

        if (newDepth > this.currentDepth) {
            this.slideDirection = 'down';
        } else if (newDepth < this.currentDepth) {
            this.slideDirection = 'up';
        } else {
            this.slideDirection = 'none';
        }

        this.previousDepth = this.currentDepth;
        this.currentDepth = newDepth;
        this.currentPath = cleaned;
    },

    setSort(field) {
        if (this.sortField === field) {
            this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortField = field;
            this.sortOrder = 'asc';
        }
    },

    getFilteredItems() {
        let result = [...this.items];

        // Apply Category Filter
        if (this.activeCategory !== 'all') {
            if (this.activeCategory === 'favorites') {
                result = result.filter(item => this.isFavorite(item.path));
            } else if (this.activeCategory === 'recent') {
                const order = new Map(this.recent.map((r, i) => [r.path, i]));
                result = result.filter(item => order.has(item.path));
                result.sort((a, b) => order.get(a.path) - order.get(b.path));
            } else {
                result = result.filter(item => {
                    if (item.isDirectory) return true; // always show directories for media filters
                    const ext = (item.extension || '').toLowerCase();
                    const mime = (item.mimeType || '').toLowerCase();

                    switch (this.activeCategory) {
                        case 'video':
                            return mime.startsWith('video/') || ['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v'].includes(ext);
                        case 'document':
                            return mime.startsWith('text/') || ['txt', 'pdf', 'md', 'json', 'js', 'html', 'css', 'py', 'java', 'xml', 'csv', 'docx', 'xlsx'].includes(ext);
                        case 'image':
                            return mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
                        case 'audio':
                            return mime.startsWith('audio/') || ['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a'].includes(ext);
                        default:
                            return true;
                    }
                });
            }
        }

        // Apply Search Filter
        if (this.filterQuery.trim()) {
            const q = this.filterQuery.toLowerCase().trim();
            result = result.filter(item => item.name.toLowerCase().includes(q));
        }

        // Apply Sorting (Keep directories on top or respect sort order)
        const orderFactor = this.sortOrder === 'asc' ? 1 : -1;
        result.sort((a, b) => {
            // Folders grouped together at top
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;

            if (this.sortField === 'name') {
                return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) * orderFactor;
            } else if (this.sortField === 'format') {
                const typeA = a.isDirectory ? 'Directory' : (a.extension || '');
                const typeB = b.isDirectory ? 'Directory' : (b.extension || '');
                return typeA.localeCompare(typeB, undefined, { sensitivity: 'base' }) * orderFactor;
            } else if (this.sortField === 'size') {
                const sizeA = a.isDirectory ? 0 : (a.size || 0);
                const sizeB = b.isDirectory ? 0 : (b.size || 0);
                return (sizeA - sizeB) * orderFactor;
            } else if (this.sortField === 'lastModified') {
                const timeA = a.lastModified || 0;
                const timeB = b.lastModified || 0;
                return (timeA - timeB) * orderFactor;
            }
            return 0;
        });

        return result;
    }
};
