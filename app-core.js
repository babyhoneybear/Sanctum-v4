// == Topbar Dropdown ==
function openTopbarDropdown(anchorEl, items, options = {}) {
  if (typeof getDocUIState === "function" && typeof handleDocMajorOverlayOpen === "function") {
    const state = getDocUIState();
    if (state.editorOpen) {
      handleDocMajorOverlayOpen("topbarMenu");
    }
  }

  closeAllOverlays();

  const dropdown = document.createElement("div");
  dropdown.className = "topbar-dropdown";
  dropdown.dataset.uiId = "topbarDropdown";

  const closeSubmenus = (fromLevel = 0) => {
    document.querySelectorAll(".topbar-dropdown-submenu").forEach((submenu) => {
      if (Number(submenu.dataset.submenuLevel || 0) >= fromLevel) submenu.remove();
    });
  };

  const openSubmenu = (button, children = [], level = 1, path = []) => {
    closeSubmenus(level);
    if (!button || !Array.isArray(children) || !children.length) return;

    const submenu = document.createElement("div");
    submenu.className = "topbar-dropdown topbar-dropdown-submenu";
    submenu.dataset.uiId = "topbarDropdown";
    submenu.dataset.submenuLevel = String(level);
    renderItems(submenu, children, level, path);
    document.body.appendChild(submenu);

    const rect = button.getBoundingClientRect();
    const width = submenu.offsetWidth || 220;
    const height = submenu.offsetHeight || 180;
    const viewportPadding = 12;
    const leftSpace = rect.left - viewportPadding;
    const rightSpace = window.innerWidth - rect.right - viewportPadding;
    const openLeft = leftSpace >= width + 6 || leftSpace > rightSpace;
    const left = openLeft
      ? Math.max(viewportPadding, rect.left - width - 6)
      : Math.min(window.innerWidth - width - viewportPadding, rect.right + 6);
    const top = Math.max(viewportPadding, Math.min(rect.top, window.innerHeight - height - viewportPadding));

    submenu.style.left = `${Math.round(left)}px`;
    submenu.style.top = `${Math.round(top)}px`;
  };

  function renderItems(container, menuItems, level = 0, parentPath = []) {
    menuItems.forEach(item => {
    if (item.type === "label") {
      const label = document.createElement("div");
      label.className = "topbar-dropdown-label";
      label.textContent = item.label;
      container.appendChild(label);
      return;
    }

    if (item.type === "divider") {
      const divider = document.createElement("div");
      divider.className = "topbar-dropdown-divider";
      container.appendChild(divider);
      return;
    }

    const btn = document.createElement("div");
    const hasChildren = Array.isArray(item.children) && item.children.length;
    const nextPath = item.key ? [...parentPath, item.key] : parentPath;
    btn.className = `topbar-dropdown-btn${item.danger ? " danger" : ""}${hasChildren ? " has-submenu" : ""}`;
    btn.innerHTML = hasChildren
      ? `<span>${escapeHTML(item.label || "")}</span><span class="topbar-dropdown-submenu-arrow">&lsaquo;</span>`
      : escapeHTML(item.label || "");
    if (item.key) btn.dataset.menuPath = nextPath.join("/");
    if (item.active) btn.classList.add("active");
    if (item.fontFamily) btn.style.fontFamily = item.fontFamily;
    if (hasChildren) {
      btn.addEventListener("mouseenter", () => openSubmenu(btn, item.children, level + 1, nextPath));
    }
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (hasChildren) {
        openSubmenu(btn, item.children, level + 1, nextPath);
        return;
      }

      document.querySelectorAll(".topbar-dropdown").forEach((menu) => menu.remove());

      if (typeof setUIState === "function") {
        setUIState({ openOverlay: null });
      }

      item.action();
    });
    container.appendChild(btn);
    });
  }

  renderItems(dropdown, items, 0);

  document.body.appendChild(dropdown);

  const rect = anchorEl.getBoundingClientRect();
  const dropdownWidth = dropdown.offsetWidth || 220;
  const dropdownHeight = dropdown.offsetHeight || 180;
  const viewportPadding = 12;

  let left = rect.right - dropdownWidth;
  left = Math.max(viewportPadding, Math.min(window.innerWidth - dropdownWidth - viewportPadding, left));

  let top = rect.bottom + 6;
  if (top + dropdownHeight > window.innerHeight - viewportPadding) {
    top = Math.max(viewportPadding, rect.top - dropdownHeight - 6);
  }

  dropdown.style.top = `${Math.round(top)}px`;
  dropdown.style.left = `${Math.round(left)}px`;

  if (typeof openOverlay === "function") {
    openOverlay("topbarDropdown", dropdown);
  }

  const defaultOpenPath = Array.isArray(options.defaultOpenPath) ? options.defaultOpenPath.filter(Boolean) : [];
  if (defaultOpenPath.length) {
    const openSavedPath = () => {
      let currentItems = items;
      let currentButton = null;

      defaultOpenPath.forEach((pathKey, index) => {
        const path = defaultOpenPath.slice(0, index + 1).join("/");
        const scope = index === 0
          ? dropdown
          : document.querySelector(`.topbar-dropdown-submenu[data-submenu-level="${index}"]`);
        const button = scope?.querySelector(`.topbar-dropdown-btn[data-menu-path="${path}"]`);
        const match = currentItems.find((entry) => entry?.key === pathKey);
        if (!button || !match?.children?.length) return;
        currentButton = button;
        openSubmenu(button, match.children, index + 1, defaultOpenPath.slice(0, index + 1));
        currentItems = match.children;
      });

      if (currentButton) currentButton.classList.add("active");
    };

    window.requestAnimationFrame(openSavedPath);
  }
}


// == Page Details Modal ==
let editingPageId = null;

function openPageDetails(pageId) {
  const page = userPages.find(p => p.id === pageId) || userDomains.find(d => d.id === pageId);
  if (!page) return;

  const isDomain = userDomains.some(d => d.id === pageId);

  editingPageId = pageId;
  const iconInput = document.getElementById("pageDetailsIcon");
  if (iconInput) {
    iconInput.value = isImageIconValue(page.icon || "") ? "" : (page.icon || "");
    iconInput.dataset.currentIcon = page.icon || "";
    iconInput.placeholder = "Emoji, /remove, or image/GIF URL";
  }
  document.getElementById("pageDetailsName").value = page.title || "";
  document.getElementById("pageDetailsLayout").value = page.layout || "board-canvas";
  document.getElementById("pageDetailsCategory").value = page.category || "none";
  document.getElementById("pageDetailsSummary").value = page.summary || "";

  document.getElementById("pageDetailsLayout")?.closest(".page-details-row")?.style.setProperty("display", isDomain ? "none" : "");
  document.getElementById("pageDetailsCategory")?.closest(".page-details-row")?.style.setProperty("display", isDomain ? "none" : "");
  document.getElementById("pageDetailsSummary")?.closest(".page-details-row")?.style.setProperty("display", isDomain ? "none" : "");

  const modalTitle = document.querySelector(".page-details-title");
  if (modalTitle) modalTitle.textContent = isDomain ? "Domain Details" : "Page Details";

  const overlay = document.getElementById("pageDetailsOverlay");
  if (!overlay) return;

  if (typeof openOverlay === "function") {
    openOverlay("pageDetailsOverlay", overlay);
  } else {
    overlay.classList.add("open");
  }
}

function closePageDetails() {
  const overlay = document.getElementById("pageDetailsOverlay");
  overlay?.classList.remove("open");
  editingPageId = null;

  if (typeof setUIState === "function") {
    const state = getUIState?.();
    if (state?.openOverlay === "pageDetailsOverlay") {
      setUIState({ openOverlay: null });
    }
  }
}

function ensureParentLinkCard(page) {
  if (!page?.id) return;

  const parentId = page.parent || "home";
  const all = readAllPageBlocks();
  const parentBlocks = Array.isArray(all[parentId]) ? all[parentId] : [];
  const dims = getLinkedPageCardDimensions(page.title || "Untitled");

  const alreadyLinked = parentBlocks.some(b => b.linkedPageId === page.id);
  if (alreadyLinked) return;

  let maxY = 0;
  parentBlocks.forEach(b => {
    const bottom = (parseInt(b.y || "0", 10) || 0) + (parseInt(b.h || "48", 10) || 48);
    if (bottom > maxY) maxY = bottom;
  });

  parentBlocks.push({
    id: `block-${Date.now()}`,
    type: "page",
    x: 48,
    y: maxY + 24,
    w: dims.width,
    h: dims.height,
    z: 0,
    titleHTML: "",
    bodyHTML: "",
    bg: "",
    borderColor: "",
    textColor: "",
    radius: "",
    hasNote: 0,
    linkedPageId: page.id,
    pageCardTitle: page.title || "Untitled",
    pageCardIcon: page.icon || "📄",
    pageCardSummary: page.summary || "",
    pageCardTypeLabel: page.type || "",
    pageCardMeta: "",
    cardStyle: getCardStyle(page.layout || "board-canvas", page.category || "none", page.containerType || "page"),
  });

  all[parentId] = parentBlocks;
  writeAllPageBlocks(all);
}

document.getElementById("pageDetailsConfirm").addEventListener("click", () => {
  if (!editingPageId) return;
  const page = userPages.find(p => p.id === editingPageId) || userDomains.find(d => d.id === editingPageId);
  if (!page) return;

  const isDomain = userDomains.some(d => d.id === editingPageId);
  const previousLayout = page.layout || "board-canvas";

  const iconInput = document.getElementById("pageDetailsIcon");
  const rawIconValue = iconInput?.value.trim() || "";
  const nextIcon = rawIconValue.toLowerCase() === "/remove"
    ? ""
    : (rawIconValue || iconInput?.dataset.currentIcon || "");
  const nextTitle = document.getElementById("pageDetailsName").value.trim() || page.title;

  if (!isDomain) {
    page.layout   = document.getElementById("pageDetailsLayout").value;
    page.category = document.getElementById("pageDetailsCategory").value;
    page.summary  = document.getElementById("pageDetailsSummary").value.trim();
    page.openBehavior = getDefaultOpenBehavior(page.category, page.containerType || "page");
  } else {
    delete page.layout;
    delete page.category;
    delete page.summary;
    delete page.openBehavior;
  }

  applyPageRenameEverywhere(editingPageId, nextTitle);
  const iconSaved = applyPageIconEverywhere(editingPageId, nextIcon);
  if (iconSaved === false) {
    alert("That icon file is too large to store here. Try a smaller image or shorter GIF.");
    return;
  }

  // Keep a navigation card on parent when converting away from document layout.
  if (previousLayout === "document" && page.layout !== "document") {
    ensureParentLinkCard(page);
  }

  // update card title + icon on canvas if present
    document.querySelectorAll(`[data-linked-page-id="${editingPageId}"]`).forEach((card) => {
    const titleEl   = card.querySelector(".page-card-title");
    const iconEl    = card.querySelector(".page-card-icon");
    const summaryEl = card.querySelector(".page-card-summary");
    const typeEl    = card.querySelector(".page-card-type-label");

    if (titleEl) titleEl.textContent = page.title;
    if (iconEl) setIconElementContent(iconEl, page.icon, "📄");
    if (summaryEl) summaryEl.textContent = page.summary || "";
    if (typeEl) typeEl.textContent = page.type || "";

    card.dataset.cardStyle = getCardStyle(page.layout || "board-canvas", page.category || "none", page.containerType || "page");

    const cardHost = getPageCardHost(card);
    if (cardHost) {
      cardHost.dataset.pageCardIcon = page.icon || "📄";
      fitLinkedPageBlock(cardHost);
    }
  });

  // update peek drawer if open
  if (activePeekId === editingPageId) openPeek(editingPageId);

  const shouldReopenCurrentPage = currentPageId === editingPageId;

    // update current page UI if we're currently on this page
  if (currentPageId === editingPageId) {
    const titleEl = document.getElementById("pageTitle");
    if (titleEl) titleEl.textContent = page.title;

    const heroTitle = document.getElementById("pageHeroTitle");
    if (heroTitle) heroTitle.textContent = page.title;

    renderBreadcrumbs(currentPageId);
    renderPageHero(currentPageId);
  }

  saveCurrentPageBlocks();
  closePageDetails();

  if (shouldReopenCurrentPage && typeof openPage === "function") {
    openPage(currentPageId, { revealSidebarPath: false });
  }
});

document.getElementById("pageDetailsCancel").addEventListener("click", closePageDetails);


// == Doc Insert Panel ==
function syncDocInsertPanelState() {
  const state = typeof getDocUIState === "function"
    ? getDocUIState()
    : { insertOpen: false };

  const panel = document.getElementById("docInsertPanelEl");
  const toggleBtn = document.getElementById("docInsertToggle");
  const isOpen = !!state.insertOpen;

  if (toggleBtn) {
    toggleBtn.classList.toggle("active", isOpen);
    toggleBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  if (panel) {
    panel.classList.toggle("open", isOpen);
    panel.style.display = isOpen ? "" : "none";
  }
}

function toggleDocInsertPanel() {
  const dock = document.getElementById("editorDock");
  if (!dock) return;

  const state = typeof getDocUIState === "function"
    ? getDocUIState()
    : { insertOpen: false };

      if (typeof canOpenDocInsert === "function" && !canOpenDocInsert()) {
    closeDocInsertPanel();
    return;
  }

  const nextOpen = !state.insertOpen;

  if (nextOpen) {
    renderDocInsertPanel();
  }

  if (typeof setDocUIState === "function") {
    setDocUIState({ insertOpen: nextOpen });
  }

  syncDocInsertPanelState();
}

function renderDocInsertPanel() {
  const toolbar = document.getElementById("docToolbar");
  if (!toolbar) return;

  let panel = document.getElementById("docInsertPanelEl");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "docInsertPanelEl";
    panel.className = "doc-insert-panel";
    panel.innerHTML = `
      <div class="doc-insert-title">Insert</div>
      <button class="doc-insert-item" id="docInsertImageAction">
        🖼 Image
      </button>
      <button class="doc-insert-item" id="docInsertTableAction">
        ⊞ Table
      </button>
      <button class="doc-insert-item" id="docInsertDividerAction">
        ─ Divider
      </button>
      <button class="doc-insert-item" id="docInsertQuoteAction">
        " Quote
      </button>
      <button class="doc-insert-item" id="docInsertChecklistAction">
        ☐ Checklist
      </button>
    `;
    toolbar.appendChild(panel);

    document.getElementById("docInsertImageAction")?.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = () => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (typeof insertDocImage === "function") insertDocImage(ev.target.result);
        };
        reader.readAsDataURL(file);
      };
      input.click();
      closeDocInsertPanel();
    });

    document.getElementById("docInsertTableAction")?.addEventListener("click", () => {
      const rows = 3;
      const cols = 3;
      let tableHTML = `<table class="doc-table"><thead><tr>`;
      for (let c = 0; c < cols; c++) tableHTML += `<th contenteditable="true" spellcheck="false">Column ${c + 1}</th>`;
      tableHTML += `</tr></thead><tbody>`;
      for (let r = 0; r < rows; r++) {
        tableHTML += `<tr>`;
        for (let c = 0; c < cols; c++) tableHTML += `<td contenteditable="true" spellcheck="false"></td>`;
        tableHTML += `</tr>`;
      }
      tableHTML += `</tbody></table><p><br></p>`;
      document.execCommand("insertHTML", false, tableHTML);
      document.getElementById("docContent")?.focus();
      closeDocInsertPanel();
    });

    document.getElementById("docInsertDividerAction")?.addEventListener("click", () => {
      document.execCommand("insertHTML", false, "<hr/><p><br></p>");
      document.getElementById("docContent")?.focus();
      closeDocInsertPanel();
    });

    document.getElementById("docInsertQuoteAction")?.addEventListener("click", () => {
      document.execCommand("insertHTML", false, `<blockquote class="doc-blockquote"><p>Quote text here...</p></blockquote><p><br></p>`);
      document.getElementById("docContent")?.focus();
      closeDocInsertPanel();
    });

    document.getElementById("docInsertChecklistAction")?.addEventListener("click", () => {
      document.execCommand("insertHTML", false, `<ul class="doc-checklist"><li><label><input type="checkbox" /> </label></li></ul><p><br></p>`);
      document.getElementById("docContent")?.focus();
      closeDocInsertPanel();
    });
  }

  syncDocInsertPanelState();
}

document.getElementById("docInsertToggle")?.addEventListener("click", (e) => {
  e.stopPropagation();

  if (typeof canOpenDocInsert === "function" && !canOpenDocInsert()) {
    return;
  }

  if (typeof closeDocTransientUI === "function") {
    closeDocTransientUI();
  }

  toggleDocInsertPanel();
});

