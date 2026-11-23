import { createServer } from 'node:http';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, statSync, createReadStream } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { isDeepStrictEqual } from 'node:util';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(ROOT, 'public');
const BACKUP_FILE = resolve(ROOT, 'private-release', 'alfred-staged-backup.encrypted.json');
const PORT = Number.parseInt(process.env.PORT || '5000', 10);
const DB_PATH = process.env.DATABASE_PATH || resolve(ROOT, 'data.db');
const HOSTED_RELEASE = process.env.FOX_HOSTED_RELEASE === '1' || process.argv.includes('--hosted');
const OWNER_EMAIL = (process.env.FOX_OWNER_EMAIL || '').trim().toLowerCase();
const SETUP_HASH = (process.env.ALFRED_SETUP_KEY_HASH || '').trim().toLowerCase();
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
if (HOSTED_RELEASE && (!EMAIL_PATTERN.test(OWNER_EMAIL) || OWNER_EMAIL.length > 254 || !/^[0-9a-f]{64}$/.test(SETUP_HASH))) {
  throw new Error('Set FOX_OWNER_EMAIL and a valid ALFRED_SETUP_KEY_HASH before starting hosted FOX.');
}
if (HOSTED_RELEASE) process.umask(0o077);
const SESSION_TTL_MS = HOSTED_RELEASE ? 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
const MAX_BODY = 5 * 1024 * 1024;
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  ...(HOSTED_RELEASE ? { 'Strict-Transport-Security': 'max-age=31536000', 'X-Robots-Tag': 'noindex, nofollow' } : {}),
  'Content-Security-Policy': "default-src 'self' data: blob:; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; script-src-elem 'self'",
};
const JSON_HEADERS = {
  ...SECURITY_HEADERS,
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, private',
};

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS arc_revisions (
    revision INTEGER PRIMARY KEY,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key=?');
const setSettingStmt = db.prepare(`
  INSERT INTO settings(key,value) VALUES(?,?)
  ON CONFLICT(key) DO UPDATE SET value=excluded.value
`);
const sessionGetStmt = db.prepare('SELECT expires_at AS expiresAt FROM sessions WHERE token_hash=?');
const sessionPutStmt = db.prepare('INSERT OR REPLACE INTO sessions(token_hash,created_at,expires_at) VALUES(?,?,?)');
const sessionDeleteStmt = db.prepare('DELETE FROM sessions WHERE token_hash=?');
const sessionPruneStmt = db.prepare('DELETE FROM sessions WHERE expires_at < ?');
const revisionLatestStmt = db.prepare('SELECT revision,payload FROM arc_revisions ORDER BY revision DESC LIMIT 1');
const revisionInsertStmt = db.prepare('INSERT INTO arc_revisions(revision,payload,created_at) VALUES(?,?,?)');

const officialLeadExpectations = JSON.parse(readFileSync(resolve(ROOT, 'team-lead-expectations.json'), 'utf8'));
let stagedBackupText = null;
if (!HOSTED_RELEASE && existsSync(BACKUP_FILE)) {
  const candidate = readFileSync(BACKUP_FILE, 'utf8');
  const parsed = JSON.parse(candidate);
  if (parsed?.format !== 'jarvis-aes-gcm-v1' || Buffer.byteLength(candidate) > 4 * 1024 * 1024) {
    throw new Error('The staged ALFRED backup is invalid or too large.');
  }
  stagedBackupText = candidate;
}

function getSetting(key) {
  return getSettingStmt.get(key)?.value;
}
function setSetting(key, value) {
  setSettingStmt.run(key, String(value));
}
function managerEmail() {
  const email = getSetting('manager_email');
  return email && email.includes('@') ? email : null;
}
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
function scryptHash(pin, saltHex) {
  return scryptSync(pin, Buffer.from(saltHex, 'hex'), 64).toString('hex');
}
function constantTimeHexEqual(a, b) {
  try {
    const left = Buffer.from(a, 'hex');
    const right = Buffer.from(b, 'hex');
    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
}
function createSession() {
  const token = (HOSTED_RELEASE ? 'foxh_' : '') + randomBytes(32).toString('base64url');
  const now = new Date();
  sessionPruneStmt.run(now.toISOString());
  sessionPutStmt.run(sha256(token), now.toISOString(), new Date(now.getTime() + SESSION_TTL_MS).toISOString());
  return token;
}
function validSession(token) {
  if (!token || (HOSTED_RELEASE && !/^foxh_[A-Za-z0-9_-]{43}$/.test(token))) return false;
  const row = sessionGetStmt.get(sha256(token));
  return Boolean(row && row.expiresAt > new Date().toISOString());
}
function sendJson(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { ...JSON_HEADERS, 'Content-Length': data.length });
  res.end(data);
}
function sendText(res, status, text, type = 'text/plain; charset=utf-8') {
  const data = Buffer.from(text);
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': data.length,
    ...SECURITY_HEADERS,
  });
  res.end(data);
}
async function readJson(req, limit = MAX_BODY) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON request.'), { status: 400 });
  }
}
function bearer(req) {
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}
function requireSession(req, res) {
  const token = bearer(req);
  if (!validSession(token)) {
    sendJson(res, 401, { message: 'Authentication required' });
    return null;
  }
  return { token, hash: sha256(token) };
}
function readCurrent() {
  const row = revisionLatestStmt.get();
  return row ? { revision: row.revision, data: JSON.parse(row.payload) } : { revision: 0, data: { people: [], tasks: [] } };
}
function saveCurrent(expected, data) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = revisionLatestStmt.get()?.revision ?? 0;
    if (current !== expected) {
      db.exec('ROLLBACK');
      return null;
    }
    const next = current + 1;
    revisionInsertStmt.run(next, JSON.stringify(data), new Date().toISOString());
    db.exec('COMMIT');
    return next;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* no active transaction */ }
    throw error;
  }
}

