/** 이벤트 상세·참여. 원본: eventView · participationAccess · participationControl */

import { participationAccess } from '@shared/participation.js'

import { DEMO_DATE } from '@shared/constants.js'
import { esc } from '@shared/dom.js'
import { deadline, policyLabel, shortDate, statusBadge } from '@shared/format.js'
import { icon } from '@shared/icons.js'
import { fullFrame, serverFrame } from '@shared/preview/document.js'
import { currentEvent, currentParticipation, published } from '@shared/selectors.js'
import { USE_SERVER } from '@shared/repo.js'
import { ui } from '@shared/state.js'
import { button } from '@shared/ui/controls.js'


function participationControl(e){
 const a=participationAccess(e);
 let action='';
 if(a.kind==='ready')action=button('jump-participation','이벤트 참여하기 '+icon('arrow'),'','btn primary wide');
 else if(a.kind==='login')action=button('login-prompt','로그인하고 참여하기','','btn primary wide');
 else if(a.record)action=button('result','참여 결과 보기','data-id="'+a.record.id+'"','btn sm wide');
 else action='<button class="btn wide" type="button" disabled>지금은 참여할 수 없어요</button>';
 return '<div class="participation-access '+a.kind+'" role="status"><strong>'+esc(a.message)+'</strong>'+action+'</div>';
}

/* ───────────── 서버 모드 — 참여 ───────────── */

/**
 * 참여할 수 없는 사유 → 화면 문구.
 *
 * ★ NOT_CONFIGURED 는 **사용자가 고칠 수 없는** 사유다. 관리자가 참여 설정을
 *   안 한 것이라, 등급 부족처럼 사용자 탓으로 읽히면 안 된다. "준비 중" 으로 둔다.
 * ★ 사유는 앞으로 늘어난다. 모르는 값이면 일반 문구로 넘긴다 (화면이 안 깨지게).
 */
const UNAVAILABLE = {
  ALREADY_PARTICIPATED: { tone: 'done', title: '이미 참여하셨어요', desc: '참여 결과는 내 혜택에서 볼 수 있어요.' },
  INSUFFICIENT_GRADE: { tone: 'grade', title: '우수 등급부터 참여할 수 있어요', desc: '멤버십 등급은 이용 실적에 따라 정해져요.' },
  NOT_CONFIGURED: { tone: 'soon', title: '준비 중이에요', desc: '참여 방식이 아직 설정되지 않았어요. 곧 열립니다.' },
}
const unavailableOf = (reason) =>
  UNAVAILABLE[reason] ?? { tone: 'soon', title: '지금은 참여할 수 없어요', desc: '잠시 후 다시 확인해주세요.' }

/**
 * 방식별 추가 입력.
 *
 * ★ SPORTS_PREDICTION 의 선택지(predictionOptions)와 LUCKY_POUCH 의 개수(pouches)는
 *   **이벤트 설정에 있는데 상태 API 가 안 준다.** 값을 지어내면 서버가 400 으로 막는다
 *   (ParticipationValidator 가 config 와 대조한다). 그래서 버튼을 띄우지 않고
 *   왜 못 하는지 밝힌다 — 늘 실패하는 버튼을 두지 않는다.
 */
function participationInput(gameCode) {
  if (gameCode === 'PRE_REGISTRATION') {
    return { ok: true, html:
      '<label class="field">휴대폰 번호 <span class="helper">숫자만 또는 010-1234-5678</span>'
      + '<input data-participate="phoneNumber" inputmode="tel" maxlength="13" placeholder="01012345678"></label>' }
  }
  if (gameCode === 'SPORTS_PREDICTION' || gameCode === 'LUCKY_POUCH') {
    return { ok: false, html:
      '<p class="helper">이 참여 방식은 선택지를 아직 받아올 수 없어요. '
      + '(상태 API 가 이벤트 설정을 내려주면 열립니다)</p>' }
  }
  return { ok: true, html: '' }   // BASIC · gameCode 없음 — 추가 입력이 없다
}