function closeDocInsertPanel() {
  if (typeof setDocUIState === "function") {
    setDocUIState({ insertOpen: false });
  }
  syncDocInsertPanelState();
}

let docAnnotateDockOpen = false;
let docAnnotateDockView = "tools";

const DOC_ANNOTATE_COLOR_TOOLS = new Set([
  "highlight",
  "underline",
  "squiggle",
  "circle",
  "bracket"
]);

function syncDocAnnotateDockButtons() {
  const panels = document.querySelectorAll("#docAnnotatePanelEl, #docAnnotateColorsPanelEl");
  if (!panels.length) return;

  const activeTool = typeof window.getDocAnnotationTool === "function"
    ? window.getDocAnnotationTool()
    : "";
  const activeColor = typeof window.getDocAnnotationColor === "function"
    ? window.getDocAnnotationColor()
    : "";
  const annotationCount = typeof window.getDocSectionAnnotationCount === "function"
    ? window.getDocSectionAnnotationCount()
    : 0;

  panels.forEach((panel) => {
    panel.querySelectorAll("[data-doc-ann-tool]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.docAnnTool === activeTool);
    });

    panel.querySelectorAll("[data-doc-ann-color]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.docAnnColor === activeColor);
    });

    const undoBtn = panel.querySelector("#docAnnUndoAction");
    if (undoBtn) {
      undoBtn.disabled = annotationCount <= 0;
      undoBtn.style.opacity = undoBtn.disabled ? "0.4" : "";
      undoBtn.style.pointerEvents = undoBtn.disabled ? "none" : "";
    }
  });
}

function setDocAnnotateDockView(view = "tools") {
  docAnnotateDockView = view === "colors" ? "colors" : "tools";
  syncDocAnnotateDockState();
}

window.syncDocAnnotateDockButtons = syncDocAnnotateDockButtons;

function syncDocAnnotateDockState() {
  const dock = document.getElementById("editorDock");
  const toolsPanel = document.getElementById("docAnnotatePanelEl");
  const colorsPanel = document.getElementById("docAnnotateColorsPanelEl");
  if (!dock || !toolsPanel || !colorsPanel) return;

  const visible = !!docAnnotateDockOpen;
  document.body.classList.toggle("doc-annotate-open", visible);
  dock.classList.toggle("doc-insert-open", visible);
  const showColors = visible && docAnnotateDockView === "colors";

  toolsPanel.classList.toggle("open", visible && !showColors);
  toolsPanel.style.display = visible && !showColors ? "" : "none";
  colorsPanel.classList.toggle("open", showColors);
  colorsPanel.style.display = showColors ? "" : "none";

  if (visible) {
    syncDocAnnotateDockButtons();
  }
}

function closeDocAnnotateDock() {
  docAnnotateDockOpen = false;
  docAnnotateDockView = "tools";
  syncDocAnnotateDockState();
}

window.closeDocAnnotateDock = closeDocAnnotateDock;

function openDocAnnotateDock() {
  docAnnotateDockView = "tools";
  renderDocAnnotateDock();
}

window.openDocAnnotateDock = openDocAnnotateDock;

function renderDocAnnotateDock() {
  const dock = document.getElementById("editorDock");
  if (!dock) return;

  let panel = document.getElementById("docAnnotatePanelEl");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "docAnnotatePanelEl";
    panel.className = "dock-mode dock-mode-doc-annotate";
    panel.innerHTML = `
      <button class="dock-btn" data-doc-ann-tool="highlight" title="Highlight">H</button>
      <button class="dock-btn" data-doc-ann-tool="underline" title="Underline">U</button>
      <button class="dock-btn" data-doc-ann-tool="squiggle" title="Squiggly underline">〰</button>
      <button class="dock-btn" data-doc-ann-tool="circle" title="Circle">◯</button>
      <button class="dock-btn" data-doc-ann-tool="bracket" title="Bracket">}</button>
      <button class="dock-btn" data-doc-ann-tool="note" title="Sticky note">🗒</button>

      <div class="dock-divider"></div>

      <button class="dock-btn" id="docAnnUndoAction" title="Undo last annotation">↺</button>
      <button class="dock-btn" id="docAnnClearAction" title="Clear section annotations">✕</button>
    `;
    dock.appendChild(panel);

    panel.querySelectorAll("[data-doc-ann-tool]").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () => {
        const tool = btn.dataset.docAnnTool;
        if (typeof window.setDocAnnotationTool === "function") {
          window.setDocAnnotationTool(tool, { applyToSelection: true });
        }

        if (DOC_ANNOTATE_COLOR_TOOLS.has(tool)) {
          setDocAnnotateDockView("colors");
        }
      });
    });

    panel.querySelector("#docAnnUndoAction")?.addEventListener("click", () => {
      if (typeof window.undoLastDocSectionAnnotationFromDock === "function") {
        window.undoLastDocSectionAnnotationFromDock();
      }
    });

    panel.querySelector("#docAnnClearAction")?.addEventListener("click", () => {
      if (!confirm("Clear all annotations in this section?")) return;
      if (typeof window.clearDocSectionAnnotationsFromDock === "function") {
        window.clearDocSectionAnnotationsFromDock();
      }
    });
  }

  let colorsPanel = document.getElementById("docAnnotateColorsPanelEl");
  if (!colorsPanel) {
    colorsPanel = document.createElement("div");
    colorsPanel.id = "docAnnotateColorsPanelEl";
    colorsPanel.className = "dock-mode dock-mode-doc-annotate-colors";
    colorsPanel.innerHTML = `
      <button class="dock-btn" id="docAnnBackAction" title="Back to tools">←</button>
      <button class="dock-btn doc-ann-color" data-doc-ann-color="#ffff00" title="Yellow">●</button>
      <button class="dock-btn doc-ann-color" data-doc-ann-color="#8ec5ff" title="Blue">●</button>
      <button class="dock-btn doc-ann-color" data-doc-ann-color="#a7f3a1" title="Green">●</button>
      <button class="dock-btn doc-ann-color" data-doc-ann-color="#ff9ecb" title="Pink">●</button>
      <button class="dock-btn doc-ann-color" data-doc-ann-color="#ffb86b" title="Orange">●</button>
    `;
    dock.appendChild(colorsPanel);

    colorsPanel.querySelector("#docAnnBackAction")?.addEventListener("click", () => {
      setDocAnnotateDockView("tools");
    });

    colorsPanel.querySelectorAll("[data-doc-ann-color]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (typeof window.setDocAnnotationColor === "function") {
          window.setDocAnnotationColor(btn.dataset.docAnnColor);
        }
      });
    });
  }

  docAnnotateDockOpen = true;
  syncDocAnnotateDockState();
}

function toggleDocAnnotateDock() {
  if (docAnnotateDockOpen) {
    closeDocAnnotateDock();
    return;
  }

  openDocAnnotateDock();
}



// == Page Settings (header/title/icon toggles) ==
const PAGE_SETTINGS_KEY = STORAGE_KEYS.pageSettings;

function getPageSettings(pageId) {
  const all = readStorageJSON(PAGE_SETTINGS_KEY, {});
  return normalizePageSettings(all[pageId] || {});
}

function savePageSettings(pageId, settings) {
  const all = readStorageJSON(PAGE_SETTINGS_KEY, {});
  const previous = normalizePageSettings(all[pageId] || {});
  const next = normalizePageSettings(settings);
  all[pageId] = next;
  const saved = writeStorageJSON(PAGE_SETTINGS_KEY, all);

  if (saved && pageId) {
    const shouldSyncLinkedCards = previous.showHeader !== next.showHeader
      || previous.showTitle !== next.showTitle
      || previous.showIcon !== next.showIcon
      || previous.headerSrc !== next.headerSrc
      || previous.headerSize !== next.headerSize
      || previous.headerPos !== next.headerPos
      || previous.fontPreset !== next.fontPreset;

    if (shouldSyncLinkedCards) {
    updateLinkedCardImagesEverywhere(pageId);
    }
  }

  return saved;
}

function getWorkspaceTheme() {
  return normalizeThemeMode(sanctumSettings?.workspace?.theme || "dark", "dark");
}

function getResolvedPageTheme(pageId = currentPageId) {
  const pageTheme = normalizePageThemeOverride(getPageSettings(pageId).theme || "");
  return pageTheme || getWorkspaceTheme();
}

function applyResolvedTheme(pageId = currentPageId) {
  const workspaceTheme = getWorkspaceTheme();
  const pageTheme = normalizePageThemeOverride(pageId ? getPageSettings(pageId).theme : "");
  const resolvedTheme = pageTheme || workspaceTheme;
  const root = document.documentElement;

  root.dataset.workspaceTheme = workspaceTheme;
  root.dataset.theme = resolvedTheme;
  root.dataset.pageTheme = pageTheme || "inherit";
  root.style.colorScheme = resolvedTheme;

  document.body?.setAttribute("data-theme", resolvedTheme);
  document.body?.setAttribute("data-page-theme", pageTheme || "inherit");
}

function getPageThemeLabel(value = "") {
  const normalized = normalizePageThemeOverride(value);
  if (normalized === "light") return "Light";
  if (normalized === "dark") return "Dark";
  return "Use workspace";
}

function applyPageFontPreset(pageId) {
  const pageCanvas = document.getElementById("pageCanvas");
  const docEditor = document.getElementById("docEditor");
  const pageTitle = document.getElementById("pageTitle");
  const breadcrumbBar = document.getElementById("breadcrumbBar");
  const heroTitle = document.getElementById("pageHeroTitle");
  const heroIcon = document.getElementById("pageHeroIcon");

  const settings = pageId ? getPageSettings(pageId) : normalizePageSettings({});
  const meta = getPageFontPresetMeta(settings.fontPreset);
  const family = meta.family || "";

  [pageCanvas, docEditor].forEach((el) => {
    if (!el) return;

    if (family) {
      el.dataset.pageFontFamily = "true";
      el.style.setProperty("--page-font-family", family);
    } else {
      delete el.dataset.pageFontFamily;
      el.style.removeProperty("--page-font-family");
    }
  });

  [pageTitle, breadcrumbBar, heroTitle, heroIcon].forEach((el) => {
    if (!el) return;
    el.style.fontFamily = family;
  });
}

function updateHeroPositionPreview(pos) {
  const next = normalizeHeaderPos(pos);
  const heroImgWrap = document.getElementById("pageHeroImgWrap");
  const heroImg = document.getElementById("pageHeroImg");
  const heroPosSlider = document.getElementById("pageHeroPosSlider");
  const heroPosValue = document.getElementById("pageHeroPosValue");

  if (heroImgWrap) heroImgWrap.style.setProperty("--hero-pos", `${next}%`);
  if (heroImg) heroImg.style.objectPosition = `center ${next}%`;
  if (heroPosSlider) heroPosSlider.value = String(Math.round(next));
  if (heroPosValue) heroPosValue.textContent = `${Math.round(next)}%`;

  return next;
}

function setCurrentHeroPosition(pos, { persist = true } = {}) {
  const next = updateHeroPositionPreview(pos);
  if (!persist) return next;

  const settings = getPageSettings(currentPageId);
  settings.headerPos = next;
  savePageSettings(currentPageId, settings);
  return next;
}

function getHeroTitlePlacement(settings = {}) {
  if (settings.heroOverlay) return "overlay";
  if (settings.showTitle) return "below";
  return "hidden";
}

function getHeroTitlePlacementLabel(settings = {}) {
  const placement = getHeroTitlePlacement(settings);
  if (placement === "overlay") return "Over banner";
  if (placement === "below") return "Below banner";
  return "Off";
}

function cycleHeroTitlePlacement(settings = {}, currentPage = null) {
  const placement = getHeroTitlePlacement(settings);
  if (placement === "below") {
    settings.showTitle = false;
    settings.heroOverlay = true;
    if (!settings.heroOverlayTitle) {
      settings.heroOverlayTitle = currentPage?.title || "";
    }
    return;
  }

  if (placement === "overlay") {
    settings.showTitle = false;
    settings.heroOverlay = false;
    return;
  }

  settings.showTitle = true;
  settings.heroOverlay = false;
}

function renderPageHero(pageId) {
  const allPages = { ...SYSTEM_PAGES };
  userDomains.forEach(d => allPages[d.id] = d);
  userPages.forEach(p => allPages[p.id] = p);
  const page = allPages[pageId];

  const hero = document.getElementById("pageHero");
  const heroImgWrap = document.getElementById("pageHeroImgWrap");
  const heroImg = document.getElementById("pageHeroImg");
  const heroIcon = document.getElementById("pageHeroIcon");
  const heroTitle = document.getElementById("pageHeroTitle");
  const heroOverlayText = document.getElementById("pageHeroOverlayText");
  const heroOverlayTitle = document.getElementById("pageHeroOverlayTitle");
  const heroOverlaySubtitle = document.getElementById("pageHeroOverlaySubtitle");
  const heroChangeBtn = document.getElementById("pageHeroChangeBtn");

  if (!hero || !page) return;

  const settings = getPageSettings(pageId);
  const headerSize = ["sm", "md", "lg", "xl"].includes(settings.headerSize) ? settings.headerSize : "md";
  const headerPos = normalizeHeaderPos(settings.headerPos);
  const isSystem = ["home", "search", "inbox", "notes"].includes(pageId);
  const isDatabasePage = page?.layout === "sheet";

  // hide everything on system pages
  if (isSystem || isDatabasePage) {
    hero.style.display = "none";
    return;
  }

  hero.style.display = "";

  // header image — show wrap always so "Add header" button is accessible
  heroImgWrap.style.display = "";
  heroImgWrap.dataset.hasHeader = settings.showHeader ? "true" : "false";
  heroImgWrap.dataset.heroSize = headerSize;
  heroImgWrap.dataset.hasOverlay = settings.heroOverlay && settings.showHeader ? "true" : "false";
  if (heroChangeBtn) {
    heroChangeBtn.textContent = settings.showHeader ? "Edit banner" : "+ Add banner";
  }
  if (!settings.showHeader) {
    heroImg.src = "";
    heroImg.style.display = "none";
  } else {
    heroImg.style.display = "";
    if (settings.headerSrc) heroImg.src = settings.headerSrc;
  }
  if (settings.showHeader && settings.headerSrc) {
    heroImg.src = settings.headerSrc;
  }

  if (heroOverlayText && heroOverlayTitle && heroOverlaySubtitle) {
    const isEditing = document.body.classList.contains("editing");
    const overlayTitle = String(settings.heroOverlayTitle || "").trim() || page.title || "";
    const overlaySubtitle = String(settings.heroOverlaySubtitle || "").trim();
    heroOverlayText.style.display = settings.heroOverlay && settings.showHeader ? "" : "none";
    heroOverlayTitle.textContent = overlayTitle;
    heroOverlaySubtitle.textContent = overlaySubtitle;
    heroOverlaySubtitle.style.display = overlaySubtitle || (isEditing && settings.heroOverlay && settings.showHeader) ? "" : "none";
    heroOverlayTitle.contentEditable = isEditing && settings.heroOverlay && settings.showHeader ? "true" : "false";
    heroOverlaySubtitle.contentEditable = isEditing && settings.heroOverlay && settings.showHeader ? "true" : "false";
    heroOverlayTitle.dataset.placeholder = "Type title";
    heroOverlaySubtitle.dataset.placeholder = "Type subtitle";
  }

  updateHeroPositionPreview(headerPos);

  // icon
  heroIcon.style.display = settings.showIcon ? "" : "none";
  setIconElementContent(heroIcon, page.icon, "📄");
  heroIcon.title = "Click to change icon, image, or GIF";

  // title
  heroTitle.style.display = settings.showTitle ? "" : "none";
  heroTitle.textContent = page.title || "";
  heroTitle.contentEditable = document.body.classList.contains("editing") ? "true" : "false";

  // show hero info row if either is visible
  const heroBelow = document.getElementById("pageHeroBelow");
  if (heroBelow) heroBelow.style.display = (settings.showTitle || settings.showIcon) ? "" : "none";

  // show whole hero if anything is on
  hero.style.display = (settings.showHeader || settings.showTitle || settings.showIcon || settings.heroOverlay) ? "" : "none";

  applyPageFontPreset(pageId);

  // reflect active state in cover controls
  document.querySelectorAll("[data-hero-size]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.heroSize === headerSize);
  });
}

let iconPickerPageId = null;

function refreshPageIconPickerPreview(value = "", fallback = "📄") {
  const preview = document.getElementById("pageIconPreview");
  if (!preview) return;
  setIconElementContent(preview, value, fallback);
}

