(function(){
  const M=window.SanctumCharacterSheetData;
  const viewportWidth=()=>document.getElementById('pageCanvas')?.clientWidth||window.innerWidth||1280;
  function fitPage(pageId,blocks){
    const page=window.userPages.find(p=>p.id===pageId);if(!page||!['board-canvas','infinite-canvas'].includes(page.layout))return blocks;
    return M.fit(blocks,viewportWidth(),page.layout==='infinite-canvas');
  }
  const groups={'character-essentials':['aliases','pronouns','born','age','occupation','status','home','birthplace','affiliations'],
    'character-relationships':['parents','partners','siblings','friends'], 'character-magic':['magic','abilities','mentors']};
  const titles={'character-essentials':'Character essentials','character-relationships':'Character relationships','character-magic':'Magic & training'};
  function ensure(pageId){const before=window.getPageProps(pageId),after=M.ensure(before);if(JSON.stringify(before)!==JSON.stringify(after))window.setPageProps(pageId,after);return after;}
  function render(container,pageId,id){
    if(!groups[id])return false;
    const data=ensure(pageId);container.replaceChildren();container.classList.add('character-sheet-fields');
    const wrap=document.createElement('div');wrap.className=id==='character-essentials'?'character-essentials':'character-fields-grid';container.append(wrap);
    if(id==='character-essentials'){
      const portrait=document.createElement('div');portrait.className='character-portrait';wrap.append(portrait);
      const source=window.SanctumTimelineData.safeImage(M.field(data,'portrait')?.value);
      if(source){const img=document.createElement('img');img.src=source;img.alt='Character portrait';portrait.append(img);}
      else{const hint=document.createElement('span');hint.textContent='A face to the name';portrait.append(hint);}
      const label=document.createElement('label');label.className='character-portrait-upload';label.append(document.createTextNode(source?'Change portrait':'Add portrait'));
      const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp,image/gif';input.setAttribute('aria-label','Upload character portrait');label.append(input);portrait.append(label);
      input.onchange=()=>{const file=input.files[0];if(!file)return;if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type)||file.size>5*1024*1024){window.showAppToast('Choose a JPG, PNG, WebP, or GIF under 5 MB.','info');return;}const reader=new FileReader();reader.onload=()=>{const latest=ensure(pageId);M.field(latest,'portrait').value=reader.result;window.setPageProps(pageId,latest);window.refreshPageRelationViews();};reader.readAsDataURL(file);};
      const details=document.createElement('details');details.className='character-portrait-url';const summary=document.createElement('summary');summary.textContent='Image link';details.append(summary);
      const url=document.createElement('input');url.type='url';url.placeholder='https://…';url.setAttribute('aria-label','Portrait image URL');if(source&&!source.startsWith('data:'))url.value=source;
      url.onchange=()=>{if(url.value&&!window.SanctumTimelineData.safeImage(url.value)){window.showAppToast('Use an image URL.','info');return;}const latest=ensure(pageId);M.field(latest,'portrait').value=url.value;window.setPageProps(pageId,latest);window.refreshPageRelationViews();};details.append(url);portrait.append(details);
    }
    const fields=document.createElement('div');fields.className='character-fields-grid';wrap.append(fields);
    for(const key of groups[id]){const prop=M.field(data,key);const row=document.createElement('div');fields.append(row);window.renderPagePropsStrip(pageId,'character',{container:row,propertyId:prop.id});}
    if(id==='character-relationships'){
      const help=document.createElement('p');help.className='character-sheet-help';help.textContent='Link their people, then use + detail to describe the bond. These same connections appear in your trees.';container.append(help);
      const select=document.createElement('select');select.className='character-add-relation';select.setAttribute('aria-label','Add relationship type');select.innerHTML='<option value="">+ Relationship type</option><option>Children</option><option>Adoptive parents</option><option>Step parents</option><option>Guardians</option><option>Rivals</option><option value="custom">Custom…</option>';
      select.onchange=()=>{const name=select.value;if(!name)return;if(name==='custom'){window.openAddPropertyDialog(pageId,prop=>{const latest=window.getPageProps(pageId);latest.properties.find(p=>p.id===prop.id).characterRelationship=true;window.setPageProps(pageId,latest);window.refreshPageRelationViews();},select);select.value='';return;}
        const latest=window.getPageProps(pageId);if(!latest.properties.some(p=>p.type==='relation'&&p.label.toLowerCase()===name.toLowerCase()))latest.properties.push({id:`character-relation-${Date.now()}`,label:name,type:'relation',linkedPageIds:[],targetCategory:'character'});window.setPageProps(pageId,latest);window.refreshPageRelationViews();};container.append(select);
      const extra=data.properties.filter(p=>p.type==='relation'&&!groups[id].some(key=>M.field(data,key)?.id===p.id)&&(p.characterRelationship||window.SanctumTreeData.TYPES[window.SanctumTreeData.classify(p).kind]));
      for(const prop of extra){if(prop.id==='mentors')continue;const row=document.createElement('div');fields.append(row);window.renderPagePropsStrip(pageId,'character',{container:row,propertyId:prop.id});}
    }
    if(id==='character-magic'){const help=document.createElement('p');help.className='character-sheet-help';help.textContent='Link a discipline and choose a proficiency level. Its rules determine which spells are available.';container.append(help);}
    return true;
  }
  function applyStarter(pageId,layout){
    if(!['board-canvas','infinite-canvas'].includes(layout))return false;
    const previous=window.getPageBlocks(pageId);if(previous.length)return false;
    ensure(pageId);if(window.setPageBlocks(pageId,M.build(pageId,{infinite:layout==='infinite-canvas',viewportWidth:viewportWidth()}))===false)throw new Error('Could not save the character starter.');return true;
  }
  function openSections(pageId){
    const page=window.userPages.find(p=>p.id===pageId);if(!page||!['board-canvas','infinite-canvas'].includes(page.layout))return;
    window.saveState?.();document.querySelectorAll('.topbar-dropdown').forEach(el=>el.remove());
    const existing=window.getPageBlocks(pageId),done=new Set(existing.map(b=>b.characterSection));
    const dialog=document.createElement('dialog');dialog.className='character-sections-dialog';dialog.setAttribute('aria-label','Character sections');
    dialog.innerHTML='<h2>Character sections</h2><p>Choose a starting point. New sections are added below your existing content; everything stays movable and editable.</p><form><div class="character-section-choices"></div><p role="alert"></p><footer><button type="button" data-cancel>Cancel</button><button type="submit">Add sections</button></footer></form>';
    for(const section of M.sections){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=section.id;input.disabled=done.has(section.id);input.checked=section.core&&!input.disabled;label.append(input,document.createTextNode(section.title+(input.disabled?' · already added':'')));dialog.querySelector('.character-section-choices').append(label);}
    dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());dialog.addEventListener('keydown',e=>e.stopPropagation());
    dialog.querySelector('form').onsubmit=e=>{e.preventDefault();const selected=[...dialog.querySelectorAll('input:checked:not(:disabled)')].map(el=>el.value);if(!selected.length){dialog.querySelector('[role="alert"]').textContent='Choose at least one section.';return;}
      window.saveState?.();const current=window.getPageBlocks(pageId);const startY=current.length?Math.max(...current.map(b=>(Number(b.y)||0)+(Number(b.h)||0)))+48:undefined;
      ensure(pageId);if(window.setPageBlocks(pageId,[...current,...M.build(pageId,{selected,startY,infinite:page.layout==='infinite-canvas',viewportWidth:viewportWidth()})])===false){dialog.querySelector('[role="alert"]').textContent='Could not save these sections.';return;}dialog.close();window.clearGrid();window.loadPageBlocks(pageId);window.expandGrid();window.pushHistory?.();};
    document.body.append(dialog);dialog.showModal();
  }
  window.SanctumCharacterSheet={render,ensure,applyStarter,openSections,titles,fitPage};
  let resizePending=false;
  function fitCurrent(){
    if(resizePending)return;resizePending=true;requestAnimationFrame(()=>{resizePending=false;
      const elements=[...document.querySelectorAll('#grid > .block:not(.ghost)')];
      const current=elements.map(el=>({characterSection:el.dataset.characterSection,characterLayout:M.readLayout(el.dataset.characterLayout),x:parseFloat(el.style.left),y:parseFloat(el.style.top),w:parseFloat(el.style.width),h:parseFloat(el.style.height)}));
      const fitted=fitPage(window.getCurrentPageId?.(),current);if(fitted===current)return;
      elements.forEach((el,i)=>{if(!fitted[i].characterSection)return;el.style.left=`${fitted[i].x}px`;el.style.width=`${fitted[i].w}px`;el.dataset.characterLayout=JSON.stringify(fitted[i].characterLayout);});window.expandGrid?.();
    });
  }
  window.addEventListener('sanctum:scripts-ready',fitCurrent);
  window.addEventListener('resize',fitCurrent);
})();
