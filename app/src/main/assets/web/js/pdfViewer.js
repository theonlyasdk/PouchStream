/**
 * PouchStream In-Browser PDF & Document Viewer Module
 */
export const PdfViewer = {
    activePath: null,

    init() {
        const btnClose = document.getElementById('btnClosePdf');
        if (btnClose) {
            btnClose.addEventListener('click', () => this.close());
        }

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.activePath) {
                this.close();
            }
        });
    },

    open(path, name) {
        this.activePath = path;
        const displayName = name || path.split('/').pop();

        const pdfView = document.getElementById('contentPdfView');
        const workspaceView = document.getElementById('workspaceView');
        const toolbar = document.getElementById('portalToolbar');
        const titleEl = document.getElementById('pdfTitle');
        const frame = document.getElementById('pdfFrame');
        const btnDownload = document.getElementById('btnPdfDownload');
        const btnNewTab = document.getElementById('btnPdfNewTab');

        // Hide other in-content views if open
        const videoView = document.getElementById('contentVideoView');
        const imageView = document.getElementById('contentImageView');
        const editorView = document.getElementById('contentEditorView');
        const settingsView = document.getElementById('contentSettingsView');
        if (videoView) { videoView.classList.add('d-none'); videoView.classList.remove('d-flex'); }
        if (imageView) { imageView.classList.add('d-none'); imageView.classList.remove('d-flex'); }
        if (editorView) { editorView.classList.add('d-none'); editorView.classList.remove('d-flex'); }
        if (settingsView) { settingsView.classList.add('d-none'); settingsView.classList.remove('d-flex'); }

        // Pause video player if currently playing
        const videoEl = document.getElementById('videoPlayer');
        if (videoEl && !videoEl.paused) {
            videoEl.pause();
        }

        if (titleEl) titleEl.textContent = displayName;
        const streamUrl = `/api/stream?path=${encodeURIComponent(path)}`;

        if (btnDownload) {
            btnDownload.href = `${streamUrl}&download=true`;
            btnDownload.download = displayName;
        }
        if (btnNewTab) {
            btnNewTab.href = streamUrl;
        }
        if (frame) {
            frame.src = streamUrl;
        }

        if (workspaceView) workspaceView.classList.add('d-none');
        if (toolbar) toolbar.classList.add('d-none');
        if (pdfView) {
            pdfView.classList.remove('d-none');
            pdfView.classList.add('d-flex');
        }

        try {
            localStorage.setItem('pouchstream:lastOpenedFile', JSON.stringify({ path, name: displayName, type: 'pdf' }));
        } catch {}
    },

    close() {
        if (!this.activePath) return;
        try {
            const raw = localStorage.getItem('pouchstream:lastOpenedFile');
            if (raw) {
                const obj = JSON.parse(raw);
                if (obj && obj.path === this.activePath && obj.type === 'pdf') {
                    localStorage.removeItem('pouchstream:lastOpenedFile');
                }
            }
        } catch {}
        this.activePath = null;

        const pdfView = document.getElementById('contentPdfView');
        const workspaceView = document.getElementById('workspaceView');
        const toolbar = document.getElementById('portalToolbar');
        const frame = document.getElementById('pdfFrame');

        if (frame) {
            frame.src = 'about:blank';
        }
        if (pdfView) {
            pdfView.classList.add('d-none');
            pdfView.classList.remove('d-flex');
        }
        if (workspaceView) {
            workspaceView.classList.remove('d-none');
        }
        if (toolbar) {
            toolbar.classList.remove('d-none');
        }
    }
};
