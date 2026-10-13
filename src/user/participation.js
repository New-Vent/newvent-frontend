/**
 * 서버 모드의 참여 — 이벤트 페이지(iframe)가 올린 nv-participate 를 받아 참여 API 를 부른다.
 *
 * ★ 요청은 여기서 보낸다. 페이지 안(event-runtime.js)은 입력을 모아 알리기만 한다 —
 *   로그인 토큰이 이 앱에만 있고, 페이지 HTML 은 LLM 이 만든 것이라 토큰을 넘기지 않는다
 * ★ 받았다는 표시로 preventDefault 를 부른다. 안 부르면 runtime 이 "미리보기" 안내를 띄운다
 * ★ 목업 모드는 src/shared/preview/frame.js · actions.js 의 예전 흐름을 그대로 쓴다
 */

import { esc } from '@shared/dom.js'
import { icon } from '@shared/icons.js'
import { markParticipated } from '@shared/preview/frame.js'
import { participate, participationStatus, USE_SERVER } from '@shared/repo.js'
import { ui } from '@shared/state.js'
import { button } from '@shared/ui/controls.js'
import { modal } from '@shared/ui/modal.js'
import { toast } from '@shared/ui/toast.js'

import { showLoginPrompt } from './actions.js'

/** 이미 참여한 이벤트 — 다시 그려도(iframe 이 새로 떠도) 잠근 상태를 되살린다 (frame.js 가 읽는다) */
function remember(eventId) {
  ui.participated = { ...(ui.participated || {}), [eventId]: true }
}

function liveFrames() {
  return document.querySelectorAll('.event-frame[data-mode="live"]')
}

/** 결과 — resultData.status 는 WON · LOST · PENDING, 없으면 접수만 된 것이다 (사전예약 · 기록만 하는 기본형) */
function showServerResult(result) {
  const data = result?.resultData || {}
  const won = data.status === 'WON'
  const title = won ? '축하해요, 당첨됐어요!'
    : data.status === 'LOST' ? '아쉽지만 이번에는 당첨되지 않았어요'
    : '참여가 접수되었어요'
  const detail = won ? '<strong>' + esc(data.prizeName || '') + '</strong>'
    : data.status === 'PENDING' ? '<p>결과는 이벤트가 끝난 뒤 내 혜택에서 확인할 수 있어요.</p>'
    : ''
  modal('나의 참여 결과',
    '<div class="result-stamp">' + icon(won ? 'gift' : 'clock') + '</div>'
      + '<h3 class="result-title">' + title + '</h3>'
      + (detail ? '<div class="result-body">' + detail + '</div>' : ''),   // 덧붙일 말이 없으면 빈 상자를 그리지 않는다
    button('close', '닫기') + button('route', '내 혜택에서 보기', 'data-route="my"', 'btn primary'))
}

let sending = false

async function onParticipate(ev) {
  const frame = ev.target
  if (!USE_SERVER || !frame?.matches?.('.event-frame[data-mode="live"]')) return
  ev.preventDefault()                       // 받았다 — runtime 이 미리보기 안내를 띄우지 않는다

  const { eventId, payload } = ev.detail || {}
  if (!eventId) return
  if (!ui.logged) return showLoginPrompt()
  if (sending) return                       // 연타 — 서버도 (event, user) 유니크로 막지만 요청을 두 번 보내지 않는다
  sending = true
  try {
    const result = await participate(eventId, payload || {})
    remember(eventId)
    markParticipated(frame)
    showServerResult(result)
  } catch (err) {
    // PARTICIPATION409-0 — 다른 기기 · 탭에서 이미 참여했다. 화면만 맞춘다
    if (err?.code === 'PARTICIPATION409-0') { remember(eventId); markParticipated(frame) }
    toast(err?.message || '참여하지 못했어요. 잠시 후 다시 시도해 주세요.')
  } finally {
    sending = false
  }
}

/** 로그인한 사용자가 이미 참여했으면 페이지를 잠근다. 실패해도 조용히 둔다 — 참여 API 가 다시 막는다 */
export async function loadParticipationStatus(eventId) {
  if (!USE_SERVER || !ui.logged || !eventId) return
  try {
    const status = await participationStatus(eventId)
    if (!status?.participated) return
    remember(eventId)
    liveFrames().forEach((frame) => {
      if (frame.contentDocument?.body?.dataset.eventId === String(eventId)) markParticipated(frame)
    })
  } catch { /* 상태를 못 읽어도 페이지는 그대로 쓴다 */ }
}

export function bindParticipation() {
  document.addEventListener('nv-participate', onParticipate)
}
