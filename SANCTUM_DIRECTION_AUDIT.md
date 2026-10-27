# Sanctum direction audit — September 11, 2026

## Implementation follow-up — September 12, 2026

The audit below records the earlier state. The first implementation pass now:

- Retains failed key/value saves, retries with bounded backoff, serializes concurrent flushes, and preserves newer writes/deletes and writes following a clear. Synchronous request errors abort the batch. `flush()` returns false when persistence fails.
- Shows a persistent save-failure notice with Retry, warns before leaving with pending storage writes, and prevents import/reset from reloading after a failed save.
- Includes page aliases in assistant search and entity resolution, recognizes the default plural Aliases field, and honors explicit project scope opt-out.
- Adds a searchable Connect to a page action in the note editor and Options menu. Existing connections are disabled in the picker; all direct connections are shown in the note. The existing related-notes tray opens that same note from its destination page.

Browser verification used the separate origin `http://127.0.0.1:3016`: Pasta idea was connected to Recipe Book and Dinner Plans, opened through Dinner Plans' related-notes tray, and retained both links and its text after reload. The picker, empty search, Cancel, and existing-connection state were checked visually. No normal-vault data was changed.

Correction to the initial canonical finding: creation code automatically assigns `canonicalId` to independently editable variants. It is therefore not reliable evidence that two pages' content may be collapsed or writes redirected. This pass intentionally retains ambiguity for such pages and adds a regression test using two different lasagna recipes. Canonical/variant semantics and live-model behavior remain follow-up work, rather than being reported as repaired.

Storage failure checks use a controlled IndexedDB harness; browser verification covered successful persistence. Blob-specific failure/retry behavior and crash-proof persistence of unsaved memory are outside this change.

The guiding intention is to let people capture casually, organize when useful, enjoy their visual workspace manually, and ask an assistant for help using the same information. The historical discussion is context, not a newly approved feature backlog.

**Recommendation:** make existing identity and context rules consistent, then finish one loose-note-to-linked-page workflow. Treat save failure handling as a reliability prerequisite. Preserve the existing creative tools and visual freedom.

## What was actually checked

- Read the project map, testing documentation, storage, page creation/navigation, shared identity helpers, context retrieval, note editor, and assistant transaction code.
- The existing automated suite passed all 93 tests during this conversation.
- Used a separate local origin, `http://127.0.0.1:3015`, with synthetic audit content. Created and edited a quick note in Edge; inspected its Options and Link controls. In the in-app browser, created an Audit Story project on Home, navigated into it, and verified the project and current-page position returned after reload and startup finished.
- Ran small Node probes against the current context engine for project boundaries, page aliases, property aliases, canonical references, and same-name characters across projects.
- No application source changes or changes to the normal vault were made. Sample browser data is confined to the audit origin. This report is the only added project file.

This is a bounded product/architecture audit, not a complete browser certification. The Edge URL prompt interrupted browser automation; subsequent browser checks used the in-app browser. Live model responses, the full recipe/inventory flow, a populated character graph, and all editor interactions were not exercised. Source evidence below is distinguished from observed UI behavior.

## What is already supporting the vision

| Intention | Existing support | Evidence / limit |
| --- | --- | --- |
| Start with a casual note | Notes creates an editable note immediately | Observed creation and typing; no schema required |
| Build a visual place | Canvas placement, page cards, several page layouts, banners, frames and widgets | Observed tool dock and page creation; not every tool tested |
| Return to work | Saved pages and navigation restoration | Sample project survived reload and reopened |
| Keep stories separate | Nearest project/domain context boundaries and ambiguity checks | Source inspection and probes; cross-story Elias is ambiguous |
| Reuse existing information | Duplicate suggestions, canonical references, aliases, linked cards, relationships and database views | Existing code; not a missing-from-scratch system |
| Review assistant changes | Validated proposals, source adapters, snapshots, Apply/Undo and conflict checks | Existing tests passed; not a live-model evaluation |

## Findings that determine what to work on

### 1. The app and assistant do not yet agree on identity and context

Four concrete probes exposed discrepancies:

| Input | Current result | Why it matters |
| --- | --- | --- |
| Project has `isScopeBoundary: false` | Shared UI helper says it is not a boundary; assistant still scopes its child to that project | A user's context setting has different meanings across systems |
| Elias has page-level `aliases: ['Ash']`; query is Ash | Assistant entity resolution returns `none` | Search/creation helpers recognize page aliases, but assistant catalog construction omits them |
| Elias has a text property labelled `Aliases`, value Ash | Resolution returns `none`; singular `Alias` resolves | The default profile field label misses the assistant's singular-word matcher |
| Two Elias pages in one scope, second has `canonicalId` pointing to first | Resolution returns `ambiguous` | Explicit main-page information is not used by the assistant's collision logic |

