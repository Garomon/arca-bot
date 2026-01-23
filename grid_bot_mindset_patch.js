// Mindset Anti-Miedo Endpoint Patch
// This adds a /api/mindset endpoint to provide psychological support during dips

const fs = require("fs");
let code = fs.readFileSync("grid_bot.js", "utf8");

const mindsetEndpoint = `

// === MINDSET ANTI-MIEDO SYSTEM ===
app.get("/api/mindset", async (req, res) => {
  try {
    const balance = await getBalance();
    const totalEquity = balance.totalEquity || 0;
    const totalDeposited = 1525.74; // Update this or fetch from deposits.json
    const realizedProfit = 38.23; // This should be fetched from state
    const unrealizedPnL = totalEquity - totalDeposited - realizedProfit;
    const flotantePct = totalEquity > 0 ? (unrealizedPnL / totalEquity * 100) : 0;
    
    let message, emoji, perspective, action;
    
    if (unrealizedPnL >= 0) {
      emoji = "🟢";
      message = "Todo en verde. El bot está trabajando.";
      perspective = "Disfruta el momento, pero prepárate para dips futuros.";
      action = "Considera inyectar más capital para acelerar el compounding.";
    } else if (flotantePct > -2) {
      emoji = "🟡";
      message = "Dip menor (-" + Math.abs(flotantePct).toFixed(1) + "%). Ruido normal.";
      perspective = "Esto se recupera en 1-3 días típicamente.";
      action = "No hagas nada. El bot maneja esto automáticamente.";
    } else if (flotantePct > -5) {
      emoji = "🟠";
      message = "Dip moderado (-" + Math.abs(flotantePct).toFixed(1) + "%). El bot compró en descuento.";
      perspective = "Tienes lotes baratos que generarán profit cuando suba.";
      action = "Si tienes capital extra, este es buen momento para inyectar.";
    } else if (flotantePct > -10) {
      emoji = "🔴";
      message = "Dip fuerte (-" + Math.abs(flotantePct).toFixed(1) + "%). HOLD, no pánico.";
      perspective = "Con $1M este dip sería -$" + (Math.abs(flotantePct) * 10000).toFixed(0) + ". Es el mismo juego.";
      action = "Diamond hands. No vendas. El mercado siempre recupera.";
    } else {
      emoji = "💎";
      message = "Crash severo (-" + Math.abs(flotantePct).toFixed(1) + "%). Diamond hands activadas.";
      perspective = "Los millonarios se hacen en crashes comprando, no vendiendo.";
      action = "Si puedes, inyecta. Si no, solo espera. NUNCA vendas en pánico.";
    }
    
    // Future context
    const scales = [
      { capital: 10000, flotante: Math.abs(flotantePct) * 100 },
      { capital: 100000, flotante: Math.abs(flotantePct) * 1000 },
      { capital: 1000000, flotante: Math.abs(flotantePct) * 10000 }
    ];
    
    res.json({
      currentEquity: totalEquity.toFixed(2),
      unrealizedPnL: unrealizedPnL.toFixed(2),
      flotantePct: flotantePct.toFixed(2),
      realizedProfit: realizedProfit.toFixed(2),
      emoji,
      message,
      perspective,
      action,
      futureScales: scales,
      mantra: "El flotante es temporal. El profit realizado es permanente. El mercado siempre sube a largo plazo.",
      reminder: "No mires dólares, mira porcentajes. -2% es -2% ya sea -$30 o -$30,000."
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

`;

// Find a good place to insert (before the last app.listen or at the end of endpoints)
const insertBefore = code.lastIndexOf("app.listen");
if (insertBefore > 0) {
  code = code.slice(0, insertBefore) + mindsetEndpoint + "\n" + code.slice(insertBefore);
  fs.writeFileSync("grid_bot.js", code);
  console.log("✅ Mindset endpoint added successfully\!");
} else {
  console.log("❌ Could not find insertion point");
}
