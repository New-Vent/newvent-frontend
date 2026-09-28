/** 참여 동작. 원본: participate · showResult · showLoginPrompt */

import { DEMO_DATE, USER_ID } from '@shared/constants.js'
import { esc } from '@shared/dom.js'
import { eventStatus, shortDate } from '@shared/format.js'
import { icon } from '@shared/icons.js'
import { currentParticipation, eventById, published } from '@shared/selectors.js'
import { state, ui } from '@shared/state.js'
import { persist } from '@shared/persist.js'
import { button } from '@shared/ui/controls.js'
import { modal } from '@shared/ui/modal.js'
import { toast } from '@shared/ui/toast.js'

function showLoginPrompt(){
 modal('로그인이 필요해요','<p>참여 결과를 내 혜택에 보관하려면 사용자로 체험해주세요.</p>',button('close','닫기')+button('role','사용자로 체험','data-role="user"','btn primary'));
}

function showResult(id){
 const p=state.db.participations.find(p=>p.id===id&&p.userId===USER_ID);if(!p)return;
 const e=eventById(p.eventId);
 modal('나의 참여 결과','<div class="result-stamp">'+icon(p.state==='pending'?'clock':'gift')+'</div><h3 class="result-title">'+(p.state==='pending'?'참여가 잘 접수되었어요!':'오늘의 즐거움을 확인하세요!')+'</h3><p class="result-sub">'+esc(p.title)+'</p><div class="result-body"><span class="badge '+(p.state==='pending'?'amber':'green')+'">'+(p.state==='pending'?'결과 대기':'참여 완료')+'</span><strong>'+esc(p.reward||p.result)+'</strong><p>'+esc(p.selection||e?.kind||'이벤트 참여')+'<br>'+p.at+' · '+p.id+'</p></div><p class="helper" style="text-align:center;margin-top:15px">프로토타입 체험 결과이며 실제 경품·쿠폰은 지급되지 않습니다.</p>',button('close','닫기')+button('route','내 혜택에서 보기','data-route="my"','btn primary'));
}

function participate(e,choice){
 if(e.deletedAt)return toast('삭제된 이벤트는 참여할 수 없어요.');
 if(!ui.logged)return showLoginPrompt();
 if(participationAccess(e).kind==='grade')return toast(participationAccess(e).message);
 if(eventStatus(e)!=='live')return toast('참여 기간을 확인해주세요.');
 const existing=currentParticipation(e);if(existing)return showResult(existing.id);
 let reward=null,result='참여가 접수되었어요',status='pending',selection=e.kind;
 if(e.templateId==='tpl-1'){selection=({kor:'대한민국 승',draw:'무승부',opp:'상대팀 승'})[ui.votes[e.id]];result=selection+' 예측 접수';}
 if(e.templateId==='tpl-2'){reward=['한우 세트','상품권 5만원','데이터 5GB'][Math.max(0,Math.min(2,choice))];status='done';selection=['붉은 복주머니','금빛 복주머니','파란 복주머니'][Math.max(0,Math.min(2,choice))];result='복주머니 결과를 확인했어요';}
 if(e.templateId==='tpl-3'){reward='VIP 감사 혜택 패키지';result='쿠폰팩 체험을 완료했어요';status='done';}
 if(e.templateId==='tpl-4'){result='특가 혜택 신청 접수';}
 if(e.templateId==='tpl-5'){result='사전예약 신청 접수';}
 const now=new Date(),hm=now.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'});
 const p={id:'PT-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),eventId:e.id,userId:USER_ID,day:DEMO_DATE,at:shortDate(DEMO_DATE)+' '+hm,title:published(e).title,state:status,result,reward,selection,version:e.publishedVersion};
 state.db.participations.push(p);persist();render();showResult(p.id);
}

export { showLoginPrompt, showResult, participate }
