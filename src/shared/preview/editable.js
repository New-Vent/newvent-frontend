/** 미리보기 안 인라인 편집. 원본: markEditableText · applyContentEdits … */

import { BLOCK_LABELS, CONTENT_FIELDS, LABELS } from '@shared/constants.js'
import { $, esc } from '@shared/dom.js'
import { currentDraft, rows } from '@shared/selectors.js'
import { ui } from '@shared/state.js'
import { button, field } from '@shared/ui/controls.js'

function markEditableText(doc){
 if(doc.querySelector('[data-nv-text]'))return;
 let index=0;
 doc.querySelectorAll('[data-block]').forEach(block=>{
  if(block.dataset.block==='notices')return;
  const walker=doc.createTreeWalker(block,4),nodes=[];
  while(walker.nextNode())nodes.push(walker.currentNode);
  nodes.forEach(node=>{
   const parent=node.parentElement;
   if(!node.textContent.trim()||parent.closest('script,style,textarea,select,[data-slot="period"],.hero-title,.hero-desc,[data-slot="cta-link"], [data-block="benefits"] h2'))return;
   const span=doc.createElement('span');span.dataset.nvText='text-'+index++;
   span.textContent=node.textContent;node.replaceWith(span);
  });
 });
}

function applyContentEdits(doc,s){
 doc.querySelectorAll('[data-nv-text]').forEach(el=>{
  const value=s.contentEdits?.[el.dataset.nvText];
  if(typeof value==='string')el.textContent=value;
 });
}

function refreshContentEditor(focusKey){
 const panel=$('#content-editor');if(!panel)return;
 const doc=$('.event-frame[data-mode="editor"]')?.contentDocument,block=doc?.querySelector('[data-block="'+ui.block+'"]');
 panel.hidden=!block||ui.block==='notices';if(panel.hidden)return;
 const fields=[];
 Object.entries(CONTENT_FIELDS).forEach(([key,selector])=>{
  const el=doc.querySelector(selector);if(el&&block.contains(el))fields.push({key:'field:'+key,value:el.textContent,label:LABELS[key]});
 });
 block.querySelectorAll('[data-nv-text]').forEach((el,i)=>fields.push({key:el.dataset.nvText,value:el.textContent.trim(),label:'문구 '+(i+1)}));
 panel.innerHTML='<div class="panel-head">'+esc(BLOCK_LABELS[ui.block])+' · 내용 직접 수정</div><div class="panel-body"><p class="helper">미리보기에서 문구를 선택하고 직접 수정 탭에서 편집할 수 있어요. 변경 내용은 바로 반영됩니다. 표시 문구만 바뀌며 실제 경품·참여 조건 설정은 바뀌지 않습니다.</p><fieldset id="content-fields" class="fields" '+(requestPending()?'disabled':'')+'>'+fields.map(x=>'<label class="field">'+esc(x.label)+'<textarea rows="2" maxlength="1000" data-content-key="'+x.key+'">'+esc(x.value)+'</textarea></label>').join('')+'</fieldset><p class="helper">완료 후 ‘새 버전 저장’을 눌러주세요.</p></div>';
 if(focusKey&&ui.editorMode==='direct'){const input=panel.querySelector('[data-content-key="'+focusKey+'"]');input?.focus({preventScroll:true});input?.scrollIntoView({behavior:'smooth',block:'nearest'});}
}

