# Heroku Deployment Guide für Blacksky-MD

Diese Anleitung hilft dir, deinen WhatsApp-Bot erfolgreich auf Heroku zu deployen und 24/7 laufen zu lassen.

## Voraussetzungen

1. Ein [Heroku-Konto](https://signup.heroku.com/) (kostenlos)
2. [Git](https://git-scm.com/downloads) installiert
3. [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli) installiert (optional, aber hilfreich)
4. WhatsApp auf deinem Smartphone

## Wichtige Informationen

Blacksky-MD verwendet eine spezielle Methode, um WhatsApp-Session-Daten auf Heroku zu speichern und wiederherzustellen:

- Heroku hat ein **ephemeres Dateisystem**, d.h. Dateien werden bei jedem Neustart gelöscht
- Um WhatsApp-Sessions bei Neustarts zu behalten, müssen wir die Anmeldedaten in einer Umgebungsvariable speichern
- Das `heroku-credentials-helper.js` Skript exportiert deine lokale WhatsApp-Session in einen Base64-String

## Schritt 1: Lokale Vorbereitung

1. **Starte den Bot lokal**:
   ```bash
   node src/index.js
   ```

2. **Scanne den QR-Code mit WhatsApp** und stelle sicher, dass sich der Bot erfolgreich verbindet

3. **Erzeuge den Credentials-String**:
   ```bash
   node heroku-credentials-helper.js
   ```

4. **Kopiere den gesamten CREDS_DATA-String**, der ausgegeben wird (beginnt mit einem langen Base64-codierten String)

## Schritt 2: Heroku-App erstellen

1. **Erstelle eine neue Heroku-App** im [Heroku Dashboard](https://dashboard.heroku.com/apps) oder mit der CLI:
   ```bash
   heroku create dein-bot-name
   ```

2. **Füge die Buildpacks hinzu**:
   ```bash
   heroku buildpacks:add heroku/nodejs -a dein-bot-name
   heroku buildpacks:add https://github.com/jonathanong/heroku-buildpack-ffmpeg-latest -a dein-bot-name
   heroku buildpacks:add heroku/python -a dein-bot-name
   ```

## Schritt 3: Umgebungsvariablen konfigurieren

1. **Gehe zu deiner App im Heroku Dashboard**
2. **Navigiere zu Settings > Config Vars**
3. **Füge die folgenden Umgebungsvariablen hinzu**:

   | Key | Value |
   |-----|-------|
   | `CREDS_DATA` | Der lange String vom heroku-credentials-helper.js |
   | `PLATFORM` | `heroku` |
   | `NODE_ENV` | `production` |
   | `OWNER_NUMBER` | `4915563151347` (Deine Nummer) |

## Schritt 4: Deployment

### Option 1: GitHub Actions (empfohlen)

1. **Pushe den Code zu GitHub**
2. **Verbinde dein GitHub-Repository mit Heroku**
3. **Aktiviere automatische Deployments**

### Option 2: Manuelles Deployment

1. **Initialisiere ein Git-Repository** (falls noch nicht geschehen):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. **Füge Heroku als Remote hinzu**:
   ```bash
   heroku git:remote -a dein-bot-name
   ```

3. **Pushe den Code zu Heroku**:
   ```bash
   git push heroku master
   ```

## Schritt 5: Bot starten

1. **Stelle sicher, dass dein Bot startet**:
   ```bash
   heroku logs --tail -a dein-bot-name
   ```

2. **Wenn nötig, starte den Bot neu**:
   ```bash
   heroku restart -a dein-bot-name
   ```

## Fehlerbehebung

### Problem: Bot verbindet sich nicht mit WhatsApp

**Mögliche Ursachen und Lösungen:**

1. **CREDS_DATA fehlt oder ist ungültig**
   - Stelle sicher, dass du den kompletten String kopiert hast
   - Erzeuge einen neuen CREDS_DATA-String mit `node heroku-credentials-helper.js`

2. **WhatsApp-Sitzung abgelaufen**
   - Entferne die CREDS_DATA-Variable
   - Starte den Bot lokal neu
   - Scanne den QR-Code erneut
   - Erzeuge und aktualisiere einen neuen CREDS_DATA-String

3. **Fehler in den Logs überprüfen**:
   ```bash
   heroku logs --tail -a dein-bot-name
   ```

### Problem: Bot startet nicht

1. **Heroku-Buildpacks überprüfen**:
   ```bash
   heroku buildpacks -a dein-bot-name
   ```
   
2. **Stelle sicher, dass die Procfile-Konfiguration korrekt ist**:
   ```
   web: node src/index.js
   ```

## Tipps für stabilen Betrieb

1. **Behalte deine WhatsApp-Verbindung aktiv**:
   - Sende regelmäßig Nachrichten an den Bot
   - Aktiviere das Auto-Ping-Feature (falls verfügbar)

2. **Vermeide zu viele Neustarts**:
   - Heroku hat ein Limit von 550 Dyno-Stunden pro Monat im Free Tier
   - Häufige Neustarts können dieses Limit schnell erschöpfen

3. **Überwache die Logs**:
   - Überprüfe regelmäßig die Logs, um Probleme frühzeitig zu erkennen

## Nützliche Heroku-Befehle

```bash
# Logs anzeigen
heroku logs --tail -a dein-bot-name

# App neu starten
heroku restart -a dein-bot-name

# Umgebungsvariablen anzeigen
heroku config -a dein-bot-name

# Neue Umgebungsvariable hinzufügen
heroku config:set VARIABLE_NAME=wert -a dein-bot-name

# Dyno-Status prüfen
heroku ps -a dein-bot-name

# Einen einmaligen Befehl ausführen
heroku run bash -a dein-bot-name
```

## Wichtige Hinweise

- Die WhatsApp-Sitzung kann nach längerer Zeit (Wochen/Monate) ablaufen
- Falls die Verbindung verloren geht, musst du die Schritte 1 und 3 wiederholen
- Ein Heroku-Free-Tier-Dyno schläft nach 30 Minuten Inaktivität ein - dies wird jedoch durch die integrierte HTTP-Server-Funktionalität verhindert

Für weitere Unterstützung kannst du Issues auf GitHub erstellen oder den Entwickler kontaktieren.