# Local network access from a public HTTPS page in Safari on iPadOS

Research note for issue #4. Written 2026-08-24. Latest Safari release notes available at the time of
writing: Safari 26.6. Every claim below is linked to the source that owns it; anything I could not
establish from a primary source is marked **[UNESTABLISHED]** or flagged as secondary.

This is a snapshot of a moving target. The single fact most likely to change is item 1.

## The question

`rememberwhen` is an iPad-first PWA. An installed HTTPS PWA (candidate host: Azure Static Web Apps)
must fetch `Media Item`s — photos and short videos — from a Synology DS120j on the local network.

What are the current rules for reaching a local network server from a public HTTPS page in Safari on
iPadOS, and which configurations are therefore worth spiking?

## Verdict

**Local Network Access has not shipped in any released iPadOS, and there is nothing to opt into.**
The WebKit preference `LocalNetworkAccessEnabled` is `status: unstable` and defaults to `false` on
every frontend in WebKit trunk today, and `unstable` features are explicitly excluded from the
feature UI shown to end users. So there is no permission prompt to obtain, no prompt to design
around — and no `targetAddressSpace` escape hatch from mixed-content blocking either.

**That makes mixed content, not Local Network Access, the wall.** WebKit treats only loopback and
`localhost` as potentially trustworthy; RFC1918 addresses are not. An `https://` page fetching
`http://192.168.x.x/...` is blockable mixed content, is not auto-upgraded (the upgrade algorithm
bails on IP-address hosts), and there is no user override on iOS. **The NAS must therefore serve
valid, publicly-trusted HTTPS under a name that matches its certificate** — which Synology's
DDNS + Let's Encrypt integration is designed to provide, with the important caveat that a Synology
DDNS record publishes the NAS's *external* IP, not a LAN IP.

Once the NAS is on real HTTPS, the request is an ordinary cross-origin request and the remaining
problem is small: **rendering photos and videos through `<img src>` / `<video src>` needs no CORS
headers at all** (no-cors mode, opaque response, which renders fine). CORS headers are only needed
if JavaScript must read the bytes. And a Service Worker **can** cache those opaque responses via
`cache.put()` — but not via `cache.addAll()`, and never a `206` partial response.

The lowest-risk configuration is the one that sidesteps the cross-origin question entirely: serve
the PWA itself from the NAS's HTTPS origin. The ranked list at the end starts there.

---

## 1. Local Network Access: specification and WebKit implementation

### The specification