/** 참여 결과 — WON 만 상품명이 온다 */
function participationResult(r) {
  const won = r.status === 'WON'
  const pending = r.status === 'PENDING'
  return '<div class="participation-access ' + (won ? 'ready' : pending ? 'login' : 'done') + '" role="status">'
    + '<strong>' + (pending ? '참여가 접수되었어요' : won ? '당첨되었어요!' : '아쉽게 당첨되지 않았어요') + '</strong>'
    + (won && r.prizeName ? '<p class="summary">' + esc(r.prizeName) + '</p>' : '')
    + button('route', '내 혜택에서 보기', 'data-route="my"', 'btn sm wide') + '</div>'
}

/**
 * 서버 모드 참여 패널 — **iframe 이 아니라 옆 패널에 둔다.**
 * 게시된 HTML 안의 버튼은 `<a href="#">` 로 죽어 있고, 생성된 HTML 에 스크립트를
 * 넣지 않는 것이 백엔드 설계 의도다. 그래서 참여는 호스트가 맡는다.
 */
function serverParticipation() {
  if (!ui.logged) {
    return '<div class="participation-access login" role="status"><strong>로그인하면 참여할 수 있어요</strong>'
      + button('route', '로그인하고 참여하기', 'data-route="login"', 'btn primary wide') + '</div>'
  }

  const s = ui.serverParticipation
  if (!s || s.state === 'loading') {
    return '<div class="participation-access" role="status"><strong>참여 가능 여부를 확인하고 있어요</strong></div>'
  }
  if (s.state === 'error') {
    return '<div class="participation-access" role="status"><strong>확인하지 못했어요</strong>'
      + '<p class="helper">' + esc(s.error || '') + '</p>'
      + button('participation-retry', '다시 확인', '', 'btn sm wide') + '</div>'
  }
  if (s.result) return participationResult(s.result)

  const d = s.data || {}
  if (d.participated || !d.canParticipate) {
    const u = unavailableOf(d.participated && !d.unavailableReason ? 'ALREADY_PARTICIPATED' : d.unavailableReason)
    return '<div class="participation-access ' + u.tone + '" role="status"><strong>' + esc(u.title) + '</strong>'
      + '<p class="helper">' + esc(u.desc) + '</p>'
      + (d.participated ? button('route', '내 혜택에서 보기', 'data-route="my"', 'btn sm wide') : '')
      + '</div>'
  }

  // gameCode 는 서버가 준다(백엔드 #199~). 옛 이벤트처럼 없으면 BASIC 으로 본다 —
  // 추가 입력이 없는 방식이라 그대로 참여하면 된다
  const input = participationInput(d.gameCode)
  return '<form id="participate-form" class="participation-access ready" role="status">'
    + '<strong>지금 참여할 수 있어요</strong>'
    + input.html
    + '<p class="create-error" role="alert"></p>'
    + (input.ok
      ? '<button type="submit" class="btn primary wide"' + (s.busy ? ' disabled' : '') + '>'
        + (s.busy ? '참여하는 중…' : '이벤트 참여하기 ' + icon('arrow')) + '</button>'
      : '')
    + '</form>'
}

/* ───────────── 서버 모드 ───────────── */

/**
 * 공개 이벤트 상세 — 서버가 준 publishedHtml 을 그대로 띄운다.
 *
 * 조립할 게 없다. serverFrame() 이 doctype · head · /assets/event.css 를 씌운다.
 *
 * 등급 · 혜택 요약은 공개 응답에 없어서 제목 · 기간만 쓴다.
 * 참여는 따로 상태 API 로 받아 옆 패널에 붙인다 (serverParticipation).
 */
