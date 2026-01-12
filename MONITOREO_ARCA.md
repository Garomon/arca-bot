# 🦅 Guía de Monitoreo Maestro - Arca Bot (BTC, SOL & DOGE) v6.0
*(Actualizado: 2026-01-12 - Life Coach System + RPG Progression + Wealth Roadmap)*

**IP VPS:** `167.71.1.124`
**Usuario:** `root`
**Password:** `7q2$TA/nVP!CsFi`

---

## 🧬 PROMPT MAESTRO (CONTEXTO PARA IA)

```
CONTEXTO DEL PROYECTO ARCA - GAROSSA WEALTH SYSTEM

OBJETIVO: Guiar a Garossa desde ~$1,300 USD hasta $1,000,000 USD (élite millonaria)
ESTRATEGIA: Grid Trading + Reinversión 100% + Inyección $500/mes + Escalamiento progresivo
TIMELINE: 7-10 años de disciplina consistente

ESTADO ACTUAL (Enero 2026):
- Equity: ~$1,300 USD
- Profit Realizado: ~$29 USD
- APY Real: ~34% (TWR)
- Días Activo: ~40 días
- Nivel RPG: 8 (Señor de la Forja)
- Misión Actual: Cruzar el Valle ($1,500)

BOTS ACTIVOS:
- BTC/USDT (Puerto 3000) - Grid trading con SMART_DCA
- SOL/USDT (Puerto 3001) - Grid trading con SMART_DCA
- DOGE/USDT (Puerto 3004) - Grid trading con SMART_DCA

SISTEMAS IMPLEMENTADOS:
1. Grid Bots - Trading automático 24/7
2. Dashboard - Monitoreo en tiempo real (http://167.71.1.124:3000)
3. Life Coach - Guía gamificada hacia la riqueza
4. RPG Progression - Sistema de niveles y misiones
5. Capital Tracker - Seguimiento de depósitos
6. Profit Charts - Visualización de ganancias por bot

COMPROMISO DEL USUARIO:
- Depositar $500 USD/mes (sin falta)
- NO retirar capital (manos de diamante)
- Seguir las misiones del Life Coach
- Escalar estrategias según nivel

CONVERSIÓN MXN:
- Usa Binance USDT/MXN rate (~18 MXN/USD)
- NO usar rate bancario (20.5 es incorrecto)

SI EL BOT ESTÁ PAUSADO (SAFETY LOCK):
- Ejecutar: node scripts/full_audit.js SYMBOL/USDT --fix
- Reiniciar: pm2 restart bot-SYMBOL
```

---

## 🎮 SISTEMA RPG - PROGRESIÓN DE NIVELES

### Niveles y Títulos
| Nivel | Título | XP Requerido | Equity Aprox |
|-------|--------|--------------|--------------|
| 1-3 | Aprendiz del Grid | 0-1500 | $0-500 |
| 4-6 | Guerrero del Spread | 1500-3000 | $500-1500 |
| 7-9 | Señor de la Forja | 3000-4500 | $1500-3000 |
| 10-12 | Maestro del Compuesto | 4500-6000 | $3000-5000 |
| 13-15 | Arquitecto de Riqueza | 6000-7500 | $5000-10000 |
| 16-20 | Barón del Capital | 7500-10000 | $10000-25000 |
| 21-25 | Duque de las Finanzas | 10000-12500 | $25000-50000 |
| 26-30 | Príncipe del Mercado | 12500-15000 | $50000-100000 |
| 31-35 | Rey del Patrimonio | 15000-17500 | $100000-250000 |
| 36-40 | Emperador Financiero | 17500-20000 | $250000-500000 |
| 41-45 | Leyenda Viviente | 20000-22500 | $500000-750000 |
| 46-50 | Titán Inmortal | 22500+ | $750000-1000000+ |

### Recompensas de Vida (Milestones)
| Equity | Recompensa Sugerida |
|--------|---------------------|
| $1,500 | AirPods Pro |
| $3,000 | iPhone nuevo |
| $5,000 | MacBook / Viaje nacional |
| $10,000 | Reloj de lujo / Moto |
| $25,000 | Auto usado premium |
| $50,000 | Enganche de depa |
| $100,000 | Auto nuevo / Inversión inmobiliaria |
| $250,000 | Propiedad completa |
| $500,000 | Casa de tus sueños |
| $1,000,000 | LIBERTAD FINANCIERA |

