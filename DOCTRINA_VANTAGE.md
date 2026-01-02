# DOCTRINA VANTAGE: Protocolos de Seguridad y Operación
> "La supervivencia del capital es la prioridad número uno."

Este documento define las reglas inmutables que gobiernan a los bots Arca Garossa. Cualquier modificación del código debe respetar estos principios.

## 🛡️ PROTOCOLO SAFETY NET (Red de Seguridad)
**Estado:** ACTIVO
**Implementación:** `grid_bot.js` -> `checkSafetyNet()`
**Tolerancia de Pérdida:** `-0.5%`

### La Regla de Oro
El bot tiene **PROHIBIDO** ejecutar cualquier orden de VENTA que resulte en una pérdida realizada mayor al 0.5% (slippage/fees).

- **Si el precio cae por debajo del costo promedio:** El bot debe HOLDear (sostener) la posición.
- **Si el estado se corrompe (Amnesia):** El bot debe bloquearse hasta que se ejecute una auditoría (`node scripts/full_audit.js PAIR --fix`).
- **Excepción:** Stop Loss manual ejecutado por el humano.

### Evidencia en Logs
El sistema debe dejar rastro claro de estas decisiones:
- `🛡️ SAFETY NET: Blocked Sell...` -> Indica que el sistema funcionó y salvó capital.
- `AMNESIA PREVENTED` -> Indica que el bot detectó falta de datos y se protegió a sí mismo.

## 🩺 PROTOCOLO DE AUDITORÍA (Auto-Reparación)
Cuando el inventario del bot (State) difiere del real (Binance):
1. No adivinar.
2. Ejecutar `node scripts/full_audit.js PAIR --fix`
3. La "Verdad" es siempre el balance del Exchange.

---
*Este documento debe ser consultado por cualquier agente de IA antes de proponer cambios críticos a la lógica de venta.*
