/**
 * PouchStream In-Editor Module (Monaco Editor Integration)
 */
import { Api } from './api.js';
import { UI } from './ui.js';

export const Editor = {
    activePath: null,
    modalInstance: null,
    isDirty: false,
    onSaveSuccess: null,
    monacoInstance: null,
    monacoLoadingPromise: null,

    getLanguageForPath(path) {
        if (!path) return 'plaintext';
        const parts = path.split('.');
        if (parts.length <= 1) return 'plaintext';
        const ext = parts.pop().toLowerCase();
        const map = {
            'js': 'javascript',
            'mjs': 'javascript',
            'cjs': 'javascript',
            'json': 'json',
            'html': 'html',
            'htm': 'html',
            'css': 'css',
            'scss': 'scss',
            'less': 'less',
            'ts': 'typescript',
            'py': 'python',
            'java': 'java',
            'kt': 'kotlin',
            'xml': 'xml',
            'svg': 'xml',
            'md': 'markdown',
            'markdown': 'markdown',
            'sh': 'shell',
            'bash': 'shell',
            'yaml': 'yaml',
            'yml': 'yaml',
            'sql': 'sql',
            'c': 'c',
            'cpp': 'cpp',
            'h': 'cpp',
            'hpp': 'cpp',
            'cs': 'csharp',
            'go': 'go',
            'rs': 'rust',
            'php': 'php',
            'rb': 'ruby',
            'bat': 'bat',
            'cmd': 'bat',
            'ps1': 'powershell',
            'ini': 'ini',
            'properties': 'ini',
            'conf': 'ini',
            'log': 'plaintext',
            'txt': 'plaintext'
        };
        return map[ext] || 'plaintext';
    },

    async ensureMonaco() {
        if (window.monaco && window.monaco.editor) {
            return window.monaco;
        }
        if (this.monacoLoadingPromise) {
            return this.monacoLoadingPromise;
        }

        // Configure Worker proxy for cross-origin CDN compatibility
        if (!window.MonacoEnvironment) {
            window.MonacoEnvironment = {
                getWorkerUrl: function (workerId, label) {
                    const proxy = `self.MonacoEnvironment = { baseUrl: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/' }; importScripts('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/base/worker/workerMain.js');`;
                    return `data:text/javascript;charset=utf-8,${encodeURIComponent(proxy)}`;
                }
            };
        }

        this.monacoLoadingPromise = new Promise((resolve, reject) => {
            if (typeof window.require !== 'undefined') {
                window.require.config({
                    paths: {
                        'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs'
                    }
                });

                window.require(['vs/editor/editor.main'], () => {
                    // Define True OLED Black Monaco Theme
                    window.monaco.editor.defineTheme('oled-black', {
                        base: 'vs-dark',
                        inherit: true,
                        rules: [],
                        colors: {
                            'editor.background': '#000000',
                            'editorGutter.background': '#000000',
                            'editorLineNumber.foreground': '#4b5563',
                            'editorLineNumber.activeForeground': '#9ca3af',
                            'editor.lineHighlightBackground': '#0d0d0d',
                            'editorCursor.foreground': '#3b82f6',
                            'editor.selectionBackground': '#1e3a8a80',
                            'editor.inactiveSelectionBackground': '#1e293b60'
                        }
                    });
                    resolve(window.monaco);
                }, (err) => {
                    reject(err);
                });
            } else {
                reject(new Error('Monaco loader not found'));
            }
        });

        return this.monacoLoadingPromise;
    },

    currentFontSize: 13,
    currentTheme: 'oled-black',
    themes: ['oled-black', 'vs-dark', 'hc-black', 'vs', 'hc-light'],

    setFontSize(size) {
        const clamped = Math.min(32, Math.max(9, size));
        this.currentFontSize = clamped;
        const lbl = document.getElementById('lblEditorFontSize');
        if (lbl) lbl.textContent = `${clamped}px`;

        if (this.monacoInstance) {
            this.monacoInstance.updateOptions({ fontSize: clamped });
        }
        const textarea = document.getElementById('editorTextarea');
        if (textarea) {
            textarea.style.fontSize = `${clamped}px`;
        }
        try {
            localStorage.setItem('editor.monaco:font_size', clamped.toString());
        } catch (_) {}
    },

    setTheme(theme) {
        if (!this.themes.includes(theme)) return;
        this.currentTheme = theme;
        const select = document.getElementById('selectMonacoTheme');
        if (select && select.value !== theme) {
            select.value = theme;
        }
        if (window.monaco && window.monaco.editor) {
            window.monaco.editor.setTheme(theme);
        }
        try {
            localStorage.setItem('editor.monaco:theme', theme);
        } catch (_) {}
    },

    init(onSaveSuccess, onClose) {
        this.onSaveSuccess = onSaveSuccess;
        this.onCloseCallback = onClose;

        // Restore saved settings if available
        try {
            const savedSize = parseInt(localStorage.getItem('editor.monaco:font_size') || localStorage.getItem('pouchstream_editor_fontsize'), 10);
            if (!isNaN(savedSize) && savedSize >= 9 && savedSize <= 32) {
                this.currentFontSize = savedSize;
            }
            const savedTheme = localStorage.getItem('editor.monaco:theme') || localStorage.getItem('pouchstream_editor_theme');
            if (savedTheme && this.themes.includes(savedTheme)) {
                this.currentTheme = savedTheme;
            }
        } catch (_) {}

        const lbl = document.getElementById('lblEditorFontSize');
        if (lbl) lbl.textContent = `${this.currentFontSize}px`;

        const selectTheme = document.getElementById('selectMonacoTheme');
        if (selectTheme) {
            selectTheme.value = this.currentTheme;
            selectTheme.addEventListener('change', (e) => {
                this.setTheme(e.target.value);
            });
        }

        const btnPrevTheme = document.getElementById('btnPrevTheme');
        if (btnPrevTheme) {
            btnPrevTheme.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const idx = this.themes.indexOf(this.currentTheme);
                const nextIdx = (idx - 1 + this.themes.length) % this.themes.length;
                this.setTheme(this.themes[nextIdx]);
            });
        }

        const btnNextTheme = document.getElementById('btnNextTheme');
        if (btnNextTheme) {
            btnNextTheme.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const idx = this.themes.indexOf(this.currentTheme);
                const nextIdx = (idx + 1) % this.themes.length;
                this.setTheme(this.themes[nextIdx]);
            });
        }

        const btnDec = document.getElementById('btnFontSizeDec');
        if (btnDec) {
            btnDec.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.setFontSize(this.currentFontSize - 1);
            });
        }

        const btnInc = document.getElementById('btnFontSizeInc');
        if (btnInc) {
            btnInc.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.setFontSize(this.currentFontSize + 1);
            });
        }

        const btnSave = document.getElementById('btnEditorSave');
        if (btnSave) {
            btnSave.addEventListener('click', () => this.save());
        }

        const btnClose = document.getElementById('btnCloseEditor');
        if (btnClose) {
            btnClose.addEventListener('click', () => {
                this.close();
                if (this.onCloseCallback) this.onCloseCallback();
            });
        }

        const textarea = document.getElementById('editorTextarea');
        if (textarea) {
            textarea.addEventListener('input', () => {
                this.isDirty = true;
                this.updateStats();
            });
            textarea.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    this.save();
                }
            });
            textarea.addEventListener('wheel', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    if (e.deltaY < 0) {
                        this.setFontSize(this.currentFontSize + 1);
                    } else if (e.deltaY > 0) {
                        this.setFontSize(this.currentFontSize - 1);
                    }
                }
            }, { passive: false });
        }

        window.addEventListener('resize', () => {
            if (this.monacoInstance) {
                this.monacoInstance.layout();
            }
        });

        // Preload Monaco in background
        this.ensureMonaco().catch(e => {
            console.warn('Monaco preloading deferred:', e.message);
        });
    },

    close() {
        try {
            const raw = localStorage.getItem('pouchstream:lastOpenedFile');
            if (raw) {
                const obj = JSON.parse(raw);
                if (obj && obj.path === this.activePath && obj.type === 'editor') localStorage.removeItem('pouchstream:lastOpenedFile');
            }
        } catch {}
        const editorView = document.getElementById('contentEditorView');
        const workspaceView = document.getElementById('workspaceView');
        const toolbar = document.getElementById('portalToolbar');

        if (editorView) {
            editorView.classList.add('d-none');
            editorView.classList.remove('d-flex');
        }
        if (workspaceView) workspaceView.classList.remove('d-none');
        if (toolbar) toolbar.classList.remove('d-none');
    },

    async open(path, name) {
        this.activePath = path;
        this.isDirty = false;
        try { localStorage.setItem('pouchstream:lastOpenedFile', JSON.stringify({ path, name, type: 'editor' })); } catch {}

        const titleEl = document.getElementById('editorModalTitle');
        const pathEl = document.getElementById('editorModalPath');
        const container = document.getElementById('monacoEditorContainer');
        const textarea = document.getElementById('editorTextarea');
        const editorView = document.getElementById('contentEditorView');
        const workspaceView = document.getElementById('workspaceView');
        const toolbar = document.getElementById('portalToolbar');

        if (titleEl) titleEl.textContent = name;
        if (pathEl) pathEl.textContent = `/${path}`;

        const imageView = document.getElementById('contentImageView');
        const pdfView = document.getElementById('contentPdfView');
        if (imageView) {
            imageView.classList.add('d-none');
            imageView.classList.remove('d-flex');
        }
        if (pdfView) {
            pdfView.classList.add('d-none');
            pdfView.classList.remove('d-flex');
        }
        if (workspaceView) workspaceView.classList.add('d-none');
        if (toolbar) toolbar.classList.add('d-none');
        if (editorView) {
            editorView.classList.remove('d-none');
            editorView.classList.add('d-flex');
        }

        let content = '';
        try {
            const data = await Api.readFile(path);
            content = data.content || '';
        } catch (e) {
            UI.showToast('Editor Error', e.message, 'danger');
            return;
        }

        try {
            const monaco = await this.ensureMonaco();
            const language = this.getLanguageForPath(path);

            if (!this.monacoInstance && container) {
                this.monacoInstance = monaco.editor.create(container, {
                    value: content,
                    language: language,
                    theme: this.currentTheme,
                    automaticLayout: true,
                    fontSize: this.currentFontSize,
                    fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace",
                    minimap: { enabled: true },
                    scrollBeyondLastLine: false,
                    renderWhitespace: 'selection',
                    tabSize: 4,
                    wordWrap: 'on',
                    mouseWheelZoom: true
                });

                this.monacoInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                    this.save();
                });

                this.monacoInstance.onDidChangeModelContent(() => {
                    this.isDirty = true;
                    this.updateStats();
                });

                this.monacoInstance.onDidChangeCursorPosition(() => {
                    this.updateStats();
                });

                this.monacoInstance.onDidChangeConfiguration((e) => {
                    if (e.hasChanged(monaco.editor.EditorOption.fontSize)) {
                        const newSize = this.monacoInstance.getOption(monaco.editor.EditorOption.fontSize);
                        if (newSize && newSize !== this.currentFontSize) {
                            this.currentFontSize = newSize;
                            const lbl = document.getElementById('lblEditorFontSize');
                            if (lbl) lbl.textContent = `${newSize}px`;
                            try {
                                localStorage.setItem('pouchstream_editor_fontsize', newSize.toString());
                            } catch (_) {}
                        }
                    }
                });
            } else if (this.monacoInstance) {
                const oldModel = this.monacoInstance.getModel();
                const newModel = monaco.editor.createModel(content, language);
                this.monacoInstance.setModel(newModel);
                if (oldModel) oldModel.dispose();
                monaco.editor.setTheme(this.currentTheme);
                this.monacoInstance.updateOptions({ fontSize: this.currentFontSize, mouseWheelZoom: true });
            }

            if (container) container.classList.remove('d-none');
            if (textarea) textarea.classList.add('d-none');

            // Recalculate layout after modal animation finishes
            setTimeout(() => {
                if (this.monacoInstance) {
                    this.monacoInstance.layout();
                    this.monacoInstance.focus();
                }
            }, 120);

            this.updateStats();
        } catch (err) {
            console.warn('Fallback to standard textarea:', err);
            if (container) container.classList.add('d-none');
            if (textarea) {
                textarea.classList.remove('d-none');
                textarea.value = content;
                textarea.focus();
            }
            this.updateStats();
        }
    },

    async save() {
        if (!this.activePath) return;

        let content = '';
        if (this.monacoInstance) {
            content = this.monacoInstance.getValue();
        } else {
            const textarea = document.getElementById('editorTextarea');
            content = textarea ? textarea.value : '';
        }

        const btnSave = document.getElementById('btnEditorSave');
        const originalHtml = btnSave ? btnSave.innerHTML : '<ion-icon name="save-outline"></ion-icon> <span>Save File</span>';

        if (btnSave) {
            btnSave.disabled = true;
            btnSave.innerHTML = '<ion-icon name="sync-outline" class="spin-icon"></ion-icon> <span>Saving...</span>';
        }

        try {
            await Api.saveFile(this.activePath, content);
            this.isDirty = false;
            const time = new Date().toLocaleTimeString();

            if (btnSave) {
                btnSave.innerHTML = '<ion-icon name="checkmark-outline"></ion-icon> <span>Saved</span>';
                setTimeout(() => {
                    btnSave.innerHTML = originalHtml;
                }, 1800);
            }

            UI.showToast('Save Complete', `File saved to disk at ${time}`, 'success');

            if (this.onSaveSuccess) {
                this.onSaveSuccess();
            }
        } catch (e) {
            UI.showToast('Save Error', e.message, 'danger');
            if (btnSave) {
                btnSave.innerHTML = originalHtml;
            }
        } finally {
            if (btnSave) btnSave.disabled = false;
        }
    },

    updateStats() {
        const statsEl = document.getElementById('editorMetrics');
        if (!statsEl) return;

        if (this.monacoInstance) {
            const model = this.monacoInstance.getModel();
            if (model) {
                const lines = model.getLineCount();
                const chars = model.getValueLength();
                const pos = this.monacoInstance.getPosition();
                if (pos) {
                    statsEl.textContent = `Lines: ${lines} | Characters: ${chars} | Ln ${pos.lineNumber}, Col ${pos.column}`;
                } else {
                    statsEl.textContent = `Lines: ${lines} | Characters: ${chars}`;
                }
                return;
            }
        }

        const textarea = document.getElementById('editorTextarea');
        if (textarea) {
            const text = textarea.value;
            const lines = text.split('\n').length;
            const chars = text.length;
            statsEl.textContent = `Lines: ${lines} | Characters: ${chars}`;
        }
    }
};
