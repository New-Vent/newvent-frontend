/** iframe 연결·재연결. 원본: bindFrame · hydrate */

import { showSelectedTarget } from '@shared/editor-state.js'

import { SERVER_OWNED, takeStagedDocument } from '@shared/preview/document.js'

import { participationAccess } from '@shared/participation.js'

import { BLOCK_LABELS, CONTENT_FIELDS } from '@shared/constants.js'
import { eventStatus } from '@shared/format.js'
import { applySelection, refreshButtonEditor, refreshContentEditor } from '@shared/preview/editable.js'
import { currentParticipation, eventById } from '@shared/selectors.js'
import { state, ui } from '@shared/state.js'
import { toast } from '@shared/ui/toast.js'

// ResizeObserver delivery must finish before writing layout-affecting styles.
function observeLayout(target, update) {
 const view=target.ownerDocument.defaultView;
 let pending=null;
 const schedule=()=>{if(pending!==null)return;pending=view.requestAnimationFrame(()=>{pending=null;if(target.isConnected)update();});};
 const observer=new view.ResizeObserver(schedule);
 observer.observe(target);
 schedule();
 state.observers.push({disconnect(){observer.disconnect();if(pending!==null)view.cancelAnimationFrame(pending);pending=null;}});
}

function bindFrame(frame){
 const doc=frame.contentDocument,e=eventById(frame.dataset.event),mode=frame.dataset.mode;
 if(!doc?.querySelector('[data-block]')||doc.__newventBound)return;
 doc.__newventBound=true;
 const box=doc.querySelector('.ev-container')||doc.body;
 const resize=()=>{if(!frame.isConnected)return;const h=Math.ceil(box.getBoundingClientRect().height);if(h>100&&Math.abs(frame.offsetHeight-h)>3)frame.style.height=h+'px';};
 observeLayout(box,resize);
 if(mode==='editor'){
  doc.querySelectorAll('[data-block]').forEach(b=>{b.style.cursor=b.dataset.block==='notices'?'default':'pointer';b.title=BLOCK_LABELS[b.dataset.block]+' 영역';});
  // 스크립트를 살렸으므로 템플릿 자체 위임(.ev-container 의 데모 토스트)이
  // 함께 뜬다. capture 단계에서 먼저 잡고 전파를 끊는다.
  doc.addEventListener('click',ev=>{
   ev.preventDefault();const b=ev.target.closest('[data-block]');if(!b)return;
   ev.stopPropagation();
   if(b.dataset.block==='notices'){toast('유의사항은 고정된 원본을 유지합니다.');return;}
   ui.block=b.dataset.block;
   let key=ev.target.closest('[data-nv-text]')?.dataset.nvText;
   Object.entries(CONTENT_FIELDS).forEach(([k,q])=>{if(ev.target.closest(q))key='field:'+k;});
   showSelectedTarget(e,key,ev.target);applySelection();refreshButtonEditor();refreshContentEditor(key);
  },true);
  applySelection();refreshContentEditor();return;
 }
 // 서버 편집 화면의 직접 수정 — 누른 글자를 편집 화면(server-editor.js)에 알린다. 페이지 동작은 막는다
 if(mode==='server-edit'){
  doc.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=true);
  doc.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();frame.dispatchEvent(new CustomEvent('nv-pick',{bubbles:true,detail:{target:ev.target,x:ev.clientX,y:ev.clientY}}));},true);return;
 }
 // 서버 편집 화면의 AI 대화 — 누른 영역(data-block)을 편집 화면에 알린다. 유의사항은 서버 소유라 고를 수 없다
 if(mode==='server-select'){
  doc.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=true);
  doc.querySelectorAll('[data-block]').forEach(b=>{const own=b.dataset.block==='notices';b.style.cursor=own?'default':'pointer';b.title=own?'유의사항은 고칠 수 없어요':(BLOCK_LABELS[b.dataset.block]||b.dataset.block)+' 영역 — 눌러서 고르기';});
  // 올린 영역에 이름표 — "누르면 고를 수 있다"를 미리보기 안에서 바로 알린다
  const tag=doc.createElement('div');tag.className='nv-pick-tag';tag.hidden=true;doc.body.appendChild(tag);
  let over=null;
  const label=b=>{const own=b.dataset.block==='notices',name=BLOCK_LABELS[b.dataset.block]||b.dataset.block;
   tag.textContent=own?name+' · 고칠 수 없어요':b.classList.contains('newvent-selected')?'✓ '+name+' 선택됨 · 눌러서 해제':name+' · 눌러서 고르기';
   tag.classList.toggle('own',own);tag.classList.toggle('on',!own&&b.classList.contains('newvent-selected'));};
  const place=b=>{const r=b.getBoundingClientRect(),w=doc.defaultView;tag.style.top=Math.max(0,r.top+w.scrollY-11)+'px';tag.style.left=(r.left+w.scrollX+12)+'px';};
  doc.addEventListener('mouseover',ev=>{const b=ev.target.closest('[data-block]');if(b===over)return;
   over?.classList.remove('nv-pick-hover');over=b;tag.hidden=!b;if(!b)return;
   if(b.dataset.block!=='notices')b.classList.add('nv-pick-hover');label(b);place(b);});
  doc.addEventListener('mouseleave',()=>{over?.classList.remove('nv-pick-hover');over=null;tag.hidden=true;});
  doc.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();const b=ev.target.closest('[data-block]');if(!b)return;frame.dispatchEvent(new CustomEvent('nv-block',{bubbles:true,detail:{block:b.dataset.block}}));
   // 칩 · 외곽선은 편집 화면이 바로 바꾼다 — 이름표도 그 상태로 다시 쓴다
   if(b===over)label(b);},true);return;
 }
 if(mode==='readonly'){
  doc.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=true);
  doc.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();},true);return;
 }
 // 서버 모드 프레임에는 목업 이벤트가 없다. 참여 로직은 목업 전용이므로
 // 못 찾으면 읽기 전용처럼 두고 빠진다.
 if(!e){doc.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();},true);return;}
 const st=eventStatus(e),p=ui.logged?currentParticipation(e):null;
 if(st!=='live'||participationAccess(e).kind==='grade'){
  doc.querySelectorAll('button,input').forEach(b=>{b.disabled=true;b.title=participationAccess(e).message;});
 }else if(p){
  doc.querySelectorAll('button[data-vote]').forEach(b=>b.disabled=true);
  const cta=doc.querySelector('[data-slot="cta-link"]');if(cta)cta.textContent='나의 참여 결과 확인하기';
 }
 doc.querySelectorAll('button[data-vote]').forEach(b=>b.setAttribute('aria-pressed',String(ui.votes[e.id]===b.dataset.vote)));
 doc.addEventListener('click',ev=>{
  const b=ev.target.closest('button,a');if(!b)return;
  ev.preventDefault();ev.stopPropagation();if(b.disabled)return;
  if(!['ready','login','done'].includes(participationAccess(e).kind))return toast(participationAccess(e).message);
  if(!ui.logged){showLoginPrompt();return;}
  const record=currentParticipation(e);
  if(record){showResult(record.id);return;}
  if(b.dataset.vote){
   ui.votes[e.id]=b.dataset.vote;
   doc.querySelectorAll('[data-vote]').forEach(x=>{const chosen=x===b;x.setAttribute('aria-pressed',String(chosen));x.style.outline=chosen?'3px solid #e746a3':'';});
   toast(b.textContent.trim()+'를 선택했어요. 하단 참여 버튼으로 접수해주세요.');return;
  }
  if(b.matches('.hl-share-btn,.lc-share-btn')){toast('공유 화면을 확인하는 체험 버튼입니다. 참여 횟수는 변경되지 않아요.');return;}
  if(b.matches('.lc-form-btn')){toast('인증 화면을 확인하는 체험 버튼입니다. 실제 문자는 발송되지 않아요.');return;}
  if(e.templateId==='tpl-2'&&b.matches('[data-slot="cta-link"]')){
   const section=doc.querySelector('[data-block="benefits"]');window.scrollTo({top:frame.getBoundingClientRect().top+window.scrollY+section.offsetTop-95,behavior:'smooth'});return;
  }
  if(b.matches('[data-demo-msg],[data-slot="cta-link"]')){
   if(e.templateId==='tpl-1'&&!ui.votes[e.id]){toast('먼저 승리할 팀을 선택해주세요.');return;}
   if(e.templateId==='tpl-5'){
    const tel=doc.querySelector('input[type="tel"]');
    if(tel&&!/^01[016789]\d{7,8}$/.test(tel.value.replace(/\D/g,''))){tel.focus();toast('휴대폰 번호 형식을 확인해주세요.');return;}
   }
   const idx=Array.from(doc.querySelectorAll('.hl-pouch-btn')).indexOf(b);
   participate(e,idx);
  }
 },true);
}


