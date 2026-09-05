---
description: 프로젝트 진행 보고서(마크다운)를 받아 주간 보고 초안을 만든다
argument-hint: <프로젝트 ID> [from=YYYY-MM-DD] [to=YYYY-MM-DD]
allowed-tools: mcp__research-note__*
---

`get_report` 로 "$ARGUMENTS" 에 지정된 프로젝트의 보고서를 받아 주간 보고 초안을 작성하세요.

- 인자에 from/to 가 있으면 기간을 그대로 넘기고, 없으면 최근 7일(from=오늘-7일)로 합니다.
- 초안 구성: 진행 요약(3줄) / 핵심 결과(표 또는 목록) / 막힌 점 / 다음 주 계획 / 검토 요청 사항.
- 보고서에 없는 내용을 지어내지 않습니다. 사용자가 원하면 `log_progress` 에 "주간 정리" 제목, stage=review 로 저장하고 `request_review: true` 로 검토를 요청합니다.
