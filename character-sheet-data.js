(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SanctumCharacterSheetData=api;})(typeof window!=='undefined'?window:globalThis,function(){
  const fields=[
    ['portrait','Portrait'],['aliases','Aliases'],['pronouns','Pronouns'],['born','Born'],['age','Age'],['status','Status'],['occupation','Occupation'],
    ['home','Home','location'],['birthplace','Birthplace','location'],['affiliations','Affiliations','none'],
    ['parents','Parents','character','parent'],['partners','Partners','character','partner'],['siblings','Siblings','character','sibling'],['friends','Friends','character','friend'],
    ['magic','Magic','none'],['spells','Spells','spell'],['abilities','Abilities','none'],['mentors','Mentors','character','mentor']
  ].map(([id,label,targetCategory,treeKind])=>({id,label,type:targetCategory?'relation':'text',...(targetCategory?{targetCategory,linkedPageIds:[]}:{value:''}),...(treeKind?{treeKind}:{}),...(id==='magic'?{relationKind:'proficiency',inverseLabel:'Practitioners'}:{})}));
  const sections=[['essentials','Portrait & essentials'],['introduction','Introduction'],['personality','Appearance & personality'],['story','Background & story'],['relationships','Relationships'],['magic','Magic & abilities'],['extras','Notes & references'],['combat','Combat'],['health','Health & lifestyle'],['routine','Daily life'],['questions','Character questions']].map(([id,title],i)=>({id,title,core:i<7}));
  const norm=s=>String(s||'').trim().toLowerCase();
  function field(data,id){const def=fields.find(f=>f.id===id);return (data?.properties||[]).find(p=>p.type===def?.type&&(p.id===id||norm(p.label)===norm(def?.label)));}
  function ensure(data={}){const next=JSON.parse(JSON.stringify(data));next.properties ||= [];for(const def of fields){if(!field(next,def.id)){const prop=JSON.parse(JSON.stringify(def));if(next.properties.some(p=>p.id===prop.id)){let suffix=1;while(next.properties.some(p=>p.id===`${def.id}-linked-${suffix}`))suffix++;prop.id=`${def.id}-linked-${suffix}`;}next.properties.push(prop);}}return next;}
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function frame(viewportWidth=1280,infinite=false){
    const viewport=Math.max(480,Number(viewportWidth)||1280),width=Math.min(1536,Math.floor((viewport-96)/48)*48);
    return {width,left:infinite?2448-width/2:Math.round((viewport-width)/2)};
  }
  function readLayout(raw){try{const value=typeof raw==='string'?JSON.parse(raw):raw;return value&&Number.isFinite(value.left)&&Number.isFinite(value.width)&&value.width>0?{left:value.left,width:value.width}:undefined;}catch{return undefined;}}
  function fit(blocks,viewportWidth,infinite=false){
    // Only adjust the untouched horizontal arrangement. Never replace writing or user layouts.
    const sheet=blocks.filter(b=>b.characterSection),other=blocks.filter(b=>!b.characterSection);if(!sheet.length)return blocks;
    const old=readLayout(sheet[0].characterLayout)||{left:infinite?1980:48,width:936};
    const half=(old.width-24)/2,right=old.left+half+24;
    if(sheet.some(b=>!((b.x===old.left&&(b.w===old.width||b.w===half))||(b.x===right&&b.w===half))))return blocks;
    const next=frame(viewportWidth,infinite);if(next.left===old.left&&next.width===old.width)return blocks;
    const fitted=blocks.map(b=>b.characterSection?({...b,x:b.x===right?next.left+(next.width+24)/2:next.left,w:b.w===old.width?next.width:(next.width-24)/2,characterLayout:next}):b);
    if(other.some(b=>![b.x,b.y,b.w,b.h].every(Number.isFinite)||fitted.some(a=>a.characterSection&&!(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y))))return blocks;
    return fitted;
  }
  function build(pageId,{infinite=false,selected=sections.filter(s=>s.core).map(s=>s.id),startY,viewportWidth=1280,width}={}){
    const layout=frame(viewportWidth,infinite);if(width)layout.width=width;
    const x=layout.left,w=layout.width,half=(w-24)/2;let y=startY??(infinite?768:24),blocks=[];
    const base=(section,type,dx,dy,bw,h,extra)=>({id:`character-${pageId}-${section}-${blocks.length}`,characterSection:section,characterLayout:layout,type,x:x+dx,y:dy,w:bw,h,z:1,padding:'20px',radius:'8px',...extra});
    const text=(section,title,prompts,dx,dy,bw,h)=>blocks.push(base(section,'text',dx,dy,bw,h,{bg:'transparent',borderColor:'transparent',bodyHTML:`<h2 class="character-sheet-heading">${esc(title)}</h2>`+prompts.map(([label,prompt])=>`<p><strong>${esc(label)}</strong><br>${esc(prompt)}</p>`).join('')}));
    const connection=(section,id,title,dx,dy,bw,h)=>blocks.push(base(section,'connections',dx,dy,bw,h,{connectionSourcePageId:pageId,connectionPropertyId:id,titleHTML:esc(title)}));
    for(const section of sections.filter(s=>selected.includes(s.id))){
      switch(section.id){
        case 'essentials':connection('essentials','character-essentials','At a glance',0,y,w,384);y+=408;break;
        case 'introduction':text('introduction','A first impression',[['','A few sentences that capture who they are, or a line in their own voice.']],0,y,w,144);y+=168;break;
        case 'personality':
          text('personality','Appearance',[['First impression','Their silhouette, expression, and presence.'],['Details','Distinctive features, clothing, and the things people notice.'],['Mannerisms','How they move, speak, and carry themselves.']],0,y,half,336);
          text('personality','Personality',[['Strengths & flaws','What helps them—and what gets in their way?'],['Values & fears','What matters enough to defend? What do they avoid?'],['Everyday self','Habits, little comforts, likes, and dislikes.']],half+24,y,half,336);y+=360;break;
        case 'story':
          text('story','Background',[['Before the story','Their upbringing and the experiences that shaped them.'],['Turning points','The choices, losses, discoveries, or relationships that changed their path.'],['Now','Where life has brought them when the story begins.']],0,y,half,336);
          text('story','Goals & development',[['What they want','Their immediate goal and the future they imagine.'],['What stands in the way','An outside obstacle and an internal struggle.'],['What changes','What they need to learn, accept, lose, or become.']],half+24,y,half,336);y+=360;break;
        case 'relationships':connection('relationships','character-relationships','People in their life',0,y,w,288);y+=312;break;
        case 'magic':
          connection('magic','character-magic','Magic & training',0,y,half,288);
          connection('magic','spells','Known spells',half+24,y,half,288);y+=312;
          text('magic','How their magic feels',[['Expression & practice','How does their power appear? What does using it feel like?'],['Cost & limits','What does it demand, what can go wrong, and what can they never do?']],0,y,w,216);y+=240;
          connection('magic','spell-access','Available through proficiency',0,y,w,168);y+=192;break;
        case 'extras':
          text('extras','Notes & dialogue',[['Keep here','Loose ideas, a line of dialogue, or something still undecided.']],0,y,half,240);
          blocks.push(base('extras','image',half+24,y,half,240,{padding:'0px',bodyHTML:'<div class="character-reference-placeholder"><strong>Visual references</strong><span>Add artwork, an outfit, or a detail worth keeping.</span><small>Edit → select this block → Replace</small></div>'}));y+=264;break;
        case 'combat':text('combat','Combat',[['Approach','Their tactics, equipment, and response to danger.'],['Strengths & vulnerabilities','What gives them an advantage? What exposes them?']],0,y,w,240);y+=264;break;
        case 'health':text('health','Health & lifestyle',[['Daily wellbeing','Sleep, food, energy, and the support they need.'],['History & impact','Relevant conditions, injuries, and how these affect their life.']],0,y,w,240);y+=264;break;
        case 'routine':text('routine','Daily life',[['An ordinary day','Work, study, home, company, and small rituals.'],['Outside obligations','Hobbies, comforts, habits, and how they unwind.']],0,y,w,240);y+=264;break;
        case 'questions':text('questions','In their own words',[['What do you wish people understood about you?',''],['What would you never admit you wanted?',''],['Who are you when nobody needs anything from you?','']],0,y,w,264);y+=288;break;
      }
    }return blocks;
  }
  return {fields,sections,field,ensure,build,frame,fit,readLayout};
});
