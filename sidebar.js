function openSidebar() {
  exitEditMode();
  document.getElementById("docContent")?.blur();

  if (typeof setDocUIState === "function" && typeof getDocUIState === "function") {
    const state = getDocUIState();
    if (state.editorOpen) {
      if (typeof closeDocPanels === "function") {
        closeDocPanels({
          closeInsert: true,
          closeInspector: true,
          closeSections: false,
          closeTransient: true,
          blurContent: true
        });
      }
      setDocUIState({
        sidebarOpen: true,
        pinOpen: false
      });
    }
  }

  document.getElementById("pinPanel")?.classList.remove("open");
  document.body.classList.remove("pin-open");

  sidebar.classList.add("open");
  document.body.classList.add("sidebar-open");
  syncSidebarAccessibility(true);
}

function closeSidebar() {
  if (typeof setDocUIState === "function" && typeof getDocUIState === "function") {
    const state = getDocUIState();
    if (state.editorOpen) {
      setDocUIState({ sidebarOpen: false });
    }
  }

  sidebar.classList.remove("open");
  document.body.classList.remove("sidebar-open");
  syncSidebarAccessibility(false);
}

window.openSidebar = openSidebar;
window.closeSidebar = closeSidebar;


menuBtn.addEventListener("click", openSidebar);
closeBtn.addEventListener("click", closeSidebar);

// == Section collapse/expand (Favorites / Pins / Domains) ==
const SIDEBAR_COLLAPSIBLE_SECTION_KEYS = new Set(["favorites", "pins", "domains"]);
const sidebarSectionExpandedState = new Map();
const SIDEBAR_SECTION_ANIMATION_MS = 220;

function getSidebarSectionKey(section) {
  if (!section) return "";
  if (section.querySelector("#favoritesList")) return "favorites";
  if (section.querySelector("#pinsList")) return "pins";
  if (section.classList.contains("section-domains")) return "domains";
  return "";
}

function isSidebarSectionExpanded(sectionKey) {
  if (!sectionKey) return true;
  if (!sidebarSectionExpandedState.has(sectionKey)) return true;
  return sidebarSectionExpandedState.get(sectionKey) !== false;
}

function setSidebarSectionExpanded(sectionKey, expanded) {
  if (!sectionKey) return;
  sidebarSectionExpandedState.set(sectionKey, !!expanded);
}

function animateSidebarSection(section, expanded, options = {}) {
  const items = section?.querySelector(".section-items");
  if (!section || !items) return;

  const immediate = !!options.immediate;
  const nextExpanded = !!expanded;

  section.classList.toggle("collapsed", !nextExpanded);
  items.style.overflow = "hidden";
  items.style.transition = `height ${SIDEBAR_SECTION_ANIMATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${SIDEBAR_SECTION_ANIMATION_MS}ms ease`;
  items.style.willChange = "height, opacity";

  if (items._sidebarTransitionCleanup) {
    items.removeEventListener("transitionend", items._sidebarTransitionCleanup);
    items._sidebarTransitionCleanup = null;
  }

  if (immediate) {
    items.style.height = nextExpanded ? "auto" : "0px";
    items.style.opacity = nextExpanded ? "1" : "0";
    return;
  }

  if (nextExpanded) {
    items.style.height = "0px";
    items.style.opacity = "0";
    // force style flush before target values
    items.getBoundingClientRect();
    const targetHeight = items.scrollHeight;
    items.style.height = `${targetHeight}px`;
    items.style.opacity = "1";
  } else {
    const startHeight = items.getBoundingClientRect().height || items.scrollHeight;
    items.style.height = `${Math.max(0, Math.round(startHeight))}px`;
    items.style.opacity = "1";
    // force style flush before target values
    items.getBoundingClientRect();
    items.style.height = "0px";
    items.style.opacity = "0";
  }

  const cleanup = (event) => {
    if (event && event.target !== items) return;
    if (nextExpanded) {
      items.style.height = "auto";
      items.style.opacity = "1";
    } else {
      items.style.height = "0px";
      items.style.opacity = "0";
    }
    items.style.willChange = "";
    items.removeEventListener("transitionend", cleanup);
    items._sidebarTransitionCleanup = null;
  };

  items._sidebarTransitionCleanup = cleanup;
  items.addEventListener("transitionend", cleanup);
}

function wireSidebarSectionCollapse() {
  document.querySelectorAll(".sidebar-content .section").forEach((section) => {
    const sectionKey = getSidebarSectionKey(section);
    if (!SIDEBAR_COLLAPSIBLE_SECTION_KEYS.has(sectionKey)) return;

    const header = section.querySelector(".section-header");
    if (!header || header.dataset.collapseWired === "true") return;

    header.dataset.collapseWired = "true";
    header.setAttribute("role", "button");
    header.setAttribute("tabindex", "0");

    const syncAria = () => {
      const expanded = isSidebarSectionExpanded(sectionKey);
      header.setAttribute("aria-expanded", expanded ? "true" : "false");
      animateSidebarSection(section, expanded, { immediate: true });
    };

    syncAria();

    const toggle = () => {
      const nextExpanded = !isSidebarSectionExpanded(sectionKey);
      setSidebarSectionExpanded(sectionKey, nextExpanded);
      header.setAttribute("aria-expanded", nextExpanded ? "true" : "false");
      animateSidebarSection(section, nextExpanded);
    };

    header.addEventListener("click", (e) => {
      if (e.target.closest(".section-add") || e.target.closest(".section-menu")) return;
      toggle();
    });

    header.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      toggle();
    });
  });
}

wireSidebarSectionCollapse();

// == Active item highlight ==
document.querySelectorAll(".item").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".item").forEach((i) => i.classList.remove("active"));
    item.classList.add("active");
  });
});

// == Prevent menu clicks from triggering parent clicks ==
document.querySelectorAll(".item-menu").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
  });
});

// == Section menu dropdowns (Favorites / Pins ⋯ buttons) ==
document.querySelectorAll(".section-menu").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();

    closeAllOverlays();

    const section = btn.closest(".section");
    const isFavorites = !!section.querySelector("#favoritesList");
    const isPins = !!section.querySelector("#pinsList");
    const label = isFavorites ? "Favorites" : isPins ? "Pins" : "Items";

    const dropdown = document.createElement("div");
    dropdown.className = "topbar-dropdown";
    dropdown.dataset.uiId = "sectionMenuDropdown";

    const clearBtn = document.createElement("div");
    clearBtn.className = "topbar-dropdown-btn danger";
    clearBtn.textContent = `Clear All ${label}`;
    clearBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      dropdown.remove();
      if (typeof setUIState === "function") setUIState({ openOverlay: null });
      if (isFavorites) {
        bookmarks.length = 0;
        saveBookmarks();
        renderSidebarBookmarks();
      } else if (isPins) {
        pinnedPages.length = 0;
        savePins();
        renderSidebarPins();
      }
    });
    dropdown.appendChild(clearBtn);

    document.body.appendChild(dropdown);

    const rect = btn.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.left = `${rect.left}px`;

    if (typeof openOverlay === "function") openOverlay("sectionMenuDropdown", dropdown);
  });
});


// == Core Registry ==
const SYSTEM_PAGES = {
  home:     { id: "home",     title: "Home",     type: "canvas" },
  search:   { id: "search",   title: "Search",   type: "system" },
  settings: { id: "settings", title: "Settings", type: "system" },
  inbox:    { id: "inbox",    title: "Inbox",    type: "system" },
  notes:    { id: "notes",    title: "Notes",    type: "system" },
};

// User-created domains and pages live here
let userDomains = [];
let userPages   = [];

window.userDomains = userDomains;
window.userPages = userPages;

const sidebarExpandedIds = new Set();
let sidebarAutoRevealPath = true;

function setSidebarExpanded(id, expanded) {
  if (!id) return;
  if (expanded) sidebarExpandedIds.add(id);
  else sidebarExpandedIds.delete(id);
}

function shouldSidebarExpand(id, activePathIds) {
  return !!id && (sidebarExpandedIds.has(id) || (sidebarAutoRevealPath && activePathIds.has(id)));
}

function saveSanctumRegistry() {
  window.userDomains = userDomains;
  window.userPages = userPages;

  const domainsSaved = writeStorageJSON(STORAGE_KEYS.domains, userDomains);
  const pagesSaved = writeStorageJSON(STORAGE_KEYS.pagesRegistry, userPages);
  return domainsSaved && pagesSaved;
}

function loadSanctumRegistry() {
  userDomains = readStorageJSON(STORAGE_KEYS.domains, []);
  userPages = readStorageJSON(STORAGE_KEYS.pagesRegistry, []);

  window.userDomains = userDomains;
  window.userPages = userPages;
}

function isSidebarVisiblePage(page) {
  return !!page && page.hiddenInSidebar !== true && page.containerType !== "database-row";
}

function renderSidebarPins() {
  const list = document.getElementById("pinsList");
  if (!list) return;
  list.innerHTML = "";
  if (!pinnedPages.length) return;

  const allPages = {};
  userPages.forEach(p => allPages[p.id] = p);
  userDomains.forEach(d => allPages[d.id] = d);

  pinnedPages.forEach(pin => {
    const page = allPages[pin.id];
    if (!page || !isSidebarVisiblePage(page)) return;

    const item = document.createElement("div");
    item.className = "item";
    item.dataset.pageId = pin.id;
    if (pin.id === currentPageId) item.classList.add("active");
    item.innerHTML = `
      ${getIconMarkup(page.icon, userDomains.some(d => d.id === pin.id) ? "⌂" : "📄", "item-icon", { scale: page.iconScale })}
      <span class="item-name">${escapeHTML(page.title || pin.title)}</span>
    `;
    item.addEventListener("click", () => openPage(pin.id, { revealSidebarPath: false }));
    list.appendChild(item);
  });
}

