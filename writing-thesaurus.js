const fs = require('node:fs/promises');
const path = require('node:path');
const Context = require('./writing-context');
const FILE = path.join(__dirname,'assets','writing','th_en_US_v2.dat');
let loading;
const common = new Set(('lovely gorgeous pretty stunning exquisite handsome scenic picturesque splendid pleasant cheerful glad joyful content bright happy fortunate willing appropriate elegant striking attractive large big huge enormous great small little tiny brief short quick fast rapid swift slow calm quiet peaceful angry furious annoyed sad unhappy sorrowful kind friendly gentle good excellent fine nice bad poor awful terrible important significant vital essential useful helpful simple easy clear plain complex difficult hard strong powerful weak fragile beautiful smart clever intelligent wise strange unusual odd new fresh old ancient young modern safe secure dangerous risky walk stroll wander roam move travel run hurry rush talk speak say tell explain describe ask answer reply look see watch observe notice think consider believe know understand learn remember forget make create build form produce change alter improve fix repair help assist support give offer provide take get receive find discover show reveal suggest recommend begin start finish end stop leave depart arrive return stay remain want wish desire need require love like enjoy hate dislike fear worry person individual people group team place location area home house city town road path story tale account history idea thought plan reason cause result effect problem issue trouble solution choice option words language writing text book work job task time moment day night light dark cold cool warm hot green blue red black white food water apples pears oranges books letters tools clothes').split(' '));
const partNames = {adj:'Adjective',adv:'Adverb',noun:'Noun',verb:'Verb'};
const commonRank = new Map([...common].map((word,index)=>[word,index]));
const key = value => value.normalize('NFC').trim().toLowerCase().replace(/’/g,"'");
function validateWord(value) {
  if(typeof value!=='string' || value.length>120 || !/^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u.test(value.trim())) throw new Error('Select a word to see alternatives.');
  return value.trim().normalize('NFC');
}
function parse(source) {
  const lines=source.split(/\r?\n/), index=new Map();
  if(lines[0]!=='UTF-8')throw new Error('Unsupported thesaurus encoding.');
  for(let i=1;i<lines.length;){
    if(!lines[i]){i++;continue;}
    const header=/^([^|]+)\|(\d+)$/.exec(lines[i++]);
    if(!header)throw new Error('Invalid thesaurus entry.');
    const count=Number(header[2]);
    if(count>1000 || i+count>lines.length)throw new Error('Invalid thesaurus entry length.');
    const groups=[];
    for(let end=i+count;i<end;i++){
      const [part,...terms]=lines[i].split('|');
      const label=partNames[part.replace(/[()]/g,'')] || part.replace(/[()]/g,'');
      const seen=new Set([key(header[1])]);
      const words=terms.filter(term=>! /\((?:antonym|generic term|specific term|related term|instance)\)/i.test(term))
        .map(term=>term.replace(/\s*\(similar term\)\s*$/i,'').trim())
        .filter(term=>term && term.length<=120 && !term.includes('(') && !seen.has(key(term)) && seen.add(key(term)));
      words.sort((a,b)=>(commonRank.get(key(a))??Infinity)-(commonRank.get(key(b))??Infinity));
      if(words.length)groups.push({part:label,meaning:words[0],words:words.slice(0,8)});
    }
    if(groups.length)index.set(key(header[1]),groups);
  }
  return index;
}
function preserveCase(word, original) {
  if(original===original.toUpperCase())return word.toUpperCase();
  if(/^\p{Lu}[\p{Ll}\p{M}'’-]*$/u.test(original))return word[0].toUpperCase()+word.slice(1);
  return word;
}
function lookup(index, word) {
  const original=validateWord(word);
  const groups=index.get(key(original)) || [],parts=new Set(),first=[],rest=[];
  groups.forEach(group=>{if(parts.has(group.part))rest.push(group);else{parts.add(group.part);first.push(group);}});
  return [...first,...rest].slice(0,6).map(group=>({...group,words:group.words.map(term=>preserveCase(term,original))}));
}
async function alternatives(word,context=null) {
  const original=validateWord(word);
  if(!loading)loading=fs.readFile(FILE,'utf8').then(parse).catch(error=>{loading=null;throw error;});
  if(context){
    const analysis=Context.analyze(context);
    const groups=analysis?lookup(await loading,analysis.lemma):[];
    return (await Context.rank(groups,analysis)).map(group=>({...group,words:group.words.map(term=>preserveCase(term,original))}));
  }
  return lookup(await loading,original);
}
module.exports={alternatives,parse,lookup,validateWord};
