const fs = require("fs");
let code = fs.readFileSync("grid_bot.js", "utf8");

// Check if already has inventoryHealth
if (code.includes("inventoryHealth")) {
    console.log("inventoryHealth already exists, skipping grid_bot.js");
} else {
    // Add inventory health calculation after unrealizedPnL
    const oldCode1 = `const currentValue = totalAmount * (state.currentPrice || 0);
        const unrealizedPnL = currentValue - totalCost;

        // Get Global Equity from cached financials`;

    const newCode1 = `const currentValue = totalAmount * (state.currentPrice || 0);
        const unrealizedPnL = currentValue - totalCost;

        // Calculate inventory health (lots in profit vs loss)
        const currentPrice = state.currentPrice || 0;
        let lotsInProfit = 0;
        let lotsInLoss = 0;
        let amountInProfit = 0;
        let amountInLoss = 0;
        let pnlInProfit = 0;
        let pnlInLoss = 0;

        inventory.forEach(lot => {
            const lotPnL = (currentPrice - lot.price) * lot.remaining;
            if (lotPnL >= 0) {
                lotsInProfit++;
                amountInProfit += lot.remaining;
                pnlInProfit += lotPnL;
            } else {
                lotsInLoss++;
                amountInLoss += lot.remaining;
                pnlInLoss += lotPnL;
            }
        });

        const inventoryHealth = {
            lotsInProfit,
            lotsInLoss,
            totalLots: inventory.length,
            profitPercent: inventory.length > 0 ? (lotsInProfit / inventory.length * 100) : 0,
            amountInProfit,
            amountInLoss,
            pnlInProfit,
            pnlInLoss
        };

        // Get Global Equity from cached financials`;

    if (code.includes(oldCode1)) {
        code = code.replace(oldCode1, newCode1);
        console.log("Added inventory health calculation");
    } else {
        console.log("Could not find insertion point 1");
    }

    // Add inventoryHealth to response
    const oldCode2 = `inventoryValue: currentValue,
            avgCost: avgCost,

            // Market analysis`;

    const newCode2 = `inventoryValue: currentValue,
            avgCost: avgCost,
            inventoryHealth: inventoryHealth,

            // Market analysis`;

    if (code.includes(oldCode2)) {
        code = code.replace(oldCode2, newCode2);
        console.log("Added inventoryHealth to response");
    } else {
        console.log("Could not find insertion point 2");
    }

    fs.writeFileSync("grid_bot.js", code);
    console.log("grid_bot.js updated");
}

// Update dashboard.html
let html = fs.readFileSync("public/dashboard.html", "utf8");

if (html.includes("inventoryHealth")) {
    console.log("inventoryHealth already in dashboard, skipping");
} else {
    const oldHtml = `const flotanteEl = document.getElementById(\`flotante-\${id}\`);
            if (flotanteEl) {
                const flotante = data.unrealizedPnL || 0;
                if (flotante >= 0) {
                    flotanteEl.innerHTML = \`+$\${flotante.toFixed(2)}\`;
                    flotanteEl.style.color = "var(--emerald-life)";
                } else {
                    // Negative = accumulating for future gains
                    flotanteEl.innerHTML = \`$\${flotante.toFixed(2)} <span style="font-size:0.6rem;opacity:0.7;color:#ffd700">acumulando</span>\`;
                    flotanteEl.style.color = "var(--ruby-danger)";
                }
            }`;

    const newHtml = `const flotanteEl = document.getElementById(\`flotante-\${id}\`);
            if (flotanteEl) {
                const flotante = data.unrealizedPnL || 0;
                const health = data.inventoryHealth || {};
                const lotsInProfit = health.lotsInProfit || 0;
                const totalLots = health.totalLots || 0;
                const profitPct = health.profitPercent || 0;

                // Health indicator
                let healthIcon = '🟢';
                let healthColor = '#4ade80';
                if (profitPct < 30) {
                    healthIcon = '🔴';
                    healthColor = '#f87171';
                } else if (profitPct < 60) {
                    healthIcon = '🟡';
                    healthColor = '#fbbf24';
                }

                const healthText = totalLots > 0
                    ? \`<span style="font-size:0.65rem;opacity:0.85;color:\${healthColor};margin-left:6px">\${healthIcon} \${lotsInProfit}/\${totalLots}</span>\`
                    : '';

                if (flotante >= 0) {
                    flotanteEl.innerHTML = \`+$\${flotante.toFixed(2)}\${healthText}\`;
                    flotanteEl.style.color = "var(--emerald-life)";
                } else {
                    // Negative = accumulating for future gains
                    flotanteEl.innerHTML = \`$\${flotante.toFixed(2)}\${healthText}\`;
                    flotanteEl.style.color = "var(--ruby-danger)";
                }
            }`;

    if (html.includes(oldHtml)) {
        html = html.replace(oldHtml, newHtml);
        fs.writeFileSync("public/dashboard.html", html);
        console.log("dashboard.html updated");
    } else {
        console.log("Could not find dashboard insertion point");
    }
}

console.log("Patch complete!");
