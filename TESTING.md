# Testing Sanctum

## Repository checkpoint — October 27, 2026

`npm.cmd test` passed all 366 tests with no failures, skips, or cancellations.
The first sandboxed attempt could not connect to the temporary loopback servers;
the complete suite passed when rerun with local loopback access. This checkpoint
adds repository documentation and ignore rules and captures the existing working
implementation. It does not add a new browser/UI verification claim.

## Running the suite

Run:

```powershell
npm.cmd test
```

(`npm test` works too when PowerShell allows npm scripts.)

ChatGPT database checks (`test/chatgpt-database.test.js`, `test/chatgpt-relay.test.js`)
cover scoped exact locations, stale plans, native relation synchronization, recovery,
and local relay authentication. `test/chatgpt-hosted.test.js` checks owner isolation,
disconnects, timeout cleanup and compatibility with the official HTTP MCP client
against SQLite and the actual gateway. Hosted-origin relay tests require the exact
configured origin plus the current local session code, including CORS preflight.
`test/chatgpt-connection.test.js` checks the one-click helper flow, popup blocking,
tab-scoped refresh recovery, code revocation and keeping local codes out of cloud
requests. Relay tests cover suspension, authenticated resume and stale-unload leases.
For browser verification, start a separate server
with `$env:PORT='3037'; node server.js`, then open
`http://127.0.0.1:3037/test/fixtures/chatgpt-plugin.html` and run its checks.
This separate origin uses sample data and refuses the normal vault port. It tests
native creation, colors, linked views, row updates/additions, calculated rollups,
formulas and Undo. It also measures a tall block with a zero saved height, verifies
three linked views do not overlap, and checks nonblank JPEG pixels. Inspect the
displayed sample capture as well. `test/chatgpt-visual.test.js` covers clearance
geometry and native MCP image validation; hosted tests verify official MCP client
image delivery and queue cleanup. Keep test MCP clients on `SANCTUM_PORT=3037`.

`test/chatgpt-pages.test.js` covers scoped page reads, linked parent/child builds,
escaped content, preserved omitted fields, stale versions, authorized block removal,
multi-page rollback, recovery persistence and Undo guards for later edits/children/
incoming links. The same isolated fixture's **Run page checks** builds a three-column
native page with a banner, artwork and linked card, verifies its header-inclusive
image, forces a recoverable overlap failure and undoes the build. Database checks
also arrange/undo an existing database view without changing its rows. Hosted tests
discover all twelve tools with their annotations and route a page plan through the
official MCP client.

Saved-map checks (`test/map-storage.test.js`, `test/backup-data.test.js`) retain
coverage for nested atlas data, artwork, whole-page copying, Trash restore, and
backup round trips for both previous formats after the editor's removal.

This does not replace checking a feature in the browser. It is a quick safety check
that currently verifies:

- Frame object groups: `/test/fixtures/frame-groups.html` on isolated port 3037
  checks repositioning with placement armed, dragging in/out without conversion,
  group movement, detached objects, older embedded content, deletion, Undo and
  reopening. Use this instead of the older row-reordering frame fixture. Also
  verify native pointer dragging from an object's grip and a frame's title.

- Infinite-page interaction rules: `/test/fixtures/canvas-interactions.html`
  checks single-click text editing, repeated click-away/re-entry, drag thresholds,
  Escape, placement cancellation, live controls, old frame text, linked page
  navigation, deletion/Undo and saved edits. Verify body-drag and typing with
  real mouse/keyboard input as well.

- Infinite Canvas previews: `test/canvas-preview.test.js` checks independent camera
  persistence, fitting distant content and zooming around the pointer. On isolated
  port 3037, `/test/fixtures/canvas-preview.html` supplies sample magic and host
  boards; its checks cover native rendering, connections, source refresh, source
  preservation, Undo/Redo and navigation. Also drag the viewport, add a preview
  through Dashboard tools, choose its source, and reload the saved sample board.

- Infinite Canvas placement: on isolated port 3037, open
  `/test/fixtures/infinite-canvas.html` and run **Check infinite canvas**. It checks
  scaled stage/grid geometry, lower-screen and minimum-zoom placement, content Fit,
  Space-drag over cards, pointer-anchored zoom, saved items, and Undo/Redo. Also add,
  type into, and drag a card with real pointer input before reloading the sample.

