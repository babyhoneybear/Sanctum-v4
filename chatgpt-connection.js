(() => {
  'use strict';
  const HISTORY_KEY = 'sanctum_chatgpt_database_history_v1';
  const SESSION_KEY = 'sanctum_chatgpt_tab_session_v1';
  const native = window.SanctumChatGPTDatabaseNative;
  const registry = window.SanctumAssistantPageRegistryStore;
  const blockStore = window.SanctumAssistantPageBlockStore;
  const copy = value => JSON.parse(JSON.stringify(value));
  let session = '', lease = '', stopped = true, controller = null, message = 'Disconnected', changing = false, helperTab = null, leaving = false, listenEpoch = 0;
  function remember(value) { try { value ? sessionStorage.setItem(SESSION_KEY, value) : sessionStorage.removeItem(SESSION_KEY); } catch {} }
  function remembered() { try { return sessionStorage.getItem(SESSION_KEY) || ''; } catch { return ''; } }
  let editShield = null, previousFocus = null, inertElements = [];
  const environment = {
    lock(label = 'Saving database changes…') {
      previousFocus = document.activeElement;
      inertElements = [...document.body.children].map(element => [element, element.inert]);
      inertElements.forEach(([element]) => { element.inert = true; });
      editShield = document.createElement('div');
      editShield.setAttribute('role', 'status'); editShield.tabIndex = -1;
      editShield.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:#0008;color:white;font:16px system-ui';
      editShield.textContent = label;
      document.body.appendChild(editShield); editShield.focus();
    },
    unlock() {
      inertElements.forEach(([element, inert]) => { element.inert = inert; });
      inertElements = []; editShield?.remove(); editShield = null;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    },
    readLive: () => { blockStore.read(); window.SanctumAssistantDocumentStore?.read?.(); },
    pages: () => [...window.userDomains, ...window.userPages],
    catalog: () => window.buildSanctumContextCatalog(),
    databases: () => window.getDatabaseCalloutSources().map(source => window.getDatabaseCalloutSourceData(source)).filter(Boolean),
    normalize: native.normalize, save: native.save, capabilities: native.capabilities,
    normalizeAppearance: value => window.normalizeAppearance(value),
    validateFormula: native.validateFormula, validateCell: native.validateCell,
    blocks: () => copy(window.readAllPageBlocks()),
    writeBlocks: blocks => blockStore.write(blocks),
    createPage(config) {
      const created = registry.create({ ...config, layout: 'sheet', category: 'none', containerType: 'page', recordKind: 'database' });
      if (!created || created.id !== config.pageId) throw new Error('Could not create the database page.');
    },
    createRows(source, rows) {
      const created = registry.createDatabaseRowPages(rows.map(row => ({
        id: row.pageId, title: row.values.name || 'Untitled row', parentId: source.pageId,
        sourceKind: source.kind, sourcePageId: source.pageId, sourceBlockId: source.blockId || '', rowId: row.id
      })));
      if (!created || created.length !== rows.length) throw new Error('Could not create database row pages.');
    },
    deletePages: ids => registry.deleteMany(ids),
    pageContent: pageId => ({
      blocks: window.readAllPageBlocks()[pageId] || [],
      document: window.readAllDocuments?.()[pageId] || null,
      settings: window.readStorageJSON(window.STORAGE_KEYS.pageSettings, {})[pageId] || null,
      props: window.readStorageJSON(window.STORAGE_KEYS.pageProps, {})[pageId] || null,
      journal: window.readStorageJSON(window.STORAGE_KEYS.journals, {})[pageId] || null
    }),
    makeView(source, database, view, items) {
      const bottom = items.reduce((max, block) => Math.max(max, (Number(block.y) || 0) + (Number(block.h) || 0)), 0);
      const z = items.reduce((max, block) => Math.max(max, Number(block.z) || 0), 0);
      const base = view.before || window.SanctumDatabaseStructureTools.makeDatabaseBlock(
        { databaseTitle: database.title }, { ...view.config, blockId: view.blockId }, 0, 1, source.pageId, Math.ceil((bottom + 48) / 24) * 24, z
      );
      const next = { ...base, calendarView: view.config.view || base.calendarView, dbSourceKind: source.kind, dbSourcePageId: source.pageId, dbSourceBlockId: source.blockId || '' };
      const mappings = { title: 'dbViewTitle', filters: 'dbFilters', sorts: 'dbSorts', groupBy: 'dbGroupBy', hiddenPropertyIds: 'dbHiddenPropertyIds', columnWidths: 'dbColumnWidths' };
      for (const [key, field] of Object.entries(mappings)) if (Object.prototype.hasOwnProperty.call(view.config, key)) {
        next[field] = typeof view.config[key] === 'object' ? JSON.stringify(view.config[key]) : view.config[key];
      }
      return next;
    },
    flushLive: async () => {
      blockStore.read();
      window.SanctumAssistantDocumentStore?.read?.();
      if (await window.SanctumStorage.flush() === false) throw new Error('Current vault changes could not be saved.');
    },
    flush: () => window.SanctumStorage.flush(),
    readHistory: () => window.readStorageJSON(HISTORY_KEY, []),
    writeHistory: history => window.writeStorageJSON(HISTORY_KEY, history)
  };
  const visual = window.SanctumChatGPTVisual.createBrowser({ ...environment,
    currentPage: () => typeof currentPageId === 'string' ? currentPageId : 'home',
    activate: pageId => window.openPage(pageId, { skipTabHistory: true, revealSidebarPath: false })
  });
  const databases = window.SanctumChatGPTDatabases.createService({ ...environment,
    layout: visual.layout, screenshot: visual.screenshot, placeViews: visual.placeViews
  });
  const pages = window.SanctumChatGPTPages.createService({ ...environment,
    createOrdinaryPage: config => registry.create({ ...config, skipTemplate: true }),
    updatePage(pageId, patch) {
      const page = window.userPages.find(item=>item.id===pageId); if(!page)return false;
      for(const key of ['title','icon','summary']) if(Object.prototype.hasOwnProperty.call(patch,key))page[key]=patch[key];
      const saved = window.saveSanctumRegistry();
      window.syncTabsWithRegistry?.(); window.renderSidebarDomains?.(); window.renderTabBar?.();
      return saved !== false;
    },
    getSettings: pageId => window.getPageSettings(pageId),
    defaultSettings: () => window.normalizePageSettings({}),
    saveSettings(pageId, settings) {
      const result=window.savePageSettings(pageId,{...window.getPageSettings(pageId),...settings});
      if(pageId === (typeof currentPageId === 'string' ? currentPageId : '')) {
        window.applyResolvedTheme?.(pageId); window.renderPageHero?.(pageId);
      }
      return result;
    },
    fontPresets: () => Object.keys(PAGE_FONT_PRESETS),
    pageExtra: pageId => ({document:window.readAllDocuments?.()[pageId] || null,
      props:window.readStorageJSON(window.STORAGE_KEYS.pageProps,{})[pageId] || null,
      journal:window.readStorageJSON(window.STORAGE_KEYS.journals,{})[pageId] || null}),
    hasExternalReference(pageId, owned) {
      const values = [...Object.entries(window.readAllPageBlocks()).filter(([id])=>!owned.has(id)).map(([,blocks])=>blocks),
        ...Object.entries(window.readAllDocuments?.() || {}).filter(([id])=>!owned.has(id)).map(([,document])=>document),
        ...Object.entries(window.readStorageJSON(window.STORAGE_KEYS.pageProps,{})).filter(([id])=>!owned.has(id)).map(([,props])=>props)];
      return values.some(value=>JSON.stringify(value).includes(pageId)) || environment.databases().some(item=>!owned.has(item.source.pageId) && JSON.stringify(item.database).includes(pageId));
    },
    arrangePage: visual.arrangePage
  }, databases);
  const methods = {...databases, readPage:pages.readPage, planPage:pages.planPage, applyPage:pages.applyPage,
    capabilities:()=>({...databases.capabilities(),pageTools:pages.capabilities()}),
    undo:args=>window.readStorageJSON(HISTORY_KEY,[]).find(item=>item.id===args.changeId)?.kind==='pages' ? pages.undoPage(args) : databases.undo(args)};
  let operationRunning = false;
  const service = {};
  for(const [name,method] of Object.entries(methods)) service[name] = (...args) => {
    if(operationRunning)throw new Error('Another Sanctum operation is running.');
    if(!['apply','applyPage','undo','layout','screenshot'].includes(name))return method(...args);
    operationRunning=true;
    return Promise.resolve().then(()=>method(...args)).finally(()=>{operationRunning=false;});
  };
  async function post(path, body = {}, signal) {
    const request = new AbortController();
    const abort = () => request.abort();
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, path === 'poll' ? 25000 : 10000);
    try {
    const response = await fetch(`/api/chatgpt/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sanctum-ChatGPT': 'browser', 'X-Sanctum-Session': session },
      body: JSON.stringify(body), signal: request.signal
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(result.error || 'Connection unavailable.'), { status: response.status });
    return result;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  const retryable = error => !error.status || error.status >= 500 || [408, 429].includes(error.status);
  const pause = (ms, signal) => new Promise(resolve => {
    if (signal.aborted) return resolve();
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
    const timer = setTimeout(done, ms); signal.addEventListener('abort', done, { once: true });
  });
  function refreshStatus() {
    const label = document.getElementById('chatgptConnectionStatus');
    if (label) label.textContent = message;
    const button = document.getElementById('chatgptConnectBtn');
    if (button) { button.textContent = stopped ? 'Connect ChatGPT' : 'Disconnect'; button.disabled = changing; }
    const shortcut = document.getElementById('chatgptShortcut');
    if (shortcut) { shortcut.textContent = stopped ? 'Connect ChatGPT' : 'ChatGPT connected'; shortcut.disabled = changing;
      shortcut.title = stopped ? 'Connect ChatGPT to this vault' : 'Disconnect ChatGPT from this vault'; }
    for (const id of ['chatgptOpenConnector', 'chatgptCopyCode']) {
      const control = document.getElementById(id); if (control) control.disabled = stopped;
    }
  }
  async function listen(needsResume = false) {
    const epoch = ++listenEpoch;
    const lifetime = new AbortController(); controller = lifetime;
    let delivery = null, failures = 0, heartbeatBusy = false;
    const alive = () => !stopped && epoch === listenEpoch;
    const heartbeat = setInterval(async () => {
      if (!alive() || needsResume || heartbeatBusy) return;
      heartbeatBusy = true;
      try { await post('heartbeat', { lease }, lifetime.signal); }
      catch (error) {
        if (alive() && !retryable(error)) {
          stopped = true; message = error.message; lifetime.abort();
        }
      } finally { heartbeatBusy = false; }
    }, 5000);
    while (!stopped && epoch === listenEpoch) {
      try {
        if (needsResume) {
          const resumed = await post('resume', {}, lifetime.signal);
          if (!alive()) break;
          lease = resumed.lease; needsResume = false;
        }
        // A lost result acknowledgement must never execute the write again.
        if (delivery) { await post('result', delivery, lifetime.signal); delivery = null; }
        const payload = await post('poll', {}, lifetime.signal);
        if (payload.disconnected) break;
        if (!payload.command || stopped || epoch !== listenEpoch) continue;
        failures = 0; message = 'Connected while this Sanctum tab stays open'; refreshStatus();
        const command = payload.command;
        let result;
        try {
          if (!['capabilities', 'search', 'inspect', 'plan', 'apply', 'history', 'undo', 'layout', 'screenshot', 'readPage', 'planPage', 'applyPage'].includes(command.method)) throw new Error('Unknown Sanctum operation.');
          result = await service[command.method](command.args);
          if (['apply', 'applyPage', 'undo'].includes(command.method)) window.showAppToast?.(
            command.method !== 'undo' ? `ChatGPT updated ${result.destination}. Recovery copy saved.` : `Restored ${result.destination}.`, 'success'
          );
        } catch (error) { result = { error: error.message, ...(error.details || {}) }; }
        if (alive()) delivery = { id: command.id, result };
      } catch (error) {
        if (!alive()) break;
        if (!retryable(error) && !(error.status === 409 && !needsResume)) { message = error.message; break; }
        message = 'Reconnecting ChatGPT automatically…'; refreshStatus();
        await pause(Math.min(5000, 500 * 2 ** Math.min(failures++, 4)), lifetime.signal);
      }
    }
    clearInterval(heartbeat); lifetime.abort();
    if (epoch !== listenEpoch) return;
    stopped = true;
    if (!leaving) { session = ''; lease = ''; remember(''); }
    refreshStatus();
  }
  async function toggle() {
    if (changing) return;
    changing = true; refreshStatus();
    try {
      if (!stopped) {
        stopped = true; ++listenEpoch; controller?.abort();
        try { await post('disconnect'); } finally { controller?.abort(); session = ''; lease = ''; remember(''); message = 'Disconnected'; refreshStatus(); }
        return;
      }
      const payload = await post('connect');
      session = payload.session; lease = payload.lease; remember(session); stopped = false;
      message = 'Connected while this Sanctum tab stays open'; refreshStatus();
      void listen();
    } finally { changing = false; refreshStatus(); }
  }
  function openHelperTab() {
    if (!helperTab || helperTab.closed) {
      helperTab = window.open('', '_blank');
      if (helperTab) helperTab.opener = null;
    }
    if (!helperTab) throw new Error('Allow the popup, then click Open ChatGPT connector.');
    return helperTab;
  }
  async function sendHelper(target) {
    const info = await post('site-info');
    if (!info.url) throw new Error('Restart Sanctum to load its ChatGPT connection.');
    const url = new URL(info.url);
    url.hash = new URLSearchParams({ port: location.port || '3005', connection: session }).toString();
    target.location.replace(url.href);
    message = 'ChatGPT helper opened. Keep both tabs open.'; refreshStatus();
  }
  async function connectChatGPT() {
    if (changing) return;
    if (!stopped) return toggle();
    // Open synchronously during the click, before networking, to avoid blockers.
    let target;
    try { target = openHelperTab(); await toggle(); await sendHelper(target); }
    catch (error) {
      if (target) { target.close(); helperTab = null; }
      message = error.message; refreshStatus(); window.showAppToast?.(message, 'error');
    }
  }
  async function resume() {
    const saved = remembered(); if (!/^[a-f0-9]{48}$/.test(saved)) return;
    session = saved; stopped = false; message = 'Reconnecting ChatGPT…'; refreshStatus();
    void listen(true);
  }
  function renderSettings() {
    const host = document.getElementById('settingsRight');
    if (!host?.querySelector('#exportBtn') || host.querySelector('#chatgptConnectBtn')) return;
    const section = document.createElement('section');
    section.className = 'settings-field';
    section.style.cssText = 'display:block;margin-top:20px';
    section.innerHTML = '<div class="settings-field-label">ChatGPT connection</div><p style="color:var(--muted2);font-size:13px">Let your personal ChatGPT plugin search this vault and make the database and page changes you request. Keep this tab open while connected.</p><p id="chatgptConnectionStatus" role="status"></p><button class="settings-btn" id="chatgptConnectBtn">Connect</button> <button class="settings-btn" id="chatgptOpenConnector">Open ChatGPT connector</button> <button class="settings-btn" id="chatgptCopyCode">Copy connection code</button> <button class="settings-btn" id="chatgptRecoveryExport">Export recovery copies</button> <button class="settings-btn" id="chatgptUndoLast">Undo last ChatGPT change</button><p style="color:var(--muted2);font-size:12px">Connect ChatGPT opens and connects the helper automatically. Keep both tabs open; refreshes reconnect automatically. Install Sanctum in ChatGPT to use it on your iPad. No OpenAI API key is needed.</p>';
    host.appendChild(section);
    section.querySelector('#chatgptConnectBtn').onclick = connectChatGPT;
    section.querySelector('#chatgptOpenConnector').onclick = async () => {
      if (!session) return;
      let target;
      try {
        target = openHelperTab(); await sendHelper(target);
      } catch (error) { if (target) { target.close(); helperTab = null; } window.showAppToast?.(error.message, 'error'); }
    };
    section.querySelector('#chatgptCopyCode').onclick = async () => {
      try { await navigator.clipboard.writeText(session); window.showAppToast?.('Connection code copied. Paste it only into your private Sanctum connector.', 'success'); }
      catch { window.showAppToast?.('Clipboard unavailable. Open the connector from this panel again.', 'error'); }
    };
    section.querySelector('#chatgptRecoveryExport').onclick = () => {
      const blob = new Blob([JSON.stringify(window.readStorageJSON(HISTORY_KEY, []), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `sanctum-chatgpt-recovery-${new Date().toISOString().replace(/[:.]/g, '-')}.json`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    section.querySelector('#chatgptUndoLast').onclick = async () => {
      const latest = service.history().find(item => item.status === 'applied');
      if (!latest) return window.showAppToast?.('No ChatGPT change to undo.', 'info');
      try { await service.undo({ changeId: latest.changeId }); window.showAppToast?.(`Restored ${latest.destination}.`, 'success'); }
      catch (error) { window.showAppToast?.(error.message, 'error'); }
    };
    refreshStatus();
  }
  const host = document.getElementById('settingsRight');
  if (host) new MutationObserver(renderSettings).observe(host, { childList: true });
  renderSettings();
  const toolbar = document.getElementById('assistantTopBtn')?.parentElement;
  if (toolbar) {
    const shortcut = document.createElement('button'); shortcut.id = 'chatgptShortcut';
    shortcut.className = 'settings-btn'; shortcut.style.cssText = 'font-size:12px;white-space:nowrap';
    shortcut.onclick = connectChatGPT; toolbar.insertBefore(shortcut, document.getElementById('assistantTopBtn'));
  }
  refreshStatus(); void resume();
  window.addEventListener('pagehide', () => {
    leaving = true; stopped = true; ++listenEpoch; controller?.abort();
    if (session) void fetch('/api/chatgpt/suspend', { method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', 'X-Sanctum-ChatGPT': 'browser', 'X-Sanctum-Session': session }, body: JSON.stringify({ lease }) });
  });
  window.addEventListener('pageshow', event => { if (event.persisted) { leaving = false; void resume(); } });
  window.SanctumChatGPTConnection = { get connected() { return !stopped; }, toggle, connect: connectChatGPT, service };
})();
