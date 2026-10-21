// Vanilla JS on purpose: this is a local, operator-only admin screen, not
// the iPad-facing app — no build step earns its keep here.

const REMOVE_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.4 4.98 4.98 6.4 10.59 12l-5.6 5.6 1.4 1.4 5.6-5.58 5.6 5.6 1.4-1.42-5.58-5.6 5.6-5.6-1.42-1.4-5.6 5.6z"/></svg>';
const FOLDER_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Z"/></svg>';
const WARN_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 1 21h22L12 3Zm0 6 6.5 10.5h-13L12 9Zm-.9 3v3.5h1.8V12h-1.8Zm0 4.5V18h1.8v-1.5h-1.8Z"/></svg>';
const STAR_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.9L22 9.6l-5.5 4.8L18 22l-6-3.9L6 22l1.5-7.6L2 9.6l7.1-.7L12 2Z"/></svg>';
const ROTATE_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.55 5.55 11 1v3.07C7.06 4.56 4 7.92 4 12s3.05 7.44 7 7.93v-2.02c-2.84-.48-5-2.94-5-5.91s2.16-5.43 5-5.91V10l4.55-4.45zM19.93 11c-.17-1.39-.72-2.73-1.62-3.89l-1.42 1.42c.54.75.88 1.6 1.02 2.47h2.02zM13 17.9v2.02c1.39-.17 2.74-.71 3.9-1.61l-1.44-1.44c-.75.54-1.59.89-2.46 1.03zm3.89-2.42 1.42 1.41c.9-1.16 1.45-2.5 1.62-3.89h-2.02c-.14.87-.48 1.72-1.02 2.48z"/></svg>';

let memories = [];
let selectedId = null;
let activeRun = null; // { memoryId, runId, status, log, progressCurrent, progressTotal }
const attempts = {}; // memoryId -> { error, cancelled } — what the last run of a Memory ended in
const lastNotices = {}; // memoryId -> string[] — non-fatal log lines from the most recent successful run this session

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

// The log boxes are the only place a stuck or failed run's detail lives —
// worth pasting into a bug report or to Claude, so it needs to leave the
// browser as text. navigator.clipboard needs a secure context; localhost
// (how the Indexer-UI is always reached) counts as one.
async function copyLog(text, button) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    return;
  }
  const original = button.textContent;
  button.textContent = 'Gekopieerd';
  button.disabled = true;
  setTimeout(() => {
    button.textContent = original;
    button.disabled = false;
  }, 1200);
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

/* ============================================================= list */

// The list is of Memories (#65): a Trip is a Memory with a Destination, and a
// Source Folder only exists inside a Memory.
async function loadMemories({ preserveSelection = true } = {}) {
  const [list, pending] = await Promise.all([
    api('GET', '/api/memories'),
    api('GET', '/api/pending-publish'),
  ]);
  const selectedName = memories.find((m) => m.memoryId === selectedId)?.name;
  memories = list;
  if (preserveSelection && !memories.some((m) => m.memoryId === selectedId)) {
    selectedId = memories.find((m) => m.name === selectedName)?.memoryId ?? selectedId;
  }
  if (!preserveSelection || !memories.some((m) => m.memoryId === selectedId)) {
    selectedId = memories[0]?.memoryId ?? null;
  }
  renderSidebar();
  renderDetail();
  document.getElementById('open-deploy').disabled = !pending.hasPending;
}

const isTrip = (m) => m.destinationName != null;
const yearOf = (m) => (m.date ? m.date.slice(0, 4) : null);

function formatDay(day) {
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
}

let kindFilter = 'all'; // all | trips | memories
let searchFilter = '';

// Matches free text against the name and the Destination.
function matchesSearch(m) {
  if (!searchFilter) return true;
  return `${m.name} ${m.destinationName ?? ''}`.toLowerCase().includes(searchFilter);
}

const matchesKind = (m, kind) => kind === 'all' || (kind === 'trips') === isTrip(m);

document.getElementById('folder-filter').addEventListener('input', (e) => {
  searchFilter = e.target.value.trim().toLowerCase();
  renderSidebar();
});

function renderKindFilter() {
  const bar = document.getElementById('kind-filter');
  bar.innerHTML = '';
  for (const [kind, label] of [['all', 'Alles'], ['trips', 'Trips'], ['memories', 'Memories']]) {
    const count = memories.filter((m) => matchesKind(m, kind)).length;
    const button = el(`<button type="button" class="${kind === kindFilter ? 'on' : ''}"></button>`);
    button.textContent = `${label} ${count}`;
    button.addEventListener('click', () => {
      kindFilter = kind;
      renderSidebar();
    });
    bar.append(button);
  }
}

