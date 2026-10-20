// The bucket of the updates through R2's S3 API, which is how the release commands write it
// from Téo's Mac: requests signed by AWS's Signature Version 4 with `node:crypto`, and no SDK.
// The token is an R2 token limited to that bucket, with "Object Read & Write". Decision 075.
import { createHash, createHmac } from "node:crypto";

export type R2Access = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export type Signable = {
  method: string;
  url: URL;
  /** The headers to sign, besides `host`, `x-amz-date` and `x-amz-content-sha256`. */
  headers: Record<string, string>;
  payloadHash: string;
  /** As `x-amz-date` writes it: 20261020T120000Z. */
  amzDate: string;
};

const sha256Hex = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");
const hmac = (key: Uint8Array | string, data: string) =>
  createHmac("sha256", key).update(data).digest();

/** A part of a path or a query, written as S3 reads it: RFC 3986, with nothing else left as is. */
const encodeS3 = (text: string) =>
  encodeURIComponent(text).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

export const amzDateOf = (date: Date) => date.toISOString().replace(/[-:]|\.\d{3}/g, "");

/**
 * The headers that sign a request: `x-amz-date`, `x-amz-content-sha256` and the `Authorization`
 * that Signature Version 4 computes over the method, the path, the query, the headers and the
 * hash of the body, for the region and the service given.
 */
export function signedHeaders(
  request: Signable,
  credentials: { accessKeyId: string; secretAccessKey: string },
  region = "auto",
  service = "s3",
): Record<string, string> {
  const headers: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(request.headers).map(([name, value]) => [name.toLowerCase(), value]),
    ),
    host: request.url.host,
    "x-amz-date": request.amzDate,
    "x-amz-content-sha256": request.payloadHash,
  };
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names
    .map((name) => `${name}:${(headers[name] ?? "").trim().replace(/\s+/g, " ")}\n`)
    .join("");
  const path = request.url.pathname
    .split("/")
    .map((segment) => encodeS3(decodeURIComponent(segment)))
    .join("/");
  const query = [...request.url.searchParams]
    .map(([name, value]) => [encodeS3(name), encodeS3(value)] as const)
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1))
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
  const canonicalRequest = [
    request.method,
    path,
    query,
    canonicalHeaders,
    names.join(";"),
    request.payloadHash,
  ].join("\n");

  const day = request.amzDate.slice(0, 8);
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", request.amzDate, scope, sha256Hex(canonicalRequest)].join(
    "\n",
  );
  const key = hmac(
    hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`, day), region), service),
    "aws4_request",
  );
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  return {
    ...headers,
    authorization:
      `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, ` +
      `SignedHeaders=${names.join(";")}, Signature=${signature}`,
  };
}

export type Written = {
  contentType: string;
  cacheControl?: string;
  /** Kept as `x-amz-meta-<name>`, which the Worker's binding reads as `customMetadata`. */
  metadata?: Record<string, string>;
};

export type R2Client = ReturnType<typeof r2Client>;

/** What the release commands do with the bucket: read an object, ask whether one is there, write one. */
export function r2Client(access: R2Access, fetcher: typeof fetch = fetch, now = () => new Date()) {
  const urlOf = (key: string) =>
    new URL(
      `https://${access.accountId}.r2.cloudflarestorage.com/${access.bucket}/` +
        key.split("/").map(encodeS3).join("/"),
    );
  const send = (method: string, key: string, body?: Uint8Array, headers = {}) => {
    const url = urlOf(key);
    const signed = signedHeaders(
      {
        method,
        url,
        headers,
        payloadHash: sha256Hex(body ?? ""),
        amzDate: amzDateOf(now()),
      },
      access,
    );
    // `host` is the address's own, which fetch writes.
    delete signed.host;
    return fetcher(url, { method, headers: signed, body });
  };
  const refused = async (what: string, key: string, response: Response) =>
    new Error(`R2 refused to ${what} ${key}: ${response.status} ${await response.text()}`);

  return {
    /**
     * Why the token cannot read the bucket, or null when it can: R2 answers a key that is not
     * there with 404, and a token that is wrong or limited to another bucket with 401 or 403, or a
     * bucket that is not there with NoSuchBucket. Whether the token may write is seen at the first
     * write.
     */
    async refusal(key: string): Promise<string | null> {
      const response = await send("GET", key);
      if (response.ok) return null;
      const text = await response.text();
      if (response.status === 404 && !text.includes("NoSuchBucket")) return null;
      return `${response.status} ${text.slice(0, 300)}`;
    },
    /** Whether an object is there. */
    async has(key: string): Promise<boolean> {
      const response = await send("HEAD", key);
      if (response.status === 404) return false;
      if (!response.ok) throw await refused("read", key, response);
      return true;
    },
    /** An object's bytes, or null when there is none. */
    async get(key: string): Promise<Uint8Array | null> {
      const response = await send("GET", key);
      if (response.status === 404) return null;
      if (!response.ok) throw await refused("read", key, response);
      return new Uint8Array(await response.arrayBuffer());
    },
    async put(key: string, body: Uint8Array, written: Written): Promise<void> {
      const headers: Record<string, string> = { "content-type": written.contentType };
      if (written.cacheControl) headers["cache-control"] = written.cacheControl;
      for (const [name, value] of Object.entries(written.metadata ?? {})) {
        headers[`x-amz-meta-${name}`] = value;
      }
      const response = await send("PUT", key, body, headers);
      if (!response.ok) throw await refused("write", key, response);
    },
  };
}
