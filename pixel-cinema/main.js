/* =====================================================================
   main.js — 像素放映室主逻辑
   ─ 大厅：测试卡 / 浮尘 / 排片牌 已由 atmosphere.js + HTML 提供
   ─ 点击银幕：银幕从槽位放大到全屏 → 3-2-1 胶片倒数 → 引擎放映
   ─ 放映中：点击画面 / SPACE 下一卷，ESC 返回大厅，声音开关
   ─ URL：?screening=1 直接进放映，&reel=plasma / &reel=3 指定卷
   ===================================================================== */

import { createReelPlayer, REELS } from './assets/reels.js';
import { createTestCard, createDust, playCountdown } from './atmosphere.js';
import { createProjectorAudio } from './audio.js';

const root = document.documentElement;
const $ = (sel, el = document) => el.querySelector(sel);

const TOTAL = REELS.length;
const EXPAND_MS = 540;          // 与 style.css 里 --expand 保持一致
const pad = (n) => String(n).padStart(2, '0');

/* ---------- URL 参数 -------------------------------------------------- */

const params = new URLSearchParams(location.search);
const isOn = (v) => v === '1' || v === 'true' || v === 'yes';
const wantsScreening = isOn((params.get('screening') || '').toLowerCase());

/* 从房间主站进来时，放映结束应直接回房间，而不是落回影院大厅 */
const fromRoom = (params.get('from') || '').toLowerCase() === 'room';
const IS_DEV = location.pathname.includes('/pixel-homepage/direction-01-projector');
const ROOM_URL = IS_DEV ? '../direction-02-room/' : '../index.html';

/** 卷参数：支持 id（plasma）或序号（3 = 第 3 卷，1-based；0 也当作第 1 卷） */
function resolveReel(raw) {
  if (raw == null || raw === '') return 0;
  const byId = REELS.findIndex((r) => r.id === String(raw).toLowerCase());
  if (byId >= 0) return byId;
  const n = Number(raw);
  if (Number.isFinite(n)) {
    const i = Math.round(n);
    if (i >= 1 && i <= TOTAL) return i - 1;
    if (i === 0) return 0;
  }
  return 0;
}

/* ---------- DOM ------------------------------------------------------- */

const screenEl = $('#screen');
const slotEl = $('#screenSlot');
const countdownEl = $('#countdown');
const countdownCanvas = $('#countdownCanvas');
const testcardCanvas = $('#testcard');
const reelCanvas = $('#reelCanvas');
const dustCanvas = $('#dustCanvas');
const playBtn = $('#playBtn');
const showtimesList = $('#showtimesList');
const marqueeTop = $('#marqueeTop');
const marqueeBottom = $('#marqueeBottom');
const screeningEl = $('#screening');
const soundBtn = $('#soundBtn');
const exitBtn = $('#exitBtn');
const exitHint = $('#exitHint');

if (fromRoom) {
  exitBtn.innerHTML = '✕ 返回房间 <kbd>ESC</kbd>';
  if (exitHint) exitHint.innerHTML = '<kbd>ESC</kbd> 返回房间';
}
const reelNoEl = $('#reelNo');
const reelNameEl = $('#reelName');
const reelCnEl = $('#reelCn');
const reelHintEl = $('#reelHint');
const reelDotsEl = $('#reelDots');
const tcReelEl = $('#tcReel');
const timecodeEl = $('#timecode');
const toastEl = $('#reelToast');
const toastNoEl = $('#toastNo');
const toastNameEl = $('#toastName');
const toastCnEl = $('#toastCn');

/* ---------- 状态 ------------------------------------------------------ */

const S = {
  mode: 'lobby',                  // lobby | expanding | countdown | screening | returning
  reelIndex: resolveReel(params.get('reel')),
  soundOn: false,
  reelStart: 0,                   // 本次放映计时起点
  player: null,
  testcard: null,
  dust: null,
  countdown: null,
  suppressToast: true,
  timers: { expand: 0, reveal: 0, shrink: 0, tc: 0, toast: 0 },
};

const audio = createProjectorAudio();

/* ---------- 银幕几何：大厅 = 槽位矩形，放映 = 视口 -------------------- */

