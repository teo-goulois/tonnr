import net from "node:net";

import {
  type EmailAdapter,
  EmailAbortError,
  EmailAdapterError,
  type EmailAddress,
} from "@opencoredev/email-sdk";
import nodemailer from "nodemailer";

// The way out over SMTP: decision 026. The library has one of its own, which answers when a
// mail is given up and lets its connection go on: the mail may then leave after the answer.
// This one opens the connection itself, and closes it when the mail is given up, so that
// nothing leaves after `send` has answered.

type Server = {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  timeoutMs: number;
  auth?: { user: string; pass: string };
};

const address = (who: EmailAddress) =>
  typeof who === "string" ? who : who.name ? { name: who.name, address: who.email } : who.email;

/** An SMTP server as a way out of the mail library, for one mail to one address at a time. */
export function smtpOut(server: Server): EmailAdapter<"smtp"> {
  return {
    name: "smtp",
    capabilities: {
      repeatedHeaders: true,
      idempotency: "none",
      scheduling: false,
      personalized: "expanded",
    },
    async send(message, context) {
      const { signal } = context;
      if (signal?.aborted) throw new EmailAbortError(signal.reason);
      let socket: net.Socket | undefined;
      const close = () => socket?.destroy();
      const transport = nodemailer.createTransport({
        host: server.host,
        port: server.port,
        secure: server.secure,
        requireTLS: server.requireTLS,
        ...(server.auth ? { auth: server.auth } : {}),
        // How long the server may take to answer at each step.
        connectionTimeout: server.timeoutMs,
        greetingTimeout: server.timeoutMs,
        socketTimeout: server.timeoutMs,
        // The connection is opened here, and kept: it is what giving up closes.
        getSocket: (_options, callback) => {
          const made = net.connect({ host: server.host, port: server.port });
          socket = made;
          let answered = false;
          const answer = (error: Error | null) => {
            if (answered) return;
            answered = true;
            callback(error, error ? undefined : { connection: made });
          };
          made.once("connect", () => answer(null));
          made.once("error", (error) => answer(error));
          made.once("close", () => answer(new Error("The connection was closed")));
        },
      });
      signal?.addEventListener("abort", close, { once: true });
      try {
        const sent = await transport.sendMail({
          from: address(message.from),
          to: [message.to].flat().map(address),
          subject: message.subject,
          ...(message.text === undefined ? {} : { text: message.text }),
          ...(typeof message.html === "string" ? { html: message.html } : {}),
          headers: [message.headers ?? []]
            .flat()
            .flatMap((header) =>
              "name" in header ? [{ key: String(header.name), value: String(header.value) }] : [],
            ),
        });
        return {
          adapter: "smtp",
          id: sent.messageId,
          accepted: (sent.accepted ?? []).map(String),
          rejected: (sent.rejected ?? []).map(String),
        };
      } catch (error) {
        if (signal?.aborted) throw new EmailAbortError(signal.reason);
        // The server's own words can hold the address: its kind of failure is kept, and whether
        // the mail can have left.
        throw new EmailAdapterError(error instanceof Error ? error.name : "SMTP send failed", {
          adapter: "smtp",
          retryable: false,
          delivery: "unknown",
          cause: error,
        });
      } finally {
        signal?.removeEventListener("abort", close);
        close();
        transport.close();
      }
    },
  };
}
