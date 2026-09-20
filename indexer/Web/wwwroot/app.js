// Vanilla JS on purpose: this is a local, operator-only admin screen, not
// the iPad-facing app — no build step earns its keep here.

const REMOVE_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.4 4.98 4.98 6.4 10.59 12l-5.6 5.6 1.4 1.4 5.6-5.58 5.6 5.6 1.4-1.42-5.58-5.6 5.6-5.6-1.42-1.4-5.6 5.6z"/></svg>';
const FOLDER_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Z"/></svg>';
const WARN_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 1 21h22L12 3Zm0 6 6.5 10.5h-13L12 9Zm-.9 3v3.5h1.8V12h-1.8Zm0 4.5V18h1.8v-1.5h-1.8Z"/></svg>';
const STAR_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.9L22 9.6l-5.5 4.8L18 22l-6-3.9L6 22l1.5-7.6L2 9.6l7.1-.7L12 2Z"/></svg>';
const ROTATE_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.55 5.55 11 1v3.07C7.06 4.56 4 7.92 4 12s3.05 7.44 7 7.93v-2.02c-2.84-.48-5-2.94-5-5.91s2.16-5.43 5-5.91V10l4.55-4.45zM19.93 11c-.17-1.39-.72-2.73-1.62-3.89l-1.42 1.42c.54.75.88 1.6 1.02 2.47h2.02zM13 17.9v2.02c1.39-.17 2.74-.71 3.9-1.61l-1.44-1.44c-.75.54-1.59.89-2.46 1.03zm3.89-2.42 1.42 1.41c.9-1.16 1.45-2.5 1.62-3.89h-2.02c-.14.87-.48 1.72-1.02 2.48z"/></svg>';

let folders = [];
let selectedPath = null;
let activeRun = null; // { path, runId, status, log, progressCurrent, progressTotal }
const attempts = {}; // path -> { memoryName, destinationName, error } — survives a failed run so nothing needs retyping
const lastNotices = {}; // path -> string[] — non-fatal log lines from the most recent successful run this session

async function api(method, path, body) {
  const response = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? `Onverwachte fout (${response.status}).`);
  return data;
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function leafName(path) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

// Replaces confirm() with something that actually looks like part of this
// app instead of OS chrome — reuses the settings sheet's visual language.
function confirmDialog({ title, message, confirmLabel }) {
  return new Promise((resolve) => {
    const dialog = el(`
      <div class="sheet-overlay">
        <div class="sheet" style="max-width:400px">
          <div class="sheet-section" style="border-top:none">
            <h3>${title}</h3>
            <p class="hint" style="margin-top:8px">${message}</p>
            <div class="row" style="justify-content:flex-end;margin-top:18px">
              <button type="button" class="button ghost small" id="dialog-cancel">Annuleren</button>
              <button type="button" class="button danger small" id="dialog-confirm" style="border-color:var(--danger);background:var(--danger);color:#fff">${confirmLabel}</button>
            </div>
          </div>
        </div>
      </div>
    `);
    document.body.append(dialog);
    const finish = (result) => { dialog.remove(); resolve(result); };
    dialog.addEventListener('click', (e) => { if (e.target === dialog) finish(false); });
    dialog.querySelector('#dialog-cancel').addEventListener('click', () => finish(false));
    dialog.querySelector('#dialog-confirm').addEventListener('click', () => finish(true));
  });
}

