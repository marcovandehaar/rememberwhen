# The app is served from the NAS, so the media is same-site

The PWA is served by Web Station on `https://nas.vandehaar.dev`, the same origin as the `Media Item`s and the catalogue. Access is gated by HTTP Basic authentication in a `.htaccess` file on the web root, one credential per device, on Web Station's Apache 2.4 back-end. There is no application code in the authorization path.

This reverses a choice that had already been made and acted on. Azure Static Web Apps was the assumed host, an app was created there, and the media spike was deployed to it and measured. The reversal has nothing to do with performance, cost, or the measurements — configuration B worked. It is forced by what Safari does to credentials on a cross-site subresource, established in [issue #13](https://github.com/marcovandehaar/rememberwhen/issues/13) and recorded in `docs/research/authorization-that-survives-img-and-video-in-safari.md`.

The decision to require authorization at all, and against whom, is [issue #15](https://github.com/marcovandehaar/rememberwhen/issues/15). The chain is short: the threat model is a device on the household LAN that is not one of ours; that calls for a real secret rather than an IP allow-list; and once you need a secret, `<img src>` and `<video src>` decide the rest, because you cannot put a header on them.

## Considered options

- **Azure Static Web Apps, with a signed URL or token verified on the NAS.** The only mechanism that survives cross-site, because the credential travels in the URL rather than in a header or a cookie. Rejected on cost and on risk. Synology's nginx is built without `ngx_http_secure_link_module` and without `ngx_http_auth_request_module` — read out of the binary on the device, because DSM strips the configure arguments — so nothing in the web server can verify a signature. That leaves PHP, which must then either stream 20 MB clips and implement `Range` by hand on a box with ~209 MB free, or hand the bytes back to nginx through `X-Accel-Redirect`, which is unproven through a Web Station-generated vhost. It also requires building an enrollment flow and threading a token through every media and catalogue URL — and a credential carried in the URL is exactly the thing that poisons a Service Worker cache, because rotating the secret invalidates every cached entry.
- **Azure, with a `Partitioned` cookie (CHIPS).** Rejected: the partition key is the top-level site, so the cookie has to be minted from inside the Azure partition, which means the first request in that partition is necessarily unauthenticated. CHIPS can maintain a session; it cannot open one.
- **Azure, with a Service Worker attaching an `Authorization` header.** Rejected, and it fails silently: `Authorization` is not on the no-CORS safelist, so Fetch drops it from a `no-cors` request without error. Forcing CORS mode instead drags in a preflight and an `Access-Control-Allow-Origin` from Synology, which [issue #4](https://github.com/marcovandehaar/rememberwhen/issues/4) left undocumented. And there is always a first request before any worker exists.
- **Client certificates (mTLS).** The one credential WebKit explicitly exempts from its cross-origin block, so it would have kept Azure alive. Rejected because DSM cannot require a client certificate on any portal — verified across Synology's own help pages — and because it charges per-device provisioning at every renewal, the same objection that killed the private CA in [ADR 0003](0003-public-dns-pointing-at-a-private-address.md).
- **An IP allow-list, and no secret at all.** DSM supports it natively at zero cost, and against a merely curious houseguest it is proportionate. Rejected because the threat model that justifies protecting these photos at all includes a device in the house that has been taken over, and such a device sits in the same subnet and does not ask politely for an address.
- **No authorization.** The original assumption, made when everything was expected to stay local. Reopened because the NAS acquired a public name, and revisited on the evidence: the name is public but the route is not, so the internet is not in the threat model. What remains is the LAN, and on the LAN the media was reachable with no credential at all.

## Consequences

- **Authorization costs no application code.** Web Station's generated Apache vhost already carries `AllowOverride All` and `AuthConfig`, so `AuthType Basic` in a `.htaccess` is permitted out of the box; Apache 2.4 and PHP 8.x are already installed packages. Switching the portal's back-end from nginx to Apache is a setting, not a project.
- **The threshold covers everything: app shell, catalogue, and media.** One `.htaccess` on the web root. The browser's credential dialog therefore appears *before* the globe paints. Protecting only the media would drop that dialog on top of an already-rendered globe, which is worse.
- **One credential per device**, in an `.htpasswd`. Losing a device means deleting one line, not re-enrolling the household. This capability was not asked for; it came free with the file format.
- **The promise is "type it once per device".** Safari stores the credential and reuses it for same-origin subresources, including `<img>` and `<video>`. It will break eventually — a reinstall, a new device, storage eviction — and the accepted answer is that re-entering it is the same act as the first time. No separate recovery path is built.
- **The app is only available when the NAS is.** This is less of a loss than it appears: the app's entire content lives on the NAS, so a shell that loads while the NAS is asleep has nothing to show. But it does mean the PWA's offline and caching behaviour now carries weight that a CDN would otherwise have absorbed.
- **The Azure work is not wasted.** Configuration B was deployed and measured, and it becomes the recorded failure that justifies this choice rather than an untested alternative. The measurements in [issue #5](https://github.com/marcovandehaar/rememberwhen/issues/5) stand either way.
- **This is reversible only at the price it just charged.** Moving the app off the NAS later means building the token-and-PHP path this ADR rejected. If a future iPad measurement undermines configuration A, that is a legitimate reason to revisit — but nothing else is.
- **Basic authentication is person-shaped and is being used as a device credential.** The secret is typeable rather than provisioned, so anyone who learns it can enrol any device. With 2–4 devices, long random passwords held in a password manager, and a LAN-local threat model, that is proportionate. It would not be if the app ever became reachable from outside the house.
- **The "no code" claim is measured only halfway, and one cost is not costed at all.** That Web Station's generated vhost permits `AuthConfig`, and that Apache 2.4 and PHP 8.x are installed, was read off the device. That the whole thing works — Safari prompting exactly once, `<img>` and `<video>` carrying the credential, range requests surviving, and the failure being visible rather than a silent broken image — has not been seen on the iPad. Nor has the throughput cost of moving the portal from nginx to Apache on a 489 MB box, against the 25.4 MB/s nginx currently manages on a 20 MB clip. [Issue #17](https://github.com/marcovandehaar/rememberwhen/issues/17) settles both, and this ADR is to be amended with what it finds. If the assumption does not hold, the hosting choice reopens with it.
- **No new term enters `CONTEXT.md`.** An enrolled device is not an entity in this system: there is no registration, no lifecycle, and nothing the app knows or shows. There is only HTTP authentication in front of the door. `Media Source` still describes the same seam.

## Amendment, 2026-09-01: the assumption holds, and here is what it cost

[Issue #17](https://github.com/marcovandehaar/rememberwhen/issues/17) measured the half of this ADR that had only been reasoned about. The mechanism works end to end on the household iPad, so the hosting choice stands. But "no application code" hid three lines, one promise was overstated, and one failure mode is worse than this ADR implied.

**What was seen on the device.** iPadOS 18.7.5, WebKit 605.1.15, behind `AuthType Basic` in a `.htaccess` on Web Station's Apache 2.4 back-end, in a Safari tab and as an installed web app:

- `<img>` renders and `<video>` loads metadata, plays and seeks.
- All three range requests Safari actually issues return `206` with a correct `Content-Range`. They are not the ones Chrome issues: WebKit asks `bytes=0-1`, then `bytes=0-19950413`, then `bytes=19922944-19950413` — a two-byte probe followed by two explicitly-terminated ranges, where Chrome sends three open-ended ones.
- The catalogue `fetch()` returns `200`, `cache.put()` stores an authenticated response, and the Service Worker's own `fetch()` is authenticated too.
- The credential travels visibly: the requests a `<video>` element issues reach the Service Worker's fetch handler carrying `credentials: "include"`. This is the request object, not an inference from a picture appearing.
- **Failure is visible.** A wrong credential returns `401` with a `WWW-Authenticate` header readable from script, and for a same-origin subresource in an unknown realm Safari **prompts** rather than continuing with an empty credential. That is the opposite of the cross-origin silence established in [issue #13](https://github.com/marcovandehaar/rememberwhen/issues/13), and it is what this ADR was counting on.
- One line per device works both ways: deleting a line from `.htpasswd` locks out that device and leaves the others at `200`.

**Switching the back-end is a setting, and it cost no memory.** In this DSM the control is Web Station → **Web Service** → *Default Service* → **Edit** → `HTTP back-end server`; the *General Settings* pane the older documentation describes no longer exists. Available memory before and after the switch: **186 MB, unchanged** — because Apache was already resident for the personal-website feature and only needed nginx to point at it. Reverting is the same dropdown.

**The throughput cost is real, small, and charged per request rather than per byte.** Basic authentication hashes once per request regardless of size, so a 20 MB clip absorbs it and a page of photos does not:

| | |
| --- | --- |
| 20 MB clip over HTTPS, 6 runs, no threshold | median 29.9–31.9 MB/s |
| 20 MB clip over HTTPS, 6 runs, **behind the threshold** | median **31.4 MB/s** |
| 50 photos, nginx (the old baseline) | 0.98 and 1.05 s |
| 50 photos, **Apache** | **1.154 s** |
| 200 photos, Apache, no threshold | 4.431 s |
| 200 photos, Apache, **behind the threshold** | **4.893 s** |

So: the back-end change costs 10–15% on many small files, the threshold costs a further **2.3 ms per request**, and on a single large file neither is measurable. The ceiling was never the back-end — TLS in DSM's own nginx caps at ~36 MB/s, while Apache alone serves the same file at 105–127 MB/s. The 25.4 MB/s this ADR worried about was a TLS number all along.

**One hash algorithm choice matters, and the usual advice is backwards here.** `htpasswd` defaults to `apr1`, which costs ~1.7 ms per request. `bcrypt` at its default cost 5 costs **9.7 ms**, and at cost 10 it is unusable — a benchmark of 300 requests did not finish in two minutes. Where a credential is verified once per login bcrypt is right; where it is verified on every media subresource on an 800 MHz ARM box, it is not. **Use `apr1`.**

**"No application code" is true, and it still cost three lines.** None of them is application code, but the phrase concealed them:

1. `crossorigin="use-credentials"` on `<link rel="manifest">`. Without it the browser fetches the manifest with `credentials: omit` and gets a `401`, and the installed app loses its name, icon and display mode.
2. `AddType application/manifest+json .webmanifest` in the `.htaccess`. Apache's `mime.types` does not know the extension and then sends **no `Content-Type` at all**; iOS treats that as no manifest, and the installed app fell back from `display-mode: standalone` to `browser`. nginx did send a type. **This is the one thing the back-end switch demonstrably broke**, and it was found only because the spike measured the installed form.
3. The app must never set `credentials: 'omit'` on a fetch. It returns `401` everywhere, including from inside the Service Worker.

**The promise "type it once per device" was overstated; it is once per session.** Reloading does not re-prompt. Closing the browser and reopening does, in a tab and in the installed app alike. The credential is session-scoped. Marco has accepted this explicitly, and has also accepted using the app in a tab rather than installed, so the mechanism does not change — but the record should not promise more than it delivers.

**A revoked credential produces a cascade of prompts, one per subresource.** With the page already open and the `.htpasswd` line deleted underneath it, Safari raised a password dialog for *each* failing resource in turn: cancelling one brought the next, and the page could not be interacted with until all of them had been dismissed. `<video>` behaves the same as `<img>`. On a story page carrying 200 photos this is 200 dialogs. It is loud rather than silent, which is the safer of the two failure modes, but this ADR's line that re-entering the credential "is the same act as the first time" understates it. Designing around it — one authenticated probe before rendering, and a full page reload on `401` so the browser asks once at document level — belongs to the build, not here.

**The caching consequence has a condition attached.** [Issue #5](https://github.com/marcovandehaar/rememberwhen/issues/5) measured 39 GB of quota on this device and `persist()` returning `true` without any prompt — but only for the **installed** app. In a tab the quota is identical and `persist()` is `false`, so iPadOS may evict the cache. This ADR's claim that the PWA's caching now carries weight a CDN would have absorbed is therefore true of the installed form only. Confirmed to work behind the threshold.

**What this does not change:** the decision. Same-site remains the only shape in which a credential survives Safari on `<img>` and `<video>`, the threshold still costs no application code, and nothing measured undermines configuration A. The hosting choice stands, amended rather than reopened.
