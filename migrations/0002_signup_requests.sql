-- 토큰 발급 신청 (공개 신청 → 관리자 승인 → 신청자가 수령 코드로 토큰 수령)
CREATE TABLE IF NOT EXISTS signup_requests (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL DEFAULT '',
  category_id   TEXT,                             -- 희망 카테고리 (승인 시 변경 가능)
  note          TEXT NOT NULL DEFAULT '',         -- 학번·과정·지도교수 등
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  claim_hash    TEXT NOT NULL UNIQUE,             -- 수령 코드 SHA-256
  claim_hint    TEXT NOT NULL,
  user_id       TEXT,                             -- 승인 시 생성된 사용자
  decided_by    TEXT,
  decided_at    TEXT,
  decision_note TEXT NOT NULL DEFAULT '',         -- 거절 사유 / 승인 메모
  claimed_at    TEXT,                             -- 토큰 수령 시각 (1회)
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_signup_status ON signup_requests(status, created_at DESC);
