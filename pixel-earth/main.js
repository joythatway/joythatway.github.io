/* =============================================================================
 * JOYTHATWAY · PIXEL EARTH
 * 一个可以拖动旋转的像素地球，球面上钉着「这些年的坐标」。
 *
 * 技术要点
 *  - three.js（本地 shared/three/three.module.js，importmap 引入，无 CDN）
 *  - SphereGeometry + 自定义 ShaderMaterial：160×80 像素贴图（NearestFilter）
 *    + 夜景灯光贴图 + 方向光昼夜 + Bayer 抖动晨昏线 + fresnel 边缘光
 *  - 低分辨率渲染再放大：canvas 背板 = 视口 / 2.5，CSS 铺满 + pixelated，
 *    所以整个 3D 画面是像素风的；HTML 标签 / HUD 仍是清晰矢量字
 *  - 手写 pointer 事件：拖拽 / 惯性 / 滚轮 & 双指缩放，没有用 OrbitControls
 *
 * 代码结构
 *  1) PINS 坐标数据（换成你自己的）  2) 配置与工具
 *  3) 页面 UI（标签 / 时间轴 / 卡片）  4) three.js 场景
 *  5) 交互（拖拽 / 缩放 / 点击）      6) 聚焦与信息卡
 *  7) 标签投影与避让                  8) 主循环 / resize / 调试入口
 * ============================================================================= */

import * as THREE from 'three';

/* =============================================================================
 * 1. 坐标数据 —— 换成你自己的坐标
 * -----------------------------------------------------------------------------
 *  year  年份（数字）
 *  city  中文城市名
 *  en    英文名（HUD 里用）
 *  lat   纬度：-90 ~ 90，北纬为正（如北京 39.9042）
 *  lon   经度：-180 ~ 180，东经为正（如北京 116.4074，伦敦 -0.1276）
 *  note  一句话
 *
 *  下面 5 条是「示例坐标」，页面 HUD 上有 SAMPLE COORDS 标注。
 *  直接改这个数组就能变成你自己的版图；钉子、标签、时间轴、信息卡都会自动生成。
 * ========================================================================== */
const PINS = [
  { year: 2020, city: '北京', en: 'BEIJING',   lat: 39.9042, lon: 116.4074, note: '起点' },
  { year: 2022, city: '巴斯', en: 'BATH',      lat: 51.3811, lon: -2.3590,  note: 'CSC8502 / CSC8503' },
  { year: 2023, city: '伦敦', en: 'LONDON',    lat: 51.5072, lon: -0.1276,  note: '看了一些展' },
  { year: 2024, city: '上海', en: 'SHANGHAI',  lat: 31.2304, lon: 121.4737, note: '毕业之后' },
  { year: 2026, city: '杭州', en: 'HANGZHOU',  lat: 30.2741, lon: 120.1551, note: '现在' },
];

/* =============================================================================
 * 2. 配置与工具
 * ========================================================================== */
const CFG = {
  fov: 34,                  // 相机垂直视角
  renderScale: 2.5,         // 低分辨率渲染倍率（canvas 背板 = 视口 / 2.5，可调）
  autoSpin: 0.05,           // 自动自转速度 rad/s
  resumeDelay: 2.8,         // 停止操作后多少秒恢复自转
  spinEase: 2.2,            // 自转淡入速度
  focusEase: 5.4,           // 聚焦缓动速度
  minZoom: 0.72,
  maxZoom: 1.9,
  maxPitch: 1.25,           // 上下最多转到 ±71°，避免翻转
  sun: new THREE.Vector3(0.62, 0.34, 0.70).normalize(),   // 世界空间太阳方向（右前方）
  colors: {
    pin: 0xffc857,
    pinHot: 0xffe6a8,
    cyan: 0x5cecd4,
    magenta: 0xff4f8b,
    violetDeep: 0x6a55c8,   // 背光侧边缘光：深紫
  },
};

const DEG = Math.PI / 180;
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
const PIN_R = 1.006;                       // 钉子离球心的半径（稍微浮在球面上）
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const $ = (sel) => document.querySelector(sel);

/* 主站（8-bit 房间）地址：本地三方向工作区 / 独立仓库 / 部署后 */
const IS_DEV = location.pathname.includes('/pixel-homepage/direction-03-globe');
const ROOM_URL = IS_DEV ? '../direction-02-room/' : '../index.html';

/** 经纬度 → three.js SphereGeometry 上的单位向量。
 *
 *  SphereGeometry 的 UV 约定（r160 源码）：
 *    u = ix / widthSegments 沿经度增加，v = 1 - iy / heightSegments 北极在上
 *  等距圆柱贴图（earth-pixel.png）是 u = (lon+180)/360，v = (90-lat)/180。
 *  代入球面参数方程后可得：
 *    x =  cos(lat)·cos(lon)
 *    y =  sin(lat)
 *    z = -cos(lat)·sin(lon)
 *  —— 截图里北京钉落在华北，已用实际渲染验证过。
 */
function geoToVec3(lat, lon, out = new THREE.Vector3()) {
  const phi = lat * DEG;
  const lam = lon * DEG;
  const c = Math.cos(phi);
  return out.set(c * Math.cos(lam), Math.sin(phi), -c * Math.sin(lam));
}

/* =============================================================================
 * 3. 页面状态 & DOM
 * ========================================================================== */
const el = {
  canvas: $('#globe'),
  pinLayer: $('#pin-layer'),
  timeline: $('#timeline'),
  card: $('#info-card'),
  cardClose: $('#ic-close'),
  icIdx: $('#ic-idx'),
  icYear: $('#ic-year'),
  icCity: $('#ic-city'),
  icEn: $('#ic-en'),
  icLat: $('#ic-lat'),
  icLon: $('#ic-lon'),
  icNote: $('#ic-note'),
  live: $('#live'),
  sampleWrap: $('#sample-wrap'),
  sampleTag: $('#sample-tag'),
  returnBtn: $('#returnBtn'),
  brand: document.querySelector('.brand'),
  spaceGlow: $('#space-glow'),
  readout: $('#readout'),
  reticle: $('#reticle'),
  roCoord: $('#ro-coord'),
  roZoom: $('#ro-zoom'),
};

