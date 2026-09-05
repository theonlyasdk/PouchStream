/**
 * PouchStream Image Previewer Component Module
 */
import { State } from './state.js';
import { UI } from './ui.js';

export const ImageViewer = {
    onCloseCallback: null,
    imageEl: null,
    stageEl: null,
    currentPath: null,
    currentName: null,
    zoomLevel: 1.0,
    fitMode: true,
    rotation: 0,
    flipH: false,
    panX: 0,
    panY: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    initialPanX: 0,
    initialPanY: 0,
    naturalWidth: 0,
    naturalHeight: 0,

    init(onClose) {
        this.onCloseCallback = onClose;
        this.imageEl = document.getElementById('imagePreviewElement');
        this.stageEl = document.getElementById('imageStage');

        this.setupEventListeners();
        this.setupHotkeys();
    },

    setupEventListeners() {
        const btnClose = document.getElementById('btnCloseImage');
        const btnZoomIn = document.getElementById('btnImageZoomIn');
        const btnZoomOut = document.getElementById('btnImageZoomOut');
        const btnZoomReset = document.getElementById('btnImageZoomReset');
        const btnRotateLeft = document.getElementById('btnImageRotateLeft');
        const btnRotateRight = document.getElementById('btnImageRotateRight');
        const btnFlipH = document.getElementById('btnImageFlipH');
        const btnPrev = document.getElementById('btnImagePrev');
        const btnNext = document.getElementById('btnImageNext');
        const btnFullscreen = document.getElementById('btnImageFullscreen');

        if (btnClose) {
            btnClose.addEventListener('click', () => {
                this.close();
                if (this.onCloseCallback) this.onCloseCallback();
            });
        }

        if (btnZoomIn) btnZoomIn.addEventListener('click', () => this.zoom(0.25));
        if (btnZoomOut) btnZoomOut.addEventListener('click', () => this.zoom(-0.25));
        if (btnZoomReset) btnZoomReset.addEventListener('click', () => this.toggleFitOrActual());
        if (btnRotateLeft) btnRotateLeft.addEventListener('click', () => this.rotate(-90));
        if (btnRotateRight) btnRotateRight.addEventListener('click', () => this.rotate(90));
        if (btnFlipH) btnFlipH.addEventListener('click', () => this.toggleFlipH());
        if (btnPrev) btnPrev.addEventListener('click', () => this.prevImage());
        if (btnNext) btnNext.addEventListener('click', () => this.nextImage());
        if (btnFullscreen) btnFullscreen.addEventListener('click', () => this.toggleFullscreen());

        // Mouse wheel zoom on stage
        if (this.stageEl) {
            this.stageEl.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 0.2 : -0.2;
                this.zoom(delta);
            }, { passive: false });

            // Drag to pan
            this.stageEl.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return; // Left mouse only
                this.isDragging = true;
                this.dragStartX = e.clientX;
                this.dragStartY = e.clientY;
                this.initialPanX = this.panX;
                this.initialPanY = this.panY;
                this.stageEl.classList.add('is-grabbing');
            });

            window.addEventListener('mousemove', (e) => {
                if (!this.isDragging) return;
                const dx = e.clientX - this.dragStartX;
                const dy = e.clientY - this.dragStartY;
                this.panX = this.initialPanX + dx;
                this.panY = this.initialPanY + dy;
                this.applyTransform();
            });

            const stopDrag = () => {
                if (this.isDragging) {
                    this.isDragging = false;
                    if (this.stageEl) this.stageEl.classList.remove('is-grabbing');
                }
            };
            window.addEventListener('mouseup', stopDrag);

            // Double click to toggle between Fit and 100% (or 200%)
            this.stageEl.addEventListener('dblclick', (e) => {
                if (e.target.closest('.portal-toolbar')) return;
                this.toggleFitOrActual();
            });
        }

        // Image load & error handlers
        if (this.imageEl) {
            this.imageEl.addEventListener('load', () => {
                const spinner = document.getElementById('imageLoadingSpinner');
                if (spinner) spinner.classList.add('d-none');
                this.naturalWidth = this.imageEl.naturalWidth || 0;
                this.naturalHeight = this.imageEl.naturalHeight || 0;
                this.updateResolutionLabel();
                this.resetTransforms();
            });

            this.imageEl.addEventListener('error', () => {
                const spinner = document.getElementById('imageLoadingSpinner');
                if (spinner) spinner.classList.add('d-none');
                UI.showToast('Preview Error', 'Failed to load image format', 'danger');
            });
        }
    },

    setupHotkeys() {
        window.addEventListener('keydown', (e) => {
            const imageView = document.getElementById('contentImageView');
            if (!imageView || imageView.classList.contains('d-none')) return;

            // Ignore when typing in inputs/textareas
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

            switch (e.key) {
                case 'Escape':
                    e.preventDefault();
                    this.close();
                    if (this.onCloseCallback) this.onCloseCallback();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.prevImage();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.nextImage();
                    break;
                case '+':
                case '=':
                    e.preventDefault();
                    this.zoom(0.25);
                    break;
                case '-':
                case '_':
                    e.preventDefault();
                    this.zoom(-0.25);
                    break;
                case '0':
                    e.preventDefault();
                    this.toggleFitOrActual();
                    break;
                case 'r':
                case 'R':
                    e.preventDefault();
                    this.rotate(90);
                    break;
                case 'h':
                case 'H':
                    e.preventDefault();
                    this.toggleFlipH();
                    break;
                case 'f':
                case 'F':
                    e.preventDefault();
                    this.toggleFullscreen();
                    break;
            }
        });
    },

    getImageList() {
        return State.items.filter(item => UI.isImage(item));
    },

    open(path, name) {
        this.currentPath = path;
        this.currentName = name;
        try { localStorage.setItem('pouchstream:lastOpenedFile', JSON.stringify({ path, name, type: 'image' })); } catch {}

        const titleEl = document.getElementById('imageTitle');
        const dlBtn = document.getElementById('btnImageDownload');
        const imageView = document.getElementById('contentImageView');
        const workspaceView = document.getElementById('workspaceView');
        const toolbar = document.getElementById('portalToolbar');
        const spinner = document.getElementById('imageLoadingSpinner');

        if (titleEl) titleEl.textContent = name;
        if (dlBtn) dlBtn.href = `/api/stream?path=${encodeURIComponent(path)}&download=true`;
        if (spinner) spinner.classList.remove('d-none');

        this.updateGalleryControls();

        if (this.imageEl) {
            this.imageEl.src = `/api/stream?path=${encodeURIComponent(path)}`;
        }

        const videoView = document.getElementById('contentVideoView');
        const editorView = document.getElementById('contentEditorView');
        const settingsView = document.getElementById('contentSettingsView');
        if (videoView) {
            videoView.classList.add('d-none');
            videoView.classList.remove('d-flex');
        }
        if (editorView) {
            editorView.classList.add('d-none');
            editorView.classList.remove('d-flex');
        }
        if (settingsView) {
            settingsView.classList.add('d-none');
            settingsView.classList.remove('d-flex');
        }

        if (workspaceView) workspaceView.classList.add('d-none');
        if (toolbar) toolbar.classList.add('d-none');
        if (imageView) {
            imageView.classList.remove('d-none');
            imageView.classList.add('d-flex');
        }
    },

    close() {
        try {
            const raw = localStorage.getItem('pouchstream:lastOpenedFile');
            if (raw) {
                const obj = JSON.parse(raw);
                if (obj && obj.path === this.currentPath && obj.type === 'image') localStorage.removeItem('pouchstream:lastOpenedFile');
            }
        } catch {}
        this.currentPath = null;
        this.currentName = null;

        const imageView = document.getElementById('contentImageView');
        const workspaceView = document.getElementById('workspaceView');
        const toolbar = document.getElementById('portalToolbar');

        if (this.imageEl) {
            this.imageEl.removeAttribute('src');
        }

        if (imageView) {
            imageView.classList.add('d-none');
            imageView.classList.remove('d-flex');
        }
        if (workspaceView) workspaceView.classList.remove('d-none');
        if (toolbar) toolbar.classList.remove('d-none');
    },

    prevImage() {
        const images = this.getImageList();
        if (images.length <= 1 || !this.currentPath) return;

        const currentIndex = images.findIndex(img => img.path === this.currentPath);
        if (currentIndex === -1) return;

        const prevIndex = (currentIndex - 1 + images.length) % images.length;
        const target = images[prevIndex];
        this.open(target.path, target.name);
    },

    nextImage() {
        const images = this.getImageList();
        if (images.length <= 1 || !this.currentPath) return;

        const currentIndex = images.findIndex(img => img.path === this.currentPath);
        if (currentIndex === -1) return;

        const nextIndex = (currentIndex + 1) % images.length;
        const target = images[nextIndex];
        this.open(target.path, target.name);
    },

    updateGalleryControls() {
        const images = this.getImageList();
        const currentIndex = images.findIndex(img => img.path === this.currentPath);
        const counterEl = document.getElementById('lblImageGalleryIndex');
        const btnPrev = document.getElementById('btnImagePrev');
        const btnNext = document.getElementById('btnImageNext');

        if (counterEl) {
            if (images.length > 0 && currentIndex !== -1) {
                counterEl.textContent = `${currentIndex + 1} / ${images.length}`;
            } else {
                counterEl.textContent = '1 / 1';
            }
        }

        const disabled = images.length <= 1;
        if (btnPrev) btnPrev.disabled = disabled;
        if (btnNext) btnNext.disabled = disabled;
    },

    updateResolutionLabel() {
        const resEl = document.getElementById('lblImageResolution');
        if (!resEl) return;
        if (this.naturalWidth && this.naturalHeight) {
            resEl.textContent = `${this.naturalWidth} × ${this.naturalHeight} px`;
        } else {
            resEl.textContent = '';
        }
    },

    resetTransforms() {
        this.zoomLevel = 1.0;
        this.fitMode = true;
        this.rotation = 0;
        this.flipH = false;
        this.panX = 0;
        this.panY = 0;
        this.applyTransform();
    },

    zoom(delta) {
        this.fitMode = false;
        let newZoom = this.zoomLevel + delta;
        newZoom = Math.max(0.1, Math.min(10.0, Math.round(newZoom * 100) / 100));
        this.zoomLevel = newZoom;
        this.applyTransform();
    },

    toggleFitOrActual() {
        if (this.fitMode) {
            this.fitMode = false;
            this.zoomLevel = 1.0;
            this.panX = 0;
            this.panY = 0;
        } else if (Math.abs(this.zoomLevel - 1.0) < 0.05) {
            this.fitMode = false;
            this.zoomLevel = 2.0;
            this.panX = 0;
            this.panY = 0;
        } else {
            this.fitMode = true;
            this.zoomLevel = 1.0;
            this.panX = 0;
            this.panY = 0;
        }
        this.applyTransform();
    },

    rotate(angleDelta) {
        this.rotation = (this.rotation + angleDelta) % 360;
        if (this.rotation < 0) this.rotation += 360;
        this.applyTransform();
    },

    toggleFlipH() {
        this.flipH = !this.flipH;
        this.applyTransform();
    },

    applyTransform() {
        if (!this.imageEl) return;

        const zoomLabel = document.getElementById('lblImageZoom');
        if (zoomLabel) {
            if (this.fitMode) {
                zoomLabel.textContent = 'Fit';
            } else {
                zoomLabel.textContent = `${Math.round(this.zoomLevel * 100)}%`;
            }
        }

        if (this.fitMode) {
            this.imageEl.style.maxWidth = '100%';
            this.imageEl.style.maxHeight = '100%';
            this.imageEl.style.width = 'auto';
            this.imageEl.style.height = 'auto';
            this.imageEl.style.objectFit = 'contain';
        } else {
            this.imageEl.style.maxWidth = 'none';
            this.imageEl.style.maxHeight = 'none';
            this.imageEl.style.objectFit = 'unset';
            if (this.naturalWidth && this.naturalHeight) {
                this.imageEl.style.width = `${this.naturalWidth * this.zoomLevel}px`;
                this.imageEl.style.height = `${this.naturalHeight * this.zoomLevel}px`;
            } else {
                this.imageEl.style.width = `${this.zoomLevel * 100}%`;
                this.imageEl.style.height = 'auto';
            }
        }

        const scaleX = this.flipH ? -1 : 1;
        this.imageEl.style.transform = `translate(${this.panX}px, ${this.panY}px) rotate(${this.rotation}deg) scaleX(${scaleX})`;
    },

    toggleFullscreen() {
        const view = document.getElementById('contentImageView');
        if (!view) return;

        if (!document.fullscreenElement) {
            if (view.requestFullscreen) {
                view.requestFullscreen();
            } else if (view.webkitRequestFullscreen) {
                view.webkitRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }
};
