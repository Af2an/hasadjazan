import { loadConfig } from "./config.js";
import { createPool, createRepo, migrate } from "./repo.js";
import { createMailer } from "./mailer.js";
import { createApp } from "./app.js";

const config = loadConfig();
const pool = createPool(config.databaseUrl);
pool.on("error", (e) => console.error("[db] idle client error:", e.code || "error"));

await migrate(pool);

const app = createApp({ config, repo: createRepo(pool), mailer: createMailer(config) });
const server = app.listen(config.port, () => console.log("[hasad-jazan] listening on port " + config.port));
server.requestTimeout = 20000;
server.headersTimeout = 15000;

const shutdown = () => { server.close(() => pool.end().finally(() => process.exit(0))); };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
