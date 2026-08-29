# Media-spike — issue #5

Eén zelfrapporterende pagina die vaststelt of een geïnstalleerde HTTPS-PWA op de iPad media van de
Synology kan laden, en onder welke configuratie. Wegwerpcode: hij levert een feit op, geen product.

**Op de iPad is er geen console.** Daarom rapporteert de pagina zichzelf: alle probes draaien
automatisch, het resultaat komt als JSON in een tekstvak, en één knop kopieert dat naar het klembord
zodat het onder issue #5 geplakt kan worden. Een Mac met Web Inspector is optioneel, geen voorwaarde.

## Wat route 4 aan de research heeft veranderd

De [research](../docs/research/local-network-access-ipados.md) noemde zeven configuraties. Die lijst
is geschreven vóór [ADR 0003](../docs/adr/0003-public-dns-pointing-at-a-private-address.md), en route
4 heeft hem korter gemaakt:

| Research | Nu | Waarom |
| --- | --- | --- |
| 1 — same-origin op de NAS | **A** | Ongewijzigd. `https://nas.vandehaar.dev/spike/` |
| 2 — publieke PWA, NAS op publiek IP | vervallen | Er is geen open poort en geen publiek IP meer |
| 3 — idem, plus split-horizon DNS | **B** | Valt samen met 2: de naam resolvet publiek al naar `192.168.0.137` |
| 4 — CORS erbovenop | **C** | `media.vandehaar.dev`, reverse proxy met Custom Header |
| 5 — service worker | **D** | Ongewijzigd |
| 6 — controle: plain HTTP | **E** | Ongewijzigd, en nog steeds de belangrijkste "mislukking" |
| 7 — tunnel | n.v.t. | Route 4 heeft de aanleiding weggenomen |

**Configuratie B is de configuratie waar het om draait.** De pagina staat op een publieke origin, de
media op een naam die naar een privé-adres wijst: dat is per definitie een *local network request*
onder de LNA-spec. Vandaag bestaat LNA niet op iPadOS, dus het hoort gewoon te werken — maar het is
wel het geval dat als eerste breekt als Apple de vlag ooit aanzet. De spike meet daarom in dezelfde
run of `targetAddressSpace` al bestaat: `'targetAddressSpace' in Request.prototype` is de goedkoopste
probe die er is.

## Wat er waar draait

| | Origin | Rol |
| --- | --- | --- |
| NAS, Web Station | `https://nas.vandehaar.dev` | de bundel voor configuratie A, en in álle configuraties de media |
| NAS, reverse proxy | `https://media.vandehaar.dev` | dezelfde bestanden, mét CORS-headers (configuratie C) |
| NAS, poort 80 | `http://192.168.0.137` | de controle: mixed content (configuratie E) |
| Azure Static Web App | `https://gentle-cliff-00b8a7c03.7.azurestaticapps.net` | de bundel voor configuratie B |

De media-fixtures staan in `/volume1/web/spike/media/` op de NAS: `photo.jpg` (echte foto, ~510 KB),
`clip.mov` (echte iPhone-clip, ~20 MB — het geval dat de kaart als open punt noemt) en `canary.txt`.
**Die bestanden gaan nooit in de repo**; de web-root van de NAS is alleen op het LAN bereikbaar, deze
repo is publiek.

## Uitrollen

```powershell
.\deploy-nas.ps1                       # bundel + media -> /volume1/web/spike/
.\deploy-azure.ps1                     # bundel -> de Static Web App
```

Beide zijn uitgevoerd; dit is alleen nog nodig als de bundel wijzigt. Twee dingen zaten onderweg in
de weg, en staan als commentaar in de scripts zodat ze niet opnieuw uitgezocht hoeven te worden:

- **`scp` moet `-O`.** OpenSSH 9 gebruikt standaard SFTP, en dat subsysteem staat op deze DSM uit.
  Je krijgt dan `dest open ... No such file or directory` op een map die aantoonbaar bestaat.
- **`swa deploy` van de CLI faalt** met `deployment binary exited with code 1` en geen verdere
  melding, terwijl de `StaticSitesClient.exe` die hij eronder gebruikt het prima doet. Het script
  gebruikt de CLI daarom alleen nog om die binary op te halen.

## Wat er in Chrome al gemeten is

De bundel is op beide origins in Chrome 152 gedraaid, om zeker te weten dat een falende probe iets
over het toestel zegt en niet over de harness. Drie dingen kwamen daaruit die de iPad-sessie sturen:

- **Configuratie A werkt volledig, en de DS120j haalt 25,4 MB/s (203 Mbit/s)** op de 20 MB-clip.
  Video: metadata in 67 ms, 1920x1080, speelt en zoekt.
