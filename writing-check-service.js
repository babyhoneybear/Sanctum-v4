const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const Data = require('./writing-check-data');
const Thesaurus = require('./writing-thesaurus');
const Context = require('./writing-context');
const Punctuation = require('./writing-punctuation');
const ROOT = path.join(__dirname, '.local-tools');
const PORT = 8081;
// Fixed loopback endpoint: neither a request nor a setting can select a cloud URL.
const ENDPOINT = `http://127.0.0.1:${PORT}/v2/check`;
let child = null, starting = null;
function runtime() {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT,'writing-runtime.json'),'utf8'));
    const resolve = relative => {
      const target = path.resolve(ROOT,relative);
      if (!target.startsWith(ROOT + path.sep) || !fs.existsSync(target)) throw new Error('Invalid runtime path');
      return target;
    };
    return {java:resolve(config.java), jar:resolve(config.jar), config:resolve(config.config)};
  } catch { return null; }
}
async function request(text, language = 'en-US', timeout = 20000, signal, startsSentence = true) {
  const response = await fetch(ENDPOINT, {method:'POST', redirect:'error', signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
    headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({language, text,
      ...(!startsSentence ? {disabledRules:'UPPERCASE_SENTENCE_START'} : {})})});
  if (!response.ok) throw new Error('Local checker unavailable');
  const result = await response.json();
  if (!Array.isArray(result.matches) || !result.software?.name?.includes('LanguageTool')) throw new Error('Local checker unavailable');
  return result;
}
async function ensure() {
  if (starting) return starting;
  starting = (async () => {
    try { await request('A local connection check.', 'en-US', 1500); return; } catch {}
    const installed = runtime();
    if (!installed) throw new Error('The local checker needs setup. Run npm run setup:writing-check, then try again.');
    if (!child) {
      child = spawn(installed.java,['-Xmx512m','-cp',installed.jar,'org.languagetool.server.HTTPServer',
        '--config',installed.config,'--port',String(PORT)], {cwd:path.dirname(installed.jar), windowsHide:true, stdio:'ignore'});
      child.on('error', () => { child = null; });
      child.on('exit', () => { child = null; });
    }
    for (let attempt = 0; attempt < 40; attempt++) {
      await new Promise(resolve => setTimeout(resolve,500));
      try { await request('A local connection check.','en-US',1500); return; } catch {}
      if (!child) break;
    }
    throw new Error('The local checker could not start. Check that port 8081 is available and try again.');
  })();
  try { return await starting; } finally { starting = null; }
}
function validate(body) {
  if (typeof body?.text !== 'string' || body.text.length > Data.MAX_TEXT) throw new Error(`Check up to ${Data.MAX_TEXT.toLocaleString()} characters at a time.`);
  if (!['en-US','en-GB','en-CA','en-AU'].includes(body.language || 'en-US')) throw new Error('Choose a supported English dictionary.');
  return {text:body.text, language:body.language || 'en-US', words:Data.words(body.words)};
}
function mount(app) {
  app.post('/api/writing-check/alternatives',async(req,res)=>{
    res.set('Cache-Control','no-store');
    let word,context;
    try{word=Thesaurus.validateWord(req.body?.word);context=Context.validateContext(req.body||{});}catch(error){return res.status(400).json({error:error.message,localOnly:true});}
    try{res.json({word,groups:await Thesaurus.alternatives(word,context),contextual:!!context,localOnly:true});}
    catch{res.status(503).json({error:'The offline thesaurus is unavailable.',localOnly:true});}
  });
  app.get('/api/writing-check/health', (_req,res) => {
    res.set('Cache-Control','no-store');
    res.json({localOnly:true, installed:!!runtime(), provider:'LanguageTool', running:!!child});
  });
  app.post('/api/writing-check/check', async (req,res) => {
    res.set('Cache-Control','no-store');
    let input;
    try { input = validate(req.body); } catch(error) { return res.status(400).json({error:error.message}); }
    if (!input.text.trim()) return res.json({matches:[],localOnly:true});
    const controller = new AbortController();
    res.once('close',() => {if(!res.writableEnded)controller.abort();});
    try {
      await ensure();
      const matches = [];
      for (const chunk of Data.chunks(input.text)) {
        if(controller.signal.aborted)return;
        const result = await request(chunk.text,input.language,20000,controller.signal,chunk.startsSentence);
        matches.push(...result.matches.map(match => ({...match,offset:match.offset+chunk.offset})));
      }
      const normalized = Data.matches(input.text,Punctuation.merge(input.text,matches),input.words);
      res.json({matches:normalized,localOnly:true});
    } catch(error) {
      if(controller.signal.aborted)return;
      res.status(503).json({error:error.message.includes('setup') || error.message.includes('could not start') ? error.message : 'The local checker is unavailable. Try again in a moment.',localOnly:true});
    }
  });
}
process.once('exit', () => child?.kill());
for (const signal of ['SIGINT','SIGTERM']) process.once(signal,() => {child?.kill();process.exit(0);});
module.exports = {mount, validate, ENDPOINT};
