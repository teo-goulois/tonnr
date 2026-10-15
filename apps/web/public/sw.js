// The service worker of the web app. It does two things: it shows what the instance pushes to
// this browser, and it opens the page a notification names when it is pressed. It keeps nothing
// for use offline, and answers no request. The web app registers it when push is switched on,
// and not before. Decision 031, "Push".

// Where a notification leads when it names no page of the web app.
const HOME = "/app";
// The picture beside a notification: the app's icon, as the manifest gives it.
const ICON = "/web-app-manifest-192x192.png";

// A newer worker takes the place of the one before at once: it holds nothing to hand over.
self.addEventListener("install", () => self.skipWaiting());
// It takes the pages that are open, so that a notification can lead one of them to its page.
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// What a push holds: `{ title, body, url, tag }`, all text. Anything else is no alert's push:
// one with nothing in it, what is no JSON, and what is no such object all end the same way.
function read(data) {
  try {
    const sent = data.json();
    const isText = (value) => typeof value === "string";
    if (!isText(sent.title) || sent.title.trim() === "" || !isText(sent.body)) return null;
    if (!isText(sent.url) || !isText(sent.tag)) return null;
    return { title: sent.title, body: sent.body, url: sent.url, tag: sent.tag };
  } catch {
    return null;
  }
}

// What is shown for a push that could not be read: a plain line, in the browser's language.
const PLAIN = {
  en: "One of your alerts has news",
  fr: "Une de tes alertes a du nouveau",
  es: "Una de tus alertas tiene novedades",
  pt: "Um dos teus alertas tem novidades",
};

function plain() {
  const language = (self.navigator.language || "").toLowerCase().split("-")[0];
  return {
    title: Object.hasOwn(PLAIN, language) ? PLAIN[language] : PLAIN.en,
    body: "",
    url: HOME,
    tag: "alert",
  };
}

function show(push) {
  return self.registration.showNotification(push.title, {
    body: push.body,
    icon: ICON,
    data: { url: push.url },
    // A newer word on the same thing takes the older one's place, and is announced as news.
    ...(push.tag === "" ? {} : { tag: push.tag, renotify: true }),
  });
}

// A push is always shown: a browser that is sent one and shows nothing takes its leave back.
self.addEventListener("push", (event) => {
  const push = read(event.data) ?? plain();
  event.waitUntil(show(push).catch(() => show(plain())));
});

// The page a notification names, when it is one of the web app's own. Its home otherwise.
function pageOf(url) {
  const home = new URL(HOME, self.location.origin).href;
  if (typeof url !== "string" || url.trim() === "") return home;
  try {
    const page = new URL(url, self.location.origin);
    return page.origin === self.location.origin ? page.href : home;
  } catch {
    return home;
  }
}

// Brings forward a window of the app that is open and takes it to the page, or opens one.
async function open(page) {
  // A window that was opened while the worker was let go of is not the worker's yet, and one
  // that is not cannot be led: the worker takes those that are open first.
  await self.clients.claim().catch(() => undefined);
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const ours = windows
    .filter((one) => new URL(one.url).origin === self.location.origin)
    // The one in front first, then one that shows.
    .sort(
      (a, b) =>
        Number(b.focused) - Number(a.focused) ||
        Number(b.visibilityState === "visible") - Number(a.visibilityState === "visible"),
    );
  for (const one of ours) {
    let led;
    try {
      led = one.url === page ? one : await one.navigate(page);
    } catch {
      // A window this worker does not control cannot be led anywhere: the next one, or a new one.
      continue;
    }
    if (!led) continue;
    // The window is at the page. A press on a notification gives leave to bring one window
    // forward: were it refused, opening another would be refused the same.
    return led.focus().catch(() => led);
  }
  return self.clients.openWindow(page);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data;
  event.waitUntil(open(pageOf(data && data.url)));
});
