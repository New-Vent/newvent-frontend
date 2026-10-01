/**
 * 데이터 접근 계층.
 *
 * 뷰는 이 모듈만 부른다. 백엔드가 붙기 전에는 목업(state.db)이 응답하고,
 * 붙으면 같은 함수가 서버를 부른다 — **뷰는 한 줄도 안 바뀐다.**
 *
 * 응답은 항상 state.db 와 같은 모양으로 맞춰 넣는다. 뷰가 여전히
 * state.db 를 동기적으로 읽기 때문이다(전체 재렌더 구조). 즉 state.db 는
 * 서버 모드에서 **클라이언트 캐시** 역할을 한다.
 *
 * 계약: docs/API.md
 */

import { version } from '@shared/selectors.js'

import { AUTH_ENABLED } from './api.js'
import { state, ui } from './state.js'
import { persist } from './persist.js'
import { DEMO_DATE, USER_ID } from './constants.js'
import { initialDatabase } from './mock/fixtures.js'

/**
 * 서버를 쓸지 목업을 쓸지 — 인증과 같은 스위치(VITE_API_AUTH) 하나로 정한다.
 *   on   로그인 · 데이터 모두 실제 서버
 *   off  전부 목업
 *
 * ★ 화면 단위로 하나씩 붙이는 중이다. 아직 붙이지 않은 화면은 on 이어도 목업(state.db)으로 돈다.
 *   붙인 화면: 관리자 이벤트 목록(나의 이벤트 · 게시중 · 휴지통) · 삭제 · 복구 · 영구 삭제
 */
export const USE_SERVER = AUTH_ENABLED

let api = null

/** 앱 셸이 시작할 때 한 번 주입한다. 목업 모드면 안 불러도 된다. */
export function useApi(client) {
  api = client
}

function requireApi() {
  if (!api) throw new Error('repo: useApi() 로 API 클라이언트를 먼저 주입하세요')
  return api
}

/* ────────────────────────── 조회 ────────────────────────── */

export async function loadEvents() {
  if (!USE_SERVER) return state.db.events.filter((e) => !e.deletedAt)
  const { events } = await requireApi().get('/api/events')
  mergeEvents(events)
  return events
}

/**
 * 관리자 이벤트 목록 · 휴지통 — 서버 페이지를 끝까지 모은다 (50개씩).
 *
 * ★ 전부 모으는 이유 — 탭(게시중) · 상태 · 기간 · 개수 · ID 검색을 화면이 계산한다.
 *   서버는 아직 진행 상태 필터 · ID 검색 · 요약 개수를 주지 않는다. 수백 개를 넘으면 서버 필터로 옮긴다.
 *
 * @returns {Promise<Array<{id:number,name:string,status:string,startAt:string|null,endAt:string|null,
 *                          updatedAt:string,template:string|null,grade:string,closingSoon:boolean}>>}
 */
export async function loadAdminEvents({ deleted = false } = {}) {
  if (!USE_SERVER) return state.db.events.filter((e) => (deleted ? !!e.deletedAt : !e.deletedAt))
  const path = deleted ? '/api/admin/events/trash' : '/api/admin/events'
  const out = []
  for (let page = 0; ; page++) {
    const d = await requireApi().get(`${path}?page=${page}&size=50`)
    out.push(...d.content)
    if (page + 1 >= d.totalPages || d.content.length === 0) return out
  }
}

export async function loadParticipations() {
  if (!USE_SERVER) return state.db.participations.filter((p) => p.userId === USER_ID)
  const { participations } = await requireApi().get('/api/me/participations')
  state.db.participations = participations.map((p) => ({ ...p, userId: USER_ID }))
  return participations
}

/* ────────────────────────── 변경 ────────────────────────── */

/**
 * 이벤트 만들기 — DRAFT 로 생긴다. 페이지는 아직 없다 (startGenerate 로 만든다).
 *
 * @param {{name:string,startAt:string,endAt:string,grade:'NORMAL'|'EXCELLENT'|'BEST',templateKey?:string}} draft
 * ★ 서버 모드는 state.db 에 넣지 않는다 — 목록 · 편집 화면이 서버에서 다시 읽는다
 */