function renderSidebarBookmarks() {
  const list = document.getElementById("favoritesList");
  if (!list) return;
  list.innerHTML = "";
  if (!bookmarks.length) return;

  const allPages = {};
  userPages.forEach(p => allPages[p.id] = p);
  userDomains.forEach(d => allPages[d.id] = d);

  bookmarks.forEach(id => {
    const page = allPages[id];
    if (!page || !isSidebarVisiblePage(page)) return;

    const item = document.createElement("div");
    item.className = "item";
    item.dataset.pageId = id;
    if (id === currentPageId) item.classList.add("active");
    item.innerHTML = `
      ${getIconMarkup(page.icon, userDomains.some(d => d.id === id) ? "⌂" : "📄", "item-icon", { scale: page.iconScale })}
      <span class="item-name">${escapeHTML(page.title)}</span>
    `;
    item.addEventListener("click", () => openPage(id, { revealSidebarPath: false }));
    list.appendChild(item);
  });
}

function renderSidebarDomains() {
  const section = document.querySelector(".section-domains .section-items");
  if (!section) return;
  section.innerHTML = "";

  const activePathIds = new Set(getBreadcrumbPath(currentPageId).map(p => p.id));

  const buildBranchNode = ({
    idKey,
    idValue,
    rowClass,
    icon,
    iconScale,
    title,
    expanded = false,
    hasChildren = false,
    isActive = false,
    isAncestor = false,
    menuHTML = "",
    onOpen,
    onMenu,
    childrenEl
  }) => {
    const node = document.createElement("div");
    node.className = "item-node";

    const row = document.createElement("div");
    row.className = `item ${rowClass}`;
    row.dataset[idKey] = idValue;
    if (isActive) row.classList.add("active");
    else if (isAncestor) row.classList.add("active-ancestor");
    row.innerHTML = `
      <span class="item-expand">▸</span>
      ${getIconMarkup(icon, "📄", "item-icon", { scale: iconScale })}
      <span class="item-name">${escapeHTML(title)}</span>
      ${menuHTML}
    `;

    const expandBtn = row.querySelector(".item-expand");
    if (!hasChildren) {
      expandBtn?.classList.add("hidden");
    } else {
      expandBtn.textContent = expanded ? "▾" : "▸";
      expandBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        childrenEl.classList.toggle("collapsed");
        const nextExpanded = !childrenEl.classList.contains("collapsed");
        setSidebarExpanded(idValue, nextExpanded);
        expandBtn.textContent = nextExpanded ? "▾" : "▸";
      });
    }

    if (typeof onOpen === "function") {
      row.addEventListener("click", (e) => {
        if (e.target.closest(".item-expand") || e.target.closest(".item-menu")) return;
        onOpen(e);
      });
    }

    if (typeof onMenu === "function") {
      const menuBtn = row.querySelector(".item-menu");
      menuBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        onMenu(e, row, node);
      });
    }

    node.appendChild(row);
    if (childrenEl) node.appendChild(childrenEl);
    return node;
  };

  const buildLeafItem = (page) => {
    const pageItem = document.createElement("div");
    pageItem.className = "item item-page";
    pageItem.dataset.pageId = page.id;
    if (page.id === currentPageId) pageItem.classList.add("active");
    pageItem.innerHTML = `
      ${getIconMarkup(page.icon, "📄", "item-icon", { scale: page.iconScale })}
      <span class="item-name">${escapeHTML(page.title)}</span>
    `;
    pageItem.addEventListener("click", () => openPage(page.id));
    return pageItem;
  };

  const buildProjectItem = (project) => {
    const projectPages = userPages.filter(p => p.parent === project.id && isSidebarVisiblePage(p));
    const projectChildren = document.createElement("div");
    projectChildren.className = `item-children${shouldSidebarExpand(project.id, activePathIds) ? "" : " collapsed"}`;

    projectPages.forEach(page => {
      projectChildren.appendChild(buildLeafItem(page));
    });

    return buildBranchNode({
      idKey: "pageId",
      idValue: project.id,
      rowClass: "item-project",
      icon: project.icon || "🗂",
      iconScale: project.iconScale,
      title: project.title,
      expanded: shouldSidebarExpand(project.id, activePathIds),
      hasChildren: projectPages.length > 0,
      isActive: project.id === currentPageId,
      isAncestor: project.id !== currentPageId && activePathIds.has(project.id),
      onOpen: () => openPage(project.id),
      childrenEl: projectChildren
    });
  };

  userDomains.forEach((domain) => {
    const hubs = userPages.filter(p => p.parent === domain.id && p.containerType === "hub" && isSidebarVisiblePage(p));
    const directProjects = userPages.filter(p => p.parent === domain.id && p.containerType === "project" && isSidebarVisiblePage(p));
    const directPages = userPages.filter(p => p.parent === domain.id && !["hub", "project"].includes(p.containerType || "page") && isSidebarVisiblePage(p));

    const children = document.createElement("div");
    children.className = `item-children${shouldSidebarExpand(domain.id, activePathIds) ? "" : " collapsed"}`;

    hubs.forEach(hub => {
      const projects = userPages.filter(p => p.parent === hub.id && p.containerType === "project" && isSidebarVisiblePage(p));
      const loosePages = userPages.filter(p => p.parent === hub.id && (p.containerType || "page") !== "project" && isSidebarVisiblePage(p));
      const hubChildren = document.createElement("div");
      hubChildren.className = `item-children${shouldSidebarExpand(hub.id, activePathIds) ? "" : " collapsed"}`;

      projects.forEach(project => {
        hubChildren.appendChild(buildProjectItem(project));
      });

      loosePages.forEach(page => {
        hubChildren.appendChild(buildLeafItem(page));
      });

      children.appendChild(buildBranchNode({
        idKey: "pageId",
        idValue: hub.id,
        rowClass: "item-hub",
        icon: hub.icon || "📂",
        iconScale: hub.iconScale,
        title: hub.title,
        expanded: shouldSidebarExpand(hub.id, activePathIds),
        hasChildren: hubChildren.childElementCount > 0,
        isActive: hub.id === currentPageId,
        isAncestor: hub.id !== currentPageId && activePathIds.has(hub.id),
        onOpen: () => openPage(hub.id),
        childrenEl: hubChildren
      }));
    });

    directProjects.forEach(project => {
      children.appendChild(buildProjectItem(project));
    });

    directPages.forEach(page => {
      children.appendChild(buildLeafItem(page));
    });

    section.appendChild(buildBranchNode({
      idKey: "domainId",
      idValue: domain.id,
      rowClass: "item-domain",
      icon: domain.icon || "⌂",
      iconScale: domain.iconScale,
      title: domain.title,
      expanded: shouldSidebarExpand(domain.id, activePathIds),
      hasChildren: children.childElementCount > 0,
      isActive: domain.id === currentPageId,
      isAncestor: domain.id !== currentPageId && activePathIds.has(domain.id),
      menuHTML: `<span class="item-menu" data-delete-domain="${domain.id}">⋯</span>`,
      onOpen: () => openPage(domain.id),
      onMenu: (_e, row) => {
        closeAllOverlays();

        const dropdown = document.createElement("div");
        dropdown.className = "item-dropdown";
        dropdown.dataset.uiId = "domainItemDropdown";
        dropdown.innerHTML = `
          <div class="item-dropdown-btn" data-action="rename">Rename</div>
          <div class="item-dropdown-btn danger" data-action="delete">Delete</div>
        `;

        row.appendChild(dropdown);
        if (typeof openOverlay === "function") openOverlay("domainItemDropdown", dropdown);

        dropdown.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const action = ev.target.dataset.action;
          dropdown.remove();
          if (typeof setUIState === "function") setUIState({ openOverlay: null });

          if (action === "rename") {
            openRenameModal(domain.id, domain.title);
          }

          if (action === "delete") {
            const confirmed = confirm(`Move domain "${domain.title}" to Trash? You can restore it later.`);
            if (!confirmed) return;
            moveDomainToTrash(domain.id);
            if (currentPageId === "home") {
              const card = document.querySelector(`[data-linked-page-id="${domain.id}"]`);
              if (card) card.remove();
            }
            if (currentPageId === domain.id) {
              hasOpenedPage = false;
              openPage("home");
            }
          }
        });
      },
      childrenEl: children
    }));
  });
}

function promptCreateDomain() {
  // build a temporary block to hang the modal on
  const cardData = {
    id: `block-${Date.now()}`,
    type: "domain",
    linkedPageId: "",
    pageCardTitle: "Domain Name",
    x: snap(GRID_SIZE * 2),
    y: snap(GRID_SIZE * 2),
    w: snap(GRID_SIZE * 9),
    h: snap(GRID_SIZE * 1),
    z: 0,
    titleHTML: "", bodyHTML: "",
    bg: "", borderColor: "", textColor: "", radius: "", hasNote: 0,
  };

  const b = buildBlockFromData(cardData);

  // if on home drop it live, otherwise stage it invisibly
  if (currentPageId === "home") {
    document.getElementById("grid").appendChild(b);
  } else {
    b.style.visibility = "hidden";
    document.getElementById("grid").appendChild(b);
  }

  // when modal confirms, also inject into home blocks if not on home
  const originalConfirm = confirmPageCreate;
  openPageCreateModal(b);

  // patch confirmPageCreate to handle the sidebar-triggered case
  const _patch = () => {
    if (!b.dataset.linkedPageId) return;
    if (currentPageId !== "home") {
      b.remove();
      const all = readAllPageBlocks();
      const homeBlocks = all["home"] || [];
      homeBlocks.push({
        ...cardData,
        ...serializeBlockElement(b),
        id: b.id,
      });
      all["home"] = homeBlocks;
      writeAllPageBlocks(all);
    } else {
      saveCurrentPageBlocks();
      saveState();
    }
  };

  // observe when modal closes
  const observer = new MutationObserver(() => {
    if (!document.getElementById("pageCreateOverlay").classList.contains("open")) {
      _patch();
      observer.disconnect();
    }
  });
  observer.observe(document.getElementById("pageCreateOverlay"), { attributes: true, attributeFilter: ["class"] });
}

function createDomain(title) {
  const domain = {
    id:    `domain-${Date.now()}`,
    title: title.trim(),
    type:  "domain",
    isScopeBoundary: true,
    recordKind: "space",
    canonicalId: "",
  };
  userDomains.push(domain);
  saveSanctumRegistry();
  setTimeout(() => {
    renderSidebarDomains();
    renderSidebarPins();
    renderSidebarBookmarks();
    renderTabBar();
  }, 0);
  return domain;
}

let currentPageId = "home";
const PAGE_RESUME_SESSION_KEY = "sanctum_active_page_session_v1";
const PAGE_RESUME_HISTORY_KEY = "sanctumActivePageSession";
const PAGE_RESUME_WINDOW_MS = 60 * 60 * 1000;
let lastPageResumeTouch = 0;
let hasOpenedPage = false;

