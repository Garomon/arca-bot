module.exports = {
  apps: [
    {
      name: "bot-btc",
      script: "./grid_bot.js",
      time: true, // Enable timestamps in logs
      watch: false,
      env: {
        TRADING_PAIR: "BTC/USDT",
        BOT_PORT: 3000,
        CAPITAL_ALLOCATION: 0.40,
        TRADING_FEE: 0.00075,  // BNB 25% discount (0.075%)
        NODE_ENV: "production", BINANCE_API_KEY: "UWAlkUOGv4AAhU7pRtXG2qovJ7AfoUdMGEN4FYsussqTBhkh8SPNlPcEVGatEk6t", BINANCE_SECRET: "XpATUMxNJhUbOvcQLY2wbFs83lnfAky9RQQa8ukEbkWkNTq3VCbSV6bJ7ZLJ2LCr"
      },
      max_memory_restart: "800M"
    },
    {
      name: "bot-sol",
      script: "./grid_bot.js",
      time: true,
      watch: false,
      env: {
        TRADING_PAIR: "SOL/USDT",
        BOT_PORT: 3001,
        CAPITAL_ALLOCATION: 0.40,
        TRADING_FEE: 0.00075,  // BNB 25% discount (0.075%)
        NODE_ENV: "production", BINANCE_API_KEY: "UWAlkUOGv4AAhU7pRtXG2qovJ7AfoUdMGEN4FYsussqTBhkh8SPNlPcEVGatEk6t", BINANCE_SECRET: "XpATUMxNJhUbOvcQLY2wbFs83lnfAky9RQQa8ukEbkWkNTq3VCbSV6bJ7ZLJ2LCr"
      },
      max_memory_restart: "800M"
    },
    {
      name: "bot-doge",
      script: "./grid_bot.js",
      time: true,
      watch: false,
      env: {
        TRADING_PAIR: "DOGE/USDT",
        BOT_PORT: 3002,
        CAPITAL_ALLOCATION: 0.20,
        TRADING_FEE: 0.00075,  // BNB 25% discount (0.075%)
        NODE_ENV: "production", BINANCE_API_KEY: "UWAlkUOGv4AAhU7pRtXG2qovJ7AfoUdMGEN4FYsussqTBhkh8SPNlPcEVGatEk6t", BINANCE_SECRET: "XpATUMxNJhUbOvcQLY2wbFs83lnfAky9RQQa8ukEbkWkNTq3VCbSV6bJ7ZLJ2LCr"
      },
      max_memory_restart: "800M"
    }
  ]
};
