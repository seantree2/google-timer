// ===== SVG icon definitions (Material Design) =====
const ICONS = {
  play:  '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
  reset: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>',
  volumeOn:  '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>',
  volumeOff: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>',
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
const muteBtn        = document.getElementById('mute-btn');
const fullscreenBtn  = document.getElementById('fullscreen-btn');

// ===== state =====
const R = 92;
const CIRCUMFERENCE = 2 * Math.PI * R;
progress.style.strokeDasharray = CIRCUMFERENCE;
progress.style.strokeDashoffset = 0;

let totalSeconds       = 300; // 5:00 default, matching Google
let remainingMs        = 300_000;
let runStartTimestamp  = 0;
let runStartRemainingMs = 0;
let tickerId           = null;
let isRunning          = false;
let isFinished         = false;
let isMuted            = false;
let editMode           = false;
let alarmIntervalId    = null;
let audioCtx           = null;

// ===== rendering =====
function formatTime(totalMs) {
  const totalSec = Math.max(0, Math.ceil(totalMs / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function render() {
  timeContent.textContent = formatTime(remainingMs);
  const fraction = totalSeconds > 0 ? Math.max(0, remainingMs / 1000) / totalSeconds : 0;
  progress.style.strokeDashoffset = CIRCUMFERENCE * (1 - fraction);
  startPauseBtn.innerHTML = isRunning ? ICONS.pause : ICONS.play;
  muteBtn.innerHTML = isMuted ? ICONS.volumeOff : ICONS.volumeOn;
  card.classList.toggle('timer-running', isRunning);
  card.classList.toggle('finished', isFinished);
}

// ===== timer control =====
function start() {
  if (remainingMs <= 0 || totalSeconds <= 0) return;
  clearFinished();
  isRunning = true;
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
    onFinish();
    render();
    return;
  }
  // micro-render: avoid full render to keep things smooth
  timeContent.textContent = formatTime(remainingMs);
  const fraction = totalSeconds > 0 ? (remainingMs / 1000) / totalSeconds : 0;
  progress.style.strokeDashoffset = CIRCUMFERENCE * (1 - fraction);
}

function stopTicker() {
  if (tickerId) clearInterval(tickerId);
  tickerId = null;
}

function pause() {
  if (!isRunning) return;
  stopTicker();
  isRunning = false;
  render();
}

function reset() {
  stopTicker();
  isRunning = false;
  clearFinished();
  remainingMs = totalSeconds * 1000;
  render();
}

function onFinish() {
  isFinished = true;
  if (!isMuted) playAlarm();
}

function clearFinished() {
  if (!isFinished) return;
  isFinished = false;
  stopAlarm();
}

// ===== editing =====
function enterEditMode() {
  if (isRunning) return;
  editMode = true;
  clearFinished();

  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  inputs.h.value = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  inputs.m.value = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  inputs.s.value = String(totalSec % 60).padStart(2, '0');

  timeView.hidden = true;
  timeEdit.hidden = false;
  // focus first non-zero field, else minutes (Google's typical default)
  const focusTarget = inputs.h.value !== '00' ? inputs.h
                    : inputs.m.value !== '00' ? inputs.m
                    : inputs.m;
  focusTarget.focus();
  focusTarget.select();
}

function commitEdit() {
  const h = parseInt(inputs.h.value, 10) || 0;
  const m = parseInt(inputs.m.value, 10) || 0;
  const s = parseInt(inputs.s.value, 10) || 0;
  totalSeconds = Math.min(99 * 3600 + 59 * 60 + 59, h * 3600 + m * 60 + s);
  remainingMs = totalSeconds * 1000;
}

function exitEditMode(commit = true) {
  if (!editMode) return;
  if (commit) commitEdit();
  editMode = false;
  timeEdit.hidden = true;
  timeView.hidden = false;
  render();
}

// ===== alarm =====
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

  // two-tone chime — short rising bell
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

// numeric-only and auto-advance for time inputs
inputList.forEach((inp, idx) => {
  inp.addEventListener('focus', () => inp.select());
  inp.addEventListener('input', () => {
    inp.value = inp.value.replace(/\D/g, '').slice(0, 2);
    if (inp.value.length === 2 && idx < inputList.length - 1) {
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

// commit edit when focus leaves the edit area entirely
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

muteBtn.addEventListener('click', () => {
  isMuted = !isMuted;
  if (isMuted) stopAlarm();
  else if (isFinished) playAlarm();
  render();
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

// global keyboard shortcuts
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
  } else if (e.key === 'm' || e.key === 'M') {
    e.preventDefault();
    muteBtn.click();
  } else if (e.key === 'Escape') {
    if (isFinished) {
      clearFinished();
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    enterEditMode();
  }
});

// init icons
fullscreenBtn.innerHTML = ICONS.fullscreen;
resetBtn.innerHTML = ICONS.reset;
render();
