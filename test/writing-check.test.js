const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../writing-check-data');
const service = require('../writing-check-service');
const backup = require('../backup-data');
const typo = (offset,length,replacements=[]) => ({offset,length,message:'Possible spelling mistake.',replacements:replacements.map(value=>({value})),rule:{id:'MORFOLOGIK_RULE_EN_US',issueType:'misspelling'}});
test('personal dictionary accepts Unicode names and deduplicates case and apostrophe forms',()=>{
  assert.deepEqual(M.words(['Kovaeth','kovaeth','Éowyn',"O'Brien",'O’Brien','',null,'a\nb']),['Kovaeth','Éowyn',"O'Brien"]);
});
test('personal terms suppress spelling flags without hiding grammar errors',()=>{
  const text='Kovaeth are a city.';
  const grammar={offset:0,length:11,message:'Agreement',rule:{id:'agreement',issueType:'grammar'},replacements:[{value:'Kovaeth is'}]};
  const matches=M.matches(text,[typo(0,7),grammar],['Kovaeth']);
  assert.equal(matches.length,1);assert.equal(matches[0].spelling,false);assert.equal(matches[0].message,'Agreement');
});
test('saved phrases suppress their own misspellings without accepting the words everywhere',()=>{
  const text='Luma Vey and Luma.';
  const matches=M.matches(text,[typo(0,4),typo(5,3),typo(13,4)],['Luma Vey']);
  assert.equal(matches.length,1);assert.equal(matches[0].offset,13);
  assert.deepEqual(M.settings({language:'auto',live:false}),{language:'en-US',live:false});
});
test('mistyped custom names receive the saved spelling, including transposed letters',()=>{
  const matches=M.matches('Kovaeht falls.',[typo(0,7,['Cobalt'])],['Kovaeth','Lantern']);
  assert.deepEqual(matches[0].replacements,['Kovaeth','Cobalt']);
  assert.equal(M.distance('kovaeht','kovaeth'),1);
});
test('correction offsets use UTF-16 and stale corrections are rejected',()=>{
  const text='🌙 teh city';const match=M.matches(text,[typo(3,3,['the'])])[0];
  assert.equal(M.replace(text,match,'the'),'🌙 the city');
  assert.throws(()=>M.replace('🌙 new city',match,'the'),/text changed/);
  assert.deepEqual(M.matches(text,[typo(-1,3),typo(50,3)]),[]);
});
test('local route cannot select an external provider or silently truncate writing',()=>{
  assert.equal(service.ENDPOINT,'http://127.0.0.1:8081/v2/check');
  assert.throws(()=>service.validate({text:'x'.repeat(200001)}),/200,000/);
  assert.throws(()=>service.validate({text:'hello',language:'auto'}),/English/);
  assert.deepEqual(service.validate({text:'hello',url:'https://example.com',words:['Kovaeth']}),{text:'hello',language:'en-US',words:['Kovaeth']});
});
test('long sections are checked in contiguous chunks without losing offsets or splitting surrogate pairs',()=>{
  const text='a'.repeat(17999)+'🌙'+' paragraph.\n'+'b'.repeat(25000);
  const chunks=M.chunks(text);
  assert.equal(chunks.map(chunk=>chunk.text).join(''),text);
  chunks.forEach(chunk=>{assert.ok(chunk.text.length<=18000);assert.equal(text.slice(chunk.offset,chunk.offset+chunk.text.length),chunk.text);assert.equal(/^[\uDC00-\uDFFF]/.test(chunk.text),false);});
  assert.equal(chunks[1].startsSentence,false);
  const sentences=M.chunks('A sentence about the city. '.repeat(1000)+'A beutiful ending.');
  assert.equal(sentences.every(chunk=>chunk.startsSentence),true);
  assert.match(sentences[0].text,/\.\s+$/);
});
test('personal dictionary and checker preferences survive vault backup independently of the Lexicon',()=>{
  const keys=Object.fromEntries(backup.STORAGE_FIELDS.map(([,key])=>[key,key]));
  const original={lexicon:[{title:'Phrases',sections:[]}],writingDictionary:['Kovaeth'],writingSettings:{language:'en-GB',live:false}};
  const data=backup.buildBackupData({keys,readJSON:(key,fallback)=>original[key]??fallback});
  const restored={};backup.importBackupData(data,{keys,readJSON:(key,fallback)=>restored[key]??fallback,writeJSON:(key,value)=>{restored[key]=value;}});
  assert.deepEqual(restored.lexicon,original.lexicon);assert.deepEqual(restored.writingDictionary,original.writingDictionary);assert.deepEqual(restored.writingSettings,original.writingSettings);
});
