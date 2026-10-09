/**
 * 生成游戏音效 WAV 文件（完全本地合成，不使用任何第三方音频素材）。
 *
 * 运行：npm run assets  或  node scripts/generate-sounds.mjs
 * 输出：src/assets/sounds/*.wav（22050Hz / 16bit / 单声道）
 *
 * 使用固定种子的伪随机噪声，因此重复运行产生完全相同的文件。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'src', 'assets', 'sounds');

const SAMPLE_RATE = 22050;
const ATTACK_SECONDS = 0.006;

function createPrng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 与 src/services/audioService.js 中的合成配方保持一致，保证两条播放路径音色统一。 */
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

function renderRecipe(recipe, rng) {
  const totalSeconds = Math.max(...recipe.map((s) => s.start + s.duration)) + 0.03;
  const length = Math.ceil(totalSeconds * SAMPLE_RATE);
  const out = new Float32Array(length);

  for (const step of recipe) {
    const startIndex = Math.floor(step.start * SAMPLE_RATE);
    const stepLength = Math.floor(step.duration * SAMPLE_RATE);
    let phase = 0;
    let noiseState = 0;
    for (let i = 0; i < stepLength; i += 1) {
      const u = i / Math.max(1, stepLength);
      const t = i / SAMPLE_RATE;
      let sample;
      if (step.kind === 'noise') {
        const white = rng() * 2 - 1;
        noiseState = noiseState * 0.72 + white * 0.28;
        sample = noiseState;
      } else {
        const target = Math.max(20, step.to);
        const freq = target === step.from ? step.from : step.from * Math.pow(target / step.from, u);
        phase += (2 * Math.PI * freq) / SAMPLE_RATE;
        if (step.type === 'square') sample = Math.sin(phase) >= 0 ? 1 : -1;
        else if (step.type === 'triangle') sample = (2 / Math.PI) * Math.asin(Math.sin(phase));
        else sample = Math.sin(phase);
      }
      const attack = u < ATTACK_SECONDS / step.duration ? u / (ATTACK_SECONDS / step.duration) : 1;
      const decay = Math.pow(0.0015, Math.max(0, u - ATTACK_SECONDS / step.duration) / (1 - ATTACK_SECONDS / step.duration));
      out[startIndex + i] += sample * attack * decay * step.gain;
    }
  }

  // 归一化到 -0.85，并在结尾 6ms 做淡出，避免播放结束时的爆音。
  let peak = 0;
  for (const value of out) peak = Math.max(peak, Math.abs(value));
  const scale = peak > 0 ? 0.85 / peak : 0;
  const fadeSamples = Math.floor(0.006 * SAMPLE_RATE);
  for (let i = 0; i < out.length; i += 1) {
    const remaining = out.length - i;
    const fade = remaining < fadeSamples ? remaining / fadeSamples : 1;
    out[i] = out[i] * scale * fade;
  }
  return out;
}

function encodeWav(samples) {
  const dataLength = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataLength, 40);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), offset);
    offset += 2;
  }
  return buffer;
}

fs.mkdirSync(OUT_DIR, { recursive: true });

let seed = 20261009;
const written = [];
for (const [name, recipe] of Object.entries(RECIPES)) {
  const rng = createPrng((seed += 7919));
  const samples = renderRecipe(recipe, rng);
  const file = path.join(OUT_DIR, `${name}.wav`);
  fs.writeFileSync(file, encodeWav(samples));
  written.push({ name, bytes: fs.statSync(file).size, duration: Math.round((samples.length / SAMPLE_RATE) * 1000) });
}

console.log('[generate-sounds] 已生成:');
for (const item of written) {
  console.log(`  ${item.name.padEnd(9)} ${String(item.duration).padStart(4)}ms  ${String(item.bytes).padStart(6)} bytes`);
}
