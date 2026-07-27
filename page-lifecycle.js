(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SanctumPageLifecycle = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  function uniqueIds(ids = []) {
    return Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean)));
  }

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function collectDescendantPageIds(pages = [], rootId) {
    const ids = new Set();
    const stack = [rootId];

    while (stack.length) {
      const parentId = stack.pop();
      pages.forEach((page) => {
        if (page?.parent === parentId && page.id && !ids.has(page.id)) {
          ids.add(page.id);
          stack.push(page.id);
        }
      });
    }

    return Array.from(ids);
  }

  function mergeUniqueById(existing = [], incoming = []) {
    const merged = Array.isArray(existing) ? existing.map((item) => clone(item)) : [];
    (Array.isArray(incoming) ? incoming : []).forEach((item) => {
      if (!item?.id || merged.some((entry) => entry?.id === item.id)) return;
      merged.push(clone(item));
    });
    return merged;
  }

  function renameRecord(records = [], pageId, newTitle) {
    const record = (Array.isArray(records) ? records : []).find((item) => item?.id === pageId);
    if (!record) return false;
    record.title = newTitle;
    return true;
  }

  function renamePins(pins = [], pageId, newTitle) {
    let changed = false;
    const nextPins = (Array.isArray(pins) ? pins : []).map((pin) => {
      if (pin?.id !== pageId) return pin;
      changed = true;
      return { ...pin, title: newTitle };
    });
    return { changed, pins: nextPins };
  }

  function renameLinkedBlocks(allBlocks = {}, pageId, newTitle, options = {}) {
    let changed = false;
    const getItems = typeof options.getItems === "function"
      ? options.getItems
      : (block) => Array.isArray(block?.containerItems) ? block.containerItems : [];
    const transformDirect = typeof options.transformDirect === "function"
      ? options.transformDirect
      : (block) => ({ ...block, pageCardTitle: newTitle });

    Object.keys(allBlocks || {}).forEach((hostId) => {
      const blocks = Array.isArray(allBlocks[hostId]) ? allBlocks[hostId] : [];
      allBlocks[hostId] = blocks.map((block) => {
        let nextBlock = block;
        if (block?.linkedPageId === pageId) {
          changed = true;
          nextBlock = transformDirect(block);
        }

        const items = getItems(nextBlock);
        const nextItems = items.map((item) => {
          if (item?.linkedPageId !== pageId) return item;
          changed = true;
          return { ...item, pageCardTitle: newTitle };
        });
        if (nextItems.length) nextBlock = { ...nextBlock, containerItems: nextItems };
        return nextBlock;
      });
    });

    return changed;
  }

  function snapshotPageTree(state = {}, rootId) {
    const pages = Array.isArray(state.pages) ? state.pages : [];
    const targetIds = uniqueIds([rootId, ...collectDescendantPageIds(pages, rootId)]);
    const pageBlocks = {};
    const linkedBlocksByHost = {};
    const linkedItemsByHost = {};

    targetIds.forEach((id) => {
      if (Array.isArray(state.pageBlocks?.[id])) pageBlocks[id] = clone(state.pageBlocks[id]);
    });

    Object.entries(state.pageBlocks || {}).forEach(([hostId, blocks]) => {
      if (targetIds.includes(hostId) || !Array.isArray(blocks)) return;
      const linkedBlocks = blocks.filter((block) => targetIds.includes(block?.linkedPageId));
      if (linkedBlocks.length) linkedBlocksByHost[hostId] = clone(linkedBlocks);
      const linkedItems = blocks
        .map((block) => ({
          blockId: block?.id,
          items: (Array.isArray(block?.containerItems) ? block.containerItems : [])
            .filter((item) => targetIds.includes(item?.linkedPageId))
        }))
        .filter((entry) => entry.blockId && entry.items.length);
      if (linkedItems.length) linkedItemsByHost[hostId] = clone(linkedItems);
    });

    return {
      rootId,
      targetIds,
      pages: clone(pages.filter((page) => targetIds.includes(page?.id))),
      pinnedPages: clone((state.pinnedPages || []).filter((pin) => targetIds.includes(pin?.id))),
      bookmarks: (state.bookmarks || []).filter((id) => targetIds.includes(id)),
      pageBlocks,
      linkedBlocksByHost,
      linkedItemsByHost
    };
  }

  function removePagesAndLinkedBlocks(state = {}, pageIds = []) {
    const ids = uniqueIds(pageIds);
    const idSet = new Set(ids);
    const blocks = clone(state.pageBlocks || {});

    ids.forEach((id) => delete blocks[id]);
    Object.keys(blocks).forEach((hostId) => {
      const hostBlocks = Array.isArray(blocks[hostId]) ? blocks[hostId] : [];
      blocks[hostId] = hostBlocks
        .filter((block) => !idSet.has(block?.linkedPageId))
        .map((block) => {
          if (!Array.isArray(block?.containerItems)) return block;
          return {
            ...block,
            containerItems: block.containerItems.filter((item) => !idSet.has(item?.linkedPageId))
          };
        });
    });

    return {
      pages: (state.pages || []).filter((page) => !idSet.has(page?.id)),
      pinnedPages: (state.pinnedPages || []).filter((pin) => !idSet.has(pin?.id)),
      bookmarks: (state.bookmarks || []).filter((id) => !idSet.has(id)),
      pageBlocks: blocks
    };
  }

  function restoreBlockMap(allBlocks = {}, blockMap = {}, options = {}) {
    const hasHost = typeof options.hasHost === "function" ? options.hasHost : () => true;
    Object.entries(blockMap || {}).forEach(([hostId, blocks]) => {
      if (!hasHost(hostId) || !Array.isArray(blocks)) return;
      allBlocks[hostId] = Array.isArray(allBlocks[hostId]) ? allBlocks[hostId] : [];
      const existingIds = new Set(allBlocks[hostId].map((block) => block?.id).filter(Boolean));
      const restored = blocks
        .filter((block) => !block?.id || !existingIds.has(block.id))
        .map((block) => clone(block));
      allBlocks[hostId] = [...allBlocks[hostId], ...restored];
    });
    return allBlocks;
  }

  function restoreLinkedItems(allBlocks = {}, linkedItemsByHost = {}, options = {}) {
    const hasHost = typeof options.hasHost === "function" ? options.hasHost : () => true;
    Object.entries(linkedItemsByHost || {}).forEach(([hostId, entries]) => {
      if (!hasHost(hostId) || !Array.isArray(entries) || !Array.isArray(allBlocks[hostId])) return;
      entries.forEach((entry) => {
        const hostBlock = allBlocks[hostId].find((block) => block?.id === entry?.blockId);
        if (!hostBlock || !Array.isArray(entry?.items)) return;
        const existingItems = Array.isArray(hostBlock.containerItems) ? hostBlock.containerItems : [];
        const existingIds = new Set(existingItems.map((item) => item?.id).filter(Boolean));
        const restoredItems = entry.items
          .filter((item) => !item?.id || !existingIds.has(item.id))
          .map((item) => clone(item));
        hostBlock.containerItems = [...existingItems, ...restoredItems];
      });
    });
    return allBlocks;
  }

  function restorePageTree(state = {}, snapshot = {}, options = {}) {
    const pages = mergeUniqueById(state.pages, snapshot.pages);
    const pinnedPages = mergeUniqueById(state.pinnedPages, snapshot.pinnedPages);
    const bookmarks = Array.from(new Set([...(state.bookmarks || []), ...(snapshot.bookmarks || [])]));
    const pageBlocks = clone(state.pageBlocks || {});

    restoreBlockMap(pageBlocks, snapshot.pageBlocks);
    restoreBlockMap(pageBlocks, snapshot.linkedBlocksByHost, { hasHost: options.hasHost });
    restoreLinkedItems(pageBlocks, snapshot.linkedItemsByHost, { hasHost: options.hasHost });

    return { pages, pinnedPages, bookmarks, pageBlocks };
  }

  return {
    collectDescendantPageIds,
    mergeUniqueById,
    renameRecord,
    renamePins,
    renameLinkedBlocks,
    snapshotPageTree,
    removePagesAndLinkedBlocks,
    restoreBlockMap,
    restoreLinkedItems,
    restorePageTree
  };
});
