// content.js — MCQ Solver AI

// ── Patterns ──────────────────────────────────────────────────────────────────
const NEXT_BTN = [
  /^next(\s+question)?$/i, /^continue$/i, /^proceed$/i, /^forward$/i,
  /^save\s*&?\s*next$/i, /^go\s+to\s+next/i,
  /next\s*[»›>]$/i, /^[»›>]$/, /→/,
];
const SUBMIT_BTN = [
  /^submit(\s+(quiz|test|exam|answers?))?$/i,
  /^finish(\s+(test|exam|quiz))?$/i,
  /^end\s+(test|exam|quiz)$/i,
  /^complete(\s+(test|exam))?$/i,
  /^done$/i,
];
const DONE_PAGE = [
  /your\s+score/i, /quiz\s+(complete|finished|ended)/i,
  /test\s+(complete|finished|ended)/i, /exam\s+(complete|finished|ended)/i,
  /congratulations/i, /well\s+done/i, /you\s+(scored|passed|failed)/i,
  /final\s+score/i, /submitted\s+successfully/i,
];

// ── Stealth green dot ─────────────────────────────────────────────────────────
let greenDot = null;

function showGreenDot() {
  if (greenDot) return;
  greenDot = document.createElement('div');
  greenDot.id = '__mcq_dot__';
  greenDot.style.cssText = [
    'position:fixed', 'top:8px', 'left:8px',
    'width:10px', 'height:10px', 'border-radius:50%',
    'background:#22c55e',
    'box-shadow:0 0 8px rgba(34,197,94,0.9)',
    'z-index:2147483647',
    'pointer-events:none',
    'animation:__mcq_pulse__ 2s ease-in-out infinite',
  ].join(';');

  const style = document.createElement('style');
  style.textContent = '@keyframes __mcq_pulse__{0%,100%{opacity:1}50%{opacity:0.4}}';
  document.head.appendChild(style);
  document.body.appendChild(greenDot);
}

function hideGreenDot() {
  if (greenDot) { greenDot.remove(); greenDot = null; }
}

function removeOverlays() {
  document.querySelectorAll('.__mcq_overlay__').forEach(e => e.remove());
}

// ── Message listener ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'RUN_ONCE')    { runOnce(msg.config).then(() => sendResponse({ ok:true }));  return true; }
  if (msg.type === 'START_LOOP')  { startLoop(msg.config).then(() => sendResponse({ ok:true })); return true; }
  if (msg.type === 'SET_STEALTH') { applyStealth(msg.value); sendResponse({ ok:true }); }
  if (msg.type === 'CLICK_ANSWERS') {
    const results = clickAnswers(msg.questions, msg.autoClick !== false, msg.highlight !== false);
    sendResponse({ results });
  }
});

// ── Auto-resume after page navigation ─────────────────────────────────────────
(async () => {
  const { loopRunning, loopConfig, optStealth } = await chrome.storage.local.get(['loopRunning','loopConfig','optStealth']);
  if (optStealth) applyStealth(true);
  if (loopRunning && loopConfig) {
    await sleep(1800);
    await loopStep(loopConfig);
  }
})();

function applyStealth(on) {
  if (on) { showGreenDot(); removeOverlays(); }
  else    { hideGreenDot(); }
}

// ── Single page solve ─────────────────────────────────────────────────────────
async function runOnce(config) {
  await log('Scanning page…', 'info');
  const pageData = extractPage();
  await log('Asking AI…', 'info');

  let questions = [];
  try { questions = await askAI(config, pageData); }
  catch(e) { await log(friendlyError(e.message), 'err'); return; }

  if (!questions.length) { await log('No MCQs found on this page', 'warn'); return; }
  await log(`Found ${questions.length} question(s)`, 'ok');

  const opts = await getOpts();
  markBullets(questions);
  clickAnswers(questions, true, opts.highlight);

  const { loopAnswered=0 } = await chrome.storage.local.get('loopAnswered');
  await chrome.storage.local.set({ loopAnswered: loopAnswered + questions.length });
}

// ── Loop ──────────────────────────────────────────────────────────────────────
async function startLoop(config) {
  await setStatus('Running…');
  await loopStep(config);
}

