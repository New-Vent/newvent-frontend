/**
 * 참여 가능 여부 판정.
 *
 * 사용자 화면뿐 아니라 미리보기 프레임(preview/frame.js)도 이 판정으로
 * 버튼을 잠그기 때문에 shared 에 둔다.
 *
 * 원본: participationAccess
 */

import { DEMO_DATE } from '@shared/constants.js'
import { shortDate } from '@shared/format.js'
import { currentParticipation, published } from '@shared/selectors.js'
import { ui } from '@shared/state.js'

function participationAccess(e){
 const s=published(e),p=ui.logged?currentParticipation(e):null;
 if(e.deletedAt||!s)return {kind:'unavailable',message:'현재 공개되지 않는 이벤트입니다.'};
 if(s.start>DEMO_DATE)return {kind:'upcoming',message:shortDate(s.start)+'부터 참여할 수 있어요.'};
 if(s.end<DEMO_DATE)return {kind:'ended',message:'참여 기간이 종료됐어요.',record:p};
 if(!ui.logged)return {kind:'login',message:'로그인 후 참여할 수 있어요.'};
 if(p)return {kind:'done',message:e.policy==='daily'?'오늘은 이미 참여했어요. 다음 날 다시 참여할 수 있어요.':'계정당 1회 참여를 완료했어요.',record:p};
 if(e.audience?.includes('VIP')&&ui.demoGrade!=='VIP · FAMILY')return {kind:'grade',message:'이 이벤트는 VIP · FAMILY 회원만 참여할 수 있어요.'};
 return {kind:'ready',message:'지금 참여할 수 있어요.'};
}

export { participationAccess }
