/**
 * 音效服务。
 *
 * 设计要点：
 *  - 不依赖远程资源：优先播放本地自生成 WAV（src/assets/sounds/），失败时使用 WebAudio 合成音。
 *  - 浏览器自动播放策略：AudioContext 只在用户首次交互后创建（play/preload 均由交互触发）。
 *  - 任何音频错误都被吞掉，绝不影响游戏运行；音效关闭时完全不触碰音频 API。
 */
export const SOUND_NAMES = ['reveal', 'flag', 'explode', 'win', 'newGame'];

/** 合成音配方（WAV 加载失败时的后备方案，音色与 WAV 保持一致）。 */
const RECIPES = {
  reveal: [{ kind: 'tone', type: 'triangle', from: 880, to: 560, start: 0, duration: 0.055, gain: 0.18 }],
  flag: [
    { kind: 'tone', type: 'square', from: 1380, to: 1380, start: 0, duration: 0.03, gain: 0.09 },
    { kind: 'tone', type: 'square', from: 1860, to: 1860, start: 0.04, duration: 0.04, gain: 0.09 },
  ],
  explode: [
    { kind: 'noise', start: 0, duration: 0.42, gain: 0.5 },
    { kind: 'tone', type: 'sine', from: 190, to: 42, start: 0, duration: 0.5, gain: 0.4 },
  ],
  win: [
    { kind: 'tone', type: 'triangle', from: 523.25, to: 523.25, start: 0, duration: 0.12, gain: 0.2 },
    { kind: 'tone', type: 'triangle', from: 659.25, to: 659.25, start: 0.1, duration: 0.12, gain: 0.2 },
    { kind: 'tone', type: 'triangle', from: 783.99, to: 783.99, start: 0.2, duration: 0.12, gain: 0.2 },
    { kind: 'tone', type: 'triangle', from: 1046.5, to: 1046.5, start: 0.3, duration: 0.24, gain: 0.22 },
  ],
  newGame: [{ kind: 'tone', type: 'sine', from: 320, to: 190, start: 0, duration: 0.12, gain: 0.14 }],
};

