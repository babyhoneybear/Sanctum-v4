const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const Anthropic = require('@anthropic-ai/sdk');

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3005);
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const HOST = process.env.HOST || '127.0.0.1';
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

app.use(express.json({ limit: '1mb' }));

function safeText(value, max = 4000) {
  return String(value || '').slice(0, max);
}

function extractTextFromAnthropicContent(content = []) {
  return Array.isArray(content)
    ? content
        .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('\n')
        .trim()
    : '';
}

function extractJSONObject(text = '') {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeAssistantAction(item = {}) {
  const type = typeof item?.type === 'string' ? item.type.trim() : '';
  if (!type) return null;

  return {
    id: typeof item?.id === 'string' && item.id.trim() ? item.id.trim() : `act-${Math.random().toString(36).slice(2, 9)}`,
    type,
    label: typeof item?.label === 'string' && item.label.trim() ? item.label.trim() : 'Do this',
    noteId: typeof item?.noteId === 'string' ? item.noteId : '',
    pageId: typeof item?.pageId === 'string' ? item.pageId : '',
    title: typeof item?.title === 'string' ? item.title.trim() : '',
    question: typeof item?.question === 'string' ? item.question.trim() : '',
    reason: typeof item?.reason === 'string' ? item.reason.trim() : '',
    detail: typeof item?.detail === 'string' ? item.detail.trim() : '',
    confidence: Number.isFinite(Number(item?.confidence)) ? Number(item.confidence) : 0,
    // create-layout specific fields
    targetPage: typeof item?.targetPage === 'string' ? item.targetPage : 'current',
    newPageTitle: typeof item?.newPageTitle === 'string' ? item.newPageTitle.trim() : '',
    blocks: Array.isArray(item?.blocks)
      ? item.blocks.map((b) => ({
          type: typeof b?.type === 'string' ? b.type.trim() : 'text',
          x: Number.isFinite(Number(b?.x)) ? Math.round(Number(b.x) / 24) * 24 : 0,
          y: Number.isFinite(Number(b?.y)) ? Math.round(Number(b.y) / 24) * 24 : 0,
          w: Number.isFinite(Number(b?.w)) && Number(b.w) > 0 ? Math.round(Number(b.w) / 24) * 24 : 288,
          h: Number.isFinite(Number(b?.h)) && Number(b.h) > 0 ? Math.round(Number(b.h) / 24) * 24 : 48,
          titleHTML: typeof b?.titleHTML === 'string' ? b.titleHTML : '',
          bodyHTML: typeof b?.bodyHTML === 'string' ? b.bodyHTML : '',
          bg: typeof b?.bg === 'string' ? b.bg : '',
          borderColor: typeof b?.borderColor === 'string' ? b.borderColor : '',
          textColor: typeof b?.textColor === 'string' ? b.textColor : '',
          radius: typeof b?.radius === 'string' ? b.radius : '',
          linkedPageId: typeof b?.linkedPageId === 'string' ? b.linkedPageId : '',
          pageCardTitle: typeof b?.pageCardTitle === 'string' ? b.pageCardTitle : '',
          pageCardIcon: typeof b?.pageCardIcon === 'string' ? b.pageCardIcon : '',
          pageCardSummary: typeof b?.pageCardSummary === 'string' ? b.pageCardSummary : '',
        }))
      : [],
  };
}

function normalizeAssistantPayload(payload = {}) {
  const reply = typeof payload.reply === 'string' && payload.reply.trim()
    ? payload.reply.trim()
    : 'I could not form a useful reply yet.';

  const inboxQuestions = Array.isArray(payload.inboxQuestions)
    ? payload.inboxQuestions
        .map((item) => ({
          title: typeof item?.title === 'string' && item.title.trim() ? item.title.trim() : 'Helper question',
          question: typeof item?.question === 'string' ? item.question.trim() : '',
          noteId: typeof item?.noteId === 'string' ? item.noteId : '',
          confidence: Number.isFinite(Number(item?.confidence)) ? Number(item.confidence) : 0,
          suggestedPageId: typeof item?.suggestedPageId === 'string' ? item.suggestedPageId : '',
          suggestedAction: typeof item?.suggestedAction === 'string' ? item.suggestedAction : '',
          reason: typeof item?.reason === 'string' ? item.reason.trim() : '',
        }))
        .filter((item) => item.question)
        .slice(0, 4)
    : [];

  const renameSuggestions = Array.isArray(payload.renameSuggestions)
    ? payload.renameSuggestions
        .map((item) => ({
          noteId: typeof item?.noteId === 'string' ? item.noteId : '',
          title: typeof item?.title === 'string' ? item.title.trim() : '',
        }))
        .filter((item) => item.noteId && item.title)
        .slice(0, 3)
    : [];

  const memoryWrites = Array.isArray(payload.memoryWrites)
    ? payload.memoryWrites
        .map((item) => typeof item === 'string' ? item.trim() : String(item?.text || '').trim())
        .filter(Boolean)
        .slice(0, 4)
    : [];

  let suggestedActions = Array.isArray(payload.suggestedActions)
    ? payload.suggestedActions.map(normalizeAssistantAction).filter(Boolean).slice(0, 6)
    : [];

  if (!suggestedActions.length) {
    renameSuggestions.forEach((item) => {
      suggestedActions.push(normalizeAssistantAction({
        type: 'rename-note',
        label: `Rename to “${item.title}”`,
        noteId: item.noteId,
        title: item.title,
      }));
    });

    inboxQuestions.forEach((item) => {
      suggestedActions.push(normalizeAssistantAction({
        type: 'send-to-inbox',
        label: 'Send this to Inbox',
        noteId: item.noteId,
        pageId: item.suggestedPageId,
        title: item.title,
        question: item.question,
        reason: item.reason,
        confidence: item.confidence,
      }));
    });
  }

  suggestedActions = suggestedActions.filter(Boolean).slice(0, 6);

  return { reply, inboxQuestions, renameSuggestions, memoryWrites, suggestedActions };
}


function buildPrompt(body = {}) {
  const user = body.user || {};
  const context = body.context || {};
  const currentPage = context.currentPage || {};
  const activeNote = context.activeNote || null;
  const relatedNotes = Array.isArray(context.relatedNotes) ? context.relatedNotes : [];
  const noteMatches = Array.isArray(context?.searchMatches?.notes) ? context.searchMatches.notes : [];
  const pageMatches = Array.isArray(context?.searchMatches?.pages) ? context.searchMatches.pages : [];
  const helperMemory = Array.isArray(context.helperMemory) ? context.helperMemory : [];
  const conversationHistory = Array.isArray(context.conversationHistory) ? context.conversationHistory : [];
  const nearbyLinkedPages = Array.isArray(context.nearbyLinkedPages) ? context.nearbyLinkedPages : [];
  const mode = body.mode === 'background' ? 'background' : 'ask';

  return `
You are the user's personal assistant living inside the Sanctum platform.
Sanctum is the app/platform. You are not Sanctum itself. You are the user's assistant inside it.

Mode: ${mode}

Core behavior:
- Work only from the user message and provided app context.
- Do not invent app facts that are not in the context.
- Be warm, grounded, slightly conversational, and helpful.
- Do not sound robotic. Do not roleplay. Do not pretend certainty you do not have.
- When unsure, say so clearly and either ask a good question or suggest sending it to Inbox.
- Prefer actionable next steps over abstract advice.

Ask mode rules:
- Think things through and explain your reasoning briefly.
- If a note or page decision is involved, suggest concrete next steps.
- Use suggestedActions when a button would help the user act on your advice.
- Good actions: rename-note, link-note, send-to-inbox, keep-loose, open-note, open-page.
- Use link-note when you can identify a strong page match from breadcrumb, nearby linked pages, related notes, or search matches.
- Never claim an action already happened unless the provided context says it did.

Background mode rules:
- Be shorter and more operational.
- Suggest Inbox questions for uncertainty.
- Suggest titles only for untitled or unclear notes.

Memory rules:
- Memory writes are only for assistant-useful user preferences or habits, not app facts like lore, schedules, or medication data.

Return STRICT JSON only with this shape:
{
  "reply": "string",
  "inboxQuestions": [{"title":"string","question":"string","noteId":"string","confidence":0.0,"suggestedPageId":"string","suggestedAction":"string","reason":"string"}],
  "renameSuggestions": [{"noteId":"string","title":"string"}],
  "memoryWrites": ["string"],
  "suggestedActions": [{"type":"string","label":"string","noteId":"string","pageId":"string","title":"string","question":"string","reason":"string","detail":"string","confidence":0.0,"targetPage":"current|new","newPageTitle":"string","blocks":[{"type":"text|list|container|image|page|divider","x":0,"y":0,"w":288,"h":48,"titleHTML":"string","bodyHTML":"string","bg":"#hexOrEmpty","borderColor":"#hexOrEmpty","textColor":"#hexOrEmpty","radius":"8px|4px|empty","linkedPageId":"pageIdOrEmpty","pageCardTitle":"string","pageCardIcon":"emoji","pageCardSummary":"string"}]}]
}

Layout generation rules (create-layout action type):
- Use type "create-layout" when the user asks to generate, build, or create a board layout.
- The canvas grid uses 24px units. Snap ALL x, y, w, h values to exact multiples of 24. Never use non-multiples.
- Canvas is approximately 1600px wide. Keep layouts within x: 0–1560, y: 0–1200 (scroll down is fine).
- targetPage: "current" to add blocks to the currently open board, "new" to create a fresh page first.
- If targetPage is "new", also set newPageTitle to the desired page name.
- The layout is additive — never suggest deleting existing blocks or pages.
- Include a label for the action, e.g. "Create project board layout" or "Generate dashboard layout".

VISUAL DESIGN SYSTEM — follow these rules to produce beautiful, polished layouts:

Color palette (Sanctum is a dark app — use dark backgrounds, subtle borders, and accents):
  Surface tiers: "#111111" (deepest), "#161616", "#1a1a1a", "#1e1e1e" (default blocks), "#222222", "#272727"
  Subtle borders: "#2a2a2a", "#313131", "#3a3a3a"
  Accent colors (use sparingly for headers/highlights):
    Indigo: bg="#1a1a2e" border="#2d2d4e" text empty (let default apply)
    Teal:   bg="#0d1f1f" border="#1a3a3a"
    Rose:   bg="#1f0d0d" border="#3a1a1a"
    Amber:  bg="#1f1700" border="#3a2e00"
    Sage:   bg="#0f1a0f" border="#1e3a1e"
    Slate:  bg="#121420" border="#22253a"
  Use empty bg/borderColor ("") for blocks that should inherit the default canvas background.

Typography in bodyHTML / titleHTML (use inline HTML, keep it simple):
  Section label:  <strong style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;opacity:0.5">LABEL</strong>
  Page title:     <strong style="font-size:18px;font-weight:700">Title</strong>
  Subtitle:       <span style="opacity:0.55;font-size:12px">subtitle text</span>
  Body copy:      plain text or <span style="opacity:0.7">text</span>
  Divider label:  <strong>Section Name</strong>

Block sizing guide (all in 24px units — multiply by 24 to get px):
  Spanning header:    w=1152–1440, h=72–96   (full-width title block)
  Section label:      w=240–336,  h=48        (small caps label above a group)
  Body text block:    w=288–480,  h=72–144    (paragraph / notes)
  List block:         w=288–384,  h=120–240   (bullet lists)
  Container/frame:    w=312–528,  h=168–360   (grouped card area)
  Page-link card:     w=216–312,  h=48–72     (links to subpages)
  Image block:        w=360–480,  h=192–288
  Horizontal divider: w=1152–1440, h=24

Spacing rules:
  - Leave at least 24px gap between blocks (never overlap).
  - Group related blocks visually close together (within 24–48px of each other).
  - Start the first row at y=24 or y=48, not y=0.
  - Use x=24 or x=48 as the leftmost margin.
  - Typical column layout: 3–4 columns, each ~336–384px wide, separated by 24–48px gaps.

Proven layout patterns (use these as starting points, adapt to the page context):

DASHBOARD (use for hub/overview pages):
  Row 1 (y=24):   1 wide title text block spanning ~1152px
  Row 2 (y=144):  3–4 stat/summary text blocks, each ~264–312px wide, evenly spaced
  Row 3 (y=264):  2 containers side by side (main content + sidebar)
  Row 4 (y=480+): list blocks or page-link cards for quick access items

KANBAN / PROJECT BOARD (use for project/task pages):
  Row 1 (y=24):   Title header block (wide)
  Row 2 (y=120):  3 containers labeled "To Do", "In Progress", "Done" — equal width ~360px, spaced 24px apart, tall (h=360–480)
  Inside each container bodyHTML: a list of items as HTML list items

NOTES / REFERENCE PAGE:
  Row 1 (y=24):   Wide title + subtitle block
  Row 2 (y=120):  Section label, then 2-col layout: main content left (~720px), sidebar right (~336px)
  Sidebar: list block with quick links or page-link cards

MINIMAL LANDING / HUB:
  Center area (x=240): Icon/title text block (w=864, h=96), body description below
  Below: 2–3 page-link cards side by side for subpages
  Accent border on the title block to give it presence

ALWAYS:
  - Choose a color theme (one of the accent palettes above) and apply it consistently across the layout.
  - Give container blocks a subtle bg (#1a1a1a or an accent tone) and a border.
  - Give the main title block a slightly lighter bg or accent border to make it stand out.
  - Use section labels (small caps, muted) before groups of blocks.
  - Do not leave all blocks the same size — vary widths and heights to create visual rhythm.
  - Aim for 8–20 blocks total. More than 20 is too cluttered; fewer than 5 is too sparse.

Current user:
${JSON.stringify({ id: user.id || 'primary-user', displayName: user.displayName || 'You', assistantName: user.assistantName || 'Assistant' }, null, 2)}

Current page context:
${JSON.stringify({
  title: currentPage.title || 'Home',
  layout: currentPage.layout || 'board-canvas',
  category: currentPage.category || 'none',
  breadcrumbTitles: currentPage.breadcrumbTitles || [],
  descriptor: safeText(currentPage.descriptor || '', 1800),
}, null, 2)}

Nearby linked pages:
${JSON.stringify(nearbyLinkedPages.map((page) => ({
  id: page.id,
  title: page.title,
  source: page.source || '',
  breadcrumb: page.breadcrumb || [],
  layout: page.layout || 'board-canvas',
  category: page.category || 'none',
  summary: safeText(page.summary || '', 240),
})), null, 2)}

Active note:
${JSON.stringify(activeNote ? {
  id: activeNote.id,
  title: activeNote.title,
  preview: safeText(activeNote.preview || '', 240),
  body: safeText(activeNote.body || '', 2400),
  shelfNames: activeNote.shelfNames || [],
  linkedPages: activeNote.linkedPages || [],
  sortState: activeNote.sortState || 'unsorted',
  needsReview: !!activeNote.needsReview,
} : null, null, 2)}

Related notes on this page:
${JSON.stringify(relatedNotes.map((note) => ({
  id: note.id,
  title: note.title,
  preview: safeText(note.preview || '', 220),
  shelfNames: note.shelfNames || [],
  linkedPages: note.linkedPages || [],
})), null, 2)}

Search matches for this message:
${JSON.stringify({
  notes: noteMatches.map((note) => ({
    id: note.id,
    title: note.title,
    preview: safeText(note.preview || '', 220),
    linkedPages: note.linkedPages || [],
  })),
  pages: pageMatches.map((page) => ({
    id: page.id,
    title: page.title,
    breadcrumb: page.breadcrumb || [],
    layout: page.layout || 'board-canvas',
    category: page.category || 'none',
    summary: safeText(page.summary || '', 300),
  })),
}, null, 2)}

Recent conversation:
${JSON.stringify(conversationHistory.slice(-8), null, 2)}

Helper memory:
${JSON.stringify(helperMemory.slice(-12), null, 2)}

User message:
${safeText(body.message || '', 4000)}
`;
}


app.get('/api/assistant/health', (_req, res) => {
  res.json({ ok: true, provider: 'anthropic', configured: !!anthropic, model: MODEL });
});

app.post('/api/assistant/chat', async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({
      reply: 'Anthropic is not configured yet. Add your key to a local .env file and restart Sanctum.',
      inboxQuestions: [],
      renameSuggestions: [],
      memoryWrites: [],
    });
  }

  try {
    const prompt = buildPrompt(req.body || {});
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2400,
      temperature: 0.35,
      system: 'You are a careful personal assistant inside the Sanctum platform. Return valid JSON only.',
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = extractTextFromAnthropicContent(response.content);
    const parsed = extractJSONObject(rawText);

    if (!parsed) {
      return res.json({
        reply: rawText || 'I did not return usable JSON yet, but the assistant route is connected.',
        inboxQuestions: [],
        renameSuggestions: [],
        memoryWrites: [],
      });
    }

    return res.json(normalizeAssistantPayload(parsed));
  } catch (error) {
    console.error('Anthropic assistant error:', error);
    return res.status(500).json({
      reply: 'Claude had trouble answering that just now. The connection exists, but this request failed.',
      inboxQuestions: [],
      renameSuggestions: [],
      memoryWrites: [],
    });
  }
});

app.use(express.static(__dirname));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  if (path.extname(req.path)) {
    return res.sendFile(path.join(__dirname, req.path));
  }
  return res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Sanctum running at http://${HOST}:${PORT}`);
});
