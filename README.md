# Sanctum

Sanctum is a personal browser workspace with visual boards, infinite canvases,
documents, databases, journals, relationships, worldbuilding tools, and audio.
A local Node/Express server serves the JavaScript and CSS frontend.

## Run locally

Use Node.js 24 or newer for the complete test suite, which uses `node:sqlite`.

```sh
npm ci
npm start
```

Open <http://127.0.0.1:3005>. Core workspace startup does not require an API key.
For the optional built-in Anthropic assistant, copy `.env.example` to `.env`
and add your own key. Keep `.env` private.

Personal vault content lives in browser storage, managed by `storage.js`, rather
than this repository. Use Sanctum's export/import tools to back up or transfer
that content. Git tracks the application; it does not back up your browser vault.

## Find your way around

- [PROJECT_MAP.md](PROJECT_MAP.md): feature modules, architecture, and storage keys.
- [TESTING.md](TESTING.md): automated checks, browser fixtures, and dated verification notes.
- [README_CHATGPT_PLUGIN.md](README_CHATGPT_PLUGIN.md): the optional private ChatGPT connector.
- [README_LOCAL_WRITING_CHECK.md](README_LOCAL_WRITING_CHECK.md): local writing tools and optional runtime setup.
- [README_ANTHROPIC_SETUP.md](README_ANTHROPIC_SETUP.md): built-in assistant configuration.

`index.html` defines the actual frontend script loading order. Many frontend
modules share browser globals, so check that order before changing dependencies.

## Checks

```sh
npm test
```

Relay tests start temporary loopback servers and require permission to connect
to `127.0.0.1`. Browser smoke scripts may also need Playwright and Edge; see
`TESTING.md`. Use the fixtures' separate test origins to keep sample data away
from your everyday vault. Automated tests do not replace checking changed UI
behavior in a browser.

## Optional ChatGPT connector

`chatgpt-plugin/` includes worker source, database migrations, and build scripts.
These files are tracked directly in the Sanctum repository so a fresh clone
includes the complete integration. No submodule initialization is required.

```sh
cd chatgpt-plugin
npm ci
npm run build
npm run validate
```

The hosted connector uses a separate authorized deployment and a paired local
browser relay. Its public hosting/origin metadata grants no access to a vault.
See the connector documentation before deploying or connecting a copy.

## Repository boundaries

Source, tests, lockfiles, bundled runtime assets, licenses, and documentation
belong in Git. Installed dependencies, local secrets and connection codes,
downloaded private runtimes, generated artifacts and ZIPs, and recovery copies
are ignored. Existing history is retained.

`artifacts/share/` is the local destination for project-sharing exports; these
archives are not committed. The optional LanguageTool/Java runtime belongs in
ignored `.local-tools/`; install it with `npm run setup:writing-check` when needed.