let vw = 0, vh = 0;              // 视口 CSS 尺寸
let backW = 0, backH = 0;        // 低分辨率画布背板尺寸
let baseDia = 560;               // 地球基准屏幕直径
let centerY = 0;                 // 地球中心屏幕 y
let fitDist = 6;                 // 让地球恰好 baseDia 像素的相机距离
let layoutMobile = false;

/* 旋转 / 惯性 */
let yaw = -2.6180;               // 初始视角中心经度约 60°E，欧洲 + 亚洲都在画面里
let pitch = 26 * DEG;
let yawVel = 0, pitchVel = 0;
let spinLevel = 0;
let focusTarget = null;          // { yaw, pitch } 正在缓动过去的目标

/* 相机缩放（用户滚轮 / 双指 + 聚焦时的自动构图） */
let zoom = 1, zoomTarget = 1;    // 用户缩放倍率
let viewScale = 1;               // 聚焦时整体构图缩放（移动端会缩小地球）
let centerYFrac = 0.475;         // 地球中心纵向位置（占视口比例）
let xShift = 0;                  // 桌面端信息卡打开时，地球整体左移
let introZoom = 1.45;            // 进场时从远处推近

/* 交互状态 */
const pointers = new Map();
let dragging = false;
let dragMoved = 0, downX = 0, downY = 0, downT = 0, prevX = 0, prevY = 0, lastMoveT = 0;
let pinchStartDist = 0, pinchStartZoom = 1;
let activePin = -1;
let hoverPin = -1;
let lastInteract = 0;
let debugHold = false;
let ready = false;
let startedAt = 0;

/* three.js 对象 */
let renderer, scene, camera, earthGroup, earthMat, starMat;
let pinObjs = [];
let lastT = 0;

const labelDom = [];             // { wrap, lead, btn, w, h }
const pendingDebug = [];

const nowS = () => (performance.now() - startedAt) / 1000;

/* =============================================================================
 * 4. UI 构建：标签 / 时间轴
 * ========================================================================== */
function buildUI() {
  PINS.forEach((p, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'pin-wrap';
    wrap.dataset.visible = 'false';

    const lead = document.createElement('span');
    lead.className = 'pin-lead';
    lead.setAttribute('aria-hidden', 'true');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pin-label';
    btn.dataset.pin = String(i);
    btn.tabIndex = -1;                       // 标签转到背面时不可 Tab 到
    btn.setAttribute('aria-label', `${p.year} 年 ${p.city}（${p.en}），定位到这个坐标`);
    btn.innerHTML = `<span class="pin-year">${p.year}</span><span class="pin-city">${p.city}</span>`;
    btn.addEventListener('click', (e) => { e.stopPropagation(); focusPin(i); });
    btn.addEventListener('pointerenter', () => { hoverPin = i; });
    btn.addEventListener('pointerleave', () => { if (hoverPin === i) hoverPin = -1; });
    btn.addEventListener('focus', () => { hoverPin = i; });
    btn.addEventListener('blur', () => { if (hoverPin === i) hoverPin = -1; });

    wrap.append(lead, btn);
    el.pinLayer.append(wrap);
    labelDom.push({ wrap, lead, btn, w: 82, h: 18 });
  });

  PINS.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tl-item';
    b.dataset.pin = String(i);
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', `${p.year} 年 ${p.city}，定位`);
    b.innerHTML = `<span class="tl-year">${p.year}</span><span class="tl-city">${p.city}</span>`;
    b.addEventListener('click', () => focusPin(i));
    b.addEventListener('pointerenter', () => { hoverPin = i; });
    b.addEventListener('pointerleave', () => { if (hoverPin === i) hoverPin = -1; });
    el.timeline.append(b);
  });
}

/** 字体加载后量一下标签尺寸，用于避让计算 */
function measureLabels() {
  labelDom.forEach((l) => {
    l.w = l.btn.offsetWidth || 82;
    l.h = l.btn.offsetHeight || 18;
  });
}

/* =============================================================================
 * 5. three.js 场景
 * ========================================================================== */
function initThree() {
  renderer = new THREE.WebGLRenderer({
    canvas: el.canvas,
    antialias: false,           // 像素风：不要抗锯齿
    alpha: true,                // 透出 CSS 星云
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(1);    // 背板分辨率手动控制，不用 DPR
  renderer.setClearColor(0x000000, 0);

  camera = new THREE.PerspectiveCamera(CFG.fov, 1, 0.05, 400);
  scene = new THREE.Scene();

  earthGroup = new THREE.Group();
  scene.add(earthGroup);
}

/** 加载像素贴图（NearestFilter + 不生成 mipmap，保证块状像素） */
function loadTexture(url) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, (tex) => {
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.colorSpace = THREE.NoColorSpace;   // 原始 sRGB 数值，shader 里直接输出
      tex.needsUpdate = true;
      resolve(tex);
    }, undefined, reject);
  });
}

