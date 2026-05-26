// ===== SVG icon definitions =====
const ICONS = {
  play:  '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
  // checkmark/tick — thicker stroke style so it reads clearly on the green button
  tick:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  fullscreen:     '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>',
  fullscreenExit: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>'
};

// ===== DOM refs =====
const card           = document.querySelector('.timer-card');
const timeContent    = document.getElementById('time-content');
const progress       = document.getElementById('progress');
const fullscreenBtn  = document.getElementById('fullscreen-btn');
const startPauseBtn  = document.getElementById('start-pause-btn');
const queueList      = document.getElementById('queue-list');
const queueAddBtn    = document.getElementById('q-add');
const totalValueEl   = document.getElementById('total-value');
const ctxMenu        = document.getElementById('ctx-menu');
const ctxDelete      = document.getElementById('ctx-delete');

// ===== state =====
const R = 92;
const CIRCUMFERENCE = 2 * Math.PI * R;
progress.style.strokeDasharray = CIRCUMFERENCE;
progress.style.strokeDashoffset = CIRCUMFERENCE;

const QUEUE_MAX = 10;
const QUEUE_MIN = 1;

// Each queue item is one of: 'unconfirmed' | 'confirmed' | 'running' | 'paused' | 'completed'
const queue          = [];                // { id, h, m, s, totalSec, remainingMs, state, el, h_in, m_in, s_in, action }
let   nextId         = 0;
let   activeId       = null;              // id of the row whose timer is currently the main display
let   tickerId       = null;
let   runStartTs     = 0;
let   runStartRemMs  = 0;
let   totalElapsedMs = 0;                 // running total across every confirmed queue run
let   ctxTargetId    = null;              // id of the row the context menu is currently anchored to

// ===== utility =====
function pad2(n) { return String(n).padStart(2, '0'); }

