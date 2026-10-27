(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SanctumPageRelations = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const list = value => Array.isArray(value) ? value : [];
  const normalize = value => String(value || "").normalize("NFKC").trim().toLocaleLowerCase();

  // Reverse connections are derived, never stored as a second editable copy.
  function collect(pages = [], allProps = {}) {
    const records = new Map(pages.map(page => [page.id, page]));
    const relations = [];
    for (const [from, data] of Object.entries(allProps)) {
      if (!records.has(from)) continue;
      for (const property of list(data?.properties)) {
        if (property.type !== "relation") continue;
        for (const to of new Set(list(property.linkedPageIds))) {
          if (from === to || !records.has(to)) continue;
          const levelId = property.relationKind === "proficiency" || property.id === "magic" ? property.linkLevels?.[to] : "";
          const level = records.get(levelId);
          relations.push({
            from, to, propertyId: property.id,
            label: String(property.label || "Related"),
            inverseLabel: String(property.inverseLabel || "Connected from"),
            detail: [level?.title, String(property.linkDetails?.[to] || "").trim()].filter(Boolean).join(" · ")
          });
          if (level && levelId !== from) relations.push({ from, to: levelId, propertyId: property.id,
            label: "Proficiency", inverseLabel: "Practitioners at this level", detail: records.get(to).title });
        }
      }
    }
    return relations;
  }

  function names(page, allProps = {}) {
    const aliases = value => Array.isArray(value) ? value : String(value || "").split(",");
    const fields = list(allProps[page.id]?.properties).filter(p => /^aliases?$/i.test(String(p.label || p.name || p.id || "").trim()));
    return [page.title, ...aliases(page.aliases || page.alias), ...fields.flatMap(p => aliases(p.value))].map(normalize).filter(Boolean);
  }

  function candidates({ pages, allProps, sourceId, query = "", scopeId = "", getScopeId = () => "", allScopes = false }) {
    const q = normalize(query);
    return pages.filter(page => page.id !== sourceId
      && (allScopes || getScopeId(page.id) === scopeId)
      && (!q || names(page, allProps).some(name => name.includes(q))))
      .sort((a, b) => Number(names(b, allProps).includes(q)) - Number(names(a, allProps).includes(q))
        || String(a.title).localeCompare(String(b.title)));
  }

  return { collect, candidates, names, normalize };
});