const EARTH_VS = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vNormalV;

  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vNormalV = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const EARTH_FS = /* glsl */`
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform vec3 uSunDir;
  uniform vec3 uRimCool;
  uniform vec3 uRimWarm;
  uniform vec3 uLightTint;
  uniform float uTime;

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vNormalV;

  /* 4×4 Bayer 有序抖动：晨昏线做成复古像素抖动，避免数码渐变 */
  float bayer2(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

  void main() {
    vec3 day    = texture2D(uDay, vUv).rgb;
    vec3 lights = texture2D(uNight, vUv).rgb;

    float ndl = dot(normalize(vNormalW), normalize(uSunDir));   // -1 背光 … 1 正对
    float lit = smoothstep(-0.12, 0.40, ndl);                   // 0 夜 / 1 昼，平滑过渡

    float band = 1.0 - abs(lit * 2.0 - 1.0);                    // 过渡带权重
    float bay  = (bayer4(gl_FragCoord.xy) - 0.5) * 0.42;
    float t    = clamp(lit + bay * band, 0.0, 1.0);

    /* 白天：贴图 + 轻微明暗；夜面：保留极暗轮廓 + 暖色城市灯 */
    vec3 dayCol   = day * mix(0.56, 1.10, lit);
    vec3 nightCol = day * 0.048 + lights * uLightTint * 2.2;
    vec3 col = mix(nightCol, dayCol, t);

    /* 极淡经纬网格（1px 硬线，像素感） */
    vec2 gv = vUv * vec2(18.0, 9.0);
    vec2 gf = fract(gv);
    gf = min(gf, 1.0 - gf);
    float grid = 1.0 - step(0.0045, min(gf.x, gf.y));
    col += uRimCool * grid * 0.06 * t;

    /* 边缘光：白天青、夜面品红，像旧屏幕的色散 */
    float fres = pow(1.0 - clamp(vNormalV.z, 0.0, 1.0), 3.8);
    vec3 rim = mix(uRimWarm, uRimCool, smoothstep(-0.25, 0.45, ndl));
    col += rim * fres * (0.06 + 0.34 * lit);

    /* 贴边轻微压暗，让球体更立体 */
    col *= 1.0 - 0.08 * pow(1.0 - clamp(vNormalV.z, 0.0, 1.0), 4.0) * smoothstep(0.0, 0.7, lit);

    gl_FragColor = vec4(col, 1.0);
  }
`;

function buildEarth(dayTex, nightTex) {
  earthMat = new THREE.ShaderMaterial({
    uniforms: {
      uDay: { value: dayTex },
      uNight: { value: nightTex },
      uSunDir: { value: CFG.sun.clone() },
      uRimCool: { value: new THREE.Color(CFG.colors.cyan) },
      uRimWarm: { value: new THREE.Color(CFG.colors.violetDeep) },
      uLightTint: { value: new THREE.Color(0xffd9a0) },
      uTime: { value: 0 },
    },
    vertexShader: EARTH_VS,
    fragmentShader: EARTH_FS,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 72, 48), earthMat);
  earthGroup.add(earth);
}

