import type { Env } from "./env";
import { CORS_HEADERS, json, text } from "./lib/http";
import { handleApi } from "./routes";
import { handleMcp } from "./mcp";
import { SKILL_MD } from "./skill";
import { connectMarkdown } from "./connect";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

    if (path === "/health") return json({ ok: true, name: env.APP_NAME, time: new Date().toISOString() });

    if (path === "/api" || path.startsWith("/api/")) return handleApi(request, env);

    if (path === "/mcp" || path.startsWith("/mcp/")) return handleMcp(request, env);

    if (path === "/SKILL.md" || path === "/skill" || path === "/skill.md") return text(SKILL_MD, 200, "text/markdown; charset=utf-8");

    // AI 에이전트용 자기 연동 안내 (사용자가 AI 에게 이 URL 만 주면 됨)
    if (path === "/connect" || path === "/ai" || path === "/llms.txt" || path === "/connect.md") {
      return text(await connectMarkdown(env, `${url.protocol}//${url.host}`), 200, "text/markdown; charset=utf-8");
    }

    if (path === "/mcp.json") {
      // 클라이언트 설정 샘플 (토큰은 사용자가 채움)
      const base = `${url.protocol}//${url.host}`;
      return json({
        mcpServers: {
          "research-note": { type: "http", url: `${base}/mcp`, headers: { Authorization: "Bearer <YOUR_TOKEN>" } },
        },
        claude_code: `claude mcp add --transport http research-note ${base}/mcp --header "Authorization: Bearer <YOUR_TOKEN>"`,
        skill: `${base}/SKILL.md`,
      });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