function closePageIconPicker() {
  const overlay = document.getElementById("pageIconOverlay");
  overlay?.classList.remove("open");
  iconPickerPageId = null;

  if (typeof setUIState === "function") {
    const state = getUIState?.();
    if (state?.openOverlay === "pageIconOverlay") {
      setUIState({ openOverlay: null });
    }
  }
}

function savePageIconPickerSelection() {
  if (!iconPickerPageId) return;

  const input = document.getElementById("pageIconInput");
  if (!input) return;

  const typedValue = input.value.trim();
  const nextIcon = input.dataset.clear === "true"
    ? ""
    : (typedValue || input.dataset.currentIcon || "");

  const saved = applyPageIconEverywhere(iconPickerPageId, nextIcon);
  if (saved === false) {
    alert("That icon file is too large to store here. Try a smaller image or shorter GIF.");
    return;
  }

  saveCurrentPageBlocks();
  closePageIconPicker();
}

function openPageIconPicker(pageId) {
  const page = userDomains.find((d) => d.id === pageId) || userPages.find((p) => p.id === pageId);
  const overlay = document.getElementById("pageIconOverlay");
  const input = document.getElementById("pageIconInput");

  if (!page || !overlay || !input) return;

  iconPickerPageId = pageId;
  const fallback = page.type === "domain" ? "⌂" : "📄";
  const currentIcon = typeof page.icon === "string" ? page.icon : "";

  input.dataset.currentIcon = currentIcon;
  input.dataset.clear = "false";
  input.dataset.fallback = fallback;
  input.value = currentIcon.startsWith("data:image/") ? "" : currentIcon;

  refreshPageIconPickerPreview(currentIcon, fallback);

  if (typeof openOverlay === "function") {
    openOverlay("pageIconOverlay", overlay);
  } else {
    overlay.classList.add("open");
  }

  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

document.getElementById("pageIconInput")?.addEventListener("input", (e) => {
  const input = e.currentTarget;
  input.dataset.clear = "false";
  const previewValue = input.value.trim() || input.dataset.currentIcon || "";
  refreshPageIconPickerPreview(previewValue, input.dataset.fallback || "📄");
});

document.getElementById("pageIconInput")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    savePageIconPickerSelection();
  }
  if (e.key === "Escape") {
    e.preventDefault();
    closePageIconPicker();
  }
});

document.getElementById("pageIconUploadBtn")?.addEventListener("click", () => {
  const input = document.getElementById("pageIconInput");
  if (!input) return;

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*,.gif,.webp,.svg";

  fileInput.onchange = () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = typeof ev.target?.result === "string" ? ev.target.result : "";
      if (!src) return;

      input.value = "";
      input.dataset.currentIcon = src;
      input.dataset.clear = "false";
      refreshPageIconPickerPreview(src, input.dataset.fallback || "📄");
    };

    reader.readAsDataURL(file);
  };

  fileInput.click();
});

document.getElementById("pageIconClearBtn")?.addEventListener("click", () => {
  const input = document.getElementById("pageIconInput");
  if (!input) return;

  input.value = "";
  input.dataset.currentIcon = "";
  input.dataset.clear = "true";
  refreshPageIconPickerPreview("", input.dataset.fallback || "📄");
});

document.getElementById("pageIconSave")?.addEventListener("click", savePageIconPickerSelection);
document.getElementById("pageIconCancel")?.addEventListener("click", closePageIconPicker);
document.getElementById("pageIconClose")?.addEventListener("click", closePageIconPicker);
document.getElementById("pageIconOverlay")?.addEventListener("click", (e) => {
  if (e.target?.id === "pageIconOverlay") {
    closePageIconPicker();
  }
});

// header image upload
document.getElementById("pageHeroChangeBtn")?.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*,.gif";

  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target.result;
      const settings = getPageSettings(currentPageId);

      settings.headerSrc = src;
      settings.showHeader = true;

      const saved = savePageSettings(currentPageId, settings);

      if (!saved) {
        alert("That header file is too large to store here. Try a smaller image or shorter GIF.");
        return;
      }

      renderPageHero(currentPageId);
    };

    reader.readAsDataURL(file);
  };

  input.click();
});

document.querySelectorAll("[data-hero-size]").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!document.body.classList.contains("editing")) return;

    const settings = getPageSettings(currentPageId);
    settings.headerSize = btn.dataset.heroSize || "md";
    savePageSettings(currentPageId, settings);
    renderPageHero(currentPageId);
  });
});

document.getElementById("pageHeroPosSlider")?.addEventListener("input", (e) => {
  e.stopPropagation();
  if (!document.body.classList.contains("editing")) return;
  setCurrentHeroPosition(e.currentTarget.value, { persist: true });
});

let heroImageDragState = null;

document.getElementById("pageHeroImgWrap")?.addEventListener("pointerdown", (e) => {
  const wrap = e.currentTarget;
  if (!document.body.classList.contains("editing")) return;
  if (wrap.dataset.hasHeader !== "true") return;
  if (e.target.closest(".page-hero-controls") || e.target.closest(".page-hero-change-btn") || e.target.closest(".page-hero-overlay-text")) return;

  heroImageDragState = {
    startY: e.clientY,
    startPos: normalizeHeaderPos(getPageSettings(currentPageId).headerPos)
  };

  wrap.classList.add("repositioning");
  e.preventDefault();
});

window.addEventListener("pointermove", (e) => {
  if (!heroImageDragState) return;
  const deltaY = e.clientY - heroImageDragState.startY;
  const nextPos = heroImageDragState.startPos + (deltaY * 0.22);
  setCurrentHeroPosition(nextPos, { persist: false });
});

window.addEventListener("pointerup", () => {
  if (!heroImageDragState) return;
  const slider = document.getElementById("pageHeroPosSlider");
  const value = slider ? slider.value : heroImageDragState.startPos;
  setCurrentHeroPosition(value, { persist: true });
  document.getElementById("pageHeroImgWrap")?.classList.remove("repositioning");
  heroImageDragState = null;
});

// hero icon click — set emoji, image, or GIF
document.getElementById("pageHeroIcon")?.addEventListener("click", () => {
  openPageIconPicker(currentPageId);
});

// hero title inline edit
document.getElementById("pageHeroTitle")?.addEventListener("blur", () => {
  const heroTitle = document.getElementById("pageHeroTitle");
  if (!heroTitle) return;

  const newTitle = heroTitle.textContent.trim();
  if (!newTitle) return;

  applyPageRenameEverywhere(currentPageId, newTitle);
});

function saveHeroOverlayField(field) {
  const settings = getPageSettings(currentPageId);
  if (!settings.heroOverlay) return;

  const heroOverlayTitle = document.getElementById("pageHeroOverlayTitle");
  const heroOverlaySubtitle = document.getElementById("pageHeroOverlaySubtitle");
  if (!heroOverlayTitle || !heroOverlaySubtitle) return;

  if (field === "title") {
    settings.heroOverlayTitle = heroOverlayTitle.textContent.trim();
  } else if (field === "subtitle") {
    settings.heroOverlaySubtitle = heroOverlaySubtitle.textContent.trim();
  }

  savePageSettings(currentPageId, settings);
  renderPageHero(currentPageId);
}

document.getElementById("pageHeroOverlayTitle")?.addEventListener("blur", () => {
  saveHeroOverlayField("title");
});

document.getElementById("pageHeroOverlaySubtitle")?.addEventListener("blur", () => {
  saveHeroOverlayField("subtitle");
});

document.getElementById("pageHeroOverlayTitle")?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  e.currentTarget.blur();
});

document.getElementById("pageHeroOverlaySubtitle")?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  e.currentTarget.blur();
});


// == Pin Panel ==
let pinnedPages = [];
let activePinIndex = 0;

function loadPins() {
  const raw = readStorageJSON(STORAGE_KEYS.pins, []);
  pinnedPages = Array.isArray(raw)
    ? raw.map(normalizePin).filter(pin => pin.id)
    : [];
}

function savePins() {
  pinnedPages = Array.isArray(pinnedPages)
    ? pinnedPages.map(normalizePin).filter(pin => pin.id)
    : [];
  writeStorageJSON(STORAGE_KEYS.pins, pinnedPages);
}


function openPinPanel() {
  closeSidebar();
  document.getElementById("docContent")?.blur();

  if (typeof setDocUIState === "function" && typeof getDocUIState === "function") {
    const state = getDocUIState();
    if (state.editorOpen) {
      if (typeof closeDocPanels === "function") {
        closeDocPanels({
          closeInsert: true,
          closeInspector: true,
          closeSections: true,
          closeTransient: true,
          blurContent: true
        });
      }
      setDocUIState({
        pinOpen: true,
        sidebarOpen: false
      });
    }
  }

      pinViewMode = "list";
  const panel = document.getElementById("pinPanel");
  if (panel) {
    if (typeof openPanel === "function") {
      openPanel("pinPanel", panel);
    } else {
      panel.classList.add("open");
      document.body.classList.add("pin-open");
    }
  }
  renderPinPanel();
}

function closePinPanel() {
  if (typeof setDocUIState === "function" && typeof getDocUIState === "function") {
    const state = getDocUIState();
    if (state.editorOpen) {
      setDocUIState({ pinOpen: false });
    }
  }

  document.getElementById("pinPanel")?.classList.remove("open");
  document.body.classList.remove("pin-open");

  if (typeof setUIState === "function") {
    const state = getUIState?.();
    if (state?.openPanel === "pinPanel") {
      setUIState({ openPanel: null });
    }
  }
}


function pinPage(pageId) {
  const allPages = {};
  userPages.forEach(p => allPages[p.id] = p);
  userDomains.forEach(d => allPages[d.id] = d);
  const page = allPages[pageId];
  if (!page) return;

  // don't duplicate
  if (pinnedPages.find(p => p.id === pageId)) return;

  pinnedPages.push({ id: pageId, title: page.title, type: page.type || "canvas", icon: page.icon || "" });
  activePinIndex = pinnedPages.length - 1;
  savePins();
  renderSidebarPins();
}

function unpinPage(pageId) {
  pinnedPages = pinnedPages.filter(p => p.id !== pageId);
  activePinIndex = Math.min(activePinIndex, pinnedPages.length - 1);
  savePins();
  renderPinPanel();
  renderSidebarPins();
}

function renderPinList() {
  const list = document.getElementById("pinList");
  if (!list) return;

  list.innerHTML = "";

  if (!pinnedPages.length) {
    list.innerHTML = `<div style="font-size:12px;color:var(--muted3);padding:4px 6px;">No pins yet.</div>`;
    return;
  }

  pinnedPages.forEach((pin, i) => {
    const item = document.createElement("div");
    item.className = "pin-list-item" + (i === activePinIndex ? " active" : "");
    item.innerHTML = `
      ${getIconMarkup(pin.icon, "📄", "item-icon")}
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML(pin.title)}</span>
      <span class="pin-list-unpin" data-id="${pin.id}">unpin</span>
    `;
    item.addEventListener("click", (e) => {
      if (e.target.classList.contains("pin-list-unpin")) {
        unpinPage(e.target.dataset.id);
        return;
      }
      activePinIndex = i;
      renderPinList();
      renderPinPanel();
    });
    list.appendChild(item);
  });
}


function updatePinBtn() {
  const btn = document.getElementById("pinCurrentBtn");
  if (!btn) return;
  const isPinned = pinnedPages.some(p => p.id === currentPageId);
  btn.textContent = isPinned ? "📍" : "📌";
}


let pinViewMode = "list"; // "list" | "page"

function renderPinPanel() {
  if (pinViewMode === "list") {
    renderPinList();
    renderPinListView();
  } else {
    renderPinPageView();
  }
}

function renderPinListView() {
  const content = document.getElementById("pinContent");
  if (!content) return;
  resetPinPanelHeader();

  if (!pinnedPages.length) {
    content.innerHTML = `<div class="pin-empty">No pins yet. Navigate to a page and click 📌 to pin it.</div>`;
    return;
  }

  content.innerHTML = "";

  pinnedPages.forEach((pin, i) => {
    const item = document.createElement("div");
    item.className = "pin-list-big-item";
    item.innerHTML = `
      ${getIconMarkup(pin.icon, "📄", "pin-list-big-icon")}
      <div class="pin-list-big-info">
        <div class="pin-list-big-title">${escapeHTML(pin.title)}</div>
        <div class="pin-list-big-type">${escapeHTML(pin.type)}</div>
      </div>
      <span class="pin-list-unpin" data-id="${pin.id}">unpin</span>
    `;
    item.addEventListener("click", (e) => {
      if (e.target.classList.contains("pin-list-unpin")) {
        unpinPage(e.target.dataset.id);
        renderPinPanel();
        return;
      }
      activePinIndex = i;
      pinViewMode = "page";
      renderPinPanel();
    });
    content.appendChild(item);
  });
}

function renderPinPageView() {
  const content = document.getElementById("pinContent");
  if (!content) return;

  const pin = pinnedPages[activePinIndex];
  if (!pin) { pinViewMode = "list"; renderPinPanel(); return; }

  const allPages = {};
  userPages.forEach(p => allPages[p.id] = p);
  userDomains.forEach(d => allPages[d.id] = d);
  const page = allPages[pin.id];
  const icon = page?.icon || pin.icon || "📄";

  // update the shared header
  const titleEl = document.getElementById("pinPanelTitle");
  const headerRight = document.getElementById("pinPanelHeaderRight");
  if (titleEl) {
    titleEl.innerHTML = `
      <button class="pin-back-btn" id="pinBackBtn">‹ Pins</button>
      <span class="pin-page-topbar-title">${getIconMarkup(icon, "📄", "pin-page-title-icon")}<span>${escapeHTML(pin.title)}</span></span>
    `;
    document.getElementById("pinBackBtn").addEventListener("click", () => {
      pinViewMode = "list";
      renderPinPanel();
    });
  }
  if (headerRight) {
    headerRight.innerHTML = `
      <button class="pin-nav-btn" id="pinPrevBtn2">‹</button>
      <button class="pin-nav-btn" id="pinNextBtn2">›</button>
      <button class="pin-panel-close" id="pinPanelClose">✕</button>
    `;
    document.getElementById("pinPrevBtn2").addEventListener("click", () => {
      if (!pinnedPages.length) return;
      activePinIndex = (activePinIndex - 1 + pinnedPages.length) % pinnedPages.length;
      renderPinPageView();
    });
    document.getElementById("pinNextBtn2").addEventListener("click", () => {
      if (!pinnedPages.length) return;
      activePinIndex = (activePinIndex + 1) % pinnedPages.length;
      renderPinPageView();
    });
    document.getElementById("pinPanelClose").addEventListener("click", closePinPanel);
  }

  // clear content area
  content.innerHTML = "";

  // load blocks
  const all = readAllPageBlocks();
  const blocks = Array.isArray(all[pin.id]) ? all[pin.id] : [];

  if (!blocks.length) {
    content.innerHTML = `<div class="pin-empty" style="padding:16px;">This page has no blocks yet.</div>`;
    return;
  }

  let maxX = 0, maxY = 0;
  blocks.forEach(data => {
    maxX = Math.max(maxX, (data.x || 0) + (data.w || 200));
    maxY = Math.max(maxY, (data.y || 0) + (data.h || 48));
  });

  // viewport = the full content area
  const viewport = document.createElement("div");
  viewport.className = "pin-viewport";

  // canvas = the actual positioned blocks, bigger than viewport
  const canvas = document.createElement("div");
  canvas.className = "pin-canvas";
  canvas.style.width = `${maxX}px`;
  canvas.style.height = `${maxY}px`;
  canvas.style.position = "relative";

  blocks.forEach(data => {
    const block = document.createElement("div");
    block.className = "pin-canvas-block";
    block.style.left = `${data.x || 0}px`;
    block.style.top = `${data.y || 0}px`;
    block.style.width = `${data.w || 200}px`;
    block.style.minHeight = `${data.h || 48}px`;
    block.style.fontSize = "13px";

    if (data.bg) block.style.backgroundColor = data.bg;
    if (data.borderColor) block.style.borderColor = data.borderColor;
    if (data.textColor) block.style.color = data.textColor;
    if (data.radius) block.style.borderRadius = data.radius;

    if (data.type === "text" || data.type === "list") {
      const text = (data.bodyHTML || "").replace(/<[^>]*>/g, " ").trim();
      block.textContent = text || "";
    } else if (data.type === "container") {
      block.textContent = getSerializedBlockSearchText(data) || "Frame";
    } else if (data.type === "page") {
      block.innerHTML = `<span style="opacity:0.6;">📄 ${data.pageCardTitle || "Page"}</span>`;
    } else if (data.type === "domain") {
      block.innerHTML = `<span style="opacity:0.6;">⌂ ${data.pageCardTitle || "Domain"}</span>`;
    } else if (data.type === "image") {
      const img = (data.bodyHTML || "").match(/src="([^"]+)"/);
      if (img) {
        block.innerHTML = `<img src="${img[1]}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" />`;
      } else {
        block.innerHTML = `<span style="opacity:0.4;">🖼</span>`;
      }
    }

    canvas.appendChild(block);
  });

  viewport.appendChild(canvas);
  content.appendChild(viewport);

  // drag to pan
  let isDragging = false;
  let startX, startY, scrollLeft, scrollTop;

  viewport.addEventListener("mousedown", (e) => {
    // only drag with actual mouse click, not trackpad scroll
    if (e.buttons !== 1) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    scrollLeft = viewport.scrollLeft;
    scrollTop = viewport.scrollTop;
    viewport.style.cursor = "grabbing";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    viewport.scrollLeft = scrollLeft - (e.clientX - startX);
    viewport.scrollTop = scrollTop - (e.clientY - startY);
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
    viewport.style.cursor = "grab";
  });

  // zoom
  let scale = 1;
  const MIN_SCALE = 0.3;
  const MAX_SCALE = 1.5;

  const zoomIndicator = document.createElement("div");
  zoomIndicator.className = "pin-zoom-indicator";
  zoomIndicator.textContent = "100%";
  zoomIndicator.title = "Click to reset zoom";
  viewport.appendChild(zoomIndicator);

  function applyZoom() {
    canvas.style.transformOrigin = "0 0";
    canvas.style.transform = `scale(${scale})`;
    canvas.style.width = `${maxX}px`;
    canvas.style.height = `${maxY}px`;
    // update the viewport's scroll container size to match scaled canvas
    viewport.style.setProperty("--scaled-w", `${maxX * scale}px`);
    viewport.style.setProperty("--scaled-h", `${maxY * scale}px`);
    zoomIndicator.textContent = `${Math.round(scale * 100)}%`;
  }

  viewport.addEventListener("wheel", (e) => {
    // pinch to zoom on trackpad sends ctrlKey = true
    if (e.ctrlKey) {
      e.preventDefault();
      const delta = e.deltaY * -0.005;
      scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale + delta));
      applyZoom();
      return;
    }
    // otherwise let it scroll naturally (two finger pan)
  }, { passive: false });

  // pinch to zoom
  let lastPinchDist = null;
  viewport.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
      lastPinchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  });
  viewport.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2 && lastPinchDist !== null) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = (dist - lastPinchDist) * 0.005;
      scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale + delta));
      lastPinchDist = dist;
      applyZoom();
    }
  }, { passive: false });
  viewport.addEventListener("touchend", () => { lastPinchDist = null; });

  zoomIndicator.addEventListener("click", () => {
    scale = 1;
    applyZoom();
  });

  applyZoom();
}

