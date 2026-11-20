import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter none
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', compressed),
    createChunk('IEND', Buffer.alloc(0)),
  ]);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function renderIcon(size, { maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  // Maskable icons keep all primary artwork inside the central 72% safe zone
  const contentScale = maskable ? 0.72 : 0.88;

  for (let y = 0; y < size; y += 1) {
    const ny = (y + 0.5) / size;
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5) / size;

      // Warm forest-to-golden-sunlight gradient backdrop
      const gradT = clamp(nx * 0.55 + ny * 0.65, 0, 1);
      let r = mix(42, 182, gradT * gradT * 0.7 + gradT * 0.3);
      let g = mix(68, 138, gradT);
      let b = mix(38, 62, gradT);

      // Soft golden sun glow in upper-right
      const sunDist = Math.hypot(nx - 0.72, ny - 0.26);
      const sunGlow = Math.exp(-sunDist * sunDist * 10) * 0.38;
      r = mix(r, 250, sunGlow);
      g = mix(g, 214, sunGlow);
      b = mix(b, 126, sunGlow);

      // Egg-shaped Liquid Glass emblem centered in safe zone
      const ex = (nx - 0.5) / contentScale;
      const ey = (ny - 0.51) / contentScale;
      const eggWidth = 0.265 * (1 + 0.16 * ey);
      const eggHeight = 0.345;
      const eggDist = Math.hypot(ex / eggWidth, ey / eggHeight);

      // Soft shadow beneath glass emblem
      const shadowDist = Math.hypot(ex / (eggWidth * 1.04), (ey - 0.03) / (eggHeight * 1.04));
      const shadowAlpha = (1 - smoothstep(0.92, 1.18, shadowDist)) * 0.24;
      r *= 1 - shadowAlpha;
      g *= 1 - shadowAlpha;
      b *= 1 - shadowAlpha;

      // Glass egg body
      const insideEgg = 1 - smoothstep(0.97, 1.01, eggDist);
      if (insideEgg > 0) {
        const glassHighlight = clamp(1 - (ex + 0.22) * 1.2 - (ey + 0.28) * 1.1, 0, 1);
        const bodyAlpha = (0.34 + glassHighlight * 0.26) * insideEgg;
        r = mix(r, 255, bodyAlpha);
        g = mix(g, 252, bodyAlpha);
        b = mix(b, 244, bodyAlpha);

        // Specular top-left highlight reflection
        const hlDist = Math.hypot((ex + 0.095) / 0.065, (ey + 0.14) / 0.115);
        const hl = (1 - smoothstep(0.75, 1.05, hlDist)) * 0.45 * insideEgg;
        r = mix(r, 255, hl);
        g = mix(g, 255, hl);
        b = mix(b, 255, hl);

        // Minimal friendly eyes
        const leftEye = 1 - smoothstep(0.028, 0.036, Math.hypot(ex + 0.072, ey - 0.015));
        const rightEye = 1 - smoothstep(0.028, 0.036, Math.hypot(ex - 0.072, ey - 0.015));
        const eyeMask = Math.max(leftEye, rightEye) * insideEgg;
        if (eyeMask > 0) {
          r = mix(r, 28, eyeMask * 0.88);
          g = mix(g, 42, eyeMask * 0.88);
          b = mix(b, 24, eyeMask * 0.88);
        }

        // Gentle smile arc
        const smileDist = Math.abs(Math.hypot(ex, ey - 0.055) - 0.065);
        const smileArc = ey > 0.085 && Math.abs(ex) < 0.062 ? 1 - smoothstep(0.012, 0.02, smileDist) : 0;
        if (smileArc > 0) {
          r = mix(r, 28, smileArc * 0.82);
          g = mix(g, 42, smileArc * 0.82);
          b = mix(b, 24, smileArc * 0.82);
        }
      }

      // Crisp specular liquid-glass rim
      const rim = (1 - smoothstep(0.0, 0.045, Math.abs(eggDist - 0.985))) * 0.82;
      if (rim > 0) {
        r = mix(r, 255, rim);
        g = mix(g, 255, rim);
        b = mix(b, 255, rim);
      }

      const idx = (y * size + x) * 4;
      rgba[idx] = Math.round(clamp(r, 0, 255));
      rgba[idx + 1] = Math.round(clamp(g, 0, 255));
      rgba[idx + 2] = Math.round(clamp(b, 0, 255));
      rgba[idx + 3] = 255;
    }
  }

  return encodePNG(size, size, rgba);
}

fs.mkdirSync(PUBLIC_DIR, { recursive: true });

const targets = [
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
  { file: 'pwa-192x192.png', size: 192, maskable: false },
  { file: 'pwa-512x512.png', size: 512, maskable: false },
  { file: 'pwa-maskable-512x512.png', size: 512, maskable: true },
];

for (const target of targets) {
  const png = renderIcon(target.size, { maskable: target.maskable });
  fs.writeFileSync(path.join(PUBLIC_DIR, target.file), png);
  console.log(`Generated public/${target.file} (${target.size}x${target.size})`);
}
