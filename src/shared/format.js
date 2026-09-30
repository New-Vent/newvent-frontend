/** 날짜·상태 표기. 원본: shortDate · eventStatus · statusLabel … */

import { ui } from '@shared/state.js'
import { DEMO_DATE } from './constants.js'
import { published, currentParticipation, latestParticipation } from './selectors.js'

function shortDate(d){return d.replaceAll('-','.');}

function daysBetween(a,b){return Math.ceil((new Date(b+'T00:00:00Z')-new Date(a+'T00:00:00Z'))/86400000);}

// 관리자가 수동으로 끝낸 이벤트(endedAt)는 기간이 남아 있어도 종료로 본다.
// PATCH /api/admin/events/{id}/status {status:"ENDED"} 에 대응한다.
function eventStatus(e){const s=published(e);return !s?'draft':e.endedAt?'ended':s.start>DEMO_DATE?'upcoming':s.end<DEMO_DATE?'ended':'live';}

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

export { shortDate, daysBetween, eventStatus, statusLabel, policyLabel, deadline, actionLabel, statusBadge, personalBadge }
