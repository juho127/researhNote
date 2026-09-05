#!/usr/bin/env node
/**
 * 원클릭 설치: D1 생성 → wrangler.jsonc 에 ID 기록 → 마이그레이션 → 배포 → 관리자 토큰 발급
 *
 *   npm run setup                 # 전체
 *   npm run setup -- --skip-admin # 관리자 발급 생략
 *   npm run setup -- --name my-lab-notes --db my-lab-notes-db   # 워커/DB 이름 변경
 *
 * 사전 조건: `npx wrangler login` 또는 CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID 환경변수
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (k) => {
  const i = args.indexOf(k);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : undefined;
};
const isWin = process.platform === "win32";
const npx = isWin ? "npx.cmd" : "npx";

function run(cmd, opts = {}) {
  console.log(`\n$ npx wrangler ${cmd.join(" ")}`);
  const r = spawnSync(npx, ["wrangler", ...cmd], { stdio: opts.capture ? ["ignore", "pipe", "inherit"] : "inherit", encoding: "utf-8", shell: isWin });
  if (r.status !== 0 && !opts.allowFail) {
    console.error(`\n[실패] wrangler ${cmd[0]} (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
  return r.stdout ?? "";
}

const cfgPath = "wrangler.jsonc";
let cfg = readFileSync(cfgPath, "utf-8");

// 이름 변경 옵션
const workerName = flag("--name");
if (workerName) cfg = cfg.replace(/"name":\s*"[^"]+"/, `"name": "${workerName}"`);
const dbNameFlag = flag("--db");
if (dbNameFlag) cfg = cfg.replace(/"database_name":\s*"[^"]+"/, `"database_name": "${dbNameFlag}"`);
const dbName = (cfg.match(/"database_name":\s*"([^"]+)"/) || [])[1] || "research-note-db";

// 1) 계정 확인
console.log("▶ 1/5 Cloudflare 계정 확인");
run(["whoami"]);

// 2) D1 생성 (이미 있으면 재사용)
console.log("\n▶ 2/5 D1 데이터베이스 준비");
// 이 계정에 있는 D1 목록에서 (1) wrangler.jsonc 의 database_id 와 일치하거나 (2) 같은 이름인 DB 를 찾고, 없으면 새로 만든다.
// → 다른 연구실이 리포를 그대로 가져와도(다른 계정) 자기 계정에 새 DB 가 생긴다.
const configuredId = (cfg.match(/"database_id":\s*"([^"]+)"/) || [])[1];
function listDbs() {
  const out = run(["d1", "list", "--json"], { capture: true, allowFail: true });
  try { return JSON.parse(out.slice(out.indexOf("["))); } catch { return []; }
}
let dbs = listDbs();
let found = dbs.find((d) => (d.uuid || d.id) === configuredId) || dbs.find((d) => d.name === dbName);
if (!found) {
  run(["d1", "create", dbName]);
  dbs = listDbs();
  found = dbs.find((d) => d.name === dbName);
}
if (!found) {
  console.error("D1 생성/조회 실패. `npx wrangler d1 list` 로 확인 후 wrangler.jsonc 의 database_id 를 직접 입력하세요.");
  process.exit(1);
}
const dbId = found.uuid || found.id;
if (dbId !== configuredId) {
  cfg = cfg.replace(/"database_id":\s*"[^"]+"/, `"database_id": "${dbId}"`);
  console.log(`   database_id = ${dbId} (wrangler.jsonc 에 기록)`);
} else {
  console.log(`   기존 database_id 사용: ${dbId}`);
}
writeFileSync(cfgPath, cfg);

// 3) 마이그레이션
console.log("\n▶ 3/5 스키마 마이그레이션 (원격)");
run(["d1", "migrations", "apply", "DB", "--remote"]);

// 4) 배포
console.log("\n▶ 4/5 워커 배포");
const deployOut = run(["deploy"], { capture: true });
process.stdout.write(deployOut);
const urlMatch = deployOut.match(/https:\/\/[^\s]+workers\.dev/);
const url = urlMatch ? urlMatch[0] : "(배포 URL 은 wrangler deploy 출력 참고)";

// 5) 관리자 토큰
if (!args.includes("--skip-admin")) {
  console.log("\n▶ 5/5 관리자 계정·토큰 발급");
  const r = spawnSync(process.execPath, ["scripts/bootstrap-admin.mjs", ...(flag("--admin-name") ? ["--name", flag("--admin-name")] : []), ...(flag("--admin-id") ? ["--id", flag("--admin-id")] : [])], { stdio: "inherit" });
  if (r.status !== 0) console.error("관리자 발급 실패 — 나중에 `npm run bootstrap` 으로 재시도할 수 있습니다.");
}

if (!existsSync(".dev.vars")) {
  writeFileSync(".dev.vars", `ADMIN_TOKEN=rn_dev_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}\n`);
  console.log("\n(.dev.vars 생성: 로컬 개발용 ADMIN_TOKEN)");
}

console.log(`\n🎉 설치 완료\n   웹:  ${url}\n   MCP: ${url}/mcp\n   지침: ${url}/SKILL.md\n`);
console.log("다음: 웹에 관리자 토큰으로 로그인 → [관리자] 에서 카테고리·연구원 생성 → 연구원에게 토큰 전달");
