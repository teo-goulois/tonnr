import { keptFor, payloadFor, privateKeyOf, signedToken } from "./apps";
import type { AppDevice, Outcome, Pusher } from "./index";
import { type Post, PUSH_MS, giveUpAfter, post } from "./request";

// How the instance sends a push to its app on an Android phone: decision 072. FCM's HTTP v1 API
// is asked with `node:https`, through the same request a browser's push takes, on a connection
// of its own that a push given up closes, and following no redirection. It takes a push from an
// account of the Firebase project the app is built with, by an access token that Google gives
// for an hour in exchange for a token that account signs with RS256. A push is a data message,
// with nothing for the system to show by itself: what it says, encrypted for the phone as for a
// browser, is its one field, and the app's own service opens it. There is no collapse key: Google
// would read it, and the phone shows a newer word in the older one's place by its tag. Nothing
// here is logged of a push but how it failed, and never the token.

/** What an instance sets to push to its Android app: the project and its service account. */
export type FcmSettings = {
  FCM_PROJECT_ID?: string | undefined;
  FCM_CLIENT_EMAIL?: string | undefined;
  FCM_PRIVATE_KEY?: string | undefined;
};

/** Where Google gives an access token for a token its service account signed. */
export const GOOGLE_TOKEN_ADDRESS = "https://oauth2.googleapis.com/token";
/** What the access token may do: send messages, and nothing else. */
export const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
/** Where a project's messages are sent. */
export const fcmAddressOf = (project: string) =>
  `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(project)}/messages:send`;

// An access token is asked for again five minutes before it ends.
const RENEWED_BEFORE_MS = 5 * 60 * 1000;
// What Google says is read this far: an access token, or why a push was not taken.
const TOKEN_READ_BYTES = 8192;
const READ_BYTES = 2048;
// A token as FCM writes it, which goes into the body of a request.
const TOKEN = /^[A-Za-z0-9_:-]{1,1024}$/;

// What Google says of a push it did not take: FCM's own code when it gives one, else the status
// of Google's API. Nothing else of its answer goes into the log.
function codeOf(body: string | undefined) {
  const word = (value: unknown) =>
    typeof value === "string" && /^[A-Z_]{1,64}$/.test(value) ? value : null;
  try {
    const said = JSON.parse(body ?? "") as {
      error?: { status?: unknown; details?: { errorCode?: unknown }[] };
    };
    const details = Array.isArray(said.error?.details) ? said.error.details : [];
    for (const detail of details) {
      const code = word(detail?.errorCode);
      if (code) return code;
    }
    return word(said.error?.status);
  } catch {
    return null;
  }
}

// An access token, from what Google answered: null when it is not one.
function accessOf(body: string | undefined) {
  try {
    const said = JSON.parse(body ?? "") as { access_token?: unknown; expires_in?: unknown };
    const { access_token: token, expires_in: seconds } = said;
    if (typeof token !== "string" || !/^[\x21-\x7e]{1,4096}$/.test(token)) return null;
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
    return { token, seconds };
  } catch {
    return null;
  }
}

/**
 * The pusher of an instance to its Android app, from its settings. Null when it sets none of
 * the three `FCM_*`: the instance then pushes to no Android phone. It throws on settings that
 * cannot be right, naming what is missing and nothing of the key, so that the worker does not
 * start with them. A test gives its own `post`, which asks no one.
 */
