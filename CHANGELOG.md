# 📜 CHANGELOG - Arca Bot Swarm

Registro cronológico de cambios, mejoras y hitos del sistema.

---

## [2025-12-23] 🔧 Fix: Rutas de Monitoreo SOL

### Problema
El comando maestro en `MONITOREO_ARCA.md` leía logs de SOL desde `/root/bot-sol/` pero ambos bots ahora corren desde `/root/arca-bot/`.

### Solución
- Actualizadas todas las rutas de SOL a `/root/arca-bot/`
- Renombrada carpeta obsoleta `/root/bot-sol/` → `/_OLD_bot-sol_BACKUP`

### Archivos modificados
- `MONITOREO_ARCA.md` (12 líneas cambiadas)

---

## [2025-12-23] ✨ Feature: Weekly Metrics (Fase 4)

### Nuevas métricas implementadas
1. **% Time In Range** - Porcentaje de tiempo que el precio está dentro del grid
2. **Inventory Avg Cost** - Costo promedio de la posición acumulada
3. **Buy & Hold Comparison** - Comparación de rendimiento bot vs. simplemente holdear

### Integración
- ✅ `grid_bot.js` - Tracking en `state.metrics` + `generateDailyReport()`
- ✅ `data_collector.js` - Nuevos campos para ML training
- ✅ `MONITOREO_ARCA.md` - Visible en comando maestro SSH
- ⏳ `public/main.js` - Dashboard UI (pendiente)

### Archivos modificados
- `grid_bot.js` (~60 líneas nuevas)
- `data_collector.js` (~10 líneas nuevas)
- `MONITOREO_ARCA.md` (~20 líneas modificadas)

---

## [2025-12-22] 🐛 Fix: IMBALANCE_LOW_BUYS False Positive

### Problema
Grid se reseteaba innecesariamente cuando USDT floor protection estaba activa.

### Solución
Añadida verificación de `remainingBudget` antes de disparar `IMBALANCE_LOW_BUYS`.

---

## [2025-12-22] 🐛 Fix: Profit Double-Counting

### Problema
El profit se duplicaba en ciertos escenarios de reinicio.

### Solución
Implementada auditoría LIFO manual y corrección de `totalProfit` en state files.

---

## [2025-12-21] ✨ Feature: Geopolitical Context Logic

### Mejoras
- `INFLATIONARY_ACCUMULATION` mode (defenseLevel -1) ahora prioriza sobre `STRONG_BEAR`
- Dynamic macro zones basadas en EMA200
- "Cash is Trash" principle implementado

---

## [2025-12-21] ✨ Feature: Dynamic Macro Zones

### Cambios
- EMA200 ahora se pasa correctamente a `evaluateMacroSentiment()`
- Zonas de precio dinámicas influyen en sentiment score

---

## [2025-12-20] 🐛 Fix: Buffer Error (GΛRO VIBE Project)

### Problema
"Buffer is not defined" después de Google login.

### Solución
Polyfill de Buffer añadido a `public/index.html`.

---

## [2025-12-19] 📊 Feature: Timestamps en Logs

### Mejora
Añadidos timestamps ISO a todos los logs de consola para mejor debugging.

---

## 📋 Convenciones

| Emoji | Tipo |
|-------|------|
| ✨ | Nueva feature |
| 🐛 | Bug fix |
| 🔧 | Maintenance/config |
| 📊 | Analytics/metrics |
| 🚨 | Hotfix crítico |
| 📝 | Documentación |

---

## 🏗️ Arquitectura Actual

```
/root/arca-bot/           ← Carpeta principal (BTC + SOL)
├── grid_bot.js           ← Motor principal
├── data_collector.js     ← Training data para ML
├── server.js             ← Dashboard server
├── MONITOREO_ARCA.md     ← Comando maestro SSH
├── logs/                 ← Activity + Decision logs
├── reports/              ← Daily reports
└── data/sessions/        ← State persistence
```

**PM2 Processes:**
- `bot-btc` → BTC/USDT grid bot
- `bot-sol` → SOL/USDT grid bot
