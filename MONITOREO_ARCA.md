# 🦅 Guía de Monitoreo Maestro - Arca Bot (BTC, SOL & DOGE) v4.0
*(Actualizado: 2025-12-30 - Soporte para 3 bots + SPREAD_MATCH Accounting)*

**IP VPS:** `167.71.1.124`  ssh root@167.71.1.124       
**Usuario:** `root`
**Password:** 

---

## ⚡ 1. COMANDO MAESTRO (EL ÚNICO QUE NECESITAS)

Copia y pega TODO el bloque gris en tu terminal SSH:

```bash
clear; \
echo -e "\n� ═══════════════════════════════════════════════════════════════"; \
echo -e "                    RESUMEN EJECUTIVO [HOY]"; \
echo -e "═══════════════════════════════════════════════════════════════\n"; \
BTC_JSON=$(tail -n 1 /root/arca-bot/logs/training_data/market_snapshots_BTCUSDT_$(date +%Y-%m-%d).jsonl 2>/dev/null); \
SOL_JSON=$(tail -n 1 /root/arca-bot/logs/training_data/market_snapshots_SOLUSDT_$(date +%Y-%m-%d).jsonl 2>/dev/null); \
DOGE_JSON=$(tail -n 1 /root/arca-bot/logs/training_data/market_snapshots_DOGEUSDT_$(date +%Y-%m-%d).jsonl 2>/dev/null); \
BTC_PROFIT_TODAY=$(grep -h "PROFIT" /root/arca-bot/logs/VANTAGE01_BTCUSDT_activity*.log 2>/dev/null | grep "$(date +%Y-%m-%d)" | grep -oP '\$[0-9.]+$' | tr -d '$' | awk '{s+=$1} END {printf "%.4f", s}'); \
SOL_PROFIT_TODAY=$(grep -h "PROFIT" /root/arca-bot/logs/VANTAGE01_SOLUSDT_activity*.log 2>/dev/null | grep "$(date +%Y-%m-%d)" | grep -oP '\$[0-9.]+$' | tr -d '$' | awk '{s+=$1} END {printf "%.4f", s}'); \
DOGE_PROFIT_TODAY=$(grep -h "PROFIT" /root/arca-bot/logs/VANTAGE01_DOGEUSDT_activity*.log 2>/dev/null | grep "$(date +%Y-%m-%d)" | grep -oP '\$[0-9.]+$' | tr -d '$' | awk '{s+=$1} END {printf "%.4f", s}'); \
echo "BTC:  Profit HOY \$${BTC_PROFIT_TODAY:-0} | Lotes: $(echo $BTC_JSON | jq -r '.inventory_lots // "?"') | Score: $(echo $BTC_JSON | jq -r '.decision_score // "?"') | $(echo $BTC_JSON | jq -r '.market_regime // "?"')"; \
echo "SOL:  Profit HOY \$${SOL_PROFIT_TODAY:-0} | Lotes: $(echo $SOL_JSON | jq -r '.inventory_lots // "?"') | Score: $(echo $SOL_JSON | jq -r '.decision_score // "?"') | $(echo $SOL_JSON | jq -r '.market_regime // "?"')"; \
echo "DOGE: Profit HOY \$${DOGE_PROFIT_TODAY:-0} | Lotes: $(echo $DOGE_JSON | jq -r '.inventory_lots // "?"') | Score: $(echo $DOGE_JSON | jq -r '.decision_score // "?"') | $(echo $DOGE_JSON | jq -r '.market_regime // "?"')"; \
echo -e "\n═══════════════════════════════════════════════════════════════\n"; \
echo -e "\n🚦 --- 1. STATUS DE PROCESOS (PM2) [TIEMPO REAL] ---"; \
pm2 list; \
echo -e "\n💻 --- 2. SALUD DEL SERVIDOR (Disco/RAM) [TIEMPO REAL] ---"; \
df -h | grep -E '^/dev/root|Filesystem'; free -m | grep Mem; \
echo -e "\n🕵️ --- 3. ¿HUBO REINICIOS HOY? [HOY] ---"; \
ls -lh /root/arca-bot/logs/VANTAGE* 2>/dev/null | grep "$(TZ='America/Mexico_City' date +%Y-%m-%d)"; \
echo -e "\n🚨 --- 4. ERRORES DE HOY [HOY] ---"; \
grep "ERROR" /root/arca-bot/logs/VANTAGE01_*_activity.log 2>/dev/null | grep "$(TZ='America/Mexico_City' date +%Y-%m-%d)" | tail -n 5 || echo "Sin errores hoy (¡Bien!)"; \
echo -e "\n☠️ --- 4.b CRASH LOGS [HISTÓRICO - desde último borrado] ---"; \
cat /root/arca-bot/logs/pm2_crash.log 2>/dev/null | tail -n 10 || echo "Sin crashes registrados (¡Bien!)"; \
echo -e "\n💰 --- 5. REPORTE DE AYER [AYER] ---"; \
cat /root/arca-bot/reports/daily_report_*_BTCUSDT_$(TZ='America/Mexico_City' date -d "yesterday" +%Y-%m-%d).txt 2>/dev/null || echo "No hay reporte de BTC de ayer."; \
echo -e "\n💰 --- 5.b REPORTE DE AYER (SOL) [AYER] ---"; \
cat /root/arca-bot/reports/daily_report_*_SOLUSDT_$(TZ='America/Mexico_City' date -d "yesterday" +%Y-%m-%d).txt 2>/dev/null || echo "No hay reporte de SOL de ayer."; \
echo -e "\n💰 --- 5.c REPORTE DE AYER (DOGE) [AYER] ---"; \
cat /root/arca-bot/reports/daily_report_*_DOGEUSDT_$(TZ='America/Mexico_City' date -d "yesterday" +%Y-%m-%d).txt 2>/dev/null || echo "No hay reporte de DOGE de ayer."; \
echo -e "\n📈 --- 5.d TRADES DE HOY [CDMX - TIMEZONE AWARE] ---"; \
node /root/arca-bot/scripts/count_trades_today.js; \
echo -e "\n🧬 --- 5.e TRAZABILIDAD DE LOTES (ÚLTIMOS 5) ---"; \
grep -h "Matched Lots" /root/arca-bot/logs/VANTAGE01_*_activity*.log 2>/dev/null | tail -n 5; \
echo -e "\n🏥 --- 6. [BTC] ACTIVIDAD (últimas 100 líneas) ---"; \
tail -n 100 /root/arca-bot/logs/VANTAGE01_BTCUSDT_activity.log; \
echo -e "\n🏥 --- 7. [SOL] ACTIVIDAD (últimas 100 líneas) ---"; \
tail -n 100 /root/arca-bot/logs/VANTAGE01_SOLUSDT_activity.log; \
echo -e "\n🏥 --- 8. [DOGE] ACTIVIDAD (últimas 100 líneas) ---"; \
tail -n 100 /root/arca-bot/logs/VANTAGE01_DOGEUSDT_activity.log; \
echo -e "\n🧠 --- 9.a [AI BTC] ENTRENAMIENTO [TIEMPO REAL - Último Dato] ---"; \
tail -n 1 /root/arca-bot/logs/training_data/market_snapshots_BTCUSDT_$(date +%Y-%m-%d).jsonl 2>/dev/null || echo "Esperando primer dato del día..."; \
echo -e "\n🧠 --- 9.b [AI SOL] ENTRENAMIENTO [TIEMPO REAL - Último Dato] ---"; \
tail -n 1 /root/arca-bot/logs/training_data/market_snapshots_SOLUSDT_$(date +%Y-%m-%d).jsonl 2>/dev/null || echo "Esperando primer dato del día..."; \
echo -e "\n🧠 --- 9.c [AI DOGE] ENTRENAMIENTO [TIEMPO REAL - Último Dato] ---"; \
tail -n 1 /root/arca-bot/logs/training_data/market_snapshots_DOGEUSDT_$(date +%Y-%m-%d).jsonl 2>/dev/null || echo "Esperando primer dato del día..."; \
echo -e "\n💾 --- 10. PULSO DE MEMORIA [TIEMPO REAL - Última modificación] ---"; \
ls -lh /root/arca-bot/data/sessions/*_state.json; \
echo -e "\n🔬 --- 11. AUDITORÍA SEMANAL [OPCIONAL - Correr manualmente] ---"; \
echo "Para verificar profit real vs state file, ejecuta:"; \
echo "  node scripts/full_audit.js BTC/USDT"; \
echo "  node scripts/full_audit.js SOL/USDT"; \
echo "  node scripts/full_audit.js DOGE/USDT"; \
echo "Si hay ⚠️ discrepancias, agrega --fix al final."

echo -e "\n🦅 --- 12. SWARM INTELLIGENCE (AUDITORÍA & FUTURO) ---"; \
echo "1. VERDAD FINANCIERA (Yield Real + Equity + Bags):"; \
echo "   node scripts/calc_swarm_yield.js"; \
echo ""; \
echo "2. PROYECCIÓN DE RIQUEZA (¿Cuándo me retiro?):"; \
echo "   node scripts/analyze_projection.js"; \
echo ""; \
echo "3. CAZAFANTASMAS (Borrar archivos duplicados/viejos):"; \
echo "   node scripts/check_ghosts.js"; \
```

