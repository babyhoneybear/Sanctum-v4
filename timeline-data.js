(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SanctumTimelineData = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const clamp = (n, a, b, fallback) => Number.isFinite(Number(n)) ? Math.max(a, Math.min(b, Number(n))) : fallback;
  function calendar(raw = {}) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const kind = ['earth', 'fiction', 'custom'].includes(raw.kind) ? raw.kind : 'earth';
    const months = kind === 'earth' ? MONTHS.map((name, i) => ({ name, days: [31,28,31,30,31,30,31,31,30,31,30,31][i] }))
      : Array.isArray(raw.months) && raw.months.length ? raw.months.slice(0, 60).map((m, i) => ({ name: String(m.name || `Month ${i + 1}`).slice(0, 40), days: Math.floor(clamp(m.days, 1, 1000, 30)) }))
        : MONTHS.map(name => ({ name, days: 30 }));
    return { kind, name: String(raw.name || (kind === 'earth' ? 'Gregorian calendar' : kind === 'fiction' ? 'Fictional chronology' : 'Custom calendar')).slice(0, 80),
      months, hours: kind === 'earth' ? 24 : Math.floor(clamp(raw.hours, 1, 100, 24)),
      yearZero: kind === 'earth' ? false : raw.yearZero !== false,
      eras: kind === 'earth' ? [] : (Array.isArray(raw.eras) ? raw.eras : []).slice(0, 50).map(e => ({ name: String(e.name || '').trim().slice(0, 50), offset: Math.floor(clamp(e.offset, -999999, 999999, 0)),
        ...(String(e.fullName || '').trim() ? { fullName: String(e.fullName).trim().slice(0, 120) } : {}) })).filter(e => e.name) };
  }
  const leap = y => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  // Propose a setup for unfamiliar era dates; applying it is an explicit form action.
  function calendarSuggestion(values, rawCalendar = {}) {
    const cal = calendar(rawCalendar), eras = [...cal.eras];
    let changed = false, yearZero = cal.yearZero;
    for (const value of values) {
      if (parseDate(value, cal).valid) continue;
      const match = String(value ?? '').trim().match(/^(?:~|c\.?\s+|circa\s+)?(-?\d{1,6})(?:-\d{1,2}(?:-\d{1,4})?)?(?:[T ]\d{1,3}:\d{2})?\s+(.+)$/i);
      if (!match || /^(BCE?|CE|AD)$/i.test(match[2])) continue;
      const name = match[2].trim();
      if (name.length > 50 || name.includes('|') || eras.length >= 50) continue;
      if (!eras.some(era => [era.name, era.fullName].some(alias => alias?.toLowerCase() === name.toLowerCase()))) { eras.push({ name, offset: 0 }); changed = true; }
      if (Number(match[1]) === 0 && !yearZero) { yearZero = true; changed = true; }
    }
    if (!changed) return null;
    const suggested = calendar({ ...cal, kind: cal.kind === 'earth' ? 'fiction' : cal.kind,
      name: cal.kind === 'earth' ? 'Fictional chronology' : cal.name, eras,
      months: cal.kind === 'earth' ? calendar({kind:'fiction'}).months : cal.months,
      yearZero: cal.kind === 'earth' ? true : yearZero });
    return values.filter(value => String(value ?? '').trim()).every(value => parseDate(value, suggested).valid) ? suggested : null;
  }
  function daysBeforeYear(y) { const n = y - 1; return 365 * n + Math.floor(n / 4) - Math.floor(n / 100) + Math.floor(n / 400); }
  function parseDate(value, rawCalendar = {}) {
    const cal = calendar(rawCalendar), text = String(value ?? '').trim();
    if (!text) return { valid: false, empty: true, label: '', error: '' };
    const match = text.match(/^(~|c\.?\s+|circa\s+)?(-?\d{1,6})(?:-(\d{1,2})(?:-(\d{1,4}))?)?(?:[T ](\d{1,3}):(\d{2}))?(?:\s+(.+))?$/i);
    const invalid = message => ({ valid: false, empty: false, label: text, error: message });
    if (!match) return invalid('Use a year, YYYY-MM-DD, or a year followed by an era name.');
    let year = Number(match[2]);
    const month = Number(match[3] || 1), day = Number(match[4] || 1), hour = Number(match[5] || 0), minute = Number(match[6] || 0);
    const suffix = (match[7] || '').trim();
    if (cal.kind === 'earth') {
      if (suffix && !/^(BCE?|CE|AD)$/i.test(suffix)) return invalid('Use BCE or CE for historical dates.');
      if (year === 0) return invalid('The Gregorian calendar has no year zero.');
      if (/^BC/i.test(suffix)) { if (year < 1) return invalid('Use a positive year before BCE.'); year = -year; }
      if (year < 0) year += 1; // astronomical year 0 is 1 BCE
    } else {
      if (!cal.yearZero && year === 0) return invalid('This calendar has no year zero.');
      if (suffix) {
        const era = cal.eras.find(e => [e.name, e.fullName].some(alias => alias?.toLowerCase() === suffix.toLowerCase()));
        if (!era) return invalid('This era is not defined in Calendar settings.');
        year += era.offset;
      }
      if (!cal.yearZero && year < 0) year += 1;
    }
    if (month < 1 || month > cal.months.length) return invalid('That month is outside this calendar.');
    const days = cal.months[month - 1].days + (cal.kind === 'earth' && month === 2 && leap(year) ? 1 : 0);
    if (day < 1 || day > days) return invalid('That day is outside this month.');
    if (hour >= cal.hours || minute > 59) return invalid('That time is outside this calendar’s day.');
    const yearDays = cal.months.reduce((sum, m) => sum + m.days, 0);
    const ordinal = (cal.kind === 'earth' ? daysBeforeYear(year) : year * yearDays)
      + cal.months.slice(0, month - 1).reduce((sum, m) => sum + m.days, 0)
      + (cal.kind === 'earth' && month > 2 && leap(year) ? 1 : 0) + day - 1 + (hour + minute / 60) / cal.hours;
    let label = text;
    if (cal.kind === 'earth' && !suffix && !match[1]) {
      const displayedYear = Number(match[2]);
      const yearLabel = displayedYear < 0 ? `${-displayedYear} BCE` : String(displayedYear);
      label = match[4] ? `${day} ${cal.months[month - 1].name.slice(0, 3)} ${yearLabel}` : match[3] ? `${cal.months[month - 1].name} ${yearLabel}` : yearLabel;
      if (match[5]) label += ` · ${match[5].padStart(2, '0')}:${match[6]}`;
    }
    return { valid: true, ordinal, year, month, day, label, text, approximate: !!match[1], precision: match[5] ? 'minute' : match[4] ? 'day' : match[3] ? 'month' : 'year' };
  }
  function dateParts(raw) {
    let value = raw;
    if (typeof raw === 'string' && raw.trim().startsWith('{')) { try { value = JSON.parse(raw); } catch { /* report invalid text */ } }
    if (value && typeof value === 'object') return { start: String(value.start || '') + (value.includeTime && value.startTime ? ` ${value.startTime}` : ''), end: String(value.end || '') + (value.end && value.includeTime && value.endTime ? ` ${value.endTime}` : '') };
    return { start: String(raw ?? ''), end: '' };
  }
  function dateValuePatch(original, start, end) {
    let previous = original;
    if (typeof original === 'string') { try { previous = JSON.parse(original); } catch { previous = {}; } }
    if (!previous || typeof previous !== 'object' || Array.isArray(previous)) previous = {};
    const [startDay, startTime = ''] = String(start || '').split(/[ T]/);
    const [endDay, endTime = ''] = String(end || '').split(/[ T]/);
    return { ...previous, start: startDay, end: endDay, startTime, endTime, includeTime: !!(startTime || endTime) };
  }
  function mapping(database, raw = {}) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const props = database.properties || [];
    const find = (types, words) => props.find(p => types.includes(p.type) && (!words || words.test(p.name)))?.id || '';
    const defaults = { date: find(['date']) || find(['text','number'], /date|when|year/i), end: find(['date','text','number'], /end|until/i),
      description: find(['text','notes'], /detail|note|description|summary/i), image: find(['text','url','files'], /image|photo|picture/i), lane: find(['text','select','status','tag'], /track|lane|category|group/i) };
    const result = Object.fromEntries(Object.keys(defaults).map(k => [k, Object.hasOwn(raw, k) ? (props.some(p => p.id === raw[k]) ? raw[k] : '') : defaults[k]]));
    if (result.end === result.date) result.end = '';
    return result;
  }
  function view(raw = {}) {
    raw = raw && typeof raw === 'object' ? raw : {};
    return { style: raw.style === 'spans' ? 'spans' : 'illustrated', spacing: raw.spacing === 'time' ? 'time' : 'readable',
      zoom: clamp(raw.zoom, 0.5, 4, 1), images: raw.images !== false, descriptions: raw.descriptions !== false,
      theme: ['inherit','paper','ink'].includes(raw.theme) ? raw.theme : 'inherit',
      sources: Array.isArray(raw.sources) ? raw.sources.filter(s => s?.pageId).slice(0, 30) : [],
      descriptionHeights: Object.fromEntries(Object.entries(raw.descriptionHeights || {}).filter(([,height]) => Number.isFinite(height) && height >= 18).map(([id,height]) => [id, Math.min(10000, Math.round(height))])) };
  }
  function sourceKey(source) { return source.kind === 'block' ? `block:${source.pageId}:${source.blockId}` : `page:${source.pageId}`; }
  function safeImage(value) {
    const src = String(value || '').trim();
    return /^(https?:\/\/|data:image\/(png|jpeg|webp|gif);base64,|\/[^/]|\.\/|assets\/)/i.test(src) ? src : '';
  }
  function events(database, source, config = {}, rows = database.rows || []) {
    const cal = calendar(config.calendar), fields = mapping(database, config.mapping);
    const titleId = database.properties?.find(p => p.type === 'title')?.id || 'name';
    return rows.filter(row => !row.archived).map((row, index) => {
      const values = row.values || {}, parts = dateParts(values[fields.date]);
      const start = parseDate(parts.start, cal), endText = fields.end && fields.end !== fields.date ? dateParts(values[fields.end]).start : parts.end;
      const end = endText ? parseDate(endText, cal) : start;
      const error = !start.valid ? start.error : !end.valid ? end.error : end.ordinal < start.ordinal ? 'End comes before start.' : '';
      return { id: `${sourceKey(source)}:${row.id}`, rowId: row.id, pageId: row.pageId || '', source, index,
        title: String(values[titleId] || row.title || 'Untitled event'), description: String(values[fields.description] || ''),
        image: safeImage(values[fields.image]), lane: String(values[fields.lane] || ''), color: /^#[0-9a-f]{6}$/i.test(row.color || '') ? row.color : '',
        start, end, startText: parts.start, endText, dated: start.valid && end.valid && !error, error,
        dateLabel: [start.label, endText ? end.label : ''].filter(Boolean).join(' — ') };
    });
  }
  function layout(items, rawView = {}, width = 1000, { compact = false } = {}) {
    const settings = view(rawView), dated = items.filter(e => e.dated).sort((a,b) => a.start.ordinal - b.start.ordinal || a.index - b.index);
    const undated = items.filter(e => !e.dated);
    const scaled = settings.style === 'spans';
    const proportional = scaled || settings.spacing === 'time';
    const min = dated.length ? Math.min(...dated.map(e => e.start.ordinal)) : 0;
    const max = dated.length ? Math.max(...dated.map(e => e.end.ordinal)) : min + 1;
    const padding = compact ? 22 : 52, cardWidth = compact ? 152 : 190;
    const base = Math.max(compact ? 280 : 650, width - 20);
    const gap = Math.max(compact ? 168 : 210, (compact ? 176 : 224) * settings.zoom);
    let extent = proportional ? Math.max(base, Math.min(14000, dated.length * (compact ? 120 : 150)) * settings.zoom)
      : Math.max(base, dated.length * gap + padding * 2);
    const x = n => padding + (n - min) / Math.max(1, max - min) * (extent - padding * 2 - (compact ? 144 : 180));
    const occupied = [];
    let previousX = padding - gap;
    const positioned = dated.map((event, i) => {
      const left = scaled ? x(event.start.ordinal) : settings.spacing === 'time'
        ? Math.max(x(event.start.ordinal), previousX + gap) : padding + i * gap;
      previousX = left;
      const right = scaled ? x(event.end.ordinal) : left;
      let row = 0;
      if (scaled) {
        // Tracks describe events; only actual collisions need another row.
        row = occupied.findIndex(r => r.end < left - (compact ? 16 : 24));
        if (row < 0) { row = occupied.length; occupied.push({end: 0}); }
        occupied[row].end = Math.max(right, left + (compact ? 148 : 185));
      }
      return { ...event, x: left, endX: right, row };
    });
    if (!scaled && positioned.length) extent = Math.max(extent, previousX + cardWidth + padding);
    return { events: positioned, undated, width: extent, rows: Math.max(1, occupied.length), min, max, scaled };
  }
  function captureSettings(store, pageId) {
    const belongs = key => key === `page:${pageId}` || key.startsWith(`block:${pageId}:`);
    return Object.fromEntries(['sources','views'].map(section => [section, Object.fromEntries(Object.entries(store?.[section] || {}).filter(([key]) => belongs(key)).map(([key,value]) => [key, JSON.parse(JSON.stringify(value))]))]));
  }
  function pasteSettings(store, snapshot, sourcePageId, destinationPageId, blockIds = {}) {
    const result = JSON.parse(JSON.stringify(store || {}));
    for (const section of ['sources','views']) {
      result[section] ||= {};
      Object.keys(captureSettings(result,destinationPageId)[section]).forEach(key => delete result[section][key]);
      for (const [key, original] of Object.entries(snapshot?.[section] || {})) {
        let destinationKey;
        if (key === `page:${sourcePageId}`) destinationKey = `page:${destinationPageId}`;
        else if (key.startsWith(`block:${sourcePageId}:`)) {
          const blockId = key.slice(`block:${sourcePageId}:`.length);
          destinationKey = `block:${destinationPageId}:${blockIds[blockId] || blockId}`;
        } else continue;
        const value = JSON.parse(JSON.stringify(original));
        if (Array.isArray(value.sources)) value.sources = value.sources.map(source => source.pageId === sourcePageId
          ? { ...source, pageId: destinationPageId, blockId: blockIds[source.blockId] || source.blockId || '' } : source);
        if (value.descriptionHeights) value.descriptionHeights = Object.fromEntries(Object.entries(value.descriptionHeights).map(([id,height]) => {
          if (id.startsWith(`page:${sourcePageId}:`)) id = `page:${destinationPageId}:${id.slice(`page:${sourcePageId}:`.length)}`;
          else if (id.startsWith(`block:${sourcePageId}:`)) {
            const [blockId, ...rowId] = id.slice(`block:${sourcePageId}:`.length).split(':');
            id = `block:${destinationPageId}:${blockIds[blockId] || blockId}:${rowId.join(':')}`;
          }
          return [id,height];
        }));
        result[section][destinationKey] = value;
      }
    }
    return result;
  }
  return { calendar, calendarSuggestion, parseDate, dateParts, dateValuePatch, mapping, view, sourceKey, safeImage, events, layout, captureSettings, pasteSettings };
});
