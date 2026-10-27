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
const MusicData = window.SanctumMusicData;
let musicLibrary = MusicData.normalize();
let musicSelection = { playlistId: 'all', scope: null, following: true };
let soundbarPageId = 'home';
let soundbarReady = false;
const musicEsc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

function musicTrackMetadata() {
  return playlist.filter(track => track?.source === 'uploaded' && track.blobKey).map(track => ({
    id: track.id, blobKey: track.blobKey, name: track.name, fileName: track.fileName || '',
    mimeType: track.mimeType || '', size: Number(track.size) || 0,
  }));
}

function musicRecords() {
  return window.getVaultRecords?.() || [...(window.userDomains || []).map(record => ({ ...record, type: 'domain', parent: 'home' })), ...(window.userPages || [])];
}

function musicPlaylistName(id = musicSelection.playlistId) {
  return id === 'all' ? 'Master library' : musicLibrary.playlists.find(list => list.id === id)?.name || 'Master library';
}

function musicQueueIndices() {
  const indices = new Map(playlist.map((track, index) => [track.id, index]));
  return MusicData.trackIds({ ...musicLibrary, tracks: musicTrackMetadata() }, musicSelection.playlistId)
    .map(id => indices.get(id)).filter(index => index !== undefined && playlist[index].url);
}

function reconcileMusicQueue(resumePlaying = !musicPlayer.paused) {
  musicSelection = MusicData.resolve({ ...musicLibrary, tracks: musicTrackMetadata() }, musicRecords(), soundbarPageId);
  const queue = musicQueueIndices();
  if (!queue.includes(currentTrackIndex)) {
    pauseMusic();
    if (queue.length) { loadTrack(queue[0]); if (resumePlaying) playMusic(); }
    else {
      currentTrackIndex = -1; musicPlayer.removeAttribute('src'); musicPlayer.load();
      const progress = document.getElementById('soundbarProgressBar'); if (progress) progress.style.width = '0%';
      writeSoundbarLibrary();
    }
  }
  syncSoundbarTrackPresentation(playlist[currentTrackIndex]);
  renderPlaylist();
}

