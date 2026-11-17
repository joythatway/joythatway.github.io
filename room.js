/* =====================================================================
   JOYROOM — 方向② 8-bit 房间
   ---------------------------------------------------------------------
   320×180 的像素画全部用 canvas 手绘（没有图片素材）：
     · 左边一扇窗：霓虹、雨、城市窗灯、偶尔的闪电
     · 中间一张旧书桌：CRT 显示器（画面来自 reels.js）、键盘、马克杯、台灯
     · 右边一个书架：书、唱片、盆栽、小收音机
     · 前景一把椅子，地上铺着地毯，窗台上坐着一只猫
   点显示器 → 镜头从屏幕里拉出来看放映；点书架 → 关于我；点窗户 → 外部链接。
   ===================================================================== */

import { createReelPlayer } from './assets/reels.js';

const W = 320;
const H = 180;

/* ---------- 调色板 ---------------------------------------------------- */
const C = {
  wall1: '#0d101b', wall2: '#151929', wall3: '#1c2136', wallStripe: 'rgba(255,255,255,.018)',
  wallDot: 'rgba(120,140,200,.10)',
  base1: '#232a42', baseHi: '#333c5e', baseDark: '#171c2e',
  floor1: '#1b141b', floor2: '#2a2029', floorLine: '#120d12', floorSeam: '#171017',
  rug1: '#33202e', rug2: '#3f2636', rugLine: '#562f44', rugFringe: '#6b3a52',
  frame1: '#3a4260', frameHi: '#4f5a80', frameDark: '#232a42',
  sky1: '#090f1f', sky2: '#152540', sky3: '#263c60',
  moon: '#e8e2c0', moon2: '#bcb99b',
  bld1: '#070c17', bld2: '#0a1120', bld3: '#0d1728',
  neonPink: '#ff3d7f', neonCyan: '#39e6d0', neonAmber: '#ffb347',
  wood1: '#3d2a2f', wood2: '#4b3339', wood3: '#2b1d23', woodHi: '#5c3f46',
  deskTop: '#4a343a', deskHi: '#5f434a', deskFront: '#342429', deskDark: '#24171c',
  crt1: '#c6bb9f', crt2: '#aa9f84', crt3: '#8b8168', crt4: '#6f6753',
  key1: '#222936', key2: '#2e3648', keyHi: '#3e4a63',
  shelf1: '#3a2a2e', shelf2: '#4a363a', shelf3: '#241a1f', shelfIn: '#150f18',
  chair1: '#100e16', chair2: '#191623', chairHi: '#2a2438', chairGlow: 'rgba(92,236,212,.10)',
  cat: '#090810', catRim: '#26243a', catEye: '#ffd23f',
  leaf1: '#39634a', leaf2: '#5a8f63', pot: '#a3563f', pot2: '#c06b4c', soil: '#2a1e1a',
  steam: 'rgba(220,230,240,.16)',
};

/* ---------- 小工具 ---------------------------------------------------- */
function R(g, x, y, w, h, c) {
  g.fillStyle = c;
  g.fillRect(x | 0, y | 0, Math.max(0, w | 0), Math.max(0, h | 0));
}
function PX(g, x, y, c) {
  g.fillStyle = c;
  g.fillRect(x | 0, y | 0, 1, 1);
}
function dither(g, x, y, w, h, c, step = 2) {
  g.fillStyle = c;
  for (let yy = y; yy < y + h; yy += step) {
    for (let xx = x + (((yy / step) | 0) % 2); xx < x + w; xx += step) {
      g.fillRect(xx | 0, yy | 0, 1, 1);
    }
  }
}
/** 极简 3×5 像素字体，用在海报 / 小标签上 */
const FONT3 = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'], D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'], J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['#.#', '##.', '#.#', '#.#', '#.#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'], P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '###', '..#'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'], V: ['#.#', '#.#', '#.#', '.#.', '.#.'],
  W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['##.', '..#', '.#.', '#..', '###'], 3: ['##.', '..#', '.#.', '..#', '##.'],
  4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '##.'],
  ' ': ['...', '...', '...', '...', '...'], '/': ['..#', '..#', '.#.', '#..', '#..'],
  '.': ['...', '...', '...', '...', '.#.'],
};
function text3(g, str, x, y, color, scale = 1, gap = 1) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const rows = FONT3[ch] || FONT3[' '];
    g.fillStyle = color;
    for (let ry = 0; ry < 5; ry++) {
      for (let rx = 0; rx < 3; rx++) {
        if (rows[ry][rx] === '#') g.fillRect(cx + rx * scale, y + ry * scale, scale, scale);
      }
    }
    cx += (3 + gap) * scale;
  }
  return cx;
}
function text3Width(str, scale = 1, gap = 1) {
  return str.length * (3 + gap) * scale - gap * scale;
}
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ---------- 几何 ------------------------------------------------------ */
const WIN = { x: 12, y: 20, w: 78, h: 80 };
const WIN_IN = { x: WIN.x + 3, y: WIN.y + 3, w: WIN.w - 6, h: WIN.h - 6 }; // 15,23,72,74
const SILL = { x: 8, y: 100, w: 86, h: 4 };
const POSTER = { x: 100, y: 12, w: 56, h: 38 };
const SHELF = { x: 244, y: 18, w: 72, h: 122 };
const DESK = { x: 96, y: 112, w: 144 }; // 桌面线 y=112，前沿到 120
const CRT = { x: 118, y: 56, w: 70, h: 56 };
const SCR = { x: 126, y: 66, w: 54, h: 42 };        // 屏幕玻璃
const SCR_CONTENT = { x: 126, y: 72, w: 54, h: 30 }; // 16:9 内容在 4:3 屏幕里上下留黑边
const PLANT = { x: 2, y: 96, w: 30, h: 46 };
const CHAIR = { x: 124, y: 150, w: 86, h: 30 };

/* ---------- 画布 ------------------------------------------------------ */
const canvas = document.getElementById('room');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;

const bg = document.createElement('canvas');
bg.width = W;
bg.height = H;
const bgx = bg.getContext('2d');
bgx.imageSmoothingEnabled = false;

/* ---------- 台词 / 状态 ----------------------------------------------- */
let lampOn = true;
let musicOn = false;
let hoverKey = null;
let modalOpen = null;
let hintHidden = false;
let activeReel = { i: 0 };
let leaving = false;
let audioCtx = null;
let masterGain = null;
let soundOn = false;
let lastFrame = 0;

/* ---------- 主站 → 两个独立项目 -------------------------------------- */
/* 本地联调（pixel-homepage/ 里）指向相邻方向目录；独立仓库 / 正式站
   用部署后的兄弟项目路径。部署时房间在站点根目录，另外两个项目在
   /pixel-cinema/、/pixel-earth/（GitHub Pages project pages）。 */
const IS_DEV = location.pathname.includes('/pixel-homepage/');
const PROJECT_URLS = {
  cinema: IS_DEV ? '../direction-01-projector/index.html' : '../pixel-cinema/',
  earth: IS_DEV ? '../direction-03-globe/index.html' : '../pixel-earth/',
};

function goProject(target) {
  if (leaving) return;
  if (target !== 'cinema' && target !== 'earth') return;
  leaving = true;
  hideHint();
  closeModal(true);
  blip(180, 0.08);
  const flash = document.getElementById('crtFlash');
  if (flash) {
    flash.classList.remove('on');
    void flash.offsetWidth;
    flash.classList.add('on');
  }
  const url = target === 'cinema'
    ? PROJECT_URLS.cinema + '?screening=1&reel=' + encodeURIComponent(player.reel.id) + '&from=room'
    : PROJECT_URLS.earth;
  setTimeout(() => { location.href = url; }, 430);
}

/* =====================================================================
   1. 静态背景
   ===================================================================== */

function buildRoom(g) {
  drawWall(g);
  drawFloor(g);
  drawWindowStatic(g);
  drawPoster(g);
  drawShelf(g);
  drawPlant(g);
  drawDesk(g);
  drawCRT(g);
  drawDeskItems(g);
  drawChair(g);
}

function drawWall(g) {
  const grad = g.createLinearGradient(0, 0, 0, 140);
  grad.addColorStop(0, C.wall1);
  grad.addColorStop(0.55, C.wall2);
  grad.addColorStop(1, C.wall3);
  R(g, 0, 0, W, 140, grad);

  /* 壁纸竖条纹 + 稀疏噪点 */
  for (let x = 0; x < W; x += 18) R(g, x, 0, 8, 134, C.wallStripe);
  const r = rng(11);
  for (let i = 0; i < 90; i++) {
    R(g, (r() * W) | 0, (r() * 130) | 0, 1, 1, C.wallDot);
  }

  /* 墙脚：踢脚线 */
  R(g, 0, 133, W, 7, C.base1);
  R(g, 0, 133, W, 1, C.baseHi);
  R(g, 0, 139, W, 1, C.baseDark);
}

