import { resolve } from "node:path";

/** Server configuration, all overridable by environment so deployment stays a single command. */
export type Config = {
  /** TCP port the one process listens on. */
  port: number;
  /** Bind address; 0.0.0.0 so other LAN computers can connect. */
  host: string;
  /** Path to the single SQLite file that holds everything. */
  dbPath: string;
  /** Built SPA directory served in production (vite output). */
  clientDir: string;
  /** Idle timeout: a session is killed after this many ms without a request. */
  idleMs: number;
};

const MINUTE = 60_000;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: intEnv(env.FLECHETTES_PORT, 8080),
    host: env.FLECHETTES_HOST ?? "0.0.0.0",
    dbPath: resolve(env.FLECHETTES_DB ?? "flechettes.db"),
    clientDir: resolve(env.FLECHETTES_CLIENT ?? "dist"),
    idleMs: intEnv(env.FLECHETTES_IDLE_MINUTES, 30) * MINUTE,
  };
}

function intEnv(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
