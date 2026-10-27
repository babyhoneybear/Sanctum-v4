(function () {
  const api = window.SanctumContextPreview;
  const TEXT_LINKS = '.inline-link[data-page-id], .pps-chip[data-linked-page-id]';
  let anchor = null, panel = null;
  let originFocus = null, originRange = null;
  let sourcePageId = null;
  let restoringFocus = false;

  function snapshot(pageId) {
    const keys = window.STORAGE_KEYS || {};
    const read = (key, fallback) => window.readStorageJSON?.(key, fallback) ?? fallback;
    const page = (window.userPages || []).find(page => page.id === pageId);
    return {
      pages: window.userPages || [], domains: window.userDomains || [],
      pageProps: read(keys.pageProps || 'sanctum_page_props_v1', {}),
      documents: read(keys.documents || 'sanctum_documents', {}),
      blocks: read(keys.pageBlocks || 'sanctum_page_blocks', {}),
      customTypes: read(keys.customTypes || 'sanctum_custom_types_v1', []),
      journals: page?.layout === 'journal' ? read(keys.journals || 'sanctum_journals_v1', {}) : {},
      databases: page?.databaseRowRef ? read(keys.pageDatabases || 'sanctum_page_databases', null)
        || read(keys.legacyCalendarDatabases || 'sanctum_calendar_databases', {}) : {},
      profileSchema: typeof PROFILE_SCHEMAS !== 'undefined' ? PROFILE_SCHEMAS[page?.category] || [] : []
    };
  }
  function targetFor(node) {
    const target = node?.closest?.(TEXT_LINKS);
    if (!target || target.disabled || panel?.contains(target) || target.closest('.ghost, [inert]')) return null;
    return target;
  }
  function idFor(target) {
    return target?.dataset.pageId || target?.dataset.linkedPageId
      || target?.closest('[data-linked-page-id]')?.dataset.linkedPageId || '';
  }
  function captureOrigin() {
    originFocus = document.activeElement;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    originRange = range && originFocus?.isContentEditable && originFocus.contains(range.commonAncestorContainer)
      ? range.cloneRange() : null;
  }
  function close(restore = false) {
    const oldPanel = panel;
    panel = null;
    anchor?.removeAttribute('aria-controls');
    anchor?.removeAttribute('aria-expanded');
    anchor = null;
    oldPanel?.remove();
    if (restore && originFocus?.isConnected) {
      restoringFocus = true;
      originFocus.focus({ preventScroll: true });
      if (originRange?.startContainer?.isConnected && originRange?.endContainer?.isConnected) {
        const selection = window.getSelection();
        selection.removeAllRanges(); selection.addRange(originRange);
      }
      restoringFocus = false;
    }
    originFocus = originRange = null;
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function position() {
    if (!panel || !anchor?.isConnected) { close(); return; }
    const bounds = panel.getBoundingClientRect();
    const point = api.placement(anchor.getBoundingClientRect(), bounds, { width: window.innerWidth, height: window.innerHeight });
    panel.style.left = `${point.left}px`; panel.style.top = `${point.top}px`;
  }
  function render(pageId) {
    const data = api.build(snapshot(pageId), pageId);
    panel.replaceChildren();
    panel.dataset.previewPageId = pageId;
    const head = element('header', 'context-preview-head');
    const heading = element('div');
    heading.append(element('span', 'context-preview-type', data.type || 'Linked page'));
    const title = element('h2', '', data.title); title.id = 'contextPreviewTitle'; heading.append(title);
    const dismiss = element('button', 'context-preview-close', '×');
    dismiss.type = 'button'; dismiss.setAttribute('aria-label', 'Close preview'); dismiss.onclick = () => close(true);
    head.append(heading, dismiss); panel.append(head);
    if (data.path) panel.append(element('div', 'context-preview-path', data.path));
    if (data.summary) panel.append(element('div', 'context-preview-summary', data.summary));
    if (data.fields.length) {
      const fields = element('dl');
      data.fields.forEach(field => fields.append(element('dt', '', field.label), element('dd', '', field.value)));
      panel.append(fields);
      if (data.moreFields) panel.append(element('div', 'context-preview-more', `+ ${data.moreFields} more fields on the page`));
    }
    if (data.excerpt) {
      const excerpt = element('div', 'context-preview-excerpt');
      excerpt.append(element('span', 'context-preview-label', data.excerptLabel || 'From this page'), element('p', '', data.excerpt));
      panel.append(excerpt);
    }
    if (data.missing || (!data.summary && !data.fields.length && !data.excerpt)) {
      panel.append(element('p', 'context-preview-empty', data.message || 'This page has no reference details yet.'));
    }
    const footer = element('footer');
    footer.append(element('span', 'context-preview-label', 'Esc to return to your work'));
    if (!data.missing) {
      const open = element('button', '', 'Open page'); open.type = 'button';
      open.onclick = () => {
        // A page can disappear while the preview is open. Never navigate to a stale ID.
        if (api.build(snapshot(pageId), pageId).missing) { render(pageId); position(); return; }
        const modal = anchor?.closest('dialog[open]');
        close(); modal?.close(); window.openPage?.(pageId);
      };
      footer.append(open);
    }
    panel.append(footer);
  }
  function show(target) {
    if (!target?.matches(TEXT_LINKS)) return;
    const pageId = idFor(target);
    if (!pageId || !target.isConnected) return;
    if (anchor !== target) {
      close(); captureOrigin(); anchor = target;
      panel = element('aside', 'context-preview'); panel.id = 'contextPreview';
      panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Page preview');
      panel.setAttribute('aria-labelledby', 'contextPreviewTitle');
      // Mouse interaction with preview actions should not move the writing caret.
      panel.addEventListener('mousedown', event => { if (event.target.closest('button')) event.preventDefault(); });
      (target.closest('dialog[open]') || document.body).append(panel);
      sourcePageId = window.getCurrentPageId?.();
      anchor.setAttribute('aria-controls', panel.id); anchor.setAttribute('aria-expanded', 'true');
    }
    render(pageId); position();
  }
  // Focus alone never opens a preview; keyboard users activate with Enter or Space.
  document.addEventListener('focusin', event => {
    if (restoringFocus) return;
    if (panel && !panel.contains(event.target) && !anchor?.contains(event.target)) close();
  });
  document.addEventListener('mousedown', event => {
    const target = targetFor(event.target);
    if (event.button === 0 && target?.matches(TEXT_LINKS)) {
      event.preventDefault(); // Looking up a link must not replace the editor's selection.
      return;
    }
    if (panel && !panel.contains(event.target) && target !== anchor) close();
  }, true);
  document.addEventListener('click', event => {
    const target = targetFor(event.target);
    if (!target?.matches(TEXT_LINKS)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    show(target);
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panel) {
      event.preventDefault(); event.stopImmediatePropagation(); close(true); return;
    }
    const target = targetFor(event.target);
    if (target?.matches(TEXT_LINKS) && ['Enter', ' '].includes(event.key)) {
      event.preventDefault(); event.stopImmediatePropagation(); show(target);
      panel.querySelector('button')?.focus({ preventScroll: true });
    } else if (event.key === 'Tab' && panel && event.target === anchor && !event.shiftKey) {
      event.preventDefault(); panel.querySelector('button')?.focus({ preventScroll: true });
    }
  }, true);
  document.addEventListener('scroll', event => { if (panel && !panel.contains(event.target)) close(); }, true);
  document.addEventListener('input', event => { if (panel && !panel.contains(event.target)) close(); });
  window.addEventListener('resize', () => close());
  window.addEventListener('blur', () => close());

  function prepareLinks(root) {
    const links = root.matches?.('.inline-link[data-page-id]') ? [root] : [];
    links.push(...(root.querySelectorAll?.('.inline-link[data-page-id]') || []));
    links.forEach(link => {
      if (!link.hasAttribute('tabindex')) link.tabIndex = 0;
      if (!link.hasAttribute('role')) link.setAttribute('role', 'button');
      link.setAttribute('aria-haspopup', 'dialog');
    });
  }
  prepareLinks(document);
  new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => { if (node.nodeType === 1 && !panel?.contains(node)) prepareLinks(node); }));
    if (panel && (!anchor?.isConnected || sourcePageId !== window.getCurrentPageId?.())) close();
    const modal = document.querySelector('dialog[open]');
    if (panel && modal && !modal.contains(anchor)) close();
  }).observe(document.body, { childList: true, subtree: true });
  window.SanctumContextPreviewUI = { show, close };
})();
