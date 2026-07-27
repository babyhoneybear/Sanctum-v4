# Testing Sanctum

Run:

```powershell
npm.cmd test
```

(`npm test` works too when PowerShell allows npm scripts.)

This does not replace checking a feature in the browser. It is a quick safety check
that currently verifies:

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