function renderSidebar() {
  const list = document.getElementById('folder-list');
  const empty = document.getElementById('folder-list-empty');
  const filterEmpty = document.getElementById('folder-filter-empty');
  list.innerHTML = '';
  renderKindFilter();

  const visible = memories.filter((m) => matchesKind(m, kindFilter) && matchesSearch(m));
  empty.hidden = memories.length > 0;
  filterEmpty.hidden = memories.length === 0 || visible.length > 0;

  // The server already orders: not-yet-indexed first, then newest first.
  let group = undefined;
  for (const m of visible) {
    const heading = yearOf(m) ?? 'Nog niet geïndexeerd';
    if (heading !== group) {
      list.append(el(`<li class="year-head">${escapeHtml(heading)}</li>`));
      group = heading;
    }

    const item = el(`<li class="folder-item ${m.memoryId === selectedId ? 'active' : ''}">
      <div class="folder-thumb"></div>
      <div class="folder-item-text">
        <strong></strong>
        <span class="meta"></span>
      </div>
      <span class="badges"></span>
    </li>`);

    item.querySelector('strong').textContent = m.name;
    const thumb = item.querySelector('.folder-thumb');
    if (m.coverUrl) thumb.style.backgroundImage = `url(${m.coverUrl})`;
    else thumb.innerHTML = FOLDER_ICON;

    const meta = item.querySelector('.meta');
    if (m.neverIndexed) meta.textContent = isTrip(m) ? m.destinationName : 'Nog niet geïndexeerd';
    else meta.textContent = `${m.destinationName ?? 'Memory'} · ${m.mediaItems.length} foto's`;

    const badges = item.querySelector('.badges');
    if (isTrip(m)) badges.append(el('<span class="pin-badge" title="Trip">📍</span>'));
    if (m.needsReindex) badges.append(el(`<span class="stale-dot" title="${m.neverIndexed ? 'Nog niet geïndexeerd' : 'Herindexeren nodig'}"></span>`));

    item.addEventListener('click', () => {
      selectedId = m.memoryId;
      renderSidebar();
      renderDetail();
    });
    list.append(item);
  }
}

/* ============================================================= new memory */

document.getElementById('add-memory-button').addEventListener('click', openNewMemoryDialog);

// A name plus a first Source Folder (the existing picker). The Memory sits
// under "Nog niet geïndexeerd" until its first index.
function openNewMemoryDialog() {
  openSheet({
    title: 'Nieuwe Memory',
    doneLabel: 'Aanmaken',
    body: `
      <div class="group">
        <label class="cell input-row"><span class="row-label">Naam</span><input type="text" id="new-memory-name" placeholder="Zeeland 2016" autocomplete="off" /></label>
        <div class="cell input-row">
          <span class="row-label">Bronmap</span>
          <input type="text" id="new-memory-path" placeholder="Pad naar de map" autocomplete="off" />
          <button type="button" class="link-button inline" id="new-memory-browse">Bladeren…</button>
        </div>
      </div>
      <p class="group-foot">Je kunt later meer mappen toevoegen. De Memory staat in de lijst tot je hem indexeert.</p>
    `,
    onMount(sheet) {
      sheet.content.querySelector('#new-memory-name').focus();
      sheet.content.querySelector('#new-memory-browse').addEventListener('click', async () => {
        const picked = await browseDialog();
        if (picked) sheet.content.querySelector('#new-memory-path').value = picked;
      });
    },
    async onDone(sheet) {
      const name = sheet.content.querySelector('#new-memory-name').value.trim();
      const path = sheet.content.querySelector('#new-memory-path').value.trim();
      if (!name || !path) throw new Error('Vul een naam en een Source Folder in.');
      const created = await api('POST', '/api/memories', { name, path });
      kindFilter = 'all';
      searchFilter = '';
      document.getElementById('folder-filter').value = '';
      selectedId = created.find((m) => m.name === name)?.memoryId ?? selectedId;
      await loadMemories();
    },
  });
}

/* ============================================================= detail pane */

function renderDetail() {
  const detail = document.getElementById('detail');
  const memory = memories.find((m) => m.memoryId === selectedId);

  if (!memory) {
    detail.innerHTML = '<div class="empty-state centered"><p>Selecteer een Memory, of maak er een.</p></div>';
    return;
  }

  if (activeRun && activeRun.memoryId === memory.memoryId) renderRunningDetail(detail, memory);
  else renderMemoryDetail(detail, memory);
}

/* ---- detail of one Memory (#65, redesigned): a title, one primary action, a
   few inset rows that open small sheets, then the photos. */

const CHEVRON = '<svg class="chevron" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const MORE_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
const PHOTO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10.5" r="1.6"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/></svg>';