- Infinite Canvas overlays: `/test/fixtures/canvas-overlays.html` on isolated
  port 3037 recreates a gallery database and row editor. **Check overlays** checks
  desktop and 768px layouts, selected-tool scrolling, header clearance with tabs
  open/closed, menu stacking, accessible row/music controls, and saved-content
  preservation. Also click a gallery card, edit its sample notes, close/reopen the
  row, open More, and scroll the editing rail with real pointer input.

- Canvas text: `/test/fixtures/canvas-text.html` on isolated port 3037 checks
  empty, single-line and list blocks at one 24px row, logical sizing while zoomed,
  H1/H2/H3/Paragraph, selected-paragraph formatting, slash heading shortcuts,
  toolbar fit and saved markup/height after reopening. Also choose a heading
  through the native toolbar dropdown and resize a single-line block by hand.

- journal pen, pencil, and highlighter strokes survive saving and reopening; erasing,
  lasso group edits, study tape, cancellation, and undo/redo preserve page content.
  The isolated `/test/fixtures/journal-preview.html` uses the real editor toolbar
  with sample pages held in memory, so browser checks do not modify the vault;

- dashboard tags normalize and toggle without duplicates, mood previews derive from source image blocks, and relative dates use calendar days;

- failed IndexedDB batches remain queued and retry without replacing newer edits;
- overlapping flush calls wait for one serialized drain;
- clear followed by writes preserves the replacement data, even across failures;
- synchronous request errors abort a queued clear before it can partially commit;
- page aliases and the default Aliases property reach assistant search and resolution;
- project scope opt-out is honored, while cross-story names and separate recipe variants stay ambiguous.

- every registered backup field is exported;
- an export can be imported without losing core data;
- current and legacy database backups both restore correctly;
- assistant memory restores under the correct profile;
- invalid backup values are rejected before anything is written;
- empty vaults do not create unnecessary recovery downloads.
- page renames propagate to pins and linked cards;
- deleting a page tree removes its stored blocks and incoming cards;
- restoring Trash recovers pages, blocks, pins, bookmarks, and links;
- repeated restoration does not create duplicate records or blocks.
- the read-only context catalog covers pages, notes, documents, canvas blocks,
  databases, and database rows;
- context search preserves scope boundaries between real-life and fictional data;
- generic database relations and typed dates work across domains.
- schema routing exposes database structure without leaking row values;
- only selected database rows and explicitly requested supporting sources are retrieved;
- invalid database references from a routing response are rejected;
- local schema matching remains available when AI routing is unavailable.
- database proposals remain non-executable and target routed sources only;
- unknown rows, properties, read-only fields, and destructive operations are rejected;
- real-life and worldbuilding changes use the same proposal contract;
- proposed relations must match existing relation targets and row IDs.
- explicit proposal operations start selected while inferred operations require review;
- unanswered clarification questions, invalid edits, and stale database rows block preparation;
- preparation alone never writes data, and later proposal edits invalidate the prepared transaction;
- Apply produces a receipt only after adapter preflight, snapshot, and successful persistence;
- a failed multi-source Apply restores every captured snapshot;
- Undo restores the exact pre-Apply snapshot and refuses to overwrite data changed afterward;
- unsupported source operations are rejected before any adapter writes.
- visible-content proposals can target only retrieved notes, document sections, and pages;
- loose facts append visibly instead of creating hidden page properties;
- note, document, and page-block writes can share one atomic transaction and one Undo receipt;
- live note, document, and canvas state is flushed before transaction snapshots are captured.
- targeted replacements require exactly one matching visible passage and reject missing or repeated matches;
- note, document-section, and canvas-block replacements preserve surrounding content and Undo exactly;
- unrelated note metadata and read-only navigation do not create false stale-target or Undo conflicts;
- page creation requires one retrieved parent, rejects duplicate siblings and unsupported layouts,
  and generates a reviewed stable page identity for board, infinite-board, document, and journal pages;
- the page type remains visible and editable during review;
- Undo removes a newly created blank page but refuses after the user adds board or document content;
- one reviewed proposal can build a dependent page tree, target an earlier created board or document
  with starter content, and Apply or Undo the whole composition atomically;