---

## � LEYENDA DE TIEMPOS (¡IMPORTANTE!)

| Etiqueta | Significado |
|----------|-------------|
| `[TIEMPO REAL]` | Dato que refleja el estado AHORA MISMO. Úsalo para diagnosticar problemas actuales. |
| `[HOY]` | Dato que se limpia cada día a las 00:00 UTC. Solo muestra actividad del día en curso. |
| `[AYER]` | Reporte del día anterior. Útil para comparar rendimiento. |
| `[ÚLTIMAS 24H]` | Errores de las últimas 24 horas (puede incluir ayer). |
| `[HISTÓRICO]` | ⚠️ **CUIDADO:** Este dato es ACUMULADO desde que instalaste el bot. NO es de hoy. |

---

## 🚦 2. Semáforo de Salud (Solo usa datos `[TIEMPO REAL]`)

### 🟢 SANO (Todo bien)
*   **PM2 Status:** Los 3 bots dicen `online` en verde.
*   **Actividad:** Los logs muestran timestamps recientes (últimos 5 minutos).
*   **Logs:** Ves `[AI] ANALYZING`, `[INTEL] Regime: ...`, `[SYNC] STATE IS IN SYNC`.

### 🟡 ALERTA (Ojo, pero no es emergencia)
*   `🛡️ BUY BLOCKED: USDT_FLOOR`: El bot pausó compras para proteger liquidez. **Correcto.**
*   `Regime: WEAK_BEAR`: El bot está en modo defensivo. **Esperado en mercado bajista.**
*   `BUY WALL DETECTED`: El bot espera un mejor precio. **Estrategia normal.**

