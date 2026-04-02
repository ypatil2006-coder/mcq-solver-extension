// popup.js

const $ = id => document.getElementById(id);

const PROVIDER_META = {
  groq:      { label: 'Groq API Key',     placeholder: 'gsk_…' },
  openai:    { label: 'OpenAI API Key',    placeholder: 'sk-…' },
  anthropic: { label: 'Anthropic API Key', placeholder: 'sk-ant-…' },
  gemini:    { label: 'Gemini API Key',    placeholder: 'AIza…' },
};

const PROVIDER_MODELS = {
  groq:      'llama-3.3-70b-versatile',
  openai:    'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
  gemini:    'gemini-2.0-flash',
};

let poller = null;

document.addEventListener('DOMContentLoaded', async () => {
  const s = await chrome.storage.local.get([
    'provider', 'apiKey',
    'loopRunning', 'loopAnswered', 'loopPages', 'loopLog', 'loopStatus',
    'optHighlight', 'optDialog', 'optStealth'
  ]);

  // Restore settings UI
  if (s.provider) $('providerSelect').value = s.provider;
  updateProviderUI($('providerSelect').value);
  if (s.apiKey) $('apiKey').value = s.apiKey;

  setToggle('tHighlight', s.optHighlight !== false);
  setToggle('tDialog',    s.optDialog    !== false);
  setToggle('tStealth',   s.optStealth   === true);

  // Sync loop UI
  syncLoop(s);
  startPolling();
  bindEvents();
});

// ── UI helpers ────────────────────────────────────────────────────────────────

function setToggle(id, val) { $(id).classList.toggle('on', !!val); }

function updateProviderUI(p) {
  $('keyLabel').textContent = PROVIDER_META[p].label;
  $('apiKey').placeholder   = PROVIDER_META[p].placeholder;
}

function syncLoop(s) {
  const running = !!s.loopRunning;
  const loopBtn = $('loopBtn');
  loopBtn.classList.toggle('running', running);
  loopBtn.classList.remove('loading');
  $('loopBtnText').textContent = running ? '⏹ Stop Loop' : '▶ Start Auto Loop';

  const dot = $('statusDot');
  dot.className = 'dot ' + (running ? 'active' : (s.loopStatus?.includes('✓') ? 'done' : 'idle'));
  $('statusText').textContent = s.loopStatus || 'Ready';

  if (s.loopAnswered !== undefined) $('answeredNum').textContent = s.loopAnswered;
  if (s.loopPages    !== undefined) $('pagesNum').textContent    = s.loopPages;

  if (s.loopLog?.length) renderLog(s.loopLog);
}

function renderLog(lines) {
  const box = $('msgBox');
  box.innerHTML = '';
  lines.slice(-15).forEach(({ msg, type }) => {
    const div = document.createElement('div');
    div.className = `msg-line ${type || 'info'}`;
    div.innerHTML = `<span class="msg-icon"></span><span class="msg-text">${escHtml(msg)}</span>`;
    box.appendChild(div);
  });
  box.classList.toggle('has-msgs', lines.length > 0);
  box.scrollTop = box.scrollHeight;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function addLocalMsg(msg, type) {
  const box = $('msgBox');
  box.classList.add('has-msgs');
  const div = document.createElement('div');
  div.className = `msg-line ${type}`;
  div.innerHTML = `<span class="msg-icon"></span><span class="msg-text">${escHtml(msg)}</span>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// ── Polling ───────────────────────────────────────────────────────────────────

function startPolling() {
  if (poller) clearInterval(poller);
  poller = setInterval(async () => {
    const s = await chrome.storage.local.get([
      'loopRunning','loopAnswered','loopPages','loopLog','loopStatus','loopLastType'
    ]);
    syncLoop(s);
    if (s.loopLastType) $('typeNum').textContent = s.loopLastType;
  }, 500);
}

// ── Events ────────────────────────────────────────────────────────────────────

function bindEvents() {
  // Settings panel
  $('openSettings').addEventListener('click', () => {
    $('main').style.display = 'none';
    $('settings').style.display = 'flex';
  });
  $('closeSettings').addEventListener('click', () => {
    $('settings').style.display = 'none';
    $('main').style.display = 'flex';
  });

  // Provider swap
  $('providerSelect').addEventListener('change', () => {
    updateProviderUI($('providerSelect').value);
    $('apiKey').value = '';
  });

  // Eye toggle
  $('eyeBtn').addEventListener('click', () => {
    const inp = $('apiKey');
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    $('eyeBtn').textContent = show ? '🙈' : '👁';
  });

  // Save settings
  $('saveBtn').addEventListener('click', async () => {
    const provider = $('providerSelect').value;
    const key = $('apiKey').value.trim();
    if (!key) { addLocalMsg('Paste your API key first', 'err'); return; }
    await chrome.storage.local.set({ provider, apiKey: key });
    addLocalMsg(`${PROVIDER_META[provider].label} saved ✓`, 'ok');
  });

  // Toggles
  const toggleMap = {
    tHighlight: 'optHighlight',
    tDialog:    'optDialog',
    tStealth:   'optStealth',
  };
  Object.entries(toggleMap).forEach(([elId, storeKey]) => {
    $(elId).addEventListener('click', async () => {
      const nowOn = !$(elId).classList.contains('on');
      setToggle(elId, nowOn);
      await chrome.storage.local.set({ [storeKey]: nowOn });
      // Notify active tab of stealth change
      if (storeKey === 'optStealth') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) chrome.tabs.sendMessage(tab.id, { type: 'SET_STEALTH', value: nowOn }).catch(() => {});
      }
    });
  });

  // Loop toggle
  $('loopBtn').addEventListener('click', async () => {
    const { loopRunning } = await chrome.storage.local.get('loopRunning');
    if (loopRunning) {
      await chrome.storage.local.set({ loopRunning: false, loopStatus: '⏹ Stopped' });
      addLocalMsg('Loop stopped', 'warn');
      syncLoop({ loopRunning: false, loopStatus: '⏹ Stopped' });
    } else {
      await startLoop();
    }
  });

  // Solve once
  $('onceBtn').addEventListener('click', async () => {
    const cfg = await getConfig(); if (!cfg) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    addLocalMsg('Solving current page…', 'info');
    chrome.tabs.sendMessage(tab.id, { type: 'RUN_ONCE', config: cfg }).catch(e => addLocalMsg(e.message, 'err'));
  });
}

async function getConfig() {
  const { provider, apiKey } = await chrome.storage.local.get(['provider', 'apiKey']);
  if (!apiKey) {
    addLocalMsg('No API key saved — open Settings', 'err');
    return null;
  }
  const p = provider || 'groq';
  return { provider: p, model: PROVIDER_MODELS[p], apiKey };
}

async function startLoop() {
  const cfg = await getConfig(); if (!cfg) return;

  await chrome.storage.local.set({
    loopRunning: true,
    loopStatus: 'Starting…',
    loopAnswered: 0,
    loopPages: 0,
    loopLog: [],
    loopConfig: cfg,
  });
  syncLoop({ loopRunning: true, loopStatus: 'Starting…' });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) { addLocalMsg('No active tab found', 'err'); return; }

  chrome.tabs.sendMessage(tab.id, { type: 'START_LOOP', config: cfg })
    .catch(e => addLocalMsg(`Error: ${e.message}`, 'err'));

  addLocalMsg('Auto loop started ▶', 'ok');
}
