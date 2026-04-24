# Sanctum + Anthropic local setup

## What this adds
- A tiny local server so your Anthropic key stays off the front end
- A real `/api/assistant/chat` route for the Ask drawer
- A health route at `/api/assistant/health`
- Front-end fallback to local note/page search when the backend is not running

## First run
1. Open this project folder in a terminal
2. Copy `.env.example` to `.env`
3. Paste your Anthropic key into `.env`
4. Run:
   - `npm install`
   - `npm start`
5. Open `http://localhost:3000`

## Important
- Do not paste your real key into front-end files
- Notes and pages still live in browser storage for now
- The Ask drawer sends compact context, not your full vault every time

## What the assistant can do right now
- Answer questions with real Anthropic responses
- Read current page context
- Read related notes
- Use note/page search matches from the app
- Create Inbox questions
- Rename untitled notes
- Save small helper memory facts

## What it does not do yet
- Directly read the entire vault from the server
- Silently rewrite page content
- Move or delete large things on its own
- Full multi-user vault separation
