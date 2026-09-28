/** 버튼·입력 필드 마크업. 원본: button() · field() */

import { LABELS } from '@shared/constants.js'
import { esc } from '@shared/dom.js'
import { rows } from '@shared/selectors.js'

function button(act,label,extra='',cls='btn'){return '<button class="'+cls+'" data-act="'+act+'" '+extra+'>'+label+'</button>';}

function field(k,s,type='text'){return '<label class="field">'+LABELS[k]+(type==='textarea'?'<textarea data-field="'+k+'" rows="3">'+esc(s[k])+'</textarea>':'<input data-field="'+k+'" type="'+type+'" value="'+esc(s[k])+'" '+(type==='text'?'maxlength="160"':'')+'>')+'</label>';}

export { button, field }
