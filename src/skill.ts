// 연구노트 AI 도구용 지침. 단일 소스: integrations/claude-code/research-note/skills/research-note/SKILL.md
// wrangler 의 Text 모듈 규칙(wrangler.jsonc "rules")으로 .md 를 문자열로 임포트한다.
import skillMd from "../integrations/claude-code/research-note/skills/research-note/SKILL.md";

export const SKILL_MD: string = skillMd;

/** initialize 응답의 instructions (짧은 버전). {{USER}} {{TODAY}} 치환. */
export const SKILL_SHORT = `연구노트(Research Note) MCP — {{USER}} 님의 논문 진행 기록 시스템. 오늘: {{TODAY}}.

사용 원칙:
1. 세션 시작 시 whoami → 기록할 프로젝트를 정한다(없으면 사용자에게 묻고, 새 연구일 때만 create_project).
2. 실험·문헌정리·초고작성 등 의미 있는 작업이 끝나면 log_progress 로 기록한다. 본문은 마크다운: ## 한 일 / ## 결과 / ## 다음 할 일 / ## 메모. stage 는 작업이 속한 논문 단계(planning 기획, literature 리서치, method 관련기법, experiment 실험결과, writing 논문작성, review 검토·투고).
3. 누적 결론이 바뀌면 update_stage 로 해당 단계의 정리(논문 절의 뼈대)를 갱신한다 (덮어쓰기이므로 get_project 로 읽고 병합). 단계가 끝나 다음으로 넘어갈 때는 advance_stage (사용자가 원할 때만).
4. '다음 할 일'은 add_task 로 등록하고, 끝나면 update_task 로 done.
5. 사용자가 검토를 원하면 log_progress request_review=true 또는 set_review. 팀원 기록은 team_feed/list_entries 로 읽고 add_comment 로 의견을 남긴다.
6. 기록은 사용자의 언어(기본 한국어)로, 수치·설정·실패 원인을 구체적으로 남긴다. 사용자가 명시하지 않은 내용을 지어내지 않는다.
전체 지침: prompts/get research_note_guide 또는 resource research-note://guide.`;
