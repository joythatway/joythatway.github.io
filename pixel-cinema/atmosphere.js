/* =====================================================================
   atmosphere.js — 影院大厅的氛围层（零依赖）
   ─ createTestCard(canvas)    银幕上的「测试卡」：彩条 + 圆环 + 滚动雪花
   ─ createDust(canvas)        放映机光柱 / 银幕光里的浮尘
   ─ playCountdown(canvas, o)  3-2-1 胶片倒数（5×7 点阵字，纯 canvas）

   所有画面先在低分辨率画布上绘制，再由 CSS image-rendering: pixelated
   放大，保证和放映引擎（192×108）是同一套像素语言。
   ===================================================================== */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ImageData 在小端机器上是 0xAABBGGRR 顺序 */
const rgba = (r, g, b, a = 255) => (((a << 24) | (b << 16) | (g << 8) | r) >>> 0);
const hexColor = (h) => {
  const n = parseInt(h.slice(1), 16);
  return rgba((n >> 16) & 255, (n >> 8) & 255, n & 255);
};

/* ---------- 小工具：往 Uint32 帧缓冲里画东西 ---------------------------- */

function put(buf, W, H, x, y, c) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  buf[y * W + x] = c;
}

function fillRect(buf, W, H, x, y, w, h, c) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) put(buf, W, H, xx, yy, c);
  }
}

function ring(buf, W, H, cx, cy, radius, c, thickness = 1) {
  const steps = Math.ceil(TAU * radius * 1.6);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * TAU;
    for (let t = 0; t < thickness; t++) {
      const r = radius - t;
      put(buf, W, H, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), c);
    }
  }
}

/* ---------- 1. 测试卡 -------------------------------------------------- */

/** 一次性画好静态底图（彩条、圆环、十字线、网格），每帧再叠雪花 */
function buildCardBase(W, H) {
  const buf = new Uint32Array(W * H);

  /* 底：深蓝黑渐变 + 隐约竖条，模仿老电视测试信号 */
  for (let y = 0; y < H; y++) {
    const k = y / (H - 1);
    const r = Math.round(5 + 7 * k);
    const g = Math.round(8 + 9 * k);
    const b = Math.round(15 + 16 * k);
    for (let x = 0; x < W; x++) {
      const stripe = x % 3 === 0 ? 3 : 0;
      buf[y * W + x] = rgba(r + stripe, g + stripe, b + stripe);
    }
  }

  /* 细网格，像示波器 */
  const grid = rgba(26, 36, 56);
  for (let x = 0; x < W; x += 16) for (let y = 0; y < H; y++) put(buf, W, H, x, y, grid);
  for (let y = 0; y < H; y += 16) for (let x = 0; x < W; x++) put(buf, W, H, x, y, grid);

  /* 中心十字线 */
  const cx = W >> 1, cy = 46;
  const cross = rgba(44, 60, 88);
  for (let x = 0; x < W; x++) put(buf, W, H, x, cy, cross);
  for (let y = 0; y < H; y++) put(buf, W, H, cx, y, cross);

  /* 双圆环 + 刻度，经典圆盘测试图 */
  ring(buf, W, H, cx, cy, 34, rgba(58, 78, 110), 1);
  ring(buf, W, H, cx, cy, 30, rgba(38, 52, 78), 1);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    for (let r = 24; r < 30; r++) {
      put(buf, W, H, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), rgba(52, 70, 100));
    }
  }
  /* 圆环中心小十字 */
  fillRect(buf, W, H, cx - 4, cy, 9, 1, rgba(70, 94, 130));
  fillRect(buf, W, H, cx, cy - 4, 1, 9, rgba(70, 94, 130));

  /* 四角定位标记 */
  const mark = rgba(56, 74, 104);
  const m = 6, len = 8;
  for (const [bx, by, sx, sy] of [[m, m, 1, 1], [W - m - 1, m, -1, 1], [m, H - 20, 1, 1], [W - m - 1, H - 20, -1, 1]]) {
    for (let i = 0; i < len; i++) {
      put(buf, W, H, bx + i * sx, by, mark);
      put(buf, W, H, bx, by + i * sy, mark);
    }
  }
  /* 顶部一字安全框刻度 */
  for (let x = 8; x < W - 8; x += 8) put(buf, W, H, x, 13, rgba(34, 46, 68));

  /* SMPTE 彩条（下 11 行） */
  const bars = ['#b4b4b4', '#b4b400', '#00b4b4', '#00b400', '#b400b4', '#b40000', '#0000b4'];
  const barH = 11, barTop = H - 20;
  const bw = W / bars.length;
  for (let i = 0; i < bars.length; i++) {
    const c = hexColor(bars[i]);
    fillRect(buf, W, H, Math.round(i * bw), barTop, Math.ceil(bw), barH, c);
  }
  /* 灰阶条（最下 9 行，16 级，压到 0~176 免得底部太亮） */
  for (let i = 0; i < 16; i++) {
    const v = Math.round((i / 15) * 176);
    fillRect(buf, W, H, i * 12, barTop + barH, 12, H - barTop - barH, rgba(v, v, v));
  }

  return buf;
}

