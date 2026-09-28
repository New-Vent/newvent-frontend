/** 토스트 알림. 원본: toast() */

import { $ } from '@shared/dom.js'
import { state } from '@shared/state.js'

function toast(message){$('#toast').textContent=message;$('#toast').className='toast';clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>{$('#toast').textContent='';$('#toast').className='';},3500);}

export { toast }
