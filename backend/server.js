const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8888;
const DB_PATH = process.env.DB_PATH || '/app/data/trackmytime.db';

// Ensure data dir exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);

// Init schema
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#6366f1',
    archived INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    note TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',
    start_time TEXT NOT NULL,
    end_time TEXT,
    duration_seconds INTEGER DEFAULT 0,
    is_running INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    color TEXT DEFAULT '#6366f1'
  );
`);

// Seed a default project if empty
const projectCount = db.prepare('SELECT COUNT(*) as c FROM projects').get();
if (projectCount.c === 0) {
  db.prepare("INSERT INTO projects (name, color) VALUES ('General', '#6366f1')").run();
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// ── PROJECTS ──────────────────────────────────────────────
app.get('/api/projects', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, 
      (SELECT COUNT(*) FROM entries e WHERE e.project_id = p.id) as entry_count,
      (SELECT COALESCE(SUM(e.duration_seconds),0) FROM entries e WHERE e.project_id = p.id AND e.is_running=0) as total_seconds
    FROM projects p WHERE p.archived = 0 ORDER BY p.created_at DESC
  `).all();
  res.json(rows);
});

app.post('/api/projects', (req, res) => {
  const { name, color = '#6366f1' } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const r = db.prepare('INSERT INTO projects (name, color) VALUES (?,?)').run(name, color);
  res.json(db.prepare('SELECT * FROM projects WHERE id=?').get(r.lastInsertRowid));
});

app.put('/api/projects/:id', (req, res) => {
  const { name, color, archived } = req.body;
  const fields = [];
  const vals = [];
  if (name !== undefined) { fields.push('name=?'); vals.push(name); }
  if (color !== undefined) { fields.push('color=?'); vals.push(color); }
  if (archived !== undefined) { fields.push('archived=?'); vals.push(archived ? 1 : 0); }
  if (!fields.length) return res.status(400).json({ error: 'nothing to update' });
  vals.push(req.params.id);
  db.prepare(`UPDATE projects SET ${fields.join(',')} WHERE id=?`).run(...vals);
  res.json(db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id));
});

