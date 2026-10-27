(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SanctumBackupData = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const STORAGE_FIELDS = [
    ["chatgptDatabaseHistory", "chatgptDatabaseHistory", []],
    ["blocks", "pageBlocks", {}],
    ["pageSettings", "pageSettings", {}],
    ["pageActivity", "pageActivity", {}],
    ["documents", "documents", {}],
    ["docSettings", "docSettings", {}],
    ["journals", "journals", {}],
    ["maps", "maps", {}],
    ["chronicles", "chronicles", []],
    ["trash", "trash", []],
    ["pins", "pins", []],
    ["bookmarks", "bookmarks", []],
    ["stickers", "stickers", {}],
    ["customStickers", "customStickers", []],
    ["recentColors", "recentColors", []],
    ["colorPalette", "colorPalette", []],
    ["threads", "threads", {}],
    ["anchors", "anchors", {}],
    ["annotations", "annotations", {}],
    ["canvasLines", "canvasLines", {}],
    ["pageProps", "pageProps", {}],
    ["customTypes", "customTypes", []],
    ["timelines", "timelines", {}],
    ["relationshipTrees", "relationshipTrees", {}],
    ["relationshipGraphSettings", "relationshipGraphSettings", {}],
    ["lexicon", "lexicon", []],
    ["writingDictionary", "writingDictionary", []],
    ["writingSettings", "writingSettings", {}],
    ["styleKits", "styleKits", {}],
    ["pagePresets", "pagePresets", {}],
    ["studyActivity", "studyActivity", {}],
    ["activePageSession", "activePageSession", {}],
    ["soundbarLibrary", "soundbarLibrary", {}],
    ["knowledgeViewState", "knowledgeViewState", {}],
    ["historyState", "historyState", {}],
    ["splitLayout", "splitLayout", {}],
    ["tabsLayout", "tabsLayout", {}],
    ["notesVault", "notesVault", []],
    ["noteShelves", "noteShelves", []],
    ["helperInbox", "helperInbox", []],
    ["helperActionLog", "helperActionLog", []],
    ["helperChatLog", "helperChatLog", []],
    ["helperUserProfile", "helperUserProfile", {}]
  ];

  function requireAdapter(adapter) {
    if (!adapter || typeof adapter.readJSON !== "function" || !adapter.keys) {
      throw new TypeError("Backup adapter requires readJSON and keys.");
    }
  }

  function buildBackupData(adapter) {
    requireAdapter(adapter);
    const data = {
      settings: adapter.settings || {},
      domains: Array.isArray(adapter.domains) ? adapter.domains : [],
      pages: Array.isArray(adapter.pages) ? adapter.pages : []
    };

    STORAGE_FIELDS.forEach(([field, keyName, fallback]) => {
      data[field] = adapter.readJSON(adapter.keys[keyName], fallback);
    });

    const primaryDatabases = adapter.readJSON(adapter.keys.pageDatabases, null);
    const legacyDatabases = adapter.readJSON(adapter.keys.legacyCalendarDatabases, {});
    data.pageDatabases = primaryDatabases && typeof primaryDatabases === "object" && !Array.isArray(primaryDatabases)
      ? primaryDatabases
      : legacyDatabases && typeof legacyDatabases === "object" && !Array.isArray(legacyDatabases)
        ? legacyDatabases
        : {};

    const profileId = data.helperUserProfile?.id || "primary-user";
    data.helperMemoryProfile = adapter.readJSON(`${adapter.keys.helperMemoryProfile}:${profileId}`, {});
    return data;
  }

  function importBackupData(data, adapter) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new TypeError("Backup data must be an object.");
    }
    if (!adapter || typeof adapter.writeJSON !== "function" || typeof adapter.readJSON !== "function" || !adapter.keys) {
      throw new TypeError("Import adapter requires readJSON, writeJSON, and keys.");
    }

    // Validate the type library before any existing vault data is replaced.
    if (Object.hasOwn(data, "customTypes")) {
      const ids = new Set();
      if (!Array.isArray(data.customTypes) || data.customTypes.some(type => {
        if (!type || !/^custom-type-[a-z0-9-]+$/i.test(type.id || "") || ids.has(type.id)) return true;
        ids.add(type.id);
        const fieldIds = new Set();
        return typeof type.name !== "string" || !type.name.trim()
          || !["board-canvas", "infinite-canvas", "document"].includes(type.layout)
          || !Number.isInteger(type.version) || type.version < 1
          || !Array.isArray(type.sections) || type.sections.some(title => typeof title !== "string")
          || !Array.isArray(type.fields) || type.fields.some(field => {
            if (!field || typeof field.id !== "string" || !field.id || fieldIds.has(field.id)) return true;
            fieldIds.add(field.id);
            return typeof field.label !== "string" || !field.label.trim()
              || !["text", "relation"].includes(field.type)
              || (field.type === "text" && typeof field.defaultValue !== "string");
          });
      })) throw new TypeError("Backup contains an invalid custom type library.");
    }

    let writes = 0;
    if (data.settings && typeof adapter.writeSettings === "function") {
      adapter.writeSettings(data.settings);
      writes += 1;
    }
    if (data.domains) {
      adapter.writeJSON(adapter.keys.domains, data.domains);
      writes += 1;
    }
    if (data.pages) {
      adapter.writeJSON(adapter.keys.pagesRegistry, data.pages);
      writes += 1;
    }

    STORAGE_FIELDS.forEach(([field, keyName]) => {
      if (!data[field]) return;
      adapter.writeJSON(adapter.keys[keyName], data[field]);
      writes += 1;
    });

    const importedPageDatabases = data.pageDatabases || data.calendarDatabases;
    if (importedPageDatabases) {
      adapter.writeJSON(adapter.keys.pageDatabases, importedPageDatabases);
      adapter.writeJSON(adapter.keys.legacyCalendarDatabases, importedPageDatabases);
      writes += 2;
    }

    if (data.helperMemoryProfile) {
      const importedProfile = data.helperUserProfile || adapter.readJSON(adapter.keys.helperUserProfile, {});
      adapter.writeJSON(
        `${adapter.keys.helperMemoryProfile}:${importedProfile.id || "primary-user"}`,
        data.helperMemoryProfile
      );
      writes += 1;
    }

    return writes;
  }

  function hasBackupContent(data) {
    return (data?.domains?.length || 0) > 0
      || (data?.pages?.length || 0) > 0
      || Object.keys(data?.blocks || {}).length > 0
      || Object.keys(data?.documents || {}).length > 0
      || Object.keys(data?.journals || {}).length > 0
      || Object.keys(data?.maps || {}).length > 0
      || Object.keys(data?.pageDatabases || {}).length > 0
      || (data?.notesVault?.length || 0) > 0
      || (data?.customTypes?.length || 0) > 0;
  }

  return {
    STORAGE_FIELDS,
    buildBackupData,
    importBackupData,
    hasBackupContent
  };
});
