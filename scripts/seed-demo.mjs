#!/usr/bin/env node
/**
 * 데모 데이터 시드 — 카테고리 2개, 연구원 4명, 프로젝트 4개, 날짜별 기록·코멘트·할 일
 *
 *   BASE_URL=http://127.0.0.1:8787 ADMIN_TOKEN=rn_... node scripts/seed-demo.mjs
 *
 * 이미 같은 이름의 카테고리가 있으면 건너뜁니다. 생성된 연구원 토큰을 출력하므로 데모 로그인에 쓸 수 있습니다.
 */
const BASE = (process.env.BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const ADMIN = process.env.ADMIN_TOKEN;
if (!ADMIN) { console.error("ADMIN_TOKEN 환경변수가 필요합니다"); process.exit(2); }

async function api(token, method, path, body, client = "web") {
  const r = await fetch(BASE + path, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Client": client }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${data.message || ""}`);
  return data;
}
const d = (daysAgo) => new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10);

(async () => {
  const existing = await api(ADMIN, "GET", "/api/admin/categories");
  if (existing.some((c) => c.name === "LLM 응용")) { console.log("이미 데모 데이터가 있습니다 (카테고리 'LLM 응용' 존재). 종료."); return; }

  const llm = await api(ADMIN, "POST", "/api/admin/categories", { name: "LLM 응용", id: "llm", description: "대규모 언어모델을 금융·산업 문제에 적용하는 연구 그룹. RAG, 에이전트, 평가 방법론." });
  const ts = await api(ADMIN, "POST", "/api/admin/categories", { name: "시계열 예측", id: "timeseries", description: "금융·에너지 시계열 예측과 인과추론." });

  const mk = (name, id, cats, email = "") => api(ADMIN, "POST", "/api/admin/users", { name, id, email, categories: cats, issue_token: true });
  const kim = await mk("김지원", "jiwon", [{ category_id: llm.id, role: "lead" }, { category_id: ts.id, role: "member" }], "jiwon@example.ac.kr");
  const lee = await mk("이서준", "seojun", [llm.id], "seojun@example.ac.kr");
  const park = await mk("박하은", "haeun", [llm.id, { category_id: ts.id, role: "lead" }], "haeun@example.ac.kr");
  const choi = await mk("최민재", "minjae", [ts.id], "minjae@example.ac.kr");
  const T = { kim: kim.token, lee: lee.token, park: park.token, choi: choi.token };

  // ---- 프로젝트 1: 이서준 (LLM) — 실험 단계
  const p1 = await api(T.lee, "POST", "/api/projects", { category_id: llm.id, title: "금융 공시 문서 RAG 의 환각 억제: 근거 인용 강제 디코딩", summary: "RAG 답변에 근거 문단 인용을 강제하면 환각률이 얼마나 줄고 유용성은 얼마나 손해 보는가?", target_venue: "ACL 2027", deadline: d(-120), tags: "RAG,환각,금융" });
  await api(T.lee, "PUT", `/api/projects/${p1.id}/stages/planning`, { status: "done", summary: "## 연구 질문\n근거 인용 강제(citation-constrained decoding)가 금융 공시 QA 의 환각률을 낮추는가?\n\n## 가설\n- H1: 인용 강제 시 환각률 30% 이상 감소\n- H2: 답변 유용성(사람 평가) 손실은 5% 이내\n\n## 기여점\n1. 공시 문서 QA 환각 벤치마크 (DART 기반, 1,200문항)\n2. 인용 강제 디코딩 알고리즘\n3. 유용성-충실성 trade-off 분석" });
  await api(T.lee, "PUT", `/api/projects/${p1.id}/stages/literature`, { status: "done", summary: "## 핵심 선행연구\n| 논문 | 접근 | 한계 |\n|---|---|---|\n| Self-RAG (2023) | 반성 토큰 | 학습 필요 |\n| ALCE (2023) | 인용 평가 | 디코딩 미개입 |\n| FActScore | 원자적 사실 검증 | 도메인 일반 |\n\n## 차별점\n학습 없이 디코딩 단계에서 인용 제약을 거는 첫 금융 도메인 연구" });
  await api(T.lee, "PUT", `/api/projects/${p1.id}/stages/method`, { status: "done", summary: "## 방법\n- 베이스: Qwen2.5-7B-Instruct, bge-m3 리트리버 (top-5)\n- 제약 디코딩: 문장 종료 시 [n] 인용 토큰 강제, 인용 문단과 NLI 점수 < 0.6 이면 재생성 (최대 3회)\n- 비교군: vanilla RAG, Self-RAG, 프롬프트만 인용 요청" });
  await api(T.lee, "PUT", `/api/projects/${p1.id}/stages/experiment`, { status: "doing", summary: "## 현재까지\n- 환각률: vanilla 23.1% → 제약 14.8% (−36%)\n- 유용성: 4.21 → 4.05 (−3.8%)\n- 지연: +41% (재생성 때문)\n\n## 남은 것\n- 시드 5개 반복\n- 재생성 횟수 상한 민감도", set_current: true });
  const e1 = await api(T.lee, "POST", `/api/projects/${p1.id}/entries`, { date: d(12), stage: "experiment", title: "vanilla RAG baseline 완료 — 환각률 23.1%", content: "## 한 일\n- DART 공시 QA 1,200문항으로 vanilla RAG 실행 (`run_baseline.py --top_k 5`)\n- FActScore 방식으로 환각률 자동 채점\n\n## 결과\n| 설정 | 환각률 | 유용성(GPT-4 judge) |\n|---|---|---|\n| vanilla RAG | 23.1% | 4.21 |\n\n## 다음 할 일\n- [ ] 제약 디코딩 구현\n- [ ] 사람 평가 파일럿 50문항\n\n## 메모\n- 숫자 단위(억/백만) 혼동이 환각의 31%. 전처리로 잡을 수 있을 듯" });
  const e2 = await api(T.lee, "POST", `/api/projects/${p1.id}/entries`, { date: d(6), stage: "method", title: "인용 강제 디코딩 구현 (NLI 재생성 루프)", content: "## 한 일\n- 문장 경계마다 인용 토큰 강제하는 logits processor 구현\n- 인용 문단-문장 NLI(DeBERTa-v3) 점수 < 0.6 이면 재생성\n\n## 결과\n- 단위 테스트 통과. 재생성 평균 1.4회\n\n## 다음 할 일\n- [x] 200문항 파일럿\n- [ ] 전체 1,200문항\n\n## 메모\n- 재생성 상한 3회 넘으면 마지막 후보 채택. 상한 민감도 봐야 함" });
  const e3 = await api(T.lee, "POST", `/api/projects/${p1.id}/entries`, { date: d(2), stage: "experiment", title: "제약 디코딩 전체 실험 — 환각률 14.8% (−36%), 유용성 −3.8%", content: "## 한 일\n- 1,200문항 전체 실행, 시드 1개\n\n## 결과\n| 설정 | 환각률 | 유용성 | 지연(s) |\n|---|---|---|---|\n| vanilla | 23.1% | 4.21 | 2.3 |\n| 프롬프트 인용 | 19.4% | 4.18 | 2.4 |\n| Self-RAG | 16.9% | 3.97 | 3.1 |\n| **제약 디코딩(ours)** | **14.8%** | 4.05 | 3.3 |\n\n## 다음 할 일\n- [ ] 시드 5개 반복 후 신뢰구간\n- [ ] 재생성 상한 {1,2,3,5} 민감도\n\n## 메모\n- H1(−30%) 충족, H2(−5% 이내) 충족. 지연 +41% 는 논문에서 정직하게 다룰 것", review_status: "requested" });
  await api(T.kim, "POST", `/api/entries/${e3.id}/comments`, { content: "결과 좋네요. 시드 1개로는 표 못 실으니 5개 반복 먼저, 그리고 유용성 사람 평가 파일럿(50문항)도 같이 돌리세요. 지연은 재생성 상한 2로 낮췄을 때 trade-off 를 부록에." });
  await api(T.kim, "POST", `/api/entries/${e3.id}/review`, { status: "changes_requested", note: "시드 반복 + 사람 평가 추가 후 다시 요청" });
  await api(T.park, "POST", `/api/entries/${e1.id}/comments`, { content: "단위 혼동 31% 는 전처리 결과도 별도 행으로 넣으면 리뷰어가 좋아할 듯." });
  await api(T.kim, "POST", `/api/projects/${p1.id}/tasks`, { title: "시드 5개 반복 실험 + 95% CI", due: d(-3), assignee_id: lee.user.id, stage: "experiment" });
  await api(T.kim, "POST", `/api/projects/${p1.id}/tasks`, { title: "사람 평가 파일럿 50문항 (평가자 2명)", due: d(-7), assignee_id: lee.user.id, stage: "experiment" });
  const t3 = await api(T.lee, "POST", `/api/projects/${p1.id}/tasks`, { title: "재생성 상한 민감도 {1,2,3,5}", stage: "experiment" });
  await api(T.lee, "PATCH", `/api/tasks/${t3.id}`, { status: "doing" });

  // ---- 프로젝트 2: 김지원 (LLM) — 논문작성 단계
  const p2 = await api(T.kim, "POST", "/api/projects", { category_id: llm.id, title: "LLM 에이전트의 도구 호출 신뢰성 벤치마크", summary: "도구 호출 실패 유형을 분류하고 모델별 실패율을 측정하는 벤치마크", target_venue: "NeurIPS 2026 D&B", deadline: d(-30), tags: "에이전트,벤치마크", stage: "writing" });
  for (const s of ["planning", "literature", "method", "experiment"]) await api(T.kim, "PUT", `/api/projects/${p2.id}/stages/${s}`, { status: "done", summary: `(${s} 정리 — 초고 v2 반영 완료)` });
  await api(T.kim, "PUT", `/api/projects/${p2.id}/stages/writing`, { status: "doing", summary: "## 초고 진행\n- [x] 1 Intro\n- [x] 2 Related\n- [x] 3 Benchmark 설계\n- [x] 4 실험\n- [ ] 5 분석 (실패 유형별)\n- [ ] 6 결론\n- [ ] 부록: 프롬프트 전문" });
  await api(T.kim, "POST", `/api/projects/${p2.id}/entries`, { date: d(9), stage: "writing", title: "초고 v2 — 4장 실험 절 완성, 그림 3·4 추가", content: "## 한 일\n- 4.2 모델별 실패율 표, 그림 3(실패 유형 분포), 그림 4(재시도 효과)\n\n## 다음 할 일\n- [ ] 5장 분석\n- [ ] 공저자 코멘트 반영\n\n## 메모\n- 페이지 초과 1쪽. 부록으로 뺄 표 결정 필요" });
  await api(T.kim, "POST", `/api/projects/${p2.id}/entries`, { date: d(1), stage: "writing", title: "5장 분석 초안 — 실패 유형 6개로 분류", content: "## 한 일\n- 스키마 오류 / 인자 환각 / 순서 오류 / 조기 종료 / 무한 재시도 / 권한 오인 6개 유형\n\n## 결과\n- 인자 환각이 전체의 44% 로 지배적\n\n## 다음 할 일\n- [ ] 결론 + 한계\n- [ ] 부록 프롬프트" });
  await api(T.kim, "POST", `/api/projects/${p2.id}/tasks`, { title: "6장 결론·한계 작성", due: d(-2), assignee_id: kim.user.id, stage: "writing" });

  // ---- 프로젝트 3: 박하은 (시계열) — 리서치 단계 (MCP 로 기록된 예)
  const p3 = await api(T.park, "POST", "/api/projects", { category_id: ts.id, title: "전력 수요 예측에서 파운데이션 모델의 few-shot 전이 한계", summary: "TimesFM·Chronos 등 시계열 파운데이션 모델이 국내 전력 수요에 얼마나 전이되는가", target_venue: "KDD 2027", tags: "시계열,파운데이션모델,전력", stage: "literature" });
  await api(T.park, "PUT", `/api/projects/${p3.id}/stages/planning`, { status: "done", summary: "## 연구 질문\n영어권 데이터로 사전학습된 시계열 FM 이 한국 전력수요(계절·공휴일 특성)에 zero/few-shot 으로 얼마나 전이되는가?\n\n## 가설\n- 명절 효과가 큰 구간에서 전이 실패가 집중된다" });
  await api(T.park, "PUT", `/api/projects/${p3.id}/stages/literature`, { status: "doing", summary: "## 문헌 정리 (진행 중)\n- TimesFM, Chronos, Moirai, Lag-Llama 비교표 작성 중\n- 국내 전력 예측: KPX 공개 데이터 사용 논문 7편" });
  await api(T.park, "POST", `/api/projects/${p3.id}/entries`, { date: d(4), stage: "literature", title: "시계열 FM 4종 비교표 작성 (사전학습 데이터·컨텍스트 길이·라이선스)", content: "## 한 일\n- TimesFM / Chronos / Moirai / Lag-Llama 논문 정독, 비교표\n\n## 결과\n| 모델 | 컨텍스트 | 사전학습 데이터 | 라이선스 |\n|---|---|---|---|\n| TimesFM | 512 | 100B pts | Apache |\n| Chronos | 512 | 84B pts | Apache |\n| Moirai | 5000 | LOTSA 27B | Apache |\n\n## 다음 할 일\n- [ ] KPX 시간별 수요 2019-2025 확보\n- [ ] zero-shot 파이프라인" }, "mcp");
  await api(T.park, "POST", `/api/projects/${p3.id}/entries`, { date: d(0), stage: "literature", title: "국내 전력수요 예측 논문 7편 정리 — 명절 처리 방식 비교", content: "## 한 일\n- 7편 중 5편이 명절을 더미 변수, 2편이 별도 모델\n\n## 메모\n- FM 은 명절 변수 입력 불가 → 프롬프트/공변량 확장 필요. 이게 방법론 핵심이 될 듯" }, "mcp");
  await api(T.park, "POST", `/api/projects/${p3.id}/tasks`, { title: "KPX 시간별 수요 데이터 확보 (2019–2025)", due: d(-5), assignee_id: choi.user.id, stage: "experiment" });

  // ---- 프로젝트 4: 최민재 (시계열) — 기획, 정체
  const p4 = await api(T.choi, "POST", "/api/projects", { category_id: ts.id, title: "합성 제어법과 딥러닝 결합한 정책 효과 추정", summary: "SCM 의 가중치 추정을 신경망으로 대체했을 때 편향-분산", tags: "인과추론,SCM" });
  await api(T.choi, "POST", `/api/projects/${p4.id}/entries`, { date: d(21), stage: "planning", title: "연구 아이디어 정리 — SCM + NN 가중치", content: "## 메모\n- Abadie SCM 의 볼록 가중 제약을 NN 으로 완화하면 과적합 위험. 정규화 어떻게?\n- 지도교수 미팅에서 범위 좁히기로" });

  console.log(`\n✅ 데모 데이터 생성 완료 (${BASE})`);
  console.log("데모 로그인 토큰 (지금만 표시):");
  console.log(`  김지원 (LLM 리드 / 시계열 구성원): ${T.kim}`);
  console.log(`  이서준 (LLM 구성원)                : ${T.lee}`);
  console.log(`  박하은 (LLM 구성원 / 시계열 리드) : ${T.park}`);
  console.log(`  최민재 (시계열 구성원)             : ${T.choi}`);
})().catch((e) => { console.error("실패:", e.message); process.exit(1); });
