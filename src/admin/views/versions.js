/**
 * 버전 이력 · 비교 · 게시.
 * 저장된 버전은 불변이고, 사용자 화면은 publishedVersion 만 읽는다.
 * 원본: versionsView · previewVersion · chooseVersion · saveVersion ·
 *       publicationChecks · publicationCheck · publishSummary · showPublish
 */

import { navigate } from '@shared/navigate.js'

import { stopRequest } from './editor.js'

import { LABELS } from '@shared/constants.js'
import { $, clone, esc } from '@shared/dom.js'
import { requestPending } from '@shared/editor-state.js'
import { policyLabel, shortDate } from '@shared/format.js'
import { icon } from '@shared/icons.js'
import { TEMPLATE_BODIES } from '@shared/mock/templates.js'
import { persist } from '@shared/persist.js'
import { fullFrame, validSnapshot } from '@shared/preview/document.js'
import { currentDraft, currentEvent, isDirty, version } from '@shared/selectors.js'
import { state, ui } from '@shared/state.js'
import { button } from '@shared/ui/controls.js'
import { ask, modal } from '@shared/ui/modal.js'
import { toast } from '@shared/ui/toast.js'

function versionsView(){
 const e=currentEvent();
 return '<div class="container">'+button('edit',icon('back')+'편집 화면으로','data-id="'+e.id+'"','backlink')+'<div class="page-heading"><span class="eyebrow">VERSION HISTORY</span><h1>아이디어가 쌓이는 과정</h1><p>'+esc(e.versions.at(-1).snapshot.title)+'</p></div><div class="card">'+e.versions.slice().reverse().map(v=>'<div class="version-row"><div class="version-number">v'+v.v+'</div><div class="version-text"><h3>'+esc(v.summary)+' '+(v.v===e.publishedVersion?'<span class="badge green">게시 중</span>':'')+(v.checkpoint?'<span class="badge">저장 지점</span>':'')+'</h3><p>'+v.createdAt+' · '+(v.source?'v'+v.source+'에서 이어진 버전':'최초 버전')+'</p></div>'+button('preview-version','미리보기','data-version="'+v.v+'"','btn sm')+button('select-version','이 버전에서 작업','data-version="'+v.v+'"','btn sm')+button('toggle-checkpoint',v.checkpoint?'저장 지점 해제':'저장 지점 지정','data-version="'+v.v+'"','btn sm '+(v.checkpoint?'soft':'ghost'))+'</div>').join('')+'</div><p class="review-note">이전 버전에서 새 작업을 시작해도 저장된 이력은 유지됩니다. 사용자 화면에는 게시한 버전이 표시됩니다.</p></div>';
}

function previewVersion(num){
 const e=currentEvent(),v=version(e,num);if(!v)return;
 modal('v'+v.v+' · 저장된 버전 미리보기',
 '<p class="helper">읽기 전용 · '+esc(v.createdAt)+' · '+esc(v.summary)+'</p><p class="helper">현재 작업 초안과 게시 버전은 유지됩니다. 참여 버튼은 동작하지 않습니다.</p><div class="version-preview-frame">'+fullFrame(e,v.snapshot,'readonly')+'</div>',button('close','닫기','','btn primary'),true);
 $('#overlay .modal').classList.add('version-preview-modal');
}

function saveVersion(){
 const e=currentEvent(),d=currentDraft(e);
 if(requestPending(e.id)){toast('요청 처리가 끝난 뒤 저장해주세요.');return false;}
 if(!validSnapshot(d.snapshot))return false;
 if(!isDirty(e)){toast('저장할 새로운 변경 내용이 없어요.');return false;}
 const before=version(e,d.base).snapshot;
 const fields=Object.keys(LABELS).filter(k=>before[k]!==d.snapshot[k]);
 if(JSON.stringify(before.contentEdits||{})!==JSON.stringify(d.snapshot.contentEdits||{}))fields.push('contentEdits');
 if(JSON.stringify(before.buttonStyle||{})!==JSON.stringify(d.snapshot.buttonStyle||{}))fields.push('buttonStyle');
 const v=Math.max(...e.versions.map(x=>x.v))+1,source=d.base;
 e.versions.push({v,source,createdAt:new Date().toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}),summary:fields.slice(0,2).map(k=>k==='buttonStyle'?'버튼 디자인':k==='contentEdits'?'영역 문구':LABELS[k]).join(' · ')+' 수정'+(fields.length>2?' 외 '+(fields.length-2)+'건':''),snapshot:clone(d.snapshot)});
 // render 는 main.js 안에 있어 여기서 못 부른다 — 같은 화면으로 navigate 하면 다시 그린다
 d.base=v;persist();navigate('editor',e.id);toast('v'+source+'에서 이어지는 v'+v+'을 저장했어요.');return true;
}

