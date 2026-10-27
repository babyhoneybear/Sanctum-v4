(function () {
  const M=window.SanctumTreeData, DB=window.SanctumTreeDatabase, Native=window.SanctumTimelineDatabase;
  const key=window.STORAGE_KEYS?.relationshipTrees || 'sanctum_relationship_trees_v1';
  const mounted=new Map(), states=new Map(); let scheduled=false;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sourceKey=window.SanctumTimelineData.sourceKey, safeImage=window.SanctumTimelineData.safeImage;
  const read=()=>window.readStorageJSON(key,{});
  const settings=id=>M.view(read().views?.[id]);
  const sourceSettings=source=>read().sources?.[sourceKey(source)]||{};
  const pages=()=>window.userPages||[];
  const props=()=>window.readStorageJSON(window.STORAGE_KEYS.pageProps,{});
  function store(section,id,value){const all=read();all[section]={...all[section],[id]:value};if(window.writeStorageJSON(key,all)===false)throw new Error('Could not save this tree.');}
  function refresh(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;for(const [host] of [...mounted]){if(!host.isConnected){mounted.delete(host);continue;}Native.refresh(host);}});}
  function error(el,err){el.querySelector('[role="alert"]').textContent=err.message||String(err);}
  function dialog(title){
    document.querySelectorAll('.topbar-dropdown').forEach(menu=>menu.remove());
    const el=document.createElement('dialog');el.className='tree-dialog';const id=`tree-dialog-${Date.now()}`;
    el.setAttribute('aria-labelledby',id);el.innerHTML=`<header><h2 id="${id}">${esc(title)}</h2><button type="button" data-close aria-label="Close dialog">×</button></header>`;
    el.querySelector('[data-close]').onclick=()=>el.close();el.addEventListener('keydown',e=>e.stopPropagation());
    el.addEventListener('close',()=>el.remove());document.body.append(el);return el;
  }
  function belongsToSource(page,source){const ref=page?.databaseRowRef;return ref&&sourceKey({kind:ref.sourceKind,pageId:ref.sourcePageId,blockId:ref.sourceBlockId})===sourceKey(source);}
  function membership(source,ids){const conf=sourceSettings(source);store('sources',sourceKey(source),{...conf,members:[...new Set([...(conf.members||[]),...ids])].filter(id=>!belongsToSource(pages().find(p=>p.id===id),source))});}
  function person(page,all=props()){
    const record=DB.person(page.id), fields=all[page.id]?.properties||[];
    const value=labels=>fields.find(p=>p.type==='text'&&labels.includes(String(p.label||'').toLowerCase()))?.value||'';
    const image=record?.image ?? (value(['portrait','image','photo'])||page.icon);
    return {id:page.id,title:record?.title||page.title||'Untitled',image:safeImage(image),born:String(record?.born??value(['born','birth date'])),died:String(record?.died??value(['died','death date'])),readOnly:record?.readOnly||false};
  }
  function links(){return M.collect(pages(),props(),DB.edges(pages()));}
  function model(options){
    const all=props(), members=new Set([...(options.rows||[]).filter(r=>!r.archived).map(r=>r.pageId),...(sourceSettings(options.source).members||[]).filter(id=>!belongsToSource(pages().find(p=>p.id===id),options.source))]);
    const people=pages().filter(p=>members.has(p.id)).map(p=>person(p,all));
    return {people,links:links().filter(e=>members.has(e.from)&&members.has(e.to))};
  }
  function picker(el,options,excluded=[]){
    const wrap=document.createElement('div');wrap.className='tree-picker';
    // Use the original database's project even when this is embedded on another homepage.
    const getScopeId=id=>window.getVaultScopeId?.(id)||'', scopeId=getScopeId(options.source.pageId);
    const scopeLabel=id=>window.getVaultScopeLabel?.(id)||'Outside projects';
    const scopes=[...new Set(pages().map(p=>getScopeId(p.id)))].filter(id=>id!==scopeId).sort((a,b)=>scopeLabel(a).localeCompare(scopeLabel(b)));
    const peopleIds=model(options).people.map(p=>p.id), all=props();
    const types=[...new Set(pages().map(p=>p.category).filter(t=>t&&t!=='none'))];
    const typeLabel=t=>({'character':'Characters','database-row':'Database entries','location':'Locations','spell':'Spells','event':'Events','item':'Items'}[t]||window.SanctumCustomTypes?.label(t)||t);
    const pathLabel=p=>{const project=scopeLabel(getScopeId(p.id)),parent=pages().find(item=>item.id===p.parent)?.title;return parent&&parent!==project?`${project} · ${parent}`:project;};
    wrap.innerHTML=`<div class="tree-pair"><label>Project<select data-scope><option value="${esc(scopeId)}">${esc(scopeLabel(scopeId))}</option>${scopes.map(id=>`<option value="${esc(id)}">${esc(scopeLabel(id))}</option>`).join('')}<option value="__all__">All projects</option></select></label><label>Show<select data-type><option value="people">People</option><option value="">All page types</option>${types.map(t=>`<option value="${esc(t)}">${esc(typeLabel(t))}</option>`).join('')}</select></label></div><input type="search" placeholder="Find a page or person…" aria-label="Find a page or person"><div class="tree-picker-list" role="group" aria-label="People and pages"></div>`;
    el.append(wrap);let selected='';
    const scope=wrap.querySelector('[data-scope]'),type=wrap.querySelector('[data-type]');
    const matches=()=>M.candidates({pages:pages(),scopeId:scope.value,getScopeId,allScopes:scope.value==='__all__',excluded,peopleIds,type:type.value,query:wrap.querySelector('input').value,names:p=>window.SanctumPageRelations.names(p,all)});
    if(!matches().length)type.value='';
    function draw(){const found=matches();if(!found.some(p=>p.id===selected))selected='';
      const list=wrap.querySelector('.tree-picker-list');list.innerHTML=found.slice(0,80).map(p=>`<button type="button" data-person="${esc(p.id)}" aria-pressed="${selected===p.id}"><span>${esc(p.title||'Untitled')}</span><small>${esc(pathLabel(p))}</small></button>`).join('')||'<p>No matches. Try another page type or project.</p>';
      list.querySelectorAll('button').forEach(b=>b.onclick=()=>{selected=b.dataset.person;draw();});
    }wrap.querySelector('input').oninput=draw;scope.onchange=type.onchange=draw;draw();return ()=>selected;
  }
  function addPerson(options){
    const el=dialog('Add a person');el.insertAdjacentHTML('beforeend',`<form class="tree-form"><div class="tree-segments"><button type="button" data-mode="existing" aria-pressed="true">Existing page</button><button type="button" data-mode="new" aria-pressed="false">New person</button></div><div data-existing></div><label data-new hidden>Name<input name="personName" maxlength="200" placeholder="Their name"></label><p class="tree-help">Existing pages keep their information and connections. New people become entries in this database.</p><p role="alert"></p><footer><button class="tree-primary" type="submit">Add to tree</button></footer></form>`);
    const form=el.querySelector('form'),pick=picker(form.querySelector('[data-existing]'),options,model(options).people.map(p=>p.id));let mode='existing';
    form.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;form.querySelectorAll('[data-mode]').forEach(t=>t.setAttribute('aria-pressed',t===b));form.querySelector('[data-existing]').hidden=mode!=='existing';form.querySelector('[data-new]').hidden=mode!=='new';});
    form.onsubmit=e=>{e.preventDefault();try{let id=pick();if(mode==='new'){const title=form.elements.personName.value.trim();if(!title)throw new Error('Give this person a name.');const db=Native.get(options.source);id=Native.saveEvent(options.source,'',{[db.properties.find(p=>p.type==='title').id]:title}).pageId;}if(!id)throw new Error('Choose an existing page.');membership(options.source,[id]);el.close();refresh();}catch(err){error(el,err);}};
    el.showModal();
  }
  function connect(options,subjectId){
    const subject=pages().find(p=>p.id===subjectId);if(!subject)return;
    const el=dialog(`Connect ${person(subject).title}`);
    el.insertAdjacentHTML('beforeend',`<form class="tree-form"><label>Relationship<select name="kind"><option value="parent">Add a parent</option><option value="child">Add a child</option><option value="partner">Add a partner</option><option value="adoptive">Add an adoptive parent</option><option value="step">Add a step parent</option><option value="guardian">Add a guardian</option><option value="sibling">Add a sibling</option><option value="friend">Add a friend</option><option value="rival">Add a rival</option><option value="mentor">Add a mentor</option><option value="custom">Custom relationship</option></select></label><label data-custom hidden>Relationship name<input name="customLabel" maxlength="80" placeholder="For example, Owes allegiance to"></label><div data-picker></div><label class="tree-check"><input type="checkbox" name="create"> Create someone new</label><label data-new hidden>Name<input name="personName" maxlength="200"></label><p class="tree-help">This connection is shared wherever these people appear.</p><p role="alert"></p><footer><button class="tree-primary" type="submit">Connect</button></footer></form>`);
    const form=el.querySelector('form'),pick=picker(form.querySelector('[data-picker]'),options,[subjectId]);let created='';
    form.elements.kind.onchange=()=>{form.querySelector('[data-custom]').hidden=form.elements.kind.value!=='custom';};
    form.elements.create.onchange=()=>{form.querySelector('[data-new]').hidden=!form.elements.create.checked;form.querySelector('[data-picker]').hidden=form.elements.create.checked;};
    form.onsubmit=e=>{e.preventDefault();try{
      let target=pick(),kind=form.elements.kind.value,label=form.elements.customLabel.value.trim();
      if(kind==='custom'&&!label)throw new Error('Name this relationship.');
      if(form.elements.create.checked){const title=form.elements.personName.value.trim();if(!title)throw new Error('Give the new person a name.');const db=Native.get(options.source);target=created||(created=Native.saveEvent(options.source,'',{[db.properties.find(p=>p.type==='title').id]:title}).pageId);}
      if(!target||!pages().some(p=>p.id===target))throw new Error('Choose a person.');
      const from=kind==='child'?target:subjectId,to=kind==='child'?subjectId:target;if(kind==='child')kind='parent';
      M.validate(links(),from,to,kind);
      if(!DB.connect(from,to,kind,label))window.setPageProps(from,M.pagePatch(window.getPageProps(from),to,kind,label));
      membership(options.source,[subjectId,target]);
      const prefs=settings(options.viewKey),filter=M.TYPES[kind]?.family?'family':M.TYPES[kind]?kind:`custom:${label.toLowerCase()}`;
      store('views',options.viewKey,{...prefs,enabled:[...new Set([...prefs.enabled,filter])]});
      el.close();refresh();
    }catch(err){error(el,err);}};el.showModal();
  }
  function upload(input,target,el){let pending=false;input.onchange=()=>{const file=input.files[0];if(!file)return;
    if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type)||file.size>5*1024*1024){error(el,new Error('Choose a JPG, PNG, WebP, or GIF under 5 MB.'));return;}
    pending=true;const reader=new FileReader();reader.onload=()=>{target.value=reader.result;pending=false;};reader.onerror=()=>{pending=false;error(el,new Error('Could not read this image.'));};reader.readAsDataURL(file);
  };return ()=>pending;}
  function editPerson(options,id){
    const page=pages().find(p=>p.id===id);if(!page)return;const initial=person(page),el=dialog('Edit person');
    el.insertAdjacentHTML('beforeend',`<form class="tree-form"><label>Name<input name="title" required maxlength="200" value="${esc(initial.title)}"></label><div class="tree-pair"><label>Born<input name="born" value="${esc(initial.born)}" placeholder="Year, date, or era"></label><label>Died<input name="died" value="${esc(initial.died)}" placeholder="Optional"></label></div><label>Portrait<input name="image" value="${esc(initial.image)}" placeholder="Image address"></label><label>Choose a portrait<input name="upload" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label><p class="tree-help">Names, portraits, and dates update on the original entry. Leave dates empty if you don’t need them.</p><p role="alert"></p><footer><button type="button" data-open>Open page ↗</button><button class="tree-primary" type="submit">Save</button></footer></form>`);
    const form=el.querySelector('form'),pending=upload(form.elements.upload,form.elements.image,el);
    form.querySelector('[data-open]').onclick=()=>{el.close();window.openPage?.(id);};
    form.onsubmit=e=>{e.preventDefault();try{
      if(pending())throw new Error('The portrait is still loading.');if(!pages().some(p=>p.id===id))throw new Error('This person is no longer available.');
      const patch={};for(const field of ['title','image','born','died']){const value=form.elements[field].value.trim();if(value!==initial[field])patch[field]=value;}
      if(patch.image&&!safeImage(patch.image))throw new Error('Choose a portrait file or a valid image address.');
      if(!DB.savePerson(id,patch)){
        const current=window.getPageProps(id),names={image:'Portrait',born:'Born',died:'Died'};
        for(const role of ['image','born','died'])if(patch[role]!==undefined){let field=current.properties.find(p=>p.type==='text'&&p.label===names[role]);if(!field){field={id:`tree-${role}`,label:names[role],type:'text'};current.properties.push(field);}field.value=patch[role];}
        window.setPageProps(id,current);
        if(patch.title!==undefined&&window.applyPageRenameEverywhere)window.applyPageRenameEverywhere(id,patch.title);
        else {if(patch.title!==undefined)page.title=patch.title;window.saveSanctumRegistry?.();}
      }
      el.close();refresh();
    }catch(err){error(el,err);}};if(initial.readOnly)form.querySelector('[type="submit"]').disabled=true;el.showModal();
  }
  function connectionDialog(link){
    const el=dialog(link.label),name=id=>pages().find(p=>p.id===id)?.title||'Unavailable person';
    el.insertAdjacentHTML('beforeend',`<div class="tree-form"><p>${esc(name(link.from))} → ${esc(name(link.to))}</p><p class="tree-help">Removing this connection updates the original relationship everywhere. Both people stay in your pages and databases.</p><p role="alert"></p><footer><button type="button" class="tree-danger" data-remove>Remove connection</button></footer></div>`);
    el.querySelector('[data-remove]').disabled=link.refs.some(r=>r.readOnly);
    el.querySelector('[data-remove]').onclick=()=>{try{
      // Resolve again so an open dialog never writes an old copy of page properties.
      const current=links().find(e=>e.id===link.id);if(!current){el.close();return;}
      if(current.refs.some(r=>r.readOnly))throw new Error('This relationship is read only.');
      for(const ref of current.refs){if(ref.kind==='database')DB.unlink(ref);else{const data=window.getPageProps(ref.pageId),prop=data.properties.find(p=>p.id===ref.propertyId);if(prop){prop.linkedPageIds=(prop.linkedPageIds||[]).filter(id=>id!==ref.target);window.setPageProps(ref.pageId,data);}}}
      el.close();refresh();
    }catch(err){error(el,err);}};el.showModal();
  }
  function configure(options){
    const prefs=settings(options.viewKey),data=model(options),el=dialog('Tree view');
    const types=new Map([['family','Family'],['friend','Friends'],['rival','Rivals'],['mentor','Mentors']]);
    data.links.filter(l=>!l.family).forEach(l=>types.set(l.kind,l.label));
    el.insertAdjacentHTML('beforeend',`<form class="tree-form"><fieldset><legend>Show connections</legend><div class="tree-filter-list">${[...types].map(([kind,label])=>`<label class="tree-check"><input type="checkbox" name="connections" value="${esc(kind)}"${prefs.enabled.includes(kind)?' checked':''}>${esc(label)}</label>`).join('')}</div></fieldset><div class="tree-pair"><label class="tree-check"><input name="portraits" type="checkbox"${prefs.portraits?' checked':''}>Portraits</label><label class="tree-check"><input name="dates" type="checkbox"${prefs.dates?' checked':''}>Dates</label></div>${!options.fullPage?'<label>Inline height<select name="height"><option value="280">Small</option><option value="380">Medium</option><option value="520">Large</option></select></label>':''}<details><summary>Arrange & visibility</summary><div class="tree-advanced"><label class="tree-check"><input type="checkbox" name="arrange">Arrange people automatically</label><label class="tree-check"><input type="checkbox" name="restore">Show hidden people and expand branches</label></div></details><p class="tree-help">These choices apply only to this view. Your people and their connections stay shared.</p><p role="alert"></p><footer><button class="tree-primary" type="submit">Done</button></footer></form>`);
    const form=el.querySelector('form');if(form.elements.height)form.elements.height.value=prefs.height;
    form.onsubmit=e=>{e.preventDefault();try{const current=settings(options.viewKey);store('views',options.viewKey,{...current,enabled:[...form.querySelectorAll('[name="connections"]:checked')].map(i=>i.value),portraits:form.elements.portraits.checked,dates:form.elements.dates.checked,height:Number(form.elements.height?.value||current.height),positions:form.elements.arrange.checked?{}:current.positions,hidden:form.elements.restore.checked?[]:current.hidden,collapsed:form.elements.restore.checked?[]:current.collapsed});states.delete(options.viewKey);el.close();refresh();}catch(err){error(el,err);}};el.showModal();
  }
  function mount(host,options){
    for(const old of mounted.keys())if(!old.isConnected)mounted.delete(old);mounted.set(host,options);
    const prefs=settings(options.viewKey),data=model(options),box=M.layout(data.people,data.links,{...prefs,compact:!options.fullPage});
    let state=states.get(options.viewKey);if(!state){state={x:0,y:0,scale:1,selected:'',fitted:false};states.set(options.viewKey,state);}
    host.className=`sanctum-tree-mount relationship-tree${options.fullPage?' tree-full-page':' tree-compact'}`;
    host.onpointerdown=e=>e.stopPropagation();host.onmousedown=e=>e.stopPropagation();host.onkeydown=e=>e.stopPropagation();
    host.innerHTML=`<div class="tree-toolbar"><span class="tree-count">${data.people.length} ${data.people.length===1?'person':'people'}</span><div class="tree-tools"><input type="search" data-search aria-label="Find in this tree" placeholder="Find someone…"><button type="button" data-settings>Connections</button>${options.readOnly?'':'<button type="button" data-add>+ Person</button>'}</div></div><div class="tree-viewport" tabindex="0" role="region" aria-label="Relationship tree. Drag the background to pan. Use plus and minus to zoom, or arrow keys to pan." style="--tree-height:${prefs.height}px"><div class="tree-stage"><svg class="tree-lines" aria-label="Relationships"></svg><div class="tree-people"></div></div><div class="tree-selection" hidden></div><div class="tree-empty"${box.nodes.length?' hidden':''}><div class="tree-empty-symbol">♧</div><h3>${data.people.length?'Everyone is hidden':'A place for your people'}</h3><p>${data.people.length?'Restore hidden people in Connections.':'Add someone, then connect their family, friends, and story.'}</p>${!options.readOnly&&!data.people.length?'<button type="button" data-start>Add the first person</button>':''}</div><div class="tree-navigation"><button type="button" data-zoom="out" aria-label="Zoom out">−</button><span data-scale></span><button type="button" data-zoom="in" aria-label="Zoom in">+</button><button type="button" data-fit>Fit</button></div><span class="tree-gesture-hint">Drag to explore · Ctrl + scroll to zoom</span></div><p class="tree-status" role="status">${box.cycle?'Some existing family links form a loop. Check the parent connections.':''}</p>`;
    const viewport=host.querySelector('.tree-viewport'),stage=host.querySelector('.tree-stage'),nodeHost=host.querySelector('.tree-people'),svg=host.querySelector('svg'),selection=host.querySelector('.tree-selection');
    const nodes=new Map(box.nodes.map(n=>[n.id,n]));
    nodeHost.innerHTML=box.nodes.map(n=>`<button type="button" class="tree-person${prefs.portraits?'':' tree-person-text'}" data-id="${esc(n.id)}" aria-label="${esc(n.title)}" aria-pressed="false" style="left:${n.x}px;top:${n.y}px;width:${n.width}px;height:${n.height}px">${prefs.portraits?`<span class="tree-portrait">${n.image?`<img src="${esc(n.image)}" alt="" draggable="false">`:`<span>${esc(n.title.split(/\s+/).slice(0,2).map(w=>w[0]).join(''))}</span>`}</span>`:''}<span class="tree-person-name">${esc(n.title)}</span>${prefs.dates&&(n.born||n.died)?`<span class="tree-person-dates">${esc([n.born,n.died].filter(Boolean).join(' – '))}</span>`:''}${prefs.collapsed.includes(n.id)?'<span class="tree-collapsed-mark">Branch collapsed</span>':''}</button>`).join('');
    nodeHost.querySelectorAll('img').forEach(img=>img.onerror=()=>{const parent=img.parentElement;img.remove();parent.textContent='◇';});
    function drawLines(){
      svg.innerHTML=box.links.map((link,index)=>{const a=nodes.get(link.generation?link.to:link.from),b=nodes.get(link.generation?link.from:link.to);let d;
        if(link.generation){const x1=a.x+a.width/2,y1=a.y+a.height,x2=b.x+b.width/2,y2=b.y,mid=(y1+y2)/2;d=`M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`;}
        else if(!link.family){const lift=Math.min(a.y,b.y)-55-(index%3)*16;d=`M${a.x+a.width/2},${a.y} C${a.x+a.width/2},${lift} ${b.x+b.width/2},${lift} ${b.x+b.width/2},${b.y}`;}
        else{const left=a.x<=b.x?a:b,right=left===a?b:a,x1=left.x+left.width,y1=left.y+left.height/2,x2=right.x,y2=right.y+right.height/2;d=`M${x1},${y1} C${x1+45},${y1} ${x2-45},${y2} ${x2},${y2}`;}
        const label=!link.family?`<text x="${(a.x+b.x+a.width)/2}" y="${Math.min(a.y,b.y)-36-(index%3)*12}" text-anchor="middle">${esc(link.label)}${link.symmetric?'':' →'}</text>`:'';
        return `<g class="tree-link${link.family?' tree-link-family':''}${['adoptive','step','guardian'].includes(link.kind)?' tree-link-secondary':''}" data-edge="${index}" tabindex="0" role="button" aria-label="${esc(a.title+' · '+link.label+' · '+b.title)}"><path class="tree-link-hit" d="${d}"/><path class="tree-link-line" d="${d}"/>${label}</g>`;
      }).join('');
      svg.querySelectorAll('[data-edge]').forEach(g=>{g.onclick=e=>{e.stopPropagation();connectionDialog(box.links[Number(g.dataset.edge)]);};g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();g.onclick(e);}};});
    }
    function transform(){stage.style.transform=`translate(${state.x}px,${state.y}px) scale(${state.scale})`;host.querySelector('[data-scale]').textContent=`${Math.round(state.scale*100)}%`;}
    function fit(){if(!box.nodes.length)return;const minX=Math.min(...box.nodes.map(n=>n.x)),minY=Math.min(...box.nodes.map(n=>n.y))-(!options.fullPage?10:0),maxX=Math.max(...box.nodes.map(n=>n.x+n.width)),maxY=Math.max(...box.nodes.map(n=>n.y+n.height));state.scale=Math.min(1,Math.max(.15,Math.min((viewport.clientWidth-60)/(maxX-minX),(viewport.clientHeight-65)/(maxY-minY))));state.x=(viewport.clientWidth-(maxX-minX)*state.scale)/2-minX*state.scale;state.y=(viewport.clientHeight-(maxY-minY)*state.scale)/2-minY*state.scale-10;state.fitted=true;transform();}
    function zoom(factor,x=viewport.clientWidth/2,y=viewport.clientHeight/2){const next=Math.max(.15,Math.min(2.5,state.scale*factor)),ratio=next/state.scale;state.x=x-(x-state.x)*ratio;state.y=y-(y-state.y)*ratio;state.scale=next;transform();}
    function select(id){state.selected=id;nodeHost.querySelectorAll('[data-id]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.id===id));const person=nodes.get(id);selection.hidden=!person;if(!person)return;
      selection.innerHTML=`<strong>${esc(person.title)}</strong><button type="button" data-open>Open ↗</button>${options.readOnly||person.readOnly?'': '<button type="button" data-edit>Edit</button><button type="button" data-connect>+ Connect</button>'}<button type="button" data-collapse>${prefs.collapsed.includes(id)?'Expand':'Collapse'} branch</button><button type="button" data-hide>Hide</button><button type="button" data-dismiss aria-label="Deselect person">×</button>`;
      selection.querySelector('[data-open]').onclick=()=>window.openPage?.(id);
      selection.querySelector('[data-edit]')?.addEventListener('click',()=>editPerson(options,id));selection.querySelector('[data-connect]')?.addEventListener('click',()=>connect(options,id));
      selection.querySelector('[data-dismiss]').onclick=()=>select('');
      selection.querySelector('[data-hide]').onclick=()=>{try{const current=settings(options.viewKey);store('views',options.viewKey,{...current,hidden:[...current.hidden,id]});state.selected='';refresh();}catch(err){host.querySelector('[role="status"]').textContent=err.message;}};
      selection.querySelector('[data-collapse]').onclick=()=>{try{const current=settings(options.viewKey);store('views',options.viewKey,{...current,collapsed:current.collapsed.includes(id)?current.collapsed.filter(n=>n!==id):[...current.collapsed,id]});refresh();}catch(err){host.querySelector('[role="status"]').textContent=err.message;}};
    }
    drawLines();select(state.selected);transform();
    host.querySelector('[data-settings]').onclick=()=>configure(options);host.querySelector('[data-add]')?.addEventListener('click',()=>addPerson(options));host.querySelector('[data-start]')?.addEventListener('click',()=>addPerson(options));
    host.querySelector('[data-fit]').onclick=fit;host.querySelectorAll('[data-zoom]').forEach(b=>b.onclick=()=>zoom(b.dataset.zoom==='in'?1.2:1/1.2));
    host.querySelector('[data-search]').oninput=e=>{const q=e.target.value.trim().toLowerCase();nodeHost.querySelectorAll('[data-id]').forEach(b=>b.classList.toggle('tree-search-match',!!q&&nodes.get(b.dataset.id).title.toLowerCase().includes(q)));};
    host.querySelector('[data-search]').onkeydown=e=>{e.stopPropagation();if(e.key==='Enter'){const q=e.target.value.trim().toLowerCase(),found=box.nodes.find(n=>n.title.toLowerCase().includes(q));if(found){state.scale=Math.max(.7,state.scale);state.x=viewport.clientWidth/2-(found.x+found.width/2)*state.scale;state.y=viewport.clientHeight/2-(found.y+found.height/2)*state.scale;transform();select(found.id);}}};
    let drag=null,suppressClick=false;
    viewport.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('.tree-navigation,.tree-selection,.tree-empty,[data-edge]'))return;const button=e.target.closest('[data-id]');drag={id:button?.dataset.id||'',x:e.clientX,y:e.clientY,viewX:state.x,viewY:state.y,node:button?{...nodes.get(button.dataset.id)}:null,moved:false};viewport.setPointerCapture(e.pointerId);e.stopPropagation();});
    viewport.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>4)drag.moved=true;if(!drag.moved)return;
      if(drag.id){const n=nodes.get(drag.id);n.x=drag.node.x+dx/state.scale;n.y=drag.node.y+dy/state.scale;const b=[...nodeHost.children].find(b=>b.dataset.id===drag.id);b.style.left=`${n.x}px`;b.style.top=`${n.y}px`;drawLines();}else{state.x=drag.viewX+dx;state.y=drag.viewY+dy;transform();}});
    function finish(e){if(!drag)return;const moved=drag.moved,id=drag.id;drag=null;suppressClick=moved;if(id&&!moved)select(id);if(!id&&!moved)select('');if(id&&moved){try{const current=settings(options.viewKey),n=nodes.get(id);store('views',options.viewKey,{...current,positions:{...current.positions,[id]:{x:n.x,y:n.y}}});}catch(err){host.querySelector('[role="status"]').textContent=err.message;}}if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);}
    viewport.addEventListener('pointerup',finish);viewport.addEventListener('pointercancel',finish);
    nodeHost.addEventListener('click',e=>{if(suppressClick){suppressClick=false;return;}const b=e.target.closest('[data-id]');if(b)select(b.dataset.id);});
    viewport.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();e.stopPropagation();const rect=viewport.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.002),e.clientX-rect.left,e.clientY-rect.top);}else if(options.fullPage){e.preventDefault();e.stopPropagation();state.x-=e.deltaX;state.y-=e.deltaY;transform();}},{passive:false});
    viewport.addEventListener('keydown',e=>{if(e.target.closest('input,select'))return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Escape','0'].includes(e.key)){e.preventDefault();e.stopPropagation();if(e.key==='Escape')select('');else if(e.key==='0')fit();else if(e.key==='+'||e.key==='=')zoom(1.2);else if(e.key==='-')zoom(1/1.2);else{state.x+=e.key==='ArrowLeft'?50:e.key==='ArrowRight'?-50:0;state.y+=e.key==='ArrowUp'?50:e.key==='ArrowDown'?-50:0;transform();}}});
    requestAnimationFrame(()=>{if(host.isConnected&&!state.fitted)fit();});
  }
  window.SanctumTreeUI={mount,refresh};
  window.addEventListener('sanctum:database-updated',refresh);
  window.addEventListener('storage',e=>{if([key,window.STORAGE_KEYS.pageProps,window.STORAGE_KEYS.pagesRegistry].includes(e.key))refresh();});
})();
