// background.js — v1.1 (Multi-provider: Claude, OpenAI, Gemini, Groq)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SOLVE_MCQS') {
    handleSolve(message.payload)
      .then(r => sendResponse(r))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
});

const SYSTEM_PROMPT = `You are an expert MCQ solver. Identify ALL multiple choice questions on the page and determine the correct answer for each.
Respond ONLY with a raw JSON array — no markdown, no explanation.
Each item: { "id":"q1","question":"...","answerKey":"A","answerText":"...","clickStrategy":"radio-label","clickTarget":"...","confidence":90 }
If no MCQs found return: []`;

async function handleSolve({ provider, model, apiKey, pageText, pageHTML, url, title }) {
  const content = `URL: ${url}\nTitle: ${title}\n\n=== ELEMENTS ===\n${pageHTML}\n\n=== PAGE TEXT ===\n${pageText}\n\nReturn JSON array.`;
  let questions;
  switch(provider) {
    case 'anthropic': questions = await callAnthropic(apiKey, model, content); break;
    case 'openai':    questions = await callOpenAI(apiKey, model, content);    break;
    case 'gemini':    questions = await callGemini(apiKey, model, content);    break;
    case 'groq':      questions = await callGroq(apiKey, model, content);      break;
    default: throw new Error(`Unknown provider: ${provider}`);
  }
  return { success: true, questions };
}

async function callAnthropic(apiKey, model, content) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{ 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true','anthropic-dangerous-direct-browser-access':'true' },
    body: JSON.stringify({ model, max_tokens:2048, system:SYSTEM_PROMPT, messages:[{role:'user',content}] })
  });
  if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e.error?.message||`Anthropic ${res.status}`); }
  return parseJSON((await res.json()).content?.[0]?.text||'[]');
}

async function callOpenAI(apiKey, model, content) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{ 'Content-Type':'application/json','Authorization':`Bearer ${apiKey}` },
    body: JSON.stringify({ model, max_tokens:2048, messages:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content}] })
  });
  if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e.error?.message||`OpenAI ${res.status}`); }
  return parseJSON((await res.json()).choices?.[0]?.message?.content||'[]');
}

async function callGemini(apiKey, model, content) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ system_instruction:{parts:[{text:SYSTEM_PROMPT}]},contents:[{role:'user',parts:[{text:content}]}],generationConfig:{maxOutputTokens:2048,temperature:0.1} })
  });
  if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e.error?.message||`Gemini ${res.status}`); }
  return parseJSON((await res.json()).candidates?.[0]?.content?.parts?.[0]?.text||'[]');
}

async function callGroq(apiKey, model, content) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method:'POST',
    headers:{ 'Content-Type':'application/json','Authorization':`Bearer ${apiKey}` },
    body: JSON.stringify({ model, max_tokens:2048, messages:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content}] })
  });
  if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e.error?.message||`Groq ${res.status}`); }
  return parseJSON((await res.json()).choices?.[0]?.message?.content||'[]');
}

function parseJSON(raw) {
  let t=raw.trim().replace(/^```json?\s*/i,'').replace(/\s*```$/i,'').trim();
  try{const p=JSON.parse(t);return Array.isArray(p)?p:[];}catch{}
  const m=t.match(/\[[\s\S]*\]/); if(m) try{return JSON.parse(m[0]);}catch{}
  return [];
}
