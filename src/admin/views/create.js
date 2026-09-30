/**
 * 이벤트 생성 (2단계 초안 흐름).
 * 최종 확인 전까지는 아무것도 저장하지 않는다.
 * 원본: creationView · creationSummary · creationError ·
 *       validateCreation · startCreation · finishCreation
 */

import { clone } from '@shared/dom.js'

import { navigate } from '@shared/navigate.js'

import { DEMO_DATE } from '@shared/constants.js'
import { $, esc } from '@shared/dom.js'
import { policyLabel, shortDate } from '@shared/format.js'
import { icon } from '@shared/icons.js'
import { CONFIGS } from '@shared/mock/configs.js'
import { baseSnapshot } from '@shared/mock/fixtures.js'
import { persist } from '@shared/persist.js'
import { thumb } from '@shared/preview/document.js'
import { state, ui } from '@shared/state.js'
import { button, field } from '@shared/ui/controls.js'
import { toast } from '@shared/ui/toast.js'

function startCreation(){
 ui.creation={step:1,title:'',start:DEMO_DATE,end:'2026-10-06',audience:'로그인 회원',mode:'template',templateId:null,prompt:''};
 navigate('create');
}

function creationSummary(){
 const c=ui.creation,cfg=CONFIGS.find(x=>x.templateId===c.templateId);
 return '<span class="eyebrow">NEW EVENT</span><h3>이번에 만들 이벤트</h3><dl class="facts"><div class="fact"><dt>이벤트명</dt><dd>'+esc(c.title||'이벤트명을 입력해주세요')+'</dd></div><div class="fact"><dt>기간</dt><dd>'+esc(shortDate(c.start))+'<br>~ '+esc(shortDate(c.end))+'</dd></div><div class="fact"><dt>참여 대상</dt><dd>'+esc(c.audience)+'</dd></div><div class="fact"><dt>시작 방식</dt><dd>'+(c.step===1?'다음 단계에서 선택':c.mode==='ai'?'AI로 새로 만들기 · 체험':cfg?esc(cfg.name)+' 템플릿':'템플릿 선택 중')+'</dd></div></dl><p class="helper">시작한 이벤트는 미게시 상태로 저장됩니다. 편집 화면에서 확인한 뒤 게시할 수 있어요.</p>';
}

function creationView(){
 if(!ui.creation)ui.creation={step:1,title:'',start:DEMO_DATE,end:'2026-10-06',audience:'로그인 회원',mode:'template',templateId:null,prompt:''};
 const c=ui.creation;
 const progress='<ol class="create-progress" aria-label="이벤트 생성 단계"><li class="'+(c.step===1?'current':'done')+'" '+(c.step===1?'aria-current="step"':'')+'><span>'+(c.step===1?'1':icon('check'))+'</span>기본 정보</li><li class="'+(c.step===2?'current':'')+'" '+(c.step===2?'aria-current="step"':'')+'><span>2</span>시작 방식</li></ol>';
 let content='';
 if(c.step===1){
  content='<section class="panel"><div class="panel-head">먼저 이벤트의 기본 정보를 알려주세요</div><form id="create-basics" class="panel-body fields" novalidate><label class="field">이벤트명 <span class="helper">관리 목록과 이벤트 페이지의 제목으로 사용해요.</span><input data-create="title" name="title" maxlength="100" required placeholder="예: 가을맞이 함께하는 응원 이벤트" value="'+esc(c.title)+'"></label><div class="field-pair"><label class="field">시작일<input data-create="start" type="date" required value="'+esc(c.start)+'"></label><label class="field">종료일<input data-create="end" type="date" required value="'+esc(c.end)+'"></label></div><label class="field">참여 대상<select data-create="audience"><option value="로그인 회원" '+(c.audience==='로그인 회원'?'selected':'')+'>로그인한 모든 회원</option><option value="VIP · FAMILY 회원" '+(c.audience==='VIP · FAMILY 회원'?'selected':'')+'>VIP · FAMILY 회원</option></select><span class="helper">현재 프로토타입에서 사용하는 두 가지 대상입니다.</span></label><p id="create-error" class="create-error" role="alert"></p><div class="create-actions">'+button('cancel-create','취소')+'<button type="submit" class="btn primary">다음 · 시작 방식 선택 '+icon('arrow')+'</button></div></form></section>';
 }else{
  const modes='<div class="creation-methods">'+button('create-mode',icon('grid')+'<strong>템플릿으로 시작</strong><span>완성된 디자인을 고르고 내용을 다듬어요.</span>','data-mode="template" aria-pressed="'+(c.mode==='template')+'"','method-card '+(c.mode==='template'?'selected':''))+button('create-mode',icon('sparkle')+'<strong>AI로 새로 만들기 <small class="badge">체험</small></strong><span>원하는 이벤트를 설명하고 초안에서 시작해요.</span>','data-mode="ai" aria-pressed="'+(c.mode==='ai')+'"','method-card '+(c.mode==='ai'?'selected':''))+'</div>';
  const templates='<div class="creation-section-title"><h3>어울리는 템플릿을 선택해주세요</h3><p>디자인을 선택한 다음 아래 버튼으로 편집을 시작해요.</p></div><div class="template-grid create-template-grid">'+CONFIGS.map(cfg=>{
   const restricted=cfg.templateId==='tpl-3'&&c.audience!=='VIP · FAMILY 회원';
   const selected=c.templateId===cfg.templateId;
   return '<button class="template-option '+(selected?'selected':'')+'" data-act="select-create-template" data-template="'+cfg.templateId+'" aria-pressed="'+selected+'" '+(restricted?'aria-disabled="true"':'')+'>'+thumb(cfg,baseSnapshot(cfg))+'<span class="name">'+esc(cfg.name)+(selected?' <span class="badge pink">선택됨</span>':'')+'</span><span class="create-template-detail">'+esc(cfg.kind)+' · '+policyLabel(cfg)+'</span>'+(restricted?'<span class="template-restriction">참여 대상을 VIP · FAMILY로 설정해주세요.</span>':'')+'</button>';
  }).join('')+'</div>';
  const ai='<div class="creation-section-title"><h3>어떤 이벤트를 만들고 싶으신가요?</h3><p>목적, 원하는 분위기, 확정된 혜택 등을 자유롭게 적어주세요.</p></div><label class="field">이벤트 기획<textarea data-create="prompt" maxlength="2000" rows="6" placeholder="예: 가을맞이 고객 감사 이벤트를 만들고 싶어요. 흰색과 분홍색으로 따뜻하게 표현하고, 혜택은 아직 정해지지 않았으니 임의로 추가하지 말아주세요.">'+esc(c.prompt)+'</textarea></label><div class="review-note"><strong>AI 생성 흐름을 확인하는 체험 모드입니다.</strong><br>입력한 기획은 대화창에 전달되고, 공통 구조의 예시 초안이 열립니다. 실제 AI가 요청을 해석해 HTML을 생성하지는 않습니다.<br>예시 참여 방식: 로그인 후 계정당 1회 응모.</div>';
  content='<section class="panel"><div class="panel-head">어떤 방식으로 시작할까요?</div><div class="panel-body">'+modes+(c.mode==='template'?templates:ai)+'<p id="create-error" class="create-error" role="alert"></p><div class="create-actions">'+button('create-back',icon('back')+'기본 정보 수정')+button('finish-create',c.mode==='template'?'선택한 템플릿으로 시작 '+icon('arrow'):'AI 초안 체험하기 '+icon('sparkle'),'','btn primary')+'</div></div></section>';
 }
 return '<div class="container create-container">'+button('cancel-create',icon('back')+'이벤트 관리로','', 'backlink')+'<div class="page-heading"><span class="eyebrow">START SOMETHING NEW</span><h1>새 이벤트 만들기</h1><p>기본 정보를 정하고, 나에게 맞는 제작 방식으로 시작하세요.</p></div>'+progress+'<div class="create-layout"><div>'+content+'</div><aside id="creation-summary" class="card creation-summary">'+creationSummary()+'</aside></div></div>';
}