async function loopStep(config) {
  const { loopRunning } = await chrome.storage.local.get('loopRunning');
  if (!loopRunning) { await log('Loop stopped', 'warn'); return; }

  // Done?
  if (isDone()) {
    await chrome.storage.local.set({ loopRunning: false, loopStatus: '✓ Test completed!' });
    await log('Test completed! 🎉', 'ok');
    showBanner('✓ Test complete!', 'green');
    return;
  }

  // Scan
  await setStatus('Scanning page…');
  const pageData = extractPage();

  // Ask AI
  await setStatus('Asking AI…');
  let questions = [];
  try {
    questions = await askAI(config, pageData);
  } catch(e) {
    const msg = friendlyError(e.message);
    await log(msg, 'err');
    await setStatus('✗ ' + msg);
    await chrome.storage.local.set({ loopRunning: false });
    showBanner(msg, 'red');
    return;
  }

  if (questions.length) {
    await setStatus('Clicking answers…');
    const opts = await getOpts();
    markBullets(questions);
    clickAnswers(questions, true, opts.highlight);

    // Update last question type stat
    const types = [...new Set(questions.map(q => q.questionType))];
    await chrome.storage.local.set({ loopLastType: types.join('/') });

    const { loopAnswered=0 } = await chrome.storage.local.get('loopAnswered');
    await chrome.storage.local.set({ loopAnswered: loopAnswered + questions.length });
    await log(`Answered ${questions.length} question(s) [${types.join('/')}]`, 'ok');
    await sleep(700);
  } else {
    await log('No questions found — trying to navigate…', 'warn');
  }

  // Check still running
  const { loopRunning: still } = await chrome.storage.local.get('loopRunning');
  if (!still) return;

  // Find nav button
  await setStatus('Navigating…');
  await sleep(300);

  const btn = findBtn(SUBMIT_BTN) || findBtn(NEXT_BTN);
  if (!btn) {
    await log('No Next/Submit button found — stopping', 'warn');
    await chrome.storage.local.set({ loopRunning: false, loopStatus: '⚠ No nav button' });
    showBanner('⚠ No Next button found', 'yellow');
    return;
  }

  const label = (btn.innerText || btn.value || '').trim().substring(0, 30);
  await log(`Clicking "${label}"…`, 'info');

  const { loopPages=0 } = await chrome.storage.local.get('loopPages');
  await chrome.storage.local.set({ loopPages: loopPages + 1 });

  btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(400);
  simulateClick(btn);

  // SPA check
  const urlBefore = location.href;
  await sleep(2200);
  if (location.href === urlBefore) {
    await log('SPA — re-running on updated content…', 'info');
    await loopStep(config);
  }
  // Hard navigation → auto-resume via top-level IIFE on next page load
}

// ── Bullet marking (□ = multi, ○ = single) ───────────────────────────────────
function markBullets(questions) {
  questions.forEach(q => {
    const type = q.questionType; // 'single' or 'multiple'
    const symbol = type === 'multiple' ? '□' : '○';
    const color  = type === 'multiple' ? '#a78bfa' : '#60a5fa';

    // Find the question container
    const el = findAnswer(q);
    if (!el) return;

    // Walk up to find the question block
    let container = el;
    for (let i = 0; i < 6; i++) {
      if (!container.parentElement) break;
      container = container.parentElement;
    }

    // Don't double-mark
    if (container.dataset.mcqMarked) return;
    container.dataset.mcqMarked = '1';

    // Inject bullet before each option
    const inputs = container.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"], label');
    inputs.forEach(inp => {
      if (inp.dataset.mcqBullet) return;
      inp.dataset.mcqBullet = '1';
      const bullet = document.createElement('span');
      bullet.className = '__mcq_overlay__';
      bullet.textContent = symbol + ' ';
      bullet.style.cssText = `color:${color};font-size:12px;margin-right:4px;font-family:monospace;pointer-events:none;`;
      inp.parentElement?.insertBefore(bullet, inp);
    });
  });
}

// ── Click answers ─────────────────────────────────────────────────────────────
function clickAnswers(questions, autoClick, highlight) {
  return questions.map(q => {
    const el = findAnswer(q);
    if (el) {
      if (highlight) applyHighlight(el, q);
      if (autoClick) simulateClick(el);
      return { id: q.id, status: autoClick ? 'clicked' : 'highlighted' };
    }
    return { id: q.id, status: 'not_found' };
  });
}

function findAnswer(q) {
  for (const fn of [
    () => byStrategy(q.clickStrategy, q.clickTarget),
    () => byText(q.answerText),
    () => byText(q.answerKey),
    () => fuzzy(q.answerText),
  ]) { const el = fn(); if (el) return el; }
  return null;
}