// == Tabs & Per-Tab Navigation ==
const tabs = [];
let activeTabId = null;
let isNavHistoryTravel = false;
const TABS_LAYOUT_KEY = (window.STORAGE_KEYS && window.STORAGE_KEYS.tabsLayout) || "sanctum_tabs_layout_v1";

function _genTabId() {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function createTab(startPageId = "home") {
  const tab = {
    id: _genTabId(),
    history: [],
    historyIndex: -1,
    pageId: startPageId,
  };
  tabs.push(tab);
  return tab;
}

function readTabsLayoutState() {
  if (typeof readStorageJSON === "function") {
    const raw = readStorageJSON(TABS_LAYOUT_KEY, null);
    return raw && typeof raw === "object" ? raw : null;
  }
  try {
    const raw = JSON.parse(localStorage.getItem(TABS_LAYOUT_KEY) || "null");
    return raw && typeof raw === "object" ? raw : null;
  } catch {
    return null;
  }
}

function saveTabsLayout() {
  const payload = {
    tabs: tabs.map((tab) => ({
      id: tab.id,
      pageId: tab.pageId,
      history: Array.isArray(tab.history) ? [...tab.history] : [],
      historyIndex: Number.isFinite(tab.historyIndex) ? tab.historyIndex : -1,
    })),
    activeTabId: activeTabId || "",
  };
  if (typeof writeStorageJSON === "function") {
    writeStorageJSON(TABS_LAYOUT_KEY, payload);
  } else {
    try { localStorage.setItem(TABS_LAYOUT_KEY, JSON.stringify(payload)); } catch (_error) {}
  }
}

function restoreTabsLayoutIfSaved() {
  const saved = readTabsLayoutState();
  if (!saved?.tabs?.length) return null;

  const allPages = getTabPageLookup();
  const restored = [];

  saved.tabs.forEach((raw) => {
    const history = Array.isArray(raw.history) ? raw.history.filter((id) => allPages[id]) : [];
    let pageId = allPages[raw.pageId] ? raw.pageId : "";
    if (!pageId && history.length) pageId = history[history.length - 1];
    if (!pageId || !allPages[pageId]) pageId = "home";
    if (!history.length) history.push(pageId);

    let historyIndex = Number.isFinite(raw.historyIndex) ? raw.historyIndex : history.length - 1;
    historyIndex = Math.max(0, Math.min(historyIndex, history.length - 1));

    restored.push({
      id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : _genTabId(),
      pageId: history[historyIndex] || pageId,
      history,
      historyIndex,
    });
  });

  if (!restored.length) return null;

  tabs.length = 0;
  restored.forEach((tab) => tabs.push(tab));

  activeTabId = saved.activeTabId && tabs.some((tab) => tab.id === saved.activeTabId)
    ? saved.activeTabId
    : tabs[0].id;

  renderTabBar();
  updateNavHistoryBtns();
  return getActiveTab()?.pageId || "home";
}

function getActiveTab() {
  return tabs.find(t => t.id === activeTabId) || null;
}

function pushTabHistory(pageId) {
  const tab = getActiveTab();
  if (!tab) return;
  tab.history.splice(tab.historyIndex + 1);
  tab.history.push(pageId);
  if (tab.history.length > 100) tab.history.shift();
  tab.historyIndex = tab.history.length - 1;
  tab.pageId = pageId;
}

function updateNavHistoryBtns() {
  const tab = getActiveTab();
  const backBtn = document.getElementById("navBackBtn");
  const fwdBtn = document.getElementById("navFwdBtn");
  if (backBtn) backBtn.disabled = !tab || tab.historyIndex <= 0;
  if (fwdBtn) fwdBtn.disabled = !tab || tab.historyIndex >= tab.history.length - 1;
}

function navBack() {
  const tab = getActiveTab();
  if (!tab || tab.historyIndex <= 0) return;
  tab.historyIndex--;
  tab.pageId = tab.history[tab.historyIndex];
  isNavHistoryTravel = true;
  openPage(tab.pageId);
  isNavHistoryTravel = false;
}

function navFwd() {
  const tab = getActiveTab();
  if (!tab || tab.historyIndex >= tab.history.length - 1) return;
  tab.historyIndex++;
  tab.pageId = tab.history[tab.historyIndex];
  isNavHistoryTravel = true;
  openPage(tab.pageId);
  isNavHistoryTravel = false;
}

function switchToTab(tabId) {
  if (activeTabId === tabId) return;
  activeTabId = tabId;
  const tab = getActiveTab();
  if (!tab) return;
  isNavHistoryTravel = true;
  openPage(tab.pageId);
  isNavHistoryTravel = false;
  saveTabsLayout();
}

function openNewTab(startPageId = "home") {
  const tab = createTab(startPageId);
  activeTabId = tab.id;
  openPage(startPageId);
  saveTabsLayout();
}

function closeTab(tabId) {
  const idx = tabs.findIndex(t => t.id === tabId);
  if (idx === -1) return;
  const wasActive = activeTabId === tabId;
  const shouldCloseSplit = splitOwnerTabId === tabId && document.body.classList.contains("split-active");
  tabs.splice(idx, 1);
  if (shouldCloseSplit) closeSplitPane();
  if (tabs.length === 0) {
    const newTab = createTab("home");
    activeTabId = newTab.id;
    openPage("home");
    saveTabsLayout();
    return;
  }
  if (wasActive) {
    const nextTab = tabs[Math.min(idx, tabs.length - 1)];
    switchToTab(nextTab.id);
  } else {
    renderTabBar();
    updateNavHistoryBtns();
    saveTabsLayout();
  }
}

function moveTab(fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
  if (fromIndex >= tabs.length || toIndex >= tabs.length) return;
  const [tab] = tabs.splice(fromIndex, 1);
  tabs.splice(toIndex, 0, tab);
  renderTabBar();
  saveTabsLayout();
}

function reorderTabInBar(tabId, toIndex) {
  const fromIndex = tabs.findIndex((t) => t.id === tabId);
  if (fromIndex === -1 || toIndex < 0 || toIndex >= tabs.length || fromIndex === toIndex) return;

  const [tab] = tabs.splice(fromIndex, 1);
  tabs.splice(toIndex, 0, tab);

  const bar = document.getElementById("tabBar");
  const el = bar?.querySelector(`[data-tab-id="${tabId}"]`);
  const newBtn = document.getElementById("tabNewBtn");
  const siblings = bar ? [...bar.querySelectorAll(".tab-item[data-tab-id]")] : [];
  const target = siblings[toIndex];

  if (el && bar) {
    if (target && target !== el) {
      bar.insertBefore(el, fromIndex < toIndex ? target.nextSibling : target);
    } else if (newBtn) {
      bar.insertBefore(el, newBtn);
    }
  }

  saveTabsLayout();
}

function closeOtherTabs(keepTabId) {
  const keep = tabs.find(t => t.id === keepTabId);
  if (!keep) return;
  if (splitOwnerTabId && splitOwnerTabId !== keepTabId && document.body.classList.contains("split-active")) {
    closeSplitPane();
  }
  tabs.length = 0;
  tabs.push(keep);
  if (activeTabId !== keepTabId) switchToTab(keepTabId);
  else {
    renderTabBar();
    saveTabsLayout();
  }
}

function closeTabsToRight(fromTabId) {
  const idx = tabs.findIndex(t => t.id === fromTabId);
  if (idx === -1) return;
  const removed = tabs.splice(idx + 1);
  if (!removed.length) return;
  if (removed.some((tab) => tab.id === splitOwnerTabId) && document.body.classList.contains("split-active")) {
    closeSplitPane();
  }
  if (!tabs.some(t => t.id === activeTabId)) {
    switchToTab(fromTabId);
  } else {
    renderTabBar();
    updateNavHistoryBtns();
    saveTabsLayout();
  }
}

function duplicateTab(tabId) {
  const source = tabs.find(t => t.id === tabId);
  if (!source) return;
  openNewTab(source.pageId || "home");
}

function cycleTabs(direction = 1) {
  if (tabs.length < 2) return;
  const idx = tabs.findIndex(t => t.id === activeTabId);
  const next = (idx + direction + tabs.length) % tabs.length;
  switchToTab(tabs[next].id);
}

function jumpToTab(index) {
  if (index < 0 || index >= tabs.length) return;
  switchToTab(tabs[index].id);
}

function getTabDropIndex(clientX) {
  const bar = document.getElementById("tabBar");
  if (!bar) return 0;
  const items = [...bar.querySelectorAll(".tab-item[data-tab-id]")];
  if (!items.length) return 0;
  for (let i = 0; i < items.length; i++) {
    const rect = items[i].getBoundingClientRect();
    if (clientX < rect.left + rect.width / 2) return i;
  }
  return items.length - 1;
}

function clearTabDropHints() {
  document.querySelectorAll(".tab-item.tab-drop-before").forEach((el) => el.classList.remove("tab-drop-before"));
}

function getTabPageLookup() {
  const allPages = { ...SYSTEM_PAGES };
  userDomains.forEach(d => { allPages[d.id] = d; });
  userPages.forEach(p => { allPages[p.id] = p; });
  return allPages;
}

function renderTabBar() {
  const bar = document.getElementById("tabBar");
  if (!bar) return;
  bar.style.display = "flex";

  const allPages = getTabPageLookup();

  bar.innerHTML = tabs.map(tab => {
    const page = allPages[tab.pageId] || { id: tab.pageId, title: "Untitled", type: "page" };
    const isActive = tab.id === activeTabId;
    const isSplit = !!splitOwnerTabId && tab.id === splitOwnerTabId && document.body.classList.contains("split-active");
    const cls = ["tab-item", isActive ? "active" : "", isSplit ? "split-view" : ""].filter(Boolean).join(" ");
    return `<div class="${cls}" data-tab-id="${escapeHTML(tab.id)}"><span class="tab-item-label">${escapeHTML(page.title || "Untitled")}</span><button class="tab-close" data-tab-close="${escapeHTML(tab.id)}" aria-label="Close tab">×</button></div>`;
  }).join("") + `<button class="tab-new-btn" id="tabNewBtn" aria-label="New tab" title="New tab"><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button>`;
}

function syncTabsWithRegistry(removedIds = []) {
  const removed = new Set(Array.isArray(removedIds) ? removedIds.filter(Boolean) : []);
  const allPages = getTabPageLookup();
  let activeNeedsNav = false;
  let fallbackPageId = "home";

  tabs.forEach((tab) => {
    tab.history = tab.history.filter((id) => allPages[id]);
    if (tab.historyIndex >= tab.history.length) {
      tab.historyIndex = Math.max(0, tab.history.length - 1);
    }

    if (!allPages[tab.pageId] || removed.has(tab.pageId)) {
      const historyId = tab.history[tab.historyIndex];
      tab.pageId = allPages[historyId] ? historyId : "home";
      if (!allPages[tab.pageId]) {
        tab.pageId = "home";
        tab.history = ["home"];
        tab.historyIndex = 0;
      }
    }

    if (tab.id === activeTabId && (!allPages[currentPageId] || removed.has(currentPageId))) {
      activeNeedsNav = true;
      fallbackPageId = tab.pageId;
    }
  });

  if (activeNeedsNav) {
    isNavHistoryTravel = true;
    openPage(fallbackPageId);
    isNavHistoryTravel = false;
    return;
  }

  renderTabBar();
  updateNavHistoryBtns();
  saveTabsLayout();
}

// Create the first tab on load; restoreTabsLayoutIfSaved() may replace this
(function initTabs() {
  const initialTab = createTab("home");
  activeTabId = initialTab.id;
}());

let suppressTabClick = false;

document.getElementById("tabBar")?.addEventListener("click", (e) => {
  if (suppressTabClick) {
    suppressTabClick = false;
    return;
  }
  const closeBtn = e.target.closest("[data-tab-close]");
  if (closeBtn) {
    e.stopPropagation();
    closeTab(closeBtn.dataset.tabClose);
    return;
  }
  if (e.target.closest("#tabNewBtn")) {
    openNewTab("home");
    return;
  }
  const tabItem = e.target.closest("[data-tab-id]");
  if (tabItem?.dataset.tabId) {
    switchToTab(tabItem.dataset.tabId);
  }
});

document.getElementById("tabBar")?.addEventListener("auxclick", (e) => {
  if (e.button !== 1) return;
  const closeBtn = e.target.closest("[data-tab-close]");
  if (closeBtn) {
    e.preventDefault();
    closeTab(closeBtn.dataset.tabClose);
    return;
  }
  const tabItem = e.target.closest(".tab-item[data-tab-id]");
  if (tabItem?.dataset.tabId) {
    e.preventDefault();
    closeTab(tabItem.dataset.tabId);
  }
});

(function initTabDragReorder() {
  const bar = document.getElementById("tabBar");
  if (!bar) return;

  let drag = null;

  const endDrag = () => {
    if (!drag) return;
    drag.el?.classList.remove("tab-dragging");
    clearTabDropHints();
    document.body.classList.remove("tab-reorder-active");
    drag = null;
  };

  bar.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const tabEl = e.target.closest(".tab-item[data-tab-id]");
    if (!tabEl || e.target.closest("[data-tab-close]")) return;

    const tabId = tabEl.dataset.tabId;
    if (tabs.findIndex((t) => t.id === tabId) === -1) return;

    drag = {
      tabId,
      startX: e.clientX,
      dragged: false,
      el: tabEl,
      pointerId: e.pointerId,
    };

    const onMove = (ev) => {
      if (!drag || ev.pointerId !== drag.pointerId) return;
      if (!drag.dragged && Math.abs(ev.clientX - drag.startX) > 4) {
        drag.dragged = true;
        drag.el.classList.add("tab-dragging");
        document.body.classList.add("tab-reorder-active");
        try { drag.el.setPointerCapture(ev.pointerId); } catch (_error) {}
      }
      if (!drag.dragged) return;

      ev.preventDefault();
      const toIdx = getTabDropIndex(ev.clientX);
      reorderTabInBar(drag.tabId, toIdx);

      clearTabDropHints();
      const items = [...bar.querySelectorAll(".tab-item[data-tab-id]")];
      const currentIdx = tabs.findIndex((t) => t.id === drag.tabId);
      if (items[currentIdx]) items[currentIdx].classList.add("tab-drop-before");
    };

    const onUp = (ev) => {
      if (!drag || ev.pointerId !== drag.pointerId) return;
      if (drag.dragged) suppressTabClick = true;
      try { drag.el.releasePointerCapture(ev.pointerId); } catch (_error) {}
      endDrag();
      bar.removeEventListener("pointermove", onMove);
      bar.removeEventListener("pointerup", onUp);
      bar.removeEventListener("pointercancel", onUp);
    };

    bar.addEventListener("pointermove", onMove);
    bar.addEventListener("pointerup", onUp);
    bar.addEventListener("pointercancel", onUp);
  });
})();

