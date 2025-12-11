module.exports = {
    {
  name: "bot-btc",
    script: "./grid_bot.js",
      watch: false, // Don't watch in production (avoids restarts on log updates)
        env: {
    TRADING_PAIR: "BTC/USDT",
      BOT_PORT: 3000,
        CAPITAL_ALLOCATION: 0.5, // 50% Capital for BTC
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
        CAPITAL_ALLOCATION: 0.5, // 50% Capital for SOL
          NODE_ENV: "production"
  }
}
    // Future bots (Uncomment when ready)
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
