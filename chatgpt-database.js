(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SanctumChatGPTDatabases = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const array = value => Array.isArray(value) ? value : [];
  const clean = value => String(value ?? '').trim();
  const sourceKey = source => `${source.kind || 'page'}:${source.pageId}:${source.blockId || ''}`;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function version(value) {
    const text = JSON.stringify(value);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return `${(hash >>> 0).toString(16)}-${text.length}`;
  }
  function assert(condition, message, details) {
    if (!condition) { const error = new Error(message); error.details = details; throw error; }
  }
  function keys(value, allowed, label) {
    assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object.`);
    const unknown = Object.keys(value).filter(key => !allowed.includes(key));
    assert(!unknown.length, `${label} does not support: ${unknown.join(', ')}. Nothing was changed.`);
  }
  function unique(items, label) {
    assert(new Set(items).size === items.length, `${label} contain duplicate identities.`);
  }

  function createService(env) {
    const plans = new Map();
    let sequence = 0;
    let busy = false;
    const id = prefix => `${prefix}-${Date.now().toString(36)}-${++sequence}-${Math.random().toString(36).slice(2, 9)}`;
    function pages() { return [{ id: 'home', title: 'Home', parent: '' }, ...env.pages().filter(p => p.id !== 'home')]; }
    function pathOf(pageId) {
      const records = pages(); const result = []; const seen = new Set();
      for (let page = records.find(p => p.id === pageId); page && !seen.has(page.id); page = records.find(p => p.id === page.parent)) {
        seen.add(page.id); result.unshift(clean(page.title) || 'Untitled');
      }
      return result.join(' → ');
    }
    function inside(pageId, scopeId) {
      if (!scopeId || scopeId === 'home') return true;
      const records = pages(); const seen = new Set();
      for (let page = records.find(p => p.id === pageId); page && !seen.has(page.id); page = records.find(p => p.id === page.parent)) {
        if (page.id === scopeId) return true;
        seen.add(page.id);
      }
      return false;
    }
    function resolve(locator, scopeId = '') {
      keys(locator, ['pageId', 'path', 'blockId'], 'Location');
      assert(clean(locator.pageId) || clean(locator.path), 'Provide a page ID or full page path.');
      const canonical = text => clean(text).replace(/\s*(?:→|\/|>)\s*/g, ' → ').replace(/^Home → /i, '').toLocaleLowerCase();
      const candidates = pages().filter(page => inside(page.id, scopeId)
        && (!locator.pageId || page.id === locator.pageId)
        && (!locator.path || canonical(pathOf(page.id)) === canonical(locator.path)
          || (!canonical(locator.path).includes(' → ') && canonical(page.title) === canonical(locator.path))));
      assert(candidates.length === 1, candidates.length ? 'That location is ambiguous. Ask the user which page, or let them choose an exact ID.' : 'That location was not found in the requested area.', {
        candidates: candidates.map(page => ({ pageId: page.id, path: pathOf(page.id) }))
      });
      return candidates[0];
    }
    const scopeIdFor = scope => scope ? resolve(scope).id : '';
    function databases() { return env.databases().map(entry => ({ source: entry.source, database: clone(entry.database) })); }
    function findDatabase(target, scopeId) {
      const page = resolve(target, scopeId);
      const candidates = databases().filter(entry => entry.source.pageId === page.id
        && (target.blockId ? entry.source.blockId === target.blockId : entry.source.kind !== 'block'));
      assert(candidates.length === 1, 'Choose an exact database source from search. This page is not a canonical database.');
      return candidates[0];
    }
    function viewState(block) {
      if (!block) return null;
      const fields = ['id','type','x','y','w','z','titleHTML','bodyHTML','bg','borderColor','textColor','titleColor','padding','radius',
        'calendarView','calendarCollapsed','calendarExpandedWidth','dbViewTitle','dbSourceKind','dbSourcePageId','dbSourceBlockId',
        'dbGroupBy','dbGalleryCardSize','dbGalleryCardFields','dbGalleryOpenMode','dbRowPageLayout','dbRowPageKind'];
      const result = Object.fromEntries(fields.map(key => [key, block[key] ?? '']));
      for (const key of ['dbFilters','dbSorts','dbHiddenPropertyIds','dbGalleryCardPropertyIds','dbColumnWidths']) {
        try { result[key] = JSON.parse(block[key] || (key === 'dbColumnWidths' ? '{}' : '[]')); }
        catch { result[key] = block[key]; }
      }
      result.appearance = env.normalizeAppearance ? env.normalizeAppearance(block.appearance) : (block.appearance || '');
      // Native database views derive height from their content on every render.
      // Intentional fixed heights live in appearance.height and remain protected.
      return result;
    }
    const viewStates = items => items.map(item => ({ pageId: item.pageId, block: viewState(item.block) }));
    function viewBlocks(source) {
      return Object.entries(env.blocks()).flatMap(([pageId, blocks]) => array(blocks)
        .filter(block => block.type === 'calendar' && block.dbSourceKind === source.kind
          && block.dbSourcePageId === source.pageId && (source.kind !== 'block' || block.dbSourceBlockId === source.blockId))
        .map(block => ({ pageId, block: clone(block) })));
    }
    function inspect({ target, scope, offset = 0, limit = 50 }) {
      env.readLive?.();
      const scopeId = scopeIdFor(scope);
      const entry = findDatabase(target, scopeId);
      const views = viewBlocks(entry.source).filter(item => inside(item.pageId, scopeId));
      const start = Math.max(0, Number(offset) || 0), count = Math.max(1, Math.min(100, Number(limit) || 50));
      return { source: entry.source, path: pathOf(entry.source.pageId),
        version: version({ database: entry.database, views: viewStates(views) }),
        database: { ...entry.database, rows: entry.database.rows.slice(start, start + count) },
        totalRows: entry.database.rows.length, nextOffset: start + count < entry.database.rows.length ? start + count : null,
        views: views.map(item => ({ pageId: item.pageId, path: pathOf(item.pageId), ...item.block })) };
    }
    function search({ query = '', scope, offset = 0, limit = 30 } = {}) {
      env.readLive?.();
      const scopeId = scopeIdFor(scope);
      const tokens = clean(query).toLocaleLowerCase().split(/\s+/).filter(Boolean);
      const records = env.catalog ? env.catalog().records : pages().map(page => ({ ref: `page:${page.id}`, kind: 'page', pageId: page.id, title: page.title }));
      const matches = records.filter(record => !record.archived && inside(record.pageId, scopeId))
        .map(record => ({ record, path: pathOf(record.pageId) }))
        .filter(({ record, path }) => tokens.every(token => `${record.title} ${path} ${record.text || ''} ${(record.aliases || []).join(' ')}`.toLocaleLowerCase().includes(token)));
      const start = Math.max(0, Number(offset) || 0), count = Math.max(1, Math.min(50, Number(limit) || 30));
      return { scope: scopeId ? { pageId: scopeId, path: pathOf(scopeId) } : 'whole vault', total: matches.length,
        results: matches.slice(start, start + count).map(({ record, path }) => ({
          ref: record.ref, kind: record.kind, title: record.title, pageId: record.pageId, path,
          source: record.source, excerpt: String(record.text || '').slice(0, 280)
        })), nextOffset: start + count < matches.length ? start + count : null };
    }

    function plan({ request }) {
      env.readLive?.();
      keys(request, ['mode', 'target', 'scope', 'expectedVersion', 'title', 'properties', 'removePropertyIds', 'propertyOrder', 'rows', 'archiveRowIds', 'view', 'views'], 'Database request');
      assert(['create', 'update'].includes(request.mode), 'Choose create or update.');
      for (const key of ['properties', 'removePropertyIds', 'propertyOrder', 'rows', 'archiveRowIds', 'views']) {
        if (own(request, key)) assert(Array.isArray(request[key]), `${key} must be an array.`);
      }
      const scopeId = scopeIdFor(request.scope);
      const targetPage = resolve(request.target, scopeId);
      const creating = request.mode === 'create';
      let source, before, currentViews;
      if (creating) {
        assert(!request.target.blockId, 'Create a database under a page, not inside another database block.');
        assert(clean(request.title), 'A new database needs a title.');
        assert(!pages().some(page => page.parent === targetPage.id && clean(page.title).toLocaleLowerCase() === clean(request.title).toLocaleLowerCase()), 'A page with that name already exists here. Inspect it or choose another name.');
        source = { kind: 'page', pageId: id('page-chatgpt-db'), blockId: '' };
        before = null; currentViews = [];
      } else {
        const entry = findDatabase(request.target, scopeId);
        source = entry.source; before = entry.database;
        currentViews = viewBlocks(source).filter(item => inside(item.pageId, scopeId));
        assert(request.expectedVersion === version({ database: before, views: viewStates(currentViews) }), 'The database changed or was not inspected. Inspect it and replan before applying.');
        assert(!before.folderState?.enabled, 'Folder-backed databases must be edited through their source folder.');
        assert(!request.title || clean(request.title) === clean(before.title), 'Renaming a database page through this plugin is not supported yet. Other edits can be planned without title.');
      }
      let database = clone(before || { title: clean(request.title), view: 'table', properties: [{ id: 'name', name: 'Name', type: 'title' }], rows: [] });
      const losses = [], caps = env.capabilities();
      const removals = array(request.removePropertyIds);
      unique(removals, 'Removed properties');
      for (const propertyId of removals) {
        const property = database.properties.find(prop => prop.id === propertyId);
        assert(property && propertyId !== 'name', 'A removed property must exist and cannot be the title.');
        assert(!property.readOnly, 'A read-only property cannot be removed by the plugin.');
        const count = database.rows.filter(row => clean(row.values[propertyId])).length;
        if (count) losses.push({ kind: 'remove-property', propertyId, propertyName: property.name, populatedRows: count });
      }
      database.properties = database.properties.filter(prop => !removals.includes(prop.id));
      for (const row of database.rows) for (const propertyId of removals) delete row.values[propertyId];
      unique(array(request.properties).map(prop => prop.id), 'Properties');
      for (const incoming of array(request.properties)) {
        keys(incoming, caps.propertyKeys, 'Property');
        assert(/^[a-zA-Z0-9_-]+$/.test(incoming.id || '') && !['__proto__', 'prototype', 'constructor'].includes(incoming.id), 'Each property needs a stable ID using letters, numbers, underscores or hyphens.');
        assert(!removals.includes(incoming.id), 'A property cannot be removed and updated in the same request.');
        const old = database.properties.find(prop => prop.id === incoming.id);
        const property = { ...(old || {}), ...clone(incoming) };
        for (const key of ['numberConfig','titleConfig','summaryConfig','formulaConfig']) {
          if (incoming[key] && old?.[key]) property[key] = { ...old[key], ...clone(incoming[key]) };
        }
        if (property.type === 'rollup') property.type = 'summary';
        assert(caps.propertyTypes.includes(property.type), `Unsupported property type: ${property.type}.`);
        assert(clean(property.name), 'Each property needs a name.');
        assert(property.id === 'name' ? property.type === 'title' : property.type !== 'title', 'Only the name property can be the title.');
        assert(!old?.readOnly || same(old, property), 'This existing property is read-only.');
        assert(!['created-time', 'edited-time'].includes(property.type) || property.id === (property.type === 'created-time' ? 'created_at' : 'updated_at'), 'Timestamp properties must use their native IDs: created_at or updated_at.');
        if (own(property, 'headerColor')) assert(!property.headerColor || caps.headerColors.includes(property.headerColor), `Unsupported header color: ${property.headerColor}.`);
        for (const optionsKey of ['selectOptions', 'tagOptions']) {
          if (!own(property, optionsKey)) continue;
          assert(Array.isArray(property[optionsKey]), `${optionsKey} must be an array.`);
          for (const option of property[optionsKey]) {
            keys(option, ['id', 'name', 'color'], 'Dropdown option');
            assert(clean(option.name) && (!option.color || caps.optionColors.includes(option.color)), 'Choose a supported option name and color.');
          }
          unique(property[optionsKey].map(option => clean(option.name).toLocaleLowerCase()), 'Dropdown options');
        }
        if (property.statusGroups) {
          assert(Array.isArray(property.statusGroups), 'Status groups must be an array.');
          for (const group of property.statusGroups) {
            keys(group, ['id', 'label', 'options'], 'Status group');
            for (const option of array(group.options)) {
              keys(option, ['id', 'name', 'color', 'isDefault'], 'Status option');
              assert(clean(option.name) && (!option.color || caps.statusColors.includes(option.color)), 'Choose a supported status name and color.');
            }
          }
        }
        if (old && (old.type !== property.type || (old.type === 'relation' && !same(old.relationTarget, property.relationTarget)))) {
          const count = database.rows.filter(row => clean(row.values[property.id])).length;
          if (count) losses.push({ kind: 'change-property-type-or-target', propertyId: property.id, propertyName: property.name, populatedRows: count });
        }
        if (old && property.type === 'relation' && (old.type !== 'relation' || !same(old.relationTarget, property.relationTarget))) {
          for (const row of database.rows) row.values[property.id] = '';
        }
        if (old) database.properties[database.properties.indexOf(old)] = property;
        else database.properties.push(property);
      }
      unique(database.properties.map(prop => clean(prop.name).toLocaleLowerCase()), 'Property names');
      if (request.propertyOrder) {
        const order = request.propertyOrder;
        unique(order, 'Property order');
        assert(order.length === database.properties.length && order.every(propertyId => database.properties.some(prop => prop.id === propertyId)), 'Property order must list every current property ID exactly once.');
        database.properties.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      }
      const allDatabases = databases();
      const dependencies = new Map();
      const relatedDatabase = property => {
        const target = property.relationTarget;
        assert(target && target.pageId, `Link ${property.name} needs an exact relationTarget.`);
        keys(target, ['kind', 'pageId', 'blockId', 'label', 'filterPropertyId', 'filterValue'], 'Relation target');
        if (sourceKey(target) === sourceKey(source)) return database;
        assert(inside(target.pageId, scopeId), 'A relation points outside the selected working area. Ask the user before widening the scope.');
        const linked = allDatabases.find(entry => sourceKey(entry.source) === sourceKey(target));
        assert(linked, `The target database for ${property.name} no longer exists.`);
        dependencies.set(sourceKey(linked.source), clone(linked));
        return linked.database;
      };
      for (const property of database.properties) {
        if (property.type === 'relation') relatedDatabase(property);
        if (property.type === 'summary') {
          const config = property.summaryConfig;
          keys(config, ['relationPropertyId', 'mode', 'targetPropertyId'], 'Rollup config');
          assert(caps.summaryModes.includes(config.mode), `Unsupported rollup mode: ${config.mode}.`);
          const relation = database.properties.find(prop => prop.id === config.relationPropertyId && prop.type === 'relation');
          assert(relation, `Rollup ${property.name} needs an existing Link property.`);
          const linked = relatedDatabase(relation);
          if (config.mode !== 'count') assert(linked.properties.some(prop => prop.id === config.targetPropertyId && prop.type === (config.mode === 'sum' ? 'number' : 'date')), 'This rollup needs a matching number or date property in its linked database.');
        }
        if (property.type === 'formula') {
          const config = property.formulaConfig;
          keys(config, caps.formulaKeys, 'Formula config');
          assert(['simple', 'advanced'].includes(config.mode), 'Choose simple or advanced formula mode.');
          if (config.mode === 'simple') assert(caps.formulaTypes.includes(config.simpleType), `Unsupported formula: ${config.simpleType}.`);
          else assert(clean(config.expression) && !env.validateFormula?.(database, config.expression), 'The advanced formula is invalid or uses an unsupported function.');
          const required = config.mode === 'simple' ? ({
            sum: ['relationPropertyId', 'targetPropertyId'], average: ['relationPropertyId', 'targetPropertyId'], count: ['relationPropertyId'],
            subtract: ['leftPropertyId', 'rightPropertyId'], percentage: ['leftPropertyId', 'rightPropertyId'], compare: ['leftPropertyId', 'rightPropertyId'],
            'auto-complete': ['checkboxPropertyId'], 'days-until-date': ['datePropertyId'], 'cycle-day': ['datePropertyId', 'phasePropertyId', 'phaseValue']
          }[config.simpleType] || []) : [];
          for (const key of required) assert(config[key], 'Formula ' + property.name + ' needs ' + key + '.');
          if (config.relationPropertyId) {
            const relation = database.properties.find(prop => prop.id === config.relationPropertyId && prop.type === 'relation');
            assert(relation, 'Formula needs a Link property.');
            const linked = relatedDatabase(relation);
            if (config.targetPropertyId) assert(linked.properties.some(prop => prop.id === config.targetPropertyId && ['number','summary','formula'].includes(prop.type)), 'Formula target must be a numeric property in the linked database.');
            if (config.simpleType === 'count' && config.checkboxPropertyId) assert(linked.properties.some(prop => prop.id === config.checkboxPropertyId && prop.type === 'checkbox'), 'Count needs a checkbox property in the linked database.');
          }
          for (const key of ['relationPropertyId', 'leftPropertyId', 'rightPropertyId', 'checkboxPropertyId', 'datePropertyId', 'phasePropertyId']) {
            if (key === 'checkboxPropertyId' && config.simpleType === 'count') continue;
            if (config[key]) assert(database.properties.some(prop => prop.id === config[key]), `Formula ${property.name} references a missing property: ${config[key]}.`);
          }
        }
      }
      const newRows = [];
      unique(array(request.rows).filter(row => row.id).map(row => row.id), 'Rows');
      for (const incoming of array(request.rows)) {
        keys(incoming, ['id', 'values', 'icon', 'color'], 'Row');
        const old = incoming.id ? database.rows.find(row => row.id === incoming.id) : null;
        assert(!incoming.id || old, 'An updated row ID was not found. Omit id to add a new row.');
        assert(!old?.archived, 'Restore an archived row before editing it.');
        const row = old || { id: id('row-chatgpt'), pageId: id('page-chatgpt-row'), createdAt: new Date().toISOString(), values: {} };
        if (own(incoming, 'color')) assert(!incoming.color || caps.rowColors.includes(incoming.color), 'Unsupported row color.');
        for (const [propertyId, value] of Object.entries(incoming.values || {})) {
          const property = database.properties.find(prop => prop.id === propertyId);
          assert(property && !property.readOnly && !['summary', 'formula', 'created-time', 'edited-time'].includes(property.type), `Cannot write missing or computed property: ${propertyId}.`);
          if (env.validateCell) assert(!env.validateCell(property, value), env.validateCell(property, value));
          if (property.type === 'number') assert(value === '' || value === null || Number.isFinite(Number(String(value).replace(/,/g, ''))), `Invalid number for ${property.name}.`);
          if (property.type === 'relation') {
            assert(Array.isArray(value), 'Relation values must be arrays of existing row IDs.');
            const linked = relatedDatabase(property);
            assert(value.every(rowId => linked.rows.some(candidate => candidate.id === rowId && !candidate.archived)), 'A linked row was not found in the selected database.');
          }
          row.values[propertyId] = clone(value);
        }
        if (own(incoming, 'icon')) row.icon = incoming.icon;
        if (own(incoming, 'color')) row.color = incoming.color;
        row.updatedAt = new Date().toISOString();
        if (!old) { database.rows.push(row); newRows.push(row); }
      }
      for (const rowId of array(request.archiveRowIds)) {
        const row = database.rows.find(item => item.id === rowId);
        assert(row, 'An archived row ID was not found.');
        if (!row.archived) losses.push({ kind: 'archive-row', rowId, title: row.values.name });
        row.archived = true; row.archivedAt = new Date().toISOString();
      }
      function validateView(view, linked = false) {
        keys(view, linked ? ['blockId', 'page', 'title', 'view', 'filters', 'sorts', 'groupBy', 'hiddenPropertyIds'] : ['view', 'filters', 'sorts', 'groupBy', 'columnWidths', 'galleryCardSize', 'galleryCardFields', 'galleryCardPropertyIds', 'galleryOpenMode', 'rowPageLayout'], 'View');
        for (const key of ['filters', 'sorts', 'hiddenPropertyIds', 'galleryCardPropertyIds']) if (own(view, key)) assert(Array.isArray(view[key]), key + ' must be an array.');
        if (own(view, 'rowPageLayout')) assert(view.rowPageLayout === 'document', 'This plugin currently creates Document row pages. Other row-page layouts need native editor setup.');
        if (own(view, 'galleryCardSize')) assert(['small','medium','large'].includes(view.galleryCardSize), 'Unsupported gallery card size.');
        if (own(view, 'galleryOpenMode')) assert(['page','peek'].includes(view.galleryOpenMode), 'Choose page or peek for gallery opening.');
        if (own(view, 'galleryCardFields')) assert(Number.isInteger(view.galleryCardFields) && view.galleryCardFields >= 0 && view.galleryCardFields <= 3, 'Gallery field count must be 0 to 3.');
        if (view.view) assert(caps.views.includes(view.view), `Unsupported view: ${view.view}.`);
        for (const entry of [...array(view.filters), ...array(view.sorts)]) {
          assert(database.properties.some(prop => prop.id === entry.propertyId), `View references a missing property: ${entry.propertyId}.`);
        }
        for (const filter of array(view.filters)) { keys(filter, ['propertyId', 'mode', 'value'], 'Filter'); assert(caps.filterModes.includes(filter.mode), `Unsupported filter: ${filter.mode}.`); }
        for (const sort of array(view.sorts)) { keys(sort, ['propertyId', 'direction'], 'Sort'); assert(['asc', 'desc'].includes(sort.direction), 'Sort direction must be asc or desc.'); }
        if (view.groupBy) assert(database.properties.some(prop => prop.id === view.groupBy), 'The grouping property does not exist.');
        for (const propertyId of array(view.hiddenPropertyIds)) assert(database.properties.some(prop => prop.id === propertyId), 'A hidden property does not exist.');
        for (const [propertyId, width] of Object.entries(view.columnWidths || {})) assert(database.properties.some(prop => prop.id === propertyId) && Number.isFinite(width) && width >= (caps.columnMinimums?.[database.properties.find(prop => prop.id === propertyId)?.type] || 60) && width <= 640, 'Column widths must use existing properties and native limits (at most 640).');
      }
      if (request.view) { validateView(request.view); database = { ...database, ...clone(request.view) }; }
      const views = array(request.views).map(view => {
        validateView(view, true);
        const host = resolve(view.page, scopeId);
        assert(['board-canvas', 'infinite-canvas'].includes(host.layout), 'Linked database views can currently be placed on board or infinite-board pages.');
        const old = view.blockId ? currentViews.find(item => item.pageId === host.id && item.block.id === view.blockId) : null;
        assert(!view.blockId || old, 'That linked view was not found on the specified page.');
        return { pageId: host.id, blockId: old?.block.id || id('block-chatgpt-db'), before: old?.block || null, beforeIndex: old ? array(env.blocks()[host.id]).findIndex(block => block.id === old.block.id) : -1, config: clone(view) };
      });
      unique(views.map(view => view.blockId), 'Linked views');
      // Native normalization is intentionally after validation; unsupported types never silently become Text.
      const beforeNormalization = clone(database);
      database = env.normalize(database);
      for (const property of database.properties) {
        if (['summary','formula','created-time','edited-time'].includes(property.type)) continue;
        const changedRows = database.rows.filter(row => {
          if (!before?.rows.some(item => item.id === row.id)) return false;
          if (array(request.rows).some(item => item.id === row.id && own(item.values || {}, property.id))) return false;
          const prior = beforeNormalization.rows.find(item => item.id === row.id)?.values[property.id];
          return clean(prior) && String(prior) !== String(row.values[property.id] ?? '');
        }).length;
        if (changedRows && !losses.some(loss => loss.propertyId === property.id)) losses.push({ kind: 'convert-values', propertyId: property.id, propertyName: property.name, populatedRows: changedRows });
      }
      for (const incoming of array(request.rows)) {
        // Invalid dates must not silently normalize to an empty field.
        for (const [propertyId, value] of Object.entries(incoming.values || {})) {
          const property = database.properties.find(prop => prop.id === propertyId);
          if (property.type === 'date' && clean(value)) {
            const normalized = env.normalize({ ...database, rows: [{ id: 'validation-row', values: { [propertyId]: value } }] }).rows[0].values[propertyId];
            assert(clean(normalized), `Invalid date for ${property.name}. Use YYYY-MM-DD or a native date object.`);
          }
        }
      }
      const writes = [{ source, before, after: database }];
      // Reverse Links follow the union of links to a database, including removed
      // fields, retargeted relations and archived rows.
      const parse = value => { try { return array(JSON.parse(value || '[]')); } catch { return []; } };
      const relationTargets = new Map();
      for (const property of [...array(before?.properties), ...database.properties]) {
        if (property.type === 'relation' && !property.treeKind && property.relationTarget?.pageId) {
          relationTargets.set(sourceKey(property.relationTarget), property.relationTarget);
        }
      }
      const rowLinks = (db, row, target) => new Set(array(db?.properties)
        .filter(prop => prop.type === 'relation' && !prop.treeKind && sourceKey(prop.relationTarget || {}) === sourceKey(target))
        .flatMap(prop => row?.archived ? [] : parse(row?.values[prop.id])));
      for (const target of relationTargets.values()) {
        if (sourceKey(target) === sourceKey(source)) continue;
        const linked = allDatabases.find(item => sourceKey(item.source) === sourceKey(target));
        if (!linked) continue;
        const reverse = linked.database.properties.filter(prop => prop.type === 'relation' && !prop.treeKind && sourceKey(prop.relationTarget || {}) === sourceKey(source));
        if (!reverse.length) continue;
        let write = null;
        for (const row of database.rows) {
          const prior = before?.rows.find(item => item.id === row.id);
          const oldIds = rowLinks(before, prior, target), newIds = rowLinks(database, row, target);
          for (const targetRow of linked.database.rows) for (const back of reverse) {
            if (oldIds.has(targetRow.id) === newIds.has(targetRow.id)) continue;
            assert(inside(target.pageId, scopeId), 'Updating the reverse Link would leave the selected area. Ask before widening scope.');
            assert(!linked.database.folderState?.enabled && !back.readOnly, 'This reverse Link is read-only.');
            if (!write) { write = { source: linked.source, before: linked.database, after: clone(linked.database) }; writes.push(write); }
            const nextRow = write.after.rows.find(item => item.id === targetRow.id);
            const values = new Set(parse(nextRow.values[back.id]));
            if (newIds.has(targetRow.id)) values.add(row.id); else values.delete(row.id);
            nextRow.values[back.id] = values.size ? JSON.stringify([...values]) : '';
          }
        }
      }
      const planId = id('plan');
      const result = { planId, mode: request.mode, destination: creating ? `${pathOf(targetPage.id)} → ${database.title}` : pathOf(source.pageId),
        source, properties: database.properties, addedRows: newRows.length, linkedViews: views.map(view => ({ blockId: view.blockId, path: pathOf(view.pageId), title: view.config.title })),
        losses, needsDataLossAuthorization: losses.length > 0 };
      plans.set(planId, { result, source, parentId: creating ? targetPage.id : '', writes, newRows: clone(database.rows.filter(row => newRows.some(item => item.id === row.id))), views,
        currentViews, scopeId, request: clone(request), dependencies: [...dependencies.values()],
        destinations: [...new Set([targetPage.id, ...views.map(view => view.pageId), ...[...dependencies.values()].map(item => item.source.pageId)])].map(pageId => ({ pageId, path: pathOf(pageId) })),
        expires: Date.now() + 30 * 60 * 1000 });
      if (plans.size > 50) plans.delete(plans.keys().next().value);
      return clone(result);
    }

    async function persistHistory(history) {
      assert(env.writeHistory(history) !== false, 'Could not save the recovery history.');
      assert(await env.flush() !== false, 'Recovery or changes could not be saved. Keep Sanctum open and retry saving.');
    }
    function history() { return array(env.readHistory()).map(item => ({ changeId: item.id, planId: item.planId, kind: item.kind || 'database', destination: item.destination, status: item.status, createdAt: item.createdAt, error: item.error })); }
    async function visualRead(args, captureImage = false) {
      keys(args, captureImage ? ['target', 'scope', 'region', 'includeHeader'] : ['target', 'scope'], 'Visual request');
      assert(!busy, 'Another database or visual operation is running.');
      const scopeId = scopeIdFor(args.scope), page = resolve(args.target, scopeId);
      if (args.target.blockId) assert(array(env.blocks()[page.id]).some(block => block.id === args.target.blockId), 'That block was not found on the requested page.');
      if (args.region) keys(args.region, ['x', 'y', 'width', 'height'], 'Capture region');
      const operation = captureImage ? env.screenshot : env.layout;
      assert(operation, 'Refresh Sanctum to load visual tools.');
      busy = true;
      try {
        env.lock?.(captureImage ? 'Capturing Sanctum page…' : 'Checking page layout…');
        env.readLive?.();
        if(own(args,'includeHeader'))assert(typeof args.includeHeader==='boolean','includeHeader must be boolean.');
        const result = await operation(page.id, { blockId: args.target.blockId, region: args.region, includeHeader:args.includeHeader });
        return { ...result, path: pathOf(page.id) };
      } finally { busy = false; env.unlock?.(); }
    }
    async function apply({ planId, allowDataLoss = false }) {
      assert(!busy, 'Another database change is running.');
      const prior = array(env.readHistory()).find(item => item.planId === planId);
      if (prior) { assert(prior.status === 'applied', 'This plan already has a recovery record. Inspect history before retrying.'); return { changeId: prior.id, destination: prior.destination, status: prior.status, alreadyApplied: true }; }
      const entry = plans.get(planId);
      assert(entry && entry.expires > Date.now(), 'This plan expired. Inspect and plan the database again.');
      assert(!entry.result.needsDataLossAuthorization || allowDataLoss === true, 'This change would discard existing information. Obtain one explicit authorization for the listed losses.', { losses: entry.result.losses });
      busy = true;
      try {
        env.lock?.();
        await env.flushLive?.();
        const latest = databases();
        for (const write of [...entry.writes, ...entry.dependencies.map(item => ({ source: item.source, before: item.database }))]) {
          const current = latest.find(item => sourceKey(item.source) === sourceKey(write.source));
          assert(same(current?.database || null, write.before), 'A database or linked database changed. Inspect it and replan.');
        }
        assert(same(viewStates(viewBlocks(entry.source).filter(item => inside(item.pageId, entry.scopeId))), viewStates(entry.currentViews)), 'A linked view changed. Inspect and replan.');
        resolve({ pageId: entry.parentId || entry.source.pageId }, entry.scopeId);
        for (const view of entry.views) resolve({ pageId: view.pageId }, entry.scopeId);
        for (const destination of entry.destinations) assert(pathOf(destination.pageId) === destination.path, 'A destination page moved or was renamed. Inspect and replan.');
        if (entry.parentId) assert(!pages().some(page => page.parent === entry.parentId && clean(page.title).toLocaleLowerCase() === clean(entry.writes[0].after.title).toLocaleLowerCase()), 'A page with that name has been created here. Inspect it before proceeding.');
        const record = { id: id('change'), planId, destination: entry.result.destination, createdAt: new Date().toISOString(), status: 'applying',
          writes: clone(entry.writes), createdPages: [...(entry.parentId ? [entry.source.pageId] : []), ...entry.newRows.map(row => row.pageId)],
          views: clone(entry.views), parentId: entry.parentId };
        const allHistory = array(env.readHistory()); allHistory.unshift(record);
        await persistHistory(allHistory);
        try {
          if (entry.parentId) env.createPage({ pageId: entry.source.pageId, title: entry.writes[0].after.title, parentId: entry.parentId });
          if (entry.newRows.length) env.createRows(entry.source, entry.newRows);
          for (const write of entry.writes) assert(env.save(write.source, clone(write.after)) !== false, 'Could not save the database.');
          let layoutVerification = null;
          if (entry.views.length && env.placeViews) {
            layoutVerification = await env.placeViews(entry.source, entry.writes[0].after, entry.views);
          } else {
            const blocks = env.blocks();
            for (const view of entry.views) {
              const items = array(blocks[view.pageId]);
              const block = env.makeView(entry.source, entry.writes[0].after, view, items);
              const index = items.findIndex(item => item.id === view.blockId);
              if (index >= 0) items[index] = block; else items.push(block);
              blocks[view.pageId] = items;
            }
            if (entry.views.length) assert(env.writeBlocks(blocks) !== false, 'Could not save database views.');
          }
          assert(await env.flush() !== false, 'Database changes could not be saved.');
          record.after = capture(record);
          record.status = 'applied';
          await persistHistory(allHistory);
          plans.delete(planId);
          return { changeId: record.id, destination: record.destination, status: 'applied', source: entry.source, recoverySaved: true, layoutVerification };
        } catch (error) {
          try { restore(record); record.status = 'rolled-back'; await persistHistory(allHistory); }
          catch (restoreError) { record.status = 'recovery-needed'; record.error = `${error.message} Recovery: ${restoreError.message}`; env.writeHistory(allHistory); }
          throw error;
        }
      } finally { busy = false; env.unlock?.(); }
    }
    function capture(record) {
      const dbs = databases(); const blocks = env.blocks();
      return { databases: record.writes.map(write => dbs.find(item => sourceKey(item.source) === sourceKey(write.source))?.database || null),
        views: record.views.map(view => viewState(array(blocks[view.pageId]).find(block => block.id === view.blockId) || null)),
        pages: record.createdPages.map(pageId => ({ page: pages().find(page => page.id === pageId) || null,
          children: pages().filter(page => page.parent === pageId).map(page => page.id).sort(), content: env.pageContent?.(pageId) || null })),
        incoming: dbs.filter(item => !record.writes.some(write => sourceKey(write.source) === sourceKey(item.source))).flatMap(item => {
          const properties = item.database.properties.filter(prop => prop.type === 'relation' && record.writes.some(write => sourceKey(write.source) === sourceKey(prop.relationTarget || {})));
          return properties.length ? [{ source: item.source, properties, values: item.database.rows.map(row => ({ id: row.id, values: Object.fromEntries(properties.map(prop => [prop.id, row.values[prop.id] || ''])) })) }] : [];
        }),
        incomingViews: record.writes.flatMap(write => viewStates(viewBlocks(write.source).filter(item => !record.views.some(view => view.blockId === item.block.id)))) };
    }
    function restore(record) {
      for (const write of record.writes) {
        if (write.before) assert(env.save(write.source, clone(write.before)) !== false, 'Could not restore a database.');
      }
      const blocks = env.blocks();
      for (const view of record.views) {
        blocks[view.pageId] = array(blocks[view.pageId]).filter(block => block.id !== view.blockId);
        if (view.before) blocks[view.pageId].splice(Math.max(0, view.beforeIndex), 0, clone(view.before));
      }
      if (record.views.length) assert(env.writeBlocks(blocks) !== false, 'Could not restore linked views.');
      if (record.createdPages.length) assert(env.deletePages(record.createdPages) !== false, 'Could not remove generated pages during recovery.');
    }
    async function undo({ changeId }) {
      assert(!busy, 'Another database change is running.');
      busy = true;
      try {
        env.lock?.();
        await env.flushLive?.();
        const items = array(env.readHistory()), record = items.find(item => item.id === changeId);
        assert(record, 'That recovery copy was not found.');
        if (record.status === 'undone') return { changeId, status: 'undone', alreadyUndone: true };
        assert(record.status === 'applied', 'This change needs manual recovery. Export its recovery copy from Settings → Data.');
        assert(same(capture(record), record.after), 'This database, linked view, or generated page changed afterward. Undo would overwrite newer work; use the exported recovery copy to recover specific information.');
        try {
          restore(record); record.status = 'undone'; await persistHistory(items);
        } catch (error) {
          record.status = 'recovery-needed'; record.error = 'Undo could not finish: ' + error.message;
          env.writeHistory(items);
          throw error;
        }
        return { changeId, status: 'undone', destination: record.destination };
      } finally { busy = false; env.unlock?.(); }
    }
    return { capabilities: () => ({ ...clone(env.capabilities()), visualTools: {
      layout: !!env.layout, screenshot: !!env.screenshot, measuredPlacement: !!env.placeViews,
      notes: ['Visual tools open the exact requested page in the connected Sanctum tab. They never capture other apps, tabs, Settings or the desktop.',
        'New inline database views are rendered and placed sequentially, clear of measured existing blocks. Existing user positions are preserved.',
        'After placing database views, use the layout and screenshot tools to inspect the result. For a tall page, capture each block or a region around its returned bounds.']
    } }), search, inspect, plan, apply, history, undo, pathOf,
      resolvePage: (target, scope) => resolve(target, scopeIdFor(scope)),
      layout: args => visualRead(args), screenshot: args => visualRead(args, true) };
  }
  return { createService, version, sourceKey };
});