// A picker over the Indexer's own filesystem — the closest thing to a native
// folder dialog a plain browser page can offer, since browsers never hand a
// page a real path (not even through the File System Access API). Resolves
// to the chosen absolute path, or null if cancelled.
function browseDialog() {
  return new Promise((resolve) => {
    let currentPath = null; // null = showing the drive list

    const dialog = el(`
      <div class="sheet-overlay">
        <div class="sheet" style="max-width:480px">
          <div class="sheet-head">
            <h2>Kies een map</h2>
            <button type="button" class="icon-button subtle" id="browse-close" aria-label="Sluiten">${REMOVE_ICON}</button>
          </div>
          <div class="sheet-section" style="border-top:none">
            <div class="row" id="browse-crumb" style="margin-top:0"></div>
            <ul class="browse-list" id="browse-list"></ul>
            <p class="error" id="browse-error" hidden></p>
            <div class="row" style="justify-content:flex-end;margin-top:14px">
              <button type="button" class="button ghost small" id="browse-cancel">Annuleren</button>
              <button type="button" class="button small" id="browse-select" disabled>Deze map kiezen</button>
            </div>
          </div>
        </div>
      </div>
    `);
    document.body.append(dialog);

    const crumbEl = dialog.querySelector('#browse-crumb');
    const listEl = dialog.querySelector('#browse-list');
    const errorEl = dialog.querySelector('#browse-error');
    const selectButton = dialog.querySelector('#browse-select');

    const finish = (result) => { dialog.remove(); resolve(result); };
    dialog.addEventListener('click', (e) => { if (e.target === dialog) finish(null); });
    dialog.querySelector('#browse-close').addEventListener('click', () => finish(null));
    dialog.querySelector('#browse-cancel').addEventListener('click', () => finish(null));
    selectButton.addEventListener('click', () => finish(currentPath));

    async function load(path) {
      errorEl.hidden = true;
      try {
        const result = await api('GET', path ? `/api/browse?path=${encodeURIComponent(path)}` : '/api/browse');
        currentPath = result.path;
        selectButton.disabled = !currentPath;

        crumbEl.innerHTML = '';
        const up = el(`<button type="button" class="button ghost small">↑ Omhoog</button>`);
        up.disabled = result.parent === null;
        up.addEventListener('click', () => load(result.parent));
        const label = document.createElement('span');
        label.className = 'hint';
        label.textContent = result.path ?? 'Schijven';
        crumbEl.append(up, label);

        listEl.innerHTML = '';
        for (const folder of result.folders) {
          const li = el(`<li class="browse-item">${FOLDER_ICON}<span></span></li>`);
          li.querySelector('span').textContent = folder.name;
          li.addEventListener('click', () => load(folder.path));
          listEl.append(li);
        }
        if (result.folders.length === 0) {
          listEl.append(el('<li class="empty-state" style="padding:10px 0">Geen submappen.</li>'));
        }
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    }

    load(null);
  });
}

/* ============================================================= sidebar */

async function loadFolders({ preserveSelection = true } = {}) {
  const [folderList, pending] = await Promise.all([
    api('GET', '/api/folders'),
    api('GET', '/api/pending-publish'),
  ]);
  folders = folderList;
  if (!preserveSelection || !folders.some((f) => f.path === selectedPath)) {
    selectedPath = folders[0]?.path ?? null;
  }
  renderSidebar();
  renderDetail();
  document.getElementById('open-deploy').disabled = !pending.hasPending;
}

let folderFilter = '';

// Matches free text against whatever's shown for a folder — the Memory and
// Destination name once indexed, the bare folder name before that (there's
// nothing else to search on yet).
function matchesFolderFilter(folder) {
  if (!folderFilter) return true;
  const haystack = folder.indexed
    ? `${folder.indexed.memoryName} ${folder.indexed.destinationName}`
    : leafName(folder.path);
  return haystack.toLowerCase().includes(folderFilter);
}

document.getElementById('folder-filter').addEventListener('input', (e) => {
  folderFilter = e.target.value.trim().toLowerCase();
  renderSidebar();
});

function renderSidebar() {
  const list = document.getElementById('folder-list');
  const empty = document.getElementById('folder-list-empty');
  const filterEmpty = document.getElementById('folder-filter-empty');
  list.innerHTML = '';

  const visible = folders.filter(matchesFolderFilter);
  empty.hidden = folders.length > 0;
  filterEmpty.hidden = folders.length === 0 || visible.length > 0;

  for (const folder of visible) {
    // A folder's own name is meaningless once it's indexed — several
    // folders can share a Destination (#44) and their leaf names don't
    // say so. The Memory name is what actually distinguishes them; the
    // folder name is only ever shown as a fallback before that exists.
    const title = folder.indexed ? folder.indexed.memoryName : leafName(folder.path);
    const item = el(`<li class="folder-item ${folder.path === selectedPath ? 'active' : ''}">
      <div class="folder-thumb ${folder.exists ? '' : 'missing'}"></div>
      <div class="folder-item-text">
        <strong></strong>
        <span class="meta ${folder.exists ? '' : 'missing'}"></span>
      </div>
    </li>`);

    item.querySelector('strong').textContent = title;
    const thumb = item.querySelector('.folder-thumb');
    if (!folder.exists) {
      thumb.innerHTML = WARN_ICON;
    } else if (folder.indexed) {
      thumb.style.backgroundImage = `url(${folder.indexed.coverUrl})`;
    } else {
      thumb.innerHTML = FOLDER_ICON;
    }

    const meta = item.querySelector('.meta');
    if (!folder.exists) meta.textContent = 'Map niet gevonden';
    else if (folder.indexed) meta.textContent = `${folder.indexed.destinationName} · ${folder.indexed.mediaItems.length} foto's`;
    else meta.textContent = 'Nog niet geïndexeerd';

    item.addEventListener('click', () => {
      selectedPath = folder.path;
      renderSidebar();
      renderDetail();
    });
    list.append(item);
  }
}

/* ============================================================= add folder */

const addForm = document.getElementById('add-folder-form');
const addInput = document.getElementById('add-folder-path');
const addError = document.getElementById('add-folder-error');
const browseButton = document.getElementById('browse-folder-button');

document.getElementById('add-folder-button').addEventListener('click', () => {
  addForm.hidden = !addForm.hidden;
  if (!addForm.hidden) browseButton.focus();
});

addInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { addForm.hidden = true; addInput.value = ''; addError.hidden = true; }
});

