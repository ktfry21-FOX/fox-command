/* New ARC interface; original JARVIS authentication and server storage.
   No employee records or passcodes are stored in browser storage. */
'use strict';
const ARC_BASE = "__PORT_5019__".startsWith("__") ? "" : "__PORT_5019__";
const ALFRED_SESSION_KEY = 'alfred:auth-token';
const RISE_BUILDINGS = ['1150/55', '1175', '1180', '1195', '2000'];
function validRiseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const day = new Date(value + 'T00:00:00Z');
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value;
}
let alfredSetup = false;
let alfredNeedsSetupKey = false;
let alfredEmailRecovery = false;
let alfredHostedRelease = false;
let alfredHasStagedBackup = false;
let arcToken = null, arcRevision = 0, arcReady = false, arcConflict = false;
let arcPending = 0, arcIdleTimer = 0;
let arcLockedDraft = null;
const arcStatus = document.createElement('div');
arcStatus.className = 'arc-status';
arcStatus.setAttribute('role', 'status');
document.body.prepend(arcStatus);
function statusMessage(text, error = false) {
  arcStatus.textContent = text;
  arcStatus.classList.toggle('error', error);
}
function storedSession() {
  try { return JSON.parse(localStorage.getItem(ALFRED_SESSION_KEY) || 'null')?.data || null; }
  catch { return null; }
}
function storeSession(token) {
  arcToken = token;
  try {
    if (token && !alfredHostedRelease) localStorage.setItem(ALFRED_SESSION_KEY, JSON.stringify({ data: token, updatedAt: Date.now() }));
    else localStorage.removeItem(ALFRED_SESSION_KEY);
  } catch { /* embedded previews can keep the session in memory only */ }
}
async function arcRequest(path, method = 'GET', data, token = arcToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(ARC_BASE + '/api/' + path, {
    method, headers, cache: 'no-store',
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  let result;
  try { result = await response.json(); } catch { throw Error('Server unavailable. Nothing was confirmed saved.'); }
  if (!response.ok) {
    if (response.status === 409) arcConflict = true;
    throw Error(result.message || 'Unable to save records.');
  }
  return result;
}
function normalizeArc(data) {
  if (!data || !Array.isArray(data.people) || !Array.isArray(data.tasks)) throw Error('Invalid backup structure');
  const validateLeadGoals = goals => {
    if (!Array.isArray(goals) || goals.length > 200 || goals.some(goal => !goal
      || ['category','expectation','target','scope','status','evidence','notes','updated']
        .some(field => typeof goal[field] !== 'string' || goal[field].length > 20000)))
      throw Error('Invalid team lead expectations');
  };
  if (data.teamLeadExpectations !== undefined) validateLeadGoals(data.teamLeadExpectations);
  const validId = value => (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
    || (typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value));
  for (const p of data.people) {
    if (!p || !validId(p.id) || typeof p.name !== 'string' || !['1','2','3','4'].includes(String(p.shift)))
      throw Error('Invalid technician fields');
    p.shift = String(p.shift);
    if (p.teamRole !== undefined && !['Technician', 'Team Lead'].includes(p.teamRole))
      throw Error('Invalid team role');
    if (p.teamLeadGoals !== undefined) validateLeadGoals(p.teamLeadGoals);
    if (p.teamRole === undefined && defaultLeadNames.has(p.name.trim().replace(/\s+/g, ' ').toLowerCase()))
      p.teamRole = 'Team Lead';
    if (p.teamRole === 'Team Lead') prepareTeamLeadGoals(p);
    p.level = p.level || 1; p.hire = p.hire || ''; p.discipline = p.discipline || 'None';
    p.events = p.events || []; p.coaching = p.coaching || []; p.goals = p.goals?.length ? p.goals : makeGoals();
    if (!Array.isArray(p.events) || !Array.isArray(p.coaching) || !Array.isArray(p.goals)) throw Error('Invalid technician history');
    for (const e of p.events) {
      if (!e || !validId(e.id) || !Array.isArray(e.types)
        || !e.types.every(t => ['Tardy','Call-in violation','Unexcused','Present'].includes(t)))
        throw Error('Invalid attendance event');
    }
    const acknowledged = p.acknowledgedAttendanceAlert;
    if (acknowledged !== undefined && (!Array.isArray(acknowledged) || acknowledged.length > 10000
      || acknowledged.some(key => typeof key !== 'string' || key.length > 240)))
      throw Error('Invalid attendance alert acknowledgment');
    for (const c of p.coaching) if (!c || !validId(c.id)) throw Error('Invalid coaching identifier');
    if (p.riseUp !== undefined) {
      if (!Array.isArray(p.riseUp) || p.riseUp.length > 10000 || p.riseUp.some(entry =>
        !entry || !validId(entry.id) || !RISE_BUILDINGS.includes(entry.building)
        || !validRiseDate(entry.date) || typeof entry.note !== 'string'
        || !entry.note.trim() || entry.note.length > 4000)
        || new Set(p.riseUp.map(entry => String(entry.id))).size !== p.riseUp.length)
        throw Error('Invalid Rise Up history');
    }
  }
  for (const t of data.tasks) {
    if (!t || !validId(t.id) || typeof t.title !== 'string') throw Error('Invalid task fields');
    t.priority = t.priority || 'Normal';
    if (!['Low','Normal','High','Critical'].includes(t.priority)) throw Error('Invalid task priority');
    t.done = !!t.done;
  }
  return data;
}
const arcOriginalProfile = renderProfile;
renderProfile = function () {
  arcOriginalProfile();
  const person = getPerson($('profilePerson').value);
  if (!person) return;
  const history = document.createElement('div');
  history.className = 'card';
  const heading = document.createElement('h2');
  heading.textContent = 'Discipline history';
  history.append(heading);
  for (const record of person.disciplineHistory || []) {
    const item = document.createElement('p');
    item.textContent = [record.effectiveDate, record.level,
      record.clearedAt ? 'Cleared ' + record.clearedAt : '',
      record.note || ''].filter(Boolean).join(' · ');
    history.append(item);
  }
  if (!history.querySelector('p')) {
    const empty = document.createElement('p'); empty.textContent = 'No recorded discipline.'; history.append(empty);
  }
  $('profileSummary').append(history);
};
saveDiscipline = function () {
  const person = getPerson($('coachPerson').value);
  if (!person) return;
  const level = $('discipline').value;
  if (level === person.discipline) return;
  person.disciplineHistory = person.disciplineHistory || [];
  const timestamp = new Date().toISOString();
  for (const record of person.disciplineHistory)
    if (!record.clearedAt) record.clearedAt = timestamp;
  if (level !== 'None') person.disciplineHistory.push({
    id: uid(), level, effectiveDate: today(), note: '', createdAt: timestamp,
  });
  person.discipline = level; save(); render();
};
function resetIdle() {
  clearTimeout(arcIdleTimer);
  if (arcReady) arcIdleTimer = setTimeout(() => lockApp(), 5 * 60 * 1000);
}
function showAuthenticated() {
  unlock(); arcReady = true; arcConflict = false; render();
  $('attDate').value = today(); $('coachDate').value = today();
  statusMessage('ALFRED connected. Workspace records are private.');
  if (arcLockedDraft) {
    db = arcLockedDraft; arcLockedDraft = null; arcConflict = true; render();
    statusMessage('Recovered unsaved changes in memory. Export an encrypted backup, then reload to get the latest server records.', true);
  }
  resetIdle();
}
async function loadServer() {
  const result = await arcRequest('arc/state');
  if (!Array.isArray(result.officialLeadExpectations) || !result.officialLeadExpectations.length)
    throw Error('ALFRED expectations could not be loaded.');
  officialLeadExpectations = result.officialLeadExpectations;
  defaultLeadNames = new Set(Array.isArray(result.defaultLeadNames) ? result.defaultLeadNames : []);
  const next = normalizeArc(result.data);
  alfredHasStagedBackup = result.stagedBackup === true;
  stagedRestore.hidden = !alfredHasStagedBackup;
  updateAlfredRecovery(result.emailRecovery);
  db = next; arcRevision = result.revision;
  const offerStagedBackup = result.stagedBackup === true && result.revision === 0 && next.people.length === 0;
  showAuthenticated();
  if (offerStagedBackup) {
    let alreadyOffered = false;
    try { alreadyOffered = sessionStorage.getItem('fox:nov20-offer') === 'shown'; } catch { /* private mode */ }
    if (!alreadyOffered) {
      try { sessionStorage.setItem('fox:nov20-offer', 'shown'); } catch { /* private mode */ }
      // Do not interrupt the startup film with a first-run restore prompt.
      Promise.resolve(window.foxLaunchReady).then(async () => {
        if (!arcReady || arcRevision !== 0 || db.people.length !== 0) return;
        const restoreNow = confirm('Your encrypted November 20 ALFRED backup is staged in this private deployment. Restore it now? You will need the backup passphrase.');
        if (restoreNow) await restoreAlfredBackup(true);
      });
    }
  }
}
vaultLogin = async function () {
  const button = $('vaultUnlock');
  if (button.disabled) return;
  button.disabled = true;
  try {
    await saveQueue.catch(() => {});
    const email = $('vaultEmail').value.trim().toLowerCase();
    const passcode = $('vaultPass').value;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw Error('Enter a valid email address.');
    if (alfredHostedRelease
      ? passcode.length < 16 || passcode.length > 128 || !/\S/.test(passcode)
      : !/^\d{6}$/.test(passcode)) {
      throw Error(alfredHostedRelease ? 'Enter a passphrase of 16 to 128 characters.' : 'Enter your six-digit numeric PIN.');
    }
    statusMessage('Signing in…');
    const setupKey = alfredSetup && alfredNeedsSetupKey ? prompt('Enter your ALFRED activation code:') : undefined;
    if (alfredSetup && alfredNeedsSetupKey && !setupKey?.trim()) return statusMessage('Setup canceled. Enter your activation code to continue.');
    const session = await arcRequest(alfredSetup ? 'auth/setup' : 'auth/login', 'POST', { email, passcode, setupKey });
    storeSession(session.token); secureEmail = email;
    updateAlfredLogin(false);
    $('vaultPass').value = '';
    await loadServer();
  } catch (error) {
    if (alfredSetup) await refreshAlfredLogin();
    statusMessage(error.message, true);
  }
  finally { button.disabled = false; }
};
// Capture each mutation BEFORE queueing, so locking cannot turn a pending
// save into an empty document. Server revision checks prevent silent overwrites.
secureSave = function () {
  if (!arcReady || !arcToken) return Promise.reject(Error('Sign in before saving'));
  if (arcConflict) return Promise.reject(Error('Conflicting changes. Export pending changes and reload before editing.'));
  const snapshot = structuredClone(db);
  const saveToken = arcToken;
  arcPending++;
  statusMessage('Saving to server… Keep this page open until saved.');
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    if (arcConflict) throw Error('Unresolved save conflict. Reload required.');
    const result = await arcRequest('arc/state', 'POST', { revision: arcRevision, data: snapshot }, saveToken);
    arcRevision = result.revision;
  }).then(() => {
    statusMessage('Saved to server · ' + new Date().toLocaleTimeString());
  }).catch(error => {
    arcConflict = true;
    statusMessage('NOT SAVED: ' + error.message, true);
    throw error;
  }).finally(() => { arcPending--; });
  return saveQueue;
};
save = function () { return secureSave().catch(() => {}); };
// The supplied encoder spreads the whole buffer onto the call stack; chunk it
// so encrypted exports continue working as the roster and revision data grow.
b64 = function (input) {
  const bytes = new Uint8Array(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
};
exportData = async function () {
  try {
    if (!arcReady) throw Error('Sign in before exporting');
    const pass = prompt('Choose a backup passphrase (12+ characters). This is separate from your login passcode.');
    if (!pass) return;
    if (pass.length < 12) throw Error('Use at least 12 characters for the encrypted backup');
    const encrypted = await encryptVault(structuredClone(db), pass, secureEmail || 'jarvis');
    const url = URL.createObjectURL(new Blob([JSON.stringify(encrypted)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'ALFRED_ENCRYPTED_' + today() + '.json';
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { alert(error.message); }
};
async function restoreAlfredBackup(staged = false) {
  try {
    if (!arcReady || arcPending || arcConflict) throw Error('Finish saving or resolve the save conflict before importing');
    let incoming;
    if (staged) {
      incoming = await arcRequest('arc/staged-backup');
      if (incoming?.format !== 'jarvis-aes-gcm-v1') throw Error('The staged backup is not encrypted');
    } else {
      const file = $('restoreFile').files[0]; if (!file) throw Error('Choose a backup');
      if (file.size > 4 * 1024 * 1024) throw Error('Backup exceeds the 4 MB import limit');
      incoming = JSON.parse(await file.text());
    }
    if (incoming.format === 'jarvis-aes-gcm-v1') {
      const pass = prompt('Encrypted backup passphrase:'); if (!pass) return;
      incoming = await decryptVault(incoming, pass);
    }
    incoming = normalizeArc(incoming);
    if (!confirm('Replace the current ARC workspace with this backup? Original migration records and prior server revisions will be retained.')) return;
    const previous = db;
    db = incoming;
    try { await secureSave(); render(); statusMessage('Workspace backup restored.'); }
    catch (error) { db = previous; render(); throw error; }
  } catch (error) { alert('Import not completed: ' + error.message); }
}
restoreData = () => restoreAlfredBackup();
lockApp = async function () {
  if (!arcReady) return;
  const oldToken = arcToken;
  const draft = arcPending || arcConflict ? structuredClone(db) : null;
  if (draft) arcLockedDraft = draft;
  clearTimeout(arcIdleTimer);
  closeArcDelete();
  // Privacy lock is immediate, even if a save is failing or conflicting.
  // Unconfirmed work stays in memory, available only after signing in again.
  storeSession(null); arcReady = false; db = seed(); vaultPass = null; officialLeadExpectations = [];
  defaultLeadNames.clear();
  expectationDrafts = new WeakMap();
  render(); showLock(); statusMessage('Signed out.');
  for (const id of ['profileSummary','profileCoaching','profileAttendance','attSummary','attHistory',
    'coachHistory','goalSummary','goalList']) $(id)?.replaceChildren();
  for (const input of document.querySelectorAll('.shell input,.shell textarea')) {
    input.value = '';
    if (input.type === 'checkbox') input.checked = false;
  }
  try {
    await saveQueue;
    if (arcLockedDraft === draft) arcLockedDraft = null;
  } catch { /* retain the in-memory draft for authenticated export */ }
  try { await arcRequest('auth/logout', 'POST', undefined, oldToken); } catch { /* local session cleared */ }
};
resetDemo = function () { alert('Reset is disabled to protect your existing records. Use an encrypted backup to restore data.'); };
loadAlfredRoster = function () { alert('Your existing JARVIS roster was loaded from the server. Import other ARC records through Restore Backup.'); };
changePin = async function () {
  const email = prompt('Enter the email on your ALFRED account:'); if (!email) return;
  try {
    const result = await arcRequest('auth/forgot', 'POST', { email });
    if (!result.sent) return alert('Reset email was not confirmed sent. Your existing passcode has not changed.');
    const code = prompt('Enter the reset code from your email:'); if (!code) return;
    const passcode = prompt('Choose your new six-digit numeric PIN:'); if (!passcode) return;
    if (!/^\d{6}$/.test(passcode)) return alert('Use exactly six numbers.');
    const session = await arcRequest('auth/reset', 'POST', { email, code, passcode });
    storeSession(session.token); await loadServer();
    alert('Passcode changed; other sessions were revoked.');
  } catch (error) { alert(error.message); }
};
const lockBox = document.querySelector('.lockbox');
lockBox.querySelector('h2').textContent = 'Sign in to FOX';
lockBox.querySelectorAll('p')[1].textContent = 'Secure access to Building 1195 operations.';
lockBox.querySelectorAll('p')[1].classList.add('fox-login-description');
lockBox.querySelector('p.small').textContent = 'Manager access only. Your email and six-digit PIN are checked by the ALFRED server.';
$('vaultPass').placeholder = '••••••';
$('vaultPass').setAttribute('maxlength','6');
$('vaultPass').setAttribute('inputmode','numeric');
$('vaultPass').addEventListener('beforeinput', event => {
  if (alfredHostedRelease) return;
  if (event.inputType === 'insertText' && event.data && /\D/.test(event.data)) event.preventDefault();
});
$('vaultPass').addEventListener('paste', event => {
  if (alfredHostedRelease) return;
  const digits = (event.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
  event.preventDefault();
  $('vaultPass').value = digits;
  $('vaultPass').dispatchEvent(new Event('input', { bubbles: true }));
});
$('vaultPass').addEventListener('input', () => {
  if (!alfredHostedRelease) $('vaultPass').value = $('vaultPass').value.replace(/\D/g,'').slice(0,6);
});
$('vaultUnlock').textContent = 'Sign in';
$('vaultUnlock').addEventListener('click', vaultLogin);
$('vaultPass').addEventListener('keydown', e => { if (e.key === 'Enter') vaultLogin(); });
const recover = document.createElement('button');
recover.type = 'button'; recover.className = 'btn'; recover.textContent = 'Forgot passcode?';
recover.hidden = true;
recover.addEventListener('click', () => changePin());
lockBox.append(recover);
const alfredFeedback = document.createElement('p');
alfredFeedback.className = 'alfred-feedback';
alfredFeedback.setAttribute('role', 'status');
lockBox.append(alfredFeedback);
new MutationObserver(() => {
  alfredFeedback.textContent = arcStatus.classList.contains('error') || !arcReady ? arcStatus.textContent : '';
}).observe(arcStatus, {childList:true, attributes:true});
function updateAlfredLogin(setup) {
  alfredSetup = setup;
  lockBox.querySelector('h2').textContent = setup ? 'Set up ALFRED' : 'Sign in to FOX';
  lockBox.querySelectorAll('p')[1].textContent = setup
    ? 'Create manager access for this private, empty workspace.'
    : 'Enter your registered email and ' + (alfredHostedRelease ? 'manager passphrase.' : 'six-digit access PIN.');
  $('vaultUnlock').textContent = setup ? 'Create manager account' : 'Sign in';
  $('vaultPass').placeholder = alfredHostedRelease ? 'Enter passphrase' : '••••••';
  $('vaultPass').autocomplete = setup ? 'new-password' : 'current-password';
  recover.hidden = setup || !alfredEmailRecovery;
}
function updateAlfredRecovery(enabled) {
  alfredEmailRecovery = enabled === true;
  recover.hidden = alfredSetup || !alfredEmailRecovery;
  settingsCards[2].querySelector('button').hidden = !alfredEmailRecovery;
  settingsCards[2].querySelector('p').textContent = alfredEmailRecovery
    ? 'This account is separate from JARVIS.'
    : 'This account is separate from JARVIS. Email recovery is not configured. Keep your ALFRED passcode somewhere safe.';
}
async function refreshAlfredLogin() {
  $('vaultUnlock').disabled = true;
  try {
    const info = await arcRequest('auth/status');
    alfredNeedsSetupKey = info.needsSetupKey === true;
    alfredHostedRelease = info.hostedRelease === true;
    if (alfredHostedRelease) {
      lockBox.classList.add('fox-hosted-login');
      const field = $('vaultPass');
      field.removeAttribute('pattern');
      field.removeAttribute('inputmode');
      field.maxLength = 128;
      field.minLength = 16;
      lockBox.querySelector('label[for="vaultPass"]').textContent = 'MANAGER PASSPHRASE';
      $('foxPinHint').textContent = 'Use a unique passphrase. 16 characters minimum.';
      lockBox.querySelector('p.small').textContent = 'Access is restricted to the configured owner account.';
      settingsCards[2].querySelector('h2').textContent = 'Manager passphrase';
      restoreHint.textContent = 'Choose your encrypted FOX backup, enter its backup passphrase, and confirm the replacement.';
    }
    updateAlfredRecovery(info.emailRecovery);
    updateAlfredLogin(!info.hasPasscode);
  } catch { statusMessage('ALFRED server unavailable. Reload to reconnect.', true); }
  finally { $('vaultUnlock').disabled = false; }
}
const signOut = document.createElement('button');
signOut.type = 'button'; signOut.className = 'btn'; signOut.textContent = 'Lock / Sign out';
signOut.addEventListener('click', () => lockApp());
document.querySelector('aside').append(signOut);
const banner = document.querySelector('main > .card');
banner.remove();
const settingsCards = [...$('settings').querySelectorAll('.card')];
settingsCards[0].querySelector('h2').textContent = 'Roster & records';
settingsCards[0].querySelector('p').textContent = 'Records synchronize to this private FOX server after every confirmed save. Restore Backup accepts compatible JSON or encrypted ALFRED backups.';
settingsCards[0].querySelector('button').hidden = true;
settingsCards[1].querySelector('p').textContent = 'Download a passphrase-encrypted backup of the current workspace. Keep a separate copy outside the deployment.';
const restoreHint = document.createElement('p');
restoreHint.className = 'small';
restoreHint.textContent = 'To migrate records, choose an encrypted ALFRED backup or use the included November 20 archive, enter its backup passphrase, and confirm the replacement. Prior server revisions remain available in the deployment database.';
settingsCards[1].append(restoreHint);
const stagedRestore = document.createElement('button');
stagedRestore.type = 'button';
stagedRestore.hidden = true;
stagedRestore.className = 'btn';
stagedRestore.textContent = 'Restore included November 20 backup';
stagedRestore.addEventListener('click', async () => {
  stagedRestore.disabled = true;
  try { await restoreAlfredBackup(true); }
  finally { stagedRestore.disabled = false; }
});
settingsCards[1].append(stagedRestore);
settingsCards[2].querySelector('h2').textContent = 'Account access PIN';
settingsCards[2].querySelector('p').textContent = 'This account is separate from JARVIS. Email reset delivery depends on the configured email provider.';
settingsCards[2].querySelector('button').textContent = 'Request PIN reset';
updateAlfredRecovery(false);
settingsCards[3].querySelector('h2').textContent = 'Data protection';
settingsCards[3].querySelector('p').textContent = 'Records and append-only save revisions are retained in the deployment’s persistent SQLite volume. Keep the site private and export encrypted backups regularly.';
document.querySelector('footer').textContent = 'ALFRED 1195 · PRIVATE COMMAND CENTER · SERVER-SYNCED RECORDS';
window.addEventListener('beforeunload', event => {
  if (arcPending || arcConflict) { event.preventDefault(); event.returnValue = ''; }
});
for (const event of ['pointerdown', 'keydown']) document.addEventListener(event, resetIdle, { passive: true });
window.addEventListener('online', () => statusMessage('Connection restored. Reload if a previous save failed; export pending changes first.', arcConflict));
window.addEventListener('offline', () => statusMessage('Offline. New changes cannot be saved to the server.', true));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
// View-only design upgrades: never reorder or mutate persisted people/history.
technicianGlowClass = function (person) {
  const discipline = String(person.discipline || 'None').trim().toLowerCase();
  const total = points(person);
  if ((discipline && discipline !== 'none') || total >= 6) return 'glow-critical';
  if (total >= 4) return 'glow-four';
  return total > 0 ? 'glow-two' : '';
};
function orderedPeople(people) {
  const order = { '2': 0, '4': 1, '1': 2, '3': 3 };
  return [...people].sort((a, b) =>
    (order[String(a.shift)] ?? 9) - (order[String(b.shift)] ?? 9)
    || a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
}
function addShiftHeading(target, shift, count, columns) {
  const row = document.createElement('tr');
  row.className = 'arc-shift-heading shift-' + shift;
  const cell = document.createElement('th');
  cell.colSpan = columns; cell.scope = 'rowgroup';
  cell.textContent = 'SHIFT ' + String(shift).padStart(2, '0') + ' · ' + count + ' TECHNICIANS';
  row.append(cell); target.append(row);
}
function addCells(row, values) {
  for (const value of values) {
    const cell = document.createElement('td');
    cell.textContent = String(value ?? '');
    row.append(cell);
  }
}
function renderGroupedOverview() {
  const level = person => {
    const label = String(person.level ?? '').trim().replace(/^level\s*/i, '');
    return label && Number.isFinite(Number(label)) ? Number(label) : Infinity;
  };
  for (const shift of ['2', '4']) {
    const target = $('overviewShift' + shift);
    target.replaceChildren();
    const members = db.people.filter(person => String(person.shift) === shift).sort((a, b) =>
      Number(isTeamLead(a)) - Number(isTeamLead(b))
      || level(a) - level(b)
      || a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
    if (!members.length) {
      const row = document.createElement('tr'), cell = document.createElement('td');
      cell.colSpan = 7;
      cell.textContent = 'No technicians assigned to this shift.';
      row.append(cell); target.append(row);
    }
    for (const person of members) {
      const row = document.createElement('tr');
      row.className = 'arc-tech-row ' + technicianGlowClass(person);
      const name = document.createElement('td');
      const open = document.createElement('button');
      open.type = 'button'; open.className = 'arc-tech-name'; open.textContent = person.name;
      open.addEventListener('click', () => openProfile(person.id));
      name.append(open); row.append(name);
      if (isTeamLead(person)) name.append(makeLeadBadge());
      addCells(row, [person.level, 'Shift ' + shift]);
      const riseCell = document.createElement('td');
      riseCell.append(riseLink(person, false));
      row.append(riseCell);
      addCells(row, [person.coaching.length, completedGoals(person), pendingGoals(person)]);
      target.append(row);
    }
  }
}
renderTeam = function () {
  const query = $('search').value.toLowerCase(), shift = $('shiftFilter').value;
  const members = orderedPeople(db.people.filter(p =>
    p.name.toLowerCase().includes(query) && (!shift || String(p.shift) === shift)));
  const target = $('roster'); target.replaceChildren();
  for (const group of ['2', '4', '1', '3']) {
    const people = members.filter(p => String(p.shift) === group);
    if (!people.length) continue;
    addShiftHeading(target, group, people.length, 6);
    for (const person of people) {
      const row = document.createElement('tr');
      row.className = 'arc-tech-row ' + technicianGlowClass(person);
      addCells(row, [person.name, 'Shift ' + group, person.level, person.hire, points(person)]);
      if (isTeamLead(person)) row.firstElementChild.append(makeLeadBadge());
      const cell = document.createElement('td'), open = document.createElement('button');
      open.type = 'button'; open.className = 'btn'; open.textContent = 'Open';
      open.addEventListener('click', () => openProfile(person.id));
      cell.append(open); row.append(cell); target.append(row);
    }
  }
};
const arcBeforeDesignRender = render;
render = function () { arcBeforeDesignRender(); renderGroupedOverview(); };

// Delete controls use stable record IDs, in-page confirmation, and a targeted
// authenticated server mutation. Never hide a record before its save succeeds.
let arcDeletePanel = null;
function closeArcDelete() {
  if (!arcDeletePanel) return;
  const { backdrop, shell, wasInert, previousFocus } = arcDeletePanel;
  arcDeletePanel = null;
  backdrop.remove(); shell.inert = wasInert;
  if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
}
function requestArcDelete(personId, recordId, kind) {
  if (!arcReady || arcConflict) {
    statusMessage('Sign in and resolve unsaved changes before deleting. No record was deleted.', true);
    return;
  }
  const person = getPerson(personId);
  const records = kind === 'attendance' ? person?.events : kind === 'coaching' ? person?.coaching : person?.riseUp;
  const record = records?.find(item => String(item.id) === String(recordId));
  if (!person || !record) return;
  const expectedRecord = structuredClone(record);
  closeArcDelete();
  const backdrop = document.createElement('div');
  backdrop.className = 'arc-delete-backdrop';
  const dialog = document.createElement('div');
  dialog.className = 'arc-delete-dialog'; dialog.setAttribute('role', 'alertdialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'arc-delete-title');
  dialog.setAttribute('aria-describedby', 'arc-delete-description');
  const title = document.createElement('h2'); title.id = 'arc-delete-title';
  title.textContent = kind === 'attendance' ? 'Delete attendance issue?'
    : kind === 'coaching' ? 'Delete coaching note?' : 'Delete Rise Up entry?';
  const description = document.createElement('p'); description.id = 'arc-delete-description';
  const detail = kind === 'attendance' ? (record.types || []).join(' + ')
    : kind === 'riseup' ? `Building ${record.building} · ${record.note.slice(0, 180)}${record.note.length > 180 ? '…' : ''}` : record.note;
  description.textContent = person.name + ' · ' + record.date + ' · ' + detail
    + (kind === 'riseup' ? '\nThis removes the entry from the technician’s Rise Up history and tally.'
      : '\nThis removes the active record. A copy remains in the audit history.');
  const feedback = document.createElement('p'); feedback.setAttribute('role', 'status');
  const actions = document.createElement('div'); actions.className = 'row';
  const cancel = document.createElement('button'), confirm = document.createElement('button');
  cancel.type = confirm.type = 'button';
  cancel.className = 'btn'; confirm.className = 'btn danger';
  cancel.textContent = 'Cancel'; confirm.textContent = 'Yes, delete';
  cancel.addEventListener('click', closeArcDelete);
  let busy = false;
  confirm.addEventListener('click', async () => {
    if (busy) return;
    busy = true; cancel.disabled = confirm.disabled = true;
    feedback.textContent = 'Deleting from server…';
    const token = arcToken;
    arcPending++;
    statusMessage('Saving deletion to server…');
    saveQueue = saveQueue.catch(() => {}).then(async () => {
      if (arcConflict) throw Error('Resolve the previous save conflict before deleting. Nothing was deleted.');
      const result = await arcRequest('arc/delete-record', 'POST', {
        personId, recordId, kind, expectedRecord,
      }, token);
      if (arcReady && arcToken === token) {
        db = normalizeArc(result.data); arcRevision = result.revision;
        if (kind === 'attendance') cancelAttendanceEdit();
        render(); closeArcDelete();
        statusMessage(result.deleted ? 'Deleted and saved to server.' : 'This record was already deleted.');
      }
    }).catch(error => {
      feedback.textContent = error.message;
      statusMessage('Deletion not confirmed: ' + error.message, true);
      throw error;
    }).finally(() => {
      arcPending--; busy = false; cancel.disabled = confirm.disabled = false;
    });
    try { await saveQueue; } catch { /* keep dialog and original visible record */ }
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !busy) { event.preventDefault(); closeArcDelete(); }
    if (event.key === 'Tab') {
      event.preventDefault();
      (document.activeElement === cancel ? confirm : cancel).focus();
    }
  });
  actions.append(cancel, confirm); dialog.append(title, description, feedback, actions);
  backdrop.append(dialog);
  const shell = document.querySelector('.shell'), previousFocus = document.activeElement;
  arcDeletePanel = { backdrop, shell, wasInert: shell.inert, previousFocus };
  shell.inert = true; document.body.append(backdrop); cancel.focus();
}
function addArcDeleteControl(container, personId, recordId, kind) {
  if (!container) return;
  container.querySelectorAll('.att-delete').forEach(button => button.remove());
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'arc-record-delete';
  button.textContent = kind === 'attendance' ? 'Delete attendance' : 'Delete coaching';
  button.addEventListener('click', () => requestArcDelete(personId, recordId, kind));
  container.append(button);
}
const arcAttendanceBeforeDelete = renderAttendance;
renderAttendance = function () {
  arcAttendanceBeforeDelete();
  const person = getPerson($('attPerson').value);
  if (!person) return;
  const rows = $('attHistory').querySelectorAll(':scope > .item');
  [...person.events].reverse().forEach((record, index) =>
    addArcDeleteControl(rows[index], person.id, record.id, 'attendance'));
};
const arcCoachingBeforeDelete = renderCoaching;
renderCoaching = function () {
  arcCoachingBeforeDelete();
  const person = getPerson($('coachPerson').value);
  if (!person) return;
  const rows = $('coachHistory').querySelectorAll(':scope > .item');
  [...person.coaching].reverse().forEach((record, index) =>
    addArcDeleteControl(rows[index], person.id, record.id, 'coaching'));
};
const arcProfileBeforeDelete = renderProfile;
renderProfile = function () {
  arcProfileBeforeDelete();
  const person = getPerson($('profilePerson').value);
  if (!person) return;
  const events = [...person.events].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const eventRows = $('profileAttendance').querySelectorAll('.history-row');
  events.forEach((record, index) =>
    addArcDeleteControl(eventRows[index], person.id, record.id, 'attendance'));
  const coachingRows = $('profileCoaching').querySelectorAll(':scope > .item');
  [...person.coaching].reverse().slice(0, 5).forEach((record, index) =>
    addArcDeleteControl(coachingRows[index], person.id, record.id, 'coaching'));
};
deleteAttendanceEvent = function (index, personId) {
  const person = getPerson(personId === undefined ? $('attPerson').value : personId);
  if (person?.events[index]) requestArcDelete(person.id, person.events[index].id, 'attendance');
};

// Rotation changes dock position, not phone classification. Measure the
// active tab against its scroll strip without moving the page itself.
const arcPhone = /iPhone|iPod/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) <= 500);
if (arcPhone) document.documentElement.classList.add('arc-phone');
const tabDock = document.querySelector('.shell > aside');
const reducedTabMotion = matchMedia('(prefers-reduced-motion: reduce)');
let navigationFrame = 0;
const positionTabs = (smooth = false) => {
  cancelAnimationFrame(navigationFrame);
  navigationFrame = requestAnimationFrame(() => {
    const current = tabDock.querySelector('.nav.active');
    tabDock.querySelectorAll('.nav[aria-current]').forEach(tab => tab.removeAttribute('aria-current'));
    if (!current) return;
    current.setAttribute('aria-current', 'page');
    if (tabDock.scrollWidth <= tabDock.clientWidth + 1) return;
    const dockRect = tabDock.getBoundingClientRect(), tabRect = current.getBoundingClientRect();
    const left = tabDock.scrollLeft + tabRect.left - dockRect.left - (dockRect.width - tabRect.width) / 2;
    tabDock.scrollTo({ left: Math.max(0, left), behavior: smooth && !reducedTabMotion.matches ? 'smooth' : 'auto' });
  });
};
const arcGoBeforeDock = go;
go = function (page) { arcGoBeforeDock(page); positionTabs(true); };
if ('ResizeObserver' in window) {
  let dockWidth = tabDock.clientWidth;
  const tabWidthObserver = new ResizeObserver(() => {
    if (dockWidth !== tabDock.clientWidth) { dockWidth = tabDock.clientWidth; positionTabs(); }
  });
  tabWidthObserver.observe(tabDock);
  const statusSizeObserver = new ResizeObserver(() => {
    document.documentElement.style.setProperty('--alfred-status-height', `${arcStatus.offsetHeight}px`);
  });
  statusSizeObserver.observe(arcStatus);
} else {
  window.addEventListener('resize', () => positionTabs(), { passive: true });
}
matchMedia('(orientation: landscape)').addEventListener('change', () => positionTabs());
window.addEventListener('pageshow', () => positionTabs(), { passive: true });
window.addEventListener('pagehide', () => cancelAnimationFrame(navigationFrame));
positionTabs();
const reactor = document.querySelector('#home .reactor');
reactor.classList.add('arc-reactor-upgrade');
reactor.setAttribute('aria-label', 'Layered cyan and orange ARC reactor artwork');
reactor.innerHTML = `<svg viewBox="0 0 320 320" role="img" aria-label="ARC energy core with luminous orbital rings and orange targeting marks">
  <defs>
    <radialGradient id="arc-energy"><stop stop-color="#fff"/><stop offset=".15" stop-color="#c9ffff"/><stop offset=".4" stop-color="#4fe8ff"/><stop offset=".72" stop-color="#127ab6"/><stop offset="1" stop-color="#07172d"/></radialGradient>
    <radialGradient id="arc-aura"><stop stop-color="#4cecff" stop-opacity=".48"/><stop offset=".55" stop-color="#4972f1" stop-opacity=".14"/><stop offset="1" stop-color="#9b62ef" stop-opacity="0"/></radialGradient>
    <linearGradient id="arc-metal" x2="1" y2="1"><stop stop-color="#76eaff"/><stop offset=".5" stop-color="#af8cff"/><stop offset="1" stop-color="#23dcff"/></linearGradient>
  </defs>
  <circle cx="160" cy="160" r="158" fill="url(#arc-aura)"/>
  <g stroke="#38628d" fill="none"><circle cx="160" cy="160" r="145"/><circle cx="160" cy="160" r="136" stroke-dasharray="1 8" stroke-width="4"/><path d="M160 4V28M160 292V316M4 160H28M292 160H316" stroke="#ff9a55" stroke-width="2"/></g>
  <g class="arc-orbit"><circle cx="160" cy="160" r="125" fill="none" stroke="#34dfff" stroke-width="5" stroke-dasharray="110 22 32 22"/><circle cx="160" cy="160" r="116" fill="none" stroke="#ff9a55" stroke-width="3" stroke-dasharray="26 156"/></g>
  <g class="arc-orbit-reverse"><circle cx="160" cy="160" r="104" fill="none" stroke="#ad8cff" stroke-width="2" stroke-dasharray="62 20"/><circle cx="160" cy="160" r="95" fill="none" stroke="#88ebff" stroke-width="7" stroke-dasharray="3 46.75"/></g>
  <path d="M160 76L233 118V202L160 244L87 202V118Z" fill="#081b32" stroke="url(#arc-metal)" stroke-width="4"/>
  <path d="M160 91L220 126V194L160 229L100 194V126Z" fill="url(#arc-energy)" stroke="#83eeff" stroke-width="2"/>
  <g stroke="#c3faff" stroke-opacity=".5" fill="none"><path d="M160 93V128M219 126L188 144M219 193L188 176M160 227V192M101 193L132 176M101 126L132 144"/><circle cx="160" cy="160" r="41"/></g>
  <g class="arc-core-light"><circle cx="160" cy="160" r="25" fill="#4de5ff" opacity=".35"/><circle cx="160" cy="160" r="15" fill="#e7ffff"/><circle cx="160" cy="160" r="6" fill="#fff"/></g>
  <g fill="#ffac68"><path d="M151 43L160 32L169 43M277 151L288 160L277 169M151 277L160 288L169 277M43 151L32 160L43 169"/></g>
  <g fill="#9dddf1" font-family="Courier New,monospace" font-size="7" letter-spacing="2" text-anchor="middle"><text x="160" y="21">ARC / 1195</text><text x="160" y="307">COMMAND CORE</text></g>
</svg>`;
// Compact profile workspace. Keep existing data, history renderers, save queue,
// revision protection and editable profile controls; change presentation only.
const profilePage = $('profile');
let officialLeadExpectations = [];
let defaultLeadNames = new Set();
function prepareTeamLeadGoals(person) {
  if (!officialLeadExpectations.length) throw Error('Team Lead expectations are unavailable. Reload before editing.');
  const existing = person.teamLeadGoals || [];
  if (person.teamLeadGoalsArchive !== undefined && !Array.isArray(person.teamLeadGoalsArchive))
    throw Error('Invalid archived Team Lead expectations. Restore a valid backup before editing.');
  const consumed = new Set();
  const archived = (person.teamLeadGoalsArchive || []).slice().reverse()
    .flatMap(entry => Array.isArray(entry?.goals) ? entry.goals : [])
    .filter(goal => goal && ['expectation', 'status', 'evidence', 'notes', 'updated']
      .every(field => typeof goal[field] === 'string' && goal[field].length <= 20000));
  const matches = (goal, definition) => typeof goal?.expectation === 'string'
    && goal.expectation.trim().toLowerCase() === definition.expectation.trim().toLowerCase();
  const next = officialLeadExpectations.map(definition => {
    // Prefer the stable canonical ID. Never silently discard duplicate
    // matches from older/imported records with independent evidence.
    let index = existing.findIndex((goal, i) => !consumed.has(i) && String(goal.id) === definition.id);
    if (index < 0) index = existing.findIndex((goal, i) => !consumed.has(i)
      && matches(goal, definition));
    const current = index < 0 ? null : existing[index];
    const untouched = !current || ((!current.status || current.status === 'Not assessed')
      && !current.evidence && !current.notes && !current.updated);
    const recovered = untouched ? archived.find(goal => String(goal.id) === definition.id
      && (goal.updated || goal.evidence || goal.notes || (goal.status && goal.status !== 'Not assessed')))
      ?? archived.find(goal => matches(goal, definition)
        && (goal.updated || goal.evidence || goal.notes || (goal.status && goal.status !== 'Not assessed'))) : null;
    const previous = recovered || current;
    if (index >= 0) consumed.add(index);
    return {...previous, ...definition, status: previous?.status || 'Not assessed',
      evidence: previous?.evidence || '', notes: previous?.notes || '', updated: previous?.updated || ''};
  });
  const retained = existing.filter((goal, index) => !consumed.has(index));
  // Retain any previous custom definitions/progress in encrypted exports and
  // authenticated records, rather than deleting them when installing FY27.
  if (retained.length) {
    person.teamLeadGoalsArchive = person.teamLeadGoalsArchive || [];
    person.teamLeadGoalsArchive.push({archivedAt: new Date().toISOString(), goals: structuredClone(retained)});
  }
  person.teamLeadGoals = next;
}
function makeLeadBadge() {
  const badge = document.createElement('span');
  badge.className = 'arc-lead-badge';
  badge.textContent = 'TEAM LEAD';
  return badge;
}
function roleGoals(person) {
  return isTeamLead(person) ? person.teamLeadGoals || [] : person.goals;
}
completedGoals = person => roleGoals(person).filter(goal => goal.status === 'Met').length;
pendingGoals = person => roleGoals(person).filter(goal => goal.status !== 'Met').length;
const profileEditCard = $('profileName').closest('.card');
profileEditCard.querySelector('h2').remove();
const profileEditBody = document.createElement('div');
profileEditBody.id = 'arc-profile-edit-body';
profileEditBody.className = 'arc-profile-edit-body';
profileEditBody.hidden = true;
profileEditBody.append(...profileEditCard.childNodes);
const roleField = document.createElement('div');
roleField.className = 'field';
roleField.innerHTML = `<label for="arc-team-role">Team role</label>
  <select id="arc-team-role"><option>Technician</option><option>Team Lead</option></select>
  <p class="small">Team Leads have a distinct badge and their own FY27 expectations. Existing technician goals are retained.</p>`;
profileEditBody.prepend(roleField);
const arcSaveProfileBeforeRole = saveProfile;
saveProfile = function () {
  const person = getPerson($('profilePerson').value);
  if (!person || !$('profileName').value.trim() || !arcReady || arcConflict) return;
  const nextRole = $('arc-team-role').value;
  if (nextRole === 'Team Lead') prepareTeamLeadGoals(person);
  person.teamRole = nextRole;
  arcSaveProfileBeforeRole();
};
const profileEditToggle = document.createElement('button');
profileEditToggle.type = 'button';
profileEditToggle.className = 'btn arc-profile-edit-toggle';
profileEditToggle.textContent = 'Edit profile details';
profileEditToggle.setAttribute('aria-controls', profileEditBody.id);
profileEditToggle.setAttribute('aria-expanded', 'false');
function closeProfileDetails() {
  profileEditBody.hidden = true;
  profileEditToggle.setAttribute('aria-expanded', 'false');
}
profileEditToggle.onclick = () => {
  profileEditBody.hidden = !profileEditBody.hidden;
  profileEditToggle.setAttribute('aria-expanded', String(!profileEditBody.hidden));
};
profileEditCard.append(profileEditToggle, profileEditBody);
profilePage.append(profileEditCard);

const expectationsCard = document.createElement('div');
expectationsCard.className = 'card arc-profile-expectations';
expectationsCard.innerHTML = `
  <div class="row between"><h2>FY27 expectations</h2>
    <button type="button" class="btn" id="arc-next-expectation">Next pending</button></div>
  <div id="arc-expectation-set-field" hidden><label for="arc-expectation-set">Expectations set</label>
    <select id="arc-expectation-set"><option value="lead">Team Lead</option>
      <option value="technician">Technician (retained)</option></select></div>
  <label for="arc-expectation-select" class="small">Review one expectation at a time</label>
  <select id="arc-expectation-select" aria-controls="goalList"></select>`;
const goalProgress = document.createElement('div');
goalProgress.className = 'alfred-goal-progress';
goalProgress.innerHTML = `<div class="row between"><span class="small">FY27 goal progress</span>
  <strong class="alfred-goal-percent"></strong></div>
  <div class="alfred-goal-track" role="img"><div class="is-met"></div><div class="is-progress"></div></div>
  <div class="alfred-goal-key"></div>`;
expectationsCard.querySelector('label[for="arc-expectation-select"]').before(goalProgress);
const legacyGoalSelector = document.createElement('div');
legacyGoalSelector.hidden = true;
legacyGoalSelector.append($('goalPerson'));
expectationsCard.append(legacyGoalSelector, $('goalSummary'), $('goalList'));
// Expectations live on their own in-app page, not in a sidebar navigation tab.
const expectationsPage = document.createElement('section');
expectationsPage.id = 'expectation-dossier-page';
expectationsPage.className = 'page cinematic-dossier-page';
expectationsPage.innerHTML = `<div class="cinematic-page-head"><button type="button" class="btn cinematic-back" id="cinematic-back-profile">← Back to employee profile</button><span class="dossier-eyebrow">ALFRED / PERSONNEL INTELLIGENCE / FY27</span><h1>Employee Expectations</h1><p class="small" id="cinematic-employee-label"></p></div>`;
expectationsPage.append(expectationsCard);
profilePage.after(expectationsPage);
const launchDossier = document.createElement('button');
launchDossier.type = 'button';
launchDossier.className = 'btn accent cinematic-launch-dossier';
launchDossier.textContent = 'Open full expectations dossier →';
launchDossier.setAttribute('aria-label', 'Open all expectations for selected employee');
$('profileSummary').closest('.card').append(launchDossier);
launchDossier.onclick = () => { renderCompactExpectations(); go('expectation-dossier-page'); };
$('cinematic-back-profile').onclick = () => go('profile');
document.querySelector('.nav[data-page="goals"]')?.remove();
$('goals').remove();
const alertsCard = $('alerts').closest('.card');
alertsCard.querySelector('button[onclick="go(\'attendance\')"]')?.remove();

const expectationStatuses = ['Not assessed', 'In progress', 'Met', 'Not met', 'Pending review'];
let expectationDrafts = new WeakMap();
let compactProfileId = '', compactProfileRole = '', selectedExpectation = -1, expectationNotesOpen = false;
// Cinematic profile dossier: a read-only, all-at-once expectation overview.
// Existing editor and secureSave queue remain the only write paths.
const dossier = document.createElement('section');
dossier.className = 'alfred-expectation-dossier';
dossier.setAttribute('aria-label', 'Complete employee expectations dossier');
dossier.innerHTML = '<div class="dossier-heading"><div><span class="dossier-eyebrow">EMPLOYEE INTELLIGENCE / FY27</span><h3>Complete expectation dossier</h3><p class="small">All expectations at a glance. Select a card to update its status, evidence or follow-up below.</p></div><span class="dossier-count" aria-live="polite"></span></div><div class="dossier-grid"></div>';
expectationsCard.querySelector('label[for="arc-expectation-select"]').before(dossier);
function renderExpectationDossier(goals) {
  const grid = dossier.querySelector('.dossier-grid');
  grid.replaceChildren();
  dossier.querySelector('.dossier-count').textContent = `${goals.length} EXPECTATIONS`;
  if (!goals.length) {
    const empty = document.createElement('p');
    empty.className = 'small'; empty.textContent = 'No expectations are assigned.';
    grid.append(empty); return;
  }
  goals.forEach((goal, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'dossier-entry' + (selectedExpectation === index ? ' is-selected' : '');
    card.setAttribute('aria-pressed', String(selectedExpectation === index));
    card.setAttribute('aria-label', `Review expectation ${index + 1}: ${goal.expectation}, ${goal.status}`);
    const top = document.createElement('div'); top.className = 'dossier-entry-top';
    const code = document.createElement('span'); code.className = 'dossier-number'; code.textContent = String(index + 1).padStart(2, '0');
    const status = document.createElement('span'); status.className = 'dossier-status';
    status.dataset.status = goal.status || 'Not assessed'; status.textContent = goal.status || 'Not assessed';
    top.append(code, status);
    const category = document.createElement('span'); category.className = 'dossier-category'; category.textContent = goal.category || 'Expectation';
    const title = document.createElement('strong'); title.textContent = goal.expectation || 'Untitled expectation';
    const target = document.createElement('p'); target.textContent = 'TARGET  ' + (goal.target || 'Not specified');
    const scope = document.createElement('p'); scope.textContent = 'SCOPE  ' + (goal.scope || 'Not specified');
    const evidence = document.createElement('p'); evidence.textContent = 'EVIDENCE  ' + (goal.evidence || 'Not recorded');
    const followup = document.createElement('p'); followup.textContent = 'FOLLOW-UP  ' + (goal.notes || 'Not recorded');
    const updated = document.createElement('small'); updated.textContent = 'LAST UPDATED  ' + (goal.updated || 'Not yet updated');
    card.append(top, category, title, target, scope, evidence, followup, updated);
    card.onclick = () => {
      selectedExpectation = index;
      expectationNotesOpen = false;
      renderCompactExpectations();
      $('goalList').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
    };
    grid.append(card);
  });
}
const expectationSelect = $('arc-expectation-select');
const nextExpectation = $('arc-next-expectation');
function profileUsesLeadGoals(person) {
  return isTeamLead(person) && $('arc-expectation-set').value === 'lead';
}
function profileExpectationGoals(person) {
  return !person ? [] : profileUsesLeadGoals(person) ? person.teamLeadGoals || [] : person.goals;
}
function renderGoalProgress(goals, person) {
  goalProgress.hidden = !person;
  const total = goals.length;
  const met = goals.filter(goal => goal.status === 'Met').length;
  const working = goals.filter(goal => goal.status === 'In progress').length;
  const pct = total ? Math.round(100 * met / total) : 0;
  goalProgress.querySelector('.alfred-goal-percent').textContent = total ? `${pct}% met` : 'No goals';
  const track = goalProgress.querySelector('.alfred-goal-track');
  track.setAttribute('aria-label', `${met} of ${total} goals met, ${working} in progress, ${total - met - working} other`);
  track.querySelector('.is-met').style.width = `${total ? 100 * met / total : 0}%`;
  track.querySelector('.is-progress').style.width = `${total ? 100 * working / total : 0}%`;
  const key = goalProgress.querySelector('.alfred-goal-key');
  key.replaceChildren(...[[`${met} met`, 'is-met'], [`${working} in progress`, 'is-progress'],
    [`${total - met - working} remaining`, 'is-remaining']].map(([text, style]) => {
    const label = document.createElement('span'); label.className = style; label.textContent = text; return label;
  }));
}
$('arc-expectation-set').onchange = () => {
  selectedExpectation = -1;
  expectationNotesOpen = false;
  renderCompactExpectations();
};
function renderCompactExpectations() {
  const person = getPerson($('profilePerson').value);
  const leadSet = profileUsesLeadGoals(person);
  const goals = profileExpectationGoals(person);
  renderCompletedProfileGoals(arcReady ? person : null);
  renderGoalProgress(goals, person);
  $('cinematic-employee-label').textContent = person ? `${person.name} · Shift ${person.shift} · ${isTeamLead(person) ? 'Team Lead' : 'Technician'}` : 'No employee selected';
  renderExpectationDossier(goals);
  $('arc-expectation-set-field').hidden = !isTeamLead(person);
  expectationsCard.querySelector('h2').textContent = leadSet ? 'FY27 · Team Lead expectations' : 'FY27 expectations';
  expectationSelect.replaceChildren();
  const placeholder = new Option(goals.length ? 'Choose an FY27 expectation'
    : 'No expectations available', '');
  expectationSelect.add(placeholder);
  goals.forEach((goal, index) => {
    expectationSelect.add(new Option(
      `${goal.category} · ${goal.expectation} (${goal.status})`, String(index)));
  });
  expectationSelect.disabled = !goals.length;
  nextExpectation.disabled = !goals.some(goal => goal.status !== 'Met');
  $('goalSummary').textContent = person
    ? `${goals.filter(g => g.status === 'Met').length} / ${goals.length} met · ${goals.filter(g => g.status === 'In progress').length} in progress`
    : '';
  $('goalList').replaceChildren();
  if (!goals[selectedExpectation]) {
    selectedExpectation = -1;
    expectationSelect.value = '';
    return;
  }
  expectationSelect.value = String(selectedExpectation);
  const goal = goals[selectedExpectation], personId = person.id, goalIndex = selectedExpectation;
  const content = document.createElement('div');
  content.className = 'arc-expectation-content';
  const title = document.createElement('strong');
  title.textContent = goal.expectation;
  const target = document.createElement('p');
  target.className = 'small';
  target.textContent = `${goal.category} · Target: ${goal.target} · ${goal.scope}`;
  const label = document.createElement('label');
  label.className = 'small';
  label.htmlFor = 'arc-expectation-status';
  label.textContent = 'Status (saves automatically)';
  const status = document.createElement('select');
  status.id = 'arc-expectation-status';
  // Preserve a custom status from an imported backup until explicitly changed.
  for (const value of [...new Set([...expectationStatuses, goal.status])])
    status.add(new Option(value, value));
  status.value = goal.status;
  status.onchange = () => updateProfileExpectation(personId, goalIndex, 'status', status.value, leadSet);
  const notes = document.createElement('details');
  notes.className = 'arc-expectation-notes';
  notes.open = expectationNotesOpen;
  notes.ontoggle = () => {
    if (notes.isConnected && String($('profilePerson').value) === String(personId)
      && selectedExpectation === goalIndex) expectationNotesOpen = notes.open;
  };
  const summary = document.createElement('summary');
  summary.textContent = 'Evidence and follow-up';
  notes.append(summary);
  const draft = expectationDrafts.get(goal);
  for (const [field, text] of [['evidence', 'Actual / Evidence'], ['notes', 'Notes / Follow-up']]) {
    const fieldLabel = document.createElement('label');
    fieldLabel.className = 'small';
    fieldLabel.htmlFor = 'arc-expectation-' + field;
    fieldLabel.textContent = text;
    const input = document.createElement('textarea');
    input.id = fieldLabel.htmlFor;
    input.value = draft?.[field] ?? goal[field] ?? '';
    input.rows = 3;
    input.maxLength = 20000;
    input.readOnly = !draft || draft.saving;
    input.oninput = () => { if (draft && !draft.saving) draft[field] = input.value; };
    notes.append(fieldLabel, input);
  }
  const actions = document.createElement('div');
  actions.className = 'row alfred-goal-actions';
  const action = (label, callback, primary = false) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = primary ? 'btn accent' : 'btn';
    button.textContent = label;
    button.disabled = Boolean(draft?.saving);
    button.onclick = callback;
    actions.append(button);
  };
  if (!draft) action('Edit notes & evidence', () => {
    if (!arcReady || arcConflict) return;
    expectationDrafts.set(goal, { evidence: goal.evidence || '', notes: goal.notes || '', saving: false });
    expectationNotesOpen = true;
    renderCompactExpectations();
    $('arc-expectation-evidence')?.focus();
  });
  else {
    action(draft.saving ? 'Saving…' : 'Save notes & evidence', async () => {
      if (!arcReady || arcConflict || draft.saving || profileExpectationGoals(getPerson($('profilePerson').value))[selectedExpectation] !== goal) return;
      if (goal.evidence === draft.evidence && goal.notes === draft.notes) {
        expectationDrafts.delete(goal); renderCompactExpectations(); return;
      }
      goal.evidence = draft.evidence; goal.notes = draft.notes; goal.updated = today();
      draft.saving = true;
      renderCompactExpectations();
      try { await secureSave(); expectationDrafts.delete(goal); }
      catch { draft.failed = true; }
      finally {
        draft.saving = false;
        if (arcReady && profileExpectationGoals(getPerson($('profilePerson').value))[selectedExpectation] === goal)
          renderCompactExpectations();
      }
    }, true);
    if (!draft.failed) action('Cancel', () => { expectationDrafts.delete(goal); renderCompactExpectations(); });
  }
  notes.append(actions);
  if (draft?.failed) {
    const error = document.createElement('p');
    error.className = 'small';
    error.textContent = 'Not confirmed saved. Export pending changes before reloading.';
    notes.append(error);
  }
  const updated = document.createElement('p');
  updated.className = 'small';
  updated.id = 'arc-expectation-updated';
  updated.textContent = draft?.saving || draft?.failed ? 'Update not yet confirmed' : 'Last updated: ' + (goal.updated || 'Not yet updated');
  content.append(title, target, label, status, notes, updated);
  $('goalList').append(content);
}
function renderCompletedProfileGoals(person) {
  const summary = $('profileSummary');
  summary.querySelector('.fox-completed-goals')?.remove();
  const met = person ? [
    ...(person.goals || []),
    ...(isTeamLead(person) ? person.teamLeadGoals || [] : []),
  ].filter(goal => goal.status === 'Met') : [];
  const metCount = [...summary.querySelectorAll('.grid > .item')]
    .find(item => item.querySelector('.small')?.textContent === 'Goals Met')
    ?.querySelector('.metric');
  if (metCount) metCount.textContent = String(met.length);
  if (!met.length) return;
  const section = document.createElement('section');
  section.className = 'fox-completed-goals';
  section.setAttribute('aria-labelledby', 'fox-completed-goals-title');
  const heading = document.createElement('h2');
  heading.id = 'fox-completed-goals-title';
  heading.textContent = 'Completed goals';
  const list = document.createElement('ul');
  for (const goal of met) {
    const item = document.createElement('li');
    item.textContent = goal.expectation || 'Untitled goal';
    list.append(item);
  }
  section.append(heading, list);
  summary.querySelector('.grid')?.after(section);
}
function updateProfileExpectation(personId, goalIndex, field, value, leadSet = false) {
  if (!arcReady || arcConflict || String($('profilePerson').value) !== String(personId)) return;
  if (!['status', 'evidence', 'notes'].includes(field)) return;
  const person = getPerson(personId);
  if (profileUsesLeadGoals(person) !== leadSet) return;
  const goal = profileExpectationGoals(person)[goalIndex];
  if (!goal || goal[field] === value) return;
  goal[field] = value;
  goal.updated = today();
  // The existing save queue snapshots the complete document synchronously.
  // It reports failed/conflicting writes through the existing server status.
  save();
  if (field === 'status') {
    renderCompactExpectations();
  } else {
    const updated = $('arc-expectation-updated');
    if (updated && selectedExpectation === goalIndex)
      updated.textContent = 'Last updated: ' + goal.updated;
  }
}
expectationSelect.onchange = () => {
  selectedExpectation = expectationSelect.value === '' ? -1 : Number(expectationSelect.value);
  expectationNotesOpen = false;
  renderCompactExpectations();
};
nextExpectation.onclick = () => {
  const person = getPerson($('profilePerson').value);
  const goals = profileExpectationGoals(person);
  if (!goals.length) return;
  for (let offset = 1; offset <= goals.length; offset++) {
    const index = (selectedExpectation + offset) % goals.length;
    if (goals[index].status !== 'Met') {
      selectedExpectation = index;
      expectationNotesOpen = false;
      renderCompactExpectations();
      return;
    }
  }
};
renderGoals = renderCompactExpectations;
const arcProfileBeforeCompact = renderProfile;
renderProfile = function () {
  arcProfileBeforeCompact();
  const person = getPerson($('profilePerson').value);
  const id = person ? String(person.id) : '';
  $('arc-team-role').value = person?.teamRole || 'Technician';
  const heading = profilePage.querySelector('h1');
  heading.querySelector('.arc-lead-badge')?.remove();
  if (isTeamLead(person)) heading.append(makeLeadBadge());
  if (compactProfileId !== id || compactProfileRole !== (person?.teamRole || 'Technician')) {
    compactProfileId = id;
    compactProfileRole = person?.teamRole || 'Technician';
    selectedExpectation = -1;
    expectationNotesOpen = false;
    $('arc-expectation-set').value = 'lead';
    closeProfileDetails();
  }
  // The profile is the single source of technician selection for expectations.
  $('goalPerson').value = id;
  renderCompactExpectations();
};
const arcGoBeforeCompact = go;
go = function (page) {
  if (page !== 'profile' && page !== 'goals' && page !== 'expectation-dossier-page') closeProfileDetails();
  arcGoBeforeCompact(page === 'goals' ? 'profile' : page);
};
const arcRenderBeforeClickableAlerts = render;
const homeHero = $('home').querySelector('.hero');
const homeDate = document.createElement('time');
homeDate.className = 'home-date';
const homeDateLabel = document.createElement('span');
homeDateLabel.className = 'home-date-label';
homeDateLabel.textContent = 'Local date';
const homeDateValue = document.createElement('span');
homeDate.append(homeDateLabel, homeDateValue);
homeHero.querySelector('.eyebrow').after(homeDate);
const homeSweep = document.createElement('span');
homeSweep.className = 'home-sweep';
homeSweep.setAttribute('aria-hidden', 'true');
homeHero.append(homeSweep);
const homeDateFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'long', month: 'short', day: 'numeric', year: 'numeric',
});
function refreshHomeDate() {
  homeDate.dateTime = today();
  homeDateValue.textContent = homeDateFormat.format(new Date());
}
const homeTaskPanel = $('dashboardTasks').closest('.card');
homeTaskPanel.classList.add('home-tasks');
homeHero.after(homeTaskPanel);
homeTaskPanel.querySelector('h2').textContent = 'Open tasks';
const homeTaskLink = homeTaskPanel.querySelector('button');
homeTaskLink.textContent = 'View open tasks';
homeTaskLink.onclick = () => { setTaskFilter('open'); go('tasks'); };
function renderHomeTasks() {
  const container = $('dashboardTasks');
  const open = db.tasks.filter(task => !task.done);
  const currentDay = today();
  const priority = { Critical: 0, High: 1, Normal: 2, Low: 3 };
  const items = open.map(task => {
    const due = typeof task.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(task.due) ? task.due : '';
    return { task, due, overdue: Boolean(due && due < currentDay) };
  }).sort((a, b) => Number(b.overdue) - Number(a.overdue)
    || (priority[a.task.priority] ?? 2) - (priority[b.task.priority] ?? 2)
    || (a.due || '9999').localeCompare(b.due || '9999'));
  container.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No open tasks.';
    container.append(empty);
    return;
  }
  for (const { task, due, overdue } of items.slice(0, 4)) {
    const item = document.createElement('div');
    item.className = overdue ? 'item is-overdue' : 'item';
    const title = document.createElement('strong');
    title.textContent = task.title;
    const details = document.createElement('div');
    details.className = 'task-meta';
    details.textContent = [overdue ? 'Overdue' : 'Open', task.priority || 'Normal', due && `Due ${due}`].filter(Boolean).join(' · ');
    item.append(title, details);
    container.append(item);
  }
}
// Acknowledgments cover existing point-bearing events only. An expired
// event need not still be active; a new or corrected event can raise an alert.
const pendingAttendanceAcks = new Map();
function attendanceAlertKeys(person) {
  return person.events.filter(event => isActive(event) && eventPoints(event) > 0)
    .map(event => JSON.stringify([String(event.id), event.date, [...event.types].sort()]));
}
async function acknowledgeAttendanceAlert(person, keys) {
  if (!arcReady || !arcToken || !db.people.includes(person) || pendingAttendanceAcks.has(person)) return false;
  if (arcConflict) {
    statusMessage('Resolve unsaved changes before acknowledging alerts.', true);
    return false;
  }
  const token = arcToken, previous = person.acknowledgedAttendanceAlert, pending = { previous };
  pendingAttendanceAcks.set(person, pending);
  person.acknowledgedAttendanceAlert = keys;
  try {
    await secureSave();
    return arcReady && arcToken === token;
  } catch {
    if (person.acknowledgedAttendanceAlert === keys) {
      if (previous === undefined) delete person.acknowledgedAttendanceAlert;
      else person.acknowledgedAttendanceAlert = previous;
    }
    return false;
  } finally {
    pendingAttendanceAcks.delete(person);
    if (arcReady && arcToken === token) renderOverviewAlerts();
  }
}
function renderOverviewAlerts() {
  const list = $('alerts');
  list.replaceChildren();
  let countVisible = 0;
  for (const person of arcReady ? db.people : []) {
    const total = points(person);
    if (total < 6) continue;
    const keys = attendanceAlertKeys(person);
    const pending = pendingAttendanceAcks.get(person);
    const acknowledged = new Set(pending ? pending.previous : person.acknowledgedAttendanceAlert);
    if (keys.every(key => acknowledged.has(key))) continue;
    countVisible++;
    const row = document.createElement('div');
    row.className = 'arc-attention-row';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'alert arc-profile-alert';
    const name = document.createElement('span');
    name.textContent = `${person.name} · Shift ${person.shift}`;
    const count = document.createElement('strong');
    count.className = 'orange';
    count.textContent = `${total} points`;
    button.append(name, count);
    button.setAttribute('aria-label', `Open ${person.name}'s technician profile, ${total} attendance points`);
    button.onclick = () => openProfile(person.id);
    const acknowledge = document.createElement('button');
    acknowledge.type = 'button'; acknowledge.className = 'btn arc-alert-ack';
    acknowledge.textContent = pending ? 'Saving…' : 'Acknowledge'; acknowledge.disabled = Boolean(pending);
    acknowledge.setAttribute('aria-label', 'Acknowledge attendance alert for ' + person.name);
    acknowledge.onclick = async () => {
      const focused = document.activeElement === acknowledge;
      acknowledge.disabled = true; acknowledge.textContent = 'Saving…';
      const saved = await acknowledgeAttendanceAlert(person, keys);
      if (acknowledge.isConnected) { acknowledge.disabled = false; acknowledge.textContent = 'Acknowledge'; }
      if (focused && saved && document.activeElement === document.body && $('home').classList.contains('active'))
        (list.querySelector('.arc-alert-ack:not(:disabled)') || list).focus({ preventScroll: true });
    };
    row.append(button, acknowledge); list.append(row);
  }
  list.tabIndex = -1;
  if (!countVisible) {
    const empty = document.createElement('p');
    empty.textContent = 'No unacknowledged attendance alerts.';
    list.append(empty);
  }
  const tile = [...$('metrics').children].find(card => card.querySelector('.small')?.textContent === '6+ Point Alerts');
  if (tile) tile.querySelector('.metric').textContent = String(countVisible);
}
render = function () {
  arcRenderBeforeClickableAlerts();
  refreshHomeDate();
  renderHomeTasks();
  renderOverviewAlerts();
};
// View-only task highlights. A completed task takes precedence over its due
// date; an open task becomes overdue only after its local-calendar due day.
let taskGlowTimer = 0;
function scheduleTaskGlowRefresh() {
  clearTimeout(taskGlowTimer);
  if (!arcReady || document.hidden) return;
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  taskGlowTimer = setTimeout(() => {
    refreshHomeDate();
    renderHomeTasks();
    renderOverviewAlerts();
    if ($('tasks').classList.contains('active')) renderTasks();
    else scheduleTaskGlowRefresh();
  }, midnight.getTime() - now.getTime() + 100);
}
const arcTasksBeforeGlow = renderTasks;
renderTasks = function () {
  arcTasksBeforeGlow();
  const currentDay = today();
  const shown = db.tasks.filter(task => taskFilter === 'all'
    || (taskFilter === 'open' ? !task.done : task.done));
  const cards = $('taskList').querySelectorAll(':scope > .task-card');
  shown.forEach((task, index) => {
    const card = cards[index];
    if (!card) return;
    const due = typeof task.due === 'string' ? task.due : '';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(due + 'T00:00:00Z') : null;
    const overdue = !task.done && date && Number.isFinite(date.getTime())
      && date.toISOString().slice(0, 10) === due && due < currentDay;
    card.classList.add(task.done ? 'arc-task-complete' : overdue ? 'arc-task-overdue' : 'arc-task-open');
    const header = document.createElement('div');
    header.className = 'arc-task-highlight-header';
    const priority = card.querySelector('.priority');
    if (priority) header.append(priority);
    const badge = document.createElement('span');
    badge.className = 'arc-task-state';
    badge.textContent = task.done ? 'COMPLETED' : overdue ? 'OVERDUE' : 'OPEN';
    header.append(badge);
    card.prepend(header);
  });
  scheduleTaskGlowRefresh();
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(taskGlowTimer);
  else if (arcReady) {
    refreshHomeDate();
    renderHomeTasks();
    if ($('tasks').classList.contains('active')) renderTasks();
    else scheduleTaskGlowRefresh();
  }
});
window.addEventListener('pagehide', () => clearTimeout(taskGlowTimer));
window.addEventListener('pageshow', () => {
  refreshHomeDate();
  if (arcReady && $('tasks').classList.contains('active')) renderTasks();
  else scheduleTaskGlowRefresh();
});
const arcSelectorsBeforeLeadBadges = renderSelectors;
renderSelectors = function () {
  arcSelectorsBeforeLeadBadges();
  for (const id of ['profilePerson', 'attPerson', 'coachPerson', 'goalPerson'])
    for (const option of $(id).options)
      if (isTeamLead(getPerson(option.value))) option.textContent += ' · TEAM LEAD';
};
reactor.setAttribute('aria-label', 'FOX emblem');
reactor.innerHTML = `<img class="fox-hero-emblem" src="./fox-emblem.webp" alt="" width="768" height="768" decoding="async">`;

// Rise Up entries follow the technician's stable ID and travel with ARC backups.
const risePerson = $('risePerson'), riseBuilding = $('riseBuilding'), riseDate = $('riseDate');
const riseNote = $('riseNote'), riseFeedback = $('riseFeedback'), riseSave = $('riseSave'), riseCancel = $('riseCancel');
const riseHistory = $('riseHistory');
let riseEditing = null, riseSaving = false, riseSelected = null;
riseBuilding.add(new Option('Select a building', ''));
for (const building of RISE_BUILDINGS) riseBuilding.add(new Option(building, building));
function riseLink(person, profile) {
  const count = person.riseUp?.length ?? 0;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = profile ? 'item rise-up-profile' : 'rise-up-count';
  if (profile) {
    const label = document.createElement('span'), metric = document.createElement('span');
    label.className = 'small'; label.textContent = 'Rise Up';
    metric.className = 'metric'; metric.textContent = String(count);
    button.append(label, metric);
  } else button.textContent = String(count);
  button.setAttribute('aria-label', `${person.name}: ${count} Rise Up ${count === 1 ? 'entry' : 'entries'}. Open history.`);
  button.onclick = () => {
    if (!arcReady || riseSaving) return;
    if (riseSelected !== String(person.id)) resetRiseForm();
    riseSelected = String(person.id);
    go('riseup');
  };
  return button;
}
function renderRiseProfile() {
  const grid = $('profileSummary').querySelector('.grid');
  const person = arcReady ? getPerson($('profilePerson').value) : null;
  grid?.querySelector('.rise-up-profile')?.remove();
  if (person && grid) grid.append(riseLink(person, true));
}
function resetRiseForm() {
  riseEditing = null;
  riseDate.value = arcReady ? today() : '';
  riseBuilding.value = ''; riseNote.value = ''; riseFeedback.textContent = '';
  $('riseFormTitle').textContent = 'Add an entry';
  riseSave.textContent = 'Save entry'; riseCancel.hidden = true;
}
function renderRiseUp() {
  const roster = arcReady ? orderedPeople(db.people) : [];
  risePerson.replaceChildren(...roster.map(person => new Option(`${person.name} · Shift ${person.shift}`, String(person.id))));
  if (roster.some(person => String(person.id) === riseSelected)) risePerson.value = riseSelected;
  const current = risePerson.value || null;
  if (current !== riseSelected || !arcReady) resetRiseForm();
  riseSelected = current;
  const person = current === null ? null : getPerson(current);
  const entries = person?.riseUp ?? [];
  if (riseEditing !== null && !entries.some(entry => String(entry.id) === riseEditing)) resetRiseForm();
  risePerson.disabled = riseSaving || !roster.length;
  for (const control of [riseBuilding, riseDate, riseNote, riseSave, riseCancel]) control.disabled = riseSaving || !person;
  $('riseTotal').textContent = person ? `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}` : '';
  riseHistory.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.textContent = person ? 'No Rise Up entries yet.' : 'No technician selected.';
    riseHistory.append(empty);
  }
  for (const entry of [...entries].reverse().sort((a, b) => b.date.localeCompare(a.date))) {
    const item = document.createElement('article'); item.className = 'item rise-up-entry';
    const meta = document.createElement('div'); meta.className = 'row between';
    const heading = document.createElement('strong'); heading.textContent = 'Building ' + entry.building;
    const date = document.createElement('time'); date.className = 'small'; date.dateTime = date.textContent = entry.date;
    meta.append(heading, date);
    const note = document.createElement('p'); note.textContent = entry.note;
    const actions = document.createElement('div'); actions.className = 'row';
    const edit = document.createElement('button'), remove = document.createElement('button');
    edit.type = remove.type = 'button'; edit.className = 'btn'; remove.className = 'btn danger';
    edit.textContent = 'Edit'; remove.textContent = 'Delete';
    edit.disabled = remove.disabled = riseSaving;
    edit.onclick = () => {
      if (riseSaving || !arcReady) return;
      riseEditing = String(entry.id); riseBuilding.value = entry.building;
      riseDate.value = entry.date; riseNote.value = entry.note; riseFeedback.textContent = '';
      $('riseFormTitle').textContent = 'Edit entry';
      riseSave.textContent = 'Save changes'; riseCancel.hidden = false;
      riseBuilding.focus();
    };
    remove.onclick = () => { if (!riseSaving) requestArcDelete(person.id, entry.id, 'riseup'); };
    actions.append(edit, remove); item.append(meta, note, actions); riseHistory.append(item);
  }
}
risePerson.onchange = () => { riseSelected = risePerson.value; resetRiseForm(); renderRiseUp(); };
riseCancel.onclick = () => { resetRiseForm(); riseBuilding.focus(); };
$('riseForm').onsubmit = async event => {
  event.preventDefault();
  if (riseSaving || !arcReady) return;
  if (arcConflict) { riseFeedback.textContent = 'Resolve the previous save conflict before editing.'; return; }
  const person = getPerson(riseSelected), building = riseBuilding.value, date = riseDate.value, note = riseNote.value.trim();
  if (!person || !RISE_BUILDINGS.includes(building) || !validRiseDate(date) || !note || note.length > 4000) {
    riseFeedback.textContent = 'Choose a building and valid date, and describe the work (up to 4,000 characters).';
    return;
  }
  const previous = person.riseUp, entries = [...(previous ?? [])];
  if (riseEditing === null) {
    if (entries.length >= 10000) { riseFeedback.textContent = 'This technician has reached the entry limit.'; return; }
    entries.push({ id: crypto.randomUUID(), building, date, note });
  } else {
    const index = entries.findIndex(entry => String(entry.id) === riseEditing);
    if (index < 0) { riseFeedback.textContent = 'This entry is no longer available.'; return; }
    entries[index] = { id: entries[index].id, building, date, note };
  }
  const token = arcToken;
  riseSaving = true;
  renderRiseUp();
  riseFeedback.textContent = 'Saving…';
  person.riseUp = entries;
  try {
    await secureSave();
    if (arcReady && arcToken === token) {
      resetRiseForm();
      renderGroupedOverview(); renderRiseProfile();
      riseFeedback.textContent = 'Rise Up entry saved.';
    }
  } catch (error) {
    // Retain the typed form, but only count records confirmed by the server.
    if (person.riseUp === entries) {
      if (previous === undefined) delete person.riseUp;
      else person.riseUp = previous;
    }
    if (arcReady && arcToken === token) {
      renderGroupedOverview(); renderRiseProfile();
      riseFeedback.textContent = 'Not saved: ' + error.message;
    }
  } finally {
    riseSaving = false;
    renderRiseUp();
  }
};
const profileBeforeRiseUp = renderProfile;
renderProfile = function () { profileBeforeRiseUp(); renderRiseProfile(); };
const renderBeforeRiseUp = render;
render = function () { renderBeforeRiseUp(); renderRiseUp(); };
arcToken = storedSession();
if (arcToken) loadServer().catch(async error => {
  storeSession(null); showLock(); await refreshAlfredLogin(); statusMessage(error.message, true);
});
else { showLock(); refreshAlfredLogin(); }
