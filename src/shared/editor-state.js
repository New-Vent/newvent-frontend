/**
 * 편집 스튜디오의 화면 상태.
 *
 * preview/editable.js · preview/frame.js 가 이 판정을 쓰기 때문에
 * 관리자 뷰가 아니라 shared 에 둔다 (participation.js 와 같은 이유).
 *
 * requestFor/requestPending 은 지금은 목업 요청 상태다.
 * 나중에 SSE 진행 상태가 붙을 자리이기도 하다.
 *
 * 원본: requestFor · requestPending · selectionCaption ·
 *       showSelectedTarget · updateEditor
 */

import { $ } from '@shared/dom.js'

import { BLOCK_LABELS, LABELS } from '@shared/constants.js'
import { applySnapshot } from '@shared/preview/document.js'
import { applySelection } from '@shared/preview/editable.js'
import { currentDraft, currentEvent, isDirty } from '@shared/selectors.js'
import { ui } from '@shared/state.js'

function requestFor(id=currentEvent().id){
 if(!ui.requests[id])ui.requests[id]={status:'idle',prompt:'',attempt:0,token:0,message:''};
 return ui.requests[id];
}

function requestPending(id=currentEvent().id){return requestFor(id).status==='processing';}

function selectionCaption(e){
 const selected=ui.selectedTargets[e.id];
 return selected?BLOCK_LABELS[selected.block]+(selected.label?' · '+selected.label:''):'선택된 영역 없음';
}

function showSelectedTarget(e,key=null,element=null){
 let label='';
 if(key?.startsWith('field:'))label=LABELS[key.slice(6)]||'';
 else if(key){const snippet=element?.textContent?.trim().replace(/\s+/g,' ')||'';label=snippet.length>20?snippet.slice(0,20)+'…':snippet;}
 ui.selectedTargets[e.id]={block:ui.block,label};
 const display=$('#selected-target');if(display)display.textContent='선택 영역: '+selectionCaption(e);
}

function updateEditor(){
 if(ui.route!=='editor')return;
 const d=currentDraft(),doc=$('.event-frame[data-mode="editor"]')?.contentDocument;if(doc)applySnapshot(doc,d.snapshot);
 const badge=$('#dirty-badge');if(badge){badge.textContent=isDirty()?'저장 전 변경':'저장된 버전';badge.className='badge '+(isDirty()?'amber':'');}
 document.querySelectorAll('[data-content-key]').forEach(input=>{if(input===document.activeElement)return;const key=input.dataset.contentKey;input.value=key.startsWith('field:')?d.snapshot[key.slice(6)]:(d.snapshot.contentEdits?.[key]??input.value);});
 const bi=$('[data-button-text]');if(bi&&document.activeElement!==bi)bi.value=d.snapshot.cta;
 applySelection();
}

export { requestFor, requestPending, selectionCaption, showSelectedTarget, updateEditor }
