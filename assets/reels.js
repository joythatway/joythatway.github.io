/* =====================================================================
   reels.js — JOYTHATWAY 像素放映引擎
   8 卷「胶片」，每一卷都是一个低分辨率像素程序：
   plasma / tunnel / fire / flow / warp / dither / life / glyph
   切换时带 420ms 的录像带故障过渡。所有画面 192×108，放大后就是像素。

   用法：
     import { createReelPlayer, REELS } from './assets/reels.js';
     const player = createReelPlayer({
       canvas,                           // 必填，<canvas>
       initial: 0,                       // 可选，卷号 / id
       autoAdvance: 21000,               // 可选，自动换卷间隔 ms，0 = 不换
       onReelChange: (reel, i) => {},    // 可选
     });
     player.start();
   ===================================================================== */

export const SCREEN_W = 192;
export const SCREEN_H = 108;

/* ---------- 小工具 ---------------------------------------------------- */

const TAU = Math.PI * 2;

/** 4×4 Bayer 有序抖动阈值，返回 -0.47 ~ +0.47 */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function dith(x, y) {
  return BAYER4[(x & 3) + (y & 3) * 4] / 16 - 0.47;
}

function hash2(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + (s | 0) * 1442695041) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/** 简单 value noise（双线性 + smoothstep），给流场用 */
function noise2(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

/** 颜色数组 → 0xAABBGGRR（ImageData 里的小端序） */
function pal(hexList) {
  const out = new Uint32Array(hexList.length);
  for (let i = 0; i < hexList.length; i++) {
    const h = hexList[i].replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    out[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  return out;
}

/* ---------- 8 卷胶片 -------------------------------------------------- */

const REEL_LIST = [
  {
    id: 'plasma',
    name: 'PLASMA DRIFT',
    cn: '等离子漂流',
    hint: '信号失焦后的第一帧',
    colors: ['#07030f', '#160a33', '#321063', '#5a1786', '#9a249c', '#e3428e', '#ff8a7a', '#ffe9c9'],
    draw(s, t, out, W, H, P) {
      const n = P.length;
      for (let y = 0; y < H; y++) {
        const yy = y * 0.058;
        for (let x = 0; x < W; x++) {
          const dx = x - 96 + Math.sin(t * 0.37) * 38;
          const dy = y - 54 + Math.cos(t * 0.29) * 26;
          let v = Math.sin(x * 0.043 + t * 1.15)
                + Math.sin(yy - t * 0.86)
                + Math.sin((x * 0.5 + y) * 0.031 + t * 0.62)
                + Math.sin(Math.sqrt(dx * dx + dy * dy) * 0.078 - t * 2.15);
          let q = clamp((v + 4) / 8, 0, 0.999) + dith(x, y) * 0.07;
          let idx = ((q * n + t * 2.1) | 0) % n;
          if (idx < 0) idx += n;
          out[y * W + x] = P[idx];
        }
      }
    },
  },

  {
    id: 'tunnel',
    name: 'DEEP TUNNEL',
    cn: '无尽隧道',
    hint: '往屏幕深处开',
    colors: ['#03080f', '#0a1b2e', '#123650', '#1a6274', '#2da096', '#6ff0cb', '#d4fff2', '#ff4f8b'],
    draw(s, t, out, W, H, P) {
      const n = P.length;
      const cx = W / 2 + Math.sin(t * 0.42) * 16;
      const cy = H / 2 + Math.cos(t * 0.31) * 8;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const dx = x - cx, dy = y - cy;
          const r = Math.sqrt(dx * dx + dy * dy) + 1.5;
          const a = Math.atan2(dy, dx);
          const u = a / TAU * 9 + Math.sin(t * 0.24) * 0.7;
          const v = 12 / r + t * 1.05;
          let q = 0.5
                + 0.42 * Math.sin(u * 1.7) * Math.cos(v * 1.33)
                + 0.18 * Math.sin((u + v) * 2.4 + t);
          q = clamp(q + dith(x, y) * 0.18, 0, 0.999);
          let idx = ((q * n + t * 1.3) | 0) % n;
          if (idx < 0) idx += n;
          /* 隧道中心留一点暗，越近越黑 */
          if (r < 6) idx = 0;
          out[y * W + x] = P[idx];
        }
      }
    },
  },

  {
    id: 'fire',
    name: 'CAMPFIRE 8BIT',
    cn: '八位篝火',
    hint: '烧到屏幕边缘为止',
    colors: ['#050203', '#170404', '#3d0a06', '#741607', '#b32c09', '#e95a0f', '#ff9a1f', '#ffd23f', '#fff2b8', '#ffffff'],
    init(s) {
      s.heat = new Float32Array(SCREEN_W * SCREEN_H);
      s.tmp = new Float32Array(SCREEN_W * SCREEN_H);
    },
    draw(s, t, out, W, H, P) {
      const n = P.length;
      let heat = s.heat, tmp = s.tmp;
      const bottom = (H - 1) * W;
      /* 底部火种：一半是随机余烬，一半熄灭 */
      for (let x = 0; x < W; x++) {
        tmp[bottom + x] = Math.random() < 0.24 ? 0 : Math.random();
      }
      /* 经典 demoscene 火焰：每行取下一行的三个邻居，随机横向漂移 */
      for (let y = H - 2; y >= 0; y--) {
        const row = y * W, below = row + W;
        for (let x = 0; x < W; x++) {
          const drift = (Math.random() * 3) | 0;
          const xl = (x - 1 + drift + W) % W;
          const xc = (x + drift) % W;
          const xr = (x + 1 + drift) % W;
          let v = (heat[below + xl] * 0.5 + heat[below + xc] * 0.3 + heat[below + xr] * 0.2) * 0.984;
          tmp[row + x] = v;
        }
      }
      s.heat = tmp; s.tmp = heat;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const v = s.heat[y * W + x];
          let idx;
          if (v < 0.045) {
            idx = 0;
            if (v > 0.024 && Math.random() < 0.25) idx = 1; // 余烬
          } else {
            idx = (v * (n - 1) * 1.2 + Math.random() * 1.15) | 0;
          }
          if (idx < 0) idx = 0; else if (idx >= n) idx = n - 1;
          out[y * W + x] = P[idx];
        }
      }
    },
  },

  {
    id: 'flow',
    name: 'PIXEL CURRENT',
    cn: '像素暗流',
    hint: '随机数在屏幕里找路',
    colors: ['#03060f', '#061426', '#0a2440', '#0f405c', '#176b7c', '#2ba39a', '#79e8cd', '#eafff8',
             '#2a0a1e', '#651244', '#a82068', '#ff5fa2'],
    init(s) {
      s.acc = new Float32Array(SCREEN_W * SCREEN_H);
      s.hue = new Uint8Array(SCREEN_W * SCREEN_H);
      s.parts = [];
      for (let i = 0; i < 320; i++) s.parts.push(spawn(Math.random() * SCREEN_W, Math.random() * SCREEN_H));
      function spawn(x, y) {
        return {
          x, y,
          age: 0,
          life: 40 + (Math.random() * 120) | 0,
          mag: Math.random() < 0.16 ? 1 : 0,
        };
      }
      s.spawn = spawn;
    },
    draw(s, t, out, W, H, P) {
      const acc = s.acc, hue = s.hue;
      for (let i = 0; i < acc.length; i++) if (acc[i] > 0.01) acc[i] *= 0.93; else acc[i] = 0;

      for (const p of s.parts) {
        const a = noise2(p.x * 0.021, p.y * 0.021, 7) * TAU * 2 + t * 0.22;
        p.x += Math.cos(a) * 1.15;
        p.y += Math.sin(a) * 1.15;
        p.age++;
        const ix = p.x | 0, iy = p.y | 0;
        if (p.age > p.life || ix < 0 || iy < 0 || ix >= W || iy >= H) {
          p.x = Math.random() * W;
          p.y = Math.random() * H;
          p.age = 0;
          p.life = 40 + (Math.random() * 130) | 0;
          p.mag = Math.random() < 0.16 ? 1 : 0;
          continue;
        }
        const k = iy * W + ix;
        acc[k] = Math.min(1, acc[k] + 0.85);
        hue[k] = p.mag;
        /* 拖尾：上一格留一点 */
        const px = (p.x - Math.cos(a) * 1.15) | 0;
        const py = (p.y - Math.sin(a) * 1.15) | 0;
        if (px >= 0 && py >= 0 && px < W && py < H) {
          const kk = py * W + px;
          acc[kk] = Math.max(acc[kk], 0.5);
          hue[kk] = p.mag;
        }
      }

      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const k = y * W + x;
          const a = acc[k];
          let idx;
          if (a < 0.055) {
            idx = 0;
          } else {
            const q = clamp(a + dith(x, y) * 0.22, 0, 0.999);
            idx = hue[k] ? 8 + ((q * 4) | 0) : ((q * 8) | 0);
          }
          out[k] = P[idx];
        }
      }
    },
  },

  {
    id: 'warp',
    name: 'WARP 9',
    cn: '曲速九级',
    hint: '别眨眼',
    colors: ['#02030a', '#0a0a24', '#181448', '#2c2270', '#46369e', '#6e57c9', '#a98bec', '#e6d2ff', '#ffffff', '#ff7ab0'],
    init(s) {
      s.stars = [];
      s.spawn = () => ({
        x: (Math.random() - 0.5) * 2.4,
        y: (Math.random() - 0.5) * 1.6,
        z: 0.15 + Math.random() * 1.1,
        c: Math.random() < 0.1 ? 1 : 0,
      });
      for (let i = 0; i < 340; i++) s.stars.push(s.spawn());
    },
    draw(s, t, out, W, H, P) {
      const n = P.length;
      for (let i = 0; i < out.length; i++) out[i] = P[0];
      /* 中心微光 */
      const cx = W / 2, cy = H / 2;
      const speed = 0.55 + Math.sin(t * 0.35) * 0.2;
      for (const st of s.stars) {
        st.z -= 0.0075 * speed;
        if (st.z <= 0.06) { Object.assign(st, s.spawn()); st.z = 1.15; }
        const sx = cx + (st.x / st.z) * W * 0.42;
        const sy = cy + (st.y / st.z) * H * 0.42;
        if (sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) { Object.assign(st, s.spawn()); continue; }
        const ox = cx + (st.x / (st.z + 0.055 * speed)) * W * 0.42;
        const oy = cy + (st.y / (st.z + 0.055 * speed)) * H * 0.42;
        const bright = clamp(1 - st.z / 1.2, 0, 1);
        let idx = st.c ? 9 : (bright > 0.75 ? 8 : 4 + ((bright * 4) | 0));
        if (idx >= n) idx = n - 1;
        const steps = Math.min(14, Math.max(1, Math.floor(Math.hypot(sx - ox, sy - oy))));
        for (let k = 0; k <= steps; k++) {
          const px = (ox + (sx - ox) * (k / steps)) | 0;
          const py = (oy + (sy - oy) * (k / steps)) | 0;
          if (px >= 0 && py >= 0 && px < W && py < H) out[py * W + px] = P[idx];
        }
      }
      /* 中心 1px 白点 */
      out[(H >> 1) * W + (W >> 1)] = P[n - 1];
      out[(H >> 1) * W + (W >> 1) + 1] = P[n - 2];
    },
  },

  {
    id: 'dither',
    name: 'BAYER WAVES',
    cn: '抖动波纹',
    hint: '只有四种绿',
    colors: ['#0b1208', '#1d2f11', '#48601b', '#8bac0f', '#d7f05c'],
    draw(s, t, out, W, H, P) {
      const n = P.length;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const rcx = W / 2 + Math.sin(t * 0.7) * 46;
          const rcy = H / 2 + Math.cos(t * 0.57) * 26;
          let v = 0.44
                + 0.2 * Math.sin(x * 0.082 + t * 1.35)
                + 0.16 * Math.sin(y * 0.066 - t * 0.93)
                + 0.14 * Math.sin((x + y) * 0.037 + t * 1.85)
                + 0.22 * Math.sin(Math.hypot(x - rcx, y - rcy) * 0.16 - t * 3.1)
                + 0.08 * Math.sin(Math.hypot(x - (W - rcx), y - (H - rcy)) * 0.11 + t * 2.2);
          let q = clamp(v + dith(x, y) * 0.3, 0, 0.999) * (n - 1);
          let idx = q | 0;
          /* 偶尔来一条横向撕裂 */
          if ((y + ((t * 14) | 0)) % 61 === 0) idx = (idx + 2) % n;
          out[y * W + x] = P[idx];
        }
      }
    },
  },

  {
    id: 'life',
    name: 'CONWAY 1970',
    cn: '康威生命',
    hint: '每 6 帧一次呼吸',
    colors: ['#04070d', '#0a2a25', '#115c47', '#27a06c', '#8affc0'],
    init(s) {
      const CW = SCREEN_W >> 1, CH = SCREEN_H >> 1;
      s.cw = CW; s.ch = CH;
      s.cells = new Uint8Array(CW * CH);
      s.next = new Uint8Array(CW * CH);
      s.age = new Uint8Array(CW * CH);
      s.tick = 0;
      s.gen = 0;
      for (let i = 0; i < s.cells.length; i++) s.cells[i] = Math.random() < 0.34 ? 1 : 0;
    },
    stepLife(s) {
      const { cw, ch, cells, next, age } = s;
      let alive = 0;
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          let n = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const nx = (x + dx + cw) % cw, ny = (y + dy + ch) % ch;
              n += cells[ny * cw + nx];
            }
          }
          const i = y * cw + x;
          const on = cells[i];
          if (on ? (n === 2 || n === 3) : n === 3) {
            next[i] = 1;
            age[i] = Math.min(255, age[i] + 1);
            alive++;
          } else {
            next[i] = 0;
            age[i] = 0;
          }
        }
      }
      s.cells = next; s.next = cells;
      s.gen++;
      if (alive < 20 || s.gen > 420) {
        for (let i = 0; i < s.cells.length; i++) s.cells[i] = Math.random() < 0.34 ? 1 : 0;
        s.age.fill(0);
        s.gen = 0;
      }
    },
    draw(s, t, out, W, H, P) {
      if (++s.tick % 6 === 0) this.stepLife(s);
      const n = P.length;
      for (let y = 0; y < H; y++) {
        const cy = (y >> 1) * s.cw;
        for (let x = 0; x < W; x++) {
          const i = cy + (x >> 1);
          if (s.cells[i]) {
            const a = s.age[i];
            let idx = a < 2 ? 2 : a < 8 ? 3 : 4;
            out[y * W + x] = P[idx];
          } else {
            out[y * W + x] = (y & 3) === 0 ? P[1] : P[0];
          }
        }
      }
    },
  },

  {
    id: 'glyph',
    name: 'GLYPH RAIN',
    cn: '字符暴雨',
    hint: '要多想。',
    colors: ['#010604', '#03170c', '#052a15', '#0a4522', '#0f6b32', '#1a9c48', '#5aff8a', '#eafff0'],
    init(s) {
      s.cols = [];
      const cw = 4;
      for (let x = 0; x < SCREEN_W; x += cw) {
        s.cols.push({
          x,
          y: Math.random() * SCREEN_H * 1.6 - SCREEN_H,
          speed: 0.55 + Math.random() * 1.2,
          len: 10 + (Math.random() * 22) | 0,
          seed: (Math.random() * 1e6) | 0,
        });
      }
    },
    draw(s, t, out, W, H, P) {
      const n = P.length;
      for (let i = 0; i < out.length; i++) out[i] = P[0];
      for (const c of s.cols) {
        c.y += c.speed;
        if (c.y - c.len > H) { c.y = -Math.random() * 30; c.speed = 0.55 + Math.random() * 1.2; }
        for (let k = 0; k < c.len; k++) {
          const yy = (c.y - k) | 0;
          if (yy < 0 || yy >= H) continue;
          const fade = 1 - k / c.len;
          let idx = k === 0 ? n - 1 : 1 + ((fade * (n - 2)) | 0);
          if (idx >= n) idx = n - 1;
          const seed = c.seed + k * 7 + ((t * 9) | 0);
          for (let gx = 0; gx < 3; gx++) {
            const px = c.x + gx;
            if (px >= W) continue;
            const bits = hash2(px, yy, seed);
            if (bits > 0.42) out[yy * W + px] = P[idx];
          }
        }
      }
    },
  },
];

