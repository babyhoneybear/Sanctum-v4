(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SanctumTreeData = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const TYPES = {
    parent: { label: 'Parents', inverse: 'Children', family: true, generation: true },
    adoptive: { label: 'Adoptive parents', inverse: 'Adopted children', family: true, generation: true },
    step: { label: 'Step parents', inverse: 'Step children', family: true, generation: true },
    guardian: { label: 'Guardians', inverse: 'Dependants', family: true, generation: true },
    partner: { label: 'Partners', inverse: 'Partners', family: true, symmetric: true },
    sibling: { label: 'Siblings', inverse: 'Siblings', family: true, symmetric: true },
    family: { label: 'Family', inverse: 'Family', family: true, symmetric: true },
    friend: { label: 'Friends', inverse: 'Friends', symmetric: true },
    rival: { label: 'Rivals', inverse: 'Rivals', symmetric: true },
    mentor: { label: 'Mentors', inverse: 'Mentees' }
  };
  const norm = value => String(value || '').normalize('NFKC').trim().toLowerCase();
  const list = value => Array.isArray(value) ? value : [];
  function candidates({pages, scopeId = '', getScopeId, allScopes = false, excluded = [], peopleIds = [], type = '', query = '', names = p => [p.title]}) {
    const omit=new Set(excluded), people=new Set(peopleIds), q=norm(query);
    return pages.filter(p=>!omit.has(p.id) && (allScopes || getScopeId(p.id)===scopeId)
      && (!type || (type==='people' ? p.category==='character'||people.has(p.id) : p.category===type))
      && (!q || names(p).some(name=>norm(name).includes(q))))
      .sort((a,b)=>String(a.title||'').localeCompare(String(b.title||'')));
  }
  function classify(property = {}) {
    if (TYPES[property.treeKind]) return { kind: property.treeKind, ...TYPES[property.treeKind] };
    const name = norm(property.label || property.name);
    const aliases = {
      parent: ['parent','parents','mother','father','biological parents'],
      adoptive: ['adoptive parent','adoptive parents'], step: ['step parent','step parents','stepparents'],
      guardian: ['guardian','guardians'], partner: ['partner','partners','spouse','spouses','husband','wife'],
      sibling: ['sibling','siblings','brother','sister'], family: ['family','relatives'],
      friend: ['friend','friends'], rival: ['rival','rivals','enemy','enemies'], mentor: ['mentor','mentors']
    };
    for (const [kind, names] of Object.entries(aliases)) if (names.includes(name)) return { kind, ...TYPES[kind] };
    const inverse = { children: 'parent', child: 'parent', 'adopted children': 'adoptive', 'step children': 'step', dependants: 'guardian', mentees: 'mentor', students: 'mentor' };
    if (inverse[name]) return { kind: inverse[name], ...TYPES[inverse[name]], reverse: true };
    return { kind: `custom:${norm(property.treeLabel || property.label || property.name || 'Related')}`, label: property.treeLabel || property.label || property.name || 'Related', inverse: property.inverseLabel || 'Connected from' };
  }
  function edge(owner, target, property, reference) {
    const type = classify(property);
    let from = type.reverse ? target : owner, to = type.reverse ? owner : target;
    if (type.symmetric && from > to) [from, to] = [to, from];
    return { ...type, from, to, id: JSON.stringify([type.kind, from, to]), refs: [reference] };
  }
  function collect(pages, props = {}, databaseEdges = []) {
    const ids = new Set(pages.map(p => p.id)), result = new Map();
    const add = link => {
      if (link.from === link.to || !ids.has(link.from) || !ids.has(link.to)) return;
      const previous = result.get(link.id);
      if (previous) previous.refs.push(...link.refs); else result.set(link.id, link);
    };
    for (const page of pages) for (const property of list(props[page.id]?.properties)) {
      if (property.type !== 'relation') continue;
      for (const target of new Set(list(property.linkedPageIds))) add(edge(page.id, target, property, { kind: 'page', pageId: page.id, propertyId: property.id, target }));
    }
    databaseEdges.forEach(add);
    return [...result.values()];
  }
  function validate(links, from, to, kind) {
    if (!from || !to || from === to) throw new Error('Choose two different people.');
    if (!TYPES[kind]?.generation) return;
    // Relationships store child -> parent. A parent cannot be their own descendant.
    const ancestors = new Map();
    links.filter(e => e.generation).forEach(e => { if (!ancestors.has(e.from)) ancestors.set(e.from, []); ancestors.get(e.from).push(e.to); });
    const pending = [to], seen = new Set();
    while (pending.length) {
      const id = pending.pop(); if (id === from) throw new Error('This would make someone their own ancestor.');
      if (seen.has(id)) continue; seen.add(id); pending.push(...(ancestors.get(id) || []));
    }
  }
  function view(raw = {}) {
    return { enabled: Array.isArray(raw.enabled) ? [...new Set(raw.enabled)] : ['family'], portraits: raw.portraits !== false,
      dates: raw.dates !== false, height: [280,380,520].includes(raw.height) ? raw.height : 380,
      positions: raw.positions && typeof raw.positions === 'object' ? raw.positions : {},
      collapsed: list(raw.collapsed), hidden: list(raw.hidden) };
  }
  const visibleEdge = (link, settings) => settings.enabled.includes(link.family ? 'family' : link.kind);
  function layout(people, links, raw = {}) {
    const prefs = view(raw), hidden = new Set(prefs.hidden), collapsed = new Set(prefs.collapsed);
    const family = links.filter(e => e.generation);
    // Hide descendants only when all their displayed parents are collapsed/hidden.
    const children = new Map();
    family.forEach(e => { if (!children.has(e.from)) children.set(e.from, []); children.get(e.from).push(e.to); });
    let change = true;
    while (change) { change = false; for (const [id, parents] of children) if (!hidden.has(id) && parents.length && parents.every(p => hidden.has(p) || collapsed.has(p))) { hidden.add(id); change = true; } }
    const nodes = people.filter(p => !hidden.has(p.id)), ids = new Set(nodes.map(p => p.id));
    const available = links.filter(e => ids.has(e.from) && ids.has(e.to));
    // Group partners on a generation, unless doing so introduces ancestry cycles.
    const group = new Map(nodes.map(p => [p.id,p.id]));
    const find = id => { let n=id; while (group.get(n) !== n) n=group.get(n); return n; };
    available.filter(e => e.kind === 'partner').forEach(e => {
      const a=find(e.from), b=find(e.to); if(a===b)return;
      const walks = [[a,b],[b,a]];
      const path = ([start,end]) => { const pending=[start],seen=new Set(); while(pending.length) {const n=pending.pop();if(n===end)return true;if(seen.has(n))continue;seen.add(n);available.filter(e=>e.generation && find(e.to)===n).forEach(e=>pending.push(find(e.from)));}return false; };
      if (!walks.some(path)) group.set(b,a);
    });
    const groups = [...new Set(nodes.map(n=>find(n.id)))], rank = new Map(groups.map(id=>[id,0])), outgoing = new Map(groups.map(id=>[id,new Set()])), indegree = new Map(groups.map(id=>[id,0]));
    available.filter(e=>e.generation).forEach(e=>{const a=find(e.to),b=find(e.from);if(a!==b&&!outgoing.get(a).has(b)){outgoing.get(a).add(b);indegree.set(b,indegree.get(b)+1);}});
    const queue=groups.filter(id=>indegree.get(id)===0); let processed=0;
    while(queue.length){const a=queue.shift();processed++;for(const b of outgoing.get(a)){rank.set(b,Math.max(rank.get(b),rank.get(a)+1));indegree.set(b,indegree.get(b)-1);if(!indegree.get(b))queue.push(b);}}
    const rows=new Map(); nodes.forEach(n=>{const r=rank.get(find(n.id));if(!rows.has(r))rows.set(r,[]);rows.get(r).push(n);});
    const width=176,height=raw.compact?72:prefs.portraits?136:80,gapX=48,gapY=raw.compact?48:80,positions=new Map();
    const widest=Math.max(1,...[...rows.values()].map(r=>r.length));
    for(const [r,row] of [...rows].sort((a,b)=>a[0]-b[0])) {
      const center=n=>{const parents=available.filter(e=>e.generation&&e.from===n.id).map(e=>positions.get(e.to)?.x).filter(Number.isFinite);return parents.length?parents.reduce((a,b)=>a+b,0)/parents.length:0;};
      row.sort((a,b)=>center(a)-center(b)||find(a.id).localeCompare(find(b.id))||a.id.localeCompare(b.id));
      row.forEach((n,i)=>positions.set(n.id,{x:40+(widest-row.length)*(width+gapX)/2+i*(width+gapX),y:40+r*(height+gapY)}));
    }
    const placed=nodes.map(n=>{const saved=prefs.positions[n.id];return {...n,...(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)?saved:positions.get(n.id)),width,height};});
    return {nodes:placed,links:available.filter(e=>visibleEdge(e,prefs)),cycle:processed<groups.length};
  }
  function pagePatch(data, target, kind, label = '') {
    const next=JSON.parse(JSON.stringify(data||{properties:[]})); next.properties ||= [];
    const type=TYPES[kind] || {label:label.trim()||'Related',inverse:'Connected from'};
    let property=next.properties.find(p=>p.type==='relation' && !classify(p).reverse && classify(p).kind===(TYPES[kind]?kind:`custom:${norm(type.label)}`));
    if(!property){property={id:`tree-${kind}-${Date.now().toString(36)}`,type:'relation',label:type.label,inverseLabel:type.inverse,treeKind:kind,treeLabel:type.label,linkedPageIds:[]};next.properties.push(property);}
    property.linkedPageIds=[...new Set([...list(property.linkedPageIds),target])];return next;
  }
  return {TYPES, candidates, classify, edge, collect, validate, view, visibleEdge, layout, pagePatch};
});
