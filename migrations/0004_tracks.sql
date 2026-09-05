-- 트랙(카테고리 유형): paper(논문) | capstone(캡스톤). 프로젝트는 생성 시 카테고리의 트랙을 물려받는다.
ALTER TABLE categories ADD COLUMN track TEXT NOT NULL DEFAULT 'paper';
ALTER TABLE projects ADD COLUMN track TEXT NOT NULL DEFAULT 'paper';

-- 프로젝트 협업자 (캡스톤 팀원 등): 담당자와 같은 편집·기록 권한
CREATE TABLE IF NOT EXISTS project_collaborators (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by   TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_collab_user ON project_collaborators(user_id);
