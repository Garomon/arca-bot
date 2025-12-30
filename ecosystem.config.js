module.exports = {
  apps: [
    {
      name: "bot-btc",
      script: "./grid_bot.js",
      watch: false,
      env: {
        TRADING_PAIR: "BTC/USDT",
        BOT_PORT: 3000,
        CAPITAL_ALLOCATION: 0.40,
        NODE_ENV: "production"
      },
      max_memory_restart: "800M"
    },
    {
      name: "bot-sol",
      script: "./grid_bot.js",
      watch: false,
      env: {
        TRADING_PAIR: "SOL/USDT",
        BOT_PORT: 3001,
        CAPITAL_ALLOCATION: 0.40,
        NODE_ENV: "production"
      },
      max_memory_restart: "800M"
    },
    {
      name: "bot-doge",
      script: "./grid_bot.js",
      watch: false,
      env: {
        TRADING_PAIR: "DOGE/USDT",
        BOT_PORT: 3002,
        CAPITAL_ALLOCATION: 0.20,
        NODE_ENV: "production"
      },
      max_memory_restart: "800M"
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
