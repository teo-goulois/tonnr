import { Files } from "files-sdk";
import { r2 } from "files-sdk/r2";

// Where the photos and the videos of an instance are kept: a bucket of Cloudflare R2, through
// files-sdk, so that another store takes its place by changing the adapter here. Decision 066.

/** What an instance says of its bucket. All four are set, or none: then it keeps no media. */
export type MediaSettings = {
  MEDIA_BUCKET?: string | undefined;
  R2_ACCOUNT_ID?: string | undefined;
  R2_ACCESS_KEY_ID?: string | undefined;
  R2_SECRET_ACCESS_KEY?: string | undefined;
  // Another address than R2's for the same API, such as a MinIO run for development. The
  // account's id is then not read.
  MEDIA_ENDPOINT?: string | undefined;
};

/** Where a browser sends one file: a PUT to `url`, with these headers and no others. */
export type UploadTarget = { url: string; headers: Record<string, string> };

/** What a bucket says of a file it holds. */
export type StoredObject = { bytes: number; contentType: string; etag: string | null };

/** The bucket, as the API and the worker use it. Keys are made by the program, never given. */
export type Storage = {
  /**
   * An address that takes one upload of this type and this size until it expires. The size is
   * bound into the signature, so that a file of another size is refused by the bucket itself.
   */
  uploadTarget(
    key: string,
    file: { contentType: string; bytes: number },
    expiresInSeconds: number,
  ): Promise<UploadTarget>;
  /**
   * An address that reads a file, signed as of `signedAt` and good for `expiresInSeconds` after
   * it. The same moment gives the same address, which a browser then keeps in its cache.
   */
  readUrl(key: string, signedAt: Date, expiresInSeconds: number): Promise<string>;
  /** What the bucket holds under a key, or null when it holds nothing there. */
  head(key: string): Promise<StoredObject | null>;
  /**
   * A file's bytes, as they come. With `etag`, only the file that had it: one put again under
   * the same key since is refused.
   */
  read(key: string, etag?: string): Promise<ReadableStream<Uint8Array>>;
  write(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** Deletes what is under these keys. A key under which nothing is kept is no fault. */
  remove(keys: readonly string[]): Promise<void>;
};

// What aws4fetch's client does, the one files-sdk's R2 adapter signs with through fetch.
type Signer = {
  sign(
    input: string,
    init: {
      method: string;
      headers?: Record<string, string>;
      aws: { allHeaders: boolean; signQuery: boolean; datetime?: string };
    },
  ): Promise<Request>;
};

/** The bucket the settings name, or null when they name none. */
export function createStorage(settings: MediaSettings): Storage | null {
  const bucket = settings.MEDIA_BUCKET;
  const accountId = settings.R2_ACCOUNT_ID;
  const accessKeyId = settings.R2_ACCESS_KEY_ID;
  const secretAccessKey = settings.R2_SECRET_ACCESS_KEY;
  const endpoint = settings.MEDIA_ENDPOINT || undefined;
  const given = [bucket, accessKeyId, secretAccessKey, endpoint ? "endpoint" : accountId];
  if (given.every((value) => !value)) return null;
  if (!bucket || !accessKeyId || !secretAccessKey || (!accountId && !endpoint)) {
    throw new Error(
      "Set MEDIA_BUCKET, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY together, or none of them",
    );
  }

  const files = new Files({
    adapter: r2({
      bucket,
      ...(endpoint ? { endpoint } : { accountId }),
      accessKeyId,
      secretAccessKey,
      // Signed requests through fetch: no SDK of Amazon's in the images.
      client: "fetch",
    }),
  });
  // The fetch client's own signer, which files-sdk hands out as its escape hatch.
  const signer = files.raw as unknown as Signer;
  if (typeof signer.sign !== "function") throw new Error("files-sdk gave no signer for R2");
  const base = `${(endpoint ?? `https://${accountId}.r2.cloudflarestorage.com`).replace(/\/+$/, "")}/${encodeURIComponent(bucket)}`;
  const objectUrl = (key: string) => `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;

  return {
    async uploadTarget(key, file, expiresInSeconds) {
      // files-sdk binds the type and not the size, which R2 cannot cap in a form. Its own client
      // signs the request here with both headers, which a browser sends as they are.
      const headers = { "content-type": file.contentType, "content-length": String(file.bytes) };
      const url = new URL(objectUrl(key));
      url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
      const signed = await signer.sign(url.toString(), {
        method: "PUT",
        headers,
        aws: { allHeaders: true, signQuery: true },
      });
      // The browser sets the length itself, from the file: only the type is its to send.
      return { url: signed.url, headers: { "Content-Type": file.contentType } };
    },
    async readUrl(key, signedAt, expiresInSeconds) {
      const url = new URL(objectUrl(key));
      url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
      const signed = await signer.sign(url.toString(), {
        method: "GET",
        aws: {
          allHeaders: true,
          signQuery: true,
          datetime: signedAt.toISOString().replace(/[:-]|\.\d{3}/g, ""),
        },
      });
      return signed.url;
    },
    async head(key) {
      if (!(await files.exists(key))) return null;
      const info = await files.head(key);
      return { bytes: info.size, contentType: info.contentType, etag: info.etag ?? null };
    },
    async read(key, etag) {
      // The fetch client reads no condition: the answer names the file it holds, which is
      // compared before a byte of it is read.
      const file = await files.download(key, { as: "stream" });
      if (etag !== undefined && file.etag !== etag) {
        await file.stream().cancel();
        throw new Error(`${key} is not the file that was sent`);
      }
      return file.stream();
    },
    async write(key, body, contentType) {
      await files.upload(key, body, { contentType });
    },
    async remove(keys) {
      if (keys.length === 0) return;
      // A bulk delete resolves whatever the bucket refused: what it refused is a failure here,
      // so that the trash keeps the keys and tries again.
      const deleted = await files.delete([...keys]);
      if (deleted.errors && deleted.errors.length > 0) {
        throw new Error(`The bucket kept ${deleted.errors.length} of ${keys.length} files`);
      }
    },
  };
}