The spec lives at [wicg.github.io/local-network-access](https://wicg.github.io/local-network-access/),
a **Draft Community Group Report dated 7 August 2026**, edited by Chris Thompson and Hubert Chao
(Google). It replaces the earlier "Private Network Access" work
([WICG/private-network-access](https://github.com/WICG/private-network-access)).

It defines three IP address spaces — `loopback` (127.0.0.0/8, ::1/128), `local` (RFC1918 plus
link-local), and `public` — and calls a request that crosses from a less-private to a more-private
space a *local network request*
([spec](https://wicg.github.io/local-network-access/)).

Two permissions are defined: `"local-network"` for local addresses and `"loopback-network"` for
loopback (with legacy alias `"local-network-access"`). Loopback is otherwise exempt from the checks,
on the reasoning that software already on the user's device is in the most privileged position
([spec](https://wicg.github.io/local-network-access/)).

Two points matter for this project:

- **The permission, when granted, also relaxes mixed content.** From the
  [explainer](https://github.com/WICG/local-network-access/blob/main/explainer.md): "To reduce
  breakage (due to the lack of local network HTTPS), the permission also exempts requests that are
  known to be local or loopback from mixed content blocking." If the request unexpectedly resolves
  to a public IP, it stays blocked.
- **`targetAddressSpace`.** The spec adds "a new parameter to the `fetch()` options bag" —
  `targetAddressSpace: "local" | "loopback"` — by which a page declares where it expects the request
  to land, allowing the mixed-content bypass only when the resolved IP actually matches
  ([spec](https://wicg.github.io/local-network-access/),
  [explainer](https://github.com/WICG/local-network-access/blob/main/explainer.md)).

The grant persists once given; the explainer describes the UA checking "if the origin has already
been granted the 'local network access' permission" and prompting only if not.

There is no preflight header mechanism in the current draft — the model is a user permission prompt,
not an `Access-Control-Request-Local-Network`-style server opt-in
([spec](https://wicg.github.io/local-network-access/)).

### WebKit's implementation

The tracking bug is
[WebKit bug 250607, "Implement Local Network Access"](https://bugs.webkit.org/show_bug.cgi?id=250607):
filed 2023-01-13, last modified 2026-07-21, **status NEW, unassigned**. Its blockers:

| Bug | Status | Summary |
|---|---|---|
| [295048](https://bugs.webkit.org/show_bug.cgi?id=295048) | RESOLVED FIXED | Create Feature Flag for Local Network Access |
| [295049](https://bugs.webkit.org/show_bug.cgi?id=295049) | RESOLVED FIXED | Import wpt local-network-access tests |
| [295935](https://bugs.webkit.org/show_bug.cgi?id=295935) | RESOLVED FIXED | Add Local Network Access IDL files |
| [296710](https://bugs.webkit.org/show_bug.cgi?id=296710) | RESOLVED FIXED | Extend Fetch to accept local connections |
| [250330](https://bugs.webkit.org/show_bug.cgi?id=250330) | NEW | Implement the Secure Context Restriction |
| [250339](https://bugs.webkit.org/show_bug.cgi?id=250339) | NEW | Apply Secure Context Restriction to private IPv6 address space |
| [295047](https://bugs.webkit.org/show_bug.cgi?id=295047) | NEW | **Enable Local Network Access by default** |

(Source: [WebKit Bugzilla, bugs blocking 250607](https://bugs.webkit.org/buglist.cgi?blocked=250607&order=bug_id).)

The scaffolding exists; the enablement does not.

**The decisive evidence is in WebKit trunk.** In
[`Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml`](https://github.com/WebKit/WebKit/blob/main/Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml):

```yaml
LocalNetworkAccessEnabled:
  type: bool
  status: unstable
  category: networking
  humanReadableName: "Local Network Access"
  humanReadableDescription: "Enable Local Network Access"
  webKitLegacyPreferenceKey: WebKitLocalNetworkAccessEnabledPreferenceKey
  defaultValue:
    WebKitLegacy:
      default: false
    WebKit:
      default: false
    WebCore:
      default: false
```

The header comment in the same file defines `unstable` as: "Feature in active development.
Unfinished, no promise it is usable or safe. **OFF by default.**"

And [`Source/WTF/Scripts/GeneratePreferences.rb`](https://github.com/WebKit/WebKit/blob/main/Source/WTF/Scripts/GeneratePreferences.rb)
decides where a preference is surfaced:

```ruby
  # Features which should appear in UI presented to end users.
  def experimental?
    %w{ developer testable preview stable }.include? @status
  end

  # Features which should only be presented in WebKit development contexts.
  def internal?
    %w{ unstable internal }.include? @status
  end
```

`unstable` is `internal?`, not `experimental?`. **The flag does not appear in the Feature Flags UI a
user or developer can reach on iPadOS.** There is no supported way to turn Local Network Access on
in shipping Safari.

The `fetch()` option is gated by the same flag, in
[`Source/WebCore/Modules/fetch/FetchRequestInit.idl`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/fetch/FetchRequestInit.idl):

```webidl
    [EnabledBySetting=LocalNetworkAccessEnabled] IPAddressSpace targetAddressSpace;
```

and mirrored in
[`FetchRequest.idl`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/fetch/FetchRequest.idl).

**One wrinkle worth testing.** The
[Safari 26.4 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-26_4-release-notes),
under Networking → Resolved Issues, say: "Fixed a regression where `fetch()` would throw a
`TypeError` when using `targetAddressSpace: 'loopback'` for localhost requests. (166574523)". That is
a user-facing release note about a flag-gated feature. It shows the code path ships in the binary; it
does not show the flag is on. **[UNESTABLISHED]** whether `targetAddressSpace` has any observable
effect on a stock iPadOS device — the spike should try it and record what happens.

Nothing about Local Network Access appears in the Safari 26.0–26.6 release notes or in the
corresponding WebKit blog posts (checked
[26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/),
[26.4](https://webkit.org/blog/17862/webkit-features-for-safari-26-4/),
[26.5](https://webkit.org/blog/17938/webkit-features-for-safari-26-5/),
[26.6](https://webkit.org/blog/18178/webkit-features-for-safari-26-6/)).

WebKit has **not stated a standards position**:
[WebKit/standards-positions#520](https://github.com/WebKit/standards-positions/issues/520) is still
open with no position label, last updated 2025-09-12.

For contrast, Chromium shipped this in **Chrome 141**, gated behind a permission prompt, with the
same mixed-content relaxation on grant
([Intent to Ship: Local network access restrictions](https://groups.google.com/a/chromium.org/g/blink-dev/c/cwu_RUmBpzY)).
That intent records Safari's signal as "No signal" and Mozilla as prototyping. **This is the reason a
configuration verified in Chrome DevTools proves nothing about Safari, and vice versa.**

### The other "local network permission" — the OS one

Separately from the web platform feature, iOS/iPadOS has had an OS-level Local Network privilege
since iOS 14. Apple's
[TN3179: Understanding local network privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)
(revised 2026-02-17) describes it: "The first time a program accesses the local network, the system
displays an alert asking the user to approve that access. The system records their decision, so
future accesses don't prompt." It is configured at Settings → Privacy & Security → Local Network,
and "Device managers aren't able to configure local network privacy using MDM."

**Browsers are exempt.** TN3179 lists, among the exceptions to the TCP/UDP rules: "Traffic
originating from `WKWebView`, `SFSafariViewController`, and Safari doesn't require local network
access."

**[UNESTABLISHED]:** that exception list names Safari, `WKWebView` and `SFSafariViewController`. It
does not name Home Screen web apps, which are neither Safari nor a third-party app's web view. I
found no primary source that says which side of the line an installed web app falls on. Treat it as
an explicit observation for the spike (see §4).

*Secondary corroboration only, not relied on:* an Apple Developer Forums thread reports Chrome
prompting and appearing in Settings → Local Network while Safari does not prompt; Apple DTS replied
by pointing at TN3179 and noting "a web view running in your app is considered to be your app from
the perspective of local network privacy"
([forums thread 811690](https://developer.apple.com/forums/thread/811690)).

---

## 2. Mixed content, and what changes when the NAS serves valid HTTPS

### The rule

Per the [Mixed Content specification](https://w3c.github.io/webappsec-mixed-content/), "A request is
mixed content if its URL is not a potentially trustworthy URL and the context responsible for loading
it prohibits mixed security contexts." Requests for scripts and "data requested via
XMLHttpRequest" are **blockable**; images, audio and video are *upgradeable*. But the upgrade
algorithm bails immediately: "If request's URL's host is an IP address, return without modifying
request."

What counts as potentially trustworthy is defined by
[Secure Contexts §3.1](https://w3c.github.io/webappsec-secure-contexts/): `https`/`wss` schemes,
`127.0.0.0/8`, `::1/128`, `localhost` / `*.localhost`, and `file`. **RFC1918 addresses —
`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x` — are not in the list.**

WebKit implements exactly that. In
[`Source/WebCore/page/SecurityOrigin.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/SecurityOrigin.cpp):

```cpp
static bool shouldTreatAsPotentiallyTrustworthy(StringView protocol, StringView host)
{
    if (LegacySchemeRegistry::shouldTreatURLSchemeAsSecure(protocol))
        return true;

    if (SecurityOrigin::isLocalHostOrLoopbackIPAddress(host))
        return true;
    ...
```

and in
[`Source/WebCore/loader/MixedContentChecker.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/loader/MixedContentChecker.cpp),
`shouldBlockRequest()` blocks any mixed content unless the URL is potentially trustworthy (loopback)
and the destination is upgradeable — or unless a site-specific quirk applies. There is exactly one
such quirk, and it is for `account.battle.net` only
([`Quirks.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/Quirks.cpp)).

The console message WebKit emits is built in the same file and is worth knowing verbatim, because
it is what the spike will see:

> `[blocked] The page at <url> requested insecure content from <url>. This content was blocked and must be served over HTTPS.`

**Conclusion: `https://app.example` fetching `http://192.168.1.50/photo.jpg` is blocked, for every
destination including `<img>`, with no auto-upgrade and no user override on iOS.** This is not a
Local Network Access question; it is settled today and has been for years.

### What valid HTTPS on the NAS changes

Everything. If the NAS answers on `https://` under a name its publicly-trusted certificate covers,
the request is no longer mixed content at all — `MixedContentChecker::isMixedContent` returns false
for any URL where `SecurityOrigin::isSecure()` is true, and `isSecure()` is true for any secure
scheme. What remains is only same-origin-policy/CORS (§3).

Two requirements, both non-negotiable: **(a)** the hostname in the URL must match the certificate,
and **(b)** the chain must be publicly trusted (a DSM self-signed certificate is not, and would need
a per-device profile install — untested here and not recommended for a family device).

### Synology DDNS + Let's Encrypt: what it actually gives you

Synology's own help for
[Control Panel → External Access → DDNS](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/connection_ddns?version=7)
says the record carries the **external** address: "External address: Enter the external IP address of
the Synology NAS which will use the hostname," and "After setup is complete, you can access your
Synology NAS over the Internet by entering the DDNS hostname in a web browser." There is a checkbox:
"Get a certificate from Let's Encrypt and set it as default."

**So `something.synology.me` resolves, on the public Internet, to your WAN IP — not to a LAN IP.**
The premise in the ticket ("a DDNS hostname with a Let's Encrypt certificate that resolves to a LAN
IP") is not what the product does out of the box. There are two ways to make the name usable from
inside the house:

1. **Let it resolve publicly and reach the NAS over the public path** (port-forward 443, and rely on
   the router's NAT hairpin when the iPad is on home Wi-Fi). Then the fetch is public→public: no
   local network request, no mixed content, and Local Network Access never enters the picture even
   when it ships.
2. **Split-horizon DNS**: run a resolver on the LAN that answers the same name with the LAN IP. The
   certificate stays valid because the *name* is unchanged. Synology's DNS Server package can host a
   primary zone for a registered domain
   ([Zones help](https://kb.synology.com/en-global/DSM/help/DNSServer/dns_server_zone_mng?version=7)),
   and many routers can override a single name.

Certificate mechanics, from
[Control Panel → Security → Certificate](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/connection_certificate?version=7):

- "Let's Encrypt will perform domain validation before issuing certificates for your domains. Please
  make sure your Synology NAS and router have **port 80 open** for domain validation from the
  Internet."
- "Certificates issued by Let's Encrypt are valid for 90 days. Before the certificates expire, DSM
  will automatically renew such certificates after successful domain validation. Please make sure
  your Synology NAS and router have port 80 open for certificate **renewal**."
- "You can also apply for a wildcard certificate by entering the domain names of Synology DDNS in the
  following format: `*.SYNOLOGY_DDNS_DOMAIN_NAME`" and "Wildcard certificates are only supported for
  Synology DDNS."

So **even the split-horizon route still needs inbound port 80 from the Internet at renewal time**,
unless the wildcard path avoids it. **[UNESTABLISHED]:** Synology does not document which ACME
challenge type the wildcard flow uses. A wildcard certificate cannot be issued by Let's Encrypt via
HTTP-01 (only DNS-01 is permitted for wildcards, per
[Let's Encrypt's FAQ](https://letsencrypt.org/docs/faq/): "Wildcard issuance must use the DNS-01
challenge"), which implies Synology performs DNS-01 through its own DDNS infrastructure — but that is
inference, not documentation.

A note on the tempting shortcut: Let's Encrypt now issues certificates for **IP addresses**, but only
public ones, only via `http-01`/`tls-alpn-01`, and with ~6-day lifetimes
([Let's Encrypt, "Issuing our first IP address certificate"](https://letsencrypt.org/2025/07/01/issuing-our-first-ip-address-certificate/)).
**A certificate for `192.168.1.50` is not obtainable.**

### DNS rebinding protections

A public name resolving to a private address is, structurally, what DNS rebinding protection exists
to stop. The canonical implementation is dnsmasq's `--stop-dns-rebind`, documented as: "Reject (and
log) addresses from upstream nameservers which are in the private ranges. This blocks an attack where
a browser behind a firewall is used to probe machines on the local network"
([dnsmasq man page](https://thekelleys.org.uk/dnsmasq/docs/dnsmasq-man.html)). It has companions
`--rebind-domain-ok` (whitelist specific domains) and `--rebind-localhost-ok`. **In dnsmasq itself
these are off unless configured**; many consumer router firmwares build on dnsmasq and enable
rebind protection by default. **[UNESTABLISHED]:** whether the router in this household does — that
is a device-specific fact the spike must simply measure.

Two clarifications:

- **This only bites configuration 3 (split-horizon), and only when the LAN resolver forwards
  upstream.** A resolver *authoritative* for the zone is answering from its own data, not passing an
  upstream answer through the rebind filter.
- **WebKit does not implement DNS rebinding protection.** A code search of WebKit/WebKit for
  "rebinding" returns only GPU/ANGLE buffer-rebinding and build-config hits — nothing in networking.
  Rebinding defence lives in resolvers and routers, not in the browser.

One further hazard for split-horizon on an iPad specifically: iCloud Private Relay, an encrypted-DNS
configuration profile, or a per-network DNS setting can route the query past the LAN resolver, in
which case the name silently resolves to the public IP instead. Watch for it.

---

## 3. CORS: what the Synology must send, and whether DSM can send it

### The important part first: for images and video, probably nothing

A cross-origin subresource loaded by `<img src>` or `<video src>` **without** a `crossorigin`
attribute is fetched in **no-cors** mode. Per the
[Fetch specification](https://fetch.spec.whatwg.org/), no-cors "Restricts requests to using
CORS-safelisted methods and CORS-safelisted request-headers. Upon success, fetch will return an
opaque filtered response." An opaque filtered response has type `"opaque"`, status `0`, an empty
header list and a null body — unreadable by script, but the internal response is still used to "feed
image data to a decoder."

**So rendering a `Media Item` needs zero CORS headers on the Synology.** This is the single largest
simplification available and should shape the spike order.

The costs of opaqueness are real and should be designed around, not discovered late:

- No status code, no headers, no error detail in script. A failure looks like a broken image with an
  empty `Response` and no useful console message.
- `<canvas>` becomes tainted if you draw such an image and try to read pixels back.
- No `Response.ok` to branch on for retry/fallback logic.

### When you do need CORS

Any of these forces CORS mode: `fetch()`/XHR whose body you intend to read (e.g. to build a blob URL,
or to probe reachability), `<img crossorigin="anonymous">`, `<video crossorigin>`, or reading pixel
data from a canvas.

Then the Synology must send, on the media responses:

| Header | Value | Why |
|---|---|---|
| `Access-Control-Allow-Origin` | the exact PWA origin, e.g. `https://<app>.azurestaticapps.net`, or `*` | required for any CORS-mode read |
| `Access-Control-Allow-Credentials` | `true` | **only** if the request uses `credentials: "include"` |
| `Access-Control-Expose-Headers` | `Content-Length, Content-Range, Accept-Ranges` | to make range/length metadata visible to script |

Rules that matter, all from the [Fetch specification](https://fetch.spec.whatwg.org/) §3.3:

- With `credentials mode: "include"`, `Access-Control-Allow-Origin` **cannot** be `*`, and
  `Access-Control-Allow-Credentials` must be the byte-case-sensitive string `true`. Fetch's table of
  legal combinations is explicit about both. The value `*` is likewise unusable for
  `Access-Control-Expose-Headers`, `-Allow-Methods` and `-Allow-Headers` when credentials are
  included.
- A serialized origin has **no trailing slash**: `https://rabbit.invalid` is shared, and
  `https://rabbit.invalid/` is not.
- Only `Cache-Control`, `Content-Language`, `Content-Length`, `Content-Type`, `Expires`,
  `Last-Modified` and `Pragma` reach script by default on a CORS-filtered response; everything else
  needs `Access-Control-Expose-Headers`.
- **A plain `GET` with no custom headers does not preflight.** A preflight is triggered when the
  use-CORS-preflight flag is set, or the request is unsafe and either the method is not safelisted or
  there are CORS-unsafe request-header names.
- **`Range` is CORS-safelisted**, provided the value parses as a single range with a non-null start
  (`bytes=0-` yes, `bytes=-500` no — "As web browsers have historically not emitted ranges such as
  `bytes=-500` this algorithm does not safelist them"). So byte-range media GETs do not preflight.
- **`Authorization` is a CORS non-wildcard request-header name** and will force a preflight. Prefer
  a query-string token or a cookie over an `Authorization` header if you want to stay preflight-free.

If a preflight does happen, the `OPTIONS` response must carry `Access-Control-Allow-Origin` plus
`Access-Control-Allow-Methods` / `-Allow-Headers` (and optionally `-Max-Age`). Note that "a
CORS-preflight request never includes credentials."

### Can Synology be configured to send them?

**Synology does not document this anywhere.** A search of the Synology Knowledge Center for "CORS"
returns exactly three results, none of which concern DSM, Web Station, or Synology Photos: an API
compatibility page for C2 Object Storage, a Cloudflare/C2 integration tutorial, and an SSO Server
release note ("Added support for Cross-Origin Resource Sharing (CORS) to enhance OIDC client
compatibility", 2026-06-16). Search:
[kb.synology.com/en-global/search?query=CORS](https://kb.synology.com/en-global/search?query=CORS).

What *is* documented:

- **Web Station's per-portal settings do not include response headers.** The
  [Web Portal help](https://kb.synology.com/en-global/DSM/help/WebStation/application_webserv_virtualhost?version=7)
  lists exactly: HTTP back-end server, PHP profile, portal type (name-/port-/alias-based), an HSTS
  checkbox, an access control profile, and an error page profile. Nothing else.
- **Backends are nginx and Apache HTTP Server 2.4**, per the
  [Web Station technical specifications](https://www.synology.com/en-global/dsm/7.2/software_spec/web_station),
  which also list HTTP/2, HSTS, per-portal certificates and TLS profile levels — and *no* custom
  header capability.
- **There is a "Custom Header" feature, but on the reverse proxy, not Web Station.** The
  [Login Portal → Advanced help](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/system_login_portal_advanced?version=7)
  says: "To set up custom header for reverse proxy: Click Reverse Proxy > Create > Custom Header.
  Click WebSocket from the Create drop-down menu to quickly create WebSocket function header to allow
  reverse proxy to support WebSocket."

**[UNESTABLISHED] — and this is the most important gap in this note.** Synology does not document
whether "Custom Header" sets request headers sent *upstream* to the target (nginx `proxy_set_header`)
or response headers returned *to the browser* (nginx `add_header`). The only documented preset is
WebSocket, whose nginx implementation is `proxy_set_header Upgrade` / `Connection` — i.e. upstream
request headers, which would make the feature **useless for CORS**. I would not plan around this
feature until it has been tried on the device; it is a five-minute experiment (add
`Access-Control-Allow-Origin` in the UI, then `curl -I` the endpoint from a laptop) and it belongs in
the spike.

Fallbacks if it turns out to be upstream-only, none of them Synology-documented and all therefore
**[UNESTABLISHED]**:

- Choose **Apache** as the Web Station back-end and set headers in `.htaccess` via `mod_headers`
  (`Header set Access-Control-Allow-Origin "..."`). Requires `mod_headers` enabled and
  `AllowOverride` permitting it.
- Run a small container (Container Manager) with your own nginx/Caddy in front of the media
  directory, and put DSM's certificate on it.
- Serve the media through a tiny app you control rather than through DSM's own file services.

**Also unestablished:** whether Synology Photos' or File Station's own HTTP APIs emit any CORS
headers. Synology publishes API guides as PDFs outside the Knowledge Center; I did not find a
first-party statement on CORS in them. If the spike intends to call the Synology Photos API from the
browser, that is an additional unknown on top of everything above — which is a reason to prefer
serving plain files out of a Web Station document root for the first spike.

---

## 4. Installed PWA (standalone) vs the same page in a Safari tab

**Nothing in §1–§3 branches on display mode.** Mixed content, secure contexts, CORS and TLS trust are
engine-level and identical. I found no primary source describing any display-mode-dependent
behaviour in any of them, and none of the WebKit code quoted above consults it.

What *is* different, and matters operationally:

- **A Home Screen web app has its own storage, isolated from Safari.** From
  [WebKit's Tracking Prevention policy page](https://webkit.org/tracking-prevention/): "the website
  data of home screen web applications is kept isolated from Safari and thus will not be affected by
  ITP's classification of tracking behavior in Safari." The same section notes the first-party domain
  of a home screen web app is "exempt from ITP's 7-day cap on all script-writeable storage."
  **Practical consequence: anything you verify in a Safari tab — a granted permission, a stored
  token, a Service Worker registration, a cached certificate decision — does not carry into the
  installed app. Every test must be repeated in the installed app.**
- **Storage quota is the same, but persistence heuristics favour the installed app.** From
  [Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/): "When a web
  app is running standalone (as Home Screen Web App on iOS or Web App added to dock on macOS), it has
  the same origin quota and overall quota as when it is opened in a browser app," and "WebKit
  currently grants a [`StorageManager.persist()`] request based on heuristics like whether the
  website is opened as a Home Screen Web App." Relevant if the Service Worker cache in §5 is to
  survive.
- **Installation is now unconditional.** Per
  [WebKit Features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/):
  "By default, every website added to the Home Screen opens as a web app… there are now zero
  requirements for 'installability' in Safari. Users can add any site to their Home Screen and open
  it as a web app on iOS 26 and iPadOS 26." A manifest is no longer required to get standalone mode —
  though you still want one for icon, name and `display`.

**[UNESTABLISHED] and worth an explicit spike observation:** whether an installed web app is covered
by TN3179's OS-level exemption for "`WKWebView`, `SFSafariViewController`, and Safari". If it is not,
an installed app reaching a LAN IP could in principle trigger the OS Local Network alert (or be
denied silently) where the same page in a Safari tab would not. Configuration 3 in the ranked list
below is where this would show up; watch for a system alert, and check Settings → Privacy & Security →
Local Network for a new entry after the test.

---

## 5. Service Worker caching of cross-origin responses

Yes — with precise limits, all from the
[Service Workers specification](https://w3c.github.io/ServiceWorker/).

§6.4 "Cross-Origin Resources and CORS" states the design directly:

> Service workers enable this by allowing Caches to fetch and cache off-origin items. Some
> restrictions apply, however. First, unlike same-origin resources which are managed in the Cache as
> Response objects whose corresponding responses are basic filtered response, the objects stored are
> Response objects whose corresponding responses are either CORS filtered responses or opaque
> filtered responses. They can be passed to `event.respondWith(r)` method in the same manner as the
> Response objects whose corresponding responses are basic filtered responses, but cannot be
> meaningfully created programmatically.

The two APIs behave differently, and this trips people up:

- **`cache.put(request, response)` accepts opaque responses.** Reading the algorithm steps in §5.4.5,
  the only rejections are: request URL scheme not `http`/`https`; request method not `GET`; response
  status is `206`; a `Vary: *` header; or a disturbed/locked body. **There is no check on response
  type.** An opaque response (type `"opaque"`, status `0`) passes.
- **`cache.add()` / `cache.addAll()` reject opaque responses.** §5.4.4: "If response's type is
  `error`, or response's **status is not an ok status** or is `206`, reject responsePromise with a
  TypeError." An opaque filtered response has status `0`, which is not ok. So a naive
  `addAll([...mediaUrls])` precache of NAS media **will fail**, and the fix is a manual
  `fetch(url, {mode: 'no-cors'})` followed by `cache.put`.

Two consequences for video specifically:

1. **`206` responses can never be cached.** Both APIs reject them explicitly. If media is served with
   byte ranges, the Service Worker must fetch and store the full `200` response, then serve ranges
   itself (or serve the whole thing).
2. **[UNESTABLISHED]** whether WebKit routes `<video>` element loads — and their `Range` requests —
   through the Service Worker's `fetch` handler on iPadOS, and how a media element reacts to a full
   `200` returned for a range request. I found no primary source settling this. It is the highest-risk
   item in configuration 5 below and should be measured, not assumed.

On quota: opaque responses are stored but their true size is not exposed; the storage-policy blog
above covers the origin/overall quota model and the eviction rules (`QuotaExceededError` handling is
"necessary"). Photos and videos will consume it fast; plan eviction deliberately.

---

## 6. Ranked configurations to spike (issue #5)

Ranked by likelihood of working, most likely first. **These are hypotheses with observation plans,
not predictions of outcome.** Run them in order and stop when one holds — but run configuration 6
regardless, because its failure message is the documentation.

Throughout: use **Safari Web Inspector attached from a Mac** (Settings → Apps → Safari → Advanced →
Web Inspector on the iPad). Safari 26.0 added automatic Service Worker inspection via Develop →
Inspect Apps and Devices, which also lists Home Screen web apps
([Safari 26.0 features](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)) — you need it
for configuration 5.

**Test every configuration twice: once in a Safari tab, once in the installed Home Screen web app.**
Storage and permission state do not cross that boundary (§4).

---

### Configuration 1 — Same origin: serve the PWA from the NAS

**Setup.** PWA static bundle published into a Web Station document root. Media served from the same
Web Station portal. Origin for both: `https://<name>.synology.me` (Synology DDNS + Let's Encrypt
certificate, set as default in Control Panel → Security → Certificate). Media referenced by relative
URL. Headers: none required.

**Why first.** Same-origin. No mixed content, no CORS, no cross-origin Service Worker concerns, and
Local Network Access is irrelevant whichever way the name resolves. It is the only configuration
where none of §1–§3 can bite.

**Observe.** App loads and installs to the Home Screen; media renders; Service Worker registers and
`cache.put` of a same-origin response succeeds; playback of a video with seeking works.

**Failure looks like.** A TLS interstitial (certificate does not cover the name in the URL, or the
default certificate was not applied to the Web Station portal); a DSM error page instead of the app
(document root or `http` group permissions — the Web Station help notes the `http` group needs read
access to website folders); the app being unreachable whenever the NAS is asleep or the WAN link is
down.

**Cost.** Abandons Azure Static Web Apps as the host, and ties app availability to the NAS. Record it
as the fallback that is known to work rather than the default choice — but establish that it works
first, so later failures can be attributed.

---

### Configuration 2 — Azure-hosted PWA, NAS on public HTTPS, media via `<img>`/`<video>`

**Setup.** PWA at `https://<app>.azurestaticapps.net`. Media at `https://<name>.synology.me/...`
(Synology DDNS resolving publicly to the WAN IP; router forwards 443 to the NAS; port 80 forwarded
for Let's Encrypt issuance and renewal). Certificate: Let's Encrypt via DSM. Media referenced by
plain `<img src>` / `<video src>` with **no** `crossorigin` attribute. Headers: **none**.

**Why second.** Public→public request: not a local network request at all, so §1 never applies even
after Local Network Access ships. HTTPS on both ends kills §2. No-cors mode kills §3.

**Observe.** Images and video render in both the tab and the installed app. In Web Inspector, the
network entry shows a real `200` with sensible timing. Measure throughput on home Wi-Fi and compare
against the same fetch from a laptop on the LAN — this tells you whether the router is hairpinning
locally or sending traffic out and back.

**Failure looks like.** A broken image with **no console error** — opaque responses report nothing,
so plan for a same-origin canary request alongside. Connection timeouts only when on home Wi-Fi
(router lacks NAT hairpin/loopback → configuration 3). Unreachable from everywhere including cellular
(CGNAT on the ISP link, or port 443 not forwarded → configuration 7). A TLS interstitial (certificate
name mismatch, or expired because port 80 was closed at renewal time).

**Also record.** Whether you are comfortable exposing 443 and 80 on the NAS to the Internet at all.
This configuration's real cost is security posture, not browser behaviour.

---

### Configuration 3 — Same as 2, plus split-horizon DNS to keep traffic on the LAN

**Setup.** Identical to configuration 2, except a LAN resolver answers `<name>.synology.me` with the
NAS's LAN address (e.g. `192.168.1.50`) — via Synology DNS Server hosting a primary zone
([Zones help](https://kb.synology.com/en-global/DSM/help/DNSServer/dns_server_zone_mng?version=7)),
or a single-name override on the router — and DHCP hands that resolver to LAN clients. Certificate is
unchanged and still valid, because the name is unchanged. Headers: none.

**Why third.** Same origin-level properties as configuration 2, but traffic stays on the LAN. This is
the configuration that *does* become a local network request under §1's definition, so it is the one
that would be affected if Local Network Access ships and turns on.

**Observe.**

1. Does the iPad actually resolve to the LAN IP? Compare load timing against configuration 2, and
   check whether traffic is visible on the LAN.
2. Does the router's DNS rebinding protection reject a public name answering with a private address
   (§2)? Symptom: NXDOMAIN or an empty answer for a name that resolves fine from cellular.
3. Does iCloud Private Relay, an encrypted-DNS profile, or a per-network DNS setting bypass the LAN
   resolver? Symptom: it silently works but at configuration-2 speed.
4. **Does any OS-level Local Network alert appear** — particularly in the installed web app (§4)?
   Afterwards, check Settings → Privacy & Security → Local Network for a new entry.
5. Does the certificate still validate? (It should; the name is unchanged.)

**Failure looks like.** Name does not resolve on the LAN; a TLS error (wrong name used); a working
request that turns out to be going out through the WAN anyway; or an unexpected system permission
alert.

**Also record.** Whether Let's Encrypt renewal still succeeds after 90 days with this DNS split in
place — DSM's renewal needs port 80 reachable from the Internet, and a split-horizon zone must not
break the validation path.

---

### Configuration 4 — Configuration 2 or 3, plus CORS for JavaScript reads

**Setup.** As above, plus response headers on the media endpoint:

```
Access-Control-Allow-Origin: https://<app>.azurestaticapps.net
Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges
```

(no trailing slash on the origin; omit `Access-Control-Allow-Credentials` and keep requests
`credentials: "omit"` unless the NAS demands a session cookie). Try, in this order: (a) Login Portal →
Advanced → Reverse Proxy → Custom Header; (b) Apache back-end with `.htaccess` + `mod_headers`;
(c) a container running your own nginx/Caddy.

**Why fourth.** Only needed if the app must *read* media bytes rather than merely display them —
blob URLs, decryption, canvas processing, progress reporting, or a reachability probe. §3 says
display alone does not need this.

**Observe.**

1. `curl -I https://<name>.synology.me/<media>` from a laptop — does the header actually appear in the
   **response**? This is the check that settles the open question in §3 about what Synology's "Custom
   Header" does.
2. Whether a preflight `OPTIONS` is issued at all (it should not be, for a plain GET with a safelisted
   `Range`).
3. `response.ok`, `response.status`, and `response.headers.get('Content-Range')` are all readable
   from script.

**Failure looks like.** A console message of the form "Origin `https://…` is not allowed by
Access-Control-Allow-Origin"; or `response.type === 'opaque'` with status `0` (the request quietly
fell back to no-cors); or a preflight `OPTIONS` returning 405/404 from DSM.

---

### Configuration 5 — Service Worker cache over whichever of 1–4 works

**Setup.** Service Worker on the PWA origin. For cross-origin media (configurations 2–4):
`fetch(url, {mode: 'no-cors'})` then `cache.put(request, response)` — **not** `cache.addAll`, which
rejects opaque responses (§5). Serve from cache in the `fetch` handler via `event.respondWith`. Call
`navigator.storage.persist()` from the installed app.

**Why fifth.** It depends on a working configuration underneath, and it carries the one remaining
unestablished behaviour (media + Service Worker + ranges).

**Observe.**

1. `cache.put` with an opaque response resolves rather than throwing `TypeError`.
2. An `<img>` served from that cache renders.
3. **Does a `<video>` element's request reach the Service Worker's `fetch` handler at all on
   iPadOS?** Log every intercepted request with its `destination` and `headers.get('Range')`.
4. If it does: what happens when the worker answers a range request with a full `200`? Does playback
   start, does seeking work, or does the element error?
5. `navigator.storage.persisted()` returns `true` in the installed app; `estimate()` shows plausible
   usage growth.

**Failure looks like.** `TypeError` from `cache.put` (you passed a `206`, or a `Vary: *` response —
§5); `addAll` rejecting; video requests never appearing in the worker; playback that starts but
cannot seek; `QuotaExceededError` after a handful of videos.

---

### Configuration 6 — Control: plain HTTP to the LAN IP (expected to fail; run it anyway)

**Setup.** PWA on Azure. Media at `http://192.168.1.50/...`. No certificate, no headers. Then repeat
with `fetch(url, {targetAddressSpace: 'local'})` and `{targetAddressSpace: 'loopback'}`.

**Why run a configuration you expect to fail.** It converts §1 and §2 from reading into measurement,
it produces the exact error string for the team's own console, and it tests whether
`targetAddressSpace` has any effect on a stock device — the one live question left by the Safari 26.4
release note (§1).

**Observe.** The console message. WebKit's is built as: `[blocked] The page at <url> requested
insecure content from <url>. This content was blocked and must be served over HTTPS.` Then: does
passing `targetAddressSpace` throw a `TypeError`, get silently ignored (the expected outcome for an
IDL member gated off by `EnabledBySetting`), or actually change the result? Does
`'targetAddressSpace' in Request.prototype` report `true` or `false`? That single expression is the
cheapest available probe of whether the flag is on.

**A "failure" here — i.e. it works — would be the most interesting result in the whole spike**, and
would mean re-reading §1 against a newer WebKit than the one checked on 2026-08-24.

---

### Configuration 7 — Fallback: no inbound ports (tunnel or relay)

**Setup.** If configuration 2 proves impossible because the ISP uses CGNAT or inbound ports cannot be
opened: expose the NAS through an outbound-only tunnel (e.g. Cloudflare Tunnel in Container Manager)
or Synology QuickConnect, giving a public HTTPS hostname with a valid certificate that is not the
home IP at all.

**Why last.** It adds a third party to the media path and likely a bandwidth ceiling, and for a
media-heavy iPad experience on the same LAN as the NAS, routing every photo through a relay is the
wrong shape. But it is the configuration that works when the network refuses to cooperate.

**Observe.** Sustained throughput for a large video; per-request latency; whether the provider's terms
permit this volume of media; whether Let's Encrypt/DSM certificate handling is still needed at all
(a tunnel usually terminates TLS itself).

**Failure looks like.** Throughput far below LAN speed; the tunnel provider rate-limiting or blocking
large media transfers.

---

## What I could not establish

Listed so the spike can close them, in rough order of how much they matter.

1. **Whether Synology's reverse-proxy "Custom Header" emits response headers to the browser or
   request headers to the upstream.** Synology documents only the WebSocket preset, whose nginx
   equivalent is upstream-only. Everything in configuration 4 depends on this. Five-minute test.
2. **Whether WebKit routes `<video>` loads and their `Range` requests through the Service Worker on
   iPadOS**, and how a media element reacts to a full `200` served for a range request.
3. **Whether an installed Home Screen web app falls under TN3179's OS-level exemption** for
   `WKWebView`/`SFSafariViewController`/Safari, or is treated as a distinct program that could trigger
   the Local Network alert.
4. **Whether `targetAddressSpace` has any observable effect on a stock iPadOS device.** The preference
   defaults to `false` and is not surfaced in end-user UI, which says it should not — but Safari 26.4
   shipped a user-facing fix for it, so measure rather than assume.
5. **Which ACME challenge Synology's wildcard-certificate flow uses**, and therefore whether the
   port-80 requirement genuinely applies to every renewal path.
6. **Whether the household router enables DNS rebinding protection.** Device-specific; only
   configuration 3 cares.
7. **Whether Synology Photos' and File Station's HTTP APIs emit any CORS headers.** Synology publishes
   those API guides as PDFs outside the Knowledge Center and I found no first-party statement. Reason
   enough to spike against plain files in a Web Station document root before spiking against the
   Photos API.

## Sources

Primary, in the order first used.

**Specifications**

- [Local Network Access](https://wicg.github.io/local-network-access/) — WICG Draft Community Group Report, 7 August 2026
- [Local Network Access explainer](https://github.com/WICG/local-network-access/blob/main/explainer.md)
- [Mixed Content](https://w3c.github.io/webappsec-mixed-content/) — W3C
- [Secure Contexts](https://w3c.github.io/webappsec-secure-contexts/) — W3C
- [Fetch Standard](https://fetch.spec.whatwg.org/) — WHATWG
- [Service Workers](https://w3c.github.io/ServiceWorker/) — W3C

**WebKit**

- [Bug 250607 — Implement Local Network Access](https://bugs.webkit.org/show_bug.cgi?id=250607) and its [blocker list](https://bugs.webkit.org/buglist.cgi?blocked=250607&order=bug_id)
- [Bug 295047 — Enable Local Network Access by default](https://bugs.webkit.org/show_bug.cgi?id=295047)
- [`UnifiedWebPreferences.yaml`](https://github.com/WebKit/WebKit/blob/main/Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml)
- [`GeneratePreferences.rb`](https://github.com/WebKit/WebKit/blob/main/Source/WTF/Scripts/GeneratePreferences.rb)
- [`FetchRequestInit.idl`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/fetch/FetchRequestInit.idl) / [`FetchRequest.idl`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/fetch/FetchRequest.idl)
- [`MixedContentChecker.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/loader/MixedContentChecker.cpp)
- [`SecurityOrigin.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/SecurityOrigin.cpp)
- [`Quirks.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/Quirks.cpp)
- [WebKit standards-positions #520 — Local Network Access](https://github.com/WebKit/standards-positions/issues/520)
- [WebKit Features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)
- [Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [Tracking Prevention in WebKit](https://webkit.org/tracking-prevention/)

**Apple**

- [Safari 26.4 Release Notes](https://developer.apple.com/documentation/safari-release-notes/safari-26_4-release-notes)
- [TN3179: Understanding local network privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)

**Synology**

- [DDNS (Control Panel → External Access)](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/connection_ddns?version=7)
- [Certificate (Control Panel → Security)](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/connection_certificate?version=7)
- [Login Portal → Advanced (reverse proxy, custom header)](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/system_login_portal_advanced?version=7)
- [Web Station → Web Portal](https://kb.synology.com/en-global/DSM/help/WebStation/application_webserv_virtualhost?version=7)
- [Web Station technical specifications (DSM 7.2)](https://www.synology.com/en-global/dsm/7.2/software_spec/web_station)
- [DNS Server → Zones](https://kb.synology.com/en-global/DSM/help/DNSServer/dns_server_zone_mng?version=7)
- [Knowledge Center search: "CORS"](https://kb.synology.com/en-global/search?query=CORS) — three results, none about DSM/Web Station/Photos

**Other**

- [Let's Encrypt FAQ](https://letsencrypt.org/docs/faq/)
- [Let's Encrypt — Issuing our first IP address certificate](https://letsencrypt.org/2025/07/01/issuing-our-first-ip-address-certificate/)
- [dnsmasq man page](https://thekelleys.org.uk/dnsmasq/docs/dnsmasq-man.html) — `--stop-dns-rebind`
- [Chromium blink-dev — Intent to Ship: Local network access restrictions](https://groups.google.com/a/chromium.org/g/blink-dev/c/cwu_RUmBpzY)

Secondary, cited as such and not relied upon:

- [Apple Developer Forums thread 811690](https://developer.apple.com/forums/thread/811690) — Safari vs Chrome local network prompting
