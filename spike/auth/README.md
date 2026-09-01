# Auth-spike — issue #17

Toetst de aanname waarop [ADR 0004](../../docs/adr/0004-the-app-is-served-from-the-nas-so-the-media-is-same-site.md)
de hosting heeft omgedraaid: **same-site autorisatie kost nul regels applicatiecode**. Wegwerpcode, net
als de harness van [#5](https://github.com/marcovandehaar/rememberwhen/issues/5) — hij levert een feit op,
geen product.

Deze harness is een aparte bundel, geen variant van die van #5. De vragen zijn andere: daar ging het om
*welke origin* media kan laden, hier om *of het credential meereist* op een subresource. Alle URL's zijn
relatief, dus de map kan verhuizen zonder code-wijziging.

## Waar het draait

| | |
| --- | --- |
| De bundel achter de drempel | `https://nas.vandehaar.dev/authspike/` |
| Tweede drempel, ander realm | `https://nas.vandehaar.dev/authspike/realm2/` |
| Controle zonder drempel | `https://nas.vandehaar.dev/authopen/` (tijdelijk, alleen voor de meting) |
| De open map van #5 | `https://nas.vandehaar.dev/spike/` — **moet zonder drempel blijven** |

De `.htpasswd`-bestanden staan op `/volume1/web/.htpasswd-authspike` en `…-realm2`. Ze beginnen met
`.ht`, en Apache's eigen `httpd24.conf` weigert alles wat daarop matcht — geverifieerd: 403.
**De wachtwoorden staan niet in deze repo en niet op de issue**; die is publiek.

## Wat elke probe beantwoordt

| Probe | De vraag erachter | Ticketpunt |
| --- | --- | --- |
| `canary` | Werkt de harness zelf? | ijkpunt |
| `img` | Draagt een `<img>` het credential mee? | 3 |
| `catalogue` | En een `fetch()` van JSON? | 3 |
| `fetch-omit` | Sluit `credentials: 'omit'` de app buiten? | 3 |
| `range-head` / `range-tail` | Overleven range-verzoeken de drempel? | 4 |
| `video` | Metadata, afspelen én zoeken op de 20 MB-clip | 3, 4 |
| `throughput` | Het getal dat tegenover nginx' 25,4 MB/s hoort | 6 |
| `open-dir` | Lekt de drempel naar `/spike/`? | 1 |
| `sw-register` | Registreert de worker achter een drempel? | 3 |
| `sw-own-fetch` | **Draagt een verzoek dat de worker zélf uitstuurt het credential mee?** Nergens beantwoord. | 3 |
| `sw-cache-put` / `sw-img-from-cache` | Overleeft de cache de drempel? | 3 |
| `persist` | Quota van een geïnstalleerde webapp | — |
| `sw-sees-video` (losse knop) | Bereikt het `<video>`-verzoek de fetch-handler? | 3 |
| `wrong-explicit` (losse knop) | Wijst de server een fout credential zichtbaar af? | 5 |
| `img-second-realm` (losse knop) | **Vraagt Safari om een wachtwoord voor een same-origin subresource, of breekt de `<img>` stil?** | 5 |

## Uitrollen

```powershell
.\deploy-nas.ps1
```

Rolt alleen de bundel uit. De media, de `.htaccess` en de `.htpasswd` staan al op de NAS en worden niet
overschreven; zie de commentaren in het script voor hoe ze zijn aangemaakt. De valkuilen van #5 gelden
hier onverkort: `scp` moet `-O`, en `sudo` vraagt een wachtwoord.

## Het protocol op de iPad

Voorwaarde: Web Station's back-end staat op **Apache HTTP Server 2.4**. Zolang hij op nginx staat wordt de
`.htaccess` genegeerd en is er geen drempel — dan meet je niets.

Elke meting **twee keer**: één keer in een Safari-tabblad, één keer als geïnstalleerde webapp. Opslag- en
permissiestatus steken die grens niet over, dus het zijn echt twee metingen.

1. Open `https://nas.vandehaar.dev/authspike/`. **Tel hoe vaak Safari om een wachtwoord vraagt** en noteer
   de tekst in de melding. Gebruikersnaam `ipad`.
2. Druk op **Draai alle probes**. Staat bij *Service worker registreren* `controller=NEE`, herlaad de
   pagina één keer en draai opnieuw.
3. Druk op **Video via SW (los)**.
4. **Herlaad** de pagina. Vraagt hij opnieuw? **Sluit de app en open hem opnieuw.** Vraagt hij opnieuw?
5. Druk op **Faalpatroon (los)**. Verschijnt er een tweede wachtwoordmelding (`rememberwhen-realm2`)?
   **Annuleer die.** Wat doet de `<img>` dan — een zichtbaar kapot plaatje, of niets?
6. Vul de vragen onder *Met het oog waargenomen* in en druk op **Kopieer rapport**.
7. Deel → *Zet op beginscherm*, open vanaf het beginscherm, en herhaal stap 1–6.
8. **Herstart het toestel** en open de app nog één keer. Vraagt hij dan opnieuw?

Punt 5 van het ticket vraagt ook om een *verlopen* credential. Dat gaat niet vanaf de iPad: iemand haalt de
regel `ipad` uit `/volume1/web/.htpasswd-authspike` terwijl de meting loopt, waarna je herlaadt.
