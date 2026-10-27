// Build locally from the official source archives, preserving each vendor's SVG paths.
// Usage: node scripts/build-ui-icons.cjs lucide-static-0.468.0.tgz heroicons-2.1.5.tgz
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const archive = process.argv[2];
const heroArchive = process.argv[3];
if (!archive || !heroArchive) throw new Error('Provide the Lucide 0.468.0 and Heroicons 2.1.5 archives.');
const names = `panel-left panel-left-close panel-right panels-top-left menu search inbox sticky-note house settings-2 trash-2 chevron-left chevron-right chevron-up chevron-down arrow-left arrow-right arrow-up arrow-down arrow-down-to-line arrow-up-to-line corner-down-right bookmark ellipsis pencil plus minus undo-2 redo-2 type list list-ordered image file-text folder frame table-2 database chart-no-axes-combined chart-pie clock graduation-cap sticker rectangle-ellipsis sparkles keyboard text-cursor-input columns-2 layers flame history copy clipboard paint-bucket baseline heading square-dashed between-horizontal-start radius crop gallery-horizontal-end book-open layout-grid shapes rectangle-horizontal bold italic underline align-left align-center align-right align-justify a-arrow-down a-arrow-up sigma scan target x skip-back skip-forward play pause repeat volume-2 volume-x network globe focus rotate-ccw external-link folder-input palette info link highlighter brackets circle move-horizontal link-2 unlink pin pin-off file-plus-2 upload download check circle-help send paperclip maximize-2 minimize-2 filter arrow-up-down circle-user-round grip-vertical`.split(' ');
// The app's action names remain stable when an icon family changes. Keep Lucide
// for specialist editing tools that have no clear Heroicons equivalent.
const heroNames = {
  'panel-left': 'bars-3', 'panel-left-close': 'arrow-left-on-rectangle',
  'panels-top-left': 'window', menu: 'bars-3', search: 'magnifying-glass',
  inbox: 'inbox', 'sticky-note': 'document-text', house: 'home',
  'settings-2': 'adjustments-horizontal', 'trash-2': 'trash',
  'chevron-left': 'chevron-left', 'chevron-right': 'chevron-right',
  'chevron-up': 'chevron-up', 'chevron-down': 'chevron-down',
  'arrow-left': 'arrow-long-left', 'arrow-right': 'arrow-long-right',
  'arrow-up': 'arrow-long-up', 'arrow-down': 'arrow-long-down',
  'arrow-down-to-line': 'arrow-down-on-square-stack',
  'arrow-up-to-line': 'arrow-up-on-square-stack', 'corner-down-right': 'arrow-turn-down-right',
  bookmark: 'bookmark', ellipsis: 'ellipsis-horizontal', pencil: 'pencil',
  plus: 'plus', minus: 'minus', 'undo-2': 'arrow-uturn-left', 'redo-2': 'arrow-uturn-right',
  list: 'list-bullet', 'list-ordered': 'numbered-list', image: 'photo',
  'file-text': 'document-text', folder: 'folder', 'table-2': 'table-cells',
  database: 'circle-stack', 'chart-no-axes-combined': 'chart-bar', 'chart-pie': 'chart-pie',
  clock: 'clock', 'graduation-cap': 'academic-cap', sticker: 'face-smile',
  'rectangle-ellipsis': 'cursor-arrow-rays', sparkles: 'sparkles',
  'columns-2': 'view-columns', layers: 'square-3-stack-3d', flame: 'fire',
  history: 'clock', copy: 'document-duplicate', clipboard: 'clipboard',
  heading: 'h1', 'book-open': 'book-open', 'layout-grid': 'squares-2x2',
  bold: 'bold', italic: 'italic', underline: 'underline',
  scan: 'arrows-pointing-out', target: 'viewfinder-circle', focus: 'viewfinder-circle',
  x: 'x-mark', 'skip-back': 'backward', 'skip-forward': 'forward',
  play: 'play', pause: 'pause', repeat: 'arrow-path-rounded-square',
  'volume-2': 'speaker-wave', 'volume-x': 'speaker-x-mark', network: 'share',
  globe: 'globe-alt', 'rotate-ccw': 'arrow-path', 'external-link': 'arrow-top-right-on-square',
  'folder-input': 'folder-arrow-down', palette: 'swatch', info: 'information-circle',
  link: 'link', 'link-2': 'link', unlink: 'link-slash',
  'move-horizontal': 'arrows-right-left', 'file-plus-2': 'document-plus',
  upload: 'arrow-up-tray', download: 'arrow-down-tray', check: 'check',
  'circle-help': 'question-mark-circle', send: 'paper-airplane', paperclip: 'paper-clip',
  'maximize-2': 'arrows-pointing-out', 'minimize-2': 'arrows-pointing-in',
  filter: 'funnel', 'arrow-up-down': 'arrows-up-down', 'circle-user-round': 'user-circle'
};
names.push('text-quote', 'list-checks', 'pilcrow', 'heading-2', 'heading-3', 'heading-4',
  'hash', 'panel-top', 'move', 'wrap-text', 'eye', 'eye-off', 'lock', 'star', 'anchor',
  'waves', 'ellipsis-vertical', 'save', 'replace', 'calendar-days');
Object.assign(heroNames, {
  'heading-2': 'h2', 'heading-3': 'h3', hash: 'hashtag', move: 'arrows-pointing-out',
  eye: 'eye', 'eye-off': 'eye-slash', lock: 'lock-closed', star: 'star',
  'ellipsis-vertical': 'ellipsis-vertical', 'calendar-days': 'calendar-days'
});
const icons = {}, families = {};
for (const name of names) {
  const heroName = heroNames[name];
  const svg = execFileSync('tar', ['-xOf', heroName ? heroArchive : archive,
    heroName ? `heroicons-2.1.5/optimized/24/outline/${heroName}.svg` : `package/icons/${name}.svg`], { encoding: 'utf8' });
  if (!svg.includes('<svg') || !svg.includes('</svg>')) throw new Error(`Invalid SVG: ${name}`);
  icons[name] = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>')).trim().replace(/\s+/g, ' ');
  families[name] = heroName ? 'heroicons' : 'lucide';
}
const root = path.join(__dirname, '..');
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
fs.writeFileSync(path.join(root, 'assets', 'ui-icon-paths.js'),
  '// Heroicons 2.1.5 (MIT) with Lucide 0.468.0 (ISC) specialist icons.\n' +
  '// See heroicons-LICENSE.txt and lucide-LICENSE.txt. Generated by scripts/build-ui-icons.cjs.\n' +
  'window.SanctumIconPaths = Object.freeze(' + JSON.stringify(icons, null, 2) + ');\n' +
  'window.SanctumIconFamilies = Object.freeze(' + JSON.stringify(families, null, 2) + ');\n');
fs.writeFileSync(path.join(root, 'assets', 'lucide-LICENSE.txt'), execFileSync('tar', ['-xOf', archive, 'package/LICENSE']));
fs.writeFileSync(path.join(root, 'assets', 'heroicons-LICENSE.txt'), execFileSync('tar', ['-xOf', heroArchive, 'heroicons-2.1.5/LICENSE']));
console.log(`Bundled ${Object.values(families).filter(f => f === 'heroicons').length} Heroicons and ${Object.values(families).filter(f => f === 'lucide').length} Lucide icons.`);
