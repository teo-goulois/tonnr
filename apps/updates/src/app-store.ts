// How `pnpm run release:ios <stage>` gets the profiles its export signs with: the App Store
// Connect API, with the team's key, whose token is signed here with `node:crypto`, through
// `fetch` and no library. Each identifier of the app gets a profile of the App Store that names
// the team's distribution certificate whose key lies on this Mac, and no other, so that
// xcodebuild signs here and never through Apple's cloud, which wrote a name with an accent
// decomposed in each signature and had every piece of the app refused. Decision 075.
import { createSign, X509Certificate } from "node:crypto";

const API = "https://api.appstoreconnect.apple.com";

/** A key of App Store Connect: its id, the issuer of the team's keys, and its PEM. */
export type AppStoreKey = { id: string; issuer: string; privateKey: string };

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

/** The token the API takes, signed by the key: a JWT of ES256 for twenty minutes, Apple's most. */
export function tokenOf(key: AppStoreKey, now: Date): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const unsigned = [
    base64url(JSON.stringify({ alg: "ES256", kid: key.id, typ: "JWT" })),
    base64url(
      JSON.stringify({
        iss: key.issuer,
        iat: issuedAt,
        exp: issuedAt + 20 * 60,
        aud: "appstoreconnect-v1",
      }),
    ),
  ].join(".");
  const signature = createSign("SHA256")
    .update(unsigned)
    .sign({ key: key.privateKey, dsaEncoding: "ieee-p1363" });
  return `${unsigned}.${base64url(signature)}`;
}

/** The SHA-1 of a certificate, by which xcodebuild names the identity that signs. */
export const certificateHashOf = (certificate: string | Buffer) =>
  new X509Certificate(certificate).fingerprint.replaceAll(":", "");

/** The name of the profile a release makes for an identifier, which the next release replaces. */
export const profileNameOf = (identifier: string) => `${identifier} release`;

/** A profile made for a release: the UUID xcodebuild names it by, and its file. */
export type StoreProfile = { identifier: string; uuid: string; content: Uint8Array };

export type ProfilesRequest = {
  key: AppStoreKey;
  /** The team's distribution certificate, as Apple gives it, in DER or PEM. */
  certificate: string | Buffer;
  /** The bundle identifiers of the app and of its extensions. */
  identifiers: string[];
  fetcher?: typeof fetch;
  now?: Date;
};

type Resource = { id: string; attributes: Record<string, unknown> };

const DISTRIBUTION = new Set(["DISTRIBUTION", "IOS_DISTRIBUTION"]);
// A serial number as Apple and Node each write it: in capitals, without the zeros before it.
const serialOf = (serial: unknown) =>
  String(serial ?? "")
    .toUpperCase()
    .replace(/^0+/, "");

/**
 * A profile of the App Store for each identifier, with the certificate alone: the one a
 * previous release made under the same name is deleted first, so that a profile always names
 * the certificate in force and what the identifier may do today.
 */
export async function storeProfiles(request: ProfilesRequest): Promise<StoreProfile[]> {
  const fetcher = request.fetcher ?? fetch;
  const authorization = `Bearer ${tokenOf(request.key, request.now ?? new Date())}`;
  const ask = async (what: string, method: string, route: string, body?: unknown) => {
    const response = await fetcher(`${API}${route}`, {
      method,
      headers: {
        authorization,
        ...(body !== undefined && { "content-type": "application/json" }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      throw new Error(
        `App Store Connect refused to ${what}: ${response.status} ${await response.text()}`,
      );
    }
    return response.status === 204 ? {} : ((await response.json()) as { data?: unknown });
  };
  const list = async (what: string, route: string) =>
    ((await ask(what, "GET", route)).data ?? []) as Resource[];

  const serial = serialOf(new X509Certificate(request.certificate).serialNumber);
  const certificate = (
    await list("list the team's certificates", "/v1/certificates?limit=200")
  ).find((found) => serialOf(found.attributes.serialNumber) === serial);
  if (!certificate || !DISTRIBUTION.has(String(certificate.attributes.certificateType))) {
    throw new Error(
      `The certificate ${serial} is not one of the team's distribution certificates: make one ` +
        "under Certificates, with the key on this Mac",
    );
  }

  const profiles: StoreProfile[] = [];
  for (const identifier of request.identifiers) {
    const bundle = (
      await list(
        `find ${identifier}`,
        `/v1/bundleIds?filter[identifier]=${encodeURIComponent(identifier)}&limit=200`,
      )
    ).find((found) => found.attributes.identifier === identifier);
    if (!bundle) {
      throw new Error(
        `${identifier} is not an identifier of the team: register it under Identifiers`,
      );
    }
    const name = profileNameOf(identifier);
    const before = await list(
      `list the profiles named ${name}`,
      `/v1/profiles?filter[name]=${encodeURIComponent(name)}&limit=200`,
    );
    for (const old of before.filter((found) => found.attributes.name === name)) {
      await ask(`delete the profile ${name}`, "DELETE", `/v1/profiles/${old.id}`);
    }
    const made = (
      await ask(`make the profile ${name}`, "POST", "/v1/profiles", {
        data: {
          type: "profiles",
          attributes: { name, profileType: "IOS_APP_STORE" },
          relationships: {
            bundleId: { data: { type: "bundleIds", id: bundle.id } },
            certificates: { data: [{ type: "certificates", id: certificate.id }] },
          },
        },
      })
    ).data as Resource | undefined;
    const uuid = made?.attributes.uuid;
    const content = made?.attributes.profileContent;
    if (typeof uuid !== "string" || typeof content !== "string") {
      throw new Error(`App Store Connect made the profile ${name} and gave back no file`);
    }
    profiles.push({ identifier, uuid, content: Buffer.from(content, "base64") });
  }
  return profiles;
}
