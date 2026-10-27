(function () {
  "use strict";
  const KEY = "sanctum_maps_v1";
  let activeRoot = null;

  function close() {
    if (!activeRoot) return;
    activeRoot.replaceChildren();
    activeRoot.className = "";
    activeRoot.style.display = "none";
    delete activeRoot.dataset.surfaceType;
    activeRoot = null;
  }

  function open(pageId) {
    close();
    const root = document.getElementById("pageContent");
    const page = typeof userPages !== "undefined" ? userPages.find(item => item.id === pageId) : null;
    if (!root || !page) return;
    activeRoot = root;
    root.className = "map-recovery";
    root.style.display = "flex";
    root.dataset.surfaceType = "map";
    document.body.classList.remove("editing", "block-selected");

    const panel = document.createElement("section");
    panel.className = "map-recovery-panel";
    const heading = document.createElement("h1");
    heading.textContent = "Map maker removed";
    const description = document.createElement("p");
    const actions = document.createElement("div");
    actions.className = "map-recovery-actions";
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    panel.append(heading, description, actions, status);
    root.append(panel);

    let records;
    try {
      records = window.readStorageJSON(KEY, {});
    } catch (_) {
      description.textContent = "Saved map data could not be read. Reload to try again.";
      return;
    }
    const hasSavedMap = records && Object.hasOwn(records, pageId);
    description.textContent = hasSavedMap
      ? "Your saved map is preserved. You can download it below or include it in a full vault backup from Settings."
      : "The previous map editor is no longer available. This page has no saved map data.";
    if (!hasSavedMap) return;

    const record = records[pageId];
    const filename = String(page.title || "map").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").slice(0, 100).replace(/[. ]+$/, "") || "map";
    function downloadButton(label, content, suffix, type) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.onclick = () => {
        try {
          const url = URL.createObjectURL(new Blob([content()], { type }));
          const link = document.createElement("a");
          link.href = url;
          link.download = filename + suffix;
          document.body.append(link);
          try { link.click(); } finally {
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }
        } catch (_) {
          status.textContent = "The download could not start. Your saved data has not been changed.";
        }
      };
      actions.append(button);
    }
    // Preserve unknown record fields as well as both historical map formats.
    downloadButton("Download saved data", () => JSON.stringify(record, null, 2), ".json", "application/json");
    if (record?.engine === "azgaar" && typeof record.document === "string") {
      downloadButton("Download map (.map)", () => record.document, ".map", "text/plain;charset=utf-8");
    }
    if (record && Object.hasOwn(record, "previousAtlas")) {
      downloadButton("Download earlier atlas", () => JSON.stringify(record.previousAtlas, null, 2), "-earlier-atlas.json", "application/json");
    }
  }

  window.renderMapPage = open;
  window.closeMapPage = close;
  window.dispatchEvent(new CustomEvent("sanctum:map-ready"));
})();
