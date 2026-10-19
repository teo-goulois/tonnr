import http from "node:http";
import https from "node:https";

// The request that gives a push to a push service. It is made here and not with `fetch`, which
// keeps connections for later and says nothing of what becomes of one: a push that is given up
// has its connection closed, so that nothing leaves after `send` has answered. Each request
// has a connection of its own, and no redirection is followed: an answer that names another
// address is an answer, and nothing is sent there.

/**
 * What the push service answered, or the kind of failure that kept it from answering. `body` is
 * what it said, as far as it was asked to be read: Google says why in the body (decision 072),
 * where a browser's push service says it in the status.
 */
export type Answer = { status: number; body?: string } | { failure: string };

/** How a push is given to a push service. A test gives its own, which asks no one. */
export type Post = (
  address: URL,
  headers: Record<string, string>,
  body: Uint8Array,
  // Gives the request up: its connection is closed.
  signal: AbortSignal,
  // How much of the answer's body is read, in bytes: none unless it is said.
  readBytes?: number,
) => Promise<Answer>;

// The kind of a failure, as the system names it: its message can hold the address.
export const kindOf = (error: unknown) => {
  const code = error instanceof Error && "code" in error ? error.code : undefined;
  return typeof code === "string" && /^[A-Z0-9_]+$/.test(code) ? code : "error";
};

export const post: Post = (address, headers, body, signal, readBytes = 0) =>
  new Promise((resolve) => {
    if (signal.aborted) return resolve({ failure: "given up" });
    const request = (address.protocol === "https:" ? https : http).request(address.href, {
      method: "POST",
      headers: { ...headers, "content-length": String(body.length) },
      // A connection for this request alone, which ends with it.
      agent: false,
    });
    // Whatever the answer, the request is over and its connection is closed: what was not
    // sent by then is not sent, and what the push service goes on saying is not read.
    let isAnswered = false;
    const answer = (given: Answer) => {
      if (isAnswered) return;
      isAnswered = true;
      signal.removeEventListener("abort", giveUp);
      request.destroy();
      resolve(given);
    };
    const giveUp = () => answer({ failure: "given up" });
    signal.addEventListener("abort", giveUp, { once: true });
    request.once("response", (response) => {
      response.on("error", () => {});
      const status = response.statusCode ?? 0;
      if (readBytes <= 0) return answer({ status });
      // What it says is read until it ends, or as far as was asked and no further, within the
      // time the push is given.
      const chunks: Buffer[] = [];
      let read = 0;
      const said = () => Buffer.concat(chunks).subarray(0, readBytes).toString("utf8");
      response.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        read += chunk.length;
        if (read >= readBytes) answer({ status, body: said() });
      });
      response.on("end", () => answer({ status, body: said() }));
      response.on("close", () => answer({ status, body: said() }));
    });
    // Listened to until the end: closing a request that was not answered is told as an error.
    request.on("error", (error) => answer({ failure: kindOf(error) }));
    request.end(body);
  });
