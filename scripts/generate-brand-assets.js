const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "..");
const assets = path.join(root, "assets");

const HIGH_RETENTION_COLOR = [11, 61, 107];
const LOW_RETENTION_COLOR = [207, 227, 245];
const FUTURE_COLOR = [233, 238, 243];
const FUTURE_HATCH_COLOR = [216, 224, 233];
const SEPARATOR_COLOR = [255, 255, 255];
const LOGO_BACKGROUND_COLOR = [244, 247, 250];
const LOGO_BORDER_COLOR = [201, 214, 226];

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value;
  }
  return table;
})();

function crc32(bytes) {
  let crc = -1;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = crcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  const typeAndBody = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndBody), 0);
  return Buffer.concat([length, typeAndBody, crc]);
}

class Canvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.pixels = Buffer.alloc(width * height * 4);
  }

  set(x, y, color, alpha = 255) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const offset = (y * this.width + x) * 4;
    this.pixels[offset] = color[0];
    this.pixels[offset + 1] = color[1];
    this.pixels[offset + 2] = color[2];
    this.pixels[offset + 3] = alpha;
  }

  fillRect(x, y, width, height, color, alpha = 255) {
    for (let row = y; row < y + height; row += 1) {
      for (let column = x; column < x + width; column += 1) {
        this.set(column, row, color, alpha);
      }
    }
  }

  fillRoundedRect(x, y, width, height, radius, color, alpha = 255) {
    const limit = radius * radius;
    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        const insetX = Math.min(column, width - 1 - column);
        const insetY = Math.min(row, height - 1 - row);
        if (insetX < radius && insetY < radius) {
          const dx = radius - 0.5 - insetX;
          const dy = radius - 0.5 - insetY;
          if (dx * dx + dy * dy > limit) continue;
        }
        this.set(x + column, y + row, color, alpha);
      }
    }
  }

  strokeRect(x, y, width, height, thickness, color) {
    for (let offset = 0; offset < thickness; offset += 1) {
      for (let column = x + offset; column < x + width - offset; column += 1) {
        this.set(column, y + offset, color);
        this.set(column, y + height - 1 - offset, color);
      }
      for (let row = y + offset; row < y + height - offset; row += 1) {
        this.set(x + offset, row, color);
        this.set(x + width - 1 - offset, row, color);
      }
    }
  }

  toPng() {
    const stride = this.width * 4;
    const raw = Buffer.alloc((stride + 1) * this.height);
    for (let row = 0; row < this.height; row += 1) {
      raw[row * (stride + 1)] = 0;
      this.pixels.copy(raw, row * (stride + 1) + 1, row * stride, row * stride + stride);
    }

    const header = Buffer.alloc(13);
    header.writeUInt32BE(this.width, 0);
    header.writeUInt32BE(this.height, 4);
    header[8] = 8;
    header[9] = 6;
    header[10] = 0;
    header[11] = 0;
    header[12] = 0;

    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0))
    ]);
  }
}

function retentionColor(rate) {
  return [0, 1, 2].map((channel) =>
    Math.round(
      LOW_RETENTION_COLOR[channel] +
        (HIGH_RETENTION_COLOR[channel] - LOW_RETENTION_COLOR[channel]) * rate
    )
  );
}

function retentionRate(baseline, cohortIndex, periodIndex) {
  if (periodIndex === 0) return 1;
  return Math.min(1, baseline[periodIndex] * (1 + 0.03 * cohortIndex));
}

function isObserved(cohortIndex, periodIndex, size) {
  return periodIndex <= size - 1 - cohortIndex;
}

function drawIcon() {
  const size = 20;
  const grid = 4;
  const pitch = size / grid;
  const baseline = [1, 0.58, 0.44, 0.36];
  const canvas = new Canvas(size, size);

  for (let cohort = 0; cohort < grid; cohort += 1) {
    for (let period = 0; period < grid; period += 1) {
      const x = period * pitch;
      const y = cohort * pitch;
      if (isObserved(cohort, period, grid)) {
        canvas.fillRect(x, y, pitch, pitch, retentionColor(retentionRate(baseline, cohort, period)));
      } else {
        canvas.fillRect(x, y, pitch, pitch, FUTURE_COLOR);
        for (let row = 0; row < pitch; row += 1) {
          for (let column = 0; column < pitch; column += 1) {
            if ((column + row) % 3 === 0) canvas.set(x + column, y + row, FUTURE_HATCH_COLOR);
          }
        }
      }
    }
  }

  for (let line = 1; line < grid; line += 1) {
    for (let index = 0; index < size; index += 1) {
      canvas.set(line * pitch, index, SEPARATOR_COLOR);
      canvas.set(index, line * pitch, SEPARATOR_COLOR);
    }
  }

  return canvas.toPng();
}

function drawPartnerCenterLogo() {
  const size = 300;
  const grid = 6;
  const cell = 30;
  const gap = 6;
  const content = grid * cell + (grid - 1) * gap;
  const inset = (size - content) / 2;
  const baseline = [1, 0.62, 0.47, 0.39, 0.34, 0.3];
  const canvas = new Canvas(size, size);

  canvas.fillRect(0, 0, size, size, LOGO_BACKGROUND_COLOR);
  canvas.strokeRect(0, 0, size, size, 3, LOGO_BORDER_COLOR);

  for (let cohort = 0; cohort < grid; cohort += 1) {
    for (let period = 0; period < grid; period += 1) {
      const x = inset + period * (cell + gap);
      const y = inset + cohort * (cell + gap);
      if (isObserved(cohort, period, grid)) {
        canvas.fillRoundedRect(
          x,
          y,
          cell,
          cell,
          6,
          retentionColor(retentionRate(baseline, cohort, period))
        );
      } else {
        canvas.fillRoundedRect(x, y, cell, cell, 6, FUTURE_COLOR);
        for (let row = 0; row < cell; row += 1) {
          for (let column = 0; column < cell; column += 1) {
            if ((column + row) % 7 >= 5) {
              const insetX = Math.min(column, cell - 1 - column);
              const insetY = Math.min(row, cell - 1 - row);
              if (insetX < 6 && insetY < 6) {
                const dx = 5.5 - insetX;
                const dy = 5.5 - insetY;
                if (dx * dx + dy * dy > 36) continue;
              }
              canvas.set(x + column, y + row, FUTURE_HATCH_COLOR);
            }
          }
        }
      }
    }
  }

  return canvas.toPng();
}

function write(relativePath, bytes) {
  const target = path.join(assets, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
  console.log(`Wrote assets/${relativePath} (${bytes.length} bytes)`);
}

fs.mkdirSync(assets, { recursive: true });
write("icon.png", drawIcon());
write("partner-center-logo-300.png", drawPartnerCenterLogo());