export function createFcmPusher(
  settings: FcmSettings,
  options: { post?: Post; sendMs?: number } = {},
): Pusher<AppDevice> | null {
  const { FCM_PROJECT_ID: project, FCM_CLIENT_EMAIL: email, FCM_PRIVATE_KEY: text } = settings;
  if (!project && !email && !text) return null;
  if (!project || !email || !text) {
    const missing = Object.entries({
      FCM_PROJECT_ID: project,
      FCM_CLIENT_EMAIL: email,
      FCM_PRIVATE_KEY: text,
    })
      .filter(([, value]) => !value)
      .map(([name]) => name);
    throw new Error(`Set ${missing.join(" and ")} to push to the Android app, or no FCM_ variable`);
  }
  const key = privateKeyOf("FCM_PRIVATE_KEY", text, "rsa");
  const give = options.post ?? post;
  const sendMs = options.sendMs ?? PUSH_MS;
  const sendAddress = new URL(fcmAddressOf(project));

  // The access token, until it is to be asked for again, and the request for one under way,
  // which pushes that leave together share.
  let access: { token: string; until: number } | null = null;
  let asking: Promise<string | { failure: string }> | null = null;
  const exchange = async (signal: AbortSignal): Promise<string | { failure: string }> => {
    const now = Date.now();
    const issuedAt = Math.floor(now / 1000);
    const assertion = signedToken(
      { alg: "RS256", typ: "JWT" },
      {
        iss: email,
        scope: FCM_SCOPE,
        aud: GOOGLE_TOKEN_ADDRESS,
        iat: issuedAt,
        exp: issuedAt + 3600,
      },
      key,
    );
    const answer = await give(
      new URL(GOOGLE_TOKEN_ADDRESS),
      { "content-type": "application/x-www-form-urlencoded" },
      Buffer.from(
        new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion,
        }).toString(),
      ),
      signal,
      TOKEN_READ_BYTES,
    );
    if ("failure" in answer) {
      return {
        failure: answer.failure === "given up" ? "no access token in time" : answer.failure,
      };
    }
    const given = answer.status === 200 ? accessOf(answer.body) : null;
    if (!given) return { failure: `no access token (status ${answer.status})` };
    access = { token: given.token, until: now + given.seconds * 1000 - RENEWED_BEFORE_MS };
    return given.token;
  };
  const accessToken = (signal: AbortSignal) => {
    const now = Date.now();
    if (access && now < access.until) return Promise.resolve(access.token);
    asking ??= exchange(signal).finally(() => {
      asking = null;
    });
    return asking;
  };

  // What is kept of a push that was not taken: the kind of failure, and never the token.
  const not = (outcome: "refused" | "failed", kind: string): Outcome => {
    console.error(`push: not taken (fcm ${kind})`);
    return outcome;
  };

  return {
    send: async (device, push, keepSeconds, until) => {
      try {
        if (until?.aborted) return not("refused", "no time left");
        if (!TOKEN.test(device.token)) return not("refused", "a token FCM did not give");
        if (!Number.isFinite(keepSeconds)) return not("refused", "no time to keep it for");
        // Google's limit is on the data of a message: its one field.
        const made = payloadFor(device, push, (sealed) =>
          Buffer.from(JSON.stringify({ encrypted: sealed })),
        );
        if ("refused" in made) return not("refused", made.refused);
        const message = {
          message: {
            token: device.token,
            data: { encrypted: made.sealed },
            android: {
              // The evening before may wait: the others are urgent, since an app whose
              // messages are delayed by a battery saver tells them late.
              priority: push.level === "passive" ? "NORMAL" : "HIGH",
              ttl: `${keptFor(keepSeconds)}s`,
            },
          },
        };
        // The access token and the push share the time a push is given.
        const signal = giveUpAfter(sendMs, until);
        const token = await accessToken(signal);
        // The push did not leave.
        if (typeof token !== "string") return not("refused", token.failure);
        const answer = await give(
          sendAddress,
          { authorization: `Bearer ${token}`, "content-type": "application/json" },
          Buffer.from(JSON.stringify(message)),
          signal,
          READ_BYTES,
        );
        if ("failure" in answer) {
          return not(
            "failed",
            answer.failure === "given up" ? "no answer in time" : answer.failure,
          );
        }
        const { status } = answer;
        if (status === 200) return "taken";
        const code = codeOf(answer.body);
        // The app was taken off the phone, or its token belongs to another project.
        if (code === "UNREGISTERED" || code === "SENDER_ID_MISMATCH") return "gone";
        // An access token Google no longer takes: another is asked for the next push.
        if (status === 401) access = null;
        return not(status >= 500 ? "failed" : "refused", code ?? `status ${status}`);
      } catch (error) {
        return not("failed", error instanceof Error ? error.name : "unknown");
      }
    },
  };
}