(function initTabKeyboardShortcuts() {
  function isTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return !!el.isContentEditable;
  }

  document.addEventListener("keydown", (e) => {
    if (isTypingTarget(document.activeElement)) return;
    if (!e.ctrlKey && !e.metaKey) return;

    const key = e.key.toLowerCase();

    if (key === "t") {
      e.preventDefault();
      openNewTab("home");
      return;
    }

    if (key === "w") {
      if (tabs.length <= 1) return;
      e.preventDefault();
      closeTab(activeTabId);
      return;
    }

    if (key === "tab") {
      e.preventDefault();
      cycleTabs(e.shiftKey ? -1 : 1);
      return;
    }

    const num = Number(key);
    if (Number.isInteger(num) && num >= 1 && num <= 9) {
      e.preventDefault();
      jumpToTab(num - 1);
    }
  });
})();

document.getElementById("navBackBtn")?.addEventListener("click", navBack);
document.getElementById("navFwdBtn")?.addEventListener("click", navFwd);

function syncAppWorkspaceHeaderHeight() {
  const topbar = document.querySelector("#mainPane > .topbar");
  const height = topbar
    ? Math.max(0, Math.round(topbar.getBoundingClientRect().bottom))
    : 0;
  document.documentElement.style.setProperty("--app-workspace-header-height", `${height}px`);
}

document.getElementById("tabToggleBtn")?.addEventListener("click", () => {
  const inner = document.getElementById("tabBarInner");
  const wrap = document.getElementById("tabBarWrap");
  const btn = document.getElementById("tabToggleBtn");
  if (!wrap) return;
  const collapsed = wrap.classList.toggle("tabs-collapsed");
  if (btn) btn.classList.toggle("active", !collapsed);
  syncAppWorkspaceHeaderHeight();
});

const appTabBarWrap = document.getElementById("tabBarWrap");
if (appTabBarWrap && typeof ResizeObserver === "function") {
  const appHeaderResizeObserver = new ResizeObserver(syncAppWorkspaceHeaderHeight);
  appHeaderResizeObserver.observe(appTabBarWrap);
  const appMainTopbar = document.querySelector("#mainPane > .topbar");
  if (appMainTopbar) appHeaderResizeObserver.observe(appMainTopbar);
}
window.addEventListener("resize", syncAppWorkspaceHeaderHeight);
syncAppWorkspaceHeaderHeight();

function rememberActivePageForSession(pageId) {
  const visitedAt = Date.now();
  const resumeState = {
    pageId: String(pageId || "home"),
    visitedAt
  };
  lastPageResumeTouch = visitedAt;
  try {
    sessionStorage.setItem(PAGE_RESUME_SESSION_KEY, JSON.stringify(resumeState));
  } catch (err) {
    console.warn("Could not save Sanctum's recent page tab memory.", err);
  }
  try {
    const currentHistoryState = history.state && typeof history.state === "object" ? history.state : {};
    history.replaceState({ ...currentHistoryState, [PAGE_RESUME_HISTORY_KEY]: resumeState }, "");
  } catch (err) {
    console.warn("Could not save Sanctum's recent page reload hint.", err);
  }
}

function touchActivePageSession() {
  const now = Date.now();
  if (now - lastPageResumeTouch < 60 * 1000) return;
  rememberActivePageForSession(currentPageId);
}

function getRecentSessionPageId() {
  try {
    const navigationEntry = performance.getEntriesByType?.("navigation")?.[0];
    if (navigationEntry?.type !== "reload") return "home";
    const raw = sessionStorage.getItem(PAGE_RESUME_SESSION_KEY);
    const storedPage = raw ? JSON.parse(raw) : null;
    const historyPage = history.state?.[PAGE_RESUME_HISTORY_KEY] || null;
    const saved = Number(historyPage?.visitedAt || 0) > Number(storedPage?.visitedAt || 0)
      ? historyPage
      : storedPage;
    if (!saved) return "home";
    const pageId = String(saved?.pageId || "home");
    const visitedAt = Number(saved?.visitedAt || 0);
    const isRecent = visitedAt > 0 && Date.now() - visitedAt <= PAGE_RESUME_WINDOW_MS;
    const isAvailable = pageId === "home"
      || ["search", "inbox", "notes"].includes(pageId)
      || userDomains.some((domain) => domain.id === pageId)
      || userPages.some((page) => page.id === pageId);
    if (!isRecent || !isAvailable) {
      sessionStorage.removeItem(PAGE_RESUME_SESSION_KEY);
      const currentHistoryState = history.state && typeof history.state === "object" ? { ...history.state } : {};
      delete currentHistoryState[PAGE_RESUME_HISTORY_KEY];
      history.replaceState(currentHistoryState, "");
      return "home";
    }
    return pageId;
  } catch (err) {
    console.warn("Could not restore the recent Sanctum page.", err);
    return "home";
  }
}

document.addEventListener("pointerdown", touchActivePageSession, { passive: true });
document.addEventListener("keydown", touchActivePageSession);