// prev/next handled inside renderPinPageView

document.getElementById("pinPanelClose")?.addEventListener("click", closePinPanel);

function resetPinPanelHeader() {
  const titleEl = document.getElementById("pinPanelTitle");
  const headerRight = document.getElementById("pinPanelHeaderRight");
  if (titleEl) titleEl.textContent = "Pins";
  if (headerRight) headerRight.innerHTML = `<button class="pin-panel-close" id="pinPanelClose">✕</button>`;
  document.getElementById("pinPanelClose")?.addEventListener("click", closePinPanel);
}

// ⎘ button opens panel
document.getElementById("PinsBtn")?.addEventListener("click", () => openPinPanel());



// == Bookmarks ==
let bookmarks = readStorageJSON(STORAGE_KEYS.bookmarks, []);

function saveBookmarks() {
  writeStorageJSON(STORAGE_KEYS.bookmarks, bookmarks);
}

function updateBookmarkBtn(pageId) {
  const btn = document.getElementById("bookmarkBtn");
  if (!btn) return;
  const isBookmarked = bookmarks.includes(pageId);
  btn.classList.toggle("bookmarked", isBookmarked);
  btn.title = isBookmarked ? "Remove bookmark" : "Bookmark";
}

document.getElementById("bookmarkBtn")?.addEventListener("click", () => {
  const isDomain = userDomains.some(d => d.id === currentPageId);
  const isPage = userPages.some(p => p.id === currentPageId);
  if (!isDomain && !isPage) return;

  const isBookmarked = bookmarks.includes(currentPageId);
  if (isBookmarked) {
    bookmarks = bookmarks.filter(id => id !== currentPageId);
  } else {
    bookmarks.push(currentPageId);
  }
  saveBookmarks();
  updateBookmarkBtn(currentPageId);
  renderSidebarBookmarks();
});

document.getElementById("pinCurrentBtn")?.addEventListener("click", () => {
  const isDomain = userDomains.some(d => d.id === currentPageId);
  const isPage = userPages.some(p => p.id === currentPageId);
  if (!isDomain && !isPage) return;

  const alreadyPinned = pinnedPages.find(p => p.id === currentPageId);
  if (alreadyPinned) {
    unpinPage(currentPageId);
  } else {
    pinPage(currentPageId);
  }
  updatePinBtn();
});





// == Inline Links ==
let inlineLinkActive = false;
let inlineLinkStartOffset = null;
let inlineLinkAnchorNode = null;

function getAllVaultPages() {
  const results = [];
  userDomains.forEach((domain) => results.push({
    id: domain.id,
    title: domain.title,
    icon: domain.icon || "⌂",
    type: "domain",
    category: "none",
    layout: "board-canvas",
    containerType: "domain",
    summary: ""
  }));
  userPages.forEach((page) => results.push({
    id: page.id,
    title: page.title,
    icon: page.icon || "📄",
    type: "page",
    category: page.category || "none",
    layout: page.layout || "board-canvas",
    containerType: page.containerType || "page",
    summary: page.summary || ""
  }));
  return results;
}

function checkInlineLinkTrigger(editable) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const range = sel.getRangeAt(0);
  const preRange = document.createRange();
  preRange.selectNodeContents(editable);
  preRange.setEnd(range.startContainer, range.startOffset);
  const textBefore = preRange.toString();

  const bracketIdx = textBefore.lastIndexOf("[");
  if (bracketIdx === -1) {
    closeInlineLinkPopup();
    return;
  }

  // check nothing closed the bracket after it opened
  const afterBracket = textBefore.slice(bracketIdx + 1);
  if (afterBracket.includes("]")) {
    closeInlineLinkPopup();
    return;
  }

  const query = afterBracket;
  inlineLinkActive = true;
  showInlineLinkPopup(query, range, editable);
}

function showInlineLinkPopup(query, range, editable) {
  let popup = document.getElementById("inlineLinkPopup");
  if (!popup) {
    popup = document.createElement("div");
    popup.id = "inlineLinkPopup";
    popup.className = "inline-link-popup";
    document.body.appendChild(popup);
  }

  const allPages = getAllVaultPages();
  const q = query.toLowerCase();
  const matches = allPages
    .filter(p => p.title.toLowerCase().includes(q))
    .slice(0, 8);

  if (!matches.length) {
    popup.style.display = "none";
    return;
  }

  popup.innerHTML = "";
  matches.forEach((page, i) => {
    const item = document.createElement("div");
    item.className = "inline-link-item";
    item.innerHTML = `${getIconMarkup(page.icon, page.type === "domain" ? "⌂" : "📄", "inline-link-icon")}<span class="inline-link-title">${escapeHTML(page.title)}</span>`;
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      insertInlineLink(page, query, editable);
    });
    popup.appendChild(item);
  });

  // position popup near cursor
  const rect = range.getBoundingClientRect();
  popup.style.display = "block";
  popup.style.top = `${rect.bottom + window.scrollY + 4}px`;
  popup.style.left = `${rect.left + window.scrollX}px`;
}

function insertInlineLink(page, query, editable) {
  // find and replace the [query text with a link chip
  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const range = sel.getRangeAt(0);
  const preRange = document.createRange();
  preRange.selectNodeContents(editable);
  preRange.setEnd(range.startContainer, range.startOffset);
  const textBefore = preRange.toString();
  const bracketIdx = textBefore.lastIndexOf("[");

  // move range back to the [ and delete everything from there to cursor
  const fullRange = document.createRange();
  fullRange.setStart(range.startContainer, range.startOffset - (textBefore.length - bracketIdx));
  fullRange.setEnd(range.startContainer, range.startOffset);
  fullRange.deleteContents();

  // insert the link element
  const link = document.createElement("span");
  link.className = "inline-link";
  link.dataset.pageId = page.id;
  link.textContent = page.title;
  link.contentEditable = "false";

  fullRange.insertNode(link);

  // move cursor after the link
  const afterRange = document.createRange();
  afterRange.setStartAfter(link);
  afterRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(afterRange);

  closeInlineLinkPopup();
  autoGrowBlock(editable.closest(".block"));
  saveState();
}

function closeInlineLinkPopup() {
  inlineLinkActive = false;
  const popup = document.getElementById("inlineLinkPopup");
  if (popup) popup.style.display = "none";
}

// close popup on click outside
document.addEventListener("mousedown", (e) => {
  if (!e.target.closest("#inlineLinkPopup")) {
    closeInlineLinkPopup();
  }

  if (!e.target.closest("#canvasSlashMenu")) {
    window.closeCanvasSlashMenu?.();
  }
});

// keyboard nav in popup + escape
document.addEventListener("keydown", (e) => {
  const popup = document.getElementById("inlineLinkPopup");
  if (!popup || popup.style.display === "none") return;

  if (e.key === "Escape") {
    closeInlineLinkPopup();
    return;
  }

  const items = popup.querySelectorAll(".inline-link-item");
  const active = popup.querySelector(".inline-link-item.active");
  let idx = Array.from(items).indexOf(active);

  if (e.key === "ArrowDown") {
    e.preventDefault();
    idx = (idx + 1) % items.length;
    items.forEach(i => i.classList.remove("active"));
    items[idx].classList.add("active");
  }

  if (e.key === "ArrowUp") {
    e.preventDefault();
    idx = (idx - 1 + items.length) % items.length;
    items.forEach(i => i.classList.remove("active"));
    items[idx].classList.add("active");
  }

  if (e.key === "Enter" && active) {
    e.preventDefault();
    active.dispatchEvent(new MouseEvent("mousedown"));
  }
});


// == Peek Drawer ==
let activePeekId = null;

