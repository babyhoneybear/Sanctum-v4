// Button Block — config, rendering, and action execution

(function () {
  const ACTION_TYPES = [
    { key: "create-row",   label: "Create a database row" },
    { key: "update-today-row", label: "Update today's database row" },
    { key: "create-page",  label: "Create a new page"     },
    { key: "create-note",  label: "Create a note"         },
    { key: "open-page",    label: "Open a page"           },
  ];

  const NOTE_BODY_PLACEHOLDER = "Write the note text here, or use {input}.";

  // ── Config helpers ──────────────────────────────────────────────────────

  function getConfig(blockEl) {
    try { return JSON.parse(blockEl.dataset.buttonConfig || "{}"); }
    catch { return {}; }
  }

  function setConfig(blockEl, config) {
    blockEl.dataset.buttonConfig = JSON.stringify(config);
  }

  function defaultConfig() {
    return {
      label: "",
      icon: "",
      size: "medium",
      style: "filled",
      inputPrompt: "",
      confirmMessage: "",
      actions: [],
      afterAction: "nothing",
      afterPageId: "",
    };
  }

  // ── Rendering ───────────────────────────────────────────────────────────

  function renderButton(blockEl) {
    const shell = blockEl.querySelector(".button-block-shell");
    if (!shell) return;
    const cfg = Object.assign({}, defaultConfig(), getConfig(blockEl));
    const { label, icon } = cfg;
    const size = ["small", "medium", "large"].includes(cfg.size) ? cfg.size : "medium";
    const btnStyle = ["filled", "outline", "ghost"].includes(cfg.style) ? cfg.style : "filled";
    const displayLabel = label || "Button";
    const visualStyles = [];
    const fillColor = blockEl.style.backgroundColor || "";
    const borderColor = blockEl.style.borderColor || "";
    const textColor = blockEl.style.color || "";
    const radius = blockEl.style.borderRadius || "";

    if (textColor) visualStyles.push(`color:${escHtml(textColor)}`);
    if (fillColor && btnStyle === "filled") visualStyles.push(`background:${escHtml(fillColor)}`);
    if (borderColor) visualStyles.push(`border-color:${escHtml(borderColor)}`);
    if (radius) visualStyles.push(`border-radius:${escHtml(radius)}`);

    shell.innerHTML = `<button type="button" class="button-block-btn button-block-btn--${size} button-block-btn--${btnStyle}"${visualStyles.length ? ` style="${visualStyles.join(";")}"` : ""} data-no-select>${icon ? `<span class="button-block-icon">${escHtml(icon)}</span>` : ""}<span class="button-block-label">${escHtml(displayLabel)}</span></button>`;
  }

  function mountButtonBlock(blockEl, options = {}) {
    if (!blockEl) return;
    let shell = blockEl.querySelector(".button-block-shell");
    if (!shell) {
      shell = document.createElement("div");
      shell.className = "button-block-shell";
      const handle = blockEl.querySelector(".block-resize-handle");
      if (handle) blockEl.insertBefore(shell, handle);
      else blockEl.appendChild(shell);
    }
    renderButton(blockEl);
    if (options.openPicker) {
      requestAnimationFrame(() => openButtonBlockConfig(blockEl));
    }
  }

  // ── Config Modal ────────────────────────────────────────────────────────

  function getVaultPages() {
    const pages   = Array.isArray(window.userPages)   ? window.userPages   : [];
    const domains = Array.isArray(window.userDomains) ? window.userDomains : [];
    return [...pages, ...domains];
  }

  function pageSelectOptions(selectedId) {
    return getVaultPages().map(p =>
      `<option value="${p.id}" ${p.id === selectedId ? "selected" : ""}>${p.icon ? p.icon + " " : ""}${escHtml(p.title || "Untitled")}</option>`
    ).join("");
  }

  function parseDatabaseSourceValue(raw = "") {
    const text = String(raw || "").trim();
    if (!text.includes("|")) {
      return { kind: "page", pageId: text, blockId: "" };
    }
    const [kind = "page", pageId = "", blockId = ""] = text.split("|");
    return {
      kind: kind === "block" ? "block" : "page",
      pageId,
      blockId: kind === "block" ? blockId : ""
    };
  }

  function normalizeDatabaseSourceValue(action = {}) {
    if (action.databaseSource) return action.databaseSource;
    if (action.databasePageId) return `page|${action.databasePageId}|`;
    return "";
  }

  function databaseSourceOptions(selectedValue = "") {
    const sources = typeof window.buttonBlockGetDatabaseSources === "function"
      ? window.buttonBlockGetDatabaseSources()
      : [];
    return sources.map((source) => {
      const value = source.kind === "block"
        ? `block|${source.pageId || ""}|${source.blockId || ""}`
        : `page|${source.pageId || ""}|`;
      return `<option value="${escHtml(value)}" ${value === selectedValue ? "selected" : ""}>${escHtml(source.label || source.title || "Database")}</option>`;
    }).join("");
  }

  function getDatabaseSources() {
    return typeof window.buttonBlockGetDatabaseSources === "function"
      ? (window.buttonBlockGetDatabaseSources() || [])
      : [];
  }

  function getSourceProperties(sourceValue = "") {
    if (!sourceValue || typeof window.buttonBlockGetSourceProperties !== "function") return [];
    return window.buttonBlockGetSourceProperties(sourceValue) || [];
  }

  function isEditableRowProperty(property = {}) {
    return property
      && !["created_at", "updated_at", "formula", "summary", "rollup"].includes(property.type);
  }

  function getOptionValues(property = {}) {
    const source = property.type === "status"
      ? property.statusGroups
      : property.type === "select"
        ? property.selectOptions
        : property.type === "tag"
          ? property.tagOptions
          : [];
    return Array.isArray(source)
      ? source.map((option) => option?.name || option?.label || "").filter(Boolean)
      : [];
  }

  function renderPresetFieldControl(property, action, index) {
    const value = (action.presetValues || {})[property.id] || "";
    if (property.type === "checkbox") {
      return `
          <select class="bb-field-input bb-field-val" data-prop-id="${escHtml(property.id)}">
            <option value="" ${!value ? "selected" : ""}>Leave blank</option>
            <option value="true" ${value === "true" ? "selected" : ""}>Checked</option>
            <option value="false" ${value === "false" ? "selected" : ""}>Unchecked</option>
            <option value="{input}" ${value === "{input}" ? "selected" : ""}>Use prompt value</option>
          </select>`;
    }

    const optionValues = getOptionValues(property);
    const listId = `bbOptions-${escHtml(property.id)}-${index}`;
    const typeHint = property.type === "date"
      ? "Date or {input}"
      : property.type === "number"
        ? "Number or {input}"
        : property.type === "tag"
          ? "Tag names or {input}"
          : "Preset value or {input}";

    return `
          <input class="bb-field-input bb-field-val" data-prop-id="${escHtml(property.id)}" ${optionValues.length ? `list="${listId}"` : ""} placeholder="${escHtml(typeHint)}" value="${escHtml(value)}">
          ${optionValues.length ? `<datalist id="${listId}">${optionValues.map((option) => `<option value="${escHtml(option)}"></option>`).join("")}</datalist>` : ""}`;
  }

  function supportsAppendMode(property = {}) {
    return ["text", "notes", "tag"].includes(property.type);
  }

  function renderUpdateFieldControl(property, action, index) {
    const mode = (action.fieldModes || {})[property.id] === "append" ? "append" : "set";
    return `
      <div class="bb-update-field-controls">
        ${renderPresetFieldControl(property, action, index)}
        <select class="bb-field-mode" data-prop-id="${escHtml(property.id)}" aria-label="How to update ${escHtml(property.name)}">
          <option value="set" ${mode === "set" ? "selected" : ""}>Replace</option>
          ${supportsAppendMode(property) ? `<option value="append" ${mode === "append" ? "selected" : ""}>Add to existing</option>` : ""}
        </select>
      </div>`;
  }

  function renderActionEditor(action, index, total) {
    const type = action.type || "create-row";
    let body = "";

    if (type === "create-row") {
      const sourceValue = normalizeDatabaseSourceValue(action);
      const props = sourceValue ? getSourceProperties(sourceValue) : [];
      const titleProperty = props.find(p => p.type === "title") || null;
      const editableProps = props.filter(p => isEditableRowProperty(p) && p.type !== "title");
      const propRows = editableProps.map((p, propIndex) => `
        <div class="bb-field-row">
          <span class="bb-field-name">${escHtml(p.name)}</span>
          ${renderPresetFieldControl(p, action, `${index}-${propIndex}`)}
        </div>`).join("");

      body = `
        <label class="bb-picker-field">
          <span>Target database</span>
          <select class="bb-act-db-page">
            <option value="">Select a page with a database…</option>
            ${databaseSourceOptions(sourceValue)}
          </select>
        </label>
        ${sourceValue ? `
          <label class="bb-picker-field">
            <span>Row title <em style="text-transform:none;font-size:9px">(optional, use {input})</em></span>
            <input class="bb-act-row-title" placeholder="${escHtml(titleProperty?.name || "Row title")}" value="${escHtml(action.rowTitle || "")}">
          </label>
          <label class="bb-picker-field">
            <span>Set fields <em style="text-transform:none;font-size:9px">(optional, use {input})</em></span>
            ${editableProps.length ? `<div class="bb-fields-list">${propRows}</div>` : '<span style="color:rgba(255,255,255,0.32);font-size:10.5px;text-transform:none">No editable fields.</span>'}
          </label>
          <label class="bb-toggle-row"><input type="checkbox" class="bb-act-open-after" ${action.openAfter ? "checked" : ""}> Open newly created row</label>
        ` : ""}
      `;
    } else if (type === "update-today-row") {
      const sourceValue = normalizeDatabaseSourceValue(action);
      const props = sourceValue ? getSourceProperties(sourceValue) : [];
      const dateProps = props.filter(p => p.type === "date");
      const editableProps = props.filter(p => isEditableRowProperty(p) && !["title", "date"].includes(p.type));
      const selectedDateId = dateProps.some(p => p.id === action.datePropertyId)
        ? action.datePropertyId
        : (dateProps[0]?.id || "");
      const propRows = editableProps.map((p, propIndex) => `
        <div class="bb-field-row bb-field-row--update">
          <span class="bb-field-name">${escHtml(p.name)}</span>
          ${renderUpdateFieldControl(p, action, `${index}-${propIndex}`)}
        </div>`).join("");

      body = `
        <div class="bb-action-note">Find the row whose date is today, then update that row instead of making a duplicate.</div>
        <label class="bb-picker-field">
          <span>Target database</span>
          <select class="bb-act-db-page">
            <option value="">Select a page with a databaseâ€¦</option>
            ${databaseSourceOptions(sourceValue)}
          </select>
        </label>
        ${sourceValue ? `
          <label class="bb-picker-field">
            <span>Date field used to find today</span>
            <select class="bb-act-date-property">
              ${dateProps.length
                ? dateProps.map(p => `<option value="${escHtml(p.id)}" ${p.id === selectedDateId ? "selected" : ""}>${escHtml(p.name)}</option>`).join("")
                : '<option value="">No date field available</option>'}
            </select>
          </label>
          <label class="bb-picker-field">
            <span>Fields to update <em style="text-transform:none;font-size:9px">(use {input} to ask each click)</em></span>
            ${editableProps.length ? `<div class="bb-fields-list">${propRows}</div>` : '<span style="color:rgba(255,255,255,0.32);font-size:10.5px;text-transform:none">No editable fields.</span>'}
          </label>
          <label class="bb-toggle-row"><input type="checkbox" class="bb-act-create-if-missing" ${action.createIfMissing !== false ? "checked" : ""}> Create today's row if it does not exist</label>
        ` : ""}
      `;
    } else if (type === "create-page") {
      body = `
        <label class="bb-picker-field">
          <span>Page title <em style="text-transform:none;font-size:9px">(use {input} for prompt value)</em></span>
          <input class="bb-act-page-title" placeholder="New page title" value="${escHtml(action.title || "")}">
        </label>
        <label class="bb-picker-field">
          <span>Parent page</span>
          <select class="bb-act-parent-page">
            <option value="">None (top level)</option>
            ${pageSelectOptions(action.parentPageId || "")}
          </select>
        </label>
        <label class="bb-picker-field">
          <span>Layout</span>
          <select class="bb-act-page-layout">
            <option value="board-canvas" ${(action.layout || "board-canvas") === "board-canvas" ? "selected" : ""}>Canvas</option>
            <option value="document" ${action.layout === "document" ? "selected" : ""}>Document</option>
            <option value="sheet" ${action.layout === "sheet" ? "selected" : ""}>Sheet</option>
          </select>
        </label>
        <label class="bb-toggle-row"><input type="checkbox" class="bb-act-open-after" ${action.openAfter ? "checked" : ""}> Open newly created page</label>
      `;
    } else if (type === "create-note") {
      body = `
        <div class="bb-action-note">When clicked, this button creates a note in Notes. Leave title/body blank if you want the button to ask you each time.</div>
        <label class="bb-picker-field">
          <span>Note title <em style="text-transform:none;font-size:9px">(use {input} for prompt value)</em></span>
          <input class="bb-act-note-title" placeholder="Note title" value="${escHtml(action.title || "")}">
        </label>
        <label class="bb-picker-field">
          <span>Note body <em style="text-transform:none;font-size:9px">(optional)</em></span>
          <textarea class="bb-act-note-body" placeholder="${NOTE_BODY_PLACEHOLDER}">${escHtml(action.body || "")}</textarea>
        </label>
        <div class="bb-toggle-stack">
          <label class="bb-toggle-row"><input type="checkbox" class="bb-act-note-ask-title" ${action.askTitle ? "checked" : ""}> Ask for the title when clicked</label>
          <label class="bb-toggle-row"><input type="checkbox" class="bb-act-note-ask-body" ${action.askBody ? "checked" : ""}> Ask what to write when clicked</label>
        </div>
        <label class="bb-picker-field">
          <span>Save as</span>
          <select class="bb-act-note-source">
            <option value="normal" ${(action.sourceType || "normal") === "normal" ? "selected" : ""}>Normal note</option>
            <option value="quick" ${action.sourceType === "quick" ? "selected" : ""}>Quick capture</option>
          </select>
        </label>
        <label class="bb-toggle-row"><input type="checkbox" class="bb-act-open-after" ${action.openAfter ? "checked" : ""}> Open the note after creating it</label>
      `;
    } else if (type === "open-page") {
      body = `
        <label class="bb-picker-field">
          <span>Page to open</span>
          <select class="bb-act-target-page">
            <option value="">Select page…</option>
            ${pageSelectOptions(action.targetPageId || "")}
          </select>
        </label>
      `;
    }

    const upBtn   = index > 0         ? `<button type="button" class="bb-reorder-btn bb-act-up"   title="Move up">↑</button>` : "";
    const downBtn = index < total - 1 ? `<button type="button" class="bb-reorder-btn bb-act-down" title="Move down">↓</button>` : "";

    return `
      <div class="bb-action-card" data-idx="${index}">
        <div class="bb-action-head">
          <select class="bb-act-type">${ACTION_TYPES.map(a => `<option value="${a.key}" ${a.key === type ? "selected" : ""}>${a.label}</option>`).join("")}</select>
          <div class="bb-action-head-right">${upBtn}${downBtn}<button type="button" class="bb-reorder-btn bb-act-del" title="Remove">×</button></div>
        </div>
        <div class="bb-action-body">${body}</div>
      </div>
    `;
  }

  function readActionFromCard(card) {
    const type = card.querySelector(".bb-act-type")?.value || "create-row";
    const base = { type };

    if (type === "create-row" || type === "update-today-row") {
      const sourceValue = card.querySelector(".bb-act-db-page")?.value || "";
      const source = parseDatabaseSourceValue(sourceValue);
      base.databaseSource = sourceValue;
      base.databasePageId = source.kind === "page" ? source.pageId : "";
      base.presetValues = {};
      card.querySelectorAll(".bb-field-val").forEach(inp => {
        if (inp.dataset.propId && inp.value.trim()) base.presetValues[inp.dataset.propId] = inp.value.trim();
      });
      if (type === "create-row") {
        base.rowTitle = card.querySelector(".bb-act-row-title")?.value || "";
        base.openAfter = card.querySelector(".bb-act-open-after")?.checked || false;
      } else {
        base.datePropertyId = card.querySelector(".bb-act-date-property")?.value || "";
        base.createIfMissing = card.querySelector(".bb-act-create-if-missing")?.checked !== false;
        base.fieldModes = {};
        card.querySelectorAll(".bb-field-mode").forEach(select => {
          if (select.dataset.propId && select.value === "append") {
            base.fieldModes[select.dataset.propId] = "append";
          }
        });
      }
    } else if (type === "create-page") {
      base.title        = card.querySelector(".bb-act-page-title")?.value   || "";
      base.parentPageId = card.querySelector(".bb-act-parent-page")?.value  || "";
      base.layout       = card.querySelector(".bb-act-page-layout")?.value  || "board-canvas";
      base.openAfter    = card.querySelector(".bb-act-open-after")?.checked || false;
    } else if (type === "create-note") {
      base.title      = card.querySelector(".bb-act-note-title")?.value    || "";
      base.body       = card.querySelector(".bb-act-note-body")?.value     || "";
      base.askTitle   = card.querySelector(".bb-act-note-ask-title")?.checked || false;
      base.askBody    = card.querySelector(".bb-act-note-ask-body")?.checked || false;
      base.sourceType = card.querySelector(".bb-act-note-source")?.value   || "normal";
      base.openAfter  = card.querySelector(".bb-act-open-after")?.checked  || false;
    } else if (type === "open-page") {
      base.targetPageId = card.querySelector(".bb-act-target-page")?.value || "";
    }
    return base;
  }

  function getButtonAssistantContext() {
    const databases = getDatabaseSources().map((source) => {
      const value = source.kind === "block"
        ? `block|${source.pageId || ""}|${source.blockId || ""}`
        : `page|${source.pageId || ""}|`;
      return {
        value,
        label: source.label || source.title || "Database",
        fields: getSourceProperties(value).map((property) => ({
          id: property.id,
          name: property.name || "Field",
          type: property.type || "text",
          options: getOptionValues(property),
        })),
      };
    });
    const pages = getVaultPages().map(page => ({
      id: String(page.id || ""),
      title: page.title || "Untitled",
    })).filter(page => page.id);
    return { databases, pages };
  }

  function normalizeAssistantButtonDraft(rawDraft = {}, context = {}) {
    const sourceMap = new Map((context.databases || []).map(source => [source.value, source]));
    const pageIds = new Set((context.pages || []).map(page => page.id));
    const actions = [];

    for (const rawAction of Array.isArray(rawDraft.actions) ? rawDraft.actions.slice(0, 8) : []) {
      const type = String(rawAction?.type || "");
      if (type === "create-row" || type === "update-today-row") {
        const source = sourceMap.get(String(rawAction.databaseSource || ""));
        if (!source) continue;
        const editableFields = new Map((source.fields || [])
          .filter(field => !["created_at", "updated_at", "formula", "summary", "rollup"].includes(field.type))
          .map(field => [field.id, field]));
        const presetValues = {};
        for (const [propertyId, value] of Object.entries(rawAction.presetValues || {})) {
          if (editableFields.has(propertyId)) presetValues[propertyId] = String(value ?? "").slice(0, 1000);
        }
        if (type === "create-row") {
          actions.push({
            type,
            databaseSource: source.value,
            databasePageId: parseDatabaseSourceValue(source.value).pageId,
            rowTitle: String(rawAction.rowTitle || "").slice(0, 300),
            presetValues,
            openAfter: !!rawAction.openAfter,
          });
        } else {
          const dateFields = (source.fields || []).filter(field => field.type === "date");
          const datePropertyId = dateFields.some(field => field.id === rawAction.datePropertyId)
            ? rawAction.datePropertyId
            : (dateFields[0]?.id || "");
          if (!datePropertyId) continue;
          const fieldModes = {};
          for (const [propertyId, mode] of Object.entries(rawAction.fieldModes || {})) {
            const field = editableFields.get(propertyId);
            if (mode === "append" && supportsAppendMode(field)) fieldModes[propertyId] = "append";
          }
          actions.push({
            type,
            databaseSource: source.value,
            databasePageId: parseDatabaseSourceValue(source.value).pageId,
            datePropertyId,
            presetValues,
            fieldModes,
            createIfMissing: rawAction.createIfMissing !== false,
          });
        }
      } else if (type === "create-page") {
        const parentPageId = pageIds.has(String(rawAction.parentPageId || "")) ? String(rawAction.parentPageId) : "";
        actions.push({
          type,
          title: String(rawAction.title || "").slice(0, 300),
          parentPageId,
          layout: ["board-canvas", "document", "sheet"].includes(rawAction.layout) ? rawAction.layout : "board-canvas",
          openAfter: !!rawAction.openAfter,
        });
      } else if (type === "create-note") {
        actions.push({
          type,
          title: String(rawAction.title || "").slice(0, 300),
          body: String(rawAction.body || "").slice(0, 3000),
          askTitle: !!rawAction.askTitle,
          askBody: !!rawAction.askBody,
          sourceType: rawAction.sourceType === "quick" ? "quick" : "normal",
          openAfter: !!rawAction.openAfter,
        });
      } else if (type === "open-page" && pageIds.has(String(rawAction.targetPageId || ""))) {
        actions.push({ type, targetPageId: String(rawAction.targetPageId) });
      }
    }

    const afterAction = ["nothing", "open-created", "open-page"].includes(rawDraft.afterAction)
      ? rawDraft.afterAction
      : "nothing";
    return {
      label: String(rawDraft.label || "").slice(0, 120),
      icon: String(rawDraft.icon || "").slice(0, 4),
      inputPrompt: String(rawDraft.inputPrompt || "").slice(0, 300),
      confirmMessage: String(rawDraft.confirmMessage || "").slice(0, 300),
      actions,
      afterAction,
      afterPageId: afterAction === "open-page" && pageIds.has(String(rawDraft.afterPageId || ""))
        ? String(rawDraft.afterPageId)
        : "",
      explanation: String(rawDraft.explanation || "Review the actions before saving.").slice(0, 400),
    };
  }

  async function requestButtonAssistantDraft(request, currentConfig) {
    const context = getButtonAssistantContext();
    const apiPath = ((window.SANCTUM_API_BASE || "") + "/api/assistant/button").replace(/\/\/api/, "/api");
    const response = await fetch(apiPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request, currentConfig, ...context }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "The assistant could not draft that button.");
    return normalizeAssistantButtonDraft(payload, context);
  }

  function openButtonBlockConfig(blockEl) {
    const existing = document.getElementById("bbConfigOverlay");
    if (existing) existing.remove();

    const cfg = Object.assign({}, defaultConfig(), getConfig(blockEl));
    const pages = getVaultPages();
    let actions = cfg.actions.map(a => Object.assign({}, a));
    let pendingAssistantDraft = null;

    const overlay = document.createElement("div");
    overlay.id = "bbConfigOverlay";
    overlay.className = "bb-overlay";

    overlay.innerHTML = `
      <div class="bb-modal" role="dialog" aria-modal="true">
        <div class="bb-modal-header">
          <span class="bb-modal-title">Configure Button</span>
          <button type="button" class="bb-header-close" id="bbClose" aria-label="Close">×</button>
        </div>
        <div class="bb-modal-body">

          <div class="bb-section-label">Appearance</div>
          <div class="bb-row-2">
            <label class="bb-picker-field">
              <span>Label</span>
              <input id="bbLabel" placeholder="Button" value="${escHtml(cfg.label || "")}">
            </label>
            <label class="bb-picker-field bb-picker-field--icon">
              <span>Icon</span>
              <input id="bbIcon" placeholder="✦" value="${escHtml(cfg.icon || "")}" maxlength="4">
            </label>
          </div>
          <div class="bb-row-2">
            <label class="bb-picker-field">
              <span>Size</span>
              <select id="bbSize">
                <option value="small"  ${cfg.size === "small"  ? "selected" : ""}>Small</option>
                <option value="medium" ${!cfg.size || cfg.size === "medium" ? "selected" : ""}>Medium</option>
                <option value="large"  ${cfg.size === "large"  ? "selected" : ""}>Large</option>
              </select>
            </label>
            <label class="bb-picker-field">
              <span>Style</span>
              <select id="bbStyle">
                <option value="filled"  ${!cfg.style || cfg.style === "filled"  ? "selected" : ""}>Filled</option>
                <option value="outline" ${cfg.style === "outline" ? "selected" : ""}>Outline</option>
                <option value="ghost"   ${cfg.style === "ghost"   ? "selected" : ""}>Ghost</option>
              </select>
            </label>
          </div>

          <div class="bb-divider"></div>

          <div class="bb-section-label">Ask first</div>
          <label class="bb-picker-field">
            <span>Input prompt <span class="bb-hint">(ask for a value — use {input} in actions)</span></span>
            <input id="bbInputPrompt" placeholder="e.g. Character name?" value="${escHtml(cfg.inputPrompt || "")}">
          </label>
          <label class="bb-picker-field">
            <span>Confirm before running <span class="bb-hint">(optional)</span></span>
            <input id="bbConfirmMsg" placeholder="e.g. Are you sure?" value="${escHtml(cfg.confirmMessage || "")}">
          </label>

          <div class="bb-divider"></div>

          <div class="bb-section-label">Build with AI</div>
          <div class="bb-ai-builder">
            <textarea id="bbAiRequest" placeholder="Describe the button, like: Ask which symptom I have, then add it to Symptoms on today's Daily Body Log row."></textarea>
            <div class="bb-ai-builder-actions">
              <span id="bbAiStatus">It will draft the setup for you to review.</span>
              <button type="button" class="bb-ai-draft-btn" id="bbAiDraft">Draft button</button>
            </div>
            <div class="bb-ai-draft-review" id="bbAiReview" hidden>
              <div id="bbAiSummary"></div>
              <button type="button" class="bb-ai-use-btn" id="bbAiUse">Use this draft</button>
            </div>
          </div>

          <div class="bb-divider"></div>

          <div class="bb-section-label">What it does</div>
          <div class="bb-actions-list" id="bbActionsList"></div>
          <button type="button" class="bb-add-action-btn" id="bbAddAction">+ Add action</button>

          <div class="bb-divider"></div>

          <div class="bb-section-label">When done</div>
          <label class="bb-picker-field">
            <span>Then</span>
            <select id="bbAfterAction">
              <option value="nothing"      ${!cfg.afterAction || cfg.afterAction === "nothing"      ? "selected" : ""}>Do nothing</option>
              <option value="open-created" ${cfg.afterAction === "open-created" ? "selected" : ""}>Open newly created item</option>
              <option value="open-page"    ${cfg.afterAction === "open-page"    ? "selected" : ""}>Navigate to a page</option>
            </select>
          </label>
          <div id="bbAfterPageRow" style="${cfg.afterAction === "open-page" ? "" : "display:none"}">
            <label class="bb-picker-field">
              <span>Target page</span>
              <select id="bbAfterPageId">
                <option value="">Select page…</option>
                ${pageSelectOptions(cfg.afterPageId || "")}
              </select>
            </label>
          </div>
        </div>
        <div class="bb-modal-footer">
          <button type="button" class="bb-footer-cancel" id="bbCancel">Cancel</button>
          <button type="button" class="bb-footer-save" id="bbSave">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Auto-select label on focus so user doesn't have to delete existing text
    const labelInput = overlay.querySelector("#bbLabel");
    if (labelInput) labelInput.addEventListener("focus", () => labelInput.select());

    const listEl = overlay.querySelector("#bbActionsList");

    function syncFromDOM() {
      const cards = listEl.querySelectorAll(".bb-action-card");
      actions = Array.from(cards).map(card => readActionFromCard(card));
    }

    function reRender() {
      listEl.innerHTML = actions.length
        ? actions.map((a, i) => renderActionEditor(a, i, actions.length)).join("")
        : `<p class="bb-empty-actions">No actions yet.</p>`;
      wireCards();
    }

    function wireCards() {
      listEl.querySelectorAll(".bb-act-type").forEach((sel, i) => {
        sel.addEventListener("change", () => {
          syncFromDOM();
          actions[i] = { type: sel.value };
          reRender();
        });
      });

      listEl.querySelectorAll(".bb-act-db-page").forEach((sel, i) => {
        sel.addEventListener("change", () => {
          syncFromDOM();
          const source = parseDatabaseSourceValue(sel.value);
          actions[i].databaseSource = sel.value;
          actions[i].databasePageId = source.kind === "page" ? source.pageId : "";
          actions[i].presetValues = {};
          actions[i].rowTitle = actions[i].rowTitle || "";
          reRender();
        });
      });

      listEl.querySelectorAll(".bb-act-del").forEach((btn, i) => {
        btn.addEventListener("click", () => {
          syncFromDOM();
          actions.splice(i, 1);
          reRender();
        });
      });

      listEl.querySelectorAll(".bb-act-up").forEach((btn, i) => {
        btn.addEventListener("click", () => {
          syncFromDOM();
          if (i > 0) [actions[i - 1], actions[i]] = [actions[i], actions[i - 1]];
          reRender();
        });
      });

      listEl.querySelectorAll(".bb-act-down").forEach((btn, i) => {
        btn.addEventListener("click", () => {
          syncFromDOM();
          if (i < actions.length - 1) [actions[i], actions[i + 1]] = [actions[i + 1], actions[i]];
          reRender();
        });
      });
    }

    reRender();

    overlay.querySelector("#bbAddAction").addEventListener("click", () => {
      syncFromDOM();
      actions.push({ type: "create-note", title: "", body: "", askBody: true, sourceType: "normal", openAfter: true });
      reRender();
    });

    overlay.querySelector("#bbAiDraft").addEventListener("click", async () => {
      const request = overlay.querySelector("#bbAiRequest").value.trim();
      const status = overlay.querySelector("#bbAiStatus");
      const draftButton = overlay.querySelector("#bbAiDraft");
      const review = overlay.querySelector("#bbAiReview");
      if (!request) {
        status.textContent = "Describe what you want the button to do first.";
        return;
      }
      syncFromDOM();
      draftButton.disabled = true;
      status.textContent = "Draftingâ€¦";
      review.hidden = true;
      try {
        pendingAssistantDraft = await requestButtonAssistantDraft(request, {
          label: overlay.querySelector("#bbLabel").value.trim(),
          icon: overlay.querySelector("#bbIcon").value.trim(),
          inputPrompt: overlay.querySelector("#bbInputPrompt").value.trim(),
          confirmMessage: overlay.querySelector("#bbConfirmMsg").value.trim(),
          actions,
        });
        if (!pendingAssistantDraft.actions.length) throw new Error("The draft did not contain a usable action.");
        overlay.querySelector("#bbAiSummary").textContent =
          `${pendingAssistantDraft.explanation} ${pendingAssistantDraft.actions.length} action${pendingAssistantDraft.actions.length === 1 ? "" : "s"} ready.`;
        status.textContent = "Draft ready. Nothing has changed yet.";
        review.hidden = false;
      } catch (error) {
        pendingAssistantDraft = null;
        status.textContent = error?.message || "The assistant could not draft that button.";
      } finally {
        draftButton.disabled = false;
      }
    });

    overlay.querySelector("#bbAiUse").addEventListener("click", () => {
      if (!pendingAssistantDraft) return;
      overlay.querySelector("#bbLabel").value = pendingAssistantDraft.label || overlay.querySelector("#bbLabel").value;
      overlay.querySelector("#bbIcon").value = pendingAssistantDraft.icon || overlay.querySelector("#bbIcon").value;
      overlay.querySelector("#bbInputPrompt").value = pendingAssistantDraft.inputPrompt || "";
      overlay.querySelector("#bbConfirmMsg").value = pendingAssistantDraft.confirmMessage || "";
      overlay.querySelector("#bbAfterAction").value = pendingAssistantDraft.afterAction || "nothing";
      overlay.querySelector("#bbAfterPageId").value = pendingAssistantDraft.afterPageId || "";
      overlay.querySelector("#bbAfterPageRow").style.display = pendingAssistantDraft.afterAction === "open-page" ? "" : "none";
      actions = pendingAssistantDraft.actions.map(action => ({ ...action }));
      reRender();
      overlay.querySelector("#bbAiStatus").textContent = "Draft loaded below. Review it, then press Save.";
      overlay.querySelector("#bbAiReview").hidden = true;
    });

    overlay.querySelector("#bbAfterAction").addEventListener("change", e => {
      overlay.querySelector("#bbAfterPageRow").style.display = e.target.value === "open-page" ? "" : "none";
    });

    function close() { overlay.remove(); }

    overlay.querySelector("#bbClose").addEventListener("click", close);
    overlay.querySelector("#bbCancel").addEventListener("click", close);
    overlay.addEventListener("mousedown", e => { if (e.target === overlay) close(); });
    overlay.addEventListener("keydown", e => { if (e.key === "Escape") close(); });

    overlay.querySelector("#bbSave").addEventListener("click", () => {
      syncFromDOM();
      const newCfg = {
        label:          overlay.querySelector("#bbLabel").value.trim(),
        icon:           overlay.querySelector("#bbIcon").value.trim(),
        size:           overlay.querySelector("#bbSize").value,
        style:          overlay.querySelector("#bbStyle").value,
        inputPrompt:    overlay.querySelector("#bbInputPrompt").value.trim(),
        confirmMessage: overlay.querySelector("#bbConfirmMsg").value.trim(),
        actions,
        afterAction:    overlay.querySelector("#bbAfterAction").value,
        afterPageId:    overlay.querySelector("#bbAfterPageId")?.value || "",
      };
      setConfig(blockEl, newCfg);
      renderButton(blockEl);
      if (typeof window.saveState === "function") window.saveState();
      close();
    });

    requestAnimationFrame(() => labelInput?.focus());
  }

  // ── Input dialog ────────────────────────────────────────────────────────

  function getInputSuggestions(config = {}) {
    const suggestions = new Map();
    (config.actions || []).forEach((action) => {
      if (!["create-row", "update-today-row"].includes(action?.type)) return;
      const sourceValue = normalizeDatabaseSourceValue(action);
      if (!sourceValue) return;
      const values = action.presetValues || {};
      getSourceProperties(sourceValue).forEach((property) => {
        if (!String(values[property.id] || "").includes("{input}")) return;
        getOptionValues(property).forEach((value) => {
          const safeValue = String(value || "").trim();
          if (safeValue) suggestions.set(safeValue.toLowerCase(), safeValue);
        });
      });
    });
    return Array.from(suggestions.values());
  }

  function showInputDialog(promptText, suggestions = []) {
    return new Promise(resolve => {
      const existing = document.getElementById("bbInputDialog");
      if (existing) existing.remove();

      const dlg = document.createElement("div");
      dlg.id = "bbInputDialog";
      dlg.className = "bb-overlay";
      dlg.innerHTML = `
        <div class="bb-modal bb-modal--sm" role="dialog">
          <div class="bb-modal-header">
            <span class="bb-modal-title">${escHtml(promptText)}</span>
          </div>
          <div class="bb-modal-body">
            <label class="bb-picker-field">
              <span>Your answer</span>
              <input id="bbDlgInput" placeholder="Enter value…">
            </label>
            ${suggestions.length ? `<div class="bb-input-suggestions" id="bbDlgSuggestions">${suggestions.map((value) => `<button type="button" data-bb-suggestion="${escHtml(value)}">${escHtml(value)}</button>`).join("")}</div>` : ""}
          </div>
          <div class="bb-modal-footer">
            <button type="button" class="bb-footer-cancel" id="bbDlgCancel">Cancel</button>
            <button type="button" class="bb-footer-save" id="bbDlgOk">OK</button>
          </div>
        </div>
      `;
      document.body.appendChild(dlg);

      const inp = dlg.querySelector("#bbDlgInput");
      const suggestionList = dlg.querySelector("#bbDlgSuggestions");
      requestAnimationFrame(() => inp?.focus());

      function done(val) { dlg.remove(); resolve(val); }

      dlg.querySelector("#bbDlgOk").addEventListener("click", () => done(inp.value));
      dlg.querySelector("#bbDlgCancel").addEventListener("click", () => done(null));
      inp.addEventListener("keydown", e => {
        if (e.key === "Enter")  done(inp.value);
        if (e.key === "Escape") done(null);
      });
      suggestionList?.addEventListener("click", (event) => {
        const choice = event.target.closest("[data-bb-suggestion]");
        if (!choice) return;
        inp.value = choice.dataset.bbSuggestion || "";
        done(inp.value);
      });
      inp.addEventListener("input", () => {
        const query = inp.value.trim().toLowerCase();
        suggestionList?.querySelectorAll("[data-bb-suggestion]").forEach((choice) => {
          choice.hidden = !!query && !String(choice.dataset.bbSuggestion || "").toLowerCase().includes(query);
        });
      });
      dlg.addEventListener("mousedown", e => { if (e.target === dlg) done(null); });
    });
  }

  function showNoteDialog({ titlePrompt = "Note title", bodyPrompt = "What should this note say?", initialTitle = "", initialBody = "", askTitle = false, askBody = true } = {}) {
    return new Promise(resolve => {
      const existing = document.getElementById("bbNoteDialog");
      if (existing) existing.remove();

      const dlg = document.createElement("div");
      dlg.id = "bbNoteDialog";
      dlg.className = "bb-overlay";
      dlg.innerHTML = `
        <div class="bb-modal bb-modal--note" role="dialog" aria-modal="true">
          <div class="bb-modal-header">
            <span class="bb-modal-title">New note</span>
            <button type="button" class="bb-header-close" id="bbNoteCancelX" aria-label="Close">×</button>
          </div>
          <div class="bb-modal-body">
            ${askTitle ? `
              <label class="bb-picker-field">
                <span>${escHtml(titlePrompt)}</span>
                <input id="bbNoteTitleInput" placeholder="Note title" value="${escHtml(initialTitle)}">
              </label>
            ` : ""}
            ${askBody ? `
              <label class="bb-picker-field">
                <span>${escHtml(bodyPrompt)}</span>
                <textarea id="bbNoteBodyInput" class="bb-note-dialog-body" placeholder="Type your note...">${escHtml(initialBody)}</textarea>
              </label>
            ` : ""}
          </div>
          <div class="bb-modal-footer">
            <button type="button" class="bb-footer-cancel" id="bbNoteCancel">Cancel</button>
            <button type="button" class="bb-footer-save" id="bbNoteCreate">Create note</button>
          </div>
        </div>
      `;
      document.body.appendChild(dlg);

      const titleInput = dlg.querySelector("#bbNoteTitleInput");
      const bodyInput = dlg.querySelector("#bbNoteBodyInput");
      requestAnimationFrame(() => (askBody ? bodyInput : titleInput)?.focus());

      function done(value) {
        dlg.remove();
        resolve(value);
      }

      dlg.querySelector("#bbNoteCreate").addEventListener("click", () => {
        done({
          title: askTitle ? (titleInput?.value || "") : initialTitle,
          body: askBody ? (bodyInput?.value || "") : initialBody,
        });
      });
      dlg.querySelector("#bbNoteCancel").addEventListener("click", () => done(null));
      dlg.querySelector("#bbNoteCancelX").addEventListener("click", () => done(null));
      dlg.addEventListener("mousedown", e => { if (e.target === dlg) done(null); });
      dlg.addEventListener("keydown", e => {
        if (e.key === "Escape") done(null);
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "enter") {
          done({
            title: askTitle ? (titleInput?.value || "") : initialTitle,
            body: askBody ? (bodyInput?.value || "") : initialBody,
          });
        }
      });
    });
  }

  // ── Action execution ────────────────────────────────────────────────────

  const runningButtons = new WeakSet();

  async function runButtonActions(blockEl) {
    if (runningButtons.has(blockEl)) return;
    runningButtons.add(blockEl);
    try {
    const cfg = Object.assign({}, defaultConfig(), getConfig(blockEl));

    if (cfg.confirmMessage) {
      const ok = window.confirm(cfg.confirmMessage);
      if (!ok) return;
    }

    let inputValue = "";
    if (cfg.inputPrompt) {
      const val = await showInputDialog(cfg.inputPrompt, getInputSuggestions(cfg));
      if (val === null) return;
      inputValue = val;
    }

    const fillInput = str => String(str || "").replace(/\{input\}/g, inputValue);

    let lastCreated = null;

    for (const action of (cfg.actions || [])) {
      if (action.type === "create-row") {
        const sourceValue = normalizeDatabaseSourceValue(action);
        if (!sourceValue) continue;
        const presetValues = {};
        for (const [k, v] of Object.entries(action.presetValues || {})) {
          presetValues[k] = fillInput(v);
        }
        const props = getSourceProperties(sourceValue);
        const titleProperty = props.find(p => p.type === "title");
        if (titleProperty && String(action.rowTitle || "").trim()) {
          presetValues[titleProperty.id] = fillInput(action.rowTitle);
        }
        const row = window.buttonBlockAddRow?.(sourceValue, presetValues);
        if (row) {
          lastCreated = { type: "row", sourceValue, pageId: row.pageId, row };
          if (action.openAfter && row.pageId) window.openPeek?.(row.pageId);
        }

      } else if (action.type === "update-today-row") {
        const sourceValue = normalizeDatabaseSourceValue(action);
        if (!sourceValue) continue;
        const presetValues = {};
        for (const [k, v] of Object.entries(action.presetValues || {})) {
          presetValues[k] = fillInput(v);
        }
        const row = window.buttonBlockUpdateTodayRow?.(sourceValue, {
          datePropertyId: action.datePropertyId || "",
          presetValues,
          fieldModes: action.fieldModes || {},
          createIfMissing: action.createIfMissing !== false,
        });
        if (row) {
          lastCreated = { type: "row", sourceValue, pageId: row.pageId, row };
        }

      } else if (action.type === "create-page") {
        const title = fillInput(action.title) || "Untitled";
        if (typeof window.createPage !== "function") continue;
        const newPage = window.createPage(title, action.parentPageId || "", action.layout || "board-canvas", "none", "page", {
          reuseExisting: true,
          currentPageId: typeof window.getCurrentPageId === "function" ? window.getCurrentPageId() : "",
          includeCurrentPage: true
        });
        lastCreated = { type: "page", pageId: newPage.id };
        if (typeof window.renderSidebarDomains === "function") window.renderSidebarDomains();
        if (action.openAfter) window.openPage?.(newPage.id);

      } else if (action.type === "create-note") {
        let title = fillInput(action.title) || "";
        let bodyText = fillInput(action.body || "");
        if (action.askTitle || action.askBody) {
          const entered = await showNoteDialog({
            initialTitle: title,
            initialBody: bodyText,
            askTitle: !!action.askTitle,
            askBody: !!action.askBody,
          });
          if (entered === null) return;
          title = entered.title || title;
          bodyText = entered.body || bodyText;
        }
        if (!String(title || "").trim() && !String(bodyText || "").trim()) {
          window.showAppToast?.("No note was created because it was blank.", "info");
          continue;
        }
        if (!window.SanctumNotes?.createNote) continue;
        const note = window.SanctumNotes.createNote({
          title,
          bodyHTML: plainTextToHTML(bodyText),
          sourceType: action.sourceType || "normal",
          contextPageId: typeof getCurrentPageId === "function" ? getCurrentPageId() : "",
        });
        lastCreated = { type: "note", note };
        if (action.openAfter && typeof window.openPage === "function") {
          window.openPage("notes");
        }

      } else if (action.type === "open-page") {
        if (action.targetPageId) window.openPage?.(action.targetPageId);
      }
    }

    if (cfg.afterAction === "open-created" && lastCreated) {
      if (lastCreated.type === "page") {
        window.openPage?.(lastCreated.pageId);
      } else if (lastCreated.type === "row" && lastCreated.row?.pageId) {
        window.openPeek?.(lastCreated.row.pageId);
      } else if (lastCreated.type === "note") {
        window.openPage?.("notes");
      }
    } else if (cfg.afterAction === "open-page" && cfg.afterPageId) {
      window.openPage?.(cfg.afterPageId);
    }

    // Brief flash feedback
    const btn = blockEl.querySelector(".button-block-btn");
    if (btn) {
      btn.classList.add("button-block-btn--done");
      setTimeout(() => btn.classList.remove("button-block-btn--done"), 600);
    }
    } finally {
      runningButtons.delete(blockEl);
    }
  }

  // ── Event handlers ──────────────────────────────────────────────────────

  document.addEventListener("click", e => {
    if (document.body.classList.contains("editing")) return;
    const btn = e.target.closest(".button-block-btn");
    if (!btn) return;
    const blockEl = btn.closest(".block[data-type='button'], .frame-item[data-frame-child-type='button'], .frame-item[data-type='button']");
    if (!blockEl) return;
    e.preventDefault();
    runButtonActions(blockEl);
  });

  document.addEventListener("dblclick", e => {
    if (!document.body.classList.contains("editing")) return;
    const blockEl = e.target.closest(".block[data-type='button'], .frame-item[data-frame-child-type='button'], .frame-item[data-type='button']");
    if (!blockEl) return;
    e.preventDefault();
    e.stopPropagation();
    openButtonBlockConfig(blockEl);
  });

  // ── Utility ─────────────────────────────────────────────────────────────

  function escHtml(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function plainTextToHTML(text = "") {
    const clean = String(text || "").trim();
    if (!clean) return "";
    return clean
      .split(/\n{2,}/)
      .map((para) => `<p>${escHtml(para).replace(/\n/g, "<br>")}</p>`)
      .join("");
  }

  // ── Exports ─────────────────────────────────────────────────────────────

  window.mountButtonBlock      = mountButtonBlock;
  window.openButtonBlockConfig = openButtonBlockConfig;
  window.runButtonBlockActions = runButtonActions;

  // Mount any button blocks that loaded before this script ran
  document.querySelectorAll('.block[data-type="button"], .frame-item[data-frame-child-type="button"], .frame-item[data-type="button"]').forEach(b => mountButtonBlock(b));
})();
