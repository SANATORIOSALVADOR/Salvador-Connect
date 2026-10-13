import app from "./app";
import { logger } from "./lib/logger";
import { ensureBootstrapSuperadmin } from "./lib/auth";
import { runMigrations } from "./lib/migrate";
import { iniciarAutomatizacionAdministracion } from "./lib/administracion";

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
  // Primero la base: aplica las migraciones pendientes (packages/db/migrations).
  try {
    const { aplicadas, total } = await runMigrations();
    logger.info({ aplicadas, total }, aplicadas.length ? "Base de datos actualizada" : "Base de datos al día");
  } catch (err) {
    // La API arranca igual (health, login con lo que exista) y el error queda en el log.
    logger.error({ err }, "No se pudieron aplicar las migraciones");
  }

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
    // Vencimientos fiscales del mes y recurrentes: al arrancar y cada hora.
    iniciarAutomatizacionAdministracion();
  });
}

start();