function byStrategy(strategy, target) {
  if (!target) return null;
  if (strategy === 'radio-value') return document.querySelector(`input[type="radio"][value="${CSS.escape(target)}"]`);
  if (strategy === 'radio-label') {
    for (const lbl of document.querySelectorAll('label')) {
      if (n(lbl.innerText).includes(n(target))) {
        if (lbl.htmlFor) { const el = document.getElementById(lbl.htmlFor); if (el) return el; }
        return lbl.querySelector('input') || lbl;
      }
    }
  }
  if (strategy === 'button-text') {
    for (const el of document.querySelectorAll('button,[role="button"],[role="option"],[role="radio"]'))
      if (n(el.innerText||el.textContent).includes(n(target))) return el;
  }
  if (strategy === 'label-text') {
    for (const el of document.querySelectorAll('label,li,.option,.answer,[class*="option"],[class*="choice"],[class*="answer"]'))
      if (n(el.innerText||el.textContent).includes(n(target))) return el;
  }
  if (strategy === 'aria-label') return document.querySelector(`[aria-label*="${target}"]`);
  return null;
}

function byText(text) {
  if (!text) return null;
  const t = n(text);
  for (const r of document.querySelectorAll('input[type="radio"]')) {
    if (r.labels?.[0] && n(r.labels[0].innerText).includes(t)) return r;
    if (n(r.value).includes(t)) return r;
  }
  for (const el of document.querySelectorAll('button,[role="radio"],[role="option"],[role="checkbox"],.option,.choice,[class*="option"],[class*="choice"],[class*="answer"]')) {
    const et = n(el.innerText||el.textContent||'');
    if (et && et.length < 300 && (et.includes(t) || t.includes(et))) return el;
  }
  return null;
}

function fuzzy(text) {
  if (!text) return null;
  const words = n(text).split(' ').filter(w => w.length > 3);
  if (!words.length) return null;
  let best = null, bestScore = 0;
  for (const el of document.querySelectorAll('label,button,[role="radio"],[role="option"],li,.option,.choice,[class*="option"],[class*="choice"]')) {
    const et = n(el.innerText||el.textContent||'');
    if (!et || et.length > 400) continue;
    const score = words.filter(w => et.includes(w)).length / words.length;
    if (score > 0.6 && score > bestScore) { bestScore = score; best = el; }
  }
  return best;
}

// ── Nav button finder ─────────────────────────────────────────────────────────
function findBtn(patterns) {
  const els = [
    ...document.querySelectorAll('button'),
    ...document.querySelectorAll('input[type="submit"],input[type="button"]'),
    ...document.querySelectorAll('[role="button"]'),
    ...document.querySelectorAll('a'),
  ];
  for (const el of els) {
    const t = (el.innerText||el.value||el.textContent||'').trim();
    if (!t || t.length > 60) continue;
    if (patterns.some(p => p.test(t))) return el;
  }
  return null;
}

// ── Done detection ────────────────────────────────────────────────────────────
function isDone() {
  const text = document.body.innerText || '';
  return DONE_PAGE.some(p => p.test(text)) && !document.querySelector('input[type="radio"]');
}

// ── Page extractor ────────────────────────────────────────────────────────────
function extractPage() {
  const bodyText = document.body.innerText || '';
  const elems = [];
  document.querySelectorAll('input[type="radio"],input[type="checkbox"]').forEach(el => {
    const label = el.labels?.[0]?.innerText || el.getAttribute('aria-label') || el.value || '';
    const isMulti = el.type === 'checkbox';
    elems.push(`[${isMulti ? 'CHECKBOX' : 'RADIO'}] name="${el.name}" id="${el.id}" value="${el.value}" label="${label}"`);
  });
  document.querySelectorAll('button,[role="radio"],[role="checkbox"],[role="option"]').forEach(el => {
    const t = el.innerText?.trim();
    if (t) elems.push(`[BUTTON] text="${t}"`);
  });
  document.querySelectorAll('label').forEach(el => {
    const t = el.innerText?.trim();
    if (t) elems.push(`[LABEL] for="${el.getAttribute('for')||''}" text="${t}"`);
  });
  return { text: bodyText.substring(0, 15000), compactHTML: elems.join('\n').substring(0, 5000) };
}