---

## 📈 ESTRATEGIAS DESBLOQUEADAS POR NIVEL

| Nivel/Equity | Estrategia | Descripción |
|--------------|------------|-------------|
| 0+ | Grid Trading | Base automática 24/7 |
| 0+ | Reinversión 100% | Todo el profit se queda |
| 0+ | Inyección $500/mes | Acelera el compound |
| Lvl 5 / $3K | Staking/Earn | 8-12% APY en Binance Earn |
| Lvl 7 / $5K | DCA Blue Chips | Acumula BTC/ETH gradualmente |
| Lvl 10 / $10K | ETFs (VOO/QQQ) | Diversifica fuera de crypto |
| Lvl 12 / $15K | Apalancamiento 2x | Solo 20% del capital MAX |
| Lvl 15 / $25K | REITs/Real Estate | Ingreso pasivo inmobiliario |

---

## 🎯 LIFE COACH - MISIONES ACTIVAS

### Misiones Recurrentes
1. **Inyección Mensual** - Meta: $500 USD/mes (+500 XP)
2. **Manos de Diamante** - No retires capital (+50 XP/día)
3. **Check-in Diario** - Revisa el dashboard (+10 XP/día)

### Side Quests (Educación)
- Aprende sobre interés compuesto (+200 XP)
- Estudia Dollar Cost Averaging (+200 XP)
- Investiga sobre Staking (+250 XP)
- Lee "El Inversor Inteligente" (+500 XP)
- Aprende sobre ETFs (+300 XP)

### Endpoints del Life Coach
- GET `/api/life-coach` - Estado completo del coach
- POST `/api/life-coach/complete-quest` - Marcar quest completada

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

---

## ⚡ 1.b SINCRONIZACIÓN (EJECUTAR EN TU PC)

Antes de auditar gráficos o archivos locales, asegúrate de tener la **verdad** del VPS.

### 📥 Traer datos del VPS (VPS -> PC):
```bash
npm run sync:down
```

### 📤 Subir cambios de código (PC -> VPS):
```bash
npm run sync:up
```

---

## 🌐 URLS DEL SISTEMA

| Recurso | URL |
|---------|-----|
| Dashboard Principal | http://167.71.1.124:3000 |
| API BTC Status | http://167.71.1.124:3000/api/status |
| API SOL Status | http://167.71.1.124:3001/api/status |
| API DOGE Status | http://167.71.1.124:3004/api/status |
| Life Coach API | http://167.71.1.124:3000/api/life-coach |
| Profit History | http://167.71.1.124:3000/api/profit-history |
| Equity Snapshots | http://167.71.1.124:3000/api/equity-snapshots |

---

## 🚦 2. Semáforo de Salud

### 🟢 SANO (Todo bien)
- **PM2 Status:** Los 3 bots dicen `online` en verde
- **Actividad:** Logs muestran timestamps recientes (últimos 5 min)
- **Logs:** Ves `[AI] ANALYZING`, `[INTEL] Regime: ...`, `[SYNC] STATE IS IN SYNC`

### 🟡 ALERTA (Normal, no emergencia)
- `🛡️ BUY BLOCKED: USDT_FLOOR`: Protegiendo liquidez
- `Regime: WEAK_BEAR`: Modo defensivo (esperado en bajada)
- `BLOCKED_BY_SELL_WALL`: Esperando mejor precio

### 🔴 PELIGRO (Acción Inmediata)
- **Logs vacíos o timestamps viejos:** Bot muerto
- **PM2 dice `stopped` o `errored`:** Reiniciar
- **⛔ PAUSADO en sección 13:** Safety Lock → `node scripts/full_audit.js SYMBOL --fix`
- **Logs > 1GB:** Ejecutar `pm2 flush`

---

## 🆘 3. Comandos de Emergencia

**A) Resucitar los bots:**
```bash
/root/arca-bot/scripts/update_all_bots.sh
```