app.delete('/api/projects/:id', (req, res) => {
  db.prepare('DELETE FROM projects WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── TASKS ──────────────────────────────────────────────────
app.get('/api/tasks', (req, res) => {
  const { project_id } = req.query;
  let q = 'SELECT * FROM tasks';
  const vals = [];
  if (project_id) { q += ' WHERE project_id=?'; vals.push(project_id); }
  res.json(db.prepare(q + ' ORDER BY created_at DESC').all(...vals));
});

app.post('/api/tasks', (req, res) => {
  const { project_id, name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const r = db.prepare('INSERT INTO tasks (project_id, name) VALUES (?,?)').run(project_id || null, name);
  res.json(db.prepare('SELECT * FROM tasks WHERE id=?').get(r.lastInsertRowid));
});

app.delete('/api/tasks/:id', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── TAGS ──────────────────────────────────────────────────
app.get('/api/tags', (req, res) => {
  res.json(db.prepare('SELECT * FROM tags ORDER BY name').all());
});

app.post('/api/tags', (req, res) => {
  const { name, color = '#6366f1' } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const r = db.prepare('INSERT INTO tags (name, color) VALUES (?,?)').run(name.toLowerCase().trim(), color);
    res.json(db.prepare('SELECT * FROM tags WHERE id=?').get(r.lastInsertRowid));
  } catch (e) {
    res.status(400).json({ error: 'tag exists' });
  }
});

// ── ENTRIES ────────────────────────────────────────────────
app.get('/api/entries', (req, res) => {
  const { date, project_id, running, limit = 100 } = req.query;
  let q = `
    SELECT e.*, p.name as project_name, p.color as project_color, t.name as task_name
    FROM entries e
    LEFT JOIN projects p ON e.project_id = p.id
    LEFT JOIN tasks t ON e.task_id = t.id
    WHERE 1=1
  `;
  const vals = [];
  if (date) { q += ' AND DATE(e.start_time) = ?'; vals.push(date); }
  if (project_id) { q += ' AND e.project_id = ?'; vals.push(project_id); }
  if (running !== undefined) { q += ' AND e.is_running = ?'; vals.push(running === 'true' ? 1 : 0); }
  q += ' ORDER BY e.start_time DESC LIMIT ?';
  vals.push(parseInt(limit));
  res.json(db.prepare(q).all(...vals));
});

app.get('/api/entries/running', (req, res) => {
  const row = db.prepare(`
    SELECT e.*, p.name as project_name, p.color as project_color, t.name as task_name
    FROM entries e
    LEFT JOIN projects p ON e.project_id = p.id
    LEFT JOIN tasks t ON e.task_id = t.id
    WHERE e.is_running = 1
    LIMIT 1
  `).get();
  res.json(row || null);
});

// Start timer
app.post('/api/entries/start', (req, res) => {
  const { project_id, task_id, note = '', tags = [] } = req.body;
  // Stop any running entry first
  const running = db.prepare('SELECT * FROM entries WHERE is_running=1').get();
  if (running) {
    const now = new Date().toISOString();
    const dur = Math.floor((Date.now() - new Date(running.start_time).getTime()) / 1000);
    db.prepare('UPDATE entries SET is_running=0, end_time=?, duration_seconds=? WHERE id=?')
      .run(now, dur, running.id);
  }
  const start = new Date().toISOString();
  const r = db.prepare(
    'INSERT INTO entries (project_id, task_id, note, tags, start_time, is_running) VALUES (?,?,?,?,?,1)'
  ).run(project_id || null, task_id || null, note, JSON.stringify(tags), start);
  res.json(db.prepare(`
    SELECT e.*, p.name as project_name, p.color as project_color
    FROM entries e LEFT JOIN projects p ON e.project_id=p.id WHERE e.id=?
  `).get(r.lastInsertRowid));
});

// Stop timer
app.post('/api/entries/stop', (req, res) => {
  const running = db.prepare('SELECT * FROM entries WHERE is_running=1').get();
  if (!running) return res.json({ ok: true, stopped: null });
  const now = new Date().toISOString();
  const dur = Math.floor((Date.now() - new Date(running.start_time).getTime()) / 1000);
  db.prepare('UPDATE entries SET is_running=0, end_time=?, duration_seconds=? WHERE id=?')
    .run(now, dur, running.id);
  res.json({ ok: true, stopped: db.prepare('SELECT * FROM entries WHERE id=?').get(running.id) });
});

// Manual entry
app.post('/api/entries', (req, res) => {
  const { project_id, task_id, note = '', tags = [], start_time, end_time } = req.body;
  if (!start_time || !end_time) return res.status(400).json({ error: 'start_time and end_time required' });
  const dur = Math.floor((new Date(end_time) - new Date(start_time)) / 1000);
  const r = db.prepare(
    'INSERT INTO entries (project_id, task_id, note, tags, start_time, end_time, duration_seconds, is_running) VALUES (?,?,?,?,?,?,?,0)'
  ).run(project_id || null, task_id || null, note, JSON.stringify(tags), start_time, end_time, dur);
  res.json(db.prepare('SELECT * FROM entries WHERE id=?').get(r.lastInsertRowid));
});

app.put('/api/entries/:id', (req, res) => {
  const { project_id, task_id, note, tags, start_time, end_time } = req.body;
  const entry = db.prepare('SELECT * FROM entries WHERE id=?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'not found' });
  const newStart = start_time || entry.start_time;
  const newEnd = end_time || entry.end_time;
  const dur = newEnd ? Math.floor((new Date(newEnd) - new Date(newStart)) / 1000) : entry.duration_seconds;
  db.prepare(`
    UPDATE entries SET
      project_id=?, task_id=?, note=?, tags=?, start_time=?, end_time=?, duration_seconds=?
    WHERE id=?
  `).run(
    project_id ?? entry.project_id,
    task_id ?? entry.task_id,
    note ?? entry.note,
    tags ? JSON.stringify(tags) : entry.tags,
    newStart, newEnd, dur,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM entries WHERE id=?').get(req.params.id));
});

app.delete('/api/entries/:id', (req, res) => {
  db.prepare('DELETE FROM entries WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── REPORTS ────────────────────────────────────────────────
app.get('/api/reports/daily', (req, res) => {
  const { from, to } = req.query;
  let q = `
    SELECT DATE(start_time) as date,
      COALESCE(SUM(duration_seconds),0) as total_seconds,
      COUNT(*) as entry_count
    FROM entries WHERE is_running=0
  `;
  const vals = [];
  if (from) { q += ' AND DATE(start_time) >= ?'; vals.push(from); }
  if (to) { q += ' AND DATE(start_time) <= ?'; vals.push(to); }
  q += ' GROUP BY DATE(start_time) ORDER BY date DESC';
  res.json(db.prepare(q).all(...vals));
});

app.get('/api/reports/by-project', (req, res) => {
  const { from, to } = req.query;
  let q = `
    SELECT p.id, p.name, p.color,
      COALESCE(SUM(e.duration_seconds),0) as total_seconds,
      COUNT(e.id) as entry_count
    FROM projects p
    LEFT JOIN entries e ON e.project_id = p.id AND e.is_running=0
  `;
  const vals = [];
  if (from) { q += ' AND DATE(e.start_time) >= ?'; vals.push(from); }
  if (to) { q += ' AND DATE(e.start_time) <= ?'; vals.push(to); }
  q += ' GROUP BY p.id ORDER BY total_seconds DESC';
  res.json(db.prepare(q).all(...vals));
});

app.get('/api/reports/export', (req, res) => {
  const { from, to, format = 'csv' } = req.query;
  let q = `
    SELECT e.id, DATE(e.start_time) as date,
      TIME(e.start_time) as start, TIME(e.end_time) as end,
      e.duration_seconds,
      p.name as project, t.name as task, e.note, e.tags
    FROM entries e
    LEFT JOIN projects p ON e.project_id=p.id
    LEFT JOIN tasks t ON e.task_id=t.id
    WHERE e.is_running=0
  `;
  const vals = [];
  if (from) { q += ' AND DATE(e.start_time) >= ?'; vals.push(from); }
  if (to) { q += ' AND DATE(e.start_time) <= ?'; vals.push(to); }
  q += ' ORDER BY e.start_time DESC';
  const rows = db.prepare(q).all(...vals);

  const fmtDur = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };

  const headers = ['ID','Date','Start','End','Duration','Project','Task','Note','Tags'];
  const csvRows = rows.map(r => [
    r.id, r.date, r.start, r.end || '', fmtDur(r.duration_seconds),
    r.project || '', r.task || '', r.note || '',
    (JSON.parse(r.tags || '[]')).join(';')
  ]);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="trackmytime-export.csv"`);
  res.send([headers, ...csvRows].map(r => r.map(v => `"${v}"`).join(',')).join('\n'));
});

// ── STATS ──────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const ws = weekStart.toISOString().split('T')[0];

  const todayTotal = db.prepare("SELECT COALESCE(SUM(duration_seconds),0) as s FROM entries WHERE DATE(start_time)=? AND is_running=0").get(today);
  const weekTotal = db.prepare("SELECT COALESCE(SUM(duration_seconds),0) as s FROM entries WHERE DATE(start_time)>=? AND is_running=0").get(ws);
  const running = db.prepare("SELECT * FROM entries WHERE is_running=1").get();

  res.json({
    today_seconds: todayTotal.s,
    week_seconds: weekTotal.s,
    running_entry: running || null,
    total_entries: db.prepare("SELECT COUNT(*) as c FROM entries WHERE is_running=0").get().c,
    total_projects: db.prepare("SELECT COUNT(*) as c FROM projects WHERE archived=0").get().c
  });
});

app.get('/health', (req, res) => res.json({ status: 'ok', version: '1.0.0' }));

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => console.log(`TrackMyTime running on port ${PORT}`));
