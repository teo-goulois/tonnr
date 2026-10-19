import { generateKeyPairSync, type KeyObject, sign } from "node:crypto";

import type { createAuth } from "@repo/auth";

/**
 * A provider's signing key, made for a test, and the ID tokens it signs, as Apple's sheet or
 * Google's give an app one. No test asks Apple or Google for their keys: `checkIdTokensWith`
 * has the provider check its tokens against this one, and everything else of the check, the
 * issuer, the audience, the age and the nonce, stays the library's.
 */
export function testIdTokens() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return {
    publicKey,
    sign(claims: Record<string, unknown>) {
      const now = Math.floor(Date.now() / 1000);
      const unsigned = `${part({ alg: "RS256", kid: "made-up-key" })}.${part({
        iat: now,
        exp: now + 10 * 60,
        ...claims,
      })}`;
      const signature = sign("sha256", Buffer.from(unsigned), privateKey);
      return `${unsigned}.${Buffer.from(signature).toString("base64url")}`;
    },
  };
}

export async function checkIdTokensWith(
  auth: ReturnType<typeof createAuth>,
  providerId: string,
  publicKey: KeyObject,
) {
  const context = await auth.$context;
  const provider = context.socialProviders.find((provider) => provider.id === providerId)!;
  provider.idToken = {
    ...provider.idToken!,
    jwks: async () => publicKey,
  } as typeof provider.idToken;
}