export function createTestCard(canvas) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d', { alpha: false });
  const frame = ctx.createImageData(W, H);
  const out = new Uint32Array(frame.data.buffer);
  const base = buildCardBase(W, H);

  let raf = 0, last = 0, t = 0, running = false;

  function render(time) {
    out.set(base);

    /* 1) 自上而下滚动的雪花带：做得薄、偏暗，像磁带掉磁而不是白条 */
    const bandH = 4;
    const by = Math.floor(((time * 22) % (H + 26)) - 10);
    for (let y = by; y < by + bandH; y++) {
      if (y < 0 || y >= H) continue;
      for (let x = 0; x < W; x++) {
        if (Math.random() < 0.3) {
          const v = Math.random() < 0.42 ? 10 + Math.random() * 26 : 92 + Math.random() * 96;
          out[y * W + x] = rgba(v | 0, v | 0, v | 0);
        }
      }
    }

    /* 2) 满屏稀疏噪点 */
    for (let i = 0; i < 90; i++) {
      const x = (Math.random() * W) | 0;
      const y = (Math.random() * H) | 0;
      const v = (36 + Math.random() * 130) | 0;
      out[y * W + x] = rgba(v, v, v);
    }

    /* 3) 偶发横向撕裂 / 掉帧 */
    if (Math.random() < 0.06) {
      const y0 = (Math.random() * H) | 0;
      const rows = 1 + ((Math.random() * 3) | 0);
      const shift = ((Math.random() * 14) | 0) - 7;
      for (let y = y0; y < Math.min(H, y0 + rows); y++) {
        const copy = out.slice(y * W, y * W + W);
        for (let x = 0; x < W; x++) out[y * W + x] = copy[(x - shift + W) % W];
      }
    }

    ctx.putImageData(frame, 0, 0);
  }

  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (!last) { last = now; return; }
    const dt = (now - last) / 1000;
    if (dt < 1 / 30) return;          // 锁 30fps，省电
    last = now;
    t += Math.min(dt, 0.12);
    render(t);
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = 0;
      render(t);
      raf = requestAnimationFrame(loop);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}

/* ---------- 2. 浮尘 ---------------------------------------------------- */