function openPage(pageId, options = {}) {
  const { revealSidebarPath = true, skipTabHistory = false } = options;

  if (!isNavHistoryTravel && !skipTabHistory) pushTabHistory(pageId);

  if (pageId !== "search" && typeof closeSearch === "function") {
    closeSearch();
  }

  if (hasOpenedPage) {
    window.persistInfiniteCanvasView?.(currentPageId, { immediate: true });
    saveCurrentPageBlocks();
  }

  currentPageId = pageId;
  rememberActivePageForSession(pageId);
  if (typeof applyResolvedTheme === "function") {
    applyResolvedTheme(pageId);
  }
  sidebarAutoRevealPath = revealSidebarPath;
  renderSidebarDomains();
  renderSidebarPins();
  renderSidebarBookmarks();

  // update topbar title
  const allPages = { ...SYSTEM_PAGES };
  userDomains.forEach(d => allPages[d.id] = d);
  userPages.forEach(p => allPages[p.id] = p);

  const page = allPages[pageId];
  if (page && pageTitle) pageTitle.textContent = page.title;
  document.body.classList.toggle("sheet-page", page?.layout === "sheet");
  document.body.classList.toggle("profile-page", page?.layout === "profile");
  document.body.classList.toggle("infinite-canvas-page", page?.layout === "infinite-canvas");
  document.body.classList.toggle("journal-page", page?.layout === "journal");

  // page properties strip
  if (typeof window.openPageProps === "function") {
    if (page?.category && page.category !== "none") {
      window.openPageProps(pageId);
    } else {
      window.closePageProps?.();
    }
  }

  // clear grid and load this page's blocks
  clearGrid();
  if (page?.layout === "journal") {
    const pageContent = document.getElementById("pageContent");
    if (pageContent) {
      pageContent.className = "journal-root";
      pageContent.style.display = "block";
      pageContent.dataset.surfaceType = "journal";
      pageContent.innerHTML = `
        <section class="journal-proto-shell">
          <div class="journal-proto-loading">Loading journal prototype...</div>
        </section>
      `;
    }
  } else {
    window.closeJournalPage?.();
    loadPageBlocks(pageId);
  }

  // update ALL nav highlights — clear everything first
  document.querySelectorAll(".item, .nav-item").forEach(i => i.classList.remove("active", "active-ancestor"));

  // highlight correct nav item
  if (pageId === "home") navHome.classList.add("active");
  else if (pageId === "search") navSearch.classList.add("active");
  else if (pageId === "inbox") navInbox.classList.add("active");
  else if (pageId === "notes") navNotes?.classList.add("active");

  // highlight correct sidebar items and their parent path
  const activePath = getBreadcrumbPath(pageId);
  activePath.forEach((entry) => {
    const matches = document.querySelectorAll(`[data-domain-id="${entry.id}"], [data-page-id="${entry.id}"]`);
    matches.forEach((item) => {
      if (entry.id === pageId) item.classList.add("active");
      else if (entry.id !== "home") item.classList.add("active-ancestor");
    });
  });

  // update topbar context
  updateTopbarContext(pageId);
  renderBreadcrumbs(pageId);
  updatePinBtn();
  renderPageHero(pageId);
  updateBookmarkBtn(pageId);
  loadStickers(pageId);

  // check if this is a document layout page
  const pageObj = page;
  if (pageObj && pageObj.layout === "profile") {
    document.body.classList.remove(
      "editing",
      "block-selected",
      "block-type-text",
      "block-type-list",
      "block-type-image",
      "block-type-container",
      "block-type-table"
    );
    closeDocEditor();
    if (typeof window.openProfileEditor === "function") window.openProfileEditor(pageId);
  } else if (pageObj && pageObj.layout === "document") {
    document.body.classList.remove(
      "editing",
      "block-selected",
      "block-type-text",
      "block-type-list",
      "block-type-image",
      "block-type-container",
      "block-type-table"
    );
    if (typeof window.closeProfileEditor === "function") window.closeProfileEditor();
    openDocEditor(pageId);
  } else {
    if (typeof window.closeProfileEditor === "function") window.closeProfileEditor();
    closeDocEditor();
  }

  applyPageFontPreset(pageId);
  window.syncInfiniteCanvasPage?.(pageId);

  if (page?.layout === "journal") {
    if (typeof window.renderJournalPage === "function") {
      window.renderJournalPage(pageId);
    } else {
      let journalRendered = false;
      const renderJournalWhenReady = () => {
        if (journalRendered || currentPageId !== pageId || typeof window.renderJournalPage !== "function") return;
        journalRendered = true;
        window.removeEventListener("sanctum:journal-ready", renderJournalWhenReady);
        window.renderJournalPage(pageId);
      };
      window.addEventListener("sanctum:journal-ready", renderJournalWhenReady, { once: true });
      window.setTimeout(renderJournalWhenReady, 0);
    }
  }

  hasOpenedPage = true;

  renderTabBar();
  updateNavHistoryBtns();

  // keep tab toggle btn in sync
  const tabToggleBtn = document.getElementById("tabToggleBtn");
  const tabBarWrap = document.getElementById("tabBarWrap");
  if (tabToggleBtn && tabBarWrap) {
    tabToggleBtn.classList.toggle("active", !tabBarWrap.classList.contains("tabs-collapsed"));
    tabToggleBtn.setAttribute("aria-pressed", !tabBarWrap.classList.contains("tabs-collapsed"));
  }

  if (page?.layout !== "journal" && typeof window.onSanctumPageOpen === "function") {
    window.onSanctumPageOpen(pageId);
  }

  if (typeof window.resetHistoryForCurrentPage === "function") {
    window.resetHistoryForCurrentPage();
  }

  saveTabsLayout();
}

// == Breadcrumbs ==
function getBreadcrumbPath(pageId) {
  const allPages = { ...SYSTEM_PAGES };
  userDomains.forEach(d => allPages[d.id] = { ...d, type: "domain" });
  userPages.forEach(p => allPages[p.id] = p);

  const path = [];
  let current = allPages[pageId];

  // walk up the parent chain
  const visited = new Set();
  while (current) {
    if (visited.has(current.id)) break; // prevent infinite loop
    visited.add(current.id);
    path.unshift(current);
    if (!current.parent || !allPages[current.parent]) break;
    current = allPages[current.parent];
  }

  // always start from home if not already there
  if (path.length === 0 || path[0].id !== "home") {
    path.unshift(SYSTEM_PAGES.home);
  }

  return path;
}

function renderBreadcrumbs(pageId) {
  let bar = document.getElementById("breadcrumbBar");
  if (!bar) return;

  const path = getBreadcrumbPath(pageId);

  // don't show breadcrumbs on system pages
  if (["home", "search", "inbox", "notes"].includes(pageId)) {
    bar.style.display = "none";
    const titleEl = document.getElementById("pageTitle");
    if (titleEl) titleEl.style.display = "";
    return;
  }

  const titleEl = document.getElementById("pageTitle");
  if (titleEl) titleEl.style.display = "none";
  bar.style.display = "flex";
  bar.innerHTML = "";

  // Collapse middle segments when path is deep: show first / ⋯ / parent / current
  const MAX_VISIBLE = 5;
  let visible;
  let collapsed = [];
  if (path.length > MAX_VISIBLE) {
    collapsed = path.slice(1, path.length - 2);
    visible = [path[0], null, path[path.length - 2], path[path.length - 1]];
  } else {
    visible = path;
  }

  function appendSep() {
    const sep = document.createElement("span");
    sep.className = "breadcrumb-sep";
    sep.textContent = "/";
    bar.appendChild(sep);
  }

  function appendSeg(page, isCurrent) {
    const seg = document.createElement("span");
    seg.className = "breadcrumb-seg";
    seg.innerHTML = page.icon
      ? `${getIconMarkup(page.icon, page.type === "domain" ? "⌂" : "📄", "breadcrumb-icon", { scale: page.iconScale })}<span>${escapeHTML(page.title)}</span>`
      : `<span>${escapeHTML(page.title)}</span>`;
    if (isCurrent) {
      seg.classList.add("breadcrumb-current");
    } else {
      seg.classList.add("breadcrumb-link");
      seg.addEventListener("click", () => openPage(page.id));
    }
    bar.appendChild(seg);
  }

  visible.forEach((page, i) => {
    if (page === null) {
      // ellipsis placeholder
      const ell = document.createElement("span");
      ell.className = "breadcrumb-seg breadcrumb-ellipsis";
      ell.textContent = "⋯";
      ell.title = collapsed.map(p => p.title).join(" / ");
      bar.appendChild(ell);
    } else {
      const isCurrent = i === visible.length - 1;
      appendSeg(page, isCurrent);
    }
    if (i < visible.length - 1) appendSep();
  });
}


function updateTopbarContext(pageId) {
  const isDomain = userDomains.some(d => d.id === pageId);
  const isPage   = userPages.some(p => p.id === pageId);
  const isHome   = pageId === "home";
  const isInbox  = pageId === "inbox";
  const isSearch = pageId === "search";
  const isNotes  = pageId === "notes";

  // show/hide pin current button
  const pinCurrentBtn = document.getElementById("pinCurrentBtn");
  if (pinCurrentBtn) pinCurrentBtn.style.display = (isPage || isDomain) ? "" : "none";

  // show/hide bookmark button
  const bookmarkBtn = document.getElementById("bookmarkBtn");
  if (bookmarkBtn) bookmarkBtn.style.display = (isPage || isDomain) ? "" : "none";

  const pageObj = userPages.find(p => p.id === pageId);
  const isDocPage = pageObj?.layout === "document";
  const isSheetPage = pageObj?.layout === "sheet";

  // show/hide document view switcher (Edit / View / Annotate)
  const docViewSwitcher = document.getElementById("docViewSwitcher");
  if (docViewSwitcher) {
    docViewSwitcher.style.display = (isDocPage && !isInbox && !isSearch) ? "inline-flex" : "none";
  }

  if (!isDocPage && typeof window.closeDocAnnotateDock === "function") {
    window.closeDocAnnotateDock();
  }

  if (typeof window.syncAnnotationToolbarPosition === "function") {
    window.syncAnnotationToolbarPosition();
  }

 // show/hide edit toggle — repurpose as insert on document pages
  const editToggle = document.getElementById("editToggle");
  if (editToggle) {
    editToggle.style.display = (isInbox || isSearch || isNotes || isSheetPage) ? "none" : "";
    editToggle.textContent = "✎";
    editToggle.title = isDocPage ? "Annotate Tools" : "Edit";
  }

  // show/hide more button
  const moreBtn = document.getElementById("moreBtn");
  if (moreBtn) moreBtn.style.display = (isSearch || isNotes) ? "none" : "";

  // hide domain tool in edit dock when not on home
  const toolDomain = document.getElementById("toolDomain");
  if (toolDomain) toolDomain.style.display = isHome ? "" : "none";
}