function measureSlot() {
  const r = slotEl.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function fullRect() {
  return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
}

/** 直接给银幕设几何；animate=false 时先关掉过渡，避免闪现 */
function applyRect(rect, animate) {
  if (!animate) screenEl.classList.add('no-anim');
  screenEl.style.left = `${rect.left}px`;
  screenEl.style.top = `${rect.top}px`;
  screenEl.style.width = `${rect.width}px`;
  screenEl.style.height = `${rect.height}px`;
  if (!animate) {
    void screenEl.offsetWidth;          // 强制回流，让新几何在“无过渡”下生效
    screenEl.classList.remove('no-anim');
  }
}

/** 引擎画布铺满视口（cover，不留黑边）：按长宽比取更大的缩放并居中 */
function sizeReelCanvas() {
  const SW = 192, SH = 108;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scale = Math.max(vw / SW, vh / SH);
  const w = Math.round(SW * scale);
  const h = Math.round(SH * scale);
  reelCanvas.style.width = `${w}px`;
  reelCanvas.style.height = `${h}px`;
  reelCanvas.style.left = `${Math.round((vw - w) / 2)}px`;
  reelCanvas.style.top = `${Math.round((vh - h) / 2)}px`;
}

function clearReelCanvas() {
  try {
    reelCanvas.getContext('2d').clearRect(0, 0, reelCanvas.width, reelCanvas.height);
  } catch (e) { /* 画布还没初始化就算了 */ }
}

/* ---------- 大厅装饰：跑马灯 / 排片牌 / 卷号刻度 ---------------------- */

function buildMarquee() {
  const width = screenEl.getBoundingClientRect().width || 800;
  const count = Math.max(14, Math.round(width / 26));
  for (const host of [marqueeTop, marqueeBottom]) {
    for (let i = 0; i < count; i++) {
      const bulb = document.createElement('i');
      bulb.className = 'bulb';
      bulb.style.setProperty('--i', i);
      host.appendChild(bulb);
    }
  }
}

function buildShowtimes() {
  REELS.forEach((reel, i) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'st-row';
    btn.dataset.index = String(i);
    btn.title = `放映 ${reel.name} · ${reel.cn}`;
    btn.innerHTML =
      `<span class="n">${pad(i + 1)}</span>` +
      `<span class="st-txt"><span class="nm">${reel.name}</span><span class="cn cjk">${reel.cn}</span></span>` +
      `<span class="go" aria-hidden="true">▶</span>`;
    btn.addEventListener('click', () => startScreening(i));
    li.appendChild(btn);
    showtimesList.appendChild(li);
  });
}

function buildDots() {
  for (let i = 0; i < TOTAL; i++) {
    reelDotsEl.appendChild(document.createElement('i'));
  }
}

/* ---------- HUD 更新 -------------------------------------------------- */

function setReelHud(reel, index) {
  S.reelIndex = index;
  reelNoEl.textContent = pad(index + 1);
  reelNameEl.textContent = reel.name;
  reelCnEl.textContent = reel.cn;
  reelHintEl.textContent = reel.hint;
  tcReelEl.textContent = `REEL ${pad(index + 1)}/${pad(TOTAL)}`;

  const dots = reelDotsEl.children;
  for (let i = 0; i < dots.length; i++) {
    dots[i].classList.toggle('on', i === index);
    dots[i].classList.toggle('past', i < index);
  }

  /* 排片牌上把没轮到的卷号点亮，算是个“当前进度” */
  const rows = showtimesList.querySelectorAll('.st-row');
  rows.forEach((row, i) => row.toggleAttribute('data-hot', i === index));

  screenEl.setAttribute('aria-label', `正在放映 ${reel.cn}，点击画面切换下一卷`);
}

function showToast(reel, index) {
  toastNoEl.textContent = `REEL ${pad(index + 1)}/${pad(TOTAL)}`;
  toastNameEl.textContent = reel.name;
  toastCnEl.textContent = reel.cn;
  toastEl.classList.add('show');
  clearTimeout(S.timers.toast);
  S.timers.toast = setTimeout(() => toastEl.classList.remove('show'), 1750);
}

function onReelChange(reel, index, manual) {
  setReelHud(reel, index);
  if (S.suppressToast) return;
  showToast(reel, index);
}

/* ---------- 引擎 ------------------------------------------------------ */

/** 如果引擎已经存在，把它拨到当前选中的卷上（排片牌点选 / 二次进场时用） */
function syncReel() {
  if (!S.player || S.player.index === S.reelIndex) return;
  S.suppressToast = true;
  S.player.setReel(S.reelIndex);
  S.suppressToast = false;
}

function ensurePlayer(initialIndex) {
  if (S.player) return S.player;
  S.suppressToast = true;
  S.player = createReelPlayer({
    canvas: reelCanvas,
    initial: initialIndex,
    autoAdvance: 22000,
    onReelChange,
  });
  S.suppressToast = false;
  return S.player;
}

function nextReel() {
  if (S.player) S.player.next(true);
}

function prevReel() {
  if (S.player) S.player.prev();
}

/* ---------- 时间码 ---------------------------------------------------- */

