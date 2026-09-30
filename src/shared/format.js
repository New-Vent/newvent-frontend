/** 날짜·상태 표기. 원본: shortDate · eventStatus · statusLabel … */

import { ui } from '@shared/state.js'
import { DEMO_DATE } from './constants.js'
import { published, currentParticipation, latestParticipation } from './selectors.js'

function shortDate(d){return d.replaceAll('-','.');}

function daysBetween(a,b){return Math.ceil((new Date(b+'T00:00:00Z')-new Date(a+'T00:00:00Z'))/86400000);}

// 관리자가 수동으로 끝낸 이벤트(endedAt)는 기간이 남아 있어도 종료로 본다.
// PATCH /api/admin/events/{id}/status {status:"ENDED"} 에 대응한다.
function eventStatus(e){const s=published(e);return !s?'draft':e.endedAt?'ended':s.start>DEMO_DATE?'upcoming':s.end<DEMO_DATE?'ended':'live';}

/**
 * 서버 이벤트의 게시 상태 — status 와 기간으로 화면이 계산한다.
 *   DRAFT → 미게시 / ENDED → 종료 / PUBLISHED → 시작 전 오픈 예정 · 끝난 뒤 종료 · 그 사이 진행 중
 * ★ 서버 스케줄러가 ENDED 로 바꾸기 전에도 기간이 지났으면 종료로 본다 (스케줄러는 주기적으로만 돈다)
 */
function serverStatus(item,now=new Date()){
 if(item.status==='DRAFT')return 'draft';
 if(item.status==='ENDED')return 'ended';
 if(item.startAt&&new Date(item.startAt)>now)return 'upcoming';
 if(item.endAt&&new Date(item.endAt)<now)return 'ended';
 return 'live';
}

const STATUS_LABELS={draft:'미게시',upcoming:'오픈 예정',ended:'종료',live:'진행 중'};

function badgeOf(st){return '<span class="badge '+(st==='live'?'pink':st==='upcoming'?'':'amber')+'">'+STATUS_LABELS[st]+'</span>';}

function statusLabel(e){return ({draft:'미게시',upcoming:'오픈 예정',ended:'종료',live:'진행 중'})[eventStatus(e)];}

function policyLabel(e){return e.policy==='daily'?'하루 1회':'계정당 1회';}

function deadline(e){const s=published(e);if(!s)return '미게시';const st=eventStatus(e);if(st==='ended')return '종료';const n=daysBetween(DEMO_DATE,st==='upcoming'?s.start:s.end);return st==='upcoming'?'오픈 D-'+n:n===0?'오늘 마감':'D-'+n;}

function actionLabel(e){if(eventStatus(e)==='upcoming')return '미리 보기';if(eventStatus(e)==='ended')return '이벤트 보기';if(ui.logged&&currentParticipation(e))return '결과 확인';return '참여하러 가기';}

function statusBadge(e){const st=eventStatus(e);return '<span class="badge '+(st==='live'?'pink':st==='upcoming'?'':'amber')+'">'+statusLabel(e)+'</span>';}

function personalBadge(e){
 if(!ui.logged)return '';
 const p=currentParticipation(e);
 if(p)return '<span class="badge green">'+(e.policy==='daily'?'오늘 참여 완료':p.state==='pending'?'결과 대기':'참여 완료')+'</span>';
 return eventStatus(e)==='live'?'<span class="badge pink">참여 가능</span>':'';
}

export { shortDate, daysBetween, eventStatus, statusLabel, policyLabel, deadline, actionLabel, statusBadge, personalBadge, serverStatus, badgeOf }