function findReferencesTo(pageId) {
  const refs = {};

  // scan canvas blocks
  const allBlocks = readAllPageBlocks();
  Object.entries(allBlocks).forEach(([hostPageId, blocks]) => {
    const safeBlocks = Array.isArray(blocks) ? blocks : [];

    safeBlocks.forEach(block => {
      const html = getSerializedBlockReferenceHTML(block);
      const matches = [...html.matchAll(/data-page-id=["']([^"']+)["']/g)];

      matches.forEach(match => {
        if (match[1] === pageId) {
          if (!refs[hostPageId]) refs[hostPageId] = 0;
          refs[hostPageId]++;
        }
      });

      if (block.linkedPageId === pageId && hostPageId !== pageId) {
        if (!refs[hostPageId]) refs[hostPageId] = 0;
        refs[hostPageId]++;
      }

      getSerializedContainerItems(block).forEach((item) => {
        if (item.linkedPageId === pageId && hostPageId !== pageId) {
          if (!refs[hostPageId]) refs[hostPageId] = 0;
          refs[hostPageId]++;
        }
      });
    });
  });

  // scan document sections
  const allDocs = readStorageJSON(STORAGE_KEYS.documents, {});
  Object.entries(allDocs).forEach(([docPageId, data]) => {
    const sections = Array.isArray(data?.sections) ? data.sections : [];

    sections.forEach(section => {
      const html = section.content || "";
      const matches = [...html.matchAll(/data-page-id=["']([^"']+)["']/g)];
      matches.forEach(match => {
        if (match[1] === pageId) {
          if (!refs[docPageId]) refs[docPageId] = 0;
          refs[docPageId]++;
        }
      });
    });
  });

  const allPages = {};
  userPages.forEach(p => allPages[p.id] = p);
  userDomains.forEach(d => allPages[d.id] = d);
  allPages["home"] = { id: "home", title: "Home", icon: "🏠" };

  return Object.entries(refs)
    .filter(([id]) => id !== pageId)
    .map(([id, count]) => ({
      pageId: id,
      title: allPages[id]?.title || "Unknown page",
      icon: allPages[id]?.icon || "📄",
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

function htmlToPeekNotesText(html = "") {
  const sourceHTML = String(html || "").trim();
  if (!sourceHTML) return "";
  const temp = document.createElement("div");
  temp.innerHTML = sourceHTML
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "</$1>\n");
  return String(temp.textContent || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function serializePeekNotesHTML(text = "") {
  const normalized = String(text || "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";
  return `<p>${escapeHTML(normalized).replace(/\n/g, "<br>")}</p>`;
}

function readPeekPageNotes(pageId) {
  if (typeof window.readAllDocuments !== "function") return "";
  const documents = window.readAllDocuments() || {};
  const doc = documents?.[pageId] || {};
  const sections = Array.isArray(doc.sections) ? doc.sections : [];
  return htmlToPeekNotesText(sections[0]?.content || "");
}

function savePeekPageNotes(pageId, text = "") {
  if (typeof window.readAllDocuments !== "function" || typeof window.writeAllDocuments !== "function") return;
  const documents = window.readAllDocuments() || {};
  const existing = documents?.[pageId] && typeof documents[pageId] === "object" ? documents[pageId] : {};
  const firstSection = existing.sections?.[0] && typeof existing.sections[0] === "object" ? existing.sections[0] : {};

  const sections = [{
    ...firstSection,
    title: String(firstSection.title || "Notes").trim() || "Notes",
    content: serializePeekNotesHTML(text)
  }];

  documents[pageId] = {
    ...existing,
    sections
  };

  window.writeAllDocuments(documents);
}

function syncPeekDrawerLayout(drawer) {
  if (!drawer) return;
  const topbarBottom = Math.max(0, Math.round(document.querySelector(".topbar")?.getBoundingClientRect?.().bottom || 0));
  drawer.style.top = `${topbarBottom}px`;
  drawer.style.height = `calc(100vh - ${topbarBottom}px)`;
}

function openPeek(pageId) {
  const allPages = {};
  userPages.forEach(p => allPages[p.id] = p);
  userDomains.forEach(d => allPages[d.id] = d);
  const page = allPages[pageId];
  if (!page) return;

  activePeekId = pageId;

  let drawer = document.getElementById("peekDrawer");
  if (!drawer) {
    drawer = document.createElement("div");
    drawer.id = "peekDrawer";
    document.getElementById("main").appendChild(drawer);
  }
  syncPeekDrawerLayout(drawer);

  const icon = page.icon || (page.type === "domain" ? "⌂" : "📄");
  const rowPeekData = typeof window.getDatabaseRowPeekData === "function"
    ? window.getDatabaseRowPeekData(pageId)
    : null;
  const displayTitle = rowPeekData?.title || page.title || "Untitled";
  const displayType = rowPeekData?.typeLabel || page.category || page.layout || "page";
  const displayIcon = rowPeekData ? (rowPeekData.icon || "📄") : icon;
  const rowCoverSource = rowPeekData?.coverSource || "";
  const summary = rowPeekData ? readPeekPageNotes(pageId) : (page.summary || "");

  const refs = findReferencesTo(pageId);
  const refsHTML = refs.length ? `
    <div class="peek-refs">
      <div class="peek-refs-label">Referenced in</div>
      ${refs.map(ref => `
        <div class="peek-ref-item" data-page-id="${ref.pageId}">
          ${getIconMarkup(ref.icon, "📄", "peek-ref-icon")}
          <span class="peek-ref-title">${escapeHTML(ref.title)}</span>
          <span class="peek-ref-count">${ref.count}×</span>
        </div>
      `).join("")}
    </div>
  ` : "";

  const rowBodyHTML = rowPeekData
    ? rowPeekData.missing
      ? `<div class="peek-summary-placeholder">This row is no longer available.</div>`
      : `
        <div class="peek-row-properties">
          <div class="peek-row-property-list">
            ${rowPeekData.properties.length
              ? rowPeekData.properties.map((property) => `
                  <div class="peek-row-property">
                    <div class="peek-row-property-meta">
                      <span class="peek-row-property-icon" aria-hidden="true">${escapeHTML(property.icon || "")}</span>
                      <span class="peek-row-property-label">${escapeHTML(property.label || "Property")}</span>
                    </div>
                    <div class="peek-row-property-value">${property.editorHTML || property.valueHTML}</div>
                  </div>
                `).join("")
              : `<div class="peek-summary-placeholder">No properties yet.</div>`
            }
            <button type="button" id="peekAddPropertyBtn" class="peek-row-add-property"><span class="peek-row-add-property-icon" aria-hidden="true">+</span><span>Add property</span></button>
          </div>
        </div>
        <div class="peek-row-section peek-row-notes">
          <div class="peek-row-section-label">Notes</div>
          <textarea id="peekRowNotesInput" class="peek-row-notes-input" placeholder="Start typing notes...">${escapeHTML(summary)}</textarea>
        </div>
      `
    : "";

  const rowCoverHTML = rowPeekData && !rowPeekData.missing
    ? `
      <div class="peek-cover${rowCoverSource ? " has-image" : " is-empty"}">
        ${rowCoverSource ? `<img src="${escapeHTML(rowCoverSource)}" alt="" class="peek-cover-image" />` : '<div class="peek-cover-placeholder"></div>'}
        <button type="button" id="peekRowCoverBtn" class="peek-cover-btn">${rowCoverSource ? "Change cover" : "Add cover"}</button>
      </div>
    `
    : "";

  drawer.innerHTML = `
    <div class="peek-scroll">
      ${rowCoverHTML}
      <div class="peek-header">
        ${getIconMarkup(displayIcon, page.type === "domain" ? "⌂" : "📄", "peek-icon")}
        <div>
          <div class="peek-title">${escapeHTML(displayTitle)}</div>
          <div class="peek-type">${escapeHTML(displayType)}</div>
        </div>
      </div>
      <div class="peek-summary">
        ${rowPeekData
          ? rowBodyHTML
          : (summary
              ? `<div class="peek-summary-text">${escapeHTML(summary)}</div>`
              : `<div class="peek-summary-placeholder">No summary yet.</div>`
            )
        }
      </div>
      ${refsHTML}
    </div>
    <div class="peek-actions">
      <button class="peek-btn" id="peekOpenBtn">Open Page</button>
      ${rowPeekData ? "" : '<button class="peek-btn" id="peekPinBtn">Pin</button>'}
      <button class="peek-btn peek-btn-close" id="peekCloseBtn">Close</button>
    </div>
  `;

  drawer.dataset.peekPageId = pageId;
  if (rowPeekData?.sourceKind) {
    drawer.dataset.peekDbKind = rowPeekData.sourceKind;
    drawer.dataset.peekDbPageId = rowPeekData.sourcePageId || "";
    drawer.dataset.peekDbBlockId = rowPeekData.sourceBlockId || "";
  } else {
    delete drawer.dataset.peekDbKind;
    delete drawer.dataset.peekDbPageId;
    delete drawer.dataset.peekDbBlockId;
  }

  if (typeof openOverlay === "function") {
    openOverlay("peekDrawer", drawer);
    closeAllPanels(["pinPanel"]);
  } else {
    drawer.classList.add("open");
  }

  document.getElementById("peekOpenBtn").addEventListener("click", () => {
    closePeek();
    openPage(pageId);
  });

  document.getElementById("peekPinBtn")?.addEventListener("click", () => {
    pinReference(pageId);
  });

  document.getElementById("peekCloseBtn").addEventListener("click", closePeek);

  const rowNotesInput = document.getElementById("peekRowNotesInput");
  if (rowPeekData && rowNotesInput) {
    rowNotesInput.addEventListener("input", () => {
      window.clearTimeout(drawer._peekNotesSaveTimer);
      drawer._peekNotesSaveTimer = window.setTimeout(() => {
        savePeekPageNotes(pageId, rowNotesInput.value || "");
      }, 120);
    });
  }

  document.getElementById("peekAddPropertyBtn")?.addEventListener("click", (event) => {
    if (rowNotesInput) {
      savePeekPageNotes(pageId, rowNotesInput.value || "");
    }
    if (typeof window.openDatabaseRowPropertyComposer === "function") {
      window.openDatabaseRowPropertyComposer(pageId, event.currentTarget);
    }
  });

  document.getElementById("peekRowCoverBtn")?.addEventListener("click", (event) => {
    if (rowNotesInput) {
      savePeekPageNotes(pageId, rowNotesInput.value || "");
    }
    if (typeof window.openDatabaseRowCoverMenu === "function") {
      window.openDatabaseRowCoverMenu(pageId, event.currentTarget);
    }
  });

  drawer.querySelectorAll(".peek-ref-item").forEach(item => {
    item.addEventListener("click", () => {
      const targetId = item.dataset.pageId;
      closePeek();
      openPage(targetId);
    });
  });
}

function closePeek() {
  const drawer = document.getElementById("peekDrawer");
  if (drawer) drawer.classList.remove("open");
  activePeekId = null;

  if (typeof setUIState === "function") {
    const state = getUIState?.();
    if (state?.openOverlay === "peekDrawer") {
      setUIState({ openOverlay: null });
    }
  }
}

function pinReference(pageId) {
  pinPage(pageId);
  closePeek();
  openPinPanel();
}

window.addEventListener("resize", () => {
  const drawer = document.getElementById("peekDrawer");
  if (drawer) syncPeekDrawerLayout(drawer);
});

// == Simple page switching ==
const pageTitle = document.getElementById("pageTitle");

const navHome = document.getElementById("navHome");
const navSearch = document.getElementById("navSearch");
const navInbox = document.getElementById("navInbox");
const navNotes = document.getElementById("navNotes");

navHome.addEventListener("click", (e) => { e.preventDefault(); closeSearch(); openPage("home"); });
navInbox.addEventListener("click", (e) => { e.preventDefault(); closeSearch(); openPage("inbox"); });
navNotes?.addEventListener("click", (e) => { e.preventDefault(); closeSearch(); openPage("notes"); });
navSearch.addEventListener("click", (e) => { e.preventDefault(); openSearch(); });


// == Move To / Rename modals ==
function openMoveToModal(page) {
  closeAllOverlays();
  const allParents = [
    { id: "home", title: "Home" },
    ...userDomains.map(d => ({ id: d.id, title: d.title })),
    ...userPages.filter(p => p.id !== page.id).map(p => ({ id: p.id, title: p.title })),
  ];

  const overlay = document.createElement("div");
  overlay.className = "generic-modal-overlay open";
  overlay.dataset.uiId = "moveToModal";
  overlay.innerHTML = `
    <div class="generic-modal">
      <div class="generic-modal-title">Move "${escapeHTML(page.title)}" to</div>
      <input class="generic-modal-search" placeholder="Filter..." autocomplete="off" />
      <div class="generic-modal-list"></div>
    </div>
  `;

  const searchEl = overlay.querySelector(".generic-modal-search");
  const listEl = overlay.querySelector(".generic-modal-list");

  function renderList(filter) {
    listEl.innerHTML = "";
    const f = (filter || "").toLowerCase();
    for (const p of allParents) {
      if (f && !p.title.toLowerCase().includes(f)) continue;
      if (p.id === page.parent) continue;
      const row = document.createElement("div");
      row.className = "generic-modal-row";
      row.textContent = p.title;
      row.addEventListener("click", () => {
        page.parent = p.id;
        saveSanctumRegistry();
        renderBreadcrumbs(currentPageId);
        renderSidebarDomains();
        overlay.remove();
      });
      listEl.appendChild(row);
    }
  }

  searchEl.addEventListener("input", () => renderList(searchEl.value));
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
  renderList("");
  setTimeout(() => searchEl.focus(), 30);
}

function openRenameModal(targetId, currentTitle) {
  closeAllOverlays();
  const overlay = document.createElement("div");
  overlay.className = "generic-modal-overlay open";
  overlay.dataset.uiId = "renameModal";
  overlay.innerHTML = `
    <div class="generic-modal">
      <div class="generic-modal-title">Rename</div>
      <input class="generic-modal-search" value="${escapeHTML(currentTitle)}" autocomplete="off" />
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
        <button class="settings-btn" id="renameCancelBtn">Cancel</button>
        <button class="settings-btn" id="renameConfirmBtn">Rename</button>
      </div>
    </div>
  `;

  const inputEl = overlay.querySelector(".generic-modal-search");

  function doRename() {
    const val = inputEl.value.trim();
    if (!val) return;
    applyPageRenameEverywhere(targetId, val);
    overlay.remove();
  }

  overlay.querySelector("#renameConfirmBtn").addEventListener("click", doRename);
  overlay.querySelector("#renameCancelBtn").addEventListener("click", () => overlay.remove());
  inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") doRename(); });
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
  setTimeout(() => { inputEl.focus(); inputEl.select(); }, 30);
}

// == More button dropdown ==
function openCurrentPageMoreMenu(anchorEl, options = {}) {
  if (!anchorEl) return;

  if (typeof getDocUIState === "function" && typeof handleDocMajorOverlayOpen === "function") {
    const state = getDocUIState();
    if (state.editorOpen) {
      handleDocMajorOverlayOpen("topbarMenu");
    }
  }

  const isDomain = userDomains.some(d => d.id === currentPageId);
  const isPage   = userPages.some(p => p.id === currentPageId);
  const isHome   = currentPageId === "home";
  const isInbox  = currentPageId === "inbox";

  const items = [];
  const keepMoreMenuOpen = (action, submenuPath = []) => () => {
    action?.();
    window.requestAnimationFrame(() => {
      const currentAnchor = document.getElementById("moreBtn");
      if (!currentAnchor) return;
      openCurrentPageMoreMenu(currentAnchor, { defaultOpenPath: submenuPath });
    });
  };

  if (isDomain || isPage) {
    const currentPage = isDomain
      ? userDomains.find(d => d.id === currentPageId)
      : userPages.find(p => p.id === currentPageId);

    items.push({
  label: "Rename",
  action: () => {
    openRenameModal(currentPageId, currentPage?.title || "");
  }
});

    if (isPage) items.push({
      label: "Duplicate",
      action: () => {
        const orig = userPages.find(p => p.id === currentPageId);
        if (!orig) return;
        const copy = {
          ...orig,
          id: `page-${Date.now()}`,
          title: `${orig.title} (copy)`,
        };
        userPages.push(copy);
        saveSanctumRegistry();

        // copy blocks
        const all = readAllPageBlocks();
        all[copy.id] = JSON.parse(JSON.stringify(all[orig.id] || []));
        writeAllPageBlocks(all);

        openPage(copy.id);
      }
    });

    if (isPage) items.push({
      label: "Move to",
      action: () => {
        const page = userPages.find(p => p.id === currentPageId);
        if (!page) return;
        openMoveToModal(page);
      }
    });

    // display toggles — not applicable on document layout pages
    const isDocPage = (currentPage?.layout === "document");
    const pageSettings = getPageSettings(currentPageId);
    const fontPreset = normalizePageFontPreset(pageSettings.fontPreset);

    if (!isDocPage) {
      const saveHeroSettings = () => {
        savePageSettings(currentPageId, pageSettings);
        renderPageHero(currentPageId);
      };

      items.push({
        key: "banner-title",
        label: "Banner / title",
        children: [
          {
            key: "banner-image",
            label: pageSettings.showHeader ? "Banner image: On" : "Banner image: Off",
            action: keepMoreMenuOpen(() => {
              pageSettings.showHeader = !pageSettings.showHeader;
              saveHeroSettings();
            }, ["banner-title"])
          },
          {
            key: "banner-size",
            label: "Banner size",
            children: ["sm", "md", "lg", "xl"].map((size) => ({
              key: `banner-size-${size}`,
              label: size === "sm" ? "Small" : size === "md" ? "Medium" : size === "lg" ? "Large" : "XL",
              active: pageSettings.headerSize === size,
              action: keepMoreMenuOpen(() => {
                pageSettings.headerSize = size;
                saveHeroSettings();
              }, ["banner-title", "banner-size"])
            }))
          },
          { type: "divider" },
          {
            key: "banner-icon",
            label: pageSettings.showIcon ? "Icon below image: On" : "Icon below image: Off",
            action: keepMoreMenuOpen(() => {
              pageSettings.showIcon = !pageSettings.showIcon;
              saveHeroSettings();
            }, ["banner-title"])
          },
          { type: "divider" },
          {
            key: "title-placement",
            label: `Title placement: ${getHeroTitlePlacementLabel(pageSettings)}`,
            action: keepMoreMenuOpen(() => {
              cycleHeroTitlePlacement(pageSettings, currentPage);
              saveHeroSettings();
            }, ["banner-title"])
          }
        ]
      });
    }

    items.push({
      key: "page-font",
      label: `Page Font: ${getPageFontPresetMeta(fontPreset).label}`,
      children: Object.entries(PAGE_FONT_PRESETS).map(([presetKey, meta]) => ({
        key: `page-font-${presetKey}`,
        label: meta.label,
        active: presetKey === fontPreset,
        fontFamily: meta.family || "",
        action: keepMoreMenuOpen(() => {
          pageSettings.fontPreset = presetKey;
          savePageSettings(currentPageId, pageSettings);
          applyPageFontPreset(currentPageId);
          renderPageHero(currentPageId);
        }, ["page-font"])
      }))
    });

    items.push({
      key: "page-theme",
      label: `Page Theme: ${getPageThemeLabel(pageSettings.theme)}`,
      children: [
        { value: "", label: `Use workspace (${getPageThemeLabel(getWorkspaceTheme())})` },
        { value: "dark", label: "Dark" },
        { value: "light", label: "Light" }
      ].map((themeOption) => ({
        key: `page-theme-${themeOption.value || "workspace"}`,
        label: themeOption.label,
        active: normalizePageThemeOverride(pageSettings.theme) === themeOption.value,
        action: keepMoreMenuOpen(() => {
          pageSettings.theme = themeOption.value;
          savePageSettings(currentPageId, pageSettings);
          applyResolvedTheme(currentPageId);
        }, ["page-theme"])
      }))
    });

    items.push({ type: "divider" });

    items.push({
      label: "Trash",
      danger: true,
      action: () => {
        const name = currentPage?.title || "this page";
        const confirmed = confirm(`Move "${name}" to Trash? You can restore it later.`);
        if (!confirmed) return;

        if (isDomain) {
          moveDomainToTrash(currentPageId);
          hasOpenedPage = false;
          openPage("home");
          return;
        }

        if (isPage) {
          movePageToTrash(currentPageId);
          hasOpenedPage = false;
          openPage("home");
          return;
        }

        openPage("home");
      }
    });
  }

  if (isHome || isInbox) {
    items.push({ label: "More options coming soon", danger: false, action: () => {} });
  }

  if (items.length) openTopbarDropdown(anchorEl, items, options);
}

document.getElementById("moreBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  openCurrentPageMoreMenu(e.currentTarget);
});

// == Layout mode (edit mode) ==
const editToggle = document.getElementById("editToggle");


editToggle.addEventListener("click", () => {
  const pageObj = userPages.find(p => p.id === currentPageId);
  const isDocPage = pageObj?.layout === "document";
  // Chronicle removed — no layout-specific toolbar overrides needed

  if (isDocPage) {
    if (typeof setDocUIState === "function") {
      setDocUIState({ mode: "annotate" });
    }
    openDocAnnotateDock();
    return;
  }

  const willBeEditing = !document.body.classList.contains("editing");

  // if turning ON edit mode, close sidebar so canvas stays stable
  if (willBeEditing) {
    closeSidebar();
  }

  document.body.classList.toggle("editing", willBeEditing);

  // update hero title editability to match new mode
  renderPageHero(currentPageId);

  // if turning OFF edit mode, clean up state
  if (!willBeEditing) {
    if (typeof clearSelection === "function") clearSelection();
    if (typeof placing !== "undefined" && placing) {
      if (typeof stopPlacing === "function") stopPlacing(true);
    }
  }
});

function exitEditMode() {
  // turn off edit mode
  document.body.classList.remove("editing");

  // clear selection if it exists
  if (typeof clearSelection === "function") clearSelection();

  // cancel place mode if it exists
  if (typeof placing !== "undefined" && placing) {
    if (typeof stopPlacing === "function") stopPlacing(true);
  }
}

function serializePageCardTargetForModal(target) {
  if (!target) return null;

  if (target.classList?.contains("frame-item")) {
    return {
      targetKind: "frame-item",
      data: serializeFrameItemElement(target)
    };
  }

  return {
    targetKind: "block",
    data: serializeBlockElement(target)
  };
}


// == Page Create Modal ==
const pageCreateOverlay = document.getElementById("pageCreateOverlay");
const pageCreateName    = document.getElementById("pageCreateName");
const pageCreateCancel  = document.getElementById("pageCreateCancel");
const pageCreateConfirm = document.getElementById("pageCreateConfirm");
const pageCreateResults = document.getElementById("pageCreateResults");
const pageCreateHideIconBtn = document.getElementById("pageCreateHideIconBtn");

let pendingPageBlock = null;
let pendingPageRestoreData = null;
let selectedLayout = "board-canvas";
let selectedCategory = "none";
let selectedContainerType = "page";
let pageCreateMode = "create";
let selectedLinkCandidateId = "";
let pageCreateHideCardIcon = false;
let pageCreateLinkTargetType = "all";

function normalizePageCreateLayout(value = "") {
  const safe = String(value || "").trim().toLowerCase();
  return ["board-canvas", "infinite-canvas", "document", "sheet"].includes(safe)
    ? safe
    : "board-canvas";
}

function isAllowedPageCreateLinkTarget(item) {
  if (!item) return false;
  if (pageCreateLinkTargetType === "domain") return item.type === "domain";
  if (pageCreateLinkTargetType === "page") return item.type === "page";
  return true;
}

function getPageCreateLinkCopy() {
  if (pageCreateLinkTargetType === "domain") {
    return {
      title: "Link Existing Domain",
      placeholder: "Search domains...",
      context: "Create a linked domain card here without making a new domain.",
      hint: "Search, then click the exact domain you want to link below.",
      empty: "No domains match that search.",
      toast: "Pick a domain to link.",
      relinkAction: "Link Different Domain"
    };
  }

  if (pageCreateLinkTargetType === "page") {
    return {
      title: "Link Existing Page",
      placeholder: "Search pages...",
      context: "Create a linked page card here without making a new page.",
      hint: "Search, then click the exact page you want to link below.",
      empty: "No pages match that search.",
      toast: "Pick a page to link.",
      relinkAction: "Link Different Page"
    };
  }

  return {
    title: "Link Existing Page or Domain",
    placeholder: "Search pages or domains...",
    context: "Create a linked card here without making anything new.",
    hint: "Search, then click the exact page or domain you want to link below.",
    empty: "No pages or domains match that search.",
    toast: "Pick a page or domain to link.",
    relinkAction: "Link Different Page or Domain"
  };
}

function getPageCreateLinkTargets(query = "") {
  const q = String(query || "").trim().toLowerCase();

  return getAllVaultPages()
    .filter((item) => item.id !== currentPageId)
    .filter((item) => isAllowedPageCreateLinkTarget(item))
    .filter((item) => !q || (item.title || "").toLowerCase().includes(q))
    .sort((a, b) => {
      const aTitle = (a.title || "").toLowerCase();
      const bTitle = (b.title || "").toLowerCase();
      const aExact = q && aTitle === q ? 1 : 0;
      const bExact = q && bTitle === q ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;

      const aStarts = q && aTitle.startsWith(q) ? 1 : 0;
      const bStarts = q && bTitle.startsWith(q) ? 1 : 0;
      if (aStarts !== bStarts) return bStarts - aStarts;

      if (a.type !== b.type) return a.type === "page" ? -1 : 1;
      return aTitle.localeCompare(bTitle);
    })
    .slice(0, 12);
}

function resolvePageCreateLinkTarget() {
  const allTargets = getAllVaultPages()
    .filter((item) => item.id !== currentPageId)
    .filter((item) => isAllowedPageCreateLinkTarget(item));

  if (selectedLinkCandidateId) {
    const selected = allTargets.find((item) => item.id === selectedLinkCandidateId);
    if (selected) return selected;
  }

  return null;
}

function syncPageCreateHideIconButton() {
  if (!pageCreateHideIconBtn) return;
  pageCreateHideIconBtn.classList.toggle("active", pageCreateHideCardIcon);
  pageCreateHideIconBtn.textContent = pageCreateHideCardIcon ? "Show card icon" : "Remove card icon";
}

function syncPageCreateConfirmState() {
  if (!pageCreateConfirm) return;
  pageCreateConfirm.disabled = pageCreateMode === "link" && !selectedLinkCandidateId;
}

function renderPageCreateLinkResults() {
  if (!pageCreateResults) return;

  if (pageCreateMode !== "link") {
    pageCreateResults.innerHTML = "";
    pageCreateResults.style.display = "none";
    return;
  }

  const matches = getPageCreateLinkTargets(pageCreateName.value);
  const linkCopy = getPageCreateLinkCopy();
  pageCreateResults.style.display = "flex";

  if (!matches.length) {
    selectedLinkCandidateId = "";
    pageCreateResults.innerHTML = `<div class="page-create-empty">${linkCopy.empty}</div>`;
    syncPageCreateConfirmState();
    return;
  }

  if (!matches.some((item) => item.id === selectedLinkCandidateId)) {
    selectedLinkCandidateId = "";
  }

  pageCreateResults.innerHTML = "";
  matches.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `page-create-result${item.id === selectedLinkCandidateId ? " active" : ""}`;
    btn.innerHTML = `
      ${getIconMarkup(item.icon || (item.type === "domain" ? "⌂" : "📄"), item.type === "domain" ? "⌂" : "📄", "page-create-result-icon")}
      <span class="page-create-result-main">
        <span class="page-create-result-title">${escapeHTML(item.title || "Untitled")}</span>
        <span class="page-create-result-meta">${item.type === "domain" ? "Domain" : (item.containerType || item.category || "Page")}</span>
      </span>
    `;

    btn.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectedLinkCandidateId = item.id;
      pageCreateName.value = item.title || "";
      confirmPageCreate();
    });

    pageCreateResults.appendChild(btn);
  });

  syncPageCreateConfirmState();
}

function getCreateParentType(parentId = currentPageId) {
  if (userDomains.some(d => d.id === parentId)) return "domain";
  const parentPage = userPages.find(p => p.id === parentId);
  return parentPage?.containerType || "root";
}

function getAllowedContainerTypes(parentId = currentPageId) {
  const parentType = getCreateParentType(parentId);
  if (parentType === "domain") return ["hub"];
  if (parentType === "hub") return ["project"];
  if (parentType === "project") return ["page", "detail"];
  return ["page", "hub", "project", "detail"];
}

function getPreferredContainerType(parentId = currentPageId) {
  const parentType = getCreateParentType(parentId);
  if (parentType === "domain") return "hub";
  if (parentType === "hub") return "project";
  if (parentType === "project") return "page";
  return "page";
}

function applyContainerTypeDefaults(containerType) {
  if (containerType === "detail") {
    document.querySelectorAll("#pageCreateLayouts .page-type-btn").forEach(b => b.classList.remove("active"));
    document.querySelector('#pageCreateLayouts .page-type-btn[data-layout="sheet"]')?.classList.add("active");
    selectedLayout = "sheet";
  } else if (containerType === "hub" || containerType === "project") {
    document.querySelectorAll("#pageCreateLayouts .page-type-btn").forEach(b => b.classList.remove("active"));
    document.querySelector('#pageCreateLayouts .page-type-btn[data-layout="board-canvas"]')?.classList.add("active");
    selectedLayout = "board-canvas";
    document.getElementById("pageCreateCategory").value = "none";
  }
}

function setPageCreateContainerType(containerType, parentId = currentPageId) {
  const allowed = getAllowedContainerTypes(parentId);
  const nextType = allowed.includes(containerType) ? containerType : (allowed[0] || "page");

  document.querySelectorAll("#pageCreateContainerTypes .page-type-btn").forEach((btn) => {
    const enabled = allowed.includes(btn.dataset.container);
    btn.disabled = !enabled;
    btn.classList.toggle("disabled", !enabled);
    btn.classList.toggle("active", enabled && btn.dataset.container === nextType);
  });

  selectedContainerType = nextType;
  applyContainerTypeDefaults(nextType);
}

function applyPageCreateContext(parentId = currentPageId, isDomainCard = false) {
  const titleEl = document.querySelector(".page-create-title");
  const contextEl = document.getElementById("pageCreateContext");
  const hintEl = document.getElementById("pageCreateHint");

  syncPageCreateHideIconButton();

  if (pageCreateMode === "link") {
    const linkCopy = getPageCreateLinkCopy();
    document.getElementById("pageCreateContainerTypes").style.display = "none";
    document.getElementById("pageCreateLayouts").style.display = "none";
    document.getElementById("pageCreateCategory").style.display = "none";
    document.querySelectorAll(".page-create-section-label").forEach((label) => {
      label.style.display = "none";
    });

    pageCreateName.placeholder = linkCopy.placeholder;
    if (titleEl) titleEl.textContent = linkCopy.title;
    if (contextEl) contextEl.textContent = linkCopy.context;
    if (hintEl) hintEl.textContent = linkCopy.hint;
    if (pageCreateConfirm) pageCreateConfirm.textContent = "Link";

    renderPageCreateLinkResults();
    return;
  }

  if (isDomainCard) {
    document.getElementById("pageCreateContainerTypes").style.display = "none";
    document.getElementById("pageCreateLayouts").style.display = "none";
    document.getElementById("pageCreateCategory").style.display = "none";
    document.querySelectorAll(".page-create-section-label").forEach(l => {
      l.style.display = "none";
    });
    pageCreateName.placeholder = "Domain title...";
    if (titleEl) titleEl.textContent = "New Domain";
    if (contextEl) contextEl.textContent = "Creating at the top level";
    if (hintEl) hintEl.textContent = "Domains are the main buckets. They hold hubs underneath them.";
    if (pageCreateConfirm) pageCreateConfirm.textContent = "Create";
    renderPageCreateLinkResults();
    syncPageCreateConfirmState();
    return;
  }

  document.getElementById("pageCreateContainerTypes").style.display = "";
  document.getElementById("pageCreateLayouts").style.display = "";
  document.getElementById("pageCreateCategory").style.display = "";
  document.querySelectorAll(".page-create-section-label").forEach(l => {
    l.style.display = "";
  });

  const parentType = getCreateParentType(parentId);
  const preferredType = getPreferredContainerType(parentId);
  setPageCreateContainerType(preferredType, parentId);

  pageCreateName.placeholder =
    parentType === "domain" ? "Hub title..." :
    parentType === "hub" ? "Project title..." :
    parentType === "project" ? "Page or detail title..." :
    "Page title...";

  if (titleEl) {
    titleEl.textContent =
      parentType === "domain" ? "New Hub" :
      parentType === "hub" ? "New Project" :
      parentType === "project" ? "New Page / Detail" :
      "New Page";
  }

  if (contextEl) {
    contextEl.textContent =
      parentType === "domain" ? "Inside a Domain → creating a Hub" :
      parentType === "hub" ? "Inside a Hub → creating a Project" :
      parentType === "project" ? "Inside a Project → creating a Page or Detail" :
      "Flexible space → create what you need";
  }

  if (hintEl) {
    hintEl.textContent =
      parentType === "domain" ? "Hubs are the next layer under a domain." :
      parentType === "hub" ? "Projects group related pages and details together." :
      parentType === "project" ? "Use a page for fuller content, or a detail for quick reference info." :
      "Choose the type that best fits what you're building.";
  }

  if (pageCreateConfirm) pageCreateConfirm.textContent = "Create";
  renderPageCreateLinkResults();
  syncPageCreateConfirmState();
}

document.getElementById("pageCreateContainerTypes")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".page-type-btn");
  if (!btn || btn.disabled) return;
  setPageCreateContainerType(btn.dataset.container);
});

