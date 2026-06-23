let serverUrl = 'http://192.168.10.103:8888';
let runningEntry = null;
let tickInterval = null;

const fmtDur = (s) => {
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
};

async function api(method, path, body) {
  const r = await fetch(serverUrl + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return r.json();
}

async function init() {
  const stored = await chrome.storage.local.get(['serverUrl']);
  if (stored.serverUrl) serverUrl = stored.serverUrl;
  document.getElementById('server-url').value = serverUrl;
  document.getElementById('open-app').href = serverUrl;

  try {
    await loadProjects();
    await checkRunning();
  } catch (e) {
    document.getElementById('status').textContent = '⚠ Cannot reach server';
  }
}

async function loadProjects() {
  const projects = await api('GET', '/api/projects');
  const sel = document.getElementById('project-select');
  sel.innerHTML = '<option value="">— No Project —</option>' +
    projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

async function checkRunning() {
  runningEntry = await api('GET', '/api/entries/running');
  if (runningEntry) {
    showRunning();
    startTicking();
  } else {
    showStopped();
  }
}

function showRunning() {
  document.getElementById('running-info').classList.add('show');
  document.getElementById('running-project').textContent = runningEntry.project_name || 'No Project';
  document.getElementById('running-note').textContent = runningEntry.note || '';
  document.getElementById('start-form').style.display = 'none';
  document.getElementById('stop-form').style.display = 'block';
  document.getElementById('timer-display').classList.add('running');
}

function showStopped() {
  document.getElementById('running-info').classList.remove('show');
  document.getElementById('start-form').style.display = 'block';
  document.getElementById('stop-form').style.display = 'none';
  document.getElementById('timer-display').classList.remove('running');
  document.getElementById('timer-display').textContent = '00:00:00';
  if (tickInterval) clearInterval(tickInterval);
}

function startTicking() {
  if (tickInterval) clearInterval(tickInterval);
  tickInterval = setInterval(() => {
    if (!runningEntry) return;
    const elapsed = Math.floor((Date.now() - new Date(runningEntry.start_time).getTime()) / 1000);
    document.getElementById('timer-display').textContent = fmtDur(elapsed);
  }, 1000);
}

async function startTimer() {
  const project_id = document.getElementById('project-select').value || null;
  const note = document.getElementById('note-input').value;
  try {
    runningEntry = await api('POST', '/api/entries/start', { project_id, note });
    showRunning();
    startTicking();
    document.getElementById('status').textContent = '✓ Timer started';
  } catch (e) {
    document.getElementById('status').textContent = '⚠ Failed to start';
  }
}

async function stopTimer() {
  try {
    await api('POST', '/api/entries/stop');
    runningEntry = null;
    showStopped();
    document.getElementById('status').textContent = '✓ Timer stopped';
  } catch (e) {
    document.getElementById('status').textContent = '⚠ Failed to stop';
  }
}

function saveServer() {
  serverUrl = document.getElementById('server-url').value.trim().replace(/\/$/, '');
  chrome.storage.local.set({ serverUrl });
  document.getElementById('open-app').href = serverUrl;
  document.getElementById('status').textContent = '✓ Server saved';
  init();
}

init();
