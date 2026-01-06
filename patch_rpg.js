const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'scripts', 'analyze_projection.js');
let code = fs.readFileSync(file, 'utf8');

// Add API fetch before baseXP
code = code.replace(
    'const baseXP = 810;',
    `const rpgAPI = (() => { try { return JSON.parse(require("child_process").execSync("curl -s http://localhost:3000/api/rpg", {timeout:3000})); } catch(e) { return null; } })();
    const baseXP = 810;`
);

// Use API XP if available
code = code.replace(
    'const currentXP = Math.floor(baseXP + xpHit_Profit + xpHit_Time);',
    'const currentXP = rpgAPI ? rpgAPI.xp : Math.floor(baseXP + xpHit_Profit + xpHit_Time);'
);

fs.writeFileSync(file, code);
console.log('✅ Patched analyze_projection.js to sync XP from /api/rpg');