- composed operations must declare dependencies after their create-page operation, and opening a
  generated document may normalize harmless editor state without causing a false Undo conflict;
- inline-database proposals normalize schemas, rows, linked views, and the special actual-page-open
  recency sort without guessing activity;
- one Apply can create the 27-row Gaming database, hidden row pages, a recently opened view, and an
  independently filtered world-building view;
- inline-database Undo restores the original board exactly and refuses to delete the generated
  structure after the user changes it;
- named entities are resolved across every source type even when the AI router omits that source flag;
- exact names and existing alias fields can locate an entity without creating duplicate identity storage;
- same-name entities in different scopes remain ambiguous, and ambiguity blocks all proposed writes;
- first-attempt capture from Home can find a strongly named worldbuilding note without a scope hint.
- checklist schemas expose their active view and each routed row's native checked state;
- checklist-state proposals reject non-checklist databases and unchanged values while remaining reviewable;
- a database row and its generated row page resolve as one entity instead of creating false ambiguity;
- checklist Apply uses the existing checklist control path, so its configured status/date automation runs,
  and Undo restores the complete database snapshot.

Run it before and after a code change. A passing result ends with `fail 0`.

Connection-block checks also cover scoped alias matching, preserving separate variants,
create-and-link starter pages, relationship details, derived incoming connections,
graph cache refresh, assistant context, and backup/placement round trips. Browser checks
use the separate test origin `http://127.0.0.1:3018`: place a Connect block, choose Magic
or Birthplace, create/link a page, edit details, move/resize/rename the block, and reload.
Choose “Connections to this page” in a second block to show incoming links. Nothing is
automatically placed above the canvas.

Magic-system checks cover independent discipline levels, cumulative versus exact-level
rules, all-of spell requirements, unknown requirements, conflicting assignments,
deleted/restored definitions, graph/context traversal, and backup round trips.
In the browser, use Magic → Set up levels to create four named pages together, choose
the character’s proficiency, and open the discipline’s Proficiency levels block.
Use + Spell beside a level to create a spell with its requirement already linked.
Place a separate Connect → Spell access block on the character; lowering the character’s
level must immediately change a matching spell from Meets requirements to Requirements
unmet. Reload and verify both the level selection and block placement persist.
These checks describe proficiency only; learned spells and additional costs are not inferred.

Custom types checks cover stable identities through rename/archive/restore, duplicate and
invalid definitions, independent page values, safe starter headings, existing-content
preservation, assistant context, backup round trips, and the text-property focusout save path.
Browser verification uses `http://localhost:3021` (separate from the normal vault): create a
Recipe type with text and page-link fields plus Ingredients/Method/Notes sections; create a
board page; edit its value and create a connected page; reload and verify persistence.
Rename the type, change its default to Document and its starting value, then create a new
linked recipe. Existing pages retain their values and board layout, while the new document
has its starter sections and updated default through More → Page fields. Archive/restore
retains the definition and its existing page references. The first release offers text and
page-link fields, not database-style numeric/date/select fields or live schema migrations.

Context preview tests cover exact IDs across same-name pages, scope paths, custom/profile
fields, page connections, document/board/journal excerpts, raw database rows and relations,
deleted references, immutable reads, bounded plain text, and viewport placement. Controller
tests verify that hover and focus never open previews, and cover explicit click/keyboard activation,
keyboard focus return, caret restoration, typing dismissal, normal card navigation, modal navigation,
and deletion between preview and Open page.

Browser verification uses `http://localhost:3021/test/fixtures/context-preview.html`, which
has an in-memory fixture and no vault writes. Place the writing caret, click Elias, close with
Escape, and type: text must resume at that caret. The second Elias belongs to a different story.
Check keyboard Enter/Escape, refreshed age, missing references, and explicit Open page; the
fixture reports navigation, focus, selection, and writes. Full-app checks on the separate
`http://localhost:3021` vault cover Recipe connection chips, custom fields, previews inside
More → Page fields, and Open page dismissing the fields dialog before navigation.

