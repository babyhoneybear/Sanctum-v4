const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const M = require('../soundbar-data.js');
const backup = require('../backup-data.js');
const records = [{id:'world',title:'World',type:'domain',parent:'home'}, {id:'hub',title:'Stories',containerType:'hub',parent:'world'},
  {id:'project',title:'Novel',containerType:'project',parent:'hub'}, {id:'chapter',title:'Chapter',parent:'project'}, {id:'other',title:'Other',parent:'world'}];
const library = () => M.normalize({ tracks:[{id:'a',blobKey:'soundbar-track:a',name:'A'},{id:'b',blobKey:'soundbar-track:b',name:'B'},{id:'c',blobKey:'soundbar-track:c',name:'C'}],
  playlists:[{id:'world-list',name:'World music',trackIds:['a','b']},{id:'novel-list',name:'Novel music',trackIds:['b','c']}],
  assignments:{world:'world-list',project:'novel-list'},currentTrackId:'a' });

test('old music libraries migrate without changing track metadata, volume or loop state', () => {
  const legacy={tracks:[{id:'old',name:'Original',blobKey:'soundbar-track:old',size:123}],currentTrackId:'old',volume:.4,loopTrack:true};
  const before=JSON.stringify(legacy), migrated=M.normalize(legacy);
  assert.deepEqual(migrated.tracks,legacy.tracks); assert.equal(migrated.currentTrackId,'old');
  assert.equal(migrated.volume,.4); assert.equal(migrated.loopTrack,true);
  assert.deepEqual(M.trackIds(migrated),['old']); assert.deepEqual(migrated.playlists,[]);
  assert.equal(JSON.stringify(legacy),before);
});
test('the nearest level wins, an explicit master assignment overrides its parent, and inheritance resumes when removed', () => {
  const data=library();
  assert.equal(M.resolve(data,records,'chapter').playlistId,'novel-list');
  assert.equal(M.resolve(data,records,'other').playlistId,'world-list');
  data.assignments.chapter='all'; assert.equal(M.resolve(data,records,'chapter').playlistId,'all');
  delete data.assignments.chapter; delete data.assignments.project;
  assert.equal(M.resolve(data,records,'chapter').scope.id,'world');
  data.assignments.home='novel-list'; assert.equal(M.resolve(data,records,'unknown').playlistId,'novel-list');
});
test('manual selection survives navigation and turning follow back on resumes the hierarchy', () => {
  const data={...library(),followPage:false,manualPlaylistId:'world-list'};
  assert.equal(M.resolve(data,records,'chapter').playlistId,'world-list');
  assert.equal(M.resolve(data,records,'other').following,false);
  data.followPage=true; assert.equal(M.resolve(data,records,'chapter').playlistId,'novel-list');
});
test('playlist membership is shared, deleting a playlist preserves all music, and removing a master track clears every reference', () => {
  const data=library(), before=JSON.stringify(data);
  assert.deepEqual(M.trackIds(data,'novel-list'),['b','c']);
  const removed=M.removePlaylist(data,'novel-list');
  assert.deepEqual(M.trackIds(removed),['a','b','c']); assert.equal(removed.assignments.project,undefined);
  assert.equal(M.resolve(removed,records,'chapter').playlistId,'world-list');
  const deleted=M.removeTrack(data,'b'); assert.deepEqual(M.trackIds(deleted),['a','c']);
  assert.deepEqual(M.trackIds(deleted,'world-list'),['a']); assert.deepEqual(M.trackIds(deleted,'novel-list'),['c']);
  assert.equal(JSON.stringify(data),before);
});
test('broken references and cyclic parents cannot select unavailable playlists or hang resolution', () => {
  const data=library(); data.assignments.chapter='deleted'; data.playlists[0].trackIds=['a','a','missing'];
  assert.deepEqual(M.normalize(data).playlists[0].trackIds,['a']);
  assert.equal(M.resolve(data,records,'chapter').playlistId,'novel-list');
  const cyclic=[{id:'one',parent:'two'},{id:'two',parent:'one'}];
  assert.deepEqual(M.path(cyclic,'one').map(p=>p.id),['one','two','home']);
});
test('backups round trip named playlists and scope assignments with existing master metadata', () => {
  const keys=Object.fromEntries(backup.STORAGE_FIELDS.map(([,key])=>[key,key])), target={};
  const saved=backup.buildBackupData({keys,readJSON:(key,fallback)=>key==='soundbarLibrary'?library():fallback});
  backup.importBackupData(saved,{keys,writeJSON:(key,value)=>{target[key]=value;},readJSON:(key,fallback)=>target[key]??fallback});
  assert.deepEqual(target.soundbarLibrary,library());
});

