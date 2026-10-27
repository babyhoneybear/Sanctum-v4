# Local Writing Check

Sanctum checks spelling and grammar with LanguageTool 6.6 on this computer. The
browser calls `/api/writing-check/check`; the server contacts only
`http://127.0.0.1:8081/v2/check`. The endpoint is fixed, redirects are rejected, and
there is no cloud fallback. Submitted writing and dictionary words are not saved
by the Sanctum server. LanguageTool's result cache is disabled.

On Windows, run `npm run setup:writing-check` once, then `npm start`. Setup downloads
the engine from LanguageTool's official site and a private Java 17 runtime from
Eclipse Adoptium, verifies the Java archive's published SHA-256, and keeps the
runtime and its license files in the ignored `.local-tools` folder. It does not
install Java system-wide. Sanctum starts the checker lazily when text is checked
and stops its own checker process when the server exits. The first check can take
a moment while LanguageTool starts. Setup requires an internet connection; writing
checks do not.

Pause typing, then click or right-click an underlined word to choose a correction,
**Add to dictionary**, or **Ignore** from a small menu. This works in rich text,
plain text inputs, and textareas. Rich text uses CSS Highlights; native fields
use an invisible visual copy with underlines. Neither adds markup to saved text.
The checker adds no floating field buttons or sidebar. Its plain text dropdown appears
only when you interact with a word, with unboxed rows and no heavy border. Use **⋯** on a menu or the check icon in the
Documents toolbar for writing settings; saved-word management is collapsed there.
Corrections use
the editor's native insertion/undo where supported and preserve surrounding rich
formatting. The checker cancels stale requests after edits and refuses corrections
against changed text. Large sections are divided into local requests at paragraph
or word boundaries, up to 200,000 characters per section and 300 displayed issues.

Double-click a correctly spelled word, or right-click a word to use the offline
thesaurus. In Documents, choose **Spelling & word suggestions** from the existing context menu,
alongside its Lexicon and thread actions. **Shift+F7** opens alternatives for the selection or word at the caret.
Spelling and grammar corrections take priority over synonyms, including when a
word is opened before automatic checking finishes. Opening a menu no longer cancels
the spelling check. The menu shows at most four plain text choices;
**More suggestions** cycles through additional choices without dictionary meaning
labels or repeated words. Capitalization is preserved. Mouse-opened menus
keep the editor focused, so typing continues normally and dismisses the card.
The lookup includes a bounded window (up to 500 characters on each side) and the
exact selected occurrence. A local English tagger identifies the word's part of
speech and base form; Princeton WordNet definitions/examples and compact word
vectors select a meaning and rank replacements against the sentence and nearby
noun. Unrelated meanings are kept out of additional suggestion pages. Verb frames,
tense and noun plurals are considered; spelling/grammar corrections still take
priority. Suggestions remain fallible, especially for idioms, sparse context and
unusual prose. They replace the chosen word; they do not rewrite the sentence.
The original alternative-word source is the
WordNet thesaurus distributed by LibreOffice, bundled in `assets/writing/` with its
license, pinned source commit, and SHA-256. No additional installation or online
lookup is needed. The server reads it only on the first lookup. Context analysis
also uses bundled Princeton WordNet 3.0 files in `assets/writing/wordnet/` and
99,187 GloVe-derived 100-dimensional word vectors (9.5 MiB, quantized) in
`assets/writing/context/`. Licenses, attribution and checksums accompany the data.
`wink-nlp`, its small English model, and `en-inflectors` are pinned npm dependencies.
They run on the server on this computer; neither the text nor a query goes to a
remote service. Context requests are not saved, logged or cached as sentences.
`scripts/build-writing-context-vectors.js` reproduces the compact vectors from the
licensed `wink-embeddings-sg-100d@1.1.0` source archive; it is a build-time tool,
not part of runtime checking.

Local grammar checks also include conservative suggestions for introductory
clauses ("If it rains we will stay home") and possible comma splices ("I was tired,
I went home"). Existing engine advice takes priority where matches overlap.
These additions avoid quoted dialogue, lists, and several ambiguous constructions;
they do not promise to find every missing comma. Users choose each change.

**Personal dictionary** is independent of the document Lexicon. Add names, custom
words, and phrases from a spelling suggestion or the dictionary's Add word field.
The checker suppresses their spelling warnings, still checks grammar, and suggests
nearby personal spellings for typos. Saved words and language/live-check preferences
use `sanctum_writing_dictionary_v1` and `sanctum_writing_settings_v1`; both are included
in vault backups. Live checks can be switched off while keeping manual checks.

Language choices: English (US, UK, Canada, Australia). Local LanguageTool does not
include its paid cloud AI rules or paraphrasing service. Unavailable engine errors
appear in the panel and leave the user's text intact.

Validation: `node --test test/writing-check.test.js`, plus the isolated
`http://localhost:3024/test/fixtures/writing-check.html` preview and full-app seed at
`http://localhost:3024/test/fixtures/writing-check-seed.html`. Never seed the normal
port 3005 vault. Check formatting and undo, both document pages, the typo `Kovaeht`
after saving `Kovaeth`, ordinary text fields, stale suggestions after typing,
dictionary removal, and dictionary/document persistence after reload.