Relevant code: `ui-core.js` (`isVaultScopeBoundary`, `getVaultCanonicalId`, alias and creation-match helpers); `context-engine.js` (`isScopeBoundary`, page catalog construction, `getRecordAliases`, `resolveEntities`); `page-props.js` default Aliases field. The assistant receives the page registry through `buildSanctumContextCatalog` in `smart-notes.js`, so these probes exercise relevant input shapes.

Do not fix ambiguity by automatically merging names. Same-name characters in different stories should stay distinct; a recipe variant can retain different ingredients. Existing canonical/variant fields need explicit semantics before using them to redirect writes. The shared helper currently follows `variantOf` as well as canonical/duplicate references, which deserves care.

**First product milestone:** one consistent answer to “which thing do you mean?” across manual linking, search and assistant retrieval, with no additional mandatory classification form.

### 2. Quick capture has a weak visible path to later organization

Observed: Notes → New Page produces a writable note. Its Options menu offers Move to Trash and Re-check. The Link tool opens an Enter URL prompt. That editor surface does not provide an obvious manual “connect this to an existing workspace page” or “turn this into a page” action.

The code already supports note-to-page connections, contextual notebooks, related-note trays, and Inbox linking. The gap is exposing a clear manual path from the content the person is looking at, rather than building another note system.

Relevant code: `smart-notes.js`, especially `noteActionMenuHTML`, `editorHTML`, `linkNoteToPage`, related notes and Inbox handlers.

**Next workflow milestone:** write an idea → connect it to an existing page → follow the connection → find the original note there → return without losing position. Add a distinct promotion action later if needed; linking and promotion should not silently create competing copies.

### 3. First-use and hierarchy decisions ask more than the vision suggests

Observed: a fresh Home is visually blank until the user discovers edit mode or the sidebar. The page creation dialog presents Type, Layout and Category. The edit dock has text labels, so the old concern about entirely unexplained symbols is not uniformly true today, though the dock is dense at the audited viewport.

Source inspection: creation currently allows only Hub under Domain, only Project under Hub, and Page/Detail under Project (`getAllowedContainerTypes` and `applyPageCreateContext` in `app-core.js`). This is stronger than merely suggesting useful defaults. It can make a user fit the hierarchy before they can organize naturally.

Treat an easy blank page and optional structure as a design criterion. A small dismissible starting prompt and simpler defaults would be worth evaluating after the core connections work. This audit does not establish that every advanced creation option must be removed.

### 4. Save failure handling needs a separate reliability repair

Source inspection confirms both the scheduled flush and forced flush copy pending writes/deletes, clear the queues, and then await IndexedDB. On failure they log warnings without requeueing the failed batch. A value can remain visible in the memory cache without being durably stored. Normal reload success does not test this failure path.

Relevant code: `storage.js`, `scheduleFlush` and `forceFlush`.

Before release, failed writes should remain recoverable, retries should preserve newer edits, and the interface should distinguish unsaved work from a successful durable save. Exercise transaction failure and concurrent edits with a controlled storage harness. A rollback or Apply receipt should not be presented as proof of durable persistence without checking the storage contract.

## Proposed order

1. **Reliability prerequisite:** repair and test failed-save handling.
2. **Identity/context consistency:** resolve the demonstrated mismatches while retaining cross-story ambiguity and distinct variant content.
3. **One complete manual workflow:** casual note → existing page connection → rediscovery → return.
4. **A small demo using that workflow:** a recipe idea or character note growing into a useful visual page, with optional assistant retrieval/review after manual use succeeds.

Use existing components. Defer additional page types, a broad rewrite, full household automation, and elaborate demonstration layouts until this small chain is dependable.

## Acceptance examples for the identity milestone

- Ash finds Elias when Ash is an existing page alias or an Aliases property.
- Elias in Story A and Elias in Story B remain distinct; an unresolved reference asks for clarification.
- Explicitly opting a project out of its own scope is respected by UI and assistant.
- Explicit canonical references are handled consistently without treating a content-bearing variant as permission to overwrite its main page.
- Mom's lasagna can remain a separate recipe; June dentist appointment can be related to dental care without becoming an alias for it.
- Existing reviewed-change, stale-target, rollback and Undo checks keep passing.

The last two real-life examples are acceptance scenarios, not claims that their full workflows were tested in this audit.
