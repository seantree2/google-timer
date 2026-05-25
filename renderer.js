// ===== SVG icon definitions (Material Design) =====
const ICONS = {
  play:  '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
  reset: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>',
  fullscreen:     '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>',
  fullscreenExit: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>'
};

// ===== DOM refs =====
const card           = document.querySelector('.timer-card');
const timeView       = document.getElementById('time-view');
const timeContent    = document.getElementById('time-content');
const timeEdit       = document.getElementById('time-edit');
const inputs         = {
  h: document.getElementById('hours'),
  m: document.getElementById('minutes'),
  s: document.getElementById('seconds')
};
const inputList      = [inputs.h, inputs.m, inputs.s];
const progress       = document.getElementById('progress');
const startPauseBtn  = document.getElementById('start-pause-btn');
const resetBtn       = document.getElementById('reset-btn');
const fullscreenBtn  = document.getElementById('fullscreen-btn');
const queueList      = document.getElementById('queue-list');

const QUEUE_LENGTH   = 10;
const queueRows      = [];           // array of { row, h, m, s, play, completed }
let   activeQueueIdx = -1;            // index of the queue row currently driving the main timer, -1 if none

// ===== state =====
const R = 92;
const CIRCUMFERENCE = 2 * Math.PI * R;
progress.style.strokeDasharray = CIRCUMFERENCE;
progress.style.strokeDashoffset = CIRCUMFERENCE; // start empty: ring fills as time passes

let totalSeconds        = 300; // 5:00 default
let remainingMs         = 300_000;
let runStartTimestamp   = 0;
let runStartRemainingMs = 0;
let tickerId            = null;
let isRunning           = false;
let isPaused            = false;
let isFinished          = false;
let editMode            = false;
let alarmIntervalId     = null;
let audioCtx            = null;