Timeline checks cover Gregorian leap days and the BCE/CE boundary without year zero,
partial/approximate dates, custom month/day/hour lengths and era offsets, invalid/reversed
ranges, separate rows for overlapping spans, readable spacing at minimum zoom, source
identity, filtered projections, database date repeat/display metadata, calendar/view backup
round trips, and duplication with local-ID remapping. The native database bridge tests
verify fresh-source writes, preservation of hidden rows and unrelated fields, computed-field
protection, missing/folder sources, failed saves, inline sources, and recoverable archival.

For browser QA, run the server on port 3023 and open
`http://localhost:3023/test/fixtures/timeline-seed.html`. Its explicit button seeds only
that separate origin with an illustrated history, a project homepage containing linked
timeline/table views, modern date-range events, and a custom 62-day / 28-hour calendar.
Verify timeline → table and table → timeline edits, live inline refresh, view settings after
reload, additional sources sharing events, custom-date validation, calendar settings,
new-page creation via Timeline, and archived events remaining in table history. Verify
that full-page duplication preserves its custom calendar without changing the original.
The two timeline styles use different spacing: Illustrated keeps a single baseline, with
minimum horizontal room even for simultaneous events or when following time gaps. Spans
uses elapsed time and reuses rows across tracks when labels and durations do not collide.
The fixture includes 2100 / 2150 / 2152 / 2152 / 2158 to reproduce clustered events.
Check View settings, collapsed optional event fields, and checkbox-based source/page links.
In a new event on a Gregorian timeline, enter `0 AF` and a description. Use
Set up fictional dates: Dates & calendar should open with `AF | 0`, year zero enabled,
and a text date field selected. Cancel to verify nothing was applied and the draft stays.
Reopen, enter `AF | 0 | After the Fall`, and save the setup, then add the event without
retyping. Verify `0 AF` and the `AF = After the Fall` key remain after reload and in linked
views; dates using `0 After the Fall` should work too. Repeat with an existing Date field to verify
the setup creates a text field and preserves the original Date values.
Full-page timelines have no card border or inner vertical height limit: vertical wheel
scrolls the page without changing horizontal position, while horizontal scrolling still
works. Verify with a tall Spans view and zoomed horizontal overflow. Inline timelines
use compact event headings, two-line description previews, smaller images and a
280px canvas limit. The block height follows the rendered content. Verify the
dashboard, images, Spans, narrow widths and full-page comparison at
`/test/fixtures/timeline-inline.html` on an isolated server. Resized descriptions
remain per-view; taller inline content scrolls vertically within the bound.
In the native linked inline view, Timeline, Filter, View and + Event share the
block header. View opens timeline settings and + Event opens its event editor.
After saving settings or refreshing, each action appears once. Collapse/show the
toolbar and switch Timeline → Table → Timeline: generic New returns only for Table,
and timeline actions disappear outside Timeline. Empty timelines also use the top
toolbar's + Event. Folder-owned timelines keep View but omit + Event.

Music playlist tests are in `test/soundbar.test.js`: legacy library migration,
nearest-level inheritance, manual override, shared track membership, playlist and
master deletion rules, empty queues, missing audio metadata, playback queue limits,
uploads, song ordering, save-failure rollback and backup metadata. For native UI checks, run an isolated server on 3025
and load `/test/fixtures/music-seed.html`. Create a domain playlist and a project
playlist from existing tracks; Chapter One inherits Beneath the Veins while Daily
Practice inherits The North Coast. Selecting Master library turns off Follow page
and survives navigation/reload. Re-enable Follow page, assign a page override, then
choose Inherit from parent to clear it. Remove a song from a named playlist and
verify it remains in Master library. Edit/search/add it back, and verify Next,
Previous and ending playback stay inside the chosen playlist. Playlist dialogs and
player controls keep the music panel open; navigating away closes it with correct
button labels. Scope metadata uses the existing backup field; JSON exports do not
contain audio blobs. Beneath the Veins in this fixture is a database-backed project
area: it must appear under Projects and as Current project when opened, and its
children must inherit its assignment. Ordinary database pages also remain selectable.
Drag the dotted handle beside songs to reorder within the selected playlist, then
reload and check Next/Previous follow that order. Focus a handle and use Up/Down for
keyboard ordering. Reordering during playback must keep the same song and position;
changing one playlist's order must leave other playlists and Master unchanged.
Description resizing can be checked at `/test/fixtures/timeline-resize.html` on an
isolated test server. Drag the line below a description down and up, reload to verify
the saved height, and double-click to restore the default clamp. Check Arrow keys,
Home/End, independent embedded-view sizes, and expanded Spans rows staying clear
of subsequent events. Event titles still open the editor; resizing must not open it.
Unknown or invalid dates stay in Not placed yet. Different
calendar systems are not implicitly converted. Custom calendars currently use fixed month
lengths; leap rules, recurring-event expansion, and cross-calendar conversion are not added.