function drawFloor(g) {
  const grad = g.createLinearGradient(0, 140, 0, 180);
  grad.addColorStop(0, '#241a1d');
  grad.addColorStop(0.55, '#332427');
  grad.addColorStop(1, '#2a1d20');
  R(g, 0, 140, W, 40, grad);

  /* 木地板：向房间深处收束的透视板缝 */
  for (let i = -7; i <= 7; i++) {
    const xb = 160 + i * 23;
    const xt = 160 + i * 5;
    g.fillStyle = 'rgba(10,6,8,.34)';
    g.beginPath();
    g.moveTo(xt, 140);
    g.lineTo(xb, 180);
    g.lineTo(xb + 1, 180);
    g.lineTo(xt + 1, 140);
    g.fill();
  }
  /* 越远越暗 */
  const fd = g.createLinearGradient(0, 140, 0, 180);
  fd.addColorStop(0, 'rgba(0,0,0,.34)');
  fd.addColorStop(0.5, 'rgba(0,0,0,.08)');
  fd.addColorStop(1, 'rgba(255,255,255,.02)');
  R(g, 0, 140, W, 40, fd);
  /* 几道木纹高光 */
  const r = rng(31);
  for (let i = 0; i < 12; i++) {
    R(g, (r() * W) | 0, 146 + ((r() * 30) | 0), 8 + ((r() * 22) | 0), 1, 'rgba(255,255,255,.03)');
  }
  /* 靠墙更暗，靠前有一点反光 */
  R(g, 0, 140, W, 5, 'rgba(0,0,0,.32)');
  dither(g, 0, 168, W, 12, 'rgba(255,255,255,.022)', 2);

  /* 地毯 */
  const rx = 62, ry = 148, rw = 176, rh = 28;
  R(g, rx + 2, ry, rw - 4, rh, C.rug1);
  R(g, rx, ry + 2, rw, rh - 4, C.rug1);
  R(g, rx + 3, ry + 1, rw - 6, rh - 2, C.rug2);
  R(g, rx + 3, ry + 1, rw - 6, 1, C.rugLine);
  R(g, rx + 3, ry + rh - 2, rw - 6, 1, C.rugLine);
  /* 菱形花纹 */
  for (let x = rx + 12; x < rx + rw - 8; x += 22) {
    for (let y = ry + 7; y < ry + rh - 6; y += 10) {
      PX(g, x, y, C.rugLine);
      PX(g, x - 1, y + 1, C.rugLine);
      PX(g, x + 1, y + 1, C.rugLine);
      PX(g, x, y + 2, C.rugLine);
    }
  }
  /* 流苏 */
  for (let x = rx + 2; x < rx + rw - 2; x += 4) {
    R(g, x, ry + rh, 1, 2, C.rugFringe);
    R(g, x, ry - 2, 1, 2, C.rugFringe);
  }
}

function drawWindowStatic(g) {
  const { x, y, w, h } = WIN;
  const ix = WIN_IN.x, iy = WIN_IN.y, iw = WIN_IN.w, ih = WIN_IN.h;

  /* 窗洞阴影 + 天空 */
  R(g, x - 3, y - 3, w + 6, h + 6, 'rgba(0,0,0,.5)');
  const sky = g.createLinearGradient(0, iy, 0, iy + ih);
  sky.addColorStop(0, C.sky1);
  sky.addColorStop(0.55, C.sky2);
  sky.addColorStop(1, C.sky3);
  R(g, ix, iy, iw, ih, sky);

  /* 最远一层楼：雾蓝色剪影 */
  const far = [
    { x: 15, w: 10, top: 76 }, { x: 26, w: 7, top: 81 }, { x: 34, w: 11, top: 78 },
    { x: 46, w: 9, top: 83 }, { x: 57, w: 13, top: 77 }, { x: 71, w: 9, top: 82 },
    { x: 81, w: 7, top: 79 },
  ];
  for (const b of far) R(g, b.x, b.top, b.w, 97 - b.top, '#1c2a48');

  /* 地平线附近的城市辉光 */
  const haze = g.createLinearGradient(0, 96, 0, 62);
  haze.addColorStop(0, 'rgba(255,110,160,.16)');
  haze.addColorStop(0.5, 'rgba(90,70,140,.10)');
  haze.addColorStop(1, 'rgba(20,30,60,0)');
  R(g, ix, 62, iw, 35, haze);

  /* 月亮 */
  R(g, 70, 28, 6, 6, C.moon);
  R(g, 70, 28, 2, 2, C.moon2);
  R(g, 68, 30, 2, 2, C.moon2);
  R(g, 73, 26, 1, 1, C.moon2);

  /* 远处楼群 */
  const buildings = [
    { x: 15, w: 19, top: 62, c: '#04070f' },
    { x: 32, w: 17, top: 54, c: '#03060d' },
    { x: 47, w: 18, top: 68, c: '#050912' },
    { x: 63, w: 17, top: 50, c: '#040811' },
    { x: 78, w: 9, top: 61, c: '#03060c' },
  ];
  for (const b of buildings) {
    R(g, b.x, b.top, b.w, iy + ih - b.top, b.c);
    R(g, b.x, b.top, b.w, 1, 'rgba(150,180,240,.32)');
    R(g, b.x, b.top, 1, iy + ih - b.top, 'rgba(130,160,230,.14)');
  }
  /* 天线 & 屋顶细节 */
  R(g, 36, 48, 1, 6, C.bld1);
  PX(g, 36, 47, '#41506f');
  R(g, 67, 44, 1, 6, C.bld1);
  R(g, 64, 52, 6, 1, 'rgba(150,180,240,.08)');
  /* 窗外的电线 */
  R(g, ix, 47, iw, 1, 'rgba(0,0,0,.55)');
  R(g, 42, 47, 1, 10, 'rgba(0,0,0,.35)');

  /* 窗框：只画四条边，别盖住夜景 */
  R(g, x, y, w, 3, C.frame1);
  R(g, x, y + h - 3, w, 3, C.frame1);
  R(g, x, y, 3, h, C.frame1);
  R(g, x + w - 3, y, 3, h, C.frame1);
  R(g, x, y, w, 1, C.frameHi);
  R(g, x, y, 1, h, C.frameHi);
  R(g, x, y + h - 1, w, 1, C.frameDark);
  R(g, x + w - 1, y, 1, h, C.frameDark);
  /* 中横 / 中竖 */
  R(g, x + 36, y, 3, h, C.frame1);
  R(g, x + 36, y, 1, h, C.frameHi);
  R(g, x, y + 37, w, 3, C.frame1);
  R(g, x, y + 37, w, 1, C.frameHi);
  /* 窗洞内侧的暗边 */
  R(g, ix, iy, iw, 1, 'rgba(0,0,0,.5)');
  R(g, ix, iy, 1, ih, 'rgba(0,0,0,.4)');
  R(g, ix, iy + ih - 1, iw, 1, 'rgba(0,0,0,.35)');
  R(g, ix + iw - 1, iy, 1, ih, 'rgba(0,0,0,.35)');
  /* 木窗台 */
  R(g, SILL.x, SILL.y, SILL.w, SILL.h, C.wood2);
  R(g, SILL.x, SILL.y, SILL.w, 1, C.woodHi);
  R(g, SILL.x, SILL.y + SILL.h, SILL.w, 1, 'rgba(0,0,0,.45)');
  /* 窗台阴影 */
  R(g, x, y + h, w, 2, 'rgba(0,0,0,.35)');
}

function drawPoster(g) {
  const { x, y, w, h } = POSTER;
  R(g, x, y, w, h, '#161020');
  R(g, x, y, w, 2, C.wood3);
  R(g, x, y + h - 2, w, 2, C.wood3);
  R(g, x, y, 2, h, C.wood3);
  R(g, x + w - 2, y, 2, h, C.wood3);
  R(g, x + 2, y + 2, w - 4, h - 4, '#0a0b13');
  /* 一点点扫描线 */
  for (let yy = y + 4; yy < y + h - 4; yy += 2) R(g, x + 3, yy, w - 6, 1, 'rgba(255,255,255,.025)');

  text3(g, 'MATRIX', x + (w - text3Width('MATRIX', 1, 1)) / 2, y + 6, C.neonCyan, 1, 1);

  /* 红药丸 / 蓝药丸 */
  const pillY = y + 17;
  const drawPill = (px, color, hi) => {
    R(g, px, pillY, 10, 4, color);
    R(g, px + 1, pillY - 1, 8, 1, color);
    R(g, px + 1, pillY + 4, 8, 1, color);
    R(g, px + 2, pillY, 2, 1, hi);
  };
  drawPill(x + 10, '#c8203f', '#ff7a8f');
  drawPill(x + 32, '#1d4f8f', '#6fb8ff');

  text3(g, 'RED', x + 10, y + 25, '#c8203f', 1, 1);
  text3(g, 'BLUE', x + 32, y + 25, '#4f8fd0', 1, 1);
  text3(g, '1999', x + (w - text3Width('1999', 1, 1)) / 2, y + 32, 'rgba(120,140,180,.5)', 1, 1);
}

