// How `pnpm run release:android <stage>` sends a build to Google Play: the Play Developer API,
// with a service account of Google Cloud whose token is signed here with `node:crypto`, through
// `fetch` and no library. An edit, the bundle, its track, then the commit of the edit. Google's
// API takes a bundle only for an app that already has one, which the Play Console takes by
// hand. A test track only: a person promotes a build to the store. Decision 075.
import { createSign } from "node:crypto";

const PUBLISHER = "https://androidpublisher.googleapis.com";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";

/** What the JSON key of a service account holds that the API needs. */
export type ServiceAccount = { clientEmail: string; privateKey: string; tokenUri: string };

/** The service account a JSON key names, or why it names none. */
export function serviceAccountOf(text: string): ServiceAccount {
  let key: Record<string, unknown>;
  try {
    key = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("The key of the service account is not JSON");
  }
  const { client_email: clientEmail, private_key: privateKey, token_uri: tokenUri } = key;
  if (key.type !== "service_account" || typeof clientEmail !== "string") {
    throw new Error("The key is not a service account's");
  }
  if (typeof privateKey !== "string" || !privateKey.includes("PRIVATE KEY")) {
    throw new Error("The key of the service account holds no private key");
  }
  return {
    clientEmail,
    privateKey,
    tokenUri: typeof tokenUri === "string" ? tokenUri : "https://oauth2.googleapis.com/token",
  };
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

/** The token a service account asks for, signed by its own key: a JWT that lasts an hour. */
export function assertionOf(account: ServiceAccount, now: Date): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const unsigned = [
    base64url(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    base64url(
      JSON.stringify({
        iss: account.clientEmail,
        scope: SCOPE,
        aud: account.tokenUri,
        iat: issuedAt,
        exp: issuedAt + 3600,
      }),
    ),
  ].join(".");
  const signature = createSign("RSA-SHA256").update(unsigned).sign(account.privateKey);
  return `${unsigned}.${base64url(signature)}`;
}

export type PlayRelease = {
  account: ServiceAccount;
  packageName: string;
  bundle: Uint8Array;
  /** A test track: internal, alpha, beta or one the Play Console named. Never production. */
  track: string;
  /** What the release is called in the Play Console, such as "1.2.0 (418)". */
  name: string;
  fetcher?: typeof fetch;
  now?: Date;
};

/** Sends a bundle to a test track of Google Play, and says the version code Google read in it. */
export async function releaseToPlay(release: PlayRelease): Promise<number> {
  if (release.track === "production") {
    throw new Error("No script releases to the public: a person promotes a build in the Console");
  }
  const fetcher = release.fetcher ?? fetch;
  const ask = async (what: string, url: string, init: RequestInit) => {
    const response = await fetcher(url, init);
    if (!response.ok) {
      throw new Error(
        `Google Play refused to ${what}: ${response.status} ${await response.text()}`,
      );
    }
    return (await response.json()) as Record<string, unknown>;
  };

  const granted = await ask("sign the service account in", release.account.tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: assertionOf(release.account, release.now ?? new Date()),
    }).toString(),
  });
  const authorization = { authorization: `Bearer ${String(granted.access_token)}` };
  const app = `applications/${encodeURIComponent(release.packageName)}`;

  const edit = await ask("open an edit", `${PUBLISHER}/androidpublisher/v3/${app}/edits`, {
    method: "POST",
    headers: { ...authorization, "content-type": "application/json" },
    body: "{}",
  });
  const edits = `${PUBLISHER}/androidpublisher/v3/${app}/edits/${encodeURIComponent(String(edit.id))}`;
  try {
    const uploaded = await ask(
      "take the bundle",
      `${PUBLISHER}/upload/androidpublisher/v3/${app}/edits/${encodeURIComponent(String(edit.id))}/bundles?uploadType=media`,
      {
        method: "POST",
        headers: { ...authorization, "content-type": "application/octet-stream" },
        body: release.bundle,
      },
    );
    const versionCode = Number(uploaded.versionCode);
    await ask(`put the build on the track ${release.track}`, `${edits}/tracks/${release.track}`, {
      method: "PUT",
      headers: { ...authorization, "content-type": "application/json" },
      body: JSON.stringify({
        track: release.track,
        releases: [
          { name: release.name, versionCodes: [String(versionCode)], status: "completed" },
        ],
      }),
    });
    await ask("commit the edit", `${edits}:commit`, { method: "POST", headers: authorization });
    return versionCode;
  } catch (error) {
    // An edit that is not committed changes nothing; deleting it frees the next one.
    await fetcher(edits, { method: "DELETE", headers: authorization }).catch(() => undefined);
    throw error;
  }
}
