
'use strict';
const DATA_KEY='jarvis_ipad_arc_full_v3'; // preserve existing iPad browser data
const ALFRED_SNAPSHOT={people:[],tasks:[]};
const PIN_KEY='jarvis_ipad_arc_pin_v2';
const RECOVERY_KEY='jarvis_ipad_arc_recovery_v2';
const $=id=>document.getElementById(id);
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const uid=()=>Date.now()+Math.floor(Math.random()*100000);
const goalTemplate=[
 ['SHE-Q','SHE-Q training on time','100%','Individual'],
 ['SHE-Q','SHE meeting attendance','1+','Individual'],
 ['SHE-Q','Monthly Operator Gemba participation','Monthly','Individual'],
 ['SHE-Q','LSSW compliance','90%','Individual'],
 ['SHE-Q','Q Check completion','97%','Shift'],
 ['SHE-Q','Quarantine control plan / response','Zero outside plan; within 4 hours','Individual'],
 ['Engagement','Redzone comments','100+','Individual'],
 ['Engagement','SWPs created or reviewed','2+','Individual'],
 ['Engagement','Operational support contributions','Evidence','Individual'],
 ['Lean','5S compliance','97%','Shift'],
 ['Lean','Centerline compliance','97%','Shift'],
 ['Lean','CIL compliance','97%','Shift'],
 ['Lean','RIP meeting attendance','1+','Individual'],
 ['Lean','Problem-solving / Kaizen / loss events','2+','Individual'],
 ['Lean','Redzone improvement actions','12+','Individual'],
 ['Capability','Training plan progress or teammate mentoring','Choose one','Individual']
];
function makeGoals(){return goalTemplate.map((g,i)=>({id:i+1,category:g[0],expectation:g[1],target:g[2],scope:g[3],status:'Not assessed',evidence:'',notes:'',updated:''}))}
const alfredRoster=[];
function seed(){return JSON.parse(JSON.stringify(ALFRED_SNAPSHOT))}
function loadAlfredRoster(){alert("Use Restore Backup to import your existing V6 records. The published file intentionally contains no roster.");return;if(!confirm('Replace all current iPad records with the ALFRED workbook snapshot? Export a backup first.'))return;db=seed();save();render();alert('ALFRED snapshot loaded: '+db.people.length+' technicians.');}

