# Sanctum Project Map

This is a quick "future me" map of where things live. It is not meant to be formal docs.

## Running Sanctum

- `npm start` runs `server.js`.
- `npm test` runs the automated storage and backup safety checks.
- Open `http://127.0.0.1:3005`.
- Keep the Anthropic key in `.env`, not in frontend files.

## Boot Order

`index.html` loads `storage.js` first, waits for `window.SanctumStorageReady`, then loads the rest of the app in order:

1. `soundbar.js`
2. `stickers.js`
3. `document.js`
4. `ui-core.js`
5. `backup-data.js`
6. `page-lifecycle.js`
7. `sidebar.js`
8. `infinite-canvas.js`
9. `canvas.js`
10. `history-state.js`
11. `journal-data.js`
12. `journal.js`
13. `app-core.js`
14. `relationship-graph.js`
15. `page-database.js`
16. `context-engine.js`
17. `assistant-operations.js`
18. `assistant-transactions.js`
19. `canvas-rich-text.js`
20. `smart-notes.js`
21. `assistant-content-adapters.js`
22. `assistant-page-adapter.js`
23. `assistant-database-structure-adapter.js`
24. `profile.js`
25. `page-props.js`
26. `button-block.js`
27. `canvas-lines.js`

If something mysteriously breaks, check whether a file depends on a function that loads later.

## Main Files

