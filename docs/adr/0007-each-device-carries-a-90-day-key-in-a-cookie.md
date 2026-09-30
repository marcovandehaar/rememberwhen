# Each device carries a 90-day key in a cookie

Authorization changes from HTTP Basic to a **per-device random key held in a server-set `HttpOnly; Secure; SameSite=Lax` cookie that lives 90 days and slides on use**. Apache's `mod_rewrite`, in the same root `.htaccess`, lets a request through only if the cookie names a file that exists in a private per-device folder on the NAS. No PHP runs in the request path and nothing is hashed per request. A small PHP page runs **once per device**, at enrolment, to mint the key and write the file. Revoking a device is deleting its file.

This replaces only the credential half of [ADR 0004](0004-the-app-is-served-from-the-nas-so-the-media-is-same-site.md). Its main decision stands: the app, catalogue and media are one origin on the NAS, because that is the only shape in which a credential reaches `<img>` and `<video>` in Safari. [ADR 0006](0006-remote-access-through-a-tailscale-route-to-the-nass-private-address.md) keeps that origin when away from home, so the cookie works unchanged remotely.

It is a change because Basic could not do what the household needs. Safari forgets a Basic credential when the browser or installed app is closed (measured, ADR 0004's 2026-09-01 amendment), nothing in HTTP asks a client to keep one, and the kids cannot type the password. Full reasoning and sources: [`docs/research/a-login-that-lasts-weeks-in-safari.md`](../research/a-login-that-lasts-weeks-in-safari.md), decided in [issue #55](https://github.com/marcovandehaar/rememberwhen/issues/55).

## Considered options

- **Keep Basic.** Session-scoped in Safari; no header or setting changes that. Out.
- **`mod_auth_form` with `mod_session_cookie`.** The textbook answer and the wrong one here: its source re-verifies the password on every request, and `mod_session_crypto` adds a 4096-iteration PBKDF2 per request on top — slower than Basic. It also needs modules nobody has shown Synology's Apache to load.
- **PHP in front of every request.** Puts PHP in the byte path of 20 MB clips and their range requests, the cost ADR 0004 already declined.
- **Passkeys (Face ID).** Deferred. They need iCloud Keychain on the kids' Apple Accounts, a passkey belongs to an account rather than a device (clashing with per-device revocation), behaviour in the installed iOS web app is unconfirmed, and with a sliding 90-day cookie nobody would notice them day to day. Only if they ever become the only option, since the household would rather type nothing.
- **Client certificates and an IP allow-list**, revisited because per-device setup is now paid anyway for Tailscale. Still out: DSM cannot require a client certificate, and an allow-list fails against a taken-over device on the LAN, while remote traffic arrives at the NAS looking like the NAS itself.
- **Approve-from-phone enrolment** (QR code on the new device, approved from one that already has a key). Nobody types anything, about a day more to build, and it lands on the same key file, so it can be added later without redoing anything. Follow-up, not v1.

## Consequences

- **Two things are unverified and gate the build**, settled by the same device session as ADR 0006's test. First, whether Web Station's Apache has `mod_rewrite` loaded (almost certainly). Second, whether the cookie survives force-quitting the installed app on the 2019 iPad (every source says yes; nobody has seen it). If `mod_rewrite` is absent the fallback is `Require expr` with the keys listed in `.htaccess`, editing it by hand per device — not editing Synology's `httpd24.conf`. This ADR is to be amended with what is found.
- **Enrolment happens inside the installed app**, on every iPad and iPhone. It keeps its own cookie jar, isolated from Safari's, so a key given to a Safari tab does not reach it, and whether iPadOS copies cookies on Add to Home Screen is unknown. An unenrolled app lands on the enrolment page through `ErrorDocument 403`.
- **Enrolment takes a household enrolment password and a device name.** The password is stored as a `bcrypt` hash outside the web root — right here, because it is checked once per device, not per request. Only Marco types it; the kids do nothing. A password manager can fill it, unlike the Basic dialog.
- **The key is 256 bits nobody types**, which retires ADR 0004's caveat that Basic is "person-shaped and used as a device credential". The enrolment password stays person-shaped, but it is used once per device.
- **The 90 days slide on `catalog.json`**, the one request every launch must send to the network. The Service Worker must keep passing it through (`cache: 'no-store'` in `App.tsx` is load-bearing). Refreshing on the document would silently stop working once the Service Worker serves the shell from cache.
- **A device left unused for 90 days, or wiped, is enrolled again by Marco.** The server has no idle expiry: a lost device's key stays valid until its file is deleted.
- **Revoking a device is two removals**: its key file on the NAS, and the machine in Tailscale. The file can carry a label and date, so "which one is the lost iPad" is answered by opening the folder. A revoked device gets a `403` and the enrolment page instead of ADR 0004's cascade of one password dialog per subresource, so the `401` reload in `authProbe.ts` becomes a redirect to enrolment.
- **Three lines of ADR 0004's amendment change.** The manifest and icons are exempt from the gate, so `crossorigin="use-credentials"` on the manifest link goes away; the `AddType` for `.webmanifest` stays; the app must still never set `credentials: 'omit'`.
- **Two `.htaccess` traps.** A child `.htaccess` that says `RewriteEngine On` replaces these rules for its subtree unless it also says `RewriteOptions Inherit`. The gate is never wrapped in `<IfModule mod_rewrite.c>`, so a missing module fails the site loudly with a `500` instead of quietly serving everything to everyone.
- **No new term enters `CONTEXT.md`**, for the reason ADR 0004 gave: an enrolled device is not an entity the app knows or shows. There is only authorization in front of the door.

## Amendment, 2026-09-30: the bets hold, and here is what it cost

Both unverified things were measured on the household's own devices ([issue #56](https://github.com/marcovandehaar/rememberwhen/issues/56)), and the mechanism is now live on `nas.vandehaar.dev`.

- **`mod_rewrite` is loaded** on Web Station's Apache (2.4.63). A throwaway gate answered `403` as designed, so the `Require expr` fallback was not needed.
- **The cookie survives force-quitting the installed app on the 2019 iPad, and a restart of the iPad.** The one thing Basic could never do. A Safari tab was not force-quit tested separately; the installed app is the supported form.
- **Everything behind the gate works:** `<img>`, `fetch()`, a 20 MB `<video>` with seeking, also from 5G through [ADR 0006](0006-remote-access-through-a-tailscale-route-to-the-nass-private-address.md)'s route. Removing the key file locks a device out on the next request; the `CO` refresh on `catalog.json` moves the expiry 90 days out without creating a second cookie; eight wrong enrolment passwords lock enrolment for fifteen minutes, even for the right one.

What it cost, beyond what this ADR predicted:

1. **PHP has to be switched on for the site.** Web Station's Default Service had no PHP profile, so the enrolment page was served as text. Setting *PHP: Default Profile* on that service fixed it. "No PHP in the request path" held; "no PHP at all" never did, because enrolment needs it.
2. **A hidden carriage return nearly broke the key.** `openssl` on Windows ends its output with CRLF, which made the key 44 characters and the `.htaccess` line wrong. `deploy-auth.ps1` now normalises everything it sends to LF.
3. **The manifest had to become `standalone`**, since the installed app is where the cookie lives. The frontend's manifest link lost its `crossorigin`, and the auth probe now sends a `403` to `/enrol/` instead of reloading.
4. **Enrolment avoids optional PHP extensions** (`mbstring`), so it runs on the default profile.
5. **The household password is chosen by Marco** (`deploy-auth.ps1 -ChoosePassword`, hidden input, only the `bcrypt` hash reaches the NAS) rather than generated and displayed.

What this does not change: the decision. Setup and removal of a device are in [`docs/runbooks/apparaten.md`](../runbooks/apparaten.md).
