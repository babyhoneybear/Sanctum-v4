// Bundle only the curated symbols from the official Lucide 0.468.0 npm archive.
// node scripts/build-page-symbols.cjs <lucide-static-0.468.0.tgz>
const fs=require('node:fs'), path=require('node:path'), {execFileSync}=require('node:child_process');
const {entries}=require('../icon-catalog');
const archive=process.argv[2];
if(!archive)throw Error('Provide the official Lucide archive.');
const files=new Set(execFileSync('tar',['-tf',archive],{encoding:'utf8'}).split(/\r?\n/));
const paths={}, missing=[];
for(const entry of entries.filter(e=>e.kind==='symbol')) {
  if(paths[entry.name])continue;
  if(entry.glyph) {paths[entry.name]=`<text x="12" y="18" text-anchor="middle" font-size="19" font-family="'Noto Sans JP','Yu Gothic',sans-serif" stroke="none" fill="currentColor">${entry.glyph}</text>`;continue;}
  const filename=`package/icons/${entry.name}.svg`;
  if(!files.has(filename)){missing.push(entry.name);continue;}
  const svg=execFileSync('tar',['-xOf',archive,filename],{encoding:'utf8'});
  const body=svg.slice(svg.indexOf('>',svg.indexOf('<svg'))+1,svg.lastIndexOf('</svg>')).trim();
  if(/<script|<foreignObject|\bon\w+=|\bhref=/i.test(body))throw Error(`Unexpected SVG content: ${entry.name}`);
  paths[entry.name]=body;
}
if(missing.length)throw Error(`Unavailable icons: ${[...new Set(missing)].join(' ')}`);
fs.writeFileSync(path.join(__dirname,'../assets/page-symbol-paths.js'),`// Lucide 0.468.0 (ISC / MIT); see lucide-LICENSE.txt. Japanese glyphs use local fonts.\n(function(root){const paths=${JSON.stringify(paths)};root.SanctumPageSymbolPaths=Object.freeze(paths);if(typeof module!=='undefined')module.exports=paths;})(typeof window!=='undefined'?window:globalThis);\n`);
console.log(`Bundled ${Object.keys(paths).length} monochrome symbols.`);