- `index.html` - Main HTML shell and script loading.
- `style.css` - Main app styling.
- `server.js` - Local Express server, database-context router, and Anthropic assistant API routes.
- `chatgpt-database.js` / `chatgpt-connection.js` / `chatgpt-relay.js` - Opt-in ChatGPT database connection: exact vault search, native schema/row/view changes and durable recovery. Connect ChatGPT in the top bar opens and pairs the helper in one click. Tab session storage supports refresh recovery; unloading suspends execution, authenticated resume rotates an unload lease, and Disconnect revokes the code. `chatgpt-plugin/` is its separately hosted private Sites MCP connector, with managed sign-in and owner-scoped temporary transport. The connector tab forwards requests to loopback using the current Sanctum session code; no model API key is required. `chatgpt-plugin-connection.json` stores its public origin. `scripts/sanctum-mcp.js` remains an optional local stdio client. Setup and limits are in `README_CHATGPT_PLUGIN.md`.
- `chatgpt-visual.js` - Measures native rendered bounds, clears and verifies new database view placement, and captures exact scoped page/block images using pinned `assets/html-to-image.js`. The hosted and local MCP clients return screenshots as image content. Captures exclude other apps and browser chrome; no additional persistent vault store.
- `chatgpt-pages.js` - Whole-page read/plan/apply tools for native Board Canvas/Infinite Board pages, nested page creation, banners, text/lists/images/page cards/frames/dividers, and block geometry/style edits. Existing content is patched by exact ID/version. Plans save recovery in the shared ChatGPT history, verify rendered layout, roll back failures and refuse Undo after later work. `chatgpt-connection.js` serializes database/page operations and dispatches shared Undo by receipt kind. Header-inclusive images use the visual tool. No model API key or extra persistent store.
- `storage.js` - IndexedDB-backed storage layer that patches Sanctum `localStorage` keys.
- `backup-data.js` - Shared, testable export/import mapping for vault backups.
- `page-lifecycle.js` - Shared page rename, tree snapshot, delete, and restore data operations.
- `ui-core.js` - Shared storage keys, storage helpers, overlay/panel helpers, and shared UI state.
- `sidebar.js` - Sidebar, domains/pages registry, page opening, page creation, and page block save hooks.
- `app-core.js` - Topbar, settings, pins, bookmarks, page details, search view, themes, import/export, startup.
- `theme-chrome.css` - Theme-aware application controls for the music dock, assistant, graph, and document sidebars. Loaded after feature styles. Shared scrollbar colors and legacy theme aliases live in `style.css`; Black sidebars stay near-black while content palettes remain independent.
- `canvas.js` - Board/canvas blocks, movement, resize, tables, widgets, page cards, styling tools.
- `canvas-rich-text.js` - Rich text editing and slash command behavior inside canvas blocks.
- `canvas-lines.js` - Connector lines on infinite canvas pages.
- `canvas-preview.js` / `canvas-preview.css` - Dashboard Canvas preview blocks show an Infinite Canvas on an ordinary board. Shadow DOM isolates the read-only source layout and connections from host editing and saving; the host block stores only its source ID and independent pan/zoom camera. Saved-content events refresh visible previews without polling or opening the source editor.
- `button-block.js` - Button blocks with configurable actions.
- `dashboard-widgets.js` / `dashboard-widgets.css` - Quick-add native page tags, linked Infinite Board image previews, and the short gallery card style. The Dashboard dock button places these blocks or opens the worldbuilding layout.
- `dashboard-layout.js` - Reusable worldbuilding layout using ordinary editable blocks. Saves a named sibling copy before arranging the current board; existing linked categories are reused and missing categories are created as blank pages.
- `assets/worldbuilding/` - Locally served, public-domain gothic stock illustrations and source credits. The worldbuilding preset saves block roles for its typography and can refine an existing layout while retaining category identities, goals, reminders, tags and custom mood-board content.
- `infinite-canvas.js` - Infinite canvas zoom/pan/view persistence.
- `document.js` - Document editor, sections, formatting, annotations, lexicon, stats, style kits, presets.
- `writing-check-data.js` / `writing-check-ui.js` / `writing-check-service.js` - Local LanguageTool spelling and grammar, dictionary-aware suggestions, rich-text highlights without saved markup, native corrections/undo, and separate personal dictionary/settings included in backups. `writing-thesaurus.js` serves bundled WordNet alternatives; `writing-context.js` tags the selected sentence and uses local WordNet meanings plus compact word vectors to rank alternatives, with tense/plural preservation. Data, licenses and pinned checksums live in `assets/writing/`. `writing-punctuation.js` adds conservative introductory-clause and comma-splice advice. Private Java/LanguageTool runtime lives in ignored `.local-tools`; Windows setup is `npm run setup:writing-check`. No cloud fallback. See `README_LOCAL_WRITING_CHECK.md`.
- `document.css` - Document editor styling.
- `page-database.js` - Databases, database rows, views, properties, formulas, relations, folder scan support, and the database adapter for assistant transactions, including native checklist completion and its existing automations.
- `page-info-ui.js` - Page info / knowledge drawer.
- `timeline-data.js` / `timeline-ui.js` / `timeline.css` - Timeline is a native database view, available as a full Database page (the Timeline creation shortcut selects it) and linked inline views. Illustrated and Spans presentations share the original rows. `SanctumTimelineDatabase` in `page-database.js` resolves the latest source before edits, preserving rows outside the current filter and refreshing linked views. `sanctum_timelines_v1` stores only per-source calendar/field mappings and per-view presentation/additional-source references; event content remains in native database properties. Calendars support Gregorian/BCE dates, partial years, custom fixed-length months/hours, and named era offsets. Additional sources with incompatible calendars stay off the shared axis with a visible explanation. Whole-page copying remaps timeline settings, and backups include them.
- `context-preview.js` / `context-preview-ui.js` / `context-preview.css` - Read-only linked-page previews with exact page identities, scope paths, filled fields, connections, and text excerpts. Text links and connection chips open previews only on click or keyboard Enter/Space. Hover and focus never open previews; page cards retain normal navigation. Escape restores editor focus/selection, and Open page explicitly navigates. Database previews read raw stores without the mutating row-peek adapter. No additional persistent store.
- `page-props.js` - Page properties and relationships, rendered in optional canvas connection blocks and incoming-link previews.
- `custom-types.js` / `custom-types-ui.js` / `custom-types.css` - Vault-wide reusable types, managed from Settings → Workspace, the page menu, or creation. Stable category IDs reference editable/archivable definitions with text/page-link fields, starting values, an icon, and board/infinite-board/document starter sections. Pages own copies of their fields; template edits affect future pages only. Existing pages can add a type through Page Details without replacing their content. Page fields are also editable from the page menu, including documents.
- `page-relations.js` - Shared read-only relationship projection and scoped title/alias matching. Connections are stored once in page properties; incoming lists are derived.
- `world-systems.js` - Shared proficiency definitions and spell-requirement checks. Ordered level page IDs define rank; character `linkLevels` select a level per discipline. Free-text details never grant proficiency. Missing/conflicting levels fail closed.
- `world-systems-ui.js` - Optional Proficiency levels and Spell access canvas views, batch level setup, and create-spell-from-level. Generated starter views are ordinary movable connection blocks. Rules stay in the existing page-properties backup store.
- Page properties now appear through optional `connections` canvas blocks, mounted by `page-props.js`. Each block selects one field (or incoming connections), and keeps its own position, size, heading and styling. The former fixed top strip is hidden. Starter pages created from its picker skip the full category template.
- `profile.js` - Profile layout pages (character, spell, location, etc.).
- `character-sheet-data.js` / `character-sheet-ui.js` / `character-sheet.css` - Rich character board starter with ordinary movable blocks, optional additive sections from the page menu, and grouped Connections views for essentials, relationships, and magic. Facts/portraits/relationships/proficiencies remain in shared page properties; narrative prompts remain editable native rich text. Existing pages are never automatically replaced. `characterSection` survives native block serialization and identifies sections already added.
- `relationship-graph.js` - Page relationship graph modal.
- `context-engine.js` - Read-only normalized catalog, deterministic named-entity and alias resolution, schema routing, selected-row retrieval, and query API across pages, notes, documents, canvas blocks, databases, scopes, and relationships.
- `assistant-operations.js` - Validates non-executable database, database-structure, page, and visible-content proposals against routed sources; also owns review selection, exact-match replacement validation, edits, clarification answers, content-aware stale-target checks, and preparation of read-only transaction snapshots.
- `assistant-transactions.js` - Source-independent Apply/Undo coordinator. It validates dependency order, runs adapter preflight checks, captures snapshots, fingerprints the final composed state, rolls back partial failures, creates receipts, and prevents unsafe undo after later edits.
- `assistant-content-adapters.js` - Safe append and exact-match replacement adapters for visible note content, document sections, and page/canvas text. Board and document starter content can target a page created earlier in the same proposal; replacements preserve surrounding HTML and reuse the same atomic transaction receipt and Undo system as databases.
- `assistant-page-adapter.js` - Transaction adapter for creating reviewed board, infinite-board, document, or journal page trees under retrieved or earlier-created parents. Undo fingerprints board blocks plus document/journal storage and refuses to delete later user work.
- `assistant-database-structure-adapter.js` - Transaction adapter for creating a reviewed inline database, its hidden row pages, and multiple independently filtered or sorted linked views. Undo removes only the generated structure and refuses after later edits.
- `journal-data.js` - Pure journal normalization and immutable page/element data operations.
- `journal.js` / `journal-scrapbook.css` - Persistent two-mode scrapbook with a page-flip browser and flat editor.
- `smart-notes.js` - Notes vault, note shelves, helper inbox, assistant drawer, assistant actions, and the interactive proposal review, Apply receipt, and Undo surface.
- `soundbar.js` - Ambient sound panel.
- `stickers.js` - Sticker panel and custom stickers.
- `history-state.js` - Browser/history navigation support.