function updateTimecode() {
  const ms = Math.max(0, performance.now() - S.reelStart);
  const total = Math.floor(ms);
  const hh = pad(Math.floor(total / 3600000));
  const mm = pad(Math.floor(total / 60000) % 60);
  const ss = pad(Math.floor(total / 1000) % 60);
  const ff = pad(Math.floor(((total % 1000) / 1000) * 30));
  timecodeEl.textContent = `${hh}:${mm}:${ss}:${ff}`;
}

function startClock() {
  S.reelStart = performance.now();
  updateTimecode();
  clearInterval(S.timers.tc);
  S.timers.tc = setInterval(updateTimecode, 120);
}

function stopClock() {
  clearInterval(S.timers.tc);
  S.timers.tc = 0;
}

/* ---------- 状态机 ---------------------------------------------------- */

/** 大厅 → 放映。index 为空表示用当前卷（URL 指定或第 1 卷） */
function startScreening(index) {
  if (S.mode !== 'lobby') return;
  if (typeof index === 'number') S.reelIndex = index;
  S.mode = 'expanding';

  root.classList.add('is-screening');
  root.classList.remove('boot-screening');

  /* 大厅的动画先停，把 CPU 让给放大过渡 */
  S.testcard?.stop();
  S.dust?.stop();

  /* 贴住槽位，下一帧长到全屏 */
  applyRect(measureSlot(), false);
  requestAnimationFrame(() => {
    screenEl.classList.add('is-full');
    applyRect(fullRect(), true);
  });

  clearTimeout(S.timers.expand);
  S.timers.expand = setTimeout(beginCountdown, EXPAND_MS + 30);
}

/** 放大动画结束 → 胶片倒数；倒数期间引擎已经在底下跑起来了 */
function beginCountdown() {
  if (S.mode !== 'expanding') return;
  S.mode = 'countdown';
  root.classList.add('is-counting');

  const player = ensurePlayer(S.reelIndex);
  syncReel();
  sizeReelCanvas();
  player.start();

  countdownEl.classList.add('on');
  S.countdown = playCountdown(countdownCanvas, {
    reelLabel: `REEL ${pad(S.reelIndex + 1)}`,
    onDone: () => {
      S.countdown = null;
      startFilm();
    },
  });
  S.countdown.start();
}

/** 倒数结束 → 正式放映（揭幕 + HUD + 时间码） */
function startFilm() {
  if (S.mode !== 'screening' && S.mode !== 'countdown') return;
  S.mode = 'screening';
  root.classList.remove('is-counting');
  root.classList.add('is-filming');
  screeningEl.setAttribute('aria-hidden', 'false');

  /* 引擎在倒数时已经跑了 ~2 秒，这里只负责揭幕，避免黑闪 */
  sizeReelCanvas();
  S.reelStart = performance.now();
  startClock();
  root.classList.add('hud-on');
  if (S.soundOn) audio.enable();

  clearTimeout(S.timers.reveal);
  S.timers.reveal = setTimeout(() => {
    countdownEl.classList.remove('on');
    updateTimecode();
  }, 180);
}

/** 放映 → 大厅（反向收缩） */
function exitScreening() {
  const mode = S.mode;
  if (mode !== 'screening' && mode !== 'countdown' && mode !== 'expanding') return;
  S.mode = 'returning';

  /* 该停的全停 */
  clearTimeout(S.timers.expand);
  clearTimeout(S.timers.reveal);
  clearTimeout(S.timers.shrink);
  stopClock();
  if (S.countdown) { S.countdown.stop(); S.countdown = null; }
  countdownEl.classList.remove('on');
  if (S.player) { try { S.player.stop(); } catch (e) { /* noop */ } }
  audio.disable();
  clearReelCanvas();

  root.classList.remove('hud-on', 'is-filming', 'is-counting');
  screeningEl.setAttribute('aria-hidden', 'true');
  toastEl.classList.remove('show');

  /* 从房间进来的：直接回主站房间 */
  if (fromRoom) {
    location.href = ROOM_URL;
    return;
  }

  /* 大厅回来 */
  S.testcard?.start();
  S.dust?.start();
  root.classList.remove('is-screening', 'boot-screening');

  const atFull = screenEl.classList.contains('is-full');
  screenEl.classList.remove('is-full');

  if (!atFull) {
    /* 放大中途返回：直接落回槽位 */
    applyRect(measureSlot(), false);
    finishReturn();
    return;
  }

  /* 正常反向放大 */
  applyRect(measureSlot(), true);
  S.timers.shrink = setTimeout(finishReturn, EXPAND_MS + 60);
}

function finishReturn() {
  screenEl.classList.remove('is-full');
  applyRect(measureSlot(), false);
  clearReelCanvas();
  S.mode = 'lobby';
}

