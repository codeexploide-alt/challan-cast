import app from "./app.js";
import { logger } from "./lib/logger.js";
import { startTelegramBot } from "./lib/telegram-bot.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Start Telegram bot if token is configured
  const telegramToken = process.env["TELEGRAM_BOT_TOKEN"];
  if (telegramToken) {
    try {
      startTelegramBot(telegramToken);
    } catch (err) {
      logger.error({ err }, "Failed to start Telegram bot");
    }
  } else {
    logger.warn("TELEGRAM_BOT_TOKEN not set — Telegram bot disabled");
  }
});