## Storage Keys To Remember

Most shared keys are listed in `STORAGE_KEYS` inside `ui-core.js`.

- Pages/domains: `sanctum_domains`, `sanctum_pages_registry`
- Canvas blocks: `sanctum_page_blocks`
- Canvas lines: `sanctum_canvas_lines`
- Page properties: `sanctum_page_props_v1`
- Custom type definitions: `sanctum_custom_types_v1` (included in vault backups)
- Timeline calendar and view settings: `sanctum_timelines_v1` (events stay in existing databases)
- Projects: `project-data.js` shares role labels, project lookup, boundaries and hierarchy contents across page pickers, music and connection scopes. Explicit `organizationRole` lives on the existing page record; database pages retain their storage kind and row references. `project-ui.js` provides More → Page organization and the breadcrumb Project badge. Existing projects are recognized without migrating or copying their contents.
- Music: `sanctum_soundbar_library_v1` keeps ordered master track metadata, named playlists with independent song order, level assignments and the follow/manual preference. `soundbar-data.js` resolves the nearest assignment through page → project/hub → domain → Home and recognizes project boundaries on database-backed pages; `soundbar.js` plays references to the same local IndexedDB audio blobs and saves handle-drag/keyboard song reordering without restarting playback. Navigation calls `SanctumSoundbar.pageChanged`. JSON backups include playlist metadata; audio blobs stay in local storage and are not included in JSON exports.
- Page settings/activity: `sanctum_page_settings`, `sanctum_page_activity_v1`
- Documents: `sanctum_documents`, `sanctum_doc_settings`, `sanctumLexicon`, `sanctum_style_kits`, `sanctum_page_presets`
- Databases: `sanctum_page_databases`
- Legacy database mirror: `sanctum_calendar_databases`
- Journals: `sanctum_journals_v1`
- Notes/assistant: `sanctum_notes_vault_v1`, `sanctum_note_shelves_v1`, `sanctum_helper_*`
- Pins/bookmarks/trash: `sanctum_pins`, `sanctum_bookmarks`, `sanctum_trash`
- Styling extras: `sanctum_stickers`, `sanctum_custom_stickers`, `sanctum_recent_colors`, `sanctum_color_palette`
- Graph/UI state: `sanctum.relationshipGraph.settings.v1`, `sanctum_knowledge_view_state`, `sanctum_v3_state`

