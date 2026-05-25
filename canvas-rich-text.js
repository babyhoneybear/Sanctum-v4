(function () {
  const canvasGridEl = document.getElementById("grid");
  const TOGGLE_SELECTOR = ".canvas-toggle-list";
  const TOGGLE_HANDLE_SELECTOR = ".canvas-toggle-handle";
  const TOGGLE_SUMMARY_SELECTOR = ".canvas-toggle-summary";
  const TOGGLE_CONTENT_SELECTOR = ".canvas-toggle-content";

  function placeCaretInsideElement(element, placeAtEnd = false) {
    if (!element) return;

    const selection = window.getSelection();
    const range = document.createRange();

    if (placeAtEnd) {
      range.selectNodeContents(element);
      range.collapse(false);
    } else {
      range.setStart(element, 0);
      range.collapse(true);
    }

    selection.removeAllRanges();
    selection.addRange(range);
  }

  function insertNodeAtSelection(node) {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return false;

    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function syncBlockAfterCanvasRichTextChange(source) {
    const block = source?.closest?.(".block");
    if (block && typeof autoGrowBlock === "function") {
      autoGrowBlock(block, { allowShrink: true });
    }

    if (typeof saveState === "function") {
      saveState();
    }
  }

  function getToggleSummary(toggle) {
    return toggle?.querySelector(TOGGLE_SUMMARY_SELECTOR) || null;
  }

  function getToggleContent(toggle) {
    return toggle?.querySelector(TOGGLE_CONTENT_SELECTOR) || null;
  }

  function ensureToggleContentEditable(toggle) {
    const content = getToggleContent(toggle);
    if (!content) return;

    if (!content.childNodes.length) {
      content.innerHTML = "<div><br></div>";
    }
  }

  function setToggleOpen(toggle, shouldOpen) {
    if (!toggle) return;

    const nextOpen = !!shouldOpen;
    toggle.classList.toggle("is-open", nextOpen);
    toggle.classList.toggle("is-collapsed", !nextOpen);

    const handle = toggle.querySelector(TOGGLE_HANDLE_SELECTOR);
    if (handle) {
      handle.setAttribute("aria-expanded", nextOpen ? "true" : "false");
    }

    if (!nextOpen && toggle.contains(document.activeElement)) {
      const summary = getToggleSummary(toggle);
      if (summary) {
        summary.focus();
        placeCaretInsideElement(summary, true);
      }
    }
  }

  function createToggleElement(options = {}) {
    const {
      summaryHTML = "",
      contentHTML = "<div><br></div>",
      open = false
    } = options;

    const toggle = document.createElement("div");
    toggle.className = `canvas-toggle-list ${open ? "is-open" : "is-collapsed"}`.trim();
    toggle.setAttribute("contenteditable", "false");
    toggle.innerHTML = `
      <div class="canvas-toggle-row">
        <button type="button" class="canvas-toggle-handle" tabindex="-1" aria-label="Toggle item" aria-expanded="${open ? "true" : "false"}"></button>
        <div class="canvas-toggle-summary" contenteditable="true" spellcheck="false">${summaryHTML}</div>
      </div>
      <div class="canvas-toggle-body">
        <div class="canvas-toggle-content" contenteditable="true" spellcheck="false">${contentHTML}</div>
      </div>
    `;

    ensureToggleContentEditable(toggle);
    return toggle;
  }

  function focusToggleSummary(toggle, placeAtEnd = true) {
    const summary = getToggleSummary(toggle);
    if (!summary) return;
    summary.focus();
    placeCaretInsideElement(summary, placeAtEnd);
  }

  function focusToggleContent(toggle, placeAtEnd = false) {
    const content = getToggleContent(toggle);
    if (!content) return;

    ensureToggleContentEditable(toggle);
    setToggleOpen(toggle, true);
    content.focus();
    placeCaretInsideElement(content, placeAtEnd);
  }

  function insertCanvasListMarkup(editable, tagName = "ul") {
    const listId = `canvas-list-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const itemId = `${listId}-item`;
    const markup = `<${tagName} class="canvas-rich-list" data-canvas-list-id="${listId}"><li data-canvas-list-item-id="${itemId}"><br></li></${tagName}>`;

    document.execCommand("insertHTML", false, markup);

    const item = editable?.querySelector(`[data-canvas-list-item-id="${itemId}"]`);
    if (item) {
      placeCaretInsideElement(item);
      item.removeAttribute("data-canvas-list-item-id");
    }

    editable?.querySelector(`[data-canvas-list-id="${listId}"]`)?.removeAttribute("data-canvas-list-id");
  }

  function insertCanvasHeadingMarkup(editable, level = 1) {
    const safeLevel = Math.max(1, Math.min(3, Number(level) || 1));
    const tagName = `h${safeLevel}`;
    const headingId = `canvas-heading-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const markup = `<${tagName} class="canvas-rich-heading" data-canvas-heading-id="${headingId}"><br></${tagName}>`;

    document.execCommand("insertHTML", false, markup);

    const heading = editable?.querySelector(`[data-canvas-heading-id="${headingId}"]`);
    if (heading) {
      placeCaretInsideElement(heading);
      heading.removeAttribute("data-canvas-heading-id");
    }

    return heading;
  }

  function insertCanvasToggleMarkup() {
    const toggle = createToggleElement({ open: false, summaryHTML: "" });
    if (!insertNodeAtSelection(toggle)) return null;
    return toggle;
  }

  function openCanvasPageCardModal(block, mode = "create", cardType = "page", options = {}) {
    if (!block) return null;

    const restoreData = typeof window.serializeCanvasBlockForModal === "function"
      ? window.serializeCanvasBlockForModal(block)
      : null;

    window.convertCanvasBlockType?.(block, cardType);

    if (options.pageCardView === "gallery") {
      block.dataset.pageCardView = "gallery";
      window.fitLinkedPageBlock?.(block);
    }

    // Defer modal opening so global mousedown handlers finish first
    // (same pattern used by the sidebar tool placement path)
    setTimeout(() => {
      if (mode === "link") {
        window.openPageLinkModal?.(block, {
          restoreData,
          linkTargetType: cardType === "domain" ? "domain" : "all"
        });
      } else {
        window.openPageCreateModal?.(block, { restoreData });
      }
    }, 0);

    return block;
  }

  function insertSiblingToggle(currentToggle) {
    const sibling = createToggleElement({ open: false, summaryHTML: "" });
    currentToggle.after(sibling);
    return sibling;
  }

  function upgradeLegacyCanvasToggle(legacyToggle) {
    if (!legacyToggle || legacyToggle.tagName !== "DETAILS") return legacyToggle;

    const legacySummary = legacyToggle.querySelector("summary");
    const legacyContent = legacyToggle.querySelector(".canvas-toggle-content");
    const replacement = createToggleElement({
      summaryHTML: legacySummary?.innerHTML || "",
      contentHTML: legacyContent?.innerHTML || "<div><br></div>",
      open: !!legacyToggle.open
    });

    legacyToggle.replaceWith(replacement);
    return replacement;
  }

  function upgradeLegacyCanvasToggles(root = document) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll("details.canvas-toggle-list").forEach((legacyToggle) => {
      upgradeLegacyCanvasToggle(legacyToggle);
    });
  }

  function isPlainCanvasTextBlockContext(context) {
    if (!context?.editable?.classList.contains("block-body")) return false;
    return (context.block?.dataset.type || "text") === "text";
  }

  function isFrameCanvasTextContext(context) {
    if (!context?.editable?.classList.contains("frame-item-text-content")) return false;
    return (context.block?.dataset.type || "") === "container";
  }

  function shouldReplaceFrameItem(editable) {
    const frameItem = editable?.closest?.(".frame-item");
    if (!frameItem) return false;

    const plainText = String(editable.textContent || "")
      .replace(/\u00a0/g, " ")
      .trim();
    if (plainText) return false;

    const html = String(editable.innerHTML || "")
      .replace(/<br\s*\/?>/gi, "")
      .replace(/&nbsp;/gi, "")
      .trim();

    return !html;
  }

  function insertFrameSlashItem(editable, block, type, options = {}) {
    const frameItem = editable?.closest?.(".frame-item");
    if (!frameItem || block?.dataset?.type !== "container") return null;

    return window.insertFrameItemIntoContainer?.(block, type, {
      afterItem: frameItem,
      replaceCurrent: Object.prototype.hasOwnProperty.call(options, "replaceCurrent")
        ? !!options.replaceCurrent
        : shouldReplaceFrameItem(editable),
      skipSave: true,
      ...options
    }) || null;
  }

  function getCanvasSlashMatches(context) {
    const availableCommands = canvasSlashCommands.filter((command) => {
      if (typeof command.when === "function" && !command.when(context)) {
        return false;
      }
      return true;
    });

    if (!context.query) {
      return getCanvasSlashCommandGroups(availableCommands);
    }

    return availableCommands.filter((command) => {
      const haystack = `${command.label} ${(command.keywords || []).join(" ")}`.toLowerCase();
      return haystack.includes(context.query);
    });
  }

  function getCanvasSlashCommandGroups(commands = []) {
    const groups = [
      { label: "Study Tools", icon: "S", labels: ["Flashcard Deck", "Typing Drill", "Fill Blank", "Match Pairs"] },
      { label: "Text", icon: "T", labels: ["Heading 1", "Heading 2", "Heading 3", "Bullet List", "Numbered List", "Toggle List", "Text Box"] },
      { label: "Pages", icon: "P", labels: ["New Page", "Link Page", "Link Page Gallery", "Link Domain", "Link Domain Gallery"] },
      { label: "Databases", icon: "D", labels: ["Inline Database", "Database Page", "Table"] },
      { label: "Media", icon: "M", labels: ["Image", "Web Link"] },
      { label: "Layout", icon: "L", labels: ["Frame", "Divider", "Vertical Divider", "Up-Down Divider", "Dashed Divider"] },
      { label: "Widgets", icon: "W", labels: ["Clock Widget"] }
    ];

    return groups
      .map((group) => ({
        ...group,
        children: group.labels.map((label) => commands.find((command) => command.label === label)).filter(Boolean)
      }))
      .filter((group) => group.children.length);
  }

  const canvasSlashCommands = [
    {
      label: "Heading 1",
      icon: "H1",
      keywords: ["header", "title", "large"],
      run: (editable) => insertCanvasHeadingMarkup(editable, 1)
    },
    {
      label: "Heading 2",
      icon: "H2",
      keywords: ["header", "subhead", "section"],
      run: (editable) => insertCanvasHeadingMarkup(editable, 2)
    },
    {
      label: "Heading 3",
      icon: "H3",
      keywords: ["header", "small heading", "subsection"],
      run: (editable) => insertCanvasHeadingMarkup(editable, 3)
    },
    {
      label: "Bullet List",
      icon: "•",
      keywords: ["bullets", "list"],
      run: (editable) => insertCanvasListMarkup(editable, "ul")
    },
    {
      label: "Numbered List",
      icon: "1.",
      keywords: ["number", "numbers", "ordered", "list"],
      run: (editable) => insertCanvasListMarkup(editable, "ol")
    },
    {
      label: "Toggle List",
      icon: ">",
      keywords: ["toggle", "dropdown", "list"],
      run: () => insertCanvasToggleMarkup()
    },
    {
      label: "Text Box",
      icon: "T",
      keywords: ["text", "paragraph", "note"],
      when: isFrameCanvasTextContext,
      run: (editable, block) => insertFrameSlashItem(editable, block, "text", {
        focus: true,
        replaceCurrent: false
      })
    },
    {
      label: "New Page",
      icon: "P",
      keywords: ["page", "subpage", "card", "create"],
      when: (context) => isPlainCanvasTextBlockContext(context) || isFrameCanvasTextContext(context),
      run: (editable, block) => isFrameCanvasTextContext({ editable, block })
        ? insertFrameSlashItem(editable, block, "page", { pageMode: "create" })
        : openCanvasPageCardModal(block, "create", "page")
    },
    {
      label: "Inline Database",
      icon: "D",
      keywords: ["inline database", "database", "db", "table", "board", "embed"],
      when: isPlainCanvasTextBlockContext,
      run: (_editable, block) => {
        const calendarBlock = window.convertCanvasBlockType?.(block, "calendar");
        if (calendarBlock) {
          window.requestAnimationFrame(() => {
            window.mountDatabaseEmbedBlock?.(calendarBlock, { openPicker: true });
          });
        }
        return calendarBlock;
      }
    },
    {
      label: "Database Page",
      icon: "DB",
      keywords: ["database", "db", "calendar", "notion", "sheet"],
      when: (context) => isPlainCanvasTextBlockContext(context) || isFrameCanvasTextContext(context),
      run: (editable, block) => isFrameCanvasTextContext({ editable, block })
        ? insertFrameSlashItem(editable, block, "page", {
            pageMode: "create",
            createPageOptions: { initialLayout: "sheet", initialContainerType: "page" }
          })
        : openCanvasPageCardModal(block, "create", "page", {
            initialLayout: "sheet",
            initialContainerType: "page"
          })
    },
    {
      label: "Link Page",
      icon: "LP",
      keywords: ["link", "existing", "backlink", "page"],
      when: (context) => isPlainCanvasTextBlockContext(context) || isFrameCanvasTextContext(context),
      run: (editable, block) => isFrameCanvasTextContext({ editable, block })
        ? insertFrameSlashItem(editable, block, "page", { pageMode: "link", linkTargetType: "page" })
        : openCanvasPageCardModal(block, "link", "page")
    },
    {
      label: "Link Page Gallery",
      icon: "LG",
      keywords: ["link", "existing", "backlink", "page", "gallery", "cover", "image"],
      when: (context) => isPlainCanvasTextBlockContext(context) || isFrameCanvasTextContext(context),
      run: (editable, block) => isFrameCanvasTextContext({ editable, block })
        ? insertFrameSlashItem(editable, block, "page", {
            pageMode: "link",
            linkTargetType: "page",
            data: { pageCardView: "gallery" }
          })
        : openCanvasPageCardModal(block, "link", "page", { pageCardView: "gallery" })
    },
    {
      label: "Link Domain",
      icon: "DM",
      keywords: ["link", "existing", "backlink", "domain", "bucket"],
      when: (context) => isPlainCanvasTextBlockContext(context) || isFrameCanvasTextContext(context),
      run: (editable, block) => isFrameCanvasTextContext({ editable, block })
        ? insertFrameSlashItem(editable, block, "domain", { pageMode: "link", linkTargetType: "domain" })
        : openCanvasPageCardModal(block, "link", "domain")
    },
    {
      label: "Link Domain Gallery",
      icon: "DG",
      keywords: ["link", "existing", "backlink", "domain", "bucket", "gallery", "cover", "image"],
      when: (context) => isPlainCanvasTextBlockContext(context) || isFrameCanvasTextContext(context),
      run: (editable, block) => isFrameCanvasTextContext({ editable, block })
        ? insertFrameSlashItem(editable, block, "domain", {
            pageMode: "link",
            linkTargetType: "domain",
            data: { pageCardView: "gallery" }
          })
        : openCanvasPageCardModal(block, "link", "domain", { pageCardView: "gallery" })
    },
    {
      label: "Image",
      icon: "IMG",
      keywords: ["img", "photo", "picture"],
      when: (context) => isPlainCanvasTextBlockContext(context) || isFrameCanvasTextContext(context),
      run: (editable, block) => isFrameCanvasTextContext({ editable, block })
        ? insertFrameSlashItem(editable, block, "image", { openImagePicker: true })
        : window.convertCanvasBlockType?.(block, "image", { openImagePicker: true })
    },
    {
      label: "Frame",
      icon: "F",
      keywords: ["section", "box", "panel"],
      when: isPlainCanvasTextBlockContext,
      run: (_editable, block) => window.convertCanvasBlockType?.(block, "container")
    },
    {
      label: "Table",
      icon: "TB",
      keywords: ["grid", "columns", "rows"],
      when: (context) => isPlainCanvasTextBlockContext(context) || isFrameCanvasTextContext(context),
      run: (editable, block) => isFrameCanvasTextContext({ editable, block })
        ? insertFrameSlashItem(editable, block, "table", { focus: true })
        : window.convertCanvasBlockType?.(block, "table")
    },
    {
      label: "Flashcard Deck",
      icon: "S",
      keywords: ["study", "flashcard", "cards", "review", "quiz"],
      when: isPlainCanvasTextBlockContext,
      run: (_editable, block) => window.convertCanvasBlockType?.(block, "flashcards", { openFlashcardPicker: true })
    },
    {
      label: "Typing Drill",
      icon: "TY",
      keywords: ["study", "typing", "drill", "answer", "practice", "quiz"],
      when: isPlainCanvasTextBlockContext,
      run: (_editable, block) => window.convertCanvasBlockType?.(block, "typing-drill", { openTypingDrillPicker: true })
    },
    {
      label: "Fill Blank",
      icon: "FB",
      keywords: ["study", "fill", "blank", "cloze", "sentence", "quiz"],
      when: isPlainCanvasTextBlockContext,
      run: (_editable, block) => window.convertCanvasBlockType?.(block, "fill-blank", { openFillBlankPicker: true })
    },
    {
      label: "Match Pairs",
      icon: "MP",
      keywords: ["study", "match", "pairs", "matching", "connect", "quiz"],
      when: isPlainCanvasTextBlockContext,
      run: (_editable, block) => window.convertCanvasBlockType?.(block, "match-pairs", { openMatchPairsPicker: true })
    },
    {
      label: "Divider",
      icon: "-",
      keywords: ["line", "rule", "separator", "horizontal"],
      when: (context) => isPlainCanvasTextBlockContext(context) || isFrameCanvasTextContext(context),
      run: (editable, block) => isFrameCanvasTextContext({ editable, block })
        ? insertFrameSlashItem(editable, block, "divider")
        : window.convertCanvasBlockType?.(block, "divider")
    },
    {
      label: "Vertical Divider",
      icon: "|",
      keywords: ["vertical", "line", "rule", "separator"],
      when: (context) => isPlainCanvasTextBlockContext(context) || isFrameCanvasTextContext(context),
      run: (editable, block) => isFrameCanvasTextContext({ editable, block })
        ? insertFrameSlashItem(editable, block, "divider-vertical")
        : window.convertCanvasBlockType?.(block, "divider-vertical")
    },
    {
      label: "Up-Down Divider",
      icon: "UD",
      keywords: ["up", "down", "vertical", "line", "separator"],
      when: (context) => isPlainCanvasTextBlockContext(context) || isFrameCanvasTextContext(context),
      run: (editable, block) => isFrameCanvasTextContext({ editable, block })
        ? insertFrameSlashItem(editable, block, "divider-updown")
        : window.convertCanvasBlockType?.(block, "divider-updown")
    },
    {
      label: "Dashed Divider",
      icon: "--",
      keywords: ["dashed", "line", "rule", "separator"],
      when: (context) => isPlainCanvasTextBlockContext(context) || isFrameCanvasTextContext(context),
      run: (editable, block) => isFrameCanvasTextContext({ editable, block })
        ? insertFrameSlashItem(editable, block, "divider-dashed")
        : window.convertCanvasBlockType?.(block, "divider-dashed")
    },
    {
      label: "Web Link",
      icon: "URL",
      keywords: ["link", "url", "web", "external", "youtube", "website", "href", "http"],
      when: (context) => isPlainCanvasTextBlockContext(context) || isFrameCanvasTextContext(context),
      run: (editable, block) => {
        const url = prompt("Enter URL (e.g. https://youtube.com/...):");
        if (!url) return null;
        if (isFrameCanvasTextContext({ editable, block })) {
          const frameItem = insertFrameSlashItem(editable, block, "weblink", {
            data: { externalUrl: url }
          });
          if (frameItem) {
            window.syncWebLinkCardTarget?.(frameItem, { url });
          }
          return frameItem;
        }

        const webBlock = window.convertCanvasBlockType?.(block, "weblink");
        if (!webBlock) return null;
        window.syncWebLinkCardTarget?.(webBlock, { url });
        return webBlock;
      }
    },
    {
      label: "Clock Widget",
      icon: "CLK",
      keywords: ["clock", "time", "widget", "digital", "watch"],
      when: isPlainCanvasTextBlockContext,
      run: (_editable, block) => window.convertCanvasBlockType?.(block, "clock", { openClockPicker: true })
    }
  ];

  const canvasSlashState = {
    active: false,
    editable: null,
    block: null,
    range: null,
    startNode: null,
    startOffset: 0,
    query: "",
    matches: [],
    activeIndex: 0
  };

  function isCanvasSlashEditable(editable) {
    if (!editable) return false;
    if (!editable.closest("#grid .block")) return false;

    return editable.classList.contains("block-body")
      || editable.classList.contains("container-body")
      || editable.classList.contains("frame-item-text-content")
      || editable.classList.contains("canvas-toggle-content");
  }

  function getCanvasSlashMenu() {
    let menu = document.getElementById("canvasSlashMenu");
    if (menu) return menu;

    menu = document.createElement("div");
    menu.id = "canvasSlashMenu";
    menu.className = "canvas-slash-menu";
    document.body.appendChild(menu);
    return menu;
  }

  function resetCanvasSlashState() {
    canvasSlashState.active = false;
    canvasSlashState.editable = null;
    canvasSlashState.block = null;
    canvasSlashState.range = null;
    canvasSlashState.startNode = null;
    canvasSlashState.startOffset = 0;
    canvasSlashState.query = "";
    canvasSlashState.matches = [];
    canvasSlashState.activeIndex = 0;
  }

  function closeCanvasSlashMenu() {
    const menu = document.getElementById("canvasSlashMenu");
    if (menu) {
      menu.classList.remove("open");
      menu.innerHTML = "";
      menu.style.top = "";
      menu.style.left = "";
    }
    closeCanvasSlashSubmenu();

    resetCanvasSlashState();
  }

  function closeCanvasSlashSubmenu() {
    document.getElementById("canvasSlashSubmenu")?.remove();
  }

  function openCanvasSlashSubmenu(anchorEl, commands = []) {
    closeCanvasSlashSubmenu();
    if (!anchorEl || !commands.length) return;

    const submenu = document.createElement("div");
    submenu.id = "canvasSlashSubmenu";
    submenu.className = "canvas-slash-menu canvas-slash-submenu open";

    commands.forEach((command) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "canvas-slash-item";
      item.innerHTML = `<span class="canvas-slash-icon">${command.icon}</span><span class="canvas-slash-label">${command.label}</span>`;
      item.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        executeCanvasSlashCommandObject(command);
      });
      submenu.appendChild(item);
    });

    document.body.appendChild(submenu);
    const rect = anchorEl.getBoundingClientRect();
    const submenuRect = submenu.getBoundingClientRect();
    const viewportPadding = 12;
    const rightSpace = window.innerWidth - rect.right - viewportPadding;
    const leftSpace = rect.left - viewportPadding;
    const openLeft = leftSpace >= submenuRect.width + 6 && leftSpace > rightSpace;
    const left = openLeft
      ? Math.max(viewportPadding, rect.left - submenuRect.width - 6)
      : Math.min(window.innerWidth - submenuRect.width - viewportPadding, rect.right + 6);
    const top = Math.max(viewportPadding, Math.min(rect.top, window.innerHeight - submenuRect.height - viewportPadding));

    submenu.style.left = `${Math.round(left)}px`;
    submenu.style.top = `${Math.round(top)}px`;
  }

  function getCanvasSlashContext(editable) {
    if (!isCanvasSlashEditable(editable)) return null;

    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;

    const range = selection.getRangeAt(0);
    if (!range.collapsed || !editable.contains(range.startContainer)) return null;

    const textNode = range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer
      : null;
    if (!textNode) return null;

    const textBefore = textNode.textContent.slice(0, range.startOffset);
    const slashIdx = textBefore.lastIndexOf("/");
    if (slashIdx === -1) return null;

    const query = textBefore.slice(slashIdx + 1);
    if (/\s/.test(query)) return null;

    return {
      editable,
      block: editable.closest(".block"),
      range: range.cloneRange(),
      startNode: textNode,
      startOffset: slashIdx,
      query: query.toLowerCase()
    };
  }

  function renderCanvasSlashMenu() {
    if (!canvasSlashState.active || !canvasSlashState.matches.length || !canvasSlashState.range) {
      closeCanvasSlashMenu();
      return;
    }

    const menu = getCanvasSlashMenu();
    menu.innerHTML = "";

    canvasSlashState.matches.forEach((command, index) => {
      const isGroup = Array.isArray(command.children) && command.children.length;
      const item = document.createElement("button");
      item.type = "button";
      item.className = `canvas-slash-item${index === canvasSlashState.activeIndex ? " active" : ""}${isGroup ? " has-submenu" : ""}`;
      item.innerHTML = `<span class="canvas-slash-icon">${command.icon}</span><span class="canvas-slash-label">${command.label}</span>${isGroup ? `<span class="canvas-slash-arrow">&rsaquo;</span>` : ""}`;
      if (isGroup) {
        item.addEventListener("mouseenter", () => openCanvasSlashSubmenu(item, command.children));
      }
      item.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (isGroup) {
          openCanvasSlashSubmenu(item, command.children);
          return;
        }
        executeCanvasSlashCommand(index);
      });
      menu.appendChild(item);
    });

    menu.classList.add("open");

    const rect = canvasSlashState.range.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - menuRect.width - 12));
    const top = Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - menuRect.height - 12));

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function showCanvasSlashMenu(context) {
    const matches = getCanvasSlashMatches(context);
    if (!matches.length) {
      closeCanvasSlashMenu();
      return;
    }

    canvasSlashState.active = true;
    canvasSlashState.editable = context.editable;
    canvasSlashState.block = context.block;
    canvasSlashState.range = context.range;
    canvasSlashState.startNode = context.startNode;
    canvasSlashState.startOffset = context.startOffset;
    canvasSlashState.query = context.query;
    canvasSlashState.matches = matches;
    canvasSlashState.activeIndex = Math.min(canvasSlashState.activeIndex, Math.max(matches.length - 1, 0));

    renderCanvasSlashMenu();
  }

  function checkCanvasSlashCommand(editable) {
    if (!isCanvasSlashEditable(editable)) {
      closeCanvasSlashMenu();
      return;
    }

    const context = getCanvasSlashContext(editable);
    if (!context) {
      closeCanvasSlashMenu();
      return;
    }

    if (typeof closeSlashMenu === "function") {
      closeSlashMenu();
    }

    showCanvasSlashMenu(context);
  }

  function executeCanvasSlashCommand(index = canvasSlashState.activeIndex) {
    if (!canvasSlashState.active) return;

    const command = canvasSlashState.matches[index];
    if (command?.children?.length) {
      executeCanvasSlashCommandObject(command.children[0]);
      return;
    }

    executeCanvasSlashCommandObject(command);
  }

  function executeCanvasSlashCommandObject(command) {
    if (!canvasSlashState.active) return;

    const editable = canvasSlashState.editable;
    const block = canvasSlashState.block;
    const startNode = canvasSlashState.startNode;
    const startOffset = canvasSlashState.startOffset;
    const range = canvasSlashState.range;

    if (!command || !editable || !startNode?.isConnected || !range?.startContainer?.isConnected) {
      closeCanvasSlashMenu();
      return;
    }

    editable.focus();

    const selection = window.getSelection();
    const deleteRange = document.createRange();
    deleteRange.setStart(startNode, startOffset);
    deleteRange.setEnd(range.startContainer, range.startOffset);
    deleteRange.deleteContents();
    deleteRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(deleteRange);

    const inserted = command.run(editable, block);
    closeCanvasSlashMenu();

    if (inserted?.classList?.contains("canvas-toggle-list")) {
      focusToggleSummary(inserted, false);
    }

    if (block && typeof autoGrowBlock === "function") {
      autoGrowBlock(block);
    }

    if (typeof saveState === "function") {
      saveState();
    }
  }

  window.closeCanvasSlashMenu = closeCanvasSlashMenu;
  window.checkCanvasSlashCommand = checkCanvasSlashCommand;
  window.isCanvasSlashEditable = isCanvasSlashEditable;

  document.addEventListener("mousedown", (e) => {
    if (!e.target.closest("#canvasSlashMenu") && !e.target.closest("#canvasSlashSubmenu")) {
      closeCanvasSlashMenu();
    }
  });

  document.addEventListener("mousedown", (e) => {
    if (!e.target.closest(TOGGLE_HANDLE_SELECTOR)) return;
    e.stopPropagation();
  }, true);

  document.addEventListener("keydown", (e) => {
    if (!canvasSlashState.active || !canvasSlashState.matches.length) return;

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeCanvasSlashMenu();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      canvasSlashState.activeIndex = (canvasSlashState.activeIndex + 1) % canvasSlashState.matches.length;
      renderCanvasSlashMenu();
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      canvasSlashState.activeIndex = (canvasSlashState.activeIndex - 1 + canvasSlashState.matches.length) % canvasSlashState.matches.length;
      renderCanvasSlashMenu();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      executeCanvasSlashCommand();
    }
  }, true);

  document.addEventListener("keydown", (e) => {
    if (canvasSlashState.active) return;

    const summary = e.target.closest?.(TOGGLE_SUMMARY_SELECTOR);
    const content = e.target.closest?.(TOGGLE_CONTENT_SELECTOR);
    const toggle = e.target.closest?.(TOGGLE_SELECTOR);
    if (!toggle) return;

    if (summary) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const sibling = insertSiblingToggle(toggle);
        focusToggleSummary(sibling, false);
        syncBlockAfterCanvasRichTextChange(toggle);
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        focusToggleContent(toggle, false);
        syncBlockAfterCanvasRichTextChange(toggle);
      }

      return;
    }

    if (content && e.key === "Tab") {
      e.preventDefault();

      if (e.shiftKey) {
        focusToggleSummary(toggle, true);
        return;
      }

      document.execCommand("insertHTML", false, "&nbsp;&nbsp;&nbsp;&nbsp;");
    }
  }, true);

  document.addEventListener("focusin", (e) => {
    const editable = e.target.closest?.('[contenteditable="true"]');
    if (!isCanvasSlashEditable(editable)) {
      closeCanvasSlashMenu();
    }
  });

  canvasGridEl?.addEventListener("click", (e) => {
    const handle = e.target.closest(TOGGLE_HANDLE_SELECTOR);
    if (!handle) return;

    const toggle = handle.closest(TOGGLE_SELECTOR);
    if (!toggle) return;

    e.preventDefault();
    e.stopPropagation();
    setToggleOpen(toggle, !toggle.classList.contains("is-open"));
    syncBlockAfterCanvasRichTextChange(toggle);
  });

  const legacyToggleObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;

        if (node.matches?.("details.canvas-toggle-list")) {
          upgradeLegacyCanvasToggle(node);
          return;
        }

        upgradeLegacyCanvasToggles(node);
      });
    });
  });

  if (canvasGridEl) {
    upgradeLegacyCanvasToggles(canvasGridEl);
    legacyToggleObserver.observe(canvasGridEl, {
      childList: true,
      subtree: true
    });
  }
})();
