// UI action icons are separate from the user's page icons, stickers, and content.
function getUIIcon(name) {
  const paths = window.SanctumIconPaths;
  if (!paths || !Object.prototype.hasOwnProperty.call(paths, name)) return '';
  const family = window.SanctumIconFamilies?.[name] || 'lucide';
  return `<svg class="ui-icon" data-icon="${name}" data-icon-family="${family}" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
}

function initializeUIIcons(root = document) {
  root.querySelectorAll('[data-ui-icon]').forEach((element) => {
    const markup = getUIIcon(element.dataset.uiIcon);
    if (!markup) return;
    element.innerHTML = markup;
    if (element.matches('button')) {
      const label = element.getAttribute('aria-label') || element.title;
      if (label) {
        if (!element.hasAttribute('aria-label')) element.setAttribute('aria-label', label);
        if (!element.title) element.title = label;
      }
    }
  });
}

initializeUIIcons();
