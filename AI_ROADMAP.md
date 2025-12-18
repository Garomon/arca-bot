# 🧠 ARCA BOT - ROADMAP DE EVOLUCIÓN (AI STRATEGY)

Este documento detalla la estrategia técnica y filosofía para la integración de Inteligencia Artificial en el Grid Bot.

---

## 🟢 FASE 1: DIAGNÓSTICO Y MONITOREO (✅ COMPLETADA)
**Objetivo:** Asegurar que el "cuerpo" del bot sea robusto antes de darle un "cerebro".
*   ✅ Logs estructurados con rotación.
*   ✅ Comandos maestros de monitoreo (`monitor_arca`).
*   ✅ Detección de reinicios y anomalías.

## 🟢 FASE 2: INFRAESTRUCTURA DE DATOS (✅ COMPLETADA)
**Objetivo:** Crear la memoria histórica para entrenar a la futura IA.
*   ✅ **Módulo "Collector" (`data_collector.js`):** Guarda "fotos" del mercado cada minuto.
*   ✅ **Datos Capturados:** 
    *   *Inputs:* Precio, RSI, Volatilidad, Order Book Pressure, Fear & Greed.
    *   *Labels:* La decisión que tomó el bot (Score + Recomendación).
*   ✅ **Almacenamiento:** Archivos ligeros `.jsonl` en `logs/training_data/`.

## 🛡️ FASE 1.5: CAPA DE DEFENSA ACTIVA (✅ COMPLETADA)
**Objetivo:** Sobrevivir a la manipulación de mercado ("Mechazos") sin IA predictiva.
*   ✅ **Anti-Mechazo:** Expansión automática de la red (hasta 10% rango) en Volatilidad Extrema.
*   ✅ **Protección Fin de Semana:** Reducción de riesgo automática sábados y domingos (Liquidez baja).
*   ✅ **Corte de Órdenes:** Reducción del 50% de nuevas órdenes durante crisis para preservar capital.

---

## 🟡 FASE 3: EL MODELO CENTAURO (PRÓXIMAMENTE - Enero 2026)
**Filosofía:** "Human-in-the-loop" (El humano supervisa, la máquina sugiere).
**Estrategia:** No reemplazamos al bot matemático. Lo aumentamos.

### 1. Entrenamiento (Offline) ⛏️
*   **Fuente:** Usaremos las semanas de datos acumulados en Fase 2.
*   **Tecnología:** Python (XGBoost / LSTM).
*   **Pregunta al Modelo:** "Dadas estas condiciones (RSI, Miedo, Volatilidad), ¿cuál es la probabilidad de que el precio suba en los próximos 15 mins?"

### 2. Inferencia (Online) 🔮
*   **Integración:** El bot consultará a un microservicio de IA antes de abrir operación.
*   **El "Consejero":** 
    *   Si el algoritmo matemático dice "COMPRA" y la IA dice "Probabilidad 90%" -> **Se aumenta el tamaño de la orden (Doble Confianza).**
    *   Si el algoritmo dice "COMPRA" y la IA dice "Probabilidad 20%" -> **Se reduce el tamaño o se cancela (Protección).**

---

## 🔴 FASE 4: SUPER-INTELIGENCIA (LARGO PLAZO)
**Concepto:** Reinforcement Learning (Aprendizaje por Refuerzo).
*   **Evolución:** Una vez que el Modelo Centauro sea estable, dejaremos que una IA "juegue" millones de simulaciones contra sí misma usando los datos históricos.
*   **Objetivo:** Descubrir estrategias no lineales que un humano no podría programar (ej: patrones complejos en el Order Book).

---

## 🚫 EXCEPCIÓN: CONTEXTO GEOPOLÍTICO (MANUAL)
**Decisión Estratégica:** NO usaremos LLMs (ChatGPT) para leer noticias automáticamente en Fase 3.
*   **Razón:** Riesgo de "Fake News" y alucinaciones.
*   **Solución:** El operador (Tú) mantiene el control del botón "Geopolítica" en la UI.
    *   *Ejemplo:* Si estalla una guerra, TÚ activas "Riesgo Geopolítico Alto". La IA se adapta a ese input manual, pero no decide por sí misma sobre noticias externas.

---
**📅 ESTADO ACTUAL:** Recolectando datos (Esperando ~2 semanas de historial).
