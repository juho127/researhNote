const ALPHA = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function randomString(len: number, alphabet = ALPHA): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/** 짧고 URL-safe 한 ID (접두어 + 12자) */
export function newId(prefix: string): string {
  return `${prefix}_${randomString(12, "abcdefghijklmnopqrstuvwxyz0123456789")}`;
}

/** 개인 접근 토큰 생성: rn_ + 40자 */
export function newToken(): string {
  return "rn_" + randomString(40);
}

export function tokenHint(token: string): string {
  if (token.length < 12) return token.slice(0, 3) + "…";
  return `${token.slice(0, 7)}…${token.slice(-4)}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** slug: 한글·영문·숫자 유지, 나머지 - */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || randomString(6).toLowerCase();
}
