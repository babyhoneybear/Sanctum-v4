(() => {
  const M = window.SanctumProjects;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const records = () => window.getVaultRecords?.() || [];
  const currentId = () => typeof currentPageId === 'string' ? currentPageId : '';
  let activeId = '', returnFocus = null;
  function close() {
    document.getElementById('projectOrganization')?.remove();
    activeId = ''; returnFocus?.focus?.(); returnFocus = null;
  }
  function refreshIdentity(pageId = currentId()) {
    document.getElementById('pageProjectBadge')?.remove();
    const bar = document.getElementById('breadcrumbBar'), project = M.project(records(), pageId);
    if (!bar || !project || bar.style.display === 'none') return;
    const button = document.createElement('button');
    button.id = 'pageProjectBadge'; button.type = 'button'; button.className = 'page-project-badge';
    button.textContent = project.id === pageId ? 'Project' : `Project · ${project.title}`;
    button.title = `Pages in ${project.title}`;
    button.setAttribute('aria-label', `Open project organization: ${project.title}`);
    button.onclick = () => open(project.id);
    bar.append(button);
  }
  function open(pageId) {
    const record = records().find(record => record.id === pageId);
    if (!record) return;
    if (!activeId) returnFocus = document.activeElement;
    activeId = pageId;
    window.closeAllOverlays?.(); window.closeAllPanels?.();
    let dialog = document.getElementById('projectOrganization');
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.id = 'projectOrganization';
      dialog.className = 'project-organization'; dialog.setAttribute('aria-labelledby','projectOrganizationTitle');
      dialog.addEventListener('keydown', event => event.stopPropagation());
      dialog.addEventListener('cancel', event => {event.preventDefault(); close();});
      document.body.append(dialog);
    }
    const owner = M.project(records(), pageId), isDomain = M.role(record) === 'domain';
    dialog.innerHTML = `<header><div><h2 id="projectOrganizationTitle">Page organization</h2><p>${esc(record.title)}</p></div><button type="button" data-close aria-label="Close page organization">×</button></header>
      <div class="project-organization-body"><label class="project-role-field">Role${isDomain ? '<span>Domain</span>' : `<select aria-label="Page role">${[['page','Page'],['project','Project'],['hub','Hub'],['detail','Detail']].map(([value,label])=>`<option value="${value}" ${M.role(record)===value?'selected':''}>${label}</option>`).join('')}</select>`}</label>
      <p class="project-role-help">${M.role(record)==='project' ? 'This project holds its pages together. Music and page suggestions recognize it as a project.' : 'Choose Project to give this page and its contents their own project area.'}</p>
      ${owner && owner.id!==pageId ? `<p>Belongs to <button type="button" class="project-parent-link" data-owner="${esc(owner.id)}">${esc(owner.title)}</button></p>` : ''}
      <div class="project-contents-heading"><h3>${M.role(record)==='project'?'Pages in this project':'Pages inside'}</h3><span data-count></span></div>
      <input type="search" aria-label="Find pages inside" placeholder="Find a page…"><div class="project-contents-list" role="group" aria-label="Pages inside"></div><p role="status"></p></div>`;
    dialog.querySelector('[data-close]').onclick = close;
    dialog.querySelector('[data-owner]')?.addEventListener('click', () => open(owner.id));
    const renderList = () => {
      const entries = M.contents(records(), pageId, dialog.querySelector('[type="search"]').value);
      dialog.querySelector('[data-count]').textContent = `${entries.length} ${entries.length===1?'page':'pages'}`;
      dialog.querySelector('.project-contents-list').innerHTML = entries.map(({record,parents})=>`<button type="button" data-open-page="${esc(record.id)}"><span>${esc(record.title || 'Untitled')}</span><small>${esc(M.label(record))}${parents?` · ${esc(parents)}`:''}</small></button>`).join('') || '<p>No pages found.</p>';
      dialog.querySelectorAll('[data-open-page]').forEach(button => {button.onclick = () => {const id=button.dataset.openPage; close(); window.openPage?.(id);};});
    };
    dialog.querySelector('[type="search"]').oninput = renderList;
    dialog.querySelector('select')?.addEventListener('change', event => {
      const live = (window.userPages || []).find(record => record.id === pageId);
      if (!live) return;
      const before = {...live}, next = M.withRole(live, event.target.value);
      Object.keys(live).forEach(key => delete live[key]); Object.assign(live,next);
      if (window.saveSanctumRegistry?.() !== true) {
        Object.keys(live).forEach(key => delete live[key]); Object.assign(live,before);
        window.SanctumSoundbar?.refreshScopes();
        event.target.value = M.role(live);
        dialog.querySelector('[role="status"]').textContent = 'Could not save the role. Please try again.';
        return;
      }
      window.renderSidebarDomains?.(); refreshIdentity();
      open(pageId); dialog.querySelector('select')?.focus();
    });
    renderList();
    if (!dialog.open) dialog.showModal();
  }
  window.SanctumProjectUI = {open, close, refreshIdentity};
  const previousOpen = window.onSanctumPageOpen;
  window.onSanctumPageOpen = function(pageId) {previousOpen?.(pageId); refreshIdentity(pageId);};
  const previousRegistry = window.onSanctumRegistryChanged;
  window.onSanctumRegistryChanged = function(payload) {previousRegistry?.(payload); refreshIdentity();};
  refreshIdentity();
})();