browseButton.addEventListener('click', async () => {
  const picked = await browseDialog();
  if (picked) await submitAddFolder(picked);
});

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const path = addInput.value.trim();
  if (path) await submitAddFolder(path);
});

async function submitAddFolder(path) {
  addError.hidden = true;
  try {
    await api('POST', '/api/folders', { path });
    addInput.value = '';
    addForm.hidden = true;
    selectedPath = path;
    await loadFolders();
  } catch (err) {
    addInput.value = path;
    addError.textContent = err.message;
    addError.hidden = false;
  }
}

/* ============================================================= detail pane */

function renderDetail() {
  const detail = document.getElementById('detail');
  const folder = folders.find((f) => f.path === selectedPath);

  if (!folder) {
    detail.innerHTML = '<div class="empty-state centered"><p>Selecteer een map, of voeg er een toe.</p></div>';
    return;
  }

  if (activeRun && activeRun.path === folder.path) {
    renderRunningDetail(detail, folder);
  } else if (folder.indexed) {
    renderIndexedDetail(detail, folder);
  } else {
    renderUnindexedDetail(detail, folder);
  }
}

function renderUnindexedDetail(detail, folder) {
  const leaf = folder.path.split(/[\\/]/).filter(Boolean).pop() ?? folder.path;
  const attempt = attempts[folder.path];
  detail.innerHTML = `
    <div class="detail-head"><h2>${leaf}</h2></div>
    <p class="detail-path">${folder.path}</p>
    <div class="detail-sub">${folder.exists ? 'Nog niet geïndexeerd.' : 'Deze map bestaat niet (meer) op deze locatie.'}</div>
    ${attempt?.error ? `<p class="error" style="max-width:480px">Indexeren mislukt: ${attempt.error}</p>` : ''}
    ${!attempt?.error && attempt?.cancelled ? `<p class="hint" style="max-width:480px">Indexeren geannuleerd; niets gepubliceerd.</p>` : ''}
    ${folder.exists ? `
      <div class="field"><label for="memory-name">Memory-naam</label><input type="text" id="memory-name" placeholder="Zeeland 2016" value="${attempt?.memoryName ?? ''}" /></div>
      <div class="field">
        <label for="destination-name">Destination-naam</label>
        <div class="row" style="margin:0">
          <input type="text" id="destination-name" list="destination-names" placeholder="Zeeland" value="${attempt?.destinationName ?? ''}" />
          <button type="button" class="button ghost small" id="suggest-coordinate-button">Coördinaat voorstellen</button>
        </div>
      </div>
      <div id="gazetteer-suggestion"></div>
      <button type="button" class="button" id="index-button">Indexeer</button>
      <p class="error" id="index-error" hidden></p>
    ` : ''}
    <div style="margin-top:24px">
      <button type="button" class="button danger small" id="remove-folder-button">Map verwijderen</button>
    </div>
  `;

  const indexButton = document.getElementById('index-button');
  if (indexButton) {
    indexButton.addEventListener('click', async () => {
      const errorEl = document.getElementById('index-error');
      errorEl.hidden = true;
      const memoryName = document.getElementById('memory-name').value.trim();
      const destinationName = document.getElementById('destination-name').value.trim();
      if (!memoryName || !destinationName) {
        errorEl.textContent = 'Vul zowel een Memory-naam als een Destination-naam in.';
        errorEl.hidden = false;
        return;
      }
      try {
        await startIndex(folder.path, memoryName, destinationName);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
  }

  document.getElementById('remove-folder-button').addEventListener('click', () => removeFolder(folder));

  const suggestButton = document.getElementById('suggest-coordinate-button');
  if (suggestButton) {
    suggestButton.addEventListener('click', () => suggestCoordinate(document.getElementById('destination-name').value.trim()));
  }
}

// Only on click (never on keystroke) — no unsolicited network traffic to
// Nominatim. Nothing lands in gazetteer.json until the operator explicitly
// confirms the suggestion below (#42).
async function suggestCoordinate(name) {
  const box = document.getElementById('gazetteer-suggestion');
  if (!name) {
    box.innerHTML = `<p class="error">Vul eerst een Destination-naam in.</p>`;
    return;
  }

  box.innerHTML = `<p class="hint">Zoeken via Nominatim…</p>`;
  let suggestion;
  try {
    suggestion = await api('GET', `/api/gazetteer/suggest?name=${encodeURIComponent(name)}`);
  } catch (err) {
    box.innerHTML = `<p class="error"></p>`;
    box.querySelector('.error').textContent = err.message;
    return;
  }

  box.innerHTML = `
    <div class="suggestion-card">
      <p class="hint">${suggestion.displayName}</p>
      <div class="row" style="margin:8px 0">
        <input type="text" id="suggestion-name" value="${name}" />
        <input type="number" id="suggestion-lat" value="${suggestion.lat}" step="any" min="-90" max="90" />
        <input type="number" id="suggestion-lon" value="${suggestion.lon}" step="any" min="-180" max="180" />
      </div>
      <div class="row" style="margin:0">
        <button type="button" class="button small" id="confirm-suggestion-button">Toevoegen aan Gazetteer</button>
        <button type="button" class="button ghost small" id="dismiss-suggestion-button">Annuleren</button>
      </div>
      <p class="error" id="suggestion-error" hidden></p>
      <p class="hint" style="margin-top:8px">Locatiegegevens via <a href="https://nominatim.openstreetmap.org" target="_blank" rel="noreferrer">OpenStreetMap Nominatim</a>.</p>
    </div>
  `;

  box.querySelector('#dismiss-suggestion-button').addEventListener('click', () => { box.innerHTML = ''; });
  box.querySelector('#confirm-suggestion-button').addEventListener('click', async () => {
    const errorEl = box.querySelector('#suggestion-error');
    errorEl.hidden = true;
    try {
      await api('PUT', '/api/gazetteer/entries', {
        name: box.querySelector('#suggestion-name').value.trim(),
        lat: parseFloat(box.querySelector('#suggestion-lat').value),
        lon: parseFloat(box.querySelector('#suggestion-lon').value),
      });
      box.innerHTML = `<p class="hint">Toegevoegd aan de Gazetteer.</p>`;
      fetchGazetteerEntries().then(refreshDestinationNames);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });
}

async function startIndex(path, memoryName, destinationName) {
  attempts[path] = { memoryName, destinationName };
  const { runId } = await api('POST', '/api/folders/index', { path, memoryName, destinationName });
  activeRun = { path, runId, status: 'running', log: [], progressCurrent: null, progressTotal: null };
  renderDetail();
  pollRun();
}

function renderRunningDetail(detail, folder) {
  const { progressCurrent, progressTotal, cancelling } = activeRun;
  // No value/max attribute at all (rather than 0/0) renders as the browser's
  // built-in indeterminate/striped animation — the honest state before the
  // first progress callback has landed, with no extra code needed for it.
  const hasProgress = progressTotal != null && progressTotal > 0;
  detail.innerHTML = `
    <div class="detail-head">
      <h2>${leafName(folder.path)}</h2>
      <div class="detail-actions">
        <button type="button" class="button ghost small" id="cancel-run-button" ${cancelling ? 'disabled' : ''}>
          ${cancelling ? 'Bezig met annuleren…' : 'Annuleren'}
        </button>
      </div>
    </div>
    <div class="detail-sub"><span class="spinner"></span>Bezig met indexeren…</div>
    <progress id="run-progress" ${hasProgress ? `value="${progressCurrent}" max="${progressTotal}"` : ''}></progress>
    <div class="log-box" id="run-log"></div>
  `;
  document.getElementById('run-log').textContent = activeRun.log.join('\n');
  document.getElementById('cancel-run-button').addEventListener('click', cancelActiveRun);
}

async function cancelActiveRun() {
  const run = activeRun;
  if (!run || run.cancelling) return;
  run.cancelling = true;
  renderDetail();
  await api('POST', `/api/runs/${run.runId}/cancel`);
}

async function pollRun() {
  const run = activeRun;
  if (!run) return;

  try {
    const state = await api('GET', `/api/runs/${run.runId}`);
    if (activeRun !== run) return; // superseded by a newer run/selection

    run.log = state.log;
    run.status = state.status;
    run.progressCurrent = state.progressCurrent;
    run.progressTotal = state.progressTotal;

    if (state.status === 'running') {
      renderDetail();
      setTimeout(pollRun, 400);
      return;
    }

    if (state.status === 'failed') {
      attempts[run.path] = { ...attempts[run.path], error: state.error };
    } else if (state.status === 'cancelled') {
      attempts[run.path] = { ...attempts[run.path], cancelled: true };
    } else {
      delete attempts[run.path];
      // The final "Catalogus bijgewerkt: ..." line just confirms success; only
      // earlier lines (skipped files, timestamp fallbacks, ...) are worth surfacing.
      lastNotices[run.path] = state.log.slice(0, -1);
    }

    await loadFolders();
    activeRun = null;
    renderDetail();
  } catch (err) {
    attempts[run.path] = { ...attempts[run.path], error: err.message };
    activeRun = null;
    renderDetail();
  }
}

function renderIndexedDetail(detail, folder) {
  const idx = folder.indexed;
  const reindexError = attempts[folder.path]?.error;
  const reindexCancelled = !reindexError && attempts[folder.path]?.cancelled;
  const notices = lastNotices[folder.path] ?? [];

  detail.innerHTML = `
    <div class="detail-head">
      <div>
        <h2>${idx.memoryName}</h2>
        <div class="detail-sub">${idx.destinationName} · ${idx.mediaItems.length} foto's · geïndexeerd op ${formatDate(idx.indexedAt)}</div>
        <p class="detail-path">${folder.path}</p>
      </div>
      <div class="detail-actions">
        <button type="button" class="button ghost small" id="reindex-button">Herindexeren</button>
        <button type="button" class="button danger small" id="remove-folder-button">Verwijderen</button>
      </div>
    </div>
    ${reindexError ? `<p class="error" style="max-width:480px">Herindexeren mislukt: ${reindexError}</p>` : ''}
    ${reindexCancelled ? `<p class="hint" style="max-width:480px">Herindexeren geannuleerd; de bestaande foto's hierboven staan nog onveranderd.</p>` : ''}
    ${notices.length > 0 ? `
      <details class="notices">
        <summary>${notices.length} melding${notices.length === 1 ? '' : 'en'} tijdens het indexeren</summary>
        <ul>${notices.map((line) => `<li>${line}</li>`).join('')}</ul>
      </details>
    ` : ''}
    <p class="media-caption">Een foto hier verwijderen past alleen dit resultaat aan — bij herindexeren verschijnen alle foto's uit de map weer.</p>
    <div class="media-grid" id="media-grid"></div>
    <p class="error" id="media-item-error" style="max-width:480px" hidden></p>
  `;

  const grid = document.getElementById('media-grid');
  // <img loading="lazy"> defers fetching until a tile nears the viewport,
  // but <video> has no such attribute — setting `src` up front made every
  // video in the memory (dozens, for a trip with lots of clips) start
  // loading the instant the grid rendered, stalling the photo loads
  // alongside it. One IntersectionObserver per render gives video tiles the
  // same lazy behaviour: `src` is only set once a tile actually scrolls
  // into (near) view.
  const videoObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const video = entry.target;
      video.src = video.dataset.src;
      videoObserver.unobserve(video);
    }
  }, { rootMargin: '200px' });

  for (const item of idx.mediaItems) {
    const tile = el(`<div class="media-tile"></div>`);
    if (item.type === 'video') {
      tile.innerHTML = `<video muted></video>`;
      const video = tile.querySelector('video');
      video.dataset.src = item.url;
      videoObserver.observe(video);
    } else {
      tile.innerHTML = `<img src="${item.url}" loading="lazy" alt="" />`;
    }
    if (item.isCover) {
      tile.append(el('<span class="cover-badge">Cover</span>'));
    } else {
      const removeButton = el(`<button type="button" class="remove-item" title="Verwijder deze foto">${REMOVE_ICON}</button>`);
      removeButton.addEventListener('click', () => removeMediaItem(idx.memoryId, item.id, tile));
      tile.append(removeButton);

      if (item.type !== 'video') {
        const coverButton = el(`<button type="button" class="set-cover-item" title="Wil je deze als cover zetten?">${STAR_ICON}</button>`);
        coverButton.addEventListener('click', () => setCoverMediaItem(idx.memoryId, item.id));
        tile.append(coverButton);
      }
    }

    // Rotating the current cover is exactly as valid as any other photo —
    // it's the one tile the buttons above deliberately skip, so this needs
    // its own check rather than living inside that if/else.
    if (item.type !== 'video') {
      const rotateButton = el(`<button type="button" class="rotate-item" title="Roteer 90°">${ROTATE_ICON}</button>`);
      rotateButton.addEventListener('click', () => rotateMediaItem(idx.memoryId, item.id));
      tile.append(rotateButton);
    }

    grid.append(tile);
  }

  document.getElementById('reindex-button').addEventListener('click', () => reindexFolder(folder));
  document.getElementById('remove-folder-button').addEventListener('click', () => removeFolder(folder));
}

async function setCoverMediaItem(memoryId, itemId) {
  const errorEl = document.getElementById('media-item-error');
  errorEl.hidden = true;
  try {
    await api('PUT', '/api/media-items/cover', { memoryId, itemId });
    await loadFolders();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
}

async function rotateMediaItem(memoryId, itemId) {
  const errorEl = document.getElementById('media-item-error');
  errorEl.hidden = true;
  try {
    await api('POST', '/api/media-items/rotate', { memoryId, itemId });
    await loadFolders();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
}

async function removeMediaItem(memoryId, itemId, tile) {
  const errorEl = document.getElementById('media-item-error');
  errorEl.hidden = true;
  tile.style.opacity = '0.4';
  try {
    await api('DELETE', `/api/media-items?memoryId=${encodeURIComponent(memoryId)}&itemId=${encodeURIComponent(itemId)}`);
    await loadFolders();
  } catch (err) {
    tile.style.opacity = '1';
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
}

// One click away from a rescan that silently brings back every removed
// photo (see the caption above the grid) — worth the same are-you-sure as
// deleting the folder outright.
async function reindexFolder(folder) {
  const confirmed = await confirmDialog({
    title: `"${leafName(folder.path)}" opnieuw indexeren?`,
    message: `Dit scant de map opnieuw. Verwijderde foto's uit deze reis verschijnen weer; de rest blijft zoals het was.`,
    confirmLabel: 'Herindexeren',
  });
  if (!confirmed) return;

  await startIndex(folder.path);
}

async function removeFolder(folder) {
  const label = leafName(folder.path);
  const message = folder.indexed
    ? `Dit verwijdert ook de gepubliceerde foto's van deze reis.`
    : `"${label}" wordt uit de lijst verwijderd.`;
  const confirmed = await confirmDialog({ title: `"${label}" verwijderen?`, message, confirmLabel: 'Verwijderen' });
  if (!confirmed) return;

  await api('DELETE', `/api/folders?path=${encodeURIComponent(folder.path)}`);
  delete attempts[folder.path];
  delete lastNotices[folder.path];
  await loadFolders({ preserveSelection: false });
}

/* ============================================================= settings sheet */

const overlay = document.getElementById('settings-overlay');

document.getElementById('open-settings').addEventListener('click', openSettings);
document.getElementById('close-settings').addEventListener('click', closeSettings);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSettings(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) closeSettings(); });