function shortDate(iso) {
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

// "Trip · Zeeland" or "Memory"
const kindValue = (m) => (isTrip(m) ? `Trip · ${escapeHtml(m.destinationName)}` : 'Memory');

const dateValue = (m) => {
  if (m.neverIndexed && !m.dateOverride) return '<span class="dim">Na het eerste indexeren</span>';
  const shown = formatDay(m.dateOverride ?? m.date);
  return m.dateOverride ? `${shown} <span class="override" title="Handmatig ingesteld">✎</span>` : shown;
};

function foldersValue(m) {
  const missing = m.folders.filter((f) => !f.exists).length;
  const count = `${m.folders.length} ${m.folders.length === 1 ? 'map' : 'mappen'}`;
  return missing > 0 ? `${count} <span class="warn">· ${missing} niet gevonden</span>` : count;
}

function renderMemoryDetail(detail, m) {
  const reindexError = attempts[m.memoryId]?.error;
  const reindexCancelled = !reindexError && attempts[m.memoryId]?.cancelled;
  const notices = lastNotices[m.memoryId] ?? [];

  const sub = [
    isTrip(m) ? `📍 ${escapeHtml(m.destinationName)}` : 'Memory',
    m.neverIndexed ? 'nog niet geïndexeerd' : `${m.mediaItems.length} foto's · geïndexeerd ${shortDate(m.indexedAt)}`,
  ].join(' · ');

  detail.innerHTML = `
    <header class="mem-head">
      <div class="mem-titles">
        <h2>${escapeHtml(m.name)}</h2>
        <p class="mem-sub">${sub}</p>
      </div>
      <div class="mem-actions">
        <button type="button" class="pill ${m.needsReindex ? 'primary' : 'secondary'}" id="reindex-button">${m.neverIndexed ? 'Indexeren' : 'Herindexeren'}</button>
        <div class="menu-anchor">
          <button type="button" class="round-button" id="more-button" aria-label="Meer acties" aria-haspopup="menu">${MORE_ICON}</button>
        </div>
      </div>
    </header>

    ${reindexError ? `<p class="callout error-callout">${m.neverIndexed ? 'Indexeren' : 'Herindexeren'} mislukt: ${escapeHtml(reindexError)}</p>` : ''}
    ${reindexCancelled ? `<p class="callout">Indexeren geannuleerd; er is niets gepubliceerd of gewijzigd.</p>` : ''}
    ${m.needsReindex && !m.neverIndexed ? `<p class="callout warn-callout">De mappen zijn gewijzigd. Herindexeer om de foto's bij te werken.</p>` : ''}

    <section class="group" aria-label="Eigenschappen">
      <button type="button" class="cell" id="row-kind"><span class="row-label">Soort</span><span class="row-value">${kindValue(m)}</span>${CHEVRON}</button>
      <button type="button" class="cell" id="row-date"><span class="row-label">Datum</span><span class="row-value">${dateValue(m)}</span>${CHEVRON}</button>
      <button type="button" class="cell" id="row-folders"><span class="row-label">Bronmappen</span><span class="row-value">${foldersValue(m)}</span>${CHEVRON}</button>
    </section>
    <p class="group-foot">Soort en datum gelden direct. Wijzigingen aan de mappen worden pas verwerkt bij het herindexeren.</p>

    ${notices.length > 0 ? `
      <details class="notices">
        <summary>${notices.length} melding${notices.length === 1 ? '' : 'en'} tijdens het indexeren</summary>
        <ul>${notices.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
      </details>
    ` : ''}

    ${m.neverIndexed ? `
      <div class="empty-photos">
        ${PHOTO_ICON}
        <p>Nog geen foto's</p>
        <span>Indexeer deze Memory om de foto's te zien.</span>
      </div>
    ` : `
      <div class="section-head"><h3>Foto's</h3><span class="dim">${m.mediaItems.length}</span></div>
      <div class="media-grid" id="media-grid"></div>
      <p class="group-foot">${m.editsDurable
        ? "Een foto verwijderen, een andere cover kiezen of roteren blijft ook na herindexeren bewaard."
        : "Nog niet duurzaam: herindexeer deze Memory eerst. Tot dan passen verwijderen, een andere cover en roteren alleen dit resultaat aan."}</p>
      <p class="error" id="media-item-error" style="max-width:480px" hidden></p>
    `}
  `;

  if (!m.neverIndexed) renderMediaGrid(m);

  document.getElementById('reindex-button').addEventListener('click', () => indexMemory(m));
  document.getElementById('more-button').addEventListener('click', (e) => openMoreMenu(e.currentTarget, m));
  document.getElementById('row-kind').addEventListener('click', () => openKindSheet(m));
  document.getElementById('row-date').addEventListener('click', () => openDateSheet(m));
  document.getElementById('row-folders').addEventListener('click', () => openFoldersSheet(m.memoryId));
}

/* ---- the "•••" menu: what is rarely needed lives here, not on the page */

function openMoreMenu(button, m) {
  const anchor = button.parentElement;
  if (anchor.querySelector('.menu')) return closeMenu(anchor);

  const menu = el(`
    <div class="menu" role="menu">
      <button type="button" role="menuitem" data-act="rename">Naam wijzigen…</button>
      <button type="button" role="menuitem" class="destructive" data-act="remove">Verwijderen…</button>
    </div>
  `);
  anchor.append(menu);
  button.setAttribute('aria-expanded', 'true');

  const outside = (e) => { if (!menu.contains(e.target) && e.target !== button) closeMenu(anchor); };
  const escape = (e) => { if (e.key === 'Escape') closeMenu(anchor); };
  menu._cleanup = () => {
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', escape);
    button.removeAttribute('aria-expanded');
  };
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('keydown', escape);

  menu.querySelector('[data-act="rename"]').addEventListener('click', () => { closeMenu(anchor); openNameSheet(m); });
  menu.querySelector('[data-act="remove"]').addEventListener('click', () => { closeMenu(anchor); removeMemory(m); });
}

function closeMenu(anchor) {
  const menu = anchor.querySelector('.menu');
  if (!menu || menu.classList.contains('closing')) return;
  menu._cleanup?.();
  menu.classList.add('closing');
  setTimeout(() => menu.remove(), 110);
}

/* ---- sheets: small modal editors in the style of an iOS sheet */

// Closing is animated like opening (the .closing class, then removed after its 120ms).
function closeOverlay(overlay) {
  overlay.classList.add('closing');
  setTimeout(() => overlay.remove(), 120);
}

// Opens a sheet with a title bar (Annuleren / title / Gereed). `onDone` may
// throw: its message shows in the sheet and the sheet stays open.
function openSheet({ title, doneLabel = 'Gereed', cancelLabel = 'Annuleren', body, onMount, onDone }) {
  const overlay = el(`
    <div class="sheet-overlay">
      <div class="sheet sheet-ios" role="dialog" aria-label="${escapeHtml(title)}">
        <div class="sheet-bar">
          <button type="button" class="bar-button" data-act="cancel">${cancelLabel}</button>
          <h3>${escapeHtml(title)}</h3>
          <button type="button" class="bar-button strong" data-act="done">${doneLabel}</button>
        </div>
        <div class="sheet-content">${body}<p class="error sheet-error" hidden></p></div>
      </div>
    </div>
  `);
  document.body.append(overlay);

  const errorEl = overlay.querySelector('.sheet-error');
  const done = overlay.querySelector('[data-act="done"]');
  const cancel = overlay.querySelector('[data-act="cancel"]');
  if (!cancelLabel) cancel.style.visibility = 'hidden';
  const sheet = {
    overlay,
    content: overlay.querySelector('.sheet-content'),
    close: () => closeOverlay(overlay),
    error(message) { errorEl.textContent = message; errorEl.hidden = !message; },
  };

  overlay.addEventListener('click', (e) => { if (e.target === overlay) sheet.close(); });
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') sheet.close(); });
  cancel.addEventListener('click', sheet.close);
  done.addEventListener('click', async () => {
    sheet.error('');
    done.disabled = true;
    try {
      if (onDone) await onDone(sheet);
      sheet.close();
    } catch (err) {
      sheet.error(err.message);
      done.disabled = false;
    }
  });
  onMount?.(sheet);
  return sheet;
}

/* Soort: Memory or Trip. Applied at once; a Trip is a Memory with a Destination. */
function openKindSheet(m) {
  let kind = isTrip(m) ? 'trip' : 'memory';
  openSheet({
    title: 'Soort',
    body: `
      <div class="segmented" id="kind-seg" role="tablist">
        <button type="button" data-kind="memory">Memory</button>
        <button type="button" data-kind="trip">Trip</button>
      </div>
      <div id="trip-fields">
        <div class="group"><label class="cell input-row"><span class="row-label">Destination</span><input type="text" id="kind-destination-input" list="destination-names" placeholder="Zeeland" autocomplete="off" value="${escapeHtml(m.destinationName ?? '')}" /></label></div>
        <button type="button" class="link-button" id="suggest-coordinate-button">Coördinaat voorstellen via OpenStreetMap</button>
        <div id="gazetteer-suggestion"></div>
      </div>
      <p class="group-foot" id="kind-foot"></p>
    `,
    onMount(sheet) {
      const input = sheet.content.querySelector('#kind-destination-input');
      const refresh = () => {
        sheet.content.querySelectorAll('#kind-seg button').forEach((b) => b.classList.toggle('on', b.dataset.kind === kind));
        sheet.content.querySelector('#trip-fields').hidden = kind !== 'trip';
        sheet.content.querySelector('#kind-foot').textContent = kind === 'trip'
          ? (m.neverIndexed ? 'Een Trip staat ook op de globe. De Destination wordt gebruikt bij het eerste indexeren.' : 'Een Trip staat ook op de globe. Direct toegepast; op de globe na het volgende publiceren.')
          : 'Een Memory staat alleen in de tijdlijn, niet op de globe.';
      };
      sheet.content.querySelectorAll('#kind-seg button').forEach((b) => b.addEventListener('click', () => {
        kind = b.dataset.kind;
        refresh();
        if (kind === 'trip') input.focus();
      }));
      sheet.content.querySelector('#suggest-coordinate-button').addEventListener('click', () => suggestCoordinate(input.value.trim()));
      refresh();
    },
    async onDone(sheet) {
      const name = kind === 'trip' ? sheet.content.querySelector('#kind-destination-input').value.trim() : '';
      if (kind === 'trip' && !name) throw new Error('Vul een Destination in, of kies Memory.');
      if (name === (m.destinationName ?? '')) return;
      await api('PUT', '/api/memories/destination', { memoryId: m.memoryId, destinationName: name });
      await loadMemories();
    },
  });
}

/* Datum: an override lives in config.json; empty means the earliest photo. */
function openDateSheet(m) {
  openSheet({
    title: 'Datum',
    body: `
      <div class="group"><label class="cell input-row"><span class="row-label">Datum</span><input type="date" id="date-input" value="${m.dateOverride ?? ''}" /></label></div>
      <button type="button" class="link-button" id="clear-date-button" ${m.dateOverride ? '' : 'hidden'}>Gebruik de datum van de vroegste foto${m.defaultDate ? ` (${formatDay(m.defaultDate)})` : ''}</button>
      <p class="group-foot">Onder deze datum staat de Memory in de tijdlijn. Leeg laten betekent de datum van de vroegste foto. Direct toegepast.</p>
    `,
    onMount(sheet) {
      sheet.content.querySelector('#clear-date-button').addEventListener('click', () => {
        sheet.content.querySelector('#date-input').value = '';
        sheet.content.querySelector('#clear-date-button').hidden = true;
      });
    },
    async onDone(sheet) {
      const date = sheet.content.querySelector('#date-input').value;
      if (date === (m.dateOverride ?? '')) return;
      await api('PUT', '/api/memories/date', { memoryId: m.memoryId, date });
      await loadMemories();
    },
  });
}

/* Naam: fixes a mistyped name in place (no rescan, so no lost curation). The
   Memory's id and media filenames follow the new name on the next reindex; the
   old files already published to the NAS stay there until removed by hand. */
function openNameSheet(m) {
  openSheet({
    title: 'Naam',
    doneLabel: 'Opslaan',
    body: `
      <div class="group"><label class="cell input-row"><span class="row-label">Naam</span><input type="text" id="memory-name-input" value="${escapeHtml(m.name)}" autocomplete="off" /></label></div>
      <p class="group-foot">Past alleen de naam aan, zonder opnieuw te indexeren.</p>
    `,
    onMount(sheet) {
      const input = sheet.content.querySelector('#memory-name-input');
      input.focus();
      input.select();
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sheet.overlay.querySelector('[data-act="done"]').click(); });
    },
    async onDone(sheet) {
      const memoryName = sheet.content.querySelector('#memory-name-input').value.trim();
      if (!memoryName) throw new Error('Vul een Memory-naam in.');
      if (memoryName === m.name) return;
      await api('PUT', '/api/memories/name', { memoryId: m.memoryId, memoryName });
      await loadMemories();
    },
  });
}

/* Bronmappen: a Memory may draw on several; only the configuration changes
   and the Memory gets the reindex dot; nothing is rebuilt until it is reindexed. */
function openFoldersSheet(memoryId) {
  const sheet = openSheet({
    title: 'Bronmappen',
    cancelLabel: '',
    body: `
      <div class="group" id="folder-group"></div>
      <div class="group"><button type="button" class="cell accent-row" id="add-folder-to-memory-button">+ Map toevoegen…</button></div>
      <p class="group-foot">Eén map kan in meer Memories zitten. Wijzigingen worden pas verwerkt bij het herindexeren; de laatste map kan niet worden verwijderd.</p>
    `,
    onMount(s) {
      const render = () => {
        const m = memories.find((x) => x.memoryId === memoryId);
        const group = s.content.querySelector('#folder-group');
        group.innerHTML = '';
        if (!m) return;
        for (const folder of m.folders) {
          const { leaf, parent } = splitPath(folder.path);
          const row = el(`
            <div class="cell folder-row">
              <button type="button" class="minus" aria-label="Map uit deze Memory halen"><span></span></button>
              <div class="folder-text"><strong></strong><span class="path"></span></div>
              <span class="tag"></span>
            </div>
          `);
          row.querySelector('strong').textContent = leaf;
          row.querySelector('.path').textContent = parent;
          row.querySelector('.path').title = folder.path;
          const tag = row.querySelector('.tag');
          if (!folder.exists) { tag.textContent = 'niet gevonden'; tag.classList.add('warn'); }
          else if (folder.alsoIn > 0) tag.textContent = `ook in ${folder.alsoIn} andere`;
          else tag.remove();
          const minus = row.querySelector('.minus');
          minus.disabled = m.folders.length <= 1;
          minus.title = minus.disabled ? 'Er moet minstens één map overblijven' : 'Map uit deze Memory halen';
          minus.addEventListener('click', async () => {
            s.error('');
            try {
              await api('DELETE', `/api/memories/folders?memoryId=${encodeURIComponent(memoryId)}&path=${encodeURIComponent(folder.path)}`);
              await loadMemories();
              render();
            } catch (err) { s.error(err.message); }
          });
          group.append(row);
        }
      };
      s.content.querySelector('#add-folder-to-memory-button').addEventListener('click', async () => {
        const picked = await browseDialog();
        if (!picked) return;
        s.error('');
        try {
          await api('POST', '/api/memories/folders', { memoryId, path: picked });
          await loadMemories();
          render();
        } catch (err) { s.error(err.message); }
      });
      render();
    },
  });
  return sheet;
}

// "C:\Fotos\2024\Strand" -> { leaf: "Strand", parent: "C:\Fotos\2024" }
function splitPath(path) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  const leaf = parts.pop() ?? path;
  const sep = path.includes('\\') ? '\\' : '/';
  const lead = path.startsWith('\\\\') ? '\\\\' : '';
  return { leaf, parent: lead + parts.join(sep) };
}

function renderMediaGrid(m) {
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

  for (const item of m.mediaItems) {
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
      removeButton.addEventListener('click', () => removeMediaItem(m.memoryId, item.id, tile));
      tile.append(removeButton);

      if (item.type !== 'video') {
        const coverButton = el(`<button type="button" class="set-cover-item" title="Wil je deze als cover zetten?">${STAR_ICON}</button>`);
        coverButton.addEventListener('click', () => setCoverMediaItem(m.memoryId, item.id));
        tile.append(coverButton);
      }
    }

    // Rotating the current cover is exactly as valid as any other photo —
    // it's the one tile the buttons above deliberately skip, so this needs
    // its own check rather than living inside that if/else.
    if (item.type !== 'video') {
      const rotateButton = el(`<button type="button" class="rotate-item" title="Roteer 90°">${ROTATE_ICON}</button>`);
      rotateButton.addEventListener('click', () => rotateMediaItem(m.memoryId, item.id));
      tile.append(rotateButton);
    }

    grid.append(tile);
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
      <p class="hint">${escapeHtml(suggestion.displayName)}</p>
      <div class="row" style="margin:8px 0">
        <input type="text" id="suggestion-name" value="${escapeHtml(name)}" />
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

/* ---- indexing */

async function startIndex(memoryId) {
  const { runId } = await api('POST', '/api/memories/index', { memoryId });
  activeRun = { memoryId, runId, status: 'running', log: [], progressCurrent: null, progressTotal: null };
  renderDetail();
  pollRun();
}

// One click away from a rescan that silently brings back every removed
// photo (see the caption above the grid) — worth the same are-you-sure as
// deleting the Memory outright. A first index has nothing to lose.
async function indexMemory(m) {
  if (!m.neverIndexed) {
    const confirmed = await confirmDialog({
      title: `"${escapeHtml(m.name)}" opnieuw indexeren?`,
      message: `Dit scant alle mappen van deze Memory opnieuw. Verwijderde foto's verschijnen weer; de rest blijft zoals het was.`,
      confirmLabel: 'Herindexeren',
    });
    if (!confirmed) return;
  }

  try {
    await startIndex(m.memoryId);
  } catch (err) {
    attempts[m.memoryId] = { error: err.message };
    renderDetail();
  }
}