/** 星野：方形 / 十字像素星，大小 1~3 个画布像素，微弱闪烁 */
function buildStars() {
  const N = 640;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const phase = new Float32Array(N);
  const palette = [
    [0.95, 0.93, 0.86], [0.95, 0.93, 0.86], [0.95, 0.93, 0.86], [0.95, 0.93, 0.86],
    [0.62, 0.93, 0.86], [1.00, 0.82, 0.58], [0.72, 0.66, 1.00], [1.00, 0.62, 0.76],
  ];
  for (let i = 0; i < N; i++) {
    // 球壳上均匀取点（半径 30~85，远到几乎不随相机平移）
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const r = 30 + Math.random() * 55;
    const s = Math.sqrt(1 - u * u);
    pos[i * 3] = r * s * Math.cos(th);
    pos[i * 3 + 1] = r * u;
    pos[i * 3 + 2] = r * s * Math.sin(th);

    const c = palette[(Math.random() * palette.length) | 0];
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];

    const roll = Math.random();
    size[i] = roll > 0.945 ? 3 : roll > 0.74 ? 2 : 1;
    phase[i] = Math.random();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));

  starMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */`
      attribute float aSize;
      attribute vec3 aColor;
      attribute float aPhase;
      uniform float uTime;
      varying vec3 vColor;
      varying float vTw;
      varying float vBig;
      void main() {
        vColor = aColor;
        vBig = aSize > 1.5 ? 1.0 : 0.0;
        vTw = 0.68 + 0.32 * sin(uTime * 1.15 + aPhase * 6.2831);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize;              // 以画布像素为单位 → 天然块状
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vColor;
      varying float vTw;
      varying float vBig;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float m = 1.0;
        if (vBig > 0.5) m = (abs(q.x) < 0.24 || abs(q.y) < 0.24) ? 1.0 : 0.0;  // 十字星
        if (m < 0.5) discard;
        gl_FragColor = vec4(vColor * vTw, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(geo, starMat);
  stars.frustumCulled = false;
  scene.add(stars);
}

/* ----------------------------- 像素钉纹理 -------------------------------- */
function makeDiamondTexture(size = 15) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const mid = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.abs(x - mid) + Math.abs(y - mid);   // 曼哈顿距离 = 菱形
      const i = (y * size + x) * 4;
      let r = 0, g = 0, b = 0, a = 0;
      if (d <= 6.4) {
        if (d > 5.0) { r = 14; g = 16; b = 26; a = 255; }         // 深色描边
        else if (d <= 1.1) { r = 255; g = 255; b = 238; a = 255; } // 中心高光
        else { r = 255; g = 247; b = 227; a = 255; }               // 主体（材质色染）
      }
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRingTexture(size = 32) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const mid = (size - 1) / 2;
  const R = 12.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - mid, dy = y - mid;
      const rr = Math.hypot(dx, dy);
      const i = (y * size + x) * 4;
      let a = 0;
      if (Math.abs(rr - R) <= 1.15) {
        const ang = (Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2);   // 0..1
        const seg = Math.floor(ang * 16) % 2;                          // 断续虚环
        a = seg === 0 ? 255 : 96;
      }
      // 中心一个小十字（雷达光点的感觉）
      if (rr <= 3.2 && (Math.abs(dx) < 0.7 || Math.abs(dy) < 0.7)) a = Math.max(a, 220);
      img.data[i] = 255; img.data[i + 1] = 250; img.data[i + 2] = 235; img.data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildPins() {
  const diamondTex = makeDiamondTexture();
  const ringTex = makeRingTexture();

  pinObjs = PINS.map((p, i) => {
    const normal = geoToVec3(p.lat, p.lon).normalize();
    const group = new THREE.Group();

    // 深色底托（让钉子压在浅色大陆上也看得清）
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: diamondTex,
        color: 0x0a0c14,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        toneMapped: false,
      })
    );
    pad.position.copy(normal).multiplyScalar(PIN_R + 0.001);
    pad.quaternion.setFromUnitVectors(FORWARD, normal);
    pad.scale.setScalar(0.082);
    pad.renderOrder = 3;
    group.add(pad);

    // 球面上的小菱形钉
    const marker = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: diamondTex,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      })
    );
    marker.position.copy(normal).multiplyScalar(PIN_R);
    marker.quaternion.setFromUnitVectors(FORWARD, normal);
    marker.renderOrder = 4;
    group.add(marker);

    // 两圈错开相位的脉冲光圈
    const rings = [];
    for (let k = 0; k < 2; k++) {
      const ring = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: ringTex,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        })
      );
      ring.position.copy(normal).multiplyScalar(PIN_R + 0.004);
      ring.quaternion.setFromUnitVectors(FORWARD, normal);
      ring.renderOrder = 2;
      group.add(ring);
      rings.push(ring);
    }

    earthGroup.add(group);
    return {
      i,
      normal,
      pad,
      marker,
      rings,
      scale: 1,
      phase: i * 0.19,
      screen: { x: 0, y: 0, front: false },
    };
  });
}

/* =============================================================================
 * 6. 布局：低分辨率画布 / 相机距离 / 构图
 * ========================================================================== */
function layout() {
  vw = Math.max(320, window.innerWidth);
  vh = Math.max(320, window.innerHeight);
  layoutMobile = vw <= 760;

  // 低分辨率背板：约为视口的 1/2.5；CSS 负责铺满 + pixelated 放大
  backW = Math.max(64, Math.round(vw / CFG.renderScale));
  backH = Math.max(64, Math.round(vh / CFG.renderScale));
  renderer.setSize(backW, backH, false);

  // 地球基准直径（CSS px）：桌面大一些，移动端占满宽度但留出 HUD / 时间轴
  baseDia = layoutMobile
    ? Math.min(vw * 0.86, vh * 0.42, 380)
    : Math.min(vw * 0.42, vh * 0.56, 600);

  measureLabels();

  // 背景光晕跟着地球走
  el.spaceGlow.style.setProperty('--gx', `${vw * 0.5}px`);
  el.spaceGlow.style.setProperty('--gy', `${vh * (layoutMobile ? 0.385 : 0.475)}px`);
  el.spaceGlow.style.setProperty('--gd', `${baseDia * 1.55}px`);

  // 移动端：读数放在地球下沿下面一点
  const baseFrac = layoutMobile ? 0.43 : 0.475;
  const roTop = vh * baseFrac + baseDia * 0.5 + (layoutMobile ? 118 : 0);
  el.readout.style.setProperty('--ro-top', `${Math.round(roTop)}px`);

  // resize 时立即对齐相机，避免拉伸 / 错位一帧
  applyCamera(1);
  updateLabels();
}

/**
 * 每帧计算相机：把「基准直径 × 构图缩放」映射成相机距离，并用 viewOffset
 * 平移画面中心（不改变透视，只平移取景框），这样地球不会被拉伸。
 * @param {number} snap 1 = 立即到位，0 = 完全平滑（由调用方传插值系数）
 */
function applyCamera(k) {
  const mobile = layoutMobile;
  const cardOpen = activePin >= 0;

  // 目标构图
  const wantScale = mobile ? (cardOpen ? 0.94 : 1) : 1;
  const wantFrac = mobile ? (cardOpen ? 0.35 : 0.43) : 0.475;
  // 桌面端：信息卡从右侧滑出时，仅在地球会被卡片压住时才左移
  const cardLeft = vw - clamp(vw * 0.024, 16, 36) - 330;
  const needShift = Math.max(0, (vw * 0.5 + baseDia * viewScale * 0.5 + 26) - cardLeft);
  const wantX = mobile ? 0 : (cardOpen ? Math.max(64, needShift) : 18);

  viewScale += (wantScale - viewScale) * k;
  centerYFrac += (wantFrac - centerYFrac) * k;
  xShift += (wantX - xShift) * k;

  const dia = baseDia * viewScale;
  const tan = Math.tan((CFG.fov * 0.5) * DEG);
  fitDist = vh / (dia * tan);              // 屏幕直径 = dia 时的相机距离
  centerY = vh * centerYFrac;

  const targetZ = fitDist * zoom * introZoom;
  camera.position.z += (targetZ - camera.position.z) * k;
  if (k >= 1) camera.position.z = targetZ;  // snap

  const shiftY = vh * 0.5 - centerY;        // 正数 = 画面内容整体上移
  camera.setViewOffset(vw, vh, xShift, shiftY, vw, vh);

  // 背后那团极淡的光晕跟随地球位置 / 大小
  el.spaceGlow.style.setProperty('--gx', `${(vw * 0.5 - xShift).toFixed(1)}px`);
  el.spaceGlow.style.setProperty('--gy', `${centerY.toFixed(1)}px`);
  el.spaceGlow.style.setProperty('--gd', `${(dia * 1.55).toFixed(1)}px`);
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
}

/* =============================================================================
 * 7. 交互：拖拽 / 惯性 / 缩放 / 点击
 * ========================================================================== */
function pointerPos(e) {
  return { x: e.clientX, y: e.clientY };
}

function onPointerDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  pointers.set(e.pointerId, pointerPos(e));
  try { el.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }

  if (pointers.size === 1) {
    dragging = true;
    dragMoved = 0;
    downX = prevX = e.clientX;
    downY = prevY = e.clientY;
    downT = performance.now();
    lastMoveT = downT;
    yawVel = pitchVel = 0;
    spinLevel = 0;
    focusTarget = null;
    lastInteract = nowS();
    debugHold = false;
    el.canvas.classList.add('is-dragging');
  } else if (pointers.size === 2) {
    // 双指：停掉旋转，进入捏合缩放
    dragging = false;
    el.canvas.classList.remove('is-dragging');
    const pts = [...pointers.values()];
    pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    pinchStartZoom = zoomTarget;
  }
}

function onPointerMove(e) {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX;
  p.y = e.clientY;

  // 双指捏合缩放
  if (pointers.size === 2) {
    const pts = [...pointers.values()];
    const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    if (pinchStartDist > 8) {
      zoomTarget = clamp(pinchStartZoom * (pinchStartDist / Math.max(8, d)), CFG.minZoom, CFG.maxZoom);
    }
    lastInteract = nowS();
    return;
  }

  if (!dragging) return;

  const dx = e.clientX - prevX;
  const dy = e.clientY - prevY;
  dragMoved += Math.abs(dx) + Math.abs(dy);
  prevX = e.clientX;
  prevY = e.clientY;

  // 拖过整个地球直径 ≈ 2.6 rad（与屏幕上的球同步转动的手感）
  const unit = Math.max(240, baseDia);
  const kYaw = 2.6 / unit;
  const kPitch = 2.0 / unit;
  yaw += dx * kYaw;
  pitch += dy * kPitch;
  clampPitch();

  // 记录角速度用于松手惯性
  const now = performance.now();
  const dtm = Math.max(0.008, (now - lastMoveT) / 1000);
  lastMoveT = now;
  yawVel = clamp(yawVel * 0.55 + (dx * kYaw / dtm) * 0.45, -4.5, 4.5);
  pitchVel = clamp(pitchVel * 0.55 + (dy * kPitch / dtm) * 0.45, -3.5, 3.5);
  lastInteract = nowS();
}

function onPointerUp(e) {
  pointers.delete(e.pointerId);
  try { el.canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }

  if (pointers.size === 1) {
    // 双指变单指：重新锚定，避免跳一下
    const rest = [...pointers.values()][0];
    prevX = rest.x;
    prevY = rest.y;
    dragMoved = 0;
    downT = performance.now();
    lastMoveT = downT;
    dragging = true;
    return;
  }
  if (pointers.size > 0) return;

  dragging = false;
  el.canvas.classList.remove('is-dragging');
  lastInteract = nowS();

  const isTap = dragMoved < 6 && performance.now() - downT < 520;
  if (isTap) {
    yawVel = pitchVel = 0;
    handleTap(e.clientX, e.clientY);
  } else {
    // 松手后如果角速度太小就直接归零
    if (Math.abs(yawVel) < 0.02) yawVel = 0;
    if (Math.abs(pitchVel) < 0.02) pitchVel = 0;
  }
}

function onPointerCancel(e) {
  pointers.delete(e.pointerId);
  if (pointers.size === 0) {
    dragging = false;
    el.canvas.classList.remove('is-dragging');
  }
}

/** 点击：卡片开着就关掉；否则点中钉 / 附近就聚焦（空白处什么都不做） */
function handleTap(x, y) {
  if (activePin >= 0) { closeCard(); return; }
  let best = -1;
  let bestD = 28 * 28;
  for (const o of pinObjs) {
    if (!o.screen.front) continue;
    const d = (o.screen.x - x) ** 2 + (o.screen.y - y) ** 2;
    if (d < bestD) { bestD = d; best = o.i; }
  }
  if (best >= 0) focusPin(best);
}

function onWheel(e) {
  e.preventDefault();
  const f = Math.exp((e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY) * 0.0011);
  zoomTarget = clamp(zoomTarget * f, CFG.minZoom, CFG.maxZoom);
  lastInteract = nowS();
  debugHold = false;
}

function clampPitch() {
  const p = clamp(pitch, -CFG.maxPitch, CFG.maxPitch);
  if (p !== pitch) pitchVel = 0;
  pitch = p;
}

function onKeyDown(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  if (e.key === 'Escape') {
    if (activePin >= 0) { e.preventDefault(); closeCard(); }
    else { location.href = ROOM_URL; }
    return;
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    focusTarget = null;
    debugHold = false;
    spinLevel = 0;
    yawVel = pitchVel = 0;
    const step = 0.10;
    if (e.key === 'ArrowLeft') yaw -= step;
    if (e.key === 'ArrowRight') yaw += step;
    if (e.key === 'ArrowUp') pitch -= step;
    if (e.key === 'ArrowDown') pitch += step;
    clampPitch();
    lastInteract = nowS();
    return;
  }
  if (e.key === '+' || e.key === '=') {
    zoomTarget = clamp(zoomTarget * 1.1, CFG.minZoom, CFG.maxZoom);
    lastInteract = nowS();
  } else if (e.key === '-' || e.key === '_') {
    zoomTarget = clamp(zoomTarget / 1.1, CFG.minZoom, CFG.maxZoom);
    lastInteract = nowS();
  } else if (/^[1-9]$/.test(e.key) && PINS[Number(e.key) - 1]) {
    focusPin(Number(e.key) - 1);
  }
}

/* =============================================================================
 * 8. 聚焦 / 信息卡 / 时间轴联动
 * ========================================================================== */
function nearestAngle(target, current) {
  let t = target;
  while (t - current > Math.PI) t -= Math.PI * 2;
  while (t - current < -Math.PI) t += Math.PI * 2;
  return t;
}

/**
 * 聚焦第 i 个坐标：地球缓动到「钉子正对相机」的朝向，右侧/底部弹出信息卡。
 * 让钉子正对相机的推导：先绕 Y 转（-π/2 - lon），再绕 X 转（lat）。
 */
function focusPin(i, opts = {}) {
  if (!PINS[i] || !ready) return -1;
  const p = PINS[i];

  const targetYaw = nearestAngle(-Math.PI / 2 - p.lon * DEG, yaw);
  const targetPitch = clamp(p.lat * DEG, -CFG.maxPitch, CFG.maxPitch);

  if (REDUCED || opts.instant) {
    yaw = targetYaw;
    pitch = targetPitch;
    focusTarget = null;
  } else {
    focusTarget = { yaw: targetYaw, pitch: targetPitch };
  }
  yawVel = pitchVel = 0;
  spinLevel = 0;
  lastInteract = nowS();
  openCard(i);
  return i;
}

function openCard(i) {
  const p = PINS[i];
  activePin = i;
  el.icIdx.textContent = `${String(i + 1).padStart(2, '0')} / ${String(PINS.length).padStart(2, '0')}`;
  el.icYear.textContent = String(p.year);
  el.icCity.textContent = p.city;
  el.icEn.textContent = p.en;
  el.icLat.textContent = `${Math.abs(p.lat).toFixed(2)}° ${p.lat >= 0 ? 'N' : 'S'}`;
  el.icLon.textContent = `${Math.abs(p.lon).toFixed(2)}° ${p.lon >= 0 ? 'E' : 'W'}`;
  el.icNote.textContent = p.note;
  el.card.classList.add('is-open');
  el.card.setAttribute('aria-hidden', 'false');
  document.body.classList.add('has-card');
  el.live.textContent = `已定位到 ${p.year} 年 ${p.city}，纬度 ${Math.abs(p.lat).toFixed(2)} 度${p.lat >= 0 ? '北' : '南'}，经度 ${Math.abs(p.lon).toFixed(2)} 度${p.lon >= 0 ? '东' : '西'}`;
  updateActiveUI();
}

function closeCard() {
  if (activePin < 0) return;
  activePin = -1;
  el.card.classList.remove('is-open');
  el.card.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('has-card');
  updateActiveUI();
  // 关闭后恢复自转（比拖拽后的等待短一点）
  lastInteract = nowS() - CFG.resumeDelay + 0.9;
  el.live.textContent = '已关闭坐标信息卡';
}

function updateActiveUI() {
  [...el.timeline.children].forEach((b, i) => {
    b.classList.toggle('is-active', i === activePin);
    b.setAttribute('aria-pressed', String(i === activePin));
  });
  el.pinLayer.querySelectorAll('.pin-label').forEach((b, i) => {
    b.classList.toggle('is-active', i === activePin);
  });
}

/* =============================================================================
 * 9. 每帧：钉子的脉冲动画 + HTML 标签投影 / 避让
 * ========================================================================== */
const tmpV1 = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpV3 = new THREE.Vector3();

const roState = { acc: 0, coord: '', zoom: '' };
const tmpCenter = new THREE.Vector3();
const qInv = new THREE.Quaternion();

/** 左下角读数：把当前朝向换算回经纬度，显示视角中心 */
function updateReadout(dt) {
  roState.acc += dt;
  if (roState.acc < 0.08) return;
  roState.acc = 0;
  qInv.copy(earthGroup.quaternion).invert();
  tmpCenter.set(0, 0, 1).applyQuaternion(qInv);
  const lat = Math.asin(clamp(tmpCenter.y, -1, 1)) / DEG;
  const lon = Math.atan2(-tmpCenter.z, tmpCenter.x) / DEG;
  const coord = `${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'} / ${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`;
  const zm = `×${(1 / Math.max(0.3, zoom)).toFixed(2)}`;
  if (coord !== roState.coord) { roState.coord = coord; el.roCoord.textContent = coord; }
  if (zm !== roState.zoom) { roState.zoom = zm; el.roZoom.textContent = zm; }
}