### 🔴 PELIGRO (Acción Inmediata)
*   **Logs vacíos o timestamps viejos:** El bot puede estar muerto.
*   **PM2 dice `stopped` o `errored`:** Necesita reinicio.
*   **Errores repetidos:** `ECONNRESET`, `Binance API Down`, `CRITICAL ERROR`.
*   **Contador `↺` alto + tú NO reiniciaste:** Hay crashes reales. Revisa `pm2_crash.log`.

> **Nota sobre el contador `↺` (restarts):** Si tú hiciste mantenimientos/resets manuales, este contador estará alto. Usa `pm2 reset all` para ponerlo en cero y monitorear desde limpio.

---

## 🆘 3. Comandos de Emergencia

**A) Resucitar los bots:**
```bash
/root/arca-bot/scripts/update_all_bots.sh
```

**B) Ver status de procesos:**
```bash
pm2 list
```

**C) Buscar errores en logs:**
```bash
grep "ERROR" /root/arca-bot/logs/VANTAGE01_BTCUSDT_activity.log | tail -n 20
```

---

## 🧹 4. Comandos de Limpieza/Reset

### Resetear contador de restarts (PM2):
```bash
pm2 reset all
```
*Solo limpia el contador `↺`. No afecta los bots ni los datos.*

### Resetear Max Drawdown (Histórico):
```bash
# BTC Bot
ssh root@167.71.1.124 "cd /root/arca-bot && node -e \"const fs=require('fs'); const f='data/sessions/VANTAGE01_BTCUSDT_state.json'; let s=JSON.parse(fs.readFileSync(f)); s.maxDrawdown=0; fs.writeFileSync(f,JSON.stringify(s,null,2)); console.log('Done');\""

# SOL Bot (uses same codebase as BTC)
ssh root@167.71.1.124 "cd /root/arca-bot && node -e \"const fs=require('fs'); const f='data/sessions/VANTAGE01_SOLUSDT_state.json'; let s=JSON.parse(fs.readFileSync(f)); s.maxDrawdown=0; fs.writeFileSync(f,JSON.stringify(s,null,2)); console.log('Done');\""
```
*Esto pone a cero el "récord de peor caída". El bot debe reiniciarse después.*

### Borrar Crash Logs (para empezar limpio):
```bash
echo "" > /root/arca-bot/logs/pm2_crash.log
```

---

## 🔍 5. AUDITORÍAS Y VERIFICACIÓN DE PROFIT

### Comando Rápido - Ver P&L Real (Flujo de Caja):
```bash
cd /root/arca-bot && node scripts/raw_cashflow_audit.js
```
*Muestra: USDT gastado, USDT recibido, fees, inventario, P&L total*

### Auditoría Completa con SPREAD_MATCH:
```bash
cd /root/arca-bot && node scripts/full_audit.js BTC/USDT
cd /root/arca-bot && node scripts/full_audit.js SOL/USDT
cd /root/arca-bot && node scripts/full_audit.js DOGE/USDT
```
*Muestra: Win rate, calidad de matches, profit realizado vs estado*