document.getElementById("pageCreateLayouts").addEventListener("click", (e) => {
  const btn = e.target.closest(".page-type-btn");
  if (!btn) return;
  document.querySelectorAll("#pageCreateLayouts .page-type-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  selectedLayout = btn.dataset.layout;
});

function openPageCreateModal(block, options = {}) {
  pendingPageBlock = block;
  pendingPageRestoreData = options.restoreData ? { ...options.restoreData } : null;
  selectedLayout = normalizePageCreateLayout(options.initialLayout || "board-canvas");
  selectedCategory = typeof options.initialCategory === "string" ? options.initialCategory : "none";
  selectedContainerType = typeof options.initialContainerType === "string" ? options.initialContainerType : "page";
  pageCreateMode = options.mode === "link" ? "link" : "create";
  pageCreateLinkTargetType = pageCreateMode === "link"
    ? (options.linkTargetType === "domain"
      ? "domain"
      : options.linkTargetType === "page"
        ? "page"
        : (block.dataset.type === "domain" ? "domain" : "all"))
    : "all";
  selectedLinkCandidateId = options.initialLinkedPageId || block.dataset.linkedPageId || "";
  pageCreateHideCardIcon = Object.prototype.hasOwnProperty.call(options, "hideCardIcon")
    ? !!options.hideCardIcon
    : isPageCardIconHidden(block);
  pageCreateName.value = pageCreateMode === "link"
    ? (typeof options.initialQuery === "string"
      ? options.initialQuery
      : (block.dataset.linkedPageId ? (block.querySelector(".page-card-title")?.textContent || "") : ""))
    : "";

  document.querySelectorAll("#pageCreateLayouts .page-type-btn").forEach(b => b.classList.remove("active"));
  document.querySelector(`#pageCreateLayouts .page-type-btn[data-layout="${selectedLayout}"]`)?.classList.add("active");
  document.getElementById("pageCreateCategory").value = selectedCategory;

  const isDomain = block.dataset.type === "domain";
  applyPageCreateContext(currentPageId, isDomain);

  if (!isDomain && options.initialContainerType) {
    setPageCreateContainerType(options.initialContainerType, currentPageId);
  }

  if (!isDomain && options.initialLayout) {
    document.querySelectorAll("#pageCreateLayouts .page-type-btn").forEach(b => b.classList.remove("active"));
    document.querySelector(`#pageCreateLayouts .page-type-btn[data-layout="${selectedLayout}"]`)?.classList.add("active");
  }

  if (typeof openOverlay === "function") {
    openOverlay("pageCreateOverlay", pageCreateOverlay);
  } else {
    pageCreateOverlay.classList.add("open");
  }

  setTimeout(() => pageCreateName.focus(), 0);
}

function openPageLinkModal(block, options = {}) {
  openPageCreateModal(block, { ...options, mode: "link" });
}

function closePageCreateModal(cancel = false) {
  pageCreateOverlay.classList.remove("open");

  if (cancel && pendingPageBlock) {
    if (pendingPageRestoreData) {
      const wasSelected = selectedBlock === pendingPageBlock;
      const restoreKind = pendingPageRestoreData.targetKind || "block";
      const restorePayload = Object.prototype.hasOwnProperty.call(pendingPageRestoreData, "data")
        ? pendingPageRestoreData.data
        : pendingPageRestoreData;

      if (restoreKind === "frame-item") {
        const restored = buildFrameItemElement(restorePayload || {});
        const ownerBlock = pendingPageBlock.closest('.block[data-type="container"]');
        pendingPageBlock.replaceWith(restored);

        if (ownerBlock && typeof autoGrowBlock === "function") {
          autoGrowBlock(ownerBlock);
        }

        if (wasSelected) {
          selectBlock(restored);
        }
      } else {
        const restored = buildBlockFromData(restorePayload || {});
        pendingPageBlock.replaceWith(restored);
        if (wasSelected) {
          selectBlock(restored);
        }
      }
    } else {
      if (selectedBlock === pendingPageBlock) {
        clearSelection();
      }
      pendingPageBlock.remove();
    }
    expandGrid();
    if (typeof saveState === "function") saveState();
  }

  pendingPageBlock = null;
  pendingPageRestoreData = null;
  pageCreateMode = "create";
  pageCreateLinkTargetType = "all";
  selectedLinkCandidateId = "";
  pageCreateHideCardIcon = false;
  if (pageCreateResults) {
    pageCreateResults.innerHTML = "";
    pageCreateResults.style.display = "none";
  }

  if (typeof setUIState === "function") {
    const state = getUIState?.();
    if (state?.openOverlay === "pageCreateOverlay") {
      setUIState({ openOverlay: null });
    }
  }
}

function confirmPageCreate() {
  if (!pendingPageBlock) return;

  const preservedCardOptions = pendingPageRestoreData
    ? {
        pageCardImageMode: getPageCardImageMode(pendingPageRestoreData),
        pageCardImageSrc: getStoredPageCardImageSource(pendingPageRestoreData)
      }
    : {};

  if (pageCreateMode === "link") {
    const target = resolvePageCreateLinkTarget();
    if (!target) {
      showAppToast?.(getPageCreateLinkCopy().toast, "info");
      return;
    }

    applyLinkedPageTargetToBlock(pendingPageBlock, target, {
      hideCardIcon: pageCreateHideCardIcon,
      ...preservedCardOptions
    });
    saveCurrentPageBlocks();
    saveState();
    closePageCreateModal(false);
    return;
  }

  const title = pageCreateName.value.trim() || "Untitled";

  if (pendingPageBlock.dataset.type === "domain") {
    const newDomain = createDomain(title);
    applyLinkedPageTargetToBlock(
      pendingPageBlock,
      { ...newDomain, icon: newDomain.icon || "⌂", summary: "" },
      {
        hideCardIcon: pageCreateHideCardIcon,
        ...preservedCardOptions
      }
    );
  } else {
    selectedCategory = document.getElementById("pageCreateCategory").value;
    const allowedTypes = getAllowedContainerTypes(currentPageId);
    selectedContainerType = document.querySelector("#pageCreateContainerTypes .page-type-btn.active")?.dataset.container || getPreferredContainerType(currentPageId);
    if (!allowedTypes.includes(selectedContainerType)) {
      selectedContainerType = getPreferredContainerType(currentPageId);
    }
    const newPage = createPage(title, currentPageId, selectedLayout, selectedCategory, selectedContainerType);
    applyLinkedPageTargetToBlock(
      pendingPageBlock,
      {
        ...newPage,
        type: "page",
        layout: selectedLayout,
        category: selectedCategory,
        containerType: selectedContainerType,
        summary: newPage.summary || ""
      },
      {
        hideCardIcon: pageCreateHideCardIcon,
        ...preservedCardOptions
      }
    );
  }

  saveCurrentPageBlocks();
  saveState();
  closePageCreateModal(false);
}

pageCreateConfirm.addEventListener("click", confirmPageCreate);
pageCreateHideIconBtn?.addEventListener("click", (event) => {
  event.preventDefault();
  pageCreateHideCardIcon = !pageCreateHideCardIcon;
  syncPageCreateHideIconButton();
});
pageCreateCancel.addEventListener("click", () => {
  closePageCreateModal(true);
});
pageCreateName.addEventListener("input", () => {
  if (pageCreateMode === "link") {
    selectedLinkCandidateId = "";
    renderPageCreateLinkResults();
  }
});
pageCreateName.addEventListener("keydown", (e) => {
  if (e.key === "Enter") confirmPageCreate();
  if (e.key === "Escape") closePageCreateModal(true);
});

window.openPageCreateModal = openPageCreateModal;
window.openPageLinkModal = openPageLinkModal;

// ---- Auto-save triggers ----

// Save after delete removes a block (we hook into keydown)
document.addEventListener("keydown", (e) => {
  if ((e.key === "Delete" || e.key === "Backspace") && document.body.classList.contains("editing")) {
    // let the delete handler run first, then save
    setTimeout(saveState, 0);
  }
});

// Save after mouseup (covers move + resize)
document.addEventListener("mouseup", () => {
  if (document.body.classList.contains("editing")) saveState();
});

// Save after placing a new block
// (place mode code appends blocks on grid mousedown; this catches it)
document.getElementById("grid")?.addEventListener("mousedown", () => {
  if (document.body.classList.contains("editing")) {
    setTimeout(saveState, 0);
  }
});

// Save after switching pages
document.querySelectorAll(".nav-item").forEach((a) => {
  a.addEventListener("click", () => setTimeout(saveState, 0));
});



// == Editable profile name ==
const profileContainer = document.querySelector(".profile");
const profileAvatar = document.querySelector(".pfp");

function assignSharedProfileName(name) {
  const nextName = name.trim() || "Your Name";
  if (!sanctumSettings.operator) sanctumSettings.operator = {};
  sanctumSettings.operator.name = nextName;
  localStorage.setItem("sanctum_profile_name", nextName);
  return nextName;
}

function beginSidebarProfileNameEdit() {
  if (!profileContainer) return;

  const profileName = profileContainer.querySelector(".profile-name");
  if (!profileName || profileContainer.querySelector(".profile-name-input")) return;

  const input = document.createElement("input");
  input.type = "text";
  input.className = "profile-name-input";
  input.value = profileName.textContent === "Your Name" ? "" : profileName.textContent;
  input.placeholder = "Your name";

  profileName.replaceWith(input);
  input.focus();
  input.select();

  let finished = false;

  function finish(commitChanges) {
    if (finished) return;
    finished = true;

    if (commitChanges) {
      loadSettings();
      assignSharedProfileName(input.value);
      saveSettings();
    }

    syncSidebarProfile({ preserveEditing: false });
  }

  input.addEventListener("blur", () => finish(true));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
      input.blur();
    }
  });
}