function defaultContextFactory() {
  const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (typeof Ctor !== 'function') return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

/**
 * @param {object} [options]
 * @param {boolean} [options.enabled] 初始开关状态
 * @param {Record<string,string>} [options.soundUrls] name → 本地 WAV 地址
 * @param {() => AudioContext|null} [options.contextFactory] 注入 AudioContext（测试用）
 * @param {() => number} [options.now]
 * @param {number} [options.throttleMs] 同一音效的最小间隔，避免连续展开时声音刺耳
 * @param {number} [options.volume] 主音量
 */
export function createAudioService({
  enabled = true,
  soundUrls = {},
  contextFactory = defaultContextFactory,
  now = () => Date.now(),
  throttleMs = 40,
  volume = 0.6,
} = {}) {
  let context = null;
  let master = null;
  let contextUnavailable = false;
  const buffers = {};
  const lastPlayed = Object.create(null);
  let preloaded = false;
  let loadErrors = 0;

  function ensureContext() {
    if (context) return context;
    if (contextUnavailable) return null;
    try {
      context = contextFactory();
    } catch {
      context = null;
    }
    if (!context) {
      contextUnavailable = true;
      return null;
    }
    try {
      master = context.createGain();
      master.gain.value = volume;
      master.connect(context.destination);
    } catch {
      master = null;
    }
    return context;
  }

  function resumeIfSuspended() {
    try {
      if (context && context.state === 'suspended' && typeof context.resume === 'function') {
        const result = context.resume();
        if (result && typeof result.catch === 'function') result.catch(() => {});
      }
    } catch {
      /* 忽略：部分环境不允许 resume */
    }
  }

  function noiseBuffer(ctx, seconds) {
    const sampleRate = ctx.sampleRate ?? 22050;
    const length = Math.max(1, Math.floor(sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      // 低通白噪声：比纯白噪声更接近“闷响”，不刺耳
      const white = Math.random() * 2 - 1;
      last = last * 0.72 + white * 0.28;
      data[i] = last;
    }
    return buffer;
  }

  function playSynth(name) {
    const ctx = context;
    if (!ctx) return false;
    const recipe = RECIPES[name];
    if (!recipe) return false;
    const target = master ?? ctx.destination;
    const base = ctx.currentTime ?? 0;
    for (const step of recipe) {
      const gainNode = ctx.createGain();
      gainNode.gain.value = 0;
      gainNode.connect(target);
      const start = base + (step.start ?? 0);
      const end = start + step.duration;
      // 简单的 AD 包络：快速起音 + 指数衰减
      gainNode.gain.setValueAtTime(0, start);
      gainNode.gain.linearRampToValueAtTime(step.gain, start + Math.min(0.01, step.duration / 3));
      gainNode.gain.exponentialRampToValueAtTime(0.0001, end);

      if (step.kind === 'noise') {
        const source = ctx.createBufferSource();
        source.buffer = noiseBuffer(ctx, step.duration);
        source.connect(gainNode);
        source.start(start);
        source.stop(end);
      } else {
        const osc = ctx.createOscillator();
        osc.type = step.type;
        osc.frequency.setValueAtTime(step.from, start);
        if (step.to !== step.from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, step.to), end);
        osc.connect(gainNode);
        osc.start(start);
        osc.stop(end);
      }
    }
    return true;
  }

  function playBuffer(name) {
    const ctx = context;
    const buffer = buffers[name];
    if (!ctx || !buffer) return false;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(master ?? ctx.destination);
    source.start(0);
    return true;
  }

  /** 预加载本地 WAV。失败不影响后续播放（退回合成音）。 */
  async function preload() {
    // 音效关闭时不触碰任何音频 API
    if (!enabled) return { loaded: [], failed: 0 };
    if (preloaded) return { loaded: Object.keys(buffers), failed: loadErrors };
    preloaded = true;
    const ctx = ensureContext();
    const names = Object.keys(soundUrls);
    if (!ctx || names.length === 0) return { loaded: [], failed: 0 };
    for (const name of names) {
      try {
        const response = await fetch(soundUrls[name]);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arrayBuffer);
        if (decoded) buffers[name] = decoded;
      } catch {
        loadErrors += 1;
      }
    }
    return { loaded: Object.keys(buffers), failed: loadErrors };
  }

  return {
    setEnabled(next) {
      enabled = Boolean(next);
      if (!enabled) {
        try {
          if (context && context.state === 'running' && typeof context.suspend === 'function') context.suspend();
        } catch {
          /* 忽略 */
        }
      }
      return enabled;
    },
    isEnabled() {
      return enabled;
    },
    /** 播放一个音效；返回是否真的发出了声音。 */
    play(name) {
      if (!enabled) return false;
      if (!SOUND_NAMES.includes(name)) return false;
      const stamp = now();
      if (throttleMs > 0 && lastPlayed[name] !== undefined && stamp - lastPlayed[name] < throttleMs) return false;
      lastPlayed[name] = stamp;
      if (!ensureContext()) return false;
      resumeIfSuspended();
      try {
        return playBuffer(name) || playSynth(name);
      } catch {
        return false;
      }
    },
    preload,
    /** 用户首次交互时调用，满足浏览器自动播放要求。 */
    async unlock() {
      if (!enabled) return false;
      const ctx = ensureContext();
      if (!ctx) return false;
      resumeIfSuspended();
      await preload();
      return true;
    },
    status() {
      return {
        enabled,
        hasContext: Boolean(context),
        contextUnavailable,
        loadedBuffers: Object.keys(buffers),
        loadErrors,
      };
    },
    dispose() {
      try {
        if (context && typeof context.close === 'function') context.close();
      } catch {
        /* 忽略 */
      }
      context = null;
      master = null;
    },
  };
}
