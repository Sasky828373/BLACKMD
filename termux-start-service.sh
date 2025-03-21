#!/data/data/com.termux/files/usr/bin/bash

# Einstellungen
BOT_DIR="$HOME/Blacksky-Md"
LOG_FILE="$BOT_DIR/termux-service.log"

# Wechsle ins Bot-Verzeichnis
cd "$BOT_DIR"

# Starte den Bot mit nohup
echo "$(date) - Bot-Service wird gestartet..." >> "$LOG_FILE"
nohup npm run start >> "$LOG_FILE" 2>&1 &

# Speichere die PID
echo $! > bot.pid
echo "$(date) - Bot-Service gestartet mit PID $(cat bot.pid)" >> "$LOG_FILE"

# Bestätige den Start
echo "Bot-Service wurde als Hintergrundprozess gestartet (PID: $(cat bot.pid))"