profileContainer?.addEventListener("click", (e) => {
  const nameTarget = e.target.closest(".profile-name");
  if (!nameTarget || !profileContainer.contains(nameTarget)) return;
  e.stopPropagation();
  beginSidebarProfileNameEdit();
});

if (profileContainer) {
  const savedName = localStorage.getItem("sanctum_profile_name");
  const sidebarName = profileContainer.querySelector(".profile-name");
  if (savedName && sidebarName) sidebarName.textContent = savedName;
}


// == Settings ==
const settingsOverlay = document.getElementById("settingsOverlay");
const settingsClose   = document.getElementById("settingsClose");
const settingsRight   = document.getElementById("settingsRight");

function openSettings() {
  loadSettings();
  renderSettingsSection("operator");
  settingsOverlay.classList.add("open");
}

function closeSettings() {
  settingsOverlay.classList.remove("open");
}

settingsClose.addEventListener("click", closeSettings);

document.querySelectorAll(".settings-nav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".settings-nav-item").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    renderSettingsSection(btn.dataset.section);
  });
});

// == Settings Data ==
const SETTINGS_KEY = "sanctum_settings";
let sanctumSettings = {};

function loadSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  sanctumSettings = raw ? JSON.parse(raw) : {};

  if (!sanctumSettings.operator) sanctumSettings.operator = {};
  if (!sanctumSettings.workspace) sanctumSettings.workspace = { theme: "dark", uiFont: "system", borders: "none", cornerStyle: "square", gridSize: "medium" };
  if (!sanctumSettings.editor) sanctumSettings.editor = { blockBehavior: "expand", snapToGrid: true, autoFocus: true, defaultBlockWidth: "medium" };
  if (!sanctumSettings.navigation) sanctumSettings.navigation = { rememberPage: true, sidebarState: "collapsed", openBehavior: "replace", breadcrumbs: false };
  sanctumSettings.workspace.theme = normalizeThemeMode(sanctumSettings.workspace.theme || "dark", "dark");
  sanctumSettings.workspace.uiFont = sanctumSettings.workspace.uiFont || "system";
  sanctumSettings.workspace.borders = sanctumSettings.workspace.borders || "none";
  sanctumSettings.workspace.cornerStyle = sanctumSettings.workspace.cornerStyle || "square";
  sanctumSettings.workspace.gridSize = sanctumSettings.workspace.gridSize || "medium";

  if (!sanctumSettings.operator.id) {
    sanctumSettings.operator.id = generateSanctumId();
    saveSettings();
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(sanctumSettings));
  syncSidebarProfile();
  applyResolvedTheme(typeof currentPageId === "string" ? currentPageId : "home");
}

function syncSidebarProfile(options = {}) {
  const { preserveEditing = true } = options;
  const displayName = sanctumSettings.operator?.name || localStorage.getItem("sanctum_profile_name") || "Your Name";
  const avatar = sanctumSettings.operator?.avatar || "";

  if (profileContainer) {
    const editingInput = profileContainer.querySelector(".profile-name-input");
    let sidebarName = profileContainer.querySelector(".profile-name");

    if (!sidebarName && (!editingInput || !preserveEditing)) {
      sidebarName = document.createElement("div");
      sidebarName.className = "profile-name";
      if (editingInput) editingInput.replaceWith(sidebarName);
      else profileContainer.appendChild(sidebarName);
    }

    if (sidebarName) {
      sidebarName.textContent = displayName;
    }
  }

  if (profileAvatar) {
    profileAvatar.style.backgroundImage = avatar ? `url("${avatar}")` : "none";
    profileAvatar.style.backgroundColor = avatar ? "transparent" : "#444";
  }
}

loadSettings();
syncSidebarProfile();
applyResolvedTheme(typeof currentPageId === "string" ? currentPageId : "home");

function generateSanctumId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 3; i++) id += chars[Math.floor(Math.random() * chars.length)];
  id += "-";
  for (let i = 0; i < 3; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// == Settings Sections ==
function renderSettingsSection(section) {
  if (section === "operator") renderOperator();
  else if (section === "workspace") renderWorkspace();
  else if (section === "editor") renderEditor();
  else if (section === "navigation") renderNavigation();
  else if (section === "data") renderData();
  else if (section === "about") renderAbout();
}

function settingsField(label, sub, inputHTML) {
  return `
    <div class="settings-row">
      <div>
        <div class="settings-row-label">${label}</div>
        ${sub ? `<div class="settings-row-sub">${sub}</div>` : ""}
      </div>
      ${inputHTML}
    </div>
  `;
}

function settingsSelect(id, options, current) {
  const opts = options.map(o => `<option value="${o.value}" ${current === o.value ? "selected" : ""}>${o.label}</option>`).join("");
  return `<select class="settings-select" id="${id}">${opts}</select>`;
}

function renderOperator() {
  const op = sanctumSettings.operator;
  const name = op.name || localStorage.getItem("sanctum_profile_name") || "Operator";
  const title = op.title || "Archivist";
  const id = op.id || "???";
  const created = op.created || "Unknown";
  const domainCount = userDomains.length;
  const pageCount = userPages.length;

  settingsRight.innerHTML = `
    <div class="settings-section-title">Operator</div>

    <div class="operator-card">
      <div class="operator-avatar" id="avatarBtn">
        ${op.avatar ? `<img src="${op.avatar}" />` : "👤"}
      </div>
      <div class="operator-info">
        <div class="operator-name">${name}</div>
        <div class="operator-title">${title}</div>
        <div class="operator-id">ID: ${id}</div>
        <div class="operator-stats">
          <div class="operator-stat">Domains: <span>${domainCount}</span></div>
          <div class="operator-stat">Pages: <span>${pageCount}</span></div>
          <div class="operator-stat">Created: <span>${created}</span></div>
        </div>
      </div>
    </div>

    ${settingsField("Display Name", "Shown across Sanctum", `<input class="settings-input" id="opName" value="${name}" />`)}
    ${settingsField("Operator Title", "e.g. Archivist, Keeper", `<input class="settings-input" id="opTitle" value="${title}" />`)}
    ${settingsField("Sanctum ID", "Your unique identifier", `<input class="settings-input" id="opId" value="${id}" />`)}
    ${settingsField("Tagline", "Optional short bio", `<input class="settings-input" id="opBio" value="${op.bio || ""}" />`)}

    <div style="margin-top: 16px;">
      <button class="settings-btn" id="saveOperatorBtn">Save Changes</button>
    </div>
  `;

  // avatar click
  document.getElementById("avatarBtn").addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        sanctumSettings.operator.avatar = e.target.result;
        saveSettings();
        renderOperator();
      };
      reader.readAsDataURL(file);
    };
    input.click();
  });

  document.getElementById("saveOperatorBtn").addEventListener("click", () => {
    assignSharedProfileName(document.getElementById("opName").value);
    sanctumSettings.operator.title = document.getElementById("opTitle").value.trim();
    sanctumSettings.operator.id = document.getElementById("opId").value.trim();
    sanctumSettings.operator.bio = document.getElementById("opBio").value.trim();
    if (!sanctumSettings.operator.created) {
      sanctumSettings.operator.created = new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" });
    }
    saveSettings();
    renderOperator();
  });
}

function renderWorkspace() {
  const ws = sanctumSettings.workspace;
  settingsRight.innerHTML = `
    <div class="settings-section-title">Workspace</div>
    ${settingsField("Theme", "", settingsSelect("wsTheme", [{value:"dark",label:"Dark"},{value:"light",label:"Light"}], ws.theme))}
    ${settingsField("UI Font", "", settingsSelect("wsFont", [{value:"system",label:"System"},{value:"serif",label:"Serif"},{value:"mono",label:"Mono"}], ws.uiFont))}
    ${settingsField("Default Borders", "Block border style", settingsSelect("wsBorders", [{value:"none",label:"None"},{value:"subtle",label:"Subtle"},{value:"visible",label:"Visible"}], ws.borders))}
    ${settingsField("Corner Style", "", settingsSelect("wsCorners", [{value:"square",label:"Square"},{value:"slight",label:"Slightly Rounded"},{value:"round",label:"Fully Rounded"}], ws.cornerStyle))}
    ${settingsField("Default Grid Size", "", settingsSelect("wsGrid", [{value:"small",label:"Small"},{value:"medium",label:"Medium"},{value:"large",label:"Large"}], ws.gridSize))}
    <div style="margin-top:16px;"><button class="settings-btn" id="saveWorkspaceBtn">Save Changes</button></div>
  `;

  document.getElementById("saveWorkspaceBtn").addEventListener("click", () => {
    sanctumSettings.workspace.theme = document.getElementById("wsTheme").value;
    sanctumSettings.workspace.uiFont = document.getElementById("wsFont").value;
    sanctumSettings.workspace.borders = document.getElementById("wsBorders").value;
    sanctumSettings.workspace.cornerStyle = document.getElementById("wsCorners").value;
    sanctumSettings.workspace.gridSize = document.getElementById("wsGrid").value;
    saveSettings();
  });
}

function renderEditor() {
  const ed = sanctumSettings.editor;
  settingsRight.innerHTML = `
    <div class="settings-section-title">Editor</div>
    ${settingsField("Block Behavior", "", settingsSelect("edBehavior", [{value:"expand",label:"Auto Expand"},{value:"fixed",label:"Fixed Size"},{value:"smart",label:"Expand When Needed"}], ed.blockBehavior))}
    ${settingsField("Snap To Grid", "", settingsSelect("edSnap", [{value:"true",label:"On"},{value:"false",label:"Off"}], String(ed.snapToGrid)))}
    ${settingsField("Auto Focus New Block", "", settingsSelect("edFocus", [{value:"true",label:"On"},{value:"false",label:"Off"}], String(ed.autoFocus)))}
    ${settingsField("Default Block Width", "", settingsSelect("edWidth", [{value:"small",label:"Small"},{value:"medium",label:"Medium"},{value:"large",label:"Large"}], ed.defaultBlockWidth))}
    <div style="margin-top:16px;"><button class="settings-btn" id="saveEditorBtn">Save Changes</button></div>
  `;
  document.getElementById("saveEditorBtn").addEventListener("click", () => {
    sanctumSettings.editor.blockBehavior = document.getElementById("edBehavior").value;
    sanctumSettings.editor.snapToGrid = document.getElementById("edSnap").value === "true";
    sanctumSettings.editor.autoFocus = document.getElementById("edFocus").value === "true";
    sanctumSettings.editor.defaultBlockWidth = document.getElementById("edWidth").value;
    saveSettings();
  });
}

function renderNavigation() {
  settingsRight.innerHTML = `
    <div class="settings-section-title">Navigation</div>
    <div style="color:var(--muted3);font-size:13px;padding:12px 0;">Navigation settings coming soon.</div>
  `;
}

