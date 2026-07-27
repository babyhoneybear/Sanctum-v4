// == Profile Layout ==

const PROFILE_SCHEMAS = {
  character: [
    { key: "role",   label: "Role" },
    { key: "age",    label: "Age" },
    { key: "home",   label: "Home" },
    { key: "family", label: "Family" },
    { key: "status", label: "Status" },
  ],
  spell: [
    { key: "domain",        label: "Domain" },
    { key: "tier",          label: "Tier" },
    { key: "drawback",      label: "Drawback" },
    { key: "castingMethod", label: "Casting Method" },
  ],
  location: [
    { key: "region",       label: "Region" },
    { key: "type",         label: "Type" },
    { key: "rulingPower",  label: "Ruling Power" },
    { key: "status",       label: "Status" },
  ],
  event: [
    { key: "dateEra",      label: "Date / Era" },
    { key: "type",         label: "Type" },
    { key: "participants", label: "Participants" },
    { key: "places",       label: "Places" },
  ],
  item: [
    { key: "type",   label: "Type" },
    { key: "origin", label: "Origin" },
    { key: "owner",  label: "Owner" },
    { key: "status", label: "Status" },
  ],
};

let profilePageId = null;
let profileIsEditing = false;

// ── Storage helpers ──────────────────────────────────────────
function readProfileData(pageId) {
  const docs = typeof window.readAllDocuments === "function"
    ? (window.readAllDocuments() || {})
    : {};
  const raw = docs[pageId] || {};
  return {
    fields:       (raw.profileFields       && typeof raw.profileFields === "object") ? raw.profileFields : {},
    customFields: Array.isArray(raw.profileCustomFields) ? raw.profileCustomFields : [],
    notes:        typeof raw.profileNotes === "string" ? raw.profileNotes : "",
  };
}

function saveProfileData(pageId, data) {
  if (typeof window.readAllDocuments !== "function" || typeof window.writeAllDocuments !== "function") return;
  const docs = window.readAllDocuments() || {};
  const existing = (docs[pageId] && typeof docs[pageId] === "object") ? docs[pageId] : {};
  docs[pageId] = {
    ...existing,
    profileFields:       data.fields || {},
    profileCustomFields: Array.isArray(data.customFields) ? data.customFields : [],
    profileNotes:        typeof data.notes === "string" ? data.notes : "",
  };
  window.writeAllDocuments(docs);
}

