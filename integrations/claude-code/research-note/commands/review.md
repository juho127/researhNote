---
description: 팀원의 검토 대기 기록을 읽고 코멘트 초안을 만든다 (리드/팀원용)
argument-hint: [카테고리 ID 또는 기록 ID]
allowed-tools: mcp__research-note__*, mcp__plugin_research-note_research-note__*
---

연구노트의 검토 대기 기록을 검토하세요.

1. 인자 "$ARGUMENTS" 가 기록 ID(ent_...)면 `get_entry`, 카테고리 ID면 `team_overview` 의 검토 대기 목록에서 오래된 순으로 최대 3건을 `get_entry` 로 읽습니다. 비어 있으면 `whoami` 로 소속 카테고리를 찾아 진행합니다.
2. 각 기록에 대해 (a) 방법의 타당성 (b) 결과 해석의 근거 (c) 재현에 필요한 정보 누락 (d) 다음 단계 제안 관점에서 코멘트 초안을 작성해 사용자에게 보여줍니다.
3. 사용자가 확인하면 `add_comment` 로 남깁니다. 사용자가 리드이고 승인/수정요청을 원하면 `kind: approve` 또는 `request_changes` 를 씁니다. 사용자 확인 없이 승인하지 않습니다.
