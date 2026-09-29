/**
 * 이벤트 제작 스튜디오 — 이 프로젝트에서 가장 무거운 화면.
 *
 * 3분할: 이벤트 폼 / AI 채팅 / iframe 미리보기
 *
 * ⚠ localResponse 는 목업이다. 실제 LLM 호출·SSE 로 바꿔야 한다 (TODO.md 2번).
 *
 * 원본: editorView · chatBody · refreshChat · addChat · handlePrompt ·
 *       stopRequest · localResponse · setEditorMode · requestStatusView ·
 *       changeChatSide
 */

import { updateEditor } from '@shared/editor-state.js'

import { BLOCK_LABELS, FIELD_BLOCK, LABELS } from '@shared/constants.js'
import { $, clone, esc } from '@shared/dom.js'
import { requestFor, requestPending, selectionCaption } from '@shared/editor-state.js'
import { icon } from '@shared/icons.js'
import { baseSnapshot } from '@shared/mock/fixtures.js'
import { fullFrame } from '@shared/preview/document.js'
import { buttonEditor } from '@shared/preview/editable.js'
import { currentDraft, currentEvent, eventById, isDirty } from '@shared/selectors.js'
import { ui } from '@shared/state.js'
import { button, field } from '@shared/ui/controls.js'

function requestStatusView(e){
 const r=requestFor(e.id);
 if(r.status==='idle')return '<div class="request-idle">'+icon('sparkle')+'<span>요청을 보내면 처리 상태가 이곳에 표시돼요.</span></div>';
 const labels={processing:'처리 중',clarify:'추가 확인이 필요해요',success:'처리 완료',error:'요청을 완료하지 못했어요',cancelled:'요청이 중단되었어요',unsupported:'요청을 더 구체적으로 적어주세요'};
 const ico=r.status==='processing'?'clock':r.status==='success'?'check':r.status==='error'?'clock':'sparkle';
 let body='<div class="request-state '+r.status+'" role="status" aria-live="polite" data-request-state="'+r.status+'"><div class="request-state-head">'+(r.status==='processing'?'<span class="request-spinner" aria-hidden="true"></span>':icon(ico))+'<strong>'+labels[r.status]+'</strong>'+(r.attempt>1?'<span class="badge">'+r.attempt+'번째 시도</span>':'')+'</div><p>'+esc(r.message)+'</p>';
 if(r.status==='processing')body+='<div class="request-actions">'+button('cancel-request','요청 중단','','btn sm')+'</div>';
 if(r.status==='clarify')body+='<div class="request-actions">'+button('answer-request','제목을 짧게','data-answer="title"','btn sm')+button('answer-request','소개를 친근하게','data-answer="intro"','btn sm')+button('edit-request','직접 설명할게요','','btn sm ghost')+'</div>';
 if(r.status==='error'||r.status==='cancelled')body+='<div class="request-actions">'+button('retry-request','다시 시도','','btn sm soft')+button('edit-request','요청 수정하기','','btn sm')+'</div>';
 if(r.status==='unsupported')body+='<div class="request-actions">'+button('edit-request','요청 수정하기','','btn sm')+'</div>';
 return body+'</div>';
}

