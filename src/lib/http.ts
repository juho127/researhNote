export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = "error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-API-Key, Mcp-Session-Id, Mcp-Protocol-Version, Accept",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Content-Disposition",
  "Access-Control-Max-Age": "86400",
};

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS_HEADERS, ...extra },
  });
}

export function text(body: string, status = 200, contentType = "text/plain; charset=utf-8", extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": contentType, "Cache-Control": "no-store", ...CORS_HEADERS, ...extra },
  });
}

export function html(body: string, status = 200, extra: Record<string, string> = {}): Response {
  return text(body, status, "text/html; charset=utf-8", extra);
}

export function bad(message: string, code = "bad_request"): never {
  throw new HttpError(400, message, code);
}
export function unauthorized(message = "인증이 필요합니다 (Authorization: Bearer <토큰>)"): never {
  throw new HttpError(401, message, "unauthorized");
}
export function forbidden(message = "권한이 없습니다"): never {
  throw new HttpError(403, message, "forbidden");
}
export function notFound(message = "찾을 수 없습니다"): never {
  throw new HttpError(404, message, "not_found");
}

export async function readJson<T = Record<string, unknown>>(request: Request, maxBytes = 512 * 1024): Promise<T> {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > maxBytes) throw new HttpError(413, "요청 본문이 너무 큽니다", "too_large");
  const raw = await request.text();
  if (raw.length > maxBytes) throw new HttpError(413, "요청 본문이 너무 큽니다", "too_large");
  if (!raw.trim()) return {} as T;
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === "object") return v as T;
    return {} as T;
  } catch {
    throw new HttpError(400, "JSON 파싱 실패", "bad_json");
  }
}

/** 문자열 필드 정규화: trim + 길이 제한(초과분은 잘라냄). 없으면 fallback. 객체/배열은 거부. */
export function str(v: unknown, max = 500, fallback = ""): string {
  if (v === undefined || v === null) return fallback;
  if (typeof v === "object") bad("문자열이어야 하는 필드에 객체/배열이 들어왔습니다");
  const s = String(v).trim();
  return s.length > max ? s.slice(0, max) : s;
}

/** 길이 제한을 넘으면 잘라내지 않고 400 (본문·제목처럼 조용히 잘리면 안 되는 필드용) */
export function strLimited(v: unknown, max: number, name: string, fallback = ""): string {
  if (v === undefined || v === null) return fallback;
  if (typeof v === "object") bad(`${name} 은(는) 문자열이어야 합니다`);
  const s = String(v).trim();
  if (s.length > max) bad(`${name} 이(가) 최대 길이 ${max.toLocaleString()}자를 넘습니다 (${s.length.toLocaleString()}자)`);
  return s;
}

/** 불리언 플래그: true/"true"/1/"1" 만 참. "false" 문자열은 거짓. */
export function bool(v: unknown): boolean {
  return v === true || v === 1 || v === "true" || v === "1";
}

export function optStr(v: unknown, max = 500): string | undefined {
  if (v === undefined || v === null) return undefined;
  return str(v, max);
}

export function isDateStr(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  // 2026-02-31 같은 존재하지 않는 날짜는 Date 가 정규화하므로 왕복 비교로 거른다
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], name: string): T {
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v))
    bad(`${name} 값은 ${allowed.join(" | ")} 중 하나여야 합니다`);
  return v as T;
}

export function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