function saveCurrentPageBlocks() {
  setPageBlocks(currentPageId, serializeBlocks());
}

// ==============================
// == Split Pane               ==
// ==============================
let splitPageId = null;
let splitOwnerTabId = null;
let splitHistory = [];
let splitHistoryIndex = -1;
let isSplitNavTravel = false;

const SPLIT_LAYOUT_KEY = (window.STORAGE_KEYS && window.STORAGE_KEYS.splitLayout) || "sanctum_split_layout_v1";
const SPLIT_MIN_WIDTH = 240;
const SPLIT_MAX_RATIO = 0.68;
const SPLIT_DEFAULT_WIDTH = 420;

function readSplitLayoutState() {
  const fallback = { open: false, pageId: "", ownerTabId: "", width: SPLIT_DEFAULT_WIDTH };
  if (typeof readStorageJSON === "function") {
    const raw = readStorageJSON(SPLIT_LAYOUT_KEY, fallback);
    return raw && typeof raw === "object" ? raw : fallback;
  }
  try {
    const raw = JSON.parse(localStorage.getItem(SPLIT_LAYOUT_KEY) || "{}");
    return raw && typeof raw === "object" ? { ...fallback, ...raw } : fallback;
  } catch {
    return fallback;
  }
}

function writeSplitLayoutState(patch = {}) {
  const current = readSplitLayoutState();
  const width = Number(patch.width ?? current.width);
  const next = {
    open: "open" in patch ? !!patch.open : !!current.open,
    pageId: typeof (patch.pageId ?? current.pageId) === "string" ? (patch.pageId ?? current.pageId) : "",
    ownerTabId: typeof (patch.ownerTabId ?? current.ownerTabId) === "string" ? (patch.ownerTabId ?? current.ownerTabId) : "",
    width: Number.isFinite(width) && width > 0 ? Math.round(width) : SPLIT_DEFAULT_WIDTH,
  };
  if (typeof writeStorageJSON === "function") {
    writeStorageJSON(SPLIT_LAYOUT_KEY, next);
  } else {
    try { localStorage.setItem(SPLIT_LAYOUT_KEY, JSON.stringify(next)); } catch (_error) {}
  }
}

function clampSplitWidth(width) {
  const max = Math.max(SPLIT_MIN_WIDTH, Math.floor(window.innerWidth * SPLIT_MAX_RATIO));
  return Math.max(SPLIT_MIN_WIDTH, Math.min(max, Math.round(width)));
}

function applySplitWidth(width) {
  const pane = document.getElementById("splitPane");
  if (!pane) return SPLIT_DEFAULT_WIDTH;
  const next = clampSplitWidth(width);
  pane.style.width = `${next}px`;
  document.documentElement.style.setProperty("--split-pane-width", `${next}px`);
  writeSplitLayoutState({ width: next });
  return next;
}

function promoteSplitPageToMain() {
  if (!splitPageId) return;
  openPage(splitPageId);
}

function swapSplitWithMain() {
  if (!document.body.classList.contains("split-active") || !splitPageId) return;

  const mainPageId = currentPageId;
  const refPageId = splitPageId;
  if (mainPageId === refPageId) return;

  if (hasOpenedPage) {
    window.persistInfiniteCanvasView?.(currentPageId, { immediate: true });
    saveCurrentPageBlocks();
  }

  isNavHistoryTravel = true;
  openPage(refPageId);
  isNavHistoryTravel = false;

  isSplitNavTravel = true;
  navigateSplitTo(mainPageId);
  isSplitNavTravel = false;

  splitOwnerTabId = activeTabId;
  writeSplitLayoutState({
    open: true,
    pageId: mainPageId,
    ownerTabId: splitOwnerTabId,
  });
  saveTabsLayout();
}
function pushSplitHistory(pageId) {
  splitHistory.splice(splitHistoryIndex + 1);
  splitHistory.push(pageId);
  if (splitHistory.length > 50) splitHistory.shift();
  splitHistoryIndex = splitHistory.length - 1;
}

function updateSplitNavBtns() {
  const back = document.getElementById("splitBackBtn");
  const fwd = document.getElementById("splitFwdBtn");
  if (back) back.disabled = splitHistoryIndex <= 0;
  if (fwd) fwd.disabled = splitHistoryIndex >= splitHistory.length - 1;
}

function loadSplitBlocks(pageId) {
  const grid = document.getElementById("splitGrid");
  const canvas = document.getElementById("splitCanvas");
  if (!grid || !canvas) return;

  const allPages = { ...SYSTEM_PAGES };
  userDomains.forEach(d => allPages[d.id] = d);
  userPages.forEach(p => allPages[p.id] = p);
  const page = allPages[pageId];
  const layout = page?.layout;

  // Page types that need their own full renderer — show a prompt to open in main
  const specialLayouts = ["sheet", "infinite-canvas", "journal", "document", "profile"];
  if (layout && specialLayouts.includes(layout)) {
    const label = layout === "sheet" ? "database" : layout.replace("-", " ");
    canvas.innerHTML = `<div class="split-unsupported"><p>This is a <strong>${label}</strong> page.</p><button class="split-open-main-btn" id="splitUnsupportedOpenMain">Open in main</button></div>`;
    document.getElementById("splitUnsupportedOpenMain")?.addEventListener("click", () => {
      promoteSplitPageToMain();
    });
    return;
  }

  canvas.innerHTML = `<div class="grid split-grid" id="splitGrid"></div>`;
  const newGrid = document.getElementById("splitGrid");
  getPageBlocks(pageId).forEach(data => newGrid.appendChild(buildBlockFromData(data)));
}

function renderSplitTopbar(pageId) {
  const allPages = { ...SYSTEM_PAGES };
  userDomains.forEach(d => allPages[d.id] = d);
  userPages.forEach(p => allPages[p.id] = p);
  const page = allPages[pageId];
  const titleEl = document.getElementById("splitPageTitle");
  const breadcrumbEl = document.getElementById("splitBreadcrumbBar");
  if (!titleEl) return;

  const isSystem = ["home","search","inbox","notes"].includes(pageId);
  if (isSystem || !page) {
    titleEl.textContent = page?.title || "Home";
    titleEl.style.display = "";
    if (breadcrumbEl) { breadcrumbEl.style.display = "none"; breadcrumbEl.innerHTML = ""; }
    return;
  }

  const path = typeof getBreadcrumbPath === "function" ? getBreadcrumbPath(pageId) : [];
  if (path.length <= 1) {
    titleEl.textContent = page.title || "Untitled";
    titleEl.style.display = "";
    if (breadcrumbEl) { breadcrumbEl.style.display = "none"; breadcrumbEl.innerHTML = ""; }
    return;
  }

  // Show breadcrumbs instead of bare title when there's a path
  titleEl.style.display = "none";
  if (!breadcrumbEl) return;
  breadcrumbEl.style.display = "flex";
  const MAX = 4;
  const visible = path.length > MAX ? [path[0], null, ...path.slice(-2)] : path;
  breadcrumbEl.innerHTML = visible.map((p, i) => {
    const sep = i > 0 ? `<span class="breadcrumb-sep">/</span>` : "";
    if (p === null) return sep + `<span class="breadcrumb-seg breadcrumb-ellipsis">⋯</span>`;
    const isCurrent = i === visible.length - 1;
    return sep + `<span class="breadcrumb-seg${isCurrent ? " breadcrumb-current" : " breadcrumb-link"}" data-split-nav-page="${escapeHTML(p.id)}">${escapeHTML(p.title || "Untitled")}</span>`;
  }).join("");
  breadcrumbEl.querySelectorAll(".breadcrumb-link").forEach(el => {
    el.addEventListener("click", () => navigateSplitTo(el.dataset.splitNavPage));
  });
}

function renderSplitHero(pageId) {
  const container = document.getElementById("splitPageHero");
  if (!container) return;
  const allPages = { ...SYSTEM_PAGES };
  userDomains.forEach(d => allPages[d.id] = d);
  userPages.forEach(p => allPages[p.id] = p);
  const page = allPages[pageId];
  const isSystem = ["home","search","inbox","notes"].includes(pageId);
  const settings = typeof getPageSettings === "function" ? getPageSettings(pageId) : {};
  const noHero = isSystem || !page || page.layout === "sheet" || page.layout === "infinite-canvas" || page.layout === "journal";

  if (noHero) {
    container.style.display = "none";
    container.innerHTML = "";
    return;
  }

  const sizes = { sm: 148, md: 196, lg: 244, xl: 300 };
  const pos = typeof normalizeHeaderPos === "function" ? normalizeHeaderPos(settings.headerPos) : (typeof settings.headerPos === "number" ? settings.headerPos : 50);
  const showBanner = settings.showHeader && settings.headerSrc;
  const showBelow = settings.showTitle || settings.showIcon;

  if (!showBanner && !showBelow) {
    container.style.display = "none";
    container.innerHTML = "";
    return;
  }

  container.style.display = "";
  const h = sizes[settings.headerSize] || 196;

  let html = "";
  if (showBanner) {
    html += `<div class="page-hero-img-wrap" data-has-header="true" data-hero-size="${settings.headerSize || "md"}" style="height:${h}px; --hero-pos:${pos}%"><img class="page-hero-img" src="${settings.headerSrc}" alt="" /></div>`;
  }
  if (showBelow) {
    const iconFallback = page.type === "domain" ? "⌂" : "📄";
    html += `<div class="page-hero-below">`;
    if (settings.showIcon !== false) {
      html += `<div class="page-hero-icon split-hero-icon" data-page-icon-id="${escapeHTML(pageId)}"></div>`;
    }
    if (settings.showTitle !== false) {
      html += `<div class="page-hero-title">${escapeHTML(page.title || "")}</div>`;
    }
    html += `</div>`;
  }

  container.innerHTML = html;

  // Set icon content using the same helper as main pane
  if (settings.showIcon !== false) {
    const iconEl = container.querySelector(".split-hero-icon");
    if (iconEl) setIconElementContent(iconEl, page.icon, page.type === "domain" ? "⌂" : "📄", { scale: page.iconScale });
  }
}

