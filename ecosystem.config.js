module.exports = {
  apps: [
    {
      name: "bot-btc",
      script: "./grid_bot.js",
      watch: false,
      env: {
        TRADING_PAIR: "BTC/USDT",
        BOT_PORT: 3000,
        CAPITAL_ALLOCATION: 0.5, // 50% Capital
        NODE_ENV: "production"
      }
    },
    {
      name: "bot-sol",
      script: "./grid_bot.js",
      watch: false,
      env: {
        TRADING_PAIR: "SOL/USDT",
        BOT_PORT: 3001,
        CAPITAL_ALLOCATION: 0.5, // 50% Capital
        NODE_ENV: "production"
      }
    }
  ]
};
