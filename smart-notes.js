(() => {
  const NOTES_KEY = (window.STORAGE_KEYS && window.STORAGE_KEYS.notesVault) || 'sanctum_notes_vault_v1';
  const SHELVES_KEY = (window.STORAGE_KEYS && window.STORAGE_KEYS.noteShelves) || 'sanctum_note_shelves_v1';
  const INBOX_KEY = (window.STORAGE_KEYS && window.STORAGE_KEYS.helperInbox) || 'sanctum_helper_inbox_v1';
  const LOG_KEY = (window.STORAGE_KEYS && window.STORAGE_KEYS.helperActionLog) || 'sanctum_helper_action_log_v1';
  const CHAT_KEY = (window.STORAGE_KEYS && window.STORAGE_KEYS.helperChatLog) || 'sanctum_helper_chat_log_v1';
  const USER_PROFILE_KEY = (window.STORAGE_KEYS && window.STORAGE_KEYS.helperUserProfile) || 'sanctum_helper_user_profile_v1';
  const HELPER_MEMORY_KEY = (window.STORAGE_KEYS && window.STORAGE_KEYS.helperMemoryProfile) || 'sanctum_helper_memory_profile_v1';
  const ASSISTANT_API_PATH = ((window.SANCTUM_API_BASE || '') + '/api/assistant/chat').replace(/\/\/api/, '/api');

  if (window.STORAGE_KEYS) {
    window.STORAGE_KEYS.notesVault = NOTES_KEY;
    window.STORAGE_KEYS.noteShelves = SHELVES_KEY;
    window.STORAGE_KEYS.helperInbox = INBOX_KEY;
    window.STORAGE_KEYS.helperActionLog = LOG_KEY;
    window.STORAGE_KEYS.helperChatLog = CHAT_KEY;
    window.STORAGE_KEYS.helperUserProfile = USER_PROFILE_KEY;
    window.STORAGE_KEYS.helperMemoryProfile = HELPER_MEMORY_KEY;
  }

  const readJSON = (key, fallback) => {
    if (typeof window.readStorageJSON === 'function') return window.readStorageJSON(key, fallback);
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };

  const writeJSON = (key, value) => {
    if (typeof window.writeStorageJSON === 'function') return window.writeStorageJSON(key, value);
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };

  const escapeHTML = (value = '') => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const stripHTML = (value = '') => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  const slugify = (value = '') => String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const tokenize = (value = '') => stripHTML(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && token.length > 1);

  const dedupe = (list = []) => Array.from(new Set((Array.isArray(list) ? list : []).filter(Boolean)));

  const now = () => Date.now();
  const makeId = (prefix = 'id') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  function normalizeUserProfile(profile = {}) {
    return {
      id: typeof profile.id === 'string' && profile.id.trim() ? profile.id.trim() : 'primary-user',
      displayName: typeof profile.displayName === 'string' && profile.displayName.trim() ? profile.displayName.trim() : 'You',
      assistantName: typeof profile.assistantName === 'string' && profile.assistantName.trim() ? profile.assistantName.trim() : 'Assistant',
    };
  }

  function normalizeHelperMemory(memory = {}) {
    const facts = Array.isArray(memory.facts)
      ? memory.facts
          .map((item) => ({
            id: typeof item?.id === 'string' ? item.id : makeId('mem'),
            text: typeof item?.text === 'string' ? item.text.trim() : '',
            source: typeof item?.source === 'string' ? item.source : 'assistant',
            createdAt: Number.isFinite(Number(item?.createdAt)) ? Number(item.createdAt) : now(),
          }))
          .filter((item) => item.text)
      : [];

    return {
      facts: facts.slice(-80),
      updatedAt: Number.isFinite(Number(memory.updatedAt)) ? Number(memory.updatedAt) : now(),
    };
  }

  const activeUser = normalizeUserProfile(readJSON(USER_PROFILE_KEY, {}));
  let helperMemory = normalizeHelperMemory(readJSON(`${HELPER_MEMORY_KEY}:${activeUser.id}`, {}));

  let notes = normalizeNotes(readJSON(NOTES_KEY, []));
  let shelves = normalizeShelves(readJSON(SHELVES_KEY, []));
  let inboxItems = normalizeInbox(readJSON(INBOX_KEY, []));
  let actionLog = normalizeActionLog(readJSON(LOG_KEY, []));
  let chatMessages = normalizeChat(readJSON(CHAT_KEY, []));

  let activeNotesView = { type: 'view', id: 'all' };
  let activeNoteId = notes[0]?.id || '';
  let notesSearch = '';
  let notesGlobalSearch = '';
  let notesListFilter = 'all';
  let notesLayoutState = { shelvesOpen: true, listOpen: true };
  let notesFolderState = {};
  let activeAssistantOpen = false;
  let activeAssistantBusy = false;
  let activeComposerContextPageId = '';
  let noteSaveTimer = null;
  let noteReprocessTimer = null;

  const NOTES_LIST_FILTER_OPTIONS = [
    { id: 'all', label: 'All Pages', buttonLabel: 'All' },
    { id: 'review', label: 'Needs Review', buttonLabel: 'Review' },
    { id: 'unsorted', label: 'Unsorted', buttonLabel: 'Unsorted' },
    { id: 'quick', label: 'Quick Notes', buttonLabel: 'Quick' },
    { id: 'linked', label: 'Linked Only', buttonLabel: 'Linked' },
  ];

  function normalizeNotes(list = []) {
    return Array.isArray(list)
      ? list.map((note) => normalizeNote(note)).filter(Boolean)
      : [];
  }

  function normalizeNote(note = {}) {
    const bodyHTML = typeof note.bodyHTML === 'string' ? note.bodyHTML : '';
    const bodyText = stripHTML(bodyHTML || note.bodyText || '');
    return {
      id: typeof note.id === 'string' ? note.id : makeId('note'),
      title: typeof note.title === 'string' ? note.title : '',
      bodyHTML: bodyHTML || escapeHTML(note.bodyText || '').replace(/\n/g, '<br>'),
      bodyText,
      preview: typeof note.preview === 'string' && note.preview.trim() ? note.preview.trim() : buildPreview(bodyText),
      createdAt: Number.isFinite(Number(note.createdAt)) ? Number(note.createdAt) : now(),
      updatedAt: Number.isFinite(Number(note.updatedAt)) ? Number(note.updatedAt) : now(),
      shelfIds: dedupe(note.shelfIds),
      directPageIds: dedupe(note.directPageIds),
      visibleTags: dedupe(note.visibleTags),
      helperTags: dedupe(note.helperTags),
      status: ['normal', 'review', 'archived'].includes(note.status) ? note.status : 'normal',
      sortState: ['placed', 'review', 'unsorted'].includes(note.sortState) ? note.sortState : 'unsorted',
      sourceType: ['normal', 'quick'].includes(note.sourceType) ? note.sourceType : 'normal',
      aiTitle: note.aiTitle !== false,
      archived: note.archived === true,
      contextPageId: typeof note.contextPageId === 'string' ? note.contextPageId : '',
      contextBreadcrumbIds: dedupe(note.contextBreadcrumbIds),
      contextBreadcrumbTitles: Array.isArray(note.contextBreadcrumbTitles)
        ? note.contextBreadcrumbTitles.filter((item) => typeof item === 'string' && item.trim())
        : [],
      helperConfidence: Number.isFinite(Number(note.helperConfidence)) ? Number(note.helperConfidence) : 0,
      needsReview: note.needsReview === true,
      helperSummary: typeof note.helperSummary === 'string' ? note.helperSummary : '',
      placementDigest: typeof note.placementDigest === 'string' ? note.placementDigest : '',
      aiNamed: note.aiNamed === true,
      linkedPromptCount: Number.isFinite(Number(note.linkedPromptCount)) ? Number(note.linkedPromptCount) : 0,
      actionIds: dedupe(note.actionIds),
    };
  }

  function normalizeShelves(list = []) {
    return Array.isArray(list)
      ? list.map((shelf) => normalizeShelf(shelf)).filter(Boolean)
      : [];
  }

  function normalizeShelf(shelf = {}) {
    const name = typeof shelf.name === 'string' ? shelf.name.trim() : '';
    if (!name) return null;
    return {
      id: typeof shelf.id === 'string' ? shelf.id : makeId('shelf'),
      name,
      parentId: typeof shelf.parentId === 'string' ? shelf.parentId : '',
      kind: ['manual', 'smart', 'context'].includes(shelf.kind) ? shelf.kind : 'manual',
      createdBy: ['user', 'ai', 'system'].includes(shelf.createdBy) ? shelf.createdBy : 'user',
      linkedPageId: typeof shelf.linkedPageId === 'string' ? shelf.linkedPageId : '',
      sortOrder: Number.isFinite(Number(shelf.sortOrder)) ? Number(shelf.sortOrder) : 0,
    };
  }

  function normalizeInbox(list = []) {
    return Array.isArray(list)
      ? list.map((item) => normalizeInboxItem(item)).filter(Boolean)
      : [];
  }

  function normalizeInboxItem(item = {}) {
    const question = typeof item.question === 'string' ? item.question.trim() : '';
    if (!question) return null;
    return {
      id: typeof item.id === 'string' ? item.id : makeId('inbox'),
      title: typeof item.title === 'string' && item.title.trim() ? item.title : 'Helper question',
      question,
      noteId: typeof item.noteId === 'string' ? item.noteId : '',
      status: ['open', 'resolved'].includes(item.status) ? item.status : 'open',
      confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : 0,
      suggestedPageId: typeof item.suggestedPageId === 'string' ? item.suggestedPageId : '',
      suggestedAction: typeof item.suggestedAction === 'string' ? item.suggestedAction : '',
      reason: typeof item.reason === 'string' ? item.reason : '',
      answer: typeof item.answer === 'string' ? item.answer : '',
      createdAt: Number.isFinite(Number(item.createdAt)) ? Number(item.createdAt) : now(),
      resolvedAt: Number.isFinite(Number(item.resolvedAt)) ? Number(item.resolvedAt) : 0,
    };
  }

  function normalizeActionLog(list = []) {
    return Array.isArray(list)
      ? list.map((entry) => ({
          id: typeof entry?.id === 'string' ? entry.id : makeId('log'),
          noteId: typeof entry?.noteId === 'string' ? entry.noteId : '',
          action: typeof entry?.action === 'string' ? entry.action : '',
          detail: typeof entry?.detail === 'string' ? entry.detail : '',
          createdAt: Number.isFinite(Number(entry?.createdAt)) ? Number(entry.createdAt) : now(),
        }))
      : [];
  }

  function normalizeChatAction(action = {}) {
    const type = typeof action?.type === 'string' ? action.type.trim() : '';
    if (!type) return null;
    return {
      id: typeof action?.id === 'string' && action.id.trim() ? action.id.trim() : makeId('msgact'),
      type,
      label: typeof action?.label === 'string' && action.label.trim() ? action.label.trim() : 'Do this',
      noteId: typeof action?.noteId === 'string' ? action.noteId : '',
      pageId: typeof action?.pageId === 'string' ? action.pageId : '',
      title: typeof action?.title === 'string' ? action.title : '',
      question: typeof action?.question === 'string' ? action.question : '',
      reason: typeof action?.reason === 'string' ? action.reason : '',
      detail: typeof action?.detail === 'string' ? action.detail : '',
      confidence: Number.isFinite(Number(action?.confidence)) ? Number(action.confidence) : 0,
      status: ['pending', 'done'].includes(action?.status) ? action.status : 'pending',
      resultText: typeof action?.resultText === 'string' ? action.resultText : '',
      // create-layout fields
      targetPage: typeof action?.targetPage === 'string' ? action.targetPage : 'current',
      newPageTitle: typeof action?.newPageTitle === 'string' ? action.newPageTitle : '',
      blocks: Array.isArray(action?.blocks) ? action.blocks : [],
    };
  }

  function normalizeChat(list = []) {
    return Array.isArray(list)
      ? list.map((message) => ({
          id: typeof message?.id === 'string' ? message.id : makeId('msg'),
          role: ['user', 'assistant', 'system'].includes(message?.role) ? message.role : 'assistant',
          text: typeof message?.text === 'string' ? message.text : '',
          actions: Array.isArray(message?.actions) ? message.actions.map(normalizeChatAction).filter(Boolean) : [],
          createdAt: Number.isFinite(Number(message?.createdAt)) ? Number(message.createdAt) : now(),
        })).filter((message) => message.text.trim() || (message.actions || []).length)
      : [];
  }

  function buildPreview(text = '') {
    const clean = stripHTML(text);
    if (!clean) return 'Empty note';
    return clean.length > 110 ? `${clean.slice(0, 107)}…` : clean;
  }

  function formatDate(ts) {
    const d = new Date(ts || Date.now());
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function formatDateTime(ts) {
    const d = new Date(ts || Date.now());
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function saveNotes() {
    notes = normalizeNotes(notes);
    writeJSON(NOTES_KEY, notes);
  }

  function saveShelves() {
    shelves = normalizeShelves(shelves);
    writeJSON(SHELVES_KEY, shelves);
  }

  function saveInbox() {
    inboxItems = normalizeInbox(inboxItems);
    writeJSON(INBOX_KEY, inboxItems);
  }

  function saveActionLog() {
    actionLog = normalizeActionLog(actionLog).slice(-400);
    writeJSON(LOG_KEY, actionLog);
  }

  function saveChat() {
    chatMessages = normalizeChat(chatMessages).slice(-120);
    writeJSON(CHAT_KEY, chatMessages);
  }

  function saveHelperMemory() {
    helperMemory = normalizeHelperMemory(helperMemory);
    writeJSON(`${HELPER_MEMORY_KEY}:${activeUser.id}`, helperMemory);
  }

  function addHelperMemoryFact(text, source = 'assistant') {
    const clean = String(text || '').trim();
    if (!clean) return null;
    if (helperMemory.facts.some((item) => item.text.toLowerCase() === clean.toLowerCase())) return null;
    const fact = { id: makeId('mem'), text: clean, source, createdAt: now() };
    helperMemory.facts.push(fact);
    helperMemory.updatedAt = now();
    saveHelperMemory();
    return fact;
  }

  function addAction(noteId, action, detail = '') {
    const entry = { id: makeId('log'), noteId, action, detail, createdAt: now() };
    actionLog.unshift(entry);
    saveActionLog();
    const note = notes.find((item) => item.id === noteId);
    if (note) {
      note.actionIds = dedupe([entry.id, ...(note.actionIds || [])]).slice(0, 20);
      saveNotes();
    }
    return entry;
  }

  function getPagesMap() {
    const map = {
      home: { id: 'home', title: 'Home', layout: 'board-canvas', category: 'system', parent: '', type: 'system' },
      search: { id: 'search', title: 'Search', layout: 'board-canvas', category: 'system', parent: '', type: 'system' },
      inbox: { id: 'inbox', title: 'Inbox', layout: 'board-canvas', category: 'system', parent: '', type: 'system' },
      notes: { id: 'notes', title: 'Notes', layout: 'board-canvas', category: 'system', parent: '', type: 'system' },
      settings: { id: 'settings', title: 'Settings', layout: 'board-canvas', category: 'system', parent: '', type: 'system' },
    };

    (window.userDomains || []).forEach((domain) => {
      map[domain.id] = {
        ...domain,
        layout: domain.layout || 'board-canvas',
        category: domain.category || 'domain',
        type: 'domain',
      };
    });

    (window.userPages || []).forEach((page) => {
      map[page.id] = {
        ...page,
        layout: page.layout || 'board-canvas',
        category: page.category || 'none',
        type: page.type || 'page',
      };
    });

    return map;
  }

  function getPageById(pageId) {
    return getPagesMap()[pageId] || null;
  }

  function getBreadcrumb(pageId) {
    const map = getPagesMap();
    const path = [];
    let current = map[pageId] || map.home;
    const visited = new Set();

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      path.unshift(current);
      if (!current.parent || !map[current.parent]) break;
      current = map[current.parent];
    }

    if (!path.length || path[0].id !== 'home') path.unshift(map.home);
    return path;
  }

  function getPageDescriptorText(pageId) {
    const page = getPageById(pageId);
    if (!page) return '';
    const chunks = [page.title || '', page.category || '', page.summary || ''];
    chunks.push(...getBreadcrumb(pageId).map((item) => item.title || ''));

    try {
      if (typeof window.readAllPageBlocks === 'function') {
        const allBlocks = window.readAllPageBlocks();
        const blocks = Array.isArray(allBlocks?.[pageId]) ? allBlocks[pageId] : [];
        blocks.forEach((block) => {
          chunks.push(
            stripHTML(block.titleHTML || ''),
            stripHTML(block.bodyHTML || ''),
            stripHTML(block.containerTitle || ''),
            stripHTML(block.containerBody || ''),
            stripHTML(block.pageCardTitle || ''),
            stripHTML(block.pageCardSummary || '')
          );
        });
      }

      if (typeof window.readAllDocuments === 'function') {
        const allDocs = window.readAllDocuments();
        const doc = allDocs?.[pageId];
        if (doc) chunks.push(stripHTML(JSON.stringify(doc)).slice(0, 800));
      }
    } catch (err) {
      console.warn('Could not build page descriptor text', err);
    }

    return stripHTML(chunks.join(' '));
  }

  function getNearbyLinkedPages(pageId) {
    if (!pageId || ['home', 'search', 'inbox', 'notes', 'settings'].includes(pageId)) return [];

    const seen = new Set();
    const nearby = [];
    const addPage = (candidateId, source = '') => {
      if (!candidateId || seen.has(candidateId)) return;
      const page = getPageById(candidateId);
      if (!page || ['home', 'search', 'inbox', 'notes', 'settings'].includes(page.id)) return;
      seen.add(candidateId);
      nearby.push({
        id: page.id,
        title: page.title || 'Untitled page',
        source,
        breadcrumb: getBreadcrumb(page.id).map((item) => item.title || ''),
        layout: page.layout || 'board-canvas',
        category: page.category || 'none',
        summary: getPageDescriptorText(page.id).slice(0, 260),
      });
    };

    const page = getPageById(pageId);
    if (page?.parent) addPage(page.parent, 'parent');

    Object.values(getPagesMap()).forEach((candidate) => {
      if (candidate?.parent === pageId) addPage(candidate.id, 'child');
    });

    try {
      if (typeof window.readAllPageBlocks === 'function') {
        const allBlocks = window.readAllPageBlocks();
        const blocks = Array.isArray(allBlocks?.[pageId]) ? allBlocks[pageId] : [];
        blocks.forEach((block) => {
          if (typeof block?.linkedPageId === 'string' && block.linkedPageId) {
            addPage(block.linkedPageId, 'linked card');
          }
        });
      }
    } catch (err) {
      console.warn('Could not collect nearby linked pages', err);
    }

    return nearby.slice(0, 8);
  }

  function getPageUnderstanding(pageId) {
    const page = getPageById(pageId) || getPageById('home');
    const breadcrumb = getBreadcrumb(page.id);
    return {
      pageId: page.id,
      title: page.title || 'Home',
      layout: page.layout || 'board-canvas',
      category: page.category || 'none',
      breadcrumbIds: breadcrumb.map((item) => item.id),
      breadcrumbTitles: breadcrumb.map((item) => item.title || ''),
      descriptor: getPageDescriptorText(page.id),
      nearbyLinkedPages: getNearbyLinkedPages(page.id),
    };
  }

  function extractHashtags(text = '') {
    const matches = String(text || '').match(/(^|\s)#([a-zA-Z0-9_-]+)/g) || [];
    return dedupe(matches.map((match) => match.trim().replace(/^#/, '').replace(/^.+#/, '')).filter(Boolean));
  }

  function ensureContextShelf(pageId) {
    const page = getPageById(pageId);
    if (!page || ['home', 'search', 'inbox', 'notes', 'settings'].includes(pageId)) return '';

    const existing = shelves.find((shelf) => shelf.linkedPageId === pageId && shelf.kind === 'context');
    if (existing) return existing.id;

    const breadcrumb = getBreadcrumb(pageId).filter((item) => !['home', 'search', 'inbox', 'notes', 'settings'].includes(item.id));
    const parent = breadcrumb.length > 1 ? ensureContextShelf(breadcrumb[breadcrumb.length - 2].id) : '';
    const shelf = normalizeShelf({
      id: `shelf-page-${pageId}`,
      name: page.title || 'Untitled',
      parentId: parent,
      kind: 'context',
      createdBy: 'system',
      linkedPageId: pageId,
    });
    shelves.push(shelf);
    saveShelves();
    return shelf.id;
  }

  function ensureShelfByName(name, options = {}) {
    const clean = String(name || '').trim();
    if (!clean) return '';
    const key = slugify(clean);
    const parentId = typeof options.parentId === 'string' ? options.parentId : '';
    const existing = shelves.find((shelf) => slugify(shelf.name) === key && shelf.parentId === parentId);
    if (existing) return existing.id;
    const shelf = normalizeShelf({
      id: `shelf-${key}-${Math.random().toString(36).slice(2, 5)}`,
      name: clean,
      parentId,
      kind: options.kind || 'manual',
      createdBy: options.createdBy || 'ai',
      linkedPageId: options.linkedPageId || '',
    });
    shelves.push(shelf);
    saveShelves();
    return shelf.id;
  }

  function getShelfById(shelfId) {
    return shelves.find((shelf) => shelf.id === shelfId) || null;
  }

  function getShelfChildren(parentId = '') {
    return shelves
      .filter((shelf) => (shelf.parentId || '') === (parentId || ''))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function getNotesSorted(list = []) {
    return [...list].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  function getNoteById(noteId) {
    return notes.find((note) => note.id === noteId) || null;
  }


  function getLiveEditorNoteDraft() {
    const editor = document.getElementById('noteEditor');
    const titleInput = document.getElementById('noteTitleInput');
    const renderedNoteId = document.querySelector('[data-note-editor]')?.dataset.noteEditor || activeNoteId;
    if (!editor || !renderedNoteId) return null;

    const note = getNoteById(renderedNoteId);
    if (!note) return null;

    const bodyHTML = editor.innerHTML || note.bodyHTML || '';
    const bodyText = stripHTML(bodyHTML || note.bodyText || '');
    return {
      ...note,
      id: renderedNoteId,
      title: typeof titleInput?.value === 'string' ? titleInput.value : note.title,
      bodyHTML,
      bodyText,
      preview: buildPreview(bodyText),
    };
  }

  function openPageSafe(pageId) {
    if (typeof window.openPage === 'function') {
      window.openPage(pageId);
    }
  }

  function buildAutoTitle(text = '') {
    const clean = stripHTML(text);
    if (!clean) return 'Untitled note';

    const lines = clean.split(/(?<=[.!?])\s+|\n+/).map((line) => line.trim()).filter(Boolean);
    const hashtags = extractHashtags(text);
    const best = lines[0] || clean;

    let title = best.length > 42 ? `${best.slice(0, 39)}…` : best;
    if (hashtags.length) title = `${title} · ${hashtags[0]}`;
    return title;
  }

  function buildPlacementDigest(note = {}) {
    const normalizedText = String(note.bodyText || stripHTML(note.bodyHTML || ''))
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1200);

    return [
      note.contextPageId || '',
      note.sourceType || 'normal',
      normalizedText,
    ].join('||');
  }

  function createInboxItem({ title, question, noteId = '', confidence = 0, suggestedPageId = '', suggestedAction = '', reason = '' }) {
    const existing = inboxItems.find((item) => item.status === 'open' && item.noteId === noteId && item.question === question);
    if (existing) return existing;

    const next = normalizeInboxItem({
      id: makeId('inbox'),
      title,
      question,
      noteId,
      confidence,
      suggestedPageId,
      suggestedAction,
      reason,
      status: 'open',
      createdAt: now(),
    });
    if (!next) return null;
    inboxItems.unshift(next);
    saveInbox();
    return next;
  }

  function resolveInboxItem(itemId, answer = '') {
    const item = inboxItems.find((entry) => entry.id === itemId);
    if (!item) return null;
    item.status = 'resolved';
    item.answer = answer;
    item.resolvedAt = now();
    saveInbox();
    return item;
  }

  function scoreNoteAgainstPages(bodyText = '', currentPageId = '') {
    const tokens = tokenize(bodyText);
    const joined = ` ${bodyText.toLowerCase()} `;
    const candidates = Object.values(getPagesMap())
      .filter((page) => !['home', 'search', 'inbox', 'notes', 'settings'].includes(page.id));

    let best = null;
    candidates.forEach((page) => {
      const title = (page.title || '').toLowerCase();
      if (!title) return;
      let score = 0;
      const descriptor = getPageDescriptorText(page.id).toLowerCase();
      const titleTokens = tokenize(title);

      if (joined.includes(` ${title} `)) score += 0.62;
      titleTokens.forEach((token) => {
        if (tokens.includes(token)) score += 0.09;
      });
      if (descriptor && tokens.some((token) => descriptor.includes(token))) score += 0.06;
      if (currentPageId && getBreadcrumb(page.id).some((item) => item.id === currentPageId)) score += 0.08;
      if (score > 1) score = 1;
      if (!best || score > best.score) best = { pageId: page.id, score };
    });
    return best;
  }

  function processNotePlacement(note, { forceContext = false } = {}) {
    const understanding = note.contextPageId ? getPageUnderstanding(note.contextPageId) : null;
    const hashtags = extractHashtags(note.bodyText);
    const nextShelfIds = new Set(note.shelfIds || []);
    const nextPageIds = new Set(note.directPageIds || []);
    const helperTags = new Set(note.helperTags || []);
    helperTags.add(note.sourceType === 'quick' ? 'quick-capture' : 'note');

    if (understanding) {
      understanding.breadcrumbIds
        .filter((pageId) => !['home', 'search', 'inbox', 'notes', 'settings'].includes(pageId))
        .forEach((pageId) => {
          const shelfId = ensureContextShelf(pageId);
          if (shelfId) nextShelfIds.add(shelfId);
        });
      helperTags.add(`layout:${understanding.layout}`);
      helperTags.add(`category:${understanding.category}`);
    }

    hashtags.forEach((tag) => {
      const shelfId = ensureShelfByName(tag, { kind: 'manual', createdBy: 'ai' });
      if (shelfId) nextShelfIds.add(shelfId);
      helperTags.add(`tag:${tag.toLowerCase()}`);
    });

    let status = 'normal';
    let sortState = 'unsorted';
    let confidence = 0;
    let helperSummary = 'Still unsorted.';

    if (forceContext && note.contextPageId && !['home', 'notes', 'search', 'inbox', 'settings'].includes(note.contextPageId)) {
      nextPageIds.add(note.contextPageId);
      confidence = 0.97;
      sortState = 'placed';
      helperSummary = `Saved from ${understanding?.title || 'this page'} and linked there.`;
    } else {
      const candidate = scoreNoteAgainstPages(note.bodyText, note.contextPageId || '');
      if (candidate && candidate.score >= 0.95) {
        nextPageIds.add(candidate.pageId);
        nextShelfIds.add(ensureContextShelf(candidate.pageId));
        confidence = candidate.score;
        sortState = 'placed';
        helperSummary = `Placed with high confidence under ${getPageById(candidate.pageId)?.title || 'a page'}.`;
      } else if (candidate && candidate.score >= 0.75) {
        nextPageIds.add(candidate.pageId);
        nextShelfIds.add(ensureContextShelf(candidate.pageId));
        confidence = candidate.score;
        sortState = 'review';
        status = 'review';
        note.needsReview = true;
        createInboxItem({
          title: 'Review helper placement',
          question: `I placed this note under ${getPageById(candidate.pageId)?.title || 'this page'}, but I want you to double-check me.`,
          noteId: note.id,
          confidence: candidate.score,
          suggestedPageId: candidate.pageId,
          suggestedAction: 'review-link',
          reason: 'The note strongly matches one page title and its context, but not strongly enough to trust without review.',
        });
        helperSummary = `Placed for review under ${getPageById(candidate.pageId)?.title || 'a page'}.`;
      } else if (candidate && candidate.score >= 0.60) {
        confidence = candidate.score;
        sortState = 'review';
        status = 'review';
        note.needsReview = true;
        createInboxItem({
          title: 'Where should this note go?',
          question: `This note may belong under ${getPageById(candidate.pageId)?.title || 'this page'}. Do you want me to link it there?`,
          noteId: note.id,
          confidence: candidate.score,
          suggestedPageId: candidate.pageId,
          suggestedAction: 'suggest-link',
          reason: 'I found a decent match in the vault, but I am not sure enough to place it on my own.',
        });
        helperSummary = `Suggested ${getPageById(candidate.pageId)?.title || 'a page'} and sent a question to Inbox.`;
      }
    }

    if (!nextShelfIds.size && !nextPageIds.size) {
      sortState = 'unsorted';
      status = 'normal';
    }

    note.visibleTags = dedupe(hashtags.map((tag) => `#${tag}`));
    note.helperTags = dedupe(Array.from(helperTags));
    note.shelfIds = dedupe(Array.from(nextShelfIds));
    note.directPageIds = dedupe(Array.from(nextPageIds));
    note.helperConfidence = confidence;
    note.sortState = sortState;
    note.status = note.archived ? 'archived' : status;
    note.helperSummary = helperSummary;
    note.placementDigest = buildPlacementDigest(note);
    note.preview = buildPreview(note.bodyText);
    if (!String(note.title || '').trim()) {
      note.title = buildAutoTitle(note.bodyText);
      note.aiNamed = true;
      note.aiTitle = true;
    }
  }

  function createNote({ title = '', bodyHTML = '', sourceType = 'normal', contextPageId = '', forceContext = false }) {
    const breadcrumb = contextPageId ? getPageUnderstanding(contextPageId) : null;
    const note = normalizeNote({
      id: makeId('note'),
      title,
      bodyHTML,
      sourceType,
      contextPageId,
      contextBreadcrumbIds: breadcrumb?.breadcrumbIds || [],
      contextBreadcrumbTitles: breadcrumb?.breadcrumbTitles || [],
      createdAt: now(),
      updatedAt: now(),
      shelfIds: [],
      directPageIds: [],
      helperTags: [],
      visibleTags: [],
      sortState: 'unsorted',
      status: 'normal',
      aiTitle: true,
      aiNamed: false,
      helperConfidence: 0,
      archived: false,
      needsReview: false,
    });
    if (!note) return null;
    processNotePlacement(note, { forceContext });
    notes.unshift(note);
    saveNotes();
    activeNoteId = note.id;
    addAction(note.id, 'create-note', sourceType === 'quick' ? 'Saved from Quick Note.' : 'Saved in Notes.');
    return note;
  }

  function updateNote(noteId, patch = {}) {
    const note = getNoteById(noteId);
    if (!note) return null;
    Object.assign(note, patch, { updatedAt: now() });
    note.bodyText = stripHTML(note.bodyHTML || '');
    note.preview = buildPreview(note.bodyText);
    if (!String(note.title || '').trim()) {
      note.title = buildAutoTitle(note.bodyText);
      note.aiNamed = true;
    }
    note.visibleTags = dedupe(extractHashtags(note.bodyText).map((tag) => `#${tag}`));
    saveNotes();
    return note;
  }

  function reprocessNote(noteId) {
    const note = getNoteById(noteId);
    if (!note) return;
    note.needsReview = false;
    processNotePlacement(note, { forceContext: note.sourceType === 'quick' && !!note.contextPageId });
    saveNotes();
  }

  function archiveNote(noteId) {
    const note = getNoteById(noteId);
    if (!note) return;
    note.archived = true;
    note.status = 'archived';
    note.updatedAt = now();
    saveNotes();
    addAction(note.id, 'archive-note', 'Moved to Archive.');
  }

  function unarchiveNote(noteId) {
    const note = getNoteById(noteId);
    if (!note) return;
    note.archived = false;
    note.status = note.needsReview ? 'review' : 'normal';
    note.updatedAt = now();
    saveNotes();
    addAction(note.id, 'restore-note', 'Restored from Archive.');
  }

  function linkNoteToPage(noteId, pageId, answer = '') {
    const note = getNoteById(noteId);
    if (!note || !pageId) return;
    note.directPageIds = dedupe([...(note.directPageIds || []), pageId]);
    note.shelfIds = dedupe([...(note.shelfIds || []), ensureContextShelf(pageId)].filter(Boolean));
    note.needsReview = false;
    note.sortState = note.shelfIds.length || note.directPageIds.length ? 'placed' : note.sortState;
    note.status = note.archived ? 'archived' : 'normal';
    note.helperSummary = `Linked to ${getPageById(pageId)?.title || 'that page'}.`;
    if (answer) note.helperTags = dedupe([...(note.helperTags || []), `answer:${slugify(answer).slice(0, 28)}`]);
    note.updatedAt = now();
    saveNotes();
    addAction(note.id, 'link-note', `Linked to ${getPageById(pageId)?.title || 'a page'}.`);
  }

  function setNoteShelfState(noteId, shelfId, checked) {
    const note = getNoteById(noteId);
    if (!note) return;
    if (checked) note.shelfIds = dedupe([...(note.shelfIds || []), shelfId]);
    else note.shelfIds = (note.shelfIds || []).filter((id) => id !== shelfId);
    note.updatedAt = now();
    note.sortState = note.shelfIds.length || note.directPageIds.length ? (note.needsReview ? 'review' : 'placed') : 'unsorted';
    saveNotes();
  }

  function buildFixedViews() {
    return [
      { id: 'all', label: 'All Notes' },
      { id: 'recent', label: 'Recent' },
      { id: 'unsorted', label: 'Unsorted' },
    ];
  }

  function getActiveNotesContextId() {
    return activeNotesView.type === 'page' ? activeNotesView.id : '';
  }

  function getDefaultNotesContextId() {
    const pages = Object.values(getPagesMap())
      .filter((page) => !['home', 'search', 'inbox', 'notes', 'settings'].includes(page.id));

    const withNotes = pages.filter((page) => countNotesForPage(page.id) > 0);
    return withNotes[0]?.id || pages[0]?.id || '';
  }

  function setActiveNotesContextId(pageId, options = {}) {
    const nextId = typeof pageId === 'string' ? pageId : '';
    if (!nextId || !getPageById(nextId)) return;

    activeNotesView = { type: 'page', id: nextId };

    const matchingNotes = getCurrentViewNotes();
    if (!options.preserveActiveNote || !matchingNotes.some((note) => note.id === activeNoteId)) {
      activeNoteId = matchingNotes[0]?.id || '';
    }

    if (typeof window.getCurrentPageId === 'function' && window.getCurrentPageId() === 'notes') {
      renderNotesSurface();
    }
  }

  function getCurrentViewNotes() {
    let filtered = notes.filter((note) => !note.archived);

    if (!notesGlobalSearch.trim()) {
      if (activeNotesView.type === 'view') {
        if (activeNotesView.id === 'recent') filtered = getNotesSorted(filtered).slice(0, 60);
        if (activeNotesView.id === 'unsorted') filtered = filtered.filter((note) => note.sortState === 'unsorted' || note.needsReview || note.status === 'review');
        if (activeNotesView.id === 'quick') filtered = filtered.filter((note) => note.sourceType === 'quick');
        if (activeNotesView.id === 'archive') filtered = notes.filter((note) => note.archived);
      }

      if (activeNotesView.type === 'shelf') {
        filtered = filtered.filter((note) => (note.shelfIds || []).includes(activeNotesView.id));
      }

      if (activeNotesView.type === 'page') {
        filtered = filtered.filter((note) => noteMatchesPageView(note, activeNotesView.id));
      }
    }

    filtered = filtered.filter((note) => noteMatchesListFilter(note, notesListFilter));

    if (notesSearch.trim()) {
      filtered = filtered.filter((note) => noteMatchesQuery(note, notesSearch));
    }

    if (notesGlobalSearch.trim()) {
      filtered = filtered.filter((note) => noteMatchesQuery(note, notesGlobalSearch));
    }

    return getNotesSorted(filtered);
  }

  function getNotesListFilterOption(filterId = notesListFilter) {
    return NOTES_LIST_FILTER_OPTIONS.find((option) => option.id === filterId) || NOTES_LIST_FILTER_OPTIONS[0];
  }

  function noteMatchesQuery(note, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    return (note.title || '').toLowerCase().includes(q)
      || (note.bodyText || '').toLowerCase().includes(q)
      || (note.preview || '').toLowerCase().includes(q);
  }

  function noteMatchesListFilter(note, filterId = 'all') {
    if (!note) return false;
    switch (filterId) {
      case 'review':
        return note.needsReview || note.status === 'review';
      case 'unsorted':
        return note.sortState === 'unsorted';
      case 'quick':
        return note.sourceType === 'quick';
      case 'linked':
        return Boolean((note.directPageIds || []).length || (note.contextBreadcrumbIds || []).length || (note.shelfIds || []).length);
      case 'all':
      default:
        return true;
    }
  }

  function noteMatchesPageView(note, pageId) {
    if (!note || !pageId) return false;
    if ((note.contextBreadcrumbIds || []).includes(pageId)) return true;

    if ((note.directPageIds || []).some((id) => {
      if (id === pageId) return true;
      return getBreadcrumb(id).some((item) => item.id === pageId);
    })) return true;

    return (note.shelfIds || []).some((shelfId) => {
      const shelf = getShelfById(shelfId);
      if (!shelf?.linkedPageId) return false;
      if (shelf.linkedPageId === pageId) return true;
      return getBreadcrumb(shelf.linkedPageId).some((item) => item.id === pageId);
    });
  }

  function countNotesForPage(pageId) {
    return notes.filter((note) => !note.archived && noteMatchesPageView(note, pageId)).length;
  }

  function getLinkedPageChildren(parentId = '') {
    return Object.values(getPagesMap())
      .filter((page) => !['home', 'search', 'inbox', 'notes', 'settings'].includes(page.id))
      .filter((page) => (page.parent || '') === (parentId || ''))
      .sort((a, b) => {
        if (a.type === 'domain' && b.type !== 'domain') return -1;
        if (a.type !== 'domain' && b.type === 'domain') return 1;
        return (a.title || '').localeCompare(b.title || '');
      });
  }

  function isNotesFolderExpanded(folderId, depth = 0) {
    if (typeof notesFolderState[folderId] === 'boolean') return notesFolderState[folderId];
    return depth < 1;
  }

  function buildLinkedPageTreeHTML(parentId = '', depth = 0) {
    return getLinkedPageChildren(parentId)
      .map((page) => {
        const childHTML = buildLinkedPageTreeHTML(page.id, depth + 1);
        const count = countNotesForPage(page.id);
        const isStructuralNode = page.type === 'domain'
          || page.containerType === 'hub'
          || page.containerType === 'project'
          || !!childHTML;

        if (!count && !childHTML && !isStructuralNode) return '';

        const hasChildren = !!childHTML;
        const expanded = hasChildren ? isNotesFolderExpanded(page.id, depth) : false;

        return `
          <div class="notes-folder-node depth-${depth} ${expanded ? 'expanded' : 'collapsed'}">
            <div class="notes-folder-row">
              ${hasChildren
                ? `<button class="notes-folder-caret" data-folder-toggle="${page.id}" aria-label="Toggle ${escapeHTML(page.title || 'folder')}"><span class="notes-folder-caret-glyph" aria-hidden="true">&#9656;</span></button>`
                : '<span class="notes-folder-caret notes-folder-caret-spacer"></span>'}
              <button class="notes-folder-btn ${activeNotesView.type === 'page' && activeNotesView.id === page.id ? 'active' : ''}" data-folder-open="${page.id}">
                <span class="notes-folder-name">${escapeHTML(page.title || 'Untitled')}</span>
              </button>
            </div>
            ${hasChildren ? `<div class="notes-folder-children">${childHTML}</div>` : ''}
          </div>
        `;
      })
      .join('');
  }

  function getRelatedNotesForPage(pageId) {
    if (!pageId || ['home', 'search', 'inbox', 'notes', 'settings'].includes(pageId)) return [];
    const breadcrumb = getBreadcrumb(pageId)
      .filter((item) => !['home', 'search', 'inbox', 'notes', 'settings'].includes(item.id));
    const pageIds = new Set(breadcrumb.map((item) => item.id));
    const contextShelfIds = breadcrumb.map((item) => ensureContextShelf(item.id)).filter(Boolean);

    return getNotesSorted(notes.filter((note) => {
      if (note.archived) return false;
      const directMatch = (note.directPageIds || []).some((id) => pageIds.has(id) || getBreadcrumb(id).some((item) => pageIds.has(item.id)));
      const shelfMatch = (note.shelfIds || []).some((id) => contextShelfIds.includes(id));
      return directMatch || shelfMatch;
    }));
  }

  function buildShelfTreeHTML(parentId = '', depth = 0) {
    return getShelfChildren(parentId)
      .filter((shelf) => notes.some((note) => (note.shelfIds || []).includes(shelf.id)) || shelf.kind !== 'context')
      .map((shelf) => {
        const count = notes.filter((note) => !note.archived && (note.shelfIds || []).includes(shelf.id)).length;
        const children = depth < 1 ? buildShelfTreeHTML(shelf.id, depth + 1) : '';
        return `
          <div class="notes-shelf-node depth-${depth}">
            <button class="notes-shelf-btn ${activeNotesView.type === 'shelf' && activeNotesView.id === shelf.id ? 'active' : ''}" data-shelf-open="${shelf.id}">
              <span>${escapeHTML(shelf.name)}</span>
              <span class="notes-shelf-count">${count}</span>
            </button>
            ${children ? `<div class="notes-shelf-children">${children}</div>` : ''}
          </div>
        `;
      }).join('');
  }

  function noteRowHTML(note) {
    return `
      <button class="notes-row ${note.id === activeNoteId ? 'active' : ''}" data-note-open="${note.id}">
        <span class="notes-row-main">
          <span class="notes-row-icon-slot" aria-hidden="true"></span>
          <span class="notes-row-title-wrap">
            <span class="notes-row-title">${escapeHTML(note.title || 'Untitled page')}</span>
            ${note.needsReview || note.status === 'review' ? '<span class="notes-row-flag">Needs review</span>' : ''}
          </span>
        </span>
      </button>
    `;
  }

  function allNotesPanesOpen() {
    return !!(notesLayoutState.shelvesOpen && notesLayoutState.listOpen);
  }

  function noteActionMenuHTML(note = null) {
    if (!note) return '';
    const menuId = `note-menu-${Date.now()}`;
    return `
      <div class="notes-editor-menu-wrapper">
        <button class="notes-editor-menu-btn" data-notes-menu-toggle="${menuId}" aria-label="Options">⋯</button>
        <div class="notes-editor-menu" id="${menuId}" style="display:none;">
          ${note.archived ? '<button class="notes-menu-item" data-note-restore="1">Restore</button>' : '<button class="notes-menu-item" data-note-archive="1">Move to Trash</button>'}
          <button class="notes-menu-item" data-note-reprocess="1">Re-check</button>
        </div>
      </div>
    `;
  }

  function noteToolsHTML() {
    return `
      <div class="notes-editor-tools">
        <button class="notes-editor-tool-btn" data-note-cmd="bold" title="Bold"><b>B</b></button>
        <button class="notes-editor-tool-btn" data-note-cmd="italic" title="Italic"><i>I</i></button>
        <button class="notes-editor-tool-btn" data-note-cmd="insertUnorderedList" title="List">•</button>
        <button class="notes-editor-tool-btn" data-note-cmd="insertOrderedList" title="Numbered">1</button>
        <button class="notes-editor-tool-btn" data-note-cmd="formatBlock" data-note-value="h3" title="Heading">H</button>
        <button class="notes-editor-tool-btn" data-note-link="1" title="Link">🔗</button>
      </div>
    `;
  }

  function notesMasterToggleHTML() {
    const isOpen = allNotesPanesOpen();
    const label = isOpen ? 'Close notes side panels' : 'Open notes side panels';
    return `
      <button class="notes-master-toggle" data-notes-toggle="all" data-notes-state="${isOpen ? 'open' : 'closed'}" aria-label="${label}" title="${label}">
        <svg class="notes-master-toggle-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="2" width="14" height="16" rx="2" />
          <line x1="7" y1="2" x2="7" y2="18" />
          <line x1="10" y1="6" x2="15" y2="6" />
          <line x1="10" y1="9" x2="15" y2="9" />
          <line x1="10" y1="12" x2="13" y2="12" />
        </svg>
      </button>
    `;
  }

  function syncNotesLayoutStateInDOM({ refocusEditor = false } = {}) {
    const surface = document.querySelector('.notes-surface.notes-surface-onenote');
    const collapseShelves = !notesLayoutState.shelvesOpen;
    const collapseList = !notesLayoutState.listOpen;

    if (surface) {
      surface.classList.toggle('notes-shelves-collapsed', collapseShelves);
      surface.classList.toggle('notes-list-collapsed', collapseList);
    }

    // Force synchronous reflow so the browser recalculates the grid
    // layout before painting — prevents stale-frame rendering glitch.
    if (surface) void surface.offsetWidth;

    const masterToggle = document.querySelector('.notes-master-toggle[data-notes-toggle="all"]');
    if (masterToggle) {
      const label = allNotesPanesOpen() ? 'Close notes side panels' : 'Open notes side panels';
      masterToggle.setAttribute('aria-label', label);
      masterToggle.setAttribute('title', label);
      masterToggle.setAttribute('data-notes-state', allNotesPanesOpen() ? 'open' : 'closed');
    }

    if (refocusEditor) {
      setTimeout(() => {
        document.getElementById('noteEditor')?.focus();
      }, 0);
    }
  }

  function emptyEditorHTML(layoutState = {}) {
    return `
      <div class="note-editor-wrap note-editor-wrap-full notes-empty-editor-shell">
        <div class="note-page-workspace note-page-workspace-empty">
          <div class="notes-empty-editor">
            <div class="notes-empty-editor-card">
              <div class="notes-empty-editor-title">Nothing is open yet.</div>
              <p class="notes-empty-editor-copy">Use the notebook button in the upper left to reopen the side panels or add a new page here.</p>
              <button class="notes-create-btn" data-notes-create="1">+ New Page</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function ensureNotesTopbarCenter() {
    let host = document.getElementById('topbarCenter') || document.querySelector('.topbar-center');
    if (host) return host;
    const topbar = document.querySelector('.topbar');
    const topbarRight = document.querySelector('.topbar-right');
    if (!topbar) return null;
    host = document.createElement('div');
    host.className = 'topbar-center';
    host.id = 'topbarCenter';
    topbar.insertBefore(host, topbarRight || null);
    return host;
  }

  function syncNotesTopbarSearch(visible = false) {
    const host = ensureNotesTopbarCenter();
    const existing = document.getElementById('notesTopbarSearchWrap');

    if (!visible) {
      existing?.remove();
      host?.classList.remove('notes-topbar-center-active');
      return;
    }

    if (!host) return;
    host.classList.add('notes-topbar-center-active');

    if (!existing) {
      const wrap = document.createElement('label');
      wrap.id = 'notesTopbarSearchWrap';
      wrap.className = 'notes-topbar-search';
      wrap.setAttribute('aria-label', 'Search all notes');
      wrap.innerHTML = `
        <span class="notes-topbar-search-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="7"></circle>
            <path d="M20 20l-3.5-3.5"></path>
          </svg>
        </span>
        <input id="notesGlobalSearchInput" class="notes-topbar-search-input" placeholder="Search all notes" autocomplete="off" value="${escapeHTML(notesGlobalSearch)}" />
      `;
      host.appendChild(wrap);
      return;
    }

    const input = existing.querySelector('#notesGlobalSearchInput');
    if (input && input.value !== notesGlobalSearch) {
      input.value = notesGlobalSearch;
    }
  }

  function closeNotesFilterMenu() {
    const menu = document.getElementById('notesFilterMenu');
    if (!menu) return;
    menu.remove();
    if (typeof window.setUIState === 'function') {
      window.setUIState({ openOverlay: null });
    }
  }

  function openNotesFilterMenu(anchorEl) {
    if (!anchorEl) return;

    const existing = document.getElementById('notesFilterMenu');
    if (existing) {
      closeNotesFilterMenu();
      return;
    }

    if (typeof window.closeAllOverlays === 'function') {
      window.closeAllOverlays();
    }

    const menu = document.createElement('div');
    menu.className = 'topbar-dropdown notes-filter-menu';
    menu.id = 'notesFilterMenu';
    menu.dataset.uiId = 'notesFilterMenu';

    NOTES_LIST_FILTER_OPTIONS.forEach((option) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `notes-filter-menu-option ${option.id === notesListFilter ? 'active' : ''}`;
      btn.innerHTML = `
        <span class="notes-filter-menu-option-label">${escapeHTML(option.label)}</span>
        <span class="notes-filter-menu-option-check" aria-hidden="true">${option.id === notesListFilter ? '✓' : ''}</span>
      `;
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        notesListFilter = option.id;
        closeNotesFilterMenu();
        renderNotesSurface();
      });
      menu.appendChild(btn);
    });

    document.body.appendChild(menu);

    const rect = anchorEl.getBoundingClientRect();
  const menuWidth = menu.offsetWidth || 164;
    const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
    menu.style.top = `${rect.bottom + 8}px`;
    menu.style.left = `${left}px`;

    if (typeof window.openOverlay === 'function') {
      window.openOverlay('notesFilterMenu', menu);
    }
  }

  function renderNotesSurface() {
    const pageContent = document.getElementById('pageContent');
    const grid = document.getElementById('grid');
    if (!pageContent || !grid) return;

    flushPendingNoteSave();

    const activeElementId = document.activeElement?.id || '';
    const shouldRestoreNotesSearch = activeElementId === 'notesSearchInput';
    const shouldRestoreGlobalSearch = activeElementId === 'notesGlobalSearchInput';

    const pageId = typeof window.getCurrentPageId === 'function' ? window.getCurrentPageId() : 'home';
    const hero = document.getElementById('pageHero');
    const pageCanvas = document.getElementById('pageCanvas');
    const isNotes = pageId === 'notes';

    if (!isNotes) return;

    const activeContextId = getActiveNotesContextId() || getDefaultNotesContextId();
    if (activeContextId && activeContextId !== getActiveNotesContextId()) {
      activeNotesView = { type: 'page', id: activeContextId };
    }

    const viewNotes = getCurrentViewNotes();
    if (!activeNoteId || !viewNotes.some((note) => note.id === activeNoteId)) {
      activeNoteId = viewNotes[0]?.id || '';
    }
    const active = activeNoteId ? getNoteById(activeNoteId) : null;
    const hasGlobalNotesSearch = !!notesGlobalSearch.trim();
    const activeViewLabel = hasGlobalNotesSearch ? 'All Notes' : (getPageById(getActiveNotesContextId())?.title || 'All Notes');
    const activeViewSubtitle = hasGlobalNotesSearch
      ? `${viewNotes.length} result${viewNotes.length === 1 ? '' : 's'}`
      : `${viewNotes.length} page${viewNotes.length === 1 ? '' : 's'}`;
    const activeFilterLabel = getNotesListFilterOption().label;
    const notebookTreeHTML = buildLinkedPageTreeHTML('', 0);
    const surfaceClassName = [
      'notes-surface',
      'notes-surface-onenote',
      notesLayoutState.shelvesOpen ? '' : 'notes-shelves-collapsed',
      notesLayoutState.listOpen ? '' : 'notes-list-collapsed'
    ].filter(Boolean).join(' ');

    pageContent.classList.add('system-page-content');
    pageCanvas?.classList.add('system-page-canvas');
    grid.style.display = 'none';
    if (hero) hero.style.display = 'none';
    syncNotesTopbarSearch(true);
    closeNotesFilterMenu();

    pageContent.innerHTML = `
      <section class="${surfaceClassName}">
        ${notesMasterToggleHTML()}
        <aside class="notes-rail notes-rail-primary notes-notebook-pane">
          <div class="notes-pane-header notes-notebook-header">
            <div class="notes-rail-title">Notebooks</div>
          </div>
          <div class="notes-folder-tree">
            ${notebookTreeHTML || '<div class="notes-empty-tiny">No notebooks yet.</div>'}
          </div>
        </aside>

        <section class="notes-rail notes-list-pane">
          <div class="notes-pane-header notes-list-header">
            <div class="notes-list-header-top">
              <div class="notes-list-heading">
                <div class="notes-main-title">${escapeHTML(activeViewLabel)}</div>
                <div class="notes-main-subtitle">${activeViewSubtitle}</div>
              </div>
              <button class="notes-list-create-btn" data-notes-create="1" aria-label="Create a new page" title="Create a new page">
                <span class="notes-list-create-plus" aria-hidden="true">+</span>
                <span>New Page</span>
              </button>
            </div>
            <div class="notes-list-toolbar">
              <label class="notes-search-field" aria-label="Search pages">
                <span class="notes-search-field-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="7"></circle>
                    <path d="M20 20l-3.5-3.5"></path>
                  </svg>
                </span>
                <input class="notes-search-input notes-search-input-chrome" id="notesSearchInput" placeholder="Search pages" aria-label="Search pages" value="${escapeHTML(notesSearch)}" />
              </label>
              <button class="notes-list-filter-btn ${notesListFilter !== 'all' ? 'active' : ''}" data-notes-filter-toggle="1" aria-label="Filter pages" title="Filter pages: ${escapeHTML(activeFilterLabel)}">
                <svg class="notes-list-filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M4 6h16l-6 7v5l-4 2v-7z"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="notes-list notes-list-rows" id="notesList">
            ${viewNotes.length ? viewNotes.map((note) => noteRowHTML(note)).join('') : '<div class="notes-empty-large">No notes in this view yet.</div>'}
          </div>
        </section>

        <section class="notes-editor-pane">
          ${active ? editorHTML(active, notesLayoutState) : emptyEditorHTML(notesLayoutState)}
        </section>
      </section>
    `;

    // Auto-focus editor for better UX
    setTimeout(() => {
      if (shouldRestoreGlobalSearch) {
        const globalSearchInput = document.getElementById('notesGlobalSearchInput');
        globalSearchInput?.focus();
        globalSearchInput?.setSelectionRange(globalSearchInput.value.length, globalSearchInput.value.length);
        return;
      }

      if (shouldRestoreNotesSearch) {
        const notesSearchInput = document.getElementById('notesSearchInput');
        notesSearchInput?.focus();
        notesSearchInput?.setSelectionRange(notesSearchInput.value.length, notesSearchInput.value.length);
        return;
      }

      const editor = document.getElementById('noteEditor');
      if (editor && active) {
        editor.focus();
        // Ensure content is visible by moving cursor to start if editor appears empty
        if (!editor.textContent?.trim() && editor.innerHTML) {
          const range = document.createRange();
          const sel = window.getSelection();
          range.setStart(editor, 0);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }, 50);
  }

  function editorHTML(note, layoutState = {}) {
    const relatedPages = (note.directPageIds || []).map((pageId) => getPageById(pageId)).filter(Boolean);
    const primaryLinkedPage = relatedPages[0] || null;

    return `
      <div class="note-editor-wrap note-editor-wrap-full" data-note-editor="${note.id}">
        <div class="note-page-workspace">
          <div class="note-page-surface">
            <div class="note-editor-header-row">
              <div class="note-editor-header-main">
                <div class="note-editor-title-row">
                  <input id="noteTitleInput" class="note-title-input note-title-input-full" value="${escapeHTML(note.title || '')}" placeholder="Untitled note" />
                  <div class="note-editor-inline-tools">
                    ${noteToolsHTML()}
                    ${noteActionMenuHTML(note)}
                  </div>
                </div>
                <div class="note-editor-context-row">
                  <div class="note-editor-meta-line">
                    <span class="note-editor-date">${escapeHTML(formatDateTime(note.updatedAt || note.createdAt))}</span>
                    ${primaryLinkedPage ? `<button class="note-chip buttonish" data-open-linked-page="${primaryLinkedPage.id}">${escapeHTML(primaryLinkedPage.title)}</button>` : ''}
                    ${note.needsReview || note.status === 'review' ? '<span class="notes-row-flag notes-row-flag-inline">Needs review</span>' : ''}
                  </div>
                </div>
                <div class="note-editor-divider" aria-hidden="true"></div>
              </div>
            </div>

            <div id="noteEditor" class="note-editor note-editor-page" contenteditable="true" spellcheck="true" tabindex="0" role="textbox" aria-label="Note body" aria-multiline="true">${note.bodyHTML || ''}</div>
          </div>
        </div>
      </div>
    `;
  }

  function buildShelfChecklist(note) {
    return shelves
      .filter((shelf) => shelf.kind !== 'context' || (note.shelfIds || []).includes(shelf.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((shelf) => {
        const checked = (note.shelfIds || []).includes(shelf.id);
        return `
          <label class="notes-shelf-check">
            <input type="checkbox" data-note-shelf-toggle="${shelf.id}" ${checked ? 'checked' : ''} />
            <span>${escapeHTML(shelf.name)}</span>
          </label>
        `;
      }).join('');
  }

  function renderInboxSurface() {
    const pageContent = document.getElementById('pageContent');
    const pageCanvas = document.getElementById('pageCanvas');
    const grid = document.getElementById('grid');
    if (!pageContent || !grid) return;
    const pageId = typeof window.getCurrentPageId === 'function' ? window.getCurrentPageId() : 'home';
    const hero = document.getElementById('pageHero');
    const isInbox = pageId === 'inbox';
    if (!isInbox) return;

    const openItems = inboxItems.filter((item) => item.status === 'open');
    pageContent.classList.add('system-page-content');
    pageCanvas?.classList.add('system-page-canvas');
    grid.style.display = 'none';
    if (hero) hero.style.display = 'none';

    pageContent.innerHTML = `
      <section class="helper-inbox-surface">
        <div class="helper-inbox-hero">
          <div>
            <div class="notes-kicker">Inbox</div>
            <h2>Helper questions</h2>
            <p>Items the helper needs your input on before acting.</p>
          </div>
          <div class="helper-inbox-stats">
            <div class="helper-inbox-stat"><span>${openItems.length}</span><label>Open</label></div>
            <div class="helper-inbox-stat"><span>${notes.filter((n) => n.needsReview).length}</span><label>Review</label></div>
            <div class="helper-inbox-stat"><span>${actionLog.length}</span><label>Logged</label></div>
          </div>
        </div>

        <div class="helper-inbox-list">
          ${openItems.length ? openItems.map((item) => inboxCardHTML(item)).join('') : '<div class="notes-empty-large">Nothing here yet.</div>'}
        </div>
      </section>
    `;
  }

  function inboxCardHTML(item) {
    const note = getNoteById(item.noteId);
    const suggestedPage = item.suggestedPageId ? getPageById(item.suggestedPageId) : null;
    return `
      <article class="helper-inbox-card">
        <div class="helper-inbox-card-top">
          <div class="helper-inbox-card-head">
            <div class="helper-inbox-card-title">${escapeHTML(item.title)}</div>
            <div class="helper-inbox-card-question">${escapeHTML(item.question)}</div>
          </div>
          <span class="notes-pill ${item.confidence >= 0.95 ? 'strong' : item.confidence >= 0.75 ? 'review' : ''}">${Math.round(item.confidence * 100)}%</span>
        </div>
        ${note ? `<div class="helper-inbox-note-preview">${escapeHTML(note.preview || note.title)}</div>` : ''}
        ${item.reason ? `<div class="helper-inbox-reason">${escapeHTML(item.reason)}</div>` : ''}
        ${suggestedPage ? `<div class="helper-inbox-suggestion">Suggested: <strong>${escapeHTML(suggestedPage.title)}</strong></div>` : ''}
        <div class="helper-inbox-actions-row">
          <select class="helper-inbox-select" data-inbox-page-select="${item.id}">
            <option value="">Pick a page…</option>
            ${buildPageOptions(item.suggestedPageId)}
          </select>
          <textarea class="helper-inbox-answer" data-inbox-answer="${item.id}" placeholder="Optional note for the helper…">${escapeHTML(item.answer || '')}</textarea>
        </div>
        <div class="helper-inbox-actions">
          ${suggestedPage ? `<button class="notes-mini-btn" data-inbox-accept="${item.id}">Accept</button>` : ''}
          <button class="notes-mini-btn" data-inbox-link="${item.id}">Link page</button>
          <button class="notes-mini-btn" data-inbox-loose="${item.id}">Keep loose</button>
          <button class="notes-mini-btn danger" data-inbox-resolve="${item.id}">Dismiss</button>
        </div>
      </article>
    `;
  }

  function buildPageOptions(selectedPageId = '') {
    const pages = Object.values(getPagesMap())
      .filter((page) => !['home', 'search', 'inbox', 'notes', 'settings'].includes(page.id))
      .sort((a, b) => a.title.localeCompare(b.title));
    return pages.map((page) => `<option value="${page.id}" ${page.id === selectedPageId ? 'selected' : ''}>${escapeHTML(getBreadcrumb(page.id).map((item) => item.title).join(' / '))}</option>`).join('');
  }

  function renderPageRelatedNotes() {
    const pageContent = document.getElementById('pageContent');
    const pageCanvas = document.getElementById('pageCanvas');
    const grid = document.getElementById('grid');
    const heroBelow = document.getElementById('pageHeroBelow');
    if (!pageContent || !grid) return;
    const pageId = typeof window.getCurrentPageId === 'function' ? window.getCurrentPageId() : 'home';

    // Clean up previous badge
    document.getElementById('pageNotesBadge')?.remove();
    pageContent.innerHTML = '';

    if (['notes', 'inbox', 'search', 'home', 'settings'].includes(pageId)) return;

    const related = getRelatedNotesForPage(pageId).slice(0, 8);
    pageContent.classList.remove('system-page-content');
    pageCanvas?.classList.remove('system-page-canvas');
    grid.style.display = '';

    if (!related.length || !heroBelow) return;

    // Inject badge into hero-below (beside the title)
    const badge = document.createElement('div');
    badge.id = 'pageNotesBadge';
    badge.className = 'page-notes-badge';
    badge.innerHTML = `
      <button class="page-notes-toggle" id="pageNotesToggle">
        <span class="page-notes-toggle-label">\uD83D\uDCDD ${related.length} note${related.length === 1 ? '' : 's'}</span>
        <span class="page-notes-chevron" id="pageNotesChevron">&#x25B8;</span>
      </button>
      <div class="page-notes-tray" id="pageNotesTray">
        ${related.map((note) => `
          <button class="page-notes-item" data-open-note-in-notes="${note.id}">
            <span class="page-notes-item-title">${escapeHTML(note.title || 'Untitled')}</span>
            <span class="page-notes-item-preview">${escapeHTML(note.preview || '')}</span>
          </button>
        `).join('')}
        <div class="page-notes-tray-actions">
          <button class="page-notes-action" id="pageQuickNoteBtn">+ Note</button>
          <button class="page-notes-action" id="pageOpenNotesBtn">All Notes</button>
        </div>
      </div>
    `;
    heroBelow.appendChild(badge);
  }

  function clearSystemSurfaceIfNeeded() {
    const pageContent = document.getElementById('pageContent');
    const pageCanvas = document.getElementById('pageCanvas');
    const grid = document.getElementById('grid');
    if (!pageContent || !grid) return;
    const pageId = typeof window.getCurrentPageId === 'function' ? window.getCurrentPageId() : 'home';

    document.body.classList.remove('notes-mode');
    document.getElementById('pageNotesBadge')?.remove();

    if (pageId !== 'notes') {
      syncNotesTopbarSearch(false);
      closeNotesFilterMenu();
    }

    if (pageId === 'notes') return renderNotesSurface();
    if (pageId === 'inbox') return renderInboxSurface();
    if (['search', 'home', 'settings'].includes(pageId)) {
      pageContent.innerHTML = '';
      pageContent.classList.remove('system-page-content');
      pageCanvas?.classList.remove('system-page-canvas');
      grid.style.display = '';
      return;
    }
    renderPageRelatedNotes();
  }

  function openNoteInNotes(noteId) {
    const note = getNoteById(noteId);
    activeNoteId = noteId;
    const nextContextId = note?.contextPageId
      || note?.directPageIds?.[0]
      || [...(note?.contextBreadcrumbIds || [])].reverse().find((id) => !['home', 'search', 'inbox', 'notes', 'settings'].includes(id))
      || getDefaultNotesContextId();

    if (nextContextId) {
      activeNotesView = { type: 'page', id: nextContextId };
    }

    openPageSafe('notes');
    setTimeout(renderNotesSurface, 0);
  }

  function ensureQuickNoteUI() {
    if (document.getElementById('quickNoteOverlay')) return;
    const overlay = document.createElement('div');
    overlay.className = 'quick-note-overlay';
    overlay.id = 'quickNoteOverlay';
    overlay.innerHTML = `
      <div class="quick-note-modal">
        <div class="quick-note-top">
          <div class="quick-note-heading">
            <div class="quick-note-title">Quick Note</div>
            <div class="quick-note-context" id="quickNoteContext"></div>
          </div>
          <button class="quick-note-close" id="quickNoteClose">✕</button>
        </div>
        <input id="quickNoteTitle" class="quick-note-title-input" placeholder="Title (optional)" />
        <textarea id="quickNoteBody" class="quick-note-body" placeholder="Write anything…"></textarea>
        <div class="quick-note-actions">
          <button class="notes-mini-btn" id="quickNoteCancel">Cancel</button>
          <button class="notes-create-btn" id="quickNoteSave">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  function openQuickNote(contextPageId = '') {
    ensureQuickNoteUI();
    activeComposerContextPageId = contextPageId || '';
    const overlay = document.getElementById('quickNoteOverlay');
    const context = document.getElementById('quickNoteContext');
    const title = document.getElementById('quickNoteTitle');
    const body = document.getElementById('quickNoteBody');
    const understanding = contextPageId ? getPageUnderstanding(contextPageId) : null;
    if (context) context.textContent = understanding ? `Saving from ${understanding.breadcrumbTitles.join(' / ')}` : 'Saving into Notes';
    if (title) title.value = '';
    if (body) body.value = '';
    overlay?.classList.add('open');
    setTimeout(() => body?.focus(), 30);
  }

  function closeQuickNote() {
    document.getElementById('quickNoteOverlay')?.classList.remove('open');
    activeComposerContextPageId = '';
  }

  function getAssistantDisplayName() {
    return activeUser.assistantName || 'Assistant';
  }

  function ensureAssistantUI() {
    if (!document.getElementById('assistantTopBtn')) {
      const topbarRight = document.querySelector('.topbar-right');
      const moreBtn = document.getElementById('moreBtn');
      if (topbarRight && moreBtn) {
        const btn = document.createElement('button');
        btn.className = 'icon-btn topbar-ask-btn';
        btn.id = 'assistantTopBtn';
        btn.setAttribute('aria-label', `Ask ${getAssistantDisplayName()}`);
        btn.textContent = 'Ask';
        topbarRight.insertBefore(btn, moreBtn);
      }
    }

    if (document.getElementById('assistantDrawer')) {
      const titleEl = document.querySelector('#assistantDrawer .assistant-drawer-title');
      if (titleEl) titleEl.textContent = `Ask ${getAssistantDisplayName()}`;
      return;
    }

    const drawer = document.createElement('aside');
    drawer.className = 'assistant-drawer assistant-drawer-right';
    drawer.id = 'assistantDrawer';
    drawer.innerHTML = `
      <div class="assistant-drawer-top">
        <div class="assistant-drawer-title">Ask ${escapeHTML(getAssistantDisplayName())}</div>
        <button class="assistant-drawer-close" id="assistantDrawerClose">✕</button>
      </div>
      <div class="assistant-messages" id="assistantMessages"></div>
      <div class="assistant-composer">
        <div class="assistant-composer-row">
          <textarea class="assistant-composer-input" id="assistantComposerInput" rows="1" placeholder="Ask about notes, pages, or what you were working on…"></textarea>
          <button class="assistant-composer-send" id="assistantComposerSend" aria-label="Send">→</button>
        </div>
      </div>
    `;
    document.body.appendChild(drawer);
  }

  function formatAssistantMessageText(text = '') {
    return escapeHTML(String(text || '')).replace(/\n/g, '<br>');
  }

  function formatAssistantActionDetail(action = {}) {
    const parts = [];
    if (action.detail) parts.push(escapeHTML(action.detail));
    if (Number.isFinite(Number(action.confidence)) && Number(action.confidence) > 0) {
      parts.push(`${Math.round(Number(action.confidence) * 100)}% confidence`);
    }
    return parts.length ? `<div class="assistant-action-detail">${parts.join(' · ')}</div>` : '';
  }

  function renderAssistantActions(message = {}) {
    const actions = Array.isArray(message.actions) ? message.actions.filter(Boolean) : [];
    if (!actions.length) return '';

    const buttons = actions.map((action) => {
      if (action.type === 'create-layout') {
        if (action.status === 'done') {
          return `
            <div class="assistant-action-item assistant-layout-proposal done">
              <div class="assistant-layout-result">${escapeHTML(action.resultText || action.label)}</div>
            </div>
          `;
        }
        const blockCount = Array.isArray(action.blocks) ? action.blocks.length : 0;
        const targetDesc = action.targetPage === 'new' && action.newPageTitle
          ? `New page: "${escapeHTML(action.newPageTitle)}"`
          : 'Current page';
        const typeCounts = {};
        (action.blocks || []).forEach((b) => { typeCounts[b.type] = (typeCounts[b.type] || 0) + 1; });
        const summary = Object.entries(typeCounts).map(([t, n]) => `${n} ${t}`).join(', ') || `${blockCount} block${blockCount !== 1 ? 's' : ''}`;
        return `
          <div class="assistant-action-item assistant-layout-proposal">
            <div class="assistant-layout-header">Board Layout Proposal</div>
            <div class="assistant-layout-meta">${targetDesc} &middot; ${escapeHTML(summary)}</div>
            <div class="assistant-layout-btns">
              <button
                class="assistant-action-btn"
                data-assistant-action-message="${escapeHTML(message.id)}"
                data-assistant-action-id="${escapeHTML(action.id)}"
              >Apply Layout</button>
              <button
                class="assistant-action-btn assistant-action-discard"
                data-layout-discard-message="${escapeHTML(message.id)}"
                data-layout-discard-id="${escapeHTML(action.id)}"
              >Discard</button>
            </div>
            ${formatAssistantActionDetail(action)}
          </div>
        `;
      }
      return `
        <div class="assistant-action-item">
          <button
            class="assistant-action-btn ${action.status === 'done' ? 'done' : ''}"
            data-assistant-action-message="${escapeHTML(message.id)}"
            data-assistant-action-id="${escapeHTML(action.id)}"
            ${action.status === 'done' ? 'disabled' : ''}
          >${escapeHTML(action.status === 'done' ? (action.resultText || action.label) : action.label)}</button>
          ${formatAssistantActionDetail(action)}
        </div>
      `;
    }).join('');

    return `<div class="assistant-action-list">${buttons}</div>`;
  }

  function renderAssistantMessages() {
    const host = document.getElementById('assistantMessages');
    if (!host) return;
    if (!chatMessages.length && !activeAssistantBusy) {
      host.innerHTML = `
        <div class="assistant-empty">
          <div class="assistant-empty-title">No messages yet</div>
          <p>Ask about this page, your notes, or something you want ${escapeHTML(getAssistantDisplayName())} to find.</p>
        </div>
      `;
      return;
    }

    const messagesHTML = chatMessages.map((message) => `
      <div class="assistant-message ${message.role}">
        <div class="assistant-message-role">${escapeHTML(message.role === 'assistant' ? getAssistantDisplayName() : activeUser.displayName || 'You')}</div>
        ${message.text ? `<div class="assistant-message-text">${formatAssistantMessageText(message.text)}</div>` : ''}
        ${message.role === 'assistant' ? renderAssistantActions(message) : ''}
      </div>
    `).join('');

    const busyHTML = activeAssistantBusy
      ? `
        <div class="assistant-message system">
          <div class="assistant-message-role">${escapeHTML(getAssistantDisplayName())}</div>
          <div class="assistant-message-text">Thinking…</div>
        </div>
      `
      : '';

    host.innerHTML = `${messagesHTML}${busyHTML}`;
    host.scrollTop = host.scrollHeight;
  }

  function updateChatMessage(messageId, updater) {
    const idx = chatMessages.findIndex((message) => message.id === messageId);
    if (idx === -1) return null;
    const current = chatMessages[idx];
    const next = typeof updater === 'function' ? updater({ ...current }) : { ...current, ...(updater || {}) };
    chatMessages[idx] = next;
    saveChat();
    renderAssistantMessages();
    return next;
  }

  function pushChat(role, text, options = {}) {
    chatMessages.push({
      id: makeId('msg'),
      role,
      text,
      actions: Array.isArray(options.actions) ? options.actions.map(normalizeChatAction).filter(Boolean) : [],
      createdAt: now(),
    });
    saveChat();
    renderAssistantMessages();
  }

  function searchNotes(query) {
    const qTokens = tokenize(query);
    const scored = notes
      .filter((note) => !note.archived)
      .map((note) => {
        let score = 0;
        const hay = `${(note.title || '').toLowerCase()} ${(note.bodyText || '').toLowerCase()} ${(note.preview || '').toLowerCase()}`;
        qTokens.forEach((token) => {
          if (hay.includes(token)) score += 1;
        });
        return { note, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return scored.map((entry) => entry.note);
  }

  function searchPages(query) {
    const qTokens = tokenize(query);
    const scored = Object.values(getPagesMap())
      .filter((page) => !['home', 'search', 'inbox', 'notes', 'settings'].includes(page.id))
      .map((page) => {
        const hay = `${(page.title || '').toLowerCase()} ${getPageDescriptorText(page.id).toLowerCase()}`;
        let score = 0;
        qTokens.forEach((token) => {
          if (hay.includes(token)) score += 1;
        });
        return { page, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    return scored.map((entry) => entry.page);
  }

  function buildAssistantRequestContext(query) {
    const currentPageId = typeof window.getCurrentPageId === "function" ? window.getCurrentPageId() : "home";
    const currentPage = getPageUnderstanding(currentPageId || "home");
    const activeNote = getLiveEditorNoteDraft() || getNoteById(activeNoteId);
    const relatedNotes = getRelatedNotesForPage(currentPage.pageId).slice(0, 8).map((note) => ({
      id: note.id,
      title: note.title || "Untitled note",
      preview: note.preview || buildPreview(note.bodyText || ""),
      shelfNames: (note.shelfIds || []).map((id) => getShelfById(id)?.name).filter(Boolean),
      linkedPages: (note.directPageIds || []).map((id) => getPageById(id)?.title).filter(Boolean),
    }));

    const noteMatches = searchNotes(query).map((note) => ({
      id: note.id,
      title: note.title || "Untitled note",
      preview: note.preview || buildPreview(note.bodyText || ""),
      body: (note.bodyText || "").slice(0, 2200),
      shelfNames: (note.shelfIds || []).map((id) => getShelfById(id)?.name).filter(Boolean),
      linkedPages: (note.directPageIds || []).map((id) => getPageById(id)?.title).filter(Boolean),
      sortState: note.sortState || "unsorted",
      needsReview: !!note.needsReview,
    }));

    const pageMatches = searchPages(query).map((page) => ({
      id: page.id,
      title: page.title || "Untitled page",
      breadcrumb: getBreadcrumb(page.id).map((item) => item.title || ""),
      layout: page.layout || "board-canvas",
      category: page.category || "none",
      summary: getPageDescriptorText(page.id).slice(0, 420),
    }));

    return {
      mode: 'ask',
      user: activeUser,
      context: {
        currentPage,
        activeNote: activeNote ? {
          id: activeNote.id,
          title: activeNote.title || "Untitled note",
          preview: activeNote.preview || buildPreview(activeNote.bodyText || ""),
          body: (activeNote.bodyText || "").slice(0, 2400),
          shelfNames: (activeNote.shelfIds || []).map((id) => getShelfById(id)?.name).filter(Boolean),
          linkedPages: (activeNote.directPageIds || []).map((id) => getPageById(id)?.title).filter(Boolean),
          contextBreadcrumbTitles: activeNote.contextBreadcrumbTitles || [],
          sortState: activeNote.sortState || "unsorted",
          needsReview: !!activeNote.needsReview,
        } : null,
        relatedNotes,
        nearbyLinkedPages: currentPage.nearbyLinkedPages || [],
        searchMatches: {
          notes: noteMatches,
          pages: pageMatches,
        },
        helperMemory: (helperMemory?.facts || []).map((item) => item.text).slice(-12),
        conversationHistory: chatMessages.slice(-8).map((message) => ({
          role: message.role,
          text: message.text,
        })),
      },
      message: String(query || "").trim(),
    };
  }

  function buildAssistantActionList(payload = {}) {
    const actions = [];
    const normalized = Array.isArray(payload?.suggestedActions)
      ? payload.suggestedActions.map(normalizeChatAction).filter(Boolean)
      : [];

    normalized.forEach((action) => actions.push(action));

    const renameSuggestions = Array.isArray(payload?.renameSuggestions) ? payload.renameSuggestions : [];
    renameSuggestions.forEach((item) => {
      const note = getNoteById(item?.noteId || '');
      if (!note) return;
      const currentTitle = String(note.title || '').trim();
      if (currentTitle && !/^untitled/i.test(currentTitle)) return;
      const nextTitle = String(item?.title || '').trim();
      if (!nextTitle) return;
      actions.push(normalizeChatAction({
        type: 'rename-note',
        label: `Rename to “${nextTitle}”`,
        noteId: note.id,
        title: nextTitle,
        detail: note.title ? `Current title: ${note.title}` : 'Untitled note',
      }));
    });

    const inboxQuestions = Array.isArray(payload?.inboxQuestions) ? payload.inboxQuestions : [];
    inboxQuestions.forEach((item) => {
      actions.push(normalizeChatAction({
        type: 'send-to-inbox',
        label: 'Send to Inbox',
        noteId: item?.noteId || '',
        pageId: item?.suggestedPageId || '',
        title: item?.title || 'Helper question',
        question: item?.question || '',
        reason: item?.reason || '',
        confidence: Number.isFinite(Number(item?.confidence)) ? Number(item.confidence) : 0,
      }));
    });

    const deduped = [];
    const seen = new Set();
    actions.filter(Boolean).forEach((action) => {
      const key = [action.type, action.noteId, action.pageId, action.title, action.question].join('::');
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(action);
    });
    return deduped.slice(0, 6);
  }

  function applyAssistantPayload(payload = {}) {
    const memoryWrites = Array.isArray(payload.memoryWrites) ? payload.memoryWrites : [];
    memoryWrites.forEach((text) => addHelperMemoryFact(text, "assistant"));
    return buildAssistantActionList(payload);
  }

  async function handleAssistantQuery(query) {
    const clean = String(query || "").trim();
    if (!clean) return;
    pushChat("user", clean);
    activeAssistantBusy = true;
    renderAssistantMessages();

    try {
      const response = await fetch(ASSISTANT_API_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildAssistantRequestContext(clean)),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.reply || `Assistant request failed (${response.status}).`);
      }
      const suggestedActions = applyAssistantPayload(payload || {});
      pushChat("assistant", payload?.reply || "No reply yet.", { actions: suggestedActions });
      renderEverything();
      return;
    } catch (error) {
      console.warn("Assistant request failed, falling back to local search.", error);
    } finally {
      activeAssistantBusy = false;
      renderAssistantMessages();
    }

    const lowered = clean.toLowerCase();
    const noteMatches = searchNotes(clean);
    const pageMatches = searchPages(clean);

    if (/find|note|where|look|search/.test(lowered) && noteMatches.length) {
      const lines = noteMatches.map((note) => `• ${note.title || "Untitled note"} — ${note.preview}`);
      pushChat("assistant", `Closest note matches\n${lines.join("\n")}`);
    }

    if ((/page|who|what|where/.test(lowered)) && pageMatches.length) {
      const lines = pageMatches.map((page) => `• ${getBreadcrumb(page.id).map((item) => item.title).join(" / ")}`);
      pushChat("assistant", `Closest page matches\n${lines.join("\n")}`);
    }

    const currentPageId = typeof window.getCurrentPageId === "function" ? window.getCurrentPageId() : "home";
    if (/what was i working on|jump back in|recent/.test(lowered)) {
      const recentNotes = getNotesSorted(notes.filter((note) => !note.archived)).slice(0, 3);
      if (recentNotes.length) {
        pushChat("assistant", `Recent notes\n${recentNotes.map((note) => `• ${note.title || "Untitled note"} — ${note.preview}`).join("\n")}`);
      } else {
        pushChat("assistant", "You do not have recent notes yet.");
      }
      return;
    }

    if (/this page|here|current page/.test(lowered) && !["home", "search", "inbox", "notes", "settings"].includes(currentPageId)) {
      const related = getRelatedNotesForPage(currentPageId).slice(0, 4);
      if (related.length) {
        pushChat("assistant", `Related notes here\n${related.map((note) => `• ${note.title || "Untitled note"} — ${note.preview}`).join("\n")}`);
      } else {
        pushChat("assistant", "There are no related notes on this page yet.");
      }
      return;
    }

    pushChat("assistant", "The assistant route did not answer, so I fell back to local note and page search only.");
  }

  function markAssistantActionDone(messageId, actionId, resultText = '') {
    updateChatMessage(messageId, (message) => ({
      ...message,
      actions: (message.actions || []).map((action) => action.id === actionId
        ? { ...action, status: 'done', resultText: resultText || action.resultText || action.label }
        : action),
    }));
  }

  function keepNoteLoose(noteId) {
    const note = getNoteById(noteId);
    if (!note) return false;
    note.needsReview = false;
    note.status = note.archived ? 'archived' : 'normal';
    note.sortState = (note.shelfIds?.length || note.directPageIds?.length) ? 'placed' : 'unsorted';
    note.helperSummary = 'Kept loose for now.';
    note.updatedAt = now();
    saveNotes();
    addAction(note.id, 'assistant-keep-loose', 'Kept note loose for now.');
    return true;
  }

  function renameNoteFromAssistant(noteId, nextTitle = '') {
    const note = getNoteById(noteId);
    const clean = String(nextTitle || '').trim();
    if (!note || !clean) return false;
    note.title = clean;
    note.aiNamed = true;
    note.aiTitle = true;
    note.updatedAt = now();
    saveNotes();
    addAction(note.id, 'assistant-rename', `Assistant renamed note to "${clean}".`);
    return true;
  }

  function sendAssistantQuestionToInbox(action = {}) {
    const created = createInboxItem({
      title: action.title || 'Helper question',
      question: action.question || 'Could you review this?',
      noteId: action.noteId || '',
      confidence: Number.isFinite(Number(action.confidence)) ? Number(action.confidence) : 0,
      suggestedPageId: action.pageId || '',
      suggestedAction: action.type || 'assistant-review',
      reason: action.reason || action.detail || '',
    });
    if (created?.noteId) {
      const note = getNoteById(created.noteId);
      if (note) {
        note.needsReview = true;
        note.status = note.archived ? 'archived' : 'review';
        note.sortState = (note.directPageIds?.length || note.shelfIds?.length) ? 'review' : 'unsorted';
        note.updatedAt = now();
        saveNotes();
      }
    }
    return !!created;
  }

  function performAssistantAction(messageId, actionId) {
    const message = chatMessages.find((entry) => entry.id === messageId);
    const action = message?.actions?.find((entry) => entry.id === actionId);
    if (!message || !action || action.status === 'done') return;

    let resultText = '';
    let changed = false;

    switch (action.type) {
      case 'link-note':
        if (action.noteId && action.pageId) {
          linkNoteToPage(action.noteId, action.pageId);
          resultText = 'Linked';
          changed = true;
        }
        break;
      case 'rename-note':
        changed = renameNoteFromAssistant(action.noteId, action.title || action.label.replace(/^Rename to\s+/i, ''));
        resultText = changed ? 'Renamed' : resultText;
        break;
      case 'send-to-inbox':
        changed = sendAssistantQuestionToInbox(action);
        resultText = changed ? 'Sent to Inbox' : resultText;
        break;
      case 'keep-loose':
        changed = keepNoteLoose(action.noteId);
        resultText = changed ? 'Kept loose' : resultText;
        break;
      case 'open-note':
        if (action.noteId) {
          openPageSafe('notes');
          activeNoteId = action.noteId;
          renderEverything();
          resultText = 'Opened note';
          changed = true;
        }
        break;
      case 'open-page':
        if (action.pageId) {
          openPageSafe(action.pageId);
          resultText = 'Opened page';
          changed = true;
        }
        break;
      case 'create-layout': {
        const aiBlocks = Array.isArray(action.blocks) ? action.blocks : [];
        if (!aiBlocks.length) { resultText = 'No blocks provided'; changed = true; break; }
        let targetPageId;
        if (action.targetPage === 'new' && action.newPageTitle) {
          const newPage = typeof window.createPage === 'function'
            ? window.createPage(action.newPageTitle, typeof window.getCurrentPageId === 'function' ? window.getCurrentPageId() : 'home', 'board-canvas', 'none', 'page')
            : null;
          targetPageId = newPage ? newPage.id : (typeof window.getCurrentPageId === 'function' ? window.getCurrentPageId() : 'home');
        } else {
          targetPageId = typeof window.getCurrentPageId === 'function' ? window.getCurrentPageId() : 'home';
        }
        applyLayoutBlocks(targetPageId, aiBlocks);
        resultText = 'Layout applied!';
        changed = true;
        break;
      }
      default:
        break;
    }

    if (!changed) return;
    markAssistantActionDone(messageId, actionId, resultText);
    if (action.noteId) renderEverything();
  }

  function applyLayoutBlocks(pageId, aiBlocks) {
    if (!pageId || !Array.isArray(aiBlocks) || !aiBlocks.length) return;
    const now = Date.now();
    const newBlocks = aiBlocks.map((spec, i) => ({
      id: `block-${now + i}`,
      type: spec.type || 'text',
      x: typeof spec.x === 'number' ? spec.x : 0,
      y: typeof spec.y === 'number' ? spec.y : 0,
      w: typeof spec.w === 'number' && spec.w > 0 ? spec.w : 288,
      h: typeof spec.h === 'number' && spec.h > 0 ? spec.h : 48,
      z: 0,
      titleHTML: spec.titleHTML || '',
      bodyHTML: spec.bodyHTML || '',
      containerTitle: '',
      containerBody: '',
      containerItems: [],
      tableHTML: '',
      bg: spec.bg || '',
      borderColor: spec.borderColor || '',
      textColor: spec.textColor || '',
      padding: '',
      radius: spec.radius || '',
      hasNote: 0,
      linkedPageId: spec.linkedPageId || '',
      pageCardTitle: spec.pageCardTitle || '',
      pageCardMeta: '',
      pageCardIcon: spec.pageCardIcon || '',
      pageCardSummary: spec.pageCardSummary || '',
      pageCardTypeLabel: '',
      pageCardImageSrc: '',
      pageCardImageMode: 'none',
      pageCardImagePos: 50,
      pageCardView: 'default',
      pageCardHideIcon: 0,
      cardStyle: '',
    }));

    const currentPageId = typeof window.getCurrentPageId === 'function' ? window.getCurrentPageId() : null;

    if (pageId === currentPageId) {
      // Append directly to the DOM — avoids openPage overwriting our blocks via saveCurrentPageBlocks
      const grid = document.getElementById('grid');
      if (grid) {
        newBlocks.forEach((data) => {
          if (typeof buildBlockFromData === 'function') {
            const el = buildBlockFromData(data);
            grid.appendChild(el);
          }
        });
        if (typeof expandGrid === 'function') expandGrid();
      }
      // Persist the full merged state (existing DOM blocks + new ones)
      if (typeof window.saveCurrentPageBlocks === 'function') {
        window.saveCurrentPageBlocks();
      }
    } else {
      // Different/new page — store first, then navigate (saveCurrentPageBlocks in openPage saves old page correctly)
      const existing = typeof window.getPageBlocks === 'function' ? window.getPageBlocks(pageId) : [];
      if (typeof window.setPageBlocks === 'function') window.setPageBlocks(pageId, [...existing, ...newBlocks]);
      openPageSafe(pageId);
    }
  }

  function setAssistantOpen(open) {
    activeAssistantOpen = !!open;
    document.getElementById('assistantDrawer')?.classList.toggle('open', activeAssistantOpen);
    document.getElementById('assistantTopBtn')?.classList.toggle('active', activeAssistantOpen);
    document.body.classList.toggle('assistant-open', activeAssistantOpen);
    if (activeAssistantOpen) renderAssistantMessages();
  }

  window.openAssistantWithQuery = function (query) {
    ensureAssistantUI();
    setAssistantOpen(true);
    const input = document.getElementById('assistantComposerInput');
    if (input) {
      input.value = String(query || '');
      input.dispatchEvent(new Event('input'));
    }
    handleAssistantQuery(String(query || ''));
  };

  function renderEverything() {
    clearSystemSurfaceIfNeeded();
    renderAssistantMessages();
  }

  function handleDocumentClick(event) {
    const target = event.target;

    const assistantAction = target.closest('[data-assistant-action-message][data-assistant-action-id]');
    if (assistantAction) {
      performAssistantAction(assistantAction.dataset.assistantActionMessage, assistantAction.dataset.assistantActionId);
      return;
    }

    const discardBtn = target.closest('[data-layout-discard-message][data-layout-discard-id]');
    if (discardBtn) {
      markAssistantActionDone(discardBtn.dataset.layoutDiscardMessage, discardBtn.dataset.layoutDiscardId, 'Discarded');
      return;
    }

    const menuToggle = target.closest('[data-notes-menu-toggle]');
    if (menuToggle) {
      const menuId = menuToggle.dataset.notesMenuToggle;
      const menu = document.getElementById(menuId);
      if (menu) {
        const isVisible = menu.style.display !== 'none';
        document.querySelectorAll('.notes-editor-menu').forEach(m => m.style.display = 'none');
        menu.style.display = isVisible ? 'none' : 'block';
      }
      return;
    }

    const menuItem = target.closest('[data-note-restore], [data-note-archive], [data-note-reprocess]');
    if (menuItem) {
      document.querySelectorAll('.notes-editor-menu').forEach(m => m.style.display = 'none');
    }

    const notesTool = target.closest('[data-note-cmd], [data-note-link]');
    if (notesTool) {
      const noteEditor = document.getElementById('noteEditor');
      if (noteEditor) {
        noteEditor.focus();
        try {
          if (notesTool.dataset.noteLink === '1') {
            const url = prompt('Enter URL:');
            if (url) document.execCommand('createLink', false, url);
          } else if (notesTool.dataset.noteCmd) {
            const value = notesTool.dataset.noteValue || undefined;
            document.execCommand(notesTool.dataset.noteCmd, false, value);
          }
        } catch (e) {
          console.warn('Command failed:', e);
        }
        const renderedNoteId = document.querySelector('[data-note-editor]')?.dataset.noteEditor || activeNoteId;
        scheduleNoteSave();
        scheduleNoteReprocess(renderedNoteId);
      }
      return;
    }

    const notesToggle = target.closest('[data-notes-toggle]');
    if (notesToggle) {
      const pane = notesToggle.dataset.notesToggle;
      if (pane === 'all') {
        const shouldOpenAll = !allNotesPanesOpen();
        notesLayoutState.shelvesOpen = shouldOpenAll;
        notesLayoutState.listOpen = shouldOpenAll;
      }
      if (pane === 'shelves') notesLayoutState.shelvesOpen = !notesLayoutState.shelvesOpen;
      if (pane === 'list') notesLayoutState.listOpen = !notesLayoutState.listOpen;
      syncNotesLayoutStateInDOM({ refocusEditor: true });
      return;
    }

    const noteOpen = target.closest('[data-note-open]');
    if (noteOpen) {
      activeNoteId = noteOpen.dataset.noteOpen;
      renderNotesSurface();
      return;
    }

    const folderToggle = target.closest('[data-folder-toggle]');
    if (folderToggle) {
      const folderId = folderToggle.dataset.folderToggle;
      notesFolderState[folderId] = !isNotesFolderExpanded(folderId, 0);
      renderNotesSurface();
      return;
    }

    const folderOpen = target.closest('[data-folder-open]');
    if (folderOpen) {
      setActiveNotesContextId(folderOpen.dataset.folderOpen, { preserveActiveNote: false });
      return;
    }

    const filterToggle = target.closest('[data-notes-filter-toggle]');
    if (filterToggle) {
      openNotesFilterMenu(filterToggle);
      return;
    }

    if (target.closest('[data-notes-create]')) {
      const contextPageId = getActiveNotesContextId();
      const note = createNote({
        title: '',
        bodyHTML: '<p><br></p>',
        sourceType: 'normal',
        contextPageId,
        forceContext: !!contextPageId,
      });
      activeNoteId = note?.id || activeNoteId;
      renderNotesSurface();
      setTimeout(() => document.getElementById('noteEditor')?.focus(), 30);
      return;
    }

    if (target.closest('[data-note-archive]')) {
      archiveNote(activeNoteId);
      renderEverything();
      return;
    }

    if (target.closest('[data-note-restore]')) {
      unarchiveNote(activeNoteId);
      renderEverything();
      return;
    }

    if (target.closest('[data-note-reprocess]')) {
      reprocessNote(activeNoteId);
      renderEverything();
      return;
    }

    const noteTool = target.closest('[data-note-cmd]');
    if (noteTool) {
      const cmd = noteTool.dataset.noteCmd;
      const value = noteTool.dataset.noteValue || null;
      const editor = document.getElementById('noteEditor');
      editor?.focus();
      try {
        document.execCommand(cmd, false, value);
      } catch (err) {
        console.warn('Note formatting command failed', err);
      }
      scheduleNoteSave();
      return;
    }

    if (target.closest('[data-note-link]')) {
      const url = prompt('Paste a URL:');
      if (!url) return;
      const editor = document.getElementById('noteEditor');
      editor?.focus();
      try {
        document.execCommand('createLink', false, url.trim());
      } catch (err) {
        console.warn('Could not insert link', err);
      }
      scheduleNoteSave();
      return;
    }

    const shelfToggle = target.closest('[data-note-shelf-toggle]');
    if (shelfToggle && activeNoteId) {
      setNoteShelfState(activeNoteId, shelfToggle.dataset.noteShelfToggle, shelfToggle.checked);
      renderNotesSurface();
      return;
    }

    if (target.closest('[data-create-shelf-for-note]')) {
      const input = document.getElementById('newShelfInput');
      const name = input?.value?.trim();
      if (!name || !activeNoteId) return;
      const shelfId = ensureShelfByName(name, { createdBy: 'user', kind: 'manual' });
      setNoteShelfState(activeNoteId, shelfId, true);
      if (input) input.value = '';
      renderNotesSurface();
      return;
    }

    const linkedPageBtn = target.closest('[data-open-linked-page]');
    if (linkedPageBtn) {
      openPageSafe(linkedPageBtn.dataset.openLinkedPage);
      return;
    }

    const pageOpenNote = target.closest('[data-open-note-in-notes]');
    if (pageOpenNote) {
      openNoteInNotes(pageOpenNote.dataset.openNoteInNotes);
      return;
    }

    if (target.closest('#pageQuickNoteBtn')) {
      openQuickNote(typeof window.getCurrentPageId === 'function' ? window.getCurrentPageId() : '');
      return;
    }

    if (target.closest('#pageOpenNotesBtn')) {
      openPageSafe('notes');
      return;
    }

    if (target.closest('#pageNotesToggle')) {
      const tray = document.getElementById('pageNotesTray');
      const chevron = document.getElementById('pageNotesChevron');
      if (tray) {
        const open = tray.classList.toggle('open');
        if (chevron) chevron.textContent = open ? '\u25BE' : '\u25B8';
      }
      return;
    }

    const inboxAccept = target.closest('[data-inbox-accept]');
    if (inboxAccept) {
      const item = inboxItems.find((entry) => entry.id === inboxAccept.dataset.inboxAccept);
      const answer = document.querySelector(`[data-inbox-answer="${item?.id}"]`)?.value || '';
      if (item?.noteId && item.suggestedPageId) {
        linkNoteToPage(item.noteId, item.suggestedPageId, answer);
        resolveInboxItem(item.id, answer);
        renderEverything();
      }
      return;
    }

    const inboxLink = target.closest('[data-inbox-link]');
    if (inboxLink) {
      const item = inboxItems.find((entry) => entry.id === inboxLink.dataset.inboxLink);
      const pageId = document.querySelector(`[data-inbox-page-select="${item?.id}"]`)?.value || '';
      const answer = document.querySelector(`[data-inbox-answer="${item?.id}"]`)?.value || '';
      if (!item || !pageId) return;
      linkNoteToPage(item.noteId, pageId, answer);
      resolveInboxItem(item.id, answer);
      renderEverything();
      return;
    }

    const inboxLoose = target.closest('[data-inbox-loose]');
    if (inboxLoose) {
      const item = inboxItems.find((entry) => entry.id === inboxLoose.dataset.inboxLoose);
      const answer = document.querySelector(`[data-inbox-answer="${item?.id}"]`)?.value || '';
      if (!item) return;
      if (item.noteId) {
        const note = getNoteById(item.noteId);
        if (note) {
          note.needsReview = false;
          note.sortState = note.shelfIds.length || note.directPageIds.length ? 'placed' : 'unsorted';
          note.status = 'normal';
          note.updatedAt = now();
          saveNotes();
        }
      }
      resolveInboxItem(item.id, answer);
      renderEverything();
      return;
    }

    const inboxResolve = target.closest('[data-inbox-resolve]');
    if (inboxResolve) {
      const item = inboxItems.find((entry) => entry.id === inboxResolve.dataset.inboxResolve);
      const answer = document.querySelector(`[data-inbox-answer="${item?.id}"]`)?.value || '';
      if (!item) return;
      resolveInboxItem(item.id, answer);
      renderEverything();
      return;
    }
  }

  function scheduleNoteSave() {
    if (noteSaveTimer) clearTimeout(noteSaveTimer);
    noteSaveTimer = setTimeout(() => {
      noteSaveTimer = null;
      saveActiveNoteFromEditor();
    }, 200);
  }

  function scheduleNoteReprocess(noteId = activeNoteId) {
    if (!noteId) return;
    if (noteReprocessTimer) clearTimeout(noteReprocessTimer);
    noteReprocessTimer = setTimeout(() => {
      noteReprocessTimer = null;
      const note = getNoteById(noteId);
      if (!note) return;
      if (buildPlacementDigest(note) === note.placementDigest) return;
      reprocessNote(noteId);
    }, 1200);
  }

  function flushPendingNoteSave() {
    if (noteSaveTimer) {
      clearTimeout(noteSaveTimer);
      noteSaveTimer = null;
    }
    saveActiveNoteFromEditor();
  }

  function saveActiveNoteFromEditor() {
    const renderedNoteId = document.querySelector('[data-note-editor]')?.dataset.noteEditor || activeNoteId;
    const note = getNoteById(renderedNoteId);
    if (!note) return;
    const editor = document.getElementById('noteEditor');
    const titleInput = document.getElementById('noteTitleInput');
    if (!editor || !titleInput) return;

    updateNote(note.id, {
      title: titleInput.value,
      bodyHTML: editor.innerHTML,
    });
  }

  function handleDocumentInput(event) {
    if (event.target.id === 'noteEditor' || event.target.id === 'noteTitleInput') {
      scheduleNoteSave();
      if (event.target.id === 'noteEditor') {
        const renderedNoteId = document.querySelector('[data-note-editor]')?.dataset.noteEditor || activeNoteId;
        scheduleNoteReprocess(renderedNoteId);
      }
      return;
    }

    if (event.target.id === 'notesSearchInput') {
      notesSearch = event.target.value || '';
      renderNotesSurface();
      return;
    }

    if (event.target.id === 'notesGlobalSearchInput') {
      notesGlobalSearch = event.target.value || '';
      renderNotesSurface();
    }
  }

  function handleQuickNoteSave() {
    const title = document.getElementById('quickNoteTitle')?.value || '';
    const body = document.getElementById('quickNoteBody')?.value || '';
    if (!body.trim() && !title.trim()) return;
    createNote({
      title,
      bodyHTML: escapeHTML(body).replace(/\n/g, '<br>'),
      sourceType: 'quick',
      contextPageId: activeComposerContextPageId,
      forceContext: !!activeComposerContextPageId,
    });
    closeQuickNote();
    renderEverything();
  }

  function wireQuickNoteEvents() {
    document.getElementById('quickNoteClose')?.addEventListener('click', closeQuickNote);
    document.getElementById('quickNoteCancel')?.addEventListener('click', closeQuickNote);
    document.getElementById('quickNoteSave')?.addEventListener('click', handleQuickNoteSave);
    document.getElementById('quickNoteBody')?.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'enter') {
        event.preventDefault();
        handleQuickNoteSave();
      }
    });
  }

  function wireAssistantEvents() {
    document.getElementById('assistantTopBtn')?.addEventListener('click', (event) => {
      event.stopPropagation();
      setAssistantOpen(!activeAssistantOpen);
    });
    document.getElementById('assistantDrawerClose')?.addEventListener('click', () => setAssistantOpen(false));

    const send = async () => {
      const input = document.getElementById('assistantComposerInput');
      const query = (input?.value || '').trim();
      if (!query || activeAssistantBusy) return;
      flushPendingNoteSave();
      if (input) { input.value = ''; input.style.height = 'auto'; }
      setAssistantOpen(true);
      await handleAssistantQuery(query);
    };

    document.getElementById('assistantComposerSend')?.addEventListener('click', send);
    document.getElementById('assistantComposerInput')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        send();
      }
    });
    document.getElementById('assistantComposerInput')?.addEventListener('input', (event) => {
      const el = event.target;
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 140) + 'px';
    });

    document.addEventListener('mousedown', (event) => {
      if (!activeAssistantOpen) return;
      const insideDrawer = event.target.closest('#assistantDrawer');
      const insideButton = event.target.closest('#assistantTopBtn');
      if (!insideDrawer && !insideButton) {
        setAssistantOpen(false);
      }
    });
  }

  function onPageOpen(pageId) {
    if (pageId === 'notes' && !getActiveNotesContextId()) {
      const defaultContextId = getDefaultNotesContextId();
      if (defaultContextId) {
        activeNotesView = { type: 'page', id: defaultContextId };
      }
    }

    renderEverything();
  }

  function init() {
    ensureQuickNoteUI();
    ensureAssistantUI();
    wireQuickNoteEvents();
    wireAssistantEvents();

    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('input', handleDocumentInput);

    const previousOnPageOpen = typeof window.onSanctumPageOpen === 'function' ? window.onSanctumPageOpen : null;
    window.onSanctumPageOpen = (pageId) => {
      previousOnPageOpen?.(pageId);
      onPageOpen(pageId);
    };

    window.getSanctumAssistantContext = () => getAssistantContext('');
    window.getSanctumAssistantProfile = () => ({ ...activeUser, memoryFacts: (helperMemory.facts || []).map((item) => item.text) });

    renderEverything();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.SanctumNotes = {
    getNotes: () => [...notes],
    getShelves: () => [...shelves],
    getInbox: () => [...inboxItems],
    getPageUnderstanding,
    openQuickNote,
    openNoteInNotes,
    createNote,
  };
})();
