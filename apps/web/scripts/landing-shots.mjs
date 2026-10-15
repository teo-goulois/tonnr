// Takes the pictures of the landing, in every language of `project.inlang/settings.json`, so that a
// language added there has its own on the next run:
//
// - `public/landing/hero-map-<theme>-<locale>.webp`, the map the top of the landing stands on, in
//   each theme: `LandingHero` shows the one of the reader's.
// - `public/landing/og-<locale>.jpg`, the picture a link to the site is shown with: the top of the
//   landing itself, in the light theme, taken after the maps above, which it shows.
// - `public/landing/og-invite-<locale>.jpg`, the picture an account's link is shown with: the
//   development page `/og/invite`, which shows the map above too. Run the app in development.
//
// It reads a running app, local or deployed, never a provider. The repository does not depend on a
// browser driver, so run it from a folder that has one:
//
//   mkdir shots && cd shots && npm install puppeteer-core
//   node <repository>/apps/web/scripts/landing-shots.mjs https://tonnr.localify
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const puppeteer = createRequire(join(process.cwd(), "package.json"))("puppeteer-core");

const [, , origin] = process.argv;
if (!origin) throw new Error("Usage: landing-shots.mjs <origin of the web app>");

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(WEB, "public/landing");
const { baseLocale, locales } = JSON.parse(
  readFileSync(join(WEB, "project.inlang/settings.json"), "utf8"),
);

const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// The map behind the landing: the Bay of Biscay and the Channel, where the map looks, as the app
// keeps it: longitude, latitude, zoom. `MAP` in `landing-hero.tsx` says its size.
const MAP = { width: 1695, height: 995, scale: 2, view: [-10.35, 46.55, 5.38] };
// What the map draws there: the sea and its buoys and breaks, without the arrows of the waves'
// direction, which the picture is too small to read. `DEFAULT_LAYERS` in `routes/app/index.tsx`.
const LAYERS = { sea: true, arrows: false, buoys: true, wind: false, breaks: true };
// The picture of a shared link, at the size its sites ask for.
const SHARED = { width: 1200, height: 630, scale: 1 };

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const prefix = (locale) => (locale === baseLocale ? "" : `/${locale}`);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--hide-scrollbars", "--force-color-profile=srgb"],
});

async function open({ width, height, scale }, theme, view) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: scale });
  await page.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: theme },
    { name: "prefers-reduced-motion", value: "reduce" },
  ]);
  await page.evaluateOnNewDocument(
    (chosen, place, layers) => {
      localStorage.setItem("theme", chosen);
      if (place) {
        localStorage.setItem("tonnr:map-view", JSON.stringify(place));
        localStorage.setItem("tonnr:map-layers", JSON.stringify(layers));
      }
      localStorage.setItem(
        "analytics-consent",
        JSON.stringify({ choice: "denied", at: Date.now() }),
      );
    },
    theme,
    view,
    LAYERS,
  );
  return page;
}

for (const locale of locales) {
  for (const theme of ["light", "dark"]) {
    const page = await open(MAP, theme, MAP.view);
    await page.goto(`${origin}${prefix(locale)}/app`, {
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    await wait(6000);
    // The map's credits fold into their button, as a reader finds them.
    await page.evaluate(() =>
      document
        .querySelector(".maplibregl-ctrl-attrib")
        ?.classList.remove("maplibregl-compact-show"),
    );
    const path = join(OUT, `hero-map-${theme}-${locale}.webp`);
    await page.screenshot({ path, type: "webp", quality: 72 });
    await page.close();
    console.log(path);
  }
}

for (const locale of locales) {
  const page = await open(SHARED, "light");
  await page.goto(`${origin}${prefix(locale)}/`, { waitUntil: "networkidle2", timeout: 60_000 });
  await wait(2000);
  const path = join(OUT, `og-${locale}.jpg`);
  await page.screenshot({ path, type: "jpeg", quality: 85 });
  await page.close();
  console.log(path);
}

for (const locale of locales) {
  const page = await open(SHARED, "light");
  await page.goto(`${origin}${prefix(locale)}/og/invite`, {
    waitUntil: "networkidle2",
    timeout: 60_000,
  });
  await wait(1000);
  const path = join(OUT, `og-invite-${locale}.jpg`);
  await page.screenshot({ path, type: "jpeg", quality: 85 });
  await page.close();
  console.log(path);
}

await browser.close();