export function createDust(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, dpr = 1;
  let parts = [];
  let raf = 0, last = 0, running = false;

  function spawn(p) {
    p = p || {};
    p.x = Math.random() * w;
    /* 主要分布在银幕下方 ~ 下半屏，也就是光最容易被打亮的地方 */
    p.y = h * (0.32 + Math.random() * 0.66);
    p.vx = (Math.random() - 0.5) * 0.16;
    p.vy = -(0.05 + Math.random() * 0.22);
    p.r = Math.random() < 0.72 ? 1 : 2;
    p.a = 0.1 + Math.random() * 0.42;
    p.tw = 0.6 + Math.random() * 1.6;   // 闪烁频率
    p.ph = Math.random() * TAU;
    p.cool = Math.random() < 0.28;      // 少部分是冷色（银幕反光）
    return p;
  }

  function reseed() {
    const n = clamp(Math.round((w * h) / 26000), 14, 90);
    parts = [];
    for (let i = 0; i < n; i++) parts.push(spawn());
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = Math.max(1, rect.width || window.innerWidth);
    h = Math.max(1, rect.height || window.innerHeight);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    reseed();
  }

  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (!last) { last = now; return; }
    const dt = Math.min((now - last) / 1000, 0.1);
    if (dt < 1 / 30) return;
    last = now;

    ctx.clearRect(0, 0, w, h);
    const sec = now / 1000;
    for (const p of parts) {
      p.x += p.vx * dt * 60 + Math.sin(sec * 0.7 + p.ph) * 0.05;
      p.y += p.vy * dt * 60;
      if (p.y < -8) { p.y = h + 6; p.x = Math.random() * w; }
      if (p.x < -8) p.x = w + 6; else if (p.x > w + 8) p.x = -6;

      const tw = 0.5 + 0.5 * Math.sin(sec * p.tw + p.ph);
      ctx.globalAlpha = p.a * tw;
      ctx.fillStyle = p.cool ? 'rgb(170, 218, 255)' : 'rgb(255, 214, 160)';
      ctx.fillRect(p.x, p.y, p.r, p.r);
    }
    ctx.globalAlpha = 1;
  }

  resize();
  window.addEventListener('resize', resize);

  return {
    start() {
      if (running) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(loop);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    resize,
  };
}

/* ---------- 3. 3-2-1 胶片倒数 ------------------------------------------ */

/* 5×7 点阵字库：只收录倒数与片头文字用得到的字符 */
const GLYPHS = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  'C': ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  'G': ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  'I': ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  'J': ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  'W': ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00000', '00100'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  ' ': null,
};

/** 用点阵字库写字，以 (cx, cy) 为中心，block = 每个点阵像素的尺寸 */
function drawText(ctx, text, cx, cy, block, color, shadow) {
  const chars = [...String(text).toUpperCase()];
  const cellW = 6 * block;                 // 5 列 + 1 列字距
  const width = chars.length * cellW - block;
  let x = Math.round(cx - width / 2);
  const y = Math.round(cy - (7 * block) / 2);

  for (const ch of chars) {
    const g = GLYPHS[ch];
    if (g) {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 5; c++) {
          if (g[r][c] !== '1') continue;
          const px = x + c * block;
          const py = y + r * block;
          if (shadow) {
            ctx.fillStyle = shadow;
            ctx.fillRect(px + block, py + block, block, block);
          }
          ctx.fillStyle = color;
          ctx.fillRect(px, py, block, block);
        }
      }
    }
    x += cellW;
  }
}

/**
 * 3 → 2 → 1 → GO 的胶片倒数，结束后回调 onDone。
 * 画面 100% 是 canvas 绘制的，不依赖字体加载。
 */