## Good Places To Start

- Need to change export/import? Start in `app-core.js`, `renderData()`.
- Need to add a new saved data type? Add its key to `STORAGE_KEYS` in `ui-core.js`, then include it in export/import.
- Need to change page/domain behavior? Start in `sidebar.js`.
- Need to change the topbar, settings, pins, or global search? Start in `app-core.js`.
- Need to change canvas blocks? Start in `canvas.js`, then check `canvas-rich-text.js` if text editing is involved.
- Need to change document pages? Start in `document.js`.
- Need to change databases? Start in `page-database.js`.
- Need to change notes or assistant actions? Start in `smart-notes.js`.
- Need to change how a name like "Reaver" is found across sources? Start with `resolveEntities()` in `context-engine.js`. It runs before AI source flags, groups same-entity destinations, and marks cross-scope collisions as ambiguous.
- Need to change targeted assistant corrections? Validation and before/after values live in `assistant-operations.js`, persistence lives in `assistant-content-adapters.js`, and the review/receipt UI lives in `smart-notes.js`.
- Need to change AI-created inline databases or linked views? Proposal validation lives in `assistant-operations.js`, persistence and Undo live in `assistant-database-structure-adapter.js`, and actual row-page recency sorting lives in `page-database.js`.
- Need to add assistant writes for another source type? Add an adapter for it and register it with `assistant-transactions.js`; keep source-specific mutation logic out of the assistant UI. Database facts remain structured; loose facts must stay visibly attached to a note, document section, or page block.

## Personal Safety Checklist

Before big changes:

1. Export a backup from Settings.
2. Make the code change.
3. Run `npm start`.
4. Open Sanctum and check the feature you touched.
5. Refresh the page and check the data is still there.
6. If the change touches export/import, export a backup and confirm the JSON includes the data you expected.

## Current Notes

- **Map maker removed:** The embedded Azgaar editor, vendored source, built runtime,
  and earlier custom map editor/generator/renderer are disconnected from the app.
  Their source and obsolete checks were moved into the ignored local folder
  `.retired-map-maker-2026-10-02/` after automatic approval review blocked permanent
  deletion of untracked files. This is recovery-only code, not a fallback editor.
  New-page creation no longer offers Map. Existing map pages use `map-page.js` and
  `map-page.css` for read-only downloads; they never generate or rewrite a map.
- Saved maps remain under `sanctum_maps_v1` (`STORAGE_KEYS.maps`) and continue to
  participate in vault backup, whole-page copy and Trash restore. Preserve both
  version-1 atlases and version-2 records containing `engine: "azgaar"`, the exact
  native `document` string, metadata and optional `previousAtlas`. Downloads
  include the full record JSON, native .map text and any earlier atlas. Do not
  remove this compatibility path or migrate data just because the editor is gone.
- Future map direction: Inkarnate-style visual authoring within Sanctum, with
  selected procedural geography features. A replacement editor is not implemented.

- `relationship-tree-data.js` defines family/social relationship semantics, shared edge identity, ancestry validation, generation layout, and per-view filtering/collapse. `relationship-tree-ui.js` renders the portrait canvas, compact homepage views, editors, and pan/zoom controls; `relationship-tree.css` uses the active page theme.
- Relationship tree is a native database view (`tree`) and a New page layout shortcut. `SanctumTreeDatabase` in `page-database.js` writes native row values/portraits/typed relation columns; ordinary linked pages use `pageProps`. Native backlinks are derived for typed family/social links rather than copied into unrelated columns. View layout, visibility, and external page membership live in `sanctum_relationship_trees_v1`, included in backup and page-copy settings.

- Database export/import should include `pageDatabases` from `sanctum_page_databases`.
- Folder-connected databases may use browser folder handles stored separately by the browser; those handles may need reconnecting after import/export.
- `recovery/` holds IndexedDB dumps for manual recovery; it is gitignored.