function formatTime(totalMs) {
  const s = Math.max(0, Math.ceil(totalMs / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(sec)}` : `${m}:${pad2(sec)}`;
}

function formatTotalTime(totalMs) {
  // Always show H:MM:SS for the bottom-right indicator so the format stays consistent as it grows
  const s = Math.max(0, Math.floor(totalMs / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${pad2(m)}:${pad2(sec)}`;
}

// ===== main timer display =====
function getActive() { return queue.find(q => q.id === activeId) || null; }

function renderMain() {
  const a = getActive();
  if (a) {
    timeContent.textContent = formatTime(a.remainingMs);
    const fraction = a.totalSec > 0
      ? Math.min(1, Math.max(0, (a.totalSec * 1000 - a.remainingMs) / (a.totalSec * 1000)))
      : 0;
    progress.style.strokeDashoffset = CIRCUMFERENCE * (1 - fraction);
    card.classList.toggle('timer-running', a.state === 'running');
    card.classList.toggle('paused', a.state === 'paused');
    card.classList.toggle('finished', a.state === 'completed');

    // Main play/pause button reflects the active row's state
    if (a.state === 'running') {
      startPauseBtn.innerHTML = ICONS.pause;
      startPauseBtn.disabled = false;
      startPauseBtn.setAttribute('aria-label', 'Pause');
    } else if (a.state === 'paused' || a.state === 'confirmed') {
      startPauseBtn.innerHTML = ICONS.play;
      startPauseBtn.disabled = false;
      startPauseBtn.setAttribute('aria-label', 'Start');
    } else {
      // completed
      startPauseBtn.innerHTML = ICONS.play;
      startPauseBtn.disabled = true;
      startPauseBtn.setAttribute('aria-label', 'Done');
    }
  } else {
    timeContent.textContent = '0:00';
    progress.style.strokeDashoffset = CIRCUMFERENCE;
    card.classList.remove('timer-running', 'paused', 'finished');
    startPauseBtn.innerHTML = ICONS.play;
    startPauseBtn.disabled = true;
    startPauseBtn.setAttribute('aria-label', 'No active timer');
  }
  totalValueEl.textContent = formatTotalTime(totalElapsedMs);
}

// ===== row rendering / state transitions =====
function rowSeconds(row) {
  const h = Math.min(9, parseInt(row.h_in.value, 10) || 0);
  const m = Math.min(59, parseInt(row.m_in.value, 10) || 0);
  const s = Math.min(59, parseInt(row.s_in.value, 10) || 0);
  return h * 3600 + m * 60 + s;
}

function setRowState(row, newState) {
  row.state = newState;
  // visual class
  row.el.classList.remove('state-unconfirmed', 'state-confirmed', 'state-running', 'state-paused', 'state-completed');
  row.el.classList.add('state-' + newState);

  // inputs editable only in 'unconfirmed'
  const editable = newState === 'unconfirmed';
  [row.h_in, row.m_in, row.s_in].forEach(inp => {
    inp.readOnly = !editable;
    inp.disabled = !editable;
  });

  // action button label/icon
  if (newState === 'unconfirmed') {
    row.action.innerHTML = ICONS.tick;
    row.action.setAttribute('aria-label', 'Confirm time');
    row.action.disabled = false;
  } else if (newState === 'confirmed' || newState === 'paused') {
    row.action.innerHTML = ICONS.play;
    row.action.setAttribute('aria-label', 'Start timer');
    row.action.disabled = false;
  } else if (newState === 'running') {
    row.action.innerHTML = ICONS.pause;
    row.action.setAttribute('aria-label', 'Pause timer');
    row.action.disabled = false;
  } else if (newState === 'completed') {
    row.action.innerHTML = ICONS.play;
    row.action.setAttribute('aria-label', 'Done');
    row.action.disabled = true;
  }
  // Recompute sequential locks now that this row's state has changed.
  updateLockedRows();
}

function renumberRows() {
  queue.forEach((row, idx) => {
    row.el.querySelector('.q-index').textContent = (idx + 1) + '.';
  });
  updateAddButton();
  updateQueueRowHeights();
  updateLockedRows();
}

// Strict sequential play: only the first non-completed row's play button is
// usable. Any later state-confirmed row's button is locked (faded, no clicks)
// until earlier rows finish or are deleted. Unconfirmed rows keep their tick
// active so users can set times anywhere in the queue without restriction.
function updateLockedRows() {
  let foundFirstNonCompleted = false;
  queue.forEach((row) => {
    row.el.classList.remove('is-locked');
    if (row.state === 'completed') return;
    if (!foundFirstNonCompleted) {
      foundFirstNonCompleted = true;
      return;
    }
    if (row.state === 'confirmed') {
      row.el.classList.add('is-locked');
    }
  });
}

function updateAddButton() {
  queueAddBtn.disabled = queue.length >= QUEUE_MAX;
}

// Give every queue row a fixed slot height = panel_height / QUEUE_MAX so rows
// stack predictably from the top. New rows fall into the next slot — they
// don't jump positions when the count changes. With QUEUE_MAX rows the column
// fills exactly.
function updateQueueRowHeights() {
  if (!queue.length) return;
  const listH = queueList.clientHeight;
  const gap = 8;
  // Subtract the (QUEUE_MAX - 1) gaps so the slot height accounts for them.
  const slotH = Math.max(44, (listH - gap * (QUEUE_MAX - 1)) / QUEUE_MAX);
  queue.forEach(r => { r.el.style.height = slotH + 'px'; });
}

window.addEventListener('resize', updateQueueRowHeights);

function buildRow() {
  if (queue.length >= QUEUE_MAX) return null;
  const id = ++nextId;
  const el = document.createElement('li');
  el.className = 'queue-row state-unconfirmed';
  el.dataset.id = String(id);
  // Inputs hold real '0' / '00' values. Clicking lands the caret between, before,
  // or after the zeros (like a normal input). The first digit typed when the
  // field is still showing the default zeros replaces the whole value, so the
  // user can just start typing without manually deleting.
  el.innerHTML = `
    <span class="q-index"></span>
    <span class="q-time-group">
      <input type="text" class="q-h" inputmode="numeric" maxlength="1" value="0" aria-label="Hours">
      <span class="q-colon">:</span>
      <input type="text" class="q-m" inputmode="numeric" maxlength="2" value="00" aria-label="Minutes">
      <span class="q-colon">:</span>
      <input type="text" class="q-s" inputmode="numeric" maxlength="2" value="00" aria-label="Seconds">
    </span>
    <button class="q-action" type="button"></button>
  `;
  const h_in = el.querySelector('.q-h');
  const m_in = el.querySelector('.q-m');
  const s_in = el.querySelector('.q-s');
  const action = el.querySelector('.q-action');
  const row = { id, h: 0, m: 0, s: 0, totalSec: 0, remainingMs: 0, state: 'unconfirmed', el, h_in, m_in, s_in, action };
  queue.push(row);
  queueList.appendChild(el);
  setRowState(row, 'unconfirmed');
  renumberRows();
  wireRow(row);
  return row;
}

function wireRow(row) {
  const fields = [row.h_in, row.m_in, row.s_in];
  fields.forEach((inp, idx) => {
    const maxLen = inp.classList.contains('q-h') ? 1 : 2;

    // Single-click leaves the caret wherever the user clicked.
    // Double-click selects all the digits.
    inp.addEventListener('dblclick', () => inp.select());

    // Displacement rule fires AT MOST ONCE per focus session: when the user
    // first types into a field whose value is still all zeros, that initial
    // keystroke replaces the whole value. Subsequent keystrokes in the same
    // focus session are normal insertions — so '0' then '0' types '00'.
    let firstKeyAfterFocus = false;
    inp.addEventListener('focus', () => { firstKeyAfterFocus = true; });
    inp.addEventListener('blur',  () => { firstKeyAfterFocus = false; });
    inp.addEventListener('beforeinput', (e) => {
      if (e.inputType !== 'insertText' || !/^\d$/.test(e.data)) return;
      if (firstKeyAfterFocus && /^0+$/.test(inp.value)) {
        e.preventDefault();
        inp.value = e.data;
        inp.setSelectionRange(inp.value.length, inp.value.length);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
      firstKeyAfterFocus = false;
    });

    // Restore default zeros if the user clears the field and tabs/clicks away.
    // Also pad a single-digit minutes/seconds entry to two digits for tidy display.
    inp.addEventListener('blur', () => {
      if (inp.value === '') {
        inp.value = maxLen === 1 ? '0' : '00';
      } else if (maxLen === 2 && inp.value.length === 1) {
        inp.value = inp.value.padStart(2, '0');
      }
    });

    inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/\D/g, '').slice(0, maxLen);
      if (inp.value.length === maxLen && idx < fields.length - 1) {
        fields[idx + 1].focus();
      }
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); inp.blur(); confirmRow(row); }
      else if (e.key === 'Backspace' && inp.value === '' && idx > 0) fields[idx - 1].focus();
      else if (e.key === 'ArrowRight' && inp.selectionStart === inp.value.length && idx < fields.length - 1) { fields[idx + 1].focus(); fields[idx + 1].select(); }
      else if (e.key === 'ArrowLeft' && inp.selectionStart === 0 && idx > 0) { fields[idx - 1].focus(); fields[idx - 1].select(); }
    });
  });
  // Fire on pointerdown for instant response on the row's action button too.
  const handleRowAction = () => {
    if (row.state === 'unconfirmed') confirmRow(row);
    else if (row.state === 'confirmed' || row.state === 'paused') startRow(row);
    else if (row.state === 'running') pauseRow(row);
  };
  row.action.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (row.el.classList.contains('is-locked')) return;
    e.preventDefault();
    handleRowAction();
  });
  row.action.addEventListener('click', (e) => {
    if (e.detail !== 0) return;     // keyboard activation only — mouse already handled
    handleRowAction();
  });
  // right-click → custom context menu with "Exit Timer"
  row.el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openContextMenu(row.id, e.clientX, e.clientY);
  });
}

