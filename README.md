# 🦈 VANTAGE QUANTUM BOT v3.0.0
## Arca Financiera Garossa - Multi-Asset Grid Trading System

> *"Acumular cuando todos dudan, mantener cuando todos temen"*

![Dashboard Preview](assets/dashboard-preview.png)

---

## 🚀 Overview

**Vantage Quantum** es un bot de grid trading de alta frecuencia con **Inteligencia de Mercado Compuesta**. A diferencia de los grid bots "tontos", este sistema usa análisis técnico, contexto geopolítico, y presión del order book para adaptar su comportamiento en tiempo real.

**Versión:** `3.0.0`  
**Pares Soportados:** BTC/USDT, SOL/USDT, DOGE/USDT  
**Licencia:** Privada (Arca Financiera Garossa)

---

## ✨ Características Principales

### 🧠 1. Shark Mode - Order Book Intelligence
El bot analiza la profundidad del Order Book en tiempo real:
- **Sell Wall (Presión < 0.3):** Pausa compras para evitar caídas
- **Buy Wall (Presión > 3.0):** Pausa ventas para aprovechar subidas
- **Resultado:** Opera *con* las ballenas, no contra ellas

### 📊 2. Detección de Régimen de Mercado
Sistema de 5 EMAs adaptativo:
- **TREND_UP:** Mercado alcista - Grid agresivo
- **TREND_DOWN:** Mercado bajista - Grid defensivo  
- **RANGE_BOUND:** Lateral - Grid optimizado para scalping

### 🛡️ 3. USDT Floor Protection
Protección automática del capital base:
- Mantiene un mínimo de USDT como "floor" de seguridad
- Pausa compras automáticamente cuando se agota el presupuesto
- Evita over-exposure en un solo activo

### 💰 4. Contabilidad Avanzada (LIFO)
- Tracking de lotes individuales por precio de compra
- Cálculo de profit real por transacción
- Persistencia de estado entre reinicios
- Reportes diarios automáticos

### 🌍 5. Contexto Geopolítico
Ajusta agresividad basado en eventos macro:
- **INFLATIONARY_ACCUMULATION:** Modo acumulación ("Cash is Trash")
- **RISK_OFF:** Reduce exposición en eventos de riesgo
- **LIQUIDITY_CRISIS:** Pausa total si hay crisis de liquidez

### 📈 6. Dashboard Profesional
- WebSocket en tiempo real (sub-segundo)
- Visualización de Order Book
- Log de transacciones con highlighting
- Panel de inventario LIFO
- Métricas: RSI, EMA, Volatilidad, Presión

---

## 🏗️ Arquitectura

```
vantage-bot/
├── grid_bot.js          # Core del bot + API WebSocket
├── adaptive_helpers.js  # Funciones de análisis técnico
├── data_collector.js    # Recolección de datos para ML
├── ecosystem.config.js  # Configuración PM2 (multi-bot)
├── public/
│   ├── index.html       # Dashboard UI principal
│   ├── main.js          # Lógica del cliente
│   └── style.css        # Estilos neon/dark mode
├── data/
│   └── sessions/        # Estado persistente por par
└── scripts/             # Utilidades (auditoría, reset)
```

---

## ⚡ Quick Start

### Prerrequisitos
- Node.js v18+
- API Key de Binance (Spot Trading habilitado)

### Instalación

```bash
# Clonar repositorio
git clone https://github.com/garossa/vantage-bot.git
cd vantage-bot

# Instalar dependencias
npm install

# Configurar credenciales
cp .env.example .env
# Editar .env con tus API keys
```

### Configuración `.env`
```env
BINANCE_API_KEY=tu_api_key
BINANCE_SECRET=tu_api_secret
```

### Ejecución

```bash
# Desarrollo (single bot)
npm run dev

# Producción con PM2 (recomendado)
pm2 start ecosystem.config.js

# Ver logs
pm2 logs bot-btc
```

---

## 🎛️ Configuración

Principales parámetros en `grid_bot.js`:

```javascript
const CONFIG = {
    pair: 'BTC/USDT',
    tradingFee: 0.001,        // 0.1% (o 0.00075 con BNB)
    gridSpacing: 0.003,       // 0.3% spacing base
    gridCount: 16,            // Líneas del grid
    usdtFloor: 50,            // USDT mínimo protegido
    minProfitMargin: 0.002,   // Profit mínimo por trade
};
```

---

## 📊 Monitoreo

### Dashboard Web
Accede al dashboard en `http://localhost:3000` (o tu IP:Puerto del VPS)

### Comando de Monitoreo Rápido
```bash
# Ver estado de todos los bots
pm2 status

# Monitoreo detallado
pm2 monit
```

### Archivo de Monitoreo
Consulta `MONITOREO_ARCA.md` para comandos completos de SSH y debugging.

---

## 📜 Changelog Reciente

### v3.0.0 (Diciembre 2024)
- **[NEW]** Sistema multi-bot (BTC + SOL + DOGE simultáneos)
- **[NEW]** Weekly Metrics: Time Out of Range, Inventory Report
- **[NEW]** USDT Floor Protection inteligente
- **[NEW]** Contexto geopolítico con zonas macro dinámicas
- **[NEW]** Dashboard con inventario LIFO visual
- **[FIX]** Corrección de double-counting en profit
- **[FIX]** False positive en IMBALANCE_LOW_BUYS

### v2.1.0
- **[NEW]** Shark Logic con Order Book Pressure
- **[FIX]** Profit Math retroactivo

---

## 🤖 Soporte Multi-Bot

El sistema soporta múltiples instancias operando diferentes pares:

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'bot-btc',
      script: 'grid_bot.js',
      env: { PAIR: 'BTC/USDT', PORT: 3000 }
    },
    {
      name: 'bot-sol', 
      script: 'grid_bot.js',
      env: { PAIR: 'SOL/USDT', PORT: 3001 }
    },
    {
      name: 'bot-doge', 
      script: 'grid_bot.js',
      env: { PAIR: 'DOGE/USDT', PORT: 3002 }
    }
  ]
};
```

---

## ⚠️ Disclaimer

Este bot está diseñado para uso personal de Arca Financiera Garossa. El trading de criptomonedas conlleva riesgos significativos. Usa bajo tu propia responsabilidad.

---

*Built with ❤️ by Antigravity para Arca Financiera Garossa*