**B) Reparar Safety Lock:**
```bash
cd /root/arca-bot
node scripts/full_audit.js BTC/USDT --fix
node scripts/full_audit.js SOL/USDT --fix
node scripts/full_audit.js DOGE/USDT --fix
pm2 restart all
```

**C) Ver errores:**
```bash
grep "ERROR" /root/arca-bot/logs/VANTAGE01_BTCUSDT_activity.log | tail -n 20
```

---

## 🧹 4. Comandos de Limpieza

### Resetear contador de restarts:
```bash
pm2 reset all
```

### Limpiar logs (si disco lleno):
```bash
pm2 flush
```

### Borrar Crash Logs:
```bash
echo "" > /root/arca-bot/logs/pm2_crash.log
```

---

## 💰 5. Auditorías de Profit

### Auditoría Rápida:
```bash
cd /root/arca-bot && node scripts/raw_cashflow_audit.js
```

### Auditoría Completa con SPREAD_MATCH:
```bash
node scripts/full_audit.js BTC/USDT
node scripts/full_audit.js SOL/USDT
node scripts/full_audit.js DOGE/USDT
```

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

## 🛡️ 6. Protecciones Activas

| Protección | Valor | Descripción |
|------------|-------|-------------|
| Piso USDT | 15% | Nunca gasta el último 15% |
| Tope Inventario | 70% | Máximo 70% en monedas |
| Safety Net | -0.5% | Bloquea venta con pérdida > 0.5% |
| SMART_DCA | Auto | Espera mejor precio si está cargado |

---

## 📊 7. Entendiendo el Dashboard

### Métricas Principales
| Campo | Descripción |
|-------|-------------|
| Total Realizado | Profit confirmado (vendido) |
| Ganancia Neta | Profit - Pérdidas flotantes |
| Flotante | Ganancia/pérdida no realizada |
| Equity Global | USDT + valor de todos los activos |
| ROI Trading | Eficiencia del bot |
| APY Global | Rendimiento anualizado (TWR) |

### Conversión MXN
- El dashboard usa **Binance USDT/MXN** (~18 MXN)
- NO el rate bancario (20.5 es incorrecto)
- Debe coincidir con lo que muestra Binance

---

## 📅 8. Checklist Diario del Trader

### Mañana (5 min):
- [ ] Revisar dashboard - ¿Bots online?
- [ ] Verificar profit de ayer
- [ ] Checar misiones del Life Coach

### Mensual:
- [ ] Depositar $500 USD (CRÍTICO)
- [ ] Registrar en Capital Tracker
- [ ] Revisar progreso hacia milestone

### Cuando hay problemas:
- [ ] Ejecutar comando maestro
- [ ] Si hay Safety Lock → full_audit.js --fix
- [ ] Si hay errores repetidos → revisar logs

---

## 🎯 9. Tu Roadmap Personal

```
ACTUAL:     $1,300 USD (Nivel 8)
            ↓
MILESTONE:  $1,500 USD (Cruzar el Valle) - ~$200 más
            ↓
AÑO 1:      $8,000 - $12,000 USD
            ↓
AÑO 3:      $30,000 - $50,000 USD
            ↓
AÑO 5:      $80,000 - $120,000 USD
            ↓
AÑO 7:      $200,000 - $300,000 USD
            ↓
AÑO 10:     $500,000 - $1,000,000 USD 🎉
```

**Fórmula del Éxito:**
```
TÚ: $500/mes + NO tocar
SISTEMA: Trading 24/7 + Compound + Guía
RESULTADO: Libertad financiera en 7-10 años
```

---

## ✅ 10. Registro de Actualizaciones

| Fecha | Versión | Cambios |
|-------|---------|---------|
| 2026-01-12 | v6.0 | Life Coach, RPG System, Prompt Maestro, MXN fix |
| 2026-01-10 | v5.4 | Safety Lock Detection, Log Monitor |
| 2026-01-08 | v5.3 | Fee Forensics, Ghost Trade Repair |
| 2025-12-31 | v5.0 | DOGE bot added, Multi-bot dashboard |

---

*"El sistema trabaja por ti. Tú trabajas para alimentarlo."* 💎🦅
