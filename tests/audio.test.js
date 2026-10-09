/**
 * 音效服务测试：使用注入的假 AudioContext，验证开关、节流、WAV 加载与合成回退。
 */
import { describe, expect, it, vi } from 'vitest';
import { SOUND_NAMES, createAudioService } from '../src/services/audioService.js';

function createFakeContext({ decodeFails = false, state = 'running' } = {}) {
  const calls = { oscillators: [], bufferSources: [], gains: 0, resumed: 0, closed: 0 };
  const context = {
    state,
    currentTime: 0,
    sampleRate: 22050,
    destination: { name: 'destination' },
    createGain: () => {
      calls.gains += 1;
      return {
        gain: {
          value: 0,
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };
    },
    createOscillator: () => {
      const osc = {
        type: 'sine',
        frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      calls.oscillators.push(osc);
      return osc;
    },
    createBufferSource: () => {
      const source = { buffer: null, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      calls.bufferSources.push(source);
      return source;
    },
    createBuffer: (channels, length) => ({
      length,
      getChannelData: () => new Float32Array(length),
    }),
    decodeAudioData: async () => {
      if (decodeFails) throw new Error('decode failed');
      return { decoded: true };
    },
    resume: async () => {
      calls.resumed += 1;
      context.state = 'running';
    },
    suspend: async () => {
      context.state = 'suspended';
    },
    close: async () => {
      calls.closed += 1;
    },
  };
  return { context, calls };
}

describe('createAudioService', () => {
  it('默认开启并可以关闭；关闭后完全不触碰音频 API', () => {
    const { context } = createFakeContext();
    const factory = vi.fn(() => context);
    const audio = createAudioService({ contextFactory: factory });
    expect(audio.isEnabled()).toBe(true);

    audio.setEnabled(false);
    expect(audio.play('reveal')).toBe(false);
    expect(factory).not.toHaveBeenCalled();
    expect(audio.status().hasContext).toBe(false);
  });

  it('开启时通过合成音播放（无 WAV 也能出声）', () => {
    const { context, calls } = createFakeContext();
    const audio = createAudioService({ contextFactory: () => context });
    expect(audio.play('reveal')).toBe(true);
    expect(calls.oscillators.length).toBeGreaterThan(0);
    expect(calls.gains).toBeGreaterThan(0);
  });

  it('同一种音效会被节流，避免连续展开时刷屏', () => {
    const { context } = createFakeContext();
    let clockValue = 0;
    const audio = createAudioService({ contextFactory: () => context, now: () => clockValue, throttleMs: 40 });
    expect(audio.play('reveal')).toBe(true);
    expect(audio.play('reveal')).toBe(false);
    clockValue = 100;
    expect(audio.play('reveal')).toBe(true);
  });

  it('未知音效名直接忽略', () => {
    const { context } = createFakeContext();
    const audio = createAudioService({ contextFactory: () => context });
    expect(audio.play('not-a-sound')).toBe(false);
  });

  it('没有 AudioContext 时静默失败，不影响游戏', () => {
    const audio = createAudioService({ contextFactory: () => null });
    expect(audio.play('reveal')).toBe(false);
    expect(audio.status().contextUnavailable).toBe(true);
    expect(() => audio.dispose()).not.toThrow();
  });

  it('AudioContext 构造抛错时同样静默降级', () => {
    const audio = createAudioService({
      contextFactory: () => {
        throw new Error('autoplay blocked');
      },
    });
    expect(audio.play('flag')).toBe(false);
    expect(audio.status().contextUnavailable).toBe(true);
  });

  it('WAV 预加载成功后优先播放采样，而不是合成音', async () => {
    const { context, calls } = createFakeContext();
    const audio = createAudioService({
      contextFactory: () => context,
      soundUrls: { reveal: 'file:///reveal.wav' },
    });
    const globalFetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
    vi.stubGlobal('fetch', globalFetch);

    const result = await audio.preload();
    expect(result.loaded).toContain('reveal');
    expect(audio.play('reveal')).toBe(true);
    expect(calls.bufferSources).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it('WAV 加载失败时自动退回合成音，游戏音效不中断', async () => {
    const { context, calls } = createFakeContext({ decodeFails: true });
    const audio = createAudioService({
      contextFactory: () => context,
      soundUrls: { explode: 'file:///explode.wav' },
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));

    const result = await audio.preload();
    expect(result.loaded).not.toContain('explode');
    expect(audio.status().loadErrors).toBe(1);
    expect(audio.play('explode')).toBe(true);
    expect(calls.oscillators.length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it('fetch 不可用时不抛错，并退化为合成音', async () => {
    const { context, calls } = createFakeContext();
    const audio = createAudioService({ contextFactory: () => context, soundUrls: { win: 'file:///win.wav' } });
    vi.stubGlobal('fetch', undefined);
    await expect(audio.preload()).resolves.toEqual({ loaded: [], failed: 1 });
    expect(audio.status().loadErrors).toBe(1);
    expect(audio.play('win')).toBe(true);
    expect(calls.oscillators.length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it('音效关闭时 preload 完全不触碰音频 API', async () => {
    let factoryCalls = 0;
    let fetchCalls = 0;
    const { context } = createFakeContext();
    const audio = createAudioService({
      enabled: false,
      soundUrls: { reveal: 'file:///reveal.wav' },
      contextFactory: () => {
        factoryCalls += 1;
        return context;
      },
    });
    vi.stubGlobal('fetch', async () => {
      fetchCalls += 1;
      throw new Error('不应被调用');
    });
    await expect(audio.preload()).resolves.toEqual({ loaded: [], failed: 0 });
    expect(factoryCalls).toBe(0);
    expect(fetchCalls).toBe(0);
    vi.unstubAllGlobals();
  });

  it('unlock 满足浏览器自动播放要求（可被用户手势调用）', async () => {
    const { context, calls } = createFakeContext({ state: 'suspended' });
    const audio = createAudioService({ contextFactory: () => context });
    await expect(audio.unlock()).resolves.toBe(true);
    expect(calls.resumed).toBeGreaterThan(0);
  });

  it('SOUND_NAMES 覆盖规格要求的五类音效', () => {
    expect(SOUND_NAMES).toEqual(['reveal', 'flag', 'explode', 'win', 'newGame']);
  });

  it('dispose 关闭上下文', () => {
    const { context, calls } = createFakeContext();
    const audio = createAudioService({ contextFactory: () => context });
    audio.play('reveal');
    audio.dispose();
    expect(calls.closed).toBe(1);
  });
});
