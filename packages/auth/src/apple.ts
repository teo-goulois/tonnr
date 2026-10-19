import { createPrivateKey, type KeyObject, sign } from "node:crypto";

export type AppleConfig = {
  // The Services ID that names the web's sign-in at Apple, such as `app.tonnr.web`.
  APPLE_SERVICES_ID?: string | undefined;
  // The team of the Apple developer account, which signs the apps and holds the key.
  APPLE_TEAM_ID?: string | undefined;
  // The id of a key of that team with Sign in with Apple, and the content of its `.p8` file.
  APPLE_KEY_ID?: string | undefined;
  APPLE_PRIVATE_KEY?: string | undefined;
};

/** Where Apple's page posts its answer from, which the library then trusts: decision 070. */
export const APPLE_ORIGIN = "https://appleid.apple.com";

// Apple takes a client's secret that lasts six months at most. One lasts a day here, and is
// signed again in its last hour, so that a secret read from somewhere is worth little.
const SECRET_SECONDS = 24 * 60 * 60;
const SIGNED_AGAIN_BEFORE_SECONDS = 60 * 60;

/**
 * The key, from the content of its `.p8` file: PEM, whose lines may be written `\n` on a single
 * line of a settings file. Apple's keys are on the curve P-256. Nothing of the value is printed.
 */
function keyOf(content: string) {
  let key: KeyObject;
  try {
    key = createPrivateKey(content.replaceAll("\\n", "\n"));
  } catch {
    throw new Error("APPLE_PRIVATE_KEY must be the content of the key's .p8 file");
  }
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
    throw new Error("APPLE_PRIVATE_KEY must be a key of Apple's, on the curve P-256");
  }
  return key;
}

const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

/**
 * The client's secret that Apple asks of a code's exchange: a token that names the team and the
 * Services ID, signed with the key in ES256.
 * https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret
 */
export function appleClientSecret(
  settings: { teamId: string; keyId: string; clientId: string; key: KeyObject },
  issuedAt: number,
) {
  const unsigned = `${part({ alg: "ES256", kid: settings.keyId })}.${part({
    iss: settings.teamId,
    iat: issuedAt,
    exp: issuedAt + SECRET_SECONDS,
    aud: APPLE_ORIGIN,
    sub: settings.clientId,
  })}`;
  const signature = sign("sha256", Buffer.from(unsigned), {
    key: settings.key,
    dsaEncoding: "ieee-p1363",
  });
  return `${unsigned}.${Buffer.from(signature).toString("base64url")}`;
}

/**
 * Sign in with Apple, when the instance offers it: the Services ID, the key's id and its content
 * set together, beside the team. Some of them and not all stops the API as it starts, as a
 * partial pair of Google's does. Without them it is off.
 *
 * The web signs in through Apple's page, with the Services ID. The app sends the ID token Apple's
 * sheet gave it, made for its bundle, which is the scheme of the origin it names itself by,
 * `app.tonnr` for `app.tonnr://`: the API takes a token made for either. Decisions 069 and 070.
 *
 * The secret is signed as the API starts, which checks the key, and again before it runs out,
 * whenever the library reads it.
 */
export function appleProvider(
  env: AppleConfig,
  appOrigins: readonly string[],
  now: () => number = Date.now,
) {
  const clientId = env.APPLE_SERVICES_ID?.trim();
  const keyId = env.APPLE_KEY_ID?.trim();
  const content = env.APPLE_PRIVATE_KEY?.trim();
  const teamId = env.APPLE_TEAM_ID?.trim();
  const set = [clientId, keyId, content].filter(Boolean).length;
  if (set === 0) return {};
  if (set !== 3 || !teamId) {
    throw new Error(
      "APPLE_SERVICES_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY must be set together, with APPLE_TEAM_ID",
    );
  }
  const settings = { teamId, keyId: keyId!, clientId: clientId!, key: keyOf(content!) };
  const seconds = () => Math.floor(now() / 1000);
  let issuedAt = seconds();
  let secret = appleClientSecret(settings, issuedAt);
  const current = () => {
    if (seconds() >= issuedAt + SECRET_SECONDS - SIGNED_AGAIN_BEFORE_SECONDS) {
      issuedAt = seconds();
      secret = appleClientSecret(settings, issuedAt);
    }
    return secret;
  };
  const bundles = appOrigins.map((origin) => origin.slice(0, -"://".length));
  return {
    apple: {
      clientId: settings.clientId,
      // Read at each exchange of a code: the library keeps this object as it is given.
      get clientSecret() {
        return current();
      },
      audience: [settings.clientId, ...bundles],
    },
  };
}
