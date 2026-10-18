import type { Storage, StoredObject } from "./storage";

// A bucket in memory, for the tests of the API and of the worker. No test reaches a store.

export type TestStorage = Storage & {
  /** What a browser does with an upload target: puts a file under its key. */
  put(key: string, body: Uint8Array, contentType: string): void;
  /** The keys it holds, in no order. */
  keys(): string[];
  /** The upload targets it signed, each with the size it was signed for. */
  signed: { key: string; contentType: string; bytes: number }[];
};

export function testStorage(): TestStorage {
  const kept = new Map<string, { body: Uint8Array; contentType: string; etag: string }>();
  let written = 0;
  const etagOf = () => `"${(written += 1)}"`;
  const signed: TestStorage["signed"] = [];
  const stored = (key: string): StoredObject | null => {
    const found = kept.get(key);
    return found
      ? { bytes: found.body.byteLength, contentType: found.contentType, etag: found.etag }
      : null;
  };
  return {
    signed,
    put(key, body, contentType) {
      kept.set(key, { body, contentType, etag: etagOf() });
    },
    keys: () => [...kept.keys()],
    async uploadTarget(key, file, expiresInSeconds) {
      signed.push({ key, ...file });
      return {
        url: `https://storage.test/${key}?expires=${expiresInSeconds}`,
        headers: { "Content-Type": file.contentType },
      };
    },
    readUrl: async (key, signedAt, expiresInSeconds) =>
      `https://storage.test/${key}?signed=${signedAt.getTime()}&expires=${expiresInSeconds}`,
    head: async (key) => stored(key),
    async read(key, etag) {
      const found = kept.get(key);
      if (!found) throw new Error(`Nothing is kept under ${key}`);
      if (etag !== undefined && etag !== found.etag) throw new Error(`${key} changed`);
      const body = found.body;
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(body);
          controller.close();
        },
      });
    },
    async write(key, body, contentType) {
      kept.set(key, { body, contentType, etag: etagOf() });
    },
    async remove(keys) {
      for (const key of keys) kept.delete(key);
    },
  };
}
