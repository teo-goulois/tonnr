import { APP_SCHEME } from "@repo/config/app";
import { claimedPaths } from "@repo/config/links";

// The two files that let a phone open the app at an address of the web app, which the Worker
// answers itself, from values of its stage: decision 073. iOS reads Apple's through Apple's cache
// and Android reads its own as the app is installed, and neither follows a redirect.

export const APPLE_FILE = "/.well-known/apple-app-site-association";
export const ANDROID_FILE = "/.well-known/assetlinks.json";

/**
 * What a stage says of the apps that open its links. The app's bundle id and its package are
 * `APP_SCHEME`, which the app is built with too (decision 069).
 */
export type AppIdentity = {
  // The team of the Apple developer account that signs the app for iPhones, such as `A1B2C3D4E5`.
  appleTeamId?: string;
  // The SHA-256 fingerprints of the keys that sign the app for Android, separated by commas: the
  // key of Play App Signing and the upload key.
  androidFingerprints?: string;
};

/**
 * Apple's file: the app opens the addresses of `APP_LINK_PATHS` in every language, and its
 * sign-in shares the passwords the keychain keeps for the site.
 */
export function appleAppSiteAssociation(teamId: string) {
  const app = `${teamId}.${APP_SCHEME}`;
  return {
    applinks: { details: [{ appIDs: [app], components: appleComponents() }] },
    webcredentials: { apps: [app] },
  };
}

/**
 * The addresses as Apple reads them: `?*` is one character or more, and any query and fragment
 * go with a path. Apple's `*` may read across a slash, so a path with one segment more is left
 * out before each pattern: `/b/<id>` is taken, and `/b/<id>/more`, which the web does not answer,
 * is not. The first component that matches decides.
 */
export function appleComponents() {
  return claimedPaths().flatMap((path) => {
    const pattern = path.replaceAll(/:\w+/g, "?*");
    if (pattern === path) return [{ "/": path }];
    return [{ "/": `${pattern}/*`, exclude: true }, { "/": pattern }];
  });
}

/**
 * Android's file: the app opens the links its intent filters name, which hold the paths, and
 * shares the passwords kept for the site. Each fingerprint is written as Google's verifier reads
 * it, in capitals.
 */
export function assetLinks(fingerprints: string[]) {
  return [
    {
      relation: [
        "delegate_permission/common.handle_all_urls",
        "delegate_permission/common.get_login_creds",
      ],
      target: {
        namespace: "android_app",
        package_name: APP_SCHEME,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

/** The fingerprints a stage names, separated by commas. */
export function fingerprintsOf(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((fingerprint) => fingerprint.trim().toUpperCase())
    .filter((fingerprint) => fingerprint !== "");
}

/**
 * What the Worker answers at the two addresses, before the languages may send the request on to
 * another address. A file the stage names nothing for is a 404: an instance without an app of its
 * own claims nothing. Undefined for every other request.
 */
export function wellKnownFile(request: Request, identity: AppIdentity): Response | undefined {
  if (request.method !== "GET" && request.method !== "HEAD") return undefined;
  const { pathname } = new URL(request.url);
  if (pathname === APPLE_FILE) {
    const team = identity.appleTeamId?.trim();
    return team ? json(appleAppSiteAssociation(team)) : notFound();
  }
  if (pathname === ANDROID_FILE) {
    const fingerprints = fingerprintsOf(identity.androidFingerprints);
    return fingerprints.length > 0 ? json(assetLinks(fingerprints)) : notFound();
  }
  return undefined;
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

function notFound() {
  return new Response("Not Found", { status: 404 });
}
