(function() {
  const catalog=window.SanctumIconCatalog;
  const host=document.getElementById('pageIconLibrary');
  const input=document.getElementById('pageIconInput');
  if(!catalog||!host||!input)return;
  let kind='emoji',limit=96;
  const custom=document.getElementById('pageIconCustom');
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  host.innerHTML=`<div class="icon-library-tabs" role="tablist" aria-label="Icon type">
    <button type="button" role="tab" id="iconEmojiTab" aria-controls="iconLibraryPanel" data-kind="emoji" aria-selected="true">Emoji</button>
    <button type="button" role="tab" id="iconSymbolTab" aria-controls="iconLibraryPanel" data-kind="symbol" aria-selected="false" tabindex="-1">Symbols</button>
    <button type="button" role="tab" id="iconCustomTab" aria-controls="pageIconCustom" data-kind="custom" aria-selected="false" tabindex="-1">Upload / link</button>
    </div><div id="iconLibraryPanel" role="tabpanel" aria-labelledby="iconEmojiTab">
    <div class="icon-library-filters"><input type="search" id="iconLibrarySearch" aria-label="Search icons" placeholder="Search: dragon, coding, 日本語, period…" autocomplete="off"><select id="iconLibraryCategory" aria-label="Icon category"><option value="">All categories</option>${catalog.categories.map(c=>`<option value="${c.id}">${esc(c.label)}</option>`).join('')}</select></div>
    <div class="icon-library-results" role="group" aria-label="Icon choices"></div><div class="icon-library-bottom"><span role="status" aria-live="polite"></span><button type="button" class="page-icon-btn" data-more>Show more</button></div></div>`;
  const search=host.querySelector('#iconLibrarySearch'),category=host.querySelector('#iconLibraryCategory');
  const results=host.querySelector('.icon-library-results'),status=host.querySelector('[role=status]'),more=host.querySelector('[data-more]');
  const panel=host.querySelector('#iconLibraryPanel');
  const tabs=[...host.querySelectorAll('[role=tab]')];
  function selectionLabel(value) {
    return catalog.entries.find(e=>e.value===value)?.label||(isImageIconValue(value)?'Custom image':value?'Custom icon':'No icon selected');
  }
  function syncSelected() {
    const value=input.dataset.clear==='true'?'':input.value.trim()||input.dataset.currentIcon||'';
    results.querySelectorAll('[data-value]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.value===value)));
    document.getElementById('pageIconSelectionName').textContent=selectionLabel(value);
  }
  function render() {
    panel.hidden=kind==='custom';custom.hidden=kind!=='custom';
    tabs.forEach(tab=>{const active=tab.dataset.kind===kind;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;});
    if(kind==='custom')return;
    panel.setAttribute('aria-labelledby',kind==='emoji'?'iconEmojiTab':'iconSymbolTab');
    const matches=catalog.search({kind,category:category.value,query:search.value});
    results.innerHTML=matches.slice(0,limit).map(e=>`<button type="button" class="icon-library-choice" data-value="${esc(e.value)}" title="${esc(e.label)}" aria-label="${esc(e.label)}" aria-pressed="false">${e.kind==='symbol'?catalog.getSymbolMarkup(e.value):esc(e.value)}</button>`).join('');
    if(!matches.length)results.innerHTML='<p class="icon-library-empty">No matches. Try another word or choose All categories.</p>';
    status.textContent=`${matches.length} ${kind==='emoji'?'emoji':'symbols'}${matches.length>limit?` · showing ${limit}`:''}`;
    more.hidden=matches.length<=limit;syncSelected();
  }
  tabs.forEach(tab=>{
    tab.onclick=()=>{kind=tab.dataset.kind;limit=96;render();results.scrollTop=0;};
    tab.onkeydown=e=>{
      let index=tabs.indexOf(tab);
      if(e.key==='ArrowRight')index=(index+1)%tabs.length;
      else if(e.key==='ArrowLeft')index=(index+tabs.length-1)%tabs.length;
      else if(e.key==='Home')index=0;
      else if(e.key==='End')index=tabs.length-1;
      else return;
      e.preventDefault();tabs[index].click();tabs[index].focus();
    };
  });
  search.oninput=category.onchange=()=>{limit=96;render();results.scrollTop=0;};
  more.onclick=()=>{limit+=96;render();};
  results.onclick=e=>{
    const button=e.target.closest('[data-value]');if(!button)return;
    input.value=button.dataset.value;input.dataset.clear='false';
    input.dispatchEvent(new Event('input',{bubbles:true}));syncSelected();
  };
  results.onkeydown=e=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
    const buttons=[...results.querySelectorAll('button')],index=buttons.indexOf(e.target);if(index<0)return;
    const columns=buttons.filter(b=>b.offsetTop===buttons[0].offsetTop).length||1;
    const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:index+({ArrowLeft:-1,ArrowRight:1,ArrowUp:-columns,ArrowDown:columns}[e.key]);
    e.preventDefault();buttons[Math.max(0,Math.min(buttons.length-1,next))]?.focus();
  };
  input.addEventListener('input',syncSelected);
  document.getElementById('pageIconClearBtn').addEventListener('click',syncSelected);
  document.getElementById('pageIconOverlay').addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closePageIconPicker();}
    if(e.key==='Tab') {
      const focusable=[...e.currentTarget.querySelectorAll('button,input,select,[tabindex="0"]')].filter(el=>!el.disabled&&el.tabIndex>=0&&el.getClientRects().length);
      const first=focusable[0],last=focusable.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }
  });
  window.preparePageIconLibrary=value=>{
    kind=value?.startsWith('symbol:')?'symbol':isImageIconValue(value)?'custom':'emoji';
    limit=96;search.value='';category.value='';render();results.scrollTop=0;syncSelected();
  };
  window.syncPageIconLibrary=syncSelected;
  window.focusPageIconLibrary=()=>{(kind==='custom'?input:search).focus();};
})();
