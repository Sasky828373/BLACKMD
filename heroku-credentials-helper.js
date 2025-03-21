/**
 * Heroku Credentials Helper
 * 
 * Dieses Skript hilft dabei, die WhatsApp-Anmeldedaten für Heroku zu exportieren
 * 
 * Anleitung:
 * 1. Führe den Bot lokal aus (npm start)
 * 2. Nachdem du den Bot mit WhatsApp verbunden hast, führe dieses Skript aus:
 *    node heroku-credentials-helper.js
 * 3. Kopiere den ausgegebenen String und füge ihn als CREDS_DATA-Umgebungsvariable in Heroku ein
 */

const fs = require('fs').promises;
const path = require('path');
const zlib = require('zlib');
const util = require('util');

const gzip = util.promisify(zlib.gzip);
const AUTH_DIR = path.join(__dirname, 'auth_info_baileys');

async function compressCredsData() {
  try {
    console.log('Lese WhatsApp-Anmeldedaten...');
    
    // Prüfe, ob auth_info_baileys existiert
    try {
      await fs.access(AUTH_DIR);
    } catch (err) {
      console.error('ERROR: auth_info_baileys Verzeichnis nicht gefunden!');
      console.error('Du musst zuerst den Bot starten und mit WhatsApp verbinden.');
      return null;
    }
    
    // Lese alle Dateien im auth_info_baileys-Verzeichnis
    const files = await fs.readdir(AUTH_DIR);
    if (files.length === 0) {
      console.error('ERROR: Keine Anmeldedaten gefunden!');
      return null;
    }
    
    // Erstelle ein Objekt mit allen Dateiinhalten
    const creds = {};
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(AUTH_DIR, file);
        const content = await fs.readFile(filePath, 'utf8');
        creds[file] = content;
      }
    }
    
    // Komprimiere die Daten
    const credsStr = JSON.stringify(creds);
    const compressed = await gzip(Buffer.from(credsStr, 'utf8'));
    
    // Konvertiere zu Base64
    return compressed.toString('base64');
  } catch (error) {
    console.error('Fehler beim Komprimieren der Anmeldedaten:', error);
    return null;
  }
}

async function main() {
  console.log('WhatsApp-Anmeldedaten-Helfer für Heroku');
  console.log('--------------------------------------');
  
  const credsData = await compressCredsData();
  if (!credsData) {
    console.log('Konnte keine Anmeldedaten generieren. Bitte stelle sicher, dass der Bot läuft und mit WhatsApp verbunden ist.');
    return;
  }
  
  console.log('\n✅ Anmeldedaten erfolgreich komprimiert!');
  console.log('\nFüge die folgende Umgebungsvariable zu deiner Heroku-App hinzu:');
  console.log('\nCREDS_DATA=', credsData);
  
  console.log('\n1. Öffne deine Heroku-App im Dashboard');
  console.log('2. Gehe zu Settings -> Config Vars');
  console.log('3. Füge CREDS_DATA als Schlüssel und den oben angezeigten String als Wert hinzu');
  console.log('4. Stelle sicher, dass du auch die folgenden Umgebungsvariablen gesetzt hast:');
  console.log('   - PLATFORM=heroku');
  console.log('   - NODE_ENV=production');
  console.log('   - OWNER_NUMBER=4915563151347');
  console.log('\nDanach starte deine Heroku-App neu mit "heroku restart -a deine-app-name"');
}

main();