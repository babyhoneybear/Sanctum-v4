// Shared page properties, edited through freely placed connection blocks.
// Connections and their optional details live once, independent of placement.

const PAGE_PROPS_STORAGE_KEY = "sanctum_page_props_v1";
const PAGE_RELATION_PRESETS = {
  parents: { label: "Parents", inverseLabel: "Children", targetCategory: "character", treeKind: "parent" },
  children: { label: "Children", inverseLabel: "Parents", targetCategory: "character" },
  partners: { label: "Partners", inverseLabel: "Partners", targetCategory: "character", treeKind: "partner" },
  siblings: { label: "Siblings", inverseLabel: "Siblings", targetCategory: "character", treeKind: "sibling" },
  "adoptive-parents": { label: "Adoptive parents", inverseLabel: "Adopted children", targetCategory: "character", treeKind: "adoptive" },
  "step-parents": { label: "Step parents", inverseLabel: "Step children", targetCategory: "character", treeKind: "step" },
  guardians: { label: "Guardians", inverseLabel: "Dependants", targetCategory: "character", treeKind: "guardian" },
  friends: { label: "Friends", inverseLabel: "Friends", targetCategory: "character", treeKind: "friend" },
  rivals: { label: "Rivals", inverseLabel: "Rivals", targetCategory: "character", treeKind: "rival" },
  mentors: { label: "Mentors", inverseLabel: "Mentees", targetCategory: "character", treeKind: "mentor" },
  birthplace: { label: "Birthplace", inverseLabel: "People born here", targetCategory: "location" },
  magic: { label: "Magic", inverseLabel: "Practitioners", targetCategory: "none", relationKind: "proficiency" },
  "spell-requirements": { label: "Spell requirements", inverseLabel: "Required by", relationKind: "spell-requirements" },
  role: { label: "Role", inverseLabel: "People with this role", targetCategory: "none" },
  serves: { label: "Serves", inverseLabel: "Served by", targetCategory: "character" }
};

// Default property schemas per category.
// Each entry: { id, label, type: "relation" | "text" }
const PAGE_PROP_SCHEMAS = {
  character: [
    { id: "spells",      label: "Spells",      type: "relation" },
    { id: "landmarks",   label: "Landmarks",   type: "relation" },
    { id: "family",      label: "Family",      type: "relation" },
    { id: "aliases",     label: "Aliases",     type: "text" },
  ],
  spell: [
    { id: "domain",      label: "Domain",      type: "text" },
    { id: "tier",        label: "Tier",        type: "text" },
    { id: "characters",  label: "Characters",  type: "relation" },
  ],
  location: [
    { id: "region",      label: "Region",      type: "text" },
    { id: "characters",  label: "Characters",  type: "relation" },
    { id: "factions",    label: "Factions",    type: "relation" },
  ],
  event: [
    { id: "date",        label: "Date / Era",  type: "text" },
    { id: "participants",label: "Participants", type: "relation" },
    { id: "places",      label: "Places",      type: "relation" },
  ],
  item: [
    { id: "type",        label: "Type",        type: "text" },
    { id: "owner",       label: "Owner",       type: "relation" },
    { id: "origin",      label: "Origin",      type: "text" },
  ],
};

// ── Storage ──────────────────────────────────────────────────