function drawShelf(g) {
  const { x, y, w, h } = SHELF;
  const innerX = x + 3, innerW = w - 6;

  /* 柜体 */
  R(g, x, y, w, h, C.shelf1);
  R(g, x, y, w, 3, C.shelf2);
  R(g, x, y, 3, h, C.shelf2);
  R(g, x + w - 3, y, 3, h, C.shelf3);
  R(g, x, y + h - 1, w, 1, 'rgba(0,0,0,.5)');
  /* 脚 */
  R(g, x + 2, y + h, 5, 3, C.shelf3);
  R(g, x + w - 7, y + h, 5, 3, C.shelf3);

  /* 内部背板 */
  R(g, innerX, y + 3, innerW, h - 6, C.shelfIn);
  /* 隔板：4 层 + 中竖隔板 */
  const boardYs = [21, 50, 79, 108, 136];
  for (const by of boardYs) {
    R(g, innerX, by, innerW, 3, C.shelf1);
    R(g, innerX, by, innerW, 1, C.shelf2);
  }
  R(g, 280, y + 3, 2, h - 6, C.shelf1);

  /* 书 */
  const books = ['#5a2a3c', '#2f4a62', '#7a5a2e', '#2f5a4a', '#5a4a72', '#7a3a2a', '#3a5a72',
                 '#6b7a8a', '#8a6a4a', '#4a3a5a', '#8a4a52', '#3d6248'];
  const hi = ['#7a3a52', '#4a6a8a', '#a07a42', '#4a7a64', '#7a6a92', '#a0523a', '#527a92',
              '#8fa0b0', '#b08a62', '#6a5a7a', '#b06a72', '#5a8a68'];
  const r = rng(1234);
  const cells = [
    [24, 50], [53, 79], [82, 108], [111, 136],
  ];
  for (let row = 0; row < cells.length; row++) {
    for (let col = 0; col < 2; col++) {
      const cx = col === 0 ? 249 : 283;
      const cw = col === 0 ? 30 : 28;
      const [y1, y2] = cells[row];
      let bx = cx;
      const seed = r();
      if (seed < 0.18) {
        /* 这一格放平摊的书 / 小摆件 */
        if (seed < 0.09) {
          for (let i = 0; i < 3; i++) {
            R(g, bx + 2, y2 - 4 - i * 3, cw - 8, 2, books[(r() * books.length) | 0]);
            R(g, bx + 2, y2 - 4 - i * 3, cw - 8, 1, hi[(r() * hi.length) | 0]);
          }
        } else {
          /* 小盆栽 */
          const px = bx + 8;
          R(g, px, y2 - 7, 9, 7, C.pot);
          R(g, px, y2 - 7, 9, 1, C.pot2);
          R(g, px + 1, y2 - 4, 7, 2, C.soil);
          R(g, px + 2, y2 - 11, 1, 4, C.leaf1);
          R(g, px + 5, y2 - 12, 1, 5, C.leaf1);
          R(g, px + 8, y2 - 10, 1, 3, C.leaf1);
          R(g, px + 1, y2 - 12, 3, 1, C.leaf2);
          R(g, px + 6, y2 - 13, 3, 1, C.leaf2);
        }
        continue;
      }
      while (bx < cx + cw - 3) {
        const bw = 2 + ((r() * 3) | 0);
        if (bx + bw > cx + cw - 1) break;
        const bh = 13 + ((r() * 11) | 0);
        const bi = (r() * books.length) | 0;
        R(g, bx, y2 - bh, bw, bh, books[bi]);
        R(g, bx, y2 - bh, 1, bh, hi[bi]);
        R(g, bx, y2 - bh, bw, 1, 'rgba(255,255,255,.12)');
        bx += bw + (r() < 0.25 ? 2 : 0);
      }
    }
  }

  /* 顶上的摆件：盆栽、收音机、相框 */
  /* 盆栽 */
  R(g, 250, 10, 12, 8, C.pot);
  R(g, 250, 10, 12, 1, C.pot2);
  R(g, 251, 13, 10, 2, C.soil);
  R(g, 252, 3, 1, 7, C.leaf1);
  R(g, 256, 1, 1, 9, C.leaf1);
  R(g, 260, 4, 1, 6, C.leaf1);
  R(g, 251, 2, 3, 1, C.leaf2);
  R(g, 256, 0, 4, 1, C.leaf2);
  R(g, 259, 3, 3, 1, C.leaf2);
  /* 收音机 */
  R(g, 268, 6, 20, 12, '#3a3340');
  R(g, 268, 6, 20, 1, '#5a5260');
  R(g, 270, 8, 11, 5, '#15121c');
  for (let i = 0; i < 4; i++) R(g, 272 + i * 2, 9, 1, 3, '#7a7280');
  R(g, 284, 8, 2, 2, C.neonAmber);
  R(g, 284, 11, 2, 1, '#8a8290');
  R(g, 284, 13, 2, 1, '#8a8290');
  R(g, 278, 3, 1, 3, '#5a5260');
  PX(g, 278, 2, C.neonPink);
  /* 相框 */
  R(g, 294, 5, 14, 13, '#2a2028');
  R(g, 295, 6, 12, 11, '#6a5a52');
  R(g, 297, 8, 8, 7, '#3a4a5a');
  R(g, 298, 9, 3, 2, '#7a9ab0');
  R(g, 297, 13, 8, 2, '#2a3a48');
}

function drawPlant(g) {
  /* 角落的大型盆栽 */
  const { x, y } = PLANT;
  R(g, x + 6, y + 26, 16, 16, C.pot);
  R(g, x + 6, y + 26, 16, 2, C.pot2);
  R(g, x + 7, y + 24, 14, 2, C.pot2);
  R(g, x + 7, y + 22, 14, 2, C.soil);
  R(g, x + 12, y + 16, 1, 8, C.leaf1);
  R(g, x + 17, y + 10, 1, 14, C.leaf1);
  R(g, x + 21, y + 14, 1, 10, C.leaf1);
  R(g, x + 8, y + 8, 4, 3, C.leaf2);
  R(g, x + 6, y + 6, 3, 2, C.leaf2);
  R(g, x + 10, y + 4, 3, 2, C.leaf2);
  R(g, x + 15, y + 2, 5, 2, C.leaf2);
  R(g, x + 19, y + 5, 4, 2, C.leaf2);
  R(g, x + 22, y + 8, 3, 2, C.leaf2);
  R(g, x + 12, y + 9, 4, 2, C.leaf2);
  R(g, x + 22, y + 15, 4, 2, C.leaf1);
  R(g, x + 8, y + 12, 3, 2, C.leaf1);
  R(g, x + 16, y + 16, 3, 2, C.leaf1);
}

function drawDesk(g) {
  const { x, w } = DESK;
  const topY = 112;
  /* 桌腿 */
  R(g, x + 4, topY + 8, 6, 42, C.wood3);
  R(g, x + w - 10, topY + 8, 6, 42, C.wood3);
  R(g, x + 4, topY + 8, 1, 42, 'rgba(255,255,255,.05)');
  /* 桌斗 / 前挡板 */
  R(g, x + 10, topY + 8, w - 20, 14, C.deskFront);
  R(g, x + 12, topY + 10, w - 24, 4, C.wood3);
  R(g, x + 12, topY + 16, w - 24, 4, C.wood3);
  R(g, x + 12, topY + 10, w - 24, 1, C.woodHi);
  R(g, x + 12, topY + 16, w - 24, 1, C.woodHi);
  /* 抽屉把手 */
  R(g, x + 58, topY + 12, 8, 2, C.woodHi);
  R(g, x + 58, topY + 18, 8, 2, C.woodHi);
  /* 桌面 */
  R(g, x, topY, w, 8, C.deskTop);
  R(g, x, topY, w, 1, C.deskHi);
  R(g, x, topY + 6, w, 2, C.wood3);
  R(g, x, topY + 8, w, 1, 'rgba(0,0,0,.35)');
  /* 桌面木纹 */
  for (let i = 0; i < 9; i++) R(g, x + 4 + i * 15, topY + 2 + (i % 2), 8, 1, 'rgba(0,0,0,.18)');
}