function chatBody(e){
 const r=requestFor(e.id),pending=r.status==='processing';
 const messages=ui.chats[e.id]||[{role:'assistant',text:'어떤 이벤트로 다듬어볼까요? 원하는 문구를 요청해주세요. 미리보기에서 확인한 뒤 저장·게시할 수 있어요.'}];
 return '<div class="chat" id="chat-log" role="log" aria-label="이벤트 편집 대화" aria-live="polite">'+messages.map(m=>'<div class="bubble '+(m.role==='user'?'me':'')+'"><small>'+(m.role==='user'?'관리자':'NewVent 어시스턴트')+'</small>'+esc(m.text)+'</div>').join('')+'</div>'+
 '<div id="request-status">'+requestStatusView(e)+'</div>'+
 '<div class="selection-context" id="selected-target" role="status" aria-live="polite">선택 영역: '+esc(selectionCaption(e))+'</div>'+
 '<form id="chat-form" aria-busy="'+pending+'"><label class="field"><span>어떻게 바꿔볼까요?</span><textarea name="prompt" placeholder="예: 제목: 함께 응원하고 선물 받아요" rows="3" required maxlength="1000" '+(pending?'disabled':'')+'>'+esc(ui.chatInputs[e.id]||'')+'</textarea></label><div class="chips">'+button('prompt','제목 줄이기','data-prompt="제목을 짧게 정리해줘" '+(pending?'disabled':''),'chip')+button('prompt','친근한 소개','data-prompt="소개를 친근하게 바꿔줘" '+(pending?'disabled':''),'chip')+button('prompt','버튼 문구','data-prompt="버튼: 지금 참여하기" '+(pending?'disabled':''),'chip')+'</div><button class="btn primary wide" type="submit" '+(pending?'disabled':'')+'>'+icon('sparkle')+(pending?'요청을 처리하고 있어요':'수정 요청 보내기')+'</button></form>'+
 '<details class="scenario-lab" id="scenario-lab" '+(ui.demoOpen[e.id]?'open':'')+'><summary>응답 상태 체험</summary><p>다음 요청 한 번에만 적용됩니다. 실제 AI 호출 없이 화면 상태를 확인해요.</p><div class="scenario-buttons">'+[['normal','정상 응답'],['clarify','추가 질문'],['timeout','시간 초과'],['error','응답 오류']].map(([v,t])=>button('request-scenario',t,'data-scenario="'+v+'" aria-pressed="'+((ui.scenarios[e.id]||'normal')===v)+'" '+(pending?'disabled':''),'chip '+((ui.scenarios[e.id]||'normal')===v?'selected':''))).join('')+'</div></details>';
}

