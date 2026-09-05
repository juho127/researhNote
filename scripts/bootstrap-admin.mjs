#!/usr/bin/env node
/**
 * 최초 관리자 계정 + 토큰 생성 (D1 에 직접 삽입)
 *
 *   node scripts/bootstrap-admin.mjs            # 원격(배포된) D1
 *   node scripts/bootstrap-admin.mjs --local    # 로컬 개발 D1 (wrangler dev)
 *   옵션: --name "배주호" --id juho --email juho@hufs.ac.kr
 *
 * 토큰은 SHA-256 해시로만 저장되므로 출력된 토큰을 안전한 곳에 보관하세요.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (k, def) => {
  const i = args.indexOf(k);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};
const local = args.includes("--local");
const name = flag("--name", "관리자");
const id = (flag("--id", "admin") || "admin").replace(/[^A-Za-z0-9_-]/g, "").toLowerCase() || "admin";
const email = flag("--email", "");

const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const bytes = randomBytes(40);
let token = "rn_";
for (let i = 0; i < 40; i++) token += alphabet[bytes[i] % alphabet.length];
const hash = createHash("sha256").update(token).digest("hex");
const hint = `${token.slice(0, 7)}…${token.slice(-4)}`;
const now = new Date().toISOString();
const tokId = "tok_" + randomBytes(9).toString("hex").slice(0, 12);
const esc = (s) => String(s).replace(/'/g, "''");

const sql = [
  `INSERT OR IGNORE INTO users (id, name, email, role, note, created_at) VALUES ('${esc(id)}', '${esc(name)}', '${esc(email)}', 'admin', '초기 관리자(bootstrap)', '${now}');`,
  `UPDATE users SET role = 'admin', disabled_at = NULL WHERE id = '${esc(id)}';`,
  `INSERT INTO tokens (id, user_id, token_hash, hint, label, created_at) VALUES ('${tokId}', '${esc(id)}', '${hash}', '${hint}', 'bootstrap', '${now}');`,
].join(" ");

// 인자 분리 문제(Windows) 를 피하기 위해 임시 SQL 파일로 실행
const sqlFile = join(tmpdir(), `rn-bootstrap-${process.pid}.sql`);
writeFileSync(sqlFile, sql + "\n", "utf-8");
const wrangler = process.platform === "win32" ? "npx.cmd" : "npx";
const r = spawnSync(wrangler, ["wrangler", "d1", "execute", "DB", local ? "--local" : "--remote", "--file", process.platform === "win32" ? `"${sqlFile}"` : sqlFile], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8", shell: process.platform === "win32" });
try { unlinkSync(sqlFile); } catch {}
if (r.status !== 0) {
  console.error(r.stdout || "");
  console.error(r.stderr || "");
  console.error("\n[실패] D1 실행 오류. 마이그레이션이 적용됐는지 확인하세요: npm run migrate:" + (local ? "local" : "remote"));
  process.exit(1);
}
console.log(`\n✅ 관리자 계정 준비 완료 (${local ? "로컬" : "원격"} D1)`);
console.log(`   사용자 ID : ${id}`);
console.log(`   이름      : ${name}`);
console.log(`   토큰 힌트 : ${hint}`);
console.log(`\n🔑 관리자 토큰 (지금 한 번만 표시됩니다):\n\n   ${token}\n`);
console.log(`웹에서 이 토큰으로 로그인한 뒤 [관리자] 탭에서 카테고리·연구원·토큰을 만드세요.`);
