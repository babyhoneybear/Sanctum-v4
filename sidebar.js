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
    if (!page) return;

    const item = document.createElement("div");
    item.className = "item";
    item.dataset.pageId = pin.id;
    if (pin.id === currentPageId) item.classList.add("active");
    item.innerHTML = `
      ${getIconMarkup(page.icon, userDomains.some(d => d.id === pin.id) ? "⌂" : "📄", "item-icon")}
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
    if (!page) return;

    const item = document.createElement("div");
    item.className = "item";
    item.dataset.pageId = id;
    if (id === currentPageId) item.classList.add("active");
    item.innerHTML = `
      ${getIconMarkup(page.icon, userDomains.some(d => d.id === id) ? "⌂" : "📄", "item-icon")}
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
      ${getIconMarkup(icon, "📄", "item-icon")}
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
      ${getIconMarkup(page.icon, "📄", "item-icon")}
      <span class="item-name">${escapeHTML(page.title)}</span>
    `;
    pageItem.addEventListener("click", () => openPage(page.id));
    return pageItem;
  };

  const buildProjectItem = (project) => {
    const projectPages = userPages.filter(p => p.parent === project.id);
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
    const hubs = userPages.filter(p => p.parent === domain.id && p.containerType === "hub");
    const directProjects = userPages.filter(p => p.parent === domain.id && p.containerType === "project");
    const directPages = userPages.filter(p => p.parent === domain.id && !["hub", "project"].includes(p.containerType || "page"));

    const children = document.createElement("div");
    children.className = `item-children${shouldSidebarExpand(domain.id, activePathIds) ? "" : " collapsed"}`;

    hubs.forEach(hub => {
      const projects = userPages.filter(p => p.parent === hub.id && p.containerType === "project");
      const loosePages = userPages.filter(p => p.parent === hub.id && (p.containerType || "page") !== "project");
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
  };
  userDomains.push(domain);
  saveSanctumRegistry();
  setTimeout(() => {
    renderSidebarDomains();
    renderSidebarPins();
    renderSidebarBookmarks();
  }, 0);
  return domain;
}

let currentPageId = "home";
let hasOpenedPage = false;

function openPage(pageId, options = {}) {
  const { revealSidebarPath = true } = options;

  if (pageId !== "search" && typeof closeSearch === "function") {
    closeSearch();
  }

  if (hasOpenedPage) {
    saveCurrentPageBlocks();
  }

  currentPageId = pageId;
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

  // clear grid and load this page's blocks
  clearGrid();
  loadPageBlocks(pageId);

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
  const pageObj = userPages.find(p => p.id === pageId);
  if (pageObj && pageObj.layout === "document") {
    document.body.classList.remove(
      "editing",
      "block-selected",
      "block-type-text",
      "block-type-list",
      "block-type-image",
      "block-type-container",
      "block-type-table"
    );
    openDocEditor(pageId);
  } else {
    closeDocEditor();
  }

  applyPageFontPreset(pageId);

  hasOpenedPage = true;

  if (typeof window.onSanctumPageOpen === "function") {
    window.onSanctumPageOpen(pageId);
  }
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
  const titleEl = document.getElementById("pageTitle");

  // don't show breadcrumbs on system pages
  if (["home", "search", "inbox", "notes"].includes(pageId)) {
    bar.style.display = "none";
    if (titleEl) titleEl.style.display = "";
    return;
  }

  bar.style.display = "flex";
  if (titleEl) titleEl.style.display = "none";
  bar.innerHTML = "";

  path.forEach((page, i) => {
    const seg = document.createElement("span");
    seg.className = "breadcrumb-seg";
    seg.innerHTML = page.icon
      ? `${getIconMarkup(page.icon, page.type === "domain" ? "⌂" : "📄", "breadcrumb-icon")}<span>${escapeHTML(page.title)}</span>`
      : `<span>${escapeHTML(page.title)}</span>`;

    if (i < path.length - 1) {
      seg.classList.add("breadcrumb-link");
      seg.addEventListener("click", () => openPage(page.id));
    } else {
      seg.classList.add("breadcrumb-current");
    }

    bar.appendChild(seg);

    if (i < path.length - 1) {
      const sep = document.createElement("span");
      sep.className = "breadcrumb-sep";
      sep.textContent = "/";
      bar.appendChild(sep);
    }
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

function createPage(title, parentId, layout = "board-canvas", category = "none", containerType = "page") {
  const page = {
    id:            `page-${Date.now()}`,
    title:         title.trim(),
    parent:        parentId,
    layout:        layout,
    category:      category,
    containerType: containerType,
    openBehavior:  getDefaultOpenBehavior(category, containerType),
    icon:          "",
    summary:       "",
    tags:          [],
  };
  userPages.push(page);
  saveSanctumRegistry();
  setTimeout(() => {
    renderSidebarDomains();
    renderSidebarPins();
    renderSidebarBookmarks();
  }, 0);
  return page;
}