function setEditorMode(mode){
 ui.editorMode=mode==='direct'?'direct':'chat';
 const chat=$('#workspace-chat'),direct=$('#workspace-direct');
 if(chat)chat.hidden=ui.editorMode!=='chat';if(direct)direct.hidden=ui.editorMode!=='direct';
 document.querySelectorAll('[data-act="editor-mode"]').forEach(b=>{const active=b.dataset.mode===ui.editorMode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
}

function editorView(){
 const e=currentEvent(),d=currentDraft(e),s=d.snapshot,pending=requestPending(e.id);
 const mode=ui.editorMode||'chat';
 return '<div class="container studio-container workspace '+(ui.chatSide==='right'?'chat-right':'')+'"><div class="workspace-toolbar"><div class="workspace-title"><button class="backlink" data-act="route" data-route="admin">'+icon('back')+'이벤트 관리</button><strong>'+esc(e.name)+'</strong></div><fieldset id="workspace-dates" '+(pending?'disabled':'')+'>'+field('start',s,'date')+field('end',s,'date')+'</fieldset><div class="row workspace-actions">'+button('versions','버전 이력','data-id="'+e.id+'"','btn sm')+button('save','새 버전 저장',pending?'disabled':'','btn sm')+button('publish','게시하기','','btn primary sm')+'</div></div><div class="chat-position"><span>데스크톱 채팅 위치</span>'+button('chat-side','왼쪽','data-side="left" aria-pressed="'+(ui.chatSide!=='right')+'"',ui.chatSide==='right'?'':'active')+button('chat-side','오른쪽','data-side="right" aria-pressed="'+(ui.chatSide==='right')+'"',ui.chatSide==='right'?'active':'')+'</div><div class="studio-layout workspace-layout">'+
 '<aside class="panel workspace-side"><div class="workspace-tabs">'+button('editor-mode','AI 대화','data-mode="chat" aria-pressed="'+(mode==='chat')+'"','active-tab '+(mode==='chat'?'active':''))+button('editor-mode','직접 수정','data-mode="direct" aria-pressed="'+(mode==='direct')+'"','active-tab '+(mode==='direct'?'active':''))+'</div><section id="workspace-chat" class="chat-panel" '+(mode==='chat'?'':'hidden')+'><div class="panel-body" id="chat-panel-inner">'+chatBody(e)+'</div></section><section id="workspace-direct" '+(mode==='direct'?'':'hidden')+'><p class="workspace-tip">미리보기에서 고칠 문구를 클릭하세요. 유의사항은 고정입니다.</p><section id="content-editor" hidden></section><section id="button-editor" '+(ui.block==='cta'?'':'hidden')+'>'+(ui.block==='cta'?buttonEditor():'')+'</section></section></aside>'+
 '<div class="studio-preview-column"><section class="panel"><div class="preview-controls"><div class="row wrap"><span>미리보기</span><span class="badge pink">작업 기준 v'+d.base+'</span><span class="badge green">'+(e.publishedVersion?'게시 v'+e.publishedVersion:'미게시')+'</span><span id="dirty-badge" class="badge '+(isDirty(e)?'amber':'')+'">'+(isDirty(e)?'저장 전 변경':'저장된 버전')+'</span></div><div class="device-controls">'+button('device',icon('desktop'),'data-mode="desktop" aria-label="데스크톱 미리보기"','btn sm '+(!ui.mobile?'active':''))+button('device',icon('phone'),'data-mode="mobile" aria-label="모바일 미리보기"','btn sm '+(ui.mobile?'active':''))+'</div></div>'+
 '<div class="preview-helper" id="preview-request-state">'+(pending?'요청 처리 중 · 기존 미리보기를 유지하고 있어요.':'대화로 수정한 내용을 확인한 뒤 새 버전으로 저장하세요.')+'</div><div style="padding:0 15px 12px"><div class="block-selector">'+Object.entries(BLOCK_LABELS).filter(([k])=>k!=='notices').map(([k,t])=>button('block',t,'data-block="'+k+'"',ui.block===k?'active':'')).join('')+'</div></div><div class="canvas"><div class="canvas-frame '+(ui.mobile?'mobile':'')+'">'+fullFrame(e,s,'editor')+'</div></div></section></div>'+
 '</div></div>';
}

function refreshChat(id){
 if(ui.route!=='editor'||ui.activeId!==id)return;
 const e=eventById(id),panel=$('#chat-panel-inner');if(!panel||!e)return;
 const ownedFocus=panel.contains(document.activeElement);
 panel.innerHTML=chatBody(e);
 const pending=requestPending(id),fields=$('#manual-edit fieldset'),save=$('[data-act="save"]');
 const dates=$('#workspace-dates');if(dates)dates.disabled=pending;if(fields)fields.disabled=pending;if(save)save.disabled=pending;const bf=$('#button-fields');if(bf)bf.disabled=pending;const cf=$('#content-fields');if(cf)cf.disabled=pending;
 const hint=$('#preview-request-state');
 if(hint)hint.textContent=pending?'요청 처리 중 · 기존 미리보기를 유지하고 있어요.':'대화로 수정한 내용을 확인한 뒤 새 버전으로 저장하세요.';
 const log=$('#chat-log');if(log)log.scrollTop=log.scrollHeight;
 if(ownedFocus){
  const status=requestFor(id).status;
  const target=pending?panel.querySelector('.request-state'):
   status==='clarify'?panel.querySelector('[data-act="answer-request"]'):
   ['error','cancelled'].includes(status)?panel.querySelector('[data-act="retry-request"]'):panel.querySelector('#chat-form textarea');
  if(target){if(pending)target.tabIndex=-1;target.focus({preventScroll:true});}
 }
}

function addChat(id,text,role='assistant'){
 if(!ui.chats[id])ui.chats[id]=[];
 ui.chats[id].push({role,text});
}

function stopRequest(id,reason='요청을 중단했어요. 기존 미리보기는 그대로 유지됩니다.'){
 const r=ui.requests[id];if(!r||!['processing','clarify'].includes(r.status))return;
 r.token++;r.status='cancelled';r.message=reason;addChat(id,reason);refreshChat(id);
}

function localResponse(e,snapshot,prompt){
 const next=clone(snapshot),match=prompt.match(/^(제목|소개|혜택 제목|버튼)\s*[:：]\s*([\s\S]+)/);
 let reply='',block=null;
 if(match){
  const key=({'제목':'title','소개':'intro','혜택 제목':'benefitHeading','버튼':'cta'})[match[1]];
  const value=match[2].trim();
  if(!value)return {unsupported:true};
  next[key]=value;reply=LABELS[key]+'를 요청한 문구로 바꿨어요.';block=FIELD_BLOCK[key];
 }else if(prompt.includes('제목')&&prompt.includes('짧게')){
  const names={'tpl-1':'함께 응원하는 승리의 순간','tpl-2':'복주머니에 담긴 가을 선물','tpl-3':'고마움을 담은 VIP 혜택','tpl-4':'지금 만나는 72시간 특가','tpl-5':'NewVent 2.0을 먼저 만나보세요'};
  next.title=names[e.templateId]||snapshot.title;reply='제목을 짧게 정리했어요.';block='hero';
 }else if(prompt.includes('소개')&&prompt.includes('친근')){
  next.intro=baseSnapshot(e).intro+' 여러분의 참여를 기다리고 있어요. 함께 즐겨볼까요?';reply='소개에 친근한 초대 문구를 더했어요.';block='hero';
 }else return {unsupported:true};
 if(JSON.stringify(next)===JSON.stringify(snapshot))reply='요청한 문구가 이미 적용되어 있어 추가 변경은 없어요.';
 return {snapshot:next,reply,block};
}

function handlePrompt(prompt,options={}){
 if(!ui.logged||ui.role!=='admin'||ui.route!=='editor')return;
 const e=currentEvent(),d=currentDraft(e),r=requestFor(e.id);
 if(r.status==='processing'||!prompt.trim())return;
 const before=clone(d.snapshot),base=d.base,token=r.token+1;
 const scenario=options.scenario||ui.scenarios[e.id]||'normal';
 ui.scenarios[e.id]='normal';ui.chatInputs[e.id]='';
 r.attempt=options.retry?r.attempt+1:1;r.prompt=prompt;r.token=token;r.status='processing';r.message='요청 내용을 확인하고 있어요. 기존 화면은 그대로 유지됩니다.';
 addChat(e.id,options.retry?'같은 요청으로 다시 시도: '+prompt:prompt,'user');
 refreshChat(e.id);
 const alive=()=>ui.requests[e.id]===r&&r.token===token&&r.status==='processing';
 const sourceUnchanged=()=>ui.drafts[e.id]===d&&d.base===base&&JSON.stringify(d.snapshot)===JSON.stringify(before);
 setTimeout(()=>{
  if(!alive())return;
  r.message='문구를 정리하고 응답을 확인하고 있어요.';refreshChat(e.id);
 },400);
 setTimeout(()=>{
  if(!alive())return;
  if(!sourceUnchanged()){
   r.status='cancelled';r.message='작업 기준이 바뀌어 이전 요청의 결과를 적용하지 않았어요. 현재 화면에서 다시 요청해주세요.';
  }else if(scenario==='timeout'||scenario==='error'){
   r.status='error';r.failureType=scenario;
   r.message=scenario==='timeout'?'응답 시간이 초과되었어요. 요청 전 미리보기를 유지했으니 다시 시도해주세요.':'응답을 가져오지 못했어요. 기존 내용과 저장된 버전은 유지됩니다.';
  }else if(scenario==='clarify'||/^(전체적으로\s*|좀\s*|이거\s*)?(고쳐|수정해|다듬어)(줘|주세요)[.!?]*$/.test(prompt.trim())){
   r.status='clarify';r.message='어느 문구를 어떤 방향으로 다듬을까요? 아래에서 선택하거나 원하는 내용을 직접 설명해주세요.';
  }else{
   const response=localResponse(e,before,prompt);
   if(response.unsupported){
    r.status='unsupported';r.message='현재 체험에서는 제목·소개·혜택 제목·버튼 문구를 수정할 수 있어요. “제목: 바꿀 문구”처럼 요청해주세요. 기존 내용은 유지했어요.';
   }else{
    d.snapshot=response.snapshot;r.status='success';r.message=response.reply+' 미리보기에서 확인해주세요.';
    if(ui.route==='editor'&&ui.activeId===e.id){
     ui.block=response.block||ui.block;
     document.querySelectorAll('[data-field]').forEach(n=>{n.value=d.snapshot[n.dataset.field];});
     updateEditor();
    }
   }
  }
  addChat(e.id,r.message);refreshChat(e.id);
 },1400);
}
function changeChatSide(side){
 if(side!=='left'&&side!=='right')return;
 ui.chatSide=side;try{localStorage.setItem('newvent-admin-chat-side',side)}catch{}
 const workspace=$('.workspace');if(workspace)workspace.classList.toggle('chat-right',side==='right');
 document.querySelectorAll('[data-act="chat-side"]').forEach(b=>{const selected=b.dataset.side===side;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});
}

export { editorView, refreshChat, addChat, stopRequest, handlePrompt, setEditorMode, changeChatSide }
