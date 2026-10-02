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

/* ───────────── 서버 모드 ───────────── */

/**
 * 공개 이벤트 상세 — 서버가 준 publishedHtml 을 그대로 띄운다.
 *
 * 조립할 게 없다. serverFrame() 이 doctype · head · /assets/event.css 를 씌운다.
 * 참여 · 등급 · 혜택 요약은 공개 응답에 없어서 빼뒀다 (제목 · 기간만).
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

  const period = shortDate(e.startDate.slice(0, 10)) + ' ~ ' + shortDate(e.endDate.slice(0, 10))
  return '<div class="container">'
    + button('route', icon('back') + '이벤트 목록', 'data-route="home"', 'backlink')
    + '<div class="detail-layout"><div class="detail-frame">'
    + serverFrame(e.publishedHtml, esc(e.title), 'readonly')
    + '</div><aside class="detail-side card">'
    + '<div class="spread"><span class="badge green">진행 중</span>'
    + (e.closingSoon ? '<span class="badge pink">마감 임박</span>' : '') + '</div>'
    + '<h1>' + esc(e.title) + '</h1>'
    + '<dl class="facts"><div class="fact"><dt>이벤트 기간</dt><dd>'
    + shortDate(e.startDate.slice(0, 10)) + '<br>~ ' + shortDate(e.endDate.slice(0, 10))
    + '</dd></div></dl>'
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
