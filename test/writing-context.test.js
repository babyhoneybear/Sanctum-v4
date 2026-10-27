const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const T=require('../writing-thesaurus');
const C=require('../writing-context');
const M=require('../writing-check-data');
const ROOT=path.join(__dirname,'..','assets','writing');
const choices=async(word,text,offset=text.indexOf(word))=>(await T.alternatives(word,C.validateContext({word,text,offset}))).flatMap(group=>group.words);

test('prosperous land uses the economic meaning across the entire menu, rather than personal wealth or luck',async()=>{
  const text='Leaving its survivors to scatter across the continent carrying the knowledge of a once prosperous land.';
  const words=await choices('prosperous',text);
  assert.deepEqual(new Set(words.slice(0,4)),new Set(['thriving','successful','flourishing','booming']));
  for(const word of ['easy','comfortable','well-heeled','lucky','golden'])assert.ok(!words.includes(word),word);
  const family=await choices('prosperous','She belonged to a prosperous family.');
  assert.equal(family[0],'rich');
  assert.ok(!family.includes('booming'));
});

test('nearby words distinguish intelligence, illumination, temperature, and an unfriendly manner',async()=>{
  const student=await choices('bright','The bright student solved the difficult problem.');
  const lamp=await choices('bright','The bright lamp lit the room.');
  assert.ok(student.includes('intelligent'));assert.ok(!student.includes('luminous'));
  assert.ok(lamp.includes('luminous'));assert.ok(!lamp.includes('intelligent'));
  const weather=await choices('cold','The cold weather kept us indoors.');
  const reply=await choices('cold','His cold reply showed no sympathy.');
  assert.ok(weather.includes('chilly'));assert.ok(!weather.includes('emotionless'));
  assert.ok(reply.includes('emotionless'));assert.ok(!reply.includes('ice-cold'));
});

test('selected occurrence and its noun modifier matter even with another occurrence in the same sentence',async()=>{
  const text='The bright lamp stood beside the bright student.';
  const first=await choices('bright',text,text.indexOf('bright'));
  const last=await choices('bright',text,text.lastIndexOf('bright'));
  assert.ok(first.includes('luminous'));assert.ok(!first.includes('intelligent'));
  assert.ok(last.includes('intelligent'));assert.ok(!last.includes('luminous'));
});

test('part of speech, verb frames, past tense and noun plurals survive word substitutions',async()=>{
  const verb=await choices('walk','They walk through the forest.');
  const noun=await choices('walk','They went for a walk through the forest.');
  const past=await choices('walked','They walked through the forest.');
  assert.ok(verb.includes('stroll'));assert.ok(!verb.includes('walking'));assert.ok(!verb.includes('exhibit'));
  assert.deepEqual(noun,['walking']);assert.ok(past.includes('strolled'));assert.ok(!past.includes('stroll'));
  assert.deepEqual(await choices('books','She placed the books on the shelf.'),['volumes']);
});

test('an unavailable synonym for the selected river-bank sense does not fall back to financial institutions',async()=>{
  assert.deepEqual(await choices('bank','They sat on the bank beside the river.'),[]);
  assert.ok((await choices('bank','She deposited money at the bank.')).includes('banking company'));
  const contracted='🌙 I can’t bank on a bank lending us money.';
  assert.ok((await choices('bank',contracted,contracted.lastIndexOf('bank'))).includes('banking company'));
  assert.deepEqual(await choices('Kovaeth','Kovaeth is a beautiful city.'),[]);
});

test('bounded context validates exact UTF-16 occurrence and rejects mismatches, partial words and excessive text',()=>{
  const text='🌙 '+('A long sentence. '.repeat(100))+'a prosperous land. '+('Another sentence. '.repeat(100));
  const offset=text.indexOf('prosperous'),input=M.context(text,{offset,length:10,original:'prosperous'});
  assert.ok(input.text.length<=C.MAX_CONTEXT);
  assert.equal(input.text.slice(input.offset,input.offset+10),'prosperous');
  assert.ok(C.validateContext(input));
  assert.equal(C.validateContext({word:'bright'}),null);
  for(const invalid of [{word:'bright',text:'bright',offset:1},{word:'bright',text:'brighter',offset:0},{word:'bright',text:'bright',offset:'0'},{word:'bright',text:'bright'+'.'.repeat(1200),offset:0}])assert.throws(()=>C.validateContext(invalid));
});

test('bundled contextual dictionary and compact vectors retain pinned source, checksums and licenses',()=>{
  const meta=JSON.parse(fs.readFileSync(path.join(ROOT,'context','source.json'),'utf8'));
  const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.equal(meta.vectorsSHA256,hash(path.join(ROOT,'context','vectors.bin')));
  assert.equal(meta.vocabularySHA256,hash(path.join(ROOT,'context','vocabulary.json')));
  for(const [file,expected] of Object.entries(meta.wordnet.files))assert.equal(hash(path.join(ROOT,'wordnet',file)),expected,file);
  assert.match(fs.readFileSync(path.join(ROOT,'context','LICENSE'),'utf8'),/MIT License/);
  assert.match(fs.readFileSync(path.join(ROOT,'wordnet','LICENSE.txt'),'utf8'),/WordNet Release 3.0/);
  assert.ok(fs.statSync(path.join(ROOT,'context','vectors.bin')).size<10*1024*1024);
});
