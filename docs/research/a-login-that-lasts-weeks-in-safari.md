# A login that lasts weeks in Safari and still loads photos and videos

Research note for issue [#54](https://github.com/marcovandehaar/rememberwhen/issues/54), on the map
[#51 — Stay logged in, and reach it from outside](https://github.com/marcovandehaar/rememberwhen/issues/51).
Written 2026-09-30. Apache sources read from the `apache/httpd` `2.4.x` branch on that date. Every claim is
linked to the source that owns it; anything I could not establish from a primary source is marked
**[UNESTABLISHED]**, and reasoning that goes beyond what a source says is marked *inference*.

Builds on `docs/research/authorization-that-survives-img-and-video-in-safari.md` (issue #13, "the #13
note") and on the 2026-09-01 amendment to
[ADR 0004](../adr/0004-the-app-is-served-from-the-nas-so-the-media-is-same-site.md). It does not repeat
their findings, only relies on them: the app, catalogue and media share one origin; a first-party cookie is
carried by `<img>` and `<video>` with no special attributes; the Service Worker sees those requests with
`credentials: "include"`; HTTP Basic works but Safari forgets it when the app is closed; Basic with `apr1`
costs ~2.3 ms per request, and `bcrypt` per request is unusable.

## Verdict

**Swap the credential, keep the architecture.** Replace HTTP Basic with a **per-device random token in a
server-set `HttpOnly; Secure` cookie that lives 90 days and slides on use**, checked by `mod_rewrite` in the
same root `.htaccess` — a regex on the `Cookie` header plus a `-f` test for a file named after the token. No
PHP in the request path, no hashing per request. A small PHP page runs **once per device, at enrolment**, to
mint the token, write the device's file and set the cookie. **Revoking a device is deleting its file**, which
File Station can do without a terminal.

Why this and not something cleverer:

1. **Basic cannot be made to persist.** Nothing in HTTP asks the client to keep a Basic credential, and
   whether it is kept is decided inside Safari's closed-source UI and networking layer. Measured
   session-scoped on the device (ADR 0004 amendment). There is no header to fix it.
2. **ITP does not cap this cookie.** WebKit's 7-day cap is on cookies *created through `document.cookie`*
   and on script-writeable storage. WebKit itself says authentication cookies should be set *"in an HTTP
   response and mark[ed] Secure and HttpOnly"* precisely so the cap does not touch them. The only cap on
   server-set cookies is for CNAME/IP cloaking, which a single-host origin cannot trigger.
3. **`mod_auth_form` is the textbook answer and the wrong one on this box.** Its source re-verifies the
   password against the `AuthUserFile` on **every request**, so it costs at least what Basic costs; encrypt
   the session (as the docs recommend) and `mod_session_crypto` adds a **PBKDF2 key derivation with 4096
   iterations** per request on top.
4. **Passkeys are not needed for v1.** With a 90-day sliding cookie, re-authentication happens only after 90
   days of non-use or a wiped device, and ADR 0004 already accepts that as "the same act as the first
   time". Passkeys would need iCloud Keychain on the kids' Apple Accounts, a PHP WebAuthn library, and a
   behaviour in the installed iOS web app that no Apple source confirms. They are a clean v2 addition on the
   same cookie.

What only the device can settle is listed in §8. The two that could still sink the recommendation are
whether Web Station's Apache has `mod_rewrite` loaded (almost certainly, but unverified) and whether the
cookie survives closing the installed app on the 2019 iPad (every source says yes; nobody has seen it).

---

## 1. Can Safari's Basic credential be made to persist?

**No — not by anything the server can send.** HTTP Basic's only auth-params are `realm` and `charset`
([RFC 7617 §2](https://www.rfc-editor.org/rfc/rfc7617.html#section-2)); nothing in it or in
[RFC 9110 §11](https://www.rfc-editor.org/rfc/rfc9110.html#section-11) lets a server ask for a credential to
outlive the session. Whether it does is the client's choice, expressed in WebKit as a `CredentialPersistence`
on the credential the UI hands back — and the UI that makes that choice (Safari's password sheet and the
installed web app's equivalent) is not in the WebKit open-source tree. On the networking side WebKit's own
engineers say as much: *"HTTP and lower networking is not part of the WebKit open source project"*
(John Wilander, [WebKit bug 292975](https://bugs.webkit.org/show_bug.cgi?id=292975), quoted in the #13 note).

What was measured is the answer: on iPadOS 18.7.5, closing the browser or the installed app forgets the
credential (ADR 0004 amendment, "it is once per session").

Two partial escapes, neither recommended:

- **A password manager filling the dialog.** On macOS, Safari saves HTTP-auth credentials as keychain
  "Internet Password" items. On iOS the evidence is only secondary — Apple Community threads and an
  [open radar](https://openradar.appspot.com/21379927) — and it says iOS does **not** offer to save or fill
  them. Even if it did, a kid would still face a dialog. Not a fix for this goal.
- **URL-embedded credentials as the web app's start URL** (`https://device:secret@nas…/`). The #13 note (§4.2)
  found WebKit answers a 401 from URL credentials without prompting, and a same-origin session would then carry
  the credential to subresources. So a home-screen icon whose start URL embeds the device password *might*
  re-authenticate on every launch. **[UNESTABLISHED]** whether iOS keeps userinfo in a manifest `start_url`
  or a Web Clip at all, and it puts a static, typeable secret in plain text in the icon. Listed for
  completeness and as a five-minute probe (§8, optional), not as a design.

## 2. A long-lived same-site cookie

### 2.1 ITP does not cap a server-set `HttpOnly` cookie

The rules, from WebKit's own pages:

- **Script-written cookies are capped.** *"With ITP 2.1, all persistent client-side cookies, i.e. persistent
  cookies created through document.cookie, are capped to a seven day expiry."* And the guidance that
  matters here: *"Authentication cookies should be Secure and HttpOnly … Cookies created through
  document.cookie cannot be HttpOnly which means authentication cookies should not be affected by the lifetime
  cap. If they are, you need to set your authentication cookies in an HTTP response and mark them Secure and
  HttpOnly."* ([Intelligent Tracking Prevention 2.1](https://webkit.org/blog/8613/intelligent-tracking-prevention-2-1/))
- **Script-writeable storage is capped after 7 days of no interaction.** *"ITP deletes all cookies created in
  JavaScript and all other script-writeable storage after 7 days of no user interaction with the website. The
  latter storage forms are: IndexedDB, LocalStorage, Media keys, SessionStorage, Service Worker registrations
  and cache."* User interaction is *"a user click, tap, or keyboard entry … Scrolling is not considered user
  interaction."* ([Tracking Prevention in WebKit](https://webkit.org/tracking-prevention/))
- **Server-set cookies are capped only for cloaking.** *"ITP detects third-party CNAME cloaking and
  third-party IP address cloaking requests and caps the expiry of any cookies set in the HTTP response to 7
  days."* (same page). The #13 note (§2.5) read the implementation in `NetworkTaskCocoa.mm`: it applies to a
  *same-site subresource that resolves to a different CNAME or IP address than the top document*. With the
  app, catalogue and media on one host, the addresses are equal and **no cap applies**. The
  [WebKit PR that added the IP variant](https://github.com/WebKit/WebKit/pull/5347) (Safari 16.4) confirms the
  comparison is against the main resource's address.
- **Link-decoration caps (24 h)** apply to *"cookies created in JavaScript on the landing webpage"* — not
  relevant to an `HttpOnly` cookie.

So a `Set-Cookie: …; Max-Age=7776000; Secure; HttpOnly` from the NAS keeps its full 90 days in Safari.
*Inference*, low risk: ITP's broader "delete all website data" behaviour targets domains classified as
cross-site trackers; a single-origin household site that is never embedded elsewhere does not get classified.

**Home-screen web apps are exempt from the 7-day storage cap altogether.** *"The first-party domain of home
screen web applications is exempt from ITP's 7-day cap on all script-writeable storage"*
([Tracking Prevention in WebKit](https://webkit.org/tracking-prevention/)); *"Web applications added to the
home screen are not part of Safari and thus have their own counter of days of use. Their days of use will match
actual use of the web application"* ([Full Third-Party Cookie Blocking and More](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)).

**The consequence for a rarely-visited Safari tab** (the ticket's extra question): the cookie survives, but
after 7 days of *Safari use* without a tap on the site, the tab's Service Worker registration and Cache Storage
are deleted. The installed app is not subject to that. So "logged in but the offline cache is gone" is a normal
state for a tab user, and the app must not treat a missing Service Worker as a missing login — which it
cannot see anyway, because an `HttpOnly` cookie is invisible to script (see §2.5).

**Session cookies are the wrong kind.** [WebKit bug 272325](https://bugs.webkit.org/show_bug.cgi?id=272325)
— *"REGRESSION (iOS 17.x): Session cookies being reset randomly in a Home Screen web app"* — is still open,
with reports through iOS 18.1; the reporters found cookies with `Max-Age` unaffected. The cookie must carry
`Max-Age` or `Expires`. (This also squares with Basic: a session-scoped credential is exactly what does not
survive.)

### 2.2 It attaches to `<img>`, `<video>`, range requests and Service Worker fetches

Established in the #13 note from WebKit source and measured in ADR 0004: both `<img>` and `<video>` load
with `FetchOptions::Credentials::Include` and go through the Service Worker; the cookie-blocking decision
returns `None` on its first line when the request's registrable domain equals the top document's. Fetch's
HTTP-network-or-cache fetch appends the `Cookie` header whenever credentials are included
([Fetch Standard](https://fetch.spec.whatwg.org/)). A `fetch()` from inside the Service Worker defaults to
credentials mode `same-origin`, which for a same-origin URL includes cookies.

Range requests are not special: they are the same `<video>` loads with a `Range` header, so the cookie rides
along. *Inference* until seen — §8 re-runs ADR 0004's three-range probe with the cookie instead of Basic. (The
known "AVFoundation doesn't send cookies" complaints are about HLS playlists and segments fetched by the
media stack; progressive `.mov`/`.mp4` loads through `MediaResourceLoader`, which the #13 note read.)

`SameSite=Lax`, not `Strict`: a home-screen launch or a link from Messages is a top-level navigation whose
initiator may not count as same-site; `Lax` still sends the cookie there, and there is no cross-site
subresource use to defend against. *Inference* on how iOS classifies a home-screen launch; `Lax` makes the
question moot.

### 2.3 What Apache can check without PHP

Web Station's generated vhost has `AllowOverride All` (ADR 0004), so everything allowed in `.htaccess` is
available. Four candidates:

**(a) `mod_auth_form` + `mod_session_cookie` (+ `mod_session_crypto`) — works, costs more than Basic.**
[`mod_auth_form`](https://httpd.apache.org/docs/2.4/mod/mod_auth_form.html) authenticates with an HTML form
against the same `AuthUserFile`, then *"the user's login details will be stored in a session provided by
mod_session"*. The docs do not say what happens on later requests; the source does. In
[`mod_auth_form.c`](https://github.com/apache/httpd/blob/2.4.x/modules/aaa/mod_auth_form.c),
`authenticate_form_authn` reads the user and **password** back out of the session and calls
`check_authn(r, sent_user, sent_pw)` — the provider's `check_password`, i.e. the `apr1` hash — on every
request. And the session holding that password is, per
[`mod_session`](https://httpd.apache.org/docs/2.4/mod/mod_session.html), *"exposed to the client, with a
corresponding risk of a loss of privacy"* unless encrypted with
[`mod_session_crypto`](https://httpd.apache.org/docs/2.4/mod/mod_session_crypto.html). Whose source
([`mod_session_crypto.c`](https://github.com/apache/httpd/blob/2.4.x/modules/session/mod_session_crypto.c))
derives the key on every encrypt and decrypt:

```c
res = apr_crypto_passphrase(&key, &ivSize, passphrase, passlen,
        (unsigned char *) (&salt), sizeof(apr_uuid_t),
        *cipher, APR_MODE_CBC, 1, 4096, f, r->pool);
```

— 4096 PBKDF2 iterations with a fresh random salt per cookie, so nothing can be cached. Per request that is
the `apr1` check Basic already costs **plus** a key derivation roughly four times the work of `apr1`'s 1000
MD5 rounds (*inference* on the ratio; measure before believing a number). The sliding part does work —
`SessionMaxAge` resets on save, `mod_session_cookie` writes a real `Max-Age` via `ap_cookie_write`
([`util_cookies.c`](https://github.com/apache/httpd/blob/2.4.x/server/util_cookies.c)), and
`SessionExpiryUpdateInterval` (2.4.41+) avoids rewriting the cookie on every request. Two more snags:
`AuthFormLoginRequiredLocation` is **not allowed in `.htaccess`** (directory context only), and it needs
`mod_session`, `mod_session_cookie`, `mod_session_crypto` and an APR-util crypto driver, none of which is
known to be loaded on Synology (§2.4). Revocation is good: deleting the `.htpasswd` line takes effect on the
next request, because the password is re-checked every time.

**(b) `mod_rewrite` gate on a per-device token file — the recommendation.** Everything needed is in
[`mod_rewrite`](https://httpd.apache.org/docs/2.4/mod/mod_rewrite.html), allowed in `.htaccess` under
`FileInfo`:

- `%{HTTP_COOKIE}` is a valid TestString.
- *"Backreferences of the form %N … provide access to the grouped parts … of the pattern from the last matched
  RewriteCond"*, and they may be used in later RewriteCond TestStrings.
- `-f` tests *"whether the TestString (as a pathname) exists and is a regular file"*. In the source it is a
  single `apr_stat()`, and — checked in `mod_rewrite.c` — a `-f` condition does **not** overwrite the
  backreferences (only regex and `expr` conditions update `briRC`), so `%1` from the cookie match is still
  available to the rule that follows.
- The `CO` flag re-issues a cookie from the server: `[CO=NAME:VALUE:DOMAIN:lifetime:path:secure:httponly:samesite]`,
  lifetime *"in minutes"*, `samesite` *"Available in 2.4.47 and later"*
  ([RewriteRule flags](https://httpd.apache.org/docs/2.4/rewrite/flags.html)). It writes `expires=`, not
  `Max-Age`, and it **requires a domain**, so the enrolment page must set the cookie with the same
  `Domain=` or the browser keeps two cookies of the same name.

A sketch — not a build, the paths and names are placeholders:

```apache
RewriteEngine On

# Reachable without a device cookie: the enrolment page, manifest and icons.
RewriteRule ^(enrol/|manifest\.webmanifest$|icons/) - [L]

# Enrolled device: the cookie names a file that exists.
RewriteCond %{HTTP_COOKIE} (?:^|;\s*)rw=([A-Za-z0-9_-]{43})(?:;|$)
RewriteCond /volume1/<private-share>/devices/%1 -f
# Slide the expiry on the one request every launch makes to the network.
RewriteRule ^catalog\.json$ - [CO=rw:%1:nas.vandehaar.dev:129600:/:secure:httponly:Lax,L]

RewriteCond %{HTTP_COOKIE} (?:^|;\s*)rw=([A-Za-z0-9_-]{43})(?:;|$)
RewriteCond /volume1/<private-share>/devices/%1 -f
RewriteRule ^ - [L]

# Everything else: not enrolled.
RewriteRule ^ - [F]
ErrorDocument 403 /enrol/
```

Per request: one regex over the `Cookie` header and one `stat()`. *Inference*: microseconds, against Basic's
2.3 ms — the measurement belongs in §8. The strict `[A-Za-z0-9_-]{43}` class is what makes interpolating the
cookie into a path and into `CO` safe; the flags page warns exactly about that. The refresh is attached to
`catalog.json` because it is the one request each launch is guaranteed to send to the network — `App.tsx`
fetches it with `cache: 'no-store'`, and the Service Worker must keep passing it through. Refreshing on the
document instead would silently stop working once the Service Worker serves `index.html` from cache, and the
cookie would then die 90 days after *enrolment* rather than after last use.

Two traps worth writing down. **A child `.htaccess` that says `RewriteEngine On` replaces these rules for its
subtree**, because per-directory rules are not inherited unless the child asks for it with `RewriteOptions
Inherit` (the option exists in the source, `OPTION_INHERIT`; default off). And **never wrap the gate in
`<IfModule mod_rewrite.c>`**: if the module is missing, an unwrapped `RewriteEngine` fails the whole site with a
500, which is loud and safe; a wrapped one silently serves everything to everyone.

**(c) `Require expr` on the cookie — a fallback with no module risk.** `mod_authz_core` is certainly loaded
(it is what enforces `Require valid-user` today), and
[ap_expr](https://httpd.apache.org/docs/2.4/expr.html) can match a regex on `%{HTTP_COOKIE}`, test a file with
`-f`, and even hash with `sha1()`. The simplest form lists tokens inline —
`Require expr "%{HTTP_COOKIE} =~ /(?:^|;\s*)rw=(tok1|tok2|tok3)(?:;|$)/"` — at the price that adding a device
means editing `.htaccess` by hand, and sliding the expiry needs PHP (or mod_rewrite after all). Whether `$1`
from the regex can be spliced into a `-f` path in the same expression is **[UNESTABLISHED]**; the docs say
backreferences *"can normally only be used in the same expression as the matching regex"*, which is
suggestive, not conclusive. Keep as the fallback if §8 finds `mod_rewrite` absent.

**(d) PHP on every request — rejected.** A front controller verifying an HMAC cookie puts PHP in the byte path
of 20 MB clips and their range requests, which is the cost ADR 0004 already declined. Nothing here needs it.

### 2.4 Which modules Synology's Apache actually has

**[UNESTABLISHED] from any Synology source.** Synology documents that `.htaccess` works on the Apache
back-end ([KB: protect folders under "web"](https://kb.synology.com/en-global/DSM/tutorial/How_do_I_protect_my_folders_in_the_quot_web_quot_shared_folder_from_unprivileged_access))
but publishes no module list; the DSM 7.2
[Web Station specifications](https://www.synology.com/en-global/dsm/7.2/software_spec/web_station) list none.
What is known:

- **Established on the device (ADR 0004):** `mod_auth_basic`, `mod_authn_file` and `mod_authz_core` are
  loaded — Basic works — and `AllowOverride All`.
- **Secondary:** the package's main config is `/var/packages/Apache2.4/target/usr/local/etc/apache24/conf/httpd24.conf`,
  with `LoadModule` lines community posts describe uncommenting for `mod_rewrite`
  ([DevXperiences](https://www.devxperiences.com/pzwp1/2021/01/24/enabling-mod_rewrite/)). Whether it is on
  by default in the current package is not stated anywhere I could find. Editing that file is not a supported
  surface and a package update may revert it — so if `mod_rewrite` is *off*, route (c) beats turning it on.
- **Secondary:** the package was at Apache 2.4.58 in July 2024
  ([Marius Hosting](https://mariushosting.com/synology-apache-2-4-update-version-2-4-58/)), which is past both
  2.4.41 (`SessionExpiryUpdateInterval`) and 2.4.47 (`samesite` in `CO`).
- **Nothing at all** on `mod_session*`, `mod_auth_form` or an APR-util crypto driver. That is one more reason
  (a) is the expensive option: it may need a config edit Synology does not support.

One `grep LoadModule` on the box settles all of it (§8, probe 1).

### 2.5 What the app sees

An `HttpOnly` cookie cannot be read by script, so the app cannot know locally whether it is enrolled — it
finds out from the server. That is already the shape ADR 0004 prescribed ("an authenticated probe before
rendering"), with the reaction changed: a `403` from the catalogue means "not enrolled or revoked", and the app
navigates to `/enrol/` instead of calling `location.reload()`. The Basic-era **cascade of one dialog per
failing subresource disappears** — a `403` never prompts. Two of ADR 0004's "three lines" change too:
`crossorigin="use-credentials"` on the manifest link becomes unnecessary if the manifest and icons are exempt
from the gate (the sketch does that), and "never set `credentials: 'omit'`" still holds.

## 3. Passkeys / WebAuthn as the way to obtain the cookie

**Possible, and not needed for v1.** A passkey would replace the adult typing the enrolment password with the
device owner's Face ID or passcode. The cookie, gate and revocation stay exactly as in §2 — WebAuthn only
changes what the enrolment page accepts.

**PHP libraries.**

- [`lbuchs/WebAuthn`](https://github.com/lbuchs/WebAuthn) — MIT, one small library, *"PHP >= 8.0 with OpenSSL
  and Multibyte String"*, supports the `none` and `apple` attestation formats among others, and documents
  passkeys (`requireResidentKey`) with *"Apple iOS 16+, iPadOS 16+ … Android 9+"*. The fit for this box.
- [`web-auth/webauthn-lib`](https://github.com/web-auth/webauthn-lib) — MIT, PHP ≥ 8.2, and a `require` list of
  a dozen packages including five Symfony components
  ([composer.json](https://raw.githubusercontent.com/web-auth/webauthn-lib/5.2.x/composer.json)). Complete, and
  far heavier than a household enrolment page needs.

**Memory cost.** Only at enrolment or re-login — a PHP-FPM worker for one request. Web Station's PHP profile
exposes extensions per profile ([Script Language Settings](https://kb.synology.com/en-global/DSM/help/WebStation/application_webserv_php?version=7));
whether `openssl` and `mbstring` are ticked on this profile is a checkbox, not a risk. *Inference*: nothing
resident, so the 186 MB free is not at stake.

**Does WebAuthn work in an installed iOS web app?** **[UNESTABLISHED].** Apple's launch post names *"Safari,
SFSafariViewController and ASWebAuthenticationSession on iOS 14"* ([Meet Face ID and Touch ID for the
Web](https://webkit.org/blog/11312/)) and says nothing about home-screen apps; plain `WKWebView`s are
explicitly excluded unless the host app has an associated-domain entitlement. Plenty of production reports say
passkeys work in standalone mode on iOS 16+, and some report failures; I found no Apple or WebKit statement
either way. The user-gesture rule has relaxed since 2020 (the WebKit post required one; later releases grant
one call per page load), which matters little because enrolment is a button tap anyway.

**What passkeys cost that the ticket did not ask about.**

- *"Passkeys sync across a user's devices using iCloud Keychain"*, and *"Any Apple Account using iCloud Keychain
  requires two-factor authentication"* ([About the security of passkeys](https://support.apple.com/en-us/102195)).
  On the kids' iPads that means iCloud Keychain switched on for their accounts — an account-setup decision,
  not a web one.
- **A synced passkey is per Apple Account, not per device.** Marco's passkey would exist on every Apple device
  he owns. That is fine while the cookie remains the per-device credential, but revoking a *stolen* device must
  then also delete the passkey's public key server-side — which revokes it for every device sharing that
  account. The `.htpasswd` shape the map asks to keep ("enrolment is per device") maps to cookies, not to
  passkeys.
- It adds the only stateful PHP in the system (a challenge store and a public-key store).

## 4. Installed app vs Safari tab, and Android

| | Safari tab (iPadOS) | Installed web app (iPadOS) | Chrome + installed PWA (Android) |
| --- | --- | --- | --- |
| Cookie jar | Safari's | **Its own** — isolated from Safari | **Shared** with Chrome |
| 90-day server-set `HttpOnly` cookie | kept (not script-written) | kept | kept (Chrome caps at 400 days) |
| Session cookie / Basic credential | lost on close | lost on close; session cookies also lost randomly (bug 272325) | not relied upon |
| SW + Cache Storage | deleted after 7 days of Safari use with no tap on the site | exempt from the 7-day cap | normal quota eviction rules |
| Enrol once per | tab | installed app | device |

Sources: WebKit on isolation — *"the website data of home screen web applications is kept isolated from Safari"*
([Tracking Prevention](https://webkit.org/tracking-prevention/)); Chrome — *"cookies can no longer set an
expiration date more than 400 days in the future"* ([Chrome for Developers](https://developer.chrome.com/blog/cookie-max-age-expires));
Android sharing — WebAPKs use the current Chrome profile, *"Cookies are shared and active, any client side
storage is accessible"*, and clearing Chrome's site data applies to the WebAPK too ([web.dev: WebAPKs](https://web.dev/webapks/)).

**Enrol inside the installed app, not before installing it.** Safari 17 copies cookies into a web app when it is
added to the **Dock on macOS** — *"When a user adds a website to their Dock, Safari will copy the website's
cookies to the web app"* ([WebKit Features in Safari 17.0](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/))
— and **[UNESTABLISHED]** whether iPadOS does the same on Add to Home Screen. The design must not depend on it:
an unenrolled installed app lands on the enrolment page via `ErrorDocument 403`, and the adult enrols it there.

**iPadOS 26** opens *every* site added to the Home Screen as a web app by default
([heise](https://www.heise.de/en/news/iOS-26-and-iPadOS-26-Changed-web-app-behaviour-on-the-home-screen-10749652.html),
secondary; WebKit's [Safari 26.0 post](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) is the
primary). Nothing above changes, but the 2019 iPad in the ADR 0004 measurements runs iPadOS 18, so the spike
must cover 18 and, if a household device has it, 26.

## 5. Per-device revocation, option by option

| Option | Remove one device | Takes effect | Failure the device sees |
| --- | --- | --- | --- |
| Basic (today) | delete its `.htpasswd` line | next request | a password dialog per failing subresource (ADR 0004) |
| `mod_auth_form` session | delete its `.htpasswd` line | next request — the password is re-checked every time | a `401` or redirect; no dialog |
| **Token file + `mod_rewrite`** | **delete its file** (File Station or SSH) | next request | `403` → app routes to `/enrol/`; no dialog |
| `Require expr` token list | delete its token from `.htaccess` | next request | as above |
| Passkey enrolment (on top of a token) | delete the device's token file **and** the passkey's stored public key | next request | as above; the passkey is gone for every device on that Apple Account |
| URL credentials in the start URL | delete its `.htpasswd` line | next launch | as Basic |

With the token file, the file's contents can carry a human label and an enrolment date, so "which one is the
lost iPad" is answered by opening the folder. One consequence to accept knowingly: **the server has no idle
expiry.** The 90 days live in the cookie; a token for a device that was wiped or lost stays valid on the server
until its file is deleted. With two to four devices, deleting by hand is the proportionate answer — the
"no architecture for edge cases" rule — and a DSM scheduled task could prune old files later if it ever matters.

The token is 256 bits of randomness that nobody types, which also retires ADR 0004's standing caveat that Basic is
"person-shaped": nobody can learn a device's secret by looking over a shoulder. The enrolment password is still
person-shaped, but it is used once per device and can be long and stored in a password manager — and on iOS a
form field, unlike the Basic dialog, is something AutoFill fills.

## 6. Comparison

| | Basic (today) | URL creds in start URL | `mod_auth_form` | **Token cookie + `mod_rewrite`** | + passkey enrolment |
| --- | --- | --- | --- | --- | --- |
| Survives closing the app | **no** (measured) | ? | yes | **yes** | yes |
| 30–90 days, sliding | no | n/a (static) | yes | **yes** (`CO` on the catalogue) | yes |
| Typing after setup | every launch | none | none until expiry | **none until 90 days idle** | none; Face ID after expiry |
| `<img>`/`<video>`/range/SW | yes (measured) | ? | yes (cookie) | **yes** (cookie; re-measure) | yes |
| Per-request cost | ~2.3 ms (measured) | ~2.3 ms | ≥ 2.3 ms + PBKDF2 ×4096 | **regex + one `stat()`** | same |
| PHP | none | none | none | **enrolment only** | enrolment + WebAuthn lib |
| Modules beyond today's | none | none | `mod_session*`, `mod_auth_form`, crypto driver — all unverified | **`mod_rewrite` — unverified, near-certain** | same |
| Revocation | delete a line | delete a line | delete a line | **delete a file** | delete file + key |
| Kids | cannot | fine | fine | **fine** | need iCloud Keychain on their accounts |
| Unknowns | none | iOS keeping userinfo | module set | module set; cookie on device | standalone WebAuthn; account setup |

## 7. Recommendation for #55

Decide on **the token cookie checked by `mod_rewrite`**, with PHP only at enrolment:

1. `/enrol/`: a form taking a household enrolment password (a `bcrypt` hash in a config file outside the web
   root — `bcrypt` is right here, because it runs once per device) and a device label. On success it writes
   `<devices>/<token>` containing the label and date, sets
   `rw=<token>; Max-Age=7776000; Domain=nas.vandehaar.dev; Path=/; Secure; HttpOnly; SameSite=Lax`, and
   redirects to `/`.
2. Root `.htaccess`: the gate in §2.3(b), replacing `AuthType Basic`. `catalog.json` refreshes the cookie.
3. App shell: the existing "probe before render" treats `403` as "go to `/enrol/`".
4. Revocation: delete the device's file. Document it in a runbook next to the certificate one.
5. Passkeys: a v2 ticket, only if 90-day-idle re-enrolment turns out to be a real annoyance.

Hold the decision on the two things §8 lists first; if `mod_rewrite` is not loaded, fall back to §2.3(c)
rather than editing `httpd24.conf`.

On the map's synergy assumption: the cookie is bound to the host `nas.vandehaar.dev`. If the remote route keeps
that origin, the cookie works unchanged away from home. If the remote route needs a different hostname, each
device needs a second enrolment for it (or a `Domain=vandehaar.dev` cookie, which would then also be sent to
every other `vandehaar.dev` host). That is an input to the remote-access decision, not a blocker.

## 8. What only the device can settle

In order — the first two decide whether the recommendation stands.

1. **Module list and version.** `grep -i loadmodule` on `httpd24.conf` (path in §2.4) or `httpd -M` from the
   package's binary, and `httpd -v`. Need `rewrite_module`; ≥ 2.4.47 for `samesite` in `CO`.
2. **The cookie survives closing, on the device.** Enrol the installed app on the 2019 iPad (iPadOS 18.7.x),
   force-quit it, reopen: no prompt, catalogue `200`. Same for a Safari tab (quit Safari). Repeat after a
   reboot. The one thing Basic failed.
3. **Media under the cookie.** Re-run ADR 0004's probe: `<img>` renders, `<video>` plays and seeks, WebKit's
   three range requests return `206`, the Service Worker's own `fetch()` is authenticated, `cache.put()` works.
4. **Cost.** The 200-photo run from ADR 0004 behind the new gate, against 4.431 s (no threshold) and 4.893 s
   (Basic). Expectation: indistinguishable from no threshold.
5. **Sliding refresh.** The `Set-Cookie` on `catalog.json` arrives with an `expires` 90 days out, and a second
   cookie of the same name does not appear (the `Domain` must match the enrolment page's).
6. **Revocation.** Delete the file with the app open: the next catalogue fetch is `403`, the app shows
   `/enrol/`, and no dialogs appear.
7. **Enrolment page plumbing.** PHP can write the devices folder (Web Station's `open_basedir` must include it;
   Synology refuses `homes` paths there), and Apache's user can `stat()` it.
8. **Add to Home Screen after enrolling in Safari** — does iPadOS copy the cookie? Only decides whether the
   setup instructions can be one step shorter.
9. **Android Chrome:** enrol in Chrome, install, kill the app, reopen.
10. *Optional:* a 1-minute check whether a manifest `start_url` with userinfo launches authenticated — only to
    close §1's loose end.
11. *v2 only:* WebAuthn `create()`/`get()` inside the installed app on iPadOS 18.

---

## Sources

Primary, in the order first used.

**Specifications**

- [RFC 7617 — The 'Basic' HTTP Authentication Scheme](https://www.rfc-editor.org/rfc/rfc7617.html)
- [RFC 9110 §11 — HTTP Authentication](https://www.rfc-editor.org/rfc/rfc9110.html#section-11)
- [Fetch Standard](https://fetch.spec.whatwg.org/) — HTTP-network-or-cache fetch, default credentials mode

**WebKit / Apple**

- [WebKit bug 292975](https://bugs.webkit.org/show_bug.cgi?id=292975) — networking is not open source
- [Intelligent Tracking Prevention 2.1](https://webkit.org/blog/8613/intelligent-tracking-prevention-2-1/) — 7-day cap on `document.cookie`; authentication cookies should be `Secure; HttpOnly` from a response
- [Tracking Prevention in WebKit](https://webkit.org/tracking-prevention/) — script-writeable storage cap, cloaking caps, home-screen exemption, isolation
- [Full Third-Party Cookie Blocking and More](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/) — home-screen apps' own day counter
- [WebKit PR 5347 — Cap cookie lifetimes to 7 days for responses from third party IP addresses](https://github.com/WebKit/WebKit/pull/5347)
- [WebKit bug 272325 — Session cookies being reset randomly in a Home Screen web app](https://bugs.webkit.org/show_bug.cgi?id=272325)
- [Meet Face ID and Touch ID for the Web](https://webkit.org/blog/11312/)
- [WebKit Features in Safari 17.0](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/) — cookie copy on Add to Dock
- [WebKit Features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)
- [About the security of passkeys](https://support.apple.com/en-us/102195)

**Apache HTTP Server 2.4**

- [mod_auth_form](https://httpd.apache.org/docs/2.4/mod/mod_auth_form.html) and [`mod_auth_form.c`](https://github.com/apache/httpd/blob/2.4.x/modules/aaa/mod_auth_form.c) — per-request `check_authn`
- [mod_session](https://httpd.apache.org/docs/2.4/mod/mod_session.html) and [`mod_session.c`](https://github.com/apache/httpd/blob/2.4.x/modules/session/mod_session.c)
- [mod_session_cookie](https://httpd.apache.org/docs/2.4/mod/mod_session_cookie.html) and [`mod_session_cookie.c`](https://github.com/apache/httpd/blob/2.4.x/modules/session/mod_session_cookie.c)
- [mod_session_crypto](https://httpd.apache.org/docs/2.4/mod/mod_session_crypto.html) and [`mod_session_crypto.c`](https://github.com/apache/httpd/blob/2.4.x/modules/session/mod_session_crypto.c) — PBKDF2, 4096 iterations
- [`util_cookies.c`](https://github.com/apache/httpd/blob/2.4.x/server/util_cookies.c) — `Max-Age` from `SessionMaxAge`
- [mod_rewrite](https://httpd.apache.org/docs/2.4/mod/mod_rewrite.html) and [`mod_rewrite.c`](https://github.com/apache/httpd/blob/2.4.x/modules/mappers/mod_rewrite.c) — `%N` backreferences, `-f`, `CO`, `RewriteOptions Inherit`
- [RewriteRule flags](https://httpd.apache.org/docs/2.4/rewrite/flags.html) — `CO`
- [Expressions in Apache HTTP Server](https://httpd.apache.org/docs/2.4/expr.html) — `Require expr`, `-f`, `sha1`, backreferences

**Synology**

- [How do I protect folders under the shared folder "web"…](https://kb.synology.com/en-global/DSM/tutorial/How_do_I_protect_my_folders_in_the_quot_web_quot_shared_folder_from_unprivileged_access)
- [Web Station technical specifications (DSM 7.2)](https://www.synology.com/en-global/dsm/7.2/software_spec/web_station)
- [Web Station → Script Language Settings](https://kb.synology.com/en-global/DSM/help/WebStation/application_webserv_php?version=7) — PHP extensions, `open_basedir`

**Google / Chrome**

- [Cookie Expires and Max-Age attributes now have upper limit](https://developer.chrome.com/blog/cookie-max-age-expires)
- [WebAPKs on Android](https://web.dev/webapks/)

**PHP libraries**

- [lbuchs/WebAuthn](https://github.com/lbuchs/WebAuthn)
- [web-auth/webauthn-lib `composer.json`](https://raw.githubusercontent.com/web-auth/webauthn-lib/5.2.x/composer.json)

Secondary, cited as such and not relied upon:

- [open radar 21379927 — Cannot save HTTP Basic Auth passwords to Keychain](https://openradar.appspot.com/21379927) — iOS not saving HTTP-auth passwords
- [DevXperiences — enabling mod_rewrite on Synology](https://www.devxperiences.com/pzwp1/2021/01/24/enabling-mod_rewrite/) — `httpd24.conf` path
- [Marius Hosting — Synology Apache 2.4.58](https://mariushosting.com/synology-apache-2-4-update-version-2-4-58/) — package version
- [heise — iOS 26 web app behaviour on the Home Screen](https://www.heise.de/en/news/iOS-26-and-iPadOS-26-Changed-web-app-behaviour-on-the-home-screen-10749652.html)

**In-repo**

- [ADR 0004 and its 2026-09-01 amendment](../adr/0004-the-app-is-served-from-the-nas-so-the-media-is-same-site.md)
- [Authorization that survives `<img>` and `<video>` in Safari](authorization-that-survives-img-and-video-in-safari.md)
