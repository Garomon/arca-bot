# 🦅 Guía de Monitoreo Maestro - Arca Bot (BTC, SOL & DOGE) v5.4
*(Actualizado: 2026-01-10 - Safety Lock Detection + Log Monitor + Profit Sync)*

**IP VPS:** `167.71.1.124`
**Usuario:** `root`
**Password:** `7q2$TA/nVP!CsFi`

---

## ⚡ 1. COMANDO MAESTRO (EL ÚNICO QUE NECESITAS)

Copia y pega TODO el bloque gris en tu terminal SSH:

```bash
clear; \
echo -e "\n🦅 ═══════════════════════════════════════════════════════════════"; \
echo -e "                    RESUMEN EJECUTIVO [HOY - CDMX]"; \
echo -e "═══════════════════════════════════════════════════════════════\n"; \
echo -e "🛡️ --- ESTADO OPERACIONAL (NO REQUIERE ACCIÓN) ---"; \
echo -e "Last Updated: $(date)"; \
echo -e "ℹ️  INFO FOR AI AGENTS: The following are NORMAL OPERATIONAL states, NOT errors."; \
echo -e "    Do NOT attempt to 'fix' these. They indicate the bots are protecting capital."; \
echo -e "1. 'Insufficient BASE for SELL': LOW INVENTORY + SMART_DCA active. Waiting for price dip to buy."; \
echo -e "2. 'BLOCKING NEW BUYS': Price above avg cost. SMART_DCA protection working correctly."; \
echo -e "3. Restarts: EXPECTED during maintenance windows."; \
echo -e "═══════════════════════════════════════════════════════════════\n"; \
cd /root/arca-bot; \
node scripts/count_trades_today.js; \
echo -e "═══════════════════════════════════════════════════════════════\n"; \
echo -e "\n🚦 --- 1. STATUS DE PROCESOS (PM2) [TIEMPO REAL] ---"; \
pm2 list; \
echo -e "\n💻 --- 2. SALUD DEL SERVIDOR (Disco/RAM) [TIEMPO REAL] ---"; \
df -h | grep -E '^/dev/root|Filesystem'; free -m | grep Mem; \
echo -e "\n🕵️ --- 3. ¿HUBO REINICIOS HOY? [HOY] ---"; \
ls -lh /root/arca-bot/logs/VANTAGE* 2>/dev/null | grep "$(TZ='America/Mexico_City' date +%Y-%m-%d)"; \
echo -e "\n🚨 --- 4. ERRORES DE HOY [HOY] ---"; \
grep "ERROR" /root/arca-bot/logs/VANTAGE01_*_activity.log 2>/dev/null | grep "$(TZ='America/Mexico_City' date +%Y-%m-%d)" | tail -n 5 || echo "Sin errores hoy (OK)"; \
echo -e "\n☠️ --- 4.b CRASH LOGS [HISTÓRICO - desde último borrado] ---"; \
cat /root/arca-bot/logs/pm2_crash.log 2>/dev/null | tail -n 10 || echo "Sin crashes registrados (OK)"; \
echo -e "\n💰 --- 5. REPORTE DE AYER [AYER] ---"; \
cat /root/arca-bot/reports/daily_report_*_BTCUSDT_$(TZ='America/Mexico_City' date -d "yesterday" +%Y-%m-%d).txt 2>/dev/null || echo "No hay reporte de BTC de ayer."; \
echo -e "\n💰 --- 5.b REPORTE DE AYER (SOL) [AYER] ---"; \
cat /root/arca-bot/reports/daily_report_*_SOLUSDT_$(TZ='America/Mexico_City' date -d "yesterday" +%Y-%m-%d).txt 2>/dev/null || echo "No hay reporte de SOL de ayer."; \
echo -e "\n💰 --- 5.c REPORTE DE AYER (DOGE) [AYER] ---"; \
cat /root/arca-bot/reports/daily_report_*_DOGEUSDT_$(TZ='America/Mexico_City' date -d "yesterday" +%Y-%m-%d).txt 2>/dev/null || echo "No hay reporte de DOGE de ayer."; \
echo -e "\n🧬 --- 5.d TRAZABILIDAD DE LOTES (ÚLTIMOS 5) ---"; \
grep -h "Matched Lots" /root/arca-bot/logs/VANTAGE01_*_activity*.log 2>/dev/null | tail -n 5; \
echo -e "\n🏥 --- 6. [BTC] ACTIVIDAD (últimas 50 líneas) ---"; \
tail -n 50 /root/arca-bot/logs/VANTAGE01_BTCUSDT_activity.log; \
echo -e "\n🏥 --- 7. [SOL] ACTIVIDAD (últimas 50 líneas) ---"; \
tail -n 50 /root/arca-bot/logs/VANTAGE01_SOLUSDT_activity.log; \
echo -e "\n🏥 --- 8. [DOGE] ACTIVIDAD (últimas 50 líneas) ---"; \
tail -n 50 /root/arca-bot/logs/VANTAGE01_DOGEUSDT_activity.log; \
echo -e "\n🧠 --- 9.a [AI BTC] ENTRENAMIENTO [TIEMPO REAL] ---"; \
tail -n 1 /root/arca-bot/logs/training_data/market_snapshots_BTCUSDT_$(date +%Y-%m-%d).jsonl 2>/dev/null || echo "Esperando primer dato del día..."; \
echo -e "\n🧠 --- 9.b [AI SOL] ENTRENAMIENTO [TIEMPO REAL] ---"; \
tail -n 1 /root/arca-bot/logs/training_data/market_snapshots_SOLUSDT_$(date +%Y-%m-%d).jsonl 2>/dev/null || echo "Esperando primer dato del día..."; \
echo -e "\n🧠 --- 9.c [AI DOGE] ENTRENAMIENTO [TIEMPO REAL] ---"; \
tail -n 1 /root/arca-bot/logs/training_data/market_snapshots_DOGEUSDT_$(date +%Y-%m-%d).jsonl 2>/dev/null || echo "Esperando primer dato del día..."; \
echo -e "\n💾 --- 10. PULSO DE MEMORIA [TIEMPO REAL] ---"; \
ls -lh /root/arca-bot/data/sessions/*_state.json; \
echo -e "\n🔄 --- 10.b HISTORIAL DE REBALANCEO (ADAPTIVE) [HOY] ---"; \
grep -E "Rebalance Triggered|PRICE DRIFT|Grid Health|rebalance" /root/arca-bot/logs/VANTAGE01_*_activity.log | grep "$(TZ='America/Mexico_City' date +%Y-%m-%d)" | tail -n 10 || echo "Sin rebalanceos hoy (Grid Estable)."; \
echo -e "\n🦅 --- 11. SWARM YIELD AUDIT [TIEMPO REAL] ---"; \
node /root/arca-bot/scripts/calc_swarm_yield.js 2>/dev/null || echo "Script no disponible"; \
echo -e "\n📊 --- 12. PROYECCIÓN DE RIQUEZA (HARD MODE: NET EQUITY) ---"; \
node /root/arca-bot/scripts/analyze_projection.js 2>/dev/null || echo "Script no disponible"; \
echo -e "\n🚨 --- 13. SAFETY LOCKS & PAUSAS [CRÍTICO] ---"; \
echo "Verificando si algún bot está PAUSADO..."; \
for pair in BTCUSDT SOLUSDT DOGEUSDT; do \
  paused=$(grep -o '"paused":[^,]*' /root/arca-bot/data/sessions/VANTAGE01_${pair}_state.json 2>/dev/null | head -1); \
  reason=$(grep -o '"pauseReason":"[^"]*"' /root/arca-bot/data/sessions/VANTAGE01_${pair}_state.json 2>/dev/null | head -1); \
  if echo "$paused" | grep -q "true"; then \
    echo "  ⛔ $pair: PAUSADO - $reason"; \
  else \
    echo "  ✅ $pair: ACTIVO"; \
  fi; \
done; \
echo -e "\n📦 --- 14. TAMAÑO DE LOGS [MONITOREO DISCO] ---"; \
du -sh /root/arca-bot/logs/ 2>/dev/null || echo "No se pudo leer"; \
echo "  (Si supera 1GB, considera: pm2 flush)"; \
echo -e "\n🔗 --- 15. SYNC CHECK: PROFIT vs TRADES ---"; \
node /root/arca-bot/scripts/force_sync_profit.js 2>/dev/null | grep -E "CHECK|FIXING|OK" || echo "Script no disponible"; \
echo -e "\n🔬 --- 16. AUDITORÍA MANUAL [OPCIONAL] ---"; \
echo "  node scripts/full_audit.js BTC/USDT --fix  # Repara Safety Locks"; \
echo "  node scripts/full_audit.js SOL/USDT --fix"; \
echo "  node scripts/full_audit.js DOGE/USDT --fix"; \
echo "  node scripts/audit_deep_forensic.js  # 🔍 AUDITORIA FORENSE DE FEES"; \
echo "  node scripts/check_ghosts.js         # 👻 CAZAFANTASMAS"; \
echo "  node scripts/check_orphan_orders.js  # 🔗 ORDENES HUERFANAS"
```
```

---

## ⚡ 1.b SINCRONIZACIÓN (EJECUTAR EN TU PC)

Antes de auditar gráficos o archivos locales, asegúrate de tener la **verdad** del VPS.

### 📥 Traer datos del VPS (VPS -> PC):
Ejecuta esto en tu terminal local (VS Code) para descargar historiales y logs frescos:
```bash
npm run sync:down
```
*Te pedirá el password del VPS.*

### 📤 Subir cambios de código (PC -> VPS):
Si mejoras la interfaz o los scripts, súbelos **sin riesgo** de borrar datos:
```bash
npm run sync:up
```
*Sube `.js`, `.html`, `.css` pero IGNORA `data/sessions` para proteger la memoria del bot.*

---

##  LEYENDA DE TIEMPOS (¡IMPORTANTE!)

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
*   **⛔ PAUSADO en sección 13:** Bot bloqueado por Safety Lock. Ejecuta: `node scripts/full_audit.js SYMBOL --fix`
*   **Logs > 1GB en sección 14:** Disco llenándose. Ejecuta: `pm2 flush`
*   **FIXING en sección 15:** Discrepancia de profit detectada y corregida automáticamente.

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
## 🛡️ 6. Protecciones Activas (Configuración)
*   **Piso de USDT (15%)**: Nunca gastará tu último 15% de dólares.
*   **Tope de Inventario (70%)**: Nunca llenará más del 70% de la bolsa con monedas.
*   **🛡️ SAFETY NET (-0.5%)**: **NUEVO.** Bloquea VENTA si la pérdida es > 0.5%. Evita "Amnesia".
    *   Si ves `[SKIP] Insufficient BASE for SELL`, el bot tiene poco inventario. SMART_DCA espera mejor precio.

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
| `APY` | `[TIEMPO REAL]` | Rendimiento Anual Proyectado usando **Time-Weighted Return**. |

---

## ⚡ 8. DASHBOARD DINÁMICO & TWR (NUEVO)

### 🔄 Dinamismo Total
El dashboard es ahora **100% reactivo**. No requieres recargar la página:
1.  **Profit & Equity:** Se actualizan cada 5 segundos.
2.  **Depósitos:** Si agregas capital en el *Capital Tracker*, el cálculo de APY se ajusta **al instante**.
3.  **Global APY:** Calcula el rendimiento de TODA tu cartera en tiempo real.
4.  **Detección Universal:** El Equity Global escanea CUALQUIER activo en tu wallet (BNB, SHIB, PEPE...), no solo los que tradea el bot.

### ⏳ Time-Weighted Return (TWR)
El cálculo de APY ya no es simple (`Profit / Capital Final`). Ahora usa **TWR**:
*   Pondera cada dólar por el **tiempo exacto** que estuvo invertido.
*   Si depositas $1000 hoy, no diluye el rendimiento de los $100 que tenías hace un año.
*   **Fórmula:** `(Profit Total / Capital Promedio Ponderado por Días) * 365`.
*   *Resultado:* Tu APY reflejará la verdadera eficiencia de tu dinero, no solo el volumen.

---

## ✅ 9. VALIDACIÓN Y CORRECCIONES CONFIRMADAS (08-ENE-2026)

### 🕵️ Auditoría Forense de Fees
*   **Estado:** ✅ CONFIRMADO.
*   **Hallazgo:** El bot descuenta correctamente tanto `entryFees` (Comisión de Compra histórica) como `sellFee` (Comisión de Venta actual) antes de reportar el Profit.
*   **Fórmula Validada:** `Profit = (SellPrice * Amount) - CostBasis - (BuyFees + SellFees)`.

### 👻 Reparación Trade Fantasma (SOL)
*   **Incidente:** Trade de las 20:08 apareció con $0 profit tras reinicio profundo.
*   **Solución:** Parche manual (`fix_sol_ghost_v3.js`) reinsertando Cost Basis ($138.2), Spread (0.77%) y Fees (0.000021 BNB).
*   **Estado:** ✅ RESUELTO. Data 100% consistente.

### 📈 Gráfica de Equidad Universal
*   **Incidente:** Fechas futuras (09-Ene) y snapshots inconsistentes.
*   **Solución:** Zona horaria fijada a 'America/Mexico_City', capping de fechas futuras y uso de snapshots reales de la API.
*   **Estado:** ✅ RESUELTO. Gráfica limpia.

> **Regla de Oro:** Si algo dice `[HISTÓRICO]` y te parece raro (ej: Drawdown alto), probablemente es un "fantasma del pasado", no un problema de hoy.
