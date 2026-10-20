import http2 from "node:http2";

import { type ActivityPush, activityPayload } from "./activities";
import {
  APP_PAYLOAD_BYTES,
  STAND_IN,
  collapseIdOf,
  keptFor,
  payloadFor,
  privateKeyOf,
  signedToken,
} from "./apps";
import type { AppDevice, Outcome, Pusher } from "./index";
import { kindOf } from "./request";

// How the instance sends a push to its app on an iPhone: decision 072. APNs is asked over
// HTTP/2, with `node:http2` and no library, on one session to each of Apple's two hosts, which
// Apple asks a provider to keep open and send many pushes on: a connection opened for every push
// may be taken for an attack. The request names the phone by its token, in its path, and the
// instance by a token signed with ES256 from the team's key. What the push says is encrypted for
// the phone, as for a browser: Apple reads a line that stands in for it, and nothing of the alert.
// A push that is given up has its stream cancelled, with HTTP/2's `RST_STREAM`: what was not sent
// by then is not sent, nothing more of its answer is read, and the session goes on for the
// others, unless Apple had not begun to answer: the connection may then be half open, which TCP
// tells only after minutes, and the session takes no new push. Nothing here is logged of a push
// but how it failed, and never the token.
//
// Decision 074: the same sessions and the same key carry the pushes of a Live Activity, of the
// type `liveactivity` and to the app's topic followed by `.push-type.liveactivity`, which start,
// update and end the activity of a window that begins (`activities.ts`).

/** What an instance sets to push to its iOS app: the key of its Apple team, and the app. */
export type ApnsSettings = {
  APPLE_TEAM_ID?: string | undefined;
  APNS_KEY_ID?: string | undefined;
  APNS_PRIVATE_KEY?: string | undefined;
  APNS_TOPIC?: string | undefined;
};

/**
 * Apple's two hosts: the one of the apps in the App Store and in TestFlight, and the sandbox of
 * the builds made for development, which the app says it is.
 */
export const APNS_HOSTS = {
  production: "https://api.push.apple.com",
  development: "https://api.sandbox.push.apple.com",
};

/** What APNs answered on a stream, with what it said, or the kind of failure that kept it from it. */
export type StreamAnswer = { status: number; body: string } | { failure: string };

/** How a push is given to APNs: on a stream of the session to a host. A test gives its own. */
export type Stream = (
  origin: string,
  headers: Record<string, string>,
  body: Uint8Array,
  // Gives the push up: its stream is cancelled.
  signal: AbortSignal,
) => Promise<StreamAnswer>;

const SEND_MS = 10_000;
// Apple refuses a token signed more than an hour before, and one made anew more often than every
// twenty minutes: a token is used forty minutes. Chosen in decision 072.
const TOKEN_KEPT_MS = 40 * 60 * 1000;
const TOKEN_RENEWED_AFTER_MS = 20 * 60 * 1000;
// What Apple says of a push it does not take is a reason, in a few bytes of JSON: no more is read.
const READ_BYTES = 512;
// A session that sends nothing for a minute is closed: the next push opens another.
const IDLE_MS = 60_000;
// A token, as the API kept it: hexadecimal, in small letters. It goes into the path of a request.
const TOKEN = /^[0-9a-f]{64,200}$/;

/**
 * The streams of the instance to Apple: one HTTP/2 session to each host, opened as the first
 * push to it leaves, opened again once Apple or the network closed it, it has rested a minute
 * or a push on it was given up before Apple began to answer, and holding the program open only
 * while a push is under way on it. `close` closes them all.
 */
