const test = require("node:test");
const assert = require("node:assert/strict");
const {
  collectDescendantPageIds,
  renameRecord,
  renamePins,
  renameLinkedBlocks,
  snapshotPageTree,
  removePagesAndLinkedBlocks,
  restorePageTree
} = require("../page-lifecycle.js");

function makeVault() {
  return {
    pages: [
      { id: "page-1", parent: "home", title: "Old Name" },
      { id: "child-1", parent: "page-1", title: "Child" },
      { id: "grandchild-1", parent: "child-1", title: "Grandchild" },
      { id: "other-1", parent: "home", title: "Other" }
    ],
    pinnedPages: [{ id: "page-1", title: "Old Name" }],
    bookmarks: ["page-1", "other-1"],
    pageBlocks: {
      "page-1": [{ id: "own-block", type: "text", bodyHTML: "Important work" }],
      "child-1": [{ id: "child-block", type: "text", bodyHTML: "Child work" }],
      "other-1": [
        { id: "link-block", type: "page", linkedPageId: "page-1", pageCardTitle: "Old Name" },
        {
          id: "frame",
          type: "container",
          containerItems: [
            { id: "nested-link", linkedPageId: "page-1", pageCardTitle: "Old Name" }
          ]
        },
        { id: "unrelated", type: "text", bodyHTML: "Keep me" }
      ]
    }
  };
}

test("collects an entire descendant tree without unrelated pages", () => {
  const ids = collectDescendantPageIds(makeVault().pages, "page-1");
  assert.deepEqual(new Set(ids), new Set(["child-1", "grandchild-1"]));
});

test("rename updates the record, pin, direct card, and nested card", () => {
  const vault = makeVault();

  assert.equal(renameRecord(vault.pages, "page-1", "New Name"), true);
  const pinResult = renamePins(vault.pinnedPages, "page-1", "New Name");
  vault.pinnedPages = pinResult.pins;
  assert.equal(renameLinkedBlocks(vault.pageBlocks, "page-1", "New Name"), true);

  assert.equal(vault.pages[0].title, "New Name");
  assert.equal(vault.pinnedPages[0].title, "New Name");
  assert.equal(vault.pageBlocks["other-1"][0].pageCardTitle, "New Name");
  assert.equal(vault.pageBlocks["other-1"][1].containerItems[0].pageCardTitle, "New Name");
  assert.equal(vault.pageBlocks["other-1"][2].bodyHTML, "Keep me");
});

test("delete removes a page tree and its incoming cards but preserves unrelated work", () => {
  const vault = makeVault();
  const ids = ["page-1", ...collectDescendantPageIds(vault.pages, "page-1")];
  const deleted = removePagesAndLinkedBlocks(vault, ids);

  assert.deepEqual(deleted.pages.map((page) => page.id), ["other-1"]);
  assert.deepEqual(deleted.pinnedPages, []);
  assert.deepEqual(deleted.bookmarks, ["other-1"]);
  assert.equal(deleted.pageBlocks["page-1"], undefined);
  assert.equal(deleted.pageBlocks["child-1"], undefined);
  assert.deepEqual(
    deleted.pageBlocks["other-1"].map((block) => block.id),
    ["frame", "unrelated"]
  );
  assert.deepEqual(deleted.pageBlocks["other-1"][0].containerItems, []);
});

test("snapshot then delete and restore recovers pages, blocks, pins, bookmarks, and links", () => {
  const original = makeVault();
  const snapshot = snapshotPageTree(original, "page-1");
  const deleted = removePagesAndLinkedBlocks(original, snapshot.targetIds);
  const restored = restorePageTree(deleted, snapshot, {
    hasHost: (hostId) => restoredHostIds.has(hostId)
  });

  assert.deepEqual(
    [...restored.pages].sort((a, b) => a.id.localeCompare(b.id)),
    [...original.pages].sort((a, b) => a.id.localeCompare(b.id))
  );
  assert.deepEqual(restored.pinnedPages, original.pinnedPages);
  assert.deepEqual(new Set(restored.bookmarks), new Set(original.bookmarks));
  assert.deepEqual(restored.pageBlocks["page-1"], original.pageBlocks["page-1"]);
  assert.deepEqual(restored.pageBlocks["child-1"], original.pageBlocks["child-1"]);
  const restoredOtherById = Object.fromEntries(restored.pageBlocks["other-1"].map((block) => [block.id, block]));
  const originalOtherById = Object.fromEntries(original.pageBlocks["other-1"].map((block) => [block.id, block]));
  assert.deepEqual(restoredOtherById, originalOtherById);
});

const restoredHostIds = new Set(["home", "other-1"]);

test("restore does not recreate incoming links when their host no longer exists", () => {
  const original = makeVault();
  const snapshot = snapshotPageTree(original, "page-1");
  const deleted = removePagesAndLinkedBlocks(original, snapshot.targetIds);
  delete deleted.pageBlocks["other-1"];
  deleted.pages = [];

  const restored = restorePageTree(deleted, snapshot, { hasHost: () => false });

  assert.equal(restored.pageBlocks["other-1"], undefined);
  assert.deepEqual(restored.pageBlocks["page-1"], original.pageBlocks["page-1"]);
});

test("restoring twice does not duplicate blocks or records", () => {
  const original = makeVault();
  const snapshot = snapshotPageTree(original, "page-1");
  const once = restorePageTree(original, snapshot, { hasHost: () => true });
  const twice = restorePageTree(once, snapshot, { hasHost: () => true });

  assert.equal(twice.pages.filter((page) => page.id === "page-1").length, 1);
  assert.equal(twice.pageBlocks["page-1"].filter((block) => block.id === "own-block").length, 1);
  assert.equal(twice.pageBlocks["other-1"].filter((block) => block.id === "link-block").length, 1);
});
