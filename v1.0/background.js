// background.js — v1.0 (Claude / Anthropic only)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SOLVE_MCQS') {
    handleSolve(message.payload)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

const SYSTEM_PROMPT = `You are an expert MCQ (Multiple Choice Question) solver.
Your task is to identify ALL multiple choice questions on the page and determine the correct answer for each.
Respond ONLY with a valid JSON array. No markdown, no explanation, just JSON.

Each element must have:
- "id": unique string like "q1", "q2"
- "question": full question text
- "answerKey": option letter/label (e.g. "A", "B")
- "answerText": full text of the correct answer option
- "clickStrategy": one of ["radio-value","radio-label","button-text","label-text","aria-label"]
- "clickTarget": exact value/text to match when clicking
- "confidence": 0-100

If no MCQs found return: []`;

async function handleSolve({ pageText, pageHTML, url, title, apiKey }) {
  const userMessage = `Page URL: ${url}\nPage Title: ${title}\n\n=== INTERACTIVE ELEMENTS ===\n${pageHTML}\n\n=== FULL PAGE TEXT ===\n${pageText}\n\nReturn JSON array of all MCQ questions with correct answers.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  const rawText = data.content?.[0]?.text || '[]';
  return { success: true, questions: parseJSON(rawText) };
}

function parseJSON(raw) {
  let text = raw.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { const p = JSON.parse(text); return Array.isArray(p) ? p : []; } catch {}
  const match = text.match(/\[[\s\S]*\]/);
  if (match) try { return JSON.parse(match[0]); } catch {}
  return [];
}
