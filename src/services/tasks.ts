import type { AuthContext, Env } from "../env";
import { TASK_STATUSES, isStage } from "../env";
import { bad, forbidden, isDateStr, oneOf, str } from "../lib/http";
import { newId } from "../lib/id";
import { nowIso } from "../lib/time";
import { categoryRole } from "../lib/auth";
import { getProject, getProjectForRead, logActivity, touchProject } from "../lib/db";
import type { TaskRow } from "./projects";

export interface TaskInput {
  title?: unknown;
  status?: unknown;
  assignee_id?: unknown;
  due?: unknown;
  stage?: unknown;
}

export async function listTasks(env: Env, ctx: AuthContext, projectId: string, status?: string): Promise<TaskRow[]> {
  await getProjectForRead(env, ctx, projectId);
  const where = ["t.project_id = ?"];
  const params: unknown[] = [projectId];
  if (status && status !== "all") {
    where.push("t.status = ?");
    params.push(oneOf(status, TASK_STATUSES, "status"));
  }
  const rs = await env.DB
    .prepare(
      `SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
       WHERE ${where.join(" AND ")}
       ORDER BY CASE t.status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 ELSE 2 END, t.due IS NULL, t.due, t.created_at`
    )
    .bind(...params)
    .all<TaskRow>();
  return rs.results ?? [];
}

async function canTouchTasks(env: Env, ctx: AuthContext, projectId: string) {
  const p = await getProject(env, projectId);
  const role = categoryRole(ctx, p.category_id);
  if (!role) forbidden("이 카테고리의 구성원이 아닙니다");
  // 같은 카테고리 구성원은 누구나 할 일을 제안/갱신할 수 있게 한다 (팀 협업)
  return p;
}

function normDue(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (!isDateStr(v)) bad("due 는 YYYY-MM-DD 형식");
  return v;
}

export async function createTask(env: Env, ctx: AuthContext, projectId: string, input: TaskInput): Promise<TaskRow> {
  const p = await canTouchTasks(env, ctx, projectId);
  const title = str(input.title, 300);
  if (!title) bad("title 이 필요합니다");
  const status = input.status === undefined ? "todo" : oneOf(input.status, TASK_STATUSES, "status");
  const assignee = input.assignee_id ? str(input.assignee_id, 100) : null;
  if (assignee) {
    const ok = await env.DB.prepare(`SELECT 1 AS x FROM memberships WHERE user_id = ? AND category_id = ?`).bind(assignee, p.category_id).first();
    if (!ok && assignee !== "admin") bad("assignee_id 사용자가 이 카테고리의 구성원이 아닙니다");
  }
  let stage: string | null = null;
  if (input.stage !== undefined && input.stage !== null && input.stage !== "") {
    if (!isStage(input.stage)) bad("stage 값이 올바르지 않습니다");
    stage = input.stage;
  }
  const id = newId("tsk");
  const at = nowIso();
  await env.DB
    .prepare(
      `INSERT INTO tasks (id, project_id, title, status, assignee_id, due, stage, created_by, created_at, updated_at, done_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, projectId, title, status, assignee, normDue(input.due), stage, ctx.user.id, at, at, status === "done" ? at : null)
    .run();
  await touchProject(env, projectId);
  await logActivity(env, { actor_id: ctx.user.id, category_id: p.category_id, project_id: projectId, action: "task.create", target_id: id, summary: title, source: ctx.source });
  return (await env.DB.prepare(`SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id WHERE t.id = ?`).bind(id).first<TaskRow>())!;
}

export async function updateTask(env: Env, ctx: AuthContext, id: string, input: TaskInput): Promise<TaskRow> {
  const t = await env.DB.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(id).first<TaskRow>();
  if (!t) bad("할 일을 찾을 수 없습니다");
  const p = await canTouchTasks(env, ctx, t.project_id);
  const sets: string[] = [];
  const params: unknown[] = [];
  const changes: string[] = [];
  if (input.title !== undefined) {
    const s = str(input.title, 300);
    if (!s) bad("title 은 비울 수 없습니다");
    sets.push("title = ?");
    params.push(s);
    changes.push("제목");
  }
  if (input.status !== undefined) {
    const s = oneOf(input.status, TASK_STATUSES, "status");
    sets.push("status = ?", "done_at = ?");
    params.push(s, s === "done" ? nowIso() : null);
    changes.push(`상태→${s}`);
  }
  if (input.assignee_id !== undefined) {
    const a = input.assignee_id ? str(input.assignee_id, 100) : null;
    if (a) {
      const ok = await env.DB.prepare(`SELECT 1 AS x FROM memberships WHERE user_id = ? AND category_id = ?`).bind(a, p.category_id).first();
      if (!ok && a !== "admin") bad("assignee_id 사용자가 이 카테고리의 구성원이 아닙니다");
    }
    sets.push("assignee_id = ?");
    params.push(a);
    changes.push("담당자");
  }
  if (input.due !== undefined) {
    sets.push("due = ?");
    params.push(normDue(input.due));
    changes.push("기한");
  }
  if (input.stage !== undefined) {
    let stage: string | null = null;
    if (input.stage !== null && input.stage !== "") {
      if (!isStage(input.stage)) bad("stage 값이 올바르지 않습니다");
      stage = input.stage;
    }
    sets.push("stage = ?");
    params.push(stage);
    changes.push("단계");
  }
  if (!sets.length) bad("변경할 필드가 없습니다");
  sets.push("updated_at = ?");
  params.push(nowIso(), id);
  await env.DB.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).bind(...params).run();
  await touchProject(env, t.project_id);
  await logActivity(env, { actor_id: ctx.user.id, category_id: p.category_id, project_id: t.project_id, action: "task.update", target_id: id, summary: `${t.title}: ${changes.join(", ")}`, source: ctx.source });
  return (await env.DB.prepare(`SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id WHERE t.id = ?`).bind(id).first<TaskRow>())!;
}

export async function deleteTask(env: Env, ctx: AuthContext, id: string): Promise<void> {
  const t = await env.DB.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(id).first<TaskRow>();
  if (!t) bad("할 일을 찾을 수 없습니다");
  const p = await canTouchTasks(env, ctx, t.project_id);
  const role = categoryRole(ctx, p.category_id);
  if (!(role === "admin" || role === "lead" || t.created_by === ctx.user.id || p.owner_id === ctx.user.id)) forbidden("할 일 삭제는 생성자·프로젝트 소유자·리드·관리자만 가능합니다");
  await env.DB.prepare(`DELETE FROM tasks WHERE id = ?`).bind(id).run();
  await touchProject(env, t.project_id);
  await logActivity(env, { actor_id: ctx.user.id, category_id: p.category_id, project_id: t.project_id, action: "task.delete", target_id: id, summary: t.title, source: ctx.source });
}
