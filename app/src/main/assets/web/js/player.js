/**
 * PouchStream Custom Video Player Component Module
 */
import { Api } from './api.js';
import { State } from './state.js';
import { UI } from './ui.js';

export const Player = {
    onCloseCallback: null,
    videoEl: null,
    isScrubbing: false,
    lastVolume: 1,
    controlsTimeout: null,
    currentPath: null,
    currentName: null,
    currentDisplayTitle: null,
    fitModeIndex: 0,
    fitModes: [
        { label: 'Fit', style: 'contain' },
        { label: 'Fill', style: 'cover' },
        { label: 'Stretch', style: 'fill' }
    ],
    currentSubTrackId: 'off',
    currentAudioTrackId: 'default',
    activeBlobUrls: [],
    availableSubtitles: [],
    customTracks: [],

    // ---- Persistence helpers (localStorage) ----
    getSubtitleMap() {
        try { return JSON.parse(localStorage.getItem('player.video:subtitle_map') || '{}'); } catch { return {}; }
    },
    saveSubtitleSelection(path, trackId) {
        try {
            const map = this.getSubtitleMap();
            if (path) map[path] = trackId;
            // also keep a global fallback for next video if no per-file pref
            localStorage.setItem('player.video:subtitle_map', JSON.stringify(map));
            localStorage.setItem('player.video:last_subtitle', trackId);
        } catch {}
    },
    getSavedSubtitle(path) {
        try {
            const map = this.getSubtitleMap();
            if (path && map[path]) return map[path];
            return localStorage.getItem('player.video:last_subtitle') || null;
        } catch { return null; }
    },
    getAudioMap() {
        try { return JSON.parse(localStorage.getItem('player.video:audio_map') || '{}'); } catch { return {}; }
    },
    saveAudioSelection(path, trackId) {
        try {
            const map = this.getAudioMap();
            if (path) map[path] = trackId;
            localStorage.setItem('player.video:audio_map', JSON.stringify(map));
            localStorage.setItem('player.video:last_audio', trackId);
        } catch {}
    },
    getSavedAudio(path) {
        try {
            const map = this.getAudioMap();
            if (path && map[path]) return map[path];
            return localStorage.getItem('player.video:last_audio') || null;
        } catch { return null; }
    },

    formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return '0:00';
        const s = Math.floor(seconds);
        const mins = Math.floor(s / 60);
        const secs = s % 60;
        const hrs = Math.floor(mins / 60);
        const remMins = mins % 60;

        if (hrs > 0) {
            return `${hrs}:${String(remMins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        return `${mins}:${String(secs).padStart(2, '0')}`;
    },

    init(onClose) {
        this.onCloseCallback = onClose;
        this.videoEl = document.getElementById('videoPlayer');
        if (!this.videoEl) return;

        this.setupEventListeners();
        this.setupSubtitleFileInput();
        this.setupHotkeys();
    },

    setupEventListeners() {
        const video = this.videoEl;
        const btnClose = document.getElementById('btnCloseVideo');
        const btnPlayPause = document.getElementById('btnVideoPlayPause');
        const iconPlayPause = document.getElementById('iconVideoPlayPause');
        const btnSkipBack = document.getElementById('btnVideoSkipBack');
        const btnSkipForward = document.getElementById('btnVideoSkipForward');
        const iconVolume = document.getElementById('iconVideoVolume');
        const iconVolumePopup = document.getElementById('iconVideoVolumePopup');
        const btnMuteToggle = document.getElementById('btnVideoMuteToggle');
        const volumeSlider = document.getElementById('videoVolumeSlider');
        const lblVolumePercent = document.getElementById('lblVideoVolumePercent');
        const speedItems = document.querySelectorAll('[data-speed]');
        const speedLabel = document.getElementById('videoSpeedLabel');
        const btnPiP = document.getElementById('btnVideoPiP');
        const btnFullscreen = document.getElementById('btnVideoFullscreen');
        const videoStage = document.getElementById('videoStage');
        const bufferSpinner = document.getElementById('videoBufferSpinner');
        const subOverlay = document.getElementById('videoSubtitleOverlay');
        const progressContainer = document.getElementById('videoProgressContainer');
        const playedBar = document.getElementById('videoProgressPlayed');
        const bufferedBar = document.getElementById('videoProgressBuffered');
        const thumb = document.getElementById('videoProgressThumb');
        const currentTimeLabel = document.getElementById('videoCurrentTime');
        const durationLabel = document.getElementById('videoDuration');

        if (btnClose) {
            btnClose.addEventListener('click', () => {
                this.stop();
                if (this.onCloseCallback) this.onCloseCallback();
            });
        }

        // Toggle Play/Pause on Video click or button
        const togglePlay = () => {
            if (video.paused || video.ended) {
                video.play().catch(() => {});
                this.flashIndicator('play');
            } else {
                video.pause();
                this.flashIndicator('pause');
            }
        };

        // Fullscreen controls — robust for any video size / subtitles: paused = always visible, playing = hide both after 1s idle, show on move
        const controlsBar = document.getElementById('videoControlsBar');
        const topBar = document.getElementById('videoTopBar');
        const getIsFullscreen = () => {
            const fsEl = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
            if (fsEl) return true;
            const view = document.getElementById('contentVideoView');
            return !!(view && view.classList.contains('is-fullscreen'));
        };
        const showControls = () => {
            // Always reveal immediately on any interaction (works for large videos & with subtitles)
            if (controlsBar) controlsBar.classList.remove('controls-hidden');
            if (topBar) topBar.classList.remove('controls-hidden');
            const subOverlay = document.getElementById('videoSubtitleOverlay');
            if (subOverlay) subOverlay.classList.remove('controls-hidden-pos');
            clearTimeout(this.controlsTimeout);
            // Fullscreen paused/ended → keep controls always visible (no timeout at all)
            const isFs = getIsFullscreen();
            if (isFs && (video.paused || video.ended)) {
                // console.log('[PouchStream v2.2] fs paused -> always show');
                return;
            }
            const isAutoHideEnabled = localStorage.getItem('player.video:auto_hide_controls') !== 'false';
            // In fullscreen playing → always hide both bars after 1s (ignore setting per spec, works for large files)
            // Outside fullscreen: respect setting, bottom only
            const shouldHide = isFs ? (!video.paused && !video.ended) : (isAutoHideEnabled && !video.paused && !video.ended);
            if (shouldHide) {
                const isFsAtSchedule = isFs;
                this.controlsTimeout = setTimeout(() => {
                    // Never hide while scrubbing or dropdown open (e.g. subtitles menu)
                    const openDropdown = (controlsBar ? controlsBar.querySelector('.dropdown-menu.show') : null) || (topBar ? topBar.querySelector('.dropdown-menu.show') : null);
                    if (this.isScrubbing || openDropdown) return;
                    if (controlsBar) controlsBar.classList.add('controls-hidden');
                    // Top bar must hide together with bottom in fullscreen — use captured + live check for robustness
                    if (topBar && (isFsAtSchedule || getIsFullscreen())) topBar.classList.add('controls-hidden');
                    const so = document.getElementById('videoSubtitleOverlay');
                    if (so) so.classList.add('controls-hidden-pos');
                }, 1000);
            }
        };
        // Debug marker to verify edit applied (check DevTools console)
        console.log('[PouchStream] player v2.2 fullscreen controls loaded — isFs?', getIsFullscreen());

        if (videoStage) {
            videoStage.addEventListener('mousemove', showControls);
            videoStage.addEventListener('touchstart', showControls, { passive: true });
        }
        if (controlsBar) {
            controlsBar.addEventListener('mouseenter', showControls);
            controlsBar.addEventListener('mousemove', showControls);
        }
        if (topBar) {
            topBar.addEventListener('mouseenter', showControls);
            topBar.addEventListener('mousemove', showControls);
        }

        if (btnPlayPause) btnPlayPause.addEventListener('click', () => {
            togglePlay();
            showControls();
        });
        if (videoStage) {
            videoStage.addEventListener('click', (e) => {
                // Ignore clicks on controls or indicator
                if (e.target.closest('#videoControlsBar') || e.target.closest('#videoTopBar') || e.target.closest('.dropdown-menu')) return;
                togglePlay();
                showControls();
            });
            videoStage.addEventListener('dblclick', (e) => {
                if (e.target.closest('#videoControlsBar') || e.target.closest('#videoTopBar') || e.target.closest('.dropdown-menu')) return;
                this.toggleFullscreen();
                showControls();
            });
        }

        // Video State changes
        video.addEventListener('play', () => {
            if (iconPlayPause) iconPlayPause.setAttribute('name', 'pause');
            if (bufferSpinner) bufferSpinner.classList.add('d-none');
            showControls();
        });

        video.addEventListener('pause', () => {
            if (iconPlayPause) iconPlayPause.setAttribute('name', 'play');
            if (bufferSpinner) bufferSpinner.classList.add('d-none');
            if (controlsBar) controlsBar.classList.remove('controls-hidden');
            if (topBar) topBar.classList.remove('controls-hidden');
            if (subOverlay) subOverlay.classList.remove('controls-hidden-pos');
            clearTimeout(this.controlsTimeout);
        });

        video.addEventListener('ended', () => {
            if (iconPlayPause) iconPlayPause.setAttribute('name', 'play');
            if (bufferSpinner) bufferSpinner.classList.add('d-none');
            this.flashIndicator('reload');
        });

        // Buffering / Loading State Listeners
        video.addEventListener('waiting', () => {
            if (bufferSpinner) bufferSpinner.classList.remove('d-none');
        });

        video.addEventListener('seeking', () => {
            if (bufferSpinner) bufferSpinner.classList.remove('d-none');
        });

        video.addEventListener('seeked', () => {
            if (bufferSpinner) bufferSpinner.classList.add('d-none');
        });

        video.addEventListener('playing', () => {
            if (bufferSpinner) bufferSpinner.classList.add('d-none');
        });

        video.addEventListener('canplay', () => {
            if (bufferSpinner) bufferSpinner.classList.add('d-none');
        });

        // Restore saved loop setting
        try {
            const savedLoop = localStorage.getItem('player.video:loop');
            if (savedLoop !== null) {
                video.loop = savedLoop === 'true';
            }
        } catch (_) {}

        // Restore saved volume
        try {
            const savedVol = localStorage.getItem('player.video:volume');
            if (savedVol !== null) {
                const v = parseFloat(savedVol);
                if (!isNaN(v) && v >= 0 && v <= 1) {
                    video.volume = v;
                    video.muted = v === 0;
                    this.lastVolume = v > 0 ? v : 1;
                    if (volumeSlider) volumeSlider.value = v;
                }
            }
        } catch (_) {}
        updateVolumeIcon();

        // Save seek position helper
        const saveCurrentSeek = () => {
            if (!this.currentPath || isNaN(video.currentTime) || !video.duration) return;
            try {
                let positions = {};
                try {
                    positions = JSON.parse(localStorage.getItem('player.video:seek_positions') || '{}');
                } catch (_) {}
                // Don't save if near beginning (< 3s) or near end (< 5s left)
                if (video.currentTime > 3 && video.currentTime < video.duration - 5) {
                    positions[this.currentPath] = video.currentTime;
                } else {
                    delete positions[this.currentPath];
                }
                localStorage.setItem('player.video:seek_positions', JSON.stringify(positions));
            } catch (_) {}
        };

        // Time updates
        video.addEventListener('timeupdate', () => {
            if (this.isScrubbing) return;
            const cur = video.currentTime || 0;
            const dur = video.duration || 0;
            if (currentTimeLabel) currentTimeLabel.textContent = this.formatTime(cur);

            if (dur > 0) {
                const pct = (cur / dur) * 100;
                if (playedBar) playedBar.style.width = `${pct}%`;
                if (thumb) thumb.style.left = `${pct}%`;
            }
            this.renderActiveSubtitleCue();
            saveCurrentSeek();
        });

        video.addEventListener('pause', () => {
            saveCurrentSeek();
        });

        video.addEventListener('durationchange', () => {
            if (durationLabel) durationLabel.textContent = this.formatTime(video.duration || 0);
        });

        video.addEventListener('loadedmetadata', () => {
            if (durationLabel) durationLabel.textContent = this.formatTime(video.duration || 0);

            // Restore saved seek position for current video
            if (this.currentPath) {
                try {
                    const positions = JSON.parse(localStorage.getItem('player.video:seek_positions') || '{}');
                    const savedPos = positions[this.currentPath];
                    if (typeof savedPos === 'number' && savedPos > 0 && savedPos < (video.duration || Infinity)) {
                        video.currentTime = savedPos;
                    }
                } catch (_) {}
            }
        });

        video.addEventListener('progress', () => {
            if (video.buffered.length > 0 && video.duration > 0) {
                const bufferedEnd = video.buffered.end(video.buffered.length - 1);
                const pct = (bufferedEnd / video.duration) * 100;
                if (bufferedBar) bufferedBar.style.width = `${pct}%`;
            }
        });

        // Skip buttons
        if (btnSkipBack) {
            btnSkipBack.addEventListener('click', () => {
                video.currentTime = Math.max(0, video.currentTime - 10);
                this.flashIndicator('play-back');
            });
        }

        if (btnSkipForward) {
            btnSkipForward.addEventListener('click', () => {
                video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
                this.flashIndicator('play-forward');
            });
        }

        // Volume & Mute Controller
        function updateVolumeIcon() {
            let iconName = 'volume-high';
            if (video.muted || video.volume === 0) {
                iconName = 'volume-mute';
            } else if (video.volume < 0.5) {
                iconName = 'volume-low';
            }
            if (iconVolume) iconVolume.setAttribute('name', iconName);
            if (iconVolumePopup) iconVolumePopup.setAttribute('name', iconName);

            const pct = Math.round((video.muted ? 0 : video.volume) * 100);
            if (lblVolumePercent) lblVolumePercent.textContent = `${pct}%`;
        }

        const toggleMute = () => {
            if (video.muted) {
                video.muted = false;
                video.volume = this.lastVolume > 0 ? this.lastVolume : 1;
                if (volumeSlider) volumeSlider.value = video.volume;
            } else {
                this.lastVolume = video.volume;
                video.muted = true;
                if (volumeSlider) volumeSlider.value = 0;
            }
            updateVolumeIcon();
            try {
                localStorage.setItem('player.video:volume', (video.muted ? 0 : video.volume).toString());
            } catch (_) {}
        };

        if (btnMuteToggle) btnMuteToggle.addEventListener('click', toggleMute);

        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                video.volume = val;
                video.muted = val === 0;
                this.lastVolume = val > 0 ? val : this.lastVolume;
                updateVolumeIcon();
                try {
                    localStorage.setItem('player.video:volume', val.toString());
                } catch (_) {}
            });
        }

        // Scrubber / Progress dragging & seeking
        if (progressContainer) {
            const seek = (e) => {
                const rect = progressContainer.getBoundingClientRect();
                const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                if (video.duration) {
                    video.currentTime = pos * video.duration;
                }
                const pct = pos * 100;
                if (playedBar) playedBar.style.width = `${pct}%`;
                if (thumb) thumb.style.left = `${pct}%`;
            };

            progressContainer.addEventListener('mousedown', (e) => {
                this.isScrubbing = true;
                progressContainer.classList.add('is-scrubbing');
                seek(e);
            });

            window.addEventListener('mousemove', (e) => {
                if (this.isScrubbing) {
                    seek(e);
                }
            });

            window.addEventListener('mouseup', () => {
                if (this.isScrubbing) {
                    this.isScrubbing = false;
                    progressContainer.classList.remove('is-scrubbing');
                }
            });
        }

        // Playback Speed Selector
        speedItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const speed = parseFloat(item.getAttribute('data-speed'));
                if (!isNaN(speed)) {
                    video.playbackRate = speed;
                    speedItems.forEach(i => i.classList.remove('active', 'fw-bold'));
                    item.classList.add('active', 'fw-bold');
                    if (speedLabel) speedLabel.textContent = `${speed}x`;
                }
            });
        });

        // Picture-in-Picture
        if (btnPiP) {
            if (!document.pictureInPictureEnabled) {
                btnPiP.classList.add('d-none');
            } else {
                btnPiP.addEventListener('click', async () => {
                    try {
                        if (document.pictureInPictureElement) {
                            await document.exitPictureInPicture();
                        } else {
                            await video.requestPictureInPicture();
                        }
                    } catch (e) {
                        console.warn('PiP error:', e);
                    }
                });
            }
        }

        // Fullscreen
        if (btnFullscreen) {
            btnFullscreen.addEventListener('click', () => this.toggleFullscreen());
        }

        // Topbar Option 1: Loop Toggle
        const btnLoop = document.getElementById('btnVideoLoopToggle');
        const iconLoop = document.getElementById('iconVideoLoop');
        const lblLoop = document.getElementById('lblVideoLoop');
        if (iconLoop) iconLoop.style.color = video.loop ? '#0d6efd' : '';
        if (lblLoop) lblLoop.textContent = video.loop ? 'Loop: On' : 'Loop: Off';

        if (btnLoop) {
            btnLoop.addEventListener('click', () => {
                video.loop = !video.loop;
                if (iconLoop) iconLoop.style.color = video.loop ? '#0d6efd' : '';
                if (lblLoop) lblLoop.textContent = video.loop ? 'Loop: On' : 'Loop: Off';
                try {
                    localStorage.setItem('player.video:loop', video.loop ? 'true' : 'false');
                } catch (_) {}
                this.flashIndicator(video.loop ? 'repeat' : 'arrow-forward');
            });
        }

        // Topbar Option 2: Aspect Ratio Fit / Fill Mode
        const btnFit = document.getElementById('btnVideoFitToggle');
        const lblFit = document.getElementById('lblVideoFit');
        if (btnFit) {
            btnFit.addEventListener('click', () => {
                this.fitModeIndex = (this.fitModeIndex + 1) % this.fitModes.length;
                const mode = this.fitModes[this.fitModeIndex];
                video.style.objectFit = mode.style;
                if (lblFit) lblFit.textContent = mode.label;
                this.flashIndicator('crop');
            });
        }

        // Topbar Option 3: Screenshot / Snapshot Frame
        const btnSnapshot = document.getElementById('btnVideoSnapshot');
        if (btnSnapshot) {
            btnSnapshot.addEventListener('click', () => {
                if (!video.videoWidth || !video.videoHeight) return;
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                const currentSec = Math.floor(video.currentTime || 0);
                const baseName = (this.currentName || 'frame').replace(/\.[^/.]+$/, '');
                const fileName = `${baseName}_frame_${currentSec}s.png`;

                const link = document.createElement('a');
                link.download = fileName;
                link.href = canvas.toDataURL('image/png');
                link.click();
                this.flashIndicator('camera');
            });
        }

        // Topbar Option 4: Copy Stream Link
        const btnCopyLink = document.getElementById('btnVideoCopyLink');
        const iconCopyLink = document.getElementById('iconVideoCopyLink');
        if (btnCopyLink) {
            btnCopyLink.addEventListener('click', () => {
                const streamUrl = `${window.location.origin}/api/stream?path=${encodeURIComponent(this.currentPath || '')}`;
                navigator.clipboard.writeText(streamUrl).then(() => {
                    if (iconCopyLink) {
                        iconCopyLink.setAttribute('name', 'checkmark-outline');
                        setTimeout(() => iconCopyLink.setAttribute('name', 'link'), 1500);
                    }
                    this.flashIndicator('link');
                }).catch(() => {});
            });
        }

        // Topbar Option 5: Video Info / Stats Modal (Specific File Details)
        const btnInfo = document.getElementById('btnVideoInfo');
        if (btnInfo) {
            btnInfo.addEventListener('click', () => {
                const modal = document.getElementById('propertiesModal');
                if (!modal) return;

                const propTitleText = document.getElementById('propTitleText');
                const propTypeIcon = document.getElementById('propTypeIcon');
                const propName = document.getElementById('propName');
                const propTypeDesc = document.getElementById('propTypeDesc');
                const propLocation = document.getElementById('propLocation');
                const propSize = document.getElementById('propSize');
                const propContains = document.getElementById('propContains');
                const propModified = document.getElementById('propModified');

                // Look up matching file item in State if available
                const fileItem = State.items.find(i => i.path === this.currentPath);
                const ext = this.currentName ? (this.currentName.split('.').pop() || '').toUpperCase() : 'VIDEO';
                const res = video.videoWidth ? `${video.videoWidth} × ${video.videoHeight}` : 'Dynamic Stream';
                const durationStr = this.formatTime(video.duration || 0);
                const currentPosStr = this.formatTime(video.currentTime || 0);
                const sizeStr = fileItem ? `${UI.formatBytes(fileItem.size)} (${fileItem.size.toLocaleString()} bytes)` : 'Streaming Resource';
                const modifiedStr = fileItem ? UI.formatDate(fileItem.lastModified) : '—';
                const parentDir = this.currentPath && this.currentPath.includes('/') ? this.currentPath.substring(0, this.currentPath.lastIndexOf('/')) : '/ (Root)';

                // Detect video codec / mime info
                let codecInfo = fileItem && fileItem.mimeType ? fileItem.mimeType : `video/${ext.toLowerCase()}`;
                if (video.videoWidth >= 3840) codecInfo += ' (4K UHD)';
                else if (video.videoWidth >= 1920) codecInfo += ' (1080p FHD)';
                else if (video.videoWidth >= 1280) codecInfo += ' (720p HD)';

                if (propTitleText) propTitleText.textContent = 'Video Stream Information';
                if (propTypeIcon) {
                    propTypeIcon.setAttribute('name', 'videocam');
                    propTypeIcon.style.color = '#38bdf8';
                }
                if (propName) {
                    const dTitle = this.currentDisplayTitle;
                    propName.textContent = dTitle && dTitle !== this.currentName ? `${dTitle} (${this.currentName})` : (this.currentName || 'Video Playback');
                }
                if (propTypeDesc) propTypeDesc.textContent = `${ext} Video (${codecInfo})`;
                if (propLocation) propLocation.textContent = parentDir;
                if (propSize) propSize.textContent = sizeStr;
                if (propContains) propContains.textContent = `Resolution: ${res} | Duration: ${durationStr} (Pos: ${currentPosStr})`;
                if (propModified) propModified.textContent = modifiedStr;

                if (window.bootstrap && window.bootstrap.Modal) {
                    const inst = window.bootstrap.Modal.getOrCreateInstance(modal);
                    inst.show();
                }
            });
        }

        const handleFsChange = () => {
            try {
                const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
                const videoView = document.getElementById('contentVideoView');
                if (videoView) {
                    videoView.classList.toggle('is-fullscreen', isFs);
                }
                const iconFs = document.getElementById('iconVideoFullscreen');
                if (iconFs) {
                    iconFs.setAttribute('name', isFs ? 'contract' : 'scan');
                }
                // Re-render subtitles after FS transition (ensures overlay visibility)
                try { this.renderActiveSubtitleCue(); } catch (_) {}
                showControls();
            } catch (e) {
                console.warn('fullscreenchange handler error:', e);
            }
        };

        document.addEventListener('fullscreenchange', handleFsChange);
        document.addEventListener('webkitfullscreenchange', handleFsChange);
        document.addEventListener('mozfullscreenchange', handleFsChange);
        // Some browsers fire fullscreenerror - swallow to avoid uncaught throw
        document.addEventListener('fullscreenerror', (e) => console.warn('fullscreen error:', e));
        document.addEventListener('webkitfullscreenerror', (e) => console.warn('webkit fullscreen error:', e));

        video.addEventListener('loadedmetadata', () => {
            this.setupAudioTracks();
            this.setupEmbeddedTextTracks();
        });
    },

    toggleFullscreen() {
        const view = document.getElementById('contentVideoView');
        if (!view) return;
        try {
            const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
            if (!isFs) {
                const req = view.requestFullscreen || view.webkitRequestFullscreen || view.webkitEnterFullscreen || view.mozRequestFullScreen;
                if (req) {
                    const p = req.call(view);
                    if (p && p.catch) p.catch(e => console.warn('requestFullscreen failed:', e));
                }
            } else {
                const exit = document.exitFullscreen || document.webkitExitFullscreen || document.webkitCancelFullScreen || document.mozCancelFullScreen;
                if (exit) {
                    const p = exit.call(document);
                    if (p && p.catch) p.catch(e => console.warn('exitFullscreen failed:', e));
                }
            }
        } catch (e) {
            console.warn('toggleFullscreen error:', e);
        }
    },

    flashIndicator(iconName) {
        const ind = document.getElementById('videoCenterIndicator');
        const icon = document.getElementById('videoCenterIndicatorIcon');
        if (!ind || !icon) return;

        icon.setAttribute('name', iconName);
        ind.classList.remove('d-none', 'fading-out');

        clearTimeout(this.indicatorTimeout);
        this.indicatorTimeout = setTimeout(() => {
            ind.classList.add('fading-out');
            setTimeout(() => {
                ind.classList.add('d-none');
                ind.classList.remove('fading-out');
            }, 400);
        }, 150);
    },

    setupHotkeys() {
        window.addEventListener('keydown', (e) => {
            const videoView = document.getElementById('contentVideoView');
            if (!videoView || videoView.classList.contains('d-none')) return;

            // Ignore when typing in inputs/textareas
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

            const video = this.videoEl;
            if (!video) return;

            switch (e.key.toLowerCase()) {
                case ' ':
                case 'k':
                    e.preventDefault();
                    if (video.paused) {
                        video.play().catch(() => {});
                        this.flashIndicator('play');
                    } else {
                        video.pause();
                        this.flashIndicator('pause');
                    }
                    break;
                case 'j':
                case 'arrowleft':
                    e.preventDefault();
                    video.currentTime = Math.max(0, video.currentTime - (e.shiftKey ? 5 : 10));
                    this.flashIndicator('play-back');
                    break;
                case 'arrowright':
                    e.preventDefault();
                    video.currentTime = Math.min(video.duration || Infinity, video.currentTime + (e.shiftKey ? 5 : 10));
                    this.flashIndicator('play-forward');
                    break;
                case 'arrowup':
                    e.preventDefault();
                    video.volume = Math.min(1, video.volume + 0.1);
                    video.muted = false;
                    const sliderUp = document.getElementById('videoVolumeSlider');
                    if (sliderUp) sliderUp.value = video.volume;
                    const pctUp = document.getElementById('lblVideoVolumePercent');
                    if (pctUp) pctUp.textContent = `${Math.round(video.volume * 100)}%`;
                    try {
                        localStorage.setItem('player.video:volume', video.volume.toString());
                    } catch (_) {}
                    break;
                case 'arrowdown':
                    e.preventDefault();
                    video.volume = Math.max(0, video.volume - 0.1);
                    const sliderDown = document.getElementById('videoVolumeSlider');
                    if (sliderDown) sliderDown.value = video.volume;
                    const pctDown = document.getElementById('lblVideoVolumePercent');
                    if (pctDown) pctDown.textContent = `${Math.round(video.volume * 100)}%`;
                    try {
                        localStorage.setItem('player.video:volume', video.volume.toString());
                    } catch (_) {}
                    break;
                case 'm':
                    e.preventDefault();
                    const btnMute = document.getElementById('btnVideoMuteToggle');
                    if (btnMute) btnMute.click();
                    break;
                case 'c':
                    e.preventDefault();
                    this.cycleSubtitles();
                    break;
                case 'f':
                    e.preventDefault();
                    this.toggleFullscreen();
                    break;
                case 'escape':
                    try {
                        const isFsEsc = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
                        if (isFsEsc) {
                            const exitEsc = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
                            if (exitEsc) {
                                const p = exitEsc.call(document);
                                if (p && p.catch) p.catch(() => {});
                            }
                        }
                    } catch (_) {}
                    break;
            }
        });
    },

    srtToWebVtt(srtText) {
        if (!srtText) return 'WEBVTT\n\n';
        // Normalize line endings and strip BOM
        let text = srtText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

        // Convert SRT commas in timestamps to periods (00:00:01,234 --> 00:00:03,567)
        text = text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
        text = text.replace(/(\d{2}:\d{2}),(\d{3})/g, '00:$1.$2');

        return 'WEBVTT\n\n' + text;
    },

    clearSubtitles() {
        this.activeBlobUrls.forEach(url => {
            try { URL.revokeObjectURL(url); } catch (_) {}
        });
        this.activeBlobUrls = [];
        this.availableSubtitles = [];
        this.customTracks = [];
        this.currentSubTrackId = 'off';

        if (this.videoEl) {
            const tracks = Array.from(this.videoEl.querySelectorAll('track'));
            tracks.forEach(t => t.remove());
            if (this.videoEl.textTracks) {
                for (let i = 0; i < this.videoEl.textTracks.length; i++) {
                    this.videoEl.textTracks[i].mode = 'disabled';
                }
            }
        }

        this.renderActiveSubtitleCue();
        this.updateSubsUI();
    },

    renderActiveSubtitleCue() {
        const subOverlay = document.getElementById('videoSubtitleOverlay');
        const subTextEl = document.getElementById('videoSubtitleText');
        if (!subOverlay || !subTextEl) return;

        if (this.currentSubTrackId === 'off' || !this.videoEl) {
            subOverlay.classList.add('d-none');
            subTextEl.textContent = '';
            return;
        }

        let activeText = '';
        if (this.videoEl.textTracks) {
            for (let i = 0; i < this.videoEl.textTracks.length; i++) {
                const track = this.videoEl.textTracks[i];
                if (track.mode === 'showing' || track.mode === 'hidden') {
                    const cues = track.activeCues;
                    if (cues && cues.length > 0) {
                        activeText = Array.from(cues).map(c => c.text).join('\n');
                        break;
                    }
                }
            }
        }

        if (activeText.trim()) {
            subTextEl.textContent = activeText.trim();
            subOverlay.classList.remove('d-none');
        } else {
            subOverlay.classList.add('d-none');
            subTextEl.textContent = '';
        }
    },

    updateSubsUI() {
        const subsList = document.getElementById('videoSubsList');
        const subsLabel = document.getElementById('videoSubsLabel');
        const iconSubs = document.getElementById('iconVideoSubs');

        const isActive = this.currentSubTrackId !== 'off';
        if (subsLabel) {
            subsLabel.textContent = isActive ? 'CC (ON)' : 'CC';
        }
        if (iconSubs) {
            iconSubs.style.color = isActive ? '#10b981' : '';
        }

        if (!subsList) return;
        subsList.innerHTML = '';

        // "Off" option
        const offBtn = document.createElement('button');
        offBtn.className = `portal-context-menu-item ${!isActive ? 'active fw-bold' : ''}`;
        offBtn.type = 'button';
        offBtn.setAttribute('data-sub-id', 'off');
        offBtn.innerHTML = `<ion-icon name="close-circle-outline"></ion-icon> <span>Off</span>`;
        offBtn.addEventListener('click', () => this.selectSubtitleTrack('off'));
        subsList.appendChild(offBtn);

        // Render detected folder subtitles and custom subtitles
        this.availableSubtitles.forEach(sub => {
            const btn = document.createElement('button');
            const isSubActive = this.currentSubTrackId === sub.id;
            btn.className = `portal-context-menu-item ${isSubActive ? 'active fw-bold' : ''}`;
            btn.type = 'button';
            btn.setAttribute('data-sub-id', sub.id);
            const badge = sub.isAutoMatch ? '<span class="badge bg-primary ms-auto" style="font-size: 0.65rem;">Auto</span>' : '';
            btn.innerHTML = `<ion-icon name="document-text-outline"></ion-icon> <span class="text-truncate me-2">${this.escapeHtml(sub.label)}</span>${badge}`;
            btn.addEventListener('click', () => this.selectSubtitleTrack(sub.id));
            subsList.appendChild(btn);
        });

        // Render embedded tracks
        if (this.videoEl && this.videoEl.textTracks) {
            for (let i = 0; i < this.videoEl.textTracks.length; i++) {
                const track = this.videoEl.textTracks[i];
                if (track.kind === 'subtitles' || track.kind === 'captions') {
                    const trackId = `embedded:${i}`;
                    const isTrackActive = this.currentSubTrackId === trackId;
                    const btn = document.createElement('button');
                    btn.className = `portal-context-menu-item ${isTrackActive ? 'active fw-bold' : ''}`;
                    btn.type = 'button';
                    btn.setAttribute('data-sub-id', trackId);
                    const label = track.label || track.language || `Track ${i + 1}`;
                    btn.innerHTML = `<ion-icon name="subtitles-outline"></ion-icon> <span class="text-truncate">${this.escapeHtml(label)} (Embedded)</span>`;
                    btn.addEventListener('click', () => this.selectSubtitleTrack(trackId));
                    subsList.appendChild(btn);
                }
            }
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
    },

    parseId3Title(bytes) {
        try {
            if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null;
            const tagSize = ((bytes[6] & 0x7F) << 21) | ((bytes[7] & 0x7F) << 14) | ((bytes[8] & 0x7F) << 7) | (bytes[9] & 0x7F);
            const maxLen = Math.min(bytes.length, tagSize + 10);
            let offset = 10;
            while (offset + 10 < maxLen) {
                const frameId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
                if (frameId === '\x00\x00\x00\x00' || !/^[A-Z0-9]{4}$/.test(frameId)) break;
                let frameSize = (bytes[offset + 4] << 24) | (bytes[offset + 5] << 16) | (bytes[offset + 6] << 8) | bytes[offset + 7];
                if (frameSize <= 0 || offset + 10 + frameSize > maxLen) {
                    frameSize = ((bytes[offset + 4] & 0x7F) << 21) | ((bytes[offset + 5] & 0x7F) << 14) | ((bytes[offset + 6] & 0x7F) << 7) | (bytes[offset + 7] & 0x7F);
                }
                if (frameSize <= 0 || offset + 10 + frameSize > maxLen) break;

                if (frameId === 'TIT2') {
                    const encoding = bytes[offset + 10];
                    const dataBytes = bytes.subarray(offset + 11, offset + 10 + frameSize);
                    let title = '';
                    if (encoding === 0) {
                        title = new TextDecoder('iso-8859-1').decode(dataBytes);
                    } else if (encoding === 1 || encoding === 2) {
                        title = new TextDecoder('utf-16').decode(dataBytes);
                    } else {
                        title = new TextDecoder('utf-8').decode(dataBytes);
                    }
                    title = title.replace(/\0/g, '').replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
                    if (title) return title;
                }
                offset += 10 + frameSize;
            }
        } catch (_) {}
        return null;
    },

    parseMp4Title(bytes) {
        try {
            for (let i = 0; i < bytes.length - 16; i++) {
                const isNam = bytes[i] === 0xA9 && bytes[i + 1] === 0x6E && bytes[i + 2] === 0x61 && bytes[i + 3] === 0x6D;
                const isTitl = bytes[i] === 0x74 && bytes[i + 1] === 0x69 && bytes[i + 2] === 0x74 && bytes[i + 3] === 0x6C;
                if (isNam || isTitl) {
                    for (let j = i + 4; j < Math.min(bytes.length - 8, i + 32); j++) {
                        if (bytes[j] === 0x64 && bytes[j + 1] === 0x61 && bytes[j + 2] === 0x74 && bytes[j + 3] === 0x61) {
                            const dataSize = (bytes[j - 4] << 24) | (bytes[j - 3] << 16) | (bytes[j - 2] << 8) | bytes[j - 1];
                            const textStart = j + 12;
                            const textLen = Math.min(dataSize > 16 ? dataSize - 16 : 256, bytes.length - textStart);
                            if (textLen > 0 && textLen < 500) {
                                const textBytes = bytes.subarray(textStart, textStart + textLen);
                                const title = new TextDecoder('utf-8').decode(textBytes).replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
                                if (title.length > 0) return title;
                            }
                        }
                    }
                }
            }
        } catch (_) {}
        return null;
    },

    parseMkvTitle(bytes) {
        try {
            for (let i = 0; i < bytes.length - 6; i++) {
                if (bytes[i] === 0x7B && bytes[i + 1] === 0xA9) {
                    let len = 0;
                    const lenByte = bytes[i + 2];
                    let numBytes = 0;
                    let mask = 0x80;
                    for (let b = 0; b < 8; b++) {
                        if ((lenByte & mask) !== 0) {
                            numBytes = b + 1;
                            len = lenByte & ~mask;
                            break;
                        }
                        mask >>= 1;
                    }
                    if (numBytes > 0 && numBytes <= 4) {
                        for (let b = 1; b < numBytes; b++) {
                            len = (len << 8) | bytes[i + 2 + b];
                        }
                        const textStart = i + 2 + numBytes;
                        if (len > 0 && len < 500 && textStart + len <= bytes.length) {
                            const textBytes = bytes.subarray(textStart, textStart + len);
                            const title = new TextDecoder('utf-8').decode(textBytes).replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
                            if (title.length > 0) return title;
                        }
                    }
                }
            }
        } catch (_) {}
        return null;
    },

    async extractVideoMetadataTitle(path, fallbackName) {
        if (!path) return fallbackName;
        try {
            const streamUrl = `/api/stream?path=${encodeURIComponent(path)}`;
            const resp = await fetch(streamUrl, {
                headers: { 'Range': 'bytes=0-131071' }
            });
            if (resp.ok || resp.status === 206) {
                const buffer = await resp.arrayBuffer();
                const bytes = new Uint8Array(buffer);

                const id3Title = this.parseId3Title(bytes);
                if (id3Title) return id3Title;

                const mkvTitle = this.parseMkvTitle(bytes);
                if (mkvTitle) return mkvTitle;

                const mp4Title = this.parseMp4Title(bytes);
                if (mp4Title) return mp4Title;
            }
        } catch (err) {
            console.warn('Could not extract video metadata title:', err);
        }
        return fallbackName;
    },

    async loadSubtitlesForVideo(videoPath, videoName) {
        this.clearSubtitles();

        if (!videoName) return;

        // Base name without extension, e.g. "MyMovie" from "MyMovie.mp4"
        const baseName = videoName.replace(/\.[^/.]+$/, '').toLowerCase();
        const subExtensions = ['srt', 'vtt', 'sub', 'ass', 'txt'];

        // Find matching subtitle files in current directory
        const folderFiles = State.items || [];
        let bestMatch = null;

        folderFiles.forEach(item => {
            if (item.isDirectory) return;
            const ext = (item.extension || '').toLowerCase();
            if (!subExtensions.includes(ext)) return;

            const itemNameLower = item.name.toLowerCase();
            const isExactMatch = itemNameLower === `${baseName}.${ext}` || itemNameLower.startsWith(`${baseName}.`);
            const isSimilar = itemNameLower.includes(baseName) || baseName.includes(item.name.replace(/\.[^/.]+$/, '').toLowerCase());

            const subItem = {
                id: `file:${item.path}`,
                label: item.name,
                path: item.path,
                ext: ext,
                isAutoMatch: isExactMatch || isSimilar
            };

            this.availableSubtitles.push(subItem);

            if (isExactMatch && !bestMatch) {
                bestMatch = subItem;
            } else if (isSimilar && !bestMatch) {
                bestMatch = subItem;
            }
        });

        this.updateSubsUI();

        // Respect last user choice stored in localStorage (per-video)
        const saved = this.getSavedSubtitle(videoPath);
        if (saved) {
            const isOff = saved === 'off';
            const existsInFiles = this.availableSubtitles.some(s => s.id === saved);
            const existsEmbedded = saved.startsWith('embedded:'); // defer until metadata loads
            const existsCustom = saved.startsWith('custom:') && this.availableSubtitles.some(s => s.id === saved);
            if (isOff) {
                await this.selectSubtitleTrack('off');
                return;
            }
            if (existsInFiles || existsCustom) {
                await this.selectSubtitleTrack(saved);
                return;
            }
            if (existsEmbedded) {
                // embedded tracks not yet known — store and apply later in setupEmbeddedTextTracks
                this.currentSubTrackId = saved;
                this.updateSubsUI();
                return;
            }
        }

        // If an exact or matching subtitle file was detected, auto-load and enable it!
        if (bestMatch) {
            await this.selectSubtitleTrack(bestMatch.id);
        }
    },

    async selectSubtitleTrack(trackId) {
        this.currentSubTrackId = trackId;
        // persist choice
        try { this.saveSubtitleSelection(this.currentPath, trackId); } catch {}

        // Disable all existing HTML track elements and textTracks
        if (this.videoEl) {
            const trackEls = this.videoEl.querySelectorAll('track');
            trackEls.forEach(t => t.remove());
            if (this.videoEl.textTracks) {
                for (let i = 0; i < this.videoEl.textTracks.length; i++) {
                    this.videoEl.textTracks[i].mode = 'disabled';
                }
            }
        }

        if (trackId === 'off') {
            this.renderActiveSubtitleCue();
            this.updateSubsUI();
            return;
        }

        if (trackId.startsWith('file:')) {
            const filePath = trackId.replace('file:', '');
            try {
                let text = null;
                // Try /api/read first (JSON), fall back to /api/stream raw — both attempts are individually caught to avoid Failed to fetch unhandled
                try {
                    const data = await Api.readFile(filePath);
                    text = (data && typeof data.content === 'string') ? data.content : null;
                } catch (readErr) {
                    console.warn('Subtitle Api.readFile failed, trying stream:', readErr.message);
                }
                if (text == null) {
                    try {
                        const response = await fetch(`/api/stream?path=${encodeURIComponent(filePath)}`);
                        if (!response.ok) throw new Error(`HTTP ${response.status}`);
                        text = await response.text();
                    } catch (streamErr) {
                        console.warn('Subtitle stream fetch failed (tried combinations):', streamErr.message);
                        throw streamErr;
                    }
                }

                if (text) {
                    const vttContent = this.srtToWebVtt(text);
                    const blob = new Blob([vttContent], { type: 'text/vtt' });
                    const blobUrl = URL.createObjectURL(blob);
                    this.activeBlobUrls.push(blobUrl);

                    const track = document.createElement('track');
                    track.kind = 'subtitles';
                    track.label = filePath.split('/').pop();
                    track.srclang = 'en';
                    track.src = blobUrl;
                    track.default = true;

                    if (this.videoEl) {
                        this.videoEl.appendChild(track);
                        const handleTrackReady = () => {
                            if (track.track) {
                                track.track.mode = 'hidden';
                                track.track.oncuechange = () => this.renderActiveSubtitleCue();
                                this.renderActiveSubtitleCue();
                            }
                        };
                        track.addEventListener('load', handleTrackReady);
                        handleTrackReady();
                    }
                }
            } catch (err) {
                console.warn('Failed to load subtitle file:', err);
                this.currentSubTrackId = 'off';
            }
        } else if (trackId.startsWith('embedded:')) {
            const idx = parseInt(trackId.replace('embedded:', ''), 10);
            if (this.videoEl && this.videoEl.textTracks && this.videoEl.textTracks[idx]) {
                const t = this.videoEl.textTracks[idx];
                t.mode = 'hidden';
                t.oncuechange = () => this.renderActiveSubtitleCue();
                this.renderActiveSubtitleCue();
            }
        } else if (trackId.startsWith('custom:')) {
            const customSub = this.availableSubtitles.find(s => s.id === trackId);
            if (customSub && customSub.blobUrl) {
                const track = document.createElement('track');
                track.kind = 'subtitles';
                track.label = customSub.label;
                track.srclang = 'en';
                track.src = customSub.blobUrl;
                track.default = true;
                if (this.videoEl) {
                    this.videoEl.appendChild(track);
                    const handleTrackReady = () => {
                        if (track.track) {
                            track.track.mode = 'hidden';
                            track.track.oncuechange = () => this.renderActiveSubtitleCue();
                            this.renderActiveSubtitleCue();
                        }
                    };
                    track.addEventListener('load', handleTrackReady);
                    handleTrackReady();
                }
            }
        }

        this.renderActiveSubtitleCue();
        this.updateSubsUI();
    },

    setupSubtitleFileInput() {
        const fileInput = document.getElementById('videoSubFileInput');
        if (!fileInput) return;

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const rawContent = event.target.result;
                const vttContent = this.srtToWebVtt(rawContent);
                const blob = new Blob([vttContent], { type: 'text/vtt' });
                const blobUrl = URL.createObjectURL(blob);
                this.activeBlobUrls.push(blobUrl);

                const customId = `custom:${Date.now()}`;
                const subItem = {
                    id: customId,
                    label: file.name,
                    blobUrl: blobUrl,
                    isAutoMatch: false
                };

                this.availableSubtitles.push(subItem);
                this.selectSubtitleTrack(customId);
                UI.showToast('Subtitles Loaded', `Loaded "${file.name}"`, 'success');
            };
            reader.readAsText(file);
            fileInput.value = '';
        });
    },

    cycleSubtitles() {
        const allIds = ['off', ...this.availableSubtitles.map(s => s.id)];
        if (this.videoEl && this.videoEl.textTracks) {
            for (let i = 0; i < this.videoEl.textTracks.length; i++) {
                const t = this.videoEl.textTracks[i];
                if (t.kind === 'subtitles' || t.kind === 'captions') {
                    allIds.push(`embedded:${i}`);
                }
            }
        }

        const currentIndex = allIds.indexOf(this.currentSubTrackId);
        const nextIndex = (currentIndex + 1) % allIds.length;
        this.selectSubtitleTrack(allIds[nextIndex]);
    },

    setupEmbeddedTextTracks() {
        this.updateSubsUI();
        // Re-apply saved embedded choice after tracks become available
        try {
            const saved = this.getSavedSubtitle(this.currentPath);
            if (saved && saved.startsWith('embedded:')) {
                const idx = parseInt(saved.replace('embedded:', ''), 10);
                const tt = this.videoEl && this.videoEl.textTracks ? this.videoEl.textTracks[idx] : null;
                if (tt && (tt.kind === 'subtitles' || tt.kind === 'captions')) {
                    if (this.currentSubTrackId !== saved) {
                        this.selectSubtitleTrack(saved);
                    } else {
                        tt.mode = 'hidden';
                        tt.oncuechange = () => this.renderActiveSubtitleCue();
                        this.renderActiveSubtitleCue();
                        this.updateSubsUI();
                    }
                }
            }
        } catch {}
    },

    setupAudioTracks() {
        const audioList = document.getElementById('videoAudioList');
        const audioLabel = document.getElementById('videoAudioLabel');
        if (!audioList) return;

        audioList.innerHTML = '';
        const video = this.videoEl;
        const getTracks = () => {
            if (!video) return [];
            if (video.audioTracks && video.audioTracks.length) return Array.from(video.audioTracks);
            if (video.webkitAudioTracks && video.webkitAudioTracks.length) return Array.from(video.webkitAudioTracks);
            if (video.mozAudioTracks && video.mozAudioTracks.length) return Array.from(video.mozAudioTracks);
            return [];
        };
        const tracks = getTracks();

        // Attach listeners once for late-populating tracks
        if (video && !video._audioTracksBound) {
            video._audioTracksBound = true;
            const recheck = () => { try { this.setupAudioTracks(); } catch {} };
            if (video.audioTracks) {
                video.audioTracks.addEventListener && video.audioTracks.addEventListener('addtrack', recheck);
                video.audioTracks.addEventListener && video.audioTracks.addEventListener('removetrack', recheck);
                video.audioTracks.addEventListener && video.audioTracks.addEventListener('change', recheck);
            }
            // some browsers fire after a short delay
            video.addEventListener('loadeddata', recheck);
        }

        if (tracks.length === 0) {
            const btn = document.createElement('button');
            btn.className = 'portal-context-menu-item active fw-bold';
            btn.type = 'button';
            btn.setAttribute('data-audio-id', 'default');
            btn.innerHTML = `<ion-icon name="volume-high"></ion-icon> <span>Default Audio Track</span>`;
            audioList.appendChild(btn);
            if (audioLabel) audioLabel.textContent = 'Audio';
            // retry once shortly after metadata (tracks often populate late)
            if (!this._audioRetry) {
                this._audioRetry = setTimeout(() => { this._audioRetry = null; this.setupAudioTracks(); }, 600);
            }
            return;
        }
        // Restore saved choice
        const saved = this.getSavedAudio(this.currentPath);
        if (saved && saved.startsWith('audio:')) {
            const sIdx = parseInt(saved.replace('audio:', ''), 10);
            if (sIdx >= 0 && sIdx < tracks.length) {
                const currentlyEnabled = tracks.findIndex(t => t.enabled);
                if (currentlyEnabled !== sIdx) {
                    tracks.forEach((t, idx) => { t.enabled = idx === sIdx; });
                }
            }
        }
        let activeIdx = tracks.findIndex(t => t.enabled);
        if (activeIdx === -1 && tracks.length > 0) {
            // no track flagged enabled — enable first
            activeIdx = 0;
            tracks[0].enabled = true;
        }
        this.currentAudioTrackId = activeIdx >= 0 ? `audio:${activeIdx}` : 'default';
        const activeLabel = activeIdx >= 0 ? (tracks[activeIdx].label || tracks[activeIdx].language || `Audio ${activeIdx + 1}`) : 'Audio';
        if (audioLabel) audioLabel.textContent = tracks.length === 1 ? (tracks[0].label || tracks[0].language || 'Default Audio') : activeLabel;

        tracks.forEach((track, i) => {
            const trackId = `audio:${i}`;
            const isActive = i === activeIdx;
            const btn = document.createElement('button');
            btn.className = `portal-context-menu-item ${isActive ? 'active fw-bold' : ''}`;
            btn.type = 'button';
            btn.setAttribute('data-audio-id', trackId);
            const label = track.label || track.language || `Audio Track ${i + 1}`;
            const langBadge = track.language ? ` <span class="badge bg-secondary ms-1" style="font-size:0.65rem;">${this.escapeHtml(track.language)}</span>` : '';
            btn.innerHTML = `<ion-icon name="${isActive ? 'volume-high' : 'volume-medium'}"></ion-icon> <span>${this.escapeHtml(label)}</span>${langBadge}`;
            btn.addEventListener('click', () => {
                tracks.forEach((t, j) => { t.enabled = j === i; });
                this.currentAudioTrackId = trackId;
                try { this.saveAudioSelection(this.currentPath, trackId); } catch {}
                if (audioLabel) audioLabel.textContent = label;
                this.setupAudioTracks();
                // also persist and flash
                try { this.flashIndicator('volume-high'); } catch {}
            });
            audioList.appendChild(btn);
        });
        // persist current if not yet saved
        try { this.saveAudioSelection(this.currentPath, this.currentAudioTrackId); } catch {}
    },

    play(path, name) {
        this.currentPath = path;
        this.currentName = name;
        try { localStorage.setItem('pouchstream:lastOpenedFile', JSON.stringify({ path, name, type: 'video' })); } catch {}

        const titleEl = document.getElementById('videoTitle');
        const videoEl = document.getElementById('videoPlayer');
        const dlBtn = document.getElementById('btnVideoDownload');
        const videoView = document.getElementById('contentVideoView');
        const workspaceView = document.getElementById('workspaceView');
        const toolbar = document.getElementById('portalToolbar');
        const bufferSpinner = document.getElementById('videoBufferSpinner');
        const controlsBar = document.getElementById('videoControlsBar');
        const topBar = document.getElementById('videoTopBar');

        // Show file name immediately, then upgrade to metadata title when one exists
        this.currentDisplayTitle = null;
        if (titleEl) titleEl.textContent = name;
        if (dlBtn) dlBtn.href = `/api/stream?path=${encodeURIComponent(path)}&download=true`;

        if (bufferSpinner) bufferSpinner.classList.remove('d-none');
        if (controlsBar) controlsBar.classList.remove('controls-hidden');
        if (topBar) topBar.classList.remove('controls-hidden');
        clearTimeout(this.controlsTimeout);

        this.extractVideoMetadataTitle(path, name).then(metaTitle => {
            // Ignore stale result if the user already switched to another video
            if (this.currentPath !== path) return;
            if (metaTitle && metaTitle !== name) {
                this.currentDisplayTitle = metaTitle;
                if (titleEl) titleEl.textContent = metaTitle;
            }
        }).catch(() => {});

        if (videoEl) {
            videoEl.src = `/api/stream?path=${encodeURIComponent(path)}`;
            videoEl.load();
            const shouldAutoplay = localStorage.getItem('player.video:autoplay') !== 'false';
            if (shouldAutoplay) {
                videoEl.play().catch(() => {});
            }
        }

        this.loadSubtitlesForVideo(path, name).catch(err => console.warn('Could not auto-load subtitles:', err));
        this.setupAudioTracks();

        const audioEl = document.getElementById('audioPlayerElement');
        if (audioEl && !audioEl.paused) {
            audioEl.pause();
        }

        const pdfView = document.getElementById('contentPdfView');
        if (pdfView) {
            pdfView.classList.add('d-none');
            pdfView.classList.remove('d-flex');
        }

        const imageView = document.getElementById('contentImageView');
        if (imageView) {
            imageView.classList.add('d-none');
            imageView.classList.remove('d-flex');
        }
        if (workspaceView) workspaceView.classList.add('d-none');
        if (toolbar) toolbar.classList.add('d-none');
        if (videoView) {
            videoView.classList.remove('d-none');
            videoView.classList.add('d-flex');
        }
    },

    stop() {
        try {
            const raw = localStorage.getItem('pouchstream:lastOpenedFile');
            if (raw) {
                const obj = JSON.parse(raw);
                if (obj && obj.path === this.currentPath && obj.type === 'video') localStorage.removeItem('pouchstream:lastOpenedFile');
            }
        } catch {}
        this.currentPath = null;
        this.currentName = null;
        this.currentDisplayTitle = null;
        this.clearSubtitles();

        const videoEl = document.getElementById('videoPlayer');
        const videoView = document.getElementById('contentVideoView');
        const workspaceView = document.getElementById('workspaceView');
        const toolbar = document.getElementById('portalToolbar');
        const bufferSpinner = document.getElementById('videoBufferSpinner');
        const controlsBar = document.getElementById('videoControlsBar');
        const topBar = document.getElementById('videoTopBar');

        clearTimeout(this.controlsTimeout);
        if (controlsBar) controlsBar.classList.remove('controls-hidden');
        if (topBar) topBar.classList.remove('controls-hidden');
        if (bufferSpinner) bufferSpinner.classList.add('d-none');

        if (videoEl) {
            videoEl.pause();
            videoEl.removeAttribute('src');
            videoEl.load();
        }

        if (videoView) {
            videoView.classList.add('d-none');
            videoView.classList.remove('d-flex');
        }
        if (workspaceView) workspaceView.classList.remove('d-none');
        if (toolbar) toolbar.classList.remove('d-none');
    }
};

