# API-Keys für WhatsApp Bot

Dieser WhatsApp-Bot unterstützt zahlreiche externe APIs, die das Funktionsspektrum des Bots erweitern. Diese Anleitung erklärt, wie du deine eigenen API-Keys einrichten kannst, um alle Funktionen vollständig zu nutzen.

## Inhalt
- [Warum werden API-Keys benötigt?](#warum-werden-api-keys-benötigt)
- [Wie füge ich API-Keys hinzu?](#wie-füge-ich-api-keys-hinzu)
- [Verfügbare API-Keys](#verfügbare-api-keys)
- [FAQ](#faq)

## Warum werden API-Keys benötigt?

Viele Befehle des Bots nutzen externe Dienste, um Informationen abzurufen:
- Wetterdaten
- YouTube-Videos
- Übersetzungen
- Nachrichten
- Musik-Informationen
- und vieles mehr

Diese Dienste erfordern in der Regel einen API-Schlüssel, um ihre Dienste nutzen zu können. Ohne diese Schlüssel werden bestimmte Befehle nicht funktionieren.

## Wie füge ich API-Keys hinzu?

Es gibt zwei Hauptmethoden, um API-Keys hinzuzufügen:

### Methode 1: Über die .env-Datei (empfohlen)

1. Erstelle eine Datei namens `.env` im Hauptverzeichnis des Projekts
2. Füge deine API-Keys im folgenden Format hinzu:
   ```
   API_NAME=dein_api_key_hier
   ```
3. Beispiel:
   ```
   OPENWEATHERMAP_API_KEY=abcdef123456789
   GOOGLE_API_KEY=xyz987654321
   SPOTIFY_CLIENT_ID=abcdef123456
   SPOTIFY_CLIENT_SECRET=xyz987654321
   ```

### Methode 2: Direkt in der Config.js-Datei

1. Öffne die Datei `src/config/config.js`
2. Suche den Abschnitt `apis:`
3. Ersetze die leeren Strings mit deinen API-Keys
4. Beispiel:
   ```javascript
   apis: {
       openweather: "abcdef123456789",
       google: "xyz987654321",
       // ...
   }
   ```

> **Wichtig:** Wenn du dein Projekt teilst oder in ein öffentliches Repository hochlädst, solltest du niemals deine API-Keys mitteilen. Stelle sicher, dass die `.env`-Datei in `.gitignore` aufgeführt ist und dass du keine API-Keys in `config.js` fest codierst, wenn du das Repository teilst.

## Verfügbare API-Keys

Hier sind die wichtigsten API-Keys, die der Bot unterstützt:

| API-Key Name | Umgebungsvariable | Zweck | Wo erhalten? |
|--------------|-------------------|-------|--------------|
| OpenWeatherMap | `OPENWEATHERMAP_API_KEY` | Wetterdaten | [OpenWeatherMap](https://openweathermap.org/api) |
| Google | `GOOGLE_API_KEY` | Verschiedene Google-Dienste | [Google Cloud Console](https://console.cloud.google.com/) |
| YouTube | `YOUTUBE_API_KEY` | YouTube-Videos und Informationen | [Google Cloud Console](https://console.cloud.google.com/) |
| Spotify | `SPOTIFY_CLIENT_ID` und `SPOTIFY_CLIENT_SECRET` | Musik-Informationen | [Spotify Developer](https://developer.spotify.com/) |
| News | `NEWS_API_KEY` | Nachrichteninformationen | [NewsAPI](https://newsapi.org/) |
| OpenAI | `OPENAI_API_KEY` | KI-Funktionen | [OpenAI](https://platform.openai.com/) |
| Remove Background | `REMOVEBG_API_KEY` | Hintergrund aus Bildern entfernen | [Remove.bg](https://www.remove.bg/api) |
| Wolfram Alpha | `WOLFRAM_APP_ID` | Wissenschaftliche Berechnungen | [Wolfram Alpha](https://products.wolframalpha.com/api/) |
| TMDB | `TMDB_API_KEY` | Film- und TV-Informationen | [The Movie Database](https://www.themoviedb.org/documentation/api) |
| DeepL | `DEEPL_API_KEY` | Präzise Übersetzungen | [DeepL](https://www.deepl.com/pro-api) |

Weitere API-Keys und deren Verwendungszwecke findest du im `apis`-Abschnitt der `src/config/config.js`-Datei.

## FAQ

### Muss ich alle API-Keys hinzufügen?
Nein, du kannst nur die API-Keys hinzufügen, deren Funktionen du verwenden möchtest. Die anderen Befehle werden einfach eine Meldung anzeigen, dass der entsprechende API-Key fehlt.

### Welche API-Keys sind besonders wichtig?
Die folgenden sind für die häufig verwendeten Funktionen besonders wichtig:
- `OPENWEATHERMAP_API_KEY` für Wetterbefehle
- `GOOGLE_API_KEY` für verschiedene Funktionen
- `YOUTUBE_API_KEY` für YouTube-bezogene Befehle

### Wie sicher sind meine API-Keys?
Wenn du die `.env`-Methode verwendest, werden deine API-Keys nicht in öffentlichen Repositories geteilt. Stelle sicher, dass die `.env`-Datei in `.gitignore` aufgeführt ist.

### Wie bekomme ich kostenlose API-Keys?
Die meisten API-Anbieter bieten kostenlose Stufen ihrer API an, die für den persönlichen Gebrauch ausreichend sind. Besuche die Websites der Anbieter und registriere dich für einen API-Key.

### Was tun, wenn ein Befehl trotz API-Key nicht funktioniert?
Überprüfe folgendes:
1. Ist der API-Key korrekt eingegeben?
2. Verwendest du die richtige Umgebungsvariable?
3. Hast du die richtige API für deine Anforderungen gewählt?
4. Einige APIs haben Nutzungsbeschränkungen - hast du diese überschritten?

---

## Heroku-Bereitstellung und Creds Management

Für eine erfolgreiche Bereitstellung des Bots auf Heroku sind einige zusätzliche Schritte erforderlich.

### Credentialsdaten sichern mit dem getcreds-Befehl

Nach der Einrichtung des Bots lokal kannst du den `getcreds`-Befehl verwenden, um deine WhatsApp-Anmeldedaten zu sichern:

1. Sende `.getcreds` an deinen Bot (nur als Besitzer)
2. Der Bot sendet dir eine komprimierte Version der `creds.json`-Datei
3. Speichere diese Daten sicher - du wirst sie für die Heroku-Bereitstellung benötigen

### Heroku-Bereitstellung

Zur Bereitstellung auf Heroku:

1. Erstelle eine neue App auf [Heroku](https://dashboard.heroku.com/)
2. Verbinde dein GitHub-Repository oder verwende die Heroku CLI zum Pushen des Codes
3. Die benötigten Umgebungsvariablen werden automatisch aus `app.json` konfiguriert
4. Füge zusätzliche Umgebungsvariablen in den Heroku-Einstellungen hinzu falls nötig:
   - Alle benötigten API-Keys (wie oben beschrieben)
   - `NODE_ENV=production`
   - `PLATFORM=heroku` 
   - `AUTH_DIR=auth_info` (oder ein anderes Verzeichnis deiner Wahl)
   - `CREDS_DATA=deine_creds_json_daten` (einfügen der Daten aus dem getcreds-Befehl)

Die App wird automatisch mit den richtigen Buildpacks, Add-ons und Nachbereitstellungsskripts bereitgestellt.

### Troubleshooting für Heroku

- Wenn die App abstürzt, prüfe die Logs mit `heroku logs --tail`
- Stelle sicher, dass alle erforderlichen Umgebungsvariablen korrekt gesetzt sind
- Überprüfe, ob die `CREDS_DATA`-Variable die vollständigen, komprimierten Daten aus dem `getcreds`-Befehl enthält
- Verwende den Eco-Dynos-Plan oder höher, um genügend Ressourcen für den Bot bereitzustellen

Happy Botting! 🤖