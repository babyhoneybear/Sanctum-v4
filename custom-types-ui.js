(function () {
  const api = window.SanctumCustomTypes;
  const esc = api.escapeText;
  const typeFor = id => api.get(id);

  function populate(select, selected = select?.value || "none", includeArchived = false) {
    if (!select) return;
    select.querySelectorAll('[data-custom-types]').forEach(item => item.remove());
    const group = document.createElement("optgroup");
    group.label = "Custom types";
    group.dataset.customTypes = "true";
    api.list({ includeArchived: true }).filter(type => !type.archived || includeArchived || type.id === selected).forEach(type => {
      const option = document.createElement("option");
      option.value = type.id;
      option.textContent = `${type.name}${type.archived ? " (archived)" : ""}`;
      group.appendChild(option);
    });
    if (group.children.length) select.appendChild(group);
    if (selected.startsWith("custom-type-") && !Array.from(select.options).some(option => option.value === selected)) {
      const missing = document.createElement("option");
      missing.dataset.customTypes = "true"; missing.value = selected; missing.textContent = "Unavailable custom type";
      select.appendChild(missing);
    }
    select.value = selected;
  }
  function refresh() {
    populate(document.getElementById("pageCreateCategory"));
    populate(document.getElementById("pageDetailsCategory"));
    updateSummary();
    window.invalidateRelationshipGraphCache?.();
  }
  function updateSummary() {
    const summary = document.getElementById("customTypeCreateSummary");
    if (!summary) return;
    const type = typeFor(document.getElementById("pageCreateCategory")?.value);
    summary.textContent = type ? `${type.description ? type.description + " · " : ""}${type.fields.length} fields · ${type.sections.length} starter sections. Available as a board or document.` : "";
    document.querySelectorAll("#pageCreateLayouts .page-type-btn").forEach(button => {
      button.disabled = !!type && !Object.hasOwn(api.LAYOUTS, button.dataset.layout);
    });
  }
  function selectType(id) {
    populate(document.getElementById("pageCreateCategory"), id);
    document.getElementById("pageCreateCategory").dispatchEvent(new Event("change", { bubbles: true }));
  }

  function applyProperties(pageId, category, merge = false) {
    const type = typeFor(category);
    if (!type) return;
    const all = window.readStorageJSON(window.STORAGE_KEYS.pageProps, {});
    if (all[pageId] && !merge) return;
    const previous = all[pageId] || { properties: [] };
    const fields = previous.properties || [];
    all[pageId] = { ...previous, customTypeId: type.id, customTypeVersion: type.version,
      properties: [...fields, ...api.properties(type).filter(field => !fields.some(existing => existing.id === field.id))] };
    if (!window.writeStorageJSON(window.STORAGE_KEYS.pageProps, all)) throw new Error("The page fields could not be saved.");
  }
  function applyStarter(pageId, category, layout) {
    const type = typeFor(category);
    if (!type) return false;
    applyProperties(pageId, category);
    const starter = api.starter(type, pageId, layout);
    if (starter.blocks) {
      const all = window.readAllPageBlocks();
      if (!all[pageId]?.length) { all[pageId] = starter.blocks; window.writeAllPageBlocks(all); }
    }
    if (starter.document) {
      const docs = window.readAllDocuments();
      if (!docs[pageId]) { docs[pageId] = starter.document; window.writeAllDocuments(docs); }
    }
    return true;
  }
  function createDialog(id, title, subtitle) {
    document.getElementById(id)?.remove();
    const dialog = document.createElement("dialog");
    dialog.id = id; dialog.className = "custom-types-dialog";
    dialog.setAttribute("aria-labelledby", `${id}Title`);
    dialog.innerHTML = `<header class="custom-types-header"><div><h2 id="${id}Title">${esc(title)}</h2><p>${esc(subtitle)}</p></div><button type="button" data-close aria-label="Close ${esc(title)}">✕</button></header>`;
    document.body.appendChild(dialog);
    dialog.addEventListener("keydown", event => {
      // Keep global canvas shortcuts and overlay handlers outside this dialog.
      event.stopPropagation();
    });
    dialog.addEventListener("close", () => dialog.remove());
    return dialog;
  }
  function openManager(options = {}) {
    const dialog = createDialog("customTypesDialog", "Custom types", "Reusable starting points for anything you keep in Sanctum.");
    dialog.insertAdjacentHTML("beforeend", '<div class="custom-types-body"><nav class="custom-types-library" aria-label="Saved types"></nav><form class="custom-types-editor"></form></div>');
    const library = dialog.querySelector("nav"), form = dialog.querySelector("form");
    let draft, dirty = false;
    function mayLeave() { return !dirty || confirm("Discard the unsaved changes to this type?"); }
    dialog.querySelector("[data-close]").onclick = () => { if (mayLeave()) dialog.close(); };
    dialog.addEventListener("cancel", event => { if (!mayLeave()) event.preventDefault(); });
    function load(type) {
      draft = type ? JSON.parse(JSON.stringify(type)) : { name: "", description: "", icon: "", layout: "board-canvas", fields: [], sections: [], archived: false };
      dirty = false;
      renderLibrary();
      form.innerHTML = `
        <div class="custom-types-name-row"><label>Icon<input name="icon" maxlength="40" placeholder="◇" aria-label="Type icon (emoji or symbol)"></label><label>Type name<input name="name" required maxlength="80" placeholder="Recipe, Course, Faction…"></label></div>
        <label>Description<input name="description" maxlength="500" placeholder="What belongs in this type?"></label>
        <label>Default layout<select name="layout">${Object.entries(api.LAYOUTS).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
        <section><div class="custom-types-section-head"><h3>Fields</h3><button type="button" data-add-field>+ Add field</button></div><p>Text for facts. Page links for connections to other entries.</p><div class="custom-types-fields"></div></section>
        <label>Starter sections<textarea name="sections" placeholder="Overview&#10;Notes"></textarea><span>One heading per line. Each becomes an editable section or canvas block.</span></label>
        <p>Field defaults and starter sections apply to new pages. Existing pages keep their fields, values, and layout.${draft.id ? " Archiving hides the type from new-page choices and keeps existing pages available." : ""}</p>
        <div class="custom-types-error" role="alert"></div>
        <footer class="custom-types-actions"><button type="button" data-archive ${draft.id ? "" : "hidden"}>${draft.archived ? "Restore type" : "Archive type"}</button><button type="submit" class="custom-types-primary">Save type</button></footer>`;
      ["name", "icon", "description", "layout"].forEach(key => { form.elements[key].value = draft[key]; });
      form.elements.sections.value = draft.sections.join("\n");
      draft.fields.forEach(addField);
      form.querySelector("[data-add-field]").onclick = () => {
        const row = addField({ id: api.newId("field"), label: "", type: "text", defaultValue: "" });
        dirty = true; row.querySelector("input").focus();
      };
      form.querySelector("[data-archive]").onclick = async () => {
        if (!mayLeave()) return;
        try {
          const saved = api.save({ ...typeFor(draft.id), archived: !draft.archived });
          refresh(); load(saved);
          await persist();
        } catch (error) { showError(error); }
      };
    }
    function renderLibrary() {
      library.replaceChildren();
      const add = document.createElement("button"); add.type = "button"; add.textContent = "+ New type";
      add.onclick = () => { if (mayLeave()) load(); };
      library.appendChild(add);
      api.list({ includeArchived: true }).sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name)).forEach(type => {
        const button = document.createElement("button"); button.type = "button";
        button.setAttribute("aria-current", String(type.id === draft.id));
        button.innerHTML = `${esc(type.icon ? type.icon + " " : "")}${esc(type.name)}<small>${type.archived ? "Archived" : `${type.fields.length} fields · ${esc(api.LAYOUTS[type.layout])}`}</small>`;
        button.onclick = () => { if (mayLeave()) load(type); };
        library.appendChild(button);
      });
    }
    function addField(field) {
      const row = document.createElement("div"); row.className = "custom-types-field"; row.dataset.fieldId = field.id;
      row.innerHTML = `<label>Field name<input data-field-label required maxlength="80" placeholder="Name of field"></label><label>Kind<select data-field-kind><option value="text">Text</option><option value="relation">Page links</option></select></label><button type="button" data-remove aria-label="Remove field">×</button><label class="custom-types-default">Starting value (optional)<input data-field-default maxlength="4000" placeholder="Leave blank to fill in later"></label>`;
      row.querySelector("[data-field-label]").value = field.label;
      row.querySelector("[data-field-kind]").value = field.type;
      row.querySelector("[data-field-default]").value = field.defaultValue;
      row.querySelector(".custom-types-default").hidden = field.type !== "text";
      row.querySelector("[data-field-kind]").onchange = event => { row.querySelector(".custom-types-default").hidden = event.target.value !== "text"; dirty = true; };
      row.querySelector("[data-remove]").onclick = () => { row.remove(); dirty = true; };
      form.querySelector(".custom-types-fields").appendChild(row);
      return row;
    }
    function showError(error) { form.querySelector("[role=alert]").textContent = error.message; }
    async function persist() {
      if (await window.SanctumStorage?.flush?.() === false) throw new Error("Changes are in memory but not yet saved to disk. Keep this tab open and use Retry saving.");
    }
    form.addEventListener("input", () => { dirty = true; });
    form.onsubmit = async event => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
      try {
        const saved = api.save({ ...draft,
          name: form.elements.name.value, icon: form.elements.icon.value, description: form.elements.description.value,
          layout: form.elements.layout.value, sections: form.elements.sections.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean),
          fields: [...form.querySelectorAll(".custom-types-field")].map(row => ({ id: row.dataset.fieldId,
            label: row.querySelector("[data-field-label]").value, type: row.querySelector("[data-field-kind]").value,
            defaultValue: row.querySelector("[data-field-default]").value }))
        });
        draft = saved; dirty = false; refresh();
        await persist();
        if (options.onSave && !saved.archived) { options.onSave(saved); dialog.close(); }
        else { load(saved); window.showAppToast?.("Type saved. Ready for new pages.", "success"); }
      } catch (error) { showError(error); }
      finally { submit.disabled = false; }
    };
    load(options.id ? typeFor(options.id) : null);
    dialog.showModal();
    form.elements.name.focus();
  }

  function refreshFieldsView() {
    const dialog = document.getElementById("customTypeFieldsDialog");
    if (!dialog) return;
    const pageId = dialog.dataset.pageId;
    const page = window.userPages.find(page => page.id === pageId);
    if (!page) { dialog.close(); return; }
    const container = dialog.querySelector(".custom-types-fields-view");
    // Keep the focused text editor intact while another field refreshes.
    const focusedProperty = document.activeElement?.closest("[data-custom-field]")?.dataset.customField;
    const properties = window.getPageProps(pageId).properties;
    properties.forEach(property => {
      let row = [...container.children].find(row => row.dataset.customField === property.id);
      if (!row) { row = document.createElement("div"); row.dataset.customField = property.id; container.appendChild(row); }
      const fingerprint = JSON.stringify(property);
      if (focusedProperty !== property.id && row._propertyFingerprint !== fingerprint) {
        row._propertyFingerprint = fingerprint;
        window.renderPagePropsStrip(pageId, page.category, { container: row, propertyId: property.id });
      }
    });
    if (!properties.length) container.textContent = "This page has no type fields.";
  }
  function openFields(pageId) {
    const page = window.userPages.find(page => page.id === pageId);
    if (!page) return;
    window.initPagePropsIfNeeded(pageId, page.category);
    const dialog = createDialog("customTypeFieldsDialog", `${page.title} · Fields`, "Changes save as you edit. Page links use the same connections as the canvas.");
    dialog.dataset.pageId = pageId;
    dialog.insertAdjacentHTML("beforeend", '<div class="custom-types-fields-view"></div>');
    dialog.querySelector("[data-close]").onclick = () => { document.activeElement?.blur(); dialog.close(); };
    dialog.addEventListener("cancel", () => document.activeElement?.blur());
    dialog.addEventListener("click", event => {
      if (event.target.closest(".pps-chip") && !event.target.closest(".pps-chip-remove")) dialog.close();
    }, true);
    refreshFieldsView(); dialog.showModal();
  }

  window.SanctumCustomTypesUI = { populate, refresh, updateSummary, openManager, applyProperties, applyStarter, openFields, refreshFieldsView };
  document.getElementById("manageCustomTypesCreate")?.addEventListener("click", () => openManager({
    id: document.getElementById("pageCreateCategory").value, onSave: type => selectType(type.id)
  }));
  document.getElementById("manageCustomTypesDetails")?.addEventListener("click", () => openManager({
    id: document.getElementById("pageDetailsCategory").value,
    onSave: type => populate(document.getElementById("pageDetailsCategory"), type.id)
  }));
  refresh();
})();