const idPattern = /^[A-Za-z0-9_-]{1,100}$/;
function validId(value) {
  return (Number.isInteger(value) && value >= 0) || (typeof value === 'string' && idPattern.test(value));
}
function validText(value, max = 20000) {
  return typeof value === 'string' && value.length <= max;
}
function validateGoal(goal) {
  return goal && ['category', 'expectation', 'target', 'scope', 'status', 'evidence', 'notes', 'updated']
    .every((key) => validText(goal[key]));
}
function validateDocument(data) {
  if (!data || !Array.isArray(data.people) || data.people.length > 5000 || !Array.isArray(data.tasks) || data.tasks.length > 10000) return false;
  if (data.teamLeadExpectations !== undefined && (!Array.isArray(data.teamLeadExpectations) || data.teamLeadExpectations.length > 200 || !data.teamLeadExpectations.every(validateGoal))) return false;
  const peopleIds = new Set();
  for (const person of data.people) {
    if (!person || !validId(person.id) || peopleIds.has(String(person.id)) || !validText(person.name, 500) || !['1', '2', '3', '4'].includes(String(person.shift))) return false;
    peopleIds.add(String(person.id));
    if (person.teamRole !== undefined && !['Technician', 'Team Lead'].includes(person.teamRole)) return false;
    if (!Array.isArray(person.events) || person.events.length > 10000 || !Array.isArray(person.coaching) || person.coaching.length > 10000 || !Array.isArray(person.goals) || person.goals.length > 200) return false;
    if (!person.goals.every(validateGoal)) return false;
    if (person.teamLeadGoals !== undefined && (!Array.isArray(person.teamLeadGoals) || person.teamLeadGoals.length > 200 || !person.teamLeadGoals.every(validateGoal))) return false;
    for (const event of person.events) {
      if (!event || !validId(event.id) || !/^\d{4}-\d{2}-\d{2}$/.test(event.date || '') || !Array.isArray(event.types) || event.types.length > 4 || !event.types.every((type) => ['Tardy', 'Call-in violation', 'Unexcused', 'Present'].includes(type))) return false;
      if (event.notes !== undefined && !validText(event.notes)) return false;
    }
    for (const note of person.coaching) {
      if (!note || !validId(note.id) || !validText(note.date) || !validText(note.area) || !validText(note.note)) return false;
    }
    if (person.riseUp !== undefined) {
      if (!Array.isArray(person.riseUp) || person.riseUp.length > 10000) return false;
      const riseIds = new Set();
      for (const entry of person.riseUp) {
        if (!entry || !validId(entry.id) || riseIds.has(String(entry.id)) || !['1150/55', '1175', '1180', '1195', '2000'].includes(entry.building) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date || '') || !validText(entry.note, 4000) || !entry.note.trim()) return false;
        riseIds.add(String(entry.id));
      }
    }
    if (person.acknowledgedAttendanceAlert !== undefined && (!Array.isArray(person.acknowledgedAttendanceAlert) || person.acknowledgedAttendanceAlert.length > 10000 || !person.acknowledgedAttendanceAlert.every((value) => validText(value, 240)))) return false;
  }
  const taskIds = new Set();
  for (const task of data.tasks) {
    if (!task || !validId(task.id) || taskIds.has(String(task.id)) || !validText(task.title) || typeof task.done !== 'boolean') return false;
    taskIds.add(String(task.id));
    if (task.priority !== undefined && !['Low', 'Normal', 'High', 'Critical'].includes(task.priority)) return false;
    if (task.due !== undefined && !validText(task.due)) return false;
  }
  return true;
}

