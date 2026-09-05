-- 팀 로비 · 자율 가입
-- 카테고리(팀) 가입 정책: open(즉시 가입) | approval(리드·관리자 승인) | closed(초대만)
ALTER TABLE categories ADD COLUMN join_policy TEXT NOT NULL DEFAULT 'approval';

CREATE TABLE IF NOT EXISTS join_requests (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id   TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  message       TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | cancelled
  decided_by    TEXT,
  decided_at    TEXT,
  decision_note TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_join_requests_category ON join_requests(category_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_join_requests_user ON join_requests(user_id, status);
