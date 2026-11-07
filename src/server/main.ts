import { createServer } from "node:http";
import { createServices, makeHandler } from "./app";
import { loadConfig } from "./config";
import { openDb } from "./db";

function main(): void {
  const config = loadConfig();
  const db = openDb(config.dbPath);
  const svc = createServices(db, config);

  // Housekeeping: drop idle-expired sessions every few minutes.
  setInterval(() => svc.sessions.sweep(), 5 * 60_000).unref();

  const server = createServer(makeHandler(svc));
  server.listen(config.port, config.host, () => {
    console.log(`Fléchettes server on http://${config.host}:${config.port}  (db: ${config.dbPath})`);
    if (svc.users.count() === 0) console.log("No users yet — open the app to create the administrator.");
  });
}

main();