const attempts = new Map();
function blocked(key) {
  const current = attempts.get(key);
  if (!current) return false;
  if (Date.now() > current.reset) { attempts.delete(key); return false; }
  return current.count >= 5;
}
function failAttempt(key) {
  if (attempts.size >= 2048) {
    for (const [id, state] of attempts) if (Date.now() >= state.reset) attempts.delete(id);
    if (attempts.size >= 2048 && !attempts.has(key)) attempts.delete(attempts.keys().next().value);
  }
  const current = attempts.get(key) || { count: 0, reset: Date.now() + 15 * 60_000 };
  current.count += 1;
  attempts.set(key, current);
}
function clearAttempt(key) { attempts.delete(key); }
function clientKey(req, suffix = '') {
  // Enable only behind Render's public ingress, which overwrites this
  // header. Generic Docker deployments trust the socket address instead.
  const edgeAddress = String(req.headers['cf-connecting-ip'] || '').trim();
  const forwarded = HOSTED_RELEASE
    ? (process.env.FOX_TRUST_RENDER_EDGE === '1' && isIP(edgeAddress) ? edgeAddress : '')
    : String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (forwarded || req.socket.remoteAddress || 'unknown') + suffix;
}

function validPasscode(value) {
  return HOSTED_RELEASE ? value.length >= 16 && value.length <= 128 && /\S/.test(value) : /^\d{6}$/.test(value);
}