function drawCRT(g) {
  const { x, y, w, h } = CRT;
  /* 显示器在桌面上的投影 */
  R(g, x + 6, 112, w - 12, 3, 'rgba(0,0,0,.30)');
  R(g, x + 16, 115, w - 32, 2, 'rgba(0,0,0,.22)');
  /* 圆角外壳（用几行分段拼） */
  R(g, x + 4, y, w - 8, 2, C.crt1);
  R(g, x + 2, y + 2, w - 4, 2, C.crt1);
  R(g, x, y + 4, w, h - 8, C.crt1);
  R(g, x + 2, y + h - 4, w - 4, 2, C.crt1);
  R(g, x + 4, y + h - 2, w - 8, 2, C.crt1);
  /* 明暗 */
  R(g, x, y + 4, 2, h - 10, C.crt2);
  R(g, x + 2, y + h - 6, w - 6, 2, C.crt3);
  R(g, x + w - 3, y + 6, 3, h - 12, C.crt3);
  R(g, x + 2, y + 2, w - 8, 1, 'rgba(255,255,255,.35)');
  /* 屏幕框 / 屏幕底 */
  R(g, SCR.x - 2, SCR.y - 2, SCR.w + 4, SCR.h + 4, C.crt3);
  R(g, SCR.x - 1, SCR.y - 1, SCR.w + 2, SCR.h + 2, C.crt4);
  R(g, SCR.x, SCR.y, SCR.w, SCR.h, '#04080c');
  /* 外壳细节：电源灯、散热孔、标签、贴纸、螺丝 */
  R(g, 176, 105, 2, 2, '#1d3a30');
  R(g, 138, 105, 14, 1, '#8b8168');
  R(g, 138, 107, 14, 1, '#8b8168');
  text3(g, 'JOY-01', 145, 104, 'rgba(70,62,48,.6)', 1, 1);
  R(g, 121, 59, 4, 4, '#c8506a');
  R(g, 122, 60, 2, 2, '#e88a9a');
  R(g, 182, 60, 2, 2, '#8b8168');
  R(g, 122, 104, 2, 2, '#7a705a');
  R(g, 179, 101, 3, 3, '#6f6753');
  R(g, 180, 102, 1, 1, '#4a4436');
  /* 屏幕玻璃的四边阴影 */
  R(g, SCR.x, SCR.y, SCR.w, 1, 'rgba(0,0,0,.65)');
  R(g, SCR.x, SCR.y, 1, SCR.h, 'rgba(0,0,0,.5)');
  R(g, SCR.x, SCR.y + SCR.h - 1, SCR.w, 1, 'rgba(0,0,0,.4)');
  R(g, SCR.x + SCR.w - 1, SCR.y, 1, SCR.h, 'rgba(0,0,0,.4)');
  /* 支架 */
  R(g, 148, 112, 10, 3, C.crt3);
  R(g, 148, 112, 10, 1, C.crt2);
  R(g, 136, 115, 32, 3, C.crt2);
  R(g, 136, 115, 32, 1, C.crt1);
  R(g, 136, 118, 32, 1, 'rgba(0,0,0,.4)');
  /* 电源线 */
  for (let i = 0; i < 14; i++) {
    const px = 186 + i;
    const py = 108 + Math.round(Math.sin(i * 0.28) * 3) + ((i / 5) | 0);
    PX(g, px, py, 'rgba(10,8,14,.9)');
  }
}

function drawDeskItems(g) {
  const topY = 112;
  /* 键盘：有轮廓、有三排按键 */
  R(g, 120, topY + 4, 62, 10, '#0c0f16');
  R(g, 121, topY + 5, 60, 8, '#232a3a');
  R(g, 121, topY + 5, 60, 1, '#3e4a63');
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 12; col++) {
      const kx = 123 + col * 4 + row;
      const ky = topY + 6 + row * 2;
      R(g, kx, ky, 3, 1, row === 2 && col > 7 ? '#2e3648' : '#171d29');
      R(g, kx, ky, 1, 1, '#4a5670');
    }
  }
  R(g, 124, topY + 12, 54, 1, '#171d29');

  /* 鼠标 + 线 */
  R(g, 184, topY + 6, 8, 6, '#0c0f16');
  R(g, 185, topY + 5, 8, 6, '#2e3648');
  R(g, 185, topY + 5, 8, 1, '#4a5670');
  R(g, 188, topY + 7, 1, 2, '#171d29');
  for (let i = 0; i < 6; i++) PX(g, 192 + i, topY + 7 + (i > 2 ? 1 : 0), '#171d29');

  /* 马克杯 */
  R(g, 218, topY - 9, 10, 9, '#d8d0bc');
  R(g, 218, topY - 9, 10, 1, '#efe8d6');
  R(g, 218, topY - 9, 1, 9, '#b8b09c');
  R(g, 228, topY - 7, 3, 5, '#d8d0bc');
  R(g, 229, topY - 6, 1, 3, '#7a6a58');
  R(g, 220, topY - 8, 6, 1, '#3a2a22');

  /* 台灯 */
  R(g, 226, topY - 4, 16, 4, '#2f2830');
  R(g, 226, topY - 4, 16, 1, '#4a4048');
  R(g, 230, 92, 2, 17, '#3a3038');
  R(g, 230, 92, 1, 17, '#5a4e58');
  const shade = [
    [211, 78, 10], [210, 80, 14], [209, 82, 18], [208, 84, 22],
    [207, 86, 24], [206, 88, 26], [205, 90, 28],
  ];
  for (const [sx, sy, sw] of shade) {
    R(g, sx, sy, sw, 2, '#b8843f');
    R(g, sx, sy, sw, 1, '#d9a95c');
  }
  R(g, 205, 90, 28, 1, '#8a5a2c');
  R(g, 214, 91, 10, 2, '#ffe9a8');
  R(g, 216, 90, 6, 1, '#fff6d0');

  /* 插座 / 线 */
  R(g, 198, 108, 5, 4, '#2a2e40');
  R(g, 199, 109, 3, 1, '#12141e');
}

function drawChair(g) {
  const x = 124, y = 150, w = 86;
  /* 地面阴影 */
  R(g, x + 12, y + 26, w - 24, 5, 'rgba(0,0,0,.32)');
  /* 椅背 */
  const bx = x + 16, by = y + 6, bw = w - 32, bh = 24;
  R(g, bx + 2, by, bw - 4, bh, '#151220');
  R(g, bx, by + 2, bw, bh - 2, '#151220');
  R(g, bx + 1, by + 1, bw - 2, 1, 'rgba(255,255,255,.045)');
  /* 头枕 */
  R(g, x + 26, y, w - 52, 4, '#1c1828');
  R(g, x + 26, y, w - 52, 1, '#2a2438');
  /* 扶手 */
  R(g, x + 2, y + 14, 10, 4, '#1c1828');
  R(g, x + w - 12, y + 14, 10, 4, '#1c1828');
  R(g, x + 2, y + 14, 10, 1, '#2f2a40');
  R(g, x + w - 12, y + 14, 10, 1, '#2f2a40');
  R(g, x + 3, y + 18, 2, 10, '#100e17');
  R(g, x + w - 5, y + 18, 2, 10, '#100e17');
  /* 左右受光：左边是窗，右边是台灯 */
  R(g, bx, by + 2, 1, bh - 2, 'rgba(92,236,212,.16)');
  R(g, bx + bw - 1, by + 2, 1, bh - 2, 'rgba(255,200,87,.18)');
  R(g, bx + 2, by, bw - 4, 1, 'rgba(92,236,212,.06)');
  /* 椅背的横向车线 */
  for (let yy = by + 6; yy < by + bh - 3; yy += 7) {
    R(g, bx + 5, yy, bw - 10, 1, 'rgba(255,255,255,.028)');
  }
  /* 靠背中心的凹陷 */
  R(g, bx + 8, by + 4, bw - 16, bh - 8, 'rgba(0,0,0,.12)');
  /* 挂在椅背上的耳机 */
  const hx = bx + bw - 13, hy = by + 4;
  R(g, hx + 2, hy, 6, 1, '#2e2a40');
  R(g, hx, hy + 1, 1, 4, '#2e2a40');
  R(g, hx + 9, hy + 1, 1, 4, '#2e2a40');
  R(g, hx, hy + 5, 2, 3, '#3f3a54');
  R(g, hx + 8, hy + 5, 2, 3, '#3f3a54');
  R(g, hx, hy + 5, 2, 2, 'rgba(255,200,87,.25)');
  R(g, hx + 8, hy + 5, 2, 2, 'rgba(92,236,212,.18)');
}

/* =====================================================================
   2. 动态层
   ===================================================================== */

/* 雨 */
const rain = [];
for (let i = 0; i < 64; i++) {
  rain.push({
    x: WIN_IN.x + Math.random() * WIN_IN.w,
    y: WIN_IN.y + Math.random() * WIN_IN.h,
    s: 0.5 + Math.random() * 1.4,
    l: 2 + Math.random() * 4,
  });
}

/* 城市窗灯（确定性生成，闪烁） */
const cityLights = [];
{
  const r = rng(77);
  const buildings = [
    { x: 16, w: 18, top: 64 }, { x: 33, w: 16, top: 56 }, { x: 48, w: 17, top: 70 },
    { x: 64, w: 16, top: 52 }, { x: 79, w: 8, top: 63 },
  ];
  const colors = ['rgba(255,190,100,.75)', 'rgba(110,220,240,.6)', 'rgba(120,140,200,.35)'];
  for (const b of buildings) {
    for (let y = b.top + 5; y < 94; y += 4) {
      for (let x = b.x + 2; x < b.x + b.w - 2; x += 3) {
        if (r() < 0.42) {
          cityLights.push({
            x, y,
            c: colors[(r() * colors.length) | 0],
            ph: r() * 6.28,
            sp: 0.6 + r() * 2.2,
          });
        }
      }
    }
  }
}

