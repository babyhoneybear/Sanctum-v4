const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const Anthropic = require('@anthropic-ai/sdk');

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
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
  "suggestedActions": [{"type":"string","label":"string","noteId":"string","pageId":"string","title":"string","question":"string","reason":"string","detail":"string","confidence":0.0}]
}

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
      max_tokens: 900,
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

app.listen(PORT, () => {
  console.log(`Sanctum running at http://localhost:${PORT}`);
});
