(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SanctumProjects = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const roles = ['page', 'project', 'hub', 'detail'];
  function role(record = {}) {
    if (record.type === 'domain' || record.containerType === 'domain') return 'domain';
    if (roles.includes(record.organizationRole)) return record.organizationRole;
    if (record.containerType === 'hub') return 'hub';
    if (record.containerType === 'project' || record.isScopeBoundary === true || record.definesScope === true) return 'project';
    return record.containerType === 'detail' ? 'detail' : 'page';
  }
  function label(record) {
    return {domain:'Domain', project:'Project', hub:'Hub', detail:'Detail', page:'Page'}[role(record)];
  }
  function isBoundary(record = {}) {
    if (role(record) === 'domain') return true;
    if (roles.includes(record.organizationRole)) return record.organizationRole === 'project';
    if (record.isScopeBoundary === true || record.definesScope === true) return true;
    if (record.isScopeBoundary === false || record.definesScope === false) return false;
    return record.containerType === 'project';
  }
  function withRole(record, nextRole) {
    if (!record || role(record) === 'domain' || !roles.includes(nextRole)) throw new Error('Choose a valid page role.');
    const next = {...record, organizationRole:nextRole, isScopeBoundary:nextRole === 'project'};
    delete next.definesScope;
    const ref = record.databaseRowRef;
    if (record.containerType !== 'database-row' && !(ref?.sourcePageId && ref?.rowId)) {
      next.containerType = nextRole;
      next.recordKind = ['hub','project'].includes(nextRole) ? 'space' : next.layout === 'sheet' ? 'view' : 'record';
    }
    return next;
  }
  function path(records, id) {
    const byId = new Map(records.map(record => [record.id, record])), seen = new Set(), result = [];
    while (byId.has(id) && !seen.has(id)) {
      const record = byId.get(id); seen.add(id); result.push(record); id = record.parent;
    }
    return result;
  }
  function project(records, id) {
    return path(records, id).find(record => role(record) === 'project') || null;
  }
  function contents(records, id, query = '') {
    const search = String(query).trim().toLocaleLowerCase();
    return records.filter(record => record.id !== id).flatMap(record => {
      const ancestors = path(records, record.id), index = ancestors.findIndex(parent => parent.id === id);
      if (index < 1) return [];
      const parents = ancestors.slice(1,index).reverse().map(parent => parent.title || 'Untitled').join(' / ');
      if (search && !`${record.title || ''} ${parents}`.toLocaleLowerCase().includes(search)) return [];
      return [{record, parents}];
    }).sort((a,b) => `${a.parents}/${a.record.title}`.localeCompare(`${b.parents}/${b.record.title}`, undefined, {numeric:true,sensitivity:'base'}));
  }
  return {role, label, isBoundary, withRole, path, project, contents};
});
