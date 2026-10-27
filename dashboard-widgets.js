// Native page metadata and Infinite Board previews; no duplicate image store.
function normalizeDashboardTags(tags) {
  const unique = new Map();
  for (const value of Array.isArray(tags) ? tags : []) {
    if (typeof value !== "string") continue;
    const tag = value.trim().replace(/^#+/, "").trim().slice(0, 60);
    if (tag && !unique.has(tag.toLowerCase())) unique.set(tag.toLowerCase(), tag);
  }
  return [...unique.values()].slice(0, 50);
}

function toggleDashboardTag(tags, value) {
  const normalized = normalizeDashboardTags(tags);
  const tag = normalizeDashboardTags([value])[0];
  if (!tag) return normalized;
  const exists = normalized.some(entry => entry.toLowerCase() === tag.toLowerCase());
  return exists ? normalized.filter(entry => entry.toLowerCase() !== tag.toLowerCase()) : normalizeDashboardTags([...normalized, tag]);
}

function normalizeDashboardWidget(raw = {}) {
  return {
    title: String(raw.title || "").trim().slice(0, 100),
    targetPageId: String(raw.targetPageId || "").trim(),
    suggestions: normalizeDashboardTags(raw.suggestions || ["World Building", "Character", "Magic", "Idea", "Research"])
  };
}

function collectMoodImageBodies(blocks, limit = 5) {
  const result = [];
  const visit = (items, depth = 0) => {
    if (depth > 16) return;
    for (const block of Array.isArray(items) ? items : []) {
      if (result.length >= limit) return;
      if (block.type === "image" && typeof block.bodyHTML === "string") result.push(block.bodyHTML);
      if (block.type === "container") visit(block.containerItems, depth + 1);
    }
  };
  visit(blocks);
  return result;
}

(function () {
  if (typeof window === "undefined") return;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const record = id => (window.userPages || []).find(page => page.id === id) || (window.userDomains || []).find(page => page.id === id);
  const currentId = () => window.getCurrentPageId?.() || "";
  const configOf = block => {
    try { return normalizeDashboardWidget(JSON.parse(block.dataset.dashboardWidget || "{}")); }
    catch { return normalizeDashboardWidget(); }
  };
  function setConfig(block, config) {
    const previous = block.dataset.dashboardWidget;
    block.dataset.dashboardWidget = JSON.stringify(normalizeDashboardWidget(config));
    if (saveState() === false) {
      if (previous === undefined) delete block.dataset.dashboardWidget;
      else block.dataset.dashboardWidget = previous;
      return false;
    }
    return true;
  }
  function refreshTags() {
    document.querySelectorAll('.block[data-type="page-tags"]').forEach(mountDashboardWidget);
  }
  function changeTag(page, tag, addOnly = false) {
    const previous = page.tags;
    page.tags = addOnly ? normalizeDashboardTags([...(page.tags || []), tag]) : toggleDashboardTag(page.tags, tag);
    if (saveSanctumRegistry() === false) {
      page.tags = previous;
      showAppToast("Couldn't save this tag.", "info");
      return false;
    }
    window.dispatchEvent(new CustomEvent("sanctum:page-tags-updated", { detail: { pageId: page.id } }));
    refreshTags();
    return true;
  }
  function mountTags(block, shell, config) {
    const page = record(config.targetPageId || currentId());
    if (!page) { shell.innerHTML = '<p class="dashboard-empty">This page is no longer available.</p>'; return; }
    const active = normalizeDashboardTags(page.tags);
    const choices = normalizeDashboardTags([...active, ...config.suggestions]);
    shell.innerHTML = `<header><span>${esc(config.title || "Tags (Quick Add)")}</span></header>
      <div class="dashboard-tag-chips" aria-label="Tags on ${esc(page.title)}">${choices.map(tag => {
        const selected = active.some(value => value.toLowerCase() === tag.toLowerCase());
        return `<button type="button" class="dashboard-tag" aria-pressed="${selected}" data-tag="${esc(tag)}" title="${selected ? "Remove" : "Add"} ${esc(tag)}">${esc(tag)}</button>`;
      }).join("")}</div>
      <form class="dashboard-tag-form"><input aria-label="New page tag" placeholder="Add a tag…" maxlength="60"><button type="submit" aria-label="Add tag">+</button></form>`;
    shell.querySelectorAll("[data-tag]").forEach(button => button.addEventListener("click", () => changeTag(page, button.dataset.tag)));
    shell.querySelector("form").addEventListener("submit", event => {
      event.preventDefault();
      const input = shell.querySelector("input");
      if (!normalizeDashboardTags([input.value]).length) return;
      if (changeTag(page, input.value, true)) block.querySelector("input")?.focus();
    });
  }
  function imagePreviews(pageId) {
    return collectMoodImageBodies(getPageBlocks(pageId)).flatMap(html => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const image = doc.querySelector("img");
      const src = image?.getAttribute("src") || "";
      if (!src || /^(?:javascript|vbscript):/i.test(src)) return [];
      return [{ src, alt: image.getAttribute("alt") || "Mood image" }];
    });
  }
  function mountMood(block, shell, config) {
    const target = record(config.targetPageId);
    const board = target?.layout === "infinite-canvas" ? target : null;
    const images = board ? imagePreviews(board.id) : [];
    shell.innerHTML = `<header><button type="button" class="dashboard-title-button" data-mood-open>${esc(config.title || "Project Mood")}${board ? " ↗" : ""}</button><button type="button" class="dashboard-widget-config" aria-label="Choose mood board" aria-expanded="false">${getUIIcon("settings-2")}</button></header>
      <div class="dashboard-mood-tray">${images.map((image, index) => `<button type="button" data-mood-open aria-label="Open mood board, image ${index + 1}"><img src="${esc(image.src)}" alt="${esc(image.alt)}" loading="lazy"></button>`).join("")}
        ${!images.length ? `<span class="dashboard-empty">${board ? "Add images to your board" : "Connect an Infinite Board"}</span>` : ""}
        <button type="button" class="dashboard-mood-add" aria-label="${board ? "Add images on mood board" : "Create mood board"}">+</button>
      </div>
      <div class="dashboard-mood-picker" hidden><label>Infinite Board<select aria-label="Mood board"><option value="">Choose a board…</option>${(window.userPages || []).filter(page => page.layout === "infinite-canvas").map(page => `<option value="${esc(page.id)}"${page.id === board?.id ? " selected" : ""}>${esc(page.title)}</option>`).join("")}</select></label><button type="button" data-mood-create>Create new board</button></div>`;
    const picker = shell.querySelector(".dashboard-mood-picker");
    shell.querySelector(".dashboard-widget-config").addEventListener("click", event => {
      picker.hidden = !picker.hidden;
      event.currentTarget.setAttribute("aria-expanded", String(!picker.hidden));
    });
    shell.querySelector("select").addEventListener("change", event => {
      if (setConfig(block, { ...config, targetPageId: event.target.value })) mountDashboardWidget(block);
    });
    const open = (add = false) => {
      if (!board) { picker.hidden = false; return; }
      if (saveState() === false) return;
      window.openPage(board.id);
      if (add) startPlacingPreset("image");
    };
    const create = () => {
      const page = window.createPage(config.title || "Project Mood", currentId(), "infinite-canvas", "none", "page", { skipTemplate: true });
      if (!page?.id || !setConfig(block, { ...config, targetPageId: page.id })) return;
      window.openPage(page.id);
      startPlacingPreset("image");
    };
    shell.querySelectorAll("[data-mood-open]").forEach(button => button.addEventListener("click", () => open()));
    shell.querySelector(".dashboard-mood-add").addEventListener("click", () => board ? open(true) : create());
    shell.querySelector("[data-mood-create]").addEventListener("click", create);
  }
  function mountDashboardWidget(block) {
    if (!block || block.classList.contains("ghost")) return;
    const shell = block.querySelector(".dashboard-widget-shell");
    if (!shell) return;
    // Interactive controls must not also begin a canvas drag or delete a block.
    shell.onmousedown = event => { if (event.target.closest("button,input,select,form")) event.stopPropagation(); };
    shell.onkeydown = event => { if (event.target.closest("input,select")) event.stopPropagation(); };
    if (block.dataset.type === "page-tags") mountTags(block, shell, configOf(block));
    else if (block.dataset.type === "mood-board") mountMood(block, shell, configOf(block));
  }
  window.mountDashboardWidget = mountDashboardWidget;
  document.querySelectorAll('.block[data-type="page-tags"], .block[data-type="mood-board"]').forEach(mountDashboardWidget);
  document.getElementById("toolDashboard")?.addEventListener("click", () => {
    document.getElementById("dashboardToolsDialog")?.remove();
    const dialog = document.createElement("dialog");
    dialog.id = "dashboardToolsDialog";
    dialog.className = "dashboard-dialog";
    dialog.innerHTML = '<h2>Dashboard tools</h2><p>Add reusable blocks, or arrange this page with a worldbuilding layout.</p><div class="dashboard-tool-choices"><button data-place="page-tags">Quick-add tags</button><button data-place="mood-board">Mood board preview</button><button data-place="canvas-preview">Canvas preview</button><button data-layout>Worldbuilding layout…</button></div><button data-close>Close</button>';
    document.body.appendChild(dialog);
    dialog.showModal();
    dialog.querySelectorAll("[data-place]").forEach(button => button.onclick = () => { dialog.close(); dialog.remove(); startPlacingPreset(button.dataset.place); });
    dialog.querySelector("[data-layout]").onclick = () => { dialog.close(); dialog.remove(); window.openWorldbuildingLayout?.(); };
    dialog.querySelector("[data-close]").onclick = () => { dialog.close(); dialog.remove(); };
    dialog.addEventListener("close", () => dialog.remove());
  });
})();

if (typeof module !== "undefined" && module.exports) module.exports = { normalizeDashboardTags, toggleDashboardTag, normalizeDashboardWidget, collectMoodImageBodies };
