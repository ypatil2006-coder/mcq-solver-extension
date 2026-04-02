// popup.js — v1.1/v1.2 (Multi-provider tab switcher)
const $ = id => document.getElementById(id);
const PROVIDERS = {
  anthropic:{name:'Claude',placeholder:'sk-ant-…',models:[{id:'claude-haiku-4-5-20251001',label:'Claude Haiku'},{id:'claude-sonnet-4-5',label:'Claude Sonnet'}]},
  openai:{name:'OpenAI',placeholder:'sk-…',models:[{id:'gpt-4o-mini',label:'GPT-4o Mini'},{id:'gpt-4o',label:'GPT-4o'}]},
  gemini:{name:'Gemini',placeholder:'AIza…',models:[{id:'gemini-2.0-flash',label:'Gemini 2.0 Flash'},{id:'gemini-1.5-pro',label:'Gemini 1.5 Pro'}]},
  groq:{name:'Groq',placeholder:'gsk_…',models:[{id:'llama-3.3-70b-versatile',label:'Llama 3.3 70B'},{id:'llama-3.1-8b-instant',label:'Llama 3.1 8B'}]}
};
const PROVIDER_MODELS={anthropic:'claude-haiku-4-5-20251001',openai:'gpt-4o-mini',gemini:'gemini-2.0-flash',groq:'llama-3.3-70b-versatile'};
let currentProvider='anthropic';
document.addEventListener('DOMContentLoaded',async()=>{
  const s=await chrome.storage.local.get(['selectedProvider','apiKey']);
  if(s.selectedProvider) currentProvider=s.selectedProvider;
  setActiveProvider(currentProvider);
  if(s.apiKey) $('apiKey').value=s.apiKey;
  bindEvents();
});
function setActiveProvider(p){
  currentProvider=p;
  document.querySelectorAll('.provider-tab').forEach(t=>t.classList.toggle('active',t.dataset.provider===p));
  $('apiKey').placeholder=PROVIDERS[p].placeholder;
  $('apiKey').value='';
  const sel=$('modelSelect'); sel.innerHTML='';
  PROVIDERS[p].models.forEach(m=>{const o=document.createElement('option');o.value=m.id;o.textContent=m.label;sel.appendChild(o);});
}
function bindEvents(){
  document.querySelectorAll('.provider-tab').forEach(tab=>{
    tab.addEventListener('click',()=>{setActiveProvider(tab.dataset.provider);chrome.storage.local.set({selectedProvider:tab.dataset.provider});});
  });
  $('saveKey').addEventListener('click',async()=>{
    const key=$('apiKey').value.trim(); if(!key) return;
    await chrome.storage.local.set({[`apiKey_${currentProvider}`]:key,apiKey:key});
    addLog(`${PROVIDERS[currentProvider].name} key saved ✓`,'success');$('results').classList.add('visible');
  });
  $('solveBtn').addEventListener('click',solve);
  $('clearBtn').addEventListener('click',()=>{$('results').classList.remove('visible');$('questionList').innerHTML='';$('log').innerHTML='';});
}
async function solve(){
  const s=await chrome.storage.local.get([`apiKey_${currentProvider}`,'apiKey']);
  const apiKey=s[`apiKey_${currentProvider}`]||s.apiKey;
  if(!apiKey){addLog('⚠ Save API key first','error');$('results').classList.add('visible');return;}
  const btn=$('solveBtn');btn.disabled=true;btn.classList.add('loading');
  $('results').classList.add('visible');$('questionList').innerHTML='';
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    const [{result:pageData}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:extractPage});
    addLog(`Asking ${PROVIDERS[currentProvider].name}…`,'info');
    const r=await chrome.runtime.sendMessage({type:'SOLVE_MCQS',payload:{provider:currentProvider,model:$('modelSelect').value,apiKey,pageText:pageData.text,pageHTML:pageData.compactHTML,url:tab.url,title:tab.title}});
    if(!r.success) throw new Error(r.error);
    $('resultsCount').textContent=`${r.questions.length} found`;
    r.questions.forEach(q=>{const d=document.createElement('div');d.className='q-item';d.innerHTML=`<div class="q-text">${q.question.substring(0,100)}</div><div class="q-answer"><span class="answer-tag">${q.answerKey}</span><span class="answer-text">${(q.answerText||'').substring(0,40)}</span></div>`;$('questionList').appendChild(d);});
    if(!r.questions.length){addLog('No MCQs found','error');return;}
    const cr=await chrome.tabs.sendMessage(tab.id,{type:'CLICK_ANSWERS',questions:r.questions,autoClick:true,highlight:true});
    if(cr?.results) addLog(`Done! ${cr.results.filter(x=>x.status==='clicked').length}/${r.questions.length} clicked`,'success');
  }catch(e){addLog(`Error: ${e.message}`,'error');}
  finally{btn.disabled=false;btn.classList.remove('loading');}
}
function addLog(msg,type=''){$('results').classList.add('visible');const log=$('log');const s=document.createElement('span');s.className=`log-line ${type}`;s.textContent=`> ${msg}`;log.appendChild(s);log.appendChild(document.createElement('br'));log.scrollTop=log.scrollHeight;}
function extractPage(){const b=document.body.innerText||'';const e=[];document.querySelectorAll('input[type="radio"],input[type="checkbox"]').forEach(el=>{const l=el.labels?.[0]?.innerText||el.value||'';e.push(`[INPUT] name="${el.name}" value="${el.value}" label="${l}"`);});document.querySelectorAll('label').forEach(el=>{const t=el.innerText?.trim();if(t)e.push(`[LABEL] for="${el.getAttribute('for')||''}" text="${t}"`);});return{text:b.substring(0,15000),compactHTML:e.join('\n').substring(0,5000)};}