export function http2Streams(idleMs = IDLE_MS): { stream: Stream; close: () => void } {
  type Kept = { session: http2.ClientHttp2Session; underWay: number };
  const sessions = new Map<string, Kept>();
  // A session that takes no new push: the next opens another, and the pushes under way on it end
  // on their own, answered or given up, before it closes.
  const retire = (origin: string, kept: Kept) => {
    if (sessions.get(origin) === kept) sessions.delete(origin);
    if (!kept.session.closed && !kept.session.destroyed) kept.session.close();
  };
  const sessionTo = (origin: string): Kept => {
    const open = sessions.get(origin);
    if (open && !open.session.closed && !open.session.destroyed) return open;
    const session = http2.connect(origin);
    const kept: Kept = { session, underWay: 0 };
    sessions.set(origin, kept);
    // Closed or refused: the next push opens another. A session that Apple ends with GOAWAY
    // lets the streams under way finish, and takes no new one.
    const forget = () => {
      if (sessions.get(origin) === kept) sessions.delete(origin);
    };
    session.on("error", forget);
    session.on("close", forget);
    session.on("goaway", forget);
    session.setTimeout(idleMs, () => session.close());
    session.unref();
    return kept;
  };

  const stream: Stream = (origin, headers, body, signal) =>
    new Promise((resolve) => {
      if (signal.aborted) return resolve({ failure: "given up" });
      let kept: Kept;
      let request: http2.ClientHttp2Stream;
      try {
        kept = sessionTo(origin);
        request = kept.session.request({
          ":method": "POST",
          ...headers,
          "content-length": String(body.length),
        });
      } catch (error) {
        return resolve({ failure: kindOf(error) });
      }
      // The session holds the program open while a push is under way on it, and no longer.
      kept.underWay += 1;
      kept.session.ref();
      let status = 0;
      const chunks: Buffer[] = [];
      let read = 0;
      const said = () => Buffer.concat(chunks).subarray(0, READ_BYTES).toString("utf8");
      let isAnswered = false;
      // `isOver` for a stream that Apple ended: there is nothing left to cancel.
      const answer = (given: StreamAnswer, isOver = false) => {
        if (isAnswered) return;
        isAnswered = true;
        signal.removeEventListener("abort", giveUp);
        // A stream still open is cancelled: what was not sent is not sent, and nothing more of
        // the answer is read. The session goes on for the other pushes.
        if (!isOver && !request.closed) request.close(http2.constants.NGHTTP2_CANCEL);
        kept.underWay -= 1;
        if (kept.underWay === 0 && !kept.session.destroyed) kept.session.unref();
        resolve(given);
      };
      // Given up before Apple began to answer it: the session may be half open, and every push
      // on it would wait as long, holding its account's rows, so it is retired.
      const giveUp = () => {
        const isSilent = status === 0;
        answer({ failure: "given up" });
        if (isSilent) retire(origin, kept);
      };
      signal.addEventListener("abort", giveUp, { once: true });
      request.on("response", (answered) => {
        status = Number(answered[":status"] ?? 0);
      });
      request.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        read += chunk.length;
        if (read >= READ_BYTES && status > 0) answer({ status, body: said() });
      });
      const ended = () =>
        answer(status > 0 ? { status, body: said() } : { failure: "no answer" }, true);
      request.on("end", ended);
      request.on("close", ended);
      request.on("error", (error) => answer({ failure: kindOf(error) }));
      request.end(body);
    });

  return {
    stream,
    close: () => {
      for (const { session } of sessions.values()) session.close();
      sessions.clear();
    },
  };
}

// The reason Apple gives, when it is a word: nothing else of its answer goes into the log.
function reasonOf(body: string) {
  try {
    const said: unknown = JSON.parse(body);
    const reason =
      typeof said === "object" && said !== null && "reason" in said ? said.reason : undefined;
    return typeof reason === "string" && /^[A-Za-z]{1,64}$/.test(reason) ? reason : null;
  } catch {
    return null;
  }
}

/**
 * Where a push of a Live Activity goes: the token that starts one, for a start, or the token of
 * the activity, for its updates and its end, on the host of the environment of the iPhone's
 * build, under the app the iPhone's device was made by.
 */
export type ActivityTarget = Pick<AppDevice, "token" | "appId" | "environment">;

/**
 * A pusher to the app on an iPhone, which closes its sessions to Apple when asked. `activity`
 * sends a push of a Live Activity, once, within the ten seconds a push is given, and says what
 * became of it as `send` does: decision 074.
 */
export type ApnsPusher = Pusher<AppDevice> & {
  activity: (to: ActivityTarget, push: ActivityPush, keepSeconds: number) => Promise<Outcome>;
  close: () => void;
};

/**
 * The pusher of an instance to its iOS app, from its settings. Null when it sets none of the
 * three `APNS_*`: the instance then pushes to no iPhone. It throws on settings that cannot be
 * right, naming what is missing and nothing of the key, so that the worker does not start with
 * them. A test gives its own `stream`, which asks no one, or its own hosts.
 */
