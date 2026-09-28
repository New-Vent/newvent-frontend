/** 데모 이벤트 정의. 백엔드가 붙으면 서버가 내려준다. */

import { DEMO_DATE } from '@shared/constants.js'

const CONFIGS=[
 {id:'EVT-2026-001',templateId:'tpl-1',name:'스포츠 응원',category:'스포츠',icon:'trophy',kind:'승부 예측',policy:'once',audience:'로그인 회원',start:'2026-09-10',end:'2026-09-30',benefit:'국가대표 유니폼 · 치킨 세트 추첨',color:'#213f78'},
 {id:'EVT-2026-002',templateId:'tpl-2',name:'한가위 선물',category:'시즌 혜택',icon:'gift',kind:'복주머니',policy:'daily',audience:'로그인 회원',start:'2026-09-21',end:'2026-10-05',benefit:'한우 세트 · 상품권 · 데이터 5GB',color:'#95500b'},
 {id:'EVT-2026-003',templateId:'tpl-3',name:'VIP 감사',category:'VIP 혜택',icon:'crown',kind:'쿠폰팩',policy:'once',audience:'VIP · FAMILY 회원',start:'2026-09-01',end:'2026-09-30',benefit:'30% 감사 쿠폰 · 무료배송 · 커피 응모',color:'#765240'},
 {id:'EVT-2026-004',templateId:'tpl-4',name:'72시간 특가',category:'타임 특가',icon:'bolt',kind:'특가 혜택',policy:'once',audience:'로그인 회원',start:'2026-10-01',end:'2026-10-04',benefit:'겨울 아우터 특가 · 구매 금액 페이백',color:'#e24c28'},
 {id:'EVT-2026-005',templateId:'tpl-5',name:'NewVent 2.0',category:'사전예약',icon:'rocket',kind:'사전예약',policy:'once',audience:'로그인 회원',start:'2026-10-15',end:'2026-10-31',benefit:'얼리버드 이용권 · 한정판 웰컴 키트',color:'#614ab8'}
];

const AI_START={templateId:'ai-blank',name:'AI 생성 체험',category:'일반 이벤트',icon:'sparkle',kind:'응모 체험',policy:'once',audience:'로그인 회원',benefit:'체험용 초안 · 혜택 미설정',start:DEMO_DATE,end:'2026-10-06'};

export { CONFIGS, AI_START }
