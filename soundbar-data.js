(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./project-data.js') : root?.SanctumProjects);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SanctumMusicData = api;
})(typeof window !== 'undefined' ? window : globalThis, function (Projects) {
  const MASTER = 'all';
  function normalize(raw = {}) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const seen = new Set(), tracks = (Array.isArray(raw.tracks) ? raw.tracks : []).filter(track => {
      if (!track || typeof track.id !== 'string' || !track.id || seen.has(track.id)) return false;
      seen.add(track.id); return true;
    }).map(track => ({ ...track }));
    const names = new Set([MASTER]);
    const playlists = (Array.isArray(raw.playlists) ? raw.playlists : []).filter(list => {
      if (!list || typeof list.id !== 'string' || !list.id || names.has(list.id)) return false;
      names.add(list.id); return true;
    }).map(list => ({ id: list.id, name: String(list.name || 'Untitled playlist').trim() || 'Untitled playlist',
      trackIds: [...new Set(Array.isArray(list.trackIds) ? list.trackIds : [])].filter(id => seen.has(id)) }));
    return { version: 2, tracks, playlists,
      assignments: Object.fromEntries(Object.entries(raw.assignments || {}).filter(([scope,id]) => scope && names.has(id))),
      manualPlaylistId: names.has(raw.manualPlaylistId) ? raw.manualPlaylistId : MASTER,
      followPage: raw.followPage !== false, currentTrackId: seen.has(raw.currentTrackId) ? raw.currentTrackId : '',
      loopTrack: !!raw.loopTrack, volume: Number.isFinite(raw.volume) ? Math.max(0, Math.min(1, raw.volume)) : 1 };
  }
  function path(records, pageId) {
    const byId = new Map(records.map(record => [record.id, record])), visited = new Set(), result = [];
    let id = pageId || 'home';
    while (id && !visited.has(id)) {
      visited.add(id);
      const record = id === 'home' ? { id, title: 'Home', type: 'home' } : byId.get(id);
      if (!record) break;
      result.push(record);
      id = record.parent || (record.id === 'home' ? '' : 'home');
    }
    if (!visited.has('home')) result.push({ id: 'home', title: 'Home', type: 'home' });
    return result;
  }
  function resolve(library, records, pageId) {
    const data = normalize(library);
    if (!data.followPage) return { playlistId: data.manualPlaylistId, scope: null, following: false };
    for (const scope of path(records, pageId)) if (Object.hasOwn(data.assignments, scope.id)) {
      return { playlistId: data.assignments[scope.id], scope, following: true };
    }
    return { playlistId: MASTER, scope: null, following: true };
  }
  function trackIds(library, playlistId = MASTER) {
    const data = normalize(library);
    return playlistId === MASTER ? data.tracks.map(track => track.id) : data.playlists.find(list => list.id === playlistId)?.trackIds || [];
  }
  function removeTrack(library, id) {
    const data = normalize(library);
    data.tracks = data.tracks.filter(track => track.id !== id);
    data.playlists.forEach(list => { list.trackIds = list.trackIds.filter(trackId => trackId !== id); });
    if (data.currentTrackId === id) data.currentTrackId = '';
    return data;
  }
  function removePlaylist(library, id) {
    const data = normalize(library);
    data.playlists = data.playlists.filter(list => list.id !== id);
    data.assignments = Object.fromEntries(Object.entries(data.assignments).filter(([,listId]) => listId !== id));
    if (data.manualPlaylistId === id) data.manualPlaylistId = MASTER;
    return data;
  }
  function scopeKind(record = {}) {
    if (Projects && (Projects.role(record) !== 'page' || record.organizationRole)) return Projects.role(record) === 'detail' ? 'Page' : Projects.label(record);
    if (record.type === 'domain') return 'Domain';
    if (record.containerType === 'hub') return 'Hub';
    if (record.containerType === 'project' || record.isScopeBoundary === true || record.definesScope === true) return 'Project';
    if (record.containerType === 'database-row') return 'Database page';
    return record.id === 'home' ? 'Home' : 'Page';
  }
  function moveEntry(entries, id, targetId, position = 'before', key = value => value) {
    const next = entries.slice(), from = next.findIndex(value => key(value) === id);
    if (id === targetId || from < 0 || !next.some(value => key(value) === targetId)) return next;
    const [entry] = next.splice(from, 1);
    const to = next.findIndex(value => key(value) === targetId);
    next.splice(to + (position === 'after' ? 1 : 0), 0, entry);
    return next;
  }
  function moveTrack(library, playlistId, id, targetId, position) {
    const data = normalize(library);
    if (playlistId === MASTER) data.tracks = moveEntry(data.tracks, id, targetId, position, track => track.id);
    else {
      const list = data.playlists.find(list => list.id === playlistId);
      if (list) list.trackIds = moveEntry(list.trackIds, id, targetId, position);
    }
    return data;
  }
  return { MASTER, normalize, path, resolve, trackIds, removeTrack, removePlaylist, scopeKind, moveTrack };
});