async function openSettings() {
  overlay.hidden = false;
  const settings = await api('GET', '/api/settings');
  renderSettings(settings);
  await loadGazetteer(settings);
}

function closeSettings() {
  overlay.hidden = true;
}

function renderSettings(settings) {
  document.getElementById('gazetteer-path').textContent = settings.gazetteerPathResolved;
  document.getElementById('create-gazetteer-button').hidden = settings.gazetteerExists;
  const missing = document.getElementById('gazetteer-missing');
  missing.hidden = settings.gazetteerExists;
  if (!settings.gazetteerExists) missing.textContent = `Gazetteer niet gevonden op ${settings.gazetteerPathResolved}.`;

  document.getElementById('output-folder').value = settings.outputFolder;
  document.getElementById('output-folder-resolved').textContent = `Wordt: ${settings.outputFolderResolved}`;

  document.getElementById('curation-folder').value = settings.curationFolder;
  document.getElementById('curation-folder-resolved').textContent = `Wordt: ${settings.curationFolderResolved}`;

  document.getElementById('source-folders-root').value = settings.sourceFoldersRoot;
  document.getElementById('source-folders-root-resolved').textContent =
    settings.sourceFoldersRootResolved ? `Wordt: ${settings.sourceFoldersRootResolved}` : 'Niet ingesteld — "Bladeren…" toont de schijven.';

  const credFields = document.getElementById('nas-credentials-fields');
  const credHint = document.getElementById('nas-credentials-hint');
  const removeCredButton = document.getElementById('remove-nas-credentials-button');
  document.getElementById('nas-connection-result').hidden = true;
  if (!settings.nasCredentialsHost) {
    credFields.hidden = true;
    credHint.textContent = 'Zet de basismap hierboven op een netwerkpad (\\\\server\\...) om inloggegevens op te slaan.';
  } else {
    credFields.hidden = false;
    credHint.textContent = settings.nasCredentialsUsername
      ? `Ingesteld voor ${settings.nasCredentialsHost} als ${settings.nasCredentialsUsername}.`
      : `Nog geen inloggegevens opgeslagen voor ${settings.nasCredentialsHost}.`;
    removeCredButton.hidden = !settings.nasCredentialsUsername;
    document.getElementById('nas-username').value = settings.nasCredentialsUsername ?? '';
    document.getElementById('nas-password').value = '';
  }
}