export async function createEvent(draft) {
  if (!USE_SERVER) throw new Error('목업 모드에서는 views/create.js 가 직접 만든다')
  return requireApi().post('/api/admin/events', draft)
}

/** 관리자 이벤트 상세 — 이름 · 기간 · 등급 · 템플릿 · 상태 */
export async function loadAdminEvent(eventId) {
  return requireApi().get(`/api/admin/events/${eventId}`)
}

/**
 * 페이지 생성 시작 → { jobId, phase, percent }. 결과는 generationStatus 로 폴링한다.
 *   템플릿 이벤트           {}                              — 이벤트의 템플릿으로 (모델을 안 부른다)
 *   백지                    { requestText }                 — 모델이 만든다 (≤ 500자)
 *   템플릿 이벤트를 백지로  { templateCode: '', requestText }
 */
export async function startGenerate(eventId, body) {
  return requireApi().post(`/api/admin/events/${eventId}/generate`, body)
}

/** 생성 · 수정 작업 상태 → { phase, label, percent, done, attempt, message, versionId } */
export async function generationStatus(eventId, jobId) {
  return requireApi().get(`/api/admin/events/${eventId}/generate/${jobId}`)
}

/** 작업 중단 요청 — 즉시 멈추지 않는다. 폴링하면 CANCELLED 로 끝난다 */
export async function cancelGeneration(eventId, jobId) {
  return requireApi().del(`/api/admin/events/${eventId}/generate/${jobId}`)
}

/**
 * 최신 버전 미리보기 → { html, versionId, versionNo, editableTexts }. 페이지가 아직 없으면 null.
 * ★ html 은 조각이다 — 래퍼 · 테마 · 유의사항은 있고 <link> 는 없다. 스타일은 화면이 붙인다
 */
export async function loadPreview(eventId) {
  try {
    return await requireApi().get(`/api/admin/events/${eventId}/preview`)
  } catch (e) {
    if (e?.status === 404) return null
    throw e
  }
}

/**
 * AI 대화 수정 시작 → { jobId, phase, percent }. 결과는 generationStatus 로 폴링한다 (생성과 같은 작업 자리).
 * ★ 기준은 항상 **최신 버전** 이다 — 다른 버전에서 이어 가려면 restoreVersion 으로 먼저 최신으로 가져온다
 * ★ 채팅 내역은 서버에 남지 않는다 (ChatMessage 저장 미구현) — 화면이 세션 동안만 들고 있다
 * @param {string[]} [blocks] 미리보기에서 고른 영역(data-block). 있으면 그 영역만 고친다 (최대 4).
 *                            비면 보내지 않는다 — 서버가 요청문으로 영역을 정한다. 유의사항 · 없는 영역은 400 (EDIT400-0)
 */
export async function startEdit(eventId, requestText, blocks = []) {
  return requireApi().post(`/api/admin/events/${eventId}/edit`,
    blocks.length ? { requestText, blocks } : { requestText })
}

/**
 * 직접 수정 → { versionId, versionNo } (새 버전)
 * @param {{sourceVersionId:number, edits?:{index:number,before:string,after:string}[],
 *          buttonStyle?:{background?:string,color?:string,size?:string,shape?:string}}} body
 * ★ index · before 는 미리보기의 editableTexts 그대로. before 가 다르면 409 (화면이 최신이 아님)
 */
export async function directEdit(eventId, body) {
  return requireApi().post(`/api/admin/events/${eventId}/versions/direct-edit`, body)
}

/**
 * 저장한 버전(체크포인트) 목록 → { eventId, title, versions:[{versionId,versionNo,createdAt,published,sourceVersionNo,requestContent}] }
 * ★ 생성 · 수정마다 버전 행은 생기지만 "버전 저장" 한 것만 여기 나온다
 */