function confirmRow(row) {
  const total = rowSeconds(row);
  if (total <= 0) return;       // do nothing for empty rows; user has to set a time first
  row.totalSec = total;
  row.remainingMs = total * 1000;
  // pad inputs nicely for the locked display
  row.h_in.value = String(Math.floor(total / 3600));
  row.m_in.value = pad2(Math.floor((total % 3600) / 60));
  row.s_in.value = pad2(total % 60);
  setRowState(row, 'confirmed');

  // If nothing is currently active AND this row is the next-in-line
  // (the first non-completed row in the queue), feature it in the main view
  // so the user can press play from there. Strict-sequential is preserved:
  // confirming a row deeper in the queue while earlier slots are still
  // pending doesn't hijack the main view.
  if (activeId === null) {
    const firstNonCompleted = queue.find(r => r.state !== 'completed');
    if (firstNonCompleted && firstNonCompleted.id === row.id) {
      activeId = row.id;
    }
  }

  if (row.id === activeId) renderMain();
}

function startRow(row) {
  if (row.totalSec <= 0) return;
  // Starting any row also dismisses an alarm currently going off
  stopAlarm();
  // If a different row is currently the active one, mark it as COMPLETED
  // (crossed out, like an expired timer). Only one row highlighted at a time;
  // earlier timers stay visibly "done" so the user can see what's been run.
  if (activeId !== null && activeId !== row.id) {
    const prev = getActive();
    if (prev) {
      if (tickerId) clearInterval(tickerId);
      tickerId = null;
      setRowState(prev, 'completed');
    }
  }
  activeId = row.id;
  setRowState(row, 'running');
  runStartTs = performance.now();
  runStartRemMs = row.remainingMs;
  if (tickerId) clearInterval(tickerId);
  tickerId = setInterval(tick, 50);
  renderMain();
  // Fire one tick immediately so the ring and time start moving on the next
  // animation frame instead of after the first 50ms interval.
  requestAnimationFrame(tick);
}