function renderRunningDetail(detail, m) {
  const { progressCurrent, progressTotal, cancelling } = activeRun;
  // No value/max attribute at all (rather than 0/0) renders as the browser's
  // built-in indeterminate/striped animation — the honest state before the
  // first progress callback has landed, with no extra code needed for it.
  const hasProgress = progressTotal != null && progressTotal > 0;
  detail.innerHTML = `
    <header class="mem-head">
      <div class="mem-titles">
        <h2>${escapeHtml(m.name)}</h2>
        <p class="mem-sub"><span class="spinner"></span>Bezig met indexeren…</p>
      </div>
      <div class="mem-actions">
        <button type="button" class="pill secondary" id="cancel-run-button" ${cancelling ? 'disabled' : ''}>${cancelling ? 'Bezig met annuleren…' : 'Annuleren'}</button>
      </div>
    </header>
    <section class="group run-card">
      <progress id="run-progress" ${hasProgress ? `value="${progressCurrent}" max="${progressTotal}"` : ''}></progress>
      <div class="log-box" id="run-log"></div>
      <div class="run-foot"><button type="button" class="link-button inline" id="copy-run-log-button">Log kopiëren</button></div>
    </section>
  `;
  document.getElementById('run-log').textContent = activeRun.log.join('\n');
  document.getElementById('cancel-run-button').addEventListener('click', cancelActiveRun);
  document.getElementById('copy-run-log-button').addEventListener('click', (e) => copyLog(activeRun.log.join('\n'), e.currentTarget));
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
      attempts[run.memoryId] = { error: state.error };
    } else if (state.status === 'cancelled') {
      attempts[run.memoryId] = { cancelled: true };
    } else {
      delete attempts[run.memoryId];
      // The final "Catalogus bijgewerkt: ..." line just confirms success; only
      // earlier lines (skipped files, timestamp fallbacks, ...) are worth surfacing.
      lastNotices[run.memoryId] = state.log.slice(0, -1);
    }

    await loadMemories();
    activeRun = null;
    renderDetail();
  } catch (err) {
    attempts[run.memoryId] = { error: err.message };
    activeRun = null;
    renderDetail();
  }
}