function drawWindow(t, dt) {
  const ix = WIN_IN.x, iy = WIN_IN.y, iw = WIN_IN.w, ih = WIN_IN.h;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ix, iy, iw, ih);
  ctx.clip();

  /* 城市灯光闪烁 */
  for (const w of cityLights) {
    const a = 0.55 + 0.45 * Math.sin(t * w.sp + w.ph);
    ctx.globalAlpha = a;
    R(ctx, w.x, w.y, 1, 1, w.c);
  }
  ctx.globalAlpha = 1;

  /* 霓虹招牌：竖的粉，横的青色 */
  const flick1 = 0.72 + 0.28 * Math.sin(t * 9.3) + (Math.sin(t * 33.7) > 0.93 ? -0.35 : 0);
  const flick2 = 0.7 + 0.3 * Math.sin(t * 6.1 + 2) + (Math.sin(t * 27.1) > 0.95 ? -0.4 : 0);
  ctx.globalAlpha = Math.max(0.25, Math.min(1, flick1));
  R(ctx, 34, 63, 5, 24, C.neonPink);
  R(ctx, 35, 65, 3, 3, '#ffd6e2');
  R(ctx, 35, 70, 3, 1, '#ffd6e2');
  R(ctx, 35, 73, 3, 1, '#ffd6e2');
  ctx.globalAlpha = Math.max(0.25, Math.min(1, flick2));
  R(ctx, 59, 74, 15, 4, C.neonCyan);
  R(ctx, 60, 75, 13, 1, '#d8fff8');
  ctx.globalAlpha = 1;

  /* 闪电：很少，很快 */
  const bolt = Math.sin(t * 0.31 + 1.3);
  if (bolt > 0.9993) {
    ctx.globalAlpha = 0.18;
    R(ctx, ix, iy, iw, ih, '#c8d8ff');
    ctx.globalAlpha = 1;
  }

  /* 雨 */
  ctx.fillStyle = 'rgba(150,190,240,.30)';
  for (const d of rain) {
    d.y += d.s * 90 * dt;
    d.x -= 9 * dt;
    if (d.y > iy + ih) { d.y = iy + 2; d.x = ix + Math.random() * iw; }
    if (d.x < ix) d.x = ix + iw - 1;
    ctx.fillRect(d.x | 0, d.y | 0, 1, Math.max(1, d.l | 0));
  }
  /* 雨丝落在窗玻璃上的高光 */
  ctx.fillStyle = 'rgba(190,220,255,.10)';
  for (let i = 0; i < 8; i++) {
    const yy = iy + ((i * 13 + ((t * 7) | 0)) % ih);
    ctx.fillRect(ix + ((i * 17) % iw), yy, 6, 1);
    ctx.fillRect(ix + iw - ((i * 11) % iw), (yy + 30) % ih + iy, 4, 1);
  }

  /* 玻璃反光 */
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 5; i++) {
    for (let y = iy; y < iy + ih; y += 3) {
      ctx.fillRect(ix + 6 + i * 13 + ((y / 3) | 0) % 3, y, 2, 2);
    }
  }
  ctx.globalAlpha = 1;

  /* 窗框内侧的暗角 */
  R(ctx, ix, iy, iw, 2, 'rgba(0,0,0,.35)');
  R(ctx, ix, iy, 2, ih, 'rgba(0,0,0,.28)');
  ctx.restore();

  /* 霓虹映在窗台 / 墙上的散光 */
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g1 = ctx.createLinearGradient(WIN.x + WIN.w, 40, WIN.x + WIN.w + 40, 110);
  g1.addColorStop(0, `rgba(255,61,127,${0.05 * flick1})`);
  g1.addColorStop(1, 'rgba(255,61,127,0)');
  ctx.fillStyle = g1;
  ctx.fillRect(WIN.x + WIN.w - 4, 40, 46, 80);
  const g2 = ctx.createRadialGradient(60, 86, 2, 60, 86, 40);
  g2.addColorStop(0, `rgba(57,230,208,${0.06 * flick2})`);
  g2.addColorStop(1, 'rgba(57,230,208,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(20, 50, 80, 70);
  ctx.restore();
}

