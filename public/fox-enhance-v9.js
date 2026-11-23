/* FOX v9: recent coaching feed, profile Rise Up history, point-scaled shift neon.
   Presentation only: reads the existing ALFRED db and reuses its own functions; no new save paths. */
(function () {
  'use strict';
  const $id = id => document.getElementById(id);
  const ready = () => typeof arcReady !== 'undefined' && Boolean(arcReady) && typeof db !== 'undefined' && Array.isArray(db.people);
  const esc = v => (typeof escapeHTML === 'function' ? escapeHTML(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));

  // ---------- Coaching: recent entries across all technicians ----------
  const coachingPage = $id('coaching');
  let recentCard = null;
  if (coachingPage) {
    recentCard = document.createElement('div');
    recentCard.className = 'card fox-recent-coaching';
    recentCard.innerHTML = '<div class="row between"><h2>◈ Recent coaching entries</h2><span class="small" id="foxRecentCoachCount"></span></div><div id="foxRecentCoachList" class="fox-recent-list"></div>';
    const formCard = coachingPage.querySelector('.card');
    if (formCard && !formCard.querySelector('.fox-add-coach-title')) {
      const h = document.createElement('h2'); h.className = 'fox-add-coach-title'; h.textContent = '✚ Add coaching entry';
      formCard.prepend(h); formCard.classList.add('fox-add-coach');
    }
    coachingPage.append(recentCard);
  }
  function paintRecentCoaching() {
    const list = $id('foxRecentCoachList'); if (!list) return;
    if (!ready()) { list.innerHTML = '<p>Sign in to view coaching.</p>'; return; }
    const all = [];
    for (const p of db.people) for (const c of (Array.isArray(p.coaching) ? p.coaching : [])) all.push({ p, c });
    all.sort((a, b) => String(b.c.date || '').localeCompare(String(a.c.date || '')));
    const shown = all.slice(0, 15);
    $id('foxRecentCoachCount').textContent = all.length ? `Latest ${shown.length} of ${all.length}` : '';
    if (!shown.length) { list.innerHTML = '<p>No coaching records yet.</p>'; return; }
    list.innerHTML = shown.map(({ p, c }) => `<button type="button" class="fox-recent-row s${esc(p.shift)}" data-person="${esc(p.id)}"><span class="fox-recent-date">${esc(c.date)}</span><span class="fox-recent-main"><strong>${esc(p.name)}</strong><small>SHIFT ${esc(p.shift)}${c.area ? ' · ' + esc(c.area) : ''}</small><span class="fox-recent-note">${esc(c.note)}</span></span></button>`).join('');
    list.querySelectorAll('.fox-recent-row').forEach(btn => btn.addEventListener('click', () => {
      const sel = $id('coachPerson'); if (!sel) return;
      sel.value = btn.dataset.person;
      if (typeof renderCoaching === 'function') renderCoaching();
      sel.dispatchEvent(new Event('change', { bubbles: false }));
      $id('coachHistory')?.closest('.card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  // ---------- Technician profile: Rise Up history ----------
  const profilePage = $id('profile');
  if (profilePage && !$id('foxProfileRise')) {
    const card = document.createElement('div');
    card.className = 'card fox-profile-rise';
    card.innerHTML = '<div class="row between"><h2>↑ Rise Up history</h2><span class="pill" id="foxProfileRiseCount">0 entries</span></div><div id="foxProfileRise"></div><button type="button" class="btn" id="foxProfileRiseOpen">Add / manage in Rise Up →</button>';
    const summaryCard = $id('profileSummary')?.closest('.card');
    if (summaryCard && summaryCard.nextSibling) profilePage.insertBefore(card, summaryCard.nextSibling); else profilePage.append(card);
    card.querySelector('#foxProfileRiseOpen').addEventListener('click', () => {
      const id = $id('profilePerson')?.value;
      if (typeof go === 'function') go('riseup');
      const sel = $id('risePerson');
      if (sel && id && Array.from(sel.options).some(o => o.value === id)) { sel.value = id; if (typeof sel.onchange === 'function') sel.onchange(); }
    });
  }
  function paintProfileRise() {
    const box = $id('foxProfileRise'); if (!box) return;
    const p = ready() && typeof getPerson === 'function' ? getPerson($id('profilePerson')?.value) : null;
    const entries = p && Array.isArray(p.riseUp) ? [...p.riseUp].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))) : [];
    $id('foxProfileRiseCount').textContent = `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`;
    box.innerHTML = entries.length ? entries.map(e => `<div class="history-row fox-rise-history"><div class="row between"><strong>Building ${esc(e.building)}</strong><span class="date">${esc(e.date)}</span></div>${e.note ? `<p>${esc(e.note)}</p>` : ''}</div>`).join('') : '<p>No Rise Up entries for this technician yet.</p>';
  }

  // ---------- Shift tiles: neon scales with active points; 6+ turns amber ----------
  function paintShiftGlow() {
    if (!ready() || typeof points !== 'function') return;
    for (const shift of ['2', '4']) {
      $id('shift' + shift + 'Roster')?.querySelectorAll('.person-tile').forEach(tile => {
        const m = (tile.getAttribute('onclick') || '').match(/openProfile\('([^']+)'\)/);
        const p = m && getPerson(m[1]); if (!p) return;
        const pts = points(p);
        tile.classList.remove('fox-pts', 'fox-pts-amber', 'fox-s2', 'fox-s4');
        tile.classList.add('fox-s' + shift);
        tile.style.removeProperty('--pts');
        if (pts >= 6) tile.classList.add('fox-pts-amber');
        else if (pts > 0) { tile.classList.add('fox-pts'); tile.style.setProperty('--pts', String(pts)); }
        tile.dataset.points = String(pts);
      });
    }
  }


  // ---------- Technician profile: add coaching (reuses the original saveCoaching) ----------
  if (profilePage && !$id('foxProfileCoachForm')) {
    const card = document.createElement('div');
    card.className = 'card fox-add-coach';
    card.id = 'foxProfileCoachForm';
    card.innerHTML = '<h2 class="fox-add-coach-title">✚ Add coaching for this technician</h2><div class="row"><div class="field"><label for="foxPcDate">Date</label><input id="foxPcDate" type="date"></div><div class="field"><label for="foxPcArea">Building / Area</label><input id="foxPcArea" placeholder="1195"></div></div><div class="field"><label for="foxPcNote">Coaching Issue / Notes</label><textarea id="foxPcNote"></textarea></div><button type="button" class="btn" id="foxPcSave">Save Coaching</button><span class="small" id="foxPcMsg" role="status"></span>';
    const coachCard = $id('profileCoaching')?.closest('.card');
    if (coachCard) profilePage.insertBefore(card, coachCard); else profilePage.append(card);
    const today_ = () => (typeof today === 'function' ? today() : new Date().toISOString().slice(0, 10));
    $id('foxPcDate').value = today_();
    $id('foxPcSave').addEventListener('click', () => {
      const id = $id('profilePerson')?.value, p = id && getPerson(id);
      const date = $id('foxPcDate').value, note = $id('foxPcNote').value.trim();
      if (!p) return alert('Select a technician.');
      if (!date || !note) return alert('Enter a date and coaching notes.');
      const sel = $id('coachPerson'), prev = { person: sel.value, date: $id('coachDate').value, area: $id('coachArea').value, note: $id('coachNote').value };
      const before = p.coaching.length;
      sel.value = String(p.id); $id('coachDate').value = date; $id('coachArea').value = $id('foxPcArea').value; $id('coachNote').value = note;
      saveCoaching();
      $id('coachDate').value = prev.date; $id('coachArea').value = prev.area;
      if (getPerson(id)?.coaching.length > before) {
        $id('foxPcNote').value = ''; $id('foxPcArea').value = ''; $id('foxPcDate').value = today_();
        $id('foxPcMsg').textContent = ' Saved.'; setTimeout(() => { const m = $id('foxPcMsg'); if (m) m.textContent = ''; }, 2500);
      } else { $id('coachNote').value = prev.note; }
      $id('profilePerson').value = id;
      if (typeof renderProfile === 'function') renderProfile();
    });
  }

  // ---------- Rise Up tab: holographic leaderboard ----------
  const risePage = $id('riseup');
  if (risePage && !$id('foxRiseBoard')) {
    const card = document.createElement('div');
    card.className = 'card fox-rise-board';
    card.innerHTML = '<div class="row between"><h2>↑ Rise Up leaderboard</h2><span class="small" id="foxRiseBoardTotal"></span></div><ol id="foxRiseBoard" class="fox-board-list"></ol>';
    const panel = risePage.querySelector('.rise-up-panel');
    risePage.insertBefore(card, panel || null);
  }
  function paintRiseBoard() {
    const list = $id('foxRiseBoard'); if (!list) return;
    if (!ready()) { list.innerHTML = '<li class="fox-board-empty">Sign in to view the leaderboard.</li>'; return; }
    const ranked = db.people.map(p => ({ p, n: Array.isArray(p.riseUp) ? p.riseUp.length : 0 })).filter(r => r.n > 0)
      .sort((a, b) => b.n - a.n || String(a.p.name).localeCompare(String(b.p.name))).slice(0, 10);
    const total = db.people.reduce((s, p) => s + (Array.isArray(p.riseUp) ? p.riseUp.length : 0), 0);
    $id('foxRiseBoardTotal').textContent = total ? total + ' total entries' : '';
    if (!ranked.length) { list.innerHTML = '<li class="fox-board-empty">No Rise Up entries yet.</li>'; return; }
    const max = ranked[0].n;
    list.innerHTML = ranked.map((r, i) => `<li><button type="button" class="fox-board-row s${esc(r.p.shift)}${i < 3 ? ' top' : ''}" data-person="${esc(r.p.id)}" style="--w:${Math.max(6, Math.round(r.n / max * 100))}%"><span class="fox-board-rank">${String(i + 1).padStart(2, '0')}</span><span class="fox-board-name">${esc(r.p.name)}<small>SHIFT ${esc(r.p.shift)}</small></span><span class="fox-board-count">${r.n}</span></button></li>`).join('');
    list.querySelectorAll('.fox-board-row').forEach(b => b.addEventListener('click', () => {
      const sel = $id('risePerson');
      if (sel && Array.from(sel.options).some(o => o.value === b.dataset.person)) { sel.value = b.dataset.person; if (typeof sel.onchange === 'function') sel.onchange(); }
      risePage.querySelector('.rise-up-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  // Wrap the existing render chain (after every ALFRED render).
  if (typeof render === 'function') {
    const prevRender = render;
    render = function () { const r = prevRender.apply(this, arguments); try { paintRecentCoaching(); paintProfileRise(); paintShiftGlow(); paintRiseBoard(); } catch (e) { console.error(e); } return r; };
  }
  if (typeof renderProfile === 'function') {
    const prevProfile = renderProfile;
    renderProfile = function () { const r = prevProfile.apply(this, arguments); try { paintProfileRise(); } catch (e) { console.error(e); } return r; };
  }
  if (typeof renderShift === 'function') {
    const prevShift = renderShift;
    renderShift = function () { const r = prevShift.apply(this, arguments); try { paintShiftGlow(); } catch (e) { console.error(e); } return r; };
  }
  if (typeof renderCoaching === 'function') {
    const prevCoach = renderCoaching;
    renderCoaching = function () { const r = prevCoach.apply(this, arguments); try { paintRecentCoaching(); } catch (e) { console.error(e); } return r; };
  }
  if (typeof renderRiseUp === 'function') {
    const prevRise = renderRiseUp;
    renderRiseUp = function () { const r = prevRise.apply(this, arguments); try { paintRiseBoard(); } catch (e) { console.error(e); } return r; };
  }
  paintRecentCoaching(); paintProfileRise(); paintRiseBoard();
})();