/** ?screening=1：跳过放大和倒数，直接放映（截图 / 分享用） */
function startInstant() {
  S.mode = 'screening';
  root.classList.add('is-screening', 'is-full', 'is-filming', 'hud-on');
  screenEl.classList.add('is-full', 'instant');
  applyRect(fullRect(), false);
  sizeReelCanvas();
  /* 等一帧后再撤掉 instant，让之后的退出动画仍然是平滑的 */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => screenEl.classList.remove('instant'));
  });
  /* 布局已经正确，再把 boot 阶段藏起来的银幕露出来 */
  root.classList.remove('boot-screening');

  const player = ensurePlayer(S.reelIndex);
  player.start();

  screeningEl.setAttribute('aria-hidden', 'false');
  S.reelStart = performance.now();
  startClock();
  if (S.soundOn) audio.enable();
}

/* ---------- 声音 ------------------------------------------------------ */

function toggleSound() {
  S.soundOn = !S.soundOn;
  soundBtn.classList.toggle('on', S.soundOn);
  soundBtn.setAttribute('aria-pressed', String(S.soundOn));
  soundBtn.textContent = S.soundOn ? '♪ SOUND ON' : '♪ SOUND OFF';
  if (S.soundOn) audio.enable();
  else audio.disable();
}

/* ---------- 事件 ------------------------------------------------------ */

function isInteractive(target) {
  return !!(target && target.closest && target.closest('a, button, input, select, textarea, .st-row'));
}

screenEl.addEventListener('click', () => {
  if (S.mode === 'lobby') startScreening();
  else if (S.mode === 'screening') nextReel();
});

/* 键盘：银幕是 role=button，聚焦后回车 / 空格也能开始 */
screenEl.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.code !== 'Space') return;
  if (S.mode === 'lobby') {
    e.preventDefault();
    startScreening();
  }
});

playBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  startScreening();
});

exitBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  exitScreening();
});

soundBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleSound();
});

document.addEventListener('keydown', (e) => {
  const key = e.key;

  if (S.mode === 'screening') {
    if (key === 'Escape') {
      e.preventDefault();
      exitScreening();
    } else if (e.code === 'Space' || key === 'ArrowRight') {
      e.preventDefault();
      nextReel();
    } else if (key === 'ArrowLeft') {
      e.preventDefault();
      prevReel();
    } else if (key === 'm' || key === 'M') {
      e.preventDefault();
      toggleSound();
    }
    return;
  }

  /* 放大 / 倒数途中也能 ESC 反悔 */
  if ((S.mode === 'expanding' || S.mode === 'countdown') && key === 'Escape') {
    e.preventDefault();
    exitScreening();
    return;
  }

  if (S.mode === 'lobby') {
    if (e.target === screenEl) return;              // 由银幕自己的 keydown 处理
    if (isInteractive(e.target)) return;            // 按钮 / 链接保留原生行为
    if (e.code === 'Space' || key === 'Enter') {
      e.preventDefault();
      startScreening();
    }
  }
});

/* 窗口尺寸变化：重新贴回槽位 / 重新铺满 */
let resizeRaf = 0;
window.addEventListener('resize', () => {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0;
    if (S.mode === 'lobby' || S.mode === 'returning') applyRect(measureSlot(), false);
    else applyRect(fullRect(), false);
    sizeReelCanvas();
    S.dust?.resize();
  });
});

/* 字体加载完成后布局可能微调，重贴一次 */
window.addEventListener('load', () => {
  if (S.mode === 'lobby') applyRect(measureSlot(), false);
});
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    if (S.mode === 'lobby') applyRect(measureSlot(), false);
  });
}

/* iOS 地址栏收放会触发 resize；视觉上重排一次即可 */

/* ---------- 启动 ------------------------------------------------------ */

function init() {
  /* 先把银幕贴到大厅槽位（无过渡），跑马灯灯珠数量依赖它的真实宽度 */
  applyRect(measureSlot(), false);
  buildMarquee();
  buildShowtimes();
  buildDots();

  S.testcard = createTestCard(testcardCanvas);
  S.dust = createDust(dustCanvas);

  if (wantsScreening) {
    startInstant();
    return;
  }

  root.classList.remove('boot-screening');
  S.testcard.start();
  S.dust.start();
  setReelHud(REELS[S.reelIndex], S.reelIndex);
  S.reelStart = performance.now();
  timecodeEl.textContent = '00:00:00:00';
}

init();

/* 调试 / 截图钩子（不做对外 API，仅方便调试） */
window.__projector = {
  start: () => startScreening(),
  exit: () => exitScreening(),
  next: () => nextReel(),
  get state() { return { mode: S.mode, reel: S.reelIndex, player: !!S.player, sound: S.soundOn }; },
  get reel() { return S.player ? S.player.reel : REELS[S.reelIndex]; },
};
