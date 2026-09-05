---
description: 내 논문 프로젝트와 팀 상황을 연구노트에서 읽어 요약한다
argument-hint: [프로젝트 ID 또는 카테고리 ID]
allowed-tools: mcp__research-note__*
---

연구노트에서 현재 상황을 읽어 간단히 요약하세요.

- 인자 "$ARGUMENTS" 가 프로젝트 ID(prj_...)면 `get_project`, 카테고리 ID면 `team_overview`, 비어 있으면 `whoami` + 내 프로젝트 각각의 `get_project`.
- 요약 형식: 프로젝트별로 현재 단계 / 마지막 기록일 / 미완료 할 일 / 검토 대기, 그리고 "이번 주 해야 할 것" 제안 3개 이내.
- 팀 피드(`team_feed`)에서 최근 3일 내 팀원 활동이 있으면 한 줄씩 덧붙입니다.