### Auditoría Cuántica (Trade por Trade):
```bash
cd /root/arca-bot && node scripts/quantum_audit.js BTC/USDT
cd /root/arca-bot && node scripts/quantum_audit.js SOL/USDT
cd /root/arca-bot && node scripts/quantum_audit.js DOGE/USDT
```
*Muestra: Cada trade individual con running totals y checksum verification*

### Trazabilidad Forense (Ver qué lotes se vendieron):
```bash
grep "Matched Lots" /root/arca-bot/logs/VANTAGE01_BTCUSDT_activity.log | tail -n 20
```
*Muestra exactamente qué ID de compra se usó para cada venta (ej: #1234 @ $90k).*

### Recalcular Profits (Después de correcciones):
```bash
cd /root/arca-bot && node scripts/backfill_profits.js BTC/USDT
cd /root/arca-bot && node scripts/backfill_profits.js SOL/USDT
cd /root/arca-bot && node scripts/backfill_profits.js DOGE/USDT
pm2 restart all
```
*⚠️ Solo usar si se detectan discrepancias. Reconstruye inventario y profits.*

### Verificar Balance Real de Binance:
```bash
cd /root/arca-bot && node -e "
const ccxt = require('ccxt');
require('dotenv').config();
const b = new ccxt.binance({apiKey: process.env.BINANCE_API_KEY || process.env.API_KEY, secret: process.env.BINANCE_SECRET || process.env.API_SECRET});
(async () => {
    const bal = await b.fetchBalance();
    const btcPrice = (await b.fetchTicker('BTC/USDT')).last;
    const solPrice = (await b.fetchTicker('SOL/USDT')).last;
    const dogePrice = (await b.fetchTicker('DOGE/USDT')).last;
    const usdtBal = bal.USDT?.total || 0;
    const btcBal = bal.BTC?.total || 0;
    const solBal = bal.SOL?.total || 0;
    const dogeBal = bal.DOGE?.total || 0;
    const total = usdtBal + (btcBal * btcPrice) + (solBal * solPrice) + (dogeBal * dogePrice);
    console.log('USDT:', usdtBal.toFixed(2));
    console.log('BTC:', btcBal.toFixed(6), '= $' + (btcBal * btcPrice).toFixed(2));
    console.log('SOL:', solBal.toFixed(6), '= $' + (solBal * solPrice).toFixed(2));
    console.log('DOGE:', dogeBal.toFixed(2), '= $' + (dogeBal * dogePrice).toFixed(2));
    console.log('TOTAL:', '$' + total.toFixed(2));
})();
" 2>/dev/null
```

---

## 🛡️ 6. Protecciones Activas (Configuración)
*   **Piso de USDT (15%)**: Nunca gastará tu último 15% de dólares.
*   **Tope de Inventario (70%)**: Nunca llenará más del 70% de la bolsa con monedas.

---

## 💰 7. Entendiendo el Reporte Diario

El reporte tiene datos de diferentes temporalidades. Aquí está la guía:

| Campo | Temporalidad | Descripción |
|-------|--------------|-------------|
| `Today's Profit` | `[HOY]` | Ganancia neta SOLO del día. Se resetea a las 00:00 UTC. |
| `Total Profit` | `[HISTÓRICO]` | Ganancia acumulada desde que instalaste el bot. |
| `Max Drawdown` | `[HISTÓRICO]` | La peor caída que ha tenido el bot EN SU VIDA. No es de hoy. |
| `Total ROI` | `[HISTÓRICO]` | Retorno total basado en `Total Profit` / `Initial Capital`. |
| `Trades Executed` | `[HOY]` | Órdenes ejecutadas hoy. |
| `Active Orders` | `[TIEMPO REAL]` | Órdenes abiertas ahora mismo. |
| `Inventory Lots` | `[TIEMPO REAL]` | Lotes de monedas que el bot tiene en inventario. |
| `Current Price` | `[TIEMPO REAL]` | Precio del par al momento del reporte. |
| `Market Regime` | `[TIEMPO REAL]` | Clasificación del mercado (BULL, BEAR, etc.). |
| `% Time In Range` | `[DESDE INICIO]` | % de ciclos donde el precio estuvo dentro del grid. |
| `Avg Cost` | `[TIEMPO REAL]` | Costo promedio de tu inventario (si estás "cargado"). |
| `Buy & Hold Return` | `[DESDE INICIO]` | Retorno si hubieras holdeado en lugar de usar el bot. |
| `Bot vs Hold` | `[DESDE INICIO]` | Indica quién está ganando: el bot o simplemente holdear. |

> **Regla de Oro:** Si algo dice `[HISTÓRICO]` y te parece raro (ej: Drawdown alto), probablemente es un "fantasma del pasado", no un problema de hoy.
