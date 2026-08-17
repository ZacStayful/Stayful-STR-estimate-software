// ─── Admin password verification ──────────────────────────────────
//
// Passwords are never stored, only scrypt hashes, supplied via the
// ADMIN_PASSWORD_HASHES env var:
//
//   ADMIN_PASSWORD_HASHES="zac@stayful.co.uk:<hashHex>:<saltHex>,someone@…:…:…"
//
// Generate an entry with:  node scripts/hash-admin-password.mjs
//
// scrypt is deliberately slow, and comparison is constant-time, so neither the
// hash nor the timing leaks anything useful.

import { scrypt as scryptCb, timingSafeEqual, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

function parseHashes(): Map<string, { hash: Buffer; salt: Buffer }> {
  const out = new Map<string, { hash: Buffer; salt: Buffer }>();
  const raw = process.env.ADMIN_PASSWORD_HASHES ?? "";

  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    // email:hashHex:saltHex — the email may not contain a colon, so splitting
    // from the right keeps this unambiguous.
    const parts = trimmed.split(":");
    if (parts.length < 3) continue;
    const saltHex = parts.pop() as string;
    const hashHex = parts.pop() as string;
    const email = parts.join(":").trim().toLowerCase();
    if (!email || !hashHex || !saltHex) continue;
    try {
      out.set(email, { hash: Buffer.from(hashHex, "hex"), salt: Buffer.from(saltHex, "hex") });
    } catch {
      // Malformed hex — skip this entry rather than crashing the login route.
    }
  }
  return out;
}

/** Hash a password with a fresh salt. Used by scripts/hash-admin-password.mjs. */
export async function hashPassword(password: string): Promise<{ hashHex: string; saltHex: string }> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return { hashHex: hash.toString("hex"), saltHex: salt.toString("hex") };
}

/**
 * Verify a password for an admin email.
 *
 * Always performs a scrypt derivation, even for an unknown email, so the
 * response time doesn't reveal which addresses are configured.
 */
export async function verifyAdminPassword(email: string, password: string): Promise<boolean> {
  const hashes = parseHashes();
  const record = hashes.get(email.trim().toLowerCase());

  const salt = record?.salt ?? randomBytes(16);
  const expected = record?.hash ?? randomBytes(KEY_LENGTH);

  const derived = await scrypt(password, salt, KEY_LENGTH);

  // timingSafeEqual throws on length mismatch, so guard first.
  if (derived.length !== expected.length) return false;
  const match = timingSafeEqual(derived, expected);
  return Boolean(record) && match;
}