function renderData() {
  const used = window.SanctumStorage?.getUsageBytes?.() || new Blob([JSON.stringify(localStorage)]).size;
  const usedKB = (used / 1024).toFixed(1);

  const readPageDatabasesForExport = () => {
    const primary = readStorageJSON(STORAGE_KEYS.pageDatabases, null);
    if (primary && typeof primary === "object" && !Array.isArray(primary)) return primary;
    const legacy = readStorageJSON(STORAGE_KEYS.legacyCalendarDatabases, {});
    return legacy && typeof legacy === "object" && !Array.isArray(legacy) ? legacy : {};
  };

  const buildBackupData = () => ({
    settings: sanctumSettings,
    domains: userDomains,
    pages: userPages,
    blocks: readStorageJSON(STORAGE_KEYS.pageBlocks, {}),
    pageSettings: readStorageJSON(STORAGE_KEYS.pageSettings, {}),
    pageActivity: readStorageJSON(STORAGE_KEYS.pageActivity, {}),
    documents: readStorageJSON(STORAGE_KEYS.documents, {}),
    docSettings: readStorageJSON(STORAGE_KEYS.docSettings, {}),
    pageDatabases: readPageDatabasesForExport(),
    chronicles: readStorageJSON(STORAGE_KEYS.chronicles, []),
    trash: readStorageJSON(STORAGE_KEYS.trash, []),
    pins: readStorageJSON(STORAGE_KEYS.pins, []),
    bookmarks: readStorageJSON(STORAGE_KEYS.bookmarks, []),
    stickers: readStorageJSON(STORAGE_KEYS.stickers, {}),
    customStickers: readStorageJSON(STORAGE_KEYS.customStickers, []),
    recentColors: readStorageJSON(STORAGE_KEYS.recentColors, []),
    colorPalette: readStorageJSON(STORAGE_KEYS.colorPalette, []),
    threads: readStorageJSON("sanctum_threads", {}),
    anchors: readStorageJSON("sanctum_anchors", {}),
    annotations: readStorageJSON("sanctum_annotations", {}),
    notesVault: readStorageJSON(STORAGE_KEYS.notesVault, []),
    noteShelves: readStorageJSON(STORAGE_KEYS.noteShelves, []),
    helperInbox: readStorageJSON(STORAGE_KEYS.helperInbox, []),
    helperActionLog: readStorageJSON(STORAGE_KEYS.helperActionLog, []),
    helperChatLog: readStorageJSON(STORAGE_KEYS.helperChatLog, []),
    helperUserProfile: readStorageJSON(STORAGE_KEYS.helperUserProfile, {}),
    helperMemoryProfile: readStorageJSON(`${STORAGE_KEYS.helperMemoryProfile}:${(readStorageJSON(STORAGE_KEYS.helperUserProfile, {}).id || "primary-user")}`, {}),
  });

  const hasBackupContent = (data) => {
    return (data.domains?.length || 0) > 0
      || (data.pages?.length || 0) > 0
      || Object.keys(data.blocks || {}).length > 0
      || Object.keys(data.documents || {}).length > 0
      || Object.keys(data.pageDatabases || {}).length > 0
      || (data.notesVault?.length || 0) > 0;
  };

  const downloadBackupData = (filename, options = {}) => {
    const data = buildBackupData();
    if (options.onlyWhenPopulated && !hasBackupContent(data)) return false;
    const blob = new Blob([JSON.stringify(data, null, options.pretty ? 2 : 0)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  };

  const recoveryFilename = (reason) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `sanctum-recovery-${reason}-${stamp}.json`;
  };

  settingsRight.innerHTML = `
    <div class="settings-section-title">Data</div>
    ${settingsField("Storage Used", "", `<span style="color:var(--muted2);font-size:13px;">${usedKB} KB</span>`)}
    ${settingsField("Export Sanctum Data", "Download everything as JSON", `<button class="settings-btn" id="exportBtn">Export</button>`)}
    ${settingsField("Import Sanctum Data", "Restore from a backup file", `<button class="settings-btn" id="importBtn">Import</button>`)}
    ${settingsField("Automatic Safety Copy", "Downloads a recovery file before Import or Reset. It does not duplicate data inside your vault.", `<span style="color:var(--muted2);font-size:13px;">On</span>`)}
    ${settingsField("Reset Vault", "Permanently clears all data", `<button class="settings-btn danger" id="resetBtn">Reset Vault</button>`)}
  `;

  document.getElementById("exportBtn").addEventListener("click", () => {
    downloadBackupData("sanctum-backup.json", { pretty: true });
  });

  document.getElementById("importBtn").addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          downloadBackupData(recoveryFilename("before-import"), { onlyWhenPopulated: true });
          if (data.settings) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(data.settings)); }
          if (data.domains) { writeStorageJSON(STORAGE_KEYS.domains, data.domains); }
          if (data.pages) { writeStorageJSON(STORAGE_KEYS.pagesRegistry, data.pages); }
          if (data.blocks) { writeStorageJSON(STORAGE_KEYS.pageBlocks, data.blocks); }
          if (data.pageSettings) { writeStorageJSON(STORAGE_KEYS.pageSettings, data.pageSettings); }
          if (data.pageActivity) { writeStorageJSON(STORAGE_KEYS.pageActivity, data.pageActivity); }
          if (data.documents) { writeStorageJSON(STORAGE_KEYS.documents, data.documents); }
          if (data.docSettings) { writeStorageJSON(STORAGE_KEYS.docSettings, data.docSettings); }
          const importedPageDatabases = data.pageDatabases || data.calendarDatabases;
          if (importedPageDatabases) {
            writeStorageJSON(STORAGE_KEYS.pageDatabases, importedPageDatabases);
            writeStorageJSON(STORAGE_KEYS.legacyCalendarDatabases, importedPageDatabases);
          }
          if (data.chronicles) { writeStorageJSON(STORAGE_KEYS.chronicles, data.chronicles); }
          if (data.trash) { writeStorageJSON(STORAGE_KEYS.trash, data.trash); }
          if (data.pins) { writeStorageJSON(STORAGE_KEYS.pins, data.pins); }
          if (data.bookmarks) { writeStorageJSON(STORAGE_KEYS.bookmarks, data.bookmarks); }
          if (data.stickers) { writeStorageJSON(STORAGE_KEYS.stickers, data.stickers); }
          if (data.customStickers) { writeStorageJSON(STORAGE_KEYS.customStickers, data.customStickers); }
          if (data.recentColors) { writeStorageJSON(STORAGE_KEYS.recentColors, data.recentColors); }
          if (data.colorPalette) { writeStorageJSON(STORAGE_KEYS.colorPalette, data.colorPalette); }
          if (data.threads) { writeStorageJSON("sanctum_threads", data.threads); }
          if (data.anchors) { writeStorageJSON("sanctum_anchors", data.anchors); }
          if (data.annotations) { writeStorageJSON("sanctum_annotations", data.annotations); }
          if (data.notesVault) { writeStorageJSON(STORAGE_KEYS.notesVault, data.notesVault); }
          if (data.noteShelves) { writeStorageJSON(STORAGE_KEYS.noteShelves, data.noteShelves); }
          if (data.helperInbox) { writeStorageJSON(STORAGE_KEYS.helperInbox, data.helperInbox); }
          if (data.helperActionLog) { writeStorageJSON(STORAGE_KEYS.helperActionLog, data.helperActionLog); }
          if (data.helperChatLog) { writeStorageJSON(STORAGE_KEYS.helperChatLog, data.helperChatLog); }
          if (data.helperUserProfile) { writeStorageJSON(STORAGE_KEYS.helperUserProfile, data.helperUserProfile); }
          const importedProfile = data.helperUserProfile || readStorageJSON(STORAGE_KEYS.helperUserProfile, {});
          if (data.helperMemoryProfile) { writeStorageJSON(`${STORAGE_KEYS.helperMemoryProfile}:${(importedProfile.id || 'primary-user')}`, data.helperMemoryProfile); }
          const flush = window.SanctumStorage && window.SanctumStorage.flush;
          const doReload = () => { alert("Import successful. Reloading..."); location.reload(); };
          flush ? flush().then(doReload).catch(doReload) : doReload();
        } catch {
          alert("Invalid backup file.");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });

  document.getElementById("resetBtn").addEventListener("click", async () => {
    const confirmed = confirm("This will permanently delete all your Sanctum data. Are you sure?");
    if (!confirmed) return;
    downloadBackupData(recoveryFilename("before-reset"), { onlyWhenPopulated: true });
    localStorage.clear();
    if (window.SanctumStorage?.flush) {
      await window.SanctumStorage.flush();
    }
    location.reload();
  });
}

function renderAbout() {
  settingsRight.innerHTML = `
    <div class="settings-section-title">About</div>
    <div style="display:flex;flex-direction:column;gap:12px;color:var(--muted2);font-size:13px;">
      <div>Sanctum <span style="color:var(--text-main)">v3</span></div>
      <div>Build <span style="color:var(--text-main)">0.3.0</span></div>
      <div style="margin-top:8px;color:var(--muted3);font-size:12px;line-height:1.7;">
        A private vault for everything that matters.<br>
        Built for brains that work differently.
      </div>
    </div>
  `;
}

document.getElementById("settingsBtn")?.addEventListener("click", () => {
  closeSidebar();
  openSettings();
});

document.getElementById("trashBtn")?.addEventListener("click", () => {
  closeSidebar();
  openTrash();
});

document.getElementById("trashCloseBtn")?.addEventListener("click", closeTrash);
document.getElementById("trashEmptyAllBtn")?.addEventListener("click", () => {
  if (!trashItems.length) return;
  const confirmed = confirm("Empty trash permanently? This cannot be undone.");
  if (!confirmed) return;
  if (!saveTrash([])) {
    showAppToast("Could not empty Trash right now.", "info");
    return;
  }
  renderTrashList();
});
document.getElementById("trashList")?.addEventListener("click", (e) => {
  const restoreId = e.target.dataset.trashRestore;
  const deleteId = e.target.dataset.trashDelete;
  if (restoreId) restoreTrashItem(restoreId);
  if (deleteId) {
    const confirmed = confirm("Delete this trash item forever?");
    if (!confirmed) return;
    deleteTrashItemForever(deleteId);
  }
});

// == Search ==
const searchView    = document.getElementById("searchView");
const searchInput   = document.getElementById("searchInput");
const searchClear   = document.getElementById("searchClear");
const searchResults = document.getElementById("searchResults");
const searchEmpty   = document.getElementById("searchEmpty");
const searchFilters = document.getElementById("searchFilters");

let searchDebounce = null;
let activeFilter = "all";

function openSearch() {
  document.body.classList.add("search-open");
  document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
  navSearch.classList.add("active");
  if (pageTitle) pageTitle.textContent = "Search";
  const topbarLeft = document.querySelector(".topbar-left");
  if (topbarLeft && !document.getElementById("topbarSearchInput")) {
    const wrap = document.createElement("div");
    wrap.id = "topbarSearchWrap";
    wrap.style.cssText = "display:flex;align-items:center;gap:8px;background:rgba(0,0,0,0.28);border:1px solid rgba(255,255,255,0.12);border-radius:6px;padding:5px 12px;width:320px;";
    wrap.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="flex:0 0 auto;stroke:rgba(255,255,255,0.4);stroke-width:2;">
        <circle cx="11" cy="11" r="7" stroke-linecap="round"/>
        <path d="M16.5 16.5L21 21" stroke-linecap="round"/>
      </svg>
      <input id="topbarSearchInput" placeholder="Search your notes..." autocomplete="off"
        style="background:transparent;border:none;outline:none;color:rgba(255,255,255,0.92);font-size:13px;width:100%;font-family:inherit;" />
    `;
    topbarLeft.appendChild(wrap);

    const topbarInput = wrap.querySelector("#topbarSearchInput");
    topbarInput.addEventListener("input", () => {
      searchInput.value = topbarInput.value;
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(runSearch, 220);
    });
    setTimeout(() => topbarInput.focus(), 50);
  }
  updateTopbarContext("search");
  runSearch();
}

function closeSearch() {
  document.body.classList.remove("search-open");
  searchInput.value = "";
  searchClear.classList.remove("visible");
  searchResults.innerHTML = "";
  searchEmpty.style.display = "";

  // remove topbar search input
  const wrap = document.getElementById("topbarSearchWrap");
  if (wrap) wrap.remove();

  // restore correct page title
  const allPages = { ...SYSTEM_PAGES };
  userDomains.forEach(d => allPages[d.id] = d);
  userPages.forEach(p => allPages[p.id] = p);
  const page = allPages[currentPageId];
  if (page && pageTitle) pageTitle.textContent = page.title;
  updateTopbarContext(currentPageId);
}

function getAllBlocks() {
  const all = readAllPageBlocks();
  const results = [];

  // also include current page blocks live from DOM
  const liveBlocks = serializeBlocks();
  all[currentPageId] = liveBlocks;

  const allPages = { ...SYSTEM_PAGES };
  userDomains.forEach(d => allPages[d.id] = d);
  userPages.forEach(p => allPages[p.id] = p);

  // search page/domain titles as results
  for (const page of [...userDomains, ...userPages]) {
    results.push({
      pageId: page.id,
      pageTitle: page.title,
      block: { type: userDomains.some(d => d.id === page.id) ? "domain" : "page" },
      text: page.title,
      isTitle: true,
    });
  }

  for (const [pageId, blocks] of Object.entries(all)) {
    const page = allPages[pageId];
    const pageTitle = page ? page.title : "Unknown Page";

    for (const block of blocks) {
      const text = getSerializedBlockSearchText(block);
      if (!text) continue;
      results.push({ pageId, pageTitle, block, text });
    }
  }

  // search document content
  const allDocs = readAllDocuments();
  for (const [pageId, docData] of Object.entries(allDocs)) {
    const page = allPages[pageId];
    if (!page) continue;
    const docText = (typeof docData === "string" ? docData : (docData.content || "")).replace(/<[^>]*>/g, " ").trim();
    if (!docText) continue;
    results.push({ pageId, pageTitle: page.title, block: { type: "document" }, text: docText });
  }

  // search notes
  const notes = readStorageJSON(STORAGE_KEYS.notesVault, []);
  for (const note of notes) {
    const noteText = [
      note.title || "",
      note.bodyText || "",
      typeof note.bodyHTML === "string" ? note.bodyHTML.replace(/<[^>]*>/g, " ") : "",
      note.preview || ""
    ].join(" ").trim();
    if (!noteText) continue;
    results.push({ pageId: null, pageTitle: "Notes", block: { type: "note" }, text: noteText, noteId: note.id });
  }

  return results;
}

function buildSnippet(text, term) {
  if (!term) return text.slice(0, 200);
  const lower = text.toLowerCase();
  const t = term.toLowerCase();
  const idx = lower.indexOf(t);
  if (idx === -1) return text.slice(0, 200);
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + t.length + 120);
  let chunk = text.slice(start, end).trim();
  if (start > 0) chunk = "… " + chunk;
  if (end < text.length) chunk += " …";
  return chunk;
}

function highlightText(text, term) {
  if (!term) return text;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, "ig");
  return text.replace(re, m => `<mark>${m}</mark>`);
}

function runSearch() {
  const term = searchInput.value.trim();

  searchClear.classList.toggle("visible", term.length > 0);

  const allBlocks = getAllBlocks();

  let filtered = allBlocks.filter(r => {
    if (activeFilter !== "all" && r.block.type !== activeFilter) return false;
    if (!term) return false;
    return r.text.toLowerCase().includes(term.toLowerCase());
  });

  searchResults.innerHTML = "";

  if (!term) {
    searchEmpty.style.display = "";
    searchEmpty.textContent = "Type something to search.";
    return;
  }

  searchEmpty.style.display = filtered.length ? "none" : "";
  searchEmpty.textContent = "No matches found.";

  for (const r of filtered) {
    const snippet = buildSnippet(r.text, term);
    const snippetHtml = highlightText(snippet, term);
    const bigHtml = highlightText(buildSnippet(r.text, term), term);

    const typeLabel = r.isTitle ? (r.block.type === "domain" ? "DOMAIN" : "PAGE")
      : r.block.type === "note" ? "NOTE"
      : r.block.type === "document" ? "DOCUMENT"
      : r.block.type.toUpperCase();

    const row = document.createElement("div");
    row.className = "search-result-row";
    row.innerHTML = `
      <div class="search-result-left">
        <div class="search-result-title">${escapeHTML(r.pageTitle)}</div>
        <div class="search-result-path">SANCTUM / ${typeLabel}</div>
        <div class="search-result-snippet">${snippetHtml}</div>
      </div>
      <div class="search-result-right">${bigHtml}</div>
    `;

    row.addEventListener("click", () => {
      closeSearch();
      if (r.pageId) openPage(r.pageId);
    });

    searchResults.appendChild(row);
  }
}

searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(runSearch, 220);
});

searchClear.addEventListener("click", () => {
  searchInput.value = "";
  searchClear.classList.remove("visible");
  runSearch();
  searchInput.focus();
});

searchFilters.addEventListener("click", (e) => {
  const tab = e.target.closest(".search-tab");
  if (!tab) return;
  document.querySelectorAll(".search-tab").forEach(t => t.classList.remove("active"));
  tab.classList.add("active");
  activeFilter = tab.dataset.filter;
  runSearch();
});

// == Domain add button ==
document.getElementById("domainAddBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (currentPageId !== "home") return; // domains only on home
  promptCreateDomain();
});

// Load once on startup
loadSanctumRegistry();
loadPins();
renderSidebarDomains();
renderSidebarPins();
renderSidebarBookmarks();
openPage(typeof window.getRecentSessionPageId === "function" ? window.getRecentSessionPageId() : "home");
pushHistory();
updateTopbarContext(currentPageId);
renderBreadcrumbs(currentPageId);
window.getCurrentPageId = () => currentPageId;
