import { describe, expect, it } from "vitest";

import { BloscError, unblosc } from "./blosc";

const bytesOf = (base64: string) => new Uint8Array(Buffer.from(base64, "base64"));
const int16 = (bytes: Uint8Array) =>
  Array.from(new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2));

// Packed by the Blosc of numcodecs, as a Zarr store packs a piece: LZ4, level 5.
// 400 values of 16 bits, 0, 0, 0, 1, 1, 1, … with their bytes shuffled, in one block of two parts.
const SHUFFLED =
  "AgEhAiADAAAgAwAAuAEAABQAAACQAQAAAAAAAQEBAgICAwMDBAQEBQUFBgYGBwcHCAgICQkJCgoKCwsLDAwMDQ0NDg4ODw8PEBAQEREREhISExMTFBQUFRUVFhYWFxcXGBgYGRkZGhoaGxsbHBwcHR0dHh4eHx8fICAgISEhIiIiIyMjJCQkJSUlJiYmJycnKCgoKSkpKioqKysrLCwsLS0tLi4uLy8vMDAwMTExMjIyMzMzNDQ0NTU1NjY2Nzc3ODg4OTk5Ojo6Ozs7PDw8PT09Pj4+Pz8/QEBAQUFBQkJCQ0NDRERERUVFRkZGR0dHSEhISUlJSkpKS0tLTExMTU1NTk5OT09PUFBQUVFRUlJSU1NTVFRUVVVVVlZWV1dXWFhYWVlZWlpaW1tbXFxcXV1dXl5eX19fYGBgYWFhYmJiY2NjZGRkZWVlZmZmZ2dnaGhoaWlpampqa2trbGxsbW1tbm5ub29vcHBwcXFxcnJyc3NzdHR0dXV1dnZ2d3d3eHh4eXl5enp6e3t7fHx8fX19fn5+f39/gICAgYGBgoKCg4ODhISEhQwAAAAfAAEA/3hQAAAAAAA=";
// 300 values, 0 to 49 six times over, not shuffled: LZ4 copies the first run five times.
const REPEATED =
  "AgEgAlgCAABYAgAA+gAAABQAAABvAAAA/1UAAAEAAgADAAQABQAGAAcACAAJAAoACwAMAA0ADgAPABAAEQASABMAFAAVABYAFwAYABkAGgAbABwAHQAeAB8AIAAhACIAIwAkACUAJgAnACgAKQAqACsALAAtAC4ALwAwADEAZACwUAAwADEAbwAAAP9VAAABAAIAAwAEAAUABgAHAAgACQAKAAsADAANAA4ADwAQABEAEgATABQAFQAWABcAGAAZABoAGwAcAB0AHgAfACAAIQAiACMAJAAlACYAJwAoACkAKgArACwALQAuAC8AMAAxAGQAsFAAMAAxAA==";
// The values 1, 2 and 3: too few to pack, so they are kept as they are.
const COPIED = "AgEzAgYAAAAGAAAAFgAAAAEAAgADAA==";

/**
 * A frame of shuffled 16-bit values in blocks of a chosen size, each part kept as it is: what
 * Blosc writes when packing shortens nothing. A whole block is cut in two parts, the low bytes
 * then the high ones, and the block left at the end is not.
 */
function storedFrame(values: number[], blockBytes: number) {
  const plain = new Uint8Array(new Int16Array(values).buffer);
  const blocks = Math.ceil(plain.byteLength / blockBytes);
  const body: number[] = [];
  const starts: number[] = [];
  const size = (bytes: number) => [bytes & 255, (bytes >> 8) & 255, 0, 0];
  for (let block = 0; block < blocks; block += 1) {
    starts.push(16 + blocks * 4 + body.length);
    const part = plain.subarray(block * blockBytes, (block + 1) * blockBytes);
    const count = part.byteLength / 2;
    const low = Array.from({ length: count }, (_, index) => part[index * 2] ?? 0);
    const high = Array.from({ length: count }, (_, index) => part[index * 2 + 1] ?? 0);
    if (part.byteLength === blockBytes) body.push(...size(count), ...low, ...size(count), ...high);
    else body.push(...size(part.byteLength), ...low, ...high);
  }
  const frame = new Uint8Array(16 + blocks * 4 + body.length);
  const view = new DataView(frame.buffer);
  frame.set([2, 1, 0x21, 2]);
  view.setUint32(4, plain.byteLength, true);
  view.setUint32(8, blockBytes, true);
  view.setUint32(12, frame.byteLength, true);
  starts.forEach((start, block) => view.setInt32(16 + block * 4, start, true));
  frame.set(body, 16 + blocks * 4);
  return frame;
}

describe("unblosc", () => {
  it("unpacks a block that LZ4 packed in two parts, and puts the bytes back in order", () => {
    const values = int16(unblosc(bytesOf(SHUFFLED), 1000));

    expect(values).toEqual(Array.from({ length: 400 }, (_, index) => Math.floor(index / 3)));
  });

  it("unpacks a block whose bytes were not shuffled, with a match that repeats", () => {
    const values = int16(unblosc(bytesOf(REPEATED), 1000));

    expect(values).toEqual(Array.from({ length: 300 }, (_, index) => index % 50));
  });

  it("reads what was kept as it was", () => {
    expect(int16(unblosc(bytesOf(COPIED), 1000))).toEqual([1, 2, 3]);
  });

  it("reads several blocks, the last one shorter and in one part", () => {
    // Two blocks of 512 bytes and one of 200, with values that use both bytes.
    const values = Array.from({ length: 612 }, (_, index) => index * 37 - 9000);

    expect(int16(unblosc(storedFrame(values, 512), 5000))).toEqual(values);
  });

  it("refuses a frame that says it holds more than it may", () => {
    expect(() => unblosc(bytesOf(SHUFFLED), 799)).toThrow(BloscError);
  });

  it("refuses a frame that was cut short, and one that is not Blosc's", () => {
    const frame = bytesOf(SHUFFLED);

    expect(() => unblosc(frame.subarray(0, frame.byteLength - 1), 1000)).toThrow(BloscError);
    expect(() => unblosc(new Uint8Array(8), 1000)).toThrow(BloscError);
    expect(() => unblosc(new Uint8Array(32).fill(7), 1000)).toThrow(BloscError);
  });

  it("refuses a match that points before what was written, without reading outside", () => {
    const frame = bytesOf(REPEATED);
    // The first match of the block copies from 100 bytes back: make it 60,000.
    const at = frame.indexOf(0x64, 16);
    frame[at] = 0x60;
    frame[at + 1] = 0xea;

    expect(() => unblosc(frame, 1000)).toThrow(BloscError);
  });

  it("refuses a compressor it does not read", () => {
    const frame = bytesOf(SHUFFLED);
    // Zstandard, in the three high bits of the flags.
    frame[2] = (4 << 5) | 1;

    expect(() => unblosc(frame, 1000)).toThrow(/compressor 4/);
  });
});
