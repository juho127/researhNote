export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_NAME: string;
  ORG_NAME: string;
  ORG_SUB: string;
  ORG_MARK: string;
  APP_TZ: string;
  /** 최초 관리자(부트스트랩) 토큰. DB 에 관리자를 만든 뒤 제거 가능. */
  ADMIN_TOKEN?: string;
}

export type GlobalRole = "admin" | "member";
export type CategoryRole = "lead" | "member";

export interface User {
  id: string;
  name: string;
  email: string;
  role: GlobalRole;
  note: string;
  created_at: string;
  disabled_at: string | null;
  last_seen_at: string | null;
}

export interface Membership {
  category_id: string;
  category_name: string;
  role: CategoryRole;
}

export interface AuthContext {
  user: User;
  memberships: Membership[];
  tokenId: string | null; // null = ADMIN_TOKEN 부트스트랩
  isAdmin: boolean;
  source: "web" | "mcp" | "api";
}

export const STAGES = [
  "planning",
  "literature",
  "method",
  "experiment",
  "writing",
  "review",
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  planning: "기획",
  literature: "리서치",
  method: "관련기법",
  experiment: "실험결과",
  writing: "논문작성",
  review: "검토·투고",
};

export const STAGE_HINTS: Record<Stage, string> = {
  planning: "연구 질문·가설·기여점·범위",
  literature: "선행연구·문헌 정리·차별점",
  method: "적용 기법·모델·실험 설계",
  experiment: "데이터·실험 결과·분석",
  writing: "초고·그림·표·구성",
  review: "내부 검토·수정·투고·리뷰 대응",
};

export const PROJECT_STATUSES = ["active", "paused", "done", "archived"] as const;
export const STAGE_STATUSES = ["todo", "doing", "done"] as const;
export const TASK_STATUSES = ["todo", "doing", "done"] as const;
export const REVIEW_STATUSES = ["none", "requested", "changes_requested", "approved"] as const;

export function isStage(v: unknown): v is Stage {
  return typeof v === "string" && (STAGES as readonly string[]).includes(v);
}
