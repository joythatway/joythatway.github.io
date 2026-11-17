/* =====================================================================
   audio.js — 放映机嗡嗡声（WebAudio 现场合成，没有任何音频文件）
   ─ 低通噪声：胶片跑过片门的风声
   ─ 50/60Hz 低频 + 二次谐波：放映机马达的机箱共振
   ─ 轻微咔哒：片门每秒抓 3 次的机械声（24 格 / 8 孔抓片）
   默认关闭；只有用户点了 SOUND 按钮才会创建 / 启动 AudioContext。
   ===================================================================== */

export function createProjectorAudio() {
  let ctx = null;         // AudioContext
  let master = null;      // 总音量
  let noiseSrc = null;    // 循环噪声源
  let hums = [];          // 低频振荡器
  let clickTimer = 0;     // 机械咔哒的定时器
  let running = false;

  /** 生成一段 3 秒的粉噪声（用一阶低通滤过的白噪声近似） */
  function makeNoiseBuffer(seconds = 3) {
    const rate = ctx.sampleRate;
    const buf = ctx.createBuffer(1, Math.floor(rate * seconds), rate);
    const data = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.0990460;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.16;
    }
    return buf;
  }

  /** 建整条声音链（只建一次） */
  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = 0;            // 从静音开始，靠 ramp 淡入
    master.connect(ctx.destination);

    /* ---- 风声：粉噪声 → 低通 ---- */
    const noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer();
    noise.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 480;
    lp.Q.value = 0.7;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.5;

    /* 低通截止频率缓慢摆动，声音就不“死” */
    const sweep = ctx.createOscillator();
    sweep.frequency.value = 0.09;
    const sweepGain = ctx.createGain();
    sweepGain.gain.value = 90;
    sweep.connect(sweepGain).connect(lp.frequency);

    noise.connect(lp).connect(noiseGain).connect(master);
    noise.start();
    sweep.start();
    noiseSrc = noise;

    /* ---- 马达低频：55Hz 基频 + 110/165Hz 谐波 ---- */
    hums = [55, 110, 165].map((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = [0.07, 0.028, 0.012][i];
      osc.connect(g).connect(master);
      osc.start();
      return osc;
    });

    /* 55Hz 轻微失谐，两个振荡器打架 = 更真实的电机声 */
    const wobble = ctx.createOscillator();
    wobble.type = 'sine';
    wobble.frequency.value = 0.17;
    const wobbleGain = ctx.createGain();
    wobbleGain.gain.value = 0.35;
    wobble.connect(wobbleGain).connect(hums[0].detune);
    wobble.start();

    return true;
  }

  /** 一次片门咔哒：短促的带通噪声 + 一点点低频 */
  function click() {
    if (!running || !ctx) return;
    const t0 = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(0.05);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400 + Math.random() * 500;
    bp.Q.value = 3.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.03, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
    src.connect(bp).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + 0.07);

    const thump = ctx.createOscillator();
    thump.type = 'triangle';
    thump.frequency.setValueAtTime(120 + Math.random() * 40, t0);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.03, t0);
    tg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
    thump.connect(tg).connect(master);
    thump.start(t0);
    thump.stop(t0 + 0.08);
  }

  return {
    get enabled() { return running; },

    /** 在用户手势里调用；淡入到可听音量 */
    async enable() {
      if (running) return;
      if (!ctx && !build()) return;
      if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch { /* 被浏览器拦了就静音 */ }
      }
      running = true;
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
      master.gain.linearRampToValueAtTime(0.5, t + 0.9);

      /* 咔哒：每 ~340ms 一次，带一点随机，不要像节拍器 */
      clearInterval(clickTimer);
      clickTimer = setInterval(() => {
        if (Math.random() < 0.82) click();
      }, 340);
    },

    /** 淡出并停下机械声（AudioContext 保留，下次 enable 更快） */
    disable() {
      running = false;
      clearInterval(clickTimer);
      clickTimer = 0;
      if (!ctx || !master) return;
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + 0.35);
    },
  };
}
