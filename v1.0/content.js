// content.js — v1.0/v1.1/v1.2

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CLICK_ANSWERS') {
    const results = processAnswers(message.questions, message.autoClick !== false, message.highlight !== false);
    sendResponse({ results });
  }
  return true;
});

function processAnswers(questions, autoClick, highlight) {
  return questions.map(q => {
    const el = findAnswer(q);
    if (el) {
      if (highlight) applyHighlight(el, q);
      if (autoClick) { el.scrollIntoView({ behavior:'smooth', block:'center' }); setTimeout(() => simulateClick(el), 300); }
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
  if (strategy==='radio-value') return document.querySelector(`input[type="radio"][value="${CSS.escape(target)}"]`);
  if (strategy==='radio-label') {
    for (const lbl of document.querySelectorAll('label')) {
      if (n(lbl.innerText).includes(n(target))) {
        if (lbl.htmlFor) { const el=document.getElementById(lbl.htmlFor); if(el) return el; }
        return lbl.querySelector('input')||lbl;
      }
    }
  }
  if (strategy==='button-text') {
    for (const el of document.querySelectorAll('button,[role="button"],[role="option"],[role="radio"]'))
      if (n(el.innerText||el.textContent).includes(n(target))) return el;
  }
  if (strategy==='label-text') {
    for (const el of document.querySelectorAll('label,li,.option,.answer,[class*="option"],[class*="choice"],[class*="answer"]'))
      if (n(el.innerText||el.textContent).includes(n(target))) return el;
  }
  if (strategy==='aria-label') return document.querySelector(`[aria-label*="${target}"]`);
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
    if (et && et.length<300 && (et.includes(t)||t.includes(et))) return el;
  }
  return null;
}

function fuzzy(text) {
  if (!text) return null;
  const words = n(text).split(' ').filter(w=>w.length>3);
  if (!words.length) return null;
  let best=null, bestScore=0;
  for (const el of document.querySelectorAll('label,button,[role="radio"],[role="option"],li,.option,.choice,[class*="option"],[class*="choice"]')) {
    const et = n(el.innerText||el.textContent||'');
    if (!et||et.length>400) continue;
    const score = words.filter(w=>et.includes(w)).length/words.length;
    if (score>0.6&&score>bestScore) { bestScore=score; best=el; }
  }
  return best;
}

function simulateClick(el) {
  ['mousedown','mouseup','click'].forEach(t => el.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true})));
  if (el.type==='radio'||el.type==='checkbox') {
    el.checked=true;
    ['change','input'].forEach(t => el.dispatchEvent(new Event(t,{bubbles:true})));
  }
  if (el.click) el.click();
}

function applyHighlight(el, q) {
  el.style.outline='3px solid #a855f7';
  el.style.outlineOffset='2px';
  el.style.borderRadius='4px';
  el.style.boxShadow='0 0 12px rgba(168,85,247,0.6)';
  el.style.backgroundColor='rgba(168,85,247,0.1)';
  const badge=document.createElement('div');
  badge.style.cssText='position:fixed;background:linear-gradient(135deg,#7c3aed,#a855f7);color:white;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:bold;font-family:monospace;z-index:999999;pointer-events:none;box-shadow:0 2px 12px rgba(124,58,237,0.5);white-space:nowrap;';
  badge.textContent=`✓ AI Answer: ${q.answerKey}`;
  document.body.appendChild(badge);
  const rect=el.getBoundingClientRect();
  badge.style.left=`${Math.min(rect.left+window.scrollX,window.innerWidth-250)}px`;
  badge.style.top=`${Math.max(rect.top+window.scrollY-36,8)}px`;
  setTimeout(()=>{badge.style.opacity='0';badge.style.transition='opacity 0.5s';setTimeout(()=>badge.remove(),500);},5000);
}

function n(t){ return String(t||'').toLowerCase().replace(/\s+/g,' ').replace(/[^\w\s]/g,'').trim(); }
