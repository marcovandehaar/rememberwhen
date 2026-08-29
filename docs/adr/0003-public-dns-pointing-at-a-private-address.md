# A public DNS record pointing at a private address

The NAS gets a publicly-trusted wildcard certificate for `*.vandehaar.dev`, issued through a DNS-01 challenge against Cloudflare by an ACME client running on the NAS itself. The public A record for `nas.vandehaar.dev` points at the NAS's **private** LAN address. That is deliberate, not a mistake: the name resolves for everyone, but only reaches anything from inside the house, so there is a valid certificate with **no inbound port, no NAT hairpin, and no split-horizon DNS**.

This is needed at all because [issue #4](https://github.com/marcovandehaar/rememberwhen/issues/4) established that Safari on iPadOS blocks mixed content with no override and Local Network Access has never shipped — so an HTTPS PWA cannot read photos from a plain-HTTP NAS. Full reasoning and the device measurements: [issue #8](https://github.com/marcovandehaar/rememberwhen/issues/8).

## Considered options

- **Synology DDNS + Let's Encrypt (HTTP-01) on a custom domain.** Rejected: needs inbound port 80 at issuance *and every renewal*, so the exposure is permanent. The owner's line is precisely that no port may be open.
- **Synology DDNS wildcard.** On paper the winner, and now confirmed from Synology's own documentation to use DNS-01 with **no inbound port ever** — DSM would handle issuance and renewal forever, free, with nothing to maintain. Rejected for a reason that has nothing to do with certificates: the DDNS name resolves to the household's *external* address, so a device on the LAN cannot reach the NAS through it. NAT hairpin cannot rescue this, because hairpin presupposes a port forward that will not exist. The fix would be a local DNS override, and the household's router — a TP-Link Archer C2300 — has no such feature; verified in TP-Link's own firmware emulator and then on the device. The remaining route would be to run DNS Server on the NAS and point every client at it, which makes a 512 MB box that already idles at 55% memory the single point of failure for all name resolution in the house.
- **A private CA with a trust profile installed on each iPad.** Rejected: 2–4 devices today, but the owner does not want manual per-device setup, and this route charges that cost again at every certificate expiry and for every new or visiting device.

## Consequences

- **The NAS's LAN address must be pinned.** It is currently on DHCP. If it moves, the public record points at nothing and the app breaks silently.
- **We own an ACME client.** A scheduled task on the NAS renewing every 90 days, plus a Cloudflare API token scoped to `Zone:DNS:Edit` on this one zone. This is the price of the route, and it lands on an owner who has said this is at the edge of his infrastructure knowledge — so [issue #9](https://github.com/marcovandehaar/rememberwhen/issues/9) must produce a step-by-step checklist, and record where the token lives and how a successful renewal is recognised.
- **Failure is covered without building anything.** DSM has a `Certificate error` event (System, Critical). It must be wired to a delivery channel — the household's email currently hangs off the `Warning` rule only. Do not rely on the email address entered at certificate creation: Let's Encrypt stopped sending expiry notices on 4 June 2025.
- **This route is indifferent to network topology**, which turned out to matter: the house runs double NAT, the Archer sitting behind another device at `192.168.1.1`. Every rejected route would have needed configuration on two devices; this one needs none.
- **Remote access is not foreclosed, only absent.** The name is useless outside the LAN by construction. Adding remote viewing later means adding a *different* name pointed at a VPN or tunnel — additive, not a rebuild. Remote access remains out of scope for v1.
- **`.dev` is HSTS-preloaded as a whole TLD**, so browsers force HTTPS on every name under it. Nothing can be served over plain `http://` there, not even briefly while setting things up.
- The certificate can also be applied to DSM's own web interface, which removes the warning seen when logging in to the NAS.
