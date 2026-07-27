// == Soundbar ==
let audioCtx = null;
let playlist = [];
let currentTrackIndex = -1;
let loopTrack = false;
const musicPlayer = new Audio();
let soundbarExpanded = false;
let activeSounds = {};
const SOUNDBAR_LIBRARY_KEY = 'sanctum_soundbar_library_v1';
const UPLOADED_TRACK_KEY_PREFIX = 'soundbar-track:';
const DEFAULT_PLAYER_VOLUME = 1;

const AMBIENT_SOUNDS = [
  { id: 'rain',        label: 'Rain',        icon: '🌧', src: 'sounds/rain.mp3' },
  { id: 'heavy-rain',  label: 'Heavy Rain',  icon: '⛈', noiseType: 'white', filter: { type: 'lowpass', freq: 700, q: 0.3 } },
  { id: 'ocean',       label: 'Ocean',       icon: '🌊', src: 'sounds/ocean-waves.mp3' },
  { id: 'wind',        label: 'Wind',        icon: '💨', noiseType: 'pink',  filter: { type: 'bandpass', freq: 500, q: 2 }, lfo: { freq: 0.1, depth: 0.3 } },
  { id: 'fire',        label: 'Fire',        icon: '🔥', src: 'sounds/fire.mp3' },
  { id: 'white-noise', label: 'White Noise', icon: '〰️', noiseType: 'white' },
  { id: 'brown-noise', label: 'Brown Noise', icon: '🟤', src: 'sounds/brown-noise.mp3' },
  { id: 'forest',      label: 'Forest',      icon: '🌲', src: 'sounds/forest.mp3' },
  { id: 'cafe',        label: 'Café',        icon: '☕', src: 'sounds/cafe.mp3' },
  { id: 'thunder',     label: 'Thunder',     icon: '⚡', src: 'sounds/thunderstorm.mp3' },
];

function getSoundbarStorage() {
  return window.SanctumStorage || null;
}

