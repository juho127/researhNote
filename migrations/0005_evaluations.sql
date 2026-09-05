-- 평가 (마일스톤별 평가자 채점·피드백 + 팀 답변)
-- 평가자: 카테고리 role = lead | evaluator, 또는 관리자
CREATE TABLE IF NOT EXISTS evaluations (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage        TEXT NOT NULL,                 -- 평가 대상 마일스톤(단계)
  evaluator_id TEXT NOT NULL REFERENCES users(id),
  title        TEXT NOT NULL DEFAULT '',      -- 예: 1차 보고서 평가, 중간 발표 평가
  scores       TEXT NOT NULL DEFAULT '{}',    -- JSON {axis_id: number}
  total        REAL,                          -- 합계 (루브릭 max 합 기준)
  feedback     TEXT NOT NULL DEFAULT '',      -- 마크다운
  response     TEXT NOT NULL DEFAULT '',      -- 팀 답변 (마크다운)
  response_by  TEXT,
  response_at  TEXT,
  visible      INTEGER NOT NULL DEFAULT 1,    -- 0 이면 평가자·리드·관리자만 열람 (초안)
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_eval_project ON evaluations(project_id, stage, created_at);
