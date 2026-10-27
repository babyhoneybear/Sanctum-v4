// Build-time only: compact the licensed GloVe-derived data; never reads user writing.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.join(__dirname,'..');
const source=path.join(root,'artifacts','writing-vectors-source');
const destination=path.join(root,'assets','writing','context');
const model=JSON.parse(fs.readFileSync(path.join(source,'wink-embeddings-sg-100d.json'),'utf8'));
const words=model.words.slice(0,100000).filter(word=>/^[a-z]+(?:[-'][a-z]+)*$/.test(word));
const data=Buffer.alloc(words.length*model.dimensions);
words.forEach((word,row)=>{
  const vector=model.vectors[word],scale=127/Math.max(...vector.slice(0,model.dimensions).map(Math.abs));
  for(let column=0;column<model.dimensions;column++)data.writeInt8(Math.round(vector[column]*scale),row*model.dimensions+column);
});
fs.mkdirSync(destination,{recursive:true});
fs.writeFileSync(path.join(destination,'vectors.bin'),data);
fs.writeFileSync(path.join(destination,'vocabulary.json'),JSON.stringify(words));
for(const file of ['LICENSE','ACKNOWLEDGEMENT.md'])fs.copyFileSync(path.join(source,file),path.join(destination,file));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const wordnet=Object.fromEntries(fs.readdirSync(path.join(root,'assets','writing','wordnet')).map(file=>[file,hash(fs.readFileSync(path.join(root,'assets','writing','wordnet',file)))]));
fs.writeFileSync(path.join(destination,'source.json'),JSON.stringify({
  source:'wink-embeddings-sg-100d',version:'1.1.0',registry:'https://registry.npmjs.org/wink-embeddings-sg-100d/-/wink-embeddings-sg-100d-1.1.0.tgz',
  archiveIntegrity:'sha512-SN/Ar/UzotWhkJiSQ+WUN/L+UCKvNU1sYgUlFzJv5QpC2qg14txpGafTxVJAEepZp4hbj2CBIhei2VT4FK4/OA==',
  dimensions:model.dimensions,rows:words.length,transformation:'First 100000 source vocabulary entries, English words only; each vector scaled to signed 8-bit integers.',
  vectorsSHA256:hash(data),vocabularySHA256:hash(fs.readFileSync(path.join(destination,'vocabulary.json'))),
  wordnet:{version:'3.0',url:'https://wordnetcode.princeton.edu/3.0/WNdb-3.0.tar.gz',archiveSHA256:hash(fs.readFileSync(path.join(root,'artifacts','WNdb-3.0.tar.gz'))),files:wordnet}
},null,2)+'\n');
console.log(`Bundled ${words.length} local word vectors (${(data.length/1048576).toFixed(1)} MiB).`);
