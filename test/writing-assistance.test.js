const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const T=require('../writing-thesaurus');
const P=require('../writing-punctuation');
const M=require('../writing-check-data');

test('bundled thesaurus returns useful alternatives, preserves case, and keeps noun and verb meanings',async()=>{
  const beautiful=await T.alternatives('beautiful');
  assert.ok(beautiful.some(group=>group.words.includes('lovely')));
  assert.ok(beautiful.some(group=>group.words.includes('gorgeous')));
  assert.deepEqual(beautiful[0].words.slice(0,3),['lovely','gorgeous','pretty']);
  assert.ok(beautiful.every(group=>group.words.every(word=>!word.includes('(')&&word!=='ugly'&&word!=='beautiful')));
  assert.ok((await T.alternatives('Beautiful')).some(group=>group.words.includes('Lovely')));
  assert.ok((await T.alternatives('BEAUTIFUL')).some(group=>group.words.includes('LOVELY')));
  const walk=await T.alternatives('walk');
  assert.ok(walk.some(group=>group.part==='Verb'));
  assert.ok(walk.some(group=>group.part==='Noun'));
  assert.deepEqual(await T.alternatives('Kovaeth'),[]);
});

test('offline dictionary license, pinned source and checksum travel with the data',()=>{
  const root=path.join(__dirname,'..','assets','writing');
  const data=fs.readFileSync(path.join(root,'th_en_US_v2.dat'));
  const source=JSON.parse(fs.readFileSync(path.join(root,'source.json'),'utf8').replace(/^\uFEFF/,''));
  assert.match(source.commit,/^[a-f0-9]{40}$/);
  assert.equal(source.sha256,crypto.createHash('sha256').update(data).digest('hex'));
  assert.match(fs.readFileSync(path.join(root,'WordNet-LICENSE.txt'),'utf8'),/Permission to use, copy, modify and distribute/);
});

test('thesaurus refuses malformed queries and excludes broader terms and antonyms',()=>{
  for(const query of ['','<script>','word\nword','x'.repeat(121),null])assert.throws(()=>T.validateWord(query));
  assert.throws(()=>T.parse('ISO8859-1\nword|1\n(noun)|term'));
  assert.throws(()=>T.parse('UTF-8\nword|9999\n(noun)|term'));
  const index=T.parse('UTF-8\nsmall|1\n(adj)|little|tiny (similar term)|size (related term)|big (antonym)|entity (generic term)\n');
  assert.deepEqual(T.lookup(index,'small')[0].words,['little','tiny']);
});

test('introductory clause commas work across tenses, contractions and UTF-16 offsets',()=>{
  const samples=[['If it rains we will stay home.','If it rains, we will stay home.'],['Because I was tired I went home.','Because I was tired, I went home.'],["If it's cold we'll stay home.","If it's cold, we'll stay home."],['When they returned they were hungry.','When they returned, they were hungry.'],['🌙\nBefore we leave we should eat.','🌙\nBefore we leave, we should eat.']];
  for(const [text,expected] of samples){
    const matches=M.matches(text,P.punctuation(text));
    assert.equal(matches.length,1,text);
    assert.equal(M.replace(text,matches[0],matches[0].replacements[0]),expected);
    assert.equal(matches[0].spelling,false);
  }
});

test('possible comma splices offer explicit punctuation choices instead of automatic rewrites',()=>{
  const text='I was tired, I went home.';
  const matches=M.matches(text,P.punctuation(text));
  assert.equal(matches.length,1);
  assert.equal(M.replace(text,matches[0],matches[0].replacements[0]),'I was tired; I went home.');
  assert.equal(M.replace(text,matches[0],matches[0].replacements[1]),'I was tired. I went home.');
});

test('punctuation suggestions avoid complements, dialogue, lists, existing commas and dropped nonword text',()=>{
  const samples=['If you think we will leave.','If I know he is safe I will leave.','If it rains, we will stay home.','We stayed because it rained.','I work, you rest, and she watches.','I know, I know.','I was tired, he said.','"I was tired, I went home."','I arrived at 5, I went home.','When they returned — they were hungry.','If it rains and we cannot leave we will stay home.'];
  for(const text of samples)assert.deepEqual(P.punctuation(text),[],text);
});

test('supplementary punctuation yields to overlapping engine advice and keeps existing spelling suggestions',()=>{
  const text='If it rains we will stay home. teh city';
  const existing=[{offset:6,length:8,rule:{id:'ENGINE_COMMA'}},{offset:31,length:3,rule:{id:'SPELLING'}}];
  assert.deepEqual(P.merge(text,existing),existing);
});