function playerHarness(stored=library()) {
  const writes=[];
  class Audio {
    constructor(){this.paused=true;this.volume=1;this.currentTime=0;this.handlers={};}
    play(){this.paused=false;return Promise.resolve();}
    pause(){this.paused=true;}
    addEventListener(name,fn){this.handlers[name]=fn;}
    removeAttribute(name){if(name==='src')this.src='';}
    load(){}
  }
  const context={Audio, Blob, console, URL:{createObjectURL:()=> 'blob:local',revokeObjectURL(){}},
    document:{getElementById:()=>null,querySelectorAll:()=>[]},
    window:{SanctumMusicData:M,getVaultRecords:()=>records,addEventListener(){},
      SanctumStorage:{readJSON:()=>stored,writeJSON:(_,value)=>{writes.push(structuredClone(value));return true;},putBlob:async()=>true,getBlob:async key=>key.endsWith(':c')?null:new Blob(['audio'])}}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../soundbar.js'),'utf8').replace(/\ninitSoundbar\(\);\s*$/, ''),context);
  const run=code=>vm.runInContext(code,context);
  run(`soundbarReady=true; playlist=${JSON.stringify(stored.tracks)}.map(track=>({...track,source:'uploaded',url:'blob:'+track.id})); musicLibrary=MusicData.normalize(${JSON.stringify(stored)}); reconcileMusicQueue(false);`);
  return {run,writes,context};
}
test('Next and end-of-track stay inside the active queue, and navigation preserves a shared playing track', () => {
  const h=playerHarness();
  h.run("window.SanctumSoundbar.pageChanged('chapter'); playMusic();");
  assert.equal(h.run('playlist[currentTrackIndex].id'),'b');
  h.run('advanceMusicTrack(1)'); assert.equal(h.run('playlist[currentTrackIndex].id'),'c');
  h.run('musicPlayer.handlers.ended()'); assert.equal(h.run('playlist[currentTrackIndex].id'),'b');
  h.run("window.SanctumSoundbar.pageChanged('other')");
  assert.equal(h.run('playlist[currentTrackIndex].id'),'b'); assert.equal(h.run('musicPlayer.paused'),false);
  h.run('advanceMusicTrack(1)'); assert.equal(h.run('playlist[currentTrackIndex].id'),'a');
});
test('an empty assigned playlist stops playback and master music is never played as a fallback', () => {
  const h=playerHarness(); h.run("playMusic(); musicLibrary.playlists.push({id:'empty',name:'Empty',trackIds:[]}); musicLibrary.assignments.chapter='empty'; window.SanctumSoundbar.pageChanged('chapter'); playMusic();");
  assert.equal(h.run('currentTrackIndex'),-1); assert.equal(h.run('musicPlayer.paused'),true);
  assert.equal(h.run('playlist.length'),3);
});
test('restore retains missing-file metadata and avoids overwriting music while blobs are loading', async () => {
  const h=playerHarness(); h.writes.length=0; h.run('soundbarReady=false');
  await h.run('restorePersistedPlaylist()');
  assert.equal(h.writes.length,0);
  assert.equal(h.run('playlist.length'),3); assert.equal(h.run("playlist.find(t=>t.id==='c').url"),'');
  h.run("soundbarReady=true; window.SanctumSoundbar.pageChanged('chapter'); advanceMusicTrack(1)");
  assert.equal(h.run('playlist[currentTrackIndex].id'),'b');
});

test('uploading into a playlist also keeps a single track in the master library', async () => {
  const h=playerHarness(); h.run("window.SanctumSoundbar.pageChanged('chapter')");
  await h.run("addUploadedTracks([Object.assign(new Blob(['music'],{type:'audio/mpeg'}),{name:'New music.mp3'})])");
  const saved=h.writes.at(-1), uploaded=saved.tracks.find(track=>track.name==='New music');
  assert.ok(uploaded); assert.equal(saved.tracks.length,4);
  assert.ok(saved.playlists.find(list=>list.id==='novel-list').trackIds.includes(uploaded.id));
  assert.ok(!saved.playlists.find(list=>list.id==='world-list').trackIds.includes(uploaded.id));
});
test('a failed settings save preserves playlist selection and existing master music', () => {
  const h=playerHarness(); h.context.window.SanctumStorage.writeJSON=()=>false;
  assert.equal(h.run("commitMusicLibrary({...musicLibrary,followPage:false,manualPlaylistId:'novel-list'})"),false);
  assert.equal(h.run('musicLibrary.followPage'),true); assert.equal(h.run('musicSelection.playlistId'),'all');
  assert.equal(h.run('playlist.length'),3);
});

test('database-backed project areas remain selectable as Projects alongside ordinary database pages', () => {
  const h = playerHarness();
  const project = {id:'db-project',title:'Beneath & Veins',parent:'hub',containerType:'database-row',isScopeBoundary:true};
  h.context.window.getVaultRecords = () => [...records, project, {id:'db-note',title:'Database note',parent:project.id,containerType:'database-row'}];
  h.run("soundbarPageId='db-project'");
  const options = h.run('musicScopeOptions()');
  assert.ok(options.includes('Current project · Beneath &amp; Veins'));
  assert.match(options, /<optgroup label="Projects">[^]*Beneath &amp; Veins[^]*?<\/optgroup>/);
  assert.match(options, /<optgroup label="Database pages">[^]*Database note/);
  const data = library(); data.assignments[project.id]='novel-list';
  assert.equal(M.resolve(data,h.context.window.getVaultRecords(),'db-note').playlistId,'novel-list');
  assert.equal(M.scopeKind({containerType:'page',definesScope:true}),'Project');
  assert.equal(M.scopeKind({containerType:'page'}),'Page');
});

test('song order survives normalization and backup without moving other tracks or assignments', () => {
  const original = library(), before = JSON.stringify(original);
  const reordered = M.moveTrack(original,'novel-list','c','b','before');
  assert.deepEqual(reordered.playlists.map(list=>list.id),['world-list','novel-list']);
  assert.deepEqual(reordered.assignments,original.assignments);
  assert.deepEqual(reordered.tracks,original.tracks);
  assert.deepEqual(M.trackIds(reordered,'novel-list'),['c','b']);
  assert.equal(JSON.stringify(original),before);
  assert.deepEqual(M.normalize(JSON.parse(JSON.stringify(reordered))),reordered);
  const keys=Object.fromEntries(backup.STORAGE_FIELDS.map(([,key])=>[key,key])), target={};
  const saved=backup.buildBackupData({keys,readJSON:(key,fallback)=>key==='soundbarLibrary'?reordered:fallback});
  backup.importBackupData(saved,{keys,writeJSON:(key,value)=>{target[key]=value;},readJSON:(key,fallback)=>target[key]??fallback});
  assert.deepEqual(target.soundbarLibrary.playlists,reordered.playlists);
});

test('song order is independent for each playlist and master library', () => {
  const data=library();
  const named=M.moveTrack(data,'novel-list','c','b','before');
  assert.deepEqual(M.trackIds(named,'novel-list'),['c','b']);
  assert.deepEqual(M.trackIds(named,'world-list'),['a','b']);
  assert.deepEqual(M.trackIds(named),['a','b','c']);
  const master=M.moveTrack(named,'all','a','c','after');
  assert.deepEqual(M.trackIds(master),['b','c','a']);
  assert.deepEqual(M.trackIds(master,'novel-list'),['c','b']);
  for (const [id,target] of [['missing','a'],['a','missing'],['a','a']]) {
    assert.deepEqual(M.moveTrack(data,'all',id,target),data);
  }
});

test('master reordering preserves the playing song, playback position and the next-song queue', () => {
  const h=playerHarness();
  h.run("loadTrack(1); playMusic(); musicPlayer.currentTime=27; reorderMusicTrack('b','c','after');");
  assert.equal(h.run('playlist[currentTrackIndex].id'),'b');
  assert.equal(h.run('currentTrackIndex'),2);
  assert.equal(h.run('musicPlayer.src'),'blob:b');
  assert.equal(h.run('musicPlayer.currentTime'),27);
  assert.equal(h.run('musicPlayer.paused'),false);
  assert.deepEqual(h.writes.at(-1).tracks.map(track=>track.id),['a','c','b']);
  h.run('advanceMusicTrack(1)'); assert.equal(h.run('playlist[currentTrackIndex].id'),'a');
});

test('named-song reordering is saved without restarting the current song', () => {
  const h=playerHarness();
  h.run("window.SanctumSoundbar.pageChanged('chapter'); playMusic(); musicPlayer.currentTime=13; reorderMusicTrack('c','b','before');");
  assert.equal(h.run('playlist[currentTrackIndex].id'),'b');
  assert.equal(h.run('musicPlayer.currentTime'),13);
  assert.equal(h.run('musicPlayer.paused'),false);
  assert.deepEqual(h.writes.at(-1).playlists.map(list=>list.id),['world-list','novel-list']);
  assert.deepEqual(h.writes.at(-1).playlists[1].trackIds,['c','b']);
});

test('failed reordering rolls back runtime indices and stored song order', () => {
  const h=playerHarness(); h.run('loadTrack(1); playMusic(); musicPlayer.currentTime=42;');
  h.context.window.SanctumStorage.writeJSON=()=>false;
  assert.equal(h.run("reorderMusicTrack('b','c','after')"),false);
  assert.equal(h.run('currentTrackIndex'),1);
  assert.equal(h.run("playlist.map(track=>track.id).join(',')"),'a,b,c');
  assert.equal(h.run('musicPlayer.src'),'blob:b');
  assert.equal(h.run('musicPlayer.currentTime'),42);
  assert.equal(h.run('musicPlayer.paused'),false);
});
