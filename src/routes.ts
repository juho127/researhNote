import type { AuthContext, Env } from "./env";
import { authenticate, requireAdmin } from "./lib/auth";
import { HttpError, json, text, html, readJson, notFound } from "./lib/http";
import * as P from "./services/projects";
import * as E from "./services/entries";
import * as T from "./services/tasks";
import * as A from "./services/admin";
import * as F from "./services/feed";
import * as R from "./services/report";

type Handler = (req: Request, env: Env, ctx: AuthContext, params: Record<string, string>, url: URL) => Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

const routes: Route[] = [];

function add(method: string, path: string, handler: Handler) {
  const keys: string[] = [];
  const pattern = new RegExp(
    "^" +
      path.replace(/\//g, "\\/").replace(/:(\w+)/g, (_m, k) => {
        keys.push(k);
        return "([^\\/]+)";
      }) +
      "$"
  );
  routes.push({ method, pattern, keys, handler });
}

const q = (url: URL, k: string) => url.searchParams.get(k) ?? undefined;

type ReportResult = { type: "json"; data: unknown } | { type: "md"; text: string; title?: string } | { type: "html"; html: string; title?: string };

function reportResponse(r: ReportResult, download: boolean) {
  const safe = (r as { title?: string }).title?.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80) || "report";
  if (r.type === "json") return json(r.data);
  if (r.type === "md")
    return text(r.text, 200, "text/markdown; charset=utf-8", download ? { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safe)}.md` } : {});
  return html(r.html, 200, download ? { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safe)}.html` } : {});
}

// ---------- me / 카테고리 ----------
add("GET", "/api/me", async (_r, env, ctx) => json(await F.me(env, ctx)));
add("GET", "/api/categories", async (_r, env, ctx) => {
  const all = await A.listCategories(env, false);
  return json(ctx.isAdmin ? all : all.filter((c) => ctx.memberships.some((m) => m.category_id === c.id)));
});
add("GET", "/api/categories/:id", async (_r, env, ctx, p) => json(await F.categoryDetail(env, ctx, p.id)));
add("GET", "/api/categories/:id/board", async (_r, env, ctx, p) => json(await P.categoryBoard(env, ctx, p.id)));
add("GET", "/api/categories/:id/report", async (_r, env, ctx, p, url) =>
  reportResponse(await R.categoryReport(env, ctx, p.id, q(url, "format") || "html", { from: q(url, "from"), to: q(url, "to") }), q(url, "download") === "1")
);

// ---------- 프로젝트 ----------
add("GET", "/api/projects", async (_r, env, ctx, _p, url) =>
  json(await P.listProjects(env, ctx, { category_id: q(url, "category_id"), owner_id: q(url, "mine") === "1" ? ctx.user.id : q(url, "owner_id"), status: q(url, "status"), q: q(url, "q"), limit: Number(q(url, "limit")) || undefined }))
);
add("POST", "/api/projects", async (req, env, ctx) => json(await P.createProject(env, ctx, await readJson(req)), 201));
add("GET", "/api/projects/:id", async (_r, env, ctx, p) => json(await P.getProjectDetail(env, ctx, p.id)));
add("PATCH", "/api/projects/:id", async (req, env, ctx, p) => json(await P.updateProject(env, ctx, p.id, await readJson(req))));
add("DELETE", "/api/projects/:id", async (_r, env, ctx, p) => {
  await P.archiveProject(env, ctx, p.id);
  return json({ ok: true });
});
add("PUT", "/api/projects/:id/stages/:stage", async (req, env, ctx, p) => json(await P.updateStage(env, ctx, p.id, p.stage, await readJson(req))));
add("GET", "/api/projects/:id/report", async (_r, env, ctx, p, url) =>
  reportResponse(await R.projectReport(env, ctx, p.id, q(url, "format") || "html", { from: q(url, "from"), to: q(url, "to"), include_comments: q(url, "comments") !== "0" }), q(url, "download") === "1")
);

// ---------- 기록 ----------
add("GET", "/api/entries", async (_r, env, ctx, _p, url) =>
  json(
    await E.listEntries(env, ctx, {
      project_id: q(url, "project_id"), category_id: q(url, "category_id"), author_id: q(url, "mine") === "1" ? ctx.user.id : q(url, "author_id"),
      stage: q(url, "stage"), since: q(url, "since"), until: q(url, "until"), review_status: q(url, "review_status"), q: q(url, "q"),
      limit: Number(q(url, "limit")) || undefined, offset: Number(q(url, "offset")) || undefined, with_content: q(url, "brief") !== "1",
    })
  )
);
add("GET", "/api/projects/:id/entries", async (_r, env, ctx, p, url) =>
  json(await E.listEntries(env, ctx, { project_id: p.id, stage: q(url, "stage"), since: q(url, "since"), until: q(url, "until"), review_status: q(url, "review_status"), limit: Number(q(url, "limit")) || undefined, offset: Number(q(url, "offset")) || undefined }))
);
add("POST", "/api/projects/:id/entries", async (req, env, ctx, p) => json(await E.createEntry(env, ctx, p.id, await readJson(req)), 201));
add("GET", "/api/entries/:id", async (_r, env, ctx, p) => json(await E.getEntryFull(env, ctx, p.id)));
add("PATCH", "/api/entries/:id", async (req, env, ctx, p) => json(await E.updateEntry(env, ctx, p.id, await readJson(req))));
add("DELETE", "/api/entries/:id", async (_r, env, ctx, p) => {
  await E.deleteEntry(env, ctx, p.id);
  return json({ ok: true });
});
add("POST", "/api/entries/:id/review", async (req, env, ctx, p) => {
  const b = await readJson<{ status?: unknown; note?: unknown }>(req);
  return json(await E.setReviewStatus(env, ctx, p.id, b.status, b.note));
});
add("GET", "/api/entries/:id/comments", async (_r, env, ctx, p) => json((await E.getEntryFull(env, ctx, p.id)).comments ?? []));
add("POST", "/api/entries/:id/comments", async (req, env, ctx, p) => {
  const b = await readJson<{ content?: unknown; kind?: unknown }>(req);
  return json(await E.addComment(env, ctx, p.id, b.content, b.kind ?? "comment"), 201);
});
add("DELETE", "/api/comments/:id", async (_r, env, ctx, p) => {
  await E.deleteComment(env, ctx, p.id);
  return json({ ok: true });
});