function commitMusicLibrary(next) {
  const before = musicLibrary;
  musicLibrary = MusicData.normalize({ ...next, tracks: musicTrackMetadata() });
  if (writeSoundbarLibrary() === false) {
    musicLibrary = before;
    renderPlaylist();
    window.showAppToast?.('Could not save the music library.', 'info');
    return false;
  }
  reconcileMusicQueue();
  void flushSoundbarLibrary();
  return true;
}

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
  if (!soundbarReady) return true;
  const storage = getSoundbarStorage();
  if (!storage?.writeJSON) return false;
  return storage.writeJSON(SOUNDBAR_LIBRARY_KEY, {
    ...musicLibrary,
    tracks: musicTrackMetadata(),
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
  if (trackMetaEl) trackMetaEl.textContent = track ? `${musicPlaylistName()} · Local track` : musicPlaylistName();
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

  const persisted = MusicData.normalize(readSoundbarLibrary());
  musicLibrary = persisted;
  const persistedVolume = Number(persisted?.volume);
  loopTrack = !!persisted?.loopTrack;
  if (Number.isFinite(persistedVolume)) {
    musicPlayer.volume = Math.max(0, Math.min(1, persistedVolume));
  }
  syncLoopButtonUI();
  syncVolumeUI();

  if (!storage?.getBlob) return;

  const restored = [];
  for (const trackMeta of Array.isArray(persisted?.tracks) ? persisted.tracks : []) {
    const blobKey = typeof trackMeta.blobKey === 'string' && trackMeta.blobKey
      ? trackMeta.blobKey
      : getUploadedTrackBlobKey(trackMeta.id);
    const blob = await storage.getBlob(blobKey);
    if (!(blob instanceof Blob)) {
      restored.push({ ...trackMeta, blobKey, source: 'uploaded', url: '', objectUrl: false });
      continue;
    }

    restored.push(createUploadedTrackEntry(blob, {
      ...trackMeta,
      blobKey,
    }));
  }

  playlist = restored;
  currentTrackIndex = playlist.findIndex(track => track.id === persisted.currentTrackId);
  musicSelection = MusicData.resolve(musicLibrary, musicRecords(), soundbarPageId);
  if (currentTrackIndex >= 0 && musicQueueIndices().includes(currentTrackIndex)) loadTrack(currentTrackIndex);
  else currentTrackIndex = -1;
  reconcileMusicQueue(false);

}

async function addUploadedTracks(files = []) {
  if (!soundbarReady) { window.showAppToast?.('The music library is still loading.', 'info'); return; }
  const storage = getSoundbarStorage();
  const pendingFiles = Array.from(files || []);
  if (!pendingFiles.length) return;

  if (!storage?.putBlob) {
    showAppToast?.('Persistent audio storage is not available in this browser.', 'info');
    return;
  }

  const targetPlaylistId = musicSelection.playlistId;
  const addedIds = [];
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
    addedIds.push(trackId);
    addedCount += 1;
  }

  if (!addedCount) {
    showAppToast?.('Those tracks could not be saved locally.', 'info');
    return;
  }

  const targetPlaylist = musicLibrary.playlists.find(list => list.id === targetPlaylistId);
  if (targetPlaylist) targetPlaylist.trackIds.push(...addedIds);
  writeSoundbarLibrary();
  await flushSoundbarLibrary();

  reconcileMusicQueue();

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

function renderMusicLibraryControls() {
  const host = document.getElementById('soundbarLibraryControls');
  if (!host) return;
  const source = musicSelection.scope;
  const scopeLabel = source ? `${MusicData.scopeKind(source)}: ${source.title}` : '';
  host.innerHTML = `<div class="soundbar-library-row"><select aria-label="Music playlist" ${!soundbarReady ? 'disabled' : ''}>
    <option value="all">Master library · ${playlist.length}</option>${musicLibrary.playlists.map(list => `<option value="${musicEsc(list.id)}">${musicEsc(list.name)} · ${list.trackIds.length}</option>`).join('')}</select>
    <label class="soundbar-follow"><input type="checkbox" ${musicLibrary.followPage ? 'checked' : ''} ${!soundbarReady ? 'disabled' : ''}>Follow page</label></div>
    <div class="soundbar-library-status">${musicSelection.following ? source ? `Following ${musicEsc(scopeLabel)}` : 'Following page · no assignment, using master library' : 'Manual selection · stays on this playlist'}</div>
    <div class="soundbar-library-buttons"><button type="button" data-music-action="new">New playlist</button>${musicSelection.playlistId !== 'all' ? '<button type="button" data-music-action="edit">Edit playlist</button>' : ''}<button type="button" data-music-action="assign">Assign to level</button></div>`;
  host.querySelector('select').value = musicSelection.playlistId;
  host.querySelector('select').onchange = e => {
    commitMusicLibrary({ ...musicLibrary, manualPlaylistId: e.target.value, followPage: false });
  };
  host.querySelector('input').onchange = e => {
    commitMusicLibrary({ ...musicLibrary, followPage: e.target.checked, manualPlaylistId: musicSelection.playlistId });
  };
  host.querySelectorAll('[data-music-action]').forEach(button => {
    button.disabled = !soundbarReady;
    button.onclick = () => button.dataset.musicAction === 'assign' ? openMusicAssignment() : openMusicPlaylistEditor(button.dataset.musicAction === 'edit' ? musicSelection.playlistId : '');
  });
}

function musicScopeOptions() {
  const records = musicRecords();
  const current = records.find(record => record.id === soundbarPageId);
  const groups = [['Domains', 'Domain'], ['Projects', 'Project'], ['Hubs', 'Hub'], ['Pages', 'Page'], ['Database pages', 'Database page']];
  return `${current ? `<option value="${musicEsc(current.id)}">Current ${MusicData.scopeKind(current).toLowerCase()} · ${musicEsc(current.title)}</option>` : ''}<option value="home">Home · everywhere</option>${groups.map(([label, kind]) => {
    const entries = records.filter(record => MusicData.scopeKind(record) === kind);
    return entries.length ? `<optgroup label="${label}">${entries.sort((a,b) => String(a.title).localeCompare(String(b.title))).map(record => {
    const parents = MusicData.path(records, record.id).slice(1).filter(p => p.id !== 'home').reverse().map(p => p.title).join(' / ');
    return `<option value="${musicEsc(record.id)}">${musicEsc(record.title)}${parents ? ` — ${musicEsc(parents)}` : ''}</option>`;
  }).join('')}</optgroup>` : '';
  }).join('')}`;
}

function musicDialog(title, contents) {
  document.querySelector('.soundbar-library-dialog')?.close();
  const dialog = document.createElement('dialog');
  dialog.className = 'soundbar-library-dialog';
  dialog.setAttribute('aria-label', title);
  dialog.innerHTML = `<header><h2>${musicEsc(title)}</h2><button type="button" data-close aria-label="Close music dialog">×</button></header>${contents}`;
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('keydown', e => e.stopPropagation());
  document.body.append(dialog); dialog.showModal();
  return dialog;
}

function openMusicPlaylistEditor(id = '') {
  const list = musicLibrary.playlists.find(list => list.id === id), selected = new Set(list?.trackIds || []);
  const dialog = musicDialog(list ? 'Edit playlist' : 'New playlist', `<form>
    <label>Playlist name<input name="name" required maxlength="120" value="${musicEsc(list?.name || '')}" placeholder="e.g. Beneath the Veins"></label>
    <label>Use for (optional)<select name="scope"><option value="">Choose a level…</option>${musicScopeOptions()}</select></label>
    <p>Choose music from your master library. Tracks can belong to several playlists.</p>
    <input class="soundbar-track-search" type="search" aria-label="Find music" placeholder="Find music…">
    <div class="soundbar-track-picker">${playlist.length ? playlist.map(track => `<label><input type="checkbox" name="tracks" value="${musicEsc(track.id)}" ${selected.has(track.id) ? 'checked' : ''}><span>${musicEsc(track.name)}</span></label>`).join('') : '<p>Add music to the master library or upload it after creating this playlist.</p>'}</div>
    <p role="alert"></p><footer>${list ? '<button type="button" data-delete>Delete playlist</button>' : '<span></span>'}<button type="submit">Save playlist</button></footer></form>`);
  const form = dialog.querySelector('form');
  form.querySelector('[type="search"]').oninput = e => {
    const query = e.target.value.trim().toLowerCase();
    form.querySelectorAll('.soundbar-track-picker label').forEach(label => { label.hidden = !label.textContent.toLowerCase().includes(query); });
  };
  form.onsubmit = e => {
    e.preventDefault();
    const name = form.elements.name.value.trim();
    if (!name) { form.querySelector('[role="alert"]').textContent = 'Give the playlist a name.'; return; }
    const chosen = [...form.querySelectorAll('input[name="tracks"]:checked')].map(input => input.value);
    const trackIds = [...(list?.trackIds || []).filter(id => chosen.includes(id)), ...chosen.filter(id => !selected.has(id))];
    const playlistId = id || `music-list-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const updated = { id: playlistId, name, trackIds };
    const next = { ...musicLibrary, playlists: list ? musicLibrary.playlists.map(p => p.id === playlistId ? updated : p) : [...musicLibrary.playlists, updated],
      assignments: { ...musicLibrary.assignments }, manualPlaylistId: list ? musicLibrary.manualPlaylistId : playlistId, followPage: list ? musicLibrary.followPage : false };
    if (form.elements.scope.value) { next.assignments[form.elements.scope.value] = playlistId; next.followPage = true; }
    if (commitMusicLibrary(next)) dialog.close();
  };
  form.querySelector('[data-delete]')?.addEventListener('click', () => {
    if (!window.confirm(`Delete “${list.name}”? Its music stays in the master library.`)) return;
    if (commitMusicLibrary(MusicData.removePlaylist(musicLibrary, id))) dialog.close();
  });
  form.elements.name.focus();
}

function openMusicAssignment() {
  const dialog = musicDialog('Assign playlist to a level', `<form>
    <label>Level<select name="scope">${musicScopeOptions()}</select></label>
    <label>Playlist<select name="playlist"><option value="">Inherit from parent</option><option value="all">Master library</option>${musicLibrary.playlists.map(list => `<option value="${musicEsc(list.id)}">${musicEsc(list.name)}</option>`).join('')}</select></label>
    <p>Applies to this level and everything under it. A more specific assignment takes priority.</p>
    <footer><span></span><button type="submit">Save assignment</button></footer></form>`);
  const form = dialog.querySelector('form');
  form.elements.scope.value = [...form.elements.scope.options].some(option => option.value === soundbarPageId) ? soundbarPageId : 'home';
  form.elements.playlist.value = musicSelection.playlistId;
  form.elements.scope.onchange = () => { form.elements.playlist.value = musicLibrary.assignments[form.elements.scope.value] || ''; };
  form.onsubmit = e => {
    e.preventDefault();
    const assignments = { ...musicLibrary.assignments };
    if (form.elements.playlist.value) assignments[form.elements.scope.value] = form.elements.playlist.value;
    else delete assignments[form.elements.scope.value];
    if (commitMusicLibrary({ ...musicLibrary, assignments, followPage: true })) dialog.close();
  };
  form.elements.scope.focus();
}

function bindMusicReordering(host, selector, ids, onMove) {
  const clearIndicators = () => host.querySelectorAll('.music-drop-before, .music-drop-after').forEach(row => row.classList.remove('music-drop-before', 'music-drop-after'));
  host.querySelectorAll(selector).forEach(row => {
    const handle = row.querySelector('[data-music-reorder]'), id = row.dataset.musicOrderId;
    let drag = null;
    const destination = event => {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(selector);
      if (!target || !host.contains(target) || target === row) return null;
      const rect = target.getBoundingClientRect();
      return { row: target, id: target.dataset.musicOrderId, position: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after' };
    };
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      handle.focus({preventScroll:true});
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.moved ||= Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4;
      if (!drag.moved) return;
      clearIndicators();
      const target = destination(event);
      target?.row.classList.add(`music-drop-${target.position}`);
    });
    handle.addEventListener('pointerup', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault(); event.stopPropagation();
      const target = drag.moved ? destination(event) : null;
      drag = null; clearIndicators();
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      if (target) onMove(id, target.id, target.position);
    });
    handle.addEventListener('lostpointercapture', () => { drag = null; clearIndicators(); });
    handle.addEventListener('pointercancel', () => { drag = null; clearIndicators(); });
    handle.addEventListener('keydown', event => {
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const index = ids.indexOf(id), next = index + (event.key === 'ArrowUp' ? -1 : 1);
      if (next < 0 || next >= ids.length) return;
      onMove(id, ids[next], next < index ? 'before' : 'after');
      [...host.querySelectorAll(selector)].find(row => row.dataset.musicOrderId === id)?.querySelector('[data-music-reorder]')?.focus({preventScroll:true});
    });
  });
}

function reorderMusicTrack(id, targetId, position) {
  const next = MusicData.moveTrack({ ...musicLibrary, tracks: musicTrackMetadata() }, musicSelection.playlistId, id, targetId, position);
  const before = playlist, oldIndex = currentTrackIndex, currentId = playlist[currentTrackIndex]?.id;
  if (musicSelection.playlistId === 'all') {
    const byId = new Map(playlist.map(track => [track.id, track]));
    playlist = next.tracks.map(track => byId.get(track.id));
    currentTrackIndex = playlist.findIndex(track => track.id === currentId);
  }
  if (!commitMusicLibrary(next)) {
    playlist = before; currentTrackIndex = oldIndex; renderPlaylist(); return false;
  }
  return true;
}

// Music player
function renderPlaylist() {
  renderMusicLibraryControls();
  const el = document.getElementById('soundbarPlaylist');
  if (!el) return;
  el.innerHTML = '';
  const trackIds = MusicData.trackIds({ ...musicLibrary, tracks: musicTrackMetadata() }, musicSelection.playlistId);
  if (!trackIds.length) {
    el.innerHTML = `<div class="soundbar-empty">${musicSelection.playlistId === 'all' ? 'No music yet. Add your first tracks.' : 'This playlist is empty. Edit it to choose music, or add new tracks.'}</div>`;
    return;
  }
  trackIds.forEach(id => {
    const i = playlist.findIndex(track => track.id === id), track = playlist[i];
    if (!track) return;
    const item = document.createElement('div');
    item.className = 'soundbar-playlist-item' + (i === currentTrackIndex ? ' active' : '');
    item.dataset.musicOrderId = id;
    item.innerHTML = `
      <button type="button" class="music-reorder-handle" data-music-reorder aria-label="Reorder song: ${musicEsc(track.name)}" title="Drag to reorder, or use ↑ and ↓">⠿</button>
      <button type="button" class="playlist-name" ${!track.url ? 'disabled' : ''} aria-label="Play ${musicEsc(track.name)}" title="${track.url ? musicEsc(track.name) : 'Audio file unavailable'}">${musicEsc(track.name)}${!track.url ? ' · file unavailable' : ''}</button>
      <button type="button" class="playlist-remove" data-idx="${i}" aria-label="${musicSelection.playlistId === 'all' ? 'Delete from master library' : 'Remove from playlist'}: ${musicEsc(track.name)}" title="${musicSelection.playlistId === 'all' ? 'Delete from master library' : 'Remove from this playlist'}">✕</button>
    `;
    item.addEventListener('click', async (e) => {
      if (e.target.closest('[data-music-reorder]')) return;
      if (e.target.classList.contains('playlist-remove')) {
        const idx = parseInt(e.target.dataset.idx, 10);
        if (!Number.isFinite(idx) || idx < 0 || idx >= playlist.length) return;

        const track = playlist[idx];
        if (musicSelection.playlistId !== 'all') {
          const lists = musicLibrary.playlists.map(list => list.id === musicSelection.playlistId ? { ...list, trackIds: list.trackIds.filter(id => id !== track.id) } : list);
          commitMusicLibrary({ ...musicLibrary, playlists: lists }); return;
        }
        if (!window.confirm(`Delete “${track.name}” from the master library and all playlists?`)) return;
        const isCurrentTrack = idx === currentTrackIndex;
        const wasPlaying = isCurrentTrack && !musicPlayer.paused;

        if (isCurrentTrack) {
          musicPlayer.pause();
          musicPlayer.removeAttribute('src');
          musicPlayer.load();
        }

        const before = [...playlist], oldIndex = currentTrackIndex, oldLibrary = musicLibrary;
        playlist.splice(idx, 1);
        musicLibrary = MusicData.removeTrack(musicLibrary, track.id);
        currentTrackIndex = before[oldIndex]?.id === track.id ? -1 : playlist.findIndex(t => t.id === before[oldIndex]?.id);
        if (writeSoundbarLibrary() === false) {
          playlist = before; musicLibrary = oldLibrary; currentTrackIndex = oldIndex;
          if (isCurrentTrack) { loadTrack(idx); if (wasPlaying) playMusic(); }
          window.showAppToast?.('Could not save the music library.', 'info'); return;
        }
        revokeTrackObjectUrl(track);
        if (track?.source === 'uploaded' && track.blobKey) await getSoundbarStorage()?.removeBlob?.(track.blobKey);
        reconcileMusicQueue(isCurrentTrack ? wasPlaying : !musicPlayer.paused);
        await flushSoundbarLibrary(); return;

      }
      if (!track.url) return;
      loadTrack(i);
      playMusic();
    });
    el.appendChild(item);
  });
  bindMusicReordering(el, '.soundbar-playlist-item', trackIds, reorderMusicTrack);
}

function loadTrack(index) {
  if (index < 0 || index >= playlist.length || !playlist[index].url || !musicQueueIndices().includes(index)) return;
  currentTrackIndex = index;
  musicPlayer.src = playlist[index].url;
  syncSoundbarTrackPresentation(playlist[index]);
  renderPlaylist();
  writeSoundbarLibrary();
}

function playMusic() {
  const queue = musicQueueIndices();
  if (!queue.length) return;
  if (!queue.includes(currentTrackIndex)) loadTrack(queue[0]);
  const playingIndex = currentTrackIndex;
  musicPlayer.play().catch(() => { if (currentTrackIndex === playingIndex && musicPlayer.paused) pauseMusic(); });
  const playButton = document.getElementById('soundPlayBtn');
  if (playButton) {
    playButton.innerHTML = getUIIcon('pause');
    playButton.setAttribute('aria-label', 'Pause');
  }
}

function pauseMusic() {
  musicPlayer.pause();
  const playButton = document.getElementById('soundPlayBtn');
  if (playButton) {
    playButton.innerHTML = getUIIcon('play');
    playButton.setAttribute('aria-label', 'Play');
  }
}

musicPlayer.addEventListener('ended', () => {
  if (loopTrack) {
    musicPlayer.currentTime = 0;
    playMusic();
  } else if (musicQueueIndices().length > 1) {
    advanceMusicTrack(1);
    playMusic();
  } else {
    const playButton = document.getElementById('soundPlayBtn');
    if (playButton) {
      playButton.innerHTML = getUIIcon('play');
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
  advanceMusicTrack(-1);
  playMusic();
});

document.getElementById('soundNextBtn')?.addEventListener('click', () => {
  advanceMusicTrack(1);
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
    panel.setAttribute('aria-hidden', 'true'); panel.inert = true;
    bar?.classList.remove('panel-open');
    btn.innerHTML = getUIIcon('chevron-up');
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
  panel.setAttribute('aria-hidden', 'false'); panel.inert = false;
  bar?.classList.add('panel-open');
  btn.setAttribute('aria-label', 'Close music controls');
  btn.setAttribute('aria-expanded', 'true');

  if (typeof openPanel === "function") {
    openPanel('soundbarPanel', panel);
  } else {
    panel.classList.add('open');
  }

  btn.innerHTML = getUIIcon('chevron-down');
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

function advanceMusicTrack(direction) {
  const queue = musicQueueIndices();
  if (!queue.length) return;
  const position = queue.indexOf(currentTrackIndex);
  loadTrack(queue[(position + direction + queue.length) % queue.length]);
}

window.SanctumSoundbar = {
  pageChanged(pageId) { soundbarPageId = pageId || 'home'; if (soundbarReady) reconcileMusicQueue(); },
  refreshScopes() { if (soundbarReady) reconcileMusicQueue(); },
};

async function initSoundbar() {
  renderAmbientGrid();
  syncSoundbarTrackPresentation();
  await restorePersistedPlaylist();
  soundbarReady = true;
  reconcileMusicQueue(false);
  writeSoundbarLibrary();
  renderPlaylist();
  syncLoopButtonUI();
  syncVolumeUI();
}

initSoundbar();
