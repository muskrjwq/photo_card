export const XFEAT_SIZE = 512;
export const XFEAT_DESCRIPTOR_SIZE = 64;
export const XFEAT_GLOBAL_GRID = 4;
export const XFEAT_GLOBAL_SIZE = XFEAT_DESCRIPTOR_SIZE * XFEAT_GLOBAL_GRID * XFEAT_GLOBAL_GRID;

function at(data, channels, height, width, channel, y, x) {
  return data[((channel * height + y) * width) + x];
}

function bilinearNchw(data, channels, height, width, channel, imageX, imageY) {
  const gx = imageX * width / (XFEAT_SIZE - 1) - 0.5;
  const gy = imageY * height / (XFEAT_SIZE - 1) - 0.5;
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(gx)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(gy)));
  const x1 = Math.max(0, Math.min(width - 1, x0 + 1));
  const y1 = Math.max(0, Math.min(height - 1, y0 + 1));
  const tx = Math.max(0, Math.min(1, gx - Math.floor(gx)));
  const ty = Math.max(0, Math.min(1, gy - Math.floor(gy)));
  const top = at(data, channels, height, width, channel, y0, x0) * (1 - tx) + at(data, channels, height, width, channel, y0, x1) * tx;
  const bottom = at(data, channels, height, width, channel, y1, x0) * (1 - tx) + at(data, channels, height, width, channel, y1, x1) * tx;
  return top * (1 - ty) + bottom * ty;
}

export function extractXFeat(outputs, topK = 256) {
  const descriptorMap = outputs.output;
  const keypointLogits = outputs['1211'];
  const reliability = outputs['268'];
  if (!descriptorMap || !keypointLogits || !reliability) throw new Error('Unexpected XFeat model outputs');

  const map = descriptorMap.data;
  const logits = keypointLogits.data;
  const rel = reliability.data;
  const gridHeight = descriptorMap.dims[2];
  const gridWidth = descriptorMap.dims[3];
  const heatmap = new Float32Array(XFEAT_SIZE * XFEAT_SIZE);

  for (let gy = 0; gy < gridHeight; gy += 1) {
    for (let gx = 0; gx < gridWidth; gx += 1) {
      let max = -Infinity;
      for (let channel = 0; channel < 65; channel += 1) max = Math.max(max, at(logits, 65, gridHeight, gridWidth, channel, gy, gx));
      let sum = 0;
      for (let channel = 0; channel < 65; channel += 1) sum += Math.exp(at(logits, 65, gridHeight, gridWidth, channel, gy, gx) - max);
      for (let channel = 0; channel < 64; channel += 1) {
        const x = gx * 8 + channel % 8;
        const y = gy * 8 + Math.floor(channel / 8);
        heatmap[y * XFEAT_SIZE + x] = Math.exp(at(logits, 65, gridHeight, gridWidth, channel, gy, gx) - max) / sum;
      }
    }
  }

  const candidates = [];
  for (let y = 2; y < XFEAT_SIZE - 2; y += 1) {
    for (let x = 2; x < XFEAT_SIZE - 2; x += 1) {
      const value = heatmap[y * XFEAT_SIZE + x];
      if (value <= 0.05) continue;
      let localMaximum = true;
      for (let dy = -2; localMaximum && dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
        if ((dx || dy) && heatmap[(y + dy) * XFEAT_SIZE + x + dx] > value) { localMaximum = false; break; }
      }
      if (localMaximum) candidates.push({ x, y, score: value * bilinearNchw(rel, 1, gridHeight, gridWidth, 0, x, y) });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const selected = candidates.slice(0, topK);
  const points = new Uint16Array(selected.length * 2);
  const descriptors = new Float32Array(selected.length * XFEAT_DESCRIPTOR_SIZE);

  for (let index = 0; index < selected.length; index += 1) {
    const point = selected[index];
    points[index * 2] = point.x; points[index * 2 + 1] = point.y;
    let norm = 0;
    for (let channel = 0; channel < XFEAT_DESCRIPTOR_SIZE; channel += 1) {
      const value = bilinearNchw(map, XFEAT_DESCRIPTOR_SIZE, gridHeight, gridWidth, channel, point.x, point.y);
      descriptors[index * XFEAT_DESCRIPTOR_SIZE + channel] = value; norm += value * value;
    }
    norm = Math.sqrt(Math.max(norm, 1e-12));
    for (let channel = 0; channel < XFEAT_DESCRIPTOR_SIZE; channel += 1) descriptors[index * XFEAT_DESCRIPTOR_SIZE + channel] /= norm;
  }

  const global = new Float32Array(XFEAT_GLOBAL_SIZE);
  for (let regionY = 0; regionY < XFEAT_GLOBAL_GRID; regionY += 1) for (let regionX = 0; regionX < XFEAT_GLOBAL_GRID; regionX += 1) {
    const offset = (regionY * XFEAT_GLOBAL_GRID + regionX) * XFEAT_DESCRIPTOR_SIZE; let norm = 0;
    const y0 = Math.floor(regionY * gridHeight / XFEAT_GLOBAL_GRID), y1 = Math.floor((regionY + 1) * gridHeight / XFEAT_GLOBAL_GRID);
    const x0 = Math.floor(regionX * gridWidth / XFEAT_GLOBAL_GRID), x1 = Math.floor((regionX + 1) * gridWidth / XFEAT_GLOBAL_GRID);
    for (let channel = 0; channel < XFEAT_DESCRIPTOR_SIZE; channel += 1) {
      let sum = 0;
      for (let gy = y0; gy < y1; gy += 1) for (let gx = x0; gx < x1; gx += 1) sum += at(map, XFEAT_DESCRIPTOR_SIZE, gridHeight, gridWidth, channel, gy, gx) * Math.max(0, at(rel, 1, gridHeight, gridWidth, 0, gy, gx));
      global[offset + channel] = sum; norm += sum * sum;
    }
    norm = Math.sqrt(Math.max(norm, 1e-12)) * Math.sqrt(XFEAT_GLOBAL_GRID * XFEAT_GLOBAL_GRID);
    for (let channel = 0; channel < XFEAT_DESCRIPTOR_SIZE; channel += 1) global[offset + channel] /= norm;
  }
  return { points, descriptors, global, count: selected.length };
}

export function quantizeDescriptor(values) {
  const result = new Int8Array(values.length);
  for (let index = 0; index < values.length; index += 1) result[index] = Math.max(-127, Math.min(127, Math.round(values[index] * 127)));
  return result;
}