Theme cleanup: switch Page Theme through Light, Dark, and Black without reloading.
Check navigation, the music dock, assistant and identity dialog, document sidebars and
inspector, page fields, menus, and vertical/horizontal scrollbars. Black sidebars should
be near-black, with readable controls. Graph tints must adapt to the active theme while
saved node/edge colors remain intact; an explicitly chosen Paper/Ink timeline keeps its
own palette and scrollbar colors. Hidden tab-strip scrollbars must stay hidden.

Local Writing Check uses an isolated vault on port 3024; see
`README_LOCAL_WRITING_CHECK.md` and `test/fixtures/writing-check-seed.html`. Click or
right-click an underlined word in rich text, a textarea, and a single-line input;
verify the compact menu corrects it, adds a custom name, and closes after edits.
Check wrapping, scrolling, resizing a textarea, native event dialogs, and Ctrl+Z.
Focus and ordinary selection must not add floating Spelling or Alternatives buttons.
Settings are explicit: the check icon or the card's ⋯ button. Saved words stay collapsed.
Double-click a correctly spelled word; test right-click and Shift+F7
as well. Replace a bold word, undo, and reload to verify autosave. Test a single-line
input and event textarea, an unknown custom word, capitalization, and changing text
while alternatives are open. A menu shows at most four unboxed text rows, More changes them
without growing the menu, and mouse opening keeps the editor focused. Double-click
a misspelling immediately after focusing a field, before the delayed check runs:
it must open a spelling correction, not an empty synonym menu. Opening synonyms or
the document context menu must not cancel spelling checks or clear existing underlines.
The Lexicon
and personal dictionary must stay separate.
For context, select `prosperous` in `a once prosperous land`: the first choices
must include thriving, successful, flourishing and booming, with no personal-wealth
or lucky-time sense on More. Compare bright student/lamp and cold weather/reply,
two occurrences of the same word, walked/strolled, and books/volumes. Test this in
a modal timeline Details textarea as well as rich text. A changed sentence must
dismiss the old menu. See `test/writing-context.test.js` for real-data regression
cases, bounded UTF-16 selection context, inflection, licenses and checksums.
`test/fixtures/writing-context.html` uses the actual timeline event editor with
in-memory test data. Test mouse opening and Shift+F7 there; Escape must close just
the suggestions while retaining the event draft, and native Undo must restore the
replaced word. The client refuses an older non-contextual server response.
Check introductory clauses and possible comma splices, plus negative cases for dialogue,
complements, lists, and already punctuated sentences in `test/writing-assistance.test.js`.
Tests cover
dictionary normalization, accepted words/phrases versus grammar, custom-word suggestions,
UTF-16 offsets and stale replacements, long-section chunk boundaries, fixed loopback
routing, and separate dictionary/settings backup. Browser QA covers native rich-text
formatting and undo, document autosave/reload, dictionary persistence, textareas, and
corrections inside modal event dialogs. The checker stores no markup in document HTML.

## Relationship trees

`test/fixtures/tree-seed.html` only seeds the isolated `http://localhost:3023` origin.
It supplies three family generations, two independently configured inline views, a linked
table, and an ordinary page that can be added without duplicating it. Use New page →
Relationship tree for an empty full-page tree, or choose Relationship tree from an
existing database's view menu. Inline databases can link that same source on a homepage.

Verify adding a parent/child/partner, linking an existing page, creating a new child,
uploading a portrait, renaming a person, and changing a date in the table. Edits must
reach every connected view; per-view family/friend/rival/mentor/custom filters, hidden
people, collapsed branches, dragged positions, and inline heights must remain independent.
Reload to check persistence. Family is the default connection filter. Small inline views
use horizontal portrait cards instead of scaling down the full-page portrait layout.
Check pointer drag, Ctrl+wheel zoom, Fit, keyboard navigation, and Dark/Black/Light themes.
Normal wheel scrolling over inline trees must scroll the containing page.

