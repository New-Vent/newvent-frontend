import { html } from '@shared/dom.js'

/**
 * 이벤트 제작 스튜디오 — 이 프로젝트에서 가장 무거운 화면.
 *
 * 3분할: 이벤트 폼 / AI 채팅 / iframe 미리보기
 *
 * 옮겨올 원본:
 *   editorView · setEditorMode · updateEditor
 *   chatBody · refreshChat · addChat · handlePrompt · stopRequest · requestStatusView
 *   applySelection · showSelectedTarget · selectionCaption · highlightEditingText
 *   markEditableText · applyContentEdits · refreshContentEditor
 *   buttonEditor · refreshButtonEditor · editButton · applyButtonStyle
 *   bindFrame · fullFrame · templateDocument
 *
 * 남은 과제 (프로토타입에 없던 것):
 *   - localResponse 를 실제 API + SSE 로 교체
 *   - Stop 을 AbortController 로 연결하고 서버까지 취소 전파
 *   - notices 블록은 서버 소유 — 클릭 대상에서 제외
 */
export function editorView({ params }) {
  return html`<div class="container"><h1>편집 ${params.id}</h1><p>TODO: editorView 이식</p></div>`
}
