/** 초기 데모 데이터. 원본: baseSnapshot · initialDatabase */

import { clone } from '@shared/dom.js'

import { TEMPLATE_BODIES } from './templates.js'
import { CONFIGS } from './configs.js'
import { DEMO_DATE, USER_ID } from '@shared/constants.js'

function baseSnapshot(c){
 const doc=new DOMParser().parseFromString(TEMPLATE_BODIES[c.templateId],'text/html');
 const text=s=>{const node=doc.querySelector(s);if(!node)return '';const walker=doc.createTreeWalker(node,NodeFilter.SHOW_TEXT),parts=[];while(walker.nextNode())parts.push(walker.currentNode.textContent);return parts.join(' ').replace(/\s+/g,' ').trim();};
 return {templateId:c.templateId,title:text('.hero-title'),intro:text('.hero-desc'),benefitHeading:text('[data-block="benefits"] h2'),cta:text('[data-slot="cta-link"]'),start:c.start,end:c.end};
}

function initialDatabase(){
 const events=CONFIGS.map((c,i)=>{
  const first=baseSnapshot(c);
  const versions=[{v:1,source:null,createdAt:'2026.09.20 10:00',summary:'기본 템플릿으로 시작',snapshot:first}];
  if(i<3){
   const second=clone(first);
   second.intro=first.intro+' 함께 참여하고 즐거운 순간을 나눠보세요.';
   versions.push({v:2,source:1,createdAt:'2026.09.21 14:20',summary:'소개 문구를 친근하게 정리',snapshot:second});
  }
  if(i===0){
   const third=clone(versions[1].snapshot);third.cta='승리 예측하고 응원하기';
   versions.push({v:3,source:2,createdAt:'2026.09.22 09:40',summary:'참여 버튼 문구를 짧게 정리',snapshot:third});
  }
  return {...c,publishedVersion:i<3?2:1,versions};
 });
 return {schema:1,events,participations:[
  {id:'PT-901',eventId:events[0].id,userId:USER_ID,day:'2026-09-21',at:'2026.09.21 14:32',title:events[0].versions[1].snapshot.title,state:'pending',result:'대한민국 승리 예측 접수',reward:null,selection:'대한민국 승',version:2},
  {id:'PT-902',eventId:events[1].id,userId:USER_ID,day:'2026-09-21',at:'2026.09.21 10:15',title:events[1].versions[1].snapshot.title,state:'done',result:'복주머니 결과를 확인했어요',reward:'데이터 5GB',selection:'파란 복주머니',version:2}
 ]};
}

export { baseSnapshot, initialDatabase }