function updatePins(t, dt) {
  const ease = 1 - Math.exp(-10 * dt);
  for (const o of pinObjs) {
    const active = o.i === activePin;
    const hot = active || o.i === hoverPin;

    // 菱形钉：聚焦 / 悬停时放大、变色
    const targetScale = active ? 1.4 : hot ? 1.15 : 1.0;
    o.scale += (targetScale - o.scale) * ease;
    o.marker.scale.setScalar(0.052 * o.scale);   // 世界单位 → 屏幕约 13px
    o.marker.material.color.setHex(active ? 0xfff0c0 : hot ? 0xffffff : CFG.colors.pin);

    // 脉冲光圈
    const speed = active ? 0.72 : 0.34;
    for (let k = 0; k < o.rings.length; k++) {
      const ring = o.rings[k];
      const phase = (t * speed + o.phase + k * 0.5) % 1;
      const s = 0.095 + phase * 0.095;
      ring.scale.setScalar(s);
      ring.material.opacity = (1 - phase) * (active ? 0.9 : 0.4);
      ring.material.color.setHex(active ? CFG.colors.pinHot : CFG.colors.pin);
    }
  }
}

function updateLabels() {
  if (!renderer || pinObjs.length === 0 || !labelDom.length) return;

  const mobile = layoutMobile;
  const faceCut = mobile ? 0.42 : 0.18;
  const baseLift = mobile ? 18 : 22;

  const items = [];
  for (const o of pinObjs) {
    // 世界法线 / 世界位置（地球组在原点，只应用四元数）
    tmpV1.copy(o.normal).applyQuaternion(earthGroup.quaternion);
    tmpV2.copy(tmpV1).multiplyScalar(PIN_R);
    tmpV3.copy(camera.position).sub(tmpV2).normalize();
    const facing = tmpV1.dot(tmpV3);

    tmpV2.project(camera);
    const x = (tmpV2.x * 0.5 + 0.5) * vw;
    const y = (-tmpV2.y * 0.5 + 0.5) * vh;
    o.screen.x = x;
    o.screen.y = y;
    o.screen.front = facing > faceCut && tmpV2.z < 1;
    items.push({ i: o.i, x, y, front: o.screen.front });
  }

  // 放置顺序：正在聚焦的标签优先；其余按年份倒序放（后放的往上顶），
  // 这样挤在一起的标签从上到下正好是 2020 → 2026，读起来是时间线
  const order = items.slice().sort((a, b) => {
    const pa = a.i === activePin ? 0 : 1;
    const pb = b.i === activePin ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return b.i - a.i;
  });

  const placed = [];
  // 正在聚焦的钉子本身也算障碍物，别让别的标签压上来
  const focusObj = activePin >= 0 ? pinObjs[activePin] : null;
  if (focusObj && focusObj.screen.front) {
    placed.push({
      x0: focusObj.screen.x - 16,
      x1: focusObj.screen.x + 16,
      y0: focusObj.screen.y - 16,
      y1: focusObj.screen.y + 16,
    });
  }
  for (const it of order) {
    const lab = labelDom[it.i];
    const { wrap, btn } = lab;
    const w = lab.w, h = lab.h;

    let visible = it.front
      && it.x > w * 0.5 + 6 && it.x < vw - w * 0.5 - 6
      && it.y > 76 && it.y < vh - 10;

    let lift = baseLift;
    let top = it.y - lift - h;
    if (visible) {
      // 和已放置的标签做矩形避让：一路往上顶（中间会拉出一道竖向虚线）
      for (let guard = 0; guard < 8; guard++) {
        const x0 = it.x - w * 0.5 - 6;
        const x1 = it.x + w * 0.5 + 6;
        const y0 = top - 4;
        const y1 = top + h + 4;
        const hit = placed.some((r) => !(x1 < r.x0 || x0 > r.x1 || y1 < r.y0 || y0 > r.y1));
        if (!hit) break;
        lift += h + 4;
        top = it.y - lift - h;
        if (guard === 7) visible = false;
      }
      const maxLift = baseLift + (mobile ? 3 : 2) * (h + 4);   // 最多顶 2~3 格，再多就藏起来（别糊成一团）
      if (top < 58 || lift > maxLift) visible = false;
    }

    if (!visible) {
      wrap.dataset.visible = 'false';
      btn.tabIndex = -1;
      btn.setAttribute('aria-hidden', 'true');
      continue;
    }

    // 取整：像素字体落在整像素网格上才清晰
    const px = Math.round(it.x);
    const py = Math.round(it.y);
    wrap.style.transform = `translate3d(${px}px, ${py}px, 0)`;
    wrap.style.setProperty('--lift', `${Math.round(lift)}px`);
    wrap.dataset.visible = 'true';
    btn.tabIndex = 0;
    btn.removeAttribute('aria-hidden');
    btn.setAttribute('aria-current', it.i === activePin ? 'true' : 'false');

    placed.push({
      x0: it.x - w * 0.5 - 6,
      x1: it.x + w * 0.5 + 6,
      y0: top - 4,
      y1: top + h + 4,
    });
  }

  // 取景框：套在正在聚焦的钉子上（钉子转到背面时自动隐藏）
  const activeObj = activePin >= 0 ? pinObjs[activePin] : null;
  if (activeObj && activeObj.screen.front) {
    el.reticle.style.transform = `translate3d(${Math.round(activeObj.screen.x) - 13}px, ${Math.round(activeObj.screen.y) - 13}px, 0)`;
    el.reticle.classList.add('is-on');
  } else {
    el.reticle.classList.remove('is-on');
  }
}