function pauseRow(row) {
  if (row.id !== activeId) return;
  doPauseActive();
}

function doPauseActive() {
  const a = getActive();
  if (!a || a.state !== 'running') return;
  // Account for the time elapsed since the LAST tick (not the entire run —
  // tick() has already been incrementally adding to totalElapsedMs throughout).
  const elapsed = performance.now() - runStartTs;
  const newRemaining = Math.max(0, runStartRemMs - elapsed);
  const justElapsed = a.remainingMs - newRemaining;
  if (justElapsed > 0) totalElapsedMs += justElapsed;
  a.remainingMs = newRemaining;
  runStartRemMs = a.remainingMs;
  if (tickerId) clearInterval(tickerId);
  tickerId = null;
  setRowState(a, 'paused');
  renderMain();
}

function tick() {
  const a = getActive();
  if (!a || a.state !== 'running') return;
  const elapsed = performance.now() - runStartTs;
  const newRemaining = Math.max(0, runStartRemMs - elapsed);
  // accumulate total elapsed delta since last tick
  const justElapsed = a.remainingMs - newRemaining;
  if (justElapsed > 0) totalElapsedMs += justElapsed;
  a.remainingMs = newRemaining;
  if (newRemaining <= 0) {
    a.remainingMs = 0;
    clearInterval(tickerId);
    tickerId = null;
    setRowState(a, 'completed');
    playAlarm();
    // expose to the main display so click-to-dismiss can target it
    card.classList.add('alarming');
  }
  renderMain();
}

// Anywhere-click dismiss while the alarm is playing. After dismissing, the
// "next in line" row in the queue becomes the active one — featured in the
// main view regardless of its state (confirmed → shows its duration ready to
// play; unconfirmed → shows 0:00 until the user types and confirms it).
function dismissAlarmIfActive() {
  if (isAlarmPlaying()) {
    stopAlarm();
    advanceToNextInLine();
  }
}

// Advance activeId ONLY if the immediate next row in the queue is confirmed.
// If that row is unconfirmed (or there's no row at all), clear activeId — the
// main view goes idle and the user has to deal with the unconfirmed slot
// before anything plays. Strict sequential: never skip ahead to find a
// confirmed row a few positions later.
function advanceToNextInLine() {
  if (activeId === null) return;
  const currentIdx = queue.findIndex(r => r.id === activeId);
  const nextRow = queue[currentIdx + 1];
  activeId = (nextRow && nextRow.state === 'confirmed') ? nextRow.id : null;
  renderMain();
}

function deleteRow(rowId) {
  const idx = queue.findIndex(r => r.id === rowId);
  if (idx === -1) return;
  if (queue.length <= QUEUE_MIN) return;   // can't go below 1
  const row = queue[idx];
  if (row.id === activeId) {
    // cancel any running timer first
    if (tickerId) clearInterval(tickerId);
    tickerId = null;
    activeId = null;
    stopAlarm();
  }
  row.el.remove();
  queue.splice(idx, 1);
  renumberRows();
  renderMain();
}

// ===== context menu =====
function openContextMenu(rowId, x, y) {
  const row = queue.find(r => r.id === rowId);
  if (!row) return;
  ctxTargetId = rowId;
  // hide if it's the only row left (can't go below min)
  ctxDelete.disabled = queue.length <= QUEUE_MIN;
  ctxMenu.hidden = false;
  // clamp position to viewport
  const menuW = 160, menuH = 50;
  const px = Math.min(x, window.innerWidth - menuW - 8);
  const py = Math.min(y, window.innerHeight - menuH - 8);
  ctxMenu.style.left = px + 'px';
  ctxMenu.style.top = py + 'px';
}

