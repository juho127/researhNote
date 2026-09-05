import type { AuthContext, Env } from "../env";
import { bad, notFound, oneOf, str, strLimited, HttpError } from "../lib/http";
import { newId, randomString, sha256Hex, tokenHint } from "../lib/id";
import { nowIso } from "../lib/time";
import { logActivity } from "../lib/db";
import { createUser, issueToken, listCategories } from "./admin";

export interface SignupRow {
  id: string;
  name: string;
  email: string;
  category_id: string | null;
  category_name?: string | null;
  note: string;
  status: "pending" | "approved" | "rejected";
  claim_hint: string;
  user_id: string | null;
  decided_by: string | null;
  decided_by_name?: string | null;
  decided_at: string | null;
  decision_note: string;
  claimed_at: string | null;
  created_at: string;
}

const MAX_PENDING = 200;

export function signupEnabled(env: Env): boolean {
  return (env.SIGNUP_ENABLED ?? "true").toLowerCase() !== "false";
}

/** 공개 설정: 신청 폼에 필요한 정보 */
export async function publicConfig(env: Env) {
  const cats = signupEnabled(env) ? await listCategories(env, false) : [];
  return {
    app: { name: env.APP_NAME, org: env.ORG_NAME, org_sub: env.ORG_SUB, mark: env.ORG_MARK },
    signup_enabled: signupEnabled(env),
    signup_code_required: !!env.SIGNUP_CODE,
    categories: cats.map((c) => ({ id: c.id, name: c.name, description: c.description })),
  };
}

