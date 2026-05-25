# Sanctum Project Map

This is a quick "future me" map of where things live. It is not meant to be formal docs.

## Running Sanctum

- `npm start` runs `server.js`.
- Open `http://127.0.0.1:3005`.
- Keep the Anthropic key in `.env`, not in frontend files.

## Boot Order

`index.html` loads `storage.js` first, waits for `window.SanctumStorageReady`, then loads the rest of the app in order:

1. `soundbar.js`
2. `stickers.js`
3. `document.js`
4. `ui-core.js`
5. `sidebar.js`
6. `infinite-canvas.js`
7. `canvas.js`
8. `history-state.js`
9. `app-core.js`
10. `page-info-ui.js`
11. `page-database.js`
12. `canvas-rich-text.js`
13. `smart-notes.js`

If something mysteriously breaks, check whether a file depends on a function that loads later.

## Main Files

- `index.html` - Main HTML shell and script loading.
- `style.css` - Main app styling.
- `server.js` - Local Express server and Anthropic assistant API route.
- `storage.js` - IndexedDB-backed storage layer that patches Sanctum `localStorage` keys.
- `ui-core.js` - Shared storage keys, storage helpers, overlay/panel helpers, and shared UI state.
- `sidebar.js` - Sidebar, domains/pages registry, page opening, page creation, and page block save hooks.
- `app-core.js` - Topbar, settings, pins, bookmarks, page details, search view, themes, import/export, startup.
- `canvas.js` - Board/canvas blocks, movement, resize, tables, widgets, page cards, styling tools.
- `canvas-rich-text.js` - Rich text editing and slash command behavior inside canvas blocks.
- `infinite-canvas.js` - Infinite canvas zoom/pan/view persistence.
- `document.js` - Document editor, sections, formatting, annotations, lexicon, stats, style kits, presets.
- `document.css` - Document editor styling.
- `page-database.js` - Databases, database rows, views, properties, formulas, relations, folder scan support.
- `page-info-ui.js` - Page info / knowledge drawer.
- `smart-notes.js` - Notes vault, note shelves, helper inbox, assistant drawer, assistant actions.
- `soundbar.js` - Ambient sound panel.
- `stickers.js` - Sticker panel and custom stickers.
- `history-state.js` - Browser/history navigation support.

## Storage Keys To Remember

Most shared keys are listed in `STORAGE_KEYS` inside `ui-core.js`.

- Pages/domains: `sanctum_domains`, `sanctum_pages_registry`
- Canvas blocks: `sanctum_page_blocks`
- Page settings/activity: `sanctum_page_settings`, `sanctum_page_activity_v1`
- Documents: `sanctum_documents`, `sanctum_doc_settings`
- Databases: `sanctum_page_databases`
- Legacy database mirror: `sanctum_calendar_databases`
- Notes/assistant: `sanctum_notes_vault_v1`, `sanctum_note_shelves_v1`, `sanctum_helper_*`
- Pins/bookmarks/trash: `sanctum_pins`, `sanctum_bookmarks`, `sanctum_trash`
- Styling extras: `sanctum_stickers`, `sanctum_custom_stickers`, `sanctum_recent_colors`, `sanctum_color_palette`

## Good Places To Start

- Need to change export/import? Start in `app-core.js`, `renderData()`.
- Need to add a new saved data type? Add its key to `STORAGE_KEYS` in `ui-core.js`, then include it in export/import.
- Need to change page/domain behavior? Start in `sidebar.js`.
- Need to change the topbar, settings, pins, or global search? Start in `app-core.js`.
- Need to change canvas blocks? Start in `canvas.js`, then check `canvas-rich-text.js` if text editing is involved.
- Need to change document pages? Start in `document.js`.
- Need to change databases? Start in `page-database.js`.
- Need to change notes or assistant actions? Start in `smart-notes.js`.

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
