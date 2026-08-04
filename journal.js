(function () {
  "use strict";

  const Data = window.SanctumJournalData;
  if (!Data) {
    console.error("Sanctum journal data helpers did not load.");
    return;
  }

  const state = {
    activeId: "",
    journal: null,
    mode: "skim",
    modeBeforeOverview: "skim",
    activeTool: "select",
    panel: "",
    shapePreset: "rectangle",
    tapePreset: "solid",
    pageInsertPosition: "after",
    bookState: "front",
    turned: 1,
    editPageId: "",
    selectedElementId: "",
    gesture: null,
    history: [],
    future: [],
    saveTimer: null,
    textCheckpointId: "",
    resizeTimer: null,
    suppressSkimClick: false,
    placementTool: "",
    placementPoint: { x: 160, y: 220 },
    pendingImagePoint: null,
    replaceImageId: "",
    copiedElement: null
  };

  function escapeMarkup(value) {
    return typeof window.escapeHTML === "function"
      ? window.escapeHTML(value)
      : String(value ?? "").replace(/[&<>"']/g, (char) => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        })[char]);
  }

  function record(id = state.activeId) {
    return [...(window.userDomains || []), ...(window.userPages || [])]
      .find((page) => page.id === id) || { id, title: "Journal", parent: "home" };
  }

  function storageKey() {
    return window.STORAGE_KEYS?.journals || "sanctum_journals_v1";
  }

  function readAllJournals() {
    if (typeof window.readStorageJSON !== "function") return {};
    const current = window.readStorageJSON(storageKey(), null);
    if (current && typeof current === "object" && !Array.isArray(current) && Object.keys(current).length) {
      return current;
    }
    const legacy = window.readStorageJSON("sanctum_journals", {});
    if (legacy && typeof legacy === "object" && !Array.isArray(legacy) && Object.keys(legacy).length) {
      window.writeStorageJSON?.(storageKey(), legacy);
      return legacy;
    }
    return {};
  }

  function saveImmediately() {
    if (!state.activeId || !state.journal) return;
    state.journal = Data.normalizeJournal(state.journal, {
      id: state.activeId,
      title: record().title || "Journal"
    });
    const all = readAllJournals();
    all[state.activeId] = state.journal;
    window.writeStorageJSON?.(storageKey(), all);
  }

  function scheduleSave() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveImmediately, 100);
  }

  function checkpoint() {
    if (!state.journal) return;
    const snapshot = JSON.stringify(state.journal);
    if (state.history[state.history.length - 1] !== snapshot) {
      state.history.push(snapshot);
      if (state.history.length > 30) state.history.shift();
    }
    state.future = [];
  }

  function restoreSnapshot(stackFrom, stackTo) {
    if (!state.journal || !stackFrom.length) return;
    stackTo.push(JSON.stringify(state.journal));
    state.journal = Data.normalizeJournal(JSON.parse(stackFrom.pop()), {
      id: state.activeId,
      title: record().title
    });
    if (!getPage(state.editPageId)) state.editPageId = state.journal.pages[0]?.id || "";
    if (!getElement(state.selectedElementId)) state.selectedElementId = "";
    saveImmediately();
    renderCurrent();
  }

  function isCoverPage(page) {
    return page?.kind === "cover";
  }

  function getPage(pageId = state.editPageId) {
    if (state.journal?.cover?.id === pageId) return state.journal.cover;
    if (state.journal?.backCover?.id === pageId) return state.journal.backCover;
    return state.journal?.pages?.find((page) => page.id === pageId) || null;
  }

  function getPageIndex(pageId = state.editPageId) {
    if (state.journal?.cover?.id === pageId || state.journal?.backCover?.id === pageId) return -1;
    return state.journal?.pages?.findIndex((page) => page.id === pageId) ?? -1;
  }

  function getElement(elementId = state.selectedElementId, pageId = state.editPageId) {
    return getPage(pageId)?.elements?.find((element) => element.id === elementId) || null;
  }

  function leafCount() {
    return Math.ceil(((state.journal?.pages?.length || 1) + 1) / 2);
  }

  function maxTurned() {
    return Math.max(1, Math.ceil((state.journal?.pages?.length || 1) / 2));
  }

  function clampTurned(value) {
    return Math.max(1, Math.min(maxTurned(), Math.round(Number(value) || 1)));
  }

  function turnedForPage(index) {
    if (index < 0) return 1;
    return clampTurned(Math.floor(index / 2) + 1);
  }

  function paperLabel(paper) {
    return ({
      plain: "Ivory",
      ruled: "Ruled",
      grid: "Graph",
      dotted: "Dotted",
      warm: "Warm",
      kraft: "Kraft"
    })[paper] || "Warm";
  }

  function choiceLabel(value) {
    return String(value || "").replace(/(^|-)([a-z])/g, (_, separator, letter) => `${separator ? " " : ""}${letter.toUpperCase()}`);
  }

  function renderElement(element, editor = false) {
    const selected = editor && state.selectedElementId === element.id;
    const style = [
      `left:${element.x / 10}%`,
      `top:${element.y / 14}%`,
      `width:${element.w / 10}%`,
      `height:${element.h / 14}%`,
      `transform:rotate(${element.rotation}deg)`,
      `z-index:${element.z}`
    ].join(";");
    if (element.type === "image") {
      return `<div class="sj-object sj-object-image sj-image-shape-${element.cropShape || "original"} sj-image-frame-${element.frameStyle || "none"}${selected ? " is-selected" : ""}"
        data-element-id="${escapeMarkup(element.id)}" data-drag-object style="${style}">
        <img src="${escapeMarkup(element.src)}" alt="${escapeMarkup(element.alt || "")}"
          style="object-fit:${element.fit}" draggable="false">
        ${editor ? objectHandles(element) : ""}
      </div>`;
    }
    if (element.type === "shape") {
      return `<div class="sj-object sj-object-shape${selected ? " is-selected" : ""}"
        data-element-id="${escapeMarkup(element.id)}" data-drag-object style="${style}">
        <div class="sj-shape-art sj-shape-${element.shape}"
          style="--shape-fill:${element.fill};--shape-stroke:${element.stroke};--shape-stroke-width:${element.strokeWidth}px"></div>
        ${editor ? objectHandles(element) : ""}
      </div>`;
    }
    if (element.type === "sticker") {
      const glyphs = { star: "★", heart: "♥", flower: "✿", sparkles: "✦", dot: "●", check: "✓" };
      const glyph = glyphs[element.variant] || "";
      return `<div class="sj-object sj-object-sticker sj-sticker-${element.variant}${selected ? " is-selected" : ""}"
        data-element-id="${escapeMarkup(element.id)}" data-drag-object style="${style};--sticker-color:${element.color}">
        <div class="sj-sticker-art">${glyph || escapeMarkup(element.label || (element.variant === "label" ? "Label" : ""))}</div>
        ${editor ? objectHandles(element) : ""}
      </div>`;
    }
    if (element.type === "tape") {
      return `<div class="sj-object sj-object-tape sj-tape-${element.pattern}${selected ? " is-selected" : ""}"
        data-element-id="${escapeMarkup(element.id)}" data-drag-object
        style="${style};--tape-color:${element.color};--tape-opacity:${element.opacity}">
        ${editor ? objectHandles(element) : ""}
      </div>`;
    }
    const textStyle = [
      `font-size:${element.fontSize}px`,
      `color:${element.color}`,
      `text-align:${element.align}`,
      `font-weight:${element.bold ? 700 : 400}`,
      `font-style:${element.italic ? "italic" : "normal"}`
    ].join(";");
    const textBoxStyle = [
      style,
      `background:${element.background || "transparent"}`,
      `border:${element.borderWidth || 0}px solid ${element.borderColor || "transparent"}`,
      `border-radius:${element.radius || 0}px`,
      `padding:${element.padding || 0}px`
    ].join(";");
    return `<div class="sj-object sj-object-text sj-font-${element.font}${selected ? " is-selected" : ""}"
      data-element-id="${escapeMarkup(element.id)}" data-drag-object style="${textBoxStyle}">
      <div class="sj-text-content" ${editor ? 'contenteditable="true" spellcheck="true" data-role="text-editor"' : ""}
        style="${textStyle}">${escapeMarkup(element.text)}</div>
      ${editor ? objectHandles(element) : ""}
    </div>`;
  }

  function objectHandles(element) {
    return `
      <button class="sj-object-handle sj-object-rotate" data-rotate-object aria-label="Rotate ${element.type}">↻</button>
      <button class="sj-object-handle sj-object-resize" data-resize-object aria-label="Resize ${element.type}"></button>`;
  }

  function pageMarkup(page, index, options = {}) {
    if (!page) {
      return `<div class="sj-book-page sj-book-page-empty" aria-hidden="true"></div>`;
    }
    return `<section class="sj-book-page sj-paper-${page.paper}${options.side ? ` is-${options.side}` : ""}"
      data-page-id="${escapeMarkup(page.id)}" data-page-index="${index}"
      ${options.hidden ? 'aria-hidden="true"' : `aria-label="Page ${index + 1}. Tap to edit."`}>
      <div class="sj-paper-grain" aria-hidden="true"></div>
      <div class="sj-page-elements">
        ${page.elements.map((element) => renderElement(element, false)).join("")}
      </div>
      <span class="sj-page-number">${index + 1}</span>
    </section>`;
  }

  function leafMarkup(index) {
    const frontIndex = index === 0 ? -1 : (index * 2) - 1;
    const backIndex = index * 2;
    const front = state.journal.pages[frontIndex] || null;
    const back = state.journal.pages[backIndex] || null;
    const turned = index < state.turned;
    const canForward = index === state.turned && state.turned < maxTurned();
    const canBack = index === state.turned - 1 && state.turned > 1;
    const visibleLeft = index === state.turned - 1;
    const visibleRight = index === state.turned;
    const depth = turned ? state.turned - index : index - state.turned;
    const offset = Math.min(10, Math.max(0, depth)) * (turned ? -5 : 5);
    const z = turned ? index + 1 : (leafCount() * 3) - index;
    const angle = turned ? -180 : 0;
    return `<div class="sj-leaf${turned ? " is-turned" : ""}${visibleLeft ? " is-visible-left" : ""}${visibleRight ? " is-visible-right" : ""}${canForward ? " can-forward" : ""}${canBack ? " can-back" : ""}"
      data-leaf-index="${index}" data-offset="${offset}" style="--leaf-z:${z};--leaf-offset:${offset}px;--leaf-angle:${angle}deg">
      <div class="sj-leaf-face sj-leaf-front" data-page-id="${escapeMarkup(front?.id || "")}">
        ${pageMarkup(front, frontIndex, { side: "right", hidden: index !== state.turned })}
      </div>
      <div class="sj-leaf-face sj-leaf-back" data-page-id="${escapeMarkup(back?.id || "")}">
        ${pageMarkup(back, backIndex, { side: "left", hidden: index !== state.turned - 1 })}
      </div>
      <div class="sj-leaf-shadow" aria-hidden="true"></div>
    </div>`;
  }

  function shellRoot() {
    const pageContent = document.getElementById("pageContent");
    const grid = document.getElementById("grid");
    const pageCanvas = document.getElementById("pageCanvas");
    if (!pageContent) return null;
    pageCanvas?.classList.add("journal-proto-canvas");
    if (grid) {
      grid.innerHTML = "";
      grid.style.display = "none";
    }
    pageContent.className = "journal-root sj-root";
    pageContent.style.display = "block";
    pageContent.dataset.surfaceType = "journal";
    return pageContent;
  }

  function coverColor() {
    const value = state.journal?.cover?.color;
    if (String(value).toLowerCase() === "#29334b") return "#4b4036";
    return /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#4b4036";
  }

  function renderClosedCover(position = "front") {
    const root = shellRoot();
    if (!root || !state.journal) return;
    state.mode = "skim";
    syncJournalDockState(false);
    state.bookState = position;
    const isBack = position === "back";
    const cover = isBack ? state.journal.backCover : state.journal.cover;
    root.innerHTML = `<div class="sj-shell sj-skim sj-cover-mode" data-mode="skim" data-book-state="${position}">
      <header class="sj-book-rail">
        <button class="sj-round-btn" data-action="back" aria-label="Back to parent">‹</button>
        <span>${isBack ? "End of journal" : `${state.journal.pages.length} pages`}</span>
        <button class="sj-round-btn" data-action="overview" aria-label="Open page overview">▦</button>
      </header>
      <main class="sj-cover-stage">
        <div class="sj-closed-book${isBack ? " is-back-cover" : ""}" style="--journal-cover:${cover.color}">
          <span class="sj-cover-spine" aria-hidden="true"></span>
          <span class="sj-cover-elements">${cover.elements.map((element) => renderElement(element, false)).join("")}</span>
          <button class="sj-cover-open-target" data-action="${isBack ? "back-cover-pages" : "open-cover"}"
            aria-label="${isBack ? "Return to the last pages" : `Open ${escapeMarkup(state.journal.title)}`}"></button>
          <button class="sj-cover-edit-btn" data-action="${isBack ? "edit-back-cover" : "edit-cover"}">Edit ${isBack ? "back cover" : "cover"}</button>
        </div>
      </main>
      <footer class="sj-skim-footer">
        <button class="sj-nav-btn" data-action="${isBack ? "back-cover-pages" : "previous"}" ${isBack ? "" : "disabled"} aria-label="Previous">←</button>
        <span>${isBack ? "Back cover" : "Front cover"}</span>
        <button class="sj-nav-btn" data-action="${isBack ? "next" : "open-cover"}" ${isBack ? "disabled" : ""} aria-label="Next">→</button>
      </footer>
    </div>`;
  }

  function revealPagesFromCover(fromBack = false) {
    if (state.gesture) return;
    const cover = document.querySelector(".sj-closed-book");
    const done = () => {
      state.bookState = "open";
      state.turned = fromBack ? maxTurned() : 1;
      state.gesture = null;
      renderSkim();
    };
    if (!cover || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      done();
      return;
    }
    state.gesture = { type: "cover-open" };
    cover.classList.add(fromBack ? "is-opening-back" : "is-opening");
    setTimeout(done, 460);
  }

  function renderSkim() {
    if (state.bookState !== "open") {
      renderClosedCover(state.bookState);
      return;
    }
    const root = shellRoot();
    if (!root || !state.journal) return;
    state.mode = "skim";
    syncJournalDockState(false);
    state.turned = clampTurned(state.turned);
    const leftIndex = (state.turned * 2) - 2;
    const rightIndex = (state.turned * 2) - 1 < state.journal.pages.length ? (state.turned * 2) - 1 : -1;
    const visiblePages = [leftIndex, rightIndex].filter((index) => index >= 0);
    const canBack = true;
    const canForward = true;
    const counter = visiblePages.length === 2
      ? `${leftIndex + 1}–${rightIndex + 1}`
      : `${visiblePages[0] + 1}`;

    root.innerHTML = `<div class="sj-shell sj-skim" data-mode="skim" data-book-state="open">
      <header class="sj-book-rail">
        <button class="sj-round-btn" data-action="back" aria-label="Back to parent">‹</button>
        <span>${counter} / ${state.journal.pages.length}</span>
        <button class="sj-round-btn" data-action="overview" aria-label="Open page overview">▦</button>
      </header>
      <main class="sj-skim-stage">
        <div class="sj-book-shadow" aria-hidden="true"></div>
        <div class="sj-book sj-book-physical">
          <div class="sj-book-cover" aria-hidden="true"></div>
          ${Array.from({ length: leafCount() }, (_, index) => leafMarkup(index)).join("")}
          <div class="sj-spine" aria-hidden="true"></div>
          <button class="sj-page-hit-target is-left" data-skim-side="left"
            data-page-id="${escapeMarkup(state.journal.pages[leftIndex]?.id || "")}"
            aria-label="Open page ${leftIndex + 1}"></button>
          ${rightIndex >= 0 ? `<button class="sj-page-hit-target is-right" data-skim-side="right"
            data-page-id="${escapeMarkup(state.journal.pages[rightIndex]?.id || "")}"
            aria-label="Open page ${rightIndex + 1}"></button>` : ""}
        </div>
      </main>
      <footer class="sj-skim-footer">
        <button class="sj-nav-btn" data-action="previous" ${canBack ? "" : "disabled"} aria-label="Previous page">←</button>
        <span>${counter} / ${state.journal.pages.length}</span>
        <button class="sj-nav-btn" data-action="next" ${canForward ? "" : "disabled"} aria-label="Next page">→</button>
        <button class="sj-add-page-fab" data-action="add-page" aria-label="Add page">＋</button>
      </footer>
    </div>`;
  }

  function selectedTools() {
    const element = getElement();
    if (!element) return "";
    const textTools = element.type === "text" ? `
      <label class="sj-tool-field">Font
        <select data-action="font">
          <option value="serif"${element.font === "serif" ? " selected" : ""}>Serif</option>
          <option value="sans"${element.font === "sans" ? " selected" : ""}>Sans</option>
          <option value="hand"${element.font === "hand" ? " selected" : ""}>Handwritten</option>
        </select>
      </label>
      <label class="sj-tool-field sj-size-field">Size
        <input type="range" min="${Data.MIN_TEXT_SIZE}" max="${Data.MAX_TEXT_SIZE}" value="${element.fontSize}" data-action="font-size">
      </label>
      <label class="sj-color-field" title="Text color">
        <span>Color</span><input type="color" value="${element.color}" data-action="text-color">
      </label>
      <button data-action="align" title="Change alignment">Align</button>` : `
      <button data-action="toggle-fit">${element.fit === "contain" ? "Fill frame" : "Fit photo"}</button>`;
    return `<div class="sj-selection-tools" aria-label="Selected item controls">
      ${textTools}
      <span class="sj-toolbar-separator"></span>
      <button data-action="layer-back" title="Send backward">Lower</button>
      <button data-action="layer-front" title="Bring forward">Raise</button>
      <button data-action="duplicate-element">Duplicate</button>
      <button class="is-danger" data-action="delete-element">Delete</button>
    </div>`;
  }

  function renderLegacyEditor() {
    const root = shellRoot();
    const page = getPage();
    if (!root || !page) return;
    state.mode = "edit";
    const index = getPageIndex(page.id);
    const selected = getElement();
    const coverPage = isCoverPage(page);
    const surfaceClass = coverPage ? "sj-cover-canvas" : `sj-paper-${page.paper}`;
    const surfaceStyle = coverPage ? ` style="--journal-cover:${page.color}"` : "";
    root.innerHTML = `<div class="sj-shell sj-editor" data-mode="edit">
      <header class="sj-editor-header">
        <button class="sj-round-btn" data-action="skim" aria-label="Return to book">‹</button>
        <div class="sj-title-wrap">
          <h1>${escapeMarkup(state.journal.title)}</h1>
          <p>Page ${index + 1} of ${state.journal.pages.length} · saved automatically</p>
        </div>
        <button class="sj-round-btn" data-action="overview" aria-label="Open page overview">▦</button>
      </header>
      <div class="sj-main-toolbar" aria-label="Journal tools">
        <button class="is-primary" data-action="add-text">T <span>Text</span></button>
        <button data-action="add-photo">▧ <span>Photo</span></button>
        <label class="sj-tool-field">Paper
          <select data-action="paper">
            ${Data.PAPER_TYPES.map((paper) => `<option value="${paper}"${page.paper === paper ? " selected" : ""}>${paperLabel(paper)}</option>`).join("")}
          </select>
        </label>
        <span class="sj-toolbar-separator"></span>
        <button data-action="undo" ${state.history.length ? "" : "disabled"} title="Undo">↶</button>
        <button data-action="redo" ${state.future.length ? "" : "disabled"} title="Redo">↷</button>
        <button data-action="add-page">＋ <span>Page</span></button>
      </div>
      ${selectedTools()}
      <main class="sj-editor-stage" data-drop-zone>
        <div class="sj-flat-page sj-paper-${page.paper}" data-editor-page data-page-id="${escapeMarkup(page.id)}">
          <div class="sj-paper-grain" aria-hidden="true"></div>
          ${page.elements.map((element) => renderElement(element, true)).join("")}
          ${page.elements.length ? "" : `<div class="sj-empty-page">
            <span>Make this page yours.</span>
            <small>Add a thought, drop in a photo, or paste an image.</small>
          </div>`}
          <span class="sj-page-number">${index + 1}</span>
        </div>
      </main>
      <input id="sj-photo-input" type="file" accept="image/*" multiple hidden>
    </div>`;

    if (selected?.type === "text" && state.textCheckpointId === `focus-${selected.id}`) {
      const editable = root.querySelector(`[data-element-id="${CSS.escape(selected.id)}"] [data-role="text-editor"]`);
      editable?.focus();
      document.getSelection()?.selectAllChildren(editable);
      state.textCheckpointId = "";
    }
  }

  function toolButton(tool, icon, label) {
    const active = state.activeTool === tool || (tool === "photo" && state.activeTool === "photo");
    return `<button class="sj-tool-button${active ? " is-active" : ""}" data-tool="${tool}" data-label="${label}" title="${label}" aria-label="${label}" aria-pressed="${active}">
      <span class="sj-tool-icon" aria-hidden="true">${icon}</span>
    </button>`;
  }

  function contextualTools() {
    const element = getElement();
    if (!element) return "";

    let specific = "";
    if (element.type === "text") {
      specific = `
        <label class="sj-compact-field"><span>Typeface</span><select data-action="font">
          <option value="serif"${element.font === "serif" ? " selected" : ""}>Serif</option>
          <option value="sans"${element.font === "sans" ? " selected" : ""}>Sans</option>
          <option value="hand"${element.font === "hand" ? " selected" : ""}>Handwritten</option>
        </select></label>
        <label class="sj-compact-field sj-number-field"><span>Size</span><input type="number" min="${Data.MIN_TEXT_SIZE}" max="${Data.MAX_TEXT_SIZE}" value="${element.fontSize}" data-action="font-size"></label>
        <button class="${element.bold ? "is-active" : ""}" data-action="toggle-bold" title="Bold"><strong>B</strong></button>
        <button class="${element.italic ? "is-active" : ""}" data-action="toggle-italic" title="Italic"><em>I</em></button>
        <button data-action="align" title="Text alignment">${element.align === "left" ? "Left" : element.align === "center" ? "Center" : "Right"}</button>
        <label class="sj-color-swatch" title="Text color"><input type="color" value="${element.color}" data-action="text-color"></label>`;
    } else if (element.type === "image") {
      specific = `<button data-action="toggle-fit">${element.fit === "contain" ? "Fill frame" : "Fit photo"}</button>
        <button data-action="replace-photo">Add another</button>`;
    } else if (element.type === "shape") {
      specific = `<label class="sj-compact-field"><span>Fill</span><input type="color" value="${element.fill}" data-action="shape-fill"></label>
        <label class="sj-compact-field"><span>Border</span><input type="color" value="${element.stroke}" data-action="shape-stroke"></label>
        <label class="sj-compact-field sj-number-field"><span>Width</span><input type="number" min="0" max="24" value="${element.strokeWidth}" data-action="shape-width"></label>`;
    } else if (element.type === "sticker") {
      specific = `<label class="sj-compact-field"><span>Color</span><input type="color" value="${element.color}" data-action="sticker-color"></label>`;
    } else if (element.type === "tape") {
      specific = `<label class="sj-compact-field"><span>Color</span><input type="color" value="${element.color}" data-action="tape-color"></label>
        <button data-action="cycle-tape-pattern">Pattern: ${choiceLabel(element.pattern)}</button>`;
    }

    return `<div class="sj-context-toolbar" aria-label="Selected item controls">
      ${specific}<span class="sj-toolbar-separator"></span>
      <button data-action="layer-back">Lower</button>
      <button data-action="layer-front">Raise</button>
      <button data-action="duplicate-element">Duplicate</button>
      <button class="is-danger" data-action="delete-element">Delete</button>
    </div>`;
  }

  function paperPreviewButton(paper) {
    const page = getPage();
    return `<button class="sj-paper-choice${page?.paper === paper ? " is-active" : ""}" data-action="apply-paper" data-paper="${paper}">
      <span class="sj-paper-preview sj-paper-${paper}"></span><span>${paperLabel(paper)}</span>
    </button>`;
  }

  function editorPanel() {
    if (!state.panel) return "";
    const close = `<button class="sj-panel-close" data-action="close-panel" aria-label="Close panel">×</button>`;
    if (state.panel === "elements") {
      const choices = [
        ["note", "Note"], ["label", "Label"], ["star", "Star"], ["heart", "Heart"],
        ["flower", "Flower"], ["sparkles", "Sparkles"], ["dot", "Dot"], ["check", "Check"]
      ];
      return `<aside class="sj-dock-popover"><header><div><h2>Elements</h2><p>Scrapbook pieces and symbols</p></div>${close}</header>
        <div class="sj-element-grid">${choices.map(([variant, label]) => `<button data-action="add-sticker" data-variant="${variant}">
          <span class="sj-element-sample sj-sticker-${variant}">${({ star: "★", heart: "♥", flower: "✿", sparkles: "✦", dot: "●", check: "✓" })[variant] || label}</span>
          <small>${label}</small></button>`).join("")}</div></aside>`;
    }
    if (state.panel === "shapes") {
      return `<aside class="sj-dock-popover sj-shape-panel"><header><div><h2>Shapes</h2><p>Pick a shape to add</p></div>${close}</header>
        <div class="sj-element-grid">${["rectangle", "ellipse", "triangle", "diamond", "line"].map((shape) => `<button data-action="add-shape" data-shape="${shape}">
          <span class="sj-shape-sample sj-shape-${shape}"></span><small>${choiceLabel(shape)}</small></button>`).join("")}</div></aside>`;
    }
    if (state.panel === "tape") {
      return `<aside class="sj-dock-popover"><header><div><h2>Tape</h2><p>Layer it over photos and notes</p></div>${close}</header>
        <div class="sj-tape-options">${["solid", "stripe", "grid", "dots"].map((pattern) => `<button class="sj-tape-choice sj-tape-${pattern}" data-action="set-tape-pattern" data-pattern="${pattern}" aria-pressed="${state.tapePreset === pattern}"><span></span>${choiceLabel(pattern)}</button>`).join("")}</div>
        <div class="sj-tape-colors">${["#d6b887", "#c8b8a6", "#a9b69e", "#aeb9c9", "#d9a6a0"].map((color) => `<button data-action="add-tape" data-color="${color}" style="--swatch:${color}" aria-label="Add tape in ${color}"></button>`).join("")}</div></aside>`;
    }
    if (state.panel === "paper") {
      const page = getPage();
      if (isCoverPage(page)) {
        const colors = ["#4b4036", "#2d2b28", "#65483c", "#59604e", "#57545f", "#7b6652", "#3e4a4b", "#8a7866"];
        return `<aside class="sj-dock-popover sj-cover-color-panel"><header><div><h2>${page.side === "back" ? "Back cover" : "Front cover"}</h2><p>Change the cover color</p></div>${close}</header>
          <div class="sj-cover-color-options">${colors.map((color) => `<button data-action="apply-cover-color" data-color="${color}" style="--cover-swatch:${color}" aria-label="Use cover color ${color}"></button>`).join("")}</div>
          <label class="sj-cover-custom-color">Custom color <input type="color" value="${page.color}" data-action="cover-color"></label>
        </aside>`;
      }
      return `<aside class="sj-dock-popover sj-paper-panel"><header><div><h2>Paper</h2><p>Change this page template</p></div>${close}</header>
        <div class="sj-paper-options">${Data.PAPER_TYPES.map(paperPreviewButton).join("")}</div></aside>`;
    }
    if (state.panel === "add-page") {
      return `<aside class="sj-dock-popover sj-add-page-panel"><header><div><h2>Add page</h2><p>Choose where and what it starts with</p></div>${close}</header>
        <div class="sj-segmented">${["before", "after", "last"].map((position) => `<button class="${state.pageInsertPosition === position ? "is-active" : ""}" data-action="set-add-position" data-position="${position}">${choiceLabel(position)}</button>`).join("")}</div>
        <div class="sj-paper-options">${Data.PAPER_TYPES.map((paper) => `<button class="sj-paper-choice" data-action="confirm-add-page" data-paper="${paper}"><span class="sj-paper-preview sj-paper-${paper}"></span><span>${paperLabel(paper)}</span></button>`).join("")}</div></aside>`;
    }
    if (state.panel === "image-shape") {
      const element = getElement();
      const shapes = [
        ["original", "Original"], ["rectangle", "Rectangle"], ["landscape", "Landscape"], ["portrait", "Portrait"],
        ["square", "Square"], ["circle", "Circle"], ["arch-tall", "Tall arch"], ["arch-short", "Short arch"]
      ];
      return `<aside class="sj-dock-popover"><header><div><h2>Image shape</h2><p>Choose a crop shape</p></div>${close}</header>
        <div class="sj-image-style-grid">${shapes.map(([value, label]) => `<button class="${element?.cropShape === value ? "is-active" : ""}" data-action="apply-image-shape" data-value="${value}">
          <span class="image-crop-option-icon" data-shape="${value}"></span><span>${label}</span>
        </button>`).join("")}</div></aside>`;
    }
    if (state.panel === "image-frame") {
      const element = getElement();
      const frames = [["none", "None"], ["hairline", "Hairline"], ["dashed", "Dashed"], ["double", "Double"], ["mat", "Mat"]];
      return `<aside class="sj-dock-popover"><header><div><h2>Image frame</h2><p>Choose a border treatment</p></div>${close}</header>
        <div class="sj-image-style-grid">${frames.map(([value, label]) => `<button class="${element?.frameStyle === value ? "is-active" : ""}" data-action="apply-image-frame" data-value="${value}"><span class="sj-frame-sample is-${value}"></span><span>${label}</span></button>`).join("")}</div></aside>`;
    }
    if (state.panel === "text-color") {
      const element = getElement();
      const colors = ["#352d26", "#7f2935", "#83562e", "#3f6248", "#355b78", "#6a4f7d", "#111111", "#f5ecdf"];
      return `<aside class="sj-dock-popover"><header><div><h2>Text color</h2><p>Choose a color</p></div>${close}</header>
        <div class="sj-cover-color-options">${colors.map((color) => `<button class="${element?.color === color ? "is-active" : ""}" data-action="apply-text-color" data-value="${color}" style="--cover-swatch:${color}" aria-label="${color}"></button>`).join("")}</div></aside>`;
    }
    if (state.panel === "page-menu") {
      const page = getPage();
      if (isCoverPage(page)) {
        return `<aside class="sj-dock-popover sj-page-menu"><header><div><h2>${page.side === "back" ? "Back cover" : "Front cover"}</h2><p>${page.elements.length} ${page.elements.length === 1 ? "item" : "items"}</p></div>${close}</header>
          <button data-action="open-paper-panel">Change cover color</button>
          <button data-action="overview">Open page overview</button>
          <hr><button class="is-danger" data-action="clear-page">Clear cover</button>
        </aside>`;
      }
      return `<aside class="sj-dock-popover sj-page-menu"><header><div><h2>Page ${getPageIndex() + 1}</h2><p>${page.elements.length} ${page.elements.length === 1 ? "item" : "items"}</p></div>${close}</header>
        <button data-action="duplicate-current-page">Duplicate page</button>
        <button data-action="open-paper-panel">Change paper</button>
        <button data-action="overview">Open page overview</button>
        <hr><button class="is-danger" data-action="clear-page">Clear page</button>
        <button class="is-danger" data-action="delete-current-page" ${state.journal.pages.length === 1 ? "disabled" : ""}>Delete page</button>
      </aside>`;
    }
    return "";
  }

  function syncJournalDockState(editing = state.mode === "edit") {
    document.body.classList.toggle("journal-editing", editing);
    document.body.classList.toggle("editing", editing);
    document.body.classList.remove(
      "block-selected",
      "block-type-text",
      "block-type-list",
      "block-type-image",
      "block-type-container",
      "block-type-table",
      "block-type-button",
      "journal-element-text",
      "journal-element-image",
      "journal-element-shape",
      "journal-element-sticker",
      "journal-element-tape"
    );
    if (!editing) return;
    const element = getElement();
    if (element) {
      document.body.classList.add("block-selected");
      document.body.classList.add(element.type === "image" ? "block-type-image" : "block-type-text");
      document.body.classList.add(`journal-element-${element.type}`);
    }
    window.refreshCanvasDockToolState?.();
  }

  function placementGhostMarkup() {
    if (!state.placementTool) return "";
    const point = state.placementPoint;
    const label = state.placementTool === "text" ? "Text" : "Choose image";
    return `<div class="sj-placement-ghost is-${state.placementTool}" data-placement-ghost
      style="left:${point.x / 10}%;top:${point.y / 14}%">${label}</div>`;
  }

  function renderEditor() {
    const root = shellRoot();
    const page = getPage();
    if (!root || !page) return;
    state.mode = "edit";
    const index = getPageIndex(page.id);
    const selected = getElement();
    const coverPage = isCoverPage(page);
    const surfaceClass = coverPage ? "sj-cover-canvas" : `sj-paper-${page.paper}`;
    const surfaceStyle = coverPage ? ` style="--journal-cover:${page.color}"` : "";
    syncJournalDockState(true);
    root.innerHTML = `<div class="sj-shell sj-editor" data-mode="edit">
      ${editorPanel()}
      <main class="sj-editor-stage" data-drop-zone>
        <div class="sj-flat-page ${surfaceClass}" data-editor-page data-page-id="${escapeMarkup(page.id)}"${surfaceStyle}>
          <div class="sj-paper-grain" aria-hidden="true"></div>
          ${page.elements.map((element) => renderElement(element, true)).join("")}
          ${placementGhostMarkup()}
          ${page.elements.length ? "" : `<div class="sj-empty-page"><span>${coverPage ? "Design your cover." : "Make this page yours."}</span><small>Add text, photos, shapes, or tape.</small></div>`}
          ${coverPage ? "" : `<span class="sj-page-number">${index + 1}</span>`}
        </div>
      </main>
      <input id="sj-photo-input" type="file" accept="image/*" multiple hidden>
    </div>`;

    if (selected?.type === "text" && state.textCheckpointId === `focus-${selected.id}`) {
      const editable = root.querySelector(`[data-element-id="${CSS.escape(selected.id)}"] [data-role="text-editor"]`);
      editable?.focus();
      document.getSelection()?.selectAllChildren(editable);
      state.textCheckpointId = "";
    }
  }

  function overviewThumbnail(page, index) {
    return `<article class="sj-overview-card${page.id === state.editPageId ? " is-current" : ""}" data-page-id="${escapeMarkup(page.id)}">
      <button class="sj-overview-preview sj-paper-${page.paper}" data-action="edit-overview-page" aria-label="Edit page ${index + 1}">
        <div class="sj-mini-elements">${page.elements.slice(0, 12).map((element) => renderElement(element, false)).join("")}</div>
        <span>${index + 1}</span>
      </button>
      <div class="sj-overview-actions">
        <button data-action="move-page-left" ${index === 0 ? "disabled" : ""} aria-label="Move page ${index + 1} earlier">←</button>
        <button data-action="duplicate-page" aria-label="Duplicate page ${index + 1}">⧉</button>
        <button data-action="delete-page" ${state.journal.pages.length === 1 ? "disabled" : ""} aria-label="Delete page ${index + 1}">×</button>
        <button data-action="move-page-right" ${index === state.journal.pages.length - 1 ? "disabled" : ""} aria-label="Move page ${index + 1} later">→</button>
      </div>
    </article>`;
  }

  function renderOverview() {
    const root = shellRoot();
    if (!root || !state.journal) return;
    state.mode = "overview";
    syncJournalDockState(false);
    root.innerHTML = `<div class="sj-shell sj-overview" data-mode="overview">
      <header class="sj-editor-header">
        <button class="sj-round-btn" data-action="close-overview" aria-label="Close page overview">‹</button>
        <div class="sj-title-wrap">
          <h1>All pages</h1>
          <p>Open, duplicate, delete, or change the order</p>
        </div>
        <button class="sj-round-btn" data-action="add-page" aria-label="Add page">＋</button>
      </header>
      <main class="sj-overview-grid">
        ${state.journal.pages.map(overviewThumbnail).join("")}
        <button class="sj-overview-add" data-action="add-page"><span>＋</span>Add a page</button>
      </main>
    </div>`;
  }

  function renderCurrent() {
    if (state.mode === "edit") renderEditor();
    else if (state.mode === "overview") renderOverview();
    else renderSkim();
  }

  function openEditor(pageId) {
    const page = getPage(pageId);
    if (!page) return;
    window.closeSidebar?.();
    window.clearCanvasSelection?.();
    if (isCoverPage(page)) state.bookState = page.side;
    else state.bookState = "open";
    state.editPageId = pageId;
    state.selectedElementId = "";
    state.activeTool = "select";
    state.panel = "";
    state.placementTool = "";
    state.mode = "edit";
    renderEditor();
  }

  function finishLeafTurn(leaf, direction) {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const targetAngle = direction > 0 ? -180 : 0;
    const offset = Number(leaf.dataset.offset) || 0;
    leaf.classList.add("is-animating");
    leaf.style.transform = `translateX(${offset}px) rotateY(${targetAngle}deg)`;
    const done = () => {
      state.turned = clampTurned(state.turned + direction);
      state.gesture = null;
      renderSkim();
    };
    setTimeout(done, reduceMotion ? 20 : 520);
  }

  function navigate(direction) {
    if (state.gesture || state.mode !== "skim") return;
    if (state.bookState === "front") {
      if (direction > 0) revealPagesFromCover(false);
      return;
    }
    if (state.bookState === "back") {
      if (direction < 0) revealPagesFromCover(true);
      return;
    }
    if (direction < 0 && state.turned === 1) {
      state.bookState = "front";
      renderSkim();
      return;
    }
    if (direction > 0 && state.turned === maxTurned()) {
      state.bookState = "back";
      renderSkim();
      return;
    }
    const next = clampTurned(state.turned + direction);
    if (next === state.turned) return;
    const leaf = document.querySelector(direction > 0 ? ".sj-leaf.can-forward" : ".sj-leaf.can-back");
    if (!leaf) {
      state.turned = next;
      renderSkim();
      return;
    }
    state.gesture = { type: "button-turn" };
    finishLeafTurn(leaf, direction);
  }

  function addPage(afterId = state.editPageId || state.journal.pages.at(-1)?.id) {
    checkpoint();
    const result = Data.addPage(state.journal, afterId, { paper: getPage(afterId)?.paper || "warm" });
    state.journal = result.journal;
    state.editPageId = result.page.id;
    saveImmediately();
    if (state.mode === "skim") {
      state.bookState = "open";
      state.turned = turnedForPage(state.journal.pages.length - 1);
      renderSkim();
    } else {
      state.mode = "edit";
      renderEditor();
    }
  }

  function addPageAt(position = "after", paper = getPage()?.paper || "warm") {
    const currentIndex = Math.max(0, getPageIndex());
    checkpoint();
    const result = Data.addPage(state.journal, state.journal.pages.at(-1)?.id, { paper });
    const targetIndex = position === "before" ? currentIndex : currentIndex + 1;
    state.journal = position === "last"
      ? result.journal
      : Data.movePage(result.journal, result.page.id, targetIndex);
    state.editPageId = result.page.id;
    state.selectedElementId = "";
    state.panel = "";
    state.activeTool = "select";
    saveImmediately();
    renderEditor();
  }

  function legacyAddText() {
    const page = getPage();
    if (!page) return;
    checkpoint();
    const highest = page.elements.reduce((max, item) => Math.max(max, item.z), 0);
    const element = Data.normalizeElement({
      id: Data.createId("journal-text"),
      type: "text",
      text: "Write something…",
      x: 160,
      y: 220,
      w: 680,
      h: 180,
      z: highest + 1
    });
    page.elements.push(element);
    page.updatedAt = Date.now();
    state.journal.updatedAt = Date.now();
    state.selectedElementId = element.id;
    state.textCheckpointId = `focus-${element.id}`;
    scheduleSave();
    renderEditor();
  }

  function insertElement(details) {
    const page = getPage();
    if (!page) return null;
    checkpoint();
    const highest = page.elements.reduce((max, item) => Math.max(max, item.z), 0);
    const element = Data.normalizeElement({
      id: Data.createId(`journal-${details.type || "element"}`),
      z: highest + 1,
      ...details
    });
    page.elements.push(element);
    page.updatedAt = Date.now();
    state.journal.updatedAt = Date.now();
    state.selectedElementId = element.id;
    scheduleSave();
    return element;
  }

  function addText(x = 160, y = 220) {
    const element = insertElement({
      type: "text",
      text: "Write something…",
      x,
      y,
      w: 680,
      h: 120,
      fontSize: Data.DEFAULT_TEXT_SIZE
    });
    if (!element) return;
    state.activeTool = "select";
    state.panel = "";
    state.textCheckpointId = `focus-${element.id}`;
    renderEditor();
  }

  function addShape(shape = state.shapePreset) {
    const element = insertElement({
      type: "shape",
      shape,
      fill: "#d9cdb8",
      stroke: "#655b50",
      strokeWidth: 3,
      x: 260,
      y: 360,
      w: shape === "line" ? 500 : 360,
      h: shape === "line" ? 80 : 300
    });
    if (!element) return;
    state.shapePreset = shape;
    state.activeTool = "select";
    state.panel = "";
    renderEditor();
  }

  function addSticker(variant = "note") {
    const sizes = variant === "label"
      ? { w: 430, h: 150 }
      : variant === "note"
        ? { w: 360, h: 320 }
        : { w: 220, h: 220 };
    const element = insertElement({
      type: "sticker",
      variant,
      label: variant === "note" ? "A little note" : variant === "label" ? "Label" : "",
      color: "#d8c49d",
      x: 160,
      y: 260,
      ...sizes
    });
    if (!element) return;
    state.activeTool = "select";
    state.panel = "";
    renderEditor();
  }

  function addTape(color = "#d6b887") {
    const element = insertElement({
      type: "tape",
      pattern: state.tapePreset,
      color,
      opacity: 0.82,
      x: 280,
      y: 260,
      w: 360,
      h: 76,
      rotation: -3
    });
    if (!element) return;
    state.activeTool = "select";
    state.panel = "";
    renderEditor();
  }

  function removeElement() {
    const page = getPage();
    if (!page || !state.selectedElementId) return;
    checkpoint();
    page.elements = page.elements.filter((element) => element.id !== state.selectedElementId);
    state.selectedElementId = "";
    page.updatedAt = Date.now();
    scheduleSave();
    renderEditor();
  }

  function duplicateElement() {
    const page = getPage();
    const element = getElement();
    if (!page || !element) return;
    checkpoint();
    const highest = page.elements.reduce((max, item) => Math.max(max, item.z), 0);
    const copy = Data.normalizeElement({
      ...element,
      id: Data.createId(`journal-${element.type}`),
      x: element.x + 36,
      y: element.y + 36,
      z: highest + 1
    });
    page.elements.push(copy);
    state.selectedElementId = copy.id;
    scheduleSave();
    renderEditor();
  }

  function layerElement(direction) {
    const page = getPage();
    const element = getElement();
    if (!page || !element) return;
    checkpoint();
    const values = page.elements.map((item) => item.z);
    element.z = direction > 0 ? Math.max(...values, 0) + 1 : Math.max(0, Math.min(...values, 1) - 1);
    scheduleSave();
    renderEditor();
  }

  function moveSelectedLayer(action) {
    const page = getPage();
    const element = getElement();
    if (!page || !element) return;
    checkpoint();
    const ordered = [...page.elements].sort((a, b) => a.z - b.z);
    const currentIndex = ordered.findIndex((item) => item.id === element.id);
    if (currentIndex < 0) return;
    ordered.splice(currentIndex, 1);
    let nextIndex = currentIndex;
    if (action === "front") nextIndex = ordered.length;
    else if (action === "back") nextIndex = 0;
    else if (action === "forward") nextIndex = Math.min(ordered.length, currentIndex + 1);
    else if (action === "backward") nextIndex = Math.max(0, currentIndex - 1);
    ordered.splice(nextIndex, 0, element);
    ordered.forEach((item, index) => { item.z = index + 1; });
    page.elements = ordered;
    page.updatedAt = Date.now();
    state.journal.updatedAt = Date.now();
    saveImmediately();
    renderEditor();
  }

  function copySelectedElement() {
    const element = getElement();
    if (!element) return false;
    state.copiedElement = JSON.parse(JSON.stringify(element));
    refreshJournalDock();
    window.showAppToast?.("Item copied.", "info");
    return true;
  }

  function pasteSelectedElement() {
    const page = getPage();
    if (!page || !state.copiedElement) return null;
    checkpoint();
    const copy = Data.normalizeElement({
      ...state.copiedElement,
      id: Data.createId("journal-element"),
      x: Math.min(960, state.copiedElement.x + 28),
      y: Math.min(1360, state.copiedElement.y + 28),
      z: Math.max(0, ...page.elements.map((item) => item.z)) + 1
    });
    page.elements.push(copy);
    state.selectedElementId = copy.id;
    state.copiedElement = JSON.parse(JSON.stringify(copy));
    saveImmediately();
    renderEditor();
    return copy;
  }

  function startJournalPlacement(preset = "text") {
    const tool = preset === "image" ? "image" : preset === "text" ? "text" : "";
    if (!tool || state.mode !== "edit") return;
    state.placementTool = state.placementTool === tool ? "" : tool;
    state.selectedElementId = "";
    state.panel = "";
    state.placementPoint = tool === "image" ? { x: 230, y: 350 } : { x: 160, y: 220 };
    renderEditor();
  }

  function refreshJournalDock() {
    const element = getElement();
    const page = getPage();
    const ordered = [...(page?.elements || [])].sort((a, b) => a.z - b.z);
    const layerIndex = element ? ordered.findIndex((item) => item.id === element.id) : -1;
    const setDisabled = (id, disabled) => {
      const button = document.getElementById(id);
      if (button) button.disabled = disabled;
    };
    setDisabled("addUndoBtn", !state.history.length);
    setDisabled("addRedoBtn", !state.future.length);
    setDisabled("blockCopyBtn", !element);
    setDisabled("blockPasteBtn", !state.copiedElement);
    setDisabled("layerSendBackBtn", layerIndex <= 0);
    setDisabled("layerBackwardBtn", layerIndex <= 0);
    setDisabled("layerForwardBtn", layerIndex < 0 || layerIndex >= ordered.length - 1);
    setDisabled("layerBringFrontBtn", layerIndex < 0 || layerIndex >= ordered.length - 1);
    setDisabled("layerIntoFrameBtn", true);
    document.getElementById("toolText")?.classList.toggle("active", state.placementTool === "text");
    document.getElementById("toolImage")?.classList.toggle("active", state.placementTool === "image");
    document.getElementById("imageCropBtn")?.classList.toggle("active", !!element && element.type === "image" && element.cropShape !== "original");
    document.getElementById("imageFrameBtn")?.classList.toggle("active", !!element && element.type === "image" && element.frameStyle !== "none");
    const tint = (id, color = "") => {
      const button = document.getElementById(id);
      if (!button) return;
      button.classList.toggle("has-tool-color", !!color);
      if (color) button.style.setProperty("--tool-color", color);
      else button.style.removeProperty("--tool-color");
    };
    tint("journalBgBtn", element?.type === "text" ? element.background : "");
    tint("journalTextColorBtn", element?.type === "text" ? element.color : "");
    tint("journalBorderBtn", element?.type === "text" ? element.borderColor : "");
    tint("journalShapeFillBtn", element?.type === "shape" ? element.fill : "");
    tint("journalShapeBorderBtn", element?.type === "shape" ? element.stroke : "");
    tint("journalStickerColorBtn", element?.type === "sticker" ? element.color : "");
    tint("journalTapeColorBtn", element?.type === "tape" ? element.color : "");
    document.querySelector('.dock-mode-journal-selected [data-action="toggle-bold"]')?.classList.toggle("active", !!element?.bold);
    document.querySelector('.dock-mode-journal-selected [data-action="toggle-italic"]')?.classList.toggle("active", !!element?.italic);
    document.querySelector('.dock-mode-journal-selected [data-action="toggle-padding"]')?.classList.toggle("active", !!element?.padding);
    document.querySelector('.dock-mode-journal-selected [data-action="toggle-radius"]')?.classList.toggle("active", !!element?.radius);
  }

  function selectedColor(mode) {
    const element = getElement();
    if (!element) return "";
    if (element.type === "text") {
      if (mode === "bg") return element.background || "";
      if (mode === "border") return element.borderColor || "";
      return element.color || "";
    }
    if (element.type === "shape") return mode === "border" ? element.stroke : element.fill;
    if (element.type === "sticker" || element.type === "tape") return element.color || "";
    return "";
  }

  function applySelectedJournalColor(mode, color) {
    const element = getElement();
    if (!element) return;
    const next = /^#[0-9a-f]{6}$/i.test(color || "") ? color : "";
    let patch = null;
    if (element.type === "text") {
      if (mode === "bg") patch = { background: next };
      else if (mode === "border") patch = { borderColor: next, borderWidth: next ? Math.max(1, element.borderWidth || 0) : 0 };
      else patch = { color: next || "#352d26" };
    } else if (element.type === "shape") {
      patch = mode === "border" ? { stroke: next || "#5b4b3d" } : { fill: next || "#f1dfbd" };
    } else if (element.type === "sticker" || element.type === "tape") {
      patch = { color: next || (element.type === "tape" ? "#d6b58d" : "#e3c99e") };
    }
    if (!patch) return;
    checkpoint();
    changeSelected(patch);
    renderEditor();
  }

  function changeSelected(patch) {
    const element = getElement();
    if (!element) return;
    Object.assign(element, patch);
    getPage().updatedAt = Date.now();
    state.journal.updatedAt = Date.now();
    scheduleSave();
  }

  function updateCurrentSurface(patch) {
    const page = getPage();
    if (!page) return;
    if (isCoverPage(page)) {
      Object.assign(page, patch);
      page.updatedAt = Date.now();
      state.journal.updatedAt = Date.now();
    } else {
      state.journal = Data.updatePage(state.journal, page.id, patch);
    }
  }

  async function imageToDataUrl(file) {
    if (!file?.type?.startsWith("image/")) throw new Error("Please choose an image file.");
    const source = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("The photo could not be read."));
      reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () => reject(new Error("The photo could not be opened."));
      next.src = source;
    });
    const maxSide = 2000;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
    return {
      src: canvas.toDataURL(mime, 0.86),
      width: canvas.width,
      height: canvas.height,
      alt: file.name?.replace(/\.[^.]+$/, "") || "Journal photo"
    };
  }

  async function addPhotos(files) {
    const page = getPage();
    const images = Array.from(files || []).filter((file) => file.type?.startsWith("image/")).slice(0, 12);
    if (!page || !images.length) return;
    checkpoint();
    const replacement = state.replaceImageId ? getElement(state.replaceImageId) : null;
    const origin = state.pendingImagePoint || { x: 150, y: 210 };
    let offset = 0;
    for (const file of images) {
      try {
        const image = await imageToDataUrl(file);
        if (replacement && offset === 0) {
          replacement.src = image.src;
          replacement.alt = image.alt;
          state.selectedElementId = replacement.id;
          offset += 28;
          continue;
        }
        const w = Math.min(620, Math.max(240, image.width / 2));
        const h = Math.min(760, Math.max(180, w * (image.height / image.width)));
        const highest = page.elements.reduce((max, item) => Math.max(max, item.z), 0);
        const element = Data.normalizeElement({
          id: Data.createId("journal-image"),
          type: "image",
          src: image.src,
          alt: image.alt,
          x: origin.x + offset,
          y: origin.y + offset,
          w,
          h,
          z: highest + 1,
          fit: "cover"
        });
        page.elements.push(element);
        state.selectedElementId = element.id;
        offset += 28;
      } catch (error) {
        console.warn("Journal photo import failed", error);
      }
    }
    page.updatedAt = Date.now();
    state.journal.updatedAt = Date.now();
    state.activeTool = "select";
    state.panel = "";
    state.pendingImagePoint = null;
    state.replaceImageId = "";
    saveImmediately();
    renderEditor();
  }

  function pageFromActionTarget(target) {
    return target.closest("[data-page-id]")?.dataset.pageId || "";
  }

  function handleTool(tool) {
    if (!tool) return;
    state.activeTool = tool;
    state.selectedElementId = "";
    if (tool === "photo") {
      state.panel = "";
      renderEditor();
      document.getElementById("sj-photo-input")?.click();
      return;
    }
    state.panel = ({ sticker: "elements", shape: "shapes", tape: "tape" })[tool] || "";
    renderEditor();
  }

  function handleAction(action, target) {
    if (!action) return;
    if (action === "back") {
      window.openPage?.(record().parent || "home");
    } else if (action === "skim") {
      const currentPage = getPage();
      const index = Math.max(0, getPageIndex());
      state.turned = turnedForPage(index);
      state.selectedElementId = "";
      state.activeTool = "select";
      state.panel = "";
      state.bookState = isCoverPage(currentPage) ? currentPage.side : "open";
      state.mode = "skim";
      renderSkim();
    } else if (action === "previous") {
      navigate(-1);
    } else if (action === "next") {
      navigate(1);
    } else if (action === "open-cover") {
      revealPagesFromCover(false);
    } else if (action === "back-cover-pages") {
      revealPagesFromCover(true);
    } else if (action === "edit-cover") {
      openEditor(state.journal.cover.id);
    } else if (action === "edit-back-cover") {
      openEditor(state.journal.backCover.id);
    } else if (action === "overview") {
      state.modeBeforeOverview = state.mode;
      state.panel = "";
      renderOverview();
    } else if (action === "close-overview") {
      state.mode = state.modeBeforeOverview === "edit" ? "edit" : "skim";
      renderCurrent();
    } else if (action === "add-page") {
      addPage();
    } else if (action === "add-text") {
      addText();
    } else if (action === "add-photo") {
      document.getElementById("sj-photo-input")?.click();
    } else if (action === "undo") {
      restoreSnapshot(state.history, state.future);
    } else if (action === "redo") {
      restoreSnapshot(state.future, state.history);
    } else if (action === "delete-element") {
      removeElement();
    } else if (action === "duplicate-element") {
      duplicateElement();
    } else if (action === "layer-front") {
      layerElement(1);
    } else if (action === "layer-back") {
      layerElement(-1);
    } else if (action === "toggle-fit") {
      const element = getElement();
      if (!element) return;
      checkpoint();
      changeSelected({ fit: element.fit === "contain" ? "cover" : "contain" });
      renderEditor();
    } else if (action === "align") {
      const element = getElement();
      if (!element) return;
      checkpoint();
      const order = ["left", "center", "right"];
      changeSelected({ align: order[(order.indexOf(element.align) + 1) % order.length] });
      renderEditor();
    } else if (action === "cycle-font") {
      const element = getElement();
      if (!element || element.type !== "text") return;
      checkpoint();
      const fonts = ["serif", "sans", "hand"];
      changeSelected({ font: fonts[(fonts.indexOf(element.font) + 1) % fonts.length] });
      renderEditor();
    } else if (action === "font-size-down" || action === "font-size-up") {
      const element = getElement();
      if (!element || element.type !== "text") return;
      checkpoint();
      const delta = action === "font-size-up" ? 2 : -2;
      changeSelected({ fontSize: Math.min(Data.MAX_TEXT_SIZE, Math.max(Data.MIN_TEXT_SIZE, element.fontSize + delta)) });
      renderEditor();
    } else if (action === "toggle-padding") {
      const element = getElement();
      if (!element || element.type !== "text") return;
      checkpoint();
      changeSelected({ padding: element.padding ? 0 : 12 });
      renderEditor();
    } else if (action === "toggle-radius") {
      const element = getElement();
      if (!element || element.type !== "text") return;
      checkpoint();
      changeSelected({ radius: element.radius ? 0 : 12 });
      renderEditor();
    } else if (action === "toggle-bold" || action === "toggle-italic") {
      const element = getElement();
      if (!element) return;
      checkpoint();
      changeSelected(action === "toggle-bold" ? { bold: !element.bold } : { italic: !element.italic });
      renderEditor();
    } else if (action === "replace-photo") {
      const element = getElement();
      if (!element || element.type !== "image") return;
      state.replaceImageId = element.id;
      state.pendingImagePoint = null;
      document.getElementById("sj-photo-input")?.click();
    } else if (action === "open-image-shape") {
      const element = getElement();
      if (!element || element.type !== "image") return;
      state.panel = state.panel === "image-shape" ? "" : "image-shape";
      renderEditor();
    } else if (action === "open-image-frame") {
      const element = getElement();
      if (!element || element.type !== "image") return;
      state.panel = state.panel === "image-frame" ? "" : "image-frame";
      renderEditor();
    } else if (action === "cycle-tape-pattern") {
      const element = getElement();
      if (!element) return;
      checkpoint();
      const patterns = ["solid", "stripe", "grid", "dots"];
      changeSelected({ pattern: patterns[(patterns.indexOf(element.pattern) + 1) % patterns.length] });
      renderEditor();
    } else if (action === "close-panel") {
      state.panel = "";
      renderEditor();
    } else if (action === "paper-panel" || action === "open-paper-panel") {
      state.panel = "paper";
      renderEditor();
    } else if (action === "add-page-panel") {
      state.panel = "add-page";
      renderEditor();
    } else if (action === "page-menu") {
      state.panel = state.panel === "page-menu" ? "" : "page-menu";
      renderEditor();
    } else if (action === "add-sticker") {
      addSticker(target.dataset.variant);
    } else if (action === "add-shape") {
      addShape(target.dataset.shape);
    } else if (action === "set-tape-pattern") {
      state.tapePreset = target.dataset.pattern || "solid";
      renderEditor();
    } else if (action === "add-tape") {
      addTape(target.dataset.color);
    } else if (action === "apply-paper") {
      checkpoint();
      updateCurrentSurface({ paper: target.dataset.paper });
      state.panel = "";
      scheduleSave();
      renderEditor();
    } else if (action === "apply-cover-color") {
      checkpoint();
      updateCurrentSurface({ color: target.dataset.color });
      state.panel = "";
      scheduleSave();
      renderEditor();
    } else if (action === "apply-image-shape") {
      const element = getElement();
      if (!element || element.type !== "image") return;
      checkpoint();
      const cropShape = target.dataset.value || "original";
      const ratios = { landscape: 1.6, portrait: 0.75, square: 1, circle: 1, "arch-tall": 0.75, "arch-short": 1.33 };
      const ratio = ratios[cropShape];
      const patch = { cropShape };
      if (ratio) {
        const centerX = element.x + element.w / 2;
        const centerY = element.y + element.h / 2;
        const w = Math.min(620, Math.max(180, element.w));
        const h = Math.min(760, w / ratio);
        Object.assign(patch, {
          w,
          h,
          x: Math.max(0, Math.min(1000 - w, centerX - w / 2)),
          y: Math.max(0, Math.min(1400 - h, centerY - h / 2))
        });
      }
      changeSelected(patch);
      state.panel = "";
      renderEditor();
    } else if (action === "apply-image-frame") {
      const element = getElement();
      if (!element || element.type !== "image") return;
      checkpoint();
      changeSelected({ frameStyle: target.dataset.value || "none" });
      state.panel = "";
      renderEditor();
    } else if (action === "apply-text-color") {
      const element = getElement();
      if (!element || element.type !== "text") return;
      checkpoint();
      changeSelected({ color: target.dataset.value || "#352d26" });
      state.panel = "";
      renderEditor();
    } else if (action === "set-add-position") {
      state.pageInsertPosition = target.dataset.position || "after";
      renderEditor();
    } else if (action === "confirm-add-page") {
      addPageAt(state.pageInsertPosition, target.dataset.paper || "warm");
    } else if (action === "duplicate-current-page") {
      checkpoint();
      const result = Data.duplicatePage(state.journal, state.editPageId);
      state.journal = result.journal;
      if (result.page) state.editPageId = result.page.id;
      state.panel = "";
      saveImmediately();
      renderEditor();
    } else if (action === "clear-page") {
      const page = getPage();
      if (!page?.elements.length || !window.confirm(`Clear every item from this ${isCoverPage(page) ? "cover" : "page"}? You can undo this during this session.`)) return;
      checkpoint();
      updateCurrentSurface({ elements: [] });
      state.selectedElementId = "";
      state.panel = "";
      saveImmediately();
      renderEditor();
    } else if (action === "delete-current-page") {
      const index = getPageIndex();
      if (state.journal.pages.length <= 1 || !window.confirm(`Delete page ${index + 1}? You can undo this during this session.`)) return;
      checkpoint();
      const result = Data.deletePage(state.journal, state.editPageId);
      state.journal = result.journal;
      state.editPageId = state.journal.pages[Math.min(index, state.journal.pages.length - 1)]?.id || "";
      state.selectedElementId = "";
      state.panel = "";
      saveImmediately();
      renderEditor();
    } else if (action === "edit-overview-page") {
      openEditor(pageFromActionTarget(target));
    } else if (action === "duplicate-page") {
      const pageId = pageFromActionTarget(target);
      checkpoint();
      const result = Data.duplicatePage(state.journal, pageId);
      state.journal = result.journal;
      if (result.page) state.editPageId = result.page.id;
      saveImmediately();
      renderOverview();
    } else if (action === "delete-page") {
      const pageId = pageFromActionTarget(target);
      const index = state.journal.pages.findIndex((page) => page.id === pageId);
      if (index < 0 || !window.confirm(`Delete page ${index + 1}? This can be undone until you leave the journal.`)) return;
      checkpoint();
      const result = Data.deletePage(state.journal, pageId);
      state.journal = result.journal;
      if (state.editPageId === pageId) {
        state.editPageId = state.journal.pages[Math.min(index, state.journal.pages.length - 1)]?.id || "";
      }
      saveImmediately();
      renderOverview();
    } else if (action === "move-page-left" || action === "move-page-right") {
      const pageId = pageFromActionTarget(target);
      const index = state.journal.pages.findIndex((page) => page.id === pageId);
      checkpoint();
      state.journal = Data.movePage(state.journal, pageId, index + (action === "move-page-left" ? -1 : 1));
      saveImmediately();
      renderOverview();
    }
  }

  function onClick(event) {
    if (!state.activeId) return;
    if (state.mode === "skim") {
      const page = event.target.closest(".sj-page-hit-target[data-page-id], .sj-book-page[data-page-id]");
      if (page) {
        if (!state.suppressSkimClick) openEditor(page.dataset.pageId);
        return;
      }
    }
    const toolTarget = event.target.closest("[data-tool]");
    if (toolTarget) {
      handleTool(toolTarget.dataset.tool);
      return;
    }
    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget) {
      handleAction(actionTarget.dataset.action, actionTarget);
      return;
    }
    if (state.mode === "edit") {
      const object = event.target.closest("[data-element-id]");
      const editorPage = event.target.closest("[data-editor-page]");
      if (editorPage && state.placementTool) {
        const rect = editorPage.getBoundingClientRect();
        const x = Math.max(0, Math.min(920, (event.clientX - rect.left) / rect.width * 1000));
        const y = Math.max(0, Math.min(1320, (event.clientY - rect.top) / rect.height * 1400));
        const tool = state.placementTool;
        state.placementTool = "";
        if (tool === "text") {
          addText(Math.max(0, x - 180), Math.max(0, y - 55));
        } else {
          state.pendingImagePoint = { x: Math.max(0, x - 260), y: Math.max(0, y - 180) };
          document.getElementById("sj-photo-input")?.click();
        }
        return;
      }
      if (!object && editorPage && state.activeTool === "text") {
        const rect = editorPage.getBoundingClientRect();
        const x = Math.max(0, Math.min(320, (event.clientX - rect.left) / rect.width * 1000 - 80));
        const y = Math.max(0, Math.min(1250, (event.clientY - rect.top) / rect.height * 1400 - 40));
        addText(x, y);
        return;
      }
      if (object && state.selectedElementId !== object.dataset.elementId) {
        state.selectedElementId = object.dataset.elementId;
        state.activeTool = "select";
        state.panel = "";
        renderEditor();
      } else if (!object && editorPage) {
        state.selectedElementId = "";
        renderEditor();
      }
    }
  }

  function onChange(event) {
    if (!state.activeId) return;
    const action = event.target.dataset.action;
    if (event.target.id === "sj-photo-input") {
      addPhotos(event.target.files);
      return;
    }
    if (action === "paper") {
      checkpoint();
      updateCurrentSurface({ paper: event.target.value });
      scheduleSave();
      renderEditor();
    } else if (action === "cover-color") {
      checkpoint();
      updateCurrentSurface({ color: event.target.value });
      scheduleSave();
      renderEditor();
    } else if (action === "font") {
      checkpoint();
      changeSelected({ font: event.target.value });
      renderEditor();
    } else if (action === "font-size") {
      checkpoint();
      changeSelected({ fontSize: Number(event.target.value) });
      renderEditor();
    } else if (action === "text-color") {
      checkpoint();
      changeSelected({ color: event.target.value });
      renderEditor();
    } else if (action === "shape-fill" || action === "shape-stroke" || action === "shape-width") {
      checkpoint();
      const patch = action === "shape-fill"
        ? { fill: event.target.value }
        : action === "shape-stroke"
          ? { stroke: event.target.value }
          : { strokeWidth: Number(event.target.value) };
      changeSelected(patch);
      renderEditor();
    } else if (action === "sticker-color") {
      checkpoint();
      changeSelected({ color: event.target.value });
      renderEditor();
    } else if (action === "tape-color") {
      checkpoint();
      changeSelected({ color: event.target.value });
      renderEditor();
    }
  }

  function onInput(event) {
    if (!state.activeId || state.mode !== "edit") return;
    if (event.target.matches('[data-role="text-editor"]')) {
      const element = getElement(event.target.closest("[data-element-id]")?.dataset.elementId);
      if (!element) return;
      element.text = event.target.innerText.replace(/\n{3,}/g, "\n\n");
      getPage().updatedAt = Date.now();
      scheduleSave();
    }
  }

  function beginEditorGesture(event, kind, object) {
    const page = document.querySelector("[data-editor-page]");
    const element = getElement(object.dataset.elementId);
    if (!page || !element) return;
    const editingText = kind === "move" && event.target.closest?.('[contenteditable="true"]');
    if (!editingText) event.preventDefault();
    event.stopPropagation();
    if (state.selectedElementId !== element.id) {
      state.selectedElementId = element.id;
      document.querySelectorAll(".sj-object.is-selected").forEach((item) => item.classList.remove("is-selected"));
      object.classList.add("is-selected");
      syncJournalDockState(true);
    }
    checkpoint();
    const rect = page.getBoundingClientRect();
    const objectRect = object.getBoundingClientRect();
    state.gesture = {
      type: `editor-${kind}`,
      pointerId: event.pointerId,
      elementId: element.id,
      startX: event.clientX,
      startY: event.clientY,
      start: { x: element.x, y: element.y, w: element.w, h: element.h, rotation: element.rotation },
      rect,
      centerX: objectRect.left + objectRect.width / 2,
      centerY: objectRect.top + objectRect.height / 2,
      startAngle: Math.atan2(event.clientY - (objectRect.top + objectRect.height / 2), event.clientX - (objectRect.left + objectRect.width / 2)),
      object,
      moved: false
    };
    object.setPointerCapture?.(event.pointerId);
  }

  function beginSkimGesture(event, leaf, captureTarget = leaf) {
    if ((event.button !== undefined && event.button !== 0) || state.gesture) return;
    const direction = leaf.classList.contains("can-forward")
      ? 1
      : leaf.classList.contains("can-back")
        ? -1
        : 0;
    if (!direction) return;
    const face = event.target.closest(".sj-leaf-face");
    event.preventDefault();
    state.gesture = {
      type: "skim",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      direction,
      pageId: captureTarget.dataset.pageId || face?.dataset.pageId || "",
      leaf,
      offset: Number(leaf.dataset.offset) || 0,
      moved: false,
      progress: 0
    };
    captureTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerDown(event) {
    if (!state.activeId) return;
    if (state.mode === "edit" && state.placementTool) return;
    const editorObject = event.target.closest("[data-element-id]");
    if (state.mode === "edit" && editorObject) {
      if (event.target.closest("[data-resize-object]")) beginEditorGesture(event, "resize", editorObject);
      else if (event.target.closest("[data-rotate-object]")) beginEditorGesture(event, "rotate", editorObject);
      else if (event.target.closest("[data-drag-object]")) beginEditorGesture(event, "move", editorObject);
      return;
    }
    const hitTarget = event.target.closest(".sj-page-hit-target");
    const leaf = hitTarget
      ? document.querySelector(hitTarget.dataset.skimSide === "left" ? ".sj-leaf.can-back" : ".sj-leaf.can-forward")
      : event.target.closest(".sj-leaf.can-forward, .sj-leaf.can-back");
    if (state.mode === "skim" && leaf) beginSkimGesture(event, leaf, hitTarget || leaf);
  }

  function onPointerMove(event) {
    const gesture = state.gesture;
    if (!gesture && state.mode === "edit" && state.placementTool) {
      const editorPage = event.target.closest?.("[data-editor-page]");
      const ghost = document.querySelector("[data-placement-ghost]");
      if (!editorPage || !ghost) return;
      const rect = editorPage.getBoundingClientRect();
      state.placementPoint = {
        x: Math.max(0, Math.min(920, (event.clientX - rect.left) / rect.width * 1000)),
        y: Math.max(0, Math.min(1320, (event.clientY - rect.top) / rect.height * 1400))
      };
      ghost.style.left = `${state.placementPoint.x / 10}%`;
      ghost.style.top = `${state.placementPoint.y / 14}%`;
      return;
    }
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.type === "skim") {
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      if (Math.hypot(dx, dy) > 7) gesture.moved = true;
      if (!gesture.moved) return;
      event.preventDefault();
      const bookWidth = gesture.leaf.closest(".sj-book")?.getBoundingClientRect().width || 720;
      const width = Math.max(180, bookWidth / 2);
      const signed = gesture.direction > 0 ? -dx : dx;
      gesture.progress = Math.max(0, Math.min(1, signed / width));
      const angle = gesture.direction > 0
        ? -180 * gesture.progress
        : -180 + (180 * gesture.progress);
      gesture.leaf.classList.add("is-dragging");
      gesture.leaf.style.transform = `translateX(${gesture.offset}px) rotateY(${angle}deg)`;
      gesture.leaf.style.setProperty("--flip-shadow", String(Math.sin(gesture.progress * Math.PI) * 0.52));
      return;
    }

    const element = getElement(gesture.elementId);
    if (!element) return;
    event.preventDefault();
    const dx = (event.clientX - gesture.startX) / gesture.rect.width * 1000;
    const dy = (event.clientY - gesture.startY) / gesture.rect.height * 1400;
    if (Math.hypot(dx, dy) > 2) gesture.moved = true;
    if (gesture.type === "editor-move") {
      element.x = Math.max(0, Math.min(1000 - element.w, gesture.start.x + dx));
      element.y = Math.max(0, Math.min(1400 - element.h, gesture.start.y + dy));
    } else if (gesture.type === "editor-resize") {
      const nextW = Math.max(60, Math.min(1000 - element.x, gesture.start.w + dx));
      const nextH = Math.max(60, Math.min(1400 - element.y, gesture.start.h + dy));
      if (element.type === "image" && element.cropShape === "circle") {
        const size = Math.max(60, Math.min(1000 - element.x, 1400 - element.y, Math.max(nextW, nextH)));
        element.w = size;
        element.h = size;
      } else {
        element.w = nextW;
        element.h = nextH;
      }
    } else if (gesture.type === "editor-rotate") {
      const angle = Math.atan2(event.clientY - gesture.centerY, event.clientX - gesture.centerX);
      element.rotation = Math.round(gesture.start.rotation + (angle - gesture.startAngle) * 180 / Math.PI);
    }
    gesture.object.style.left = `${element.x / 10}%`;
    gesture.object.style.top = `${element.y / 14}%`;
    gesture.object.style.width = `${element.w / 10}%`;
    gesture.object.style.height = `${element.h / 14}%`;
    gesture.object.style.transform = `rotate(${element.rotation}deg)`;
  }

  function onPointerUp(event) {
    const gesture = state.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.type === "skim") {
      gesture.leaf.classList.remove("is-dragging");
      gesture.leaf.style.removeProperty("--flip-shadow");
      if (!gesture.moved) {
        state.gesture = null;
        if (gesture.pageId) openEditor(gesture.pageId);
      } else if (gesture.progress > 0.27) {
        state.suppressSkimClick = true;
        setTimeout(() => { state.suppressSkimClick = false; }, 80);
        finishLeafTurn(gesture.leaf, gesture.direction);
      } else {
        state.suppressSkimClick = true;
        setTimeout(() => { state.suppressSkimClick = false; }, 80);
        const startAngle = gesture.direction > 0 ? 0 : -180;
        gesture.leaf.classList.add("is-animating");
        gesture.leaf.style.transform = `translateX(${gesture.offset}px) rotateY(${startAngle}deg)`;
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        setTimeout(() => {
          state.gesture = null;
          renderSkim();
        }, reduceMotion ? 20 : 360);
      }
      return;
    }
    state.gesture = null;
    if (gesture.moved) {
      getPage().updatedAt = Date.now();
      state.journal.updatedAt = Date.now();
      saveImmediately();
    } else if (state.selectedElementId !== gesture.elementId) {
      state.selectedElementId = gesture.elementId;
    }
    renderEditor();
  }

  function onKeyDown(event) {
    if (!state.activeId) return;
    const editable = event.target.closest?.('[contenteditable="true"], input, select, textarea');
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      restoreSnapshot(event.shiftKey ? state.future : state.history, event.shiftKey ? state.history : state.future);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      restoreSnapshot(state.future, state.history);
      return;
    }
    if (editable) return;
    if (state.mode === "skim" && event.key === "ArrowLeft") {
      event.preventDefault();
      navigate(-1);
    } else if (state.mode === "skim" && event.key === "ArrowRight") {
      event.preventDefault();
      navigate(1);
    } else if (state.mode === "skim" && event.key === "Enter") {
      event.preventDefault();
      const rightIndex = (state.turned * 2) - 1;
      const leftIndex = (state.turned * 2) - 2;
      openEditor(state.journal.pages[rightIndex]?.id || state.journal.pages[leftIndex]?.id);
    } else if (state.mode === "edit" && (event.key === "Delete" || event.key === "Backspace") && state.selectedElementId) {
      event.preventDefault();
      removeElement();
    } else if (event.key === "Escape") {
      if (state.mode === "edit" && state.placementTool) {
        state.placementTool = "";
        renderEditor();
        return;
      }
      if (state.mode === "overview") {
        state.mode = state.modeBeforeOverview === "edit" ? "edit" : "skim";
        renderCurrent();
      } else if (state.mode === "edit" && state.selectedElementId) {
        state.selectedElementId = "";
        renderEditor();
      } else if (state.mode === "edit") {
        handleAction("skim");
      }
    }
  }

  function onFocusIn(event) {
    if (!state.activeId || !event.target.matches?.('[data-role="text-editor"]')) return;
    const id = event.target.closest("[data-element-id]")?.dataset.elementId;
    if (id && state.textCheckpointId !== id) {
      checkpoint();
      state.textCheckpointId = id;
    }
  }

  function onFocusOut(event) {
    if (event.target.matches?.('[data-role="text-editor"]')) state.textCheckpointId = "";
  }

  function onDrop(event) {
    if (!state.activeId || state.mode !== "edit" || !event.target.closest("[data-drop-zone]")) return;
    const images = Array.from(event.dataTransfer?.files || []).filter((file) => file.type.startsWith("image/"));
    if (!images.length) return;
    event.preventDefault();
    addPhotos(images);
  }

  function onDragOver(event) {
    if (state.activeId && state.mode === "edit" && event.dataTransfer?.types?.includes("Files")) {
      event.preventDefault();
    }
  }

  function onPaste(event) {
    if (!state.activeId || state.mode !== "edit" || event.target.closest?.('[contenteditable="true"]')) return;
    const images = Array.from(event.clipboardData?.items || [])
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (!images.length) return;
    event.preventDefault();
    addPhotos(images);
  }

  function render(id) {
    clearTimeout(state.saveTimer);
    clearTimeout(state.resizeTimer);
    state.activeId = id;
    state.gesture = null;
    state.suppressSkimClick = false;
    const all = readAllJournals();
    state.journal = Data.normalizeJournal(all[id], {
      id,
      title: record(id).title || "Journal",
      pageCount: 6
    });
    state.journal.title = record(id).title || state.journal.title;
    state.mode = "skim";
    state.bookState = "front";
    state.turned = 1;
    state.editPageId = state.journal.pages[0]?.id || "";
    state.selectedElementId = "";
    state.history = [];
    state.future = [];
    saveImmediately();
    renderSkim();
  }

  function toggleJournalEditorMode() {
    if (!state.activeId || !state.journal) return;
    if (state.mode === "edit") {
      handleAction("skim");
      return;
    }
    if (state.bookState === "front") {
      openEditor(state.journal.cover.id);
      return;
    }
    if (state.bookState === "back") {
      openEditor(state.journal.backCover.id);
      return;
    }
    const leftIndex = Math.max(0, (state.turned * 2) - 2);
    openEditor(state.journal.pages[leftIndex]?.id || state.journal.pages[0]?.id);
  }

  function close() {
    clearTimeout(state.saveTimer);
    saveImmediately();
    const pageContent = document.getElementById("pageContent");
    const grid = document.getElementById("grid");
    document.getElementById("pageCanvas")?.classList.remove("journal-proto-canvas");
    if (pageContent?.dataset.surfaceType === "journal") {
      pageContent.innerHTML = "";
      pageContent.className = "hint";
      pageContent.dataset.surfaceType = "";
      pageContent.style.display = "";
    }
    if (grid) grid.style.display = "";
    syncJournalDockState(false);
    state.activeId = "";
    state.journal = null;
    state.gesture = null;
  }

  document.addEventListener("click", onClick);
  document.addEventListener("change", onChange);
  document.addEventListener("input", onInput);
  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("pointermove", onPointerMove, { passive: false });
  document.addEventListener("pointerup", onPointerUp);
  document.addEventListener("pointercancel", onPointerUp);
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  document.addEventListener("drop", onDrop);
  document.addEventListener("dragover", onDragOver);
  document.addEventListener("paste", onPaste);
  window.addEventListener("resize", () => {
    if (!state.activeId) return;
    clearTimeout(state.resizeTimer);
    state.resizeTimer = setTimeout(renderCurrent, 120);
  });
  window.addEventListener("pagehide", () => {
    saveImmediately();
    window.SanctumStorage?.flush?.();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    saveImmediately();
    window.SanctumStorage?.flush?.();
  });

  window.renderJournalPage = render;
  window.closeJournalPage = close;
  window.readAllJournals = readAllJournals;
  window.toggleJournalEditorMode = toggleJournalEditorMode;
  window.SanctumJournalSurface = {
    isActive: () => !!state.activeId && state.mode === "edit",
    startPlacement(preset) {
      state.replaceImageId = "";
      startJournalPlacement(preset);
    },
    togglePlacement() {
      startJournalPlacement(state.placementTool || "text");
    },
    undo() {
      restoreSnapshot(state.history, state.future);
    },
    redo() {
      restoreSnapshot(state.future, state.history);
    },
    moveLayer(action) {
      moveSelectedLayer(action);
    },
    copy() {
      return copySelectedElement();
    },
    paste() {
      return pasteSelectedElement();
    },
    deleteSelected() {
      removeElement();
    },
    replaceImage() {
      const element = getElement();
      if (!element || element.type !== "image") return;
      state.replaceImageId = element.id;
      state.pendingImagePoint = null;
      document.getElementById("sj-photo-input")?.click();
    },
    openImageShape() {
      const element = getElement();
      if (!element || element.type !== "image") return;
      state.panel = state.panel === "image-shape" ? "" : "image-shape";
      renderEditor();
    },
    openImageFrame() {
      const element = getElement();
      if (!element || element.type !== "image") return;
      state.panel = state.panel === "image-frame" ? "" : "image-frame";
      renderEditor();
    },
    openTextColor() {
      const element = getElement();
      if (!element || element.type !== "text") return;
      state.panel = state.panel === "text-color" ? "" : "text-color";
      renderEditor();
    },
    getSelectedColor(mode) {
      return selectedColor(mode);
    },
    applySelectedColor(mode, color) {
      applySelectedJournalColor(mode, color);
    },
    refreshDock() {
      refreshJournalDock();
    }
  };
  window.dispatchEvent(new CustomEvent("sanctum:journal-ready"));
})();