export async function loadVersions(eventId) {
  return requireApi().get(`/api/admin/events/${eventId}/versions`)
}

/** 저장한 버전 하나 → { versionId, versionNo, createdAt, htmlContent } (슬롯이 비어 있는 저장본) */
export async function loadVersion(eventId, versionId) {
  return requireApi().get(`/api/admin/events/${eventId}/versions/${versionId}`)
}

/** 버전 저장 — 그 버전을 이력에 남긴다 */
export async function saveCheckpoint(eventId, versionId) {
  return requireApi().put(`/api/admin/events/${eventId}/versions/${versionId}/checkpoint`)
}

/** 버전 저장 해제 — 이력에서 뺀다 (게시 중인 버전은 서버가 막는다) */
export async function removeCheckpoint(eventId, versionId) {
  return requireApi().del(`/api/admin/events/${eventId}/versions/${versionId}/checkpoint`)
}

export async function saveVersion(eventId, { source, summary, snapshot }) {
  if (!USE_SERVER) throw new Error('목업 모드에서는 views/versions.js 가 직접 만든다')
  const version = await requireApi().post(`/api/admin/events/${eventId}/versions`, {
    source,
    summary,
    snapshot,
  })
  findEvent(eventId)?.versions.push(version)
  return version
}

/**
 * 게시 · 재게시 → 이벤트 상세 (status 가 PUBLISHED 로 바뀐다).
 *   DRAFT → PUBLISHED, 이미 게시 중이면 게시 버전만 바꾼다.
 * ★ 고른 버전이 이력에 없으면(자동 버전) 서버가 게시하면서 버전 저장까지 한다
 * ★ 종료(ENDED)된 이벤트는 409 (EVENT409-5), 다른 이벤트의 버전은 404
 * 목업 모드는 main.js 가 state 를 직접 바꾼다 — 여기로 오지 않는다
 */
export async function publishEvent(eventId, versionId) {
  if (!USE_SERVER) throw new Error('목업 모드에서는 main.js 가 직접 게시한다')
  return requireApi().post(`/api/admin/events/${eventId}/publish`, { versionId })
}

export async function deleteEvent(eventId) {
  if (!USE_SERVER) {
    const e = findEvent(eventId)
    if (e) e.deletedAt = new Date().toISOString()
    persist()
    return
  }
  // ★ 서버 모드는 state.db 를 건드리지 않는다 — 목록은 화면이 다시 불러 온다
  await requireApi().del(`/api/admin/events/${eventId}`)
}

export async function restoreEvent(eventId) {
  if (!USE_SERVER) {
    const e = findEvent(eventId)
    if (e) delete e.deletedAt
    persist()
    return
  }
  return requireApi().post(`/api/admin/events/${eventId}/restore`)
}

/** 영구 삭제 — 휴지통에 있는 것만. 서버: DELETE /api/admin/events/{id}/permanent */
export async function purgeEvent(eventId) {
  if (!USE_SERVER) {
    state.db.events = state.db.events.filter((x) => x.id !== eventId)
    state.db.participations = state.db.participations.filter((p) => p.eventId !== eventId)
    persist()
    return
  }
  await requireApi().del(`/api/admin/events/${eventId}/permanent`)
}

export async function participate(eventId, payload) {
  if (!USE_SERVER) throw new Error('목업 모드에서는 user/actions.js 가 직접 만든다')
  const p = await requireApi().post(`/api/events/${eventId}/participations`, payload)
  state.db.participations.push({ ...p, userId: USER_ID })
  return p
}

/* ──────────────────── LLM 생성 (SSE) ──────────────────── */

/**
 * 생성·수정 스트림을 연다.
 *
 * ★ EventSource 를 쓸 수 없다 — 이 엔드포인트는 POST 이고
 *   Authorization 헤더가 필요한데, EventSource 는 GET 전용에
 *   커스텀 헤더를 못 붙인다. 그래서 fetch + ReadableStream 으로 직접 읽는다.
 *
 * ★ 열기 전에 api.ensureFresh() 를 부른다 — 스트림 도중 토큰이 만료되면
 *   401 재시도가 통하지 않아 끊어진 스트림을 되살릴 수 없다.
 *
 * @param {string} eventId
 * @param {{prompt: string, blockKey?: string, baseVersion?: number}} body
 * @param {{signal?: AbortSignal, onEvent: (ev: object) => void}} handlers
 */
