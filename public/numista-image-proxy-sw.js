/**
 * Same-origin proxy for Numista catalogue photos.
 * The browser can load en.numista.com in <img>, but export (html-to-image) needs
 * same-origin bytes. SW fetches from the user's network (not Vercel) and re-serves
 * with CORS so canvas / fetch can read pixels.
 */
const CACHE = "numista-proxy-v1";

function isNumistaPhotoUrl(raw) {
  const s = String(raw || "").trim();
  return /^https:\/\/([a-z]{2}\.)?numista\.com\//i.test(s);
}

async function corsImageResponse(upstream) {
  const blob = await upstream.blob();
  const ct = upstream.headers.get("content-type") || "image/jpeg";
  return new Response(blob, {
    status: 200,
    headers: {
      "Content-Type": ct.split(";")[0].trim() || "image/jpeg",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

self.addEventListener("fetch", (event) => {
  const reqUrl = new URL(event.request.url);
  if (reqUrl.pathname !== "/numista-proxy") return;

  const remote = reqUrl.searchParams.get("url");
  if (!isNumistaPhotoUrl(remote)) {
    event.respondWith(new Response("Invalid Numista url", { status: 400 }));
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const cache = await caches.open(CACHE);
        const cacheKey = new Request(remote);
        const hit = await cache.match(cacheKey);
        if (hit) return corsImageResponse(hit);

        const upstream = await fetch(remote, {
          credentials: "omit",
          redirect: "follow",
          referrerPolicy: "no-referrer",
          headers: {
            Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          },
        });
        if (!upstream.ok) {
          return new Response("Upstream error", { status: 502 });
        }
        await cache.put(cacheKey, upstream.clone());
        return corsImageResponse(upstream);
      } catch {
        return new Response("Proxy error", { status: 502 });
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
