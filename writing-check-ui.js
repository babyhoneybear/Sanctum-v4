(function () {
  const M = window.SanctumWritingCheckData;
  const dictionaryKey = window.STORAGE_KEYS.writingDictionary;
  const settingsKey = window.STORAGE_KEYS.writingSettings;
  let target = null, panel = null, timer = null, controller = null;
  let revision = 0, current = null, ignored = new Set(), lastCorrection = null;
  let nativeSpelling = [];
  let suggestion = null, mirror = null, alternativesController = null;
  function closeSuggestion() { alternativesController?.abort();alternativesController=null;suggestion?.remove(); suggestion=null; }
  function clearMirror() { mirror?.remove(); mirror=null; }
  function restoreNativeSpelling() {
    nativeSpelling.forEach(({field,value}) => {if(field.isConnected)field.spellcheck=value;}); nativeSpelling=[];
  }
  function useLocalSpelling(root) {
    const fields = root.id === 'docPagesHost' ? [...root.querySelectorAll('.doc-content')] : [root];
    fields.forEach(field => {if(!nativeSpelling.some(item => item.field===field)){nativeSpelling.push({field,value:field.spellcheck});field.spellcheck=false;}});
  }
  let dictionary = M.words(window.readStorageJSON(dictionaryKey, []));
  let settings = M.settings(window.readStorageJSON(settingsKey,{}));
  const excluded = '.writing-check-panel, .writing-check-suggestion, .writing-check-mirror, #docLexiconPanel, #docFindBar, [data-writing-check="off"]';
  const targetObserver = new MutationObserver(() => {
    if (!target?.isConnected) return;
    invalidate();
    if (panel) {panel.querySelector('[data-matches]').replaceChildren();status('Text changed.');}
    if (settings.live) timer=setTimeout(check,900);
  });
  const fieldResizeObserver = new ResizeObserver(() => {
    if(current?.snap.field){closeSuggestion();drawHighlights();}
  });
  function watchTarget() {
    targetObserver.disconnect();
    fieldResizeObserver.disconnect();
    if(target?.matches('input,textarea'))fieldResizeObserver.observe(target);
    if (target && !target.matches('input,textarea')) targetObserver.observe(target,{subtree:true,childList:true,characterData:true});
  }
  function editable(node) {
    if (!(node instanceof Element) || node.closest(excluded)) return null;
    const field = node.closest('textarea, input, [contenteditable="true"]');
    if (!field || field.disabled || field.readOnly || field.closest(excluded)) return null;
    if (field.tagName === 'INPUT' && !['text',''].includes(field.type)) return null;
    return field;
  }
  function snapshot(root) {
    if (root.matches('input,textarea')) return {root, text:root.value, parts:[], field:true};
    let text = ''; const parts = [];
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const start = text.length; text += node.data; parts.push({node,start,end:text.length}); return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE || node.matches('script,style,pre,code,.doc-annotation-layer,[data-writing-check="off"]')) return;
      if (node.tagName === 'BR') { text += '\n'; return; }
      if (/^(P|DIV|LI|H[1-6]|BLOCKQUOTE|TR|SECTION)$/.test(node.tagName) && text && !text.endsWith('\n')) text += '\n';
      for (const child of node.childNodes) walk(child);
      if (/^(P|DIV|LI|H[1-6]|BLOCKQUOTE|TR|SECTION)$/.test(node.tagName) && text && !text.endsWith('\n')) text += '\n';
    }
    if (root.id === 'docPagesHost') {
      root.querySelectorAll('.doc-content').forEach(content => { walk(content); if (text && !text.endsWith('\n')) text += '\n'; });
    } else walk(root);
    return {root,text,parts,field:false};
  }
  function rangeFor(snap, match) {
    const end = match.offset + match.length;
    const first = snap.parts.find(part => part.start <= match.offset && part.end > match.offset)
      || snap.parts.find(part => part.start >= match.offset);
    const last = match.length ? [...snap.parts].reverse().find(part => part.start < end && part.end >= end) : first;
    if (!first || !last) return null;
    const range = document.createRange();
    range.setStart(first.node, Math.max(0,Math.min(first.node.length,match.offset-first.start)));
    range.setEnd(last.node, Math.max(0,Math.min(last.node.length,end-last.start)));
    return range;
  }
  function clearHighlights() {
    clearMirror();
    if (window.CSS?.highlights) { CSS.highlights.delete('sanctum-spelling'); CSS.highlights.delete('sanctum-grammar'); }
  }
  // A visual-only copy supplies underlines for native fields without changing their value.
  function drawFieldHighlights() {
    const field=current.snap.root, style=getComputedStyle(field);
    mirror=node('div',null,'writing-check-mirror'); mirror.setAttribute('aria-hidden','true');
    const text=node('div',null,'writing-check-mirror-text');
    for(const property of ['fontFamily','fontSize','fontWeight','fontStyle','fontVariant','fontStretch','fontKerning','fontFeatureSettings','lineHeight','letterSpacing','wordSpacing','textIndent','textAlign','textTransform','textRendering','direction','tabSize','paddingTop','paddingRight','paddingBottom','paddingLeft']) text.style[property]=style[property];
    text.style.whiteSpace=field.tagName==='INPUT'||field.wrap==='off'?'pre':'pre-wrap';
    text.style.overflowWrap=style.overflowWrap;
    text.style.wordBreak=style.wordBreak;
    text.style.width=`${field.clientWidth}px`;
    text.style.minHeight=`${field.scrollHeight}px`;
    if(field.tagName==='INPUT')text.style.lineHeight=`${Math.max(1,field.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom))}px`;
    let offset=0;
    const sorted=[...current.matches].sort((a,b)=>a.offset-b.offset);
    for(const match of sorted){
      if(match.offset<offset || !match.length)continue;
      text.append(document.createTextNode(current.snap.text.slice(offset,match.offset)));
      const mark=node('span',match.original,match.spelling?'writing-check-spelling':'writing-check-grammar');
      mark._writingMatch=match; text.append(mark); offset=match.offset+match.length;
    }
    text.append(document.createTextNode(current.snap.text.slice(offset)+'\u200b'));
    mirror.append(text); host().append(mirror); positionMirror();
  }
  function positionMirror() {
    if(!mirror || !current?.snap.field)return;
    const field=current.snap.root, rect=field.getBoundingClientRect();
    Object.assign(mirror.style,{left:`${rect.left+field.clientLeft}px`,top:`${rect.top+field.clientTop}px`,width:`${field.clientWidth}px`,height:`${field.clientHeight}px`});
    mirror.firstChild.style.transform=`translate(${-field.scrollLeft}px,${-field.scrollTop}px)`;
    let left=0,top=0,right=window.innerWidth,bottom=window.innerHeight;
    for(let ancestor=field.parentElement;ancestor&&ancestor!==document.body;ancestor=ancestor.parentElement){
      const style=getComputedStyle(ancestor),bounds=ancestor.getBoundingClientRect();
      if(/auto|scroll|hidden|clip/.test(style.overflowX)){left=Math.max(left,bounds.left+ancestor.clientLeft);right=Math.min(right,bounds.left+ancestor.clientLeft+ancestor.clientWidth);}
      if(/auto|scroll|hidden|clip/.test(style.overflowY)){top=Math.max(top,bounds.top+ancestor.clientTop);bottom=Math.min(bottom,bounds.top+ancestor.clientTop+ancestor.clientHeight);}
    }
    mirror.style.clipPath=`inset(${Math.max(0,top-rect.top-field.clientTop)}px ${Math.max(0,rect.left+field.clientLeft+field.clientWidth-right)}px ${Math.max(0,rect.top+field.clientTop+field.clientHeight-bottom)}px ${Math.max(0,left-rect.left-field.clientLeft)}px)`;
  }
  function drawHighlights() {
    clearHighlights();
    if (!current) return;
    if(current.snap.field){drawFieldHighlights();return;}
    if (!window.CSS?.highlights || !window.Highlight) return;
    const spelling = [], grammar = [];
    current.matches.forEach(match => { const range = rangeFor(current.snap,match); if (range) (match.spelling ? spelling : grammar).push(range); });
    CSS.highlights.set('sanctum-spelling',new Highlight(...spelling));
    CSS.highlights.set('sanctum-grammar',new Highlight(...grammar));
  }
  function host() { return document.querySelector('dialog[open]:modal:last-of-type') || document.body; }
  function invalidate() {
    revision++; controller?.abort(); clearTimeout(timer); closeSuggestion();current = null; clearHighlights();
  }
  function status(message) { if (panel) panel.querySelector('[data-status]').textContent = message; }
  function persist(key, value) {
    if (window.writeStorageJSON(key,value) === false) throw new Error('Could not save this change. Try again.');
  }
  function node(tag, text, className) {
    const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el;
  }
  function button(text, action) { const el = node('button',text); el.type = 'button'; el.onclick = action; return el; }
  function textOffset(snap,container,offset) {
    for(const part of snap.parts){
      if(part.node===container)return part.start+offset;
      const point=document.createRange(),range=document.createRange();point.setStart(container,offset);point.collapse(true);range.selectNodeContents(part.node);
      if(point.compareBoundaryPoints(Range.START_TO_START,range)<=0)return part.start;
    }
    return snap.text.length;
  }
  function wordSelection(field,atPoint=null,allowCaret=false) {
    const root=field.closest('#docPagesHost')||field,snap=snapshot(root);
    let start,end,rect=field.getBoundingClientRect();
    if(snap.field){start=field.selectionStart;end=field.selectionEnd;}
    else {
      const selection=window.getSelection();
      let range=selection?.rangeCount?selection.getRangeAt(0):null;
      if(!range || !root.contains(range.startContainer)||!root.contains(range.endContainer))range=null;
      if((!range||range.collapsed)&&atPoint){
        const position=document.caretPositionFromPoint?.(atPoint.x,atPoint.y);
        if(position){range=document.createRange();range.setStart(position.offsetNode,position.offset);range.collapse(true);}
        else range=document.caretRangeFromPoint?.(atPoint.x,atPoint.y)||null;
        if(range&&!root.contains(range.startContainer))range=null;
      }
      if(!range)return null;
      start=textOffset(snap,range.startContainer,range.startOffset);end=textOffset(snap,range.endContainer,range.endOffset);
      if(!range.collapsed)rect=range.getBoundingClientRect();
    }
    if(start==null||end==null)return null;
    if(start===end){
      if(!allowCaret && !atPoint)return null;
      const found=[...snap.text.matchAll(/[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*/gu)].find(match=>match.index<=start&&match.index+match[0].length>=start);
      if(!found)return null;start=found.index;end=start+found[0].length;
    }
    const selected=snap.text.slice(start,end),trimmed=selected.trim();start+=selected.indexOf(trimmed);
    if(!trimmed||trimmed.length>80||!/^[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*$/u.test(trimmed))return null;
    return {snap,match:{offset:start,length:trimmed.length,original:trimmed},x:rect.left,y:rect.bottom};
  }
  function positionSuggestion(x,y) {
    const rect=suggestion.getBoundingClientRect();
    suggestion.style.left=`${Math.max(8,Math.min(window.innerWidth-rect.width-8,x))}px`;
    suggestion.style.top=`${Math.max(8,Math.min(window.innerHeight-rect.height-8,y+12))}px`;
  }
  function popupHeader(title,closeLabel,root=target) {
    const heading=node('header'),controls=node('div',null,'writing-check-card-tools');
    const settingsButton=button('⋯',()=>openPanel(root));settingsButton.setAttribute('aria-label','Writing settings');settingsButton.title='Writing settings';
    controls.append(settingsButton);heading.append(node('span',title),controls);return heading;
  }
  function createCard(className='') {
    const card=node('section',null,`writing-check-suggestion ${className}`.trim());
    card.addEventListener('mousedown',event=>{if(event.button===0)event.preventDefault();});
    return card;
  }
  function choicePages(content,pages,accept,enabled) {
    let index=0;
    function render(){
      content.replaceChildren();const page=pages[index],choices=node('div',null,'writing-check-quick-choices');
      page.words.forEach(word=>{const item=button(word||'Remove',()=>accept(word));item.title=word||'Remove';item.disabled=!enabled;choices.append(item);});
      content.append(choices);
      if(page.label||pages.length>1){
        const footer=node('div',null,'writing-check-card-meta');
        if(pages.length>1)footer.append(button('More suggestions ›',()=>{const keyboardFocus=content.contains(document.activeElement);index=(index+1)%pages.length;render();if(keyboardFocus)content.querySelector('.writing-check-card-meta button')?.focus({preventScroll:true});}));
        content.append(footer);
      }
    }
    render();
  }
  async function openAlternatives(selected,x=selected.x,y=selected.y,focusChoices=false) {
    const {snap,match}=selected;
    if(!snap.root.isConnected||snapshot(snap.root).text!==snap.text)return;
    if(snap.root!==target){invalidate();restoreNativeSpelling();ignored.clear();target=snap.root;watchTarget();}
    closeSuggestion();
    suggestion=createCard('writing-check-alternatives');
    suggestion.setAttribute('role','dialog');suggestion.setAttribute('aria-label',`Alternatives for ${match.original}`);
    const heading=popupHeader('Suggestions','Close alternatives',snap.root);
    const content=node('div');content.append(node('p','Checking spelling…'));suggestion.append(heading,content);host().append(suggestion);positionSuggestion(x,y);
    const popup=suggestion;alternativesController=new AbortController();
    const signal=alternativesController.signal;
    try{
      if(!current||current.snap.root!==snap.root||current.snap.text!==snap.text)await check();
      if(popup!==suggestion||!snap.root.isConnected||snapshot(snap.root).text!==snap.text)return;
      const correction=current?.matches.find(item=>item.offset<match.offset+match.length&&item.offset+item.length>match.offset);
      if(correction){openSuggestion(correction,x,y);if(focusChoices)suggestion?.querySelector('.writing-check-quick-choices button:not(:disabled)')?.focus({preventScroll:true});return;}
      heading.firstChild.textContent='Synonyms';content.replaceChildren(node('p','Finding suggestions…'));
      const response=await fetch('/api/writing-check/alternatives',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(M.context(snap.text,match)),signal});
      const result=await response.json();
      if(popup!==suggestion||!snap.root.isConnected)return;
      if(snapshot(snap.root).text!==snap.text){closeSuggestion();return;}
      if(!response.ok||result.localOnly!==true)throw new Error(result.error||'The offline thesaurus is unavailable.');
      if(result.contextual!==true)throw new Error('Restart Sanctum to load sentence-aware suggestions.');
      content.replaceChildren();
      if(!result.groups.length)content.append(node('p','No suitable synonyms found here.'));
      const words=[...new Set(result.groups.flatMap(group=>group.words))],pages=[];
      for(let offset=0;offset<words.length;offset+=4)pages.push({words:words.slice(offset,offset+4)});
      if(pages.length)choicePages(content,pages,word=>apply(match,word,snap),canCorrect(snap,match));
      positionSuggestion(x,y);if(focusChoices)content.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
    }catch(error){if(error.name!=='AbortError'&&popup===suggestion)content.replaceChildren(node('p',error.message));}
  }
  function matchAtPoint(x,y) {
    if(!current)return null;
    if(current.snap.field){
      return [...(mirror?.querySelectorAll('span') || [])].find(mark=>[...mark.getClientRects()].some(rect=>x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom))?._writingMatch || null;
    }
    return current.matches.find(match=>{const range=rangeFor(current.snap,match);return range&&[...range.getClientRects()].some(rect=>x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom);}) || null;
  }
  function openSuggestion(match,x,y) {
    closeSuggestion();
    suggestion=createCard();
    suggestion.setAttribute('role','dialog');suggestion.setAttribute('aria-label',`Corrections for ${match.original}`);
    suggestion.append(popupHeader(match.spelling?'Spelling':'Grammar & punctuation','Close suggestion'));
    if(!match.spelling){const explanation=node('p',match.message,'writing-check-explanation');explanation.title=match.message;suggestion.append(explanation);}
    const choices=node('div');
    if(match.replacements.length){
      const pages=[];for(let offset=0;offset<match.replacements.length;offset+=4)pages.push({words:match.replacements.slice(offset,offset+4)});
      choicePages(choices,pages,value=>apply(match,value),canCorrect(current.snap,match));
    }else choices.append(node('p','No suggested correction.'));
    suggestion.append(choices);
    const actions=node('div',null,'writing-check-card-actions');
    if(match.spelling){const save=button('Add word',()=>addWord(match.original));save.setAttribute('aria-label','Add to dictionary');actions.append(save);}
    actions.append(button('Ignore',()=>{ignored.add(`${match.ruleId}:${match.original}`);current.matches=current.matches.filter(item=>!ignored.has(`${item.ruleId}:${item.original}`));closeSuggestion();drawHighlights();renderMatches();}));
    suggestion.append(actions);
    suggestion.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeSuggestion();target?.focus();}});
    host().append(suggestion);
    positionSuggestion(x,y);
  }
  function addWord(word) {
    try {
      dictionary = M.words(window.readStorageJSON(dictionaryKey, []));
      const next = M.words([...dictionary,word]);
      if (!M.canonical(word) || !next.some(item => M.canonical(item) === M.canonical(word))) throw new Error('Enter a word or phrase up to 120 characters.');
      persist(dictionaryKey,next); dictionary = next; renderDictionary(); check();
    } catch(error) { status(error.message); }
  }
  function renderDictionary() {
    if (!panel) return;
    const list = panel.querySelector('[data-dictionary]'); list.replaceChildren();
    panel.querySelector('[data-dictionary-count]').textContent = `Personal dictionary (${dictionary.length})`;
    dictionary.forEach(word => {
      const row = node('div',null,'writing-dictionary-word'); row.append(node('span',word));
      const remove = button('×', () => {
        try { const next = dictionary.filter(item => M.canonical(item) !== M.canonical(word)); persist(dictionaryKey,next); dictionary = next; renderDictionary(); check(); }
        catch(error) { status(error.message); }
      });
      remove.setAttribute('aria-label',`Remove ${word} from dictionary`); row.append(remove); list.append(row);
    });
    if (!dictionary.length) list.append(node('p','Save names, invented words, and phrases here.','writing-check-help'));
  }
  function canCorrect(snap, match) {
    if (snap.field) return !snap.root.disabled && !snap.root.readOnly;
    const range = rangeFor(snap,match);
    return !!range && range.startContainer.parentElement?.isContentEditable && range.endContainer.parentElement?.isContentEditable;
  }
  function apply(match, replacement, source = current?.snap) {
    if (!target?.isConnected || !source || source.root!==target) return;
    const fresh = snapshot(target);
    if (fresh.text !== source.text) { status('The text changed. Checking it again…'); check(); return; }
    if (!canCorrect(fresh,match)) { status('Turn on editing to apply corrections.'); return; }
    try {
      M.replace(fresh.text,match,replacement);
      if (fresh.field) {
        target.focus(); target.setSelectionRange(match.offset,match.offset+match.length);
      } else {
        const range = rangeFor(fresh,match);
        range.startContainer.parentElement.closest('[contenteditable="true"]').focus();
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      }
      const before = fresh.text;
      let native = document.execCommand('insertText',false,replacement);
      if (!native && fresh.field) target.setRangeText(replacement,match.offset,match.offset+match.length,'end');
      if (!native && !fresh.field) throw new Error('This editor could not apply the correction.');
      const changedElement = fresh.field ? target : window.getSelection()?.anchorNode?.parentElement?.closest('[contenteditable="true"]');
      changedElement?.dispatchEvent(new Event('input',{bubbles:true}));
      lastCorrection = {root:target,before,after:snapshot(target).text,native,field:fresh.field};
      if (panel) panel.querySelector('[data-undo]').disabled = false;
      check();
    } catch(error) { status(error.message); }
  }
  function undo() {
    const last = lastCorrection;
    if (!last?.root.isConnected || snapshot(last.root).text !== last.after) { status('Use the editor’s Undo after making other edits.'); return; }
    if (last.native) {
      const focus = last.field ? last.root : last.root.querySelector('[contenteditable="true"]') || last.root;
      focus.focus(); document.execCommand('undo'); focus.dispatchEvent(new Event('input',{bubbles:true}));
    } else { last.root.value = last.before; last.root.dispatchEvent(new Event('input',{bubbles:true})); }
    lastCorrection = null; panel.querySelector('[data-undo]').disabled = true; check();
  }
  function renderMatches() {
    if (!panel || !current) return;
    const list = panel.querySelector('[data-matches]'); list.replaceChildren();
    status(current.matches.length ? `${current.matches.length} suggestion${current.matches.length === 1 ? '' : 's'}` : 'No issues found');
  }
  async function check() {
    if (!target?.isConnected) { status('Choose a text field or open a document to check.'); return; }
    dictionary = M.words(window.readStorageJSON(dictionaryKey, []));
    const snap = snapshot(target);
    revision++;controller?.abort();clearTimeout(timer);const requestRevision = revision;
    if (snap.text.length > M.MAX_TEXT) { status('This section is too long to check at once. Split it into sections of up to 200,000 characters.'); return; }
    if (!snap.text.trim()) { status('Start writing, then check your text here.'); return; }
    status('Checking locally… The first check may take a moment.');
    controller = new AbortController();
    try {
      const response = await fetch('/api/writing-check/check',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({text:snap.text,language:settings.language,words:dictionary}),signal:controller.signal});
      const result = await response.json();
      if (requestRevision !== revision || !snap.root.isConnected || snapshot(snap.root).text !== snap.text) return;
      if (!response.ok) throw new Error(result.error || 'Local Writing Check is unavailable.');
      if (result.localOnly !== true) throw new Error('Could not confirm the local checker connection.');
      current = {snap: snapshot(snap.root), matches:result.matches.filter(match => !ignored.has(`${match.ruleId}:${match.original}`))};
      useLocalSpelling(snap.root);
      drawHighlights(); renderMatches();
    } catch(error) {
      if (error.name === 'AbortError' || requestRevision !== revision) return;
      restoreNativeSpelling();
      status(error.message);
    }
  }
  function closePanel() {
    if (panel?.contains(document.activeElement)) target?.focus();
    panel?.remove(); panel = null;
  }
  function openPanel(root = target) {
    closeSuggestion();
    if (root && root !== target) { invalidate(); restoreNativeSpelling(); ignored.clear(); target = root; lastCorrection = null; watchTarget(); }
    if (!panel) {
      panel = node('section',null,'writing-check-panel'); panel.setAttribute('role','dialog'); panel.setAttribute('aria-label','Writing settings');
      panel.innerHTML = `<header><div><h2>Writing settings</h2><p>Checked on this computer</p></div><button type="button" data-close aria-label="Close Writing settings">×</button></header>
        <div class="writing-check-controls"><button type="button" data-check>Check again</button><button type="button" data-undo disabled>Undo</button></div>
        <p data-status role="status"></p><div data-matches hidden></div><div class="writing-check-controls">
        <label>Language<select data-language><option value="en-US">English (US)</option><option value="en-GB">English (UK)</option><option value="en-CA">English (Canada)</option><option value="en-AU">English (Australia)</option></select></label>
        <label class="writing-check-live"><input type="checkbox" data-live> Automatic checking</label></div>
        <details class="writing-check-settings"><summary data-dictionary-count>Saved words</summary><p class="writing-check-help">Separate from your Lexicon.</p>
        <form data-add-word><label>Word or phrase<input maxlength="120" autocomplete="off" spellcheck="false" required></label><button type="submit">Add word</button></form><div data-dictionary></div></details>`;
      panel.querySelector('[data-close]').onclick = closePanel;
      panel.querySelector('[data-check]').onclick = () => check();
      panel.querySelector('[data-undo]').onclick = undo;
      panel.querySelector('[data-undo]').disabled=!lastCorrection || lastCorrection.root!==target;
      const language = panel.querySelector('[data-language]'); language.value = settings.language;
      const live = panel.querySelector('[data-live]'); live.checked = settings.live;
      const update = () => { try { const next=M.settings({language:language.value,live:live.checked}); persist(settingsKey,next); settings=next;return true; } catch(error) { status(error.message);return false; } };
      language.onchange = () => {if(update())check();};
      live.onchange = () => {if(update()){if(settings.live)check();else{clearTimeout(timer);controller?.abort();status('Automatic checking paused. Use Check again whenever you want.');}}};
      panel.querySelector('[data-add-word]').onsubmit = event => { event.preventDefault(); const input=event.currentTarget.querySelector('input'); addWord(input.value); input.value=''; };
      panel.addEventListener('keydown',event => { if(event.key === 'Escape') {event.preventDefault();event.stopPropagation();closePanel();} });
      host().append(panel); renderDictionary();
    } else if (panel.parentElement !== host()) host().append(panel);
    check();
  }
  document.addEventListener('focusin',event => {
    const field=editable(event.target); if (!field) return;
    const root=field.closest('#docPagesHost') || field;
    if (root !== target) {invalidate();restoreNativeSpelling(); ignored.clear();lastCorrection=null;target=root;watchTarget();if(panel)panel.querySelector('[data-undo]').disabled=true;}
    if (panel && panel.parentElement !== host()) host().append(panel);
    if (settings.live) {clearTimeout(timer);timer=setTimeout(check,900);}
  });
  document.addEventListener('input',event => {
    const field=editable(event.target);if(!field)return;
    const root=field.closest('#docPagesHost') || field;
    if(root!==target)return;
    invalidate();if(panel){panel.querySelector('[data-matches]').replaceChildren();status('Text changed.');}
    if(settings.live && !event.isComposing)timer=setTimeout(check,900);
  });
  document.addEventListener('compositionend',event => {if(editable(event.target)&&settings.live){clearTimeout(timer);timer=setTimeout(check,900);}});
  document.addEventListener('pointerdown',event => {
    if(!event.target.closest('.writing-check-suggestion'))closeSuggestion();
  });
  document.getElementById('docWritingCheck')?.addEventListener('click',() => openPanel(document.getElementById('docPagesHost')));
  // Highlight selection checks use the original DOM ranges and never inject markup into saved text.
  document.addEventListener('click',event => {
    if (!current || event.target.closest(excluded) || !target?.contains(event.target)) return;
    const match=matchAtPoint(event.clientX,event.clientY);
    if(match)openSuggestion(match,event.clientX,event.clientY);
  });
  document.addEventListener('contextmenu',event=>{
    if(event.defaultPrevented)return;
    const field=editable(event.target);if(!field)return;
    const match=target?.contains(event.target)?matchAtPoint(event.clientX,event.clientY):null;
    if(match){event.preventDefault();openSuggestion(match,event.clientX,event.clientY);return;}
    const selected=wordSelection(field,{x:event.clientX,y:event.clientY},true);
    if(selected){event.preventDefault();openAlternatives(selected,event.clientX,event.clientY);}
  });
  document.addEventListener('dblclick',event=>{
    const field=editable(event.target);if(!field)return;
    const match=target?.contains(event.target)?matchAtPoint(event.clientX,event.clientY):null;
    if(match){openSuggestion(match,event.clientX,event.clientY);return;}
    const selected=wordSelection(field);if(selected)openAlternatives(selected);
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='F7'&&event.shiftKey){const field=editable(event.target);if(!field)return;const selected=wordSelection(field,null,true);if(selected){event.preventDefault();openAlternatives(selected,selected.x,selected.y,true);}}
  },true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&suggestion){event.preventDefault();event.stopPropagation();const hadFocus=suggestion.contains(document.activeElement);closeSuggestion();if(hadFocus)(target?.querySelector('[contenteditable="true"]')||target)?.focus();}},true);
  window.addEventListener('storage',event => {if(event.key===dictionaryKey){dictionary=M.words(window.readStorageJSON(dictionaryKey,[]));renderDictionary();if(target?.isConnected)check();}});
  window.addEventListener('resize',() => {closeSuggestion();positionMirror();});
  document.addEventListener('scroll',event=>{if(event.target instanceof Element && event.target.closest('.writing-check-suggestion,.writing-check-panel'))return;closeSuggestion();positionMirror();},true);
  new MutationObserver(() => {
    if(target && (!target.isConnected || target.closest('dialog:not([open])') || target.id === 'docPagesHost' && !target.closest('#docEditor.active') && document.getElementById('docEditor'))){invalidate();restoreNativeSpelling();targetObserver.disconnect();fieldResizeObserver.disconnect();target=null;closePanel();}
  }).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','open']});
  function contextActions(field,x,y) {
    closeSuggestion();
    const actions=[],match=target?.contains(field)?matchAtPoint(x,y):null;
    if(match)actions.push({label:match.spelling?'Spelling suggestion':'Punctuation & grammar suggestion',action:()=>{if(current&&snapshot(target).text===current.snap.text)openSuggestion(match,x,y);}});
    const selected=wordSelection(field,{x,y},true);
    if(selected&&!match)actions.push({label:'Spelling & word suggestions',action:()=>openAlternatives(selected,x,y)});
    return actions;
  }
  window.SanctumWritingCheck = {open:openPanel,check,snapshot,rangeFor,contextActions};
})();