export async function generate(eventId, body, { signal, onEvent }) {
  if (!USE_SERVER) return mockGenerate(body, { signal, onEvent })

  const client = requireApi()
  const token = await client.ensureFresh()

  const res = await fetch(`/api/admin/events/${eventId}/generate`, {
    method: 'POST',
    signal,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })

  if (!res.ok || !res.body) {
    const message = await res.json().then((d) => d.message).catch(() => null)
    throw new Error(message || `생성 요청에 실패했습니다 (${res.status})`)
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      buffer = drainFrames(buffer, onEvent)
    }
    // 마지막 프레임이 빈 줄 없이 끝났을 수 있다.
    if (buffer.trim()) {
      const tail = parseFrame(buffer)
      if (tail !== null) onEvent(tail)
    }
  } finally {
    reader.cancel().catch(() => {})
  }
}

/**
 * 버퍼에서 완성된 SSE 프레임을 모두 꺼내 onEvent 로 넘기고, 남은 조각을 돌려준다.
 * 구분자는 빈 줄이며 \n\n 과 \r\n\r\n 을 모두 받는다.
 */
function drainFrames(buffer, onEvent) {
  const SEP = /\r?\n\r?\n/
  while (true) {
    const m = SEP.exec(buffer)
    if (!m) return buffer
    const frame = buffer.slice(0, m.index)
    buffer = buffer.slice(m.index + m[0].length)
    const payload = parseFrame(frame)
    if (payload !== null) onEvent(payload)
  }
}

/** `data:` 줄만 모아 JSON 으로 만든다. 주석(`:`)과 다른 필드는 무시. */
function parseFrame(frame) {
  const data = frame
    .split(/\r?\n/)
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trimStart())
    .join('\n')
  if (!data) return null
  try {
    return JSON.parse(data)
  } catch {
    console.warn('[newvent] SSE 프레임을 JSON 으로 못 읽었습니다:', data.slice(0, 120))
    return null
  }
}


/**
 * 목업 스트림. 백엔드 없이 진행 표시·중단을 시험하려고 둔다.
 * 실제 블록 HTML 은 만들지 않는다 — views/editor.js 의 localResponse 가 한다.
 */
function mockGenerate(body, { signal, onEvent }) {
  return new Promise((resolve, reject) => {
    const steps = [
      { type: 'status', phase: 'prompting', attempt: 1, maxAttempts: 3 },
      { type: 'status', phase: 'generating', attempt: 1, maxAttempts: 3 },
      { type: 'status', phase: 'validating', attempt: 1, maxAttempts: 3 },
      { type: 'done', version: null },
    ]
    let i = 0
    const timer = setInterval(() => {
      if (signal?.aborted) {
        clearInterval(timer)
        reject(new DOMException('중단됨', 'AbortError'))
        return
      }
      onEvent(steps[i++])
      if (i >= steps.length) {
        clearInterval(timer)
        resolve()
      }
    }, 600)
  })
}

/* ────────────────────────── 보조 ────────────────────────── */

function findEvent(id) {
  return state.db.events.find((e) => e.id === id)
}

/** 서버 응답을 state.db 에 반영한다. 기존 항목은 덮어쓰고 없으면 추가. */
function mergeEvents(events) {
  for (const incoming of events) {
    const existing = findEvent(incoming.id)
    if (existing) Object.assign(existing, incoming)
    else state.db.events.push(incoming)
  }
}

/** 목업 데이터를 처음 상태로 되돌린다. */
export function resetMock() {
  state.db = initialDatabase()
  ui.votes = {}
  persist()
}

export { DEMO_DATE }
