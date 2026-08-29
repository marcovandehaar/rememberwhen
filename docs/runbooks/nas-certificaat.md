# Runbook: het certificaat van de NAS

Hoe `nas.vandehaar.dev` aan een publiek vertrouwd HTTPS-certificaat komt, hoe je ziet dat het werkt, wat je doet als het stuk is, en hoe je het van nul opnieuw opbouwt.

Alles hieronder is op 29 augustus 2026 op de apparatuur zelf vastgesteld, niet uit documentatie overgenomen. De afweging tussen de routes staat in [ADR 0003](../adr/0003-public-dns-pointing-at-a-private-address.md) en in [issue #8](https://github.com/marcovandehaar/rememberwhen/issues/8); de uitvoering in [issue #9](https://github.com/marcovandehaar/rememberwhen/issues/9).

## In één alinea

De iPad moet media van de NAS via HTTPS kunnen laden. Een zelfondertekend certificaat volstaat niet en Local Network Access bestaat niet op iPadOS, dus de NAS heeft een echt certificaat nodig. Dat kan zonder ook maar één poort open te zetten: een **publiek DNS-record dat naar een privé-adres wijst**, en een certificaat dat via een **DNS-uitdaging** wordt opgehaald in plaats van via een webserver. Het huis lost `nas.vandehaar.dev` op naar `192.168.0.137`; van buiten het huis komt niemand ergens.

## Wat waar staat

| Onderdeel | Waarde |
| --- | --- |
| Domein | `vandehaar.dev`, geregistreerd bij Cloudflare Registrar |
| Naam voor de NAS | `nas.vandehaar.dev` → `192.168.0.137`, A-record, **DNS only** |
| Cloudflare zone ID | `369a92f64c6fc76c61d3424ae5232abd` |
| Cloudflare account ID | `045c2f4b900f1a99e345e0a0fcbed3a7` |
| Nameservers | `gracie.ns.cloudflare.com`, `leonard.ns.cloudflare.com` |
| API-token | Naam `acme-sh dns-01 vanaf de NAS`, recht **Zone : DNS : Edit**, alleen op deze zone |
| ACME-client | acme.sh 3.1.4, in `/volume1/acme.sh` |
| Certificaatbestanden | `/volume1/acme.sh/vandehaar.dev_ecc/` |
| Token op de NAS | `/volume1/acme.sh/account.conf` — **het enige geheim op de doos**, map staat op `700` |
| Instellingen per domein | `/volume1/acme.sh/vandehaar.dev_ecc/vandehaar.dev.conf` |
| Vernieuwingstaak | DSM Taakplanner, `acme.sh certificaatvernieuwing`, dagelijks 03:15, **als root** |
| Certificaat in DSM | het **standaard**certificaat — geldt dus ook voor DSM's eigen inlogscherm |

Twee postbussen tellen mee om dit draaiend te houden. Het **iCloud-adres** is registrant bij Cloudflare: daar komt de ICANN-verificatie en de verlenging van het domein. Het adres in het **Synology-account** krijgt DSM's melding `Certificate error`. Raak je één van beide kwijt, dan valt een van de twee vangnetten weg.

## Waarom het zo is opgezet

- **Het A-record wijst naar een privé-adres en dat mag.** Cloudflare accepteert RFC1918-adressen en **dwingt DNS-only zelf af**: zodra je `192.168.0.137` invult verdwijnt de proxy-schakelaar en verschijnt de tekst *"DNS only - reserved IP"*. Het record komt binnen als `proxiable: false`. Iemand kan dit dus niet per ongeluk door Cloudflare laten proxyen.
- **De router laat privé-antwoorden door.** Getest met `nip.io` en `sslip.io` en daarna met de echte naam: zowel de router (`192.168.0.1`) als Cloudflare rechtstreeks geven `192.168.0.137`. Zou de router die antwoorden filteren (DNS rebinding protection), dan viel deze hele opzet om.
- **DNS-01, niet HTTP-01.** DSM heeft een ingebouwde Let's Encrypt-knop, maar die doet HTTP-01 en vereist poort 80 open naar buiten. Precies wat we niet wilden. Vandaar acme.sh.
- **acme.sh en niet Container Manager.** Container Manager is op een DS120j beschikbaar, maar de doos heeft 489 MB geheugen waarvan ongeveer 209 MB werkelijk vrij. acme.sh is een shellscript dat op `curl` en `openssl` leunt en verder niets nodig heeft.
- **Let's Encrypt en niet ZeroSSL.** acme.sh kiest standaard ZeroSSL. Bij de eerste poging gaf ZeroSSL midden in de wildcard-verificatie een `502 Bad Gateway` en daarna `Could not get nonce`. Let's Encrypt is beter gedocumenteerd, ondersteunt ARI (zie hieronder), en is waar de Synology-wereld op ingericht is.
- **Een wildcard.** `*.vandehaar.dev` dekt `nas.` en alles wat er later bij komt, zonder nieuwe aanvraag.
- **`SYNO_USE_TEMP_ADMIN`.** Op DSM staat 2FA, en de deploy-hook kan niet met 2FA inloggen. Met deze schakelaar maakt acme.sh zichzelf tijdens de installatie een tijdelijke beheerder aan en ruimt die daarna weer op. Er staat dus **geen DSM-wachtwoord in enig script**. Vereist wel dat de taak als **root** draait, lokaal op de NAS.

## Hoe je controleert of het goed gaat

### De snelste controle, vanaf een Windows-machine in huis

```powershell
$tcp = [Net.Sockets.TcpClient]::new('nas.vandehaar.dev', 5001)
$ssl = [Net.Security.SslStream]::new($tcp.GetStream(), $false)
$ssl.AuthenticateAsClient('nas.vandehaar.dev')
$c = [Security.Cryptography.X509Certificates.X509Certificate2]::new($ssl.RemoteCertificate)
$c | Format-List Subject, Issuer, NotBefore, NotAfter, SerialNumber
$ssl.Dispose(); $tcp.Close()
```

Gaat `AuthenticateAsClient` zonder fout, dan is de keten vertrouwd én komt de naam overeen — dat is precies wat Safari ook eist. Verwacht `CN=vandehaar.dev`, uitgegeven door Let's Encrypt.

### Lost de naam nog op?

```powershell
Resolve-DnsName nas.vandehaar.dev -Server 192.168.0.1
```

Verwacht `192.168.0.137`. Krijg je hier niets, dan is het een DNS-probleem en geen certificaatprobleem — kijk dan eerst of het A-record nog bestaat en of de NAS nog op dat adres zit.

### Wat zegt de NAS zelf?

```sh
/volume1/acme.sh/acme.sh --home /volume1/acme.sh --config-home /volume1/acme.sh --list
```

Toont het domein, de CA en de eerstvolgende vernieuwingsdatum.

## Wanneer er iets gebeurt

- **Elke nacht om 03:15** draait de taak. Hij kijkt of het vernieuwingsvenster bereikt is en doet meestal niets.
- **Rond 27 oktober 2026** vernieuwt hij daadwerkelijk. Dat moment komt niet uit een vuistregel maar uit **ARI**: Let's Encrypt geeft zelf het venster op waarin vernieuwd moet worden, en acme.sh legt dat vast in `Le_NextRenewTime`. Het certificaat verloopt pas 27 november, dus er is een maand speling.
- **Elk jaar rond 29 augustus** verlengt het domein automatisch bij Cloudflare (ongeveer $12,20). Dat gaat vanzelf zolang de betaalgegevens geldig zijn.

## Als het misgaat

Je merkt het op drie manieren, in volgorde van hoe vroeg ze waarschuwen:

1. **De taak mislukt** → DSM stuurt een mail, mits je bij de taak *"Details van uitvoering per e-mail verzenden, alleen bij abnormale afsluiting"* hebt aangezet. Dit is de vroegste waarschuwing: weken voordat er iets kapot is.
2. **Het certificaat is stuk of verlopen** → DSM's gebeurtenis `Certificate error` (niveau Critical) stuurt een mail naar het adres in het Synology-account. De regel *Warning* dekt die gebeurtenis; *Warning* is een **drempel**, geen niveau — Critical valt eronder.
3. **Safari geeft een harde fout.** `.dev` staat in de HSTS-preloadlijst, dus er is **geen "toch doorgaan"**. Kom je hier, dan werkt de app niet meer.

### Handmatig vernieuwen forceren

```sh
sudo -i
env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/root \
  /volume1/acme.sh/acme.sh --home /volume1/acme.sh --config-home /volume1/acme.sh --cron --force
```

`env -i` gooit alle omgevingsvariabelen weg en bootst zo de kale omgeving van de Taakplanner na. Werkt het hiermee, dan werkt het vannacht ook.

**Let op de limiet:** Let's Encrypt staat **vijf certificaten per week** toe voor exact dezelfde namencombinatie, en ongeveer **vijf mislukte validaties per uur**. Blijf dit dus niet herhalen als het misgaat — lees eerst de foutmelding.

### De uitvoer moet eindigen met twee dingen

`Cert success` bewijst alleen dat het bestand op schijf ververst is. Je wilt daarná ook zien:

```
Restart HTTP services succeeded.
Success
```

Ontbreekt dat, dan is het certificaat wel vernieuwd maar **niet in DSM geïnstalleerd** — de stilste manier waarop dit kapot kan gaan.

### Controleren dat DSM het nieuwe certificaat ook echt serveert

Vergelijk het serienummer uit de PowerShell-controle hierboven met het `Le_LinkCert`-adres in de uitvoer van acme.sh. Die twee horen gelijk te zijn.

## Van nul opnieuw opbouwen

Voor als de NAS vervangen wordt, of als je dit ooit op een andere doos doet.

### Randvoorwaarden

- [ ] **Het LAN-adres van de NAS vastzetten.** In de Archer C2300: *Advanced → Network → DHCP Server → Address Reservation → Add*. MAC van de NAS, het gewenste adres, een omschrijving, en *Enable This Entry*. Het adres mag binnen de DHCP-pool (`192.168.0.100`–`192.168.0.199`) vallen; TP-Link haalt een gereserveerd adres uit de dynamische uitgifte. Verhuist het adres, dan wijst het publieke record naar niets en breekt de app stil.
- [ ] **Controleer dat de notificatie aankomt.** *Configuratiescherm → Melding → Email → Synology Account → Send Test Email*. Komt die mail niet aan, richt dan eerst een werkend kanaal in — anders merk je een storing pas als Safari faalt.

### Domein en DNS

- [ ] Domein registreren bij Cloudflare (of de zone daarheen verhuizen). Account-e-mail **verifiëren**, anders blokkeert Cloudflare domeinregistratie, en de **ICANN-verificatiemail** bevestigen, anders zet ICANN het domein op hold.
- [ ] 2FA aanzetten op het Cloudflare-account — daar komt zo een token in te staan dat je DNS mag wijzigen.
- [ ] A-record aanmaken: naam `nas`, type `A`, waarde het vaste LAN-adres. De proxy-schakelaar hoort vanzelf om te slaan naar *"DNS only - reserved IP"*. Gebeurt dat niet, stop dan — dan klopt het adres niet.
- [ ] Controleer vanaf het LAN: `Resolve-DnsName nas.<domein> -Server <router-ip>` moet het privé-adres teruggeven.

### API-token

- [ ] *My Profile → API Tokens → Create Token → template **Edit zone DNS***.
- [ ] Zone Resources: **Include → Specific zone → jouw zone**. Niet "All zones".
- [ ] Client IP filtering **leeg laten**: het huis zit achter dubbele NAT met een extern IP dat kan wisselen, en dan zou de vernieuwing op een dag stil breken.
- [ ] Geef het token een naam waaraan je over een jaar ziet wat hem gebruikt.
- [ ] **Kopieer de waarde meteen** — Cloudflare toont hem één keer. Kwijt? Dan *Roll* op hetzelfde token; dat geeft een nieuwe waarde met dezelfde rechten.

### acme.sh installeren

SSH naar de NAS en word root met `sudo -i`.

- [ ] **Pak niets uit in `/tmp`.** Die is op DSM gemonteerd met `noexec`; je krijgt dan `Permission denied` terwijl je root bent en het bestand gewoon uitvoerbaar is. Werk op `/volume1`.

```sh
mkdir -p /volume1/acme-install && cd /volume1/acme-install
curl -fSL -o acme.tar.gz https://github.com/acmesh-official/acme.sh/archive/refs/tags/3.1.4.tar.gz
tar xzf acme.tar.gz && cd acme.sh-3.1.4
bash ./acme.sh --install --nocron --home /volume1/acme.sh --accountemail "JOUW@EMAIL"
chmod 700 /volume1/acme.sh
```

`--nocron` omdat DSM **geen `crontab`** heeft; de vernieuwing gaat via de Taakplanner. `chmod 700` omdat het token straks in deze map komt. De map staat bewust op de root van `/volume1` en niet in een gedeelde map, anders zou hij via SMB in het netwerk kunnen opduiken.

- [ ] **Zet `--home` en `--config-home` op élke acme.sh-aanroep.** Zonder die twee valt acme.sh terug op `/root/.acme.sh` — die bestaat hier niet, en dan schrijft hij instellingen nergens weg terwijl hij wel meldt dat het gelukt is.

### Certificaat aanvragen

```sh
bash
read -rs -p "Cloudflare token: " RAW; echo
CF_Token=$(printf '%s' "$RAW" | tr -d '[:space:]'); export CF_Token; unset RAW
export CF_Zone_ID='<zone id>'
export CF_Account_ID='<account id>'
curl -s -H "Authorization: Bearer $CF_Token" https://api.cloudflare.com/client/v4/user/tokens/verify
```

Het token gaat via `read -rs` naar binnen zodat hij **niet in de shell-geschiedenis van root** belandt. De `verify`-aanroep is de laatste poort: pas bij `"success":true` en `"status":"active"` verder gaan — een mislukte poging kost je een van de vijf per uur.

`CF_Zone_ID` meegeven is wat het token krap houdt: zonder die waarde wil acme.sh je zones opzoeken en had het token ook `Zone:Read` nodig gehad.

```sh
/volume1/acme.sh/acme.sh --home /volume1/acme.sh --config-home /volume1/acme.sh --set-default-ca --server letsencrypt
/volume1/acme.sh/acme.sh --home /volume1/acme.sh --config-home /volume1/acme.sh \
  --issue --dns dns_cf -d <domein> -d '*.<domein>' --server letsencrypt
```

`--server letsencrypt` staat er **twee keer** met opzet: als de standaard-CA niet is weggeschreven, valt de aanvraag anders alsnog terug op ZeroSSL.

Reken op één tot twee minuten. De stilte na *"Sleeping for 20 seconds first"* is normaal: acme.sh wacht tot de TXT-records publiek zichtbaar zijn.

### In DSM zetten

```sh
export SYNO_USE_TEMP_ADMIN=1
export SYNO_CERTIFICATE=""
/volume1/acme.sh/acme.sh --home /volume1/acme.sh --config-home /volume1/acme.sh \
  --deploy -d <domein> --deploy-hook synology_dsm
```

`SYNO_CERTIFICATE=""` betekent **het standaardcertificaat**, waardoor het meteen ook voor DSM's eigen interface geldt. DSM herstart hierbij zijn webserver; je browsertabblad kan er even uit liggen, je SSH-sessie blijft staan. Gaat het mis, dan blijft DSM bereikbaar via `http://<ip>:5000`.

- [ ] Controleer dat de instellingen zijn bewaard, want hier hangt elke toekomstige vernieuwing aan:

```sh
grep -i "syno" /volume1/acme.sh/<domein>_ecc/<domein>.conf
```

Je wilt `Le_DeployHook='synology_dsm,'` zien én `SAVED_SYNO_USE_TEMP_ADMIN='1'`. Staan die er, dan heeft de vernieuwing later **geen omgevingsvariabelen nodig**.

- [ ] Controleer dat de tijdelijke beheerder is opgeruimd: `synouser --enum local` mag geen onbekend account tonen.

### De vernieuwing inrichten en bewijzen

- [ ] *Configuratiescherm → Taakplanner → Maken → Geplande taak → Door gebruiker gedefinieerd script*.
  - Gebruiker: **root** (nodig voor de tijdelijke beheerder)
  - Schema: dagelijks, rustig tijdstip
  - Opdracht: `/volume1/acme.sh/acme.sh --home /volume1/acme.sh --config-home /volume1/acme.sh --cron`
  - **"Details van uitvoering per e-mail verzenden" aan, alleen bij abnormale afsluiting**
- [ ] **Bewijs de vernieuwing** met het geforceerde commando uit *Als het misgaat*, en controleer dat het serienummer dat de NAS serveert daarna is veranderd. Dat de taak bestaat zegt niets; dat hij het kan wel.
- [ ] Ruim op: `rm -rf /volume1/acme-install`

## Wat je niet moet doen

- **Het A-record proxyen.** Cloudflare staat het niet toe voor een privé-adres, maar mocht het adres ooit publiek worden: proxyen stuurt het verkeer naar buiten, precies wat deze opzet vermijdt.
- **Een poort openzetten omdat "het dan makkelijker is".** De hele reden voor DNS-01 is dat het niet hoeft.
- **Het token breder maken dan `Zone:DNS:Edit` op één zone.** Een globale sleutel in `account.conf` op een NAS is een heel ander risico.
- **`/volume1/acme.sh` in een gedeelde map zetten.** Daar staat je token in.
- **De automatische verlenging van het domein uitzetten.** Bij `.dev` met HSTS is een verlopen domein een harde fout zonder uitweg.
