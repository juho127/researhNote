import type { AuthContext, Env } from "../env";
import { STAGES, STAGE_LABELS, STAGE_HINTS } from "../env";
import { requireCategoryMember } from "../lib/auth";
import { clampInt, str } from "../lib/http";
import { daysAgoIso } from "../lib/time";
import { listActivity } from "./admin";
import { listProjects } from "./projects";
import { listEntries } from "./entries";

/** /api/me — 로그인 사용자 요약 */
export async function me(env: Env, ctx: AuthContext) {
  let tokenHint: string | null = null;
  if (ctx.tokenId) {
    const t = await env.DB.prepare(`SELECT hint, label, created_at, last_used_at FROM tokens WHERE id = ?`).bind(ctx.tokenId).first<{ hint: string; label: string; created_at: string; last_used_at: string | null }>();
    tokenHint = t?.hint ?? null;
  }
  const projects = await listProjects(env, ctx, { owner_id: ctx.user.id, status: "all", limit: 100 });
  return {
    user: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email, role: ctx.user.role, created_at: ctx.user.created_at },
    is_admin: ctx.isAdmin,
    bootstrap: ctx.tokenId === null,
    token_hint: tokenHint,
    memberships: ctx.memberships,
    my_projects: projects.filter((p) => p.status !== "archived"),
    stages: STAGES.map((s) => ({ id: s, label: STAGE_LABELS[s], hint: STAGE_HINTS[s] })),
    app: { name: env.APP_NAME, org: env.ORG_NAME, org_sub: env.ORG_SUB, mark: env.ORG_MARK, tz: env.APP_TZ },
  };
}

/** 카테고리 상세 (구성원 · 프로젝트 · 최근 활동) */
export async function categoryDetail(env: Env, ctx: AuthContext, categoryId: string) {
  requireCategoryMember(ctx, categoryId);
  const cat = await env.DB.prepare(`SELECT * FROM categories WHERE id = ?`).bind(categoryId).first();
  const members = await env.DB
    .prepare(
      `SELECT u.id, u.name, u.email, m.role, u.last_seen_at,
         (SELECT COUNT(*) FROM projects p WHERE p.owner_id = u.id AND p.category_id = m.category_id AND p.status = 'active') AS active_projects,
         (SELECT COUNT(*) FROM entries e JOIN projects p ON p.id = e.project_id WHERE e.author_id = u.id AND p.category_id = m.category_id AND e.created_at >= ?) AS entries_7d,
         (SELECT MAX(e.created_at) FROM entries e JOIN projects p ON p.id = e.project_id WHERE e.author_id = u.id AND p.category_id = m.category_id) AS last_entry_at
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.category_id = ? AND u.disabled_at IS NULL ORDER BY m.role = 'lead' DESC, u.name`
    )
    .bind(daysAgoIso(7), categoryId)
    .all();
  const [projects, activity, reviewQueue] = await Promise.all([
    listProjects(env, ctx, { category_id: categoryId, status: "all", limit: 300 }),
    listActivity(env, { category_id: categoryId, limit: 40 }),
    listEntries(env, ctx, { category_id: categoryId, review_status: "requested", limit: 50, with_content: false }),
  ]);
  return { category: cat, members: members.results, projects, activity, review_queue: reviewQueue, my_role: requireCategoryMember(ctx, categoryId) };
}

/** 팀 활동 피드 (소속 카테고리 전체 또는 지정 카테고리) */
export async function feed(env: Env, ctx: AuthContext, opts: { category_id?: string; project_id?: string; limit?: unknown; before?: unknown }) {
  if (opts.category_id) requireCategoryMember(ctx, opts.category_id);
  const ids = ctx.isAdmin ? undefined : ctx.memberships.map((m) => m.category_id);
  return listActivity(env, {
    category_id: opts.category_id,
    project_id: opts.project_id,
    category_ids: opts.category_id ? undefined : ids,
    limit: opts.limit,
    before: opts.before,
  });
}

/** 통합 검색: 프로젝트 + 기록 */
export async function search(env: Env, ctx: AuthContext, q: unknown, categoryId?: string, limit?: unknown) {
  const query = str(q, 100);
  if (!query) return { projects: [], entries: [] };
  const lim = clampInt(limit, 20, 1, 100);
  const [projects, entries] = await Promise.all([
    listProjects(env, ctx, { category_id: categoryId, q: query, status: "all", limit: lim }),
    listEntries(env, ctx, { category_id: categoryId, q: query, limit: lim, with_content: false }),
  ]);
  return { projects, entries };
}
