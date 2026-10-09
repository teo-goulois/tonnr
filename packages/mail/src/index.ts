import {
  createEmailClient,
  type EmailAdapter,
  EmailAdapterError,
  EmailRouteError,
  EmailSdkError,
} from "@opencoredev/email-sdk";
import { smtp } from "@opencoredev/email-sdk/smtp";
import { unosend } from "@opencoredev/email-sdk/unosend";

// How the instance sends a mail: decision 026. This knows the library and the two ways out,
// and nothing of who signs in. Nothing here is logged of a mail but how it failed.

/** What an instance sets to send mail. With no way out, it sends none. */
export type MailSettings = {
  UNOSEND_API_KEY?: string | undefined;
  // `smtp://user:password@host:587`, or `smtps://` for a server that speaks TLS from the start.
  SMTP_URL?: string | undefined;
  // `Name <address>`, or an address alone.
  EMAIL_FROM?: string | undefined;
};

/** A mail to one address: the address alone, with no name beside it. */
export type Mail = { to: string; subject: string; text: string; html: string };

export type Mailer = {
  /** The way out the instance's settings chose. */
  via: "unosend" | "smtp";
  /**
   * Sends a mail, once, and answers within ten seconds. `accepted` when the provider took it,
   * which is not yet a mail in a mailbox. `failed` when it did not, or did not say in time:
   * the mail may still arrive then. An SMTP server that stopped answering is let go of a few
   * seconds after the answer, when its connection has said nothing for ten seconds.
   */
  send: (mail: Mail) => Promise<"accepted" | "failed">;
};

// How long a mail may take to leave. A sign-up waits for it.
const SEND_MS = 10_000;

// An address as a sender may have: one name before the `@` and a domain after, with no space
// and nothing that separates two addresses or starts a header.
const ADDRESS = /^[^\s<>@,;:"()\\]+@[^\s<>@,;:"()\\]+\.[^\s<>@,;:"()\\]+$/;
// A sender's name: letters, digits and spaces, with the few signs a name is written with. A
// comma, a quote or a colon would make two senders of one, or a header of a name.
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._'&+-]{0,63}$/u;

/** One sender, read from `Name <address>` or from an address alone. Null when it is neither. */
export function readSender(from: string) {
  const named = /^(.*\S) <([^<>]+)>$/.exec(from);
  const email = named ? (named[2] ?? "") : from;
  const name = named?.[1];
  if (!ADDRESS.test(email)) return null;
  if (name !== undefined && !NAME.test(name)) return null;
  return name === undefined ? { email } : { email, name };
}

/** An SMTP server, read from its address. It throws on one it cannot read. */
export function readSmtp(address: string) {
  if (!URL.canParse(address)) throw new Error("SMTP_URL is not an address");
  const url = new URL(address);
  if (url.protocol !== "smtp:" && url.protocol !== "smtps:") {
    throw new Error("SMTP_URL must start with smtp:// or smtps://");
  }
  if (url.hostname === "") throw new Error("SMTP_URL names no server");
  // What would be read and then left out is refused, so that nothing is thought to be set.
  if (url.pathname.replace("/", "") !== "" || url.search !== "" || url.hash !== "") {
    throw new Error("SMTP_URL takes a server, a port and who signs in, and nothing after them");
  }
  if (url.port === "0") throw new Error("SMTP_URL names no port");
  // `smtps` speaks TLS from the first byte. `smtp` starts in the clear and must turn to TLS
  // before anything is said: a password and a link are not sent in the clear.
  const secure = url.protocol === "smtps:";
  const user = decodeURIComponent(url.username);
  const pass = decodeURIComponent(url.password);
  return {
    // An address of the network written in full is between brackets in an address of the web.
    host: url.hostname.replace(/^\[|\]$/g, ""),
    port: url.port === "" ? (secure ? 465 : 587) : Number(url.port),
    secure,
    requireTLS: !secure,
    // How long the server may take to answer at each step, before the connection is closed.
    timeoutMs: SEND_MS,
    ...(user !== "" && { auth: { user, pass } }),
  };
}

// What is kept of a mail that did not leave: the kind of failure and its status. A message of
// the library or of the provider can hold the address or the link.
function failureOf(error: unknown) {
  const first = error instanceof EmailRouteError ? error.failures[0] : error;
  if (first instanceof EmailAdapterError) {
    return `${first.code}${first.status === undefined ? "" : ` ${first.status}`}, delivery ${first.delivery}`;
  }
  if (first instanceof EmailSdkError) return first.code;
  return first instanceof Error ? first.name : "unknown";
}

/**
 * The mailer of an instance, from its settings. Null when the settings name no way out: the
 * instance then sends no mail. It throws on settings that cannot be right, so that the API
 * does not start with them. `adapter` stands for the way out in a test, which may also give a
 * mail less time to leave.
 */
export function createMailer(
  settings: MailSettings,
  adapter?: EmailAdapter,
  sendMs = SEND_MS,
): Mailer | null {
  const { UNOSEND_API_KEY: key, SMTP_URL: server } = settings;
  if (!key && !server) return null;
  if (key && server) throw new Error("Set UNOSEND_API_KEY or SMTP_URL, not both");
  if (!settings.EMAIL_FROM) throw new Error("EMAIL_FROM is not set: a mail needs a sender");
  const from = readSender(settings.EMAIL_FROM);
  if (!from) {
    throw new Error(
      "EMAIL_FROM must be `Name <address>` or an address, with a name of letters and digits",
    );
  }

  const via = key ? ("unosend" as const) : ("smtp" as const);
  const out = adapter ?? (key ? unosend({ apiKey: key }) : smtp(readSmtp(server ?? "")));
  const client = createEmailClient({
    adapters: [out],
    // The library reports its use to its authors unless told not to.
    telemetry: false,
    // One try: a mail that was accepted late would be sent twice.
    retry: { maxAttempts: 1 },
  });

  return {
    via,
    send: async ({ to, subject, text, html }) => {
      try {
        await client.send(
          { from, to, subject, text, html },
          { signal: AbortSignal.timeout(sendMs) },
        );
        return "accepted";
      } catch (error) {
        console.error(`mail: not accepted by ${via} (${failureOf(error)})`);
        return "failed";
      }
    },
  };
}