/* =============================================================================
 * 10. 主循环
 * ========================================================================== */
function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, Math.max(0.001, (now - lastT) / 1000 || 0.016));
  lastT = now;
  const t = nowS();

  // 进场：从稍远的地方缓缓推近
  if (introZoom > 1) introZoom = Math.max(1, introZoom - dt * 0.9);

  // 用户缩放平滑
  zoom += (zoomTarget - zoom) * (1 - Math.exp(-9 * dt));

  // 旋转：聚焦缓动 > 惯性 > 自动自转
  if (!dragging) {
    if (focusTarget) {
      const k = 1 - Math.exp(-CFG.focusEase * dt);
      yaw += (focusTarget.yaw - yaw) * k;
      pitch += (focusTarget.pitch - pitch) * k;
      if (Math.abs(focusTarget.yaw - yaw) < 0.0015 && Math.abs(focusTarget.pitch - pitch) < 0.0015) {
        yaw = focusTarget.yaw;
        pitch = focusTarget.pitch;
        focusTarget = null;
      }
    } else {
      // 惯性
      if (yawVel || pitchVel) {
        yaw += yawVel * dt;
        pitch += pitchVel * dt;
        const decay = Math.exp(-3.0 * dt);
        yawVel *= decay;
        pitchVel *= decay;
        clampPitch();
        if (Math.abs(yawVel) < 0.004) yawVel = 0;
        if (Math.abs(pitchVel) < 0.004) pitchVel = 0;
      }
      // 自动自转：卡片打开 / 刚操作过 / debug 冻结时停
      const idle = t - lastInteract;
      const wantSpin = (!REDUCED && !debugHold && activePin < 0 && idle > CFG.resumeDelay) ? 1 : 0;
      spinLevel += (wantSpin - spinLevel) * (1 - Math.exp(-CFG.spinEase * dt));
      if (spinLevel > 0.002) yaw += CFG.autoSpin * spinLevel * dt;
    }
  } else {
    spinLevel = 0;
    focusTarget = null;
  }
  clampPitch();

  // 地球姿态：先绕 Y 自转（经度），再绕 X 俯仰（纬度）
  qYaw.setFromAxisAngle(AXIS_Y, yaw);
  qPitch.setFromAxisAngle(AXIS_X, pitch);
  earthGroup.quaternion.copy(qPitch).multiply(qYaw);
  earthGroup.updateMatrixWorld(true);

  // 相机（构图 / 缩放 / 平移）
  applyCamera(1 - Math.exp(-6.5 * dt));

  // 材质时间
  earthMat.uniforms.uTime.value = t;
  starMat.uniforms.uTime.value = t;

  updatePins(t, dt);
  updateReadout(dt);
  updateLabels();
  renderer.render(scene, camera);
}