// ===== rendering =====
function formatTime(totalMs) {
  const totalSec = Math.max(0, Math.ceil(totalMs / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function progressFraction() {
  // Fraction of the ring that should be FILLED.
  // Google's behavior: ring starts empty and fills as time elapses.
  if (totalSeconds <= 0) return 0;
  const elapsedMs = Math.max(0, totalSeconds * 1000 - remainingMs);
  return Math.min(1, elapsedMs / (totalSeconds * 1000));
}

function applyProgress() {
  const filled = progressFraction();
  // strokeDashoffset = circumference means 0% drawn; offset = 0 means 100% drawn.
  // We want filled portion drawn, so offset = circumference * (1 - filled).
  progress.style.strokeDashoffset = CIRCUMFERENCE * (1 - filled);
}

function render() {
  timeContent.textContent = formatTime(remainingMs);
  applyProgress();
  startPauseBtn.innerHTML = isRunning ? ICONS.pause : ICONS.play;
  card.classList.toggle('timer-running', isRunning);
  card.classList.toggle('paused', isPaused);
  card.classList.toggle('finished', isFinished);
}

// ===== timer control =====
function start() {
  if (remainingMs <= 0 || totalSeconds <= 0) return;
  clearFinished();
  isRunning = true;
  isPaused = false;
  runStartTimestamp = performance.now();
  runStartRemainingMs = remainingMs;
  tickerId = setInterval(tick, 50);
  render();
}

function tick() {
  const elapsed = performance.now() - runStartTimestamp;
  remainingMs = Math.max(0, runStartRemainingMs - elapsed);
  if (remainingMs <= 0) {
    remainingMs = 0;
    stopTicker();
    isRunning = false;
    isPaused = false;
    onFinish();
    render();
    return;
  }
  // micro-render: skip full render to keep things smooth
  timeContent.textContent = formatTime(remainingMs);
  applyProgress();
}

function stopTicker() {
  if (tickerId) clearInterval(tickerId);
  tickerId = null;
}

function pause() {
  if (!isRunning) return;
  stopTicker();
  isRunning = false;
  isPaused = true;
  render();
}

function reset() {
  stopTicker();
  isRunning = false;
  isPaused = false;
  clearFinished();
  remainingMs = totalSeconds * 1000;
  // Reset clears the "active" highlight on the queue row but keeps completed marks intact.
  if (activeQueueIdx >= 0 && queueRows[activeQueueIdx]) {
    queueRows[activeQueueIdx].row.classList.remove('active');
    activeQueueIdx = -1;
  }
  // Snap the ring back instantly — no slow rewind animation.
  // Disable transition, apply the empty-ring offset, force a reflow, then restore the transition.
  const prevTransition = progress.style.transition;
  progress.style.transition = 'none';
  applyProgress();
  void progress.getBoundingClientRect();
  progress.style.transition = prevTransition;
  render();
}

function onFinish() {
  isFinished = true;
  isPaused = false;
  markActiveQueueComplete();
  playAlarm();
}

function clearFinished() {
  if (!isFinished) return;
  isFinished = false;
  stopAlarm();
  render(); // ensure the .finished class is removed immediately
}

// ===== editing =====
function enterEditMode() {
  if (isRunning) return;
  editMode = true;
  clearFinished();

  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  inputs.h.value = String(Math.min(9, Math.floor(totalSec / 3600)));
  inputs.m.value = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  inputs.s.value = String(totalSec % 60).padStart(2, '0');

  timeView.hidden = true;
  timeEdit.hidden = false;
  const focusTarget = inputs.h.value !== '00' ? inputs.h
                    : inputs.m.value !== '00' ? inputs.m
                    : inputs.m;
  focusTarget.focus();
  focusTarget.select();
}

function commitEdit() {
  const h = Math.min(9, parseInt(inputs.h.value, 10) || 0);
  const m = parseInt(inputs.m.value, 10) || 0;
  const s = parseInt(inputs.s.value, 10) || 0;
  totalSeconds = Math.min(9 * 3600 + 59 * 60 + 59, h * 3600 + m * 60 + s);
  remainingMs = totalSeconds * 1000;
  // Setting a new total means we've made no progress yet — reset paused state too.
  isPaused = false;
}

function exitEditMode(commit = true) {
  if (!editMode) return;
  if (commit) commitEdit();
  editMode = false;
  timeEdit.hidden = true;
  timeView.hidden = false;
  render();
}

// ===== alarm (sound is always on now; no mute) =====
function ensureAudio() {
  if (!audioCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function beepOnce() {
  const ctx = ensureAudio();
  const now = ctx.currentTime;
  const tones = [
    { freq: 880,  start: 0,    dur: 0.18 },
    { freq: 1175, start: 0.20, dur: 0.22 }
  ];
  tones.forEach(t => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = t.freq;
    gain.gain.setValueAtTime(0, now + t.start);
    gain.gain.linearRampToValueAtTime(0.35, now + t.start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + t.start + t.dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + t.start);
    osc.stop(now + t.start + t.dur + 0.02);
  });
}

function playAlarm() {
  stopAlarm();
  beepOnce();
  alarmIntervalId = setInterval(beepOnce, 1200);
}

function stopAlarm() {
  if (alarmIntervalId) clearInterval(alarmIntervalId);
  alarmIntervalId = null;
}

// ===== events =====
timeView.addEventListener('click', enterEditMode);
timeView.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    enterEditMode();
  }
});

inputList.forEach((inp, idx) => {
  // Standard text-editing behaviour:
  //   single click → caret positions at the click point, nothing selected
  //   double click → selects all digits in the field
  // (We do NOT auto-select on focus, because mouse-focusing fires focus before the
  //  browser positions the caret, which collides with the "single click = caret only"
  //  expectation. Keyboard nav handlers still call .select() explicitly where needed.)
  inp.addEventListener('dblclick', () => inp.select());
  inp.addEventListener('input', () => {
    const maxLen = inp.id === 'hours' ? 1 : 2;
    inp.value = inp.value.replace(/\D/g, '').slice(0, maxLen);
    if (inp.value.length === maxLen && idx < inputList.length - 1) {
      inputList[idx + 1].focus();
      inputList[idx + 1].select();
    }
  });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      exitEditMode(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      exitEditMode(false);
    } else if (e.key === 'Tab' && !e.shiftKey && idx === inputList.length - 1) {
      e.preventDefault();
      exitEditMode(true);
    } else if (e.key === 'Backspace' && inp.value === '' && idx > 0) {
      inputList[idx - 1].focus();
    } else if (e.key === 'ArrowRight' && inp.selectionStart === inp.value.length && idx < inputList.length - 1) {
      inputList[idx + 1].focus();
      inputList[idx + 1].select();
    } else if (e.key === 'ArrowLeft' && inp.selectionStart === 0 && idx > 0) {
      inputList[idx - 1].focus();
      inputList[idx - 1].select();
    }
  });
});

timeEdit.addEventListener('focusout', () => {
  setTimeout(() => {
    if (editMode && !timeEdit.contains(document.activeElement)) {
      exitEditMode(true);
    }
  }, 0);
});

startPauseBtn.addEventListener('click', () => {
  if (editMode) exitEditMode(true);
  if (isFinished) {
    clearFinished();
    return;
  }
  if (isRunning) pause();
  else start();
});

resetBtn.addEventListener('click', () => {
  if (editMode) exitEditMode(false);
  reset();
});

fullscreenBtn.addEventListener('click', async () => {
  if (window.electronAPI) {
    await window.electronAPI.toggleFullscreen();
  } else if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen?.();
  }
});

if (window.electronAPI?.onFullscreenChanged) {
  window.electronAPI.onFullscreenChanged((isFs) => {
    fullscreenBtn.innerHTML = isFs ? ICONS.fullscreenExit : ICONS.fullscreen;
  });
}