function drawMonitor(t) {
  /* 屏幕是 4:3，放映画面是 16:9：左右裁掉一点，让 CRT 整个亮起来 */
  R(ctx, SCR.x, SCR.y, SCR.w, SCR.h, '#04080c');
  ctx.save();
  ctx.beginPath();
  ctx.rect(SCR.x, SCR.y, SCR.w, SCR.h);
  ctx.clip();
  const flick = Math.sin(t * 41.7) > 0.995 ? 0.72 : 1;
  ctx.globalAlpha = flick;
  ctx.drawImage(reelCanvas, 24, 0, 144, 108, SCR.x, SCR.y, SCR.w, SCR.h);
  ctx.globalAlpha = 1;
  /* 扫描线 */
  for (let y = SCR.y; y < SCR.y + SCR.h; y += 2) {
    R(ctx, SCR.x, y, SCR.w, 1, 'rgba(0,0,0,.22)');
  }
  /* 屏幕反光 */
  ctx.globalAlpha = 0.055;
  for (let i = 0; i < 6; i++) {
    for (let y = SCR.y; y < SCR.y + SCR.h; y += 3) {
      ctx.fillRect(SCR.x + 4 + i * 9 + (((y - SCR.y) / 3) | 0) % 2, y, 2, 2);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  /* 屏幕边缘的辉光 */
  R(ctx, SCR.x - 1, SCR.y - 1, SCR.w + 2, 1, 'rgba(92,236,212,.18)');
  R(ctx, SCR.x - 1, SCR.y + SCR.h, SCR.w + 2, 1, 'rgba(92,236,212,.12)');
  R(ctx, SCR.x - 1, SCR.y, 1, SCR.h, 'rgba(92,236,212,.12)');
  R(ctx, SCR.x + SCR.w, SCR.y, 1, SCR.h, 'rgba(92,236,212,.12)');

  /* 电源灯闪烁 */
  const led = Math.sin(t * 2.2) > -0.4;
  R(ctx, 176, 105, 2, 2, led ? '#8affa8' : '#1d3a30');

  /* 屏幕在墙上的泛光 */
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(153, 96, 4, 153, 96, 74);
  glow.addColorStop(0, 'rgba(92,236,212,.10)');
  glow.addColorStop(0.5, 'rgba(80,180,220,.035)');
  glow.addColorStop(1, 'rgba(80,180,220,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(70, 30, 170, 130);
  ctx.restore();
}

let _dust = null;
function drawLamp(t, dt) {
  if (!lampOn) {
    R(ctx, 214, 91, 10, 2, '#3a3028');
    return;
  }
  const flick = 0.93 + 0.07 * Math.sin(t * 9.7) * Math.sin(t * 3.1);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  /* 灯泡周围的暖光 */
  const g1 = ctx.createRadialGradient(219, 92, 2, 219, 92, 92);
  g1.addColorStop(0, `rgba(255,196,120,${0.18 * flick})`);
  g1.addColorStop(0.35, `rgba(255,170,90,${0.075 * flick})`);
  g1.addColorStop(1, 'rgba(255,150,70,0)');
  ctx.fillStyle = g1;
  ctx.fillRect(140, 10, 180, 160);
  /* 桌面上的光斑 */
  const g2 = ctx.createRadialGradient(214, 114, 2, 214, 114, 66);
  g2.addColorStop(0, `rgba(255,210,150,${0.16 * flick})`);
  g2.addColorStop(1, 'rgba(255,180,100,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(150, 80, 140, 70);
  ctx.restore();
  /* 灯泡亮点 */
  R(ctx, 214, 91, 10, 2, `rgba(255,240,190,${0.85 * flick})`);
  R(ctx, 216, 90, 6, 1, `rgba(255,252,230,${0.95 * flick})`);

  /* 光里的灰尘 */
  ctx.fillStyle = `rgba(255,230,180,${0.28 * flick})`;
  for (let i = 0; i < 14; i++) {
    const ph = i * 1.7;
    const x = 192 + Math.sin(t * 0.35 + ph) * 26 + Math.sin(t * 1.1 + ph * 2) * 4;
    const y = 108 - ((t * 5.5 + i * 9) % 46);
    ctx.fillRect(x | 0, y | 0, 1, 1);
  }
}

function drawCat(t) {
  const bx = 60, by = 100; /* 脚底 */
  const breathe = Math.sin(t * 1.6) > 0 ? 1 : 0;
  const blink = (t % 4.6) < 0.13 || (t % 7.9) < 0.09;
  /* 身体 */
  R(ctx, bx + 3, by - 10, 10, 10, C.cat);
  R(ctx, bx + 2, by - 9, 1, 8, C.cat);
  R(ctx, bx + 13, by - 9, 1, 8, C.cat);
  R(ctx, bx + 4, by - 11, 8, 1, C.cat);
  /* 头 */
  R(ctx, bx + 4, by - 17 - breathe, 8, 7, C.cat);
  /* 耳朵 */
  R(ctx, bx + 3, by - 19 - breathe, 2, 3, C.cat);
  R(ctx, bx + 11, by - 19 - breathe, 2, 3, C.cat);
  R(ctx, bx + 4, by - 20 - breathe, 1, 1, C.cat);
  R(ctx, bx + 11, by - 20 - breathe, 1, 1, C.cat);
  /* 眼睛（琥珀色） */
  if (blink) {
    R(ctx, bx + 5, by - 14 - breathe, 2, 1, C.catRim);
    R(ctx, bx + 9, by - 14 - breathe, 2, 1, C.catRim);
  } else {
    R(ctx, bx + 5, by - 15 - breathe, 1, 2, C.catEye);
    R(ctx, bx + 6, by - 15 - breathe, 1, 1, C.catEye);
    R(ctx, bx + 9, by - 15 - breathe, 1, 2, C.catEye);
    R(ctx, bx + 10, by - 15 - breathe, 1, 1, C.catEye);
    PX(ctx, bx + 6, by - 14 - breathe, '#05040a');
    PX(ctx, bx + 9, by - 14 - breathe, '#05040a');
  }
  /* 鼻子 */
  PX(ctx, bx + 8, by - 12 - breathe, '#3a3448');
  /* 左侧的霓虹轮廓光 */
  R(ctx, bx + 2, by - 17 - breathe, 1, 1, '#3a4a68');
  R(ctx, bx + 2, by - 9, 1, 6, C.catRim);
  /* 尾巴：慢慢摆 */
  const sway = Math.sin(t * 1.2) * 2;
  for (let i = 0; i < 7; i++) {
    const tx = bx + 13 + i;
    const ty = by - 6 - Math.round(Math.sin(i * 0.6 + t * 1.4) * 1.5) - (i > 3 ? Math.round(sway * 0.6) : 0);
    R(ctx, tx, ty, 1, 2, C.cat);
  }
  /* 猫在窗台上的影子 */
  R(ctx, bx + 2, by, 13, 1, 'rgba(0,0,0,.35)');
}

function drawSteam(t) {
  const x = 223, y = 102;
  for (let i = 0; i < 3; i++) {
    const ph = i * 2.1;
    const rise = ((t * 9 + i * 7) % 16) | 0;
    const sx = x + Math.sin(t * 1.7 + ph) * 3 + i;
    const sy = y - rise;
    if (rise < 14) {
      ctx.globalAlpha = 0.22 * (1 - rise / 14);
      R(ctx, sx, sy, 1, 2, C.steam);
      R(ctx, sx + (i % 2 ? 1 : -1), sy + 3, 1, 1, C.steam);
    }
  }
  ctx.globalAlpha = 1;
}


/* 墙上的数字钟：时间是真的在走 */
function drawWallClock(t) {
  const x = 192, y = 20;
  R(ctx, x, y, 46, 22, '#0b0e18');
  R(ctx, x, y, 46, 1, '#2b3050');
  R(ctx, x, y + 21, 46, 1, '#1a1f33');
  R(ctx, x, y, 1, 22, '#232947');
  R(ctx, x + 45, y, 1, 22, '#232947');
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const colon = Math.floor(t * 2) % 2 ? ':' : ' ';
  const str = hh + colon + mm;
  text3(ctx, str, x + 4, y + 6, '#ffc857', 2, 1);
  /* 小标签 */
  text3(ctx, 'LOCAL', x + 5, y + 18, 'rgba(140,150,190,.5)', 1, 1);
}

/* =====================================================================
   2.5 桌面上的小地球仪（点它去项目③）
   ===================================================================== */
const GLOBE_COLORS = {
  ocean: [[8, 26, 46], [12, 40, 68], [20, 60, 94]],
  land: [[52, 82, 48], [74, 108, 62], [104, 136, 78]],
  ice: [[214, 228, 222], [232, 240, 238]],
};
const _shadeCache = new Map();
function shadeRgb(rgb, f) {
  const key = rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + f;
  let c = _shadeCache.get(key);
  if (!c) {
    const q = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
    c = `rgb(${q(rgb[0])},${q(rgb[1])},${q(rgb[2])})`;
    _shadeCache.set(key, c);
  }
  return c;
}

function drawGlobe(t) {
  /* 地球仪挪到窗台上，给桌面的唱机让位 */
  const cx = 40, cy = 92, rad = 7;
  /* 窗台阴影 / 木质底座 */
  R(ctx, cx - 8, 101, 16, 1, 'rgba(0,0,0,.35)');
  R(ctx, cx - 6, 100, 12, 2, '#6b4d2e');
  R(ctx, cx - 6, 100, 12, 1, '#a37c46');
  R(ctx, cx - 4, 102, 8, 1, '#4a3420');
  /* 金色半环 */
  for (let a = Math.PI * 0.52; a < Math.PI * 1.48; a += 0.09) {
    const gx = Math.round(cx + Math.cos(a) * (rad + 1.2));
    const gy = Math.round(cy + Math.sin(a) * (rad + 1.2));
    PX(ctx, gx, gy, Math.cos(a) > 0 ? '#8f7338' : '#c9a85c');
  }
  /* 立杆 */
  R(ctx, cx - 1, 98, 2, 2, '#8f7338');
  /* 球体：每一像素按球面坐标算大陆 / 海洋，然后缓慢自转 */
  const spin = t * 0.42;
  for (let dy = -rad; dy <= rad; dy++) {
    for (let dx = -rad; dx <= rad; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > rad * rad) continue;
      const z = Math.sqrt(rad * rad - d2);
      const lon = Math.atan2(dx, z) + spin;
      const lat = Math.asin(dy / rad);
      const v = Math.sin(lon * 1.9 + 1.1)
              + Math.sin(lat * 3.2 + 0.5)
              + 0.85 * Math.sin((lon + lat) * 2.1 + 2.2)
              + 0.45 * Math.sin(lon * 3.7 - lat * 2.4 + 0.8);
      const ice = Math.abs(lat) > 1.17;
      let base;
      if (ice) base = GLOBE_COLORS.ice[v > 0.4 ? 1 : 0];
      else if (v > 0.62) base = GLOBE_COLORS.land[v > 1.35 ? 2 : v > 1 ? 1 : 0];
      else base = GLOBE_COLORS.ocean[Math.max(0, Math.min(2, 1 + Math.round(dy / 7)))];
      /* 光从左上来，边缘压暗 */
      const light = 0.72 + (-dx / rad) * 0.18 + (-dy / rad) * 0.2 + (z / rad) * 0.12;
      ctx.fillStyle = shadeRgb(base, Math.max(0.45, Math.min(1.25, light)));
      ctx.fillRect(cx + dx, cy + dy, 1, 1);
    }
  }
  /* 高光 + 边缘暗线 */
  PX(ctx, cx - 3, cy - 3, 'rgba(255,255,255,.55)');
  PX(ctx, cx - 4, cy - 2, 'rgba(255,255,255,.3)');
  ctx.strokeStyle = 'rgba(8,10,18,.5)';
  ctx.beginPath();
  ctx.arc(cx + 0.5, cy + 0.5, rad, 0, Math.PI * 2);
  ctx.stroke();
}

/* =====================================================================
   2.6 桌面左边的胶片唱机（点击播放 / 暂停房间 BGM）
   ===================================================================== */
let vinylSpin = 0;
let vinylSpeed = 0;
let tonearmT = 0;
let noteTimer = 0;
const musicNotes = [];

function drawTurntable(t, dt) {
  const cx = 106, rad = 7, pivotX = 115, pivotY = 96;
  const targetSpeed = musicOn ? 2.6 : 0;
  vinylSpeed += (targetSpeed - vinylSpeed) * Math.min(1, dt * 4.5);
  vinylSpin += vinylSpeed * dt;
  tonearmT += ((musicOn ? 1 : 0) - tonearmT) * Math.min(1, dt * 9);

  /* 桌面阴影 + 木壳 */
  R(ctx, 95, 111, 23, 2, 'rgba(0,0,0,.32)');
  R(ctx, 96, 104, 22, 8, '#3b2a31');
  R(ctx, 96, 104, 22, 1, '#5b4048');
  R(ctx, 96, 111, 22, 1, '#20151a');
  R(ctx, 97, 106, 2, 4, '#2a1c22');

  /* 前面板：品牌 / 指示灯 / 播放-暂停图标 */
  text3(ctx, 'JTW', 98, 107, 'rgba(180,150,110,.5)', 1, 1);
  R(ctx, 115, 107, 2, 2, musicOn ? '#8affa8' : '#3a2b25');
  if (musicOn) {
    R(ctx, 98, 108, 1, 3, 'rgba(255,230,190,.6)');
    R(ctx, 100, 108, 1, 3, 'rgba(255,230,190,.6)');
  } else {
    PX(ctx, 98, 108, 'rgba(255,230,190,.7)');
    PX(ctx, 99, 107, 'rgba(255,230,190,.7)');
    PX(ctx, 99, 108, 'rgba(255,230,190,.7)');
    PX(ctx, 99, 109, 'rgba(255,230,190,.7)');
    PX(ctx, 100, 108, 'rgba(255,230,190,.7)');
  }

  /* 转盘底座 */
  R(ctx, 100, 102, 14, 2, '#4a3a45');
  R(ctx, 100, 102, 14, 1, '#6b5662');

  /* 黑胶唱片 */
  for (let dy = -rad; dy <= rad; dy++) {
    for (let dx = -rad; dx <= rad; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > rad * rad) continue;
      const ring = Math.sqrt(d2);
      let color;
      if (ring > rad - 1.2) color = '#0b0810';
      else if ((ring | 0) % 2 === 0) color = '#191320';
      else color = '#221a2a';
      if (ring < 2.6) color = '#8c5a4c';
      if (ring < 1.2) color = '#e0a080';
      ctx.fillStyle = color;
      ctx.fillRect(cx + dx, 101 + dy, 1, 1);
    }
  }
  /* 旋转高光 + 中心轴 */
  const gx = Math.round(cx + Math.cos(vinylSpin) * (rad - 2));
  const gy = Math.round(101 + Math.sin(vinylSpin) * (rad - 2));
  PX(ctx, gx, gy, 'rgba(225,215,245,.55)');
  PX(ctx, Math.round(cx - Math.cos(vinylSpin) * (rad - 2)), Math.round(101 - Math.sin(vinylSpin) * (rad - 2)), 'rgba(225,215,245,.16)');
  PX(ctx, cx, 101, '#f0e6d2');

  /* 唱臂 */
  const endX = pivotX - 6 * tonearmT;
  const endY = 92 + 9 * tonearmT;
  for (let i = 0; i <= 8; i++) {
    const px = Math.round(pivotX + (endX - pivotX) * i / 8);
    const py = Math.round(pivotY + (endY - pivotY) * i / 8);
    PX(ctx, px, py, '#cbb89a');
  }
  R(ctx, Math.round(endX) - 1, Math.round(endY), 2, 1, '#e8d8be');
  R(ctx, pivotX - 1, pivotY - 1, 3, 3, '#6b5a4a');
  PX(ctx, pivotX, pivotY - 1, '#a89178');

  /* 播放时飘出的像素音符 */
  if (musicOn) {
    noteTimer += dt;
    if (noteTimer > 0.55) {
      noteTimer = 0;
      musicNotes.push({
        x: cx + (Math.random() * 10 - 5),
        y: 96,
        vy: 8 + Math.random() * 6,
        life: 0,
        c: Math.random() < 0.5 ? '#ffc857' : '#5cecd4',
      });
    }
  }
  for (let i = musicNotes.length - 1; i >= 0; i--) {
    const n = musicNotes[i];
    n.y -= n.vy * dt;
    n.life += dt;
    if (n.y < 82 || n.life > 2.2) { musicNotes.splice(i, 1); continue; }
    ctx.fillStyle = n.c;
    ctx.globalAlpha = Math.max(0.15, 1 - n.life / 2.2);
    ctx.fillRect(Math.round(n.x), Math.round(n.y), 1, 2);
    ctx.fillRect(Math.round(n.x) + 1, Math.round(n.y) + 1, 1, 1);
    ctx.globalAlpha = 1;
  }
}

/* =====================================================================
   3. 热区 / 交互
   ===================================================================== */
const HOTSPOTS = {
  monitor: { x: 116, y: 48, w: 78, h: 72, c: '92,236,212' },
  globe: { x: 28, y: 80, w: 28, h: 26, c: '255,200,87' },
  turntable: { x: 92, y: 88, w: 28, h: 28, c: '255,200,87' },
  shelf: { x: 240, y: 2, w: 80, h: 144, c: '255,200,87' },
  window: { x: 6, y: 14, w: 90, h: 90, c: '92,236,212' },
  lamp: { x: 204, y: 72, w: 34, h: 44, c: '255,200,87' },
  cat: { x: 55, y: 78, w: 26, h: 24, c: '255,200,87' },
};
const HOTSPOT_EL = {
  monitor: document.getElementById('hs-monitor'),
  globe: document.getElementById('hs-globe'),
  turntable: document.getElementById('hs-turntable'),
  shelf: document.getElementById('hs-shelf'),
  window: document.getElementById('hs-window'),
  lamp: document.getElementById('hs-lamp'),
  cat: document.getElementById('hs-cat'),
};

function syncHotspots() {
  for (const [key, h] of Object.entries(HOTSPOTS)) {
    const el = HOTSPOT_EL[key];
    if (!el) continue;
    el.style.left = (h.x / W * 100) + '%';
    el.style.top = (h.y / H * 100) + '%';
    el.style.width = (h.w / W * 100) + '%';
    el.style.height = (h.h / H * 100) + '%';
  }
}

function drawHover(t) {
  if (!hoverKey || modalOpen || leaving) return;
  const h = HOTSPOTS[hoverKey];
  if (!h) return;
  ctx.save();
  /* 内部淡淡的高亮 */
  ctx.fillStyle = `rgba(${h.c},.07)`;
  ctx.fillRect(h.x, h.y, h.w, h.h);
  /* 虚线呼吸框 */
  ctx.strokeStyle = `rgba(${h.c},${0.55 + 0.2 * Math.sin(t * 4)})`;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.lineDashOffset = -(t * 16) % 6;
  ctx.strokeRect(h.x + 0.5, h.y + 0.5, h.w - 1, h.h - 1);
  ctx.setLineDash([]);
  /* 四角 */
  ctx.fillStyle = `rgba(${h.c},.9)`;
  const co = 4;
  ctx.fillRect(h.x, h.y, co, 1); ctx.fillRect(h.x, h.y, 1, co);
  ctx.fillRect(h.x + h.w - co, h.y, co, 1); ctx.fillRect(h.x + h.w - 1, h.y, 1, co);
  ctx.fillRect(h.x, h.y + h.h - 1, co, 1); ctx.fillRect(h.x, h.y + h.h - co, 1, co);
  ctx.fillRect(h.x + h.w - co, h.y + h.h - 1, co, 1); ctx.fillRect(h.x + h.w - 1, h.y + h.h - co, 1, co);
  ctx.restore();
}

function drawSparkles(t) {
  if (hoverKey || modalOpen || leaving) return;
  const entries = Object.entries(HOTSPOTS);
  for (let i = 0; i < entries.length; i++) {
    const [key, h] = entries[i];
    const cycle = (t * 0.42 + i * 0.83) % 3.4;
    if (cycle > 0.22) continue;
    const a = 1 - cycle / 0.22;
    const color = key === 'monitor' ? 'rgba(92,236,212,' : 'rgba(255,200,87,';
    const x = h.x + h.w - 5, y = h.y + 5;
    ctx.fillStyle = color + (0.75 * a) + ')';
    ctx.fillRect(x - 1, y, 3, 1);
    ctx.fillRect(x, y - 1, 1, 3);
    ctx.fillStyle = color + (0.35 * a) + ')';
    ctx.fillRect(x - 2, y - 2, 1, 1);
    ctx.fillRect(x + 2, y + 2, 1, 1);
  }
}

/* =====================================================================
   4. 放映引擎 / 全屏
   ===================================================================== */
const reelCanvas = document.getElementById('reel');
const player = createReelPlayer({
  canvas: reelCanvas,
  autoAdvance: 22000,
  onReelChange: (reel, index) => {
    activeReel = { i: index };
  },
});
player.start();

/* ---------- 房间 BGM：胶片唱机 ---------- */
const bgm = document.getElementById('roomBgm');
if (bgm) bgm.volume = 0.58;

function updateMusicUi() {
  const stateEl = document.getElementById('ttState');
  if (stateEl) stateEl.textContent = musicOn ? 'PAUSE' : 'PLAY';
  const btn = document.getElementById('hs-turntable');
  if (btn) btn.setAttribute('aria-pressed', String(musicOn));
}

function toggleMusic() {
  if (!bgm) return;
  if (!musicOn) {
    musicOn = true;
    const p = bgm.play();
    if (p && p.catch) {
      p.catch(() => { musicOn = false; updateMusicUi(); });
    }
  } else {
    musicOn = false;
    bgm.pause();
  }
  updateMusicUi();
  blip(musicOn ? 720 : 320, 0.05);
}

function stageRect() {
  return document.getElementById('stage').getBoundingClientRect();
}

/* =====================================================================
   5. 弹窗
   ===================================================================== */
let lastFocused = null;

function openModal(id) {
  const m = document.getElementById(id + 'Modal');
  if (!m || leaving) return;
  if (modalOpen === id) return;
  closeModal(true);
  lastFocused = document.activeElement;
  modalOpen = id;
  m.hidden = false;
  hideHint();
  const body = m.querySelector('.win-body');
  [...body.children].forEach((el, i) => {
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = `lineIn .3s steps(4) both`;
    el.style.animationDelay = (i * 38) + 'ms';
  });
  setTimeout(() => {
    const btn = m.querySelector('.win-close');
    if (btn) btn.focus({ preventScroll: true });
  }, 40);
  blip(520, 0.05);
}

function closeModal(silent = false) {
  if (!modalOpen) return;
  const m = document.getElementById(modalOpen + 'Modal');
  if (m) m.hidden = true;
  modalOpen = null;
  if (!silent && lastFocused && lastFocused.focus) {
    try { lastFocused.focus({ preventScroll: true }); } catch {}
  }
}

/* =====================================================================
   6. 声音（默认关，用户点了才响）
   ===================================================================== */
function initAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  audioCtx = new AC();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(audioCtx.destination);

  /* 雨声：滤波白噪声 */
  const len = audioCtx.sampleRate * 2;
  const buffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.55;
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const hp = audioCtx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 320;
  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1250;
  const rainGain = audioCtx.createGain();
  rainGain.gain.value = 0.17;
  src.connect(hp);
  hp.connect(lp);
  lp.connect(rainGain);
  rainGain.connect(masterGain);
  src.start();

  /* CRT 嗡声 */
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 60;
  const og = audioCtx.createGain();
  og.gain.value = 0.022;
  osc.connect(og);
  og.connect(masterGain);
  osc.start();
  const osc2 = audioCtx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = 120;
  const og2 = audioCtx.createGain();
  og2.gain.value = 0.008;
  osc2.connect(og2);
  og2.connect(masterGain);
  osc2.start();
}

function setSound(on) {
  if (on && !audioCtx) initAudio();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  soundOn = on;
  masterGain.gain.setTargetAtTime(on ? 1 : 0, audioCtx.currentTime, 0.15);
  updateSoundUi();
}

function updateSoundUi() {
  const label = 'SOUND · ' + (soundOn ? 'ON' : 'OFF');
  const a = document.getElementById('soundBtn');
  const b = document.getElementById('shSound');
  if (a) { a.textContent = label; a.setAttribute('aria-pressed', String(soundOn)); a.classList.toggle('on', soundOn); }
  if (b) { b.textContent = label; b.setAttribute('aria-pressed', String(soundOn)); b.classList.toggle('on', soundOn); }
}

function blip(freq = 520, dur = 0.06) {
  if (!soundOn || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(freq, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.55), t0 + dur);
  g.gain.setValueAtTime(0.035, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(masterGain);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

/* =====================================================================
   7. 关于我里的小头像（一台会眨眼的 CRT）
   ===================================================================== */
const avatarCv = document.getElementById('avatar');
const avx = avatarCv.getContext('2d');
avx.imageSmoothingEnabled = false;

function drawAvatar(t) {
  avx.setTransform(2, 0, 0, 2, 0, 0);
  avx.clearRect(0, 0, 32, 32);
  R(avx, 0, 0, 32, 32, '#0a0d18');
  /* 背景网点 */
  avx.fillStyle = 'rgba(92,236,212,.06)';
  for (let y = 2; y < 32; y += 4) for (let x = 2; x < 32; x += 4) avx.fillRect(x, y, 1, 1);
  /* CRT 外壳 */
  R(avx, 5, 6, 22, 18, '#c6bb9f');
  R(avx, 6, 5, 20, 1, '#d8cdb1');
  R(avx, 4, 8, 1, 14, '#aa9f84');
  R(avx, 27, 8, 1, 14, '#8b8168');
  R(avx, 6, 23, 20, 1, '#8b8168');
  /* 屏幕 */
  R(avx, 8, 9, 16, 12, '#06121a');
  R(avx, 8, 9, 16, 1, 'rgba(92,236,212,.18)');
  /* 眼睛 */
  const blink = (t % 3.7) < 0.14;
  if (blink) {
    R(avx, 11, 13, 3, 1, '#5cecd4');
    R(avx, 18, 13, 3, 1, '#5cecd4');
  } else {
    R(avx, 11, 12, 3, 3, '#5cecd4');
    R(avx, 18, 12, 3, 3, '#5cecd4');
    avx.fillStyle = '#06121a';
    avx.fillRect(12, 13, 1, 1);
    avx.fillRect(19, 13, 1, 1);
  }
  /* 嘴 */
  R(avx, 13, 17, 6, 1, '#3a9a8a');
  R(avx, 12, 16, 1, 1, '#3a9a8a');
  R(avx, 19, 16, 1, 1, '#3a9a8a');
  /* 支架 */
  R(avx, 14, 24, 4, 3, '#aa9f84');
  R(avx, 11, 27, 10, 2, '#8b8168');
  /* 电源点 */
  R(avx, 23, 22, 1, 1, (t % 2) < 1 ? '#8affa8' : '#1d3a30');
  avx.setTransform(1, 0, 0, 1, 0, 0);
}

/* =====================================================================
   8. 事件绑定
   ===================================================================== */
buildRoom(bgx);
syncHotspots();
updateSoundUi();
updateMusicUi();

/* 预览画面：</head> 里没写，这里直接画第一帧，避免闪黑 */
ctx.drawImage(bg, 0, 0);

document.querySelectorAll('.hotspot').forEach((el) => {
  const key = el.dataset.hover;
  if (!key) return;
  el.addEventListener('mouseenter', () => { hoverKey = key; hideHint(); });
  el.addEventListener('mouseleave', () => { if (hoverKey === key) hoverKey = null; });
  el.addEventListener('focus', () => { hoverKey = key; });
  el.addEventListener('blur', () => { if (hoverKey === key) hoverKey = null; });
});

document.querySelectorAll('[data-open]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    openModal(el.dataset.open);
    hideHint();
  });
});

