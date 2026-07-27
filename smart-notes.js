(() => {
  const NOTES_KEY = (window.STORAGE_KEYS && window.STORAGE_KEYS.notesVault) || 'sanctum_notes_vault_v1';
  const SHELVES_KEY = (window.STORAGE_KEYS && window.STORAGE_KEYS.noteShelves) || 'sanctum_note_shelves_v1';
  const INBOX_KEY = (window.STORAGE_KEYS && window.STORAGE_KEYS.helperInbox) || 'sanctum_helper_inbox_v1';
  const LOG_KEY = (window.STORAGE_KEYS && window.STORAGE_KEYS.helperActionLog) || 'sanctum_helper_action_log_v1';
  const CHAT_KEY = (window.STORAGE_KEYS && window.STORAGE_KEYS.helperChatLog) || 'sanctum_helper_chat_log_v1';
  const USER_PROFILE_KEY = (window.STORAGE_KEYS && window.STORAGE_KEYS.helperUserProfile) || 'sanctum_helper_user_profile_v1';
  const HELPER_MEMORY_KEY = (window.STORAGE_KEYS && window.STORAGE_KEYS.helperMemoryProfile) || 'sanctum_helper_memory_profile_v1';
  const ASSISTANT_API_PATH = ((window.SANCTUM_API_BASE || '') + '/api/assistant/chat').replace(/\/\/api/, '/api');
  const CONTEXT_ROUTE_API_PATH = ((window.SANCTUM_API_BASE || '') + '/api/assistant/route-context').replace(/\/\/api/, '/api');
  const ORGANIZE_API_PATH = ((window.SANCTUM_API_BASE || '') + '/api/assistant/organize').replace(/\/\/api/, '/api');
  const USE_AI_CONTEXT_ROUTER = window.SANCTUM_AI_CONTEXT_ROUTER === true;
  const ASSISTANT_BULK_BATCH_SIZE = 20;
  const ASSISTANT_PERSONALITIES = Object.freeze([
    {
      id: 'southern-warden',
      label: 'Southern Warden',
      gender: 'masculine',
      shortLabel: 'Stern · protective · dry',
      subtitle: 'Steady hands. Few words. No foolishness.',
      description: 'A restrained Southern protector: practical, blunt, quietly caring, and difficult to rattle.',
    },
    {
      id: 'southern-belle',
      label: 'Southern Belle',
      gender: 'feminine',
      shortLabel: 'Warm · graceful · firm',
      subtitle: 'Soft voice. Strong spine.',
      description: 'Warm Southern charm with patience, emotional perception, and a politely immovable backbone.',
    },
    {
      id: 'commander',
      label: 'Commander',
      gender: 'feminine',
      shortLabel: 'Sharp · capable · demanding',
      subtitle: 'Stand up straight. You can handle this.',
      description: 'Direct, ambitious, and motivating. She treats the user as capable and expects follow-through.',
    },
    {
      id: 'golden-boy',
      label: 'Golden Boy',
      gender: 'masculine',
      shortLabel: 'Playful · loyal · expressive',
      subtitle: 'Good energy, good company, serious when it counts.',
      description: 'Affectionate and playful without becoming foolish; collaborative, curious, and openly encouraging.',
    },
  ]);
  const ASSISTANT_GENDERS = Object.freeze([
    { value: 'masculine', label: 'Masculine' },
    { value: 'feminine', label: 'Feminine' },
    { value: 'neutral', label: 'Neutral' },
    { value: 'custom', label: 'Custom' },
  ]);

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
    const personalityId = ASSISTANT_PERSONALITIES.some((item) => item.id === profile.assistantPersonality)
      ? profile.assistantPersonality
      : 'southern-warden';
    const selectedPersonality = ASSISTANT_PERSONALITIES.find((item) => item.id === personalityId)
      || ASSISTANT_PERSONALITIES[0];
    const existingName = typeof profile.assistantName === 'string' ? profile.assistantName.trim() : '';
    return {
      id: typeof profile.id === 'string' && profile.id.trim() ? profile.id.trim() : 'primary-user',
      displayName: typeof profile.displayName === 'string' && profile.displayName.trim() ? profile.displayName.trim() : 'You',
      assistantName: existingName && existingName !== 'Assistant' ? existingName : 'Warden',
      assistantAvatar: typeof profile.assistantAvatar === 'string' ? profile.assistantAvatar.trim() : '',
      assistantPersonality: personalityId,
      assistantGender: ASSISTANT_GENDERS.some((item) => item.value === profile.assistantGender)
        ? profile.assistantGender
        : selectedPersonality.gender,
      assistantPronouns: typeof profile.assistantPronouns === 'string' ? profile.assistantPronouns.trim().slice(0, 60) : '',
      memoryEnabled: profile.memoryEnabled !== false,
      autoMemory: profile.autoMemory !== false,
    };
  }

  function normalizeHelperMemory(memory = {}) {
    const facts = Array.isArray(memory.facts)
      ? memory.facts
          .map((item) => ({
            id: typeof item?.id === 'string' ? item.id : makeId('mem'),
            text: typeof item?.text === 'string' ? item.text.trim() : '',
            source: typeof item?.source === 'string' ? item.source : 'assistant',
            category: typeof item?.category === 'string' ? item.category.trim().slice(0, 40) : 'general',
            pinned: item?.pinned === true,
            createdAt: Number.isFinite(Number(item?.createdAt)) ? Number(item.createdAt) : now(),
            updatedAt: Number.isFinite(Number(item?.updatedAt)) ? Number(item.updatedAt) : (Number(item?.createdAt) || now()),
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
  let activeAssistantEditMessageId = '';
  let activeAssistantTransactionMessageId = '';
  let activeAssistantOpen = false;
  let activeAssistantBusy = false;
  let assistantRenderRevision = 0;
  let activeComposerContextPageId = '';
  let noteSaveTimer = null;
  let noteReprocessTimer = null;
  const organizingNoteIds = new Set();

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
      choices: Array.isArray(item.choices) ? item.choices.filter((c) => typeof c === 'string' && c.trim()).slice(0, 4) : [],
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

  function normalizeStoredDatabaseProposal(proposal = null) {
    if (!proposal || typeof proposal !== 'object') return null;
    const operations = Array.isArray(proposal.operations) ? proposal.operations.slice(0, 20) : [];
    const questions = Array.isArray(proposal.questions) ? proposal.questions.slice(0, 8) : [];
    const rejectedOperations = Array.isArray(proposal.rejectedOperations)
      ? proposal.rejectedOperations.slice(0, 20)
      : [];
    if (!operations.length && !questions.length && !rejectedOperations.length) return null;
    const operationIds = new Set(operations.map((operation) => operation?.id).filter(Boolean));
    const defaultSelectedIds = operations
      .filter((operation) => operation?.basis === 'explicit')
      .map((operation) => operation.id);
    const selectedOperationIds = Array.isArray(proposal.review?.selectedOperationIds)
      ? proposal.review.selectedOperationIds.filter((id) => operationIds.has(id))
      : defaultSelectedIds;
    const preparedTransaction = proposal.preparedTransaction && typeof proposal.preparedTransaction === 'object'
      ? {
          ...proposal.preparedTransaction,
          executable: false,
          applyAvailable: false,
          operations: Array.isArray(proposal.preparedTransaction.operations)
            ? proposal.preparedTransaction.operations.slice(0, 20)
            : [],
        }
      : null;
    const continuation = proposal.continuation && typeof proposal.continuation === 'object'
      ? {
          summary: String(proposal.continuation.summary || '').slice(0, 600),
          batchSize: Math.max(1, Math.min(ASSISTANT_BULK_BATCH_SIZE, Number(proposal.continuation.batchSize) || ASSISTANT_BULK_BATCH_SIZE)),
          totalRowCount: Math.max(0, Number(proposal.continuation.totalRowCount) || 0),
          completedRowCount: Math.max(0, Number(proposal.continuation.completedRowCount) || 0),
          started: proposal.continuation.started === true,
          remainingRows: Array.isArray(proposal.continuation.remainingRows)
            ? proposal.continuation.remainingRows.slice(0, 100).map((row) => ({
                databaseRef: String(row?.databaseRef || '').slice(0, 240),
                rowId: String(row?.rowId || '').slice(0, 180),
                title: String(row?.title || '').slice(0, 240),
              })).filter((row) => row.databaseRef && row.rowId)
            : [],
        }
      : null;
    return {
      ...proposal,
      status: preparedTransaction && proposal.review?.status === 'prepared' ? 'prepared' : 'proposed',
      executable: false,
      operations,
      questions: questions.map((question, index) => ({
        ...question,
        id: question?.id || `question-${index + 1}`,
        operationIds: Array.isArray(question?.operationIds) ? question.operationIds : [],
      })),
      rejectedOperations,
      allowedDatabaseRefs: Array.isArray(proposal.allowedDatabaseRefs)
        ? proposal.allowedDatabaseRefs
        : [...new Set(operations.map((operation) => operation?.databaseRef).filter(Boolean))],
      allowedContentRefs: Array.isArray(proposal.allowedContentRefs)
        ? proposal.allowedContentRefs
        : [...new Set(operations.map((operation) => operation?.targetRef).filter(Boolean))],
      review: {
        status: ['reviewing', 'invalid', 'prepared'].includes(proposal.review?.status)
          ? proposal.review.status
          : 'reviewing',
        selectedOperationIds,
        answers: proposal.review?.answers && typeof proposal.review.answers === 'object'
          ? { ...proposal.review.answers }
          : {},
        errors: Array.isArray(proposal.review?.errors) ? proposal.review.errors.slice(0, 20) : [],
      },
      preparedTransaction,
      continuation,
    };
  }

  function normalizeAssistantTransactionReceipt(receipt = null) {
    if (!receipt || typeof receipt !== 'object') return null;
    const status = ['applied', 'undone'].includes(receipt.status) ? receipt.status : '';
    if (!status || !Array.isArray(receipt.operations) || !receipt.operations.length) return null;
    return {
      ...receipt,
      status,
      operations: receipt.operations.slice(0, 20),
      adapters: Array.isArray(receipt.adapters) ? receipt.adapters.slice(0, 8) : [],
      undoAvailable: status === 'applied' && receipt.undoAvailable === true,
      appliedAt: Number.isFinite(Number(receipt.appliedAt)) ? Number(receipt.appliedAt) : 0,
      undoneAt: Number.isFinite(Number(receipt.undoneAt)) ? Number(receipt.undoneAt) : 0,
    };
  }

  function extractEmbeddedAssistantPayload(text = '') {
    const raw = String(text || '').trim();
    if (!raw) return null;

    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : raw;
    if (!candidate.startsWith('{') || !candidate.endsWith('}')) return null;

    try {
      const parsed = JSON.parse(candidate);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_error) {
      return null;
    }
  }

  function normalizeChat(list = []) {
    return Array.isArray(list)
      ? list.map((message) => {
          const role = ['user', 'assistant', 'system'].includes(message?.role) ? message.role : 'assistant';
          const text = typeof message?.text === 'string' ? message.text : '';
          const embedded = role === 'assistant' ? extractEmbeddedAssistantPayload(text) : null;
          const storedActions = Array.isArray(message?.actions)
            ? message.actions.map(normalizeChatAction).filter(Boolean)
            : [];
          const embeddedActions = !storedActions.length && Array.isArray(embedded?.suggestedActions)
            ? embedded.suggestedActions.map(normalizeChatAction).filter(Boolean)
            : [];
          return {
            id: typeof message?.id === 'string' ? message.id : makeId('msg'),
            role,
            text: embedded?.reply || text,
            actions: storedActions.length ? storedActions : embeddedActions,
            databaseProposal: normalizeStoredDatabaseProposal(message?.databaseProposal),
            proposalSuperseded: message?.proposalSuperseded === true,
            transactionReceipt: normalizeAssistantTransactionReceipt(message?.transactionReceipt),
            transactionError: typeof message?.transactionError === 'string' ? message.transactionError.slice(0, 1000) : '',
            createdAt: Number.isFinite(Number(message?.createdAt)) ? Number(message.createdAt) : now(),
          };
        }).filter((message) => message.text.trim() || (message.actions || []).length || message.databaseProposal || message.transactionReceipt)
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

  function formatAssistantTime(ts) {
    const d = new Date(ts || Date.now());
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function saveNotes() {
    notes = normalizeNotes(notes);
    writeJSON(NOTES_KEY, notes);
  }

  window.SanctumAssistantNoteStore = {
    read() {
      if (noteSaveTimer) flushPendingNoteSave();
      return typeof structuredClone === 'function'
        ? structuredClone(notes)
        : JSON.parse(JSON.stringify(notes));
    },
    write(nextNotes) {
      notes = normalizeNotes(Array.isArray(nextNotes) ? nextNotes : []);
      saveNotes();
      renderEverything();
      return true;
    },
  };

  function saveShelves() {
    shelves = normalizeShelves(shelves);
    writeJSON(SHELVES_KEY, shelves);
  }

  function saveInbox() {
    inboxItems = normalizeInbox(inboxItems);
    writeJSON(INBOX_KEY, inboxItems);
    renderInboxBadge();
    window.refreshDataCalloutBlocks?.();
  }

  function getOpenInboxCount() {
    return inboxItems.filter((item) => item.status === 'open').length;
  }

  function renderInboxBadge() {
    const count = getOpenInboxCount();
    const inboxLink = document.getElementById('navInbox');
    if (!inboxLink) return;

    let badge = inboxLink.querySelector('.notes-inbox-count-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'notes-inbox-count-badge';
      inboxLink.appendChild(badge);
    }

    inboxLink.classList.toggle('has-pending-inbox', count > 0);
    inboxLink.title = count > 0 ? `${count} pending inbox item${count === 1 ? '' : 's'}` : 'Inbox';
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.style.display = count > 0 ? '' : 'none';
  }

  function saveActionLog() {
    actionLog = normalizeActionLog(actionLog).slice(-400);
    writeJSON(LOG_KEY, actionLog);
  }

  function saveChat() {
    chatMessages = normalizeChat(chatMessages).slice(-120);
    assistantRenderRevision += 1;
    writeJSON(CHAT_KEY, chatMessages);
  }

  function saveHelperMemory() {
    helperMemory = normalizeHelperMemory(helperMemory);
    writeJSON(`${HELPER_MEMORY_KEY}:${activeUser.id}`, helperMemory);
  }

  function addHelperMemoryFact(text, source = 'assistant', category = 'general') {
    const clean = String(text || '').trim();
    if (!clean) return null;
    if (helperMemory.facts.some((item) => item.text.toLowerCase() === clean.toLowerCase())) return null;
    const timestamp = now();
    const fact = {
      id: makeId('mem'),
      text: clean.slice(0, 500),
      source,
      category: String(category || 'general').trim().slice(0, 40) || 'general',
      pinned: source === 'user',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    helperMemory.facts.push(fact);
    helperMemory.updatedAt = now();
    saveHelperMemory();
    return fact;
  }

  function removeHelperMemoryFact(memoryId = '') {
    const before = helperMemory.facts.length;
    helperMemory.facts = helperMemory.facts.filter((item) => item.id !== memoryId);
    if (helperMemory.facts.length === before) return false;
    helperMemory.updatedAt = now();
    saveHelperMemory();
    return true;
  }

  function getRelevantHelperMemory(query = '', limit = 16) {
    if (activeUser.memoryEnabled === false) return [];
    const queryTerms = new Set(
      String(query || '')
        .toLowerCase()
        .match(/[a-z0-9']{3,}/g) || []
    );
    return [...(helperMemory.facts || [])]
      .map((item, index) => {
        const memoryTerms = String(item.text || '').toLowerCase().match(/[a-z0-9']{3,}/g) || [];
        const overlap = memoryTerms.reduce((score, term) => score + (queryTerms.has(term) ? 1 : 0), 0);
        return {
          item,
          score: (item.pinned ? 100 : 0) + (overlap * 12) + (index / Math.max(1, helperMemory.facts.length)),
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.max(1, limit))
      .map(({ item }) => item.text);
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
    } else if (typeof openPage === 'function') {
      openPage(pageId);
    }
  }

  function getAssistantCurrentPageId(fallback = 'home') {
    let pageId = '';
    try {
      if (typeof window.getCurrentPageId === 'function') pageId = window.getCurrentPageId() || '';
    } catch (_error) {}
    try {
      if (!pageId && typeof currentPageId === 'string') pageId = currentPageId;
    } catch (_error) {}
    try {
      if (!pageId && typeof activeTabId === 'string' && Array.isArray(tabs)) {
        pageId = tabs.find((tab) => tab.id === activeTabId)?.pageId || '';
      }
    } catch (_error) {}
    return pageId || fallback;
  }

  function saveAssistantCurrentPageBlocks() {
    if (typeof window.saveCurrentPageBlocks === 'function') {
      window.saveCurrentPageBlocks();
      return true;
    }
    if (typeof saveCurrentPageBlocks === 'function') {
      saveCurrentPageBlocks();
      return true;
    }
    return false;
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

  function createInboxItem({ title, question, noteId = '', confidence = 0, suggestedPageId = '', suggestedAction = '', reason = '', choices = [] }) {
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
      choices,
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
    // If local scoring left the note unsorted, queue background AI organization
    if (note.sortState === 'unsorted' && note.bodyText.trim().length >= 10) {
      triggerBackgroundOrganize(note);
    }
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
    // If local scoring left it unsorted, escalate to AI
    if (note.sortState === 'unsorted' && note.bodyText.trim().length >= 10) {
      triggerBackgroundOrganize(note);
    }
  }

  function buildVaultSnapshot() {
    const SYSTEM_IDS = new Set(['home', 'search', 'inbox', 'notes', 'settings']);
    return Object.values(getPagesMap())
      .filter((page) => !SYSTEM_IDS.has(page.id))
      .map((page) => ({
        id: page.id,
        title: page.title || 'Untitled',
        breadcrumb: getBreadcrumb(page.id).map((item) => item.title || ''),
        layout: page.layout || 'board-canvas',
        category: page.category || 'none',
      }));
  }

  async function triggerBackgroundOrganize(note) {
    if (!note?.id || !note.bodyText || note.bodyText.trim().length < 10) return;
    if (organizingNoteIds.has(note.id)) return;

    // Skip if local scoring already confidently placed this note
    const current = getNoteById(note.id);
    if (current && current.sortState === 'placed' && current.helperConfidence >= 0.95) return;

    organizingNoteIds.add(note.id);
    try {
      const response = await fetch(ORGANIZE_API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: {
            id: note.id,
            title: note.title || '',
            bodyText: note.bodyText.slice(0, 2400),
          },
          vaultPages: buildVaultSnapshot(),
        }),
      });
      if (!response.ok) return;
      const result = await response.json().catch(() => null);
      if (!result || result.skip) return;

      const n = getNoteById(note.id);
      if (!n) return;

      // Apply title suggestion (only for untitled or AI-named notes)
      if (result.suggestedTitle && (!n.title.trim() || n.aiTitle)) {
        n.title = result.suggestedTitle;
        n.aiTitle = true;
        n.aiNamed = true;
      }

      // Apply shelf suggestions
      (result.suggestedShelves || []).forEach((name) => {
        const shelfId = ensureShelfByName(name, { kind: 'smart', createdBy: 'ai' });
        if (shelfId) n.shelfIds = dedupe([...(n.shelfIds || []), shelfId]);
      });

      const validPageIds = (result.suggestedPageIds || []).filter((id) => !!getPageById(id));

      // Apply all note mutations before saveNotes() — saveNotes() replaces objects via normalizeNotes,
      // making any reference held after that call stale.
      if (result.confidence >= 0.95 && validPageIds.length) {
        validPageIds.forEach((pageId) => {
          n.directPageIds = dedupe([...(n.directPageIds || []), pageId]);
          const shelfId = ensureContextShelf(pageId);
          if (shelfId) n.shelfIds = dedupe([...(n.shelfIds || []), shelfId]);
        });
        n.sortState = 'placed';
        n.needsReview = false;
        n.status = n.archived ? 'archived' : 'normal';
        n.helperConfidence = result.confidence;
        n.helperSummary = `Placed by AI under ${validPageIds.map((id) => getPageById(id)?.title).filter(Boolean).join(', ')}.`;
      } else if (result.confidence >= 0.75 && validPageIds.length) {
        validPageIds.forEach((pageId) => {
          n.directPageIds = dedupe([...(n.directPageIds || []), pageId]);
          const shelfId = ensureContextShelf(pageId);
          if (shelfId) n.shelfIds = dedupe([...(n.shelfIds || []), shelfId]);
        });
        n.sortState = 'review';
        n.needsReview = true;
        n.status = n.archived ? 'archived' : 'review';
        n.helperConfidence = result.confidence;
        n.helperSummary = `Placed for review under ${validPageIds.map((id) => getPageById(id)?.title).filter(Boolean).join(', ')}.`;
      } else if (n.shelfIds?.length || n.directPageIds?.length) {
        n.sortState = n.needsReview ? 'review' : 'placed';
        n.helperConfidence = result.confidence;
        n.helperSummary = 'Assigned to shelves by AI.';
      }

      // If AI wants a question and note isn't already placed, mark it for review now
      const needsQuestion = result.needsInboxQuestion && result.inboxQuestion?.question;
      if (needsQuestion && n.sortState !== 'placed') {
        n.needsReview = true;
        n.sortState = (n.shelfIds?.length || n.directPageIds?.length) ? 'review' : 'unsorted';
        n.status = n.archived ? 'archived' : 'review';
        n.helperConfidence = n.helperConfidence || result.confidence;
        n.helperSummary = n.helperSummary === 'Still unsorted.' ? 'Waiting on your input.' : n.helperSummary;
      }

      n.updatedAt = now();
      saveNotes(); // Single save — do NOT mutate n after this point

      // Create inbox item after saving note state (createInboxItem has its own saveInbox)
      if (needsQuestion) {
        const iq = result.inboxQuestion;
        const suggestedPageId = iq.suggestedPageId || validPageIds[0] || '';
        createInboxItem({
          title: iq.title || 'Helper question',
          question: iq.question,
          noteId: n.id,
          confidence: result.confidence,
          suggestedPageId,
          suggestedAction: 'ai-review',
          reason: iq.reason || '',
          choices: (iq.choices || []).map((c) => c.replace(/\s*\([^)]+\)\s*$/, '').trim()).filter(Boolean),
        });
      }

      // Re-render if user is on notes or inbox
      const currentPageId = getAssistantCurrentPageId('');
      if (['notes', 'inbox'].includes(currentPageId)) {
        renderEverything();
      }
    } catch (err) {
      console.warn('Background organize failed:', err);
    } finally {
      organizingNoteIds.delete(note.id);
    }
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

    if (getAssistantCurrentPageId('') === 'notes') {
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

    if (noteSaveTimer) flushPendingNoteSave();

    const activeElementId = document.activeElement?.id || '';
    const shouldRestoreNotesSearch = activeElementId === 'notesSearchInput';
    const shouldRestoreGlobalSearch = activeElementId === 'notesGlobalSearchInput';

    const pageId = getAssistantCurrentPageId('home');
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
    pageContent.style.display = 'block';
    pageContent.dataset.surfaceType = 'notes';
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
    const linkedPageContextHTML = primaryLinkedPage
      ? `<div class="note-linked-context-row"><button class="note-chip buttonish" data-open-linked-page="${primaryLinkedPage.id}">${escapeHTML(primaryLinkedPage.title)}</button></div>`
      : '';

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
                    ${note.needsReview || note.status === 'review' ? '<span class="notes-row-flag notes-row-flag-inline">Needs review</span>' : ''}
                  </div>
                </div>
                <div class="note-editor-divider" aria-hidden="true"></div>
                ${linkedPageContextHTML}
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
    const pageId = getAssistantCurrentPageId('home');
    const hero = document.getElementById('pageHero');
    const isInbox = pageId === 'inbox';
    if (!isInbox) return;

    const openItems = inboxItems.filter((item) => item.status === 'open');
    pageContent.classList.add('system-page-content');
    pageCanvas?.classList.add('system-page-canvas');
    pageContent.style.display = 'block';
    pageContent.dataset.surfaceType = 'inbox';
    grid.style.display = 'none';
    if (hero) hero.style.display = 'none';

    pageContent.innerHTML = `
      <section class="helper-inbox-surface">
        <div class="helper-inbox-hero">
          <div>
            <div class="notes-kicker">Inbox</div>
            <h2>${openItems.length ? `${openItems.length} pending question${openItems.length === 1 ? '' : 's'}` : 'Inbox clear'}</h2>
            <p>${openItems.length ? 'Review suggestions, link notes, or dismiss anything that is not useful.' : 'Nothing needs your attention right now.'}</p>
          </div>
          <div class="helper-inbox-stats">
            <div class="helper-inbox-stat"><span>${openItems.length}</span><label>Open</label></div>
            <div class="helper-inbox-stat"><span>${notes.filter((n) => n.needsReview).length}</span><label>Review</label></div>
            <div class="helper-inbox-stat"><span>${actionLog.length}</span><label>Logged</label></div>
          </div>
        </div>

        <div class="helper-inbox-list">
          ${openItems.length ? openItems.map((item) => inboxCardHTML(item)).join('') : `
            <div class="helper-inbox-empty">
              <strong>No pending questions</strong>
              <span>If the helper needs you to confirm where something belongs, it will show up here.</span>
            </div>
          `}
        </div>
      </section>
    `;
  }

  function inboxCardHTML(item) {
    const note = getNoteById(item.noteId);
    const suggestedPage = item.suggestedPageId ? getPageById(item.suggestedPageId) : null;
    const confidence = Math.round(item.confidence * 100);
    const confidenceClass = item.confidence >= 0.95 ? 'strong' : item.confidence >= 0.75 ? 'review' : '';
    return `
      <article class="helper-inbox-card">
        <div class="helper-inbox-card-top">
          <div class="helper-inbox-card-head">
            <div class="helper-inbox-card-title">${escapeHTML(item.title)}</div>
            <div class="helper-inbox-card-question">${escapeHTML(item.question)}</div>
          </div>
          <span class="notes-pill helper-inbox-confidence ${confidenceClass}">${confidence}%</span>
        </div>
        ${note ? `
          <button type="button" class="helper-inbox-note-preview" data-open-note-in-notes="${note.id}">
            <span>Note</span>
            <strong>${escapeHTML(note.title || 'Untitled note')}</strong>
            <em>${escapeHTML(note.preview || '')}</em>
          </button>
        ` : ''}
        ${item.reason ? `<div class="helper-inbox-reason">${escapeHTML(item.reason)}</div>` : ''}
        ${suggestedPage ? `<div class="helper-inbox-suggestion">Suggested: <strong>${escapeHTML(suggestedPage.title)}</strong></div>` : ''}
        <div class="helper-inbox-actions-row">
          <select class="helper-inbox-select" data-inbox-page-select="${item.id}">
            <option value="">Pick a page…</option>
            ${buildPageOptions(item.suggestedPageId)}
          </select>
          <textarea class="helper-inbox-answer" data-inbox-answer="${item.id}" placeholder="Optional note for the helper…">${escapeHTML(item.answer || '')}</textarea>
        </div>
        ${item.choices && item.choices.length ? `
        <div class="helper-inbox-choices">
          ${item.choices.map((choice) => `<button class="notes-mini-btn" data-inbox-choice="${escapeHTML(item.id)}" data-choice-label="${escapeHTML(choice)}">${escapeHTML(choice)}</button>`).join('')}
          <button class="notes-mini-btn danger" data-inbox-resolve="${item.id}">Dismiss</button>
        </div>
        ` : `
        <div class="helper-inbox-actions">
          ${suggestedPage ? `<button class="notes-mini-btn" data-inbox-accept="${item.id}">Accept</button>` : ''}
          <button class="notes-mini-btn" data-inbox-link="${item.id}">Link page</button>
          <button class="notes-mini-btn" data-inbox-loose="${item.id}">Keep loose</button>
          <button class="notes-mini-btn danger" data-inbox-resolve="${item.id}">Dismiss</button>
        </div>
        `}
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
    const topbarRight = document.querySelector('.topbar-right');
    if (!pageContent || !grid) return;
    const pageId = getAssistantCurrentPageId('home');

    // Clean up previous badge
    document.getElementById('pageNotesBadge')?.remove();
    pageContent.innerHTML = '';

    if (['notes', 'inbox', 'search', 'home', 'settings'].includes(pageId)) return;

    const related = getRelatedNotesForPage(pageId).slice(0, 8);
    pageContent.classList.remove('system-page-content');
    pageCanvas?.classList.remove('system-page-canvas');
    pageContent.style.display = '';
    pageContent.dataset.surfaceType = '';
    grid.style.display = '';

    if (!related.length) return;

    if (!topbarRight) return;

    // Keep related notes in navigation chrome so they never cover page content.
    const badge = document.createElement('div');
    badge.id = 'pageNotesBadge';
    badge.className = 'page-notes-badge page-notes-badge--topbar';
    badge.innerHTML = `
      <button class="page-notes-toggle" id="pageNotesToggle" aria-label="Related notes (${related.length})" aria-expanded="false">
        <span class="page-notes-toggle-label">Notes</span>
        <span class="page-notes-count">${related.length}</span>
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
          <button class="page-notes-action" id="pageOpenNotesBtn">Open in Notes</button>
        </div>
      </div>
    `;
    const anchor = document.getElementById('assistantTopBtn')
      || document.getElementById('moreBtn')
      || topbarRight.lastElementChild;
    topbarRight.insertBefore(badge, anchor || null);
  }

  function clearSystemSurfaceIfNeeded() {
    const pageContent = document.getElementById('pageContent');
    const pageCanvas = document.getElementById('pageCanvas');
    const grid = document.getElementById('grid');
    if (!pageContent || !grid) return;
    const pageId = getAssistantCurrentPageId('home');

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
      pageContent.style.display = '';
      pageContent.dataset.surfaceType = '';
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

  let pendingAssistantAvatar = '';

  function getAssistantPersonality(personalityId = activeUser.assistantPersonality) {
    return ASSISTANT_PERSONALITIES.find((item) => item.id === personalityId)
      || ASSISTANT_PERSONALITIES[0];
  }

  function getAssistantDisplayName() {
    return activeUser.assistantName || 'Assistant';
  }

  function saveActiveUserProfile(patch = {}) {
    Object.assign(activeUser, normalizeUserProfile({ ...activeUser, ...patch }));
    writeJSON(USER_PROFILE_KEY, activeUser);
    assistantRenderRevision += 1;
    ensureAssistantUI();
    renderAssistantMessages();
    return { ...activeUser };
  }

  function renderAssistantAvatarContent() {
    const assistantName = getAssistantDisplayName();
    return activeUser.assistantAvatar
      ? `<img src="${escapeHTML(activeUser.assistantAvatar)}" alt="">`
      : `<span class="assistant-drawer-avatar-initial">${escapeHTML(assistantName.slice(0, 1).toUpperCase())}</span>`;
  }

  function renderAssistantMemoryManager() {
    const host = document.getElementById('assistantProfileMemoryList');
    if (!host) return;
    const memories = [...(helperMemory.facts || [])].reverse();
    host.innerHTML = memories.length
      ? memories.map((memory) => `
          <div class="assistant-profile-memory-item">
            <div>
              <div class="assistant-profile-memory-text">${escapeHTML(memory.text)}</div>
              <div class="assistant-profile-memory-meta">${memory.source === 'user' ? 'Added by you' : 'Remembered from chat'}${memory.pinned ? ' · Always available' : ''}</div>
            </div>
            <button type="button" data-assistant-memory-delete="${escapeHTML(memory.id)}" aria-label="Forget this memory">&times;</button>
          </div>
        `).join('')
      : '<div class="assistant-profile-memory-empty">Nothing saved yet. Useful preferences and recurring habits will appear here.</div>';
  }

  function selectAssistantProfileTab(tabId = 'identity') {
    const overlay = document.getElementById('assistantProfileOverlay');
    if (!overlay) return;
    overlay.querySelectorAll('[data-assistant-profile-tab]').forEach((button) => {
      const active = button.dataset.assistantProfileTab === tabId;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    overlay.querySelectorAll('[data-assistant-profile-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.assistantProfilePanel !== tabId;
    });
  }

  function ensureAssistantProfileUI() {
    if (document.getElementById('assistantProfileOverlay')) return;
    const overlay = document.createElement('div');
    overlay.className = 'assistant-profile-overlay';
    overlay.id = 'assistantProfileOverlay';
    overlay.innerHTML = `
      <section class="assistant-profile-modal" role="dialog" aria-modal="true" aria-labelledby="assistantProfileTitle">
        <header class="assistant-profile-header">
          <div>
            <div class="assistant-profile-kicker">Sanctum assistant</div>
            <h2 id="assistantProfileTitle">Identity & memory</h2>
          </div>
          <button type="button" class="assistant-profile-close" data-assistant-profile-close aria-label="Close">&times;</button>
        </header>
        <div class="assistant-profile-tabs" role="tablist">
          <button type="button" class="active" data-assistant-profile-tab="identity" role="tab" aria-selected="true">Identity</button>
          <button type="button" data-assistant-profile-tab="memory" role="tab" aria-selected="false">Memory</button>
        </div>
        <div class="assistant-profile-body">
          <div data-assistant-profile-panel="identity">
            <div class="assistant-profile-portrait-row">
              <div class="assistant-profile-portrait" id="assistantProfilePortrait"></div>
              <div>
                <div class="assistant-profile-field-title">Portrait</div>
                <div class="assistant-profile-help">Use your drawing now or replace it whenever his room is ready.</div>
                <div class="assistant-profile-inline-actions">
                  <button type="button" data-assistant-avatar-choose>Choose image</button>
                  <button type="button" data-assistant-avatar-remove>Remove</button>
                </div>
                <input id="assistantProfileAvatarInput" type="file" accept="image/*" hidden>
              </div>
            </div>
            <label class="assistant-profile-field">
              <span>Name</span>
              <input id="assistantProfileName" type="text" maxlength="40" autocomplete="off">
            </label>
            <div class="assistant-profile-field">
              <span>Personality</span>
              <div class="assistant-personality-grid">
                ${ASSISTANT_PERSONALITIES.map((personality) => `
                  <button type="button" class="assistant-personality-card" data-assistant-personality="${escapeHTML(personality.id)}">
                    <strong>${escapeHTML(personality.label)}</strong>
                    <small>${escapeHTML(personality.shortLabel)}</small>
                  </button>
                `).join('')}
              </div>
              <div class="assistant-personality-description" id="assistantPersonalityDescription"></div>
            </div>
            <div class="assistant-profile-two-column">
              <label class="assistant-profile-field">
                <span>Gender</span>
                <select id="assistantProfileGender">
                  ${ASSISTANT_GENDERS.map((gender) => `<option value="${escapeHTML(gender.value)}">${escapeHTML(gender.label)}</option>`).join('')}
                </select>
              </label>
              <label class="assistant-profile-field">
                <span>Pronouns <small>optional</small></span>
                <input id="assistantProfilePronouns" type="text" maxlength="60" placeholder="he/him">
              </label>
            </div>
          </div>
          <div data-assistant-profile-panel="memory" hidden>
            <label class="assistant-profile-toggle">
              <input id="assistantMemoryEnabled" type="checkbox">
              <span><strong>Use memory</strong><small>Let the assistant use saved preferences and habits while helping you.</small></span>
            </label>
            <label class="assistant-profile-toggle">
              <input id="assistantAutoMemory" type="checkbox">
              <span><strong>Remember automatically</strong><small>Save stable, useful details from conversation—not database facts or private health records.</small></span>
            </label>
            <div class="assistant-profile-memory-add">
              <input id="assistantMemoryAddInput" type="text" maxlength="500" placeholder="Something he should always remember...">
              <button type="button" data-assistant-memory-add>Add</button>
            </div>
            <div class="assistant-profile-memory-list" id="assistantProfileMemoryList"></div>
          </div>
        </div>
        <footer class="assistant-profile-footer">
          <button type="button" class="is-secondary" data-assistant-profile-close>Cancel</button>
          <button type="button" class="is-primary" data-assistant-profile-save>Save assistant</button>
        </footer>
      </section>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-assistant-profile-close]')) {
        overlay.classList.remove('open');
        return;
      }
      const tab = event.target.closest('[data-assistant-profile-tab]');
      if (tab) {
        selectAssistantProfileTab(tab.dataset.assistantProfileTab);
        return;
      }
      const personalityButton = event.target.closest('[data-assistant-personality]');
      if (personalityButton) {
        const personality = getAssistantPersonality(personalityButton.dataset.assistantPersonality);
        overlay.dataset.selectedPersonality = personality.id;
        overlay.querySelectorAll('[data-assistant-personality]').forEach((button) => {
          button.classList.toggle('selected', button.dataset.assistantPersonality === personality.id);
        });
        const genderInput = document.getElementById('assistantProfileGender');
        if (genderInput) genderInput.value = personality.gender;
        const description = document.getElementById('assistantPersonalityDescription');
        if (description) description.textContent = personality.description;
        return;
      }
      if (event.target.closest('[data-assistant-avatar-choose]')) {
        document.getElementById('assistantProfileAvatarInput')?.click();
        return;
      }
      if (event.target.closest('[data-assistant-avatar-remove]')) {
        pendingAssistantAvatar = '';
        const portrait = document.getElementById('assistantProfilePortrait');
        if (portrait) portrait.innerHTML = `<span>${escapeHTML((document.getElementById('assistantProfileName')?.value || 'A').slice(0, 1).toUpperCase())}</span>`;
        return;
      }
      const memoryDelete = event.target.closest('[data-assistant-memory-delete]');
      if (memoryDelete) {
        removeHelperMemoryFact(memoryDelete.dataset.assistantMemoryDelete);
        renderAssistantMemoryManager();
        return;
      }
      if (event.target.closest('[data-assistant-memory-add]')) {
        const input = document.getElementById('assistantMemoryAddInput');
        if (addHelperMemoryFact(input?.value || '', 'user', 'manual') && input) input.value = '';
        renderAssistantMemoryManager();
        return;
      }
      if (event.target.closest('[data-assistant-profile-save]')) {
        saveActiveUserProfile({
          assistantName: document.getElementById('assistantProfileName')?.value || 'Warden',
          assistantAvatar: pendingAssistantAvatar,
          assistantPersonality: overlay.dataset.selectedPersonality || 'southern-warden',
          assistantGender: document.getElementById('assistantProfileGender')?.value || 'masculine',
          assistantPronouns: document.getElementById('assistantProfilePronouns')?.value || '',
          memoryEnabled: document.getElementById('assistantMemoryEnabled')?.checked !== false,
          autoMemory: document.getElementById('assistantAutoMemory')?.checked !== false,
        });
        overlay.classList.remove('open');
      }
    });

    document.getElementById('assistantProfileAvatarInput')?.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (!file || !file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        pendingAssistantAvatar = String(reader.result || '');
        const portrait = document.getElementById('assistantProfilePortrait');
        if (portrait) portrait.innerHTML = `<img src="${escapeHTML(pendingAssistantAvatar)}" alt="">`;
      }, { once: true });
      reader.readAsDataURL(file);
    });
  }

  function openAssistantProfile(tabId = 'identity') {
    ensureAssistantProfileUI();
    const overlay = document.getElementById('assistantProfileOverlay');
    const personality = getAssistantPersonality();
    pendingAssistantAvatar = activeUser.assistantAvatar || '';
    overlay.dataset.selectedPersonality = personality.id;
    const nameInput = document.getElementById('assistantProfileName');
    const genderInput = document.getElementById('assistantProfileGender');
    const pronounsInput = document.getElementById('assistantProfilePronouns');
    const memoryEnabled = document.getElementById('assistantMemoryEnabled');
    const autoMemory = document.getElementById('assistantAutoMemory');
    if (nameInput) nameInput.value = getAssistantDisplayName();
    if (genderInput) genderInput.value = activeUser.assistantGender || personality.gender;
    if (pronounsInput) pronounsInput.value = activeUser.assistantPronouns || '';
    if (memoryEnabled) memoryEnabled.checked = activeUser.memoryEnabled !== false;
    if (autoMemory) autoMemory.checked = activeUser.autoMemory !== false;
    const portrait = document.getElementById('assistantProfilePortrait');
    if (portrait) portrait.innerHTML = pendingAssistantAvatar
      ? `<img src="${escapeHTML(pendingAssistantAvatar)}" alt="">`
      : `<span>${escapeHTML(getAssistantDisplayName().slice(0, 1).toUpperCase())}</span>`;
    overlay.querySelectorAll('[data-assistant-personality]').forEach((button) => {
      button.classList.toggle('selected', button.dataset.assistantPersonality === personality.id);
    });
    const description = document.getElementById('assistantPersonalityDescription');
    if (description) description.textContent = personality.description;
    renderAssistantMemoryManager();
    selectAssistantProfileTab(tabId);
    overlay.classList.add('open');
    setTimeout(() => (tabId === 'memory' ? document.getElementById('assistantMemoryAddInput') : nameInput)?.focus(), 30);
  }

  function ensureAssistantUI() {
    const personality = getAssistantPersonality();
    if (!document.getElementById('assistantTopBtn')) {
      const topbarRight = document.querySelector('.topbar-right');
      const moreBtn = document.getElementById('moreBtn');
      if (topbarRight && moreBtn) {
        const btn = document.createElement('button');
        btn.className = 'icon-btn topbar-ask-btn';
        btn.id = 'assistantTopBtn';
        btn.setAttribute('aria-label', `Ask ${getAssistantDisplayName()}`);
        btn.title = `Ask ${getAssistantDisplayName()}`;
        btn.innerHTML = renderAssistantAvatarContent();
        topbarRight.insertBefore(btn, moreBtn);
      }
    } else {
      const topButton = document.getElementById('assistantTopBtn');
      topButton.setAttribute('aria-label', `Ask ${getAssistantDisplayName()}`);
      topButton.title = `Ask ${getAssistantDisplayName()}`;
      topButton.innerHTML = renderAssistantAvatarContent();
    }

    if (document.getElementById('assistantDrawer')) {
      const nameEl = document.querySelector('#assistantDrawer .assistant-drawer-name');
      const roleEl = document.querySelector('#assistantDrawer .assistant-drawer-role');
      const subtitleEl = document.querySelector('#assistantDrawer .assistant-drawer-subtitle');
      const avatarEl = document.querySelector('#assistantDrawer .assistant-drawer-avatar');
      const composerInput = document.getElementById('assistantComposerInput');
      if (nameEl) nameEl.textContent = getAssistantDisplayName();
      if (roleEl) roleEl.textContent = personality.label;
      if (subtitleEl) subtitleEl.textContent = personality.subtitle;
      if (avatarEl) {
        avatarEl.innerHTML = `${renderAssistantAvatarContent()}<span class="assistant-drawer-presence"></span>`;
      }
      if (composerInput) composerInput.placeholder = `Message ${getAssistantDisplayName()}...`;
      if (!document.getElementById('assistantProfileOpen')) {
        const controls = document.querySelector('#assistantDrawer .assistant-drawer-controls');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'assistant-drawer-profile';
        button.id = 'assistantProfileOpen';
        button.setAttribute('aria-label', 'Assistant identity and memory');
        button.title = 'Identity and memory';
        button.textContent = '•••';
        controls?.prepend(button);
      }
      return;
    }

    const assistantName = getAssistantDisplayName();
    const drawer = document.createElement('aside');
    drawer.className = 'assistant-drawer assistant-drawer-right';
    drawer.id = 'assistantDrawer';
    drawer.innerHTML = `
      <div class="assistant-drawer-top">
        <div class="assistant-drawer-identity">
          <div class="assistant-drawer-avatar" aria-hidden="true">
            ${renderAssistantAvatarContent()}
            <span class="assistant-drawer-presence"></span>
          </div>
          <div class="assistant-drawer-heading">
            <div class="assistant-drawer-name">${escapeHTML(assistantName)}</div>
            <div class="assistant-drawer-role-row">
              <span class="assistant-drawer-role">${escapeHTML(personality.label)}</span>
            </div>
            <div class="assistant-drawer-subtitle">${escapeHTML(personality.subtitle)}</div>
          </div>
        </div>
        <div class="assistant-drawer-controls">
          <button type="button" class="assistant-drawer-profile" id="assistantProfileOpen" aria-label="Assistant identity and memory" title="Identity and memory">•••</button>
          <span class="assistant-drawer-spark" aria-hidden="true">&#10022;</span>
          <button class="assistant-drawer-close" id="assistantDrawerClose" aria-label="Close assistant">&minus;</button>
        </div>
      </div>
      <div class="assistant-messages" id="assistantMessages"></div>
      <div class="assistant-composer">
        <div class="assistant-composer-row">
          <textarea class="assistant-composer-input" id="assistantComposerInput" rows="1" placeholder="Message ${escapeHTML(assistantName)}..."></textarea>
          <span class="assistant-composer-spark" aria-hidden="true">&#10022;</span>
          <button class="assistant-composer-send" id="assistantComposerSend" aria-label="Send">&#10148;</button>
        </div>
      </div>
    `;
    document.body.appendChild(drawer);
  }

  function formatAssistantMessageText(text = '') {
    return escapeHTML(String(text || ''))
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
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

  function formatProposalValue(value) {
    if (value === null || value === undefined || value === '') return 'empty';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  function findProposalSchema(catalog, databaseRef) {
    return Array.isArray(catalog?.schemas)
      ? catalog.schemas.find((schema) => schema.ref === databaseRef) || null
      : null;
  }

  function getProposalRelationRows(catalog, databaseRef) {
    return Array.isArray(catalog?.records)
      ? catalog.records
          .filter((record) => record.kind === 'database-row' && record.parentRef === databaseRef)
          .slice(0, 150)
      : [];
  }

  function renderProposalRelationSelect({
    messageId,
    operationId,
    propertyId = '',
    targetDatabaseRef,
    selectedRowIds = [],
    catalog,
    relationOperation = false,
  }) {
    const selected = new Set(Array.isArray(selectedRowIds) ? selectedRowIds : []);
    const rows = getProposalRelationRows(catalog, targetDatabaseRef);
    if (!rows.length) {
      return `<div class="assistant-db-proposal-input-note">No current target rows are available to choose from.</div>`;
    }
    return `
      <select
        class="assistant-db-proposal-input assistant-db-proposal-relation-input"
        multiple
        size="${Math.min(4, Math.max(2, rows.length))}"
        data-db-proposal-edit-message="${escapeHTML(messageId)}"
        data-db-proposal-operation-id="${escapeHTML(operationId)}"
        ${propertyId ? `data-db-proposal-property-id="${escapeHTML(propertyId)}"` : ''}
        ${relationOperation ? 'data-db-proposal-relation-targets="1"' : ''}
        aria-label="Related records"
      >
        ${rows.map((row) => `
          <option value="${escapeHTML(row.id)}" ${selected.has(row.id) ? 'selected' : ''}>${escapeHTML(row.title || 'Untitled record')}</option>
        `).join('')}
      </select>
      <div class="assistant-db-proposal-input-note">Use Ctrl or Cmd to choose more than one.</div>
    `;
  }

  function renderProposalChangeEditor(messageId, operation, change, catalog) {
    const value = change.newValue;
    const commonAttributes = `
      data-db-proposal-edit-message="${escapeHTML(messageId)}"
      data-db-proposal-operation-id="${escapeHTML(operation.id)}"
      data-db-proposal-property-id="${escapeHTML(change.propertyId)}"
    `;
    if (change.propertyType === 'relation') {
      const schema = findProposalSchema(catalog, operation.databaseRef);
      const property = Array.isArray(schema?.properties)
        ? schema.properties.find((entry) => entry.id === change.propertyId)
        : null;
      const operationsApi = window.SanctumAssistantOperations;
      const targetDatabaseRef = operationsApi?.databaseRefFromSource(property?.relationTarget || {});
      return renderProposalRelationSelect({
        messageId,
        operationId: operation.id,
        propertyId: change.propertyId,
        targetDatabaseRef,
        selectedRowIds: value,
        catalog,
      });
    }
    if (change.propertyType === 'checkbox') {
      return `
        <select class="assistant-db-proposal-input" ${commonAttributes}>
          <option value="true" ${value === true || value === 'true' ? 'selected' : ''}>Yes</option>
          <option value="false" ${value === false || value === 'false' ? 'selected' : ''}>No</option>
        </select>
      `;
    }
    if (change.propertyType === 'page-layout') {
      const pageLayouts = [
        ['board-canvas', 'Board page'],
        ['infinite-canvas', 'Infinite board'],
        ['document', 'Document'],
        ['journal', 'Journal'],
      ];
      return `
        <select class="assistant-db-proposal-input" ${commonAttributes} aria-label="Page type">
          ${pageLayouts.map(([layout, label]) => (
            `<option value="${layout}" ${value === layout ? 'selected' : ''}>${label}</option>`
          )).join('')}
        </select>
      `;
    }
    if (change.propertyType === 'date') {
      const dateValue = typeof value === 'string' ? value.slice(0, 10) : (value?.start || value?.date || '').slice(0, 10);
      return `<input class="assistant-db-proposal-input" type="date" value="${escapeHTML(dateValue)}" ${commonAttributes}>`;
    }
    if (change.propertyType === 'number') {
      return `<input class="assistant-db-proposal-input" type="number" step="any" value="${escapeHTML(value ?? '')}" ${commonAttributes}>`;
    }
    const inputValue = typeof value === 'object' && value !== null ? formatProposalValue(value) : (value ?? '');
    return `<input class="assistant-db-proposal-input" type="text" value="${escapeHTML(inputValue)}" ${commonAttributes}>`;
  }

  function renderAssistantDatabaseProposal(message = {}) {
    const proposal = message.databaseProposal;
    const operationsApi = window.SanctumAssistantOperations;
    if (!proposal || !operationsApi) return '';
    const receipt = normalizeAssistantTransactionReceipt(message.transactionReceipt);
    const transactionBusy = activeAssistantTransactionMessageId === message.id;
    const proposalSuperseded = message.proposalSuperseded === true;
    const reviewLocked = receipt?.status === 'applied' || transactionBusy || proposalSuperseded;
    const operations = Array.isArray(proposal.operations) ? proposal.operations : [];
    const contentOperationTypes = new Set([
      'append-note-content',
      'append-document-section',
      'add-page-text-block',
      'replace-note-text',
      'replace-document-section-text',
      'replace-canvas-block-text',
    ]);
    const replacementOperationTypes = new Set([
      'replace-note-text',
      'replace-document-section-text',
      'replace-canvas-block-text',
    ]);
    const appendContentOperationTypes = new Set([
      'append-note-content',
      'append-document-section',
      'add-page-text-block',
    ]);
    const hasContentOperations = operations.some((operation) => contentOperationTypes.has(operation.type));
    const hasPageOperations = operations.some((operation) => operation.type === 'create-page');
    const questions = Array.isArray(proposal.questions) ? proposal.questions : [];
    const selectedIds = new Set(Array.isArray(proposal.review?.selectedOperationIds)
      ? proposal.review.selectedOperationIds
      : []);
    const catalog = buildSanctumContextCatalog();
    const operationHTML = operations.map((operation) => {
      const selected = selectedIds.has(operation.id);
      const changes = Array.isArray(operation.changes) ? operation.changes : [];
      const changeHTML = changes.length && !replacementOperationTypes.has(operation.type)
        ? `<div class="assistant-db-proposal-changes">${changes.map((change) => `
            <div class="assistant-db-proposal-change">
              <div class="assistant-db-proposal-change-label">
                <span>${escapeHTML(change.propertyName || change.propertyId || 'Field')}</span>
                ${change.oldValue !== null ? `<small>Currently ${escapeHTML(formatProposalValue(change.oldValue))}</small>` : '<small>New value</small>'}
              </div>
              <div class="assistant-db-proposal-editor">
                ${renderProposalChangeEditor(message.id, operation, change, catalog)}
              </div>
            </div>
          `).join('')}</div>`
        : '';
      const replacementHTML = replacementOperationTypes.has(operation.type)
        ? `<div class="assistant-content-replacement">
            <div class="assistant-content-replacement-side before">
              <span>Before · exact passage</span>
              <div>${escapeHTML(operation.matchText || '')}</div>
            </div>
            <label class="assistant-content-replacement-side after">
              <span>After · replacement</span>
              <textarea
                class="assistant-db-proposal-input"
                rows="3"
                data-db-proposal-edit-message="${escapeHTML(message.id)}"
                data-db-proposal-operation-id="${escapeHTML(operation.id)}"
                data-db-proposal-property-id="replacementText"
              >${escapeHTML(operation.replacementText || '')}</textarea>
            </label>
          </div>`
        : '';
      const relationHTML = operation.type === 'relate-database-rows'
        ? `<div class="assistant-db-proposal-changes">
            <div class="assistant-db-proposal-change">
              <div class="assistant-db-proposal-change-label">
                <span>${escapeHTML(operation.propertyName || 'Related records')}</span>
                <small>${escapeHTML(operation.targetDatabaseTitle || 'Target database')}</small>
              </div>
              <div class="assistant-db-proposal-editor">
                ${renderProposalRelationSelect({
                  messageId: message.id,
                  operationId: operation.id,
                  targetDatabaseRef: operation.targetDatabaseRef,
                  selectedRowIds: operation.targetRowIds,
                  catalog,
                  relationOperation: true,
                })}
              </div>
            </div>
          </div>`
        : '';
      const appendHTML = operation.type === 'append-database-field' || appendContentOperationTypes.has(operation.type)
        ? `<div class="assistant-db-proposal-changes">
            <label class="assistant-db-proposal-append-label">
              <span>${escapeHTML(operation.propertyName || (appendContentOperationTypes.has(operation.type) ? 'Visible text to add' : 'Text to append'))}</span>
              <textarea
                class="assistant-db-proposal-input"
                rows="3"
                data-db-proposal-edit-message="${escapeHTML(message.id)}"
                data-db-proposal-operation-id="${escapeHTML(operation.id)}"
                data-db-proposal-property-id="${escapeHTML(appendContentOperationTypes.has(operation.type) ? 'content' : (operation.propertyId || ''))}"
              >${escapeHTML(operation.content || '')}</textarea>
            </label>
          </div>`
        : '';
      const databaseStructureHTML = operation.type === 'create-inline-database'
        ? (() => {
            const properties = Array.isArray(operation.databaseProperties) ? operation.databaseProperties : [];
            const rows = Array.isArray(operation.databaseRows) ? operation.databaseRows : [];
            const views = Array.isArray(operation.views) ? operation.views : [];
            const titleProperty = properties.find((property) => property.type === 'title') || properties[0];
            const rowPreview = rows.slice(0, 8).map((row) => {
              const title = row?.values?.[titleProperty?.id || 'name'] || row?.title || 'Untitled';
              return escapeHTML(title);
            });
            const propertySummary = properties
              .map((property) => `${escapeHTML(property.name || property.id || 'Field')} <small>${escapeHTML(property.type || 'text')}</small>`)
              .join(', ');
            const viewSummary = views.map((view) => {
              const filters = Array.isArray(view.filters) ? view.filters : [];
              const sorts = Array.isArray(view.sorts) ? view.sorts : [];
              const rules = [];
              if (filters.length) rules.push(`${filters.length} filter${filters.length === 1 ? '' : 's'}`);
              if (sorts.some((sort) => sort.propertyId === '__last_opened')) rules.push('actual page-open recency');
              else if (sorts.length) rules.push(`${sorts.length} sort${sorts.length === 1 ? '' : 's'}`);
              if (view.groupBy) rules.push('grouped');
              return `<li><strong>${escapeHTML(view.title || 'View')}</strong> · ${escapeHTML(view.view || 'table')}${rules.length ? ` · ${escapeHTML(rules.join(', '))}` : ''}</li>`;
            }).join('');
            return `<div class="assistant-db-proposal-changes">
              <div class="assistant-db-proposal-change">
                <div class="assistant-db-proposal-change-label">
                  <span>Database page</span>
                  <small>Full page</small>
                </div>
                <div class="assistant-db-proposal-structure-copy">
                  ${escapeHTML(operation.databaseTitle || 'Database')} will own the fields and rows. The blocks below are linked views.
                </div>
              </div>
              <div class="assistant-db-proposal-change">
                <div class="assistant-db-proposal-change-label">
                  <span>Properties</span>
                  <small>${properties.length} field${properties.length === 1 ? '' : 's'}</small>
                </div>
                <div class="assistant-db-proposal-structure-copy">${propertySummary || 'Name title field'}</div>
              </div>
              <div class="assistant-db-proposal-change">
                <div class="assistant-db-proposal-change-label">
                  <span>Rows</span>
                  <small>${rows.length} page${rows.length === 1 ? '' : 's'}</small>
                </div>
                <div class="assistant-db-proposal-structure-copy">
                  ${rowPreview.join(', ')}${rows.length > rowPreview.length ? `, and ${rows.length - rowPreview.length} more` : ''}
                </div>
              </div>
              <div class="assistant-db-proposal-change">
                <div class="assistant-db-proposal-change-label">
                  <span>Views</span>
                  <small>Linked to one database</small>
                </div>
                <ul class="assistant-db-proposal-structure-views">${viewSummary}</ul>
              </div>
            </div>`;
          })()
        : '';
      const bulkUpdateHTML = operation.type === 'update-database-rows'
        ? (() => {
            const rowUpdates = Array.isArray(operation.rowUpdates) ? operation.rowUpdates : [];
            const preview = rowUpdates.slice(0, 10).map((row) => {
              const values = Object.values(row?.values || {}).map(formatProposalValue).filter(Boolean).join(', ');
              return `<li><strong>${escapeHTML(row.rowTitle || 'Untitled record')}</strong>${values ? ` &middot; ${escapeHTML(values)}` : ''}</li>`;
            }).join('');
            return `<div class="assistant-db-proposal-changes">
              <div class="assistant-db-proposal-change">
                <div class="assistant-db-proposal-change-label">
                  <span>Rows</span>
                  <small>${rowUpdates.length} update${rowUpdates.length === 1 ? '' : 's'}</small>
                </div>
                <ul class="assistant-db-proposal-structure-views">
                  ${preview}${rowUpdates.length > 10 ? `<li>and ${rowUpdates.length - 10} more</li>` : ''}
                </ul>
              </div>
            </div>`;
          })()
        : '';
      const assumptionHTML = Array.isArray(operation.assumptions) && operation.assumptions.length
        ? `<div class="assistant-db-proposal-assumptions">${operation.assumptions
            .map((assumption) => `Assumption: ${escapeHTML(assumption)}`)
            .join('<br>')}</div>`
        : '';
      const operationBodyHTML = `${changeHTML}${replacementHTML}${relationHTML}${appendHTML}${databaseStructureHTML}${bulkUpdateHTML}${assumptionHTML}`;
      const operationDetailsHTML = operationBodyHTML
        ? `<details class="assistant-db-operation-details">
            <summary>Details</summary>
            <div class="assistant-db-operation-details-body">${operationBodyHTML}</div>
          </details>`
        : '';
      const confidence = Number.isFinite(Number(operation.confidence)) && Number(operation.confidence) > 0
        ? `${Math.round(Number(operation.confidence) * 100)}%`
        : '';
      return `
        <div class="assistant-db-proposal-operation ${selected ? 'selected' : 'not-selected'}">
          <label class="assistant-db-proposal-operation-choice">
            <input
              type="checkbox"
              data-db-proposal-toggle-message="${escapeHTML(message.id)}"
              data-db-proposal-operation-id="${escapeHTML(operation.id)}"
              ${selected ? 'checked' : ''}
            >
            <span>
              <span class="assistant-db-proposal-operation-title">${escapeHTML(operationsApi.describeOperation(operation))}</span>
              <span class="assistant-db-proposal-operation-meta">
                ${escapeHTML(operation.basis === 'explicit' ? 'Explicit' : 'Inferred')}
                ${confidence ? ` &middot; ${escapeHTML(confidence)}` : ''}
                ${operation.databaseTitle
                  ? ` &middot; ${escapeHTML(operation.databaseTitle)}`
                  : operation.targetTitle
                    ? ` &middot; ${escapeHTML(operation.targetTitle)}`
                    : operation.parentTitle
                      ? ` &middot; ${escapeHTML(operation.parentTitle)}`
                    : ''}
              </span>
            </span>
          </label>
          ${operationDetailsHTML}
        </div>
      `;
    }).join('');
    const answers = proposal.review?.answers && typeof proposal.review.answers === 'object'
      ? proposal.review.answers
      : {};
    const selectedQuestions = questions.filter((question) => {
      const operationIds = Array.isArray(question.operationIds) ? question.operationIds : [];
      return !operationIds.length || operationIds.some((id) => selectedIds.has(id));
    });
    const unansweredQuestions = selectedQuestions.filter((question) => !String(answers[question.id] || '').trim());
    const questionsHTML = questions.length
      ? `
        <div class="assistant-db-proposal-questions">
          <div class="assistant-db-proposal-question-head">
            <div>
              <div class="assistant-db-proposal-section-label">One thing needed</div>
              <strong>Answer this before anything is created</strong>
            </div>
            <span>${questions.length}</span>
          </div>
          ${questions.map((question) => `
            <label class="assistant-db-proposal-question">
              <span>${escapeHTML(question.question || '')}</span>
              <textarea
                class="assistant-db-proposal-input"
                rows="2"
                placeholder="Type your answer here..."
                data-db-proposal-answer-message="${escapeHTML(message.id)}"
                data-db-proposal-question-id="${escapeHTML(question.id || '')}"
              >${escapeHTML(answers[question.id] || '')}</textarea>
            </label>
          `).join('')}
          <small class="assistant-db-proposal-question-help">Your answer goes back to the assistant so it can finish this proposal. This unfinished version will not be applied.</small>
        </div>
      `
      : '';
    const rejectedCount = Array.isArray(proposal.rejectedOperations) ? proposal.rejectedOperations.length : 0;
    const reviewErrors = Array.isArray(proposal.review?.errors) ? proposal.review.errors : [];
    const errorsHTML = reviewErrors.length
      ? `<div class="assistant-db-proposal-errors">
          ${reviewErrors.map((error) => `<div>${escapeHTML(error)}</div>`).join('')}
        </div>`
      : '';
    const transactionItems = (receipt?.adapters || []).flatMap((entry) => {
      const result = entry?.result || {};
      const createdRows = Array.isArray(result.createdRows)
        ? result.createdRows.map((row) => ({
            kind: 'database-row',
            targetTitle: row.rowTitle || 'New record',
            destinationTitle: row.databaseTitle || 'Database',
            pageId: row.source?.pageId || '',
          }))
        : [];
      const changedItems = Array.isArray(result.changedItems)
        ? result.changedItems.map((item) => ({
            ...item,
            destinationTitle: item.kind === 'note'
              ? 'Note'
              : item.kind === 'document-section'
                ? 'Document'
                : ['page-text-block', 'canvas-block'].includes(item.kind)
                  ? 'Page'
                  : item.kind === 'page'
                    ? 'New page'
                  : 'Content',
          }))
        : [];
      return [...createdRows, ...changedItems];
    });
    const receiptHTML = receipt
      ? `<div class="assistant-db-transaction-receipt ${receipt.status}">
          <div class="assistant-db-proposal-section-label">${receipt.status === 'applied' ? 'Applied' : 'Undone'}</div>
          <div class="assistant-db-transaction-title">
            ${receipt.status === 'applied'
              ? `${receipt.operations.length} change${receipt.operations.length === 1 ? '' : 's'} completed`
              : hasPageOperations && hasContentOperations
                ? 'The created pages and their starter content were removed'
                : hasContentOperations
                ? 'The affected content was restored'
                : hasPageOperations
                  ? 'The created pages were removed'
                : 'The affected databases were restored'}
          </div>
          ${transactionItems.map((item) => `
            <button class="assistant-db-transaction-row"
              data-assistant-transaction-open-page="${escapeHTML(item.pageId || '')}"
              data-assistant-transaction-open-note="${escapeHTML(item.noteId || '')}"
              ${receipt.status === 'undone' && item.kind === 'page' ? 'disabled' : ''}>
              ${escapeHTML(item.targetTitle || 'Changed content')} <span>${escapeHTML(item.destinationTitle || 'Sanctum')}</span>
            </button>
          `).join('')}
          <div class="assistant-db-transaction-meta">
            ${receipt.status === 'applied' ? `Applied ${escapeHTML(formatDateTime(receipt.appliedAt))}` : `Undone ${escapeHTML(formatDateTime(receipt.undoneAt))}`}
          </div>
          ${receipt.status === 'applied' && receipt.undoAvailable
            ? `<button class="assistant-db-transaction-undo" data-assistant-transaction-undo-message="${escapeHTML(message.id)}" ${transactionBusy ? 'disabled' : ''}>Undo changes</button>`
            : ''}
          ${receipt.status === 'applied' && proposal.continuation?.remainingRows?.length
            ? `<button class="assistant-db-transaction-continue"
                data-assistant-bulk-continue-message="${escapeHTML(message.id)}"
                ${activeAssistantBusy || proposal.continuation.started ? 'disabled' : ''}>
                ${proposal.continuation.started
                  ? 'Preparing next batch&hellip;'
                  : `Continue next ${Math.min(proposal.continuation.batchSize || ASSISTANT_BULK_BATCH_SIZE, proposal.continuation.remainingRows.length)} rows`}
              </button>
              <div class="assistant-db-transaction-continuation-note">
                ${proposal.continuation.completedRowCount} of ${proposal.continuation.totalRowCount} rows reviewed so far.
              </div>`
            : ''}
        </div>`
      : '';
    const canAct = !proposalSuperseded && (!receipt || receipt.status === 'undone');
    const primaryActionDisabled = activeAssistantBusy
      || transactionBusy
      || selectedIds.size === 0
      || reviewErrors.length > 0
      || (questions.length > 0 && unansweredQuestions.length > 0);
    const primaryActionHTML = canAct
      ? questions.length
        ? `<div class="assistant-db-transaction-apply-row is-clarification">
            <button
              class="assistant-db-transaction-apply"
              data-db-proposal-submit-answers-message="${escapeHTML(message.id)}"
              ${primaryActionDisabled ? 'disabled' : ''}
            >${unansweredQuestions.length ? 'Type your answer above' : 'Send answer & finish proposal'}</button>
            <span>${unansweredQuestions.length ? 'Nothing will be created yet.' : 'The assistant will return a complete version to approve.'}</span>
          </div>`
        : `<div class="assistant-db-transaction-apply-row">
            <button
              class="assistant-db-transaction-apply"
              data-assistant-transaction-apply-message="${escapeHTML(message.id)}"
              ${primaryActionDisabled ? 'disabled' : ''}
            >${transactionBusy ? 'Applying&hellip;' : `Apply ${selectedIds.size} change${selectedIds.size === 1 ? '' : 's'}`}</button>
            <span>${selectedIds.size ? 'Nothing changes until you press this. Undo is included.' : 'Choose at least one change in the details.'}</span>
          </div>`
      : '';
    const transactionErrorHTML = message.transactionError
      ? `<div class="assistant-db-proposal-errors"><div>${escapeHTML(message.transactionError)}</div></div>`
      : '';
    const proposalKind = hasPageOperations && hasContentOperations
      ? 'Sanctum proposal'
      : hasPageOperations
        ? 'Page proposal'
        : hasContentOperations
          ? 'Content proposal'
          : 'Database proposal';
    const structureOperation = operations.find((operation) => operation.type === 'create-inline-database');
    const proposalOverview = structureOperation
      ? `${structureOperation.databaseRows?.length || 0} rows &middot; ${structureOperation.views?.length || 0} views &middot; ${escapeHTML(structureOperation.targetTitle || 'Current page')}`
      : `${selectedIds.size} of ${operations.length} change${operations.length === 1 ? '' : 's'} selected`;
    const proposalStatus = proposalSuperseded
      ? 'Updated'
      : receipt?.status === 'applied'
      ? 'Applied'
      : receipt?.status === 'undone'
        ? 'Undone'
        : unansweredQuestions.length
          ? 'Needs answer'
          : 'Ready';
    const forceReviewOpen = reviewErrors.length || selectedIds.size === 0;
    const footerHTML = receipt?.status === 'applied'
      ? '<div class="assistant-db-proposal-footer">Saved &middot; Undo stays available until the affected data changes.</div>'
      : receipt?.status === 'undone'
        ? '<div class="assistant-db-proposal-footer">Reversed.</div>'
        : proposalSuperseded
          ? '<div class="assistant-db-proposal-footer">A revised proposal follows below.</div>'
          : '';
    return `
      <div
        class="assistant-db-proposal ${receipt?.status === 'applied' ? 'is-applied' : ''} ${proposalSuperseded ? 'is-superseded' : ''}"
        data-assistant-proposal-message="${escapeHTML(message.id)}"
      >
        <div class="assistant-db-proposal-head">
          <div class="assistant-db-proposal-icon" aria-hidden="true">&#10022;</div>
          <div>
            <div class="assistant-db-proposal-kicker">${proposalKind}</div>
            <div class="assistant-db-proposal-title">${escapeHTML(proposal.summary || 'Suggested changes')}</div>
          </div>
          <span class="assistant-db-proposal-readonly" data-assistant-proposal-status>${proposalStatus}</span>
        </div>
        <div class="assistant-db-proposal-overview">${proposalSuperseded ? 'This version was replaced by your answer.' : proposalOverview}</div>
        <fieldset class="assistant-db-proposal-review-fieldset" ${reviewLocked ? 'disabled' : ''}>
          ${questionsHTML}
          ${errorsHTML}
          <details class="assistant-db-proposal-details" ${forceReviewOpen ? 'open' : ''}>
            <summary>
              <span>
                <strong>What will change</strong>
                <small>${operations.length} item${operations.length === 1 ? '' : 's'} &middot; ${selectedIds.size} selected</small>
              </span>
              <span class="assistant-db-proposal-details-label">View details <b aria-hidden="true">⌄</b></span>
            </summary>
            <div class="assistant-db-proposal-details-body">
              <div class="assistant-db-proposal-operations">${operationHTML}</div>
              ${rejectedCount ? `<div class="assistant-db-proposal-withheld">${rejectedCount} invalid suggestion${rejectedCount === 1 ? '' : 's'} withheld.</div>` : ''}
            </div>
          </details>
        </fieldset>
        ${transactionErrorHTML}
        ${primaryActionHTML}
        ${receiptHTML}
        ${footerHTML}
      </div>
    `;
  }

  function renderAssistantMessages() {
    const host = document.getElementById('assistantMessages');
    if (!host) return;
    const renderSignature = [
      assistantRenderRevision,
      activeAssistantBusy ? 1 : 0,
      activeAssistantEditMessageId,
      getAssistantDisplayName(),
      activeUser.displayName || 'You',
      activeUser.assistantPersonality,
      activeUser.assistantGender,
      activeUser.assistantAvatar,
    ].join('|');
    if (host.dataset.renderSignature === renderSignature) return;

    if (!chatMessages.length && !activeAssistantBusy) {
      host.innerHTML = `
        <div class="assistant-empty">
          <div class="assistant-empty-spark" aria-hidden="true">&#10022;</div>
          <div class="assistant-empty-title">What can I help with?</div>
          <p>Ask about this page, find something, or make a change.</p>
        </div>
      `;
      host.dataset.renderSignature = renderSignature;
      return;
    }

    const branchHasAppliedTransaction = new Array(chatMessages.length);
    let hasAppliedTransaction = false;
    for (let index = chatMessages.length - 1; index >= 0; index -= 1) {
      hasAppliedTransaction = hasAppliedTransaction
        || chatMessages[index].transactionReceipt?.status === 'applied';
      branchHasAppliedTransaction[index] = hasAppliedTransaction;
    }

    const messagesHTML = chatMessages.map((message, messageIndex) => {
      const branchHasApplied = branchHasAppliedTransaction[messageIndex];
      const editing = message.role === 'user' && message.id === activeAssistantEditMessageId && !branchHasApplied;
      const userMessageBody = editing
        ? `
          <div class="assistant-message-edit">
            <textarea
              class="assistant-message-edit-input"
              rows="3"
              data-assistant-message-edit-input="${escapeHTML(message.id)}"
            >${escapeHTML(message.text || '')}</textarea>
            <div class="assistant-message-edit-note">Saving removes this message and every reply after it, then resends the correction.</div>
            <div class="assistant-message-edit-actions">
              <button data-assistant-message-edit-save="${escapeHTML(message.id)}">Save &amp; resend</button>
              <button class="secondary" data-assistant-message-edit-cancel="${escapeHTML(message.id)}">Cancel</button>
            </div>
          </div>
        `
        : `
          ${message.text ? `<div class="assistant-message-text">${formatAssistantMessageText(message.text)}</div>` : ''}
          <div class="assistant-message-user-actions">
            <button data-assistant-message-edit="${escapeHTML(message.id)}" ${activeAssistantBusy || branchHasApplied ? 'disabled' : ''} title="${branchHasApplied ? 'Undo applied changes first' : 'Edit and resend'}">Edit</button>
            <button data-assistant-message-delete="${escapeHTML(message.id)}" ${activeAssistantBusy || branchHasApplied ? 'disabled' : ''} title="${branchHasApplied ? 'Undo applied changes first' : 'Delete this conversation branch'}">Delete</button>
          </div>
        `;
      return `
      <div class="assistant-message ${message.role}">
        <div class="assistant-message-role">${escapeHTML(message.role === 'assistant' ? getAssistantDisplayName() : activeUser.displayName || 'You')}</div>
        ${message.role === 'user'
          ? userMessageBody
          : (message.text ? `<div class="assistant-message-text">${formatAssistantMessageText(message.text)}</div>` : '')}
        ${message.role === 'assistant' ? renderAssistantDatabaseProposal(message) : ''}
        ${message.role === 'assistant' ? renderAssistantActions(message) : ''}
        <div class="assistant-message-time">${escapeHTML(formatAssistantTime(message.createdAt))}</div>
      </div>
    `;
    }).join('');

    const busyHTML = activeAssistantBusy
      ? `
        <div class="assistant-message system">
          <div class="assistant-message-role">${escapeHTML(getAssistantDisplayName())}</div>
          <div class="assistant-message-text assistant-thinking"><span></span><span></span><span></span></div>
        </div>
      `
      : '';

    host.innerHTML = `${messagesHTML}${busyHTML}`;
    host.dataset.renderSignature = renderSignature;
    host.scrollTop = host.scrollHeight;
  }

  function beginAssistantMessageEdit(messageId) {
    if (activeAssistantBusy) return;
    const index = chatMessages.findIndex((entry) => entry.id === messageId && entry.role === 'user');
    const message = index === -1 ? null : chatMessages[index];
    if (!message || chatMessages.slice(index).some((entry) => entry.transactionReceipt?.status === 'applied')) return;
    activeAssistantEditMessageId = message.id;
    renderAssistantMessages();
    setTimeout(() => {
      const input = document.querySelector(`[data-assistant-message-edit-input="${message.id}"]`);
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }, 0);
  }

  function cancelAssistantMessageEdit() {
    activeAssistantEditMessageId = '';
    renderAssistantMessages();
  }

  function rollbackAssistantConversationFrom(messageId) {
    const index = chatMessages.findIndex((message) => message.id === messageId && message.role === 'user');
    if (index === -1) return false;
    if (chatMessages.slice(index).some((message) => message.transactionReceipt?.status === 'applied')) return false;
    chatMessages = chatMessages.slice(0, index);
    activeAssistantEditMessageId = '';
    saveChat();
    renderAssistantMessages();
    return true;
  }

  async function saveAssistantMessageEdit(messageId) {
    if (activeAssistantBusy) return;
    const input = document.querySelector(`[data-assistant-message-edit-input="${messageId}"]`);
    const nextText = String(input?.value || '').trim();
    if (!nextText) return;
    const existing = chatMessages.find((message) => message.id === messageId && message.role === 'user');
    if (!existing) return;
    if (nextText === existing.text.trim()) {
      cancelAssistantMessageEdit();
      return;
    }
    if (!rollbackAssistantConversationFrom(messageId)) return;
    await handleAssistantQuery(nextText);
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
    const embedded = role === 'assistant' ? extractEmbeddedAssistantPayload(text) : null;
    const optionActions = Array.isArray(options.actions)
      ? options.actions.map(normalizeChatAction).filter(Boolean)
      : [];
    const embeddedActions = !optionActions.length && Array.isArray(embedded?.suggestedActions)
      ? embedded.suggestedActions.map(normalizeChatAction).filter(Boolean)
      : [];
    chatMessages.push({
      id: makeId('msg'),
      role,
      text: embedded?.reply || text,
      actions: optionActions.length ? optionActions : embeddedActions,
      databaseProposal: normalizeStoredDatabaseProposal(options.databaseProposal),
      proposalSuperseded: false,
      transactionReceipt: null,
      transactionError: '',
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

  function collectContextDatabases() {
    if (typeof window.getDatabaseCalloutSources !== "function"
      || typeof window.getDatabaseCalloutSourceData !== "function") {
      return [];
    }
    try {
      return (window.getDatabaseCalloutSources() || [])
        .map((source) => window.getDatabaseCalloutSourceData(source))
        .filter(Boolean);
    } catch (error) {
      console.warn("Could not collect databases for assistant context", error);
      return [];
    }
  }

  function getContextCatalogNotes() {
    const draft = getLiveEditorNoteDraft();
    if (!draft?.id) return notes;
    const found = notes.some((note) => note.id === draft.id);
    return found
      ? notes.map((note) => note.id === draft.id ? draft : note)
      : [...notes, draft];
  }

  function buildSanctumContextCatalog() {
    const engine = window.SanctumContextEngine;
    if (!engine || typeof engine.buildCatalog !== "function") return null;
    try {
      return engine.buildCatalog({
        domains: Array.isArray(window.userDomains) ? window.userDomains : [],
        pages: Array.isArray(window.userPages) ? window.userPages : [],
        blocksByPage: typeof window.readAllPageBlocks === "function" ? window.readAllPageBlocks() : {},
        documentsByPage: typeof window.readAllDocuments === "function" ? window.readAllDocuments() : {},
        pageProps: readJSON((window.STORAGE_KEYS && window.STORAGE_KEYS.pageProps) || "sanctum_page_props_v1", {}),
        notes: getContextCatalogNotes(),
        databases: collectContextDatabases(),
      });
    } catch (error) {
      console.warn("Could not build Sanctum context catalog", error);
      return null;
    }
  }

  function buildRetrievedContext(catalog, routePlan, query, currentPageId) {
    const engine = window.SanctumContextEngine;
    if (!catalog || !engine) return { plan: null, entityResolution: null, records: [], schemas: [] };
    const currentPageRecord = engine.getRecord(catalog, engine.pageRef(currentPageId));
    const preferScopeId = currentPageRecord?.scopeId || "";
    return engine.retrieveByRoutePlan(catalog, routePlan, {
      query,
      currentPageId,
      preferScopeId,
      maxRowsPerDatabase: 100,
      maxRecords: 140,
      maxSchemas: 8,
    });
  }

  async function routeAssistantContext(catalog, query, currentPageId) {
    const engine = window.SanctumContextEngine;
    if (!catalog || !engine) return { plan: null, entityResolution: null, records: [], schemas: [] };
    const currentPageRecord = engine.getRecord(catalog, engine.pageRef(currentPageId));
    const preferScopeId = currentPageRecord?.scopeId || "";
    const schemas = catalog.schemas.map((schema) => engine.toAssistantSchema(schema));
    const requestsEveryRow = /\b(?:all|every)\b[\s\S]{0,80}\b(?:row|record|game)s?\b/i.test(String(query || ""))
      || /\ball\s+\d+\b/i.test(String(query || ""));
    let routePlan = null;

    if (USE_AI_CONTEXT_ROUTER && !requestsEveryRow) try {
      const response = await fetch(CONTEXT_ROUTE_API_PATH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: String(query || "").trim(),
            currentPage: currentPageRecord ? {
              pageId: currentPageRecord.pageId,
              title: currentPageRecord.title,
              type: currentPageRecord.type,
              scopeId: currentPageRecord.scopeId,
              scopeTitle: currentPageRecord.scopeTitle,
              breadcrumb: currentPageRecord.breadcrumb,
            } : {
              pageId: currentPageId,
              title: getPageById(currentPageId)?.title || "Home",
              type: getPageById(currentPageId)?.category || "",
              scopeId: "",
              scopeTitle: "",
              breadcrumb: [],
            },
            schemas,
          }),
        });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.fallback) {
        throw new Error(payload?.reason || `Context routing failed (${response.status}).`);
      }
      routePlan = engine.normalizeRoutePlan(catalog, payload);
    } catch (error) {
      console.warn("Assistant context routing fell back to local source matching", error);
    }

    if (!routePlan) {
      routePlan = engine.routeSchemasDeterministically(catalog, query, {
        currentPageId,
        preferScopeId,
        limit: 4,
      });
    }
    if (requestsEveryRow && routePlan.selections.length > 0) {
      routePlan = {
        ...routePlan,
        selections: routePlan.selections.map((selection) => ({
          ...selection,
          rowMode: "all",
          rowQuery: "",
          limit: 100
        }))
      };
    }
    return buildRetrievedContext(catalog, routePlan, query, currentPageId);
  }

  window.buildSanctumContextCatalog = buildSanctumContextCatalog;
  window.searchSanctumContext = function searchSanctumContext(query, options = {}) {
    const catalog = buildSanctumContextCatalog();
    if (!catalog || !window.SanctumContextEngine) return [];
    return window.SanctumContextEngine.search(catalog, query, options);
  };

  async function buildAssistantRequestContext(query, options = {}) {
    const currentPageId = getAssistantCurrentPageId("home");
    const currentPage = getPageUnderstanding(currentPageId || "home");
    const activeNote = getLiveEditorNoteDraft() || getNoteById(activeNoteId);
    const contextCatalog = buildSanctumContextCatalog();
    const retrievedContext = await routeAssistantContext(contextCatalog, query, currentPageId);
    const contextEngine = window.SanctumContextEngine;
    const routePlan = retrievedContext.plan || {
      selections: [],
      include: { notes: false, documents: false, canvas: false, pages: false, currentPage: false },
    };
    const includeNotes = routePlan.include?.notes === true;
    const includePages = routePlan.include?.pages === true;
    const includeCurrentPage = routePlan.include?.currentPage === true;
    const relatedNotes = (includeNotes ? getRelatedNotesForPage(currentPage.pageId) : []).slice(0, 8).map((note) => ({
      id: note.id,
      title: note.title || "Untitled note",
      preview: note.preview || buildPreview(note.bodyText || ""),
      shelfNames: (note.shelfIds || []).map((id) => getShelfById(id)?.name).filter(Boolean),
      linkedPages: (note.directPageIds || []).map((id) => getPageById(id)?.title).filter(Boolean),
    }));

    const noteMatches = (includeNotes ? searchNotes(query) : []).map((note) => ({
      id: note.id,
      title: note.title || "Untitled note",
      preview: note.preview || buildPreview(note.bodyText || ""),
      body: (note.bodyText || "").slice(0, 2200),
      shelfNames: (note.shelfIds || []).map((id) => getShelfById(id)?.name).filter(Boolean),
      linkedPages: (note.directPageIds || []).map((id) => getPageById(id)?.title).filter(Boolean),
      sortState: note.sortState || "unsorted",
      needsReview: !!note.needsReview,
    }));

    const pageMatches = (includePages ? searchPages(query) : []).map((page) => ({
      id: page.id,
      title: page.title || "Untitled page",
      breadcrumb: getBreadcrumb(page.id).map((item) => item.title || ""),
      layout: page.layout || "board-canvas",
      category: page.category || "none",
      summary: getPageDescriptorText(page.id).slice(0, 420),
    }));

    const continuationTargetKeys = new Set((options.continuationTargetRows || []).map((row) => (
      `${row.databaseRef}::${row.rowId}`
    )));
    const retrievedRecords = continuationTargetKeys.size
      ? retrievedContext.records.filter((record) => (
          record.kind !== 'database-row'
          || continuationTargetKeys.has(`${record.parentRef}::${record.id}`)
        ))
      : retrievedContext.records;

    return {
      mode: 'ask',
      user: activeUser,
      context: {
        currentPage: {
          ...currentPage,
          descriptor: includeCurrentPage ? currentPage.descriptor : "",
        },
        activeNote: includeNotes && activeNote ? {
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
        nearbyLinkedPages: includePages || includeCurrentPage ? (currentPage.nearbyLinkedPages || []) : [],
        searchMatches: {
          notes: noteMatches,
          pages: pageMatches,
        },
        retrievedRecords: retrievedRecords.map((record) => (
          contextEngine.toAssistantRecord(record, { maxText: 1400 })
        )),
        entityResolution: retrievedContext.entityResolution || null,
        availableSchemas: retrievedContext.schemas,
        contextRoutePlan: routePlan,
        contextCatalogStats: contextCatalog ? {
          version: contextCatalog.version,
          recordCount: contextCatalog.records.length,
          schemaCount: contextCatalog.schemas.length,
          kinds: contextCatalog.records.reduce((counts, record) => {
            counts[record.kind] = (counts[record.kind] || 0) + 1;
            return counts;
          }, {}),
        } : null,
        helperMemory: getRelevantHelperMemory(query, 16),
        conversationHistory: chatMessages
          .filter((message, index) => !(
            index === chatMessages.length - 1
            && message.role === "user"
            && String(message.text || "").trim() === String(query || "").trim()
          ))
          .slice(-8)
          .map((message) => ({
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

  function applyAssistantPayload(payload = {}, requestContext = null) {
    const memoryWrites = Array.isArray(payload.memoryWrites) ? payload.memoryWrites : [];
    if (activeUser.memoryEnabled !== false && activeUser.autoMemory !== false) {
      memoryWrites.forEach((text) => addHelperMemoryFact(text, "assistant"));
    }
    const operationsApi = window.SanctumAssistantOperations;
    const contextCatalog = buildSanctumContextCatalog();
    const routePlan = requestContext?.context?.contextRoutePlan || null;
    const retrievedRefs = Array.isArray(requestContext?.context?.retrievedRecords)
      ? requestContext.context.retrievedRecords.map((record) => record?.ref).filter(Boolean)
      : [];
    const currentPageId = requestContext?.context?.currentPage?.pageId || '';
    const currentPageRef = currentPageId && window.SanctumContextEngine?.pageRef
      ? window.SanctumContextEngine.pageRef(currentPageId)
      : '';
    const entityResolution = requestContext?.context?.entityResolution || null;
    const routedDatabaseRefs = Array.isArray(routePlan?.selections)
      ? routePlan.selections.map((selection) => selection?.databaseRef).filter(Boolean)
      : [];
    const resolvedDatabaseRefs = Array.isArray(entityResolution?.allowedDatabaseRefs)
      ? entityResolution.allowedDatabaseRefs
      : [];
    const databaseProposal = operationsApi && contextCatalog && routePlan
      ? operationsApi.normalizeProposal(
          payload.changeProposal || payload.databaseProposal,
          contextCatalog,
          routePlan,
          {
            allowedContentRefs: [...new Set([...retrievedRefs, currentPageRef].filter(Boolean))],
            allowedDatabaseRefs: [...new Set([...routedDatabaseRefs, ...resolvedDatabaseRefs])],
            entityResolutionStatus: entityResolution?.status || 'none',
          }
        )
      : null;
    if (databaseProposal) {
      databaseProposal.continuation = buildAssistantBulkContinuation(databaseProposal, requestContext);
    }
    return {
      actions: buildAssistantActionList(payload),
      databaseProposal,
    };
  }

  function buildAssistantBulkContinuation(proposal = {}, requestContext = null) {
    const continuationJob = requestContext?.continuationJob && typeof requestContext.continuationJob === 'object'
      ? requestContext.continuationJob
      : null;
    const query = String(requestContext?.message || '').trim();
    const requestsWholeSet = /\b(?:all|every)\b[\s\S]{0,100}\b(?:row|record|entry|item|game)s?\b/i.test(query)
      || /\ball\s+\d+\b/i.test(query);
    if (!requestsWholeSet && !continuationJob) return null;
    const bulkOperations = (proposal.operations || []).filter((operation) => operation.type === 'update-database-rows');
    if (!bulkOperations.length) return null;

    const completedKeys = new Set();
    bulkOperations.forEach((operation) => {
      (operation.rowUpdates || []).forEach((update) => {
        completedKeys.add(`${operation.databaseRef}::${update.rowId}`);
      });
    });
    const relevantRefs = new Set(bulkOperations.map((operation) => operation.databaseRef));
    const allRows = continuationJob
      ? (continuationJob.remainingRows || []).filter((row) => relevantRefs.has(row.databaseRef))
      : (requestContext?.context?.retrievedRecords || [])
          .filter((record) => record?.kind === 'database-row' && relevantRefs.has(record.parentRef))
          .map((record) => ({
            databaseRef: record.parentRef,
            rowId: record.id,
            title: record.title || 'Untitled record',
          }));
    const remainingRows = allRows.filter((row) => !completedKeys.has(`${row.databaseRef}::${row.rowId}`));
    if (!remainingRows.length) return null;
    return {
      summary: proposal.summary || 'Continue the bulk database update',
      batchSize: ASSISTANT_BULK_BATCH_SIZE,
      totalRowCount: continuationJob?.totalRowCount || allRows.length,
      completedRowCount: (continuationJob?.completedRowCount || 0) + (allRows.length - remainingRows.length),
      started: false,
      remainingRows,
    };
  }

  async function handleAssistantQuery(query, options = {}) {
    const clean = String(query || "").trim();
    if (!clean) return;
    pushChat("user", clean);
    activeAssistantBusy = true;
    renderAssistantMessages();

    try {
      const requestContext = await buildAssistantRequestContext(clean, options);
      if (options.continuationJob) requestContext.continuationJob = options.continuationJob;
      const response = await fetch(ASSISTANT_API_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestContext),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.reply || `Assistant request failed (${response.status}).`);
      }
      const appliedPayload = applyAssistantPayload(payload || {}, requestContext);
      pushChat("assistant", payload?.reply || "No reply yet.", {
        actions: appliedPayload.actions,
        databaseProposal: appliedPayload.databaseProposal,
      });
      renderEverything();
      return true;
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

    const currentPageId = getAssistantCurrentPageId("home");
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
    return false;
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
          const activePageId = getAssistantCurrentPageId('home');
          const newPage = typeof window.createPage === 'function'
            ? window.createPage(action.newPageTitle, activePageId, 'board-canvas', 'none', 'page', {
              reuseExisting: true,
              currentPageId: activePageId,
              includeCurrentPage: true
            })
            : null;
          targetPageId = newPage ? newPage.id : activePageId;
        } else {
          targetPageId = getAssistantCurrentPageId('home');
        }
        const applied = applyLayoutBlocks(targetPageId, aiBlocks);
        resultText = applied ? 'Layout applied!' : 'Could not apply layout';
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
      containerTitle: spec.containerTitle || '',
      containerBody: spec.containerBody || '',
      containerItems: Array.isArray(spec.containerItems) ? spec.containerItems : [],
      assistantLayoutId: spec.assistantLayoutId || '',
      assistantLayoutSlot: Number.isFinite(Number(spec.assistantLayoutSlot)) ? Number(spec.assistantLayoutSlot) : i,
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
      pageCardImageMode: ['none', 'linked', 'custom'].includes(spec.pageCardImageMode) ? spec.pageCardImageMode : 'none',
      pageCardImagePos: 50,
      pageCardView: spec.pageCardView === 'gallery' ? 'gallery' : 'default',
      pageCardHideIcon: 0,
      cardStyle: spec.cardStyle || '',
    }));

    if (typeof window.getPageBlocks !== 'function' || typeof window.setPageBlocks !== 'function') return false;

    const currentPageId = getAssistantCurrentPageId('');

    if (pageId === currentPageId) {
      // Save the current live DOM state first so we don't lose unsaved edits
      saveAssistantCurrentPageBlocks();
    }

    // Merge new blocks into stored blocks then reload — works for all page types
    const existing = window.getPageBlocks(pageId);
    window.setPageBlocks(pageId, [...existing, ...newBlocks]);

    if (pageId === currentPageId) {
      const grid = document.getElementById('grid');
      const canRenderLive = grid && typeof buildBlockFromData === 'function';
      if (canRenderLive) {
        newBlocks.forEach((data) => grid.appendChild(buildBlockFromData(data)));
        if (typeof expandGrid === 'function') expandGrid();
        saveAssistantCurrentPageBlocks();
      } else {
        openPageSafe(pageId);
      }
    }

    return true;
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

  function updateDatabaseProposal(messageId, updater) {
    const operationsApi = window.SanctumAssistantOperations;
    if (!operationsApi) return null;
    return updateChatMessage(messageId, (message) => {
      const currentProposal = normalizeStoredDatabaseProposal(message.databaseProposal);
      if (!currentProposal) return message;
      const nextProposal = updater(currentProposal, operationsApi);
      return {
        ...message,
        databaseProposal: normalizeStoredDatabaseProposal(nextProposal),
      };
    });
  }

  function updateProposalAnswerWithoutRerender(messageId, questionId, value) {
    const operationsApi = window.SanctumAssistantOperations;
    const message = chatMessages.find((entry) => entry.id === messageId);
    const proposal = normalizeStoredDatabaseProposal(message?.databaseProposal);
    if (!operationsApi || !message || !proposal) return false;
    message.databaseProposal = normalizeStoredDatabaseProposal(
      operationsApi.setQuestionAnswer(proposal, questionId, value)
    );
    return true;
  }

  function syncProposalAnswerAction(messageId) {
    const card = document.querySelector(`[data-assistant-proposal-message="${CSS.escape(String(messageId || ''))}"]`);
    if (!card) return;
    const inputs = Array.from(card.querySelectorAll('[data-db-proposal-answer-message][data-db-proposal-question-id]'));
    const unanswered = inputs.filter((input) => !String(input.value || '').trim()).length;
    const button = card.querySelector('[data-db-proposal-submit-answers-message]');
    const status = card.querySelector('[data-assistant-proposal-status]');
    const help = card.querySelector('.assistant-db-transaction-apply-row.is-clarification > span');
    if (button) {
      button.disabled = unanswered > 0 || activeAssistantBusy;
      button.textContent = unanswered ? 'Type your answer above' : 'Send answer & finish proposal';
    }
    if (status) status.textContent = unanswered ? 'Needs answer' : 'Answer ready';
    if (help) {
      help.textContent = unanswered
        ? 'Nothing will be created yet.'
        : 'The assistant will return a complete version to approve.';
    }
  }

  function handleDatabaseProposalChange(event) {
    const target = event.target;
    const toggle = target.closest('[data-db-proposal-toggle-message][data-db-proposal-operation-id]');
    if (toggle) {
      updateDatabaseProposal(toggle.dataset.dbProposalToggleMessage, (proposal, operationsApi) => (
        operationsApi.setOperationSelected(
          proposal,
          toggle.dataset.dbProposalOperationId,
          !!toggle.checked
        )
      ));
      return true;
    }

    const answer = target.closest('[data-db-proposal-answer-message][data-db-proposal-question-id]');
    if (answer) {
      saveChat();
      return true;
    }

    const editor = target.closest('[data-db-proposal-edit-message][data-db-proposal-operation-id]');
    if (!editor) return false;
    const value = editor.multiple
      ? [...editor.selectedOptions].map((option) => option.value)
      : editor.value;
    updateDatabaseProposal(editor.dataset.dbProposalEditMessage, (proposal, operationsApi) => (
      editor.dataset.dbProposalRelationTargets === '1'
        ? operationsApi.setRelationTargets(proposal, editor.dataset.dbProposalOperationId, value)
        : operationsApi.editOperationValue(
            proposal,
            editor.dataset.dbProposalOperationId,
            editor.dataset.dbProposalPropertyId,
            value
          )
    ));
    return true;
  }

  function getAssistantTransactionAdapters() {
    return {
      database: window.SanctumDatabaseTransactionAdapter,
      'database-structure': window.SanctumDatabaseStructureTransactionAdapter,
      page: window.SanctumPageTransactionAdapter,
      ...(window.SanctumContentTransactionAdapters || {}),
    };
  }

  async function submitAssistantProposalAnswers(messageId) {
    if (activeAssistantBusy || activeAssistantTransactionMessageId) return;
    const message = chatMessages.find((entry) => entry.id === messageId);
    const proposal = normalizeStoredDatabaseProposal(message?.databaseProposal);
    if (!message || !proposal || message.proposalSuperseded) return;
    const selectedIds = new Set(proposal.review?.selectedOperationIds || []);
    const questions = (proposal.questions || []).filter((question) => {
      const operationIds = Array.isArray(question.operationIds) ? question.operationIds : [];
      return !operationIds.length || operationIds.some((id) => selectedIds.has(id));
    });
    const answered = questions.map((question) => ({
      question: String(question.question || '').trim(),
      answer: String(proposal.review?.answers?.[question.id] || '').trim(),
    }));
    if (!answered.length || answered.some((item) => !item.answer)) {
      syncProposalAnswerAction(messageId);
      return;
    }

    saveChat();
    const revisionRequest = [
      `Here are my answers for the pending "${proposal.summary || 'Sanctum changes'}" proposal:`,
      ...answered.flatMap((item) => [`Question: ${item.question}`, `Answer: ${item.answer}`]),
      'Please revise it now and return one complete replacement proposal that includes these answers.',
      'Do not apply anything yet, and do not leave the clarified parts out of the replacement proposal.',
    ].join('\n');
    const completed = await handleAssistantQuery(revisionRequest);
    if (completed === true) {
      updateChatMessage(messageId, {
        proposalSuperseded: true,
        transactionError: '',
      });
    }
  }

  async function applyAssistantTransaction(messageId) {
    if (activeAssistantTransactionMessageId) return;
    const message = chatMessages.find((entry) => entry.id === messageId);
    const transactionsApi = window.SanctumAssistantTransactions;
    const operationsApi = window.SanctumAssistantOperations;
    if (!message?.databaseProposal) return;
    const requiredSourceTypes = [...new Set((message.databaseProposal.operations || [])
      .map((operation) => transactionsApi?.sourceTypeForOperation?.(operation))
      .filter(Boolean))];
    const adapters = getAssistantTransactionAdapters();
    const missingAdapters = requiredSourceTypes.filter((sourceType) => !adapters[sourceType]);
    if (!transactionsApi || !operationsApi || missingAdapters.length) {
      const missing = [
        !transactionsApi ? 'transaction engine' : '',
        !operationsApi ? 'proposal engine' : '',
        ...missingAdapters.map((sourceType) => `${sourceType} adapter`),
      ].filter(Boolean);
      updateChatMessage(messageId, {
        transactionError: `Apply is unavailable because the ${missing.join(', ')} did not load. Refresh Sanctum and try again.`,
      });
      renderAssistantMessages();
      return;
    }

    activeAssistantTransactionMessageId = messageId;
    message.transactionError = '';
    saveChat();
    renderAssistantMessages();
    try {
      const reviewedProposal = operationsApi.prepareProposal(
        message.databaseProposal,
        buildSanctumContextCatalog() || {}
      );
      if (!reviewedProposal?.preparedTransaction || reviewedProposal.review?.status !== 'prepared') {
        const reason = reviewedProposal?.review?.errors?.[0] || 'The proposal is no longer valid.';
        throw new Error(reason);
      }
      const receipt = await transactionsApi.executePreparedTransaction(
        reviewedProposal.preparedTransaction,
        adapters
      );
      updateChatMessage(messageId, (current) => ({
        ...current,
        databaseProposal: reviewedProposal,
        transactionReceipt: receipt,
        transactionError: '',
      }));
    } catch (error) {
      updateChatMessage(messageId, {
        transactionError: String(error?.message || error || 'The transaction could not be applied.'),
      });
    } finally {
      activeAssistantTransactionMessageId = '';
      renderEverything();
    }
  }

  async function undoAssistantTransaction(messageId) {
    if (activeAssistantTransactionMessageId) return;
    const message = chatMessages.find((entry) => entry.id === messageId);
    const transactionsApi = window.SanctumAssistantTransactions;
    if (!message?.transactionReceipt) return;
    const adapters = getAssistantTransactionAdapters();
    const requiredSourceTypes = [...new Set((message.transactionReceipt.adapters || [])
      .map((entry) => entry?.sourceType)
      .filter(Boolean))];
    const missingAdapters = requiredSourceTypes.filter((sourceType) => !adapters[sourceType]);
    if (!transactionsApi || missingAdapters.length) {
      const missing = [
        !transactionsApi ? 'transaction engine' : '',
        ...missingAdapters.map((sourceType) => `${sourceType} adapter`),
      ].filter(Boolean);
      updateChatMessage(messageId, {
        transactionError: `Undo is unavailable because the ${missing.join(', ')} did not load. Refresh Sanctum and try again.`,
      });
      renderAssistantMessages();
      return;
    }

    activeAssistantTransactionMessageId = messageId;
    message.transactionError = '';
    saveChat();
    renderAssistantMessages();
    try {
      const receipt = await transactionsApi.undoTransaction(
        message.transactionReceipt,
        adapters
      );
      updateChatMessage(messageId, {
        transactionReceipt: receipt,
        transactionError: '',
      });
    } catch (error) {
      updateChatMessage(messageId, {
        transactionError: String(error?.message || error || 'Undo could not be completed safely.'),
      });
    } finally {
      activeAssistantTransactionMessageId = '';
      renderEverything();
    }
  }

  async function continueAssistantBulkJob(messageId) {
    if (activeAssistantBusy) return;
    const message = chatMessages.find((entry) => entry.id === messageId);
    const proposal = normalizeStoredDatabaseProposal(message?.databaseProposal);
    const continuation = proposal?.continuation;
    if (!message || message.transactionReceipt?.status !== 'applied' || !continuation?.remainingRows?.length) return;
    const nextRows = continuation.remainingRows.slice(0, continuation.batchSize || ASSISTANT_BULK_BATCH_SIZE);
    message.databaseProposal = normalizeStoredDatabaseProposal({
      ...proposal,
      continuation: { ...continuation, started: true },
    });
    saveChat();
    renderAssistantMessages();
    const rowsByDatabase = nextRows.reduce((groups, row) => {
      if (!groups[row.databaseRef]) groups[row.databaseRef] = [];
      groups[row.databaseRef].push(row.rowId);
      return groups;
    }, {});
    const rowInstructions = Object.entries(rowsByDatabase)
      .map(([databaseRef, rowIds]) => `${databaseRef}: ${rowIds.join(', ')}`)
      .join('\n');
    const completed = await handleAssistantQuery(
      `Continue "${continuation.summary}" for the next reviewed batch. `
      + `Update only these exact rows and do not repeat rows already applied:\n${rowInstructions}`,
      {
        continuationJob: {
          summary: continuation.summary,
          batchSize: continuation.batchSize,
          totalRowCount: continuation.totalRowCount,
          completedRowCount: continuation.completedRowCount,
          remainingRows: continuation.remainingRows,
        },
        continuationTargetRows: nextRows,
      }
    );
    if (!completed) {
      updateChatMessage(messageId, {
        databaseProposal: normalizeStoredDatabaseProposal({
          ...proposal,
          continuation: { ...continuation, started: false },
        }),
      });
    }
  }

  function handleDocumentClick(event) {
    const target = event.target;

    const assistantProfileButton = target.closest('#assistantProfileOpen');
    if (assistantProfileButton) {
      openAssistantProfile('identity');
      return;
    }

    const submitProposalAnswersButton = target.closest('[data-db-proposal-submit-answers-message]');
    if (submitProposalAnswersButton) {
      submitAssistantProposalAnswers(submitProposalAnswersButton.dataset.dbProposalSubmitAnswersMessage);
      return;
    }

    const applyAssistantTransactionButton = target.closest('[data-assistant-transaction-apply-message]');
    if (applyAssistantTransactionButton) {
      applyAssistantTransaction(applyAssistantTransactionButton.dataset.assistantTransactionApplyMessage);
      return;
    }

    const undoAssistantTransactionButton = target.closest('[data-assistant-transaction-undo-message]');
    if (undoAssistantTransactionButton) {
      undoAssistantTransaction(undoAssistantTransactionButton.dataset.assistantTransactionUndoMessage);
      return;
    }

    const continueBulkButton = target.closest('[data-assistant-bulk-continue-message]');
    if (continueBulkButton) {
      continueAssistantBulkJob(continueBulkButton.dataset.assistantBulkContinueMessage);
      return;
    }

    const openAssistantTransactionPage = target.closest('[data-assistant-transaction-open-page]');
    if (openAssistantTransactionPage) {
      const pageId = openAssistantTransactionPage.dataset.assistantTransactionOpenPage;
      const noteId = openAssistantTransactionPage.dataset.assistantTransactionOpenNote;
      if (noteId) {
        openNoteInNotes(noteId);
      } else if (pageId) {
        openPageSafe(pageId);
      }
      return;
    }

    const editAssistantMessage = target.closest('[data-assistant-message-edit]');
    if (editAssistantMessage) {
      beginAssistantMessageEdit(editAssistantMessage.dataset.assistantMessageEdit);
      return;
    }

    const cancelAssistantMessageEditButton = target.closest('[data-assistant-message-edit-cancel]');
    if (cancelAssistantMessageEditButton) {
      cancelAssistantMessageEdit();
      return;
    }

    const saveAssistantMessageEditButton = target.closest('[data-assistant-message-edit-save]');
    if (saveAssistantMessageEditButton) {
      saveAssistantMessageEdit(saveAssistantMessageEditButton.dataset.assistantMessageEditSave);
      return;
    }

    const deleteAssistantMessage = target.closest('[data-assistant-message-delete]');
    if (deleteAssistantMessage && !activeAssistantBusy) {
      rollbackAssistantConversationFrom(deleteAssistantMessage.dataset.assistantMessageDelete);
      return;
    }

    const prepareProposalButton = target.closest('[data-db-proposal-prepare-message]');
    if (prepareProposalButton) {
      updateDatabaseProposal(prepareProposalButton.dataset.dbProposalPrepareMessage, (proposal, operationsApi) => (
        operationsApi.prepareProposal(proposal, buildSanctumContextCatalog() || {})
      ));
      return;
    }

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
      openQuickNote(getAssistantCurrentPageId(''));
      return;
    }

    if (target.closest('#pageOpenNotesBtn')) {
      const currentPageId = getAssistantCurrentPageId('');
      if (currentPageId && !['home', 'search', 'inbox', 'notes', 'settings'].includes(currentPageId)) {
        setActiveNotesContextId(currentPageId, { preserveActiveNote: true });
      }
      openPageSafe('notes');
      return;
    }

    if (target.closest('#pageNotesToggle')) {
      const toggle = document.getElementById('pageNotesToggle');
      const tray = document.getElementById('pageNotesTray');
      const chevron = document.getElementById('pageNotesChevron');
      if (tray) {
        const open = tray.classList.toggle('open');
        if (chevron) chevron.textContent = open ? '\u25BE' : '\u25B8';
        toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
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

    const inboxChoice = target.closest('[data-inbox-choice]');
    if (inboxChoice) {
      const item = inboxItems.find((entry) => entry.id === inboxChoice.dataset.inboxChoice);
      const choiceLabel = inboxChoice.dataset.choiceLabel || '';
      if (!item) return;
      const lower = choiceLabel.toLowerCase();
      if ((lower.includes('link') || lower.includes('accept')) && item.suggestedPageId) {
        linkNoteToPage(item.noteId, item.suggestedPageId, choiceLabel);
      } else if (lower.includes('loose') || lower.includes('keep')) {
        if (item.noteId) keepNoteLoose(item.noteId);
      }
      resolveInboxItem(item.id, choiceLabel);
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
    const proposalAnswer = event.target.closest?.('[data-db-proposal-answer-message][data-db-proposal-question-id]');
    if (proposalAnswer) {
      const messageId = proposalAnswer.dataset.dbProposalAnswerMessage;
      updateProposalAnswerWithoutRerender(
        messageId,
        proposalAnswer.dataset.dbProposalQuestionId,
        proposalAnswer.value
      );
      syncProposalAnswerAction(messageId);
      return;
    }

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

  function handleAssistantMessageEditKeydown(event) {
    const input = event.target.closest?.('[data-assistant-message-edit-input]');
    if (!input) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelAssistantMessageEdit();
      return;
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      saveAssistantMessageEdit(input.dataset.assistantMessageEditInput);
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
    document.getElementById('assistantProfileOpen')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setAssistantOpen(false);
      openAssistantProfile('identity');
    });

    const send = async () => {
      const input = document.getElementById('assistantComposerInput');
      const query = (input?.value || '').trim();
      if (!query || activeAssistantBusy) return;
      if (noteSaveTimer) flushPendingNoteSave();
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
    document.addEventListener('change', handleDatabaseProposalChange);
    document.addEventListener('keydown', handleAssistantMessageEditKeydown);

    const previousOnPageOpen = typeof window.onSanctumPageOpen === 'function' ? window.onSanctumPageOpen : null;
    window.onSanctumPageOpen = (pageId) => {
      previousOnPageOpen?.(pageId);
      onPageOpen(pageId);
    };

    window.getSanctumAssistantContext = () => getAssistantContext('');
    window.getSanctumAssistantProfile = () => ({ ...activeUser, memoryFacts: (helperMemory.facts || []).map((item) => item.text) });

    renderInboxBadge();
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
