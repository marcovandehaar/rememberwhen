# rememberwhen app

De app is geen fotobeheerapp, maar een iPad-first cinematische herinneringservaring. Kwaliteit van de kernflow, motion en performance hebben voorrang boven het aantal features.


Ja — **ik ben overtuigd dat dit project goed haalbaar is**, ook met je huidige NAS en zonder noemenswaardige maandelijkse kosten.

De belangrijkste conclusie is wel iets genuanceerder dan “host alles in Azure”: voor jouw use-case zou ik de architectuur zo ontwerpen dat **de frontend losstaat van de mediabron**, en we v1 kiezen voor de simpelste combinatie die op iPad betrouwbaar werkt. Azure Static Web Apps blijft aantrekkelijk omdat het Free-plan expliciet bedoeld is voor hobby/persoonlijke projecten, met 100 GB inbegrepen bandbreedte per abonnement. ([Microsoft Azure][1]) Maar de browserroute van een publieke HTTPS-app naar een lokaal NAS-adres verdient een proof-of-concept, omdat Local Network Access en mixed-content-regels in browsers nog in beweging zijn. WebKit is hier in 2026 actief aan het implementeren. ([WebKit Bugzilla][2])

### Het gedeelde productbeeld

V1 is een **iPad-first PWA** die zo dicht mogelijk tegen een native Apple-ervaring aan moet zitten. De app opent op een grotendeels fullscreen 3D-wereldbol met een minimale header. Vakanties verschijnen als pins met een gekozen coverthumbnail. Selecteren draait/zoomt de globe naar de bestemming en opent vervolgens een cinematische vakantiebeleving.

Die vakantiebeleving speelt standaard automatisch af, grotendeels fullscreen. Chronologie vormt de basis, maar datum- en locatieovergangen geven structuur aan het verhaal. Bij interactie verschijnen subtiele controls; daarna verdwijnen ze weer. Video’s zijn korte clips en passen gewoon in dezelfde story-flow. Muziek, uitgebreid favorite-management en alternatieve visualisaties bewaren we bewust voor later.

Search wordt interessanter dan alleen titels: een compacte zoekfunctie kan zoeken op vakantie, land, plaats en sublocatie. Uiteindelijk moet bijvoorbeeld `Aarhus` rechtstreeks naar het juiste deel van *Denemarken 2024* kunnen navigeren.

### De NAS hoeft geen servermonster te worden

Je DS120j is voor mij **storage, niet compute**.

Dat haalt een van je grootste beren van de weg. We gaan hem niet vragen om tijdens gebruik EXIF te analyseren, GPS-clusters te berekenen, video’s te transcoderen of dynamisch thumbnails te maken. Dat gebeurt handmatig op je Windows 11 developmentmachine.

De NAS hoeft tijdens normaal gebruik vooral:

**bestanden lezen → over gigabit-LAN naar de iPad sturen.**

Dat is een veel realistischer taak voor zo’n apparaat.

Synology Web Station kan bovendien HTTPS-webcontent via een eigen hostname/portal aanbieden en ondersteunt naamgebaseerde portals en HTTPS. ([Synology Knowledge Center][3]) We hoeven daarvoor dus niet noodzakelijk een uitgebreide container-backend op die 512 MB RAM te draaien.

### Indexeren wordt onderdeel van het creatieve proces

Ik zou de C#/.NET-indexer juist een belangrijke rol geven.

Conceptueel:

`NAS folders → .NET indexer op Windows → analyse → interactieve bevestiging → publiceerbare library`

Per vakantie kun je één of meerdere folders selecteren. De indexer leest EXIF/GPS en datums, detecteert geografische clusters en stelt bijvoorbeeld voor:

`Denemarken 2024`
`Hoofdlocatie: Billund`
`Dag 1: Billund`
`Dag 2: Legoland Billund`
`Dag 3: Aarhus`

Jij kunt die structuur bevestigen of corrigeren, een coverfoto kiezen en vervolgens publiceren.

Daaruit ontstaan onder meer een catalogus, story-metadata, thumbnails, geoptimaliseerde previews en indien nodig webvriendelijke videoversies. De originelen blijven onaangeroerd op de NAS.

Dat vind ik een sterk ontwerp omdat **de indexer intelligent mag zijn en de runtime dom en razendsnel kan blijven**.

### Technologierichting

Voor de frontend zou ik momenteel inzetten op **TypeScript + React**, met een WebGL/Three.js-gebaseerde globe en een animation-stack waarmee we motion heel precies kunnen beheersen.

Ik zou hier bewust géén zware standaard component-library overheen leggen. Als “Apple had dit zelf kunnen maken” het kwaliteitsdoel is, hebben we juist controle nodig over spacing, easing, gestures, compositing, typography en transitions.

