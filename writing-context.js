// Local sentence tagging, WordNet sense selection and compact GloVe similarity.
// No network calls, text logging, persistence, or user-text caches.
const fs=require('node:fs/promises');
const path=require('node:path');
const {Inflectors}=require('en-inflectors');
const ROOT=path.join(__dirname,'assets','writing');
const MAX_CONTEXT=1200;
const categories={ADJ:'adj',ADV:'adv',NOUN:'noun',VERB:'verb'};
const labels={adj:'Adjective',adv:'Adverb',noun:'Noun',verb:'Verb'};
const key=word=>word.normalize('NFC').toLowerCase().replace(/’/g,"'");
let resources,nlp;
function tagger(){return nlp ||= require('wink-nlp')(require('wink-eng-lite-web-model'),['sbd','pos']);}
function validateContext(input){
  if(input.text===undefined&&input.offset===undefined)return null;
  const {text,offset,word}=input;
  if(typeof text!=='string'||text.length>MAX_CONTEXT||!Number.isInteger(offset)||offset<0||
     typeof word!=='string'||!word.length||offset+word.length>text.length||text.slice(offset,offset+word.length)!==word||
     /[\p{L}\p{M}\p{N}]/u.test(text[offset-1]||'')||/[\p{L}\p{M}\p{N}]/u.test(text[offset+word.length]||''))
    throw new Error('Select a complete word in up to 1,200 characters of surrounding text.');
  return {text,offset,length:word.length};
}
function analyze(context){
  const engine=tagger(),its=engine.its,tokens=[];
  let cursor=0;
  engine.readDoc(context.text).tokens().each(token=>{
    const value=token.out(its.value);
    // Contractions can have multiple grammatical tokens for one original span.
    const previous=tokens.at(-1),repeat=token.out(its.contractionFlag)&&previous?.value===value;
    const start=repeat?previous.start:context.text.indexOf(value,cursor);
    if(start<0)return;
    const end=start+value.length;cursor=Math.max(cursor,end);
    tokens.push({value,start,end,pos:token.out(its.pos),lemma:key(token.out(its.lemma)),
      stop:token.out(its.stopWordFlag),sentence:token.parentSentence().index()});
  });
  const at=tokens.findIndex(token=>token.start===context.offset&&token.end===context.offset+context.length);
  if(at<0)return null;
  const selected=tokens[at],part=categories[selected.pos];
  if(!part)return null; // Avoid changing proper names and function words.
  const sentence=tokens.filter(token=>token.sentence===selected.sentence),index=sentence.indexOf(selected);
  let head=null;
  if(part==='adj'){
    for(let i=index+1;i<Math.min(sentence.length,index+5);i++){
      if(['NOUN','PROPN'].includes(sentence[i].pos)){head=sentence[i];break;}
      if(!['ADJ','ADV'].includes(sentence[i].pos))break;
    }
    if(!head)for(let i=index-1;i>=Math.max(0,index-6);i--){if(['NOUN','PROPN'].includes(sentence[i].pos)){head=sentence[i];break;}}
  }else if(part==='noun'||part==='verb'){
    for(let i=index+1;i<Math.min(sentence.length,index+6);i++){
      if(sentence[i].pos==='PUNCT')break;
      if(['NOUN','PROPN'].includes(sentence[i].pos)){head=sentence[i];break;}
    }
    if(!head)for(let i=index-1;i>=Math.max(0,index-5);i--){
      if(sentence[i].pos==='PUNCT')break;
      if(['NOUN','PROPN'].includes(sentence[i].pos)){head=sentence[i];break;}
    }
  }
  const neighbors=sentence.map((token,i)=>({...token,weight:token===head?4:1/(1+Math.abs(i-index)*.35)}))
    .filter(token=>token.start!==selected.start&&!token.stop&&['ADJ','ADV','NOUN','PROPN','VERB'].includes(token.pos));
  const after=sentence.slice(index+1),firstPhrase=after.slice(0,after.findIndex(token=>['ADP','PUNCT','CCONJ','SCONJ'].includes(token.pos))<0?after.length:after.findIndex(token=>['ADP','PUNCT','CCONJ','SCONJ'].includes(token.pos)));
  const object=part==='verb'&&firstPhrase.some(token=>['NOUN','PROPN','PRON'].includes(token.pos));
  return {selected,part,lemma:selected.lemma,neighbors,head,index,sentence,object};
}
async function load(){
  if(!resources)resources=(async()=>{
    const names=['adj','adv','noun','verb'];
    const files=await Promise.all(names.flatMap(part=>['index','data'].map(type=>fs.readFile(path.join(ROOT,'wordnet',`${type}.${part}`)))));
    const [vocabulary,binary]=await Promise.all([fs.readFile(path.join(ROOT,'context','vocabulary.json'),'utf8'),fs.readFile(path.join(ROOT,'context','vectors.bin'))]);
    const words=JSON.parse(vocabulary),dimensions=100;
    if(binary.length!==words.length*dimensions)throw new Error('Invalid local context vocabulary.');
    const indices={},data={};names.forEach((part,i)=>{indices[part]=files[i*2];data[part]=files[i*2+1];});
    return {indices,data,dimensions,binary,vocabulary:new Map(words.map((word,i)=>[word,i])),vectors:new Map(),senses:new Map(),signatures:new Map()};
  })().catch(error=>{resources=null;throw error;});
  return resources;
}
function boundedCache(cache,key,value){if(cache.size>=1024)cache.delete(cache.keys().next().value);cache.set(key,value);return value;}
function vector(model,word){
  word=key(word);
  if(model.vectors.has(word))return model.vectors.get(word);
  const row=model.vocabulary.get(word);if(row===undefined)return null;
  const values=new Float64Array(model.dimensions);let norm=0;
  for(let column=0;column<values.length;column++){const value=model.binary.readInt8(row*values.length+column);values[column]=value;norm+=value*value;}
  norm=Math.sqrt(norm);for(let column=0;column<values.length;column++)values[column]/=norm||1;
  return boundedCache(model.vectors,word,values);
}
function average(model,terms){
  const values=new Float64Array(model.dimensions);let found=0;
  for(const {word,weight=1} of terms){const v=vector(model,word);if(!v)continue;found++;for(let column=0;column<values.length;column++)values[column]+=v[column]*weight;}
  if(!found)return null;
  const norm=Math.hypot(...values);if(!norm)return null;
  return values.map(value=>value/norm);
}
function cosine(a,b){if(!a||!b)return 0;let sum=0;for(let i=0;i<a.length;i++)sum+=a[i]*b[i];return sum;}
function synset(model,part,offset){
  const id=`${part}:${offset}`;if(model.senses.has(id))return model.senses.get(id);
  const bytes=model.data[part],line=bytes.subarray(offset,bytes.indexOf(10,offset)).toString('utf8');
  const split=line.indexOf('|'),fields=line.slice(0,split).trim().split(/\s+/),words=[];
  const count=parseInt(fields[3],16);let cursor=4;
  for(let i=0;i<count;i++){words.push(fields[cursor].replace(/\([ap]\)$/, '').replace(/_/g,' '));cursor+=2;}
  const pointers=[],pointerCount=Number(fields[cursor++]);
  for(let i=0;i<pointerCount;i++){const [symbol,target,pos]=fields.slice(cursor,cursor+4);cursor+=4;
    if(['&','@','~'].includes(symbol))pointers.push({symbol,offset:Number(target),part:{a:'adj',s:'adj',r:'adv',n:'noun',v:'verb'}[pos]});}
  const frames=[];
  if(part==='verb'){const count=Number(fields[cursor++]);for(let i=0;i<count;i++){frames.push(Number(fields[cursor+1]));cursor+=3;}}
  return boundedCache(model.senses,id,{id,words,pointers,frames,gloss:line.slice(split+1).trim(),part});
}
function senses(model,lemma,part){
  const bytes=model.indices[part],needle=Buffer.from(`\n${lemma.replace(/ /g,'_')} `),start=bytes.indexOf(needle);
  if(start<0)return [];
  const fields=bytes.subarray(start+1,bytes.indexOf(10,start+1)).toString('utf8').trim().split(/\s+/);
  return fields.slice(6+Number(fields[3])).map(offset=>synset(model,part,Number(offset)));
}
function terms(text){
  const engine=tagger(),its=engine.its,result=[];
  engine.readDoc(text).tokens().each(token=>{if(!token.out(its.stopWordFlag)&&['ADJ','ADV','NOUN','VERB'].includes(token.out(its.pos)))result.push(key(token.out(its.lemma)));});
  return [...new Set(result)];
}
function signature(model,sense,lemma){
  const cacheKey=`${sense.id}:${lemma}`;
  if(model.signatures.has(cacheKey))return model.signatures.get(cacheKey);
  const words=terms(sense.gloss).filter(word=>word!==lemma);
  const related=sense.pointers.filter(pointer=>pointer.symbol!=='~').slice(0,3).flatMap(pointer=>terms(synset(model,pointer.part,pointer.offset).gloss)).filter(word=>word!==lemma);
  const result={words:new Set(words),vector:average(model,[...words.map(word=>({word,weight:1})),...related.map(word=>({word,weight:.2}))])};
  return boundedCache(model.signatures,cacheKey,result);
}
function inflect(word,analysis){
  const {lemma,part,selected}=analysis,original=key(selected.value);
  if(original===lemma)return word;
  // Inflect the noun head or verb, rather than every word in a phrase.
  const parts=word.split(' '),at=part==='noun'?parts.length-1:0,inflector=new Inflectors(parts[at]),source=new Inflectors(lemma);
  if(part==='noun'){if(key(source.toPlural())!==original)return null;parts[at]=inflector.toPlural();}
  else if(part==='verb'){
    const previous=analysis.sentence.slice(Math.max(0,analysis.index-3),analysis.index);
    const participle=previous.some(token=>['have','be'].includes(token.lemma));
    const methods=participle?['toGerund','toPastParticiple','toPast','toPresentS']:['toGerund','toPast','toPastParticiple','toPresentS'];
    const method=methods.find(method=>key(source[method]())===original);if(!method)return null;parts[at]=inflector[method]();
  }else if(part==='adj'){
    const method=['comparative','superlative'].find(method=>key(source[method]())===original);if(!method)return null;parts[at]=inflector[method]();
  }else return null;
  return parts.join(' ');
}
async function rank(groups,analysis){
  if(!analysis)return [];
  const model=await load(),{part,lemma,neighbors,head}=analysis;
  const intransitive=new Set([1,2,3,4,6,7,12,13,22,23,26,27,28,29,32,33,34,35]);
  const compatible=sense=>part!=='verb'||analysis.object||sense.frames.some(frame=>intransitive.has(frame));
  const candidates=senses(model,lemma,part).filter(compatible),context=average(model,neighbors.map(token=>({word:token.lemma,weight:token.weight}))),headVector=head&&vector(model,head.lemma);
  const originalVector=vector(model,lemma);
  function senseWords(sense){
    const similar=sense.pointers.filter(pointer=>pointer.symbol==='&').flatMap(pointer=>synset(model,pointer.part,pointer.offset).words);
    const direct=[...sense.words,...similar],base=new Set(direct.map(key).filter(word=>word!==lemma));
    const matched=groups.filter(group=>group.part===labels[part]).map(group=>({group,overlap:group.words.filter(word=>base.has(key(word))).length})).sort((a,b)=>b.overlap-a.overlap);
    const matching=matched[0]?.overlap?[matched[0].group]:[];
    // Verb manner variants are useful for a generic action with no direct synonym.
    const manners=part==='verb'&&!base.size?sense.pointers.filter(pointer=>pointer.symbol==='~').map(pointer=>synset(model,pointer.part,pointer.offset)).filter(compatible).flatMap(sense=>sense.words):[];
    return [...new Set([...direct,...matching.flatMap(group=>group.words),...manners])]
      .filter(word=>!key(word).split(' ').includes(lemma)&&word.length<=80&&/^[\p{L}][\p{L} '\u2019-]*$/u.test(word));
  }
  function wordScore(word){
    const wordVector=average(model,word.toLowerCase().split(/[ '-]+/).map(word=>({word}))),frequency=model.vocabulary.get(key(word));
    const familiarity=frequency===undefined?0:1-Math.min(1,Math.log(1+frequency)/Math.log(model.vocabulary.size));
    const meanings=senses(model,key(word),part);
    const fit=meanings.length?Math.max(...meanings.map(sense=>cosine(signature(model,sense,lemma).vector,context))):0;
    return cosine(wordVector,originalVector)*.45+cosine(wordVector,context)*.2+cosine(wordVector,headVector)*.1+fit*.15+familiarity*.1-(/[ -]/.test(word)?.05:0);
  }
  const evaluated=candidates.map((sense,index)=>{
    const meaning=signature(model,sense,lemma);
    const exact=neighbors.reduce((sum,token)=>sum+(meaning.words.has(token.lemma)?token.weight:0),0);
    const words=senseWords(sense),lexical=words.length?Math.max(...words.map(word=>cosine(average(model,word.toLowerCase().split(/[ '-]+/).map(word=>({word}))),originalVector))):0;
    return {sense,words,score:cosine(meaning.vector,context)*.5+cosine(meaning.vector,headVector)*.25+lexical*.2+Math.min(exact,4)*.12-index*.003};
  }).sort((a,b)=>b.score-a.score);
  if(!evaluated.length)return [];
  // Pick one meaning, including singleton senses with no replacements: don't fall
  // back to an unrelated meaning simply because it has more synonyms.
  const chosen=evaluated[0].sense;
  const scored=evaluated[0].words.map(word=>({word,score:wordScore(word)})).sort((a,b)=>b.score-a.score);
  const replacements=scored.map(item=>inflect(item.word,analysis)).filter(Boolean);
  return replacements.length?[{part:labels[part],meaning:chosen.gloss.split(';')[0],words:[...new Set(replacements)].slice(0,8)}]:[];
}
module.exports={MAX_CONTEXT,validateContext,analyze,rank};