// ── Ask AI ────────────────────────────────────────────────────────────────────
async function askAI(config, pageData) {
  const r = await chrome.runtime.sendMessage({
    type: 'SOLVE_MCQS',
    payload: {
      provider: config.provider, model: config.model, apiKey: config.apiKey,
      pageText: pageData.text, pageHTML: pageData.compactHTML,
      url: location.href, title: document.title,
    },
  });
  if (!r.success) throw new Error(r.error || 'AI call failed');
  return r.questions;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function simulateClick(el) {
  ['mousedown','mouseup','click'].forEach(t => el.dispatchEvent(new MouseEvent(t, { bubbles:true, cancelable:true })));
  if (el.type === 'radio' || el.type === 'checkbox') {
    el.checked = true;
    ['change','input'].forEach(t => el.dispatchEvent(new Event(t, { bubbles:true })));
  }
  if (el.click) el.click();
}

function applyHighlight(el, q) {
  el.style.cssText += 'outline:2px solid #a855f7!important;outline-offset:2px;border-radius:4px;';
}

function showBanner(msg, color) {
  chrome.storage.local.get('optStealth').then(({ optStealth }) => {
    if (optStealth) return; // stealth = no banner
    const colors = { green:'#22c55e', red:'#ef4444', yellow:'#eab308' };
    const div = document.createElement('div');
    div.className = '__mcq_overlay__';
    div.style.cssText = `position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#111;border:1px solid ${colors[color]||colors.green};color:${colors[color]||colors.green};padding:10px 20px;border-radius:8px;font-family:monospace;font-size:12px;font-weight:600;z-index:2147483647;box-shadow:0 4px 20px rgba(0,0,0,0.6);pointer-events:none;`;
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(() => { div.style.opacity='0'; div.style.transition='opacity 0.5s'; setTimeout(() => div.remove(), 500); }, 5000);
  });
}

function friendlyError(msg) {
  if (!msg) return 'Unknown error';
  if (msg.includes('invalid x-api-key') || msg.includes('401')) return 'Invalid API key — check Settings';
  if (msg.includes('429') || msg.includes('rate_limit'))         return 'Rate limit hit — slow down';
  if (msg.includes('insufficient_quota') || msg.includes('402')) return 'Out of credits / tokens';
  if (msg.includes('503') || msg.includes('overloaded'))         return 'AI service overloaded — retry';
  if (msg.includes('network') || msg.includes('fetch'))          return 'Network error — check connection';
  return msg.substring(0, 60);
}

async function getOpts() {
  const s = await chrome.storage.local.get(['optHighlight','optDialog','optStealth']);
  return { highlight: s.optHighlight !== false, dialog: s.optDialog !== false, stealth: !!s.optStealth };
}

function n(t) { return String(t||'').toLowerCase().replace(/\s+/g,' ').replace(/[^\w\s]/g,'').trim(); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function setStatus(s) { await chrome.storage.local.set({ loopStatus: s }); }
async function log(msg, type='info') {
  const { loopLog=[] } = await chrome.storage.local.get('loopLog');
  loopLog.push({ msg, type });
  if (loopLog.length > 50) loopLog.shift();
  await chrome.storage.local.set({ loopLog });

  // Show on-page dialog if enabled
  const { optDialog, optStealth } = await chrome.storage.local.get(['optDialog','optStealth']);
  if (optDialog !== false && !optStealth) showToast(msg, type);
}

// Small in-page toast (respects dialog toggle)
let toastBox = null;
function showToast(msg, type) {
  if (!toastBox) {
    toastBox = document.createElement('div');
    toastBox.className = '__mcq_overlay__';
    toastBox.style.cssText = 'position:fixed;bottom:16px;right:16px;background:#111;border:1px solid #222;border-radius:8px;padding:8px 12px;font-family:monospace;font-size:11px;z-index:2147483647;max-width:280px;display:flex;flex-direction:column;gap:4px;box-shadow:0 4px 16px rgba(0,0,0,0.5);';
    document.body.appendChild(toastBox);
  }
  const colors = { ok:'#22c55e', err:'#ef4444', warn:'#eab308', info:'#666' };
  const line = document.createElement('div');
  line.style.cssText = `color:${colors[type]||colors.info};line-height:1.4;`;
  line.textContent = msg;
  toastBox.appendChild(line);
  // Auto-remove after 6s
  setTimeout(() => { line.remove(); if (!toastBox.children.length) { toastBox.remove(); toastBox = null; } }, 6000);
}