async function api(req, res, url) {
  const path = url.pathname;
  if (path === '/api/health' && req.method === 'GET') return sendJson(res, 200, { ok: true, service: 'FOX', stagedBackup: Boolean(stagedBackupText) });
  if (path === '/api/auth/status' && req.method === 'GET') {
    return sendJson(res, 200, {
      hasPasscode: Boolean(getSetting('passcode_hash')),
      hasEmail: Boolean(managerEmail()),
      needsSetupKey: !getSetting('passcode_hash') && Boolean(SETUP_HASH),
      hostedRelease: HOSTED_RELEASE,
      emailRecovery: false,
    });
  }
  if (path === '/api/auth/setup' && req.method === 'POST') {
    if (getSetting('passcode_hash')) return sendJson(res, 409, { message: 'Passcode already set' });
    const key = clientKey(req, ':setup');
    if (HOSTED_RELEASE && blocked(key)) return sendJson(res, 429, { message: 'Too many attempts. Try again later.' });
    const body = await readJson(req, 4096);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const pin = typeof body?.passcode === 'string' ? body.passcode : '';
    if (!EMAIL_PATTERN.test(email) || email.length > 254) return sendJson(res, 400, { message: 'Enter a valid email address' });
    if (!validPasscode(pin)) return sendJson(res, 400, { message: HOSTED_RELEASE ? 'Use a passphrase of 16 to 128 characters' : 'PIN must be exactly six digits' });
    if (SETUP_HASH) {
      const supplied = typeof body.setupKey === 'string' ? sha256(body.setupKey.trim()) : '';
      if (!/^[a-f0-9]{64}$/.test(SETUP_HASH) || !constantTimeHexEqual(supplied, SETUP_HASH) || (HOSTED_RELEASE && email !== OWNER_EMAIL)) {
        if (HOSTED_RELEASE) failAttempt(key);
        return sendJson(res, 403, { message: 'Setup requires the configured owner email and activation code.' });
      }
    }
    // Reading the request body yielded to other requests; check again before writing.
    if (getSetting('passcode_hash')) return sendJson(res, 409, { message: 'Passcode already set' });
    const salt = randomBytes(16).toString('hex');
    const hash = scryptHash(pin, salt);
    db.exec('BEGIN IMMEDIATE');
    try {
      setSetting('passcode_salt', salt);
      setSetting('passcode_hash', hash);
      setSetting('manager_email', email);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    clearAttempt(key);
    return sendJson(res, 200, { ok: true, token: createSession() });
  }
  if (path === '/api/auth/login' && req.method === 'POST') {
    const key = clientKey(req, ':login');
    if (blocked(key) || (!HOSTED_RELEASE && blocked('global:login'))) return sendJson(res, 429, { message: 'Too many attempts. Try again later.' });
    const body = await readJson(req, 4096);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const pin = typeof body?.passcode === 'string' ? body.passcode : '';
    const salt = getSetting('passcode_salt');
    const storedHash = getSetting('passcode_hash');
    const storedEmail = managerEmail();
    const candidate = validPasscode(pin) && salt ? scryptHash(pin, salt) : '';
    const ok = Boolean(candidate && storedHash && storedEmail && email === storedEmail
      && (!HOSTED_RELEASE || email === OWNER_EMAIL) && constantTimeHexEqual(candidate, storedHash));
    if (!ok) {
      failAttempt(key);
      if (!HOSTED_RELEASE) failAttempt('global:login');
      return sendJson(res, 401, { message: 'Incorrect email or passcode' });
    }
    clearAttempt(key); clearAttempt('global:login');
    return sendJson(res, 200, { ok: true, token: createSession() });
  }
  if (path === '/api/auth/forgot' && req.method === 'POST') return sendJson(res, 200, { ok: true, sent: false });
  if (path === '/api/auth/reset' && req.method === 'POST') return sendJson(res, 403, { message: 'Email recovery is not configured.' });
  if (path === '/api/auth/logout' && req.method === 'POST') {
    const session = requireSession(req, res); if (!session) return;
    sessionDeleteStmt.run(session.hash);
    return sendJson(res, 200, { ok: true });
  }

  const session = requireSession(req, res); if (!session) return;
  if (path === '/api/fox/shift-schedule' && req.method === 'GET') {
    let schedule = null;
    try { schedule = JSON.parse(getSetting('fox_shift_schedule') || 'null'); } catch { schedule = null; }
    return sendJson(res, 200, { schedule });
  }
  if (path === '/api/fox/shift-schedule' && req.method === 'POST') {
    const body = await readJson(req);
    const s = body && body.schedule;
    const valid = s && typeof s === 'object'
      && typeof s.anchor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.anchor)
      && Array.isArray(s.pattern) && s.pattern.length === 14 && s.pattern.every((v) => v === '2' || v === '4' || v === '')
      && typeof s.dayStart === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.dayStart);
    if (!valid) return sendJson(res, 400, { message: 'Invalid shift schedule.' });
    setSetting('fox_shift_schedule', JSON.stringify({ anchor: s.anchor, pattern: s.pattern, dayStart: s.dayStart }));
    return sendJson(res, 200, { ok: true });
  }
  if (path === '/api/arc/staged-backup' && req.method === 'GET') {
    if (!stagedBackupText) return sendJson(res, 404, { message: 'No encrypted backup is staged. You can still restore a backup file.' });
    const data = Buffer.from(stagedBackupText);
    res.writeHead(200, { ...JSON_HEADERS, 'Content-Length': data.length });
    return res.end(data);
  }
  if (path === '/api/arc/state' && req.method === 'GET') {
    const current = readCurrent();
    return sendJson(res, 200, {
      revision: current.revision,
      data: current.data,
      officialLeadExpectations,
      defaultLeadNames: (process.env.FOX_DEFAULT_LEAD_NAMES || '').split(',').map(name => name.trim().replace(/\s+/g, ' ').toLowerCase()).filter(Boolean),
      emailRecovery: false,
      stagedBackup: Boolean(stagedBackupText),
    });
  }
  if (path === '/api/arc/state' && req.method === 'POST') {
    const body = await readJson(req);
    if (!Number.isInteger(body.revision) || body.revision < 0 || !validateDocument(body.data)) return sendJson(res, 400, { message: 'Invalid record or backup fields. Nothing was saved.' });
    const next = saveCurrent(body.revision, body.data);
    if (next === null) return sendJson(res, 409, { message: 'Another device saved changes. Reload before continuing.' });
    return sendJson(res, 200, { ok: true, revision: next });
  }
  if (path === '/api/arc/delete-record' && req.method === 'POST') {
    const body = await readJson(req);
    if (!['attendance', 'coaching', 'riseup'].includes(body.kind) || !validId(body.personId) || !validId(body.recordId) || !body.expectedRecord || typeof body.expectedRecord !== 'object') return sendJson(res, 400, { message: 'Invalid deletion request. Nothing was deleted.' });
    const current = readCurrent();
    const data = structuredClone(current.data);
    const person = data.people.find((entry) => String(entry.id) === String(body.personId));
    if (!person) return sendJson(res, 404, { message: 'Technician not found. Nothing was deleted.' });
    const records = body.kind === 'attendance' ? person.events : body.kind === 'coaching' ? person.coaching : (person.riseUp || []);
    const matches = records.filter((record) => String(record.id) === String(body.recordId));
    if (!matches.length) return sendJson(res, 200, { revision: current.revision, data, deleted: false });
    if (matches.length !== 1 || !isDeepStrictEqual(matches[0], body.expectedRecord)) return sendJson(res, 412, { message: 'This record changed on another device. Reload and review it before deleting. Nothing was deleted.' });
    if (body.kind !== 'riseup') {
      const auditKey = body.kind === 'attendance' ? 'deletedAttendanceEvents' : 'deletedCoachingNotes';
      if (data[auditKey] !== undefined && !Array.isArray(data[auditKey])) return sendJson(res, 400, { message: 'Deletion history needs recovery. Nothing was deleted.' });
      data[auditKey] ||= [];
      data[auditKey].push({
        personId: person.id,
        personName: person.name,
        deletedAt: new Date().toISOString(),
        [body.kind === 'attendance' ? 'event' : 'note']: matches[0],
      });
    }
    records.splice(records.indexOf(matches[0]), 1);
    const next = saveCurrent(current.revision, data);
    if (next === null) return sendJson(res, 409, { message: 'Another device saved changes. Reload before deleting. Nothing was deleted.' });
    return sendJson(res, 200, { revision: next, data, deleted: true });
  }
  return sendJson(res, 404, { message: 'API route not found' });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4',
};
function serveStatic(req, res, url) {
  const requestPath = decodeURIComponent(url.pathname);
  const lowerPath = requestPath.toLowerCase();
  if (lowerPath.startsWith('/private-release') || lowerPath === '/data.db'
    || lowerPath === '/server.mjs' || lowerPath === '/package.json'
    || lowerPath === '/dockerfile' || lowerPath === '/procfile'
    || lowerPath.startsWith('/readme') || lowerPath.startsWith('/backup_integrity')
    || lowerPath.startsWith('/first_run') || lowerPath.startsWith('/fox_qa')
    || lowerPath.startsWith('/perplexity_deploy')) return sendText(res, 404, 'Not found');
  const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const safe = normalize(relative).replace(/^(\.\.[/\\])+/, '');
  let file = resolve(PUBLIC_DIR, safe);
  if (!file.startsWith(PUBLIC_DIR + '/') && file !== PUBLIC_DIR) return sendText(res, 403, 'Forbidden');
  if (!existsSync(file) || !statSync(file).isFile()) file = join(PUBLIC_DIR, 'index.html');
  const stat = statSync(file);
  const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
  const isHtml = extname(file).toLowerCase() === '.html';
  const headers = {
    ...SECURITY_HEADERS,
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=3600',
  };
  let start, end;
  if (type === 'video/mp4') {
    headers['Accept-Ranges'] = 'bytes';
    if (req.headers.range) {
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (range && (range[1] || range[2])) {
        start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
        end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) {
        res.writeHead(416, { ...SECURITY_HEADERS, 'Content-Range': `bytes */${stat.size}` });
        return res.end();
      }
      headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
      headers['Content-Length'] = end - start + 1;
    }
  }
  res.writeHead(start === undefined ? 200 : 206, headers);
  if (req.method === 'HEAD') return res.end();
  createReadStream(file, start === undefined ? {} : { start, end }).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (!['GET', 'HEAD'].includes(req.method || 'GET')) return sendText(res, 405, 'Method not allowed');
    return serveStatic(req, res, url);
  } catch (error) {
    console.error('FOX request error:', error);
    return sendJson(res, error.status || 500, { message: error.status ? error.message : 'Internal Server Error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`FOX private command center listening on port ${PORT}`);
  console.log(`Database: ${DB_PATH}`);
  console.log(`November 20 backup staged: ${Boolean(stagedBackupText)}`);
});
