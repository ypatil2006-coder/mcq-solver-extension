// popup.js — v1.0 (Claude only)
const $ = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (apiKey) { $('apiKey').value = '••••••••••••••••••••'; updateKeyStatus(true); }
  else updateKeyStatus(false);
  bindEvents();
});

function updateKeyStatus(saved) {
  const el = $('keyStatus');
  el.className = saved ? 'key-status saved' : 'key-status';
  el.innerHTML = saved
    ? `<div class="dot"></div><span>Key saved ✓</span>`
    : `<div class="dot"></div><span>No key saved</span>`;
}

function bindEvents() {
  $('saveKey').addEventListener('click', async () => {
    const val = $('apiKey').value.trim();
    if (!val || val.startsWith('•')) return;
    await chrome.storage.local.set({ apiKey: val });
    $('apiKey').value = '••••••••••••••••••••';
    updateKeyStatus(true);
    addLog('API key saved.', 'success');
    $('results').classList.add('visible');
  });

  $('solveBtn').addEventListener('click', solve);

  $('clearBtn').addEventListener('click', () => {
    $('results').classList.remove('visible');
    $('questionList').innerHTML = '';
    $('log').innerHTML = '';
  });
}

async function solve() {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (!apiKey) { addLog('⚠ Save your Anthropic API key first.', 'error'); $('results').classList.add('visible'); return; }

  const btn = $('solveBtn');
  btn.disabled = true; btn.classList.add('loading');
  btn.querySelector('.btn-text').textContent = 'Scanning page…';
  $('results').classList.add('visible');
  $('questionList').innerHTML = '';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result: pageData }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPageContent });
    addLog(`Extracted ${pageData.text.length} chars. Asking Claude…`, 'info');
    btn.querySelector('.btn-text').textContent = 'Asking Claude…';

    const response = await chrome.runtime.sendMessage({
      type: 'SOLVE_MCQS',
      payload: { pageText: pageData.text, pageHTML: pageData.compactHTML, url: tab.url, title: tab.title, apiKey }
    });

    if (!response.success) throw new Error(response.error);
    const { questions } = response;
    $('resultsCount').textContent = `${questions.length} found`;
    if (!questions.length) { addLog('No MCQs found.', 'error'); return; }

    questions.forEach(q => renderQuestion(q));
    btn.querySelector('.btn-text').textContent = 'Clicking…';
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'CLICK_ANSWERS', questions, autoClick: true, highlight: true });
    if (res?.results) {
      res.results.forEach(r => updateStatus(r));
      addLog(`Done! ${res.results.filter(r=>r.status==='clicked').length}/${questions.length} clicked.`, 'success');
    }
  } catch(e) { addLog(`Error: ${e.message}`, 'error'); }
  finally { btn.querySelector('.btn-text').textContent = '⚡ Solve This Page'; btn.disabled = false; btn.classList.remove('loading'); }
}

function renderQuestion(q) {
  const div = document.createElement('div');
  div.className = 'q-item'; div.dataset.questionId = q.id;
  div.innerHTML = `<div class="q-text">${esc(q.question.substring(0,120))}</div><div class="q-answer"><span class="answer-tag">${esc(q.answerKey)}</span><span class="answer-text">${esc((q.answerText||'').substring(0,50))}</span><span class="status-tag skip" id="status-${q.id}">pending</span></div>`;
  $('questionList').appendChild(div);
}

function updateStatus(r) {
  const item = document.querySelector(`[data-question-id="${r.id}"]`);
  const tag = $(`status-${r.id}`);
  if (!item || !tag) return;
  if (r.status === 'clicked') { item.classList.add('clicked'); tag.className='status-tag ok'; tag.textContent='✓ clicked'; }
  else { tag.className='status-tag fail'; tag.textContent='✗ missed'; }
}

function addLog(msg, type='') {
  $('results').classList.add('visible');
  const log = $('log');
  const s = document.createElement('span'); s.className=`log-line ${type}`; s.textContent=`> ${msg}`;
  log.appendChild(s); log.appendChild(document.createElement('br')); log.scrollTop=log.scrollHeight;
}

function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function extractPageContent() {
  const bodyText = document.body.innerText||'';
  const elems=[];
  document.querySelectorAll('input[type="radio"],input[type="checkbox"]').forEach(el=>{
    const label=el.labels?.[0]?.innerText||el.getAttribute('aria-label')||el.value||'';
    elems.push(`[INPUT] name="${el.name}" id="${el.id}" value="${el.value}" label="${label}"`);
  });
  document.querySelectorAll('button,[role="radio"],[role="checkbox"],[role="option"]').forEach(el=>{
    const t=el.innerText?.trim(); if(t) elems.push(`[BUTTON] text="${t}"`);
  });
  document.querySelectorAll('label').forEach(el=>{
    const t=el.innerText?.trim(); if(t) elems.push(`[LABEL] for="${el.getAttribute('for')||''}" text="${t}"`);
  });
  return { text: bodyText.substring(0,15000), compactHTML: elems.join('\n').substring(0,5000) };
}
