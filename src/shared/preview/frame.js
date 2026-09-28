/** iframe 연결·재연결. 원본: bindFrame · hydrate */

import { participationAccess } from '@shared/participation.js'

import { BLOCK_LABELS, CONTENT_FIELDS } from '@shared/constants.js'
import { eventStatus } from '@shared/format.js'
import { applySelection, refreshButtonEditor, refreshContentEditor } from '@shared/preview/editable.js'
import { currentParticipation, eventById } from '@shared/selectors.js'
import { state, ui } from '@shared/state.js'
import { toast } from '@shared/ui/toast.js'

function bindFrame(frame){
 const doc=frame.contentDocument,e=eventById(frame.dataset.event),mode=frame.dataset.mode;
 if(!doc?.querySelector('[data-block]')||doc.__newventBound)return;
 doc.__newventBound=true;
 const box=doc.querySelector('.ev-container')||doc.body;
 const resize=()=>{if(!frame.isConnected)return;const h=Math.ceil(box.getBoundingClientRect().height);if(h>100&&Math.abs(frame.offsetHeight-h)>3)frame.style.height=h+'px';};
 resize();const ro=new ResizeObserver(resize);ro.observe(box);state.observers.push(ro);
 if(mode==='editor'){
  doc.querySelectorAll('[data-block]').forEach(b=>{b.style.cursor=b.dataset.block==='notices'?'default':'pointer';b.title=BLOCK_LABELS[b.dataset.block]+' 영역';});
  doc.addEventListener('click',ev=>{
   ev.preventDefault();const b=ev.target.closest('[data-block]');if(!b)return;
   if(b.dataset.block==='notices'){toast('유의사항은 고정된 원본을 유지합니다.');return;}
   ui.block=b.dataset.block;
   let key=ev.target.closest('[data-nv-text]')?.dataset.nvText;
   Object.entries(CONTENT_FIELDS).forEach(([k,q])=>{if(ev.target.closest(q))key='field:'+k;});
   showSelectedTarget(e,key,ev.target);applySelection();refreshButtonEditor();refreshContentEditor(key);
  });
  applySelection();refreshContentEditor();return;
 }
 if(mode==='readonly'){
  doc.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=true);
  doc.addEventListener('click',ev=>ev.preventDefault(),true);return;
 }
 const st=eventStatus(e),p=ui.logged?currentParticipation(e):null;
 if(st!=='live'||participationAccess(e).kind==='grade'){
  doc.querySelectorAll('button,input').forEach(b=>{b.disabled=true;b.title=participationAccess(e).message;});
 }else if(p){
  doc.querySelectorAll('button[data-vote]').forEach(b=>b.disabled=true);
  const cta=doc.querySelector('[data-slot="cta-link"]');if(cta)cta.textContent='나의 참여 결과 확인하기';
 }
 doc.querySelectorAll('button[data-vote]').forEach(b=>b.setAttribute('aria-pressed',String(ui.votes[e.id]===b.dataset.vote)));
 doc.addEventListener('click',ev=>{
  const b=ev.target.closest('button,a');if(!b)return;ev.preventDefault();if(b.disabled)return;
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
 });
}

function hydrate(root=document){
 root.querySelectorAll('.thumb').forEach(el=>{
  if(el.dataset.bound)return;el.dataset.bound='true';
  const frame=el.querySelector('iframe');const scale=()=>{if(el.isConnected)frame.style.transform='scale('+(el.clientWidth/720)+')';};
  scale();const ro=new ResizeObserver(scale);ro.observe(el);state.observers.push(ro);
 });
 root.querySelectorAll('.event-frame').forEach(frame=>{frame.onload=()=>bindFrame(frame);bindFrame(frame);});
}

export { bindFrame, hydrate }