const qYaw = new THREE.Quaternion();
const qPitch = new THREE.Quaternion();

/* =============================================================================
 * 11. 事件绑定 / 启动
 * ========================================================================== */
function bindEvents() {
  const c = el.canvas;
  c.addEventListener('pointerdown', onPointerDown);
  c.addEventListener('pointermove', onPointerMove);
  c.addEventListener('pointerup', onPointerUp);
  c.addEventListener('pointercancel', onPointerCancel);
  c.addEventListener('wheel', onWheel, { passive: false });
  c.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('blur', () => {
    pointers.clear();
    dragging = false;
    c.classList.remove('is-dragging');
  });

  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      layout();
    });
  });

  el.cardClose.addEventListener('click', closeCard);

  /* 返回主站房间 */
  if (el.brand) el.brand.setAttribute('href', ROOM_URL);
  if (el.returnBtn) {
    el.returnBtn.addEventListener('click', () => { location.href = ROOM_URL; });
  }

  el.sampleTag.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = el.sampleWrap.classList.toggle('is-open');
    el.sampleTag.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => {
    if (!el.sampleWrap.contains(e.target)) {
      el.sampleWrap.classList.remove('is-open');
      el.sampleTag.setAttribute('aria-expanded', 'false');
    }
  });
}

function defineDebug() {
  const resolve = (arg) => {
    if (typeof arg === 'number') {
      if (arg >= 0 && arg < PINS.length) return arg;
      return PINS.findIndex((p) => p.year === arg);
    }
    return -1;
  };

  /** 聚焦第 i 个坐标（也接受年份，如 2022） */
  window.__focusPin = (i, instant) => {
    const idx = resolve(i);
    if (idx >= 0) focusPin(idx, { instant: !!instant });
    return idx;
  };
  window.__closeCard = () => closeCard();
  /** 直接设置地球朝向（弧度）：__setRotation(yaw, pitch) */
  window.__setRotation = (y, p) => {
    focusTarget = null;
    debugHold = true;
    yaw = Number(y);
    if (p !== undefined && p !== null) pitch = clamp(Number(p), -CFG.maxPitch, CFG.maxPitch);
    yawVel = pitchVel = 0;
    spinLevel = 0;
    lastInteract = nowS();
    return { yaw, pitch };
  };
  window.__setZoom = (z) => {
    zoomTarget = clamp(Number(z), CFG.minZoom, CFG.maxZoom);
    zoom = zoomTarget;
    return zoomTarget;
  };
  window.__resumeSpin = () => { debugHold = false; lastInteract = nowS() - CFG.resumeDelay - 1; };
  window.__state = () => ({
    yaw, pitch, zoom: zoomTarget, active: activePin, spinLevel, debugHold,
    radiusPx: baseDia * viewScale,
    canvas: { w: backW, h: backH, cssW: vw, cssH: vh },
    labels: labelDom.map((l, i) => ({
      i,
      visible: l.wrap.dataset.visible === 'true',
      x: pinObjs[i] ? +pinObjs[i].screen.x.toFixed(1) : null,
      y: pinObjs[i] ? +pinObjs[i].screen.y.toFixed(1) : null,
    })),
  });
  window.__g = { PINS, pinObjs, earthGroup, scene, camera, renderer, labelDom };
  window.__globeReady = true;

  while (pendingDebug.length) {
    const arg = pendingDebug.shift();
    const idx = resolve(arg);
    if (idx >= 0) focusPin(idx);
  }
}

