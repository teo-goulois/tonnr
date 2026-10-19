// The apps for phones the instance answers, by platform: the oldest build it still answers, the
// newest a store sells, and the page of that store. Its operator says them in the API's settings,
// and nothing else writes them. An app older than the oldest asks to be updated and goes no
// further, as the toast of a new deployment asks the web app to load again. Decision 069.

export const PLATFORMS = ["ios", "android"] as const;
export type Platform = (typeof PLATFORMS)[number];

export type Client = {
  // The oldest build the instance still answers. Null while it answers every build.
  oldestBuild: number | null;
  // The newest build a store sells, which an older app may say is there. Null while unsaid.
  newestBuild: number | null;
  // The page of the store that sells the app. Null while no store sells it.
  storeUrl: string | null;
};
export type Clients = Record<Platform, Client>;

/** What an instance says when its settings name nothing: every build is answered. */
export const NO_CLIENTS: Clients = {
  ios: { oldestBuild: null, newestBuild: null, storeUrl: null },
  android: { oldestBuild: null, newestBuild: null, storeUrl: null },
};

/** The API's settings of the apps for phones, as Varlock reads them. */
export type ClientSettings = {
  APP_IOS_OLDEST_BUILD?: number | undefined;
  APP_IOS_NEWEST_BUILD?: number | undefined;
  APP_IOS_STORE_URL?: string | undefined;
  APP_ANDROID_OLDEST_BUILD?: number | undefined;
  APP_ANDROID_NEWEST_BUILD?: number | undefined;
  APP_ANDROID_STORE_URL?: string | undefined;
};

const SETTINGS = {
  ios: {
    oldest: "APP_IOS_OLDEST_BUILD",
    newest: "APP_IOS_NEWEST_BUILD",
    store: "APP_IOS_STORE_URL",
  },
  android: {
    oldest: "APP_ANDROID_OLDEST_BUILD",
    newest: "APP_ANDROID_NEWEST_BUILD",
    store: "APP_ANDROID_STORE_URL",
  },
} as const satisfies Record<Platform, Record<string, keyof ClientSettings>>;

// A build is the count of the commits of `main` up to the one built, the same on both
// platforms: decision 075.
function buildOf(name: string, value: number | undefined) {
  if (value === undefined) return null;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} takes the number of a build, a whole number from 1, not ${value}`);
  }
  return value;
}

function storeOf(name: string, value: string | undefined) {
  if (value === undefined || value === "") return null;
  if (!URL.canParse(value) || new URL(value).protocol !== "https:") {
    throw new Error(`${name} takes the https address of the app's page in its store`);
  }
  return value;
}

/**
 * The apps for phones the instance answers, from its settings. A setting that cannot be right
 * stops the API when it starts, and names itself: an oldest build above the newest would ask
 * every app to update to a build no store sells.
 */
export function clientsOf(env: ClientSettings): Clients {
  const read = (platform: Platform): Client => {
    const names = SETTINGS[platform];
    const oldestBuild = buildOf(names.oldest, env[names.oldest]);
    const newestBuild = buildOf(names.newest, env[names.newest]);
    if (oldestBuild !== null && newestBuild !== null && oldestBuild > newestBuild) {
      throw new Error(`${names.oldest} is above ${names.newest}: no store sells such a build`);
    }
    return { oldestBuild, newestBuild, storeUrl: storeOf(names.store, env[names.store]) };
  };
  return { ios: read("ios"), android: read("android") };
}
