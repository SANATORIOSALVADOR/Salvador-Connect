import app from "./app";
import { logger } from "./lib/logger";
import { ensureBootstrapSuperadmin } from "./lib/auth";

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

async function start() {
  try {
    await ensureBootstrapSuperadmin();
  } catch (err) {
    // No tumbar el proceso: suele ser schema pendiente (db:push)
    logger.error({ err }, "Bootstrap user omitido (¿falta db:push?)");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}

start();