/* ---- review: photos of one Memory */

async function setCoverMediaItem(memoryId, itemId) {
  const errorEl = document.getElementById('media-item-error');
  errorEl.hidden = true;
  try {
    await api('PUT', '/api/media-items/cover', { memoryId, itemId });
    await loadMemories();
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
    await loadMemories();
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
    await loadMemories();
  } catch (err) {
    tile.style.opacity = '1';
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
}

async function removeMemory(m) {
  const message = m.neverIndexed
    ? `"${escapeHtml(m.name)}" wordt uit de lijst verwijderd.`
    : `Dit verwijdert ook de gepubliceerde foto's van deze Memory.`;
  const confirmed = await confirmDialog({ title: `"${escapeHtml(m.name)}" verwijderen?`, message, confirmLabel: 'Verwijderen' });
  if (!confirmed) return;

  await api('DELETE', `/api/memories?memoryId=${encodeURIComponent(m.memoryId)}`);
  delete attempts[m.memoryId];
  delete lastNotices[m.memoryId];
  await loadMemories({ preserveSelection: false });
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
  await loadMemories();
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
    await loadMemories();
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

// { runId, status, log, progressCurrent, progressTotal, error, idleSeconds }
// — one publish at a time, polled in the background whether or not the sheet
// is open, so the topbar indicator (and a reopened sheet) always shows the
// real state. status stays 'running'/'succeeded'/'failed'/'cancelled' after
// the run ends until the user has seen it: a success fades out on its own,
// a failure stays until the sheet has been opened and closed.
let activeDeploy = null;

// The deploy script gives every NAS call a 30-60s hard timeout plus a retry,
// so well past that and still silent means something is genuinely wrong.
const DEPLOY_STALL_SECONDS = 60;
const DEPLOY_SUCCESS_LINGER_MS = 6000;

const deployOverlay = document.getElementById('deploy-overlay');
const deployIndicator = document.getElementById('deploy-indicator');
let deploySuccessTimer = null;

function openDeployOverlay() {
  clearTimeout(deploySuccessTimer);
  deployOverlay.classList.remove('closing');
  deployOverlay.hidden = false;
  renderDeploy();
}

document.getElementById('open-deploy').addEventListener('click', openDeployOverlay);
deployIndicator.addEventListener('click', openDeployOverlay);
document.getElementById('close-deploy').addEventListener('click', closeDeployOverlay);
deployOverlay.addEventListener('click', (e) => { if (e.target === deployOverlay) closeDeployOverlay(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !deployOverlay.hidden) closeDeployOverlay();
});

// Closing never interrupts a running publish — it carries on behind the
// indicator. Closing a finished one counts as having seen the result.
function closeDeployOverlay() {
  if (deployOverlay.hidden || deployOverlay.classList.contains('closing')) return;
  if (activeDeploy && activeDeploy.status !== 'running') activeDeploy = null;

  deployOverlay.classList.add('closing');
  setTimeout(() => {
    if (!deployOverlay.classList.contains('closing')) return; // reopened meanwhile
    deployOverlay.hidden = true;
    deployOverlay.classList.remove('closing');
  }, 120);
  renderDeploy();
}

function formatIdle(seconds) {
  return seconds < 90 ? `${seconds} s` : `${Math.round(seconds / 60)} min`;
}

function deployIsStalled(deploy) {
  return deploy.status === 'running' && (deploy.idleSeconds ?? 0) >= DEPLOY_STALL_SECONDS;
}

function renderDeployIndicator() {
  const deploy = activeDeploy;
  deployIndicator.hidden = deploy === null;
  if (!deploy) return;

  const hasProgress = deploy.progressTotal != null && deploy.progressTotal > 0;
  const fraction = hasProgress ? deploy.progressCurrent / deploy.progressTotal : 0;

  let state = 'running';
  let label;
  if (deploy.status === 'succeeded') { state = 'done'; label = 'Gepubliceerd'; }
  else if (deploy.status === 'failed') { state = 'failed'; label = 'Publiceren mislukt'; }
  else if (deployIsStalled(deploy)) { state = 'stalled'; label = `Geen reactie · ${formatIdle(deploy.idleSeconds)}`; }
  else label = hasProgress ? `Publiceren ${deploy.progressCurrent}/${deploy.progressTotal}` : 'Publiceren…';

  deployIndicator.dataset.state = state;
  deployIndicator.classList.toggle('indeterminate', state === 'running' && !hasProgress);
  deployIndicator.style.setProperty('--fraction', fraction.toFixed(3));
  document.getElementById('deploy-indicator-label').textContent = label;
  deployIndicator.setAttribute('aria-label', `${label} — klik voor details`);
}

function renderDeploy() {
  renderDeployIndicator();

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
    if (deployIsStalled(activeDeploy)) {
      statusEl.textContent = `Geen reactie sinds ${formatIdle(activeDeploy.idleSeconds)} — de NAS is mogelijk niet bereikbaar. Annuleren en opnieuw publiceren is veilig.`;
    } else {
      statusEl.innerHTML = '<span class="spinner"></span>Bezig met publiceren…';
    }
    cancelButton.textContent = 'Annuleren';
    cancelButton.disabled = false;
  } else {
    cancelButton.textContent = 'Sluiten';
    cancelButton.disabled = false;
    if (status === 'succeeded') statusEl.textContent = 'Gepubliceerd.';
    else if (status === 'cancelled') statusEl.textContent = 'Geannuleerd.';
    else { statusEl.textContent = ''; errorEl.textContent = error; errorEl.hidden = false; }
  }

  const logEl = document.getElementById('deploy-log');
  const stickToBottom = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 8;
  logEl.textContent = log.join('\n');
  if (stickToBottom) logEl.scrollTop = logEl.scrollHeight;
}

function beginDeploy(runId) {
  activeDeploy = {
    runId, status: 'running', log: [], progressCurrent: null, progressTotal: null,
    error: null, idleSeconds: 0, pollFailures: 0,
  };
  renderDeploy();
  pollDeploy();
}

document.getElementById('start-deploy-button').addEventListener('click', async () => {
  const errorEl = document.getElementById('deploy-error');
  errorEl.hidden = true;
  try {
    const { runId } = await api('POST', '/api/deploy');
    beginDeploy(runId);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
});

document.getElementById('copy-deploy-log-button').addEventListener('click', (e) => {
  if (activeDeploy) copyLog(activeDeploy.log.join('\n'), e.currentTarget);
});

// Doubles as "Sluiten" once the run has ended (see renderDeploy) — closing
// the sheet at that point doesn't need a server round-trip.
document.getElementById('cancel-deploy-button').addEventListener('click', async () => {
  if (!activeDeploy) return;
  if (activeDeploy.status !== 'running') { closeDeployOverlay(); return; }
  await api('POST', `/api/runs/${activeDeploy.runId}/cancel`);
});

function finishDeploy(deploy) {
  renderDeploy();
  loadMemories(); // a succeeded publish drains whatever was pending — flips the button back off

  if (!deployOverlay.hidden) return; // being read — closing the sheet clears it
  if (deploy.status === 'cancelled') { activeDeploy = null; renderDeploy(); return; }
  if (deploy.status === 'succeeded') {
    deploySuccessTimer = setTimeout(() => {
      if (activeDeploy === deploy && deployOverlay.hidden) { activeDeploy = null; renderDeploy(); }
    }, DEPLOY_SUCCESS_LINGER_MS);
  }
}

async function pollDeploy() {
  const deploy = activeDeploy;
  if (!deploy || deploy.status !== 'running') return;

  try {
    const state = await api('GET', `/api/runs/${deploy.runId}`);
    if (activeDeploy !== deploy) return;

    deploy.pollFailures = 0;
    deploy.log = state.log;
    deploy.progressCurrent = state.progressCurrent;
    deploy.progressTotal = state.progressTotal;
    deploy.idleSeconds = state.idleSeconds;

    if (state.status === 'running') {
      renderDeploy();
      setTimeout(pollDeploy, 400);
      return;
    }

    deploy.status = state.status;
    deploy.error = state.error;
    finishDeploy(deploy);
  } catch (err) {
    if (activeDeploy !== deploy) return;
    // A blip (laptop sleep, server restarting) shouldn't declare a publish
    // dead that is still running — only give up after a sustained outage.
    if (++deploy.pollFailures < 8) { setTimeout(pollDeploy, 2000); return; }
    deploy.status = 'failed';
    deploy.error = `Verbinding met de Indexer verloren: ${err.message}`;
    finishDeploy(deploy);
  }
}

// A reloaded page doesn't know its own run ids, but the publish keeps going
// server-side — pick it back up so the indicator is there straight away.
api('GET', '/api/deploy/active').then(({ runId }) => { if (runId && !activeDeploy) beginDeploy(runId); }).catch(() => {});

loadMemories();
// Eager, independent of the settings sheet: the index-folder flow's own
// Destination-naam field needs suggestions without a detour through Settings.
fetchGazetteerEntries().then(refreshDestinationNames);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