function navigateSplitTo(pageId) {
  splitPageId = pageId;
  if (!isSplitNavTravel) pushSplitHistory(pageId);
  loadSplitBlocks(pageId);
  renderSplitHero(pageId);
  renderSplitTopbar(pageId);
  updateSplitNavBtns();
  renderTabBar();
  if (document.body.classList.contains("split-active")) {
    writeSplitLayoutState({ open: true, pageId, ownerTabId: splitOwnerTabId || "" });
  }
}

function splitBack() {
  if (splitHistoryIndex <= 0) return;
  splitHistoryIndex--;
  splitPageId = splitHistory[splitHistoryIndex];
  isSplitNavTravel = true;
  navigateSplitTo(splitPageId);
  isSplitNavTravel = false;
}

function splitFwd() {
  if (splitHistoryIndex >= splitHistory.length - 1) return;
  splitHistoryIndex++;
  splitPageId = splitHistory[splitHistoryIndex];
  isSplitNavTravel = true;
  navigateSplitTo(splitPageId);
  isSplitNavTravel = false;
}

function openSplitPane(pageId, options = {}) {
  const safePageId = pageId || currentPageId;
  const ownerTabId = typeof options.ownerTabId === "string" && options.ownerTabId.trim()
    ? options.ownerTabId.trim()
    : activeTabId;
  splitOwnerTabId = tabs.some((tab) => tab.id === ownerTabId) ? ownerTabId : activeTabId;
  splitPageId = safePageId;
  splitHistory = [];
  splitHistoryIndex = -1;
  const saved = readSplitLayoutState();
  applySplitWidth(saved.width || SPLIT_DEFAULT_WIDTH);
  document.body.classList.add("split-active");
  navigateSplitTo(splitPageId);
}

function closeSplitPane() {
  const pane = document.getElementById("splitPane");
  const width = pane?.offsetWidth || readSplitLayoutState().width || SPLIT_DEFAULT_WIDTH;
  writeSplitLayoutState({ open: false, pageId: "", ownerTabId: "", width });
  document.body.classList.remove("split-active");
  splitPageId = null;
  splitOwnerTabId = null;
  splitHistory = [];
  splitHistoryIndex = -1;
  const grid = document.getElementById("splitGrid");
  if (grid) grid.innerHTML = "";
  renderTabBar();
}

function restoreSplitLayoutIfSaved() {
  const saved = readSplitLayoutState();
  if (!saved.open || !saved.pageId) return;
  if (!getTabPageLookup()[saved.pageId]) {
    writeSplitLayoutState({ open: false, pageId: "", ownerTabId: "" });
    return;
  }

  let ownerTabId = saved.ownerTabId && tabs.some((tab) => tab.id === saved.ownerTabId)
    ? saved.ownerTabId
    : tabs.find((tab) => tab.pageId === saved.pageId)?.id || "";

  if (!ownerTabId) {
    writeSplitLayoutState({ open: false, pageId: "", ownerTabId: "" });
    return;
  }

  applySplitWidth(saved.width || SPLIT_DEFAULT_WIDTH);
  openSplitPane(saved.pageId, { ownerTabId });
}

// Page-card links inside split navigate within split
document.getElementById("splitGrid")?.addEventListener("click", (e) => {
  const card = e.target.closest("[data-linked-page-id]");
  if (card?.dataset.linkedPageId) { e.stopPropagation(); navigateSplitTo(card.dataset.linkedPageId); }
});

document.getElementById("splitCloseBtn")?.addEventListener("click", closeSplitPane);
document.getElementById("splitBackBtn")?.addEventListener("click", splitBack);
document.getElementById("splitFwdBtn")?.addEventListener("click", splitFwd);
document.getElementById("splitOpenMainBtn")?.addEventListener("click", () => {
  promoteSplitPageToMain();
});

document.getElementById("splitSwapBtn")?.addEventListener("click", () => {
  swapSplitWithMain();
});

// Drag-to-resize
(function initSplitResize() {
  const divider = document.getElementById("splitDivider");
  if (!divider) return;

  applySplitWidth(readSplitLayoutState().width || SPLIT_DEFAULT_WIDTH);
  if (!document.documentElement.style.getPropertyValue("--split-pane-width")) {
    document.documentElement.style.setProperty("--split-pane-width", `${SPLIT_DEFAULT_WIDTH}px`);
  }

  let startX = 0;
  let startWidth = 0;

  function onDrag(e) {
    applySplitWidth(startWidth + (startX - e.clientX));
  }

  function stopDrag() {
    document.body.classList.remove("split-resizing");
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", stopDrag);
    window.removeEventListener("blur", stopDrag);
  }

  divider.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    startX = e.clientX;
    startWidth = document.getElementById("splitPane")?.offsetWidth || SPLIT_DEFAULT_WIDTH;
    document.body.classList.add("split-resizing");
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", stopDrag);
    window.addEventListener("blur", stopDrag);
  });

  divider.setAttribute("role", "separator");
  divider.setAttribute("aria-orientation", "vertical");
  divider.setAttribute("aria-label", "Resize split pane");
  divider.tabIndex = 0;

  divider.addEventListener("keydown", (e) => {
    if (!document.body.classList.contains("split-active")) return;
    const pane = document.getElementById("splitPane");
    if (!pane) return;
    const step = e.shiftKey ? 48 : 16;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      applySplitWidth(pane.offsetWidth + step);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      applySplitWidth(pane.offsetWidth - step);
    }
  });

  window.addEventListener("resize", () => {
    const pane = document.getElementById("splitPane");
    if (!pane || !document.body.classList.contains("split-active")) return;
    applySplitWidth(pane.offsetWidth);
  });
}());

window.restoreSplitLayoutIfSaved = restoreSplitLayoutIfSaved;
window.restoreTabsLayoutIfSaved = restoreTabsLayoutIfSaved;
window.swapSplitWithMain = swapSplitWithMain;