function publicationChecks(e,v){
 const s=v.snapshot,doc=new DOMParser().parseFromString(TEMPLATE_BODIES[s.templateId]||'','text/html');
 const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x));
 const checks=[
  {label:'필수 문구',ok:!!(s.title?.trim()&&s.intro?.trim()&&s.benefitHeading?.trim()&&s.cta?.trim())},
  {label:'이벤트 기간',ok:validDate(s.start)&&validDate(s.end)&&s.start<=s.end},
  {label:'참여 대상·횟수',ok:!!e.audience&&['once','daily'].includes(e.policy)},
  {label:'참여 화면',ok:!!doc.querySelector('[data-block="notices"]')&&!!doc.querySelector('[data-slot="cta-link"]')}
 ];
 return checks;
}

function publicationCheck(e,v){
 const s=v.snapshot,checks=publicationChecks(e,v);
 return '<section class="publish-checks" aria-label="게시 전 점검"><h3>게시 전 확인</h3><ul>'+checks.map(x=>'<li class="'+(x.ok?'pass':'fail')+'">'+(x.ok?'✓':'!')+' '+x.label+' · '+(x.ok?'확인됨':'확인 필요')+'</li>').join('')+'</ul><dl><div><dt>선택 버전</dt><dd>v'+v.v+(v.v===e.publishedVersion?' · 현재 게시 중':'')+'</dd></div><div><dt>이벤트 기간</dt><dd>'+esc(s.start||'미설정')+' ~ '+esc(s.end||'미설정')+'</dd></div><div><dt>참여 대상</dt><dd>'+esc(e.audience||'미설정')+'</dd></div><div><dt>참여 방식</dt><dd>'+esc(e.kind||'미설정')+' · '+policyLabel(e)+'</dd></div></dl>'+(s.templateId==='ai-blank'?'<p class="review-note">이 버전은 AI 연결 없이 만든 시연용 기본 초안입니다. 혜택과 실제 참여 동작을 확인해주세요.</p>':'')+'</section>';
}

function publishSummary(e,v){
 const snapshot=v.snapshot;
 return '<strong>'+esc(snapshot.title)+'</strong><br>'+shortDate(snapshot.start)+' ~ '+shortDate(snapshot.end)+'<br>'+(e.publishedVersion?'현재 게시 v'+e.publishedVersion+' → ':'미게시 → ')+'선택 v'+v.v;
}

function showPublish(){
 const e=currentEvent(),d=currentDraft(e);
 const selected=version(e,d.base)||e.versions.at(-1);
 const options=e.versions.slice().reverse().map(v=>'<option value="'+v.v+'" '+(v.v===selected.v?'selected':'')+'>v'+v.v+(v.v===e.publishedVersion?' · 게시 중':'')+' — '+esc(v.summary)+'</option>').join('');
 modal('게시할 버전을 선택해주세요',
  '<p>저장된 버전 중 사용자에게 보여줄 내용을 선택하세요.</p>'+
  '<label class="field" style="margin-top:20px">게시할 버전<select id="publish-version" data-select="publish-version">'+options+'</select></label>'+
  '<div id="publish-summary" class="publish-card">'+publishSummary(e,selected)+'</div><div id="publish-checks">'+publicationCheck(e,selected)+'</div>'+
  (isDirty(e)?'<p class="review-note">저장하지 않은 수정 내용은 이번 게시에 포함되지 않고 편집 화면에 유지됩니다.</p>':'')+
  '<p style="margin-top:14px">게시 확정을 눌렀을 때 카드 썸네일과 상세 화면에 선택한 버전이 반영됩니다.</p>',
  button('close','취소')+button('confirm-publish','v'+selected.v+' 게시 확정','id="confirm-publish" '+(publicationChecks(e,selected).every(x=>x.ok)?'':'disabled'),'btn primary'));
 state.publishSelection={eventId:e.id,version:selected.v};
}

function chooseVersion(num){
 const e=currentEvent(),v=version(e,num);if(!v)return;
 const change=()=>{stopRequest(e.id,'다른 버전에서 작업을 시작해 이전 요청을 중단했어요.');ui.drafts[e.id]={base:v.v,snapshot:clone(v.snapshot)};navigate('editor',e.id);toast('v'+v.v+'에서 작업을 시작합니다.');};
 if(isDirty(e))ask('저장하지 않은 변경이 있어요','선택한 버전으로 이동하면 현재 저장 전 변경은 사라집니다. 먼저 저장하거나, 변경을 버리고 이동하세요.',change,'변경 버리고 이동');
 else change();
}

export { versionsView, previewVersion, saveVersion, showPublish, chooseVersion, publicationCheck, publicationChecks, publishSummary }
