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
echo -e "\n🔰 --- [BTC] STARTUP LOGS (Primeras 100 lineas) ---"; \
head -n 100 /root/arca-bot/logs/VANTAGE01_BTCUSDT_activity.log; \
echo -e "\n🔰 --- [SOL] STARTUP LOGS (Primeras 100 lineas) ---"; \
head -n 100 /root/bot-sol/logs/VANTAGE01_SOLUSDT_activity.log; \
echo -e "\n💰 --- [BTC] REPORTE DE AYER ---"; \
cat /root/arca-bot/reports/daily_report_$(date -d "yesterday" +%Y-%m-%d).txt; \
echo -e "\n💰 --- [SOL] REPORTE DE AYER ---"; \
cat /root/bot-sol/reports/daily_report_$(date -d "yesterday" +%Y-%m-%d).txt; \
echo -e "\n🏥 --- [BTC] ACTIVIDAD RECIENTE (Ultimas 100 lineas) ---"; \
tail -n 100 /root/arca-bot/logs/VANTAGE01_BTCUSDT_activity.log; \
echo -e "\n🏥 --- [SOL] ACTIVIDAD RECIENTE (Ultimas 100 lineas) ---"; \
tail -n 100 /root/bot-sol/logs/VANTAGE01_SOLUSDT_activity.log
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