// ── Render helpers ───────────────────────────────────────────
function escapeProfileHTML(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderFieldValueText(value) {
  // plain text for view mode — no HTML injection possible
  return escapeProfileHTML(value) || '<span class="profile-empty-hint">—</span>';
}

function buildProfileRoot() {
  let root = document.getElementById("profileRoot");
  if (root) return root;

  root = document.createElement("div");
  root.id = "profileRoot";
  root.className = "profile-root";

  // inject into the same area as the doc editor
  const docEditor = document.getElementById("docEditor");
  if (docEditor && docEditor.parentNode) {
    docEditor.parentNode.insertBefore(root, docEditor.nextSibling);
  } else {
    const pageContent = document.getElementById("pageContent");
    if (pageContent) pageContent.appendChild(root);
    else document.body.appendChild(root);
  }

  return root;
}

// ── Main renderer ────────────────────────────────────────────
function renderProfilePage(pageId) {
  const allPages = {};
  if (Array.isArray(window.userDomains)) window.userDomains.forEach(d => allPages[d.id] = d);
  if (Array.isArray(window.userPages))   window.userPages.forEach(p => allPages[p.id] = p);

  const page = allPages[pageId];
  if (!page) return;

  const category = page.category || "none";
  const schema   = PROFILE_SCHEMAS[category] || [];
  const data     = readProfileData(pageId);
  const icon     = page.icon || "📄";
  const title    = page.title || "Untitled";
  const isEditing = profileIsEditing;

  const root = buildProfileRoot();
  root.classList.toggle("editing", isEditing);
  root.innerHTML = "";

  // ── Header ──
  const header = document.createElement("div");
  header.className = "profile-header";
  header.innerHTML = `
    <div class="profile-header-icon">${escapeProfileHTML(icon)}</div>
    <div class="profile-header-meta">
      <div class="profile-header-title">${escapeProfileHTML(title)}</div>
      ${category !== "none" ? `<div class="profile-header-category">${escapeProfileHTML(category)}</div>` : ""}
    </div>
    <button class="profile-edit-btn" id="profileEditBtn" type="button">
      ${isEditing ? "Done" : "Edit"}
    </button>
  `;
  root.appendChild(header);

  header.querySelector("#profileEditBtn").addEventListener("click", () => {
    if (profileIsEditing) {
      // save before leaving edit mode
      collectAndSave(root, pageId, schema, data);
    }
    profileIsEditing = !profileIsEditing;
    renderProfilePage(pageId);
  });

  // ── Body ──
  const body = document.createElement("div");
  body.className = "profile-body";

  // ── Fields ──
  const fieldsWrap = document.createElement("div");
  fieldsWrap.className = "profile-fields";

  const allFields = [
    ...schema.map(s => ({ key: s.key, label: s.label, isCustom: false })),
    ...data.customFields.map(f => ({ key: f.key, label: f.label, isCustom: true })),
  ];

  allFields.forEach(({ key, label, isCustom }) => {
    const value = data.fields[key] || "";
    const fieldEl = document.createElement("div");
    fieldEl.className = "profile-field";
    fieldEl.dataset.key = key;
    fieldEl.dataset.custom = isCustom ? "true" : "false";

    if (isEditing) {
      fieldEl.innerHTML = `
        <div class="profile-field-label">
          ${isCustom
            ? `<input class="profile-label-input" data-label-key="${escapeProfileHTML(key)}" value="${escapeProfileHTML(label)}" placeholder="Field name" />`
            : escapeProfileHTML(label)
          }
        </div>
        <div class="profile-field-value">
          <input class="profile-field-input" data-field-key="${escapeProfileHTML(key)}" value="${escapeProfileHTML(value)}" placeholder="—" />
        </div>
        ${isCustom ? `<button class="profile-field-delete" data-delete-key="${escapeProfileHTML(key)}" title="Remove field">✕</button>` : ""}
      `;
    } else {
      fieldEl.innerHTML = `
        <div class="profile-field-label">${escapeProfileHTML(label)}</div>
        <div class="profile-field-value" data-editable="false">${renderFieldValueText(value)}</div>
      `;
    }

    fieldsWrap.appendChild(fieldEl);
  });

  // add field button (edit mode only)
  const addFieldBtn = document.createElement("button");
  addFieldBtn.className = "profile-add-field";
  addFieldBtn.type = "button";
  addFieldBtn.innerHTML = `<span>+</span> Add field`;
  addFieldBtn.addEventListener("click", () => {
    const snapshot = collectDataFromDOM(root, pageId, schema, data);
    const newKey = `custom_${Date.now()}`;
    snapshot.customFields.push({ key: newKey, label: "Field", value: "" });
    snapshot.fields[newKey] = "";
    saveProfileData(pageId, snapshot);
    data.fields = snapshot.fields;
    data.customFields = snapshot.customFields;
    data.notes = snapshot.notes;
    renderProfilePage(pageId);
  });
  fieldsWrap.appendChild(addFieldBtn);

  // delete custom field
  fieldsWrap.addEventListener("click", (e) => {
    const btn = e.target.closest(".profile-field-delete");
    if (!btn) return;
    const keyToDelete = btn.dataset.deleteKey;
    const snapshot = collectDataFromDOM(root, pageId, schema, data);
    snapshot.customFields = snapshot.customFields.filter(f => f.key !== keyToDelete);
    delete snapshot.fields[keyToDelete];
    saveProfileData(pageId, snapshot);
    data.fields = snapshot.fields;
    data.customFields = snapshot.customFields;
    data.notes = snapshot.notes;
    renderProfilePage(pageId);
  });

  body.appendChild(fieldsWrap);

  // ── Notes ──
  const notesWrap = document.createElement("div");
  notesWrap.className = "profile-notes-wrap";
  notesWrap.innerHTML = `<div class="profile-notes-label">Notes</div>`;

  const notesArea = document.createElement("textarea");
  notesArea.className = "profile-notes-area";
  notesArea.id = "profileNotesArea";
  notesArea.value = data.notes || "";
  notesArea.placeholder = isEditing ? "Write anything here..." : "";
  notesArea.readOnly = !isEditing;
  notesArea.rows = 6;
  notesWrap.appendChild(notesArea);

  if (!isEditing && !data.notes) {
    const hint = document.createElement("div");
    hint.className = "profile-notes-placeholder";
    hint.textContent = "No notes yet.";
    notesWrap.appendChild(hint);
  }

  body.appendChild(notesWrap);
  root.appendChild(body);
}

// ── Data collection from live DOM ────────────────────────────
function collectDataFromDOM(root, pageId, schema, existingData) {
  const fields = { ...existingData.fields };
  const customFields = (existingData.customFields || []).map(f => ({ ...f }));

  root.querySelectorAll(".profile-field-input[data-field-key]").forEach(input => {
    fields[input.dataset.fieldKey] = input.value.trim();
  });

  root.querySelectorAll(".profile-label-input[data-label-key]").forEach(input => {
    const cf = customFields.find(f => f.key === input.dataset.labelKey);
    if (cf) cf.label = input.value.trim() || "Field";
  });

  const notesEl = root.querySelector("#profileNotesArea");
  const notes = notesEl ? notesEl.value : (existingData.notes || "");

  return { fields, customFields, notes };
}

function collectAndSave(root, pageId, schema, existingData) {
  const snapshot = collectDataFromDOM(root, pageId, schema, existingData);
  saveProfileData(pageId, snapshot);
}

// ── Public API ───────────────────────────────────────────────
function openProfileEditor(pageId) {
  profilePageId = pageId;
  profileIsEditing = false;

  // hide canvas and doc editor, show profile
  const pageCanvas = document.getElementById("pageCanvas");
  const docEditor  = document.getElementById("docEditor");
  if (pageCanvas) pageCanvas.style.display = "none";
  if (docEditor)  docEditor.classList.remove("active");

  const root = buildProfileRoot();
  root.classList.add("active");

  renderProfilePage(pageId);
}

function closeProfileEditor() {
  if (profilePageId && profileIsEditing) {
    const root = document.getElementById("profileRoot");
    const allPages = {};
    if (Array.isArray(window.userPages)) window.userPages.forEach(p => allPages[p.id] = p);
    const page = allPages[profilePageId];
    const category = page?.category || "none";
    const schema = PROFILE_SCHEMAS[category] || [];
    const data = readProfileData(profilePageId);
    if (root) collectAndSave(root, profilePageId, schema, data);
  }
  profilePageId = null;
  profileIsEditing = false;

  const root = document.getElementById("profileRoot");
  if (root) {
    root.classList.remove("active", "editing");
    root.innerHTML = "";
  }

  // restore canvas visibility
  const pageCanvas = document.getElementById("pageCanvas");
  if (pageCanvas) pageCanvas.style.display = "";
}

// ── Initial field values (called by applyPageTemplate) ───────
function applyProfileTemplate(pageId, category) {
  const schema = PROFILE_SCHEMAS[category];
  if (!schema) return;

  const data = readProfileData(pageId);
  // only apply if no fields set yet
  const hasData = Object.keys(data.fields).some(k => data.fields[k]);
  if (hasData) return;

  const fields = {};
  schema.forEach(s => { fields[s.key] = ""; });
  saveProfileData(pageId, { fields, customFields: [], notes: "" });
}

window.openProfileEditor   = openProfileEditor;
window.closeProfileEditor  = closeProfileEditor;
window.applyProfileTemplate = applyProfileTemplate;
window.PROFILE_SCHEMAS     = PROFILE_SCHEMAS;
