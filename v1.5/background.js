// background.js — MCQ Solver AI

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SOLVE_MCQS') {
    handleSolve(message.payload)
      .then(r  => sendResponse(r))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
});

const SYSTEM_PROMPT = `You are an expert MCQ solver. Analyze the full page and identify every multiple choice question.

CRITICAL: Detect question type:
- "single" = only ONE correct answer (radio buttons / circles)
- "multiple" = MULTIPLE correct answers (checkboxes / squares)

Respond ONLY with a raw JSON array — no markdown, no explanation, nothing else.

Each item must have exactly these fields:
{
  "id": "q1",
  "question": "full question text",
  "questionType": "single" or "multiple",
  "answerKey": "A" or "B" or option label,
  "answerText": "full correct answer text",
  "clickStrategy": "radio-label" | "button-text" | "label-text" | "radio-value" | "aria-label",
  "clickTarget": "exact text or value to match when clicking",
  "confidence": 90
}

For multiple-correct questions, pick the most likely correct answers and return one item per answer.
If no MCQs found return exactly: []`;

async function handleSolve({ provider, model, apiKey, pageText, pageHTML, url, title }) {
  const userContent = `URL: ${url}\nTitle: ${title}\n\n=== INTERACTIVE ELEMENTS ===\n${pageHTML}\n\n=== PAGE TEXT ===\n${pageText}\n\nReturn JSON array.`;

  let questions;
  switch (provider) {
    case 'anthropic': questions = await callAnthropic(apiKey, model, userContent); break;
    case 'openai':    questions = await callOpenAI(apiKey, model, userContent);    break;
    case 'gemini':    questions = await callGemini(apiKey, model, userContent);    break;
    case 'groq':      questions = await callGroq(apiKey, model, userContent);      break;
    default: throw new Error(`Unknown provider: ${provider}`);
  }
  return { success: true, questions };
}

async function callAnthropic(apiKey, model, content) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model, max_tokens: 2048, system: SYSTEM_PROMPT, messages: [{ role:'user', content }] }),
  });
  await assertOk(res, 'Anthropic');
  const data = await res.json();
  return parseJSON(data.content?.[0]?.text || '[]');
}

async function callOpenAI(apiKey, model, content) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}` },
    body: JSON.stringify({ model, max_tokens:2048, messages:[{ role:'system', content:SYSTEM_PROMPT },{ role:'user', content }] }),
  });
  await assertOk(res, 'OpenAI');
  const data = await res.json();
  return parseJSON(data.choices?.[0]?.message?.content || '[]');
}

async function callGemini(apiKey, model, content) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role:'user', parts:[{ text:content }] }],
      generationConfig: { maxOutputTokens:2048, temperature:0.1 },
    }),
  });
  await assertOk(res, 'Gemini');
  const data = await res.json();
  return parseJSON(data.candidates?.[0]?.content?.parts?.[0]?.text || '[]');
}

async function callGroq(apiKey, model, content) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}` },
    body: JSON.stringify({ model, max_tokens:2048, messages:[{ role:'system', content:SYSTEM_PROMPT },{ role:'user', content }] }),
  });
  await assertOk(res, 'Groq');
  const data = await res.json();
  return parseJSON(data.choices?.[0]?.message?.content || '[]');
}

async function assertOk(res, provider) {
  if (res.ok) return;
  let msg = `${provider} error ${res.status}`;
  try {
    const body = await res.json();
    const detail = body.error?.message || body.message || '';
    if (detail) msg = detail;
    // Normalize common errors
    if (res.status === 401) msg = `invalid x-api-key`;
    if (res.status === 429) msg = `rate_limit exceeded`;
    if (res.status === 402) msg = `insufficient_quota`;
  } catch {}
  throw new Error(msg);
}

function parseJSON(raw) {
  let t = raw.trim().replace(/^```json?\s*/i,'').replace(/\s*```$/i,'').trim();
  try { const p = JSON.parse(t); return Array.isArray(p) ? p : []; } catch {}
  const m = t.match(/\[[\s\S]*\]/);
  if (m) try { return JSON.parse(m[0]); } catch {}
  return [];
}
