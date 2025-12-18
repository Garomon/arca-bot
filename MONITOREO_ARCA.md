# 🦅 Guía de Monitoreo Maestro - Arca Bot (BTC & SOL)

**IP VPS:** `167.71.1.124`  ssh root@167.71.1.124       
**Usuario:** `root`
**Password:** 7q2$TA/nVP!CsFi

---

## ⚡ 1. COMANDO MAESTRO (EL ÚNICO QUE NECESITAS)
Este comando descarga toda la verdad: **Inicios de sesión** (Startup), **Reporte de ganancias de ayer** y **Actividad detallada reciente**.

Copia y pega TODO el bloque gris en tu terminal SSH:

```bash
clear; \
echo -e "\n🚦 --- 1. STATUS DE PROCESOS (PM2) ---"; \
pm2 list; \
echo -e "\n💻 --- 2. SALUD DEL SERVIDOR (Disco/RAM) ---"; \
df -h | grep -E '^/dev/root|Filesystem'; free -m | grep Mem; \
echo -e "\n🕵️ --- 3. ¿HUBO REINICIOS HOY? (Archivos 'rotados') ---"; \
ls -lh /root/arca-bot/logs/VANTAGE* /root/bot-sol/logs/VANTAGE* | grep "$(date +%Y-%m-%d)"; \
echo -e "\n🚨 --- 4. ERRORES RECIENTES (Últimas 24h) ---"; \
grep -r "ERROR" /root/arca-bot/logs/ /root/bot-sol/logs/ | tail -n 5; \
echo -e "\n☠️ --- 4.b CRASH LOGS (¿Por qué se reinicia?) ---"; \
cat /root/arca-bot/logs/pm2_crash.log /root/bot-sol/logs/pm2_crash.log 2>/dev/null | tail -n 10 || echo "Sin crashes registrados hoy (¡Bien!)"; \
echo -e "\n💰 --- 5. REPORTE DE AYER ---"; \
cat /root/arca-bot/reports/daily_report_*_$(date -d "yesterday" +%Y-%m-%d).txt 2>/dev/null || echo "No hay reporte de BTC de ayer."; \
echo -e "\n💰 --- 5.b REPORTE DE AYER (SOL) ---"; \
cat /root/bot-sol/reports/daily_report_*_$(date -d "yesterday" +%Y-%m-%d).txt 2>/dev/null || echo "No hay reporte de SOL de ayer."; \
echo -e "\n🏥 --- 6. [BTC] ACTIVIDAD AHORA MISMO ---"; \
tail -n 300 /root/arca-bot/logs/VANTAGE01_BTCUSDT_activity.log; \
echo -e "\n🏥 --- 7. [SOL] ACTIVIDAD AHORA MISMO ---"; \
tail -n 300 /root/bot-sol/logs/VANTAGE01_SOLUSDT_activity.log; \
echo -e "\n🧠 --- 8. [AI BTC] ENTRENAMIENTO (Último Dato) ---"; \
tail -n 1 /root/arca-bot/logs/training_data/market_snapshots_$(date +%Y-%m-%d).jsonl 2>/dev/null || echo "Esperando primer dato del día..."; \
echo -e "\n🧠 --- 9. [AI SOL] ENTRENAMIENTO (Último Dato) ---"; \
tail -n 1 /root/bot-sol/logs/training_data/market_snapshots_$(date +%Y-%m-%d).jsonl 2>/dev/null || echo "Esperando primer dato del día..."; \
echo -e "\n💾 --- 10. PULSO DE MEMORIA (Archivos de Estado) ---"; \
ls -lh /root/arca-bot/data/sessions/*_state.json /root/bot-sol/data/sessions/*_state.json
```

---

## 🚦 2. Semáforo de Salud

Una vez que corras el comando, busca esto:

### 🟢 SANO (Todo bien)
*   **Startup:** Ves mensajes de `[CONFIG] Loaded...` o `All systems normal`.
*   **Actividad:** Ves `[AI] ANALYZING`, `[INTEL] Regime: ...`, o logs de `ORDER_PLACED`.
*   **Sync:** `Active Orders` coincide con lo que esperas.

### 🟡 ALERTA (Ojo)
*   `High drawdown`: El precio bajó, el bot está aguantando. Normal en bajadas.
*   `🛡️ BUY BLOCKED: USDT_FLOOR`: El bot dejó de comprar para proteger tu efectivo. **Bueno.**
*   `Regime: BEAR`: El bot operará menos y venderá menos. **Esperado.**

### 🔴 PELIGRO (Acción Inmediata)
*   **Logs vacíos:** Si el comando no muestra nada nuevo (hora vieja).
*   **Errores:** `ECONNRESET`, `Binance API Down`, `CRITICAL ERROR`.
*   **Rebooting:** Si ves que el bot se reinicia a cada rato en el Startup.

---

## 🆘 3. Comandos de Emergencia

Si el semáforo está en **ROJO**:

**A) Resucitar los bots (Actualizar y Reiniciar):**
```bash
/root/arca-bot/scripts/update_all_bots.sh
```

**B) Ver si los procesos están muertos:**
```bash
pm2 list
```
*(Deben decir "online" en verde).*

**C) Buscar errores específicos:**
```bash
grep "ERROR" /root/arca-bot/logs/VANTAGE01_BTCUSDT_activity.log
```

---

## 🛡️ NOTA: Tus Protecciones Activas
*   **Piso de USDT (15%)**: Nunca gastará tu último 15% de dólares.
*   **Tope de Inventario (70%)**: Nunca llenará más del 70% de la bolsa con monedas.
