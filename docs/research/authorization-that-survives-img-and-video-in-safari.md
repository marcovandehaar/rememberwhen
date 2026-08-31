# Authorization that survives `<img>` and `<video>` in Safari on iPadOS

Research note for issue [#13](https://github.com/marcovandehaar/rememberwhen/issues/13). Written 2026-08-31.
WebKit source checked against `WebKit/WebKit` trunk (`main`) on that date; latest Safari release notes
available at the time of writing: Safari 26.6. Every claim below is linked to the source that owns it;
anything I could not establish from a primary source is marked **[UNESTABLISHED]** or flagged as secondary.

This note reports what is *possible*. It deliberately does not recommend a mechanism — that is
[#15](https://github.com/marcovandehaar/rememberwhen/issues/15), and it needs a threat model first.

## The question

`rememberwhen` renders `Media Item`s through `<img src>` and `<video src>`, chosen deliberately
(`docs/research/cinematic-story-building-blocks.md`). **You cannot set a request header on those
elements.** The media lives on a DS120j behind `https://nas.vandehaar.dev`, a public name resolving to a
private address with a publicly-trusted wildcard certificate and no inbound port
([ADR 0003](../adr/0003-public-dns-pointing-at-a-private-address.md), `docs/runbooks/nas-certificaat.md`).

Two candidate hostings for the PWA itself:

- **Configuration A — same-origin.** App at `https://nas.vandehaar.dev/spike/`, media at
  `https://nas.vandehaar.dev/media/…`. One origin, one site.
- **Configuration B — cross-site.** App at `https://<name>.azurestaticapps.net`, media at
  `https://nas.vandehaar.dev/media/…`. Different origin *and* different site — `azurestaticapps.net` is on
  the [Public Suffix List](https://publicsuffix.org/list/public_suffix_list.dat) (private section, under
  "Microsoft Azure"), so `<name>.azurestaticapps.net` is a registrable domain of its own.

Which authorization mechanisms survive that, and which can a DS120j actually enforce?

## Verdict

**There is exactly one mechanism that works cross-site in Safari with no caveats, and it is the one that
puts the credential in the URL.** A signed URL (HMAC + expiry in the query string) is carried by an `<img>`
or `<video>` request by construction, because it is not a header and not a cookie. Everything else either
fails cross-site or fails on the DS120j.

Specifically, in configuration B:

- **Unpartitioned cookies are gone. Not weakened — gone.** WebKit's default third-party cookie blocking
  mode is `ThirdPartyCookieBlockingMode::All`, decided per request in
  [`NetworkStorageSession.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/network/NetworkStorageSession.cpp),
  and `SameSite` does not enter that decision at any point. WebKit's own words: *"ITP by default blocks all
  third-party cookies. There are no exceptions to this blocking."*
  ([Tracking Prevention in WebKit](https://webkit.org/tracking-prevention/))
- **`Partitioned` cookies (CHIPS) are the one live cookie path**, shipped in Safari 26.2 and on by default.
  But the partition key is the *top-level* site, so the cookie must be minted from inside the Azure
  partition — which means the first request in that partition is necessarily unauthenticated. CHIPS can
  maintain a session; it cannot open one.
- **HTTP Basic/Digest cannot work cross-origin.** WebKit refuses to prompt for a cross-origin subresource
  and proceeds with an *empty* credential, and its session credential store is keyed by the top-level
  registrable domain, so a credential learned on `nas.vandehaar.dev` is not found under
  `azurestaticapps.net`.
- **A service worker cannot rescue it cheaply.** A worker can only add `Authorization` to a **CORS-mode**
  request — on a `no-cors` request the header is *silently dropped* — which drags in a preflight and
  `Access-Control-Allow-Origin` on the NAS, and Synology has no documented way to send response headers
  (see `docs/research/local-network-access-ipados.md` §3, still open). And there is always a first,
  uncontrolled request before any worker exists.
- **mTLS is the surprise.** WebKit explicitly exempts client-certificate challenges from the cross-origin
  credential block, so mTLS is the one credential type Safari does *not* suppress on a cross-origin
  subresource. It fails on the other side instead: **DSM cannot require a client certificate on any
  portal.**

In configuration A everything gets easy. A plain first-party cookie is carried by `<img>` and `<video>`
with no special attributes, HTTP Basic works with a stored credential, and the NAS can enforce
per-directory authentication using a documented Synology recipe.

**So the honest answer to the question the ticket puts head-on is: cross-site, only the URL-borne
credential works — and the DS120j can only verify it by putting PHP in the media path.** Same-site,
several mechanisms work and the NAS can enforce two of them out of the box. That is a real argument for
configuration A, and it is an argument #5 has not yet weighed.

---

## Capability matrix

Legend: **yes** = established from a primary source; **no** = established that it does not work;
**?** = [UNESTABLISHED], probe listed in §8.

| Mechanism | Same-site (A) | Cross-site (B) | Can the DS120j enforce it | Cost |
|---|---|---|---|---|
| **Cookie, no `Partitioned`** | **yes** — first-party, any `SameSite`, `Secure` | **no** — blocked, no exception, `SameSite` irrelevant | **?** — DSM has no cookie-issuing surface; needs PHP | low (A) |
| **Cookie, `Partitioned` (CHIPS)** | n/a (unnecessary) | **partly** — carried once set, but cannot gate the first request in the partition | **?** — needs PHP to `Set-Cookie`, plus CORS for the bootstrap `fetch()` | high: PHP + CORS + a second credential to bootstrap |
| **Storage Access API** | n/a | **no** — requires a nested document and user activation; grant covers only that document's own requests | n/a | n/a |
| **`requestStorageAccessFor()`** | n/a | **no** — not implemented in WebKit; and the proposal itself requires `crossorigin="use-credentials"` | n/a | n/a |
| **Signed URL (HMAC + expiry in query)** | **yes** | **yes** | **?** — not via nginx (`secure_link` unconfigurable), not via `.htaccess`; **yes via PHP**, which must then stream the bytes and implement `Range` itself | medium–high: PHP in the media path on a 489 MB box |
| **Credentials in the URL (`https://u:p@host/…`)** | **yes** | **?** — WebKit answers the 401 from the URL without prompting; no cross-origin block found | **yes** — Apache back-end + `.htaccess` (Synology-documented) | low, but the secret is a *static* password in every URL |
| **HTTP Basic / Digest, stored credential** | **yes** (after one modal prompt) | **no** — no prompt cross-origin, and the credential store is partitioned by top-level domain | **yes** — Apache back-end + `.htaccess` (Synology-documented) | a system password dialog on first load |
| **Client certificate (mTLS)** | **yes** (browser side) | **yes** (browser side) — challenge is exempt from the cross-origin block | **no** — no client-certificate option anywhere in DSM | per-device profile install + a private CA; ADR 0003 already rejected that shape |
| **Service worker re-issuing with `Authorization`** | **yes** (but pointless — same-site is already solved) | **no in practice** — forces CORS mode + preflight + `Access-Control-Allow-Origin`, which Synology cannot documentably send; plus an uncontrolled first request | **?** | high |
| **Source-IP allow list** | **yes** | **yes** — origin-blind, it is a network control | **yes** — Login Portal → Advanced → Access Control Profile | free, but it authorizes the *house*, not the *user* |

---

## Settled on the device, 2026-08-31

Three of the questions §8 lists as probes were answered on the NAS itself the same day this note was
written, over SSH. They change matrix cells, so they belong up here rather than in a footnote.

**Probe 1 — Synology's nginx does *not* have `secure_link`.** `nginx -V` on DSM prints no configure
arguments at all (Synology strips them), and `strings` is not present on the box, so the module list was
read straight out of the binary:

```sh
grep -aoE "ngx_http_[a-z_]+_module" /usr/bin/nginx | sort -u
```

nginx 1.23.1, 51 modules. **`ngx_http_secure_link_module` is absent. So is
`ngx_http_auth_request_module`**, which rules out delegating the check to a subrequest as well. Present and
relevant: `auth_basic`, `headers_filter` (`add_header`), `realip`, `access`, `proxy`, and both
`range_header_filter` / `range_body_filter`.

This closes §3.3 in the negative: **nginx cannot verify a signed URL on this box, whatever Web Station's UI
does or does not expose.** The signed-URL route needs something else in the path.

**Probe 3 — Apache 2.4 and PHP are already installed.** `/var/packages` lists `Apache2.4`, `PHP8.0`,
`PHP8.2`, `PHP8.3` alongside `WebStation`, with `php82`/`php83` FPM and CGI binaries in
`/usr/local/bin`. That lowers the cost of both the `.htaccess` route (§4.3) and the PHP route (§3.3) from
"install and maintain a package" to "point the portal at a different back-end". It does not change what
either can *enforce* — only what it costs to get there.

**A by-product for note #4.** `ngx_http_headers_filter_module` is compiled in, so the nginx on this box
*can* emit `add_header`. The open question in `local-network-access-ipados.md` §3 — whether Synology can be
made to send CORS response headers — is therefore about what the UI exposes and what survives a DSM update,
not about whether the server is capable of it.

### One route this note did not consider, worth a probe

**PHP verifies, nginx serves: `X-Accel-Redirect`.** The objection to the signed-URL route is that PHP ends
up streaming 20 MB clips and implementing `Range` itself on a box with ~209 MB free. nginx has a standard
way out of exactly that: the application returns a tiny response carrying `X-Accel-Redirect: /internal/...`
and nginx serves the file from an `internal` location, handling `Range` and `sendfile` natively. PHP then
never touches a byte of media — it only checks the HMAC.

`ngx_http_proxy_module` (which owns `X-Accel-Redirect`) and both range filters are present, so the server
side is capable. **[UNESTABLISHED]:** whether an `internal` location can be added to a Web Station-generated
vhost and survive a DSM update, and whether Web Station's PHP is wired through nginx (`fastcgi`) rather
than through the Apache back-end, which would need `mod_xsendfile` instead — and that is not in the package
list. If it works, it removes the main cost from the only mechanism that survives cross-site.


## 1. What an `<img>` and a `<video>` actually send

This is the foundation everything else sits on, and it is worth pinning down exactly, because it is more
generous than people assume.

**At spec level.** HTML's
[create a potential-CORS request](https://html.spec.whatwg.org/multipage/urls-and-fetching.html#create-a-potential-cors-request)
says: *"Let mode be `no-cors` if corsAttributeState is No CORS … Let credentialsMode be `include`. If
corsAttributeState is Anonymous, set credentialsMode to `same-origin`. Return a new request whose … mode is
mode, credentials mode is credentialsMode, and whose **use-URL-credentials flag is set**."* The
`crossorigin` attribute's *"missing value default is the No CORS state"*. `<video>` uses the same algorithm:
the media element's resource fetch algorithm builds *"the result of creating a potential-CORS request given
current media resource's URL record, destination, and the current state of the media element's crossorigin
content attribute"* ([HTML, media elements](https://html.spec.whatwg.org/multipage/media.html)).

So without `crossorigin`, both elements produce a request with **mode `no-cors`, credentials mode
`include`, and the use-URL-credentials flag set**.

Fetch then turns credentials mode `include` into an actual credential attachment. In
[HTTP-network-or-cache fetch](https://fetch.spec.whatwg.org/):

> Let includeCredentials be true if one of — request's credentials mode is "`include`"; request's
> credentials mode is "`same-origin`" and request's response tainting is "`basic`" — is true; otherwise
> false.

> If includeCredentials is true, then: Append a request `Cookie` header for httpRequest. If httpRequest's
> header list does not contain `Authorization`, then: … If there's an authentication entry for httpRequest
> and either httpRequest's use-URL-credentials flag is unset or httpRequest's current URL does not include
> credentials, then set authorizationValue to authentication entry. Otherwise, if httpRequest's current URL
> does include credentials and isAuthenticationFetch is true, set authorizationValue to httpRequest's
> current URL, converted to an `Authorization` value.

And Fetch defines credentials broadly: *"Credentials are HTTP cookies, TLS client certificates, and
authentication entries (for HTTP authentication)."* **All three are in scope for a plain `<img>`.**

**At WebKit level.** The same three are switched on. For images, `ImageLoader` starts from
`CachedResourceLoader::defaultCachedResourceOptions()`, which is
([`CachedResourceLoader.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/loader/cache/CachedResourceLoader.cpp)):

```cpp
static NeverDestroyed<ResourceLoaderOptions> options(
    SendCallbackPolicy::SendCallbacks,
    ContentSniffingPolicy::SniffContent,
    DataBufferingPolicy::BufferData,
    StoredCredentialsPolicy::Use,
    ClientCredentialPolicy::MayAskClientForCredentials,
    FetchOptions::Credentials::Include,
    SecurityCheckPolicy::DoSecurityCheck,
    FetchOptions::Mode::NoCors,
    ...
```

For media, `MediaResourceLoader::requestResource` builds the identical set by hand
([`MediaResourceLoader.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/loader/MediaResourceLoader.cpp)):
`StoredCredentialsPolicy::Use`, `ClientCredentialPolicy::MayAskClientForCredentials`,
`FetchOptions::Credentials::Include`, `FetchOptions::Mode::NoCors`.

**Both go through the service worker.** `ImageLoader` sets
`options.serviceWorkersMode = ServiceWorkersMode::All` explicitly; `MediaResourceLoader` leaves the
default, which
[`ResourceLoaderOptions.h`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/loader/ResourceLoaderOptions.h)
initialises to `serviceWorkersMode(ServiceWorkersMode::All)`. That is the source-level corroboration of what
was measured on the device in #5.

The upshot: **the element is willing to carry a cookie, an HTTP auth entry, a URL credential and a TLS
client certificate.** Everything that follows is about what strips them.

---

## 2. Cookies

### 2.1 The blocking decision, in code

WebKit decides per request, in
[`NetworkStorageSession::thirdPartyCookieBlockingDecisionForRequest`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/network/NetworkStorageSession.cpp):

```cpp
    RegistrableDomain firstPartyDomain { firstPartyForCookies };
    ...
    RegistrableDomain resourceDomain { resource };
    ...
    if (firstPartyDomain == resourceDomain)
        return ThirdPartyCookieBlockingDecision::None;
    ...
    if (hasStorageAccess(resourceDomain, firstPartyDomain, grantFrameID, pageID) && !isInitiatedByDedicatedWorker)
        return ThirdPartyCookieBlockingDecision::None;
    ...
    switch (m_thirdPartyCookieBlockingMode) {
    case ThirdPartyCookieBlockingMode::All:
        return ThirdPartyCookieBlockingDecision::All;
    ...
    case ThirdPartyCookieBlockingMode::AllExceptPartitioned:
        return (isOptInCookiePartitioningEnabled() && isKnownCrossSiteTracker == IsKnownCrossSiteTracker::No)
            ? ThirdPartyCookieBlockingDecision::AllExceptPartitioned : ThirdPartyCookieBlockingDecision::All;
```

Four things follow directly, and they answer most of thread 1:

1. **The comparison is on registrable domain, and the request's `destination` is nowhere in it.** A
   subresource `<img>` request and a document navigation take the same path. There is no subresource
   exemption.
2. **`SameSite` is not consulted.** `SameSite` governs what a *server* asks for; the third-party block
   happens before that, on the client. A `SameSite=None; Secure` cookie for `vandehaar.dev` is blocked on
   an `azurestaticapps.net` page just as thoroughly as a `SameSite=Lax` one.
3. **The default mode is `All`.** `m_thirdPartyCookieBlockingMode { ThirdPartyCookieBlockingMode::All }` in
   [`NetworkStorageSession.h`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/network/NetworkStorageSession.h).
   `WebsiteDataStore` then upgrades it to `AllExceptPartitioned` when CHIPS is on:
   *"OptInCookiePartitioning enabled, setting ThirdPartyCookieBlockingMode::AllExceptPartitioned"*
   ([`WebsiteDataStore.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/WebsiteData/WebsiteDataStore.cpp)).
4. **Configuration A is decided on the first line.** `firstPartyDomain == resourceDomain` →
   `ThirdPartyCookieBlockingDecision::None`, before any policy is consulted.

The policy statement matches: *"ITP by default blocks all third-party cookies. There are no exceptions to
this blocking"*, and *"Third-party cookie access can only be granted through the Storage Access API and the
temporary compatibility fix for popups"*
([Tracking Prevention in WebKit](https://webkit.org/tracking-prevention/)); *"Cookies for cross-site
resources are now blocked by default across the board"*
([Full Third-Party Cookie Blocking and More](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)).

### 2.2 CHIPS: the one cookie that does cross the line

CHIPS is shipped and on by default. In
[`UnifiedWebPreferences.yaml`](https://github.com/WebKit/WebKit/blob/main/Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml):

```yaml
OptInPartitionedCookiesEnabled:
  type: bool
  status: stable
  humanReadableName: "Opt-in partitioned cookies (CHIPS)"
  defaultValue:
    WebKitLegacy: { default: true }
    WebKit:       { default: true }
    WebCore:      { default: true }
```

`status: stable`, default `true` on every frontend. The shipping history is messy and worth knowing:
CHIPS first shipped in Safari 18.4 ([WebKit Features in Safari 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)),
was pulled in 18.5 — John Wilander on
[WebKit bug 292975](https://bugs.webkit.org/show_bug.cgi?id=292975): *"We unfortunately had to turn CHIPS
off due to a serious bug that was too complex to address in the software update"* — and returned in 26.2:
*"Safari 26.2 ships support for CHIPS (Cookies Having Independent Partitioned State)"*
([WebKit Features for Safari 26.2](https://webkit.org/blog/17640/webkit-features-for-safari-26-2/)). WebKit's
standards position on CHIPS is `position: support`
([standards-positions #50](https://github.com/WebKit/standards-positions/issues/50)).

Requirements, from the WebKit blog: the `Partitioned` attribute plus `SameSite=None` plus `Secure`, and
*"these attributes are required for a `Partitioned` cookie, and the cookie will be blocked if those
attributes are not set"*. Partitioning is **by site, not origin**: *"news.siteA.example and
mail.siteA.example share the same partition since they're subdomains of siteA.example."*

The partition key is what decides whether this is useful.
[The CHIPS explainer](https://github.com/privacycg/CHIPS/blob/main/README.md):

> A cookie's partition key is the site (i.e. scheme and registrable domain) of the top-level URL the browser
> was visiting at the start of the request to the endpoint that set the cookie. … Browsers must only send a
> cookie with the `Partitioned` attribute in requests with the same partition key as that cookie.

> **Note:** If this is a first-time request to the third-party with a different partition key, no cookies
> would be sent. In other words, the third-party would get a new identifier for each top-level context.

**That note is the whole problem.** In configuration B the cookie must be minted by a response served while
`<name>.azurestaticapps.net` is the top-level site. That first request cannot itself carry the cookie, so it
must be allowed through on some *other* credential. A visit to `https://nas.vandehaar.dev` as a top-level
page does not help: the cookie set there is either unpartitioned (blocked later) or partitioned under
`vandehaar.dev`, which is the wrong partition.

There is a workable shape, and it is worth writing down precisely because it is the only cross-site cookie
design that holds up: the app does a scripted `fetch()` to a session endpoint on the NAS carrying a
credential a script *can* set (an `Authorization` header, or a signed URL), and that response returns
`Set-Cookie: …; SameSite=None; Secure; Partitioned`; subsequent `<img>` and `<video>` requests then carry
it. The costs are real and stack up: the bootstrap `fetch()` is cross-origin CORS mode with
`credentials: "include"`, so the NAS must send `Access-Control-Allow-Origin` with the exact app origin (not
`*`) and `Access-Control-Allow-Credentials: true` (Fetch's rules, and see
`docs/research/local-network-access-ipados.md` §3); an `Authorization` header forces a preflight, because
*"a CORS non-wildcard request-header name is a header name that is a byte-case-insensitive match for
`Authorization`"*; and you still need the underlying credential, so CHIPS buys convenience, not
authorization. **[UNESTABLISHED]:** whether this end-to-end sequence actually works on an iPad — I
established each link from a primary source, but not the chain. It should be measured before anyone
designs on it.

### 2.3 Storage Access API: not applicable, and not close

[The Storage Access API](https://privacycg.github.io/storage-access/) is for authenticated *embeds*. Two
requirements rule it out here: the calling document must be in a third-party context (*"a `Document` is in
a third party context if it is not in a first-party-site context"*) — i.e. an iframe, which
`rememberwhen` does not have and does not want — and there must be user activation. And the grant is
narrow: *"only give access to unpartitioned data to the nested `Document` that called
`requestStorageAccess()` and only until the nested `Document` navigates across an origin boundary."*
Subresource requests issued by the top-level document are not covered.

The API designed for exactly our shape is `document.requestStorageAccessFor()`. **WebKit does not implement
it.** [`Document+StorageAccess.idl`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/dom/Document%2BStorageAccess.idl)
exposes only:

```webidl
partial interface Document {
    Promise<boolean> hasStorageAccess();
    Promise<undefined> requestStorageAccess();
};
```

and there is no `requestStorageAccessFor` preference in `UnifiedWebPreferences.yaml`. Even if it shipped it
would not help a plain `<img>`: the
[proposal's own worked example](https://github.com/privacycg/requestStorageAccessFor/blob/main/README.md)
sets `img.crossOrigin = 'use-credentials'` with the comment *"CORS would be required for the SameSite=None
cookies to be attached. This helps protect the embeddee from attacks by the embedder."*

### 2.4 The installed web app

Nothing in §2.1–§2.3 branches on display mode; the code above never consults it. What *is* different is
storage identity, and it cuts both ways.

From [Tracking Prevention in WebKit](https://webkit.org/tracking-prevention/):

> The first-party domain of home screen web applications is exempt from ITP's 7-day cap on all
> script-writeable storage, i.e. ITP always skips that domain in its website data removal algorithm. In
> addition, the website data of home screen web applications is kept isolated from Safari and thus will not
> be affected by ITP's classification of tracking behavior in Safari.

So: **a cookie obtained in a Safari tab does not exist in the installed app.** Every test must be repeated
in the installed app, and any bootstrap flow must be able to run again from zero inside it.

The 7-day cap itself is about script-writeable storage — *"ITP deletes all cookies created in JavaScript
and all other script-writeable storage after 7 days of no user interaction with the website. The latter
storage forms are: IndexedDB, LocalStorage, Media keys, SessionStorage, Service Worker registrations and
cache."* A cookie set by a `Set-Cookie` response header is not "created in JavaScript". The exemption above
covers the app's own first-party domain; **[UNESTABLISHED]** whether a *third-party partitioned* cookie
living under that partition inherits the exemption.

### 2.5 A same-site trap worth knowing about

There is one ITP rule that can bite configuration A if the app is ever split across two hostnames under
`vandehaar.dev`. From the same page: *"ITP detects third-party CNAME cloaking and third-party IP address
cloaking requests and caps the expiry of any cookies set in the HTTP response to 7 days."*

The implementation is in
[`NetworkTaskCocoa.mm`](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/NetworkProcess/cocoa/NetworkTaskCocoa.mm),
under the comment:

```cpp
    // Cap expiry of incoming cookies in response if it is a same-site subresource but
    // it resolves to a different CNAME or IP address range than the top site request,
    // i.e. third-party CNAME or IP address cloaking.
```

and the IP comparison demands an exact match:

```cpp
static bool shouldCapCookieExpiryForThirdPartyIPAddress(const WebCore::IPAddress& remote, const WebCore::IPAddress& firstParty)
{
    auto matchingLength = remote.matchingNetMaskLength(firstParty);
    if (remote.isIPv4())
        return matchingLength < 4 * sizeof(struct in_addr);
    ...
```

`4 * sizeof(struct in_addr)` is 32 bits for IPv4 — every bit must match. **In configuration A as specified,
app and media are the same host on the same address, so no cap applies.** But if the app were later moved
to, say, `app.vandehaar.dev` behind Cloudflare while the media stayed on `nas.vandehaar.dev` at
`192.168.0.137`, that is a same-site subresource resolving to a different address, and every cookie the NAS
sets would silently be capped to 7 days. Cheap to avoid; expensive to debug.

---

## 3. Signed URLs

### 3.1 Browser side: works everywhere, by construction

Nothing in §2 applies. The credential is part of the URL, so it is carried by `<img src>` and `<video src>`
in both configurations, in a tab and in the installed app, with no headers, no cookies, no CORS and no
prompt. There is nothing to establish on the browser side beyond that; this is the mechanism's whole
appeal.

Two second-order effects are worth stating, though.

### 3.2 What an expiring URL does to caches

**The HTTP cache misses on every re-sign.** [RFC 9111 §2](https://www.rfc-editor.org/rfc/rfc9111.html):
*"The 'cache key' is the information a cache uses to choose a response and is composed from, at a minimum,
the request method and target URI used to retrieve the stored response … many HTTP caches in common use
today only cache GET responses and therefore only use the URI as the cache key."* A new signature is a new
URI is a new entry. On ~500 KB JPEGs that is tolerable; on ~20 MB `.mov` clips fetched in three range
requests each, it is the dominant cost of the mechanism.

**The service worker `Cache` misses too, unless you normalise the key yourself.** `Cache.put` stores under
the request as given; only the *lookup* side takes options. From the
[Service Workers specification](https://w3c.github.io/ServiceWorker/), `CacheQueryOptions` is
`{ ignoreSearch, ignoreMethod, ignoreVary }`, and the Query Cache algorithm says: *"If options
[`ignoreSearch`] is true, then: Set cachedURL's query to the empty string. Set queryURL's query to the empty
string."* `put()` has no such option. So the workable pattern is to store under a canonical, unsigned URL —
`cache.put(new Request(canonicalUrl), response)` — and answer from it, letting the signature exist only on
the wire. That also sidesteps a nasty accumulation: without normalisation, every re-sign adds a full copy of
the media to the origin's quota.

Two hard limits from the same spec that bound any caching design here:

- `put()`: *"If innerResponse's status is 206, return a promise rejected with a TypeError"*, plus rejections
  for a non-`GET` method, a non-`http(s)` scheme, `Vary: *`, and a disturbed or locked body.
- `addAll()`: *"If response's type is `error`, or response's status is not an ok status or is 206, reject
  responsePromise with a TypeError"* — an opaque response has status `0`, which is not an ok status, so
  `addAll` cannot precache cross-origin media at all. This was already established in
  `docs/research/local-network-access-ipados.md` §5 and is unchanged.

And one trap that only shows up with media, from the [Fetch Standard](https://fetch.spec.whatwg.org/):

> If response's type is "`opaque`", internalResponse's status is a range status, internalResponse's
> range-requested flag is set, and request's header list does not contain `Range`, then set response and
> internalResponse to a network error.

("A range status is a status that is 206 or 416.") So a stored opaque partial response replayed to a request
that did not ask for a range is turned into a network error on purpose — the spec even spells out the attack
it prevents. This is directly the `sw-range-as-200` risk probe from #5, from the other direction.

### 3.3 NAS side: what can verify an HMAC on a DS120j

This is where signed URLs get expensive.

**nginx `secure_link` — the obvious answer, and it does not land.** The module exists and does exactly what
is wanted: `secure_link $arg_md5,$arg_expires;` with `secure_link_md5 "$secure_link_expires$uri$remote_addr
secret";`, `$secure_link` set to `""` on a bad signature and `"0"` on an expired one, with
*"the expiration time … set in seconds since Epoch"*
([ngx_http_secure_link_module](https://nginx.org/en/docs/http/ngx_http_secure_link_module.html)). But that
page opens with: *"This module is not built by default, it should be enabled with the
`--with-http_secure_link_module` configuration parameter."*

Two separate obstacles, and only the second is settled:

- **[UNESTABLISHED]:** whether Synology's nginx build includes the module. Synology does not publish its
  configure arguments anywhere I could find; the DSM 7.2
  [Web Station technical specifications](https://www.synology.com/en-global/dsm/7.2/software_spec/web_station)
  name the back-ends ("Nginx", "Apache HTTP Server version 2.4") and the PHP versions, and list no modules
  at all. Probe in §8.
- **Established: there is no supported place to put the directives.** The
  [Web Portal help](https://kb.synology.com/en-global/DSM/help/WebStation/application_webserv_virtualhost?version=7)
  enumerates every per-portal setting — HTTP back-end server, PHP profile, portal type (name-/port-/alias-based),
  an HSTS checkbox, an access control profile, an error page profile — and nothing else. The technical
  specifications page adds only HSTS, per-portal certificates, per-portal TLS profile levels, custom document
  roots and `php.ini` resets. Editing nginx configuration under `/usr/syno/etc/packages/WebStation/` is a
  community practice, not a documented one, and it is overwritten by the package.

**Apache `.htaccess` — documented, but cannot compute an HMAC.** Synology documents `.htaccess` working
against the Apache back-end (§4.3 below). Apache's configuration language has no HMAC primitive; `mod_rewrite`
can match and route, but it cannot verify a signature.

**PHP — the one route that is both documented and sufficient.** Web Station ships PHP 7.3 through 8.2
(technical specifications) and the Web Portal help exposes a PHP profile per portal. A front controller that
calls `hash_hmac()`, checks an expiry, and then serves the file is perhaps twenty lines. The cost is that
**PHP is then in the byte path**: it must stream ~20 MB clips and implement `Range` itself, including the
three range requests per `.mov` measured in #5 (the index sits at the end of the file, so the player asks for
the tail before the body). Web Station exposes no `X-Accel-Redirect`/`X-Sendfile` handoff back to nginx, so
there is no documented way to check the signature in PHP and let the web server do the streaming.
**[UNESTABLISHED]:** what sustained throughput a DS120j actually achieves serving 20 MB through PHP — this
is a measurement, not a reading exercise, and it is the thing that decides whether this route is viable.

**Reverse proxy — routes, does not verify.** Login Portal → Advanced offers reverse proxy rules with source
and destination protocol/hostname/port, HSTS, an access control profile, timeouts and an HTTP version
selector; the only documented Custom Header is the WebSocket preset
([Login Portal → Advanced](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/system_login_portal_advanced?version=7)).
No signature checking, and (still) no established way to emit an arbitrary response header.

**Container Manager — available, and already rejected once on this box.** The runbook records 489 MB of RAM
with about 209 MB actually free, and ADR 0003 rejected Container Manager for the far smaller job of running
an ACME client: *"Container Manager is op een DS120j beschikbaar, maar de doos heeft 489 MB geheugen waarvan
ongeveer 209 MB werkelijk vrij."* A containerised nginx or Caddy in front of the media would solve the
signature problem completely and cleanly — `secure_link` compiled in, or a two-line Caddy matcher — at the
cost of a second TLS terminator, a second place the certificate has to land, and a permanent resident in
that 209 MB.

---

## 4. HTTP Basic (and Digest)

### 4.1 Cross-origin: Safari will not ask, and will not tell

Two gates, both in WebKit source, both decisive.

**Gate one: no prompt.** In
[`ResourceLoader.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/loader/ResourceLoader.cpp):

```cpp
bool ResourceLoader::shouldAllowResourceToAskForCredentials() const
{
    if (!cachedResource() || cachedResource()->type() == CachedResource::Type::MainResource)
        return true;
    ...
    RefPtr topFrameSecurityOrigin = protect(frame->tree().top())->frameDocumentSecurityOrigin();
    if (!topFrameSecurityOrigin)
        return false;
    return topFrameSecurityOrigin->canRequest(m_request.url(), OriginAccessPatternsForWebProcess::singleton());
}
```

A subresource may prompt only if the **top frame's** origin could itself request the URL — i.e. same origin.
And the failure is announced, in a console message worth knowing verbatim because it is what the spike will
see:

> `Blocked <url> from asking for credentials because it is a cross-origin request.`

What happens instead is the part that matters operationally. In
[`NetworkLoad.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/NetworkProcess/NetworkLoad.cpp):

```cpp
    auto scheme = challenge.protectionSpace().authenticationScheme();
    bool isTLSHandshake = scheme == ProtectionSpace::AuthenticationScheme::ServerTrustEvaluationRequested
        || scheme == ProtectionSpace::AuthenticationScheme::ClientCertificateRequested;
    if (!isAllowedToAskUserForCredentials() && !isTLSHandshake && !challenge.protectionSpace().isProxy()) {
        client->didBlockAuthenticationChallenge();
        completionHandler(AuthenticationChallengeDisposition::UseCredential, { });
        return;
    }
```

`UseCredential` with an **empty** credential: the load proceeds unauthenticated, the NAS returns 401, and the
element renders the 401 body as if it were an image. A broken image with one security console message and no
network error. (Note the `isTLSHandshake` exemption — that is §5.)

**Gate two: the stored credential is in the wrong partition.** WebKit's session credential store is keyed by
a pair, not just a protection space
([`CredentialStorage.h`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/network/CredentialStorage.h)):

```cpp
    HashMap<std::pair<String /* partitionName */, ProtectionSpace>, Credential> m_protectionSpaceToCredentialMap;
```

`NetworkDataTaskCocoa` looks it up with `m_partition`
([`NetworkDataTaskCocoa.mm`](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/NetworkProcess/cocoa/NetworkDataTaskCocoa.mm)),
and `m_partition` is set in
[`NetworkDataTask.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/NetworkProcess/NetworkDataTask.cpp)
to `requestWithCredentials.cachePartition()`, which is
([`ResourceRequestBase.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/network/ResourceRequestBase.cpp)):

```cpp
String ResourceRequestBase::cachePartition() const
{
#if ENABLE(CACHE_PARTITIONING)
    if (!m_shouldBlockThirdPartyStorage)
        return emptyString();
    RegistrableDomain domain(firstPartyForCookies());
    ...
    return domain.string();
```

`m_shouldBlockThirdPartyStorage` comes from the storage blocking policy, whose WebKit default is
`WebCore::StorageBlockingPolicy::BlockThirdParty` (`UnifiedWebPreferences.yaml`). **So the credential store
is partitioned by top-level registrable domain.** A Basic credential learned while `nas.vandehaar.dev` was
the top-level page sits under partition `vandehaar.dev`; a media request from an `azurestaticapps.net` page
looks under `azurestaticapps.net` and finds nothing.

**[UNESTABLISHED]:** whether CFNetwork's *persistent* `URLCredentialStorage` — the keychain-backed one, which
WebKit hands the task via `StoredCredentialsPolicy::Use` — behaves the same way. It cannot be read from
source: John Wilander, on WebKit bug 292975, *"HTTP and lower networking is not part of the WebKit open
source project, and cookies are part of HTTP. Apple is not able to share more details for networking
frameworks since ours are not open source."* Probe in §8.

### 4.2 Same-origin, and the URL-credential variant

Same-origin, both gates open: `shouldAllowResourceToAskForCredentials()` returns true, the prompt is shown,
`tryPasswordBasedAuthentication` stores the credential under the (matching) partition, and subsequent `<img>`
and `<video>` requests carry it without further prompting. This works — at the cost of a modal system
password dialog on first load, which for a cinematic photo story is a real product cost, not a footnote.

There is a variant that avoids the dialog and that the spec explicitly blesses: **credentials in the URL**.
Recall from §1 that potential-CORS requests have the use-URL-credentials flag *set*. WebKit implements it in
`NetworkDataTaskCocoa`:

```cpp
    if (m_storedCredentialsPolicy == WebCore::StoredCredentialsPolicy::Use && url.protocolIsInHTTPFamily()) {
        m_user = url.user();
        m_password = url.password();
        request.removeCredentials();
        ...
```

and then, on the 401:

```cpp
bool NetworkDataTaskCocoa::tryPasswordBasedAuthentication(const WebCore::AuthenticationChallenge& challenge, ChallengeCompletionHandler& completionHandler)
{
    if (!challenge.protectionSpace().isPasswordBased())
        return false;
    if (!m_user.isEmpty() || !m_password.isEmpty()) {
        auto persistence = ...;
        completionHandler(AuthenticationChallengeDisposition::UseCredential, WebCore::Credential(m_user, m_password, persistence));
```

This runs in `NetworkDataTaskCocoa::didReceiveChallenge` **before** the challenge reaches
`NetworkLoad::didReceiveChallenge` and its cross-origin gate. So `<img src="https://u:p@nas.vandehaar.dev/…">`
looks, on paper, like a working cross-site mechanism — and structurally it is the same class as a signed
URL: a secret in the URL, verified by ordinary Basic auth. The difference is that it is a *static* secret
with no expiry.

**[UNESTABLISHED]:** whether Safari actually honours URL-embedded credentials on a cross-origin subresource
in a shipping build. Chromium blocks this class of URL for subresources by policy; I found no equivalent
check in WebKit — the only `hasCredentials()` check in
[`NetworkLoadChecker.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/NetworkProcess/NetworkLoadChecker.cpp)
guards *CORS-mode redirects*, not no-cors subresource loads — but absence of a check in the files I read is
weaker evidence than a measurement. Probe in §8. Note also that Fetch strips `Authorization` across an origin
change on redirect: *"I.e., the moment another origin is seen after the initial request, the `Authorization`
header is removed."*

### 4.3 Can Web Station enforce it per directory?

Yes, and Synology documents it — with one condition that matters.

[How do I protect folders under the shared folder "web" from unprivileged access?](https://kb.synology.com/en-global/DSM/tutorial/How_do_I_protect_my_folders_in_the_quot_web_quot_shared_folder_from_unprivileged_access)
opens: *"This article guides you through how to use Apache HTTP back-end server and .htaccess files to
protect shared folders under the shared folder **web** via Linux commands."* Step 1 is *"Download and install
an Apache package (e.g., Apache HTTP Server 2.4) from DSM Package Center"*; step 2, for DSM 7.2 or above, is
*"Go to the **Web Service** page. Select the **Default Service** portal and click **Edit**. Then, select your
Apache package from the **HTTP back-end server** drop-down menu."* The `.htaccess` it gives is:

```
AuthName "User Area"
AuthType "Digest"
AuthUserFile "/volume1/web/passwd/normal.pw"
Require valid-user
```

with the password file made by `htdigest -c normal.pw "User Area" alex`.

Three things follow. **It is per-directory**, so `/media/` can be protected while `/spike/` is not — exactly
the shape configuration A wants. **It requires switching Web Station's back-end from nginx to Apache**, which
is a portal-wide change affecting how everything on that portal is served. And **Synology's own recipe is
Digest, not Basic** — which for our purposes is the same mechanism (an authentication entry, same gates in
§4.1) but is worth matching rather than improvising, since `AuthType Basic` with `mod_auth_basic` is not what
Synology documents as working on DSM.

---

## 5. Client certificates (mTLS)

### 5.1 Browser side: the one credential Safari does not suppress cross-origin

Re-read the gate from §4.1:

```cpp
    bool isTLSHandshake = scheme == ProtectionSpace::AuthenticationScheme::ServerTrustEvaluationRequested
        || scheme == ProtectionSpace::AuthenticationScheme::ClientCertificateRequested;
    if (!isAllowedToAskUserForCredentials() && !isTLSHandshake && !challenge.protectionSpace().isProxy()) {
```

`ClientCertificateRequested` is classified as a TLS handshake and **explicitly excluded** from the
cross-origin credential block. The challenge is passed to the `AuthenticationManager` and can reach the UI
even for a cross-origin subresource. That makes sense — a client certificate is negotiated on the TLS
connection, before there is an HTTP request to be third-party about — but it is a genuine asymmetry and the
one place where the cross-site answer is "yes".

Fetch agrees that this is in scope for a subresource: *"Credentials are HTTP cookies, TLS client
certificates, and authentication entries"*, and a request's traversable for user prompts is *"used to
determine whether and where to show necessary UI for the request, such as authentication prompts or client
certificate dialogs"*.

### 5.2 Provisioning, and the installed-app question

Apple's terms, from
[Intro to certificate management for Apple devices](https://support.apple.com/guide/deployment/intro-to-certificate-management-depb5eff8914/web):
*"A certificate and its associated private key are known as an identity"*; the private key *"is stored as a
PKCS #12 identity certificate (.p12) file and encrypted with another key that's protected by a passphrase"*;
supported identity formats are *".pfx, .p12"*; and *"an identity can be used for authentication (such as
802.1X EAP-TLS), signing, or encryption (such as S/MIME)."* Installation on iPadOS is by configuration
profile.

Who can then *use* it is the sharp bit, and the clearest statement is from Apple DTS on Apple's own developer
forums — a first-party site, but a forum answer rather than documentation, so treat it as such. Quinn "The
Eskimo!", [thread 120463](https://developer.apple.com/forums/thread/120463): *"digital identities installed
via a configuration profile (and hence via MDM) are placed in an Apple-only keychain access group that
third-party apps can't access. There is no direct way around this,"* and *"SFSafariViewController acts Just
Like Safari™ and, being Apple code built in to the OS, it can access the Apple-only keychain access group."*

**[UNESTABLISHED] and important:** a Home Screen web app is neither Safari nor a third-party app's web view.
Whether it reads the Apple-only keychain access group — and therefore whether the identity picker appears at
all in standalone mode — I could not establish from any primary source. This is the same seam that
`docs/research/local-network-access-ipados.md` §4 flagged for TN3179's local-network exemption; it recurs
here for the same reason. Measure it in the installed app, not in a tab.

The provisioning cost is the argument ADR 0003 already made, transferred verbatim. That ADR rejected a
private CA for the *server* certificate because *"the owner does not want manual per-device setup, and this
route charges that cost again at every certificate expiry and for every new or visiting device."* Client
certificates charge exactly the same cost, on the same devices, with the same expiry cadence — plus a CA to
run.

### 5.3 NAS side: DSM cannot require one

Three first-party pages, none of which contains a client-certificate option:

- [Control Panel → Security → Certificate](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/connection_certificate?version=7)
  is entirely about server certificates: *"A certificate can be used to secure SSL services of the Synology
  NAS, such as web (all HTTPS services), mail, or FTP."* Import, Let's Encrypt, CSR, replace, delete, assign
  to services. Nothing about trusting a client CA or demanding a client certificate.
- The [Web Portal help](https://kb.synology.com/en-global/DSM/help/WebStation/application_webserv_virtualhost?version=7)
  enumerates every per-portal setting; the security-relevant ones are HSTS and *"a profile from the **Access
  control profile** drop-down menu"*.
- [Login Portal → Advanced](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/system_login_portal_advanced?version=7)
  defines what an access control profile is, and it is source-IP filtering: *"If you want to restrict user
  access to the Login Portal of applications or reverse proxies according to the user's source IP, you can
  create an access control profile."* Rules are `Allow`/`Deny` on *"Source IP or CIDR"*.

So the answer to "can DSM require a client certificate on one portal and not the rest" is **no, not on any
portal**. It would take your own TLS terminator — a container — which reopens §3.3's memory question and adds
the certificate-plumbing question on top.

One incidental warning from that same page, relevant to this NAS: *"If you enable access control with a
certificate issued by Let's Encrypt, it may lead to certificate auto-renew failure."* Our renewal is DNS-01
via acme.sh, not DSM's own flow, so it should not apply — but if an access control profile is ever switched
on here, watch the 03:15 renewal task.

---

## 6. The service worker as carrier

The worker sees the requests — established on the device in #5, and corroborated in source in §1
(`ServiceWorkersMode::All` for both images and media). The question is what it can do with them.

### 6.1 It cannot add `Authorization` to a no-cors request — and the failure is silent

This is the finding that decides the thread. In the [Fetch Standard](https://fetch.spec.whatwg.org/), mode
`no-cors` *"restricts requests to using CORS-safelisted methods and CORS-safelisted request-headers"*, and
the enforcement is in the `Headers` append algorithm:

> If headers's guard is "`request-no-cors`": … If (name, temporaryValue) is not a no-CORS-safelisted
> request-header, then **return**.

It returns. It does not throw. A worker that builds
`new Request(url, { mode: 'no-cors', headers: { Authorization: '…' } })` gets a request with no
`Authorization` header and no indication that anything was dropped.

`Authorization` is specifically singled out on the other side too: *"A CORS non-wildcard request-header name
is a header name that is a byte-case-insensitive match for `Authorization`"* — which means using it forces a
CORS preflight.

So the worker must re-issue in **CORS mode**, and that pulls the whole CORS problem back in: a preflight
`OPTIONS` the NAS must answer, and `Access-Control-Allow-Origin` on both the preflight and the response.
`docs/research/local-network-access-ipados.md` §3 established that Synology documents no way to send response
headers from Web Station, and that whether the reverse proxy's "Custom Header" emits response headers or
upstream request headers is still the largest open question in that note. **The service-worker route is
therefore blocked behind an unknown that predates this ticket** — and if that unknown resolves badly, it is
blocked outright.

(Note also that `Range` is a *privileged* no-CORS request-header — Fetch: *"a privileged no-CORS
request-header name is a header name that is a byte-case-insensitive match for one of `Range` … these are
headers that can be set by privileged APIs … but will be removed if the request is modified by unprivileged
APIs."* A worker that rebuilds a media request by hand can lose the `Range` header it was given.)

### 6.2 Answering a range request

Once the worker has bytes, returning them to a `<video>` is more forgiving than expected.

HTML's [verify a media response](https://html.spec.whatwg.org/multipage/media.html) algorithm:

> If response is a network error, then return false. If byteRange is "entire resource", then return true.
> Let internalResponse be response's unsafe response. **If internalResponse's status is 200, then return
> true.** If internalResponse's status is not 206, then return false.

So **a full `200` in answer to a range request is accepted** — the element does not require a `206`. WebKit
implements the same shape in
[`MediaResourceLoader::verifyMediaResponse`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/loader/MediaResourceLoader.cpp),
returning `true` early when `response.httpStatusCode() != httpStatus206PartialContent`, and it has explicit
handling for service-worker-provided responses:

```cpp
        // Synthetic responses, whose origin is the service worker origin, have basic tainting but their url is the request URL, which may have a different origin
        bool hasContextOrigin = response.source() == ResourceResponse::Source::ServiceWorker && response.tainting() == ResourceResponse::Tainting::Basic;
```

Two cautions attach. First, HTML tracks a media resource's origin across the responses that make it up, and a
synthetic response (null URL) counts as `"rewritten"`; mixing rewritten and network-origin responses for one
resource sets the resource's origin to `"multiple"`, which affects canvas tainting and subtitle exposure. Do
not mix worker-synthesised and pass-through responses for the same clip. Second, the opaque-206 rule from
§3.2 applies: a stored opaque partial response returned to a request without a `Range` header becomes a
network error by design.

**[UNESTABLISHED]:** whether answering a *mid-file* seek range with a full `200` actually produces working
playback and seeking on iPadOS, as opposed to merely passing the spec's verification step. Spec-legal is not
the same as AVFoundation-happy. This remains the `sw-range-as-200` probe from #5 and is not settled by
reading.

### 6.3 What the user sees before the worker exists

Three distinct moments, all of which produce unauthenticated media requests:

- **First visit ever.** No registration exists. The page loads, the `<img>`s fire, nothing intercepts them.
- **The visit that registers the worker.** Per the [Service Workers specification](https://w3c.github.io/ServiceWorker/),
  a client's active service worker is bound when the client is created; a freshly activated worker takes over
  existing clients only via `clients.claim()`, whose steps *"set client's active service worker to service
  worker"* for already-loaded clients. Until then the page is uncontrolled.
- **After eviction.** *"ITP deletes all cookies created in JavaScript and all other script-writeable storage
  after 7 days of no user interaction with the website. The latter storage forms are: IndexedDB, LocalStorage,
  Media keys, SessionStorage, **Service Worker registrations and cache**."*
  ([Tracking Prevention in WebKit](https://webkit.org/tracking-prevention/)) — with the exemption that
  matters: *"The first-party domain of home screen web applications is exempt from ITP's 7-day cap on all
  script-writeable storage."* So an installed `rememberwhen` keeps its worker across a quiet fortnight; the
  same site opened in a Safari tab does not.

  Storage-pressure eviction is separate and still applies.
  [Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/): eviction happens
  *"when exceeding the overall quota, when the system is under storage pressure, or when the site has not
  been interacted with by the user for some time"*, least-recently-used by origin, *"excluding those with
  active pages or persistent storage mode"*. `StorageManager.persist()` is worth calling: *"WebKit currently
  grants a request based on heuristics like whether the website is opened as a Home Screen Web App."* Quotas
  are 60% origin / 80% overall for browser apps, 15% / 20% for others.

**Consequence for the threat model in #15:** a service-worker-carried credential can never be the only gate.
Either the media is readable without it during those windows, or the app must refuse to render media until
`navigator.serviceWorker.controller` is non-null — a design workaround, and one that trades a broken image
for a blank screen on first visit. That is a product decision, not a platform fact.

---

## 7. What the DS120j can enforce, summarised

Pulling the NAS-side findings together, because they are scattered above and they are half the matrix.

| Enforcement surface | Documented capability | Verdict for this problem |
|---|---|---|
| Web Station portal settings | back-end server, PHP profile, portal type, HSTS, access control profile, error page profile ([Web Portal help](https://kb.synology.com/en-global/DSM/help/WebStation/application_webserv_virtualhost?version=7)) | no authentication, no headers, no signature checking |
| Web Station technical spec | nginx + Apache 2.4 back-ends, PHP 7.3–8.2, per-portal certificate and TLS profile, custom document roots, HSTS ([spec](https://www.synology.com/en-global/dsm/7.2/software_spec/web_station)) | PHP is the only programmable surface |
| Apache back-end + `.htaccess` | per-directory `AuthType "Digest"` with `htdigest` ([Synology KB](https://kb.synology.com/en-global/DSM/tutorial/How_do_I_protect_my_folders_in_the_quot_web_quot_shared_folder_from_unprivileged_access)) | works, same-site only (§4), and switches the whole portal to Apache |
| PHP | shipped, selectable per portal | can verify an HMAC and can `Set-Cookie`; must then stream bytes and implement `Range` itself |
| Login Portal → Access Control Profile | Allow/Deny on source IP or CIDR ([help](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/system_login_portal_advanced?version=7)) | works in both configurations and is origin-blind — but it authorizes a network location, not a person |
| Login Portal → Reverse Proxy | source/destination protocol, hostname, port; HSTS; access control profile; timeouts; HTTP version; Custom Header (WebSocket preset documented) | cannot verify anything; response-header capability still **[UNESTABLISHED]** |
| Control Panel → Security → Certificate | server certificates only | cannot require a client certificate |
| Container Manager | available; ~209 MB free of 489 MB (runbook, ADR 0003) | would solve `secure_link` and mTLS both; the memory is the price |

---

## 8. Probes worth running, in order

Cheapest and most decisive first. Every one of these should be run **twice: once in a Safari tab, once in the
installed Home Screen web app** — storage, credentials and possibly keychain access do not cross that
boundary (§2.4, §5.2). Use Safari Web Inspector attached from a Mac; Safari 26.0 lists Home Screen web apps
under Develop → Inspect Apps and Devices.

1. **Does Synology's nginx have `secure_link`?** On the NAS, over SSH:
   `nginx -V 2>&1 | tr ' ' '\n' | grep -i secure_link`. One command; it either resolves §3.3's first
   obstacle or it does not. (The second obstacle — nowhere to put the directives — stands either way.)
2. **Does a cross-origin `<img>` carry a URL credential?** Serve one Digest- or Basic-protected file from the
   NAS (§4.3), point an `<img src="https://user:pass@nas.vandehaar.dev/…">` at it from a page on a different
   site, and watch. Success: the image renders with no dialog. Failure: a broken image, and the console
   message `Blocked … from asking for credentials because it is a cross-origin request.` This settles the one
   remaining cheap cross-site mechanism.
3. **Does a persisted Basic credential survive the origin change?** Log in to the protected directory as a
   top-level page in Safari, confirm the credential is remembered, then load the same file as an `<img>` from
   a cross-site page. Source says the WebCore store is partitioned; CFNetwork's persistent store cannot be
   read from source. Measure it.
4. **What does PHP cost on this box?** Put a twenty-line HMAC-checking PHP front controller in front of one
   20 MB `.mov`, implement `Range`, and measure sustained throughput and memory against serving the same file
   statically. This is the number that decides whether signed URLs are viable at all on a DS120j.
5. **Does the CHIPS chain hold?** From the Azure origin: `fetch()` a session endpoint with
   `credentials: 'include'` and an `Authorization` header, have it reply
   `Set-Cookie: …; SameSite=None; Secure; Partitioned`, then load an `<img>` from the NAS and check the
   request carried the cookie. Watch for the preflight. This needs `Access-Control-Allow-Origin` with the
   exact origin and `Access-Control-Allow-Credentials: true`, so it is also the test of whether Synology can
   emit response headers at all — the open question from note #4.
6. **Does an installed web app get the client-certificate picker?** Requires a portal that demands a client
   certificate, which DSM cannot provide (§5.3) — so this one costs a container and should be run last, if at
   all.
7. **Does a mid-file seek survive a `200` from the worker?** Register a worker that answers a
   `Range: bytes=<middle>-` request with a full `200`, and try to scrub the video. Log every intercepted
   request with its `destination` and `headers.get('Range')`. This is `sw-range-as-200` from #5.

---

## What I could not establish

In rough order of how much it matters.

1. **Whether Synology's nginx build includes `ngx_http_secure_link_module`.** Synology publishes no configure
   arguments and the Web Station specification page lists no modules. Even a "yes" leaves the second problem
   (no documented place for the directives), so this only matters if someone is prepared to edit package
   configuration unsupported.
2. **Whether Safari honours URL-embedded credentials on a cross-origin subresource.** WebKit's
   `tryPasswordBasedAuthentication` handles the challenge before the cross-origin gate, and I found no
   blocking check — but I read a handful of files, not the whole loader. If this works, it is the cheapest
   cross-site mechanism available and it changes the matrix.
3. **Whether CFNetwork's persistent credential storage is partitioned like WebCore's.** Not open source, by
   Apple's own statement.
4. **Whether the CHIPS bootstrap chain works end to end on iPadOS.** Each link is established from a primary
   source; the chain is not. It also depends on (5).
5. **Whether Synology can emit an arbitrary response header at all** — inherited unchanged from
   `docs/research/local-network-access-ipados.md` §3, and now blocking two mechanisms rather than one (CORS
   for the service-worker route, and CORS for the CHIPS bootstrap).
6. **Whether a Home Screen web app can use a configuration-profile-installed client certificate.** Apple's
   statements name Safari, `SFSafariViewController` and third-party apps. An installed web app is none of
   those three.
7. **Whether a third-party `Partitioned` cookie inherits a home screen web app's exemption from ITP's 7-day
   cap.** The exemption is worded for *"the first-party domain of home screen web applications"*.
8. **What answering a mid-file seek with a `200` does to playback on iPadOS.** Spec-legal per HTML's
   verify-a-media-response; not the same as working.
9. **What PHP costs on a DS120j serving 20 MB with byte ranges.** A measurement, not a reading.

## Sources

Primary, in the order first used.

**Specifications**

- [HTML Standard — URLs and fetching](https://html.spec.whatwg.org/multipage/urls-and-fetching.html) — create a potential-CORS request, CORS settings attributes
- [HTML Standard — Media elements](https://html.spec.whatwg.org/multipage/media.html) — resource fetch algorithm, verify a media response
- [Fetch Standard](https://fetch.spec.whatwg.org/) — WHATWG
- [Service Workers](https://w3c.github.io/ServiceWorker/) — W3C
- [The Storage Access API](https://privacycg.github.io/storage-access/) — Privacy CG
- [CHIPS explainer](https://github.com/privacycg/CHIPS/blob/main/README.md) — Privacy CG
- [requestStorageAccessFor explainer](https://github.com/privacycg/requestStorageAccessFor/blob/main/README.md) — Privacy CG
- [RFC 9111, HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111.html) — §2, cache key
- [Public Suffix List](https://publicsuffix.org/list/public_suffix_list.dat) — `azurestaticapps.net`

**WebKit**

- [`UnifiedWebPreferences.yaml`](https://github.com/WebKit/WebKit/blob/main/Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml) — `OptInPartitionedCookiesEnabled`, `StorageBlockingPolicy`, `StorageAccessAPIEnabled`
- [`NetworkStorageSession.h`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/network/NetworkStorageSession.h) / [`.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/network/NetworkStorageSession.cpp) — third-party cookie blocking decision
- [`WebsiteDataStore.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/WebsiteData/WebsiteDataStore.cpp) — blocking mode defaults and the CHIPS upgrade
- [`CachedResourceLoader.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/loader/cache/CachedResourceLoader.cpp) — `defaultCachedResourceOptions()`
- [`ResourceLoaderOptions.h`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/loader/ResourceLoaderOptions.h) — `ClientCredentialPolicy`, default `ServiceWorkersMode`
- [`ImageLoader.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/loader/ImageLoader.cpp) — image request options
- [`MediaResourceLoader.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/loader/MediaResourceLoader.cpp) — media request options, `verifyMediaResponse`
- [`ResourceLoader.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/loader/ResourceLoader.cpp) — `shouldAllowResourceToAskForCredentials`, `didBlockAuthenticationChallenge`
- [`NetworkLoad.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/NetworkProcess/NetworkLoad.cpp) — the `isTLSHandshake` exemption
- [`NetworkDataTaskCocoa.mm`](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/NetworkProcess/cocoa/NetworkDataTaskCocoa.mm) — URL credentials, partitioned credential lookup, `tryPasswordBasedAuthentication`, `_setAllowOnlyPartitionedCookies`
- [`NetworkDataTask.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/NetworkProcess/NetworkDataTask.cpp) — `m_partition`
- [`NetworkTaskCocoa.mm`](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/NetworkProcess/cocoa/NetworkTaskCocoa.mm) — CNAME / IP cloaking cookie expiry cap
- [`CredentialStorage.h`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/network/CredentialStorage.h) — partitioned credential map
- [`ResourceRequestBase.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/network/ResourceRequestBase.cpp) — `cachePartition()`
- [`NetworkLoadChecker.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/NetworkProcess/NetworkLoadChecker.cpp) — credentials on CORS redirects
- [`Document+StorageAccess.idl`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/dom/Document%2BStorageAccess.idl) — no `requestStorageAccessFor`
- [Tracking Prevention in WebKit](https://webkit.org/tracking-prevention/)
- [Full Third-Party Cookie Blocking and More](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)
- [WebKit Features in Safari 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/) — CHIPS first ship
- [WebKit Features for Safari 26.2](https://webkit.org/blog/17640/webkit-features-for-safari-26-2/) — CHIPS return
- [Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [WebKit bug 292975 — Partitioned cookies not working in Safari 18.5](https://bugs.webkit.org/show_bug.cgi?id=292975)
- [WebKit standards-positions #50 — CHIPS](https://github.com/WebKit/standards-positions/issues/50)

**Apple**

- [Intro to certificate management for Apple devices](https://support.apple.com/guide/deployment/intro-to-certificate-management-depb5eff8914/web)

**Synology**

- [Web Station → Web Portal](https://kb.synology.com/en-global/DSM/help/WebStation/application_webserv_virtualhost?version=7)
- [Web Station technical specifications (DSM 7.2)](https://www.synology.com/en-global/dsm/7.2/software_spec/web_station)
- [How do I protect folders under the shared folder "web" from unprivileged access?](https://kb.synology.com/en-global/DSM/tutorial/How_do_I_protect_my_folders_in_the_quot_web_quot_shared_folder_from_unprivileged_access)
- [Control Panel → Login Portal → Advanced](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/system_login_portal_advanced?version=7)
- [Control Panel → Security → Certificate](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/connection_certificate?version=7)

**Other**

- [nginx — ngx_http_secure_link_module](https://nginx.org/en/docs/http/ngx_http_secure_link_module.html)

Secondary, cited as such and not relied upon:

- [Apple Developer Forums thread 120463](https://developer.apple.com/forums/thread/120463) — Apple DTS (Quinn) on the Apple-only keychain access group for profile-installed identities. First-party site, forum answer.

**In-repo, established previously on the equipment itself**

- [ADR 0003 — A public DNS record pointing at a private address](../adr/0003-public-dns-pointing-at-a-private-address.md)
- [Runbook — het certificaat van de NAS](../runbooks/nas-certificaat.md)
- [Local network access from a public HTTPS page in Safari on iPadOS](local-network-access-ipados.md)
- [Cinematic story building blocks](cinematic-story-building-blocks.md)
