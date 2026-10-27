(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SanctumContextPreview = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const array = value => Array.isArray(value) ? value : [];
  const object = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  function plain(value) {
    const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
    return String(value ?? "")
      .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
      .replace(/<\/?(?:br|p|div|li|h[1-6]|tr)\b[^>]*>/gi, " ")
      .replace(/<[^>]*>/g, "")
      .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, code) => {
        if (code[0] !== "#") return entities[code.toLowerCase()] || match;
        const number = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
        return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : "";
      }).replace(/\s+/g, " ").trim();
  }
  function clip(value, limit) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    return text.length > limit ? text.slice(0, limit - 1).trimEnd() + "…" : text;
  }
  function parsedArray(value) {
    if (Array.isArray(value)) return value;
    try { return array(JSON.parse(value)); } catch { return []; }
  }
  function scalar(value) {
    if (value === true) return "Yes";
    if (value === false) return "No";
    if (Array.isArray(value)) return value.map(scalar).filter(Boolean).join(", ");
    if (value && typeof value === "object") return String(value.label || value.name || value.start || "");
    return value === null || value === undefined ? "" : String(value);
  }
  function findBlock(blocks, id, depth = 0) {
    if (depth > 8) return null;
    for (const block of array(blocks)) {
      if (block.id === id) return block;
      const nested = findBlock(block.containerItems, id, depth + 1);
      if (nested) return nested;
    }
    return null;
  }
  function database(snapshot, kind, pageId, blockId) {
    if (kind !== 'block') return object(object(snapshot.databases)[pageId]);
    const block = findBlock(object(snapshot.blocks)[pageId], blockId);
    return { rows: parsedArray(block?.dbRows), properties: parsedArray(block?.dbProperties), title: block?.calendarTitle };
  }
  function databaseValue(snapshot, property, value) {
    if (property.type === 'date') {
      let date = value;
      if (typeof value === 'string' && value.startsWith('{')) { try { date = JSON.parse(value); } catch { return ''; } }
      return date && typeof date === 'object' ? [date.start, date.end].filter(Boolean).join(' – ') : scalar(date);
    }
    if (property.type === 'relation') {
      const target = property.relationTarget || {};
      const db = database(snapshot, target.kind, target.pageId, target.blockId);
      const titleField = array(db.properties).find(field => field.type === 'title');
      const ids = Array.isArray(value) ? value : String(value || '').startsWith('[') ? parsedArray(value) : String(value || '').split(',');
      return ids.map(id => {
        const rowId = typeof id === 'string' ? id.trim() : id?.rowId || id?.id;
        const row = array(db.rows).find(row => row.id === rowId && !row.archived);
        return row ? row.values?.[titleField?.id] || row.title || 'Untitled entry' : '';
      }).filter(Boolean).join(', ');
    }
    return scalar(value);
  }
  function build(snapshot, pageId) {
    const pages = new Map([...array(snapshot.domains), ...array(snapshot.pages)].map(page => [page.id, page]));
    const page = pages.get(pageId);
    if (!page) return { pageId, missing: true, title: "Page unavailable", message: "This linked page was deleted or is no longer in this vault.", fields: [], excerpt: "", path: "" };
    const path = [], seen = new Set([pageId]);
    let parentId = page.parent;
    while (parentId && parentId !== "home" && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = pages.get(parentId);
      if (!parent) break;
      path.unshift(String(parent.title || "Untitled")); parentId = parent.parent;
    }
    const type = array(snapshot.customTypes).find(type => type.id === page.category);
    const typeName = type?.name || (page.category?.startsWith("custom-type-") ? "Custom type" : page.category !== "none" && page.category)
      || (array(snapshot.domains).some(domain => domain.id === pageId) ? "Domain" : "Page");
    const doc = object(object(snapshot.documents)[pageId]);
    const fields = [];
    const addField = (label, value) => {
      const text = scalar(value).trim();
      if (text) fields.push({ label: clip(label || "Field", 80), value: clip(text, 180) });
    };
    for (const property of array(object(snapshot.pageProps)[pageId]?.properties)) {
      if (property.type === "relation") {
        const titles = array(property.linkedPageIds).map(id => {
          const linked = pages.get(id);
          if (!linked) return "";
          const level = pages.get(property.linkLevels?.[id]);
          return [linked.title, level?.title, property.linkDetails?.[id]].filter(Boolean).join(" · ");
        });
        addField(property.label, titles.filter(Boolean));
      } else addField(property.label, property.value);
    }
    const profileLabels = new Map([...array(snapshot.profileSchema), ...array(doc.profileCustomFields)].map(field => [field.key, field.label]));
    Object.entries(object(doc.profileFields)).forEach(([key, value]) => addField(profileLabels.get(key) || key, value));

    let title = String(page.title || "Untitled"), displayType = typeName;
    if (page.databaseRowRef) {
      const ref = page.databaseRowRef;
      const db = database(snapshot, ref.sourceKind, ref.sourcePageId, ref.sourceBlockId);
      const row = ref.rowId && array(db.rows).find(row => row.id === ref.rowId && !row.archived);
      displayType = db.title ? `${db.title} row` : "Database row";
      if (!row) return { pageId, missing: true, title, type: displayType, path: path.join(' / ') || 'Home', fields: [], excerpt: '', message: 'This database row is no longer available.' };
      if (row) {
        const titleField = array(db.properties).find(property => property.type === "title");
        title = String(row.values?.[titleField?.id] || row.title || title);
        array(db.properties).filter(property => property.type !== "title").forEach(property => addField(property.name, databaseValue(snapshot, property, row.values?.[property.id])));
      }
    }

    let excerpt = "", excerptLabel = "";
    function useExcerpt(label, value) {
      if (!excerpt && plain(value)) { excerpt = plain(value); excerptLabel = plain(label); }
    }
    array(doc.sections).forEach(section => useExcerpt(section.title, section.content));
    useExcerpt("Notes", doc.profileNotes);
    function blockText(blocks, depth = 0) {
      if (depth > 8 || excerpt) return;
      for (const block of array(blocks)) {
        useExcerpt(block.containerTitle || block.titleHTML || "From this page", block.containerBody || block.bodyHTML || block.tableHTML);
        blockText(block.containerItems, depth + 1);
        if (excerpt) break;
      }
    }
    blockText(object(snapshot.blocks)[pageId]);
    array(object(snapshot.journals)[pageId]?.pages).forEach(sheet => {
      array(sheet.elements).filter(element => element.type === "text").forEach(element => useExcerpt(sheet.title || "Journal", element.text));
    });
    return { pageId, missing: false, title: clip(title, 180), type: clip(displayType, 80), path: path.join(" / ") || "Home",
      summary: clip(page.summary || page.description || "", 260), fields: fields.slice(0, 6), moreFields: Math.max(0, fields.length - 6),
      excerpt: clip(excerpt, 420), excerptLabel: clip(excerptLabel, 80) };
  }
  function placement(anchor, size, viewport) {
    const margin = 12, gap = 10;
    const width = Math.min(size.width, Math.max(0, viewport.width - margin * 2));
    const height = Math.min(size.height, Math.max(0, viewport.height - margin * 2));
    const below = anchor.bottom + gap;
    const top = below + height <= viewport.height - margin ? below : anchor.top - gap - height;
    return { left: Math.max(margin, Math.min(anchor.left, viewport.width - margin - width)),
      top: Math.max(margin, Math.min(top, viewport.height - margin - height)) };
  }
  return { build, plain, clip, placement };
});