/* 预先建好调色板与 init 状态创建器 */
export const REELS = REEL_LIST.map((r, i) => ({
  ...r,
  index: i,
  palette: pal(r.colors),
  makeState() { const s = {}; if (r.init) r.init(s); return s; },
}));

/* ---------- 过渡帧：坏掉的录像带 -------------------------------------- */

function glitchMix(prev, cur, out, p, frame) {
  const W = SCREEN_W, H = SCREEN_H;
  const hard = p < 0.72;
  for (let y = 0; y < H; y++) {
    const rowRand = hash2(y, frame, 11);
    const shift = hard && rowRand < 0.55 ? ((rowRand * 37) | 0) - 18 : 0;
    const forceNew = rowRand > 0.92;
    for (let x = 0; x < W; x++) {
      const sx = (x + shift + W) % W;
      const useNew = forceNew || hash2(x, y, frame) < p;
      let c = useNew ? cur[y * W + sx] : prev[y * W + sx];
      const r = hash2(x, y, frame + 4919);
      if (r < 0.035) c ^= 0x00ffffff;
      else if (r > 0.982) c = 0xffe8f4ff;
      out[y * W + x] = c;
    }
  }
}

/* ---------- 播放器 ---------------------------------------------------- */

export function createReelPlayer(opts) {
  const {
    canvas,
    initial = 0,
    autoAdvance = 21000,
    onReelChange = () => {},
  } = opts;

  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  const frameData = ctx.createImageData(SCREEN_W, SCREEN_H);
  const outU32 = new Uint32Array(frameData.data.buffer);

  const glitchFrame = new Uint32Array(SCREEN_W * SCREEN_H); // 换卷前最后一帧
  const mixFrame = new Uint32Array(SCREEN_W * SCREEN_H); // 故障过渡混合缓冲

  let reelIndex;
  if (typeof initial === 'string') {
    const f = REELS.findIndex((r) => r.id === initial);
    reelIndex = f >= 0 ? f : 0;
  } else {
    reelIndex = clamp(initial | 0, 0, REELS.length - 1);
  }

  let reelStart = 0;
  let elapsed = 0;
  let state = REELS[reelIndex].makeState();
  let running = false;
  let raf = 0;
  let last = 0;
  let autoTimer = 0;
  let transition = null; // { from: Uint32Array, start, dur, frame }
  let manualPaused = false;
  let nextAuto = autoAdvance ? autoAdvance * (0.75 + Math.random() * 0.5) : 0;

  onReelChange(REELS[reelIndex], reelIndex);

  function drawReel(now) {
    const reel = REELS[reelIndex];
    reel.draw(state, elapsed, outU32, SCREEN_W, SCREEN_H, reel.palette);
  }

  function switchTo(idx, now, manual) {
    if (idx === reelIndex) idx = (idx + 1) % REELS.length;
    const prevIdx = reelIndex;
    const prevReel = REELS[prevIdx];
    prevReel.draw(state, elapsed, outU32, SCREEN_W, SCREEN_H, prevReel.palette);
    glitchFrame.set(outU32);

    reelIndex = idx;
    state = REELS[reelIndex].makeState();
    reelStart = now;
    elapsed = 0;
    transition = { start: now, dur: 420, frame: 0 };
    nextAuto = autoAdvance ? autoAdvance * (0.8 + Math.random() * 0.5) : 0;
    onReelChange(REELS[reelIndex], reelIndex, manual);
  }

  function next(manual = true) {
    switchTo((reelIndex + 1) % REELS.length, performance.now(), manual);
  }

  function randomNext(manual = false) {
    const pick = (reelIndex + 1 + ((Math.random() * (REELS.length - 1)) | 0)) % REELS.length;
    switchTo(pick, performance.now(), manual);
  }

  function prev() {
    switchTo((reelIndex - 1 + REELS.length) % REELS.length, performance.now(), true);
  }

  function setReel(idx) {
    if (idx === reelIndex) return;
    switchTo(idx, performance.now(), true);
  }

  function tick(now) {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    if (!last) { last = now; return; }
    const dt = now - last;
    if (dt < 1000 / 34) return; // 锁 ~30fps，省电
    last = now;
    const dts = Math.min(dt, 120) / 1000;
    elapsed += dts;
    if (autoAdvance) {
      nextAuto -= dt;
      if (nextAuto <= 0 && !manualPaused) randomNext(false);
    }
    const reel = REELS[reelIndex];
    reel.draw(state, elapsed, outU32, SCREEN_W, SCREEN_H, reel.palette);

    if (transition) {
      transition.frame++;
      const p = clamp((now - transition.start) / transition.dur, 0, 1);
      glitchMix(glitchFrame, outU32, mixFrame, p, transition.frame);
      outU32.set(mixFrame);
      if (p >= 1) transition = null;
    }

    ctx.putImageData(frameData, 0, 0);
  }

  return {
    canvas,
    get reel() { return REELS[reelIndex]; },
    get index() { return reelIndex; },
    get reels() { return REELS; },
    get transitioning() { return !!transition; },
    start() {
      if (running) return;
      running = true;
      last = 0;
      reelStart = performance.now();
      raf = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    next,
    prev,
    setReel,
    setAutoAdvance(ms) { autoAdvance = ms; nextAuto = ms * (0.8 + Math.random() * 0.5); },
    pauseAuto(on = true) { manualPaused = on; },
  };
}
