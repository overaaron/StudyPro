// מטמון של קבצי האפליקציה, כדי שתיפתח גם בלי אינטרנט (הנתונים האחרונים נשמרים בנפרד בטלפון).
// הבקשות ל-Moodle לא עוברות כאן ולא נשמרות במטמון.
// the beta (…/beta/) and the regular app share one site: each keeps and cleans only its own cache
const CH = /\/beta\/$/.test(self.registration.scope) ? "beta-" : "";
const CACHE = "moodle-tasks-" + CH + "v31";
const SHELL = ["./", "index.html", "manifest.json", "icon-192.png", "icon-512.png", "icon-any-192.png", "icon-any-512.png", "apple-touch-icon.png", "favicon-64.png", "badge-96.png", "logo.svg"];
self.addEventListener("install", e => {
  // "reload": straight from the site, not from the browser's own 10-minute cache (else a new version could install an old page)
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  const mine = k => CH ? k.startsWith("moodle-tasks-beta-") : !k.startsWith("moodle-tasks-beta-");
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && mine(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== self.location.origin) return;
  if (/\.mp4$/.test(u.pathname)) return;      // videos go straight to the network (phones ask for them in byte ranges)
  const doc = e.request.mode === "navigate" || /\/(index\.html)?$/.test(u.pathname);
  const fresh = e.request.cache === "reload" || e.request.cache === "no-store";      // "check for a new version": the network's answer, kept
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    // fetched again every time (checked with the site, cheap when unchanged) and kept for the next open
    const net = fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" }).then(async r => {
      if (r.ok) {
        if (doc && hit && !fresh) {                    // the page itself changed: tell the open app a new version is ready
          const [a, b] = await Promise.all([c.match(e.request, { ignoreSearch: true }).then(x => x ? x.text() : ""), r.clone().text()]);
          if (a && a !== b) self.clients.matchAll({ type: "window" }).then(cs => cs.forEach(w => w.postMessage({ type: "updated" })));
        }
        await c.put(e.request, r.clone());
      }
      return r;
    }).catch(() => hit);
    if (fresh) return net.then(r => r || hit);
    return hit || net;
  }));
});
// התראות: השרת שולח את התזכורת בזמן שלה, וכאן היא מוצגת בטלפון. לחיצה פותחת את האפליקציה.
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "StudyPro", {
    body: d.body || "", tag: d.tag || undefined, renotify: !!d.tag, icon: "icon-any-192.png", badge: "badge-96.png", dir: "auto",
    timestamp: d.at || Date.now(), data: { tag: d.tag || "" } }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    const c = cs.find(w => w.url.startsWith(self.registration.scope));
    return c ? c.focus() : self.clients.openWindow(self.registration.scope);
  }));
});
