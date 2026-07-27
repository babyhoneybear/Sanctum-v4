const test = require("node:test");
const assert = require("node:assert/strict");
const {
  STORAGE_FIELDS,
  buildBackupData,
  importBackupData,
  hasBackupContent
} = require("../backup-data.js");

function makeKeys() {
  const keys = {
    domains: "sanctum_domains",
    pagesRegistry: "sanctum_pages_registry",
    pageDatabases: "sanctum_page_databases",
    legacyCalendarDatabases: "sanctum_calendar_databases",
    helperMemoryProfile: "sanctum_helper_memory_profile_v1"
  };
  STORAGE_FIELDS.forEach(([, keyName]) => {
    keys[keyName] ||= `sanctum_${keyName}`;
  });
  return keys;
}

function memoryAdapter(initial = {}) {
  const values = new Map(Object.entries(initial));
  const keys = makeKeys();
  return {
    values,
    keys,
    settings: { theme: "dark" },
    domains: [{ id: "domain-1", title: "World" }],
    pages: [{ id: "page-1", title: "Map" }],
    readJSON(key, fallback) {
      return values.has(key) ? structuredClone(values.get(key)) : structuredClone(fallback);
    },
    writeJSON(key, value) {
      values.set(key, structuredClone(value));
      return true;
    },
    writeSettings(value) {
      values.set("sanctum_settings", structuredClone(value));
    }
  };
}

test("export includes every registered storage field", () => {
  const adapter = memoryAdapter();
  STORAGE_FIELDS.forEach(([field, keyName], index) => {
    adapter.values.set(adapter.keys[keyName], { field, index });
  });
  adapter.values.set(adapter.keys.pageDatabases, { lore: { rows: 3 } });
  adapter.values.set(adapter.keys.helperUserProfile, { id: "keeper" });
  adapter.values.set(`${adapter.keys.helperMemoryProfile}:keeper`, { facts: ["likes maps"] });

  const backup = buildBackupData(adapter);

  STORAGE_FIELDS.forEach(([field], index) => {
    if (field === "helperUserProfile") return;
    assert.deepEqual(backup[field], { field, index });
  });
  assert.deepEqual(backup.helperUserProfile, { id: "keeper" });
  assert.deepEqual(backup.pageDatabases, { lore: { rows: 3 } });
  assert.deepEqual(backup.helperMemoryProfile, { facts: ["likes maps"] });
  assert.deepEqual(backup.domains, adapter.domains);
  assert.deepEqual(backup.pages, adapter.pages);
});

test("export falls back to legacy database storage", () => {
  const adapter = memoryAdapter({
    sanctum_calendar_databases: { legacy: { rows: 2 } }
  });

  assert.deepEqual(buildBackupData(adapter).pageDatabases, { legacy: { rows: 2 } });
});

test("corrupt legacy database storage is not exported", () => {
  const adapter = memoryAdapter({
    sanctum_calendar_databases: ["not", "a", "database map"]
  });

  assert.deepEqual(buildBackupData(adapter).pageDatabases, {});
});

test("export then import preserves Sanctum data", () => {
  const source = memoryAdapter();
  source.values.set(source.keys.pageBlocks, { "page-1": [{ id: "block-1", text: "Hello" }] });
  source.values.set(source.keys.documents, { "page-1": { sections: ["Opening"] } });
  source.values.set(source.keys.pageDatabases, { characters: { rows: [{ name: "Mara" }] } });
  source.values.set(source.keys.helperUserProfile, { id: "keeper" });
  source.values.set(`${source.keys.helperMemoryProfile}:keeper`, { facts: ["writes fantasy"] });

  const backup = JSON.parse(JSON.stringify(buildBackupData(source)));
  const target = memoryAdapter();
  target.domains = [];
  target.pages = [];

  const writes = importBackupData(backup, target);

  assert.ok(writes > 0);
  assert.deepEqual(target.values.get(target.keys.domains), source.domains);
  assert.deepEqual(target.values.get(target.keys.pagesRegistry), source.pages);
  assert.deepEqual(target.values.get(target.keys.pageBlocks), source.values.get(source.keys.pageBlocks));
  assert.deepEqual(target.values.get(target.keys.documents), source.values.get(source.keys.documents));
  assert.deepEqual(target.values.get(target.keys.pageDatabases), source.values.get(source.keys.pageDatabases));
  assert.deepEqual(target.values.get(target.keys.legacyCalendarDatabases), source.values.get(source.keys.pageDatabases));
  assert.deepEqual(
    target.values.get(`${target.keys.helperMemoryProfile}:keeper`),
    source.values.get(`${source.keys.helperMemoryProfile}:keeper`)
  );
});

test("import accepts older calendarDatabases backups", () => {
  const adapter = memoryAdapter();
  importBackupData({ calendarDatabases: { old: { rows: 1 } } }, adapter);

  assert.deepEqual(adapter.values.get(adapter.keys.pageDatabases), { old: { rows: 1 } });
  assert.deepEqual(adapter.values.get(adapter.keys.legacyCalendarDatabases), { old: { rows: 1 } });
});

test("invalid backups are rejected without writes", () => {
  const adapter = memoryAdapter();
  assert.throws(() => importBackupData(null, adapter), /must be an object/);
  assert.equal(adapter.values.size, 0);
});

test("recovery copy detection ignores empty vaults and catches meaningful content", () => {
  assert.equal(hasBackupContent({}), false);
  assert.equal(hasBackupContent({ blocks: {} }), false);
  assert.equal(hasBackupContent({ pages: [{ id: "page-1" }] }), true);
  assert.equal(hasBackupContent({ documents: { "page-1": {} } }), true);
});
