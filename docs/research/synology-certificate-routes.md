# Synology certificate routes: what DSM does itself, and what it cannot

Fact-check for issue #8. Written 2026-08-29. The DSM Help set checked is the DSM 7 set
(`?version=7`); no `version=7.2`, `7.4` or `8` help set exists at the time of writing. Every claim
below is linked to the source that owns it; anything I could not establish from a primary source is
marked **[UNESTABLISHED]**, and my own reasoning is labelled **inference**.

This note settles facts only. It does **not** pick a route — that decision is the owner's.

## The question

A Synology DS120j on a home LAN must serve publicly-trusted HTTPS so an iPad PWA can load `Media
Item`s from it (see [`local-network-access-ipados.md`](local-network-access-ipados.md) §2 for why
publicly-trusted HTTPS is non-negotiable). **Inbound ports are ruled out by the owner.** The domain
will be `vandehaar.dev` on Cloudflare DNS.

The remaining fork: does DSM do the certificate work itself, or does the owner maintain an ACME
client on the NAS?

## Verdict

**1. No. DSM cannot obtain a Let's Encrypt certificate for a custom domain via DNS-01.** Synology
states it flatly:

> "Synology DDNS supports **DNS-01** (starting with DSM 6.0) and **HTTP-01** validation with Let's
> Encrypt. Customized domain only supports **HTTP-01** validation with Let's Encrypt."
> — [How do I obtain a certificate from Let's Encrypt on my Synology NAS?](https://kb.synology.com/en-global/DSM/tutorial/How_to_enable_HTTPS_and_create_a_certificate_signing_request_on_your_Synology_NAS)

HTTP-01 "can only be done on port 80"
([Let's Encrypt, Challenge Types](https://letsencrypt.org/docs/challenge-types/)). **A custom domain
on DSM therefore means inbound port 80, at issuance and at every renewal — or a self-managed ACME
client.** There is no third option inside Control Panel.

**2. Yes, on both counts, from a primary source — not inference.** The same article, two notes
earlier:

> "To obtain or renew the certificate of your customized domain, make sure port 80 has been forwarded
> to your NAS. **This limitation does not apply to Synology DDNS.**"

And the renewal troubleshooting article attaches footnote 2 directly to its "Forward port 80 to your
Synology device" step:

> "If you are using Synology DDNS to register Let's Encrypt certificate, you can skip this step."
> — [I can't register or renew the Let's Encrypt certificate](https://kb.synology.com/en-global/DSM/tutorial/What_should_I_do_if_cannot_add_renew_lets_encrypt)

So: Synology DDNS uses DNS-01, needs no inbound port at issuance, and needs none at renewal. **The
earlier `[UNESTABLISHED]` in `local-network-access-ipados.md` §2 is now closed.**

**3. Unknown, and Synology does not document it.** DSM Help describes the notification Events tab
and the rule builder, but **never enumerates the events**. Whether "certificate renewal failed" or
"certificate about to expire" is among them is only visible in the device UI. **[UNESTABLISHED]** —
and cheap to close: Control Panel → Notification → Rules, type `certificate` into the event search
field. Separately, **do not rely on the email address entered during certificate creation**: Let's
Encrypt [stopped sending expiration emails on 4 June 2025](https://letsencrypt.org/2025/01/22/ending-expiration-emails/).

**Secondary — DNS rebinding.** Cloudflare does not document any prohibition on a DNS-only A record
holding an RFC1918 address, but it does not document permission either — **[UNESTABLISHED]**, and a
two-minute test once the domain is bought. The real risk is client-side, and it is real: OpenWrt
ships `rebind_protection` **on by default**.

---

## 1. Custom domain: HTTP-01 only, and what that costs

The Control Panel wizard has exactly three fields, per
[Control Panel → Security → Certificate](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/connection_certificate?version=7):

- **Domain name** — "Enter the domain you have registered from the domain provider."
- **Email** — "Enter the email address used for certificate registration."
- **Subject Alternative Name** — "To allow one certificate to cover multiple domains, enter the other
  domain names here. You can also apply for a wildcard certificate by entering the domain names of
  Synology DDNS in the following format: `*.SYNOLOGY_DDNS_DOMAIN_NAME`"

**There is no challenge-type selector, no DNS-provider field, no API-token field.** The help page's
notes are unqualified about the consequence:

> "Let's Encrypt will perform domain validation before issuing certificates for your domains. Please
> make sure your Synology NAS and router have port 80 open for domain validation from the Internet."

> "Certificates issued by Let's Encrypt are valid for 90 days. Before the certificates expire, DSM
> will automatically renew such certificates after successful domain validation. Please make sure your
> Synology NAS and router have port 80 open for certificate renewal."

> "Wildcard certificates are only supported for Synology DDNS."

Two consequences worth stating plainly:

- **`*.vandehaar.dev` is not obtainable from DSM at all.** Wildcards require DNS-01
  ([HTTP-01 "cannot be used to issue wildcard certificates"](https://letsencrypt.org/docs/challenge-types/)),
  and DSM offers DNS-01 only for Synology DDNS. The wildcard decision recorded on issue #8 survives
  only outside DSM's own flow.
- **A single-name custom certificate is obtainable, but only through port 80.** That collides head-on
  with the owner's stated boundary.

**Note the version wrinkle.** The help page and the tutorial disagree in tone: the help page says
port 80 unconditionally, the tutorial carves out Synology DDNS. The tutorial is the more specific and
more recent statement (it names DSM 6.0, 6.2 and 7.0, and cites the challenge types by name), so it
governs. The help page is best read as written for the custom-domain case and never qualified.

**Inference, not documented:** if DSM cannot do DNS-01 for a custom domain, a custom domain with no
inbound port requires an ACME client the owner maintains — `acme.sh` or Certbot with the Cloudflare
DNS plugin — writing the `_acme-challenge` TXT record via Cloudflare's API and then importing or
replacing the certificate in DSM. Synology documents none of this; it is community practice
(**secondary**: multiple Synology Community threads describe exactly this pattern). The maintenance
burden is the thing being traded away, and it is the owner's call.

## 2. Synology DDNS: DNS-01, no inbound port, ever

The chain is complete and primary:

1. Synology DDNS supports DNS-01 validation with Let's Encrypt, starting with DSM 6.0
   ([tutorial](https://kb.synology.com/en-global/DSM/tutorial/How_to_enable_HTTPS_and_create_a_certificate_signing_request_on_your_Synology_NAS)).
2. The port-80 forwarding requirement is explicitly scoped to customized domains: "This limitation
   does not apply to Synology DDNS" (same article), repeated in the renewal FAQ as "Synology DDNS
   doesn't have this limitation"
   ([Why did I receive an email notification from Let's Encrypt?](https://kb.synology.com/en-global/DSM/tutorial/What_should_I_do_if_got_message_on_certificate_expiration)),
   and repeated a third time as a footnote hung on the "Forward port 80" step of the renewal
   troubleshooter.
3. Renewal is the same validation path: "If the domain authenticates successfully, DSM automatically
   renews the certificate before the expiration."

Wildcards over Synology DDNS are documented — `*.SYNOLOGY_DDNS_HOSTNAME`, "only Synology DDNS
supports wildcard certificate" — and since HTTP-01 cannot issue wildcards, the wildcard flow is
necessarily the DNS-01 one. That last step is **inference**, but it is inference on top of a fact
that no longer needs it: the no-inbound-port property is documented for Synology DDNS generally,
wildcard or not.

**What is still unstated:** Synology never describes *how* it performs DNS-01 — presumably by writing
the TXT record into the `synology.me` zone it controls, from its own infrastructure. This matters
only in that the mechanism is a Synology service dependency: if Synology DDNS is not activated, or
the hostname changes, registration and renewal fail (both are listed as causes in the renewal
troubleshooter). **[UNESTABLISHED]** whether Synology publishes any availability commitment for that
service.

**Also note:** a Synology DDNS record publishes the NAS's *external* IP
([DDNS help](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/connection_ddns?version=7)),
which is a separate problem from the certificate one and is already covered in
`local-network-access-ipados.md` §2.

## 3. Failure notification

DSM Help documents the machinery but not its contents.

- **Rules** — "Select the events you want to include in this rule. In the search field, you can type
  in keywords or click the magnifying glass icon to filter events." Three unmodifiable default rules
  exist: **All**, **Warning** (warning + critical), **Critical**
  ([Rules](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/system_notification_rule?version=7)).
- **Events** — "This tab displays a list of system events and their corresponding severity levels.
  Each of the events has its own default message, but you may change it to suit your needs." Events
  can be filtered by keyword or by Critical / Warning / Info severity
  ([Events](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/system_notification_filter?version=7)).

**No Synology page enumerates the events.** I checked the Rules, Events, Email and Push Service help
pages, and searched the Knowledge Center for certificate-plus-notification articles; nothing lists a
certificate event either way. So: **[UNESTABLISHED]**, closable in a minute on the device.

One thing that *is* settled, and is a trap: the tutorial says the Email field is "where a
notification will be sent when the certificate is about to expire." That describes Let's Encrypt's
own expiry mail, which **Let's Encrypt discontinued on 4 June 2025**, recommending third-party
certificate monitoring instead
([Ending Expiration Notification Emails](https://letsencrypt.org/2025/01/22/ending-expiration-emails/)).
The Synology article has not been updated. **If DSM has no certificate event, nothing warns you.**

## 4. DNS rebinding protection

Three lines, as asked.

- **Cloudflare authoritative DNS.** Cloudflare auto-detects `10.0.0.0/8`, `172.16.0.0/12`,
  `192.168.0.0/16`, `fc00::/7` and `100.64.0.0/10` and turns on a *Private Network Routing* toggle
  for them — a closed-beta feature that requires the record to be **proxied**
  ([Private network routing](https://developers.cloudflare.com/dns/private-origins/private-network-routing/)).
  A **DNS-only** (grey-cloud) A record holding a private address is not documented as prohibited, but
  neither is it documented as permitted: **[UNESTABLISHED]**. Test it the day the domain is bought.
- **The risk sits in the client-side resolver, and it is not hypothetical.** dnsmasq's
  `--stop-dns-rebind` "reject[s] (and log[s]) addresses from upstream nameservers which are in the
  private ranges" ([dnsmasq man page](https://thekelleys.org.uk/dnsmasq/docs/dnsmasq-man.html)). It
  is off by default in dnsmasq itself, but **OpenWrt sets `rebind_protection` to `1` by default**
  ([OpenWrt DHCP/DNS](https://openwrt.org/docs/guide-user/base-system/dhcp)), and many consumer
  firmwares derive from it. Both offer whitelists (`--rebind-domain-ok` / `rebind_domain`).
- **Public resolvers: [UNESTABLISHED].** Cloudflare's 1.1.1.1 documentation states only that it does
  not block or filter content; it says nothing about RFC1918 answers. Watch also for iCloud Private
  Relay and per-network DNS on the iPad silently routing the query elsewhere.

## 5. DS120j and Container Manager

Relevant only because it decides how a self-managed ACME client would run.

**Synology lists the DS120j among Container Manager's Applied Models** (`_20 series`, alongside
DS220j and DS420j) on the
[Container Manager package page](https://www.synology.com/en-global/dsm/packages/ContainerManager).
That is Synology's own compatibility list, so it is primary.

The hardware is thin: **Marvell Armada 3700 88F3720, 64-bit, 2 cores at 800 MHz, 512 MB DDR3L
non-ECC, 0 memory slots**
([Product Specifications DS120j](https://global.download.synology.com/download/Document/Hardware/ProductSpec/DiskStation/20-year/DS120j/enu/Product_Spec_DS120j_enu.pdf)).
**[UNESTABLISHED]** whether Container Manager is usable in practice within 512 MB while also serving
media — Synology publishes no minimum-RAM figure for the package. **Inference:** for something as
small as a 90-day ACME renewal, DSM's own **Task Scheduler** running `acme.sh` as a shell script is
the lighter fit, and does not put a container runtime in the media path. Not a recommendation —
just the cheaper of the two shapes on this box.

## What I could not establish

In order of how much they matter.

1. **Whether DSM's notification events include certificate expiry or renewal failure.** Synology
   documents the Events tab but never its contents. One minute in the DSM UI closes it. Everything
   about "do we need to build monitoring" hangs on this.
2. **Whether Cloudflare serves a DNS-only A record containing an RFC1918 address.** Documented
   neither way. Two minutes once `vandehaar.dev` is bought.
3. **Whether the household router does DNS rebinding protection**, and whether the iPad's resolver
   path (Private Relay, per-network DNS) reaches it. Device-specific; must be measured.
4. **Whether Container Manager is workable on 512 MB alongside media serving.** No published minimum.
5. **How Synology performs DNS-01 for `synology.me`, and what availability it commits to.** The
   property that matters (no inbound port) is documented; the mechanism behind it is not.
6. **Whether public resolvers (1.1.1.1, 8.8.8.8, Quad9) strip RFC1918 answers.** Not documented by
   any of them.

## Sources

Primary.

**Synology**

- [How do I obtain a certificate from Let's Encrypt on my Synology NAS?](https://kb.synology.com/en-global/DSM/tutorial/How_to_enable_HTTPS_and_create_a_certificate_signing_request_on_your_Synology_NAS) — the load-bearing page: DNS-01 vs HTTP-01, and the Synology-DDNS carve-out
- [I can't register or renew the Let's Encrypt certificate. What can I do?](https://kb.synology.com/en-global/DSM/tutorial/What_should_I_do_if_cannot_add_renew_lets_encrypt) — footnote 2 on the "Forward port 80" step
- [Why did I receive an email notification from Let's Encrypt?](https://kb.synology.com/en-global/DSM/tutorial/What_should_I_do_if_got_message_on_certificate_expiration)
- [Control Panel → Security → Certificate](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/connection_certificate?version=7) (DSM 7 help)
- [Control Panel → Notification → Rules](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/system_notification_rule?version=7)
- [Control Panel → Notification → Events](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/system_notification_filter?version=7)
- [Control Panel → External Access → DDNS](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/connection_ddns?version=7)
- [Container Manager package page — Applied Models](https://www.synology.com/en-global/dsm/packages/ContainerManager)
- [Product Specifications: DS120j](https://global.download.synology.com/download/Document/Hardware/ProductSpec/DiskStation/20-year/DS120j/enu/Product_Spec_DS120j_enu.pdf)

**Let's Encrypt**

- [Challenge Types](https://letsencrypt.org/docs/challenge-types/) — HTTP-01 is port 80 only and cannot issue wildcards; DNS-01 needs a provider API
- [Ending Expiration Notification Emails](https://letsencrypt.org/2025/01/22/ending-expiration-emails/) — service ended 4 June 2025

**Cloudflare**

- [DNS — Private network routing](https://developers.cloudflare.com/dns/private-origins/private-network-routing/)
- [1.1.1.1 Public DNS Resolver](https://developers.cloudflare.com/1.1.1.1/privacy/public-dns-resolver/)

**Other**

- [dnsmasq man page](https://thekelleys.org.uk/dnsmasq/docs/dnsmasq-man.html) — `--stop-dns-rebind`
- [OpenWrt DHCP and DNS configuration](https://openwrt.org/docs/guide-user/base-system/dhcp) — `rebind_protection` defaults to `1`

Secondary, cited as leads only and not relied upon:

- Synology Community threads on running `acme.sh` with the Cloudflare DNS API on DSM, and the
  standing feature request for a native ACME DNS challenge
  ([forum 17/post/99027](https://community.synology.com/enu/forum/17/post/99027),
  [forum 1/post/161685](https://community.synology.com/enu/forum/1/post/161685))