function readAllPageProps() {
  try {
    const raw = localStorage.getItem(PAGE_PROPS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function writeAllPageProps(all) {
  localStorage.setItem(PAGE_PROPS_STORAGE_KEY, JSON.stringify(all));
  window.invalidateRelationshipGraphCache?.();
  window.SanctumTreeUI?.refresh();
}

function getPageProps(pageId) {
  const all = readAllPageProps();
  if (!all[pageId]) return { properties: [] };
  return all[pageId];
}

function setPageProps(pageId, data) {
  const all = readAllPageProps();
  all[pageId] = data;
  writeAllPageProps(all);
}

function getPagePropertyRelations() {
  return window.SanctumPageRelations.collect(window.userPages || [], readAllPageProps());
}

function getPropertyCandidates(pageId, query = "", allScopes = false) {
  return window.SanctumPageRelations.candidates({
    pages: window.userPages || [], allProps: readAllPageProps(), sourceId: pageId, query, allScopes,
    scopeId: window.getVaultScopeId?.(pageId) || "", getScopeId: id => window.getVaultScopeId?.(id) || ""
  });
}

function createLinkedPropertyPage(pageId, propId, title, category = "none") {
  const host = (window.userPages || []).find(page => page.id === pageId);
  const property = getPageProps(pageId).properties.find(prop => prop.id === propId && prop.type === "relation");
  const name = String(title || "").trim();
  if (!host || !property || !name) throw new Error("Choose a name for the connected page.");
  const api = window.SanctumPageRelations;
  if ([host, ...getPropertyCandidates(pageId, name)].some(page => api.names(page, readAllPageProps()).includes(api.normalize(name)))) {
    throw new Error("A matching page already exists here. Choose it from the list.");
  }
  // Related entities belong to the current world, not beneath the character.
  const parentId = window.getVaultScopeId?.(pageId) || host.parent || "home";
  const customType = window.SanctumCustomTypes?.get(category);
  const useStarter = !!customType || category === 'character';
  const page = window.createPage(name, parentId, customType?.layout || "board-canvas", category, "page", { skipTemplate: !useStarter });
  // Characters and custom types get their reusable starter; other quick links stay blank.
  if (!useStarter) setPageProps(page.id, { properties: [] });
  addPropLink(pageId, propId, page.id);
  return page;
}

// Ensure a page has its default schema properties initialized.
function initPagePropsIfNeeded(pageId, category) {
  const all = readAllPageProps();
  if (all[pageId]) return; // already exists
  const customType = window.SanctumCustomTypes?.get(category);
  if (customType) {
    all[pageId] = { properties: window.SanctumCustomTypes.properties(customType), customTypeId: customType.id, customTypeVersion: customType.version };
    writeAllPageProps(all);
    return;
  }
  const schema = PAGE_PROP_SCHEMAS[category] || [];
  const properties = schema.map(s => ({
    id: s.id,
    label: s.label,
    type: s.type,
    value: "",          // for text
    linkedPageIds: [],  // for relation
  }));
  all[pageId] = { properties };
  writeAllPageProps(all);
}

// ── State ─────────────────────────────────────────────────────

let propsCurrentPageId = null;
let propsPickerOpen = false;
let propsPickerForPropertyId = null;

// ── Render ───────────────────────────────────────────────────

function renderPagePropsStrip(pageId, category, options = {}) {
  const strip = options.container;
  if (!strip) {
    refreshPageRelationViews();
    return;
  }

  initPagePropsIfNeeded(pageId, category);
  const data = getPageProps(pageId);
  const props = (data.properties || []).filter(prop => prop.id === options.propertyId);

  strip.innerHTML = "";
  strip.dataset.pageId = pageId;
  if (window.SanctumWorldSystemsUI?.render(strip, pageId, options.propertyId)) return;

  props.forEach(prop => {
    if (window.SanctumWorldSystems?.isRequirements(prop)) {
      const hint = document.createElement("p");
      hint.className = "world-system-hint";
      hint.textContent = "All listed proficiency requirements must be met.";
      strip.appendChild(hint);
    }
    const row = document.createElement("div");
    row.className = "pps-row";
    row.dataset.propId = prop.id;

    const label = document.createElement("div");
    label.className = "pps-label";
    label.textContent = prop.label;
    row.appendChild(label);

    const chips = document.createElement("div");
    chips.className = "pps-chips";

    if (prop.type === "relation") {
      const linkedIds = Array.isArray(prop.linkedPageIds) ? prop.linkedPageIds : [];
      linkedIds.forEach(lid => {
        const linkedPage = (window.userPages || []).find(p => p.id === lid);
        if (!linkedPage) return;
        const chip = document.createElement("button");
        const item = document.createElement("span");
        item.className = "pps-relation-item";
        chip.className = "pps-chip";
        chip.dataset.linkedPageId = lid;
        chip.title = "Open " + linkedPage.title;

        const icon = linkedPage.icon || categoryIcon(linkedPage.category);
        chip.innerHTML = `${getIconMarkup(icon, "📄", "pps-chip-icon")}<span class="pps-chip-label">${escapeHtml(linkedPage.title)}</span>`;
        item.appendChild(chip);
        window.SanctumWorldSystemsUI?.appendProficiency(item, pageId, prop, linkedPage);
        const detail = document.createElement("button");
        detail.className = "pps-detail-btn";
        detail.dataset.detailFor = lid;
        detail.textContent = prop.linkDetails?.[lid] ? `${window.SanctumWorldSystems?.isMagic(prop) ? "Note: " : ""}${prop.linkDetails[lid]}` : "+ detail";
        detail.title = `Edit details of ${linkedPage.title} in ${prop.label}`;
        item.appendChild(detail);
        const remove = document.createElement("button");
        remove.className = "pps-chip-remove";
        remove.dataset.removeId = lid;
        remove.textContent = "×";
        remove.setAttribute("aria-label", `Remove ${linkedPage.title} from ${prop.label}`);
        item.appendChild(remove);
        chips.appendChild(item);
      });

      const addBtn = document.createElement("button");
      addBtn.className = "pps-add-btn";
      addBtn.dataset.propId = prop.id;
      addBtn.title = "Add linked page";
      addBtn.textContent = "+ Add";
      chips.appendChild(addBtn);

    } else {
      // text property
      const val = document.createElement("div");
      val.className = "pps-text-value";
      val.dataset.propId = prop.id;
      val.contentEditable = "true";
      val.setAttribute("role", "textbox");
      val.setAttribute("aria-label", prop.label);
      val.spellcheck = false;
      val.textContent = prop.value || "";
      val.dataset.placeholder = "—";
      chips.appendChild(val);
    }

    row.appendChild(chips);
    strip.appendChild(row);
  });

  if (options.propertyId === "incoming") renderIncomingPageRelations(strip, pageId);

  bindPropsStripEvents(strip, pageId);
}

function refreshPageRelationViews() {
  window.SanctumCustomTypesUI?.refreshFieldsView();
  document.querySelectorAll?.('.block[data-type="connections"]').forEach(block => {
    if (!block.classList.contains("ghost")) mountConnectionsBlock(block);
  });
  const peek = document.getElementById("peekDrawer");
  const scroll = peek?.querySelector(".peek-scroll");
  if (scroll && peek.dataset.peekPageId) {
    scroll.querySelector(".pps-incoming")?.remove();
    renderIncomingPageRelations(scroll, peek.dataset.peekPageId);
  }
}

function mountConnectionsBlock(block) {
  const shell = block.querySelector(".connections-block-shell");
  if (!shell) return;
  const pageId = block.dataset.connectionSourcePageId || window.getCurrentPageId?.();
  const page = (window.userPages || []).find(item => item.id === pageId);
  const content = shell.querySelector(".connections-content");
  if (!page) { content.textContent = block.dataset.connectionSourcePageId ? "The source page is no longer available." : "Open a page to connect its information."; return; }
  block.dataset.connectionSourcePageId = pageId;
  initPagePropsIfNeeded(pageId, page.category);
  const properties = getPageProps(pageId).properties;
  const select = shell.querySelector(".connections-field-select");
  const title = shell.querySelector(".block-title");
  let sourceLabel = shell.querySelector(".connections-source");
  if (!sourceLabel) {
    sourceLabel = document.createElement("div");
    sourceLabel.className = "connections-source";
    shell.querySelector(".connections-block-heading").appendChild(sourceLabel);
  }
  sourceLabel.textContent = window.getCurrentPageId?.() !== pageId ? `From ${page.title}` : "";
  select.replaceChildren();
  const addOption = (value, label) => {
    const option = document.createElement("option");
    option.value = value; option.textContent = label; select.appendChild(option);
  };
  addOption("", "Choose information…");
  Object.entries(window.SanctumCharacterSheet?.titles || {}).forEach(([id,label])=>addOption(id,label));
  properties.forEach(prop => addOption(prop.id, prop.label));
  Object.entries(PAGE_RELATION_PRESETS).forEach(([id, preset]) => {
    if (!properties.some(prop => prop.id === id || prop.label?.toLowerCase() === preset.label.toLowerCase())) addOption(`preset:${id}`, preset.label);
  });
  addOption("incoming", "Connections to this page");
  if (!properties.some(prop => prop.id === "proficiency-levels")) addOption("proficiency-levels", "Proficiency levels");
  addOption("spell-access", "Spell access");
  addOption("custom", "+ New property or connection…");
  select.value = block.dataset.connectionPropertyId || "";
  const renderContent = () => {
    content.classList.remove('character-sheet-fields');
    const propertyId = block.dataset.connectionPropertyId || "";
    shell.classList.toggle("is-configured", !!propertyId);
    if (!propertyId) {
      content.textContent = "Choose what belongs here. Place another block for other information.";
      return;
    }
    if (window.SanctumCharacterSheet?.render(content, pageId, propertyId)) return;
    renderPagePropsStrip(pageId, page.category, { container: content, propertyId });
    if (!content.textContent.trim()) content.textContent = propertyId === "incoming" ? "Pages connected here will appear automatically." : "This property is no longer available. Choose another above.";
  };
  const choose = (id, label) => {
    block.dataset.connectionPropertyId = id;
    title.textContent = label;
    mountConnectionsBlock(block);
    window.saveState?.();
  };
  select.onchange = () => {
    const value = select.value;
    if (value === "custom") {
      select.value = block.dataset.connectionPropertyId || "";
      openAddPropertyDialog(pageId, prop => choose(prop.id, prop.label), select);
      return;
    }
    if (value.startsWith("preset:")) {
      const id = value.slice(7);
      const data = getPageProps(pageId);
      if (!data.properties.some(prop => prop.id === id)) data.properties.push({ id, ...PAGE_RELATION_PRESETS[id], type: "relation", linkedPageIds: [] });
      setPageProps(pageId, data);
      choose(id, PAGE_RELATION_PRESETS[id].label);
      return;
    }
    choose(value, properties.find(prop => prop.id === value)?.label || window.SanctumCharacterSheet?.titles[value] || ({ incoming: "Connected here", "proficiency-levels": "Proficiency levels", "spell-access": "Spell access" }[value] || "Connections"));
  };
  title.onblur = () => window.saveState?.();
  renderContent();
}

function renderIncomingPageRelations(container, pageId) {
  const incoming = getPagePropertyRelations().filter(relation => relation.to === pageId);
  if (!incoming.length) return;
  const section = document.createElement("div");
  section.className = "pps-incoming";
  const heading = document.createElement("div");
  heading.className = "pps-incoming-heading";
  heading.textContent = "Connected to this page";
  section.appendChild(heading);
  incoming.forEach(relation => {
    const source = window.userPages.find(page => page.id === relation.from);
    const button = document.createElement("button");
    button.className = "pps-incoming-link";
    button.textContent = `${source.title} — ${relation.inverseLabel === "Connected from" ? relation.label : relation.inverseLabel}${relation.detail ? ` · ${relation.detail}` : ""}`;
    button.addEventListener("click", () => window.openPeek?.(source.id));
    section.appendChild(button);
  });
  container.appendChild(section);
}

function categoryIcon(cat) {
  const map = { character: "👤", spell: "✨", location: "🏛", event: "📅", item: "🗡", medication: "💊", condition: "🩺" };
  return map[cat] || "📄";
}

function escapeHtml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Events ───────────────────────────────────────────────────

function bindPropsStripEvents(strip, pageId) {
  // Click on a chip label → peek that page
  strip.onclick = e => {
    const removeBtn = e.target.closest(".pps-chip-remove");
    if (removeBtn) {
      e.stopPropagation();
      const removeId = removeBtn.dataset.removeId;
      const row = removeBtn.closest(".pps-row");
      if (!row) return;
      const propId = row.dataset.propId;
      removePropLink(pageId, propId, removeId);
      return;
    }

    const detailBtn = e.target.closest(".pps-detail-btn");
    if (detailBtn) {
      openRelationDetailEditor(pageId, detailBtn.closest(".pps-row").dataset.propId, detailBtn.dataset.detailFor, detailBtn);
      return;
    }

    const chip = e.target.closest(".pps-chip");
    if (chip && !e.target.closest(".pps-chip-remove")) {
      const lid = chip.dataset.linkedPageId;
      if (lid && typeof window.openPeek === "function") {
        window.openPeek(lid);
      }
      return;
    }

    const addBtn = e.target.closest(".pps-add-btn");
    if (addBtn) {
      const propId = addBtn.dataset.propId;
      openPagePicker(pageId, propId, addBtn);
      return;
    }

    const addPropBtn = e.target.closest(".pps-add-prop-btn");
    if (addPropBtn) {
      openAddPropertyDialog(pageId);
      return;
    }
  };

  // Save text field on blur
  if (strip._sanctumPropsFocusout) strip.removeEventListener("focusout", strip._sanctumPropsFocusout);
  strip._sanctumPropsFocusout = e => {
    const textVal = e.target.closest(".pps-text-value");
    if (textVal) {
      const propId = textVal.dataset.propId;
      savePropText(pageId, propId, textVal.textContent.trim());
    }
  };
  strip.addEventListener("focusout", strip._sanctumPropsFocusout);

  // Save text field on Enter
  strip.onkeydown = e => {
    if (e.key === "Enter") {
      const textVal = e.target.closest(".pps-text-value");
      if (textVal) {
        e.preventDefault();
        textVal.blur();
      }
    }
  };
}

// ── Mutations ─────────────────────────────────────────────────

function savePropText(pageId, propId, value) {
  const data = getPageProps(pageId);
  const prop = data.properties.find(p => p.id === propId);
  if (prop) {
    prop.value = value;
    setPageProps(pageId, data);
    refreshPageRelationViews();
  }
}

function removePropLink(pageId, propId, linkedId) {
  const data = getPageProps(pageId);
  const prop = data.properties.find(p => p.id === propId);
  if (prop && Array.isArray(prop.linkedPageIds)) {
    prop.linkedPageIds = prop.linkedPageIds.filter(id => id !== linkedId);
    if (prop.linkDetails) delete prop.linkDetails[linkedId];
    if (prop.linkLevels) delete prop.linkLevels[linkedId];
    setPageProps(pageId, data);
    renderPagePropsStrip(pageId, getCurrentPageCategory(pageId));
  }
}

function addPropLink(pageId, propId, linkedId) {
  if (pageId === linkedId || !(window.userPages || []).some(page => page.id === linkedId)) return;
  const data = getPageProps(pageId);
  const prop = data.properties.find(p => p.id === propId);
  if (prop) {
    if (!Array.isArray(prop.linkedPageIds)) prop.linkedPageIds = [];
    if (!prop.linkedPageIds.includes(linkedId)) {
      prop.linkedPageIds.push(linkedId);
      setPageProps(pageId, data);
      renderPagePropsStrip(pageId, getCurrentPageCategory(pageId));
    }
  }
}

function savePropLinkDetail(pageId, propId, linkedId, value) {
  const data = getPageProps(pageId);
  const prop = data.properties.find(property => property.id === propId);
  if (!prop?.linkedPageIds?.includes(linkedId)) return;
  prop.linkDetails = { ...prop.linkDetails, [linkedId]: String(value || "").trim() };
  if (!prop.linkDetails[linkedId]) delete prop.linkDetails[linkedId];
  setPageProps(pageId, data);
}

function openRelationDetailEditor(pageId, propId, linkedId, anchor) {
  const input = document.createElement("input");
  input.className = "pps-detail-input";
  input.value = getPageProps(pageId).properties.find(prop => prop.id === propId)?.linkDetails?.[linkedId] || "";
  input.placeholder = "A note about this connection…";
  input.setAttribute("aria-label", "Connection detail");
  let cancelled = false;
  input.addEventListener("keydown", event => {
    if (event.key === "Escape") { cancelled = true; input.blur(); }
    if (event.key === "Enter") input.blur();
  });
  input.addEventListener("blur", () => {
    if (!cancelled) savePropLinkDetail(pageId, propId, linkedId, input.value);
    input.replaceWith(anchor);
    refreshPageRelationViews();
  }, { once: true });
  anchor.replaceWith(input);
  input.focus();
}

function getCurrentPageCategory(pageId) {
  return (window.userPages || []).find(p => p.id === pageId)?.category || "none";
}

// ── Page Picker ───────────────────────────────────────────────

function openPagePicker(pageId, propId, anchorEl) {
  closePicker();
  propsPickerOpen = true;
  propsPickerForPropertyId = propId;

  const picker = document.createElement("div");
  picker.id = "propsPagePicker";
  picker.className = "pps-picker";

  const search = document.createElement("input");
  search.className = "pps-picker-search";
  search.placeholder = "Find or create a page…";
  search.setAttribute("aria-label", "Find or create a connected page");
  search.autocomplete = "off";
  picker.appendChild(search);

  const scope = document.createElement("select");
  scope.className = "pps-picker-scope";
  scope.setAttribute("aria-label", "Search scope");
  scope.innerHTML = '<option value="current">Current world / project</option><option value="all">All pages</option>';
  picker.appendChild(scope);

  const list = document.createElement("div");
  list.className = "pps-picker-list";
  picker.appendChild(list);

  const createArea = document.createElement("div");
  createArea.className = "pps-picker-create";
  const category = document.createElement("select");
  category.setAttribute("aria-label", "New page category");
  category.innerHTML = '<option value="none">Page</option><option value="character">Character</option><option value="location">Location</option><option value="spell">Spell</option><option value="event">Event</option><option value="item">Item</option>';
  window.SanctumCustomTypesUI?.populate(category);
  const property = getPageProps(pageId).properties.find(prop => prop.id === propId);
  const defaultCategories = { spells: "spell", landmarks: "location", family: "character", characters: "character", participants: "character", places: "location", owner: "character" };
  category.value = property?.targetCategory || defaultCategories[propId] || "none";
  const create = document.createElement("button");
  create.className = "pps-create-btn";
  const hint = document.createElement("div");
  hint.className = "pps-picker-hint";
  const scopeId = window.getVaultScopeId?.(pageId) || "";
  const host = window.userPages.find(page => page.id === pageId);
  const parentId = scopeId || host?.parent || "home";
  const parentTitle = window.getVaultRecordById?.(parentId)?.title || "Home";
  hint.textContent = `New pages go in ${parentTitle}. You stay here.`;
  createArea.append(category, create, hint);
  picker.appendChild(createArea);
  const error = document.createElement("div");
  error.className = "pps-picker-error";
  error.setAttribute("role", "alert");
  picker.appendChild(error);

  function renderList(query) {
    const q = window.SanctumPageRelations.normalize(query);
    let pages = getPropertyCandidates(pageId, query, scope.value === "all");
    const requiresLevel = window.SanctumWorldSystems?.isRequirements(property);
    if (requiresLevel) {
      const levels = window.SanctumWorldSystems.levelIndex(window.userPages || [], readAllPageProps());
      pages = pages.filter(page => levels.has(page.id));
    }
    const linked = getPageProps(pageId).properties.find(prop => prop.id === propId)?.linkedPageIds || [];
    const exact = [host, ...getPropertyCandidates(pageId, query)].filter(Boolean).some(page => window.SanctumPageRelations.names(page, readAllPageProps()).includes(q));
    createArea.hidden = requiresLevel || !q || exact;
    create.textContent = `Create and link “${String(query || "").trim()}”`;
    error.textContent = "";

    list.innerHTML = "";
    if (pages.length === 0) {
      list.innerHTML = `<div class="pps-picker-empty">${requiresLevel ? "No matching levels. Set up Proficiency levels on a discipline page first." : q ? "No matching pages here." : "Type a name to create your first connection."}</div>`;
    }
    pages.slice(0, 40).forEach(p => {
      const item = document.createElement("button");
      item.className = "pps-picker-item";
      item.dataset.pageId = p.id;
      const icon = p.icon || categoryIcon(p.category);
      item.disabled = linked.includes(p.id);
      const path = window.getVaultRecordPathLabel?.(p.id, { omitSelf: true }) || "";
      item.innerHTML = `${getIconMarkup(icon, "📄", "pps-picker-icon")}<span class="pps-picker-title">${escapeHtml(p.title)}<small>${escapeHtml(path)}</small></span><span class="pps-picker-cat">${item.disabled ? "Linked" : escapeHtml(p.category === "none" ? "" : (window.SanctumCustomTypes?.label(p.category) || p.category))}</span>`;
      list.appendChild(item);
    });
    positionPicker();
  }

  function positionPicker() {
    if (!picker.isConnected) return;
    const rect = anchorEl.getBoundingClientRect();
    picker.style.position = "fixed";
    picker.style.top = `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - picker.offsetHeight - 8))}px`;
    picker.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - picker.offsetWidth - 8))}px`;
  }

  renderList("");

  search.addEventListener("input", () => renderList(search.value));
  scope.addEventListener("change", () => renderList(search.value));
  create.addEventListener("click", () => {
    create.disabled = true;
    try {
      createLinkedPropertyPage(pageId, propId, search.value, category.value);
      closePicker();
    } catch (err) {
      renderList(search.value);
      error.textContent = err.message || "Could not create this connection. Please try again.";
      create.disabled = false;
    }
  });
  picker.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); closePicker(); }
    if (event.key === "ArrowDown" && event.target === search) {
      event.preventDefault();
      list.querySelector("button:not(:disabled)")?.focus();
    }
    if (event.key === "Enter" && event.target === search) {
      event.preventDefault();
      const options = list.querySelectorAll("button:not(:disabled)");
      // Never choose arbitrarily between same-name records.
      if (options.length === 1) options[0].click();
      else if (!options.length && !createArea.hidden) create.click();
    }
  });

  list.addEventListener("click", e => {
    const item = e.target.closest(".pps-picker-item");
    if (!item || item.disabled) return;
    const linkedId = item.dataset.pageId;
    addPropLink(pageId, propId, linkedId);
    closePicker();
  });

  // Position below anchor
  (anchorEl.closest("dialog") || document.body).appendChild(picker);
  positionPicker();

  search.focus();

  // Close on outside click
  document.addEventListener("mousedown", pickerOutsideClick, true);
}

function pickerOutsideClick(e) {
  const picker = document.getElementById("propsPagePicker");
  if (picker && !picker.contains(e.target)) {
    closePicker();
  }
}

function closePicker() {
  document.removeEventListener("mousedown", pickerOutsideClick, true);
  const picker = document.getElementById("propsPagePicker");
  if (picker) picker.remove();
  propsPickerOpen = false;
  propsPickerForPropertyId = null;
}

// ── Add Property Dialog ───────────────────────────────────────

function openAddPropertyDialog(pageId, onCreated, anchor) {
  closePicker();
  document.getElementById("propsAddDialog")?.remove();

  const dialog = document.createElement("div");
  dialog.id = "propsAddDialog";
  dialog.className = "pps-add-dialog";
  dialog.innerHTML = `
    <div class="pps-add-dialog-inner">
      <div class="pps-add-dialog-title">Add Property</div>
      <input class="pps-add-dialog-input" id="propsNewLabel" placeholder="Property name…" autocomplete="off" />
      <div class="pps-add-dialog-types">
        <button class="pps-type-btn active" data-type="relation">Relation (pages)</button>
        <button class="pps-type-btn" data-type="text">Text</button>
      </div>
      <div class="pps-add-dialog-actions">
        <button class="pps-add-cancel">Cancel</button>
        <button class="pps-add-confirm">Add</button>
      </div>
    </div>
  `;

  let selectedType = "relation";

  dialog.querySelectorAll(".pps-type-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      dialog.querySelectorAll(".pps-type-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedType = btn.dataset.type;
    });
  });

  dialog.querySelector(".pps-add-cancel").addEventListener("click", () => dialog.remove());
  dialog.addEventListener("keydown", event => {
    if (event.key === "Escape") dialog.remove();
    if (event.key === "Enter" && event.target.id === "propsNewLabel") dialog.querySelector(".pps-add-confirm").click();
  });
  dialog.querySelector(".pps-add-confirm").addEventListener("click", () => {
    const label = dialog.querySelector("#propsNewLabel").value.trim();
    if (!label) return;
    const id = "custom-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    const data = getPageProps(pageId);
    data.properties.push({
      id,
      label,
      type: selectedType,
      value: "",
      linkedPageIds: [],
    });
    setPageProps(pageId, data);
    dialog.remove();
    renderPagePropsStrip(pageId, getCurrentPageCategory(pageId));
    onCreated?.(data.properties.find(prop => prop.id === id));
  });

  document.body.appendChild(dialog);
  dialog.querySelector("#propsNewLabel").focus();

  // Position centered
  const strip = anchor || document.getElementById("pagePropsStrip");
  if (strip) {
    const rect = strip.getBoundingClientRect();
    dialog.style.position = "fixed";
    dialog.style.top = `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - dialog.offsetHeight - 8))}px`;
    dialog.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - dialog.offsetWidth - 8))}px`;
  }
}

// ── Public API ────────────────────────────────────────────────

function openPageProps(pageId) {
  closePageProps();
  refreshPageRelationViews();
}

function closePageProps() {
  document.getElementById("propsAddDialog")?.remove();
  const strip = document.getElementById("pagePropsStrip");
  if (strip) {
    strip.classList.remove("active");
    strip.innerHTML = "";
  }
  closePicker();
  propsCurrentPageId = null;
}

window.openPageProps  = openPageProps;
window.closePageProps = closePageProps;
window.renderIncomingPageRelations = renderIncomingPageRelations;
window.getPagePropertyRelations = getPagePropertyRelations;
window.mountConnectionsBlock = mountConnectionsBlock;
window.addEventListener("sanctum:scripts-ready", refreshPageRelationViews);