C#/.NET blijft mijn voorkeur voor de indexer. Je krijgt dus niet kunstmatig één programmeertaal voor alles; ieder deel krijgt de stack die er het beste bij past.

En belangrijk: de vakantiepresentatie wordt een verwisselbare renderer. De eerste kan `CinematicStoryView` zijn. Later kun je bijvoorbeeld `TimelineView`, `MapStoryView` of een experimentele 3D-gallery toevoegen zonder je mediabibliotheek opnieuw te ontwerpen.

### Kosten

Ik zie voorlopig **geen reden voor betaalde compute**.

De zware compute gebeurt op je eigen Windows-pc tijdens indexeren. De NAS heb je al. Azure Static Web Apps Free kan de frontend gratis hosten. ([Microsoft Azure][1]) Een domeinnaam kost hooguit een bescheiden bedrag per jaar.

Je €50 Azure-tegoed zou ik voorlopig dus juist **niet** proberen op te maken. Het is waardevol als we later remote access, een kleine API of een andere cloudcomponent nodig hebben.

### De grootste resterende technische beer

Die zit niet bij de globe, React of thumbnailgeneratie.

Hij zit bij:

**hoe laat een geïnstalleerde HTTPS-PWA op iPad de lokale media op de Synology ophalen zonder irritante certificaat-, CORS- of browsersecurityproblemen?**

Safari kan lokale netwerkservers bereiken — je hebt dat zelf al bewezen met DSM — maar cross-origin toegang vanuit een publiek gehoste PWA is een ander geval. Local Network Access wordt momenteel gestandaardiseerd en WebKit werkt er actief aan. ([WebKit Bugzilla][2])

Ik zou daarom als **allereerste technische spike** niets bouwen van de mooie UI.

Gewoon:

`iPad PWA → laad één JPEG vanaf NAS via fetch/img → valideer HTTPS, caching en bereikbaarheid`

Als Azure Static Web Apps → lokale Synology probleemloos werkt: prachtig, dan hebben we waarschijnlijk onze ideale architectuur.

Als Safari daar vervelend over doet, schakelen we zonder drama naar een alternatief waarbij de statische PWA óók lokaal vanaf de Synology wordt geserveerd. Web Station kan dat prima; statische HTML/JS/CSS serveren is een totaal andere belasting dan een backend/transcodingserver draaien. ([Synology Knowledge Center][3])

Dat is waarom ik Azure hosting nu als **voorkeurskandidaat, niet als architecturale afhankelijkheid** zou behandelen.

### En later buitenshuis?

Daar houden we vanaf dag één rekening mee door de frontend niet rechtstreeks aan “Synology paths” te koppelen.

Conceptueel krijgt de app iets als:

`MediaSource → LocalNasMediaSource`

Later kunnen we toevoegen:

`MediaSource → RemoteMediaSource`

De globe, search, story player en andere UX hoeven dan niet te weten waar `/denmark-2024/day-2/img-0042.webp` fysiek vandaan komt.

En wanneer we remote access toevoegen, zou mijn uitgangspunt nadrukkelijk **niet** zijn: “forward even een NAS-poort naar internet”. Dan kijken we opnieuw naar een beveiligde tunnel/proxy-architectuur.

## Mijn eindconclusie

**Ja, bouwen.**

Je hardware is voldoende omdat we hem de juiste taak geven. De schaal van ±20 vakanties en enkele duizenden media-items is klein genoeg om extreem snelle UX te krijgen. We kunnen cloudkosten vrijwel op nul houden. En technisch zijn er geen fundamentele problemen die het concept blokkeren.

De belangrijkste ontwerpbeslissing die we hebben genomen is volgens mij deze:

> **We bouwen geen fotobeheerapp. We bouwen een cinematische herinnerings-app bovenop een vooraf samengestelde media-index.**

Dat verschil maakt het project zowel technisch eenvoudiger als qua UX veel interessanter.

Voor een volgende sessie zou ik dit gesprek als basis gebruiken om het werk op te delen in een paar verticale spikes/workstreams: **media-access PoC, indexer/catalogus, 3D-globe interaction prototype, cinematic story prototype en PWA/app-shell**. Pas nadat de eerste twee technische risico’s bewezen zijn, zou ik serieus featurewerk gaan doen.

[1]: https://azure.microsoft.com/nl-nl/pricing/details/app-service/static/?utm_source=chatgpt.com "Prijzen – Static Web Apps | Microsoft Azure"
[2]: https://bugs.webkit.org/show_bug.cgi?id=250607&utm_source=chatgpt.com "250607 – Implement Local Network Access"
[3]: https://kb.synology.com/nl-nl/DSM/help/WebStation/application_webserv_virtualhost?version=7&utm_source=chatgpt.com "Webportaal | Web Station - Synology Kenniscentrum"