// Right-click context menu on tabs
(function initTabContextMenu() {
  const menu = document.getElementById("tabContextMenu");
  if (!menu) return;
  let ctxTabId = null;
  let justOpened = false;

  document.getElementById("tabBar")?.addEventListener("contextmenu", (e) => {
    const tabItem = e.target.closest(".tab-item[data-tab-id]");
    if (!tabItem) return;
    e.preventDefault();
    ctxTabId = tabItem.dataset.tabId;
    justOpened = true;
    const swapBtn = menu.querySelector("[data-action='swap-split']");
    const splitOpen = document.body.classList.contains("split-active") && !!splitPageId;
    if (swapBtn) swapBtn.style.display = splitOpen ? "" : "none";
    const menuW = 190;
    const menuH = splitOpen ? 240 : 210;
    menu.style.left = `${Math.min(e.clientX, window.innerWidth - menuW)}px`;
    menu.style.top = `${Math.min(e.clientY, window.innerHeight - menuH)}px`;
    menu.classList.add("visible");
    requestAnimationFrame(() => { justOpened = false; });
  });

  menu.querySelector("[data-action='open-split']")?.addEventListener("click", () => {
    const tab = tabs.find(t => t.id === ctxTabId);
    if (tab) openSplitPane(tab.pageId, { ownerTabId: tab.id });
    menu.classList.remove("visible");
  });

  menu.querySelector("[data-action='swap-split']")?.addEventListener("click", () => {
    swapSplitWithMain();
    menu.classList.remove("visible");
  });

  menu.querySelector("[data-action='duplicate-tab']")?.addEventListener("click", () => {
    if (ctxTabId) duplicateTab(ctxTabId);
    menu.classList.remove("visible");
  });

  menu.querySelector("[data-action='close-tab']")?.addEventListener("click", () => {
    if (ctxTabId) closeTab(ctxTabId);
    menu.classList.remove("visible");
  });

  menu.querySelector("[data-action='close-other-tabs']")?.addEventListener("click", () => {
    if (ctxTabId) closeOtherTabs(ctxTabId);
    menu.classList.remove("visible");
  });

  menu.querySelector("[data-action='close-tabs-right']")?.addEventListener("click", () => {
    if (ctxTabId) closeTabsToRight(ctxTabId);
    menu.classList.remove("visible");
  });

  document.addEventListener("click", (e) => {
    if (justOpened) return;
    if (!menu.contains(e.target)) menu.classList.remove("visible");
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") menu.classList.remove("visible"); });
}());

window.openSplitPane = openSplitPane;
window.closeSplitPane = closeSplitPane;
window.navigateSplitTo = navigateSplitTo;

window.saveCurrentPageBlocks = saveCurrentPageBlocks;
window.createPage = createPage;
window.getRecentSessionPageId = getRecentSessionPageId;
window.openPage = openPage;
window.renderTabBar = renderTabBar;
window.syncTabsWithRegistry = syncTabsWithRegistry;
window.renderSidebarDomains = renderSidebarDomains;
window.renderSidebarPins = renderSidebarPins;
window.renderSidebarBookmarks = renderSidebarBookmarks;

window.SanctumAssistantPageBlockStore = {
  read() {
    if (hasOpenedPage) saveCurrentPageBlocks();
    return typeof structuredClone === "function"
      ? structuredClone(readAllPageBlocks())
      : JSON.parse(JSON.stringify(readAllPageBlocks()));
  },
  write(nextBlocks) {
    writeAllPageBlocks(nextBlocks && typeof nextBlocks === "object" ? nextBlocks : {});
    const page = userPages.find((entry) => entry.id === currentPageId)
      || userDomains.find((entry) => entry.id === currentPageId);
    if (hasOpenedPage && page?.layout !== "document" && page?.layout !== "journal") {
      clearGrid();
      loadPageBlocks(currentPageId);
    }
    return true;
  },
  hasPage(pageId) {
    return userPages.some((entry) => entry.id === pageId)
      || userDomains.some((entry) => entry.id === pageId);
  },
  getPage(pageId) {
    const page = userPages.find((entry) => entry.id === pageId)
      || userDomains.find((entry) => entry.id === pageId);
    return page ? { ...page } : null;
  },
};

window.SanctumAssistantPageRegistryStore = {
  read() {
    return typeof structuredClone === "function"
      ? structuredClone(userPages)
      : JSON.parse(JSON.stringify(userPages));
  },
  get(pageId) {
    const page = userPages.find((entry) => entry.id === pageId);
    return page ? { ...page } : null;
  },
  getParent(parentId) {
    if (parentId === "home") return { id: "home", title: "Home", kind: "home" };
    const page = userPages.find((entry) => entry.id === parentId);
    if (page) return { ...page, kind: "page" };
    const domain = userDomains.find((entry) => entry.id === parentId);
    return domain ? { ...domain, kind: "domain" } : null;
  },
  create(config = {}) {
    const page = createPage(
      String(config.title || "").trim(),
      String(config.parentId || "").trim(),
      config.layout || "board-canvas",
      config.category || "none",
      config.containerType || "page",
      {
        pageId: String(config.pageId || "").trim(),
        recordKind: config.recordKind || "",
        reuseExisting: false,
      }
    );
    const allBlocks = readAllPageBlocks();
    if (page?.id && !Object.prototype.hasOwnProperty.call(allBlocks, page.id)) {
      allBlocks[page.id] = [];
      writeAllPageBlocks(allBlocks);
    }
    return page ? { ...page } : null;
  },
  ensureDatabasePage(config = {}) {
    const pageId = String(config.pageId || "").trim();
    const parentId = String(config.parentId || "").trim();
    if (!pageId) return null;

    let page = userPages.find((entry) => entry.id === pageId) || null;
    if (!page) {
      if (!parentId) return null;
      return this.create({
        pageId,
        title: String(config.title || "").trim() || "Database",
        parentId,
        layout: "sheet",
        category: "none",
        containerType: "page",
        recordKind: "view"
      });
    }

    let changed = false;
    if (!String(page.title || "").trim() && String(config.title || "").trim()) {
      page.title = String(config.title || "").trim();
      changed = true;
    }
    if (!String(page.parent || "").trim() && parentId) {
      page.parent = parentId;
      changed = true;
    }
    if (page.layout !== "sheet") {
      page.layout = "sheet";
      changed = true;
    }
    if (page.category !== "none") {
      page.category = "none";
      changed = true;
    }
    if (page.containerType !== "page") {
      page.containerType = "page";
      changed = true;
    }
    if (page.recordKind !== "view") {
      page.recordKind = "view";
      changed = true;
    }
    if (page.hiddenInSidebar === true) {
      page.hiddenInSidebar = false;
      changed = true;
    }

    const allBlocks = readAllPageBlocks();
    if (!Object.prototype.hasOwnProperty.call(allBlocks, page.id)) {
      allBlocks[page.id] = [];
      writeAllPageBlocks(allBlocks);
    }
    if (changed) {
      saveSanctumRegistry();
      setTimeout(() => {
        renderSidebarDomains();
        renderSidebarPins();
        renderSidebarBookmarks();
        renderTabBar();
      }, 0);
    }
    return { ...page };
  },
  createDatabaseRowPages(items = []) {
    const requested = Array.isArray(items) ? items : [];
    const seenIds = new Set();
    const existingIds = new Set(userPages.map((page) => page.id));
    const normalized = requested.map((item) => {
      const id = String(item?.id || "").trim();
      const parentId = String(item?.parentId || "").trim();
      const sourcePageId = String(item?.sourcePageId || parentId).trim();
      const sourceKind = item?.sourceKind === "page" ? "page" : "block";
      const sourceBlockId = String(item?.sourceBlockId || "").trim();
      const rowId = String(item?.rowId || "").trim();
      const title = String(item?.title || "").trim() || "Untitled row";
      if (
        !id
        || !parentId
        || !sourcePageId
        || (sourceKind === "block" && !sourceBlockId)
        || !rowId
        || existingIds.has(id)
        || seenIds.has(id)
      ) {
        throw new Error("A generated database row page is invalid or already exists.");
      }
      seenIds.add(id);
      return { id, parentId, sourceKind, sourcePageId, sourceBlockId, rowId, title };
    });

    const allBlocks = readAllPageBlocks();
    const created = normalized.map((item) => {
      const page = {
        id: item.id,
        title: item.title,
        parent: item.parentId,
        layout: "document",
        category: "database-row",
        containerType: "database-row",
        openBehavior: "peek",
        icon: "",
        summary: "",
        tags: [],
        hiddenInSidebar: true,
        databaseRowRef: {
          sourceKind: item.sourceKind,
          sourcePageId: item.sourcePageId,
          sourceBlockId: item.sourceKind === "block" ? item.sourceBlockId : "",
          rowId: item.rowId,
        },
      };
      userPages.push(page);
      if (!Object.prototype.hasOwnProperty.call(allBlocks, page.id)) allBlocks[page.id] = [];
      return { ...page, databaseRowRef: { ...page.databaseRowRef } };
    });

    if (created.length) {
      saveSanctumRegistry();
      writeAllPageBlocks(allBlocks);
      setTimeout(() => {
        renderSidebarDomains();
        renderSidebarPins();
        renderSidebarBookmarks();
        renderTabBar();
      }, 0);
    }
    return created;
  },
  retargetDatabaseRowPages(config = {}) {
    const pageIds = new Set((Array.isArray(config.pageIds) ? config.pageIds : [])
      .map((pageId) => String(pageId || "").trim())
      .filter(Boolean));
    const parentId = String(config.parentId || "").trim();
    const sourceKind = config.sourceKind === "block" ? "block" : "page";
    const sourcePageId = String(config.sourcePageId || parentId).trim();
    const sourceBlockId = sourceKind === "block" ? String(config.sourceBlockId || "").trim() : "";
    if (!pageIds.size || !parentId || !sourcePageId || (sourceKind === "block" && !sourceBlockId)) return false;

    let changed = false;
    userPages.forEach((page) => {
      if (!pageIds.has(page.id)) return;
      page.parent = parentId;
      page.databaseRowRef = {
        sourceKind,
        sourcePageId,
        sourceBlockId,
        rowId: String(page.databaseRowRef?.rowId || "").trim()
      };
      changed = true;
    });
    if (!changed) return false;

    saveSanctumRegistry();
    setTimeout(() => {
      renderSidebarDomains();
      renderSidebarPins();
      renderSidebarBookmarks();
      renderTabBar();
    }, 0);
    return true;
  },
  deleteMany(pageIds = []) {
    const ids = [...new Set((Array.isArray(pageIds) ? pageIds : [])
      .map((pageId) => String(pageId || "").trim())
      .filter((pageId) => userPages.some((page) => page.id === pageId)))];
    if (!ids.length) return true;
    if (typeof deletePagesAndStoredData !== "function") return false;
    deletePagesAndStoredData(ids);
    return ids.every((pageId) => !userPages.some((page) => page.id === pageId));
  },
  delete(pageId) {
    const safePageId = String(pageId || "").trim();
    if (!safePageId) return false;
    if (!userPages.some((entry) => entry.id === safePageId)) return true;
    if (typeof deletePagesAndStoredData !== "function") return false;
    deletePagesAndStoredData([safePageId]);
    return !userPages.some((entry) => entry.id === safePageId);
  },
};

function loadPageBlocks(pageId) {
  const blocks = getPageBlocks(pageId);
  blocks.forEach(data => {
    const b = buildBlockFromData(data);
    document.getElementById("grid").appendChild(b);
    if (!(typeof data.h === "number" && data.h > 0)) autoGrowBlock(b);
  });
  expandGrid();
}

function getDefaultOpenBehavior(category, containerType) {
  // detail container type always peeks
  if (containerType === "detail") return "peek";
  // certain categories also default to peek
  const peekCategories = ["character", "spell", "item", "location", "event", "medication", "condition"];
  if (peekCategories.includes(category)) return "peek";
  return "open";
}

function getCardStyle(layout, category, containerType) {
  if (containerType === "detail") return "detail";
  if (containerType === "project") return "project";
  if (containerType === "hub") return "hub";
  const detailCategories = ["character", "spell", "item", "location", "event", "medication", "condition"];
  return detailCategories.includes(category) ? "detail" : "hub";
}

function createPage(title, parentId, layout = "board-canvas", category = "none", containerType = "page", options = {}) {
  const createOptions = options && typeof options === "object" ? options : {};
  if (layout === "journal") {
    containerType = "page";
    category = "none";
  }

  if (createOptions.reuseExisting === true && typeof window.findExistingVaultPageForCreate === "function") {
    const existing = window.findExistingVaultPageForCreate({
      title,
      parentId,
      layout,
      category,
      containerType,
      currentPageId: createOptions.currentPageId || (typeof currentPageId === "string" ? currentPageId : ""),
      scopeId: createOptions.scopeId || "",
      includeCurrentPage: createOptions.includeCurrentPage !== false
    });
    if (existing?.id) {
      return userPages.find((page) => page.id === existing.id) || existing;
    }
  }

  const requestedPageId = String(createOptions.pageId || "").trim();
  if (requestedPageId && (
    userPages.some((page) => page.id === requestedPageId)
    || userDomains.some((domain) => domain.id === requestedPageId)
  )) {
    throw new Error("A page with that ID already exists.");
  }
  const pageId = requestedPageId || `page-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const canonicalId = String(createOptions.canonicalId || "").trim();
  const defaultRecordKind = typeof window.getDefaultVaultRecordKind === "function"
    ? window.getDefaultVaultRecordKind({ layout, category, containerType })
    : (containerType === "hub" || containerType === "project" ? "space" : containerType === "detail" ? "record" : layout === "sheet" ? "view" : "record");
  const recordKind = typeof window.normalizeVaultRecordKind === "function"
    ? window.normalizeVaultRecordKind(createOptions.recordKind || "", defaultRecordKind)
    : (createOptions.recordKind || defaultRecordKind);
  const page = {
    id:            pageId,
    title:         title.trim(),
    parent:        parentId,
    layout:        layout,
    category:      category,
    containerType: containerType,
    openBehavior:  layout === "journal" ? "open" : getDefaultOpenBehavior(category, containerType),
    icon:          "",
    summary:       "",
    tags:          [],
    isScopeBoundary: containerType === "project",
    recordKind:    recordKind,
    canonicalId:   canonicalId && canonicalId !== pageId
      ? canonicalId
      : "",
  };
  userPages.push(page);
  saveSanctumRegistry();
  if (typeof window.applyPageTemplate === "function") {
    window.applyPageTemplate(page.id, category, layout);
  }
  setTimeout(() => {
  renderSidebarDomains();
  renderSidebarPins();
  renderSidebarBookmarks();
    renderTabBar();
  }, 0);
  return page;
}