Run `node --test test/relationship-tree.test.js test/tree-database.test.js` for edge
deduplication, reversed parent labels, cycle detection, partner generations, collapse,
native row writes, table-to-tree reads, failure handling, and directional backlink guards.
Tree settings contain layout/membership only; people and relationships stay in the
existing page/database storage. Imported ancestry loops are shown with a notice; tree
editing rejects new loops. Different historical variants and freehand annotations are
not part of this first tree view.

Tree person pickers start in the original database's project, including when embedded
elsewhere, and offer People, custom page types, other projects, and All projects explicitly.
The fixture includes a second project's similarly named character: they must not appear
in the coast project's default results. Rowan's existing character-page Parents field
links Willow; adding both original pages must draw that link without recreating it.
Character Connections blocks offer Parents, Children, Partners, Siblings, adoptive/step
parents, Guardians, Friends, Rivals, and Mentors presets. These use the same page properties
the tree reads; ordinary prose and plain page mentions do not imply kinship.

## Character starter

New Character pages using Board Canvas or Infinite Board receive the richer starter;
existing boards use More → Character sections to append selected core/optional sections.
The legacy Profile and Document layouts remain separate. Use the isolated
`http://localhost:3023/test/fixtures/character-seed.html` fixture to check portrait/facts,
project-scoped links, relationship detail notes, magic proficiency and available-spell
updates. Change occupation, add Combat, reload, and verify both persist without losing
the original writing or relationships. New characters created from relation pickers
also use the starter. Narrative prompts are ordinary editable text blocks.
Run `node --test test/character-sheet.test.js test/connections-block.test.js` for shared
property preservation, legacy field-name collisions, tree/proficiency compatibility,
section geometry, and native metadata round-tripping.
Character starters fit the current board width with balanced margins (up to 1536px).
Old untouched starter geometry upgrades on opening; changed widths/positions and other
blocks are preserved. Fit is skipped if it would overlap other content. Resize the viewport to check the untouched horizontal
layout follows it without changing writing, vertical positions, or shared fields.

## Project organization

Run `node --test test/project-organization.test.js test/soundbar.test.js test/context-engine.test.js`
for role changes, database membership preservation, scoped connections, hierarchy search
and cycle handling. `node scripts/check-project-organization.cjs` uses Playwright/Edge
with a fresh browser profile and its own temporary local server. It checks the real
Project badge, More → Page organization, contents/search, child navigation, changing
a database-backed project to Page and back, persistence after database sync/reload,
and failed-save rollback. Screenshot: `artifacts/project-organization.jpg`.
Page roles use the existing registry and backup field; changing role does not move
or copy pages, change their layouts, or change playlist assignments. Nested projects
appear in the parent hierarchy but define their own connection scope.

## Database column resizing

Run `node --test test/database-column-resize.test.js` for automatic fitting, manual
width preservation, drag limits, saved-width normalization, and inline canvas sizing.
In a full-page Table, drag property boundaries in both directions and reload. The
drag must start at the visible width, leave neighboring columns steady, and retain
saved sizes even when horizontal scrolling is needed. Check the same source's linked
inline table: resizing must still work and read the same saved widths. The isolated
`http://localhost:3023/test/fixtures/timeline-seed.html` vault includes both surfaces;
switch A coastal history to Table and use The North Coast's linked table.

## Saved map recovery

Run `node scripts/check-map-recovery.cjs` with Playwright on `NODE_PATH` and Edge
installed. It serves the complete app on a temporary HTTP origin with a fresh
browser profile; it never opens the user's live vault. It verifies exact native
.map and JSON downloads, earlier atlases, unknown/malformed records, empty map
pages, unchanged storage after navigation/reload, hidden editor/creation controls,
and absence of any old engine or renderer requests. It also checks that ordinary
page navigation still works. Screenshot: `artifacts/maps/map-recovery.png`.

The former generator/editor fixtures and performance scripts are archived locally
with the retired engines; the build command is removed. Existing map data must remain downloadable
and included in normal vault backups without loading either engine.
