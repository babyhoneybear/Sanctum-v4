(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SanctumWorldSystems = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const list = value => Array.isArray(value) ? value : [];
  const fields = (all, id) => list(all[id]?.properties);
  const isMagic = prop => prop?.type === "relation" && (prop.relationKind === "proficiency" || prop.id === "magic");
  const isLevels = prop => prop?.type === "relation" && prop.relationKind === "proficiency-levels";
  const isRequirements = prop => prop?.type === "relation" && prop.relationKind === "spell-requirements";

  // Keep rank slots when a level is deleted; restoring it restores its identity.
  function levelIndex(pages, all) {
    const records = new Map(pages.map(page => [page.id, page]));
    const owners = new Map();
    for (const page of pages) for (const prop of fields(all, page.id).filter(isLevels)) {
      list(prop.linkedPageIds).forEach((id, index) => {
        if (!owners.has(id)) owners.set(id, []);
        owners.get(id).push({ id, page: records.get(id), discipline: page, rank: index + 1, cumulative: prop.cumulative !== false });
      });
    }
    return new Map([...owners].filter(([, entries]) => entries.length === 1 && entries[0].page)
      .map(([id, entries]) => [id, entries[0]]));
  }

  function levels(pages, all, disciplineId) {
    return [...levelIndex(pages, all).values()].filter(level => level.discipline.id === disciplineId).sort((a, b) => a.rank - b.rank);
  }

  function assignLevel(pages, all, pageId, propertyId, disciplineId, levelId) {
    const copy = JSON.parse(JSON.stringify(all));
    const prop = fields(copy, pageId).find(item => item.id === propertyId);
    if (!pages.some(page => page.id === pageId) || !prop || !isMagic(prop) || !list(prop.linkedPageIds).includes(disciplineId)) throw new Error("Connect the discipline first.");
    if (levelId && levelIndex(pages, all).get(levelId)?.discipline.id !== disciplineId) throw new Error("Choose a level belonging to this discipline.");
    prop.linkLevels = { ...prop.linkLevels };
    if (levelId) prop.linkLevels[disciplineId] = levelId;
    else delete prop.linkLevels[disciplineId];
    return copy;
  }

  function evaluate(pages, all, characterId, spellId) {
    const records = new Map(pages.map(page => [page.id, page]));
    const requirements = fields(all, spellId).filter(isRequirements).flatMap(prop => list(prop.linkedPageIds));
    if (!records.has(characterId) || !records.has(spellId) || !requirements.length) return { status: "unknown", reasons: ["No proficiency requirements defined."] };
    const index = levelIndex(pages, all);
    const reasons = [];
    for (const requiredId of new Set(requirements)) {
      const required = index.get(requiredId);
      if (!required) { reasons.push("A required level is missing or has conflicting definitions."); continue; }
      const choices = fields(all, characterId).filter(isMagic)
        .filter(prop => list(prop.linkedPageIds).includes(required.discipline.id))
        .map(prop => prop.linkLevels?.[required.discipline.id]).filter(Boolean);
      const unique = [...new Set(choices)];
      const actual = unique.length === 1 ? index.get(unique[0]) : null;
      if (!actual || actual.discipline.id !== required.discipline.id) {
        reasons.push(unique.length > 1 ? `Conflicting levels for ${required.discipline.title}.` : `Needs ${required.page.title}; no level selected.`);
      } else if (required.cumulative ? actual.rank < required.rank : actual.id !== required.id) {
        reasons.push(`Needs ${required.page.title}; has ${actual.page.title}.`);
      }
    }
    return { status: reasons.length ? "unmet" : "eligible", reasons };
  }

  return { isMagic, isLevels, isRequirements, levelIndex, levels, assignLevel, evaluate };
});
