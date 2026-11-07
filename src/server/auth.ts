import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** Password hashing with Node's built-in scrypt — no external dependency. */

const KEY_LEN = 64;
const SALT_LEN = 16;

export type PasswordHash = { hash: string; salt: string };

export function hashPassword(password: string): PasswordHash {
  const salt = randomBytes(SALT_LEN).toString("hex");
  return { hash: derive(password, salt), salt };
}

export function verifyPassword(password: string, stored: PasswordHash): boolean {
  const expected = Buffer.from(stored.hash, "hex");
  const actual = Buffer.from(derive(password, stored.salt), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function derive(password: string, salt: string): string {
  return scryptSync(password, salt, KEY_LEN).toString("hex");
}

/** Opaque, unguessable session id. */
export function newSessionId(): string {
  return randomBytes(32).toString("hex");
}