function creationError(text,field){
 const el=$('#create-error');if(el)el.textContent=text;
 if(field)document.querySelector('[data-create="'+field+'"]')?.focus();
 return false;
}

function validateCreation(){
 const c=ui.creation;
 if(!c||!c.title.trim())return creationError('이벤트명을 입력해주세요.','title');
 if(c.title.trim().length>100)return creationError('이벤트명은 100자 이내로 입력해주세요.','title');
 const dateOK=x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
 if(!dateOK(c.start)||!dateOK(c.end))return creationError('시작일과 종료일을 입력해주세요.','start');
 if(c.start>c.end)return creationError('종료일은 시작일보다 빠를 수 없어요.','end');
 if(!['로그인 회원','VIP · FAMILY 회원'].includes(c.audience))return creationError('참여 대상을 선택해주세요.','audience');
 return true;
}

function finishCreation(){
 if(ui.route!=='create'||!ui.logged||ui.role!=='admin'||!validateCreation())return;
 const c=ui.creation;
 if(c.mode==='template'&&!c.templateId)return creationError('시작할 템플릿을 선택해주세요.');
 if(c.mode==='ai'&&!c.prompt.trim())return creationError('만들고 싶은 이벤트를 설명해주세요.','prompt');
 if(c.mode==='ai'&&c.prompt.trim().length>2000)return creationError('기획은 2,000자 이내로 입력해주세요.','prompt');
 const cfg=c.mode==='ai'?AI_START:CONFIGS.find(x=>x.templateId===c.templateId);if(!cfg)return;
 if(cfg.templateId==='tpl-3'&&c.audience!=='VIP · FAMILY 회원')return creationError('VIP 감사 템플릿은 VIP · FAMILY 참여 대상에서 사용할 수 있어요.');
 const id='EVT-2026-'+String(Math.max(...state.db.events.map(e=>Number(e.id.split('-').at(-1))))+1).padStart(3,'0');
 const s=baseSnapshot(cfg);s.title=c.title.trim();s.start=c.start;s.end=c.end;
 const e={...clone(cfg),id,audience:c.audience,start:c.start,end:c.end,creationMethod:c.mode,creationPrompt:c.mode==='ai'?c.prompt.trim():null,publishedVersion:null,versions:[{v:1,source:null,createdAt:new Date().toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}),summary:c.mode==='ai'?'기획을 보관하고 예시 초안으로 시작':'기본 정보를 적용해 템플릿으로 시작',snapshot:s}]};
 state.db.events.push(e);
 ui.chats[id]=c.mode==='ai'?[{role:'user',text:c.prompt.trim()},{role:'assistant',text:'기획을 작업 공간에 가져왔어요. 지금 보이는 화면은 AI 생성 흐름을 확인하기 위한 공통 구조의 예시 초안입니다. 입력한 이벤트명과 기간이 적용되어 있어요.'}]:[{role:'assistant',text:cfg.name+' 템플릿에 이벤트명과 기간을 적용했어요. 미리보기를 확인하고 문구를 다듬어보세요.'}];
 ui.creation=null;persist();navigate('editor',id);toast('기본 정보를 적용한 새 작업 공간을 만들었어요.');
}

export { creationView, startCreation, creationError, validateCreation, finishCreation, creationSummary }
