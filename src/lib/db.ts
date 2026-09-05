import type { AuthContext, Env, Stage } from "../env";
import { STAGES } from "../env";
import { nowIso } from "./time";
import { notFound, forbidden } from "./http";
import { categoryRole } from "./auth";

export interface ProjectRow {
  id: string;
  category_id: string;
  owner_id: string;
  title: string;
  summary: string;
  stage: Stage;
  status: string;
  target_venue: string;
  deadline: string | null;
  tags: string;
  created_at: string;
  updated_at: string;
}

export interface EntryRow {
  id: string;
  project_id: string;
  author_id: string;
  date: string;
  stage: Stage;
  title: string;
  content: string;
  source: string;
  review_status: string;
  created_at: string;
  updated_at: string;
}

export async function getProject(env: Env, id: string): Promise<ProjectRow> {
  const p = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id).first<ProjectRow>();
  if (!p) notFound("프로젝트를 찾을 수 없습니다");
  return p;
}

/** 프로젝트 열람: 관리자 또는 해당 카테고리 구성원 */
export async function getProjectForRead(env: Env, ctx: AuthContext, id: string): Promise<ProjectRow> {
  const p = await getProject(env, id);
  if (!categoryRole(ctx, p.category_id)) forbidden("이 프로젝트가 속한 카테고리의 구성원이 아닙니다");
  return p;
}

/** 프로젝트 편집: 관리자 / 소유자 / 카테고리 리드 */
export async function getProjectForWrite(env: Env, ctx: AuthContext, id: string): Promise<ProjectRow> {
  const p = await getProject(env, id);
  const r = categoryRole(ctx, p.category_id);
  if (r === "admin" || r === "lead" || p.owner_id === ctx.user.id) return p;
  forbidden("프로젝트 소유자·카테고리 리드·관리자만 수정할 수 있습니다");
}

export async function getEntry(env: Env, id: string): Promise<EntryRow> {
  const e = await env.DB.prepare(`SELECT * FROM entries WHERE id = ?`).bind(id).first<EntryRow>();
  if (!e) notFound("기록을 찾을 수 없습니다");
  return e;
}

export async function ensureStageRows(env: Env, projectId: string): Promise<void> {
  const at = nowIso();
  const stmts = STAGES.map((s) =>
    env.DB.prepare(`INSERT OR IGNORE INTO project_stages (project_id, stage, status, summary, updated_at) VALUES (?, ?, 'todo', '', ?)`).bind(projectId, s, at)
  );
  await env.DB.batch(stmts);
}

export interface ActivityInput {
  actor_id: string;
  category_id?: string | null;
  project_id?: string | null;
  action: string;
  target_id?: string | null;
  summary?: string;
  source?: string;
}

export async function logActivity(env: Env, a: ActivityInput): Promise<void> {
  await env.DB
    .prepare(`INSERT INTO activity (at, actor_id, category_id, project_id, action, target_id, summary, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(nowIso(), a.actor_id, a.category_id ?? null, a.project_id ?? null, a.action, a.target_id ?? null, (a.summary ?? "").slice(0, 300), a.source ?? "web")
    .run()
    .catch(() => {});
}

export async function touchProject(env: Env, projectId: string): Promise<void> {
  await env.DB.prepare(`UPDATE projects SET updated_at = ? WHERE id = ?`).bind(nowIso(), projectId).run();
}

export async function userNames(env: Env, ids: string[]): Promise<Record<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return {};
  const placeholders = uniq.map(() => "?").join(",");
  const rs = await env.DB.prepare(`SELECT id, name FROM users WHERE id IN (${placeholders})`).bind(...uniq).all<{ id: string; name: string }>();
  const out: Record<string, string> = {};
  for (const r of rs.results ?? []) out[r.id] = r.name;
  return out;
}