// ---------- 할 일 ----------
add("GET", "/api/projects/:id/tasks", async (_r, env, ctx, p, url) => json(await T.listTasks(env, ctx, p.id, q(url, "status"))));
add("POST", "/api/projects/:id/tasks", async (req, env, ctx, p) => json(await T.createTask(env, ctx, p.id, await readJson(req)), 201));
add("PATCH", "/api/tasks/:id", async (req, env, ctx, p) => json(await T.updateTask(env, ctx, p.id, await readJson(req))));
add("DELETE", "/api/tasks/:id", async (_r, env, ctx, p) => {
  await T.deleteTask(env, ctx, p.id);
  return json({ ok: true });
});

// ---------- 피드 / 검색 ----------
add("GET", "/api/feed", async (_r, env, ctx, _p, url) => json(await F.feed(env, ctx, { category_id: q(url, "category_id"), project_id: q(url, "project_id"), limit: q(url, "limit"), before: q(url, "before") })));
add("GET", "/api/search", async (_r, env, ctx, _p, url) => json(await F.search(env, ctx, q(url, "q"), q(url, "category_id"), q(url, "limit"))));

// ---------- 관리자 ----------
const admin = (h: Handler): Handler => async (req, env, ctx, p, url) => {
  requireAdmin(ctx);
  return h(req, env, ctx, p, url);
};
add("GET", "/api/admin/overview", admin(async (_r, env) => json(await A.overview(env))));
add("GET", "/api/admin/activity", admin(async (_r, env, _c, _p, url) => json(await A.listActivity(env, { category_id: q(url, "category_id"), actor_id: q(url, "actor_id"), limit: q(url, "limit"), before: q(url, "before") }))));
add("GET", "/api/admin/categories", admin(async (_r, env, _c, _p, url) => json(await A.listCategories(env, q(url, "all") === "1"))));
add("POST", "/api/admin/categories", admin(async (req, env, ctx) => json(await A.createCategory(env, ctx, await readJson(req)), 201)));
add("PATCH", "/api/admin/categories/:id", admin(async (req, env, ctx, p) => json(await A.updateCategory(env, ctx, p.id, await readJson(req)))));
add("GET", "/api/admin/users", admin(async (_r, env) => json(await A.listUsers(env))));
add("POST", "/api/admin/users", admin(async (req, env, ctx) => json(await A.createUser(env, ctx, await readJson(req)), 201)));
add("PATCH", "/api/admin/users/:id", admin(async (req, env, ctx, p) => json(await A.updateUser(env, ctx, p.id, await readJson(req)))));
add("PUT", "/api/admin/users/:id/memberships/:cat", admin(async (req, env, ctx, p) => {
  const b = await readJson<{ role?: unknown }>(req);
  await A.setMembership(env, ctx, p.id, p.cat, b.role ?? "member");
  return json({ ok: true });
}));
add("DELETE", "/api/admin/users/:id/memberships/:cat", admin(async (_r, env, ctx, p) => {
  await A.removeMembership(env, ctx, p.id, p.cat);
  return json({ ok: true });
}));
add("GET", "/api/admin/tokens", admin(async (_r, env, _c, _p, url) => json(await A.listTokens(env, q(url, "user_id")))));
add("POST", "/api/admin/tokens", admin(async (req, env, ctx) => json(await A.issueToken(env, ctx, await readJson(req)), 201)));
add("POST", "/api/admin/tokens/:id/revoke", admin(async (_r, env, ctx, p) => {
  await A.revokeToken(env, ctx, p.id);
  return json({ ok: true });
}));

// ---------- 디스패치 ----------
export async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();
  let matchedPath = false;
  for (const r of routes) {
    const m = r.pattern.exec(path);
    if (!m) continue;
    matchedPath = true;
    if (r.method !== method) continue;
    const params: Record<string, string> = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    try {
      const ctx = await authenticate(request, env, request.headers.get("x-client") === "mcp" ? "mcp" : request.headers.get("x-client") === "web" ? "web" : "api");
      return await r.handler(request, env, ctx, params, url);
    } catch (err) {
      return errorResponse(err);
    }
  }
  if (matchedPath) return json({ error: "method_not_allowed", message: `${method} ${path} 는 지원하지 않습니다` }, 405);
  return notFoundResponse(path);
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return json({ error: err.code, message: err.message }, err.status);
  const msg = err instanceof Error ? err.message : String(err);
  console.error("unhandled", msg, err instanceof Error ? err.stack : "");
  // D1 오류 메시지는 대개 안전하나, 내부 경로 노출을 피하기 위해 요약만 전달
  return json({ error: "internal", message: msg.length > 300 ? msg.slice(0, 300) : msg }, 500);
}

function notFoundResponse(path: string): Response {
  try {
    notFound(`${path} 경로가 없습니다`);
  } catch (e) {
    return errorResponse(e);
  }
  return json({ error: "not_found" }, 404);
}