// Destination names already in the Gazetteer, offered as <datalist> suggestions
// on every Destination-naam field (index-folder flow and this settings sheet)
// so retyping an existing name doesn't drift into a near-duplicate (#38).
function refreshDestinationNames(entries) {
  const list = document.getElementById('destination-names');
  list.innerHTML = '';
  for (const name of Object.keys(entries ?? {})) {
    const option = document.createElement('option');
    option.value = name;
    list.append(option);
  }
}

// Tolerates a missing Gazetteer file (404) the same way the rest of this
// screen treats "not set up yet" — as no suggestions, not an error.
async function fetchGazetteerEntries() {
  try {
    return (await api('GET', '/api/gazetteer')).entries;
  } catch {
    return {};
  }
}

async function loadGazetteer(settings) {
  const rows = document.getElementById('gazetteer-rows');
  rows.innerHTML = '';
  if (!settings.gazetteerExists) {
    refreshDestinationNames();
    return;
  }

  const entries = await fetchGazetteerEntries();
  refreshDestinationNames(entries);
  for (const [name, coord] of Object.entries(entries)) {
    const tr = el(`<tr>
      <td></td><td></td><td></td>
      <td class="actions"><button class="edit">Bewerken</button><button class="remove">Verwijderen</button></td>
    </tr>`);
    tr.children[0].textContent = name;
    tr.children[1].textContent = coord.lat;
    tr.children[2].textContent = coord.lon;
    tr.querySelector('.edit').addEventListener('click', () => {
      document.getElementById('gazetteer-name').value = name;
      document.getElementById('gazetteer-lat').value = coord.lat;
      document.getElementById('gazetteer-lon').value = coord.lon;
      document.getElementById('gazetteer-name').focus();
    });
    tr.querySelector('.remove').addEventListener('click', async () => {
      await api('DELETE', `/api/gazetteer/entries/${encodeURIComponent(name)}`);
      await loadGazetteer(await api('GET', '/api/settings'));
    });
    rows.append(tr);
  }
}