/** 启动：建 UI → 建场景 → 等贴图/字体 → 开跑 */
async function boot() {
  buildUI();
  initThree();

  const assetUrl = (p) => new URL(p, import.meta.url).href;
  const [dayTex, nightTex] = await Promise.all([
    loadTexture(assetUrl('./assets/three/earth-pixel.png')),
    loadTexture(assetUrl('./assets/three/earth-lights.png')),
  ]);

  buildEarth(dayTex, nightTex);
  buildStars();
  buildPins();

  try { await document.fonts.ready; } catch { /* 字体没关系，继续 */ }

  measureLabels();
  layout();
  bindEvents();

  startedAt = performance.now();
  lastT = startedAt;
  lastInteract = 0;
  ready = true;
  document.body.classList.add('is-ready');

  // URL 参数：?pin=2022 或 ?pin=2 直接打开某个坐标（分享 / 截图用）
  const params = new URLSearchParams(location.search);
  const pinParam = params.get('pin');
  if (pinParam !== null) {
    const idx = /^\d{4}$/.test(pinParam)
      ? PINS.findIndex((p) => String(p.year) === pinParam)
      : Number(pinParam);
    if (idx >= 0 && idx < PINS.length) focusPin(idx, { instant: false });
  }

  requestAnimationFrame(tick);
  defineDebug();
}

boot().catch((err) => {
  // WebGL / 资源出问题时给一个可见提示，而不是白屏
  console.warn('[pixel-earth] boot failed:', err);
  const bootEl = document.getElementById('boot');
  if (bootEl) {
    bootEl.innerHTML = '<p class="boot-main">WEBGL UNAVAILABLE</p><p class="boot-sub">这台设备暂时画不出像素地球</p>';
  }
});

/* 让截图工具在模块初始化完成前也能排队调用 __focusPin */
window.__focusPin = (i) => { pendingDebug.push(i); return -1; };
