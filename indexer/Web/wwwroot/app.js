// Vanilla JS on purpose: this is a local, operator-only admin screen, not
// the iPad-facing app — no build step earns its keep here.

const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.tab-panel');
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    panels.forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

async function api(method, path, body) {
  const response = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error ?? `Onverwachte fout (${response.status}).`);
  }
  return data;
}

function showError(el, message) {
  el.textContent = message;
  el.hidden = false;
}

function clearError(el) {
  el.hidden = true;
  el.textContent = '';
}

let currentConfig = null;

async function loadConfig() {
  currentConfig = await api('GET', '/api/config');
  renderSourceFolders();
  renderGazetteerPath();
  renderOutputFolder();
  renderRunSourceFolderOptions();
  await loadGazetteer();
}

function renderSourceFolders() {
  const list = document.getElementById('source-folders');
  list.innerHTML = '';
  for (const folder of currentConfig.sourceFolders) {
    const li = document.createElement('li');
    const path = document.createElement('span');
    path.className = 'path';
    path.textContent = folder.path;
    const badge = document.createElement('span');
    badge.className = `badge ${folder.exists ? 'ok' : 'missing'}`;
    badge.textContent = folder.exists ? 'bestaat' : 'pad niet gevonden';
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = 'Verwijderen';
    removeButton.addEventListener('click', async () => {
      currentConfig = await api('DELETE', `/api/config/source-folders?path=${encodeURIComponent(folder.path)}`);
      renderSourceFolders();
      renderRunSourceFolderOptions();
    });
    li.append(path, badge, removeButton);
    list.append(li);
  }
}

function renderGazetteerPath() {
  document.getElementById('gazetteer-path').textContent = currentConfig.gazetteerPathResolved;
  document.getElementById('create-gazetteer-button').hidden = currentConfig.gazetteerExists;
  const missing = document.getElementById('gazetteer-missing');
  if (currentConfig.gazetteerExists) {
    missing.hidden = true;
  } else {
    showError(missing, `Gazetteer niet gevonden op ${currentConfig.gazetteerPathResolved}.`);
  }
}

function renderOutputFolder() {
  document.getElementById('output-folder').value = currentConfig.outputFolder;
  document.getElementById('output-folder-resolved').textContent =
    `Wordt: ${currentConfig.outputFolderResolved}`;
}

function renderRunSourceFolderOptions() {
  const select = document.getElementById('run-source-folder');
  select.innerHTML = '';
  for (const folder of currentConfig.sourceFolders) {
    const option = document.createElement('option');
    option.value = folder.path;
    option.textContent = folder.exists ? folder.path : `${folder.path} (pad niet gevonden)`;
    option.disabled = !folder.exists;
    select.append(option);
  }
}

async function loadGazetteer() {
  const rows = document.getElementById('gazetteer-rows');
  rows.innerHTML = '';
  if (!currentConfig.gazetteerExists) return;

  const { entries } = await api('GET', '/api/gazetteer');
  for (const [name, coord] of Object.entries(entries)) {
    const tr = document.createElement('tr');
    const nameTd = document.createElement('td');
    nameTd.textContent = name;
    const latTd = document.createElement('td');
    latTd.textContent = coord.lat;
    const lonTd = document.createElement('td');
    lonTd.textContent = coord.lon;
    const actionTd = document.createElement('td');
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.textContent = 'Bewerken';
    editButton.addEventListener('click', () => {
      document.getElementById('gazetteer-name').value = name;
      document.getElementById('gazetteer-lat').value = coord.lat;
      document.getElementById('gazetteer-lon').value = coord.lon;
      document.getElementById('gazetteer-name').focus();
    });
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = 'Verwijderen';
    removeButton.addEventListener('click', async () => {
      await api('DELETE', `/api/gazetteer/entries/${encodeURIComponent(name)}`);
      await loadGazetteer();
    });
    actionTd.append(editButton, removeButton);
    tr.append(nameTd, latTd, lonTd, actionTd);
    rows.append(tr);
  }
}

document.getElementById('add-source-folder-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.getElementById('add-source-folder-path');
  const errorEl = document.getElementById('source-folder-error');
  clearError(errorEl);
  try {
    currentConfig = await api('POST', '/api/config/source-folders', { path: input.value });
    input.value = '';
    renderSourceFolders();
    renderRunSourceFolderOptions();
  } catch (err) {
    showError(errorEl, err.message);
  }
});

document.getElementById('edit-gazetteer-path-button').addEventListener('click', async () => {
  const next = prompt('Pad naar gazetteer.json:', currentConfig.gazetteerPath);
  if (next === null) return;
  currentConfig = await api('PUT', '/api/config/gazetteer-path', { path: next });
  renderGazetteerPath();
  await loadGazetteer();
});

document.getElementById('create-gazetteer-button').addEventListener('click', async () => {
  currentConfig = await api('POST', '/api/config/gazetteer-file');
  renderGazetteerPath();
  await loadGazetteer();
});

document.getElementById('add-gazetteer-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const errorEl = document.getElementById('gazetteer-error');
  clearError(errorEl);
  const name = document.getElementById('gazetteer-name');
  const lat = document.getElementById('gazetteer-lat');
  const lon = document.getElementById('gazetteer-lon');
  try {
    await api('PUT', '/api/gazetteer/entries', {
      name: name.value,
      lat: parseFloat(lat.value),
      lon: parseFloat(lon.value),
    });
    name.value = '';
    lat.value = '';
    lon.value = '';
    await loadGazetteer();
  } catch (err) {
    showError(errorEl, err.message);
  }
});

document.getElementById('save-output-folder-button').addEventListener('click', async () => {
  const errorEl = document.getElementById('output-folder-error');
  clearError(errorEl);
  try {
    currentConfig = await api('PUT', '/api/config/output-folder', {
      path: document.getElementById('output-folder').value,
    });
    renderOutputFolder();
  } catch (err) {
    showError(errorEl, err.message);
  }
});

document.getElementById('run-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const errorEl = document.getElementById('run-error');
  clearError(errorEl);
  const startButton = document.getElementById('run-start-button');
  const statusBox = document.getElementById('run-status');
  const statusText = document.getElementById('run-status-text');
  const logEl = document.getElementById('run-log');

  const body = {
    sourceFolder: document.getElementById('run-source-folder').value,
    memoryName: document.getElementById('run-memory-name').value,
    destinationName: document.getElementById('run-destination-name').value,
  };

  try {
    startButton.disabled = true;
    statusBox.hidden = false;
    statusText.textContent = 'running';
    logEl.textContent = '';

    const { runId } = await api('POST', '/api/runs', body);
    await pollRun(runId, statusText, logEl);
  } catch (err) {
    showError(errorEl, err.message);
  } finally {
    startButton.disabled = false;
  }
});

async function pollRun(runId, statusText, logEl) {
  for (;;) {
    const state = await api('GET', `/api/runs/${runId}`);
    statusText.textContent = state.status;
    logEl.textContent = state.log.join('\n');
    logEl.scrollTop = logEl.scrollHeight;

    if (state.status === 'running') {
      await new Promise((resolve) => setTimeout(resolve, 750));
      continue;
    }

    if (state.status === 'failed') {
      logEl.textContent += `\n\nFout: ${state.error}`;
    } else if (state.status === 'succeeded') {
      logEl.textContent += `\n\nCatalogus: ${state.catalogPath}`;
    }
    return;
  }
}

loadConfig();
