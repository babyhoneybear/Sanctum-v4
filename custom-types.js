(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SanctumCustomTypes = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const STORAGE_KEY = "sanctum_custom_types_v1";
  const LAYOUTS = { "board-canvas": "Board Canvas", "infinite-canvas": "Infinite Board", document: "Document" };
  const copy = value => JSON.parse(JSON.stringify(value));
  const newId = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  const clean = value => typeof value === "string" ? value.trim() : "";

  function validate(input, others = []) {
    const name = clean(input.name);
    if (!name || name.length > 80) throw new Error("Give the type a name of 1–80 characters.");
    if (others.some(type => type.id !== input.id && type.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      throw new Error("A type with that name already exists, including archived types.");
    }
    if (!Object.hasOwn(LAYOUTS, input.layout)) throw new Error("Choose a supported starter layout.");
    const fields = Array.isArray(input.fields) ? input.fields : [];
    const sections = Array.isArray(input.sections) ? input.sections : [];
    if (fields.length > 40 || sections.length > 40) throw new Error("Use up to 40 fields and 40 sections per type.");
    const names = new Set(), ids = new Set();
    const normalizedFields = fields.map(field => {
      const label = clean(field.label);
      if (!label || label.length > 80) throw new Error("Each field needs a name of 1–80 characters.");
      if (names.has(label.toLocaleLowerCase())) throw new Error(`The field “${label}” appears twice.`);
      names.add(label.toLocaleLowerCase());
      if (!["text", "relation"].includes(field.type)) throw new Error("Choose Text or Page links for each field.");
      const id = /^field-[a-z0-9-]+$/i.test(field.id || "") ? field.id : newId("field");
      if (ids.has(id)) throw new Error("Two fields have the same identity. Remove one and add it again.");
      ids.add(id);
      return { id, label, type: field.type, defaultValue: field.type === "text" ? String(field.defaultValue || "").slice(0, 4000) : "" };
    });
    if (sections.some(section => !clean(section) || clean(section).length > 100)) {
      throw new Error("Each starter section needs a title of 1–100 characters.");
    }
    return {
      id: /^custom-type-[a-z0-9-]+$/i.test(input.id || "") ? input.id : newId("custom-type"),
      name, description: clean(input.description).slice(0, 500), icon: clean(input.icon).slice(0, 40),
      layout: input.layout, fields: normalizedFields, sections: sections.map(clean),
      archived: input.archived === true, version: Math.max(1, Number(input.version) || 1)
    };
  }

  function read(storage = globalThis.localStorage) {
    // Do not silently replace unreadable definitions with an empty library.
    const raw = storage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) throw new Error("The custom type library could not be read. Restore a valid backup before editing it.");
    return list;
  }
  function list(options = {}, storage = globalThis.localStorage) {
    return read(storage).filter(type => options.includeArchived || !type.archived);
  }
  function get(id, storage = globalThis.localStorage) {
    if (!String(id || "").startsWith("custom-type-")) return null;
    return read(storage).find(type => type.id === id) || null;
  }
  function label(id, storage = globalThis.localStorage) {
    if (!String(id).startsWith("custom-type-")) return id || "";
    try { return get(id, storage)?.name || "Unavailable custom type"; } catch { return "Unavailable custom type"; }
  }
  function save(input, storage = globalThis.localStorage) {
    const all = read(storage);
    const previous = all.find(type => type.id === input.id);
    const type = validate(input, all);
    type.version = previous ? previous.version + 1 : 1;
    const index = all.findIndex(item => item.id === type.id);
    if (index < 0) all.push(type); else all[index] = type;
    storage.setItem(STORAGE_KEY, JSON.stringify(all));
    return copy(type);
  }
  function properties(type) {
    return type.fields.map(field => ({ id: field.id, label: field.label, type: field.type,
      value: field.type === "text" ? field.defaultValue : "", linkedPageIds: [] }));
  }
  function starter(type, pageId, layout = type.layout) {
    const result = { props: { properties: properties(type), customTypeId: type.id, customTypeVersion: type.version } };
    if (layout === "document") {
      result.document = {
        meta: { status: "draft", purpose: "", totalWords: 0, sessionStartWords: 0 }, viewPrefs: {}, annotation: {},
        sections: type.sections.map((title, i) => ({ id: `doc-section-${pageId}-${i}`, title, content: "", styleKit: "",
          meta: { status: "draft", purpose: "", pov: "", povId: "", location: "", locationId: "", chapter: "", notes: "" },
          annotations: [], suggestedChanges: [] }))
      };
    }
    if (layout === "board-canvas" || layout === "infinite-canvas") {
      const ox = layout === "infinite-canvas" ? 1980 : 48;
      const oy = layout === "infinite-canvas" ? 768 : 48;
      const fieldRows = Math.ceil(type.fields.length / 2);
      const base = (i, y, h) => ({ id: `block-type-${pageId}-${i}`, x: ox + (i % 2) * 432, y,
        w: 408, h, z: 1, bg: "", borderColor: "", textColor: "", locked: 0, hasNote: 0 });
      result.blocks = [
        ...type.fields.map((field, i) => ({ ...base(i, oy + Math.floor(i / 2) * 168, 144),
          type: "connections", connectionPropertyId: field.id, connectionSourcePageId: pageId,
          titleHTML: escapeText(field.label) })),
        ...type.sections.map((title, i) => ({ ...base(i, oy + fieldRows * 168 + Math.floor(i / 2) * 240, 216),
          id: `block-type-section-${pageId}-${i}`, type: "container", containerTitle: escapeText(title), containerBody: "", containerItems: [] }))
      ];
    }
    return result;
  }
  function escapeText(value) {
    return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }
  return { STORAGE_KEY, LAYOUTS, validate, list, get, label, save, properties, starter, newId, escapeText };
});
