# rememberwhen v1 — build spec

Alle risicovolle aannames achter deze spec zijn empirisch bewezen op de [wayfinder-map](https://github.com/marcovandehaar/rememberwhen/issues/1) — dit document consolideert de uitkomst tot bouwbare eisen per laag. Voor de *waarom* achter elke eis: volg de link. Voor de volledige woordenlijst: `CONTEXT.md`.

**Vaststaand**: .NET `Indexer` op Windows; TypeScript + React frontend; de NAS is opslag, geen compute.

## 1. Indexer (Windows, .NET)

De `Indexer` leest `Source Folder`s, stelt de structuur van elke `Memory` voor, verwerkt de correcties van de operator, en publiceert de catalogus. Al het dure werk gebeurt hier, nooit at runtime.

**Chapter-grens** ([#20](https://github.com/marcovandehaar/rememberwhen/issues/20)):
- Groepeer `Media Item`s eerst per kalenderdag.
- Keten opeenvolgende dagen aaneen tot één `Chapter`, tenzij: twee opeenvolgende dagen zonder foto voorkomen, of GPS een sprong van >5 km toont tussen de laatste foto van de ene dag en de eerste van de volgende.
- GPS is leidend zodra aanwezig: kan een grens binnen één dag toevoegen, een tijd-gebaseerde grens onderdrukken, of een grens verfijnen naar het exacte knippunt.
- Geen GPS in de bron → puur dag-gebaseerd; dit is de normale weg, niet een degradatie (23% GPS-dekking, [#18](https://github.com/marcovandehaar/rememberwhen/issues/18)).

**Anomaliedetectie** ([#19](https://github.com/marcovandehaar/rememberwhen/issues/19)):
- Gezag komt van **samenvallende signalen** (mtime, mapnaam, operator-uitspraak), nooit van meerderheid — een grote foutieve groep (bv. een gereset cameraklok) mag een kleine correcte groep niet overrulen.
- Detectie is **relatief** aan de map, niet een vaste duur-drempel.
- Eén melding **per oorzaak**, met de betrokken bestanden eraan gehangen; meldingen zijn **niet blokkerend** voor de rest van de `Memory`.
- Zes afhandelingen beschikbaar, inclusief een **offset-correctie** (verschuift een hele groep met behoud van onderlinge volgorde — het geval van een gereset klok).
- Val nooit stilzwijgend terug op mtime voor een ontbrekende capture-tijd (mtime kan een datum *verzinnen*, zoals bij gestitchte panorama's, [#18](https://github.com/marcovandehaar/rememberwhen/issues/18)).

**Locatie** ([#19](https://github.com/marcovandehaar/rememberwhen/issues/19)):
- Locatie hangt aan de `Chapter`, nooit aan het `Media Item` — geen per-foto locatie-inferentie of -overerving.
- `Destination`-coördinaat volgt uit de gekozen naam via de `Gazetteer` (naam → coördinaat, op reisniveau, groeit mee), niet uit een geocodeerdienst. Waar GPS aanwezig is, stelt het de naam voor en toetst 'm achteraf; het plaatst nooit zelf de pin ([ADR 0005](adr/0005-a-destinations-coordinate-comes-from-its-name.md)).

**Media-derivaten** ([#25](https://github.com/marcovandehaar/rememberwhen/issues/25)):
- Doeltoestel: 10.2" iPad (2019 en 2021, identiek scherm), CSS-viewport 1080×810 landscape, DPR 2. Geen responsive ladder.
- **Story-derivaat** per `Media Item`: 2160px breed (landscape CSS-breedte × DPR2), JPEG q82. Bron ≤ 2160px → derivaat overslaan, origineel serveren (nooit opschalen). Hergebruikt voor tap-to-fullscreen; geen apart fullscreen-derivaat.
- **Pin-thumbnail**: 96 CSS px (192px fysiek), JPEG — alleen voor het cover-`Media Item` van elke `Memory`, niet voor elk item.
- **Video**: origineel 1080p-bestand, geen transcodering, geen poster-frame.
- Alles gegenereerd bij het indexeren, weggeschreven naar de NAS samen met de catalogus.
- `.mts`/`.mpg` (camcorder-tijdperk, 11 bestanden) worden overgeslagen in de derivatenladder — geen aparte afhandeling in v1.
- Formaten: alleen JPEG/WebP zijn toegestaan als output (Lockdown Mode); v1 gebruikt uitsluitend JPEG (WebP kost een extra .NET-dependency — genoteerd als eerste optimalisatie als laadtijd/opslag toch knelt). HEIC-input decodeert native via Windows WIC, geen ImageMagick/ffmpeg nodig.

**Curation** ([#19](https://github.com/marcovandehaar/rememberwhen/issues/19), [#22](https://github.com/marcovandehaar/rememberwhen/issues/22)):
- Eén JSON-bestand per `Source Folder`, gesleuteld op oorzaak (bestand tegen later toegevoegde foto's).
- Bevat: afhandeling per gemelde anomalie, en (naarmate ze bevestigd worden) `Chapter`-grenzen en `Destination`-naam.
- `coverImage`-veld: overschrijft de automatische keuze (standaard: eerste `Media Item` chronologisch) direct in dit bestand.

**Confirmatie-UI** ([#22](https://github.com/marcovandehaar/rememberwhen/issues/22), [#23](https://github.com/marcovandehaar/rememberwhen/issues/23)):
- Minimale lokale web-UI, door de `Indexer` zelf gestart (geen CLI, geen volwaardige desktop-GUI).
- Layout: **variant A, zijbalk/master-detail** — overzichtsscherm met meldingen, detailweergave per melding met foto's en de zes afhandel-knoppen. Geen instellingenscherm in v1.
- Startpunt: de prototype-branch `prototype/indexer-confirm` (drie varianten gebouwd; A won). Niet op `main` — deze publieke repo gitignored `prototype/`.

**Configuratie**:
- Eén configuratiebestand voor alle `Indexer`-instellingen. Ongeldige configuratie moet duidelijk gemeld worden (geen stille verkeerde default).

**Media Source** ([#21](https://github.com/marcovandehaar/rememberwhen/issues/21)):
- Kaal opaak pad-veld op het `Media Item`. Geen abstractielaag tot er een tweede bron bijkomt.

## 2. Catalogus-contract (Indexer → frontend)

Eén genest JSON-bestand, gepubliceerd door de `Indexer` naar de NAS. Startpunt, geen eindstaat — versieer en breid additief uit ([#24](https://github.com/marcovandehaar/rememberwhen/issues/24), [#12](https://github.com/marcovandehaar/rememberwhen/issues/12)).

```
{
  schemaVersion,
  memories: [{
    id, name, destinationName, destinationCoordinate, coverImage,
    chapters: [{
      id, location?,
      mediaItems: [{ id, mediaRef, type, capturedAt, storyRect, shotDuration }]
    }]
  }]
}
```

- `name` (de `Memory`) valt nooit samen met `destinationName`.
- `storyRect` en `shotDuration` zijn v1 formulaïsch gevuld (afwisselende richting, lichte zoom, portrait/landscape verschillend behandeld) — saliency-gestuurde herberekening is een latere aanvulling op dezelfde velden, nooit een her-index.
- Geen opsplitsing in meerdere bestanden nodig: de eenvoudige PWA/DS120j-defaults ([#21](https://github.com/marcovandehaar/rememberwhen/issues/21)) maken dat overbodig.

## 3. Frontend — Globe

Library: **globe.gl**, uitgerekt tot zijn plafond, niet zelfgebouwd ([#7](https://github.com/marcovandehaar/rememberwhen/issues/7), [ADR 0002](adr/0002-globe-gl-for-the-globe.md)).

- Look: **variant A** — fotografische nachtaarde, gloeiende cover-foto pins, statisch geopend op Europa.
- **Bloom staat uit** (kost tweederde van de framerate op de 2019-iPad, en wast de achtergrond uit — globe.gl's composer doet geen kleurruimte-afhandeling). De gloed op de pins is een CSS `box-shadow` en blijft wel staan.
- Pins-horizon: geen speciale logica — de globe opent gewoon verder uitgezoomd als dat nodig is ([#21](https://github.com/marcovandehaar/rememberwhen/issues/21)).
- Pin-sleutel: **`Destination`-naam** (exacte match, want de coördinaat volgt uit de naam via de `Gazetteer` — geen nabijheidsdrempel nodig). Groepering client-side in de globe-laag, uit bestaande per-`Memory`-velden ([#11](https://github.com/marcovandehaar/rememberwhen/issues/11)).
- Pin toont de cover-foto van de **nieuwste** `Memory` op die `Destination`. Tappen zoomt eerst in, toont dan een duim-vriendelijke keuzelijst (max ~4 + scroll) bij samenvallende `Memory`'s.
- iPad-feiten om op te bouwen: WebGL2, `MAX_TEXTURE_SIZE` 16384, ASTC/ETC2/PVRTC alle drie aanwezig.

## 4. Frontend — Story

Scroll-driven cinematische `Story`: de scrollpositie **is** de tijdlijn, geen timer ([#12](https://github.com/marcovandehaar/rememberwhen/issues/12), [ADR 0001](adr/0001-scroll-driven-story-renderer.md)).

- Stack: React + DOM/CSS + **GSAP** (28 KB gz; `CustomEase`/`Flip`/`Observer`/`SplitText` inbegrepen). Geen canvas/WebGL voor compositing (voorkomt CORS/origin-taint op de NAS).
- **Beide animatiepaden moeten geleverd worden**: declaratieve CSS scroll-driven animations (compositor thread) mét een handgeschreven `requestAnimationFrame`-fallback die dezelfde curves interpoleert. Verplicht, niet optioneel: het 2019-iPad-model mist scroll-timeline-ondersteuning en toont anders een zwart scherm. De rAF-fallback haalt 55-60 fps op datzelfde toestel.
- Ken Burns: formulaïsch in v1, gevoed door `storyRect`/`shotDuration` uit de catalogus.
- Video: gewoon lid van de sequentie, gedempt en autoplayend zodra in beeld. Tappen = volledig scherm + geluid, niet starten.
- Tap-to-fullscreen hergebruikt het story-derivaat (§1) — geen apart formaat.
- Hands-off afspelen (idle-variant, scrollpositie automatisch laten oplopen) is **na v1**.

## 5. Hosting & beveiliging

De app draait **same-origin vanaf de NAS** — de enige manier waarop een autorisatie-credential Safari op een media-subresource overleeft ([ADR 0004](adr/0004-the-app-is-served-from-the-nas-so-the-media-is-same-site.md)).

- Domein: `nas.vandehaar.dev`, Let's Encrypt wildcard-certificaat (`*.vandehaar.dev`) via Cloudflare DNS-01 met een ACME-client op de NAS. Geen open poort. Vernieuwing is ingericht én aangetoond; runbook: `runbooks/nas-certificaat.md`.
- Toegang: `AuthType Basic` in een `.htaccess` op Web Station's Apache-backend, hash **`apr1`** (niet bcrypt — 1,7 ms tegen 9,7 ms). Eén credential per toestel. Nul regels applicatiecode voor de authenticatie zelf, maar let op drie randgevallen die eerder braken ([#17](https://github.com/marcovandehaar/rememberwhen/issues/17)):
  - Manifest heeft `crossorigin="use-credentials"` nodig.
  - `.htaccess` heeft `AddType application/manifest+json .webmanifest` nodig (Apache kent de extensie anders niet en stuurt geen `Content-Type`).
  - Nooit `credentials: 'omit'` gebruiken in fetch/service-worker requests.
- Dreigingsmodel: een apparaat op het thuisnetwerk dat niet van ons is. Niet het internet (geen pad naar binnen — geverifieerd: geen open poort op beide routers, [#14](https://github.com/marcovandehaar/rememberwhen/issues/14)), niet de bezochte website, niet huisgenoten.
- PWA-shell: v1 is een gewone website — **geen** precaching, install-prompt of offline-ondersteuning. (Bewezen mogelijk voor v2: 39 GB opslagquota met `persist()=true`, [#5](https://github.com/marcovandehaar/rememberwhen/issues/5)/[#17](https://github.com/marcovandehaar/rememberwhen/issues/17).)
- DS120j-concurrency: geen belastingtest vooraf. Pak het op als het breekt ([#21](https://github.com/marcovandehaar/rememberwhen/issues/21)).

## 6. De bibliotheek waarop dit gebouwd wordt

Gemeten, niet geschat ([#18](https://github.com/marcovandehaar/rememberwhen/issues/18)): 13 mappen, 2010–2025, **2926 bestanden, 21,4 GB** (2754 foto's, 165 video's).

- GPS dekt 23% van de foto's, en is een eigenschap van het *toestel*: elke iPhone tagt vrijwel alles, elk ander toestel niets.
- Geen RAW. HEIC in precies één map (Zillertal 2024, native via WIC). 96% is `.jpg`/`.jpeg`.
- Alle video is 1080p — geen 4K. Video is 5,7% van de bestanden maar 48% van de bytes, gemiddeld 70 MB/clip.
- Foto-input is bimodaal: 15,3 MP originelen (2023/24) naast 3,0 MP exports (alle 2025-mappen, ondanks iPhone-EXIF).
- Capture-tijd ontbreekt bij 1% (28 bestanden): de 11 camcorder-bestanden, 9 gestitchte panorama's, 6 verkleinde/gedeelde kopieën, 2 `.png`.
- Panorama's zijn extreem: tot 5,4:1 en 40 MP (`pano_dubrovnik_1.jpg`).

## 7. Niet in v1

Zie de map's [Out of scope](https://github.com/marcovandehaar/rememberwhen/issues/1)-sectie voor de volledige lijst met redenen. Kort: toegang van buiten het thuisnetwerk, muziek, favorieten-beheer, alternatieve renderers, niet-reis-`Memory`'s (bruiloften, kerst), DSM's eigen beheerinterface, saliency/gezichtsdetectie in de `Indexer`, een niet-WebGL-ingang, `.mts`/`.mpg`-afhandeling buiten "overslaan", Remotion als story-control, doorlopende/ademende afspeelritmes, en de vier onmetingen van het story-prototype (gelijktijdige video-decodering, geheugenplafond, view-transitions-als-match-cut, Low Power Mode).

## 8. Acceptatiescenario voor v1

v1 is klaar als dit end-to-end werkt op het huishoudens-iPad (10.2", 2019 of 2021):

1. Wijs de `Indexer` op de `Source Folder` **Schotland 2010** (dertien-mappen-survey, [#18](https://github.com/marcovandehaar/rememberwhen/issues/18)) — een goede toets omdat hij tegelijk: geen GPS heeft (Sony DSC-W70), een cameraklok-anomalie bevat (3 Nikon-bestanden, EXIF wijst naar januari, mtime naar 6 augustus), en capture-tijd-loze bestanden bevat (5 gestitchte panorama's).
2. **Minstens één anomalie** verschijnt in de confirmatie-UI en wordt door de operator afgehandeld (bv. de Nikon-groep met een offset-correctie).
3. Na bevestiging publiceert de `Indexer` de catalogus en de media-derivaten naar de NAS.
4. Op het iPad: laad de globe, tik op de pin voor **Schotland**, en de `Story` speelt van begin tot eind af — foto's en eventuele video met Ken Burns, juiste volgorde ondanks de klok-anomalie, tap-to-fullscreen werkt.

Als dit scenario draait, is de `Story` niet alleen in losse onderdelen gebouwd maar aantoonbaar samen werkend — en is de map's destination bereikt.
