(function () {
  'use strict';

  /*
   * All leaves are rendered once and live in the DOM permanently.
   * "Flipping" is just CSS transform changes — no re-renders, no rebuilds.
   * When you drag the right page, the next one is already there behind it.
   */

  const PAGES  = 24;           // total pages (even)
  const LEAVES = PAGES / 2;    // physical leaves (each has front + back)
  let activeId = '';
  let turned   = 0;            // how many leaves have been flipped to the left
  let drag     = null;

  /* ── Helpers ─────────────────────────────────────────────── */
  function rec(id) {
    return [...(window.userDomains||[]), ...(window.userPages||[])]
      .find(p => p.id === id) || { title: 'Journal' };
  }
  function esc(s) {
    return typeof escapeHTML === 'function' ? escapeHTML(s)
      : String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  /* ── Page face content ─────────────────────────────────────── */
  const TONES = ['#f5efe4','#f3ece0','#f6f0e5','#f4eee2','#f7f1e7'];

  function pageContent(n) {
    if (n < 0 || n >= PAGES) return `<div class="jbf-blank"></div>`;
    if (n === 0) return `<div class="jbf-cover-f">
      <div class="jbf-cv-inner">
        <div class="jbf-cv-title">${esc(rec(activeId).title||'Journal')}</div>
        <div class="jbf-cv-year">${new Date().getFullYear()}</div>
      </div></div>`;
    if (n === PAGES - 1) return `<div class="jbf-cover-b"></div>`;
    return `<div class="jbf-sheet" style="background:${TONES[n%TONES.length]}">
      <div class="jbf-ruled"></div>
      <span class="jbf-pg">${n}</span>
    </div>`;
  }

  /* ── Z-index for a given leaf at the current `turned` count ──
     Turned leaves stack on the left  (highest z = most recently turned)
     Unturned leaves stack on the right (highest z = lowest leaf index)  */
  function zFor(leafIdx) {
    if (leafIdx < turned) return leafIdx + 1;            // turned: recent = high
    return (LEAVES * 3) - leafIdx;                       // unturned: front = high
  }

  /* ── Reposition all leaves (pure CSS, no DOM rebuild) ────────── */
  function positionAll() {
    document.querySelectorAll('.jbf-leaf').forEach((leaf, i) => {
      // Snap transform (remove any drag transform)
      if (!leaf.classList.contains('jbf-dragging')) {
        leaf.style.transform = i < turned ? 'rotateY(-180deg)' : 'rotateY(0deg)';
      }
      leaf.style.zIndex = zFor(i);

      // Mark which leaves are currently interactive
      leaf.classList.toggle('jbf-can-r', i === turned && turned < LEAVES);
      leaf.classList.toggle('jbf-can-l', i === turned - 1 && turned > 0);
    });

    // Update page indicator
    const info = document.getElementById('jbf-info');
    if (info) info.textContent =
      turned === 0       ? 'Cover'                :
      turned >= LEAVES   ? 'Back cover'           :
                           `${turned*2-1} / ${turned*2}`;
  }

  /* ── Render (runs once per journal open) ───────────────────── */
  function render(id) {
    activeId = id;
    turned   = 0;

    const pc   = document.getElementById('pageContent');
    const grid = document.getElementById('grid');
    if (!pc) return;
    if (grid) { grid.innerHTML=''; grid.style.display='none'; }
    pc.className = 'journal-root jbf-root';
    pc.style.display = 'block';
    pc.dataset.surfaceType = 'journal';

    /* Build all leaves once */
    const leavesHTML = Array.from({length: LEAVES}, (_, i) => `
      <div class="jbf-leaf" data-i="${i}">
        <div class="jbf-face jbf-f">${pageContent(i * 2)}</div>
        <div class="jbf-face jbf-b">${pageContent(i * 2 + 1)}</div>
        <div class="jbf-shadow"></div>
      </div>`).join('');

    pc.innerHTML = `
      <div class="jbf-shell" data-page-id="${esc(id)}">
        <header class="jbf-bar">
          <button class="jbf-btn" data-jbf="back">‹</button>
          <span class="jbf-bar-title">${esc(rec(id).title||'Journal')}</span>
          <span class="jbf-bar-info" id="jbf-info">Cover</span>
        </header>
        <div class="jbf-stage">
          <div class="jbf-book">
            ${leavesHTML}
            <div class="jbf-spine" aria-hidden="true"></div>
          </div>
        </div>
      </div>`;

    positionAll();
  }

  /* ── Drag ────────────────────────────────────────────────────── */
  function onDown(e) {
    if (e.button !== 0 || drag) return;
    const leaf = e.target.closest('.jbf-leaf');
    if (!leaf) return;

    const side = leaf.classList.contains('jbf-can-r') ? 'r'
               : leaf.classList.contains('jbf-can-l') ? 'l'
               : null;
    if (!side) return;

    e.preventDefault(); e.stopPropagation();

    const book  = leaf.closest('.jbf-book');
    const br    = book.getBoundingClientRect();
    const spine = br.left + br.width / 2;  // spine = centre of book
    const pageW = br.width / 2;

    leaf.classList.add('jbf-dragging');
    drag = { leaf, side, spine, pageW, p: 0 };
    document.body.style.userSelect = 'none';
  }

  function onMove(e) {
    if (!drag) return;
    const { leaf, side, spine, pageW } = drag;

    // p = 0 at start, 1 at fully flipped
    const dist = side === 'r' ? spine - e.clientX : e.clientX - (spine - pageW);
    const p    = Math.max(0, Math.min(1, dist / pageW));
    drag.p     = p;

    // Right leaf: 0° → -180°   |   Left leaf: -180° → 0°
    const angle = side === 'r' ? -180 * p : -180 + 180 * p;
    leaf.style.transform = `rotateY(${angle.toFixed(2)}deg)`;

    // Shadow peaks at 90° (sin curve)
    const sh = leaf.querySelector('.jbf-shadow');
    if (sh) sh.style.opacity = (Math.sin(p * Math.PI) * 0.5).toFixed(3);
  }

  function onUp() {
    if (!drag) return;
    document.body.style.userSelect = '';
    const { leaf, side, p } = drag;
    drag = null;

    if (p > 0.38) {
      const target = side === 'r' ? -180 : 0;
      leaf.style.transition = 'transform 0.24s cubic-bezier(.4,0,.6,1)';
      leaf.style.transform  = `rotateY(${target}deg)`;
      leaf.addEventListener('transitionend', () => {
        leaf.style.transition = '';
        leaf.classList.remove('jbf-dragging');
        turned = Math.max(0, Math.min(LEAVES, turned + (side === 'r' ? 1 : -1)));
        positionAll();
      }, { once: true });
    } else {
      const start = side === 'r' ? 0 : -180;
      leaf.style.transition = 'transform 0.18s cubic-bezier(.4,0,.2,1)';
      leaf.style.transform  = `rotateY(${start}deg)`;
      leaf.addEventListener('transitionend', () => {
        leaf.style.transition = '';
        leaf.classList.remove('jbf-dragging');
        const sh = leaf.querySelector('.jbf-shadow');
        if (sh) sh.style.opacity = '0';
      }, { once: true });
    }
  }

  document.addEventListener('mousedown',  onDown, true);
  document.addEventListener('mousemove',  onMove);
  document.addEventListener('mouseup',    onUp);
  document.addEventListener('mouseleave', onUp);

  document.addEventListener('click', e => {
    const a = e.target.closest('[data-jbf]')?.dataset.jbf;
    if (a === 'back' && activeId) window.openPage?.(rec(activeId).parent || 'home');
  });

  function close() {
    const pc   = document.getElementById('pageContent');
    const grid = document.getElementById('grid');
    if (pc?.dataset.surfaceType === 'journal') {
      pc.innerHTML=''; pc.className='hint';
      pc.dataset.surfaceType=''; pc.style.display='';
    }
    if (grid) grid.style.display='';
    activeId=''; drag=null;
  }

  window.renderJournalPage = render;
  window.closeJournalPage  = close;
  window.readAllJournals   = () => {
    if (typeof readStorageJSON !== 'function') return {};
    const key = window.STORAGE_KEYS?.journals || 'sanctum_journals_v1';
    const current = readStorageJSON(key, null);
    if (current && typeof current === 'object' && Object.keys(current).length) return current;
    const legacy = readStorageJSON('sanctum_journals', {});
    if (legacy && typeof legacy === 'object' && Object.keys(legacy).length && typeof writeStorageJSON === 'function') {
      writeStorageJSON(key, legacy);
    }
    return legacy && typeof legacy === 'object' ? legacy : {};
  };
})();