function createUploadedTrackId() {
  return `soundtrack-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getUploadedTrackBlobKey(trackId = '') {
  return `${UPLOADED_TRACK_KEY_PREFIX}${trackId}`;
}

function getSafeTrackName(value = '') {
  const safe = String(value || '').trim();
  return safe || 'Untitled Track';
}

function revokeTrackObjectUrl(track) {
  if (!track?.objectUrl || !track.url) return;
  try {
    URL.revokeObjectURL(track.url);
  } catch (err) {
    console.warn('Failed to revoke track URL', err);
  }
  track.objectUrl = false;
  track.url = '';
}

function createUploadedTrackEntry(blob, metadata = {}) {
  const id = metadata.id || createUploadedTrackId();
  const blobKey = metadata.blobKey || getUploadedTrackBlobKey(id);
  return {
    id,
    name: getSafeTrackName(metadata.name || metadata.fileName || ''),
    fileName: String(metadata.fileName || ''),
    mimeType: String(metadata.mimeType || blob?.type || ''),
    size: Number.isFinite(Number(metadata.size)) ? Number(metadata.size) : Number(blob?.size || 0),
    source: 'uploaded',
    blobKey,
    url: URL.createObjectURL(blob),
    objectUrl: true,
  };
}

function readSoundbarLibrary() {
  const storage = getSoundbarStorage();
  return storage?.readJSON
    ? storage.readJSON(SOUNDBAR_LIBRARY_KEY, {
        tracks: [],
        currentTrackId: '',
        loopTrack: false,
        volume: DEFAULT_PLAYER_VOLUME,
      })
    : {
        tracks: [],
        currentTrackId: '',
        loopTrack: false,
        volume: DEFAULT_PLAYER_VOLUME,
      };
}

function writeSoundbarLibrary() {
  const storage = getSoundbarStorage();
  if (!storage?.writeJSON) return false;
  return storage.writeJSON(SOUNDBAR_LIBRARY_KEY, {
    tracks: playlist
      .filter((track) => track?.source === 'uploaded' && track.blobKey)
      .map((track) => ({
        id: track.id,
        blobKey: track.blobKey,
        name: track.name,
        fileName: track.fileName || '',
        mimeType: track.mimeType || '',
        size: Number.isFinite(Number(track.size)) ? Number(track.size) : 0,
      })),
    currentTrackId: playlist[currentTrackIndex]?.id || '',
    loopTrack,
    volume: musicPlayer.volume,
  });
}

async function flushSoundbarLibrary() {
  const storage = getSoundbarStorage();
  if (!storage?.flush) return;
  try {
    await storage.flush();
  } catch (err) {
    console.warn('Failed to flush soundbar library metadata', err);
  }
}

function syncLoopButtonUI() {
  const btn = document.getElementById('soundLoopBtn');
  if (!btn) return;
  btn.classList.toggle('active', loopTrack);
  btn.title = loopTrack ? 'Loop (on)' : 'Loop';
  btn.setAttribute('aria-pressed', loopTrack ? 'true' : 'false');
}

function syncVolumeUI() {
  const input = document.getElementById('soundbarVolume');
  if (!input) return;
  input.value = String(musicPlayer.volume);
}

function syncSoundbarTrackPresentation(track = null) {
  const trackNameEl = document.getElementById('soundbarTrackName');
  const trackMetaEl = document.getElementById('soundbarTrackMeta');
  const coverEl = document.getElementById('soundbarCover');
  const name = track ? getSafeTrackName(track.name) : 'No track loaded';

  if (trackNameEl) trackNameEl.textContent = name;
  if (trackMetaEl) trackMetaEl.textContent = track ? 'Local track' : 'Your local music';
  if (coverEl) {
    const fallback = track
      ? Array.from(name).find((character) => /[\p{L}\p{N}]/u.test(character)) || '♪'
      : '♪';
    coverEl.classList.toggle('has-track', !!track);
    coverEl.innerHTML = '';
    const fallbackEl = document.createElement('span');
    fallbackEl.textContent = fallback.toUpperCase();
    coverEl.appendChild(fallbackEl);
  }
}

async function restorePersistedPlaylist() {
  const storage = getSoundbarStorage();
  if (window.SanctumStorageReady) {
    try {
      await window.SanctumStorageReady;
    } catch (err) {
      console.warn('Soundbar restore waited on storage init failure', err);
    }
  }

  const persisted = readSoundbarLibrary();
  const persistedVolume = Number(persisted?.volume);
  loopTrack = !!persisted?.loopTrack;
  if (Number.isFinite(persistedVolume)) {
    musicPlayer.volume = Math.max(0, Math.min(1, persistedVolume));
  }
  syncLoopButtonUI();
  syncVolumeUI();

  if (!storage?.getBlob) return;

  const restored = [];
  let didPruneMissingTracks = false;
  for (const trackMeta of Array.isArray(persisted?.tracks) ? persisted.tracks : []) {
    if (!trackMeta?.id) {
      didPruneMissingTracks = true;
      continue;
    }

    const blobKey = typeof trackMeta.blobKey === 'string' && trackMeta.blobKey
      ? trackMeta.blobKey
      : getUploadedTrackBlobKey(trackMeta.id);
    const blob = await storage.getBlob(blobKey);
    if (!(blob instanceof Blob)) {
      didPruneMissingTracks = true;
      continue;
    }

    restored.push(createUploadedTrackEntry(blob, {
      ...trackMeta,
      blobKey,
    }));
  }

  playlist = restored;
  if (!playlist.length) {
    currentTrackIndex = -1;
    syncSoundbarTrackPresentation();
    return;
  }

  const restoredIndex = playlist.findIndex((track) => track.id === persisted.currentTrackId);
  loadTrack(restoredIndex >= 0 ? restoredIndex : 0);

  if (didPruneMissingTracks) {
    writeSoundbarLibrary();
    await flushSoundbarLibrary();
  }
}

async function addUploadedTracks(files = []) {
  const storage = getSoundbarStorage();
  const pendingFiles = Array.from(files || []);
  if (!pendingFiles.length) return;

  if (!storage?.putBlob) {
    showAppToast?.('Persistent audio storage is not available in this browser.', 'info');
    return;
  }

  const firstNewIndex = playlist.length;
  let addedCount = 0;
  let failedCount = 0;

  for (const file of pendingFiles) {
    const trackId = createUploadedTrackId();
    const blobKey = getUploadedTrackBlobKey(trackId);
    const saved = await storage.putBlob(blobKey, file);
    if (!saved) {
      failedCount += 1;
      continue;
    }

    playlist.push(createUploadedTrackEntry(file, {
      id: trackId,
      blobKey,
      name: file.name.replace(/\.[^.]+$/, ''),
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
    }));
    addedCount += 1;
  }

  if (!addedCount) {
    showAppToast?.('Those tracks could not be saved locally.', 'info');
    return;
  }

  writeSoundbarLibrary();
  await flushSoundbarLibrary();

  if (currentTrackIndex < 0) {
    loadTrack(firstNewIndex);
  } else {
    renderPlaylist();
  }

  if (failedCount) {
    showAppToast?.(`Saved ${addedCount} track${addedCount === 1 ? '' : 's'}, ${failedCount} failed.`, 'info');
  }
}

function cleanupPlaylistObjectUrls() {
  playlist.forEach((track) => revokeTrackObjectUrl(track));
}

function getAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function createNoiseBuffer(ctx, type) {
  const bufferSize = ctx.sampleRate * 3;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  if (type === 'white') {
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  } else if (type === 'brown') {
    let last = 0;
    for (let i = 0; i < bufferSize; i++) {
      const w = Math.random() * 2 - 1;
      data[i] = (last + 0.02 * w) / 1.02;
      last = data[i];
      data[i] *= 3.5;
    }
  } else if (type === 'pink') {
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for (let i = 0; i < bufferSize; i++) {
      const w = Math.random() * 2 - 1;
      b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
      b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
      b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
      data[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11; b6=w*0.115926;
    }
  }
  return buffer;
}

function startAmbientSound(id) {
  const def = AMBIENT_SOUNDS.find(s => s.id === id);
  if (!def || activeSounds[id]) return;

  if (def.src) {
    // real audio file
    const audio = new Audio(def.src);
    audio.loop = true;
    audio.volume = 0.4;
    audio.play().catch(() => {});
    activeSounds[id] = { audio, volume: 0.4, isFile: true };
  } else {
    // generated noise fallback
    const ctx = getAudioContext();
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0;
    gainNode.connect(ctx.destination);

    const source = ctx.createBufferSource();
    source.buffer = createNoiseBuffer(ctx, def.noiseType || 'white');
    source.loop = true;

    let lastNode = source;
    if (def.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = def.filter.type;
      filter.frequency.value = def.filter.freq;
      filter.Q.value = def.filter.q || 1;
      source.connect(filter);
      lastNode = filter;
    }
    lastNode.connect(gainNode);

    let lfo = null;
    if (def.lfo) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = def.lfo.freq;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = def.lfo.depth * 0.5;
      lfo.connect(lfoGain);
      lfoGain.connect(gainNode.gain);
      lfo.start();
    }

    gainNode.gain.setTargetAtTime(0.4, ctx.currentTime, 0.3);
    source.start();
    activeSounds[id] = { source, gainNode, lfo, volume: 0.4, isFile: false };
  }

  updateAmbientTileUI(id, true);
  updateAmbientDots();
}

function stopAmbientSound(id) {
  const sound = activeSounds[id];
  if (!sound) return;

  if (sound.isFile) {
    sound.audio.pause();
    sound.audio.currentTime = 0;
  } else {
    const ctx = getAudioContext();
    sound.gainNode.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    setTimeout(() => {
      try { sound.source.stop(); } catch(e) {}
      try { sound.lfo?.stop(); } catch(e) {}
    }, 500);
  }

  delete activeSounds[id];
  updateAmbientTileUI(id, false);
  updateAmbientDots();
}

function setAmbientVolume(id, vol) {
  const sound = activeSounds[id];
  if (!sound) return;
  sound.volume = vol;
  if (sound.isFile) {
    sound.audio.volume = vol;
  } else {
    const ctx = getAudioContext();
    sound.gainNode.gain.setTargetAtTime(vol, ctx.currentTime, 0.05);
  }
}

function updateAmbientTileUI(id, active) {
  const tile = document.querySelector(`.ambient-tile[data-id="${id}"]`);
  if (!tile) return;
  tile.classList.toggle('active', active);
  const slider = tile.querySelector('.ambient-slider');
  if (slider) slider.style.display = active ? '' : 'none';
}

function updateAmbientDots() {
  const dotsEl = document.getElementById('soundbarAmbientDots');
  if (!dotsEl) return;
  const count = Object.keys(activeSounds).length;
  dotsEl.innerHTML = count > 0
    ? Array(Math.min(count, 4)).fill('<span class="ambient-dot"></span>').join('')
    : '';
}

function renderAmbientGrid() {
  const grid = document.getElementById('ambientGrid');
  if (!grid) return;
  grid.innerHTML = '';
  AMBIENT_SOUNDS.forEach(def => {
    const tile = document.createElement('div');
    tile.className = 'ambient-tile';
    tile.dataset.id = def.id;
    tile.innerHTML = `
      <div class="ambient-tile-top">
        <span class="ambient-tile-icon">${def.icon}</span>
        <span class="ambient-tile-label">${def.label}</span>
      </div>
      <input type="range" class="ambient-slider" min="0" max="1" step="0.01" value="0.4" style="display:none;" />
    `;
    tile.addEventListener('click', (e) => {
      if (e.target.classList.contains('ambient-slider')) return;
      activeSounds[def.id] ? stopAmbientSound(def.id) : startAmbientSound(def.id);
    });
    tile.querySelector('.ambient-slider').addEventListener('input', (e) => {
      e.stopPropagation();
      setAmbientVolume(def.id, parseFloat(e.target.value));
    });
    grid.appendChild(tile);
  });
}

// Music player
function renderPlaylist() {
  const el = document.getElementById('soundbarPlaylist');
  if (!el) return;
  el.innerHTML = '';
  if (!playlist.length) {
    el.innerHTML = '<div class="soundbar-empty">No tracks yet.</div>';
    return;
  }
  playlist.forEach((track, i) => {
    const item = document.createElement('div');
    item.className = 'soundbar-playlist-item' + (i === currentTrackIndex ? ' active' : '');
    item.innerHTML = `
      <span class="playlist-icon">♪</span>
      <span class="playlist-name">${track.name}</span>
      <button class="playlist-remove" data-idx="${i}">✕</button>
    `;
    item.addEventListener('click', async (e) => {
      if (e.target.classList.contains('playlist-remove')) {
        const idx = parseInt(e.target.dataset.idx, 10);
        if (!Number.isFinite(idx) || idx < 0 || idx >= playlist.length) return;

        const track = playlist[idx];
        const isCurrentTrack = idx === currentTrackIndex;
        const wasPlaying = isCurrentTrack && !musicPlayer.paused;

        if (isCurrentTrack) {
          musicPlayer.pause();
          musicPlayer.removeAttribute('src');
          musicPlayer.load();
        }

        revokeTrackObjectUrl(track);
        if (track?.source === 'uploaded' && track.blobKey) {
          await getSoundbarStorage()?.removeBlob?.(track.blobKey);
        }

        playlist.splice(idx, 1);

        if (!playlist.length) {
          currentTrackIndex = -1;
          musicPlayer.src = '';
          syncSoundbarTrackPresentation();
          const playButton = document.getElementById('soundPlayBtn');
          if (playButton) {
            playButton.textContent = '▶';
            playButton.setAttribute('aria-label', 'Play');
          }
          renderPlaylist();
          writeSoundbarLibrary();
          await flushSoundbarLibrary();
          return;
        }

        if (isCurrentTrack) {
          const nextIndex = Math.min(idx, playlist.length - 1);
          loadTrack(nextIndex);
          if (wasPlaying) {
            playMusic();
          } else {
            pauseMusic();
          }
        } else {
          if (currentTrackIndex > idx) currentTrackIndex -= 1;
          renderPlaylist();
          writeSoundbarLibrary();
        }

        await flushSoundbarLibrary();
        return;
      }
      loadTrack(i);
      playMusic();
    });
    el.appendChild(item);
  });
}

function loadTrack(index) {
  if (index < 0 || index >= playlist.length) return;
  currentTrackIndex = index;
  musicPlayer.src = playlist[index].url;
  syncSoundbarTrackPresentation(playlist[index]);
  renderPlaylist();
  writeSoundbarLibrary();
}

function playMusic() {
  if (!playlist.length) return;
  if (currentTrackIndex < 0) loadTrack(0);
  musicPlayer.play().catch(() => {});
  const playButton = document.getElementById('soundPlayBtn');
  if (playButton) {
    playButton.textContent = '⏸';
    playButton.setAttribute('aria-label', 'Pause');
  }
}

function pauseMusic() {
  musicPlayer.pause();
  const playButton = document.getElementById('soundPlayBtn');
  if (playButton) {
    playButton.textContent = '▶';
    playButton.setAttribute('aria-label', 'Play');
  }
}

musicPlayer.addEventListener('ended', () => {
  if (loopTrack) {
    musicPlayer.currentTime = 0;
    playMusic();
  } else if (playlist.length > 1) {
    loadTrack((currentTrackIndex + 1) % playlist.length);
    playMusic();
  } else {
    const playButton = document.getElementById('soundPlayBtn');
    if (playButton) {
      playButton.textContent = '▶';
      playButton.setAttribute('aria-label', 'Play');
    }
  }
});

document.getElementById('soundLoopBtn')?.addEventListener('click', () => {
  loopTrack = !loopTrack;
  syncLoopButtonUI();
  writeSoundbarLibrary();
});

musicPlayer.addEventListener('timeupdate', () => {
  if (!musicPlayer.duration) return;
  const pct = (musicPlayer.currentTime / musicPlayer.duration) * 100;
  const bar = document.getElementById('soundbarProgressBar');
  if (bar) bar.style.width = `${pct}%`;
});

document.getElementById('soundPlayBtn')?.addEventListener('click', () => {
  musicPlayer.paused ? playMusic() : pauseMusic();
});

document.getElementById('soundPrevBtn')?.addEventListener('click', () => {
  if (!playlist.length) return;
  loadTrack((currentTrackIndex - 1 + playlist.length) % playlist.length);
  playMusic();
});

document.getElementById('soundNextBtn')?.addEventListener('click', () => {
  if (!playlist.length) return;
  loadTrack((currentTrackIndex + 1) % playlist.length);
  playMusic();
});

document.getElementById('soundbarVolume')?.addEventListener('input', (e) => {
  musicPlayer.volume = parseFloat(e.target.value);
  writeSoundbarLibrary();
});

document.getElementById('soundbarProgressWrap')?.addEventListener('click', (e) => {
  if (!musicPlayer.duration) return;
  const rect = e.currentTarget.getBoundingClientRect();
  musicPlayer.currentTime = ((e.clientX - rect.left) / rect.width) * musicPlayer.duration;
});

document.getElementById('soundUploadBtn')?.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*';
  input.multiple = true;
  input.onchange = async () => {
    await addUploadedTracks(input.files);
  };
  input.click();
});

document.getElementById('soundbarToggleBtn')?.addEventListener('click', () => {
  const panel = document.getElementById('soundbarPanel');
  const btn = document.getElementById('soundbarToggleBtn');
  if (!panel || !btn) return;

  const isOpen = panel.classList.contains('open');

  const bar = document.getElementById('soundbarBar');

  if (isOpen) {
    panel.classList.remove('open');
    bar?.classList.remove('panel-open');
    btn.textContent = '⌃';
    btn.setAttribute('aria-label', 'Open music controls');
    btn.setAttribute('aria-expanded', 'false');
    soundbarExpanded = false;

    if (typeof setUIState === "function") {
      const state = getUIState?.();
      if (state?.openPanel === "soundbarPanel") {
        setUIState({ openPanel: null });
      }
    }
    return;
  }

  soundbarExpanded = true;
  bar?.classList.add('panel-open');
  btn.setAttribute('aria-label', 'Close music controls');
  btn.setAttribute('aria-expanded', 'true');

  if (typeof openPanel === "function") {
    openPanel('soundbarPanel', panel);
  } else {
    panel.classList.add('open');
  }

  btn.textContent = '⌄';
});

document.querySelectorAll('.soundbar-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.soundbar-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('soundbarMusicTab').classList.toggle('hidden', tab.dataset.tab !== 'music');
    document.getElementById('soundbarAmbienceTab').classList.toggle('hidden', tab.dataset.tab !== 'ambience');
  });
});

window.addEventListener('beforeunload', cleanupPlaylistObjectUrls);

async function initSoundbar() {
  renderAmbientGrid();
  syncSoundbarTrackPresentation();
  await restorePersistedPlaylist();
  renderPlaylist();
  syncLoopButtonUI();
  syncVolumeUI();
}

initSoundbar();
