/**
 * Centralised env access. Throws clearly when a required server-only secret
 * is missing rather than failing deep inside a third-party SDK.
 */

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  appUrl:
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_URL ??
    "http://localhost:3000",
};

export function requireServerEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required server env var: ${name}`);
  }
  return value;
}

export function publicAppUrl(): string {
  const raw = env.appUrl;
  if (raw.startsWith("http")) return raw;
  return `https://${raw}`;
}
