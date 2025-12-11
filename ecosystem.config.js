module.exports = {
  apps: [
    {
      name: "bot-btc",
      script: "./grid_bot.js",
      watch: false,
      env: {
        TRADING_PAIR: "BTC/USDT",
        BOT_PORT: 3000,
        CAPITAL_ALLOCATION: 0.5,
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
        CAPITAL_ALLOCATION: 0.5,
        NODE_ENV: "production"
      }
    }
    // Future bots
    /*
    {
      name: "bot-eth",
      script: "./grid_bot.js",
      env: {
        TRADING_PAIR: "ETH/BTC",
        BOT_PORT: 3002,
        CAPITAL_ALLOCATION: 0.33,
        NODE_ENV: "production"
      }
    }
    */
  ]
};
