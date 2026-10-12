// Unpacks what Blosc packed, as the Zarr stores of Copernicus Marine hold a piece of a grid: a
// header of sixteen bytes, then blocks that LZ4 packed, each cut in as many parts as a value has
// bytes when the bytes were shuffled. Only what those stores write is read: LZ4 or a plain
// copy, with or without the byte shuffle. Anything else is refused, and the caller goes without.
// The format is described in the README_HEADER of c-blosc, and LZ4's block in its own.

export class BloscError extends Error {}

const HEADER_BYTES = 16;
const SHUFFLED = 0x01;
const COPIED = 0x02;
const BIT_SHUFFLED = 0x04;
const NOT_SPLIT = 0x10;
const LZ4 = 1;
// A block is cut in parts only when a value has few bytes and each part is large enough.
const MAX_PARTS = 16;
const MIN_PART_BYTES = 128;

/** Unpacks one LZ4 block into exactly the bytes from `start` to `end` of `target`. */
function unpackLz4(
  source: Uint8Array,
  from: number,
  until: number,
  target: Uint8Array,
  start: number,
  end: number,
) {
  let read = from;
  let written = start;
  const length = (nibble: number) => {
    let total = nibble;
    if (nibble === 15) {
      for (;;) {
        if (read >= until) throw new BloscError("an LZ4 length runs past its block");
        const more = source[read++] ?? 0;
        total += more;
        if (more !== 255) break;
      }
    }
    return total;
  };

  while (read < until) {
    const token = source[read++] ?? 0;
    const literals = length(token >> 4);
    if (read + literals > until || written + literals > end) {
      throw new BloscError("LZ4 literals run past their block");
    }
    target.set(source.subarray(read, read + literals), written);
    read += literals;
    written += literals;
    // The last sequence of a block is literals alone.
    if (read >= until) break;

    if (read + 2 > until) throw new BloscError("an LZ4 offset runs past its block");
    const offset = (source[read] ?? 0) | ((source[read + 1] ?? 0) << 8);
    read += 2;
    const copied = length(token & 15) + 4;
    if (offset === 0 || offset > written - start || written + copied > end) {
      throw new BloscError("an LZ4 match points outside what was written");
    }
    // A match may overlap what it writes, so it is copied a byte at a time.
    for (let index = 0; index < copied; index += 1) {
      target[written + index] = target[written + index - offset] ?? 0;
    }
    written += copied;
  }
  if (written !== end) throw new BloscError("an LZ4 block is shorter than it says");
}

/**
 * The bytes a Blosc frame holds. `maxBytes` is the most they may be: a frame says its own size,
 * and one that says more is refused before anything is set aside for it.
 */
export function unblosc(frame: Uint8Array, maxBytes: number) {
  if (frame.byteLength < HEADER_BYTES) throw new BloscError("a frame shorter than its header");
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const flags = frame[2] ?? 0;
  const valueBytes = frame[3] ?? 0;
  const size = view.getUint32(4, true);
  const blockBytes = view.getUint32(8, true);
  const packedBytes = view.getUint32(12, true);
  if (frame[0] !== 2) throw new BloscError(`version ${frame[0]} of the format`);
  if (size > maxBytes) throw new BloscError(`a frame of ${size} bytes, over ${maxBytes}`);
  if (packedBytes !== frame.byteLength) throw new BloscError("a frame cut short or padded");
  if (flags & BIT_SHUFFLED) throw new BloscError("bits shuffled, which is not read");

  if (flags & COPIED) {
    if (HEADER_BYTES + size > frame.byteLength) throw new BloscError("a copy cut short");
    return frame.slice(HEADER_BYTES, HEADER_BYTES + size);
  }
  if (flags >> 5 !== LZ4) throw new BloscError(`compressor ${flags >> 5}, which is not read`);
  if (size === 0) return new Uint8Array(0);
  if (valueBytes === 0 || blockBytes === 0) throw new BloscError("a block of no size");

  const blocks = Math.ceil(size / blockBytes);
  if (HEADER_BYTES + blocks * 4 > frame.byteLength) throw new BloscError("block starts cut short");
  const packed = new Uint8Array(size);
  for (let block = 0; block < blocks; block += 1) {
    const start = block * blockBytes;
    const bytes = Math.min(blockBytes, size - start);
    const isLeftover = bytes !== blockBytes;
    const isSplit =
      !(flags & NOT_SPLIT) &&
      !isLeftover &&
      valueBytes <= MAX_PARTS &&
      blockBytes / valueBytes >= MIN_PART_BYTES;
    const parts = isSplit ? valueBytes : 1;
    const partBytes = bytes / parts;

    let read = view.getInt32(HEADER_BYTES + block * 4, true);
    for (let part = 0; part < parts; part += 1) {
      if (read < 0 || read + 4 > frame.byteLength) throw new BloscError("a part outside the frame");
      const packedPart = view.getInt32(read, true);
      read += 4;
      if (packedPart < 0 || read + packedPart > frame.byteLength) {
        throw new BloscError("a part that runs past the frame");
      }
      const at = start + part * partBytes;
      // A part that packing did not shorten is kept as it was.
      if (packedPart === partBytes) packed.set(frame.subarray(read, read + packedPart), at);
      else unpackLz4(frame, read, read + packedPart, packed, at, at + partBytes);
      read += packedPart;
    }
  }
  if (!(flags & SHUFFLED) || valueBytes === 1) return packed;

  // Shuffled, a block holds the first byte of each of its values, then the second, and so on.
  const plain = new Uint8Array(size);
  for (let start = 0; start < size; start += blockBytes) {
    const bytes = Math.min(blockBytes, size - start);
    const values = Math.floor(bytes / valueBytes);
    for (let byte = 0; byte < valueBytes; byte += 1) {
      const plane = start + byte * values;
      for (let value = 0; value < values; value += 1) {
        plain[start + value * valueBytes + byte] = packed[plane + value] ?? 0;
      }
    }
    // The bytes left after the last whole value were not shuffled.
    const whole = values * valueBytes;
    plain.set(packed.subarray(start + whole, start + bytes), start + whole);
  }
  return plain;
}
