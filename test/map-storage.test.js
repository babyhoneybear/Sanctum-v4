const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");
const Backup = require("../backup-data.js");
const clone = value => JSON.parse(JSON.stringify(value));

// Saved records are opaque: preserving them must not require the removed editor.
function example() {
  const world = { id: "world", name: "Test world", terrain: [0, 1, 2], elevation: [0, 12, 36], features: [
    { id: "place", name: "Emberfall", pageId: "lore-page", childMapId: "city" }
  ] };
  const city = { id: "city", parentId: "world", terrain: [1, 1, 1], features: [
    { id: "statue", name: "The Watcher", art: ["data:image/png;base64,aGVsbG8="] }
  ] };
  const atlas = { version: 1, rootId: "world", activeMapId: "city", maps: { world, city } };
  return { atlas, world, city };
}

test("native backups round-trip complete atlases with nested terrain, artwork and external page links", () => {
  const { atlas } = example(), values = { maps: { "map-page": atlas } };
  const keys = Object.fromEntries(Backup.STORAGE_FIELDS.map(([, key]) => [key, key]));
  const source = { keys, readJSON: (key, fallback) => clone(values[key] ?? fallback) };
  const backup = Backup.buildBackupData(source), restored = {};
  Backup.importBackupData(backup, { keys, readJSON: (key, fallback) => restored[key] ?? fallback, writeJSON: (key, value) => { restored[key] = clone(value); } });
  assert.deepEqual(restored.maps, values.maps);
  assert.ok(Backup.hasBackupContent({ maps: values.maps }));
});

// Exercise the actual whole-page copy helper, not a duplicate implementation.
test("copying an atlas remaps its self-page links while retaining external lore and independent maps", () => {
  const { atlas, world, city } = example(); world.features[0].pageId = "source-page";
  const source = fs.readFileSync(require.resolve("../app-core.js"), "utf8");
  const start = source.indexOf("function remapPageClipboardContent("), end = source.indexOf("function destinationHasPageContent(", start);
  const context = { window: {}, clonePageClipboardValue: clone, makePageClipboardId: randomUUID, Map };
  vm.runInNewContext(source.slice(start, end), context);
  const result = context.remapPageClipboardContent({ sourcePageId: "source-page", scopedData: { maps: atlas } }, "copy-page");
  assert.equal(result.maps.maps[world.id].features[0].pageId, "copy-page");
  result.maps.maps[city.id].terrain[0] = 5;
  assert.equal(atlas.maps[city.id].terrain[0], 1);
});

test("native Trash captures, deletes and restores an entire atlas without changing other maps", () => {
  const { atlas } = example(), other = example().atlas;
  const lifecycle = require("../page-lifecycle.js");
  const stores = { maps: { "map-page": atlas, "other-page": other } };
  const source = fs.readFileSync(require.resolve("../ui-core.js"), "utf8");
  const keys = new Proxy({}, { get: (_, key) => key });
  const context = {
    window: { SanctumPageLifecycle: lifecycle }, STORAGE_KEYS: keys,
    userPages: [{ id: "map-page", title: "World", layout: "map", parent: "home" }, { id: "other-page", title: "Other", parent: "home" }],
    userDomains: [], pinnedPages: [], bookmarks: [], trashItems: [],
    readStorageJSON: (key, fallback) => clone(stores[key] ?? fallback),
    writeStorageJSON: (key, value) => { stores[key] = clone(value); return true; },
    readAllPageBlocks: () => ({}), writeAllPageBlocks() {}, readAllDocuments: () => ({}), writeAllDocuments() {},
    collectDescendantPageIds: () => [], getRestorableRecordTitle: () => "Home", hasRestorableHost: () => true,
    mergeUniqueById: lifecycle.mergeUniqueById,
    saveTrash(items) { context.trashItems = clone(items); return true; }
  };
  for (const name of ["saveSanctumRegistry", "savePins", "saveBookmarks", "renderSidebarDomains", "renderSidebarPins", "renderSidebarBookmarks", "renderTrashList", "closeTrash", "showAppToast", "openPage"]) context[name] = () => {};
  for (const name of ["snapshotTrashItem", "deletePagesAndStoredData", "restoreTrashItem"]) {
    const start = source.indexOf(`function ${name}(`), end = source.indexOf("\nfunction ", start + 1);
    vm.runInNewContext(source.slice(start, end), context);
  }
  const item = context.snapshotTrashItem("map-page");
  assert.deepEqual(item.maps["map-page"], atlas);
  context.deletePagesAndStoredData(["map-page"]);
  assert.equal(stores.maps["map-page"], undefined); assert.deepEqual(stores.maps["other-page"], other);
  context.restoreTrashItem(item.id);
  assert.deepEqual(stores.maps["map-page"], atlas); assert.deepEqual(stores.maps["other-page"], other);
});