function closeContextMenu() {
  ctxMenu.hidden = true;
  ctxTargetId = null;
}

ctxDelete.addEventListener('click', () => {
  if (ctxTargetId !== null) deleteRow(ctxTargetId);
  closeContextMenu();
});

// Dismiss the menu when the user clicks elsewhere or presses Escape
document.addEventListener('mousedown', (e) => {
  if (ctxMenu.hidden) return;
  if (e.target.closest('.ctx-menu')) return;
  closeContextMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !ctxMenu.hidden) closeContextMenu();
});

// ===== alarm =====
// Plays the bundled Google-search timer recording on a loop until dismissed.

// Resolve relative to renderer.js itself so the path works whether loaded from
// the main app's index.html or from /mockups/theme-d/index.html.
const SCRIPT_BASE = new URL('.', document.currentScript.src).href;
const ALARM_AUDIO_URL = SCRIPT_BASE + 'sounds/google-chime.mp3';
const alarmAudio = new Audio(ALARM_AUDIO_URL);
alarmAudio.loop = true;
alarmAudio.preload = 'auto';

function isAlarmPlaying() {
  return !alarmAudio.paused || card.classList.contains('alarming');
}

function playAlarm() {
  stopAlarm();
  alarmAudio.currentTime = 0;
  alarmAudio.play().catch((err) => {
    console.warn('[timer] alarm audio failed to play:', err?.message || err);
  });
}

function stopAlarm() {
  try { alarmAudio.pause(); alarmAudio.currentTime = 0; } catch {}
  card.classList.remove('alarming');
}

// ===== main play/pause button =====
// Fire on pointerdown for instant response — `click` is gated by the browser's
// mousedown-mouseup-click sequence and occasionally double-click filtering,
// which made fast taps feel lossy.
function handleMainTogglePress() {
  const a = getActive();
  if (!a) return;
  if (a.state === 'running') pauseRow(a);
  else if (a.state === 'paused' || a.state === 'confirmed') startRow(a);
}
startPauseBtn.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;       // only the primary mouse button
  e.preventDefault();
  handleMainTogglePress();
});
// Keep a click fallback for keyboard activation (Enter/Space on a focused button)
startPauseBtn.addEventListener('click', (e) => {
  if (e.detail !== 0) return;       // non-zero detail means it came from a mouse — already handled
  handleMainTogglePress();
});

// ===== add-row button =====
queueAddBtn.addEventListener('click', () => {
  if (queue.length >= QUEUE_MAX) return;
  const row = buildRow();
  if (row) row.h_in.focus();
});

// ===== fullscreen =====
fullscreenBtn.addEventListener('click', async () => {
  if (window.electronAPI) await window.electronAPI.toggleFullscreen();
  else if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
});
if (window.electronAPI?.onFullscreenChanged) {
  window.electronAPI.onFullscreenChanged((isFs) => {
    fullscreenBtn.innerHTML = isFs ? ICONS.fullscreenExit : ICONS.fullscreen;
  });
}

// ===== global shortcuts =====
document.addEventListener('keydown', (e) => {
  const tag = (e.target?.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;
  // If the alarm is firing, ANY of Space/Esc/Enter dismisses it (no other action).
  if (isAlarmPlaying() && (e.key === ' ' || e.code === 'Space' || e.key === 'Escape' || e.key === 'Enter')) {
    e.preventDefault();
    dismissAlarmIfActive();
    return;
  }
  if (e.key === 'f' || e.key === 'F') { e.preventDefault(); fullscreenBtn.click(); }
  else if (e.key === ' ' || e.code === 'Space') {
    // Space = play/pause the active row if there is one
    e.preventDefault();
    const a = getActive();
    if (!a) return;
    if (a.state === 'running') pauseRow(a);
    else if (a.state === 'confirmed' || a.state === 'paused') startRow(a);
  }
});

// Click anywhere on the main timer area dismisses an active alarm.
document.querySelector('.timer-main').addEventListener('click', (e) => {
  if (e.target.closest('.icon-btn, .top-bar')) return;
  dismissAlarmIfActive();
});

// ===== init =====
fullscreenBtn.innerHTML = ICONS.fullscreen;
buildRow();   // start with exactly one empty unconfirmed row
renderMain();
