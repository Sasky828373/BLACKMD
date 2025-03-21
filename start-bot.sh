#!/bin/bash

# Wechsle ins Projektverzeichnis
cd "$(dirname "$0")"

# Starte den Bot mit nohup, um ihn vom Terminal unabhängig zu machen
nohup npm run start > bot.log 2>&1 &

# Speichere die Prozess-ID
echo $! > bot.pid

echo "Bot wurde im Hintergrund gestartet (PID: $(cat bot.pid))"
echo "Logs werden in bot.log gespeichert"