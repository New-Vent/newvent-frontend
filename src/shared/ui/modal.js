/** 모달·확인창. 원본: modal · closeModal · ask */

import { $, esc } from '@shared/dom.js'
import { icon } from '@shared/icons.js'
import { hydrate } from '@shared/preview/frame.js'
import { state } from '@shared/state.js'
import { button } from '@shared/ui/controls.js'

function modal(title,body,actions='',wide=false){
 state.returnFocus=document.activeElement;
 $('#overlay').innerHTML='<div class="modal-backdrop"><section class="modal '+(wide?'wide':'')+'" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h2 id="modal-title">'+esc(title)+'</h2>'+button('close',icon('close'),'aria-label="닫기"','icon-btn')+'</div>'+body+(actions?'<div class="modal-actions">'+actions+'</div>':'')+'</section></div>';
 document.body.style.overflow='hidden';hydrate($('#overlay'));
 setTimeout(()=>$('#overlay').querySelector('button,input,select,textarea')?.focus(),0);
}

function closeModal(){
 $('#overlay').innerHTML='';document.body.style.overflow='';state.confirmAction=null;state.publishSelection=null;
 if(state.returnFocus?.isConnected)state.returnFocus.focus();state.returnFocus=null;
}

function ask(title,text,action,label='계속하기'){
 modal(title,'<p>'+esc(text)+'</p>',button('close','취소')+button('confirm-local',label,'','btn primary'));
 state.confirmAction=action;
}

export { modal, closeModal, ask }
