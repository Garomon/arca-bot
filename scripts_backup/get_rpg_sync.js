// Helper to fetch RPG data from running bot API
const http = require('http');

function fetchRPG() {
    return new Promise((resolve) => {
        http.get('http://localhost:3000/api/rpg', { timeout: 2000 }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } 
                catch(e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

if (require.main === module) {
    fetchRPG().then(d => console.log(JSON.stringify(d)));
}

module.exports = { fetchRPG };