document.querySelectorAll('[data-nav]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    goProject(el.dataset.nav);
    hideHint();
  });
});

document.getElementById('hs-turntable').addEventListener('click', () => {
  toggleMusic();
  hideHint();
});

document.getElementById('hs-lamp').addEventListener('click', () => {
  lampOn = !lampOn;
  document.getElementById('hs-lamp').setAttribute('aria-pressed', String(lampOn));
  blip(lampOn ? 660 : 330, 0.05);
  hideHint();
});

let bubbleTimer = 0;
document.getElementById('hs-cat').addEventListener('click', () => {
  const bubble = document.getElementById('catBubble');
  const lines = ['喵。', '要多想。', '……', '窗外在下雨。'];
  bubble.textContent = lines[(Math.random() * lines.length) | 0];
  const st = stageRect();
  bubble.style.left = ((HOTSPOTS.cat.x + HOTSPOTS.cat.w / 2) / W * 100) + '%';
  bubble.style.top = ((HOTSPOTS.cat.y + 4) / H * 100) + '%';
  bubble.hidden = false;
  bubble.style.animation = 'none';
  void bubble.offsetWidth;
  bubble.style.animation = '';
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { bubble.hidden = true; }, 2200);
  blip(880, 0.07);
  hideHint();
});

document.querySelectorAll('[data-close]').forEach((el) => {
  el.addEventListener('click', () => closeModal());
});
document.querySelectorAll('.modal').forEach((m) => {
  m.addEventListener('click', (e) => { if (e.target === m) closeModal(); });
});

