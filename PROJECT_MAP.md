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
11. `journal.js`
12. `app-core.js`
13. `relationship-graph.js`
14. `page-database.js`
15. `context-engine.js`
16. `assistant-operations.js`
17. `assistant-transactions.js`
18. `canvas-rich-text.js`
19. `smart-notes.js`
20. `assistant-content-adapters.js`
21. `assistant-page-adapter.js`
22. `assistant-database-structure-adapter.js`
23. `profile.js`
24. `page-props.js`
25. `button-block.js`
26. `canvas-lines.js`

If something mysteriously breaks, check whether a file depends on a function that loads later.

## Main Files

- `index.html` - Main HTML shell and script loading.
- `style.css` - Main app styling.
- `server.js` - Local Express server, database-context router, and Anthropic assistant API routes.
- `storage.js` - IndexedDB-backed storage layer that patches Sanctum `localStorage` keys.
- `backup-data.js` - Shared, testable export/import mapping for vault backups.
- `page-lifecycle.js` - Shared page rename, tree snapshot, delete, and restore data operations.
- `ui-core.js` - Shared storage keys, storage helpers, overlay/panel helpers, and shared UI state.
- `sidebar.js` - Sidebar, domains/pages registry, page opening, page creation, and page block save hooks.
- `app-core.js` - Topbar, settings, pins, bookmarks, page details, search view, themes, import/export, startup.
- `canvas.js` - Board/canvas blocks, movement, resize, tables, widgets, page cards, styling tools.
- `canvas-rich-text.js` - Rich text editing and slash command behavior inside canvas blocks.
- `canvas-lines.js` - Connector lines on infinite canvas pages.
- `button-block.js` - Button blocks with configurable actions.
- `infinite-canvas.js` - Infinite canvas zoom/pan/view persistence.
- `document.js` - Document editor, sections, formatting, annotations, lexicon, stats, style kits, presets.
- `document.css` - Document editor styling.
- `page-database.js` - Databases, database rows, views, properties, formulas, relations, folder scan support, and the database adapter for assistant transactions, including native checklist completion and its existing automations.
- `page-info-ui.js` - Page info / knowledge drawer.
- `page-props.js` - Typed property strip between page title and canvas.
- `profile.js` - Profile layout pages (character, spell, location, etc.).
- `relationship-graph.js` - Page relationship graph modal.
- `context-engine.js` - Read-only normalized catalog, deterministic named-entity and alias resolution, schema routing, selected-row retrieval, and query API across pages, notes, documents, canvas blocks, databases, scopes, and relationships.
- `assistant-operations.js` - Validates non-executable database, database-structure, page, and visible-content proposals against routed sources; also owns review selection, exact-match replacement validation, edits, clarification answers, content-aware stale-target checks, and preparation of read-only transaction snapshots.
- `assistant-transactions.js` - Source-independent Apply/Undo coordinator. It validates dependency order, runs adapter preflight checks, captures snapshots, fingerprints the final composed state, rolls back partial failures, creates receipts, and prevents unsafe undo after later edits.
- `assistant-content-adapters.js` - Safe append and exact-match replacement adapters for visible note content, document sections, and page/canvas text. Board and document starter content can target a page created earlier in the same proposal; replacements preserve surrounding HTML and reuse the same atomic transaction receipt and Undo system as databases.
- `assistant-page-adapter.js` - Transaction adapter for creating reviewed board, infinite-board, document, or journal page trees under retrieved or earlier-created parents. Undo fingerprints board blocks plus document/journal storage and refuses to delete later user work.
- `assistant-database-structure-adapter.js` - Transaction adapter for creating a reviewed inline database, its hidden row pages, and multiple independently filtered or sorted linked views. Undo removes only the generated structure and refuses after later edits.
- `journal.js` - Journal layout with page-flip UI.
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

- Database export/import should include `pageDatabases` from `sanctum_page_databases`.
- Folder-connected databases may use browser folder handles stored separately by the browser; those handles may need reconnecting after import/export.
- `recovery/` holds IndexedDB dumps for manual recovery; it is gitignored.