document.getElementById('edit-gazetteer-path-button').addEventListener('click', async () => {
  const current = await api('GET', '/api/settings');
  const next = prompt('Pad naar gazetteer.json:', current.gazetteerPath);
  if (next === null) return;
  const settings = await api('PUT', '/api/settings/gazetteer-path', { path: next });
  renderSettings(settings);
  await loadGazetteer(settings);
  await loadFolders();
});

document.getElementById('create-gazetteer-button').addEventListener('click', async () => {
  const settings = await api('POST', '/api/settings/gazetteer-file');
  renderSettings(settings);
  await loadGazetteer(settings);
});

document.getElementById('add-gazetteer-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('gazetteer-error');
  errorEl.hidden = true;
  const name = document.getElementById('gazetteer-name');
  const lat = document.getElementById('gazetteer-lat');
  const lon = document.getElementById('gazetteer-lon');
  try {
    await api('PUT', '/api/gazetteer/entries', { name: name.value, lat: parseFloat(lat.value), lon: parseFloat(lon.value) });
    name.value = ''; lat.value = ''; lon.value = '';
    await loadGazetteer(await api('GET', '/api/settings'));
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
});

document.getElementById('save-output-folder-button').addEventListener('click', async () => {
  const errorEl = document.getElementById('output-folder-error');
  errorEl.hidden = true;
  try {
    const settings = await api('PUT', '/api/settings/output-folder', { path: document.getElementById('output-folder').value });
    renderSettings(settings);
    await loadFolders();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
});

document.getElementById('save-curation-folder-button').addEventListener('click', async () => {
  const errorEl = document.getElementById('curation-folder-error');
  errorEl.hidden = true;
  try {
    const settings = await api('PUT', '/api/settings/curation-folder', { path: document.getElementById('curation-folder').value });
    renderSettings(settings);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
});

document.getElementById('save-source-folders-root-button').addEventListener('click', async () => {
  const errorEl = document.getElementById('source-folders-root-error');
  errorEl.hidden = true;
  try {
    const settings = await api('PUT', '/api/settings/source-folders-root', { path: document.getElementById('source-folders-root').value });
    renderSettings(settings);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
});

document.getElementById('save-nas-credentials-button').addEventListener('click', async () => {
  const errorEl = document.getElementById('nas-credentials-error');
  errorEl.hidden = true;
  try {
    const settings = await api('PUT', '/api/settings/nas-credentials', {
      username: document.getElementById('nas-username').value,
      password: document.getElementById('nas-password').value,
    });
    renderSettings(settings);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
});

document.getElementById('remove-nas-credentials-button').addEventListener('click', async () => {
  const errorEl = document.getElementById('nas-credentials-error');
  errorEl.hidden = true;
  try {
    const settings = await api('DELETE', '/api/settings/nas-credentials');
    renderSettings(settings);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
});

document.getElementById('test-nas-connection-button').addEventListener('click', async () => {
  const errorEl = document.getElementById('nas-credentials-error');
  const resultEl = document.getElementById('nas-connection-result');
  errorEl.hidden = true;
  resultEl.hidden = true;
  try {
    const result = await api('POST', '/api/settings/test-connection');
    resultEl.textContent = result.message;
    resultEl.hidden = false;
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
});

/* ============================================================= publiceren */

// { runId, status, log, progressCurrent, progressTotal } — status stays
// 'running'/'succeeded'/'failed'/'cancelled' after the run ends so the sheet
// can show the final log instead of snapping back to the idle button; only
// closing the sheet clears it.
let activeDeploy = null;

const deployOverlay = document.getElementById('deploy-overlay');

document.getElementById('open-deploy').addEventListener('click', () => {
  deployOverlay.hidden = false;
  renderDeploy();
});
document.getElementById('close-deploy').addEventListener('click', closeDeployOverlay);
deployOverlay.addEventListener('click', (e) => { if (e.target === deployOverlay) closeDeployOverlay(); });

function closeDeployOverlay() {
  if (activeDeploy && activeDeploy.status === 'running') return; // Annuleren first, or wait it out
  activeDeploy = null;
  deployOverlay.hidden = true;
}

function renderDeploy() {
  const errorEl = document.getElementById('deploy-error');
  errorEl.hidden = true;

  const running = activeDeploy !== null;
  document.getElementById('deploy-idle').hidden = running;
  document.getElementById('deploy-running').hidden = !running;
  if (!running) return;

  const { status, progressCurrent, progressTotal, log, error } = activeDeploy;
  const hasProgress = progressTotal != null && progressTotal > 0;
  const progressEl = document.getElementById('deploy-progress');
  if (hasProgress) { progressEl.value = progressCurrent; progressEl.max = progressTotal; }
  else { progressEl.removeAttribute('value'); progressEl.removeAttribute('max'); }

  const statusEl = document.getElementById('deploy-status');
  const cancelButton = document.getElementById('cancel-deploy-button');
  if (status === 'running') {
    statusEl.innerHTML = '<span class="spinner"></span>Bezig met publiceren…';
    cancelButton.textContent = 'Annuleren';
    cancelButton.disabled = false;
  } else {
    cancelButton.textContent = 'Sluiten';
    cancelButton.disabled = false;
    if (status === 'succeeded') statusEl.textContent = 'Gepubliceerd.';
    else if (status === 'cancelled') statusEl.textContent = 'Geannuleerd.';
    else { statusEl.textContent = ''; errorEl.textContent = error; errorEl.hidden = false; }
  }

  document.getElementById('deploy-log').textContent = log.join('\n');
}

document.getElementById('start-deploy-button').addEventListener('click', async () => {
  const errorEl = document.getElementById('deploy-error');
  errorEl.hidden = true;
  try {
    const { runId } = await api('POST', '/api/deploy');
    activeDeploy = { runId, status: 'running', log: [], progressCurrent: null, progressTotal: null, error: null };
    renderDeploy();
    pollDeploy();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
});

// Doubles as "Sluiten" once the run has ended (see renderDeploy) — closing
// the sheet at that point doesn't need a server round-trip.
document.getElementById('cancel-deploy-button').addEventListener('click', async () => {
  if (!activeDeploy) return;
  if (activeDeploy.status !== 'running') { closeDeployOverlay(); return; }
  await api('POST', `/api/runs/${activeDeploy.runId}/cancel`);
});

async function pollDeploy() {
  const deploy = activeDeploy;
  if (!deploy || deploy.status !== 'running') return;

  try {
    const state = await api('GET', `/api/runs/${deploy.runId}`);
    if (activeDeploy !== deploy) return; // sheet was closed/reopened meanwhile

    deploy.log = state.log;
    deploy.progressCurrent = state.progressCurrent;
    deploy.progressTotal = state.progressTotal;

    if (state.status === 'running') {
      renderDeploy();
      setTimeout(pollDeploy, 400);
      return;
    }

    deploy.status = state.status;
    deploy.error = state.error;
    renderDeploy();
    loadFolders(); // a succeeded publish drains whatever was pending — flips the button back off
  } catch (err) {
    deploy.status = 'failed';
    deploy.error = err.message;
    renderDeploy();
  }
}

loadFolders();
// Eager, independent of the settings sheet: the index-folder flow's own
// Destination-naam field needs suggestions without a detour through Settings.
fetchGazetteerEntries().then(refreshDestinationNames);
