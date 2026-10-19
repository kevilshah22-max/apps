import { formatMoney, splitBill, toCents } from './core.mjs';
const KEY='nexa-forge-tabtally-v1', currencies=['GBP','USD','EUR','INR','CAD','AUD'];
const fresh=()=>({people:[{id:'person-you',name:'You'}],items:[],taxPercent:0,tipPercent:10,currency:'GBP'});
let state=fresh(), blocked=false, unavailable=false, rawBackup=null, timer;
const $=s=>document.querySelector(s);
const peopleList=$('#people-list'), itemList=$('#item-list'), choices=$('#participant-choices');
function id(prefix){return prefix+'-'+(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(16).slice(2));}
function valid(v){
 if(!v||!Array.isArray(v.people)||!v.people.length||!Array.isArray(v.items))return false;
 if(v.people.some(p=>!p||typeof p.id!=='string'||typeof p.name!=='string'||!p.name.trim()))return false;
 if(v.items.some(i=>!i||typeof i.id!=='string'||typeof i.name!=='string'||!Number.isSafeInteger(i.amountCents)||i.amountCents<0||!Array.isArray(i.participantIds)))return false;
 if(!Number.isFinite(Number(v.taxPercent))||v.taxPercent<0||v.taxPercent>100||!Number.isFinite(Number(v.tipPercent))||v.tipPercent<0||v.tipPercent>100||!currencies.includes(v.currency))return false;
 const ids=new Set(v.people.map(p=>p.id));return v.items.every(i=>i.participantIds.some(x=>ids.has(x)));
}
function load(){
 try{const raw=localStorage.getItem(KEY);if(!raw)return;try{const v=JSON.parse(raw);if(!valid(v))throw Error('invalid');state=v;}catch{blocked=true;rawBackup=raw;}}
 catch{unavailable=true;}
}
function save(){
 if(blocked)return;
 try{localStorage.setItem(KEY,JSON.stringify(state));unavailable=false;}catch{unavailable=true;}
 storageStatus();
}
function storageStatus(){
 $('#storage-notice').hidden=!blocked;$('#storage-failure').hidden=!unavailable||blocked;$('#reset-bill').disabled=blocked;
 if(blocked)$('#storage-message').textContent='Saved data could not be read. It is protected from automatic replacement. Download the original before choosing to start fresh.';
 const status=$('#app-status');
 status.textContent=blocked?'Saved data protected · recovery needed':unavailable?'Session only · browser storage unavailable':'Saved on this device';
 status.classList.toggle('warning-text',blocked||unavailable);
}
function toast(message,error=false){const n=$('#toast');n.textContent=message;n.classList.toggle('error',error);n.hidden=false;clearTimeout(timer);timer=setTimeout(()=>n.hidden=true,3000);}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function renderPeople(){
 peopleList.replaceChildren();state.people.forEach(p=>{const row=el('li','person-row'),rm=el('button','icon-button','Remove');rm.type='button';rm.dataset.removePerson=p.id;rm.setAttribute('aria-label','Remove '+p.name);rm.disabled=state.people.length<2;row.append(el('span','person-name',p.name),rm);peopleList.append(row);});
}
function renderChoices(){
 choices.replaceChildren();state.people.forEach(p=>{const label=el('label','check-chip'),box=el('input');box.type='checkbox';box.name='item-participant';box.value=p.id;box.checked=true;label.append(box,el('span','',p.name));choices.append(label);});
}
function renderItems(){
 itemList.replaceChildren();$('#empty-items').hidden=state.items.length>0;
 state.items.forEach(i=>{const row=el('article','item-row'),main=el('div','item-main'),names=state.people.filter(p=>i.participantIds.includes(p.id)).map(p=>p.name),rm=el('button','icon-button danger','Delete');main.append(el('strong','',i.name),el('small','','Split between '+names.join(', ')));rm.type='button';rm.dataset.removeItem=i.id;rm.setAttribute('aria-label','Delete '+i.name);row.append(main,el('span','item-amount',formatMoney(i.amountCents,state.currency)),rm);itemList.append(row);});
}
function renderSummary(){
 const r=splitBill(state);$('#subtotal').textContent=formatMoney(r.subtotalCents,state.currency);$('#tax-total').textContent=formatMoney(r.taxCents,state.currency);$('#tip-total').textContent=formatMoney(r.tipCents,state.currency);$('#grand-total').textContent=formatMoney(r.totalCents,state.currency);$('#tax-label').textContent='Tax ('+state.taxPercent+'%)';$('#tip-label').textContent='Tip ('+state.tipPercent+'%)';$('#people-count').textContent=state.people.length;$('#items-count').textContent=state.items.length;
 const list=$('#share-list');list.replaceChildren();r.people.forEach(p=>{const row=el('article','share-row'),info=el('div','share-person');info.append(el('strong','',p.name),el('small','','Items '+formatMoney(p.baseCents,state.currency)+' · tax '+formatMoney(p.taxCents,state.currency)+' · tip '+formatMoney(p.tipCents,state.currency)));row.append(info,el('strong','share-total',formatMoney(p.totalCents,state.currency)));list.append(row);});
}
function render(){
 renderPeople();renderChoices();renderItems();$('#tax-percent').value=state.taxPercent;$('#tip-percent').value=state.tipPercent;$('#currency').value=state.currency;$('#currency-symbol').textContent=({GBP:'£',USD:'$',EUR:'€',INR:'₹',CAD:'CA$',AUD:'A$'})[state.currency];renderSummary();storageStatus();
}
function changed(message){save();render();if(message)toast(message);}
function download(name,data,type){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const csvCell=v=>'"'+String(v).replace(/"/g,'""')+'"';
$('#person-form').addEventListener('submit',e=>{e.preventDefault();const input=$('#person-name'),name=input.value.trim();if(!name)return;if(state.people.some(p=>p.name.toLowerCase()===name.toLowerCase()))return toast('That person is already on this bill.',true);state.people.push({id:id('person'),name});input.value='';changed('Person added.');});
$('#item-form').addEventListener('submit',e=>{e.preventDefault();const name=$('#item-name').value.trim(),ids=[...choices.querySelectorAll('input:checked')].map(n=>n.value);if(!name)return toast('Give the item a short name.',true);if(!ids.length)return toast('Choose at least one person for this item.',true);let cents;try{cents=toCents($('#item-amount').value);}catch(err){return toast(err.message,true);}if(cents<=0)return toast('Item amount must be greater than zero.',true);state.items.push({id:id('item'),name,amountCents:cents,participantIds:ids});$('#item-name').value='';$('#item-amount').value='';changed('Item added to the bill.');});
peopleList.addEventListener('click',e=>{const b=e.target.closest('[data-remove-person]');if(!b||state.people.length<2)return;const p=state.people.find(x=>x.id===b.dataset.removePerson);if(!p||!confirm('Remove '+p.name+'? Items they shared will be reassigned if needed.'))return;state.people=state.people.filter(x=>x.id!==p.id);state.items.forEach(i=>{i.participantIds=i.participantIds.filter(x=>x!==p.id);if(!i.participantIds.length)i.participantIds=[state.people[0].id];});changed('Person removed.');});
itemList.addEventListener('click',e=>{const b=e.target.closest('[data-remove-item]');if(!b)return;state.items=state.items.filter(i=>i.id!==b.dataset.removeItem);changed('Item removed.');});
['tax','tip'].forEach(kind=>$('#'+kind+'-percent').addEventListener('change',e=>{const v=Number(e.target.value),key=kind+'Percent';if(!Number.isFinite(v)||v<0||v>100){e.target.value=state[key];return toast(kind.toUpperCase()+' must be between 0 and 100%.',true);}state[key]=v;changed();}));
$('#currency').addEventListener('change',e=>{if(currencies.includes(e.target.value)){state.currency=e.target.value;changed();}});
$('#export-csv').addEventListener('click',()=>{const r=splitBill(state),rows=[['TabTally settlement'],['Currency',state.currency],['Subtotal',(r.subtotalCents/100).toFixed(2)],['Tax ('+state.taxPercent+'%)',(r.taxCents/100).toFixed(2)],['Tip ('+state.tipPercent+'%)',(r.tipCents/100).toFixed(2)],['Grand total',(r.totalCents/100).toFixed(2)],[],['Person','Items','Tax','Tip','Total'],...r.people.map(p=>[p.name,(p.baseCents/100).toFixed(2),(p.taxCents/100).toFixed(2),(p.tipCents/100).toFixed(2),(p.totalCents/100).toFixed(2)])];download('tabtally-settlement.csv',rows.map(row=>row.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');});
$('#export-json').addEventListener('click',()=>download('tabtally-backup.json',JSON.stringify(state,null,2),'application/json;charset=utf-8'));
$('#download-unreadable').addEventListener('click',()=>{if(rawBackup!==null)download('tabtally-unreadable-backup.txt',rawBackup,'text/plain;charset=utf-8');});
$('#start-fresh').addEventListener('click',()=>{if(!confirm('Discard the unreadable saved data and start fresh? Download the original first if needed.'))return;state=fresh();blocked=false;rawBackup=null;try{localStorage.removeItem(KEY);}catch{unavailable=true;}save();render();toast('A fresh bill is ready.');});
$('#retry-save').addEventListener('click',()=>{try{localStorage.setItem(KEY,JSON.stringify(state));unavailable=false;storageStatus();toast('Saved successfully on this device.');}catch{unavailable=true;storageStatus();toast('Browser storage is still unavailable.',true);}});
$('#reset-bill').addEventListener('click',()=>{if(blocked)return;if(!confirm('Clear this bill and start over? Export a backup first if you may need it.'))return;state=fresh();try{localStorage.removeItem(KEY);}catch{unavailable=true;}changed('New bill started.');});
load();render();
