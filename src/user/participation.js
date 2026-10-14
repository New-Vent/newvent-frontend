/**
 * ⚠️ 지금 쓰이지 않는 모듈이다. 그대로 두되, 쓰려면 아래 세 가지를 먼저 손봐야 한다.
 *
 *   1. 아무도 부르지 않는다 — bindParticipation() 호출처가 0곳이다.
 *   2. 지금 import 하면 **깨진다** — repo.js 에 `participationStatus` 라는 이름이 없다.
 *      (있는 것은 `loadParticipationStatus` 다. 이름이 갈린 채로 남았다)
 *   3. 전제가 더 이상 맞지 않는다 — 아래 "원래 설계" 참고.
 *
 * ── 원래 설계 (서버 runtime 방식) ─────────────────────────────
 * 이벤트 페이지 안의 스크립트(event-runtime.js)가 data-behavior 를 보고 입력을 모아
 * nv-participate 를 올리면, 토큰을 쥔 이 앱이 받아서 참여 API 를 부르는 구조였다.
 * 페이지 HTML 은 LLM 이 만든 것이라 토큰을 넘기지 않으려는 의도였고, 그 자체는 맞다.
 *
 * 그런데 지금은 그 전제가 둘 다 성립하지 않는다.
 *   · 미리보기 iframe 의 sandbox 에 allow-scripts 가 없다 (document.js 의 sandboxFor —
 *     editor 모드에만 준다). 그래서 페이지 안 스크립트가 아예 실행되지 않는다.
 *   · 서버가 내려주는 publishedHtml 에 runtime 스크립트도 data-behavior 도 없다.
 *     대신 참여 버튼에 `[data-slot="cta-link"]` 와 목적지(data-href · href)를 넣어 준다.
 *
 * ── 지금 도는 길 ─────────────────────────────────────────────
 * 클릭 처리는 전부 호스트가 한다. iframe 안에는 스크립트를 넣지 않는다.
 *
 *   frame.js  bindFrame 의 `live` 분기
 *             → [data-slot="cta-link"] 클릭만 통과시켜 nv-participate 를 올린다
 *   main.js   participateFromPage()
 *             → 옆 패널의 #participate-form 을 그대로 제출한다 (검증 · 중복 방지 ·
 *               결과 표시가 거기 모여 있다. 길을 둘로 만들면 둘이 갈라진다)
 *
 * 그래서 이 파일의 onParticipate · showServerResult 는 그 흐름과 역할이 겹친다.
 * 서버가 다시 runtime 방식으로 돌아가고 live 모드에 allow-scripts 를 주게 되면
 * 이 파일을 되살리는 쪽이 맞고, 그때까지는 참고용으로만 둔다.
 */

import { esc } from '@shared/dom.js'
import { icon } from '@shared/icons.js'
import { markParticipated } from '@shared/preview/frame.js'
// ⚠️ `participationStatus` 는 repo.js 에 없다 — 이름이 `loadParticipationStatus` 로 갈렸다.
//    이 파일을 어딘가에서 import 하는 순간 여기서 깨진다 (지금은 아무도 안 불러서 드러나지 않는다)
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