export function createApnsPusher(
  settings: ApnsSettings,
  options: { stream?: Stream; hosts?: typeof APNS_HOSTS; sendMs?: number } = {},
): ApnsPusher | null {
  const {
    APPLE_TEAM_ID: team,
    APNS_KEY_ID: keyId,
    APNS_PRIVATE_KEY: text,
    APNS_TOPIC: topic,
  } = settings;
  if (!keyId && !text && !topic) return null;
  const missing = Object.entries({
    APPLE_TEAM_ID: team,
    APNS_KEY_ID: keyId,
    APNS_PRIVATE_KEY: text,
    APNS_TOPIC: topic,
  })
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (!team || !keyId || !text || !topic) {
    throw new Error(`Set ${missing.join(" and ")} to push to the iOS app, or no APNS_ variable`);
  }
  const key = privateKeyOf("APNS_PRIVATE_KEY", text, "ec");
  const transport = options.stream ? { stream: options.stream, close: () => {} } : http2Streams();
  const hosts = options.hosts ?? APNS_HOSTS;
  const sendMs = options.sendMs ?? SEND_MS;

  // The token that names the instance to Apple, and when it was signed.
  let signed: { token: string; at: number } | null = null;
  const providerToken = () => {
    const now = Date.now();
    if (signed && now >= signed.at && now - signed.at < TOKEN_KEPT_MS) return signed.token;
    const token = signedToken(
      { alg: "ES256", kid: keyId },
      { iss: team, iat: Math.floor(now / 1000) },
      key,
    );
    signed = { token, at: now };
    return token;
  };

  // What is kept of a push that was not taken: the kind of failure, and never the token.
  const not = (outcome: "refused" | "failed", kind: string) => {
    console.error(`push: not taken (apns ${kind})`);
    return outcome;
  };

  // Gives a payload to Apple for a token, on the host of its build's environment, and reads
  // what Apple answers.
  const deliver = async (
    to: ActivityTarget,
    headers: Record<string, string>,
    payload: Uint8Array,
    // What the log says it was, before the reason Apple gives.
    what = "",
  ): Promise<Outcome> => {
    const answer = await transport.stream(
      to.environment === "development" ? hosts.development : hosts.production,
      {
        ":path": `/3/device/${to.token}`,
        authorization: `bearer ${providerToken()}`,
        ...headers,
      },
      payload,
      AbortSignal.timeout(sendMs),
    );
    if ("failure" in answer) {
      return not(
        "failed",
        `${what}${answer.failure === "given up" ? "no answer in time" : answer.failure}`,
      );
    }
    const { status } = answer;
    if (status === 200) return "taken";
    const reason = reasonOf(answer.body);
    // The token is no more, or it is not this app's on the host its build said: from the
    // host of the environment the app said, under the app's own id.
    if (status === 410) return "gone";
    if (status === 400 && (reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic")) {
      return "gone";
    }
    // Apple takes the instance's token for too old: another is signed for the next push,
    // unless one was signed lately, which Apple would take for too many.
    if (reason === "ExpiredProviderToken" && signed) {
      if (Date.now() - signed.at >= TOKEN_RENEWED_AFTER_MS) signed = null;
    }
    // Apple failing does not say what it did with the push before.
    return not(status >= 500 ? "failed" : "refused", `${what}${reason ?? `status ${status}`}`);
  };

  // What is checked again of a token as a push leaves: it goes into the path of a request.
  const refusedTo = (to: ActivityTarget, keepSeconds: number) => {
    if (!TOKEN.test(to.token)) return "a token APNs did not give";
    if (to.appId !== topic) return "a device of another app";
    if (!Number.isFinite(keepSeconds)) return "no time to keep it for";
    return null;
  };
  // Kept until then for a phone that is off, or tried once now and dropped.
  const expiration = (keepSeconds: number) => {
    const kept = keptFor(keepSeconds);
    return kept === 0 ? "0" : String(Math.floor(Date.now() / 1000) + kept);
  };

  return {
    close: transport.close,
    activity: async (to, push, keepSeconds) => {
      try {
        const refused = refusedTo(to, keepSeconds);
        if (refused) return not("refused", `activity ${refused}`);
        const payload = Buffer.from(JSON.stringify(activityPayload(push, new Date())));
        if (payload.length > APP_PAYLOAD_BYTES) {
          return not("refused", "activity too long for one push");
        }
        return await deliver(
          to,
          {
            "apns-push-type": "liveactivity",
            "apns-topic": `${topic}.push-type.liveactivity`,
            // An update that tells nothing new leaves when the phone can take it, which counts
            // for nothing against what Apple lets an app send in an hour. A start, an end and an
            // update that tells a beginning leave now.
            "apns-priority": push.event === "update" && !push.locale ? "5" : "10",
            "apns-expiration": expiration(keepSeconds),
          },
          payload,
          "activity ",
        );
      } catch (error) {
        return not("failed", `activity ${error instanceof Error ? error.name : "unknown"}`);
      }
    },
    send: async (device, push, keepSeconds) => {
      try {
        // Checked again as it leaves: a token goes into the path of the request.
        const refused = refusedTo(device, keepSeconds);
        if (refused) return not("refused", refused);
        const standIn = STAND_IN[push.locale ?? "en"] ?? STAND_IN.en;
        // An alert that the app's extension opens before it is shown: Apple shows the line
        // that stands in for it when the extension cannot.
        const made = payloadFor(device, push, (sealed) =>
          Buffer.from(
            JSON.stringify({
              aps: { alert: { title: standIn }, "mutable-content": 1 },
              encrypted: sealed,
            }),
          ),
        );
        if ("refused" in made) return not("refused", made.refused);
        const collapseId = collapseIdOf(push.tag, device.auth);
        return await deliver(
          device,
          {
            "apns-push-type": "alert",
            "apns-topic": topic,
            // The evening before may wait, and Apple may then hold it back to spare the battery.
            "apns-priority": push.level === "passive" ? "5" : "10",
            "apns-expiration": expiration(keepSeconds),
            ...(collapseId ? { "apns-collapse-id": collapseId } : {}),
          },
          made.payload,
        );
      } catch (error) {
        return not("failed", error instanceof Error ? error.name : "unknown");
      }
    },
  };
}