export function playCountdown(canvas, opts = {}) {
  const {
    onDone = () => {},
    reelLabel = 'REEL 01',
    stepMs = 540,
  } = opts;

  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  /* 每一步：label 为 null 表示最后一下白闪 */
  const steps = [
    { label: '3', ms: stepMs },
    { label: '2', ms: stepMs },
    { label: '1', ms: stepMs },
    { label: 'GO', ms: 380 },
    { label: null, ms: 130 },
  ];
  const totalMs = steps.reduce((a, s) => a + s.ms, 0);

  let raf = 0, started = false, startAt = 0, stopped = false;

  function drawLeader(now, step, localP, elapsedSec) {
    const cx = W / 2, cy = H / 2;
    const R = Math.min(W, H) * 0.44;

    /* 底 + 轻微胶片颗粒 */
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, W, H);

    /* 十字定位线 */
    ctx.fillStyle = 'rgba(120, 148, 182, 0.2)';
    ctx.fillRect(0, Math.round(cy), W, 2);
    ctx.fillRect(Math.round(cx), 0, 2, H);

    /* 外圈点阵环 */
    ctx.fillStyle = 'rgba(150, 176, 210, 0.5)';
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * TAU;
      const last = i >= 71;
      ctx.fillRect(
        Math.round(cx + Math.cos(a) * R) - 1,
        Math.round(cy + Math.sin(a) * R) - 1,
        last ? 5 : 3,
        last ? 5 : 3,
      );
    }
    /* 内圈 */
    ctx.strokeStyle = 'rgba(90, 116, 150, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.72, 0, TAU);
    ctx.stroke();

    /* 每一格转一圈的扫描扇区 */
    const sweep = localP * TAU;
    const startA = -Math.PI / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    grad.addColorStop(1, 'rgba(255, 236, 200, 0.16)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R * 0.94, startA, startA + sweep);
    ctx.closePath();
    ctx.fill();

    /* 扫描指针 */
    const handA = startA + sweep;
    ctx.strokeStyle = 'rgba(255, 200, 110, 0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(handA) * R * 0.94, cy + Math.sin(handA) * R * 0.94);
    ctx.stroke();

    /* 大数字 / GO：不用实心底板，改用一圈径向压暗，避免出现一个方框 */
    if (step.label) {
      const isGo = step.label === 'GO';
      const block = isGo ? 13 : 19;
      const color = isGo ? '#5cecd4' : '#f4efe2';
      const shadow = isGo ? '#0b3a35' : '#7a3a10';
      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.1);
      halo.addColorStop(0, 'rgba(3, 5, 10, .78)');
      halo.addColorStop(0.55, 'rgba(3, 5, 10, .5)');
      halo.addColorStop(1, 'rgba(3, 5, 10, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, W, H);
      drawText(ctx, step.label, cx, cy, block, color, shadow);
    }

    /* 片头小字：品牌 / 卷号 */
    drawText(ctx, 'JOYTHATWAY PICTURES', cx, 26, 2, 'rgba(214, 224, 240, 0.75)', 'rgba(0,0,0,0.8)');
    drawText(ctx, reelLabel, cx, H - 26, 2, 'rgba(255, 200, 110, 0.8)', 'rgba(0,0,0,0.8)');

    /* 四角安全框 */
    const m = 14, len = 22;
    ctx.fillStyle = 'rgba(120, 148, 182, 0.28)';
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
      ctx.fillRect(x, y, len * sx, 2 * sy);
      ctx.fillRect(x, y, 2 * sx, len * sy);
    }

    /* 胶片划痕 / 颗粒：每帧随机几道 */
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.05})`;
      const x = Math.random() * W;
      ctx.fillRect(x, Math.random() * H, 1, 4 + Math.random() * 40);
    }

    /* 最后一下：整屏白闪 + 收圆，像胶片烧穿 */
    if (!step.label) {
      const p = localP;
      ctx.fillStyle = `rgba(255,255,255,${0.55 + 0.45 * p})`;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(255, 220, 150, ${0.3 * (1 - p)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, R * (1.4 - p * 0.6), 0, TAU);
      ctx.fill();
    }

    /* 暗角 */
    const vg = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 1.5);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  function tick(now) {
    if (stopped) return;
    if (!started) { started = true; startAt = now; }
    const elapsed = now - startAt;

    if (elapsed >= totalMs) {
      stopped = true;
      onDone();
      return;
    }

    /* 找到当前这一步 */
    let acc = 0, step = steps[0], local = 0;
    for (const s of steps) {
      if (elapsed < acc + s.ms) { step = s; local = elapsed - acc; break; }
      acc += s.ms;
    }
    drawLeader(now, step, clamp(local / step.ms, 0, 1), elapsed / 1000);
    raf = requestAnimationFrame(tick);
  }

  return {
    start() { raf = requestAnimationFrame(tick); },
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
    },
  };
}
