/* ALFRED embedded-room interface: calls the original functions; never duplicates record writes. */
(function () {
  'use strict';
  const shell = document.querySelector('body > .shell');
  if (!shell || document.getElementById('alfredRoom')) return;
  const room = document.createElement('div');
  room.id = 'alfredRoom';
  if (/\biPhone\b/i.test(navigator.userAgent)) room.classList.add('fox-iphone');
  room.setAttribute('role', 'region');
  room.setAttribute('aria-label', 'ALFRED command room');
  room.innerHTML = `
  <div class="ar-upper"><div class="ar-brand fox-brand"><img class="fox-brand-mark" src="./fox-emblem.webp" alt="" width="768" height="768" decoding="async"><div class="fox-brand-text"><small>● 1195 / PRIVATE APPLIED INTELLIGENCE</small><strong>FOX<span>.</span></strong><em>NIGHT OPERATIONS • LEADERSHIP SYSTEM</em></div></div><div class="ar-location">BUILDING 1195<br>OPERATIONS / PEOPLE / PERFORMANCE</div></div>
  <section class="ar-photo-screen" aria-label="Integrated command display">
    <div class="ar-screenhead"><div class="fox-tab-heading"><button type="button" id="arCollapse" class="fox-room-home" aria-label="Back to Room View" title="Back to Room View"><img src="./fox-emblem.webp" alt="" width="44" height="44"></button><div class="ar-heading"><span class="ar-signal">FOX / SECURE WORKSTATION 01</span><strong id="arTitle">SUPERVISOR OVERVIEW</strong></div></div><div class="ar-screen-actions"><button type="button" id="arFind" aria-haspopup="dialog" aria-expanded="false" aria-controls="arFinder">⌕ SEARCH / MENU</button><button type="button" id="arDossier" hidden>ALL EXPECTATIONS</button><button type="button" id="arExpand" aria-label="Expand working display">EXPAND</button></div></div>
    <div class="ar-finder" id="arFinder" role="dialog" aria-label="Find a person or module" hidden>
      <div class="ar-finder-heading"><span>PERSONNEL INTELLIGENCE</span><button type="button" id="arFindClose" aria-label="Close search">×</button></div>
      <label for="arSearch" class="ar-search-label">Search FOX personnel, shifts or functions</label>
      <input id="arSearch" type="search" inputmode="search" autocomplete="off" placeholder="Search employee name or command…" />
      <div class="ar-finder-results" id="arFindResults" role="listbox" aria-label="Command search results"></div>
      <p class="ar-find-foot">SELECT A RESULT TO OPEN ITS FOX SCREEN • ESC CLOSES</p>
    </div>
    <div class="ar-worksurface"><div class="ar-module" id="arOriginalModule"></div></div>
    <div class="ar-screentail"><span>1195 / OPERATIONAL INTELLIGENCE • FOX COMMAND FUNCTIONS</span><span id="arStatusText">SECURE WORKSPACE</span></div>
  </section>
  <aside class="ar-wall" aria-label="Live wall monitor"><span class="ar-label">FOX / LIVE INTELLIGENCE</span><strong class="ar-wall-title"><span>1195 OPERATIONS</span><span class="fox-datebox"><time id="arLocalDate" class="ar-local-date" aria-label="Local date"></time><button type="button" id="foxActiveShift" class="fox-active-shift" aria-label="Active shift. Tap to set the shift schedule.">ACTIVE · SET SHIFT</button></span></strong><div class="ar-stats"><button type="button" data-al-page="shift2" class="ar-shift-readout ar-shift2 fox-shift-link" aria-label="Open Shift 2">SHIFT 02 →<span id="arShiftTwo">—</span></button><button type="button" data-al-page="shift4" class="ar-shift-readout ar-shift4 fox-shift-link" aria-label="Open Shift 4">SHIFT 04 →<span id="arShiftFour">—</span></button></div><button type="button" id="foxRestoreQuick" class="fox-restore-quick" hidden>⟲ RESTORE NOV 20 BACKUP</button><div class="ar-wall-lower"><span class="ar-wall-pulse" aria-hidden="true"></span><span class="ar-tiny" id="arWallFoot">CONTROLLED ACCESS • NO DEMO DATA</span></div></aside>
  <section class="fox-rise" id="foxRise" aria-label="Top Rise Up leaderboard"><div class="fox-rise-head"><span>↑ RISE UP / TOP 3</span><small id="foxRiseTotal">—</small></div><ol class="fox-rise-list" id="foxRiseList"></ol><div class="fox-rise-scan" aria-hidden="true"></div></section>
  <section class="fox-rise fox-tasks" id="foxTasks" aria-label="Top open and overdue tasks"><div class="fox-rise-head"><span>☷ TASKS / OPEN &amp; OVERDUE</span><small id="foxTasksTotal">—</small></div><ol class="fox-rise-list" id="foxTasksList"></ol><div class="fox-rise-scan" aria-hidden="true"></div></section>
  <div class="fox-shift-dialog" id="foxShiftDialog" role="dialog" aria-label="Shift schedule" hidden></div>
  <nav class="ar-table" aria-label="Command tabs">
    <button data-al-page="team" type="button">◎ PEOPLE<small>ROSTER / PROFILE</small></button>
    <button data-al-page="attendance" type="button">◇ ATTENDANCE<small>POINTS & HISTORY</small></button>
    <button data-al-page="coaching" type="button">✦ COACHING<small>LEADERSHIP</small></button>
    <button data-al-page="shift2" class="ar-shift2" type="button">▥ SHIFT 02<small>CYAN UNIT</small></button>
    <button data-al-page="home" type="button">◈ COMMAND<small>OVERVIEW</small></button>
    <button data-al-page="shift4" class="ar-shift4" type="button">▥ SHIFT 04<small>STEEL UNIT</small></button>
    <button data-al-page="riseup" type="button">↑ RISE UP<small>TRAINING HISTORY</small></button>
    <button data-al-page="tasks" type="button">☷ TASKS<small>FOLLOW-UP</small></button>
    <button data-al-page="settings" type="button">⚙ SYSTEM<small>BACKUP / ACCESS</small></button>
  </nav>`;
  document.body.append(room);
  // The authenticated landing state is the photographic room with only the
  // right-side command rail visible. Selecting any command opens the workspace.
  room.classList.add('ar-room-only');
  const viewport = room.querySelector('#arOriginalModule');
  viewport.append(shell); // Move, do not clone; event handlers, selectors, inputs and state remain intact.
  const display = room.querySelector('.ar-photo-screen');
  const labels = {home:'SUPERVISOR OVERVIEW',team:'PERSONNEL INTELLIGENCE',profile:'EMPLOYEE PROFILE',shift2:'SHIFT 02 / PERSONNEL',shift4:'SHIFT 04 / PERSONNEL',attendance:'ATTENDANCE CONTROL',coaching:'LEADERSHIP & COACHING',tasks:'MISSION TASK BOARD',riseup:'RISE UP / DEVELOPMENT',settings:'SYSTEMS & DATA',goals:'EMPLOYEE PROFILE', 'expectation-dossier-page':'EMPLOYEE EXPECTATIONS / COMPLETE DOSSIER'};
  const title = room.querySelector('#arTitle');
  const finder = room.querySelector('#arFinder');
  const finderInput = room.querySelector('#arSearch');
  const finderResults = room.querySelector('#arFindResults');
  const findButton = room.querySelector('#arFind');
  const dossierButton = room.querySelector('#arDossier');
  const localDate = room.querySelector('#arLocalDate');
  function updateLocalDate() {
    if (!localDate) return;
    const now = new Date();
    localDate.dateTime = now.toISOString().slice(0, 3);
    localDate.textContent = new Intl.DateTimeFormat(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    }).format(now).toUpperCase();
  }
  updateLocalDate();
  // Refresh after midnight without creating a background polling burden.
  setInterval(updateLocalDate, 60 * 1000);
  const commandPages = [
    {name:'Command overview',route:'home',tag:'OPERATIONS'},
    {name:'Personnel roster',route:'team',tag:'DIRECTORY'},
    {name:'Attendance',route:'attendance',tag:'PEOPLE'},
    {name:'Coaching',route:'coaching',tag:'LEADERSHIP'},
    {name:'Task board',route:'tasks',tag:'FOLLOW-UP'},
    {name:'Rise Up',route:'riseup',tag:'TRAINING'},
    {name:'Shift 2',route:'shift2',tag:'CYAN UNIT'},
    {name:'Shift 4',route:'shift4',tag:'STEEL UNIT'},
    {name:'Settings and backup',route:'settings',tag:'SYSTEM'}
  ];
  function closeFinder({restoreFocus=false}={}) {
    finder.hidden=true;
    findButton.setAttribute('aria-expanded','false');
    if (restoreFocus) findButton.focus();
  }
  function showFinder(){
    if (!isUnlocked()) return;
    display.classList.remove('ar-collapsed');
    finder.hidden=false;
    findButton.setAttribute('aria-expanded','true');
    finderInput.value='';
    refreshFinder();
    finderInput.focus();
  }
  function refreshFinder(){
    finderResults.replaceChildren();
    if (!isUnlocked()) {
      const notice=document.createElement('p'); notice.textContent='Sign in to search employee records.';
      finderResults.append(notice);
      return;
    }
    const q=finderInput.value.trim().toLocaleLowerCase();
    const matches=[];
    // Search against the already authenticated, original ALFRED data object.
    // No separate roster copy or new API is introduced.
    if (typeof db!=='undefined' && Array.isArray(db.people)) {
      db.people.filter(p=>String(p.name||'').toLocaleLowerCase().includes(q)).slice(0,12)
        .forEach(p=>matches.push({name:p.name,tag:`SHIFT ${p.shift} • ${p.teamRole||'EMPLOYEE'}`,run:()=>{openProfile(String(p.id));setScreen(currentPage());}}));
    }
    commandPages.filter(p=>p.name.toLocaleLowerCase().includes(q)||p.tag.toLocaleLowerCase().includes(q))
      .slice(0,q?8:4).forEach(p=>matches.push({name:p.name,tag:p.tag,run:()=>open(p.route)}));
    if (!matches.length) {
      const empty=document.createElement('div');empty.className='ar-no-results';empty.textContent='No matching personnel or modules.';finderResults.append(empty);return;
    }
    matches.forEach((result,i)=>{
      const button=document.createElement('button');
      button.type='button';button.className='ar-finder-result';button.setAttribute('role','option');
      const code=document.createElement('span');code.className='ar-result-code';code.textContent=String(i+1).padStart(2,'0');
      const detail=document.createElement('span');detail.className='ar-result-detail';
      const name=document.createElement('strong');name.textContent=result.name;
      const tag=document.createElement('small');tag.textContent=result.tag;
      detail.append(name,tag);const arrow=document.createElement('span');arrow.textContent='↗';
      button.append(code,detail,arrow);
      button.addEventListener('click',()=>{closeFinder();result.run();});
      finderResults.append(button);
    });
  }
  findButton.addEventListener('click',()=>finder.hidden?showFinder():closeFinder({restoreFocus:true}));
  room.querySelector('#arFindClose').addEventListener('click',()=>closeFinder({restoreFocus:true}));
  finderInput.addEventListener('input',refreshFinder);
  finderInput.addEventListener('keydown',e=>{
    if (e.key==='Enter') {const first=finderResults.querySelector('button');if(first){e.preventDefault();first.click();}}
    if(e.key==='Escape'){e.preventDefault();closeFinder({restoreFocus:true});}
  });
  document.addEventListener('keydown',e=>{
    if ((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k') {e.preventDefault();finder.hidden?showFinder():closeFinder({restoreFocus:true});}
    if(e.key==='Escape' && !finder.hidden){e.preventDefault();closeFinder({restoreFocus:true});}
  });
  dossierButton.addEventListener('click',()=>{
    if(currentPage()==='profile') document.getElementById('profileSummary')?.closest('.card')?.querySelector('.cinematic-launch-dossier')?.click();
  });
  const workMain = shell.querySelector('main');
  if (workMain) {
    workMain.tabIndex = 0;
    workMain.setAttribute('role', 'region');
    workMain.setAttribute('aria-label', 'Scrollable ALFRED workspace');
  }
  function currentPage() { return shell.querySelector('.page.active')?.id || 'home'; }
  function showWorkspace() {
    room.classList.remove('ar-room-only');
    display.removeAttribute('aria-hidden');
    display.classList.remove('ar-collapsed');
  }
  function showRoomOnly() {
    closeFinder();
    room.classList.remove('ar-focus');
    room.classList.add('ar-room-only');
    room.querySelectorAll('[data-al-page]').forEach(b => { b.classList.remove('active'); b.removeAttribute('aria-current'); });
    display.setAttribute('aria-hidden', 'true');
    if (!foxChooser?.hidden) foxCloseChoices();
    requestAnimationFrame(() => {
      if (!room.classList.contains('ar-room-only') || !matchMedia('(max-width: 600px)').matches) return;
      const dock = room.querySelector('.ar-table');
      const command = dock.querySelector('[data-al-page="home"]');
      const dockBounds = dock.getBoundingClientRect();
      const buttonBounds = command.getBoundingClientRect();
      dock.scrollLeft += buttonBounds.left - dockBounds.left + (buttonBounds.width - dockBounds.width) / 2;
    });
  }
  const expandButton = room.querySelector('#arExpand');
  function syncExpandLabel() {
    const on = room.classList.contains('ar-focus');
    expandButton.textContent = on ? 'COMPACT' : 'EXPAND';
    expandButton.setAttribute('aria-label', on ? 'Shrink to compact working display' : 'Expand working display');
  }
  function setScreen(page, revealWorkspace = true) {
    const active = page || currentPage();
    title.textContent = labels[active] || active.replace(/-/g, ' ').toUpperCase();
    const wasRoomOnly = room.classList.contains('ar-room-only');
    if (revealWorkspace) showWorkspace();
    // Opening any tab from Room View starts in expanded mode.
    if (revealWorkspace && (wasRoomOnly || active === 'expectation-dossier-page')) room.classList.add('ar-focus');
    syncExpandLabel();
    dossierButton.hidden = active !== 'profile';
    room.querySelectorAll('[data-al-page]').forEach(button => {
      const selected = button.dataset.alPage === active;
      button.classList.toggle('active', selected);
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    if (workMain) {
      workMain.scrollTop = 0;
      requestAnimationFrame(() => { workMain.scrollTop = 0; });
    }
    if(typeof foxScheduleEnhance === "function")foxScheduleEnhance();
    requestAnimationFrame(()=>{ if(typeof foxSyncTriggers === "function") foxSyncTriggers(); });
  }
  function open(page) {
    closeFinder();
    if (typeof go !== 'function') return;
    room.classList.add('ar-focus');
    go(page);
    room.classList.add('ar-focus');
    syncExpandLabel();
  }
  // The app's own navigation (including openProfile(), table rows and dossier Back)
  // uses go(). Observe it without altering its business rules or save paths.
  if (typeof go === 'function') {
    const originalGo = go;
    go = function (page) { const result = originalGo(page); setScreen(currentPage(), true); return result; };
  }
  room.querySelectorAll('[data-al-page]').forEach(button => button.addEventListener('click', () => open(button.dataset.alPage)));
  room.querySelector('#arCollapse').addEventListener('click', event => {
    showRoomOnly();
    if (event.detail === 0) room.querySelector('.ar-table [data-al-page="home"]').focus({preventScroll:true});
  });
  room.querySelector('#arExpand').addEventListener('click', () => {
    showWorkspace();
    room.classList.toggle('ar-focus');
    syncExpandLabel();
  });
  const lock = document.getElementById('lock');
  const isUnlocked = () => typeof arcReady !== 'undefined' && Boolean(arcReady) && lock?.style.display === 'none';

  // FOX searchable choice layer. Original <select> remains the source of truth.
  // Only the presentation changes: no duplicated data, state, calculations or save path.
  const foxChooser = document.createElement('section');
  foxChooser.id = 'foxChoicePopup';
  foxChooser.className = 'fox-choice-popup';
  foxChooser.hidden = true;
  foxChooser.setAttribute('role','dialog');
  foxChooser.setAttribute('aria-label','Search a selection');
  foxChooser.innerHTML = '<div class="fox-choice-top"><span id="foxChoiceTitle">SELECT</span><button type="button" id="foxChoiceClose" aria-label="Close choices">×</button></div><input type="search" id="foxChoiceSearch" aria-label="Type to search available choices" autocomplete="off" placeholder="Type to search…"><div id="foxChoiceResults" class="fox-choice-results" role="listbox"></div>';
  room.append(foxChooser);
  const foxSearch = foxChooser.querySelector('#foxChoiceSearch');
  const foxResults = foxChooser.querySelector('#foxChoiceResults');
  let foxActiveSelect = null, foxActiveTrigger = null;
  const foxLabel = select => {
    const field = select.closest('.field');
    return field?.querySelector('label')?.textContent?.trim() || select.getAttribute('aria-label') || 'Choose an option';
  };
  function foxCloseChoices(restore=false){
    foxChooser.hidden = true;
    foxActiveTrigger?.setAttribute('aria-expanded','false');
    if (restore && foxActiveTrigger?.isConnected) foxActiveTrigger.focus();
    foxActiveSelect=null;foxActiveTrigger=null;
  }
  function foxPaintChoices(){
    foxResults.replaceChildren();
    if (!foxActiveSelect || !foxActiveSelect.isConnected) {foxCloseChoices();return;}
    const query=foxSearch.value.trim().toLocaleLowerCase();
    const opts=Array.from(foxActiveSelect.options).filter(o=>!o.disabled && (o.textContent||'').toLocaleLowerCase().includes(query));
    if (!opts.length) {const msg=document.createElement('p');msg.className='fox-no-choice';msg.textContent='No matching options';foxResults.append(msg);return;}
    opts.forEach(opt=>{
      const b=document.createElement('button');b.type='button';b.className='fox-choice-option';b.setAttribute('role','option');
      b.setAttribute('aria-selected',String(opt.value===foxActiveSelect.value));b.textContent=opt.textContent||opt.value;
      b.addEventListener('click',()=>{
        const native=foxActiveSelect,trigger=foxActiveTrigger;
        native.value=opt.value;
        native.dispatchEvent(new Event('input',{bubbles:true}));
        native.dispatchEvent(new Event('change',{bubbles:true}));
        if(trigger?.isConnected)trigger.textContent=native.selectedOptions[0]?.textContent||'Choose…';
        foxCloseChoices(true);
      });
      foxResults.append(b);
    });
  }
  function foxOpenChoices(select,trigger){
    if (!isUnlocked())return;
    if (!foxChooser.hidden && foxActiveSelect===select){foxCloseChoices(true);return;}
    foxActiveSelect=select;foxActiveTrigger=trigger;foxChooser.hidden=false;
    trigger.setAttribute('aria-expanded','true');
    foxChooser.querySelector('#foxChoiceTitle').textContent=foxLabel(select).toUpperCase();
    foxSearch.value='';foxPaintChoices();
    const rect=trigger.getBoundingClientRect();
    const width=Math.min(360,window.innerWidth-20);
    foxChooser.style.left=Math.max(10,Math.min(rect.left,window.innerWidth-width-10))+'px';
    foxChooser.style.width=width+'px';
    foxChooser.style.top=Math.max(10,Math.min(rect.bottom+5,window.innerHeight-320))+'px';
    foxSearch.focus();
  }
  function foxEnhanceChoices(){
    viewport.querySelectorAll('select:not([data-fox-searchable])').forEach(select=>{
      if(select.closest('.fox-choice-wrapper'))return;
      select.dataset.foxSearchable='true';
      const wrapper=document.createElement('div');wrapper.className='fox-choice-wrapper';
      select.parentNode.insertBefore(wrapper,select);wrapper.appendChild(select);
      select.classList.add('fox-native-select');
      const trigger=document.createElement('button');trigger.type='button';trigger.className='fox-choice-trigger';
      trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
      trigger.setAttribute('aria-label',foxLabel(select)+': tap and type to search');
      trigger.textContent=select.selectedOptions[0]?.textContent||'Choose…';
      wrapper.appendChild(trigger);
      trigger.addEventListener('click',()=>foxOpenChoices(select,trigger));
      select.addEventListener('change',()=>{if(trigger.isConnected)trigger.textContent=select.selectedOptions[0]?.textContent||'Choose…';});
      select.addEventListener('input',()=>{if(trigger.isConnected)trigger.textContent=select.selectedOptions[0]?.textContent||'Choose…';});
    });
    foxSyncTriggers();
  }
  // Selections set in code (e.g. tapping an employee card calls openProfile(id))
  // change select.value without firing events. Keep every search box label in sync.
  function foxSyncTriggers(){
    viewport.querySelectorAll('.fox-choice-wrapper').forEach(w=>{
      const sel=w.querySelector('select'),trig=w.querySelector('.fox-choice-trigger');
      if(!sel||!trig)return;
      const label=sel.selectedOptions[0]?.textContent||'Choose…';
      if(trig.textContent!==label)trig.textContent=label;
    });
  }
  foxSearch.addEventListener('input',foxPaintChoices);
  foxSearch.addEventListener('keydown',e=>{
    if (e.key==='Escape'){e.preventDefault();foxCloseChoices(true);}
    if (e.key==='Enter'){const first=foxResults.querySelector('button');if(first){e.preventDefault();first.click();}}
  });
  foxChooser.querySelector('#foxChoiceClose').addEventListener('click',()=>foxCloseChoices(true));
  document.addEventListener('pointerdown',e=>{
    if (!foxChooser.hidden && !foxChooser.contains(e.target) && !e.target.closest?.('.fox-choice-trigger')) foxCloseChoices();
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!foxChooser.hidden)foxCloseChoices(true);});
  let foxPending=false;
  function foxScheduleEnhance(){if(foxPending)return;foxPending=true;requestAnimationFrame(()=>{foxPending=false;foxEnhanceChoices();});}
  new MutationObserver(foxScheduleEnhance).observe(viewport,{subtree:true,childList:true});
  foxEnhanceChoices();

  let scheduled = false;
  function updateWall() {
    scheduled = false;
    const ready = isUnlocked();
    const getNum = id => { const m = document.getElementById(id)?.textContent.match(/\d+/); return m ? m[0] : '0'; };
    room.querySelector('#arShiftTwo').textContent = ready ? getNum('shift2Count') + ' PEOPLE' : 'LOCKED';
    room.querySelector('#arShiftFour').textContent = ready ? getNum('shift4Count') + ' PEOPLE' : 'LOCKED';
    room.querySelector('#arWallFoot').textContent = ready ? 'LIVE FROM FOX WORKSPACE' : 'SIGN IN TO VIEW RECORDS';
    room.querySelector('#arStatusText').textContent = ready ? 'AUTHENTICATED / DATA FROM FOX' : 'WORKSPACE LOCKED';
    foxPaintRise(ready);
    foxPaintTasks(ready);
    if (!ready) { scheduleFetched = false; serverSchedule = null; }
    foxPaintShift();
    const restoreQuick = room.querySelector('#foxRestoreQuick');
    restoreQuick.hidden = !(ready && typeof alfredHasStagedBackup !== 'undefined' && alfredHasStagedBackup
      && typeof db !== 'undefined' && Array.isArray(db.people) && db.people.length === 0);
    if(!ready && !finder.hidden)closeFinder();
    if(!ready && !foxChooser.hidden)foxCloseChoices();
  }
  // ---- FOX: holographic Rise Up leaderboard (reads the original ALFRED db; no writes) ----
  const riseList = room.querySelector('#foxRiseList');
  const riseTotal = room.querySelector('#foxRiseTotal');
  let riseSig = '';
  function foxPaintRise(ready) {
    const people = ready && typeof db !== 'undefined' && Array.isArray(db.people) ? db.people : [];
    const ranked = people.map(p => ({ id: String(p.id), name: String(p.name || 'Unnamed'), shift: String(p.shift || ''), n: Array.isArray(p.riseUp) ? p.riseUp.length : 0 }))
      .filter(r => r.n > 0).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, 3);
    const sig = ready + '|' + ranked.map(r => r.id + ':' + r.n + ':' + r.shift + ':' + r.name).join(',');
    if (sig === riseSig) return; riseSig = sig;
    riseList.replaceChildren();
    const total = people.reduce((sum, p) => sum + (Array.isArray(p.riseUp) ? p.riseUp.length : 0), 0);
    riseTotal.textContent = ready ? total + ' ENTRIES' : 'LOCKED';
    if (!ranked.length) {
      const li = document.createElement('li'); li.className = 'fox-rise-empty';
      li.textContent = ready ? 'No Rise Up entries yet. Restore your backup or log an entry in Rise Up.' : 'Sign in to view Rise Up leaders.';
      riseList.append(li); return;
    }
    const max = ranked[0].n;
    ranked.forEach((r, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'fox-rise-row' + (r.shift === '2' ? ' s2' : r.shift === '4' ? ' s4' : '');
      b.style.setProperty('--w', Math.max(6, Math.round(r.n / max * 100)) + '%');
      b.style.setProperty('--d', (i * 70) + 'ms');
      const rank = document.createElement('span'); rank.className = 'fox-rise-rank'; rank.textContent = String(i + 1).padStart(2, '0');
      const name = document.createElement('span'); name.className = 'fox-rise-name'; name.textContent = r.name;
      const tag = document.createElement('small'); tag.textContent = r.shift ? 'SHIFT ' + r.shift.padStart(2, '0') : '';
      name.append(tag);
      const count = document.createElement('span'); count.className = 'fox-rise-count'; count.textContent = String(r.n);
      const bar = document.createElement('span'); bar.className = 'fox-rise-bar'; bar.setAttribute('aria-hidden', 'true');
      b.append(rank, name, count, bar);
      b.setAttribute('aria-label', `${r.name}, ${r.n} Rise Up entries. Open history.`);
      b.addEventListener('click', () => {
        open('riseup');
        const sel = document.getElementById('risePerson');
        if (sel && Array.from(sel.options).some(o => o.value === r.id)) { sel.value = r.id; if (typeof sel.onchange === 'function') sel.onchange(); }
      });
      li.append(b); riseList.append(li);
    });
  }


  // ---- FOX: open and overdue tasks shared by Room View and Compact mode ----
  const tasksList = room.querySelector('#foxTasksList');
  const tasksTotal = room.querySelector('#foxTasksTotal');
  let tasksSig = '';
  const PRI = { critical: 0, high: 1, normal: 2, low: 3 };
  function localToday() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function foxPaintTasks(ready) {
    const all = ready && typeof db !== 'undefined' && Array.isArray(db.tasks) ? db.tasks : [];
    const t0 = localToday();
    const openTasks = all.filter(t => !t.done).map(t => {
      const due = typeof t.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : '';
      return { t, due, overdue: Boolean(due && due < t0), pri: PRI[String(t.priority || 'Normal').toLowerCase()] ?? 2 };
    }).sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.pri - b.pri || (a.due || '9999').localeCompare(b.due || '9999') || String(a.t.title).localeCompare(String(b.t.title)));
    const top = openTasks;
    const nOver = openTasks.filter(x => x.overdue).length;
    const sig = ready + '|' + t0 + '|' + nOver + '|' + openTasks.length + '|' + top.map(x => x.t.id + ':' + x.t.title + ':' + x.due + ':' + x.t.priority).join(',');
    if (sig === tasksSig) return; tasksSig = sig;
    tasksList.replaceChildren();
    tasksTotal.textContent = ready ? `${openTasks.length} OPEN · ${nOver} OVERDUE` : 'LOCKED';
    if (!top.length) {
      const li = document.createElement('li'); li.className = 'fox-rise-empty';
      li.textContent = ready ? 'No open tasks. Nice work.' : 'Sign in to view tasks.';
      tasksList.append(li); return;
    }
    top.forEach((x, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'fox-rise-row fox-task-row ' + (x.overdue ? 'is-overdue' : 'is-open');
      b.style.setProperty('--w', '100%'); b.style.setProperty('--d', (i * 70) + 'ms');
      const rank = document.createElement('span'); rank.className = 'fox-rise-rank'; rank.textContent = String(i + 1).padStart(2, '0');
      const name = document.createElement('span'); name.className = 'fox-rise-name'; name.textContent = String(x.t.title || 'Untitled task');
      const tag = document.createElement('small'); tag.textContent = (x.overdue ? 'OVERDUE' : 'OPEN') + ' · ' + String(x.t.priority || 'Normal').toUpperCase();
      name.append(tag);
      const due = document.createElement('span'); due.className = 'fox-rise-count fox-task-due';
      if (x.due) { const [y, m, d] = x.due.split('-').map(Number); due.textContent = new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase(); }
      else due.textContent = '—';
      const bar = document.createElement('span'); bar.className = 'fox-rise-bar'; bar.setAttribute('aria-hidden', 'true');
      b.append(rank, name, due, bar);
      b.setAttribute('aria-label', `${x.t.title}, ${x.overdue ? 'overdue' : 'open'}${x.due ? ', due ' + x.due : ''}. Open tasks.`);
      b.addEventListener('click', () => {
        if (room.classList.contains('ar-room-only')) open('tasks');
        else go('tasks');
      });
      li.append(b); tasksList.append(li);
    });
  }
  setInterval(() => { tasksSig = ''; foxPaintTasks(isUnlocked()); }, 5 * 60 * 1000);
  const riseEl = room.querySelector('#foxRise');
  const syncRiseBottom = () => { const r = riseEl.getBoundingClientRect(); if (r.height) room.style.setProperty('--fox-rise-bottom', Math.round(r.bottom) + 'px'); };
  if (window.ResizeObserver) new ResizeObserver(syncRiseBottom).observe(riseEl);
  window.addEventListener('resize', syncRiseBottom);
  requestAnimationFrame(syncRiseBottom);

  // ---- FOX: active shift indicator (2-week rotation stored on this device) ----
  const SHIFT_KEY = 'fox:shift-schedule';
  const PITMAN = ['2','2','4','4','2','2','2','4','4','2','2','4','4','4'];
  const DAYS = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
  const shiftChip = room.querySelector('#foxActiveShift');
  const shiftDialog = room.querySelector('#foxShiftDialog');
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function mondayOf(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  const validSchedule = v => Boolean(v && Array.isArray(v.pattern) && v.pattern.length === 14 && typeof v.anchor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.anchor));
  let serverSchedule = null, scheduleFetched = false, scheduleFetching = false;
  function localSchedule() { try { const v = JSON.parse(localStorage.getItem(SHIFT_KEY) || 'null'); if (validSchedule(v)) return v; } catch {} return null; }
  function loadSchedule() { return serverSchedule || localSchedule(); }
  async function pushSchedule(cfg) {
    try { if (typeof arcRequest === 'function' && isUnlocked()) { await arcRequest('fox/shift-schedule', 'POST', { schedule: cfg }); serverSchedule = cfg; } } catch (e) { console.warn('Shift schedule not synced:', e.message); }
  }
  async function fetchSchedule() {
    if (scheduleFetched || scheduleFetching || !isUnlocked() || typeof arcRequest !== 'function') return;
    scheduleFetching = true;
    try {
      const r = await arcRequest('fox/shift-schedule');
      scheduleFetched = true;
      if (validSchedule(r && r.schedule)) {
        serverSchedule = r.schedule;
        try { localStorage.setItem(SHIFT_KEY, JSON.stringify(serverSchedule)); } catch {}
      } else {
        const local = localSchedule();
        if (local) pushSchedule({ anchor: local.anchor, pattern: local.pattern, dayStart: local.dayStart || '06:00' });
      }
    } catch (e) { console.warn('Shift schedule unavailable:', e.message); }
    finally { scheduleFetching = false; foxPaintShift(); }
  }
  // When no schedule is saved, infer the 2-2-3 (Pitman) phase from dated records:
  // attendance, coaching and Rise Up entries are logged on the days each shift works.
  let autoCache = { sig: '', cfg: null };
  function autoSchedule() {
    if (!isUnlocked() || typeof db === 'undefined' || !Array.isArray(db.people)) return null;
    const recs = [];
    for (const p of db.people) {
      const sh = String(p.shift || ''); if (sh !== '2' && sh !== '4') continue;
      for (const list of [p.events, p.coaching, p.riseUp]) if (Array.isArray(list)) for (const r of list)
        if (r && typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) recs.push([r.date, sh]);
    }
    const sig = recs.length + ':' + (recs[0] || []).join() + ':' + (recs[recs.length - 1] || []).join();
    if (sig === autoCache.sig) return autoCache.cfg;
    autoCache.sig = sig; autoCache.cfg = null;
    if (recs.length < 8) return null;
    const base = new Date(2024, 0, 1); // a Monday
    const dayIdx = d => { const [y, m, dd] = d.split('-').map(Number); return Math.round((new Date(y, m - 1, dd) - base) / 86400000); };
    let best = -1, bestScore = -1;
    for (let o = 0; o < 14; o++) {
      let score = 0;
      for (const [d, sh] of recs) if (PITMAN[(((dayIdx(d) + o) % 14) + 14) % 14] === sh) score++;
      if (score > bestScore) { bestScore = score; best = o; }
    }
    if (bestScore / recs.length < 0.7) return null;
    // Convert offset o into an anchor Monday whose pattern index 0 lines up.
    const pattern = PITMAN.map((_, i) => PITMAN[(i + best) % 14]);
    autoCache.cfg = { anchor: ymd(base), pattern, dayStart: '06:00', auto: true };
    return autoCache.cfg;
  }
  function activeShift(cfg, now = new Date()) {
    const [h, m] = String(cfg.dayStart || '06:00').split(':').map(Number);
    const d = new Date(now); if (d.getHours() * 60 + d.getMinutes() < (h || 0) * 60 + (m || 0)) d.setDate(d.getDate() - 1);
    const [ay, am, ad] = cfg.anchor.split('-').map(Number);
    const a = new Date(ay, am - 1, ad), day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((day - a) / 86400000);
    return cfg.pattern[((diff % 14) + 14) % 14] || '';
  }
  function foxPaintShift() {
    fetchSchedule();
    const cfg = loadSchedule() || autoSchedule();
    shiftChip.classList.remove('s2', 's4', 'off');
    if (!cfg) { shiftChip.textContent = 'ACTIVE · SET SHIFT'; return; }
    const s = activeShift(cfg);
    if (s === '2' || s === '4') { shiftChip.classList.add('s' + s); shiftChip.textContent = 'ACTIVE · SHIFT 0' + s; }
    else { shiftChip.classList.add('off'); shiftChip.textContent = 'ACTIVE · NONE'; }
  }
  setInterval(foxPaintShift, 60 * 1000);
  function openShiftDialog() {
    const cfg = loadSchedule() || autoSchedule() || { anchor: ymd(mondayOf(new Date())), pattern: PITMAN.slice(), dayStart: '06:00' };
    const pattern = cfg.pattern.slice();
    shiftDialog.innerHTML = '<div class="fox-sd-card"><div class="fox-sd-top"><span>SHIFT SCHEDULE / 2-WEEK ROTATION</span><button type="button" data-x aria-label="Close">×</button></div><p class="fox-sd-help">Tap a day to cycle Shift 02 → Shift 04 → Off. The active shift beside the date follows this rotation. Saved to your FOX account, so it stays set on every device.</p><div class="fox-sd-grid"></div><div class="fox-sd-fields"><label>Week 1 starts (Monday)<input type="date" data-anchor></label><label>New shift day starts at<input type="time" data-start></label></div><div class="fox-sd-actions"><button type="button" data-pitman>Use 2-2-3 (Pitman)</button><button type="button" data-save class="primary">Save schedule</button></div></div>';
    const grid = shiftDialog.querySelector('.fox-sd-grid');
    const paint = () => {
      grid.replaceChildren();
      for (let w = 0; w < 2; w++) {
        const lab = document.createElement('span'); lab.className = 'fox-sd-week'; lab.textContent = 'WEEK ' + (w + 1); grid.append(lab);
        for (let i = 0; i < 7; i++) {
          const idx = w * 7 + i, v = pattern[idx];
          const b = document.createElement('button'); b.type = 'button'; b.className = 'fox-sd-day ' + (v === '2' ? 's2' : v === '4' ? 's4' : 'off');
          b.innerHTML = '<small></small><strong></strong>';
          b.querySelector('small').textContent = DAYS[i]; b.querySelector('strong').textContent = v ? 'S' + v : 'OFF';
          b.addEventListener('click', () => { pattern[idx] = v === '2' ? '4' : v === '4' ? '' : '2'; paint(); });
          grid.append(b);
        }
      }
    };
    paint();
    const anchor = shiftDialog.querySelector('[data-anchor]'), start = shiftDialog.querySelector('[data-start]');
    anchor.value = cfg.anchor; start.value = cfg.dayStart || '06:00';
    shiftDialog.querySelector('[data-pitman]').onclick = () => { PITMAN.forEach((v, i) => pattern[i] = v); paint(); };
    shiftDialog.querySelector('[data-x]').onclick = () => { shiftDialog.hidden = true; shiftChip.focus(); };
    shiftDialog.querySelector('[data-save]').onclick = () => {
      let a = anchor.value || ymd(mondayOf(new Date()));
      const [y, mo, d] = a.split('-').map(Number); a = ymd(mondayOf(new Date(y, mo - 1, d)));
      const cfgNew = { anchor: a, pattern: pattern.slice(), dayStart: start.value || '06:00' };
      try { localStorage.setItem(SHIFT_KEY, JSON.stringify(cfgNew)); } catch {}
      serverSchedule = cfgNew; pushSchedule(cfgNew);
      shiftDialog.hidden = true; foxPaintShift();
    };
    shiftDialog.hidden = false;
  }
  shiftChip.addEventListener('click', openShiftDialog);
  shiftDialog.addEventListener('click', e => { if (e.target === shiftDialog) shiftDialog.hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !shiftDialog.hidden) shiftDialog.hidden = true; });
  foxPaintShift();
  // Keep the Rise Up panel tucked directly under the 1195 monitor on phones.
  const wallEl = room.querySelector('.ar-wall');
  const syncWallBottom = () => { const r = wallEl.getBoundingClientRect(); if (r.height) room.style.setProperty('--fox-wall-bottom', Math.round(r.bottom) + 'px'); };
  if (window.ResizeObserver) new ResizeObserver(syncWallBottom).observe(wallEl);
  window.addEventListener('resize', syncWallBottom);
  requestAnimationFrame(syncWallBottom);

  // ---- FOX: one-tap access to the included November 20 encrypted backup ----
  room.querySelector('#foxRestoreQuick').addEventListener('click', async e => {
    const b = e.currentTarget; b.disabled = true;
    try { if (typeof restoreAlfredBackup === 'function') await restoreAlfredBackup(true); }
    finally { b.disabled = false; scheduleWall(); }
  });

  function scheduleWall() { if (scheduled) return; scheduled = true; requestAnimationFrame(updateWall); }
  new MutationObserver(scheduleWall).observe(shell, {subtree:true,childList:true,characterData:true});
  if (lock) new MutationObserver(scheduleWall).observe(lock, {attributes:true,attributeFilter:['style','class']});
  scheduleWall();
  setScreen(currentPage(), false);
  showRoomOnly();
  window.ALFREDPhotoRoom = Object.freeze({
    open,
    roomView: showRoomOnly,
    focus(){ showWorkspace(); room.classList.add('ar-focus'); },
    workspace(){ showWorkspace(); setScreen(currentPage(), true); },
  });
})();
