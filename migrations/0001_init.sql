-- 연구노트 초기 스키마 (D1 / SQLite)
-- 논문 흐름: planning(기획) → literature(리서치) → method(관련기법) → experiment(실험결과) → writing(논문작성) → review(검토·투고)

CREATE TABLE IF NOT EXISTS categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  color       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL DEFAULT '',
  role         TEXT NOT NULL DEFAULT 'member',   -- admin | member
  note         TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  disabled_at  TEXT,
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS memberships (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member',    -- lead | member
  created_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, category_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_category ON memberships(category_id);

CREATE TABLE IF NOT EXISTS tokens (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  hint         TEXT NOT NULL,                    -- rn_abcd…wxyz (식별용)
  label        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id);

CREATE TABLE IF NOT EXISTS projects (
  id           TEXT PRIMARY KEY,
  category_id  TEXT NOT NULL REFERENCES categories(id),
  owner_id     TEXT NOT NULL REFERENCES users(id),
  title        TEXT NOT NULL,
  summary      TEXT NOT NULL DEFAULT '',         -- 연구 질문 / 한 줄 요약
  stage        TEXT NOT NULL DEFAULT 'planning', -- 현재 단계
  status       TEXT NOT NULL DEFAULT 'active',   -- active | paused | done | archived
  target_venue TEXT NOT NULL DEFAULT '',
  deadline     TEXT,                              -- YYYY-MM-DD
  tags         TEXT NOT NULL DEFAULT '',          -- 쉼표 구분
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);

CREATE TABLE IF NOT EXISTS project_stages (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'todo',        -- todo | doing | done
  summary    TEXT NOT NULL DEFAULT '',            -- 단계별 정리(마크다운) = 논문 해당 절의 뼈대
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (project_id, stage)
);

CREATE TABLE IF NOT EXISTS entries (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id     TEXT NOT NULL REFERENCES users(id),
  date          TEXT NOT NULL,                    -- YYYY-MM-DD (연구일)
  stage         TEXT NOT NULL,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL DEFAULT '',         -- 마크다운
  source        TEXT NOT NULL DEFAULT 'web',      -- web | mcp | api
  review_status TEXT NOT NULL DEFAULT 'none',     -- none | requested | changes_requested | approved
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entries_project_date ON entries(project_id, date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entries_review ON entries(review_status);

CREATE TABLE IF NOT EXISTS comments (
  id         TEXT PRIMARY KEY,
  entry_id   TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  author_id  TEXT NOT NULL REFERENCES users(id),
  content    TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'comment',     -- comment | approve | request_changes
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_entry ON comments(entry_id, created_at);

CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'todo',       -- todo | doing | done
  assignee_id TEXT,
  due         TEXT,
  stage       TEXT,
  created_by  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  done_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, status);

CREATE TABLE IF NOT EXISTS activity (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  actor_id    TEXT,
  category_id TEXT,
  project_id  TEXT,
  action      TEXT NOT NULL,                      -- project.create, entry.create, comment.create, stage.update, task.update, review.update ...
  target_id   TEXT,
  summary     TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT 'web'
);
CREATE INDEX IF NOT EXISTS idx_activity_category ON activity(category_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_activity_project ON activity(project_id, id DESC);