function serverEventView() {
  const e = ui.serverEvent
  if (ui.serverEventState === 'loading') {
    return '<div class="container"><div class="empty"><h3>불러오는 중…</h3></div></div>'
  }
  if (ui.serverEventState === 'error' || !e) {
    return '<div class="container empty"><h3>이벤트를 불러오지 못했어요</h3>'
      + '<p>' + esc(ui.serverEventError || '') + '</p>'
      + button('route', '목록으로', 'data-route="home"', 'btn') + '</div>'
  }
  if (!e.publishedHtml) {
    return '<div class="container empty"><h3>아직 게시되지 않은 이벤트입니다</h3>'
      + button('route', '목록으로', 'data-route="home"', 'btn') + '</div>'
  }

  return '<div class="container">'
    + button('route', icon('back') + '이벤트 목록', 'data-route="home"', 'backlink')
    + '<div class="detail-layout"><div class="detail-frame">'
    // live — 페이지 안의 「참여하기」(data-slot="cta-link")를 호스트가 받는다.
    // 그 밖의 클릭은 readonly 와 똑같이 막는다 (frame.js 의 bindFrame 참고)
    + serverFrame(e.publishedHtml, esc(e.title), 'live', e.id)
    + '</div><aside class="detail-side card">'
    + '<div class="spread"><span class="badge green">진행 중</span>'
    + (e.closingSoon ? '<span class="badge pink">마감 임박</span>' : '') + '</div>'
    + '<h1>' + esc(e.title) + '</h1>'
    + '<dl class="facts"><div class="fact"><dt>이벤트 기간</dt><dd>'
    + shortDate(e.startDate.slice(0, 10)) + '<br>~ ' + shortDate(e.endDate.slice(0, 10))
    + '</dd></div></dl>'
    + serverParticipation()
    + '<p class="small muted" style="margin-top:15px;line-height:1.8">'
    + '자세한 조건은 이벤트의 유의사항을 확인해주세요.</p>'
    + '</aside></div></div>'
}


function mockEventView(){
 const e=currentEvent(),s=published(e);
 if(e.deletedAt)return '<div class="container empty"><h3>더 이상 공개되지 않는 이벤트입니다</h3>'+button('route','목록으로','data-route="home"','btn')+'</div>';
 if(!s)return '<div class="container empty"><h3>아직 게시되지 않은 이벤트입니다</h3>'+button('route','목록으로','data-route="home"','btn')+'</div>';
 const p=ui.logged?currentParticipation(e):null;
 return '<div class="container">'+button('route',icon('back')+'이벤트 목록','data-route="home"','backlink')+'<div class="detail-layout"><div class="detail-frame">'+fullFrame(e,s,'user')+'</div><aside class="detail-side card"><div class="spread">'+statusBadge(e)+'<span class="badge">'+deadline(e)+'</span></div><h1>'+esc(s.title)+'</h1><p class="summary">'+esc(e.benefit)+'</p><dl class="facts"><div class="fact"><dt>이벤트 기간</dt><dd>'+shortDate(s.start)+'<br>~ '+shortDate(s.end)+'</dd></div><div class="fact"><dt>참여 대상</dt><dd>'+esc(e.audience)+'</dd></div><div class="fact"><dt>참여 방식</dt><dd>'+esc(e.kind)+' · '+policyLabel(e)+'</dd></div></dl>'+(ui.logged?'<label class="demo-grade-control">체험 회원 등급<select data-demo-grade aria-label="체험 회원 등급"><option value="일반" '+(ui.demoGrade==='일반'?'selected':'')+'>일반 회원</option><option value="VIP · FAMILY" '+(ui.demoGrade==='VIP · FAMILY'?'selected':'')+'>VIP · FAMILY</option></select><small>프로토타입 화면 확인용</small></label>':'')+participationControl(e)+'<p class="small muted" style="margin-top:15px;line-height:1.8">자세한 조건은 이벤트의 유의사항을 확인해주세요.</p></aside></div></div>';
}

/** 서버 모드면 게시된 HTML 을, 목업이면 스냅샷으로 조립한 미리보기를 쓴다. */
function eventView() {
  return USE_SERVER ? serverEventView() : mockEventView()
}

export { eventView, participationControl }
