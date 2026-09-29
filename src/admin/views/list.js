/**
 * 이벤트 관리 목록.
 * 원본: adminView · adminTable · adminFilteredEvents
 */

import { metric } from '@shared/ui/controls.js'

import { esc } from '@shared/dom.js'
import { eventStatus, statusBadge } from '@shared/format.js'
import { icon } from '@shared/icons.js'
import { state, ui } from '@shared/state.js'
import { button } from '@shared/ui/controls.js'

function adminFilteredEvents(){
 return state.db.events.filter(e=>ui.adminShowDeleted?!!e.deletedAt:!e.deletedAt)
  .filter(e=>ui.adminShowDeleted||ui.adminStatus==='all'||eventStatus(e)===ui.adminStatus)
  .filter(e=>(e.versions.at(-1).snapshot.title+' '+e.name+' '+e.id).toLowerCase().includes(ui.adminQuery.trim().toLowerCase()));
}

function adminTable(es){return '<table class="admin-table"><thead><tr><th>이벤트</th><th>게시 상태</th><th>게시 / 최신 버전</th><th>관리</th></tr></thead><tbody>'+es.map(e=>'<tr><td><h3>'+esc(e.versions.at(-1).snapshot.title)+'</h3><small>'+e.id+' · '+esc(e.name)+'</small></td><td>'+(e.deletedAt?'<span class="badge amber">삭제됨</span>':statusBadge(e))+'</td><td><span class="badge green">'+(e.publishedVersion?(e.deletedAt?'게시 이력 v':'게시 v')+e.publishedVersion:'미게시')+'</span> <span class="badge">최신 v'+e.versions.at(-1).v+'</span></td><td><div class="row">'+(e.deletedAt?button('restore-event','복구','data-id="'+e.id+'"','btn sm soft'):button('versions','버전 이력','data-id="'+e.id+'"','btn sm')+button('edit','편집하기','data-id="'+e.id+'"','btn sm soft')+button('delete-event','삭제','data-id="'+e.id+'"','btn sm danger'))+'</div></td></tr>').join('')+(!es.length?'<tr><td colspan="4">'+(ui.adminShowDeleted?'휴지통에 이벤트가 없습니다.':'검색 결과가 없습니다.')+'</td></tr>':'')+'</tbody></table>';}

function adminView(){
 const active=state.db.events.filter(e=>!e.deletedAt);
 const es=adminFilteredEvents();
 return '<div class="container"><div class="page-heading spread"><div><span class="eyebrow">EVENT WORKSPACE</span><h1>이벤트 관리</h1><p>아이디어를 다듬고, 준비된 이벤트를 게시하세요.</p></div>'+button('new','새 이벤트 만들기 '+icon('sparkle'),'','btn primary')+'</div><div class="metrics">'+metric('전체 이벤트',active.length,'모든 작업 공간','layers')+metric('진행 중',active.filter(e=>eventStatus(e)==='live').length,'현재 게시된 이벤트 기준','bolt')+metric('게시 전 변경',active.filter(e=>e.versions.at(-1).v!==e.publishedVersion).length,'최신 저장 버전과 게시 버전이 다른 이벤트','edit')+'</div><div class="section-title spread"><div><h2 style="font-size:19px">나의 이벤트</h2><div class="admin-list-tabs">'+button('admin-list','이벤트','data-view="active" aria-pressed="'+(!ui.adminShowDeleted)+'"',ui.adminShowDeleted?'':'active')+button('admin-list','휴지통','data-view="deleted" aria-pressed="'+ui.adminShowDeleted+'"',ui.adminShowDeleted?'active':'')+'</div></div><label class="search">'+icon('search')+'<input id="admin-search" aria-label="관리자 이벤트 검색" placeholder="이벤트명, ID 검색" value="'+esc(ui.adminQuery)+'"></label></div>'+(ui.adminShowDeleted?'':'<div class="admin-status-filters" role="group" aria-label="게시 상태 필터">'+[['all','전체'],['draft','미게시'],['live','진행 중'],['upcoming','오픈 예정'],['ended','종료']].map(([value,label])=>button('admin-status',label,'data-status="'+value+'" aria-pressed="'+(ui.adminStatus===value)+'"',ui.adminStatus===value?'active':'')).join('')+'</div>')+'<p id="admin-result-count" class="admin-result-count">'+es.length+'개 이벤트</p><div id="admin-results" class="card table-wrap">'+adminTable(es)+'</div></div>';
}

export { adminView }