/**
 * 블록 하나만 갈아끼운다 (AI_EDIT_RULES 2-2).
 *
 * 전체 문서를 다시 만들면 iframe 이 리로드되어 깜빡이고 스크롤이 날아간다.
 * LLM 응답은 `<section data-block="…">` 전체(outerHTML)여야 하며,
 * 내부 조각만 오면 중첩 section 이 생기므로 거부한다.
 *
 * 교체 후 템플릿이 노출하는 window.newVentReinit(key) 를 불러
 * 타이머(template_4)·참가자 카운터(template_5)를 새 DOM 에 다시 연결한다.
 *
 * @returns {boolean} 교체 성공 여부
 */
function replaceBlock(frame, key, html) {
  const doc = frame?.contentDocument
  if (!doc || !html) return false

  // 유의사항은 서버 소유 — 호스트에서도 한 번 더 막는다.
  if (SERVER_OWNED.has(key)) {
    toast('유의사항은 고정된 원본을 유지합니다.')
    return false
  }

  const target = doc.querySelector(`[data-block="${key}"]`)
  if (!target) return false

  const next = new DOMParser()
    .parseFromString(html, 'text/html')
    .querySelector(`[data-block="${key}"]`)
  if (!next) {
    // 규격 위반. 조용히 넘기면 화면만 안 바뀌어 원인을 못 찾는다.
    console.warn(`[newvent] ${key} 블록 응답이 section outerHTML 이 아닙니다.`)
    return false
  }

  target.replaceWith(doc.importNode(next, true))
  try {
    frame.contentWindow?.newVentReinit?.(key)
  } catch (e) {
    console.warn('[newvent] newVentReinit 실패', e)
  }
  return true
}

function hydrate(root=document){
 // 뷰가 찍어둔 자리표시자(data-doc)를 실제 문서로 채운다.
 root.querySelectorAll('iframe[data-doc]').forEach(frame=>{
  const html=takeStagedDocument(frame.dataset.doc);
  delete frame.dataset.doc;
  if(html!==undefined)frame.srcdoc=html;
 });
 root.querySelectorAll('.thumb').forEach(el=>{
  if(el.dataset.bound)return;
  // 썸네일 HTML 이 없으면 자리표시자(.thumb-empty)만 있고 iframe 이 없다.
  const frame=el.querySelector('iframe');
  if(!frame)return;
  el.dataset.bound='true';
  const scale=()=>{if(el.isConnected)frame.style.transform='scale('+(el.clientWidth/720)+')';};
  observeLayout(el,scale);
 });
 root.querySelectorAll('.event-frame').forEach(frame=>{frame.onload=()=>bindFrame(frame);bindFrame(frame);});
}

export { bindFrame, hydrate, replaceBlock }
