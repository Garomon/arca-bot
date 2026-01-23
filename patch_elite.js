const fs = require('fs');
let html = fs.readFileSync('public/dashboard.html', 'utf8');

const oldCode = `// Health indicator
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
                    : '';`;

const newCode = `// Health indicator with elite insights
                let healthIcon = '🌾';
                let healthColor = '#4ade80';
                let healthMsg = 'Cosecha lista';
                if (profitPct < 30) {
                    healthIcon = '🛒';
                    healthColor = '#a78bfa';
                    healthMsg = 'Comprando dip';
                } else if (profitPct < 60) {
                    healthIcon = '⚡';
                    healthColor = '#fbbf24';
                    healthMsg = 'Cargando';
                }

                const healthText = totalLots > 0
                    ? \`<span style="font-size:0.6rem;opacity:0.9;color:\${healthColor};margin-left:6px" title="\${lotsInProfit} de \${totalLots} lotes en ganancia">\${healthIcon} \${healthMsg}</span>\`
                    : '';`;

if (html.includes(oldCode)) {
    html = html.replace(oldCode, newCode);
    fs.writeFileSync('public/dashboard.html', html);
    console.log('Dashboard updated with elite insights!');
} else {
    console.log('Code pattern not found, trying alternative...');

    // Try finding just the key part
    if (html.includes("let healthIcon = '🟢'")) {
        html = html.replace(
            /\/\/ Health indicator\s+let healthIcon = '🟢';\s+let healthColor = '#4ade80';\s+if \(profitPct < 30\) \{\s+healthIcon = '🔴';\s+healthColor = '#f87171';\s+\} else if \(profitPct < 60\) \{\s+healthIcon = '🟡';\s+healthColor = '#fbbf24';\s+\}\s+const healthText = totalLots > 0\s+\? `<span[^`]+`\s+: '';/g,
            newCode
        );
        fs.writeFileSync('public/dashboard.html', html);
        console.log('Dashboard updated via regex!');
    } else {
        console.log('Could not find health indicator code');
    }
}