document.getElementById('soundBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  setSound(!soundOn);
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalOpen) { closeModal(); return; }
  if (modalOpen || leaving) return;
  if (e.key === '1') goProject('cinema');
  if (e.key === '2') goProject('earth');
  if (e.key === '3') openModal('about');
  if (e.key === '4') openModal('links');
});

/* 提示：10 秒或第一次交互后淡出 */
function hideHint() {
  if (hintHidden) return;
  hintHidden = true;
  const hint = document.getElementById('roomHint');
  if (hint) hint.classList.add('hide');
}
setTimeout(hideHint, 10000);

/* =====================================================================
   9. 主循环
   ===================================================================== */
function drawRoom(t, dt) {
  ctx.drawImage(bg, 0, 0);
  drawWallClock(t);
  drawWindow(t, dt);
  drawMonitor(t);
  drawLamp(t, dt);
  drawTurntable(t, dt);
  drawGlobe(t);
  drawCat(t);
  drawSteam(t);
  drawHover(t);
  drawSparkles(t);
}

function loop(now) {
  const t = now / 1000;
  const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0.016;
  lastFrame = now;

  drawRoom(t, dt);
  if (modalOpen === 'about') drawAvatar(t);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* =====================================================================
   10. URL 参数 & 调试入口（截图 / 验收用）
   ===================================================================== */
const q = new URLSearchParams(location.search);
if (q.get('hover')) {
  setTimeout(() => {
    const key = q.get('hover');
    const el = document.querySelector(`.hotspot[data-hover="${key}"]`);
    if (el) { el.classList.add('force'); hoverKey = key; }
  }, 250);
}
if (q.get('lamp') === '0') lampOn = false;
if (q.has('about')) setTimeout(() => openModal('about'), 120);
if (q.has('links')) setTimeout(() => openModal('links'), 120);

window.__room = {
  open: (id) => openModal(id),
  close: () => closeModal(true),
  nav: (target) => goProject(target),
  urls: PROJECT_URLS,
  hover(key) {
    Object.values(HOTSPOT_EL).forEach((el) => el && el.classList.remove('force'));
    if (HOTSPOT_EL[key]) HOTSPOT_EL[key].classList.add('force');
    hoverKey = key;
  },
  unhover() {
    Object.values(HOTSPOT_EL).forEach((el) => el && el.classList.remove('force'));
    hoverKey = null;
  },
  lamp(v) { lampOn = v === undefined ? !lampOn : !!v; },
  music: () => toggleMusic(),
  reel(i) { player.setReel(i); },
  next() { player.next(); },
  state: () => ({ lampOn, soundOn, musicOn, modalOpen, leaving, hoverKey, reel: player.reel.id, urls: PROJECT_URLS }),
};
