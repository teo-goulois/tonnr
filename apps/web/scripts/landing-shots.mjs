// Takes the pictures of the app that the landing shows, in `public/landing/`: the map with a
// buoy's panel, for each theme and language, on a wide screen and on a phone.
//
// It reads a deployed stage, never a provider, and writes PNG files to a folder of your choice.
// The repository does not depend on a browser driver, so run it from a folder that has one:
//
//   mkdir shots && cd shots && npm install puppeteer-core
//   node <repository>/apps/web/scripts/landing-shots.mjs https://dev.tonnr.app out
//   for f in out/*.png; do cwebp -q 84 -m 6 "$f" -o "${f%.png}.webp"; done
//
// Then copy the WebP files to `apps/web/public/landing/`, make `og.jpg` again from
// `map-light-en` at 1200 by 630, and write the day in `landing_shot_credits`.
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const puppeteer = createRequire(join(process.cwd(), "package.json"))("puppeteer-core");

const [, , origin, out = "out"] = process.argv;
if (!origin) throw new Error("Usage: landing-shots.mjs <origin of a stage> [folder]");

const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// The buoy whose panel is open: `EXAMPLE_STATION` in `src/lib/llms.ts`.
const STATION = { id: "candhis-05602", name: "Belle-Ile" };
// Where the map looks, as the app keeps it: longitude, latitude, zoom.
const WIDE = { name: "map", width: 1280, height: 800, scale: 2, view: [-5.2, 46.6, 4.75] };
const PHONE = { name: "phone", width: 390, height: 780, scale: 3, view: [-3.6, 46.9, 5.1] };

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--hide-scrollbars", "--force-color-profile=srgb"],
});

for (const locale of ["en", "fr"]) {
  for (const theme of ["light", "dark"]) {
    for (const shot of [WIDE, PHONE]) {
      const isPhone = shot === PHONE;
      const page = await browser.newPage();
      await page.setViewport({
        width: shot.width,
        height: shot.height,
        deviceScaleFactor: shot.scale,
        isMobile: isPhone,
        hasTouch: isPhone,
      });
      await page.emulateMediaFeatures([
        { name: "prefers-color-scheme", value: theme },
        { name: "prefers-reduced-motion", value: "reduce" },
      ]);
      await page.evaluateOnNewDocument(
        (chosen, view) => {
          localStorage.setItem("theme", chosen);
          localStorage.setItem("tonnr:map-view", JSON.stringify(view));
          localStorage.setItem(
            "analytics-consent",
            JSON.stringify({ choice: "denied", at: Date.now() }),
          );
        },
        theme,
        shot.view,
      );

      // A phone opens the panel low when its buoy is pressed on the map, and raised from a link.
      const path = `${locale === "fr" ? "/fr" : ""}/app${isPhone ? "" : `?station=${STATION.id}`}`;
      await page.goto(origin + path, { waitUntil: "networkidle2", timeout: 60_000 });
      await wait(6000);
      if (isPhone) {
        await page.evaluate((name) => {
          const labelled = (button) => (button.getAttribute("aria-label") ?? "").startsWith(name);
          [...document.querySelectorAll("button")].find(labelled)?.click();
          const credits = document.querySelector(".maplibregl-ctrl-attrib");
          if (credits?.classList.contains("maplibregl-compact-show")) {
            credits.querySelector("button, summary")?.click();
          }
        }, STATION.name);
        await wait(4000);
      }

      await page.screenshot({ path: join(out, `${shot.name}-${theme}-${locale}.png`) });
      await page.close();
    }
  }
}
await browser.close();
