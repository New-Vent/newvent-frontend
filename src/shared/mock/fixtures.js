/** 초기 데모 데이터. 원본: baseSnapshot · initialDatabase */

import { clone } from '@shared/dom.js'

import { TEMPLATE_BODIES } from './templates.js'
import { CONFIGS } from './configs.js'
import { DEMO_DATE, USER_ID } from '@shared/constants.js'

function baseSnapshot(c){
 const doc=new DOMParser().parseFromString(TEMPLATE_BODIES[c.templateId],'text/html');
 const text=s=>{const node=doc.querySelector(s);if(!node)return '';const walker=doc.createTreeWalker(node,NodeFilter.SHOW_TEXT),parts=[];while(walker.nextNode())parts.push(walker.currentNode.textContent);return parts.join(' ').replace(/\s+/g,' ').trim();};
 // blocks: LLM 이 생성한 블록 HTML 을 담는 자리.
 //   { hero: '<section data-block="hero">…</section>', … }
 //   비어 있으면 아래 필드로 템플릿 슬롯을 채운다(기존 동작).
 //   notices 는 서버 소유라 여기 들어와도 적용되지 않는다.
 return {templateId:c.templateId,blocks:{},title:text('.hero-title'),intro:text('.hero-desc'),benefitHeading:text('[data-block="benefits"] h2'),cta:text('[data-slot="cta-link"]'),start:c.start,end:c.end};
}

/**
 * 요금제. `PATCH /api/users/me/plan` 이 바꾸는 값이다.
 * code 는 서버가 쓰는 값이고 나머지는 표시용.
 */
const PLANS = [
 {code:'BASIC',   name:'베이직',   price:'월 35,000원', data:'5GB',    grade:'일반',   desc:'가볍게 쓰는 기본 요금제'},
 {code:'STANDARD',name:'스탠다드', price:'월 55,000원', data:'50GB',   grade:'일반',   desc:'데이터를 넉넉하게'},
 {code:'PREMIUM', name:'프리미엄', price:'월 79,000원', data:'무제한', grade:'VIP',    desc:'VIP 전용 이벤트에 참여할 수 있어요'},
 {code:'FAMILY',  name:'패밀리',   price:'월 99,000원', data:'무제한', grade:'FAMILY', desc:'가족 결합 · VIP 혜택 포함'},
]

/** 등급은 요금제에서 결정된다. 서버도 같은 규칙이면 프론트가 계산할 필요가 없다. */
const gradeOfPlan = (code) => PLANS.find((p) => p.code === code)?.grade ?? '일반'

function initialDatabase(){
 const events=CONFIGS.map((c,i)=>{
  const first=baseSnapshot(c);
  // checkpoint: 되돌릴 기준으로 찍어둔 저장 지점 (PUT/DELETE .../versions/{id}/checkpoint)
  const versions=[{v:1,source:null,createdAt:'2026.09.20 10:00',summary:'기본 템플릿으로 시작',snapshot:first,checkpoint:true}];
  if(i<3){
   const second=clone(first);
   second.intro=first.intro+' 함께 참여하고 즐거운 순간을 나눠보세요.';
   versions.push({v:2,source:1,createdAt:'2026.09.21 14:20',summary:'소개 문구를 친근하게 정리',snapshot:second,checkpoint:false});
  }
  if(i===0){
   const third=clone(versions[1].snapshot);third.cta='승리 예측하고 응원하기';
   versions.push({v:3,source:2,createdAt:'2026.09.22 09:40',summary:'참여 버튼 문구를 짧게 정리',snapshot:third,checkpoint:false});
  }
  // endedAt: 관리자가 수동으로 끝낸 시각 (PATCH .../status {status:"ENDED"}).
  //   기간이 남아 있어도 끝난 것으로 본다. eventStatus 가 이걸 먼저 본다.
  return {...c,publishedVersion:i<3?2:1,versions,endedAt:null};
 });
 return {schema:1,events,
  // 로그인한 회원. GET /api/users/me · PATCH /api/users/me · PATCH /api/users/me/plan
  me:{id:USER_ID,loginId:'user01',name:'헌진',email:'heonjin@example.com',
      phone:'010-1234-5678',plan:'STANDARD',grade:gradeOfPlan('STANDARD'),
      joinedAt:'2026.03.14',marketingOptIn:true},
  participations:[
  {id:'PT-901',eventId:events[0].id,userId:USER_ID,day:'2026-09-21',at:'2026.09.21 14:32',title:events[0].versions[1].snapshot.title,state:'pending',result:'대한민국 승리 예측 접수',reward:null,selection:'대한민국 승',version:2},
  {id:'PT-902',eventId:events[1].id,userId:USER_ID,day:'2026-09-21',at:'2026.09.21 10:15',title:events[1].versions[1].snapshot.title,state:'done',result:'복주머니 결과를 확인했어요',reward:'데이터 5GB',selection:'파란 복주머니',version:2}
 ]};
}

export { baseSnapshot, initialDatabase, PLANS, gradeOfPlan }
