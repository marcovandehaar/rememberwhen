# Remote access that runs on a DS120j

Research note for issue #52 (map #51, "Stay logged in, and reach it from outside"). Written
2026-09-30. Current DSM for the DS120j at the time of writing: **7.4.1-90080** (2026-07-23). Every
claim below is linked to the source that owns it; anything I could not establish from a primary
source is marked **[UNESTABLISHED]**, and my own reasoning is labelled **inference**.

This note settles facts and ranks the options. The decision is #53's.

## The question

Which mechanisms give the household's own devices access to `https://nas.vandehaar.dev` from outside
the house **without any inbound port**, and actually run on a Synology DS120j? For each: support on
this model and DSM 7, footprint, NAT behaviour (the house is double-NATed), whether the **origin**
survives (ADR-0004's Safari credential mechanics only hold same-site), whether the kids' iPads are
zero-touch after one adult setup, cost, and whether LAN access stays VPN-free.

## Verdict

**Tailscale, with the NAS advertising a `/32` subnet route to its own LAN address, is the only
surveyed mechanism that meets every hard requirement.** It is an official Package Center package
with a DSM 7 `armv8` build that maps to the DS120j; it is outbound-only and indifferent to double
NAT (worst case it relays through DERP); and because the route is to the NAS's *private* address,
`nas.vandehaar.dev` resolves and routes exactly as it does at home — **same origin, same
certificate, same `.htpasswd`, ADR-0003 and ADR-0004 untouched**. iOS VPN On Demand ("connect
except on the home Wi-Fi") makes it zero-touch on the iPads; Android's system Always-on VPN covers
the phone. The free Personal plan covers it with room to spare.

**Cloudflare Tunnel in its private-network form (cloudflared + the Cloudflare One/WARP client) is
the runner-up**: it can also preserve the origin, but on this box it is a community package, all
traffic hairpins through Cloudflare's edge, and it drags in a Zero Trust organisation. Its
public-hostname form — the one most tutorials describe — **changes the origin and exposes the app
to the internet**, and is out.

**Synology VPN Server and WireGuard are out on requirement 3 alone**: both are servers that need an
inbound port, forwarded through *both* NAT layers. VPN Server has no WireGuard at all, and the
community WireGuard package has never supported the DS120j's platform.

**The surprise, and the one thing that can sink the winner: iOS will not send traffic through any
VPN to an address inside the Wi-Fi subnet it is currently on.** If a friend's or a hotel's network
uses the same private range as the home LAN, the NAS's address is "local" there, and the iPad
tries the foreign LAN instead of the tunnel. This is an Apple routing behaviour, reported against
Tailscale and the WireGuard app alike, and open since 2024. It cuts the other way at home — which
is exactly what makes "LAN stays VPN-free" hold even when the VPN is connected. The practical
consequence for #53: **the home LAN should be renumbered off the common consumer ranges before
remote access is relied on**, which in turn means updating ADR-0003's A record once.

---

## 0. The hardware, verified

The brief's guess of a Realtek RTD1296 is **wrong** — that is the DS220j/DS118 family.

- Synology's own datasheet: **"Marvell A3720 2-core 800MHz"**, **512 MB DDR3**
  ([DS120j datasheet](https://global.download.synology.com/download/Document/Hardware/DataSheet/DiskStation/20-year/DS120j/enu/Synology_DS120j_Data_Sheet_enu.pdf)).
- Package architecture: `DS120j | Marvell A3720 | armada37xx | armada37xx | aarch64 (armv8)`
  ([SynoCommunity architecture table](https://github.com/SynoCommunity/spksrc/wiki/Synology-and-SynoCommunity-Package-Architectures)).
- Still on the current DSM line: 7.4-90075 (2026-06-16) lists the models for which 7.4 is the last
  upgradable version, and the DS120j is not among them
  ([DSM release notes for DS120j](https://www.synology.com/en-global/releaseNote/DSM?model=DS120j)).
- Free memory measured on the device: ~186 MB (ADR-0004 amendment). That is the budget every
  option below has to fit into, alongside Apache serving media.

## 1. Tailscale

**Support (Q1): official, via Package Center.** Tailscale states "Tailscale is officially supported
in the Synology package center" and that "installation from the Synology Package Center is the
easiest way to get started"
([blog](https://tailscale.com/blog/tailscale-synology-package),
[Synology KB](https://tailscale.com/kb/1131/synology)). Tailscale's own platform table maps
`DS120j | Marvell A3720 | armada37xx | arm64`
([tailscale-synology platforms.md](https://github.com/tailscale/tailscale-synology/blob/main/docs/platforms.md)),
and the stable track publishes `tailscale-armv8-1.102.4-700102004-dsm7.spk`
([pkgs.tailscale.com](https://pkgs.tailscale.com/stable/#spks)).
**[UNESTABLISHED]** whether Package Center actually *lists* it on this model under DSM 7.4 —
Synology's package pages render client-side and would not load. One minute on the device; the
signed `.spk` from pkgs.tailscale.com is the fallback via Manual Install either way.

**DSM 7 sandbox.** On DSM 7 the package "does not have permission to create a TUN device", so the
NAS runs in userspace ("hybrid") networking: other devices can reach the NAS and, "if you share
subnets, they will be reachable over UDP and TCP", but apps *on* the NAS cannot dial out over the
tailnet unless you add a boot-time task running `tailscale configure-host`
([Synology KB](https://tailscale.com/kb/1131/synology)). **Inference:** we only need the inbound
direction, so the TUN fix is not required. The KB also states the Synology build "can do
`--advertise-routes` but not `--accept-routes`" — advertising is the half we need.

**Footprint and DSM updates (Q2).** Tailscale publishes **no memory figure**. Its own tracker has an
open task, filed by a co-founder, to "reduce tailscaled memory usage, in particular for small
devices" ([tailscale#21498](https://github.com/tailscale/tailscale/issues/21498)); user reports range
from tens of MB to over 100 MB RSS, and one reports unbounded growth with the optional *Peer Relay*
feature enabled ([tailscale#17801](https://github.com/tailscale/tailscale/issues/17801)).
**[UNESTABLISHED]** on this box — it has to be measured against the 186 MB. **Do not enable Peer
Relay or `tailscale serve` on the NAS** (the latter has a Synology CPU report,
[tailscale#12806](https://github.com/tailscale/tailscale/issues/12806)). Updates: Package Center, or
a scheduled `tailscale update --yes`; the documented break is DSM 6→7, which "requires uninstalling
and reinstalling" ([Synology KB](https://tailscale.com/kb/1131/synology)). Minor DSM 7 updates are
ordinary package upgrades. Throughput through userspace WireGuard on an 800 MHz A53 is
**[UNESTABLISHED]**; **inference:** the home uplink, not the NAS, is the likelier ceiling for a
remote viewer.

**No inbound port, double NAT (Q3): yes.** "Most of the time, you don't need to open any firewall
ports"; it needs outbound TCP 443 and UDP
([firewall ports](https://tailscale.com/kb/1082/firewall-ports)). On stacked NATs: "the extra layer
is invisible to everyone, and our other techniques will work fine regardless of how many layers
there are" — only UPnP/NAT-PMP port mapping fails, because it acts on the nearest NAT
([How NAT traversal works](https://tailscale.com/blog/how-nat-traversal-works)). When no direct
path exists, DERP relays carry the traffic, still end-to-end WireGuard-encrypted
([DERP servers](https://tailscale.com/kb/1232/derp-servers)).

**Origin (Q4): preserved.** Advertise a subnet route of exactly the NAS's LAN address as a `/32`
(`tailscale set --advertise-routes=<nas-lan-ip>/32`) and approve it once in the admin console.
"Android, iOS, macOS, tvOS, and Windows automatically pick up your new subnet routes"
([Subnet routers](https://tailscale.com/kb/1019/subnets)). The remote iPad then resolves
`nas.vandehaar.dev` through public DNS to the private address exactly as ADR-0003 designed, and the
packet goes into the tunnel. Same scheme, host and port: same origin, same certificate, same Basic
credential, same Service Worker scope. **Inference**, strong but unmeasured: that a userspace
subnet router forwards to *its own* LAN address — the NAS dialling itself — is not documented
either way. First thing to try on the device. The fallback (reaching the NAS on its `100.x`
Tailscale address) would change the origin, so it is not a fallback at all.

**Kids do nothing (Q5): yes on iPad, yes on Android.**

- *iPadOS:* Tailscale supports **VPN On Demand** since 1.48 for iOS, with Wi-Fi rules including
  "connect except on listed networks" (by SSID), and cellular rules
  ([VPN On Demand](https://tailscale.com/docs/features/client/ios-vpn-on-demand)). Set: Wi-Fi =
  connect **except on** the home SSID(s); cellular = always. The same page: the client
  "automatically configures a broad VPN On Demand policy while Tailscale is enabled to ensure that
  the VPN remains active in the event of a system restart, auto-update, crash". Caveat from the same
  page: a rule set to *Never* immediately disconnects a manual connect, so a child can't "fix" it by
  hand — and doesn't need to.
- *Android:* no SSID rules; use the OS's own **Always-on VPN** (Settings → Network & internet → VPN
  → gear → Always-on VPN) ([Android Help](https://support.google.com/android/answer/9089766)).
- **Node key expiry must be disabled per device.** "By default, new domains are set with an expiry
  period of 180 days"; when it lapses, "connections to/from the given endpoint will stop working"
  until someone re-authenticates. Machines page → *Disable key expiry*
  ([Key expiry](https://tailscale.com/kb/1028/key-expiry)). Without this, every kid's iPad silently
  loses remote access twice a year. This belongs in the one-time adult setup checklist, together
  with the NAS itself.

**Cost and identity (Q6): free.** The Personal plan: "Up to 6 users", "Unlimited user devices",
"Subnet routers & exit nodes" included ([pricing](https://tailscale.com/pricing)). Sign-in requires
an identity provider — Apple, Google, GitHub, Microsoft, Okta, OneLogin, custom OIDC, or passkey
([identity providers](https://tailscale.com/kb/1013/sso-providers)). **Inference:** one tailnet
under Marco's account, every device logged in as him — enrolment is per device, as the map requires;
the kids need no accounts. Revoking a lost device is one click on the Machines page, alongside
deleting its `.htpasswd` line.

**LAN stays VPN-free (Q7): yes, twice over.**

1. The On Demand rule disconnects on the home SSID, so at home the iPad is not on the VPN at all.
2. Even if it *were* connected at home, iOS routes traffic for the directly-connected subnet out of
   the Wi-Fi interface. Apple's `enforceRoutes` — the switch that would make VPN routes "supersede
   the system routing table" — defaults to `false`, and `excludeLocalNetworks` defaults to `true`
   on iOS ([enforceRoutes](https://developer.apple.com/documentation/networkextension/nevpnprotocol/enforceroutes),
   [excludeLocalNetworks](https://developer.apple.com/documentation/networkextension/nevpnprotocol/excludelocalnetworks));
   users report that with overlapping subnets "the wifi interface's route is ahead of Tailscale's
   interface in the routing table" ([tailscale#14142](https://github.com/tailscale/tailscale/issues/14142)).
   **Inference:** at home, NAS traffic takes the LAN whether or not Tailscale is up, and a Tailscale
   outage (coordination server, or the NAS package crashing) cannot break the app at home on iOS.

   Android is **[UNESTABLISHED]**: whether its VPN routing lets a `/32` VPN route beat the
   directly-connected Wi-Fi `/24`. If it does, the phone at home still reaches the NAS — Tailscale
   finds the direct LAN path between peers — but then depends on `tailscaled` running on the NAS.
   One device, and a test of a minute.

### The overlap trap (iOS)

Point 2 is also the winner's weakness. The same issue documents the flip side: on a *remote* Wi-Fi
that uses the same range as the home LAN, "traffic cannot reach the advertised subnet"; a later
commenter reproduced it with the official WireGuard iOS app at `AllowedIPs = 0.0.0.0/0`, which
points at iOS behaviour rather than a Tailscale bug. Reported on iOS 18.x through iOS 26 and
Tailscale 1.72–1.92; open since November 2024
([tailscale#14142](https://github.com/tailscale/tailscale/issues/14142)). Tailscale's own
troubleshooting page documents longest-prefix tricks for Windows and macOS but is silent on iOS
([overlapping subnets](https://tailscale.com/docs/reference/troubleshooting/network-configuration/lan-traffic-overlapping-subnets)).

**Inference:** the consumer defaults — `192.168.0.0/24`, `192.168.1.0/24` — are exactly what friends,
grandparents and holiday homes run. Renumbering the Archer's LAN to an uncommon range (a random
`10.x.y.0/24` or `172.16–31.x.0/24`) makes a collision improbable. It costs: the NAS's pinned
address changes, ADR-0003's public A record is updated once, and every LAN device reconnects. A
`/32` route by itself very likely does **not** fix this on iOS (**inference** from the WireGuard
report above: even a `0.0.0.0/0` tunnel lost to the local subnet, so prefix length is not what
decides it) — but it is cheap to confirm on the device before renumbering. Worth recording in #53 as a consequence, and doing
before the remote route is relied on.

### DNS on foreign networks

**[UNESTABLISHED], and a real risk.** Remotely the device still resolves `nas.vandehaar.dev` through
whatever resolver the foreign network hands out. Resolvers with DNS-rebinding protection — dnsmasq's
`--stop-dns-rebind`, on by default in OpenWrt — drop public answers containing RFC1918 addresses
(already noted in [`synology-certificate-routes.md`](synology-certificate-routes.md)). ADR-0003 never
hit this because the name was only used at home. **Mitigation, inference:** a Tailscale split-DNS
entry sending `vandehaar.dev` to `1.1.1.1`: "tells devices in your tailnet to only use the `1.1.1.1`
name server to look up DNS queries that match" the domain, and public nameservers are queried over
DoH ([DNS in Tailscale](https://tailscale.com/kb/1054/dns)). Since the On Demand rule keeps Tailscale
off at home, this does not touch home resolution. Test on a hotspot and on a network with rebind
protection.

## 2. Cloudflare Tunnel (`cloudflared`)

**Support (Q1): community only.** Cloudflare ships no Synology package. SynoCommunity packages
`cloudflared` 2026.9.0-25 for DSM 6 and 7 with `armada37xx`/aarch64 builds
([SynoCommunity: Cloudflare Tunnel](https://synocommunity.com/package/cloudflared)). Adding a
third-party package source and trusting it is the price.

**Footprint (Q2): [UNESTABLISHED].** Go daemon, same order of magnitude as `tailscaled` by
**inference**; no figure published.

**No inbound port (Q3): yes.** "The tunnel created by `cloudflared` is outbound-only"
([private networks with cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/private-net/cloudflared/)).
Double NAT is irrelevant to an outbound connection. All traffic hairpins via Cloudflare's edge —
there is no peer-to-peer path, even for a device one room away.

**Origin (Q4): depends entirely on which of the two products you mean.**

- *Public hostname* (the common tutorial shape): a proxied CNAME such as `photos.vandehaar.dev` →
  tunnel. That is a **different origin** — separate credentials, cache, Service Worker and installed
  app — and it puts the Basic-auth threshold on the open internet, which ADR-0004 explicitly says
  would not be proportionate. Gating it with Cloudflare Access means an interactive login (cookie
  or email code), which fails "kids do nothing". **Rejected.**
- *Private network*: `cloudflared` advertises the NAS's LAN address as a private route, and devices
  running the **Cloudflare One client (WARP)** reach it by IP
  ([same page](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/private-net/cloudflared/)).
  This **does** preserve the origin, for the same reason Tailscale's subnet route does. Note that
  WARP "excludes private ranges by default in its split tunnel settings", so the NAS range must be
  removed from Exclude, or the client switched to Include mode with only the NAS.

**Kids do nothing (Q5): plausible.** Managed networks let the client detect the home network by
validating a TLS endpoint on it and switch to a different device profile there — e.g. disconnected
([managed networks](https://developers.cloudflare.com/cloudflare-one/connections/connect-devices/warp/configure-warp/managed-networks/)).
Supported on iOS and Android from client 1.0. **[UNESTABLISHED]** without MDM whether the client
stays connected across reboots as reliably as iOS On Demand does; enrolment is an interactive login
into a Zero Trust organisation per device.

**Cost (Q6): free** up to 50 users on the Zero Trust free plan
([Cloudflare blog](https://blog.cloudflare.com/teams-plans/)) — but it drags in a Zero Trust
organisation, a team domain, device enrolment policies and split-tunnel configuration. For a
six-device household that is the "architecture for edge cases" the project avoids.

**LAN stays VPN-free (Q7):** yes via managed networks; the iOS local-subnet behaviour in §1 applies
equally, for better at home and worse on an overlapping foreign network.

## 3. Synology VPN Server (and WireGuard)

**Support (Q1): official.** The DS120j datasheet lists VPN Server with "maximum connection: 10,
supported VPN protocol: PPTP, OpenVPN, L2TP/IPSec"
([datasheet](https://global.download.synology.com/download/Document/Hardware/DataSheet/DiskStation/20-year/DS120j/enu/Synology_DS120j_Data_Sheet_enu.pdf)).
The current package is 1.4.10-2984 (2026-01-27); **no release note in the 7.x series mentions
WireGuard** ([VPN Server release notes](https://www.synology.com/en-global/releaseNote/VPNCenter)).

**No inbound port (Q3): fails.** A VPN *server* waits for clients to connect in: OpenVPN on UDP 1194,
L2TP/IPsec on UDP 500/4500. That is a port forward — here on **two** devices, the ISP box and the
Archer — which ADR-0003 already rejected for certificates on the same grounds. **Out.**

**WireGuard.** Not in VPN Server. The community package
([runfalk/synology-wireguard](https://github.com/runfalk/synology-wireguard)) is archived, never listed
`armada37xx` as supported, and on DSM 7 requires compiling it yourself. And WireGuard also needs one
side listening on an open UDP port. **Out on two counts.** (Tailscale *is* WireGuard, with the NAT
traversal and key distribution that make the port unnecessary.)

## 4. Other candidates, briefly

- **ZeroTier.** Its own docs: "Synology's DSM 7 doesn't allow third-party applications to run as
  root. Therefore, we now recommend using Docker to run ZeroTier" ([ZeroTier on Synology](https://docs.zerotier.com/synology/)).
  Container Manager *does* exist for this model — "Added support for the following models with the
  ARMv8 architecture: DS220j, DS120j" in 20.10.23-1437
  ([Container Manager release notes](https://www.synology.com/en-global/releaseNote/ContainerManager)) —
  but a container runtime on a 512 MB box to do what Tailscale does natively is all cost, no gain.
- **Headscale / self-hosted NetBird.** Need a publicly reachable coordination server; the household
  has no other server. Out.
- **Synology QuickConnect.** Relays through Synology without a port forward, but under a
  `quickconnect.to` name — a different origin, and publicly reachable. Out on Q4. (**Inference**; not
  pursued further.)
- **Tailscale Funnel.** Public exposure by design. Out.

## Comparison

| | Tailscale (subnet route `/32`) | Cloudflare private network + WARP | Cloudflare public hostname | Synology VPN Server | WireGuard (community) |
| --- | --- | --- | --- | --- | --- |
| Runs on DS120j / DSM 7 | **Official package, armv8** | Community package | Community package | Official | Not for armada37xx; archived |
| RAM on 186 MB free | Unmeasured | Unmeasured | Unmeasured | Small | — |
| No inbound port, double NAT | **Yes** (DERP fallback) | Yes | Yes | **No** — 2 port forwards | **No** |
| Same origin `nas.vandehaar.dev` | **Yes** | Yes | **No** | Yes | Yes |
| Kids zero-touch, iPad | **On Demand, except home SSID** | Managed networks | Needs Access login | — | — |
| Android | OS Always-on VPN | Client auto-connect | — | — | — |
| Cost, 6 devices | **Free** (Personal) | Free (≤50 users) | Free | Free | Free |
| Identity dragged in | One IdP login (Marco) | Zero Trust org | Zero Trust org | DSM accounts | — |
| LAN VPN-free, survives VPN outage | **Yes** (SSID rule + iOS local routing) | Yes | n/a | n/a | n/a |
| Path | P2P, relay if needed | Always via Cloudflare | Always via Cloudflare | Direct | Direct |

## Recommendation for #53

**Tailscale on the NAS as a `/32` subnet router for its own LAN address; Tailscale clients on each
device, logged in under one account with key expiry disabled; iPads on VPN On Demand "connect except
on the home SSID"; the Android phone on Always-on VPN.** It is the only option that is official on
this model, needs no port, keeps `nas.vandehaar.dev` as the one origin — so the login track (#51's
other half) is built once for LAN and remote — and costs nothing. ADR-0003 needs an amendment
rather than the "different name" it anticipated: the same name now works remotely, because the
route follows the private address.

Record as consequences: renumber the home LAN off the common ranges (the iOS overlap trap) and
update the A record; add a split-DNS entry for `vandehaar.dev` (rebind-protected foreign resolvers);
disable key expiry on every device; do not enable Peer Relay or `serve` on the NAS.

## Open items — only the device can settle these

In order of how much they matter.

1. **Does the NAS forward to its own LAN address as a userspace subnet router?** Advertise
   `<nas-lan-ip>/32`, open `https://nas.vandehaar.dev` on an iPad on cellular, and watch the Basic
   prompt, `<img>`, `<video>` range requests and the catalogue fetch. This is the whole bet.
2. **`tailscaled` memory on the DS120j**, idle and during a remote video, against the 186 MB and
   Apache's working set.
3. **Is Tailscale listed in Package Center on this model under DSM 7.4**, or is it a Manual Install
   of the `armv8` `.spk`?
4. **The overlap trap on the actual home range**: from a hotspot using the same range as the home
   LAN, confirm failure; after renumbering, confirm success.
5. **Rebind-protected resolvers**: confirm the split-DNS entry makes the name resolve on a network
   that strips RFC1918 answers.
6. **Android at home with Always-on VPN**: does NAS traffic take the LAN, or the tunnel? Does the app
   still load with the NAS's Tailscale package stopped?
7. **Remote throughput** through userspace WireGuard on the A3720, direct vs. DERP — is a 20 MB clip
   watchable?

## Sources

Primary.

**Synology**

- [DS120j datasheet](https://global.download.synology.com/download/Document/Hardware/DataSheet/DiskStation/20-year/DS120j/enu/Synology_DS120j_Data_Sheet_enu.pdf) — CPU, RAM, VPN Server protocols
- [DSM release notes, DS120j](https://www.synology.com/en-global/releaseNote/DSM?model=DS120j) — 7.4.1-90080 current; not on the last-version list
- [VPN Server release notes](https://www.synology.com/en-global/releaseNote/VPNCenter) — 1.4.10-2984, no WireGuard
- [Container Manager release notes](https://www.synology.com/en-global/releaseNote/ContainerManager) — DS120j support since 20.10.23-1437

**Tailscale**

- [Synology](https://tailscale.com/kb/1131/synology) — Package Center, DSM 7 TUN restriction, `--advertise-routes`
- [tailscale-synology platforms.md](https://github.com/tailscale/tailscale-synology/blob/main/docs/platforms.md) — DS120j → arm64
- [Stable packages](https://pkgs.tailscale.com/stable/#spks) — `armv8` DSM 7 `.spk`
- [Tailscale joins the Synology Package Center](https://tailscale.com/blog/tailscale-synology-package)
- [Subnet routers](https://tailscale.com/kb/1019/subnets)
- [Overlapping subnets troubleshooting](https://tailscale.com/docs/reference/troubleshooting/network-configuration/lan-traffic-overlapping-subnets)
- [VPN On Demand for iOS and macOS](https://tailscale.com/docs/features/client/ios-vpn-on-demand)
- [Key expiry](https://tailscale.com/kb/1028/key-expiry)
- [Firewall ports](https://tailscale.com/kb/1082/firewall-ports)
- [DERP servers](https://tailscale.com/kb/1232/derp-servers)
- [How NAT traversal works](https://tailscale.com/blog/how-nat-traversal-works)
- [DNS in Tailscale](https://tailscale.com/kb/1054/dns)
- [Pricing](https://tailscale.com/pricing)
- [Identity providers](https://tailscale.com/kb/1013/sso-providers)
- Issue tracker: [#14142](https://github.com/tailscale/tailscale/issues/14142) (iOS overlap),
  [#21498](https://github.com/tailscale/tailscale/issues/21498) (memory on small devices),
  [#17801](https://github.com/tailscale/tailscale/issues/17801) (Peer Relay memory),
  [#12806](https://github.com/tailscale/tailscale/issues/12806) (`serve` CPU on Synology)

**Apple**

- [`NEVPNProtocol.enforceRoutes`](https://developer.apple.com/documentation/networkextension/nevpnprotocol/enforceroutes) — default `false`
- [`NEVPNProtocol.excludeLocalNetworks`](https://developer.apple.com/documentation/networkextension/nevpnprotocol/excludelocalnetworks) — default `true` on iOS

**Cloudflare**

- [Connect private networks with cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/private-net/cloudflared/)
- [Managed networks](https://developers.cloudflare.com/cloudflare-one/connections/connect-devices/warp/configure-warp/managed-networks/)
- [Zero Trust for everyone](https://blog.cloudflare.com/teams-plans/) — free up to 50 users

**Other**

- [Android Help: connect to a VPN](https://support.google.com/android/answer/9089766) — Always-on VPN
- [ZeroTier on Synology](https://docs.zerotier.com/synology/)
- [runfalk/synology-wireguard](https://github.com/runfalk/synology-wireguard) — archived; platform table

Community, cited for availability only:

- [SynoCommunity architecture table](https://github.com/SynoCommunity/spksrc/wiki/Synology-and-SynoCommunity-Package-Architectures)
- [SynoCommunity: Cloudflare Tunnel package](https://synocommunity.com/package/cloudflared)
