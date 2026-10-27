(function () {
  const M = window.SanctumTimelineData, DB = window.SanctumTimelineDatabase;
  const key = window.STORAGE_KEYS?.timelines || 'sanctum_timelines_v1';
  const mounted = new Map();
  const positions = new Map();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const read = () => window.readStorageJSON(key, {});
  const sourceConfig = source => read().sources?.[M.sourceKey(source)] || {};
  const viewConfig = id => M.view(read().views?.[id] || {});
  function store(section, id, value) {
    const all = read();
    all[section] = { ...(all[section] || {}), [id]: value };
    if (window.writeStorageJSON(key, all) === false) throw new Error('Could not save timeline settings.');
  }
  function refresh() {
    for (const [host, options] of [...mounted]) {
      if (!host.isConnected) { mounted.delete(host); continue; }
      DB.refresh(host);
    }
  }
  function dialog(title, subtitle = '') {
    const el = document.createElement('dialog'); el.className = 'timeline-dialog';
    const titleId = `timeline-dialog-${Date.now()}`;
    el.setAttribute('aria-labelledby', titleId);
    el.innerHTML = `<header><div><h2 id="${titleId}">${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div><button type="button" data-dismiss aria-label="Close dialog">×</button></header>`;
    el.querySelector('[data-dismiss]').onclick = () => el.close();
    el.addEventListener('keydown', e => e.stopPropagation());
    el.addEventListener('close', () => el.remove());
    document.body.append(el);
    return el;
  }
  function formError(form, error) { form.querySelector('[role="alert"]').textContent = error.message || String(error); }
  function editEvent(options, item) {
    const source = item?.source || options.source;
    let db = DB.get(source);
    if (!db) return;
    const readOnly = !!db.folderState?.enabled;
    let config = sourceConfig(source), cal = M.calendar(config.calendar), fields = M.mapping(db, config.mapping);
    const originalDateFields = { date: fields.date, end: fields.end };
    const row = item ? db.rows.find(r => r.id === item.rowId) : null;
    if (item && !row) return;
    const titleId = db.properties.find(p => p.type === 'title')?.id;
    const title = row?.values?.[titleId] || '';
    const parts = M.dateParts(row?.values?.[fields.date]);
    const end = fields.end && fields.end !== fields.date ? M.dateParts(row?.values?.[fields.end]).start : parts.end;
    let dateProp = db.properties.find(p => p.id === fields.date);
    const textFields = Object.fromEntries(['description','image','lane'].map(k => [k, row?.values?.[fields[k]] || '']));
    const el = dialog(item ? 'Edit event' : 'New event');
    el.insertAdjacentHTML('beforeend', `<form class="tl-form">
      <label>Event<input name="title" required maxlength="300" placeholder="What happened?" value="${esc(title)}" autofocus></label>
      <div class="tl-form-pair"><label>Start<input name="start" placeholder="${cal.kind === 'earth' ? '2026-09-22, 1840, or 250 BCE' : '24-03-12 or 24 Era name'}" value="${esc(parts.start)}"></label><label>End (optional)<input name="end" placeholder="Leave blank for a single moment" value="${esc(end)}"></label></div>
      <div class="tl-calendar-choice"><span data-calendar-name>${esc(cal.name)}</span><button type="button" data-calendar-change>Change calendar</button></div>
      
      <label>Details<textarea name="description" rows="4" placeholder="A little context…">${esc(textFields.description)}</textarea></label>
      <details><summary>More options</summary><div class="tl-advanced"><p class="tl-help">${esc(cal.name)} · Dates can be left empty. Use ~ for an approximate date.</p><div class="tl-form-pair"><label>Track (optional)<input name="lane" placeholder="A person, subject, or chapter" value="${esc(textFields.lane)}"></label><label>Accent<input type="color" name="color" value="${/^#[0-9a-f]{6}$/i.test(row?.color || '') ? row.color : '#a5765b'}"></label></div>
      
        <label>Image address<input name="image" placeholder="https://…" value="${esc(textFields.image)}"></label>
        <label class="tl-upload">Or choose an image<input type="file" name="upload" accept="image/png,image/jpeg,image/webp,image/gif"></label>
        <fieldset class="tl-choices"><legend>Connected pages</legend><div>${(window.userPages || []).filter(p => p.id !== row?.pageId && !p.databaseRowRef).map(p => `<label><input type="checkbox" name="links" value="${esc(p.id)}"><span>${esc(p.title)}</span></label>`).join('') || '<p class="tl-help">No pages available.</p>'}</div></fieldset>
      </div></details>
      <p class="tl-error" role="alert"></p><footer>${row?.pageId ? '<button type="button" data-open-page>Open event page ↗</button>' : '<span></span>'}<button class="tl-primary" type="submit">${item ? 'Save changes' : 'Add event'}</button></footer>
    </form>`);
    const form = el.querySelector('form');
    const calendarButton = form.querySelector('[data-calendar-change]');
    function updateCalendarChoice() {
      const suggestion = M.calendarSuggestion([form.elements.start.value, form.elements.end.value], cal);
      calendarButton.textContent = suggestion ? 'Set up fictional dates' : 'Change calendar';
      form.querySelector('[data-calendar-name]').textContent = suggestion
        ? 'This date uses an era outside the current calendar.' : [cal.name, ...cal.eras.filter(era => era.fullName).map(era => `${era.name} = ${era.fullName}`)].join(' · ');
    }
    form.elements.start.addEventListener('input', updateCalendarChoice);
    form.elements.end.addEventListener('input', updateCalendarChoice);
    calendarButton.disabled = readOnly;
    calendarButton.onclick = () => settings({ ...options, source, readOnly,
      calendarDraft: M.calendarSuggestion([form.elements.start.value, form.elements.end.value], cal),
      datesOpen: true, onSave() {
        db = DB.get(source);
        config = sourceConfig(source); cal = M.calendar(config.calendar); fields = M.mapping(db, config.mapping);
        dateProp = db.properties.find(p => p.id === fields.date);
        form.elements.start.placeholder = cal.kind === 'earth' ? '2026-09-22, 1840, or 250 BCE' : '24-03-12 or 24 Era name';
        form.querySelector('[role="alert"]').textContent = '';
        updateCalendarChoice();
      }
    });
    updateCalendarChoice();
    if (row && !readOnly) {
      const archive = document.createElement('button'); archive.type = 'button'; archive.textContent = 'Archive event';
      archive.onclick = () => {
        try { DB.saveEvent(source, row.id, {}, { archived: true }); el.close(); refresh(); }
        catch (error) { formError(form, error); }
      };
      archive.className = 'tl-archive';
      form.querySelector('.tl-advanced').append(archive);
    }
    const originalLinks = row?.pageId ? window.getPageProps?.(row.pageId)?.properties?.find(p => p.id === 'timeline-related')?.linkedPageIds || [] : [];
    form.querySelectorAll('input[name="links"]').forEach(o => { o.checked = originalLinks.includes(o.value); });
    form.querySelector('[data-open-page]')?.addEventListener('click', () => { el.close(); DB.openEvent(source, row.id); });
    let readingImage = false;
    form.elements.upload.onchange = () => {
      const file = form.elements.upload.files[0]; if (!file) return;
      if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 5 * 1024 * 1024) { formError(form, new Error('Choose a PNG, JPG, WebP, or GIF under 5 MB.')); return; }
      const reader = new FileReader();
      readingImage = true;
      reader.onload = () => { form.elements.image.value = reader.result; readingImage = false; };
      reader.onerror = () => { readingImage = false; formError(form, new Error('The image could not be read.')); };
      reader.readAsDataURL(file);
    };
    form.onsubmit = e => {
      e.preventDefault();
      try {
        if (readingImage) throw new Error('The image is still loading. Save again in a moment.');
        const value = name => form.elements[name].value.trim();
        const start = value('start'), finish = value('end');
        const parsed = M.parseDate(start, cal), parsedEnd = M.parseDate(finish, cal);
        if (start && !parsed.valid) throw new Error(M.calendarSuggestion([start, finish], cal)
          ? 'Set up fictional dates to use your era. Your event text will stay here while you change the calendar.' : parsed.error);
        if (finish && (!start || !parsedEnd.valid)) throw new Error(parsedEnd.error || 'Add a start before setting an end.');
        if (finish && parsedEnd.ordinal < parsed.ordinal) throw new Error('The end must come after the start.');
        for (const [role, value] of [['date', start], ['end', finish]]) {
          const property = db.properties.find(p => p.id === fields[role]) || (role === 'end' && !fields.end ? dateProp : null);
          if (property?.type === 'date' && value && !/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?$/.test(value)) throw new Error('This database Date field needs YYYY-MM-DD. Choose a text date field in Timeline settings for years, eras, or approximate dates.');
          if (property?.type === 'number' && value && !/^-?\d+$/.test(value)) throw new Error('This number field needs a year number. Choose a text field for a complete date or era.');
        }
        if (value('image') && !M.safeImage(value('image'))) throw new Error('Use an image URL or choose an image file.');
        const needed = [], nextFields = { ...fields };
        for (const [role, name] of [['date','When'],['end','Until'],['description','Details'],['lane','Track'],['image','Image']]) {
          if (role === 'end' && dateProp?.type === 'date' && !fields.end) continue;
          if (nextFields[role] || !(role === 'date' ? start : role === 'end' ? finish : value(role))) continue;
          const id = `timeline_${role}`;
          nextFields[role] = id; needed.push({ id, name, type: 'text' });
        }
        if (needed.length) DB.addFields(source, needed);
        const patch = { [titleId]: value('title') };
        if (nextFields.date) patch[nextFields.date] = start;
        if (dateProp?.type === 'date' && !fields.end) {
          patch[nextFields.date] = M.dateValuePatch(row?.values?.[fields.date], start, finish);
        } else if (nextFields.end) patch[nextFields.end] = finish;
        if (dateProp?.type === 'date' && fields.end) patch[nextFields.date] = M.dateValuePatch(row?.values?.[fields.date], start, parts.end);
        if (db.properties.find(p => p.id === nextFields.end)?.type === 'date') patch[nextFields.end] = M.dateValuePatch(row?.values?.[fields.end], finish, M.dateParts(row?.values?.[fields.end]).end);
        for (const role of ['description','image','lane']) if (nextFields[role]) patch[nextFields[role]] = value(role);
        if (row) {
          if (start === parts.start && finish === end) {
            if (nextFields.date === originalDateFields.date) delete patch[nextFields.date];
            if (nextFields.end === originalDateFields.end) delete patch[nextFields.end];
          }
          for (const [id, next] of Object.entries(patch)) if (String(row.values?.[id] || '') === next) delete patch[id];
        }
        const saved = DB.saveEvent(source, row?.id || '', patch, { color: row && value('color') === (row.color || '#a5765b') ? undefined : value('color') });
        if (needed.length) store('sources', M.sourceKey(source), { ...config, mapping: nextFields });
        const links = Array.from(form.querySelectorAll('input[name="links"]:checked')).map(o => o.value);
        if (saved.pageId && JSON.stringify(links) !== JSON.stringify(originalLinks)) {
          const props = window.getPageProps?.(saved.pageId) || { properties: [] };
          props.properties = props.properties.filter(p => p.id !== 'timeline-related');
          if (links.length) props.properties.push({ id: 'timeline-related', label: 'Related pages', type: 'relation', linkedPageIds: links });
          window.setPageProps?.(saved.pageId, props);
        }
        el.close(); refresh();
      } catch (error) { formError(form, error); }
    };
    if (readOnly) { form.querySelectorAll('input, textarea, select, button[type="submit"]').forEach(input => { input.disabled = true; }); }
    el.showModal();
  }
  function settings(options) {
    const db = DB.get(options.source); if (!db) return;
    const config = sourceConfig(options.source), cal = M.calendar(options.calendarDraft || config.calendar), fields = M.mapping(db, config.mapping), prefs = viewConfig(options.viewKey);
    const fieldsHTML = (role, label, types) => `<label>${label}<select name="${role}"><option value="">None</option>${db.properties.filter(p => types.includes(p.type)).map(p => `<option value="${esc(p.id)}"${fields[role] === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}${!options.readOnly ? '<option value="__new">Create a new text field</option>' : ''}</select></label>`;
    const el = dialog('Timeline view');
    el.insertAdjacentHTML('beforeend', `<form class="tl-form"><div class="tl-form-pair"><label>Layout<select name="style"><option value="illustrated">Illustrated</option><option value="spans">Spans</option></select></label><label>Zoom<select name="zoom">${[.5,.75,1,1.5,2,3,4].map(n => `<option value="${n}">${Math.round(n * 100)}%</option>`).join('')}</select></label></div><div class="tl-form-pair">
      <label>Appearance<select name="theme"><option value="inherit">Use page theme</option><option value="paper">Paper</option><option value="ink">Ink</option></select></label>
      <label data-spacing>Spacing<select name="spacing"><option value="readable">Room for each event</option><option value="time">Follow time gaps</option></select></label></div>
      <div class="tl-checks"><label><input type="checkbox" name="images"${prefs.images ? ' checked' : ''}> Images</label><label><input type="checkbox" name="descriptions"${prefs.descriptions ? ' checked' : ''}> Descriptions</label></div>
      <details data-calendar-details${options.datesOpen ? ' open' : ''}><summary>Dates & calendar</summary><div class="tl-advanced">
        <label>Calendar<select name="kind"><option value="earth">Real / historical dates</option><option value="fiction">Fictional years & eras</option><option value="custom">Custom calendar</option></select></label>
        <div data-fiction><label>Calendar name<input name="calendarName" value="${esc(cal.name)}"></label>
          <label>Eras <small>one per line: abbreviation | starting year | full name (optional)</small><textarea name="eras" rows="3" placeholder="AF | 0 | After the Fall&#10;Second Age | 1000">${esc(cal.eras.map(e => `${e.name} | ${e.offset}${e.fullName ? ` | ${e.fullName}` : ''}`).join('\n'))}</textarea></label>
          <p class="tl-help">“AF | 0 | After the Fall” lets you enter “0 AF” or “0 After the Fall”. The full name explains the abbreviation. Starting year places the era on the shared time axis: “Second Age | 1000” puts “24 Second Age” at year 1024.</p>
          <label class="tl-check"><input type="checkbox" name="yearZero"${cal.yearZero ? ' checked' : ''}> Include year zero</label>
        </div>
        <div data-custom><label>Months <small>one per line: name | days</small><textarea name="months" rows="5">${esc(cal.months.map(m => `${m.name} | ${m.days}`).join('\n'))}</textarea></label><label>Hours in a day<input type="number" name="hours" min="1" max="100" value="${cal.hours}"></label></div>
        <div class="tl-form-pair">${fieldsHTML('date','Start field',['date','text','number'])}${fieldsHTML('end','End field · optional',['date','text','number'])}</div>
        <p class="tl-help">A Date field can include its own end date. Text fields allow partial dates, BCE, eras, and custom calendars. Existing values are never converted.</p>
      </div></details>
      <details><summary>Content fields</summary><div class="tl-advanced">${fieldsHTML('description','Description',['text','notes'])}${fieldsHTML('image','Image',['text','url'])}${fieldsHTML('lane','Track / group',['text','select','status','tag'])}</div></details>
      <details><summary>Linked timelines</summary><div class="tl-advanced"><fieldset class="tl-choices"><legend>Show events from</legend><div>${DB.sources().filter(s => M.sourceKey(s) !== M.sourceKey(options.source)).map(s => `<label><input type="checkbox" name="sources" value="${esc(M.sourceKey(s))}"${prefs.sources.some(p => M.sourceKey(p) === M.sourceKey(s)) ? ' checked' : ''}><span>${esc(s.label)}</span></label>`).join('') || '<p class="tl-help">No other timelines available.</p>'}</div></fieldset><p class="tl-help">Uses the original events and that source’s filters. Sources must use the same calendar to share a time axis.</p></div></details>
      <p class="tl-error" role="alert"></p><footer><span></span><button type="submit" class="tl-primary">Done</button></footer></form>`);
    const form = el.querySelector('form');
    form.elements.style.value = prefs.style;
    const zoomOption = document.createElement('option'); zoomOption.value = prefs.zoom; zoomOption.textContent = `${Math.round(prefs.zoom * 100)}%`;
    if (!Array.from(form.elements.zoom.options).some(o => Number(o.value) === prefs.zoom)) form.elements.zoom.add(zoomOption);
    form.elements.zoom.value = prefs.zoom;
    form.elements.theme.value = prefs.theme; form.elements.spacing.value = prefs.spacing; form.elements.kind.value = cal.kind;
    if (options.calendarDraft) {
      for (const role of ['date','end']) {
        const property = db.properties.find(p => p.id === fields[role]);
        if (property && property.type !== 'text') form.elements[role].value = '__new';
      }
    }
    function conditional() {
      form.querySelector('[data-spacing]').hidden = form.elements.style.value === 'spans';
      form.querySelector('[data-fiction]').hidden = form.elements.kind.value === 'earth';
      form.querySelector('[data-custom]').hidden = form.elements.kind.value !== 'custom';
    }
    form.elements.style.onchange = conditional;
    form.elements.kind.onchange = () => {
      if (form.elements.kind.value !== 'earth' && cal.kind === 'earth') form.elements.yearZero.checked = true;
      if (['Gregorian calendar','Fictional chronology','Custom calendar'].includes(form.elements.calendarName.value)) form.elements.calendarName.value = M.calendar({kind:form.elements.kind.value}).name;
      conditional();
    }; conditional();
    form.onsubmit = e => {
      e.preventDefault();
      try {
        const values = name => form.elements[name].value;
        const parseLines = (text, field) => text.split('\n').map(s => s.trim()).filter(Boolean).map(line => {
          const parts = line.split('|').map(s => s.trim());
          if (!(parts.length === 2 || field === 'era' && parts.length === 3) || !parts[0] || !/^-?\d+$/.test(parts[1])) throw new Error(field === 'era' ? 'Use “abbreviation | starting year | full name”, with the full name optional.' : 'Use “name | number” for each month.');
          if (field === 'era' && (parts[0].length > 50 || (parts[2] || '').length > 120)) throw new Error('Use up to 50 characters for an era abbreviation and 120 for its full name.');
          return { name: parts[0], [field === 'month' ? 'days' : 'offset']: Number(parts[1]), ...(field === 'era' && parts[2] ? { fullName: parts[2] } : {}) };
        });
        const kind = values('kind');
        const months = kind === 'custom' ? parseLines(values('months'), 'month') : kind === 'fiction' ? M.calendar({kind:'fiction'}).months : cal.months;
        const eras = kind === 'earth' ? [] : parseLines(values('eras'), 'era');
        if (kind === 'custom' && (!months.length || months.length > 60 || months.some(m => m.days < 1 || m.days > 1000))) throw new Error('Use 1–60 months, with 1–1000 days each.');
        if (new Set(eras.map(era => era.name.toLowerCase())).size !== eras.length) throw new Error('Each era needs a different name.');
        const aliases = new Map();
        eras.forEach((era, index) => [era.name, era.fullName].filter(Boolean).forEach(alias => {
          const key = alias.toLowerCase();
          if (aliases.has(key) && aliases.get(key) !== index) throw new Error('Each era needs an abbreviation and full name that do not match another era.');
          aliases.set(key, index);
        }));
        const nextFields = {}, additions = [];
        for (const role of ['date','end','description','image','lane']) {
          const id = values(role);
          nextFields[role] = id === '__new' ? `timeline_${role}_${Date.now()}` : id;
          if (id === '__new') additions.push({ id: nextFields[role], name: {date:'When',end:'Until',description:'Details',image:'Image',lane:'Track'}[role], type:'text' });
        }
        if (nextFields.date && nextFields.date === nextFields.end) throw new Error('Choose different start and end fields, or leave End field as None for a Date field with a range.');
        const nextCalendar = M.calendar({kind, name: kind === 'earth' ? '' : values('calendarName'), months, eras, hours: values('hours'), yearZero: form.elements.yearZero.checked});
        if (kind !== 'earth' && ['date','end'].some(role => db.properties.find(p => p.id === nextFields[role])?.type === 'date')) throw new Error('Choose a text field (or create one) for fictional or custom dates. Your existing real dates will stay intact.');
        if (additions.length) DB.addFields(options.source, additions);
        store('sources', M.sourceKey(options.source), { ...config, calendar: nextCalendar, mapping: nextFields });
        const picked = new Set(Array.from(form.querySelectorAll('input[name="sources"]:checked')).map(o => o.value));
        store('views', options.viewKey, { ...prefs, style: values('style'), zoom: Number(values('zoom')), theme: values('theme'), spacing: values('spacing'), images: form.elements.images.checked,
          descriptions: form.elements.descriptions.checked, sources: DB.sources().filter(s => picked.has(M.sourceKey(s))) });
        el.close(); refresh(); options.onSave?.();
      } catch (error) { formError(form, error); }
    };
    el.showModal();
    if (options.datesOpen) { form.querySelector('[data-calendar-details]').scrollIntoView({ block: 'start' }); form.elements.kind.focus(); }
  }
  function mount(host, options) {
    for (const previous of mounted.keys()) if (!previous.isConnected) mounted.delete(previous);
    mounted.set(host, options);
    const config = sourceConfig(options.source), cal = M.calendar(config.calendar), prefs = viewConfig(options.viewKey);
    let items = M.events(options.database, options.source, config, options.rows), omitted = [];
    for (const source of prefs.sources) {
      if (M.sourceKey(source) === M.sourceKey(options.source)) continue;
      const db = DB.get(source), sourceSettings = sourceConfig(source);
      if (!db) { omitted.push(`${source.label || 'A source'} is unavailable`); continue; }
      const axisCalendar = calendar => ({ ...calendar, eras: calendar.eras.map(({ fullName, ...era }) => era) });
      if (JSON.stringify(axisCalendar(M.calendar(sourceSettings.calendar))) !== JSON.stringify(axisCalendar(cal))) { omitted.push(`${source.label || db.title} uses a different calendar`); continue; }
      items.push(...M.events(db, source, sourceSettings, DB.visibleRows(db)).map(item => ({ ...item, lane: item.lane || db.title })));
    }
    items = [...new Map(items.map(item => [item.id, item])).values()];
    const compact = !options.fullPage;
    const actionsHost = compact ? options.actionsHost : null;
    actionsHost?.querySelector('.tl-inline-actions')?.remove();
    const actionsHTML = `<button type="button" class="${actionsHost ? 'page-database-toolbar-btn' : ''}" data-action="settings" aria-label="Timeline view settings">${window.getUIIcon?.('settings-2') || '⚙'}<span>View</span></button>${!options.readOnly ? `<button type="button" class="${actionsHost ? 'page-database-toolbar-new-btn' : 'tl-primary'}" data-action="add">+ Event</button>` : ''}`;
    let externalActions = null;
    if (actionsHost) {
      externalActions = document.createElement('div');
      externalActions.className = 'tl-actions tl-inline-actions';
      externalActions.innerHTML = actionsHTML;
      actionsHost.append(externalActions);
    }
    const box = M.layout(items, prefs, host.clientWidth || host.parentElement?.clientWidth || 1000, { compact });
    const spans = prefs.style === 'spans', scaled = box.scaled;
    const showImages = prefs.images && items.some(item => item.image);
    const rowHeight = compact ? showImages ? 170 : prefs.descriptions ? 98 : 72 : showImages ? 236 : prefs.descriptions ? 155 : 110;
    const rowTop = compact ? 58 : 92, rowGap = compact ? 16 : 24, bottomPadding = compact ? 16 : 32;
    const height = scaled ? rowTop + 4 + box.rows * rowHeight : compact ? showImages ? 240 : 170 : showImages ? 510 : 310;
    const entry = item => {
      const top = scaled ? rowTop + item.row * rowHeight : 0;
      const image = prefs.images && item.image ? `<img src="${esc(item.image)}" alt="" loading="lazy">` : '';
      const date = `<span class="tl-date">${esc(item.dateLabel)}</span>`;
      const descriptionHeight = prefs.descriptionHeights[item.id];
      return `<article class="tl-event ${spans ? 'tl-span-event' : 'tl-illustration'}" data-row="${item.row}" style="left:${item.x}px;top:${top}px;--tl-event-color:${item.color || 'var(--tl-accent)'};--tl-span:${Math.max(0, item.endX - item.x)}px">
        ${spans ? `<div class="tl-span-rule"><i></i>${item.endX > item.x ? '<i></i>' : ''}</div>` : '<div class="tl-stem"></div><i class="tl-point"></i>'}
        <button class="tl-event-open" data-event="${esc(item.id)}" aria-label="${esc(`${item.title}, ${item.dateLabel}`)}">
        ${!spans ? image : ''}${date}<span class="tl-event-title">${esc(item.title)}</span>${item.lane ? `<span class="tl-track">${esc(item.lane)}</span>` : ''}
        ${prefs.descriptions && item.description ? `<span class="tl-description${descriptionHeight ? ' tl-description-sized' : ''}"${descriptionHeight ? ` style="height:${descriptionHeight}px"` : ''}>${esc(item.description)}</span>` : ''}${spans ? image : ''}</button>
        ${prefs.descriptions && item.description ? `<button type="button" class="tl-description-resize" aria-label="Resize description for ${esc(item.title)}" title="Drag up or down to resize. Arrow keys resize; double-click to reset."><span></span></button>` : ''}
      </article>`;
    };
    const range = box.events.length ? `${box.events[0].start.label} — ${box.events.reduce((last, e) => e.end.ordinal > last.ordinal ? e.end : last, box.events[0].end).label}` : "No dates yet";
    host.innerHTML = `<section class="sanctum-timeline tl-theme-${prefs.theme}${compact ? ' tl-inline' : ' tl-full-page'}" aria-label="Timeline">
      <div class="tl-tools"><div class="tl-heading"><p class="tl-range">${esc(range)}</p><span class="tl-count">${items.length} ${items.length === 1 ? 'event' : 'events'}</span></div>${actionsHost ? '' : `<div class="tl-actions">${actionsHTML}</div>`}</div>
      ${cal.eras.some(era => era.fullName) ? `<p class="tl-era-legend">${cal.eras.filter(era => era.fullName).map(era => `${esc(era.name)} = ${esc(era.fullName)}`).join(' · ')}</p>` : ''}
      ${omitted.length ? `<p class="tl-notice">${esc(omitted.join(' · '))}. Kept off this axis.</p>` : ''}
      ${box.events.length ? `<div class="tl-scroll" tabindex="0" aria-label="Timeline canvas; scroll horizontally to explore"><div class="tl-stage ${scaled ? 'tl-scaled' : 'tl-readable'} ${spans ? 'tl-spans' : ''}" style="width:${box.width}px;height:${height}px">
        <div class="tl-axis" style="top:${compact ? scaled ? 26 : showImages ? 114 : 32 : scaled ? 42 : showImages ? 292 : 90}px"></div>
        ${scaled ? box.events.map((item,i) => i && item.x - box.events[i-1].x < 95 ? '' : `<div class="tl-tick" style="left:${item.x}px;height:${height - 28}px"><span>${esc(item.start.label)}</span></div>`).join('') : ''}
        ${box.events.map(entry).join('')}</div></div>` : `<div class="tl-empty"><div class="tl-empty-line"><i></i><i></i><i></i></div><h3>${items.length ? 'Every story finds its time.' : 'Give your moments a place.'}</h3><p>${items.length ? 'Add dates to the events below to place them on the line.' : 'A personal history, a world unfolding, a plan taking shape. Begin with one event.'}</p>${!options.readOnly && !actionsHost ? '<button data-action="add">Add your first event ↗</button>' : ''}</div>`}
      ${box.undated.length ? `<details class="tl-undated"><summary>Not placed yet <span>${box.undated.length}</span></summary><div>${box.undated.map(item => `<button data-event="${esc(item.id)}"><span>${esc(item.title)}</span><small>${esc(item.error || 'No date yet')}</small></button>`).join('')}</div></details>` : ''}

    </section>`;
    host.querySelector('.sanctum-timeline').classList.toggle('tl-no-images', !showImages);
    const stage = host.querySelector('.tl-stage');
    const cards = [...host.querySelectorAll('.tl-event')];
    const fitStage = () => {
      if (!stage) return;
      let bottom = height;
      if (scaled) {
        let top = rowTop;
        for (let row = 0; row < box.rows; row++) {
          const members = cards.filter(card => Number(card.dataset.row) === row);
          for (const card of members) card.style.top = `${top}px`;
          top += Math.max(rowHeight, ...members.map(card => card.offsetHeight + rowGap));
        }
        bottom = Math.max(bottom, top + 4);
      } else for (const card of cards) bottom = Math.max(bottom, card.offsetTop + card.offsetHeight + bottomPadding);
      stage.style.height = `${bottom}px`;
      stage.querySelectorAll('.tl-tick').forEach(tick => { tick.style.height = `${bottom - 28}px`; });
      options.onResize?.();
    };
    host.querySelectorAll('.tl-description-resize').forEach(handle => {
      const card = handle.closest('.tl-event'), description = card.querySelector('.tl-description');
      const id = card.querySelector('[data-event]').dataset.event;
      let drag = null;
      const setHeight = value => {
        description.classList.add('tl-description-sized');
        description.style.height = `${Math.round(Math.max(18, Math.min(10000, value)))}px`;
        fitStage();
      };
      const save = () => {
        try {
          const current = viewConfig(options.viewKey), heights = { ...current.descriptionHeights };
          if (description.classList.contains('tl-description-sized')) heights[id] = Math.round(description.getBoundingClientRect().height);
          else delete heights[id];
          store('views', options.viewKey, { ...current, descriptionHeights: heights });
          handle.title = 'Drag up or down to resize. Arrow keys resize; double-click to reset.';
        } catch (error) { handle.title = error.message; window.alert(error.message); }
      };
      handle.onpointerdown = e => {
        if (e.button !== 0) return;
        e.preventDefault();
        drag = { pointer: e.pointerId, y: e.clientY, height: description.getBoundingClientRect().height,
          style: description.style.height, sized: description.classList.contains('tl-description-sized') };
        handle.setPointerCapture(e.pointerId);
        handle.classList.add('tl-resizing');
      };
      handle.onpointermove = e => { if (drag && drag.pointer === e.pointerId) setHeight(drag.height + e.clientY - drag.y); };
      const finish = e => {
        if (!drag || drag.pointer !== e.pointerId) return;
        const before = drag; drag = null;
        handle.classList.remove('tl-resizing');
        if (e.type === 'pointerup') save();
        else { description.style.height = before.style; description.classList.toggle('tl-description-sized', before.sized); fitStage(); }
        if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
      };
      handle.onpointerup = finish; handle.onpointercancel = finish; handle.onlostpointercapture = finish;
      handle.ondblclick = e => {
        e.preventDefault(); description.style.height = ''; description.classList.remove('tl-description-sized'); fitStage(); save();
      };
      handle.onkeydown = e => {
        const size = description.getBoundingClientRect().height;
        const next = { ArrowDown: size + 18, ArrowUp: size - 18, Home: 18, End: description.scrollHeight }[e.key];
        if (next === undefined) return;
        e.preventDefault(); e.stopPropagation(); setHeight(next); save();
      };
    });
    fitStage();
    host.querySelectorAll('[data-event]').forEach(button => { button.onclick = () => editEvent(options, items.find(item => item.id === button.dataset.event)); });

    [...host.querySelectorAll('[data-action]'), ...(externalActions?.querySelectorAll('[data-action]') || [])].forEach(button => { button.onclick = () => {
      const action = button.dataset.action;
      if (action === 'add') return editEvent(options);
      if (action === 'settings') return settings(options);

    }; });
    const viewport = host.querySelector('.tl-scroll'), position = positions.get(options.viewKey);
    if (viewport && position) { viewport.scrollLeft = position.left; viewport.scrollTop = position.top; }
    viewport?.addEventListener('scroll', () => positions.set(options.viewKey, { left: viewport.scrollLeft, top: viewport.scrollTop }), { passive: true });
    viewport?.addEventListener('wheel', e => {
      // A full timeline page keeps ordinary vertical wheel scrolling on the page.
      if (options.fullPage) return;
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.ctrlKey || e.metaKey) return;
      const scroll = e.currentTarget;
      if (scroll.scrollHeight > scroll.clientHeight + 1) return;
      if (scroll.scrollWidth > scroll.clientWidth && ((e.deltaY > 0 && scroll.scrollLeft + scroll.clientWidth < scroll.scrollWidth - 1) || (e.deltaY < 0 && scroll.scrollLeft > 0))) { scroll.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
  }
  let refreshQueued = false;
  window.addEventListener('sanctum:database-updated', () => {
    if (refreshQueued) return;
    refreshQueued = true;
    window.requestAnimationFrame(() => { refreshQueued = false; refresh(); });
  });
  window.SanctumTimelineUI = { mount, settings, editEvent };
})();
