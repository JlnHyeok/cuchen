import zlib from "node:zlib";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
]);

const CRC_TABLE = buildCrcTable();

export function createFixturePng(index, options = {}) {
  const targetBytes = normalizeTargetBytes(options.imageBytes, options.imageMegabytes);
  const dimensions = targetBytes ? deriveDimensions(targetBytes) : {
    width: options.width ?? 64,
    height: options.height ?? 64
  };
  const compressionLevel = targetBytes ? 0 : options.compressionLevel ?? 6;
  const { width, height } = dimensions;
  const bytesPerPixel = 3;
  const scanlineLength = width * bytesPerPixel + 1;
  const raw = Buffer.alloc(scanlineLength * height);
  const seedBase = (index * 1103515245 + 12345) >>> 0;
  let state = seedBase || 1;
  const nextRandomByte = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state & 0xff;
  };

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * scanlineLength;
    raw[rowStart] = 0;

    for (let x = 0; x < width; x += 1) {
      const pixelStart = rowStart + 1 + x * bytesPerPixel;
      raw[pixelStart] = nextRandomByte();
      raw[pixelStart + 1] = nextRandomByte();
      raw[pixelStart + 2] = nextRandomByte();
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw, { level: compressionLevel });
  const chunks = [
    createChunk("IHDR", ihdr),
    createChunk("IDAT", compressed),
    createChunk("IEND", Buffer.alloc(0))
  ];

  return Buffer.concat([PNG_SIGNATURE, ...chunks]);
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
}

function normalizeTargetBytes(imageBytes, imageMegabytes) {
  if (imageBytes !== undefined && imageBytes !== null && imageBytes !== false && imageBytes !== "") {
    const parsedBytes = Number(imageBytes);
    if (Number.isFinite(parsedBytes) && parsedBytes > 0) {
      return Math.round(parsedBytes);
    }
  }

  if (imageMegabytes !== undefined && imageMegabytes !== null && imageMegabytes !== false && imageMegabytes !== "") {
    const parsedMegabytes = Number(imageMegabytes);
    if (Number.isFinite(parsedMegabytes) && parsedMegabytes > 0) {
      return Math.round(parsedMegabytes * 1024 * 1024);
    }
  }

  return null;
}

function deriveDimensions(targetBytes) {
  const pixels = Math.max(1, Math.ceil(targetBytes / 3));
  const side = Math.max(64, Math.ceil(Math.sqrt(pixels)));
  const width = side;
  const height = Math.max(64, Math.ceil(pixels / side));
  return { width, height };
}
