# Runbook: apparaten koppelen en intrekken

Hoe een iPad, telefoon of laptop toegang krijgt tot `nas.vandehaar.dev`, hoe je er één weer buitensluit, en wat je doet als het stuk is. De afweging staat in [ADR 0007](../adr/0007-each-device-carries-a-90-day-key-in-a-cookie.md) (de sleutel) en [ADR 0006](../adr/0006-remote-access-through-a-tailscale-route-to-the-nass-private-address.md) (van buiten het huis).

## In één alinea

Elk apparaat heeft een eigen lange, willekeurige sleutel, bewaard als cookie. Die geldt 90 dagen en begint elke keer opnieuw dat de app wordt geopend. De NAS laat een verzoek alleen door als er een bestand met de naam van die sleutel in `devices/` staat. **Toegang intrekken = dat bestand verwijderen.** Niemand hoeft ooit iets te typen, behalve de volwassene die een apparaat voor het eerst koppelt.

## Wat waar staat

| Onderdeel | Plek |
| --- | --- |
| De drempel | `/volume1/web/.htaccess` (bron: `nas/htaccess.template`) |
| Aanmeldpagina | `/volume1/web/enrol/index.php` |
| Sleutelbestanden, één per apparaat | `/volume1/web/devices/` |
| Hash van het huishoudwachtwoord | `/volume1/web/devices/.enrol-secret` (alleen de bcrypt-hash) |
| Teller tegen gokken | `/volume1/web/devices/.enrol-attempts` |
| De oude Basic-drempel, als terugweg | `/volume1/web/.htaccess.basic-backup` |

Het huishoudwachtwoord staat nergens in leesbare vorm op de NAS of in de repo. Het is één keer getoond toen `deploy-auth.ps1` het maakte; bewaar het in je wachtwoordmanager.

## Een apparaat koppelen

Doe dit **in de geïnstalleerde app**, niet in een Safari-tabblad: de app heeft een eigen cookie-opslag, los van Safari.

1. Open `https://nas.vandehaar.dev/` in Safari, deel-knop → **Zet op beginscherm**.
2. Open het nieuwe icoon. Het toont **Dit apparaat koppelen**.
3. Vul het huishoudwachtwoord in (een wachtwoordmanager kan dat) en een naam ("iPad van Emma"). Tik **Koppelen**.
4. De app opent. Klaar, voor 90 dagen vanaf de laatste keer dat hij is gebruikt.

Android: hetzelfde in Chrome, dan *Toevoegen aan startscherm*. Chrome en de geïnstalleerde app delen daar de cookies.

Buiten het huis moet het apparaat ook op Tailscale zitten (ADR 0006): op de iPads *VPN op aanvraag*, verbinden behalve op het thuis-wifi; op Android *Altijd-aan VPN*.

## Een apparaat intrekken (kwijt, gestolen, weg)

1. Welk bestand is van wie? Elk bestand bevat de naam en de datum:
   ```sh
   ssh vandehaar@192.168.0.137
   cd /volume1/web/devices
   grep -H label * 2>/dev/null
   ```
   (Of open de map in File Station en bekijk de bestanden.)
2. Verwijder het bestand van dat apparaat: `rm <bestandsnaam>`. Het werkt bij het eerstvolgende verzoek; dat apparaat krijgt de aanmeldpagina.
3. Haal het apparaat ook weg in Tailscale: <https://login.tailscale.com/admin/machines>, bij dat apparaat *Remove*.

De server kent geen verloop: een sleutel van een apparaat dat is gewist of kwijt, blijft geldig tot het bestand weg is.

## Het huishoudwachtwoord vervangen

Vanaf de repo, op de PC: `pwsh ./deploy-auth.ps1 -ResetPassword`. Het toont het nieuwe wachtwoord één keer. Bestaande apparaten blijven gewoon werken; het wachtwoord is alleen voor het koppelen van nieuwe.

## Als het stuk is

| Symptoom | Oorzaak | Wat te doen |
| --- | --- | --- |
| Iedereen krijgt opeens een aanmeldpagina of 403 | `.htaccess` stuk of weg | `cp /volume1/web/.htaccess.basic-backup /volume1/web/.htaccess` zet de oude Basic-drempel terug; daarna kijken wat er mis was |
| Alles geeft 500 | `mod_rewrite` uitgeladen (Apache-update) | Bedoeld gedrag: luid falen. Zet de module weer aan; niet de drempel omzeilen |
| De aanmeldpagina toont PHP-code als tekst | PHP staat niet aan voor de site | Web Station → Web Service → Default Service → Bewerken → PHP: een profiel kiezen |
| "Te veel pogingen" bij het koppelen | 8 verkeerde wachtwoorden | Wacht een kwartier, of `rm /volume1/web/devices/.enrol-attempts` |
| Één apparaat vraagt om koppelen | 90 dagen ongebruikt, of het apparaat is gewist, of de sleutel is ingetrokken | Opnieuw koppelen |
| Een nieuw apparaat komt er niet doorheen terwijl het huis-wifi het wel kan | Geen Tailscale-verbinding | Zie ADR 0006 |

## Opruimen dat nog kan

De map `/volume1/web/authspike/` is het overblijfsel van het experiment uit [issue #17](https://github.com/marcovandehaar/rememberwhen/issues/17), met eigen Basic-wachtwoorden. Hij is niet meer nodig.
