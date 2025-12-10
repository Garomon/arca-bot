#!/bin/bash
# Script de Actualización Automática para el VPS
# Ejecuta esto cuando hayas subido cambios nuevos a GitHub desde tu PC.

echo "⬇️  Bajando cambios desde GitHub..."
git pull origin main

echo "📦  Verificando nuevas librerías..."
npm install

echo "🔄  Reiniciando el Bot..."
pm2 restart all

echo "✅  ¡Actualización completada! El bot está corriendo con el código nuevo."
pm2 logs --lines 10
