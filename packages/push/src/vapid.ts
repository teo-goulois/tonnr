import { sign } from "node:crypto";

import { type VapidKeys, base64url } from "./keys";

// How a push says which instance sends it: RFC 8292. A token signed with the instance's private
// key names the push service it is for and who to write to about the instance, and goes with
// the public key the browser subscribed with.

// A push service takes a token for a day at most. Each push gets its own, good for half of one.
const GOOD_FOR_SECONDS = 12 * 60 * 60;

const part = (value: object) => base64url(Buffer.from(JSON.stringify(value)));

/**
 * The `Authorization` header of a push: for one push service, which `audience` names by the
 * beginning of its address, from an instance that `subject` names by an address of its own.
 */
export function vapidHeader(keys: VapidKeys, audience: string, subject: string, now = new Date()) {
  const signed = `${part({ typ: "JWT", alg: "ES256" })}.${part({
    aud: audience,
    exp: Math.floor(now.getTime() / 1000) + GOOD_FOR_SECONDS,
    sub: subject,
  })}`;
  // The two numbers of the signature one after the other, as a token has them.
  const signature = sign("sha256", Buffer.from(signed), {
    key: keys.privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `vapid t=${signed}.${base64url(signature)}, k=${keys.publicKey}`;
}