- **Configuratie B werd door Chrome geblokkeerd tot er een permissie was.** De eerste aanvraag naar
  `nas.vandehaar.dev` liep 20 seconden vast, de tweede 305 seconden. Dat is Local Network Access,
  dat sinds Chrome 141 leeft. Ná de permissie werkte niet alleen de HTTPS-aanvraag, maar **ook plain
  HTTP naar `192.168.0.137`** — precies wat de spec zegt: de permissie ontspant ook mixed content.
  Op iPadOS bestaat LNA niet, dus daar hoort dit gewoon te werken; maar dit is de vorm van de
  toekomst zodra WebKit volgt.
- **De service worker ziet drie video-aanvragen, niet één**: `bytes=0-`, dan `bytes=19922944-`, dan
  `bytes=32768-`. Die tweede is de staart van het bestand. Een `.mov` van een iPhone heeft zijn index
  aan het eind staan, dus de speler moet twee keer heen en weer voordat hij kan beginnen. Dat is een
  feit voor de derivatenbeslissing van de `Indexer`, niet voor deze spike — maar het is nu gemeten.

## Het protocol op de iPad

Elke configuratie **twee keer**: één keer in een Safari-tabblad, één keer als geïnstalleerde
webapp. Opslag- en permissiestatus steken die grens niet over, dus het zijn echt twee metingen.

1. Open de URL in Safari. Druk op **Draai alle probes**. Wacht tot alle regels een teken hebben.
2. Staat bij *Service worker registreren* de melding `controller=NEE`, **herlaad de pagina één keer**
   en draai opnieuw. Een service worker bestuurt de pagina die hem installeerde nog niet.
3. Druk daarna op **Video via SW (los)**. Die staat apart omdat hij 20 MB in de cache zet en het
   video-element kan laten struikelen — hij mag de rest van de meting niet omvergooien.
4. Vul de drie vragen onder *Met het oog waargenomen* in. De belangrijkste: verscheen er een
   **systeemmelding over het lokale netwerk**? Kijk daarna in *Instellingen → Privacy en beveiliging
   → Lokaal netwerk* of daar iets nieuws staat. De research kon niet vaststellen aan welke kant van
   die streep een geïnstalleerde webapp valt; dit is het antwoord.
5. **Kopieer rapport** en plak hem onder issue #5.
6. Deel → *Zet op beginscherm*. Open de app vanaf het beginscherm en herhaal stap 1–5.

Let bij het lezen op één ding: een `<img>` die faalt zonder console-fout is precies wat een
geblokkeerde opaque response doet. Daarom staat het **ijkpunt** bovenaan — een same-origin
afbeelding. Faalt die ook, dan is de harness stuk en zegt de rest niets.

## Wat elke probe beantwoordt

| Probe | De vraag erachter |
| --- | --- |
| `canary` | Werkt de harness zelf? |
| `img-nas` | **De kernvraag van het ticket.** |
| `fetch-nocors` | Krijgen we een opaque response, zoals de research voorspelt? |
| `fetch-cors-plain` | Stuurt de kale Web Station-origin inderdaad geen ACAO? (nulmeting voor C) |
| `fetch-cors-media` | **Wat dóet Synology's "Custom Header" eigenlijk** — zet hij hem op de response? Open vraag uit de research. |
| `range` | Komt er een 206, en is `Content-Range` leesbaar vanuit script? |
| `video` | Metadata, afspelen én zoeken op een echte 20 MB-clip. |
| `throughput` | Kan de DS120j überhaupt serveren? Eerste harde getal. |
| `sw-cache-put` / `sw-cache-addall` | De research zegt: `put` mag opaque, `addAll` niet. Klopt dat op dit toestel? |
| `sw-img-from-cache` | Rendert een `<img>` die de service worker uit de cache beantwoordt? |
| `sw-sees-video` | **Bereikt het verzoek van een `<video>` de fetch-handler?** Onopgelost in de research. |
| `sw-range-as-200` | En als de worker een range-verzoek met een volledige 200 beantwoordt — speelt het dan af, en kun je zoeken? |
| `persist` | Overleeft de cache, en hoeveel quota is er? |
| `img-http-control` / `fetch-http-control` | De controle. De foutmelding is de documentatie. |
| `tas-local` / `tas-loopback` | Heeft `targetAddressSpace` enig effect op een gewoon toestel? |

Twee dingen komen er gratis bij, omdat er tóch iets op het toestel draait: `webgl` in de
omgevingstabel is de sterkste aanwijzing of **Lockdown Mode** aan staat (WebKit zet `WebGLEnabled`
dan uit — de kaart heeft daar een open punt over), en `max_texture_size` bevestigt wat prototype C
al mat.

## Opruimen

Wegwerpspul. Na het ticket:

```powershell
ssh -i $env:USERPROFILE\.ssh\rememberwhen_nas_ed25519 vandehaar@192.168.0.137 "rm -rf /volume1/web/spike"
az group delete --name rg-rememberwhen-spike --yes
```

Het A-record `media.vandehaar.dev` en de reverse proxy mogen blijven staan als configuratie C wint;
anders horen ze ook weg.
