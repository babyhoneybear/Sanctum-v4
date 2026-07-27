// == Page Properties Strip ==
// Renders a typed-properties panel between the page title and the canvas.
// Supports relation chips (linked pages) and plain text fields.
// The canvas below remains completely free.

const PAGE_PROPS_STORAGE_KEY = (window.STORAGE_KEYS && window.STORAGE_KEYS.pageProps) || "sanctum_page_props_v1";

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
  try { localStorage.setItem(PAGE_PROPS_STORAGE_KEY, JSON.stringify(all)); } catch {}
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

// Ensure a page has its default schema properties initialized.
function initPagePropsIfNeeded(pageId, category) {
  const all = readAllPageProps();
  if (all[pageId]) return; // already exists
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

function renderPagePropsStrip(pageId, category) {
  const strip = document.getElementById("pagePropsStrip");
  if (!strip) return;

  initPagePropsIfNeeded(pageId, category);
  const data = getPageProps(pageId);
  const props = data.properties || [];

  strip.innerHTML = "";
  strip.classList.add("active");
  strip.dataset.pageId = pageId;

  props.forEach(prop => {
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
        chip.className = "pps-chip";
        chip.dataset.linkedPageId = lid;
        chip.title = "Open " + linkedPage.title;

        const icon = linkedPage.icon || categoryIcon(linkedPage.category);
        chip.innerHTML = `<span class="pps-chip-icon">${icon}</span><span class="pps-chip-label">${escapeHtml(linkedPage.title)}</span><span class="pps-chip-remove" data-remove-id="${lid}" title="Remove">×</span>`;
        chips.appendChild(chip);
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
      val.spellcheck = false;
      val.textContent = prop.value || "";
      val.dataset.placeholder = "—";
      chips.appendChild(val);
    }

    row.appendChild(chips);
    strip.appendChild(row);
  });

  // Add Property button
  const addPropBtn = document.createElement("button");
  addPropBtn.className = "pps-add-prop-btn";
  addPropBtn.textContent = "+ Add Property";
  strip.appendChild(addPropBtn);

  bindPropsStripEvents(strip, pageId);
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
  strip.addEventListener("click", e => {
    const removeBtn = e.target.closest(".pps-chip-remove");
    if (removeBtn) {
      e.stopPropagation();
      const removeId = removeBtn.dataset.removeId;
      const chip = removeBtn.closest(".pps-chip");
      const row = chip?.closest(".pps-row");
      if (!row) return;
      const propId = row.dataset.propId;
      removePropLink(pageId, propId, removeId);
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
  });

  // Save text field on blur
  strip.addEventListener("blur", e => {
    const textVal = e.target.closest(".pps-text-value");
    if (textVal) {
      const propId = textVal.dataset.propId;
      savePropText(pageId, propId, textVal.textContent.trim());
    }
  }, true);

  // Save text field on Enter
  strip.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const textVal = e.target.closest(".pps-text-value");
      if (textVal) {
        e.preventDefault();
        textVal.blur();
      }
    }
  });
}

// ── Mutations ─────────────────────────────────────────────────

function savePropText(pageId, propId, value) {
  const data = getPageProps(pageId);
  const prop = data.properties.find(p => p.id === propId);
  if (prop) {
    prop.value = value;
    setPageProps(pageId, data);
  }
}

function removePropLink(pageId, propId, linkedId) {
  const data = getPageProps(pageId);
  const prop = data.properties.find(p => p.id === propId);
  if (prop && Array.isArray(prop.linkedPageIds)) {
    prop.linkedPageIds = prop.linkedPageIds.filter(id => id !== linkedId);
    setPageProps(pageId, data);
    renderPagePropsStrip(pageId, getCurrentPageCategory(pageId));
  }
}

function addPropLink(pageId, propId, linkedId) {
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
  search.placeholder = "Search pages…";
  search.autocomplete = "off";
  picker.appendChild(search);

  const list = document.createElement("div");
  list.className = "pps-picker-list";
  picker.appendChild(list);

  function renderList(query) {
    const q = (query || "").toLowerCase().trim();
    const pages = (window.userPages || []).filter(p => {
      if (p.id === pageId) return false; // don't link to self
      if (!q) return true;
      return p.title.toLowerCase().includes(q);
    }).slice(0, 40);

    list.innerHTML = "";
    if (pages.length === 0) {
      list.innerHTML = `<div class="pps-picker-empty">No pages found</div>`;
      return;
    }
    pages.forEach(p => {
      const item = document.createElement("button");
      item.className = "pps-picker-item";
      item.dataset.pageId = p.id;
      const icon = p.icon || categoryIcon(p.category);
      item.innerHTML = `<span class="pps-picker-icon">${icon}</span><span class="pps-picker-title">${escapeHtml(p.title)}</span>`;
      if (p.category && p.category !== "none") {
        item.innerHTML += `<span class="pps-picker-cat">${p.category}</span>`;
      }
      list.appendChild(item);
    });
  }

  renderList("");

  search.addEventListener("input", () => renderList(search.value));

  list.addEventListener("click", e => {
    const item = e.target.closest(".pps-picker-item");
    if (!item) return;
    const linkedId = item.dataset.pageId;
    addPropLink(pageId, propId, linkedId);
    closePicker();
  });

  // Position below anchor
  document.body.appendChild(picker);
  const rect = anchorEl.getBoundingClientRect();
  picker.style.position = "fixed";
  picker.style.top = `${rect.bottom + 4}px`;
  picker.style.left = `${rect.left}px`;

  search.focus();

  // Close on outside click
  setTimeout(() => {
    document.addEventListener("mousedown", pickerOutsideClick, { once: true, capture: true });
  }, 0);
}

function pickerOutsideClick(e) {
  const picker = document.getElementById("propsPagePicker");
  if (picker && !picker.contains(e.target)) {
    closePicker();
  } else if (picker) {
    // re-attach if click was inside
    setTimeout(() => {
      document.addEventListener("mousedown", pickerOutsideClick, { once: true, capture: true });
    }, 0);
  }
}

function closePicker() {
  const picker = document.getElementById("propsPagePicker");
  if (picker) picker.remove();
  propsPickerOpen = false;
}

// ── Add Property Dialog ───────────────────────────────────────

function openAddPropertyDialog(pageId) {
  closePicker();

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
  dialog.querySelector(".pps-add-confirm").addEventListener("click", () => {
    const label = dialog.querySelector("#propsNewLabel").value.trim();
    if (!label) return;
    const id = "custom-" + Date.now();
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
  });

  document.body.appendChild(dialog);
  dialog.querySelector("#propsNewLabel").focus();

  // Position centered
  const strip = document.getElementById("pagePropsStrip");
  if (strip) {
    const rect = strip.getBoundingClientRect();
    dialog.style.position = "fixed";
    dialog.style.top = `${rect.bottom + 4}px`;
    dialog.style.left = `${rect.left}px`;
  }
}

// ── Public API ────────────────────────────────────────────────

function openPageProps(pageId) {
  const page = (window.userPages || []).find(p => p.id === pageId);
  const category = page?.category || "none";
  propsCurrentPageId = pageId;

  if (!category || category === "none") {
    closePageProps();
    return;
  }

  renderPagePropsStrip(pageId, category);
}

function closePageProps() {
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
