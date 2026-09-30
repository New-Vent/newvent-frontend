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

/**
 * 목록 필터. API 의 ?name&status&periodFrom&periodTo 에 대응한다.
 * 기간은 "겹치는가"로 본다 — 조회 구간과 한 번이라도 겹치면 포함.
 */
function adminFilteredEvents(){
 const from=ui.adminFrom||'', to=ui.adminTo||'';
 return state.db.events.filter(e=>ui.adminShowDeleted?!!e.deletedAt:!e.deletedAt)
  .filter(e=>ui.adminShowDeleted||ui.adminStatus==='all'||eventStatus(e)===ui.adminStatus)
  .filter(e=>{
   const s=e.versions.at(-1).snapshot;
   if(from&&s.end<from)return false;
   if(to&&s.start>to)return false;
   return true;
  })
  .filter(e=>(e.versions.at(-1).snapshot.title+' '+e.name+' '+e.id).toLowerCase().includes(ui.adminQuery.trim().toLowerCase()));
}

/** 현재 페이지만 잘라낸다. API 의 ?page&size 자리. */
function adminPageSlice(es){
 const size=ui.adminPageSize||10;
 const pages=Math.max(1,Math.ceil(es.length/size));
 const page=Math.min(Math.max(1,ui.adminPage||1),pages);
 if(ui.adminPage!==page)ui.adminPage=page;
 return {rows:es.slice((page-1)*size,page*size),page,pages,total:es.length};
}

/** 페이지가 하나뿐이면 그리지 않는다. */
function pager(page,pages){
 if(pages<=1)return '';
 const nums=Array.from({length:pages},(_,i)=>i+1)
  .map(n=>button('admin-page',String(n),'data-page="'+n+'" aria-current="'+(n===page)+'"','btn sm '+(n===page?'primary':'ghost'))).join('');
 return '<div class="admin-pager">'
  +button('admin-page','이전','data-page="'+(page-1)+'"'+(page===1?' disabled':''),'btn sm ghost')
  +nums
  +button('admin-page','다음','data-page="'+(page+1)+'"'+(page===pages?' disabled':''),'btn sm ghost')
  +'</div>';
}

/**
 * 목록 한 줄의 관리 버튼.
 *
 * 게시·종료를 목록에서 바로 한다. 예전에는 버전 화면까지 들어가야 했다.
 *   게시     최신 저장 버전을 그대로 올린다 (게시 v == 최신 v 면 숨긴다)
 *   재게시   이미 게시 중인데 더 새 버전이 있을 때
 *   종료     PATCH .../status {status:"ENDED"} 대응. 기간이 남아 있어도 끝낸다
 */
function rowActions(e){
 const latest=e.versions.at(-1).v;
 const status=eventStatus(e);
 const canPublish=latest!==e.publishedVersion;
 const canEnd=status==='live'||status==='upcoming';
 return (canPublish?button('publish-latest',e.publishedVersion?'재게시 v'+latest:'게시하기','data-id="'+e.id+'"','btn sm primary'):'')
  +(canEnd?button('end-event','종료','data-id="'+e.id+'"','btn sm soft'):'')
  +button('versions','버전 이력','data-id="'+e.id+'"','btn sm')
  +button('edit','편집하기','data-id="'+e.id+'"','btn sm soft')
  +button('delete-event','삭제','data-id="'+e.id+'"','btn sm danger');
}

function adminTable(es){return '<table class="admin-table"><thead><tr><th>이벤트</th><th>게시 상태</th><th>게시 / 최신 버전</th><th>관리</th></tr></thead><tbody>'+es.map(e=>'<tr><td><h3>'+esc(e.versions.at(-1).snapshot.title)+'</h3><small>'+e.id+' · '+esc(e.name)+'</small></td><td>'+(e.deletedAt?'<span class="badge amber">삭제됨</span>':statusBadge(e))+'</td><td><span class="badge green">'+(e.publishedVersion?(e.deletedAt?'게시 이력 v':'게시 v')+e.publishedVersion:'미게시')+'</span> <span class="badge">최신 v'+e.versions.at(-1).v+'</span></td><td><div class="row">'+(e.deletedAt?button('restore-event','복구','data-id="'+e.id+'"','btn sm soft'):rowActions(e))+'</div></td></tr>').join('')+(!es.length?'<tr><td colspan="4">'+(ui.adminShowDeleted?'휴지통에 이벤트가 없습니다.':'검색 결과가 없습니다.')+'</td></tr>':'')+'</tbody></table>';}

function adminView(){
 const slice=adminPageSlice(adminFilteredEvents());
 const active=state.db.events.filter(e=>!e.deletedAt);
 const es=adminFilteredEvents();
 return '<div class="container"><div class="page-heading spread"><div><span class="eyebrow">EVENT WORKSPACE</span><h1>이벤트 관리</h1><p>아이디어를 다듬고, 준비된 이벤트를 게시하세요.</p></div>'+button('new','새 이벤트 만들기 '+icon('sparkle'),'','btn primary')+'</div><div class="metrics">'+metric('전체 이벤트',active.length,'모든 작업 공간','layers')+metric('진행 중',active.filter(e=>eventStatus(e)==='live').length,'현재 게시된 이벤트 기준','bolt')+metric('게시 전 변경',active.filter(e=>e.versions.at(-1).v!==e.publishedVersion).length,'최신 저장 버전과 게시 버전이 다른 이벤트','edit')+'</div><div class="section-title spread"><div><h2 style="font-size:19px">나의 이벤트</h2><div class="admin-list-tabs">'+button('admin-list','이벤트','data-view="active" aria-pressed="'+(!ui.adminShowDeleted)+'"',ui.adminShowDeleted?'':'active')+button('admin-list','휴지통','data-view="deleted" aria-pressed="'+ui.adminShowDeleted+'"',ui.adminShowDeleted?'active':'')+'</div></div><label class="search">'+icon('search')+'<input id="admin-search" aria-label="관리자 이벤트 검색" placeholder="이벤트명, ID 검색" value="'+esc(ui.adminQuery)+'"></label></div>'+(ui.adminShowDeleted?'':'<div class="admin-status-filters" role="group" aria-label="게시 상태 필터">'+[['all','전체'],['draft','미게시'],['live','진행 중'],['upcoming','오픈 예정'],['ended','종료']].map(([value,label])=>button('admin-status',label,'data-status="'+value+'" aria-pressed="'+(ui.adminStatus===value)+'"',ui.adminStatus===value?'active':'')).join('')+'</div>')+'<div class="admin-period-filter"><label class="field">조회 시작<input id="admin-from" type="date" value="'+esc(ui.adminFrom||'')+'"></label><label class="field">조회 종료<input id="admin-to" type="date" value="'+esc(ui.adminTo||'')+'"></label>'+((ui.adminFrom||ui.adminTo)?button('clear-period','기간 초기화','','btn sm ghost'):'')+'</div><p id="admin-result-count" class="admin-result-count">'+slice.total+'개 이벤트</p><div id="admin-results" class="card table-wrap">'+adminTable(slice.rows)+'</div>'+pager(slice.page,slice.pages)+'</div>';
}

export { adminView }