// global keyboard shortcuts (no longer includes M for mute)
document.addEventListener('keydown', (e) => {
  if (editMode) return;
  const tag = (e.target?.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;

  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    if (isFinished) { clearFinished(); return; }
    if (isRunning) pause(); else start();
  } else if (e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    reset();
  } else if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    fullscreenBtn.click();
  } else if (e.key === 'Escape') {
    if (isFinished) clearFinished();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    enterEditMode();
  }
});

// ===== queue =====
function buildQueue() {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < QUEUE_LENGTH; i++) {
    const row = document.createElement('li');
    row.className = 'queue-row';
    row.dataset.index = String(i);
    // Inputs wrapped in .q-time-group so themes can lay them out as a unit
    // (e.g. dashboard layout stacks index / time / play vertically)
    row.innerHTML = `
      <span class="q-index">${i + 1}.</span>
      <span class="q-time-group">
        <input type="text" class="q-h" inputmode="numeric" maxlength="1" placeholder="0" aria-label="Queue ${i+1} hours">
        <span class="q-colon">:</span>
        <input type="text" class="q-m" inputmode="numeric" maxlength="2" placeholder="00" aria-label="Queue ${i+1} minutes">
        <span class="q-colon">:</span>
        <input type="text" class="q-s" inputmode="numeric" maxlength="2" placeholder="00" aria-label="Queue ${i+1} seconds">
      </span>
      <button class="q-play" aria-label="Run timer ${i+1}">${ICONS.play}</button>
    `;
    const h = row.querySelector('.q-h');
    const m = row.querySelector('.q-m');
    const s = row.querySelector('.q-s');
    const play = row.querySelector('.q-play');
    const fields = [h, m, s];

    // numeric-only + auto-advance, same UX as main edit mode
    fields.forEach((inp, idx) => {
      const maxLen = inp.classList.contains('q-h') ? 1 : 2;
      // Single click → caret only; double click → select all digits.
      inp.addEventListener('dblclick', () => inp.select());
      inp.addEventListener('input', () => {
        inp.value = inp.value.replace(/\D/g, '').slice(0, maxLen);
        // typing in a completed row re-activates it
        if (row.classList.contains('completed')) {
          row.classList.remove('completed');
        }
        if (inp.value.length === maxLen && idx < fields.length - 1) {
          fields[idx + 1].focus();
          fields[idx + 1].select();
        }
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          inp.blur();
          startQueueRow(i);
        } else if (e.key === 'Backspace' && inp.value === '' && idx > 0) {
          fields[idx - 1].focus();
        } else if (e.key === 'ArrowRight' && inp.selectionStart === inp.value.length && idx < fields.length - 1) {
          fields[idx + 1].focus();
          fields[idx + 1].select();
        } else if (e.key === 'ArrowLeft' && inp.selectionStart === 0 && idx > 0) {
          fields[idx - 1].focus();
          fields[idx - 1].select();
        }
      });
    });

    play.addEventListener('click', () => startQueueRow(i));

    queueRows.push({ row, h, m, s, play, completed: false });
    frag.appendChild(row);
  }
  queueList.appendChild(frag);
}

function readQueueRowSeconds(idx) {
  const r = queueRows[idx];
  if (!r) return 0;
  const h = Math.min(9, parseInt(r.h.value, 10) || 0);
  const m = parseInt(r.m.value, 10) || 0;
  const s = parseInt(r.s.value, 10) || 0;
  return Math.min(9 * 3600 + 59 * 60 + 59, h * 3600 + m * 60 + s);
}

function setActiveQueueIndex(idx) {
  queueRows.forEach((r, i) => r.row.classList.toggle('active', i === idx));
  activeQueueIdx = idx;
}

function markActiveQueueComplete() {
  if (activeQueueIdx < 0) return;
  const r = queueRows[activeQueueIdx];
  if (r) {
    r.completed = true;
    r.row.classList.add('completed');
    r.row.classList.remove('active');
  }
  activeQueueIdx = -1;
}

function startQueueRow(idx) {
  const total = readQueueRowSeconds(idx);
  if (total <= 0) return;

  // If the row was previously marked complete, un-complete it (user is re-running it)
  queueRows[idx].row.classList.remove('completed');
  queueRows[idx].completed = false;

  // Hand the duration to the main timer state and start
  if (editMode) exitEditMode(false);
  stopTicker();
  clearFinished();
  totalSeconds = total;
  remainingMs = total * 1000;
  setActiveQueueIndex(idx);
  start();
}

// init icons + queue + first render
fullscreenBtn.innerHTML = ICONS.fullscreen;
resetBtn.innerHTML = ICONS.reset;
buildQueue();
render();