let db=seed();
// Upgrade older fictional demo records without deleting them.
for(const p of db.people){p.events=Array.isArray(p.events)?p.events:[];p.coaching=Array.isArray(p.coaching)?p.coaching:[];p.goals=Array.isArray(p.goals)?p.goals:makeGoals();p.discipline=p.discipline||'None'}
function save(){secureSave().catch(e=>alert('Encrypted save failed: '+e.message))}
function getPerson(id){return db.people.find(p=>String(p.id)===String(id))}
function expiry(date){const [y,m,d]=String(date).split('-').map(Number);const x=new Date(y+1,m-1,d);if(m===2&&d===29&&x.getMonth()!==1)return new Date(y+1,1,28);return x}
function isActive(e){const x=expiry(e.date),now=new Date(),t=new Date(now.getFullYear(),now.getMonth(),now.getDate());return Number.isFinite(x.getTime())&&new Date(e.date+'T00:00:00')<=t&&t<x}
function eventPoints(e){if((e.types||[]).every(t=>t==='Present'))return 0;return (e.types||[]).reduce((s,t)=>s+(t==='Unexcused'?2:1),0)}
function points(p){return p.events.filter(isActive).reduce((s,e)=>s+eventPoints(e),0)}
function completedGoals(p){return p.goals.filter(g=>g.status==='Met').length}
function pendingGoals(p){return p.goals.filter(g=>g.status!=='Met').length}
function go(page){document.querySelectorAll('.page').forEach(x=>x.classList.toggle('active',x.id===page));document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.page===page));render()}
document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>go(b.dataset.page));
function render(){const total=db.people.reduce((s,p)=>s+points(p),0),alerts=db.people.filter(p=>points(p)>=6);$('metrics').innerHTML=[['Technicians',db.people.length],['Active Points',total],['6+ Point Alerts',alerts.length],['Open Tasks',db.tasks.filter(t=>!t.done).length]].map(x=>`<div class="card"><div class="small">${x[0]}</div><div class="metric">${x[1]}</div></div>`).join('');$('alerts').innerHTML=alerts.length?alerts.map(p=>`<div class="alert">${escapeHTML(p.name)} · Shift ${escapeHTML(p.shift)} · <strong class="orange">${points(p)} points</strong></div>`).join(''):'<p>No active attendance alerts.</p>';renderSelectors();renderTeam();renderProfile();renderAttendance();renderCoaching();renderGoals();renderTasks()}
function renderSelectors(){for(const id of ['profilePerson','attPerson','coachPerson','goalPerson']){const el=$(id),old=el.value;el.innerHTML=db.people.map(p=>`<option value="${p.id}">${escapeHTML(p.name)} · Shift ${escapeHTML(p.shift)}</option>`).join('');if(db.people.some(p=>String(p.id)===old))el.value=old}}
function renderTeam(){const q=$('search').value.toLowerCase(),f=$('shiftFilter').value;$('roster').innerHTML=db.people.filter(p=>p.name.toLowerCase().includes(q)&&(!f||p.shift===f)).map(p=>`<tr><td>${escapeHTML(p.name)}</td><td>Shift ${escapeHTML(p.shift)}</td><td>${escapeHTML(p.level)}</td><td>${escapeHTML(p.hire)}</td><td class="${points(p)>=6?'orange':''}">${points(p)}</td><td><button class="btn" onclick="openProfile('${p.id}')">Open</button></td></tr>`).join('')}
function openProfile(id){$('profilePerson').value=id;go('profile')}
function renderProfile(){const p=getPerson($('profilePerson').value);if(!p)return;$('profileName').value=p.name;$('profileShift').value=p.shift;$('profileLevel').value=p.level;$('profileHire').value=p.hire;$('profileSummary').innerHTML=`<div class="grid"><div class="item"><div class="small">Attendance Points</div><div class="metric">${points(p)}</div></div><div class="item"><div class="small">Coaching Records</div><div class="metric">${p.coaching.length}</div></div><div class="item"><div class="small">Goals Met</div><div class="metric">${completedGoals(p)}</div></div><div class="item"><div class="small">Discipline</div><h3>${escapeHTML(p.discipline)}</h3></div></div>`;$('profileCoaching').innerHTML=p.coaching.length?[...p.coaching].reverse().slice(0,5).map(c=>`<div class="item"><div class="small">${escapeHTML(c.date)}</div>${escapeHTML(c.note)}</div>`).join(''):'<p>No coaching records.</p>'}
function saveProfile(){const p=getPerson($('profilePerson').value);if(!p)return;const name=$('profileName').value.trim();if(!name)return alert('Enter a name.');p.name=name;p.shift=$('profileShift').value;p.level=Number($('profileLevel').value)||1;p.hire=$('profileHire').value;save();render();void 0}
function renderAttendance(){const p=getPerson($('attPerson').value);if(!p)return;$('attSummary').innerHTML=`<strong>${escapeHTML(p.name)}</strong><p>Active points: <strong class="orange">${points(p)}</strong> ${points(p)>=6?' · 6-POINT ALERT':''}</p>`;$('attHistory').innerHTML=p.events.length?[...p.events].reverse().map(e=>`<div class="item"><div class="row between"><strong>${escapeHTML((e.types||[]).join(' + '))}</strong><span class="orange">+${eventPoints(e)}</span></div><div class="small">${escapeHTML(e.date)} · ${isActive(e)?'Active':'Expired'} · Expires ${expiry(e.date).toLocaleDateString()}</div><p>${escapeHTML(e.notes||'')}</p></div>`).join(''):'<p>No attendance infractions recorded.</p>'}
function saveAttendance(){const p=getPerson($('attPerson').value);const types=[...($('tardy').checked?['Tardy']:[]),...($('call').checked?['Call-in violation']:[]),...($('unexcused').checked?['Unexcused']:[])];const date=$('attDate').value;if(!p||!date||!types.length)return alert('Select a date and at least one infraction.');if(date>today())return alert('Future infraction dates are not allowed.');p.events.push({id:uid(),date,types,notes:$('attNotes').value});['tardy','call','unexcused'].forEach(id=>$(id).checked=false);$('attNotes').value='';save();render();void 0}
function renderCoaching(){const p=getPerson($('coachPerson').value);if(!p)return;$('discipline').value=p.discipline;$('coachHistory').innerHTML=p.coaching.length?[...p.coaching].reverse().map(c=>`<div class="item"><div class="small">${escapeHTML(c.date)} · ${escapeHTML(c.area)}</div><p>${escapeHTML(c.note)}</p></div>`).join(''):'<p>No coaching records.</p>'}
function saveCoaching(){const p=getPerson($('coachPerson').value),date=$('coachDate').value,note=$('coachNote').value.trim();if(!p||!date||!note)return alert('Enter a date and coaching notes.');p.coaching.push({id:uid(),date,area:$('coachArea').value,note});$('coachNote').value='';save();render();void 0}
function saveDiscipline(){const p=getPerson($('coachPerson').value);if(p){p.discipline=$('discipline').value;save();render()}}
function renderGoals(){const p=getPerson($('goalPerson').value);if(!p)return;$('goalSummary').innerHTML=`<div class="row between"><strong>${escapeHTML(p.name)}</strong><span class="pill">${completedGoals(p)} / ${p.goals.length} met</span></div>`;$('goalList').innerHTML=p.goals.map((g,i)=>`<div class="card"><div class="row between"><h2>${escapeHTML(g.category)}</h2><span class="pill">Goal ${i+1}</span></div><strong>${escapeHTML(g.expectation)}</strong><p>Target: ${escapeHTML(g.target)} · Scope: ${escapeHTML(g.scope)}</p><div class="field"><label>Status</label><select onchange="updateGoal(${i},'status',this.value)">${['Not assessed','In progress','Met','Not met','Pending review'].map(v=>`<option ${g.status===v?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label>Actual / Evidence</label><textarea onchange="updateGoal(${i},'evidence',this.value)">${escapeHTML(g.evidence)}</textarea></div><div class="field"><label>Notes / Follow-up</label><textarea onchange="updateGoal(${i},'notes',this.value)">${escapeHTML(g.notes)}</textarea></div><div class="small">Last updated: ${escapeHTML(g.updated||'Not yet updated')}</div></div>`).join('')}
function updateGoal(i,key,value){const p=getPerson($('goalPerson').value);if(!p||!p.goals[i])return;p.goals[i][key]=value;p.goals[i].updated=today();save();if(key==='status')renderGoals()}
function renderTasks(){$('taskList').innerHTML=db.tasks.map(t=>`<label class="check"><span>${escapeHTML(t.title)}</span><input type="checkbox" ${t.done?'checked':''} onchange="toggleTask('${t.id}',this.checked)"></label>`).join('')}
function toggleTask(id,v){const t=db.tasks.find(x=>String(x.id)===String(id));if(t){t.done=v;save();render()}}
$('addTech').onsubmit=e=>{e.preventDefault();db.people.push({id:uid(),name:$('techName').value.trim(),shift:$('techShift').value,level:Number($('techLevel').value)||10,hire:$('techHire').value,discipline:'None',events:[],coaching:[],goals:makeGoals()});e.target.reset();save();render()};
$('addTask').onsubmit=e=>{e.preventDefault();db.tasks.push({id:uid(),title:$('taskName').value.trim(),done:false});e.target.reset();save();render()};
async function exportData(){
 const pass=prompt('Enter your vault passphrase to authorize encrypted export:');if(!pass)return;
 if(!(await verifyVaultPass(pass)))return alert('Incorrect passphrase.');
 await secureSave();const blob=new Blob([localStorage.getItem(SECURE_KEY)],{type:'application/json'});
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='JARVIS_ENCRYPTED_'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function restoreData(){
 const f=$('restoreFile').files[0];if(!f)return alert('Choose a backup file.');
 try{const raw=JSON.parse(await f.text());let incoming;
 if(raw&&raw.format==='jarvis-aes-gcm-v1'){
  const pass=prompt('Enter the encrypted backup passphrase:');if(!pass)return;
  incoming=await decryptVault(raw,pass);
 }else{
  if(!confirm('This is an UNENCRYPTED legacy backup. Import and immediately encrypt it?'))return;
  incoming=raw;
 }
 if(!incoming||!Array.isArray(incoming.people)||!Array.isArray(incoming.tasks))throw Error('Invalid backup format');
 if(!confirm('Replace current JARVIS records with this backup?'))return;
 db=incoming;await secureSave();render();alert('Imported and encrypted.');
 }catch(e){alert('Import failed: '+e.message)}
}
function resetDemo(){if(confirm('Reset iPad records to the ALFRED workbook snapshot?')){db=seed();save();render()}}
// Secure vault replaces legacy non-cryptographic PIN lock.
const SECURE_KEY='jarvis_arc_secure_v1';let vaultKey=null,vaultPass=null,secureEmail='';
const encoder=new TextEncoder(),decoder=new TextDecoder();
function b64(a){return btoa(String.fromCharCode(...new Uint8Array(a)))}
function un64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
async function deriveKey(pass,salt){const raw=await crypto.subtle.importKey('raw',encoder.encode(pass),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:600000,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
async function encryptVault(data,pass,email,saltB64){const salt=saltB64?un64(saltB64):crypto.getRandomValues(new Uint8Array(16));const key=await deriveKey(pass,salt),iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encoder.encode(JSON.stringify(data)));return {format:'jarvis-aes-gcm-v1',email:email.toLowerCase(),salt:b64(salt),iv:b64(iv),ciphertext:b64(ciphertext),iterations:600000}}
async function decryptVault(v,pass){if(v.format!=='jarvis-aes-gcm-v1')throw Error('Unsupported vault format');const key=await deriveKey(pass,un64(v.salt));const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(v.iv)},key,un64(v.ciphertext));return JSON.parse(decoder.decode(plain))}
async function verifyVaultPass(pass){try{await decryptVault(JSON.parse(localStorage.getItem(SECURE_KEY)),pass);return true}catch{return false}}
let saveQueue=Promise.resolve();
function secureSave(){if(!vaultPass)return Promise.reject(Error('Vault locked'));saveQueue=saveQueue.catch(()=>{}).then(async()=>{const old=JSON.parse(localStorage.getItem(SECURE_KEY));const blob=await encryptVault(db,vaultPass,secureEmail,old?.salt);localStorage.setItem(SECURE_KEY,JSON.stringify(blob))});return saveQueue}
function showLock(){document.getElementById('lock').style.display='flex'}
function unlock(){document.getElementById('lock').style.display='none'}
function lockApp(){vaultPass=null;vaultKey=null;db=seed();showLock()}
function changePin(){alert('For security, change your vault passphrase by exporting an encrypted backup and setting up a new vault in a fresh browser profile. Do not clear your existing vault until the new backup has been verified.')}
async function vaultLogin(){
 const email=$('vaultEmail').value.trim().toLowerCase(),pass=$('vaultPass').value;
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return alert('Enter a valid email address');
 if(pass.length<12)return alert('Use a passphrase of at least 12 characters');
 const stored=localStorage.getItem(SECURE_KEY);
 try{
  if(stored){const v=JSON.parse(stored);if(v.email!==email)throw Error('Account does not match');db=await decryptVault(v,pass)}
  else {if(!confirm('Create a new encrypted vault for '+email+'? This email is a vault identifier, NOT verified online authentication.'))return;db=seed();localStorage.setItem(SECURE_KEY,JSON.stringify(await encryptVault(db,pass,email)))}
  vaultPass=pass;secureEmail=email;
  for(const p of db.people){p.events=Array.isArray(p.events)?p.events:[];p.coaching=Array.isArray(p.coaching)?p.coaching:[];p.goals=Array.isArray(p.goals)?p.goals:makeGoals();p.discipline=p.discipline||'None'}
  $('vaultPass').value='';render();unlock();
 }catch(e){alert('Unable to unlock vault: '+e.message)}
}
// ARC V2 enhancements: preserve imported ALFRED data and existing local edits.
let taskFilter='all';
function setTaskFilter(value){taskFilter=value;renderTasks()}
function taskSafe(t){return escapeHTML(t||'')}
// ARC V3 Upgrade: visual-only technician alert severity.
// Discipline takes precedence; 6+ points uses the same strongest glow.
function technicianGlowClass(p){
 const discipline=String(p.discipline||'None').trim().toLowerCase();
 const activePoints=points(p);
 if((discipline && discipline!=='none') || activePoints>=6)return 'glow-critical';
 if(activePoints>=4)return 'glow-four';
 if(activePoints>=2)return 'glow-two';
 return '';
}
function isTeamLead(person){return person?.teamRole==='Team Lead';}
function renderShift(shift){
 const ps=db.people.filter(p=>String(p.shift)===String(shift)).sort((a,b)=>
  Number(isTeamLead(b))-Number(isTeamLead(a)) || a.name.localeCompare(b.name,undefined,{sensitivity:'base',numeric:true}));
 $('shift'+shift+'Roster').innerHTML=ps.map(p=>`<button class="person-tile ${technicianGlowClass(p)}" onclick="openProfile('${p.id}')"><span class="small">SHIFT ${shift} · LEVEL ${taskSafe(p.level)}</span><strong>${taskSafe(p.name)}</strong>${isTeamLead(p)?'<span class="arc-lead-badge">TEAM LEAD</span>':''}${String(p.discipline||'None').trim().toLowerCase()!=='none'&&String(p.discipline||'').trim()?`<span class="discipline-level">DISCIPLINE: ${taskSafe(p.discipline)}</span>`:''}<div class="row between"><span class="small">${p.events.length} attendance events</span><span class="${points(p)>=6?'orange':'green'}">${points(p)} active pts</span></div><span class="small">OPEN PROFILE →</span></button>`).join('')||'<p>No technicians on this shift.</p>';
}
function profileToAttendance(){const id=$('profilePerson').value;go('attendance');$('attPerson').value=id;renderAttendance()}
const originalRender=render;
render=function(){originalRender();renderShift('2');renderShift('4');$('shift2Count').textContent=db.people.filter(p=>String(p.shift)==='2').length+' technicians';$('shift4Count').textContent=db.people.filter(p=>String(p.shift)==='4').length+' technicians';$('dashboardTasks').innerHTML=db.tasks.filter(t=>!t.done).slice(0,4).map(t=>`<div class="item"><div class="row between"><strong>${taskSafe(t.title)}</strong><span class="orange">${taskSafe(t.priority||'Normal')}</span></div></div>`).join('')||'<p>All tasks completed.</p>';};
const originalProfile=renderProfile;
renderProfile=function(){originalProfile();const p=getPerson($('profilePerson').value);if(!p)return;const sorted=[...p.events].sort((a,b)=>String(b.date).localeCompare(String(a.date)));$('profileAttendance').innerHTML=`<div class="row between"><strong>${sorted.length} recorded event(s)</strong><span class="pill">${points(p)} active points</span></div>`+(sorted.length?sorted.map(e=>`<div class="history-row ${isActive(e)?'':'expired'}"><div class="row between"><span class="date">${taskSafe(e.date)}</span><span class="${isActive(e)?'orange':'small'}">+${eventPoints(e)} · ${isActive(e)?'Active':'Expired'}</span></div><div class="detail">${taskSafe((e.types||[]).join(' + '))}</div><div class="small">Expires: ${expiry(e.date).toLocaleDateString()}</div>${e.notes?`<p>${taskSafe(e.notes)}</p>`:''}</div>`).join(''):'<p>No attendance infractions recorded.</p>');};
renderTasks=function(){
 const open=db.tasks.filter(t=>!t.done).length,closed=db.tasks.length-open;
 $('taskMetrics').innerHTML=[['Open',open],['Closed',closed],['Total',db.tasks.length],['High priority',db.tasks.filter(t=>!t.done&&['High','Critical'].includes(t.priority)).length]].map(([label,n])=>`<div class="card"><div class="small">${label}</div><div class="metric">${n}</div></div>`).join('');
 const shown=db.tasks.filter(t=>taskFilter==='all'||(taskFilter==='open'?!t.done:t.done));
 $('taskList').innerHTML=shown.map(t=>`<div class="task-card ${t.done?'closed':''}"><span class="priority ${String(t.priority||'Normal').toLowerCase()}">${taskSafe(t.priority||'Normal')} PRIORITY</span><h3>${taskSafe(t.title)}</h3><div class="task-meta">${t.due?'Due '+taskSafe(t.due)+' · ':''}${t.done?'CLOSED':'OPEN'}</div><div class="row"><button class="btn" onclick="toggleTask('${t.id}',${!t.done})">${t.done?'↺ Reopen':'✓ Close'}</button><button class="btn" onclick="editTask('${t.id}')">✎ Edit</button><button class="btn danger" onclick="deleteTask('${t.id}')">Delete</button></div></div>`).join('')||'<div class="card">No tasks in this view.</div>';
};
function editTask(id){const t=db.tasks.find(x=>String(x.id)===String(id));if(!t)return;const name=prompt('Edit task title:',t.title);if(name===null)return;if(!name.trim())return alert('Title is required.');const priority=prompt('Priority: Low, Normal, High, Critical',t.priority||'Normal');if(priority===null)return;const normalized=['Low','Normal','High','Critical'].find(x=>x.toLowerCase()===priority.trim().toLowerCase());if(!normalized)return alert('Use Low, Normal, High, or Critical.');const due=prompt('Due date (YYYY-MM-DD, blank for none):',t.due||'');if(due===null)return;if(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))return alert('Use YYYY-MM-DD.');t.title=name.trim();t.priority=normalized;t.due=due;save();render();}
function deleteTask(id){if(!confirm('Delete this task?'))return;db.tasks=db.tasks.filter(x=>String(x.id)!==String(id));save();render();}
$('addTask').onsubmit=e=>{e.preventDefault();const title=$('taskName').value.trim();if(!title)return;db.tasks.push({id:uid(),title,done:false,priority:$('taskPriority').value,due:$('taskDue').value});e.target.reset();save();render();};


// V5: small edit action on existing events, including from the technician profile.
let editingAttendance=null;
const priorRenderAttendance=renderAttendance;
renderAttendance=function(){
 priorRenderAttendance();
 const p=getPerson($('attPerson').value);
 if(!p)return;
 const panel=$('attEditPanel');
 if(editingAttendance && String(editingAttendance.personId)!==String(p.id))cancelAttendanceEdit();
 const entries=[...p.events].reverse();
 $('attHistory').innerHTML=entries.length?entries.map(e=>{
  const index=p.events.indexOf(e);
  return `<div class="item"><div class="row between"><strong>${escapeHTML((e.types||[]).join(' + '))}</strong><span class="orange">+${eventPoints(e)}</span></div><div class="small">${escapeHTML(e.date)} · ${isActive(e)?'Active':'Expired'} · Expires ${expiry(e.date).toLocaleDateString()}</div>${e.notes?`<p>${escapeHTML(e.notes)}</p>`:''}<button class="att-edit" type="button" onclick="editAttendanceEvent(${index})">Edit</button><button class="att-delete" type="button" onclick="deleteAttendanceEvent(${index})">Delete</button></div>`;
 }).join(''):'<p>No attendance infractions recorded.</p>';
 if(!editingAttendance)panel.classList.remove('active');
};
function editAttendanceEvent(index,personId){
 if(personId!==undefined){go('attendance');$('attPerson').value=String(personId);renderAttendance();}
 const p=getPerson($('attPerson').value);
 if(!p||!Number.isInteger(index)||index<0||index>=p.events.length)return;
 const e=p.events[index];
 editingAttendance={personId:p.id,index};
 $('editAttDate').value=e.date||'';
 $('editTardy').checked=(e.types||[]).includes('Tardy');
 $('editCall').checked=(e.types||[]).includes('Call-in violation');
 $('editUnexcused').checked=(e.types||[]).includes('Unexcused');
 $('editAttNotes').value=e.notes||'';
 $('attEditPanel').classList.add('active');
 $('attEditPanel').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function cancelAttendanceEdit(){editingAttendance=null;$('attEditPanel').classList.remove('active');}
function saveAttendanceCorrection(){
 if(!editingAttendance)return;
 const p=getPerson(editingAttendance.personId);
 const e=p&&p.events[editingAttendance.index];
 if(!e)return cancelAttendanceEdit();
 const date=$('editAttDate').value;
 const types=[...($('editTardy').checked?['Tardy']:[]),...($('editCall').checked?['Call-in violation']:[]),...($('editUnexcused').checked?['Unexcused']:[])];
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(new Date(date+'T12:00:00').getTime())||date>today())return alert('Choose a valid date that is not in the future.');
 if(!types.length)return alert('Select at least one infraction.');
 const notes=$('editAttNotes').value;
 if(e.date===date&&JSON.stringify(e.types||[])===JSON.stringify(types)&&(e.notes||'')===notes)return cancelAttendanceEdit();
 if(!confirm('Save this attendance correction? The active point total will be recalculated.'))return;
 e.corrections=Array.isArray(e.corrections)?e.corrections:[];
 e.corrections.push({changedAt:new Date().toISOString(),previous:{date:e.date,types:[...(e.types||[])],notes:e.notes||''}});
 e.date=date;e.types=types;e.notes=notes;
 cancelAttendanceEdit();save();render();
}
// Keep profile history clickable, without altering existing layout.
const v4RenderProfile=renderProfile;
renderProfile=function(){
 v4RenderProfile();
 const p=getPerson($('profilePerson').value);if(!p)return;
 const rows=$('profileAttendance')?.querySelectorAll('.history-row');
 const sorted=[...p.events].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 if(!rows)return;
 rows.forEach((row,i)=>{
  const index=p.events.indexOf(sorted[i]);
  const b=document.createElement('button');b.type='button';b.className='att-edit';b.textContent='Edit';
  b.onclick=()=>editAttendanceEvent(index,p.id);row.appendChild(b);
  const d=document.createElement('button');d.type='button';d.className='att-delete';d.textContent='Delete';d.onclick=()=>deleteAttendanceEvent(index,p.id);row.appendChild(d);
 });
};


// V6: explicit deletion, with a separate audit trail and confirmation.
function deleteAttendanceEvent(index,personId){
 if(personId!==undefined){
  $('attPerson').value=String(personId);
 }
 const p=getPerson(personId!==undefined?personId:$('attPerson').value);
 if(!p||!Number.isInteger(index)||index<0||index>=p.events.length)return;
 const e=p.events[index];
 const details=(e.types||[]).join(' + ');
 if(!confirm('Delete this attendance infraction for '+p.name+'?\n\n'+e.date+' — '+details+' (+'+eventPoints(e)+' points)\n\nThis will recalculate attendance points.'))return;
 // Retain the original event and any prior corrections for traceability.
 if(!Array.isArray(db.deletedAttendanceEvents))db.deletedAttendanceEvents=[];
 db.deletedAttendanceEvents.push({personId:p.id,personName:p.name,deletedAt:new Date().toISOString(),event:JSON.parse(JSON.stringify(e))});
 p.events.splice(index,1);
 if(editingAttendance&&String(editingAttendance.personId)===String(p.id))cancelAttendanceEdit();
 save();
 render();
 // Stay on the current screen and show the recalculated result.
}

$('attDate').value=today();$('coachDate').value=today();showLock();
