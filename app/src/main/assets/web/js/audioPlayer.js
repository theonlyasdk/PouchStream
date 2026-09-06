/**
 * PouchStream Dedicated Audio Player Module
 */
import { State } from './state.js';
import { UI } from './ui.js';

export const AudioPlayer = {
    audio: null,
    currentPath: null,
    currentName: null,
    loopMode: 'off', // 'off', 'all', 'one'
    playlist: [],
    currentIndex: -1,
    isSeeking: false,
    lastNonZeroVolume: 1,

    // Visualizer state & configurable parameters
    visualizerCanvas: null,
    visualizerCtx: null,
    audioContext: null,
    analyser: null,
    sourceNode: null,
    visualizerAnimId: null,
    isVisualizerOpen: false,
    openVisTimeout: null,
    closeVisTimeout: null,
    visBarCount: 90, // 45, 64, 90, 128, 180
    visConjoined: false,
    visBarType: 'mirrored', // 'mirrored', 'bottom', 'top_down', 'line'
    visColor: 'white', // 'white', 'purple', 'blue', 'rainbow', 'gradient_fire', 'green'
    visSpeed: 'normal', // 'smooth', 'normal', 'fast', 'ultra'

    init() {
        this.audio = document.getElementById('audioPlayerElement');
        if (!this.audio) return;

        this.visualizerCanvas = document.getElementById('audioVisualizerCanvas');
        if (this.visualizerCanvas) {
            this.visualizerCtx = this.visualizerCanvas.getContext('2d');
        }

        const btnPlayPause = document.getElementById('btnAudioPlayPause');
        const btnPrev = document.getElementById('btnAudioPrev');
        const btnNext = document.getElementById('btnAudioNext');
        const btnRewind = document.getElementById('btnAudioRewind');
        const btnForward = document.getElementById('btnAudioForward');
        const btnLoop = document.getElementById('btnAudioLoop');
        const btnMute = document.getElementById('btnAudioMute');
        const btnClose = document.getElementById('btnAudioClose');
        const volumeSlider = document.getElementById('audioVolumeSlider');
        const progressContainer = document.getElementById('audioProgressContainer');
        const iconBox = document.getElementById('audioIconBox');
        const trackInfoClickable = document.getElementById('audioTrackInfoClickable');

        if (btnPlayPause) {
            btnPlayPause.addEventListener('click', (e) => {
                e.currentTarget.blur();
                this.togglePlay();
            });
        }

        // Global keyboard shortcuts for Audio Player (Space / K to play/pause)
        window.addEventListener('keydown', (e) => {
            const isSpace = e.code === 'Space' || e.key === ' ' || e.keyCode === 32;
            const isK = (e.key === 'k' || e.key === 'K') && !e.ctrlKey && !e.metaKey && !e.altKey;
            if (isSpace || isK) {
                const activeEl = document.activeElement;
                if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT' || activeEl.isContentEditable)) {
                    return;
                }
                if (document.querySelector('.modal.show')) {
                    return;
                }
                const videoView = document.getElementById('contentVideoView');
                if (videoView && !videoView.classList.contains('d-none')) {
                    return;
                }
                if (this.audio && this.currentPath) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (activeEl && activeEl.tagName === 'BUTTON') {
                        activeEl.blur();
                    }
                    this.togglePlay();
                }
            }
        }, true);
        if (btnPrev) {
            btnPrev.addEventListener('click', () => this.playPrevious());
        }
        if (btnNext) {
            btnNext.addEventListener('click', () => this.playNext());
        }
        if (btnRewind) {
            btnRewind.addEventListener('click', () => this.seekDelta(-10));
        }
        if (btnForward) {
            btnForward.addEventListener('click', () => this.seekDelta(10));
        }
        if (btnLoop) {
            btnLoop.addEventListener('click', () => this.toggleLoop());
        }
        if (btnMute) {
            btnMute.addEventListener('click', () => this.toggleMute());
        }
        if (btnClose) {
            btnClose.addEventListener('click', () => this.stop());
        }
        // Click on icon / track info toggles visualizer (opens or dismisses)
        if (iconBox) {
            iconBox.addEventListener('click', () => this.toggleVisualizer());
        }
        if (trackInfoClickable) {
            trackInfoClickable.addEventListener('click', () => this.toggleVisualizer());
        }
        // Visualizer controls & Options menu
        this.initVisualizerControls();

        if (volumeSlider) {
            const savedVol = localStorage.getItem('player.audio:volume');
            if (savedVol !== null) {
                const vol = parseFloat(savedVol);
                this.audio.volume = isNaN(vol) ? 1 : Math.max(0, Math.min(1, vol));
                volumeSlider.value = this.audio.volume;
                if (this.audio.volume > 0) this.lastNonZeroVolume = this.audio.volume;
            }
            volumeSlider.addEventListener('input', (e) => {
                const vol = parseFloat(e.target.value);
                this.audio.volume = vol;
                this.audio.muted = false;
                if (vol > 0) this.lastNonZeroVolume = vol;
                localStorage.setItem('player.audio:volume', vol);
                this.updateVolumeIcon();
            });
        }

        if (progressContainer) {
            const getClientX = (e) => {
                if (e.touches && e.touches.length > 0) return e.touches[0].clientX;
                if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0].clientX;
                return e.clientX;
            };

            const handleSeek = (e) => {
                if (!this.audio.duration) return;
                const rect = progressContainer.getBoundingClientRect();
                const clientX = getClientX(e);
                const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
                this.audio.currentTime = pos * this.audio.duration;
                this.updateProgress();
            };

            // Mouse scrub
            progressContainer.addEventListener('mousedown', (e) => {
                this.isSeeking = true;
                handleSeek(e);
                const onMouseMove = (ev) => {
                    if (this.isSeeking) handleSeek(ev);
                };
                const onMouseUp = () => {
                    this.isSeeking = false;
                    window.removeEventListener('mousemove', onMouseMove);
                    window.removeEventListener('mouseup', onMouseUp);
                };
                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
            });

            // Touch scrub for mobile
            progressContainer.addEventListener('touchstart', (e) => {
                this.isSeeking = true;
                handleSeek(e);
                const onTouchMove = (ev) => {
                    if (this.isSeeking) handleSeek(ev);
                };
                const onTouchEnd = () => {
                    this.isSeeking = false;
                    window.removeEventListener('touchmove', onTouchMove);
                    window.removeEventListener('touchend', onTouchEnd);
                };
                window.addEventListener('touchmove', onTouchMove, { passive: true });
                window.addEventListener('touchend', onTouchEnd, { passive: true });
            }, { passive: true });
        }

        this.audio.addEventListener('timeupdate', () => {
            if (!this.isSeeking) this.updateProgress();
        });

        this.audio.addEventListener('progress', () => {
            this.updateBuffered();
        });

        this.audio.addEventListener('play', () => {
            this.updatePlayState(true);
        });

        this.audio.addEventListener('pause', () => {
            this.updatePlayState(false);
        });

        this.audio.addEventListener('ended', () => {
            this.handleTrackEnded();
        });

        this.audio.addEventListener('error', (e) => {
            console.error('Audio playback error:', e);
            UI.showToast('Audio Error', 'Failed to play audio stream', 'danger');
            this.updatePlayState(false);
        });
    },

    updatePlaylist() {
        if (!this.playlist || this.playlist.length === 0) {
            const items = State.getFilteredItems();
            this.playlist = items.filter(i => UI.isAudio(i));
        }
        this.currentIndex = this.playlist.findIndex(i => i.path === this.currentPath);
    },

    play(path, name) {
        if (!this.audio) return;

        // If clicking currently active track, toggle play/pause
        if (this.currentPath === path) {
            this.togglePlay();
            return;
        }

        // Pause video player if active
        const videoEl = document.getElementById('videoPlayer');
        if (videoEl && !videoEl.paused) {
            videoEl.pause();
        }

        this.currentPath = path;
        this.currentName = name || path.split('/').pop();

        // Check if the played track belongs to currently filtered items
        const items = State.getFilteredItems();
        const currentFolderAudio = items.filter(i => UI.isAudio(i));
        if (currentFolderAudio.some(i => i.path === path)) {
            this.playlist = currentFolderAudio;
        } else if (!this.playlist.some(i => i.path === path)) {
            this.playlist = [{ path, name: this.currentName, isDirectory: false }];
        }
        this.currentIndex = this.playlist.findIndex(i => i.path === this.currentPath);

        const bar = document.getElementById('bottomAudioPlayer');
        if (bar) {
            bar.classList.remove('d-none');
            bar.classList.add('d-flex');
            void bar.offsetHeight;
            requestAnimationFrame(() => {
                bar.classList.add('show');
            });
        }

        const titleEl = document.getElementById('audioTrackTitle');
        const subEl = document.getElementById('audioTrackSub');
        const dlBtn = document.getElementById('btnAudioDownload');

        if (titleEl) titleEl.textContent = this.currentName;
        if (subEl) subEl.textContent = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : 'Root Directory';
        if (dlBtn) {
            dlBtn.href = `/api/stream?path=${encodeURIComponent(path)}&download=true`;
            dlBtn.download = this.currentName;
        }
        // Sync visualizer header if open
        const visTitle = document.getElementById('audioVisualizerTitle');
        const visDl = document.getElementById('btnAudioVisualizerDownload');
        if (visTitle) visTitle.textContent = this.currentName;
        if (visDl) {
            visDl.href = `/api/stream?path=${encodeURIComponent(path)}&download=true`;
            visDl.download = this.currentName;
        }

        this.audio.src = `/api/stream?path=${encodeURIComponent(path)}`;
        this.audio.currentTime = 0;
        this.audio.play().catch(e => {
            console.warn('Autoplay prevented or interrupted:', e);
        });

        this.updatePlayState(true);
        this.updateVolumeIcon();
        this.ensureVisualizerAudioContext();
    },

    togglePlay() {
        if (!this.audio || !this.currentPath) return;
        if (this.audio.paused) {
            const videoEl = document.getElementById('videoPlayer');
            if (videoEl && !videoEl.paused) videoEl.pause();
            this.audio.play().catch(console.error);
        } else {
            this.audio.pause();
        }
    },

    stop() {
        if (!this.audio) return;
        this.audio.pause();
        this.audio.currentTime = 0;
        this.audio.removeAttribute('src');
        this.currentPath = null;
        this.currentName = null;

        this.closeVisualizer(true);
        const bar = document.getElementById('bottomAudioPlayer');
        if (bar) {
            bar.classList.remove('show');
            setTimeout(() => {
                bar.classList.add('d-none');
                bar.classList.remove('d-flex');
            }, 380);
        }
        this.stopVisualizer();
    },

    playNext() {
        this.updatePlaylist();
        if (this.playlist.length === 0) return;
        let nextIdx = this.currentIndex + 1;
        if (nextIdx >= this.playlist.length) {
            nextIdx = 0; // wrap around
        }
        const nextItem = this.playlist[nextIdx];
        if (nextItem) {
            this.play(nextItem.path, nextItem.name);
        }
    },

    playPrevious() {
        this.updatePlaylist();
        if (this.playlist.length === 0) return;
        let prevIdx = this.currentIndex - 1;
        if (prevIdx < 0) {
            prevIdx = this.playlist.length - 1; // wrap around
        }
        const prevItem = this.playlist[prevIdx];
        if (prevItem) {
            this.play(prevItem.path, prevItem.name);
        }
    },

    seekDelta(seconds) {
        if (!this.audio || !this.audio.duration) return;
        this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, this.audio.currentTime + seconds));
    },

    toggleLoop() {
        const icon = document.getElementById('iconAudioLoop');
        const btn = document.getElementById('btnAudioLoop');
        if (this.loopMode === 'off') {
            this.loopMode = 'all';
            if (btn) btn.title = 'Repeat: All';
            if (icon) {
                icon.style.color = '#a855f7';
                icon.name = 'repeat';
            }
            UI.showToast('Loop Mode', 'Repeat playlist: On', 'primary');
        } else if (this.loopMode === 'all') {
            this.loopMode = 'one';
            if (btn) btn.title = 'Repeat: Current Track';
            if (icon) {
                icon.style.color = '#10b981';
                icon.name = 'repeat-outline';
            }
            UI.showToast('Loop Mode', 'Repeat current track: On', 'primary');
        } else {
            this.loopMode = 'off';
            if (btn) btn.title = 'Repeat: Off';
            if (icon) {
                icon.style.color = '';
                icon.name = 'repeat';
            }
            UI.showToast('Loop Mode', 'Repeat: Off', 'secondary');
        }
    },

    handleTrackEnded() {
        if (this.loopMode === 'one') {
            this.audio.currentTime = 0;
            this.audio.play().catch(console.error);
            return;
        }
        this.updatePlaylist();
        if (this.currentIndex < this.playlist.length - 1) {
            this.playNext();
        } else if (this.loopMode === 'all') {
            this.playNext(); // wraps to 0
        } else {
            this.updatePlayState(false);
        }
    },

    toggleMute() {
        if (!this.audio) return;
        if (this.audio.muted) {
            this.audio.muted = false;
            if (this.audio.volume === 0) {
                this.audio.volume = this.lastNonZeroVolume || 0.5;
            }
        } else {
            if (this.audio.volume > 0) this.lastNonZeroVolume = this.audio.volume;
            this.audio.muted = true;
        }
        this.updateVolumeIcon();
    },

    updateVolumeIcon() {
        const icon = document.getElementById('iconAudioVolume');
        const iconPopup = document.getElementById('iconAudioVolumePopup');
        const slider = document.getElementById('audioVolumeSlider');
        const lblPercent = document.getElementById('lblAudioVolumePercent');
        let iconName = 'volume-high';
        if (this.audio.muted || this.audio.volume === 0) {
            iconName = 'volume-mute';
            if (slider) slider.value = 0;
        } else if (this.audio.volume < 0.5) {
            iconName = 'volume-low';
            if (slider) slider.value = this.audio.volume;
        } else {
            iconName = 'volume-high';
            if (slider) slider.value = this.audio.volume;
        }
        if (icon) icon.name = iconName;
        if (iconPopup) iconPopup.name = iconName;
        if (lblPercent) lblPercent.textContent = `${Math.round((this.audio.muted ? 0 : this.audio.volume) * 100)}%`;
    },

    updatePlayState(isPlaying) {
        const icon = document.getElementById('iconAudioPlayPause');
        if (icon) {
            icon.name = isPlaying ? 'pause' : 'play';
        }
        const visIcon = document.getElementById('iconAudioVisualizerPlayPause');
        if (visIcon) visIcon.name = isPlaying ? 'pause' : 'play';
        const visBtnText = document.querySelector('#btnAudioVisualizerPlayPause span');
        if (visBtnText) visBtnText.textContent = isPlaying ? 'Pause' : 'Play';
    },

    updateProgress() {
        if (!this.audio) return;
        const cur = this.audio.currentTime || 0;
        const dur = this.audio.duration || 0;
        const pct = dur > 0 ? (cur / dur) * 100 : 0;

        const playedBar = document.getElementById('audioProgressPlayed');
        const thumb = document.getElementById('audioProgressThumb');
        const curLabel = document.getElementById('audioCurrentTime');
        const durLabel = document.getElementById('audioDuration');
        const visPlayed = document.getElementById('audioVisualizerProgressPlayed');
        const visThumb = document.getElementById('audioVisualizerProgressThumb');
        const visCur = document.getElementById('audioVisualizerCurrentTime');
        const visDur = document.getElementById('audioVisualizerDuration');
        const visTimeDisplay = document.getElementById('audioVisualizerTimeDisplay');

        if (playedBar) playedBar.style.width = `${pct}%`;
        if (thumb) thumb.style.left = `${pct}%`;
        if (curLabel) curLabel.textContent = this.formatTime(cur);
        if (durLabel) durLabel.textContent = this.formatTime(dur);
        if (visPlayed) visPlayed.style.width = `${pct}%`;
        if (visThumb) visThumb.style.left = `${pct}%`;
        if (visCur) visCur.textContent = this.formatTime(cur);
        if (visDur) visDur.textContent = this.formatTime(dur);
        if (visTimeDisplay) visTimeDisplay.textContent = `${this.formatTime(cur)} / ${this.formatTime(dur)}`;
    },

    updateBuffered() {
        if (!this.audio || !this.audio.duration) return;
        const buf = this.audio.buffered;
        if (buf && buf.length > 0) {
            const end = buf.end(buf.length - 1);
            const pct = (end / this.audio.duration) * 100;
            const bufBar = document.getElementById('audioProgressBuffered');
            if (bufBar) bufBar.style.width = `${pct}%`;
            const visBuf = document.getElementById('audioVisualizerProgressBuffered');
            if (visBuf) visBuf.style.width = `${pct}%`;
        }
    },

    formatTime(sec) {
        if (isNaN(sec) || sec < 0) return '0:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    },

    toggleVisualizer() {
        if (this.isVisualizerOpen) {
            this.closeVisualizer();
        } else {
            this.openVisualizer();
        }
    },

    initVisualizerControls() {
        const btnCloseVis = document.getElementById('btnCloseAudioVisualizer');
        if (btnCloseVis) btnCloseVis.addEventListener('click', () => this.closeVisualizer());
        
        // Close visualizer on Esc
        window.addEventListener('keydown', (e) => {
            if (this.isVisualizerOpen && e.key === 'Escape') {
                this.closeVisualizer();
            }
        });
        
        // Responsive canvas resize
        window.addEventListener('resize', () => {
            if (this.isVisualizerOpen) {
                this.resizeVisualizerCanvas();
            }
        });

        // Load saved visualizer preferences
        try {
            const savedCount = parseInt(localStorage.getItem('player.audio.vis:barCount'), 10);
            if (!isNaN(savedCount) && [45, 64, 90, 128, 180].includes(savedCount)) {
                this.visBarCount = savedCount;
            }
            const savedConjoined = localStorage.getItem('player.audio.vis:conjoined');
            if (savedConjoined !== null) {
                this.visConjoined = savedConjoined === 'true';
            }
            const savedType = localStorage.getItem('player.audio.vis:barType');
            if (savedType && ['mirrored', 'bottom', 'top_down', 'line'].includes(savedType)) {
                this.visBarType = savedType;
            }
            const savedColor = localStorage.getItem('player.audio.vis:color');
            if (savedColor && ['white', 'purple', 'blue', 'rainbow', 'gradient_fire', 'green'].includes(savedColor)) {
                this.visColor = savedColor;
            }
            const savedSpeed = localStorage.getItem('player.audio.vis:speed');
            if (savedSpeed && ['smooth', 'normal', 'fast', 'ultra'].includes(savedSpeed)) {
                this.visSpeed = savedSpeed;
            }
        } catch (_) {}

        // 1. Bar Count / Width Controls
        const selectBarCount = document.getElementById('selectVisBarCount');
        const lblBarWidth = document.getElementById('lblVisBarWidth');
        const barCounts = [45, 64, 90, 128, 180];
        const barLabels = { 45: 'Wide (45)', 64: 'Medium (64)', 90: 'Normal (90)', 128: 'Dense (128)', 180: 'Ultra Dense (180)' };

        const updateBarCountUI = (count) => {
            this.visBarCount = count;
            if (selectBarCount) selectBarCount.value = count.toString();
            if (lblBarWidth) lblBarWidth.textContent = barLabels[count] || `${count} bars`;
            try { localStorage.setItem('player.audio.vis:barCount', count.toString()); } catch (_) {}
        };

        if (selectBarCount) {
            selectBarCount.value = this.visBarCount.toString();
            if (lblBarWidth) lblBarWidth.textContent = barLabels[this.visBarCount] || `${this.visBarCount} bars`;
            selectBarCount.addEventListener('change', (e) => {
                updateBarCountUI(parseInt(e.target.value, 10));
            });
        }

        const btnDecWidth = document.getElementById('btnVisWidthDec');
        if (btnDecWidth) {
            btnDecWidth.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const idx = barCounts.indexOf(this.visBarCount);
                if (idx > 0) updateBarCountUI(barCounts[idx - 1]);
            });
        }

        const btnIncWidth = document.getElementById('btnVisWidthInc');
        if (btnIncWidth) {
            btnIncWidth.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const idx = barCounts.indexOf(this.visBarCount);
                if (idx !== -1 && idx < barCounts.length - 1) updateBarCountUI(barCounts[idx + 1]);
            });
        }

        // 2. Conjoined Bars Switch
        const switchConjoined = document.getElementById('switchVisConjoined');
        if (switchConjoined) {
            switchConjoined.checked = this.visConjoined;
            switchConjoined.addEventListener('change', (e) => {
                this.visConjoined = e.target.checked;
                try { localStorage.setItem('player.audio.vis:conjoined', this.visConjoined ? 'true' : 'false'); } catch (_) {}
            });
        }

        // 3. Bar Type (Waveform mode)
        const selectBarType = document.getElementById('selectVisBarType');
        const barTypes = ['mirrored', 'bottom', 'top_down', 'line'];
        const updateBarTypeUI = (type) => {
            if (!barTypes.includes(type)) return;
            this.visBarType = type;
            if (selectBarType) selectBarType.value = type;
            try { localStorage.setItem('player.audio.vis:barType', type); } catch (_) {}
        };

        if (selectBarType) {
            selectBarType.value = this.visBarType;
            selectBarType.addEventListener('change', (e) => updateBarTypeUI(e.target.value));
        }

        const btnPrevType = document.getElementById('btnPrevVisType');
        if (btnPrevType) {
            btnPrevType.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const idx = barTypes.indexOf(this.visBarType);
                const nextIdx = (idx - 1 + barTypes.length) % barTypes.length;
                updateBarTypeUI(barTypes[nextIdx]);
            });
        }

        const btnNextType = document.getElementById('btnNextVisType');
        if (btnNextType) {
            btnNextType.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const idx = barTypes.indexOf(this.visBarType);
                const nextIdx = (idx + 1) % barTypes.length;
                updateBarTypeUI(barTypes[nextIdx]);
            });
        }

        // 4. Color Palette
        const selectColor = document.getElementById('selectVisColor');
        const colorList = ['white', 'purple', 'blue', 'rainbow', 'gradient_fire', 'green'];
        const updateColorUI = (col) => {
            if (!colorList.includes(col)) return;
            this.visColor = col;
            if (selectColor) selectColor.value = col;
            try { localStorage.setItem('player.audio.vis:color', col); } catch (_) {}
        };

        if (selectColor) {
            selectColor.value = this.visColor;
            selectColor.addEventListener('change', (e) => updateColorUI(e.target.value));
        }

        const btnPrevColor = document.getElementById('btnPrevVisColor');
        if (btnPrevColor) {
            btnPrevColor.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const idx = colorList.indexOf(this.visColor);
                const nextIdx = (idx - 1 + colorList.length) % colorList.length;
                updateColorUI(colorList[nextIdx]);
            });
        }

        const btnNextColor = document.getElementById('btnNextVisColor');
        if (btnNextColor) {
            btnNextColor.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const idx = colorList.indexOf(this.visColor);
                const nextIdx = (idx + 1) % colorList.length;
                updateColorUI(colorList[nextIdx]);
            });
        }

        // 5. Speed / Animation Parameters
        const selectSpeed = document.getElementById('selectVisSpeed');
        if (selectSpeed) {
            selectSpeed.value = this.visSpeed;
            selectSpeed.addEventListener('change', (e) => {
                this.visSpeed = e.target.value;
                if (this.analyser) {
                    this.applyAnalyserSmoothing();
                }
                try { localStorage.setItem('player.audio.vis:speed', this.visSpeed); } catch (_) {}
            });
        }
    },

    applyAnalyserSmoothing() {
        if (!this.analyser) return;
        switch (this.visSpeed) {
            case 'smooth':
                this.analyser.smoothingTimeConstant = 0.88;
                break;
            case 'fast':
                this.analyser.smoothingTimeConstant = 0.55;
                break;
            case 'ultra':
                this.analyser.smoothingTimeConstant = 0.2;
                break;
            case 'normal':
            default:
                this.analyser.smoothingTimeConstant = 0.78;
                break;
        }
    },

    openVisualizer() {
        if (!this.currentPath) return;
        const view = document.getElementById('contentAudioVisualizer');
        const workspace = document.getElementById('workspaceView');
        const toolbar = document.getElementById('portalToolbar');
        if (!view) return;

        if (this.closeVisTimeout) {
            clearTimeout(this.closeVisTimeout);
            this.closeVisTimeout = null;
        }

        // Hide workspace/toolbar so visualizer occupies the main space above the bottom bar
        if (workspace) workspace.classList.add('d-none');
        if (toolbar) toolbar.classList.add('d-none');

        // Show view and trigger slide-in animation
        view.classList.remove('d-none', 'closing');
        view.classList.add('show');
        this.isVisualizerOpen = true;

        // Sync visualizer title
        const t2 = document.getElementById('audioVisualizerTitle');
        if (t2) t2.textContent = this.currentName || 'Audio Visualizer';
        
        this.updatePlayState(!this.audio.paused);
        this.updateProgress();
        this.ensureVisualizerAudioContext();
        this.startVisualizer();

        // Ensure canvas fills correctly to container box
        requestAnimationFrame(() => this.resizeVisualizerCanvas());
        setTimeout(() => this.resizeVisualizerCanvas(), 50);
        setTimeout(() => this.resizeVisualizerCanvas(), 320);
    },

    closeVisualizer(immediate = false) {
        const view = document.getElementById('contentAudioVisualizer');
        const workspace = document.getElementById('workspaceView');
        const toolbar = document.getElementById('portalToolbar');
        if (!view) return;

        if (this.closeVisTimeout) {
            clearTimeout(this.closeVisTimeout);
            this.closeVisTimeout = null;
        }

        this.isVisualizerOpen = false;
        this.stopVisualizer();

        if (immediate) {
            view.classList.remove('show', 'closing');
            view.classList.add('d-none');
            if (workspace) workspace.classList.remove('d-none');
            if (toolbar) toolbar.classList.remove('d-none');
            return;
        }

        // Trigger smooth slide down animation
        view.classList.remove('show');
        view.classList.add('closing');

        this.closeVisTimeout = setTimeout(() => {
            view.classList.remove('closing');
            view.classList.add('d-none');
            if (workspace) workspace.classList.remove('d-none');
            if (toolbar) toolbar.classList.remove('d-none');
            this.closeVisTimeout = null;
        }, 200);
    },

    resizeVisualizerCanvas() {
        if (!this.visualizerCanvas) return;
        const canvas = this.visualizerCanvas;
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const dpr = window.devicePixelRatio || 1;
        const w = Math.floor(rect.width * dpr);
        const h = Math.floor(rect.height * dpr);
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }
    },

    ensureVisualizerAudioContext() {
        if (!this.audio || this.audioContext) return;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            this.audioContext = new AudioCtx();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 512;
            this.applyAnalyserSmoothing();
            this.sourceNode = this.audioContext.createMediaElementSource(this.audio);
            this.sourceNode.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);
        } catch (e) {
            console.warn('Visualizer AudioContext failed:', e);
        }
    },

    getBarColor(ctx, index, total, height, value) {
        switch (this.visColor) {
            case 'purple':
                return '#a855f7';
            case 'blue':
                return '#3b82f6';
            case 'green':
                return '#10b981';
            case 'gradient_fire': {
                const grad = ctx.createLinearGradient(0, height, 0, 0);
                grad.addColorStop(0, '#f97316');
                grad.addColorStop(0.6, '#ef4444');
                grad.addColorStop(1, '#fbbf24');
                return grad;
            }
            case 'rainbow': {
                const hue = Math.floor((index / total) * 320);
                return `hsl(${hue}, 85%, 65%)`;
            }
            case 'white':
            default:
                return '#e5e7eb';
        }
    },

    startVisualizer() {
        if (!this.visualizerCtx || !this.analyser) {
            // Fallback fake waveform if analyser not available
            this.drawFakeWaveform();
            return;
        }
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(() => {});
        }
        const canvas = this.visualizerCanvas;
        const ctx = this.visualizerCtx;
        const analyser = this.analyser;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        const draw = () => {
            if (!this.isVisualizerOpen) return;
            this.visualizerAnimId = requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArray);
            
            const width = canvas.width;
            const height = canvas.height;
            if (!width || !height) return;

            // Flush minimalistic background
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, width, height);

            const barCount = this.visBarCount || 90;
            const step = Math.max(1, Math.floor(bufferLength / barCount));
            const barWidth = this.visConjoined ? (width / barCount) : ((width / barCount) * 0.72);
            const gap = this.visConjoined ? 0 : ((width / barCount) * 0.28);
            const type = this.visBarType || 'mirrored';

            if (type === 'line') {
                ctx.beginPath();
                ctx.lineWidth = Math.max(2, Math.floor(width / barCount));
                ctx.strokeStyle = this.getBarColor(ctx, 0, barCount, height, 200);
                let x = 0;
                for (let i = 0; i < barCount; i++) {
                    const idx = i * step;
                    let value = dataArray[idx] || 0;
                    if (this.audio.paused) {
                        value = value * 0.15 + 8 + Math.sin(Date.now() * 0.001 + i) * 4;
                    }
                    const barHeight = Math.max(4, (value / 255) * height * 0.85);
                    const y = (height - barHeight) / 2;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                    x += barWidth + gap;
                }
                ctx.stroke();
                return;
            }

            let x = 0;
            for (let i = 0; i < barCount; i++) {
                const idx = i * step;
                let value = dataArray[idx] || 0;
                if (this.audio.paused) {
                    value = value * 0.15 + 8 + Math.sin(Date.now() * 0.001 + i) * 4;
                }
                const barHeight = Math.max(4, (value / 255) * height * 0.85);
                ctx.fillStyle = this.getBarColor(ctx, i, barCount, height, value);

                if (type === 'bottom') {
                    // Standard bottom-up bars
                    const y = height - barHeight;
                    ctx.fillRect(x, y, barWidth, barHeight);
                } else if (type === 'top_down') {
                    // Top-down bars
                    ctx.fillRect(x, 0, barWidth, barHeight);
                } else {
                    // Mirrored (center out)
                    const y = (height - barHeight) / 2;
                    ctx.fillRect(x, y, barWidth, barHeight);
                }
                x += barWidth + gap;
            }
        };
        draw();
    },

    drawFakeWaveform() {
        if (!this.visualizerCtx || !this.visualizerCanvas) return;
        const canvas = this.visualizerCanvas;
        const ctx = this.visualizerCtx;
        
        const draw = () => {
            if (!this.isVisualizerOpen) return;
            this.visualizerAnimId = requestAnimationFrame(draw);
            
            const width = canvas.width;
            const height = canvas.height;
            if (!width || !height) return;

            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, width, height);

            const barCount = this.visBarCount || 90;
            const barWidth = this.visConjoined ? (width / barCount) : ((width / barCount) * 0.72);
            const gap = this.visConjoined ? 0 : ((width / barCount) * 0.28);
            const type = this.visBarType || 'mirrored';
            const time = Date.now() * (this.visSpeed === 'fast' ? 0.0035 : this.visSpeed === 'ultra' ? 0.005 : this.visSpeed === 'smooth' ? 0.0012 : 0.002);

            if (type === 'line') {
                ctx.beginPath();
                ctx.lineWidth = Math.max(2, Math.floor(width / barCount));
                ctx.strokeStyle = this.getBarColor(ctx, 0, barCount, height, 200);
                let x = 0;
                for (let i = 0; i < barCount; i++) {
                    const base = 20 + Math.sin(i * 0.3 + time) * 15 + Math.sin(i * 0.7 - time * 0.5) * 10;
                    const barHeight = this.audio && !this.audio.paused ? Math.max(6, base + Math.sin(i * 0.5 + time * 2) * 20) : Math.max(4, 12 + Math.sin(i * 0.4 + time * 0.5) * 6);
                    const y = (height - barHeight) / 2;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                    x += barWidth + gap;
                }
                ctx.stroke();
                return;
            }

            let x = 0;
            for (let i = 0; i < barCount; i++) {
                const base = 20 + Math.sin(i * 0.3 + time) * 15 + Math.sin(i * 0.7 - time * 0.5) * 10;
                const barHeight = this.audio && !this.audio.paused ? Math.max(6, base + Math.sin(i * 0.5 + time * 2) * 20) : Math.max(4, 12 + Math.sin(i * 0.4 + time * 0.5) * 6);
                ctx.fillStyle = this.getBarColor(ctx, i, barCount, height, barHeight);

                if (type === 'bottom') {
                    const y = height - barHeight;
                    ctx.fillRect(x, y, barWidth, barHeight);
                } else if (type === 'top_down') {
                    ctx.fillRect(x, 0, barWidth, barHeight);
                } else {
                    const y = (height - barHeight) / 2;
                    ctx.fillRect(x, y, barWidth, barHeight);
                }
                x += barWidth + gap;
            }
        };
        draw();
    },

    stopVisualizer() {
        if (this.visualizerAnimId) {
            cancelAnimationFrame(this.visualizerAnimId);
            this.visualizerAnimId = null;
        }
    }
};
