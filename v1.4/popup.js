// popup.js — v1.3 (Snipping extension style, solve once)
const $=id=>document.getElementById(id);
const PROVIDER_META={groq:{label:'Groq API Key',placeholder:'gsk_…'},openai:{label:'OpenAI API Key',placeholder:'sk-…'},anthropic:{label:'Anthropic API Key',placeholder:'sk-ant-…'},gemini:{label:'Gemini API Key',placeholder:'AIza…'}};
const PROVIDER_MODELS={groq:'llama-3.3-70b-versatile',openai:'gpt-4o-mini',anthropic:'claude-haiku-4-5-20251001',gemini:'gemini-2.0-flash'};
document.addEventListener('DOMContentLoaded',async()=>{
  const s=await chrome.storage.local.get(['provider','apiKey']);
  if(s.provider)$('providerSelect').value=s.provider;
  updateProviderUI($('providerSelect').value);
  if(s.apiKey)$('apiKey').value=s.apiKey;
  bindEvents();
});
function updateProviderUI(p){$('keyLabel').textContent=PROVIDER_META[p].label;$('apiKey').placeholder=PROVIDER_META[p].placeholder;}
function bindEvents(){
  $('providerSelect').addEventListener('change',()=>{updateProviderUI($('providerSelect').value);$('apiKey').value='';});
  $('eyeBtn').addEventListener('click',()=>{const i=$('apiKey');if(i.type==='password'){i.type='text';$('eyeBtn').textContent='🙈';}else{i.type='password';$('eyeBtn').textContent='👁';}});
  $('saveBtn').addEventListener('click',async()=>{const p=$('providerSelect').value;const k=$('apiKey').value.trim();if(!k){addLog('⚠ Paste your API key first','error');return;}await chrome.storage.local.set({provider:p,apiKey:k});addLog(`✓ ${PROVIDER_META[p].label} saved!`,'success');});
  $('solveBtn').addEventListener('click',solve);
}
async function solve(){
  const s=await chrome.storage.local.get(['provider','apiKey']);
  if(!s.apiKey){addLog('⚠ Save your API key first','error');return;}
  const btn=$('solveBtn');btn.disabled=true;btn.classList.add('loading');
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    const [{result:pageData}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:extractPage});
    addLog('Asking AI…','info');
    const r=await chrome.runtime.sendMessage({type:'SOLVE_MCQS',payload:{provider:s.provider||'groq',model:PROVIDER_MODELS[s.provider||'groq'],apiKey:s.apiKey,pageText:pageData.text,pageHTML:pageData.compactHTML,url:tab.url,title:tab.title}});
    if(!r.success)throw new Error(r.error);
    addLog(`Found ${r.questions.length} MCQ(s)`,'success');
    if(!r.questions.length){addLog('No MCQs detected','error');return;}
    const cr=await chrome.tabs.sendMessage(tab.id,{type:'CLICK_ANSWERS',questions:r.questions,autoClick:true,highlight:true});
    if(cr?.results)addLog(`Done! ${cr.results.filter(x=>x.status==='clicked').length}/${r.questions.length} clicked ✓`,'success');
  }catch(e){addLog(`Error: ${e.message}`,'error');}
  finally{btn.disabled=false;btn.classList.remove('loading');btn.querySelector('.btn-text').textContent='⚡ Solve This Page';}
}
function addLog(msg,type=''){const log=$('log');log.classList.add('visible');const s=document.createElement('span');s.className=`log-line ${type}`;s.textContent=`> ${msg}`;log.appendChild(s);log.appendChild(document.createElement('br'));log.scrollTop=log.scrollHeight;}
function extractPage(){const b=document.body.innerText||'';const e=[];document.querySelectorAll('input[type="radio"],input[type="checkbox"]').forEach(el=>{const l=el.labels?.[0]?.innerText||el.value||'';e.push(`[INPUT] name="${el.name}" value="${el.value}" label="${l}"`);});document.querySelectorAll('label').forEach(el=>{const t=el.innerText?.trim();if(t)e.push(`[LABEL] for="${el.getAttribute('for')||''}" text="${t}"`);});return{text:b.substring(0,15000),compactHTML:e.join('\n').substring(0,5000)};}
