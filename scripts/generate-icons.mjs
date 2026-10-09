/**
 * 生成应用图标（PNG + ICO），用于 Electron 打包与桌面快捷方式。
 *
 * 运行：npm run assets  或  node scripts/generate-icons.mjs
 * 输出：build/icon.png（256×256）、build/icon.ico（内嵌 256×256 PNG）
 *
 * 图标内容：经典扫雷的黑色地雷 + 红色小旗，纯手工光栅化，不依赖任何三方库。
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.resolve(__dirname, '..', 'build');
const SIZE = 256;

/* ---------- 基础绘图 ---------- */

function createCanvas(size, [r, g, b, a] = [0, 0, 0, 0]) {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    pixels[i * 4] = r;
    pixels[i * 4 + 1] = g;
    pixels[i * 4 + 2] = b;
    pixels[i * 4 + 3] = a;
  }
  return pixels;
}

/** 以覆盖率做抗锯齿的像素混合（采样 3×3 超采样）。 */
function blend(canvas, size, x, y, [r, g, b], alpha) {
  if (alpha <= 0) return;
  const i = (y * size + x) * 4;
  const inv = 1 - alpha;
  canvas[i] = canvas[i] * inv + r * alpha;
  canvas[i + 1] = canvas[i + 1] * inv + g * alpha;
  canvas[i + 2] = canvas[i + 2] * inv + b * alpha;
  canvas[i + 3] = Math.max(canvas[i + 3], Math.round(255 * alpha));
}

const SUB = 3;
function shape(canvas, size, test, color) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let hits = 0;
      for (let sy = 0; sy < SUB; sy += 1) {
        for (let sx = 0; sx < SUB; sx += 1) {
          const px = x + (sx + 0.5) / SUB;
          const py = y + (sy + 0.5) / SUB;
          if (test(px, py)) hits += 1;
        }
      }
      if (hits > 0) blend(canvas, size, x, y, color, hits / (SUB * SUB));
    }
  }
}

const circle = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

function capsule(x1, y1, x2, y2, halfWidth) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  return (x, y) => {
    let t = lenSq === 0 ? 0 : ((x - x1) * dx + (y - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + t * dx;
    const py = y1 + t * dy;
    return (x - px) ** 2 + (y - py) ** 2 <= halfWidth * halfWidth;
  };
}

const triangle = (p1, p2, p3) => {
  const sign = (ax, ay, bx, by, cx, cy) => (ax - cx) * (by - cy) - (bx - cx) * (ay - cy);
  return (x, y) => {
    const d1 = sign(x, y, p1[0], p1[1], p2[0], p2[1]);
    const d2 = sign(x, y, p2[0], p2[1], p3[0], p3[1]);
    const d3 = sign(x, y, p3[0], p3[1], p1[0], p1[1]);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNeg && hasPos);
  };
};

const roundRect = (x0, y0, x1, y1, r) => (x, y) => {
  const cx = Math.max(x0 + r, Math.min(x1 - r, x));
  const cy = Math.max(y0 + r, Math.min(y1 - r, y));
  if (x >= x0 && x <= x1 && y >= y0 && y <= y1) {
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r || (x >= x0 + r && x <= x1 - r) || (y >= y0 + r && y <= y1 - r);
  }
  return false;
};

/* ---------- 图标绘制 ---------- */

function drawIcon(size) {
  const canvas = createCanvas(size, [0, 0, 0, 0]);
  const s = size / 256;
  const BLACK = [17, 17, 17];
  const RED = [200, 30, 30];
  const DARK_RED = [150, 18, 18];
  const WHITE = [245, 245, 245];

  // 底板：经典灰色凸起方块
  shape(canvas, size, roundRect(8 * s, 8 * s, 248 * s, 248 * s, 18 * s), [192, 192, 192]);
  shape(canvas, size, roundRect(8 * s, 8 * s, 248 * s, 248 * s, 18 * s), [200, 200, 200]);
  shape(canvas, size, roundRect(10 * s, 10 * s, 246 * s, 246 * s, 16 * s), [224, 224, 224]);
  // 内凹格
  shape(canvas, size, roundRect(26 * s, 26 * s, 230 * s, 230 * s, 10 * s), [188, 188, 188]);
  shape(canvas, size, roundRect(30 * s, 30 * s, 226 * s, 226 * s, 8 * s), [208, 208, 208]);

  // 地雷：8 根尖刺 + 球体 + 高光
  const cx = 118 * s;
  const cy = 140 * s;
  for (let i = 0; i < 8; i += 1) {
    const angle = (Math.PI / 8) + (i * Math.PI) / 4;
    const r1 = 0;
    const r2 = 96 * s;
    shape(
      canvas,
      size,
      capsule(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1, cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2, 7 * s),
      BLACK,
    );
  }
  shape(canvas, size, circle(cx, cy, 62 * s), BLACK);
  shape(canvas, size, circle(cx - 20 * s, cy - 20 * s, 14 * s), WHITE);
  shape(canvas, size, circle(cx - 20 * s, cy - 20 * s, 8 * s), [255, 255, 255]);

  // 红旗：旗杆 + 三角旗 + 底座
  shape(canvas, size, capsule(196 * s, 62 * s, 196 * s, 176 * s, 5 * s), BLACK);
  shape(canvas, size, triangle([196 * s, 62 * s], [120 * s, 92 * s], [196 * s, 122 * s]), RED);
  shape(canvas, size, triangle([196 * s, 72 * s], [140 * s, 92 * s], [196 * s, 108 * s]), DARK_RED);
  shape(canvas, size, roundRect(170 * s, 170 * s, 232 * s, 184 * s, 5 * s), RED);
  shape(canvas, size, roundRect(150 * s, 184 * s, 244 * s, 196 * s, 5 * s), DARK_RED);

  return canvas;
}

/* ---------- PNG 编码 ---------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(pixels, size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x += 1) {
      const src = (y * size + x) * 4;
      const dst = y * (size * 4 + 1) + 1 + x * 4;
      raw[dst] = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
      raw[dst + 3] = pixels[src + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** ICO 容器：单条 256×256 条目（Vista+ 支持 PNG 压缩的 ICO）。 */
function encodeIco(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size;
  entry[1] = size >= 256 ? 0 : size;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, pngBuffer]);
}

/* ---------- 输出 ---------- */

fs.mkdirSync(BUILD_DIR, { recursive: true });
const pixels = drawIcon(SIZE);
const png = encodePng(pixels, SIZE);
fs.writeFileSync(path.join(BUILD_DIR, 'icon.png'), png);
fs.writeFileSync(path.join(BUILD_DIR, 'icon.ico'), encodeIco(png, SIZE));
console.log(`[generate-icons] build/icon.png ${png.length} bytes, build/icon.ico ${encodeIco(png, SIZE).length} bytes`);
