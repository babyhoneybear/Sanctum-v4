// Optional canvas views of shared rules. Geometry and styling belong to the canvas.
(function () {
  const model = window.SanctumWorldSystems;
  const pages = () => window.userPages || [];
  const el = (tag, text, className = "") => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const button = (text, action) => {
    const node = el("button", text, "world-system-button");
    node.type = "button";
    node.onclick = event => { event.stopPropagation(); action(); };
    return node;
  };
  const openPage = id => window.openPeek?.(id);

  function form(title, description, configure) {
    document.getElementById("worldSystemDialog")?.remove();
    const dialog = el("dialog", "", "world-system-dialog");
    dialog.id = "worldSystemDialog";
    dialog.setAttribute("aria-label", title);
    dialog.append(el("h3", title), el("p", description));
    const body = el("form");
    const error = el("p", "", "pps-picker-error");
    error.setAttribute("role", "alert");
    const close = () => { dialog.close(); dialog.remove(); };
    configure(body, close, error);
    body.append(error, button("Cancel", close));
    dialog.append(body);
    dialog.addEventListener("cancel", () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  }

  function labeled(body, title, input) {
    const label = el("label", title);
    input.setAttribute("aria-label", title);
    label.append(input);
    body.append(label);
    return input;
  }

  function starterBlock(pageId, propertyId, title) {
    // These are ordinary blocks, so even the generated starting layout is optional.
    const blocks = getPageBlocks(pageId);
    if (blocks.some(block => block.type === "connections" && block.connectionPropertyId === propertyId)) return;
    const y = blocks.length ? Math.max(...blocks.map(block => (Number(block.y) || 0) + (Number(block.h) || 168))) + 48 : 48;
    const saved = setPageBlocks(pageId, [...blocks, { id: `connections-${pageId}-${propertyId}`, type: "connections", x: 48, y,
      w: 432, h: 264, z: 1, titleHTML: escapeHtml(title), connectionSourcePageId: pageId, connectionPropertyId: propertyId }]);
    if (saved === false) window.showAppToast?.("The page was created, but its starter block could not be saved. Add a Connect block to display its information.", "info");
  }

  function setupLevels(disciplineId) {
    const discipline = pages().find(page => page.id === disciplineId);
    if (!discipline) return;
    const existing = getPageProps(disciplineId).properties.find(model.isLevels);
    form(`${existing ? "Add" : "Set up"} levels for ${discipline.title}`,
      "One name per line, from lowest to highest. Each becomes its own page. You can write its rules later.", (body, close, error) => {
        const names = labeled(body, "Level names", el("textarea"));
        names.rows = 5;
        names.value = existing ? "" : "Level 1\nLevel 2\nLevel 3\nLevel 4";
        const cumulative = labeled(body, "Higher levels include lower levels", el("input"));
        cumulative.type = "checkbox";
        cumulative.checked = existing?.cumulative !== false;
        cumulative.disabled = !!existing;
        const submit = el("button", "Create level pages", "world-system-submit");
        submit.type = "submit";
        body.append(submit);
        body.onsubmit = event => {
          event.preventDefault();
          error.textContent = "";
          try {
            const labels = names.value.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
            if (!labels.length || labels.length > 30) throw new Error("Enter between 1 and 30 level names.");
            const titles = labels.map(name => `${discipline.title} — ${name}`);
            const normalized = titles.map(window.SanctumPageRelations.normalize);
            if (new Set(normalized).size !== titles.length) throw new Error("Give each level a different name.");
            const all = readAllPageProps();
            const candidates = [discipline, ...getPropertyCandidates(disciplineId)];
            if (candidates.some(page => window.SanctumPageRelations.names(page, all).some(name => normalized.includes(name)))) {
              throw new Error("A level with one of these names already exists here. Use a different name; existing pages will be kept.");
            }
            submit.disabled = true;
            for (const title of titles) {
              const level = window.createPage(title, disciplineId, "board-canvas", "none", "page", { skipTemplate: true });
              const data = getPageProps(disciplineId);
              let prop = data.properties.find(model.isLevels);
              if (!prop) {
                prop = { id: "proficiency-levels", label: "Proficiency levels", type: "relation", relationKind: "proficiency-levels",
                  inverseLabel: "Level of", cumulative: cumulative.checked, linkedPageIds: [] };
                data.properties.push(prop);
              }
              prop.linkedPageIds.push(level.id);
              // Save each completed level so an interrupted setup can be continued.
              setPageProps(disciplineId, data);
              setPageProps(level.id, { properties: [] });
              starterBlock(level.id, "incoming", "Connected here");
            }
            if (disciplineId !== window.getCurrentPageId?.()) starterBlock(disciplineId, "proficiency-levels", "Proficiency levels");
            close();
            refreshPageRelationViews();
          } catch (err) { error.textContent = err.message; submit.disabled = false; refreshPageRelationViews(); }
        };
      });
  }

  function createSpell(levelId) {
    const level = model.levelIndex(pages(), readAllPageProps()).get(levelId);
    if (!level) return;
    form(`New spell for ${level.page.title}`, "The spell gets its own page with this level already linked as a requirement.", (body, close, error) => {
      const name = labeled(body, "Spell name", el("input"));
      name.required = true;
      const submit = el("button", "Create spell", "world-system-submit");
      submit.type = "submit";
      body.append(submit);
      body.onsubmit = event => {
        event.preventDefault();
        try {
          const title = name.value.trim();
          if (!title) throw new Error("Enter a spell name.");
          const normalized = window.SanctumPageRelations.normalize(title);
          if ([level.discipline, ...getPropertyCandidates(level.discipline.id, title)].some(page => window.SanctumPageRelations.names(page, readAllPageProps()).includes(normalized))) throw new Error("A matching page exists. Add its Spell requirements connection to use it here.");
          if (!model.levelIndex(pages(), readAllPageProps()).has(levelId)) throw new Error("This level is no longer available.");
          const parent = window.getVaultScopeId?.(level.discipline.id) || level.discipline.parent || "home";
          const spell = window.createPage(title, parent, "board-canvas", "spell", "page", { skipTemplate: true });
          setPageProps(spell.id, { properties: [{ id: "spell-requirements", ...PAGE_RELATION_PRESETS["spell-requirements"], type: "relation", linkedPageIds: [levelId] }] });
          starterBlock(spell.id, "spell-requirements", "Spell requirements");
          close();
          refreshPageRelationViews();
        } catch (err) { error.textContent = err.message; }
      };
    });
  }

  function appendProficiency(container, pageId, prop, discipline) {
    if (!model.isMagic(prop)) return;
    const all = readAllPageProps();
    const levels = model.levels(pages(), all, discipline.id);
    if (!levels.length) {
      container.append(button("Set up levels", () => setupLevels(discipline.id)));
      return;
    }
    const select = el("select", "", "world-system-level-select");
    select.setAttribute("aria-label", `${discipline.title} proficiency`);
    const none = el("option", "Choose level…"); none.value = ""; select.append(none);
    for (const level of levels) { const option = el("option", level.page.title); option.value = level.id; select.append(option); }
    const selected = prop.linkLevels?.[discipline.id] || "";
    if (selected && !levels.some(level => level.id === selected)) {
      const missing = el("option", "Selected level unavailable"); missing.value = selected; select.append(missing);
    }
    select.value = selected;
    select.onchange = () => {
      writeAllPageProps(model.assignLevel(pages(), readAllPageProps(), pageId, prop.id, discipline.id, select.value));
      refreshPageRelationViews();
    };
    container.append(select);
    if (selected && levels.some(level => level.id === selected)) container.append(button("Open level", () => openPage(selected)));
  }

  function renderLevels(container, pageId) {
    const all = readAllPageProps();
    const prop = getPageProps(pageId).properties.find(model.isLevels);
    if (!prop) {
      container.append(el("p", "Define this discipline once. Its levels and spells can be shared by any character."), button("Set up levels", () => setupLevels(pageId)));
      return;
    }
    const levels = model.levels(pages(), all, pageId);
    for (const level of levels) {
      const row = el("div", "", "world-system-row");
      row.append(button(`${level.rank}. ${level.page.title}`, () => openPage(level.id)), button("+ Spell", () => createSpell(level.id)));
      const spells = pages().filter(page => (all[page.id]?.properties || []).some(field => model.isRequirements(field) && field.linkedPageIds?.includes(level.id)));
      for (const spell of spells) row.append(button(spell.title, () => openPage(spell.id)));
      container.append(row);
    }
    if (levels.length !== prop.linkedPageIds.length) container.append(el("p", "Some level pages are missing or have conflicting definitions. Their rank positions are reserved."));
    const cumulative = el("input"); cumulative.type = "checkbox"; cumulative.checked = prop.cumulative !== false;
    labeled(container, "Higher levels include lower levels", cumulative);
    cumulative.onchange = () => {
      const data = getPageProps(pageId); data.properties.find(model.isLevels).cumulative = cumulative.checked;
      setPageProps(pageId, data); refreshPageRelationViews();
    };
    container.append(button("+ Add levels", () => setupLevels(pageId)));
  }

  function renderAccess(container, pageId) {
    const all = readAllPageProps();
    const scope = window.getVaultScopeId?.(pageId) || "";
    const spells = pages().filter(page => (window.getVaultScopeId?.(page.id) || "") === scope
      && (page.category === "spell" || (all[page.id]?.properties || []).some(model.isRequirements)));
    container.append(el("p", "Checks all defined proficiency requirements. Meeting them does not mean the spell has been learned.", "world-system-hint"));
    for (const spell of spells) {
      const result = model.evaluate(pages(), all, pageId, spell.id);
      const row = el("div", "", `world-system-row world-system-${result.status}`);
      row.append(button(spell.title, () => openPage(spell.id)), el("span", result.status === "eligible" ? "Meets requirements" : result.status === "unknown" ? "Requirements not set" : "Requirements unmet"));
      if (result.reasons.length) row.append(el("small", result.reasons.join(" ")));
      container.append(row);
    }
    if (!spells.length) container.append(el("p", "No spells in this world yet. Create one from a discipline’s Proficiency levels block."));
  }

  window.SanctumWorldSystemsUI = {
    appendProficiency,
    render(container, pageId, propertyId) {
      if (propertyId === "proficiency-levels") renderLevels(container, pageId);
      else if (propertyId === "spell-access") renderAccess(container, pageId);
      else if (propertyId === "incoming" && model.levelIndex(pages(), readAllPageProps()).has(pageId)) {
        renderIncomingPageRelations(container, pageId);
        container.append(button("+ Spell", () => createSpell(pageId)));
      }
      else return false;
      return true;
    }
  };
  refreshPageRelationViews();
})();