function applyButtonStyle(doc,s){
 let style=doc.querySelector('#nv-button-style');
 if(!style){style=doc.createElement('style');style.id='nv-button-style';doc.head.append(style);}
 const v=s.buttonStyle||{},rules=[];
 if(/^#[0-9a-f]{6}$/i.test(v.background||''))rules.push('background:'+v.background+'!important');
 if(/^#[0-9a-f]{6}$/i.test(v.color||''))rules.push('color:'+v.color+'!important');
 const sizes={small:'font-size:14px!important;padding:10px 20px!important;min-height:40px!important',medium:'font-size:18px!important;padding:16px 28px!important;min-height:52px!important',large:'font-size:22px!important;padding:22px 32px!important;min-height:64px!important'};
 if(sizes[v.size])rules.push(sizes[v.size]);
 const radii={square:'0',round:'12px',pill:'999px'};
 if(Object.hasOwn(radii,v.shape))rules.push('border-radius:'+radii[v.shape]+'!important');
 style.textContent='[data-slot="cta-link"]{'+rules.join(';')+'}';
}

function buttonEditor(){
 const s=currentDraft().snapshot,v=s.buttonStyle||{};
 const options=(key,items)=>'<select data-button-style="'+key+'">'+items.map(([value,label])=>'<option value="'+value+'" '+((v[key]||'')===value?'selected':'')+'>'+label+'</option>').join('')+'</select>';
 return '<div class="panel-head">참여 버튼 디자인 <span class="badge">직접 편집</span></div><div class="panel-body"><p class="helper">미리보기의 참여 버튼을 선택했어요. 문구와 모양만 바뀌며 참여 동작은 유지됩니다.</p><fieldset id="button-fields" class="fields" '+(requestPending()?'disabled':'')+'><label class="field">버튼 문구<input data-button-text maxlength="120" value="'+esc(s.cta)+'"></label><div class="field-pair"><label class="field">배경색<input type="color" data-button-style="background" value="'+(v.background||'#d60076')+'"></label><label class="field">글자색<input type="color" data-button-style="color" value="'+(v.color||'#ffffff')+'"></label></div><p class="helper">색상을 선택하면 적용됩니다. 기본 디자인은 원래 템플릿 색상을 유지해요.</p><div class="field-pair"><label class="field">크기'+options('size',[['','템플릿 기본'],['small','작게'],['medium','보통'],['large','크게']])+'</label><label class="field">모서리'+options('shape',[['','템플릿 기본'],['square','각진'],['round','둥근'],['pill','알약형']])+'</label></div><button type="button" class="btn sm" data-act="reset-button-style">원래 디자인으로</button><p class="helper">변경 후 ‘새 버전 저장’을 눌러주세요. 현재 게시 버전은 유지됩니다.</p></fieldset></div>';
}

function refreshButtonEditor(){
 const panel=$('#button-editor');if(!panel)return;
 panel.hidden=ui.block!=='cta';
 if(!panel.hidden)panel.innerHTML=buttonEditor();
}

function editButton(ev){
 const el=ev.target,key=el.dataset.buttonStyle;
 if(!key&&!el.hasAttribute('data-button-text'))return;
 if(ui.route!=='editor'||ui.role!=='admin'||requestPending())return;
 const s=currentDraft().snapshot;
 if(key){s.buttonStyle={...(s.buttonStyle||{}),[key]:el.value};}
 else{s.cta=el.value;const input=$('[data-field="cta"]');if(input)input.value=s.cta;}
 updateEditor();
}

function highlightEditingText(scroll=false){
 const frame=$('.event-frame[data-mode="editor"]'),doc=frame?.contentDocument;
 if(!doc)return;
 doc.querySelectorAll('.nv-text-active').forEach(el=>el.classList.remove('nv-text-active'));
 const input=document.activeElement;
 let key=input?.dataset.contentKey;
 if(input?.hasAttribute('data-button-text'))key='field:cta';
 if(input?.dataset.field&&Object.hasOwn(CONTENT_FIELDS,input.dataset.field))key='field:'+input.dataset.field;
 if(!key)return;
 const selector=key.startsWith('field:')?CONTENT_FIELDS[key.slice(6)]:'[data-nv-text="'+key+'"]';
 const target=selector&&doc.querySelector(selector);if(!target)return;
 target.classList.add('nv-text-active');
 if(scroll){
  const canvas=$('.canvas');
  if(canvas){const box=target.getBoundingClientRect(),outer=canvas.getBoundingClientRect(),fr=frame.getBoundingClientRect();canvas.scrollTo({top:canvas.scrollTop+fr.top+box.top-outer.top-canvas.clientHeight/2+box.height/2,behavior:'smooth'});}
 }
}

function applySelection(){
 const frame=$('.event-frame[data-mode="editor"]');if(!frame?.contentDocument)return;
 frame.contentDocument.querySelectorAll('[data-block]').forEach(n=>{
  n.classList.toggle('newvent-selected',n.dataset.block===ui.block);
 });
 document.querySelectorAll('.block-selector button').forEach(b=>b.classList.toggle('active',b.dataset.block===ui.block));
 highlightEditingText();
}

export { markEditableText, applyContentEdits, refreshContentEditor, applyButtonStyle, buttonEditor, refreshButtonEditor, editButton, highlightEditingText, applySelection }