export async function createRequest(env: Env, input: Record<string, unknown>): Promise<{ id: string; claim_code: string; status: string }> {
  if (!signupEnabled(env)) throw new HttpError(403, "현재 발급 신청을 받지 않습니다. 관리자에게 직접 요청하세요", "signup_disabled");
  if (env.SIGNUP_CODE) {
    if (str(input.signup_code, 100) !== env.SIGNUP_CODE) throw new HttpError(403, "신청 코드가 올바르지 않습니다 (연구책임자에게 확인)", "bad_signup_code");
  }
  const name = strLimited(input.name, 100, "name");
  if (!name) bad("이름을 입력하세요");
  const email = strLimited(input.email, 200, "email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) bad("이메일 형식이 올바르지 않습니다");
  const note = strLimited(input.note, 500, "note");
  let categoryId: string | null = null;
  if (input.category_id !== undefined && input.category_id !== null && input.category_id !== "") {
    categoryId = str(input.category_id, 100);
    const c = await env.DB.prepare(`SELECT id FROM categories WHERE id = ? AND archived_at IS NULL`).bind(categoryId).first();
    if (!c) bad("선택한 카테고리가 없습니다");
  }
  const pending = await env.DB.prepare(`SELECT COUNT(*) AS n FROM signup_requests WHERE status = 'pending'`).first<{ n: number }>();
  if ((pending?.n ?? 0) >= MAX_PENDING) throw new HttpError(429, "대기 중인 신청이 너무 많습니다. 잠시 후 다시 시도하세요", "too_many");
  if (email) {
    const dup = await env.DB.prepare(`SELECT id FROM signup_requests WHERE status = 'pending' AND email = ?`).bind(email).first();
    if (dup) bad("같은 이메일로 대기 중인 신청이 있습니다. 수령 코드로 상태를 확인하세요");
  }
  const claim = "clm_" + randomString(24);
  const id = newId("req");
  const at = nowIso();
  await env.DB
    .prepare(`INSERT INTO signup_requests (id, name, email, category_id, note, status, claim_hash, claim_hint, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`)
    .bind(id, name, email, categoryId, note, await sha256Hex(claim), tokenHint(claim), at)
    .run();
  await logActivity(env, { actor_id: null as unknown as string, category_id: categoryId, action: "signup.request", target_id: id, summary: `${name}${email ? ` <${email}>` : ""}`, source: "web" });
  return { id, claim_code: claim, status: "pending" };
}

async function findByClaim(env: Env, claim: string): Promise<SignupRow> {
  const c = str(claim, 100);
  if (!c) notFound("신청을 찾을 수 없습니다");
  const row = await env.DB
    .prepare(`SELECT r.*, c.name AS category_name FROM signup_requests r LEFT JOIN categories c ON c.id = r.category_id WHERE r.claim_hash = ?`)
    .bind(await sha256Hex(c))
    .first<SignupRow>();
  if (!row) notFound("수령 코드에 해당하는 신청이 없습니다");
  return row;
}

/** 신청자 상태 조회 (수령 코드로) */
export async function requestStatus(env: Env, claim: string) {
  const r = await findByClaim(env, claim);
  return {
    id: r.id, name: r.name, status: r.status, category_name: r.category_name, created_at: r.created_at,
    decided_at: r.decided_at, decision_note: r.status === "rejected" ? r.decision_note : "", claimed: !!r.claimed_at,
  };
}

/** 승인된 신청의 토큰 수령 (1회) */
export async function claimToken(env: Env, claim: string): Promise<{ token: string; hint: string; user_id: string; name: string }> {
  const r = await findByClaim(env, claim);
  if (r.status === "pending") throw new HttpError(409, "아직 승인 대기 중입니다", "pending");
  if (r.status === "rejected") throw new HttpError(409, `신청이 거절되었습니다${r.decision_note ? `: ${r.decision_note}` : ""}`, "rejected");
  if (r.claimed_at) throw new HttpError(409, "이미 토큰을 수령했습니다. 분실했다면 관리자에게 재발급을 요청하세요", "already_claimed");
  if (!r.user_id) throw new HttpError(500, "승인 데이터가 손상되었습니다 (user_id 없음)", "internal");
  const u = await env.DB.prepare(`SELECT id, name, disabled_at FROM users WHERE id = ?`).bind(r.user_id).first<{ id: string; name: string; disabled_at: string | null }>();
  if (!u || u.disabled_at) throw new HttpError(409, "계정이 비활성화되었습니다. 관리자에게 문의하세요", "disabled");
  // 수령 표시를 먼저 갱신해 이중 수령을 막는다
  const upd = await env.DB.prepare(`UPDATE signup_requests SET claimed_at = ? WHERE id = ? AND claimed_at IS NULL`).bind(nowIso(), r.id).run();
  if (!upd.meta.changes) throw new HttpError(409, "이미 토큰을 수령했습니다", "already_claimed");
  const systemCtx = { user: { id: u.id, name: u.name } } as AuthContext;
  const t = await issueToken(env, systemCtx, { user_id: u.id, label: "가입 승인 수령" });
  await logActivity(env, { actor_id: u.id, action: "signup.claim", target_id: r.id, summary: `${u.name} ${t.hint}`, source: "web" });
  return { token: t.token, hint: t.hint, user_id: u.id, name: u.name };
}

// ---------- 관리자 ----------

export async function listRequests(env: Env, status?: string): Promise<SignupRow[]> {
  const where = status && status !== "all" ? "WHERE r.status = ?" : "";
  const params = status && status !== "all" ? [oneOf(status, ["pending", "approved", "rejected"] as const, "status")] : [];
  const rs = await env.DB
    .prepare(
      `SELECT r.*, c.name AS category_name, u.name AS decided_by_name
       FROM signup_requests r LEFT JOIN categories c ON c.id = r.category_id LEFT JOIN users u ON u.id = r.decided_by
       ${where} ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 500`
    )
    .bind(...params)
    .all<SignupRow>();
  return (rs.results ?? []).map((r) => ({ ...r, claim_hash: undefined }) as unknown as SignupRow);
}

export async function approveRequest(env: Env, ctx: AuthContext, id: string, input: { name?: unknown; id?: unknown; email?: unknown; note?: unknown; category_id?: unknown; role?: unknown; decision_note?: unknown }) {
  const r = await env.DB.prepare(`SELECT * FROM signup_requests WHERE id = ?`).bind(id).first<SignupRow>();
  if (!r) notFound("신청을 찾을 수 없습니다");
  if (r.status !== "pending") bad(`이미 처리된 신청입니다 (${r.status})`);
  const categoryId = input.category_id !== undefined ? str(input.category_id, 100) : r.category_id;
  const role = input.role === undefined ? "member" : oneOf(input.role, ["lead", "member"] as const, "role");
  const created = await createUser(env, ctx, {
    name: input.name !== undefined ? input.name : r.name,
    id: input.id,
    email: input.email !== undefined ? input.email : r.email,
    note: input.note !== undefined ? input.note : r.note,
    categories: categoryId ? [{ category_id: categoryId, role }] : [],
    issue_token: false,
  });
  const at = nowIso();
  await env.DB
    .prepare(`UPDATE signup_requests SET status = 'approved', user_id = ?, decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ?`)
    .bind(created.user.id, ctx.user.id, at, str(input.decision_note, 500), id)
    .run();
  await logActivity(env, { actor_id: ctx.user.id, category_id: categoryId, action: "signup.approve", target_id: id, summary: `${created.user.name} (${created.user.id})`, source: ctx.source });
  return { request_id: id, user: created.user };
}

export async function rejectRequest(env: Env, ctx: AuthContext, id: string, reason: unknown) {
  const r = await env.DB.prepare(`SELECT * FROM signup_requests WHERE id = ?`).bind(id).first<SignupRow>();
  if (!r) notFound("신청을 찾을 수 없습니다");
  if (r.status !== "pending") bad(`이미 처리된 신청입니다 (${r.status})`);
  await env.DB
    .prepare(`UPDATE signup_requests SET status = 'rejected', decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ?`)
    .bind(ctx.user.id, nowIso(), str(reason, 500), id)
    .run();
  await logActivity(env, { actor_id: ctx.user.id, category_id: r.category_id, action: "signup.reject", target_id: id, summary: `${r.name}${reason ? `: ${str(reason, 120)}` : ""}`, source: ctx.source });
  return { ok: true };
}

export async function deleteRequest(env: Env, id: string) {
  const res = await env.DB.prepare(`DELETE FROM signup_requests WHERE id = ? AND status != 'pending'`).bind(id).run();
  if (!res.meta.changes) bad("대기 중인 신청은 삭제할 수 없습니다 (승인 또는 거절 후 삭제)");
  return { ok: true };
}

export async function pendingCount(env: Env): Promise<number> {
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM signup_requests WHERE status = 'pending'`).first<{ n: number }>();
  return r?.n ?? 0;
}
