#!/bin/bash

# Prüfe, ob die PID-Datei existiert
if [ -f "bot.pid" ]; then
  PID=$(cat bot.pid)
  
  # Prüfe, ob der Prozess noch läuft
  if ps -p $PID > /dev/null; then
    echo "Stoppe Bot (PID: $PID)"
    kill $PID
    rm bot.pid
    echo "Bot wurde gestoppt"
  else
    echo "Bot läuft nicht (PID: $PID existiert nicht mehr)"
    rm bot.pid
  fi
else
  echo "Bot PID-Datei nicht gefunden, Bot scheint nicht zu laufen"
fi