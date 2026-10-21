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
import { hasVariantIcons, shortName, variantIcon } from '@shared/variant-icons.js'

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

/**
 * 직접 수정의 영역 도구줄 — 올린 영역의 오른쪽 위에 순서 · 모양을 띄운다.
 *
 * ★ 무엇을 띄울지는 편집 화면이 정한다. 올릴 때마다 frame.nvTools(block) 에 묻고,
 *   누른 것은 nv-tool 이벤트로 올린다 — 여기는 그리고 알리기만 한다 (상태를 갖지 않는다).
 * ★ 도구줄은 body 바로 아래에 둔다. [data-block] 밖이라 직접 수정 문구 목록(collectTexts)에 안 잡힌다.
 * ★ iframe 에는 스크립트가 없다(sandbox). 이 리스너들은 호스트의 것이다.
 * ★ 모양은 '모양' 단추를 누르면 아래로 펼치는 창에서 고른다 — 옆 패널과 같은 아이콘(variant-icons.js).
 *   아이콘을 안 그린 영역은 같은 창에 이름 목록으로 나온다. 창이 열려 있는 동안은 다른 영역에 올려도 도구줄이 따라가지 않는다
 */
function bindTools(frame,doc){
 const bar=doc.createElement('div');bar.className='nv-tools';bar.hidden=true;doc.body.appendChild(bar);
 let over=null,menu=false;
 const safe=t=>String(t??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
 const emit=(tool,value)=>{if(over)frame.dispatchEvent(new CustomEvent('nv-tool',{bubbles:true,detail:{block:over.dataset.block,tool,value}}));};
 const place=()=>{const r=over.getBoundingClientRect(),w=doc.defaultView,width=doc.documentElement.clientWidth;
  bar.style.top=Math.max(4,r.top+w.scrollY-14)+'px';bar.style.right=Math.max(4,width-r.right+8)+'px';};
 const draw=()=>{
  doc.querySelectorAll('.nv-tool-hover').forEach(n=>n.classList.remove('nv-tool-hover'));
  doc.querySelectorAll('.nv-item-grip').forEach(n=>n.remove());
  if(over&&!over.isConnected)over=null;
  const info=over&&frame.nvTools?.(over.dataset.block);
  bar.hidden=!info;if(!info)return;
  over.classList.add('nv-tool-hover');
  const btn=(tool,label,title,off,on,value)=>'<button type="button" data-tool="'+tool+'"'+(value?' data-value="'+value+'"':'')+' title="'+safe(title)+'"'+(off?' aria-disabled="true"':'')+(on?' class="on"':'')+'>'+label+'</button>';
  const all=info.variants?[{cssClass:'',desc:'기본 모양'},...info.variants]:[];
  const now=all.find(v=>v.cssClass===(info.variant||''))||all[0];
  const icons=info.variants&&hasVariantIcons(info.variants);
  if(!info.variants)menu=false;
  // 고르는 창 — 아이콘 칸, 아이콘이 없는 영역은 이름 줄. 못 쓰는 모양은 흐리게 두고 누르면 이유가 뜬다(편집 화면)
  const pick=v=>{const on=v===now,name=icons?shortName(v.cssClass,v.desc):v.desc;
   return '<button type="button" class="nv-pick'+(on?' on':'')+(v.blocked?' off':'')+'" data-tool="variant" data-value="'+safe(v.cssClass)+'" title="'+safe(v.blocked||v.desc)+'" aria-pressed="'+on+'">'
    +(icons?variantIcon(v.cssClass):'')+'<span>'+safe(name)+'</span></button>';};
  // ⠿ 는 끌어서 옮기는 손잡이 — 영역 전체를 끌어 다른 영역 앞에 놓는다 (바로 아래 startDrag). ▲▼ 는 같은 일을 눌러서 한다
  bar.innerHTML='<b>'+safe(info.label)+'</b>'
   +(info.drag?'<button type="button" class="nv-grip" data-tool="grip" title="끌어서 옮기기" aria-label="'+safe(info.label)+' 끌어서 옮기기">⠿</button>':'')
   +(info.move?'<i></i>'+btn('up','▲','위로',!info.move.up)+btn('down','▼','아래로',!info.move.down):'')
   +(info.variants?'<i></i><button type="button" class="nv-look'+(menu?' on':'')+'" data-tool="menu" title="'+safe(now.desc)+'" aria-expanded="'+menu+'">'
     +(icons?variantIcon(now.cssClass):'')+'<span>'+safe(icons?shortName(now.cssClass,now.desc):now.desc)+'</span><em>▾</em></button>'
     +(menu?'<div class="nv-menu'+(icons?'':' list')+'" role="group" aria-label="'+safe(info.label)+' 모양"><p>모양 고르기 <small>'+all.length+'개</small></p><div>'+all.map(pick).join('')+'</div></div>':''):'');
  place();
  // 항목마다 ⠿ 손잡이 — 항목을 끌어 다른 항목 자리에 놓는다 (아래 startItemDrag). 지운 항목(안 보임)은 건너뛴다
  // ★ 손잡이도 body 바로 아래에 둔다 — [data-block] 밖이라 직접 수정 문구 목록에 안 잡힌다
  if(info.items){const w=doc.defaultView;
   info.items.forEach((el,i)=>{if(!el?.getClientRects().length)return;const r=el.getBoundingClientRect();if(r.width<40||r.height<30)return;
    const g=doc.createElement('button');g.type='button';g.className='nv-item-grip';g.dataset.index=i;g.textContent='⠿';
    g.title='끌어서 내용 옮기기';g.setAttribute('aria-label',safe(info.label)+' '+(i+1)+'번째 항목 끌어서 내용 옮기기');
    // 항목의 오른쪽 윗변에 걸쳐 둔다 — 왼쪽 위에는 이름표(전원 100%) · 단계 번호가 있어서 가린다
    g.style.top=Math.max(2,r.top+w.scrollY-12)+'px';g.style.left=(r.right+w.scrollX-36)+'px';doc.body.appendChild(g);});}
  // 페이지 아래쪽 영역이면 창을 위로 연다 — iframe 은 페이지 높이만큼이라 아래로 열면 잘린다
  const m=bar.querySelector('.nv-menu');
  // ★ 문서 높이(scrollHeight)와 비교하면 안 된다 — 열린 창이 그 높이를 늘린다. 페이지 상자 끝과 비교한다
  const page=(doc.querySelector('.ev-container')||doc.body).getBoundingClientRect();
  if(m&&m.getBoundingClientRect().bottom>page.bottom&&bar.getBoundingClientRect().top-page.top>m.offsetHeight+6)m.classList.add('up');
 };
 const close=()=>{if(!menu)return;menu=false;draw();};
 // ── 끌어서 옮기기 ──
 // ★ 놓을 자리는 "끄는 영역을 뺀 나머지 영역의 가운데 선" 으로 정한다 — 가운데보다 위면 그 영역 앞, 모두 아래면 맨 끝.
 //   맨 끝은 목록의 끝일 뿐 고정 영역(유의사항 · 참여 버튼) 뒤로 가지 않는다 (순서는 편집 화면이 정한다).
 // ★ 놓는 자리 계산은 iframe 안 좌표다. 줄여 보기(transform)여도 이 안에서는 그대로 맞는다.
 //   다만 가장자리 자동 스크롤은 호스트(.canvas) 좌표라 줄어든 비율을 곱해 계산한다.
 // ★ 끄는 동안은 도구줄이 다른 영역으로 옮겨 가지 않게 mouseover 를 멈춘다.
 let drag=null;
 const endDrag=(commit)=>{
  if(!drag)return;const d=drag;drag=null;
  doc.defaultView.cancelAnimationFrame(d.raf);d.line.remove();d.chip.remove();d.src.classList.remove('nv-drag-src');doc.body.classList.remove('nv-dragging');
  try{bar.releasePointerCapture(d.id);}catch(e){}
  if(commit&&d.target!==undefined)frame.dispatchEvent(new CustomEvent('nv-tool',{bubbles:true,detail:{block:d.key,tool:'move',value:d.target}}));
  draw();
 };
 const startDrag=ev=>{
  const g=ev.target.closest('.nv-grip');if(!g||!over||menu||ev.button>0)return;
  const key=over.dataset.block,info=frame.nvTools?.(key);if(!info?.drag)return;
  ev.preventDefault();
  const w=doc.defaultView,canvas=frame.closest('.canvas');
  const line=doc.createElement('div');line.className='nv-drop-line';line.hidden=true;doc.body.appendChild(line);
  const chip=doc.createElement('div');chip.className='nv-drag-chip';chip.textContent='⠿ '+info.label;doc.body.appendChild(chip);
  over.classList.add('nv-drag-src');doc.body.classList.add('nv-dragging');
  try{bar.setPointerCapture(ev.pointerId);}catch(e){}
  drag={key,id:ev.pointerId,src:over,line,chip,order:info.blocks||[],target:undefined,y:ev.clientY,raf:0};
  const tick=()=>{if(!drag)return;
   if(canvas){const r=frame.getBoundingClientRect(),k=frame.offsetHeight?r.height/frame.offsetHeight:1,cr=canvas.getBoundingClientRect(),hostY=r.top+drag.y*k;
    if(hostY<cr.top+56)canvas.scrollTop-=14;else if(hostY>cr.bottom-56)canvas.scrollTop+=14;}
   drag.raf=w.requestAnimationFrame(tick);};
  drag.raf=w.requestAnimationFrame(tick);
 };
 const moveDrag=ev=>{
  if(!drag)return;const w=doc.defaultView;drag.y=ev.clientY;
  const y=ev.clientY+w.scrollY;
  drag.chip.style.top=Math.max(0,y-16)+'px';drag.chip.style.left=Math.max(0,ev.clientX+14)+'px';
  const rest=drag.order.filter(k=>k!==drag.key).map(k=>({k,el:doc.querySelector('section[data-block="'+k+'"]')})).filter(x=>x.el);
  if(!rest.length)return;
  let hit=rest.find(x=>{const r=x.el.getBoundingClientRect();return r.top+r.height/2+w.scrollY>y;});
  const last=rest[rest.length-1].el.getBoundingClientRect();
  drag.target=hit?hit.k:'';
  drag.line.hidden=false;drag.line.style.top=((hit?hit.el.getBoundingClientRect().top:last.bottom)+w.scrollY-3)+'px';
 };
 // ── 항목 끌어서 내용 옮기기 ──
 // ★ 항목 자체를 옮기는 게 아니다 — 서버에 항목 순서를 바꾸는 요청이 없어서, 편집 화면이 두 항목 사이의 문구를 한 칸씩 밀어 넣는다.
 //   여기서는 "어느 항목을 어느 항목 자리로" 만 알린다 (nv-tool · item-move · value 'from:to', 번호는 info.items 의 자리).
 // ★ 놓을 자리는 포인터가 들어 있는 항목, 없으면 가장 가까운 항목이다 — 항목이 가로로도 놓이는 영역(카드 격자)이 있다.
 let idrag=null;
 const endItemDrag=commit=>{
  if(!idrag)return;const d=idrag;idrag=null;
  doc.defaultView.cancelAnimationFrame(d.raf);d.chip.remove();d.src.classList.remove('nv-item-src');d.hit?.classList.remove('nv-item-drop');doc.body.classList.remove('nv-dragging');
  try{d.grip.releasePointerCapture(d.id);}catch(e){}
  if(commit&&d.to!==null&&d.to!==d.from)frame.dispatchEvent(new CustomEvent('nv-tool',{bubbles:true,detail:{block:d.key,tool:'item-move',value:d.from+':'+d.to}}));
  draw();
 };
 const startItemDrag=ev=>{
  const g=ev.target.closest?.('.nv-item-grip');if(!g||!over||ev.button>0)return;
  const key=over.dataset.block,info=frame.nvTools?.(key);if(!info?.items)return;
  const from=Number(g.dataset.index),src=info.items[from];if(!src)return;
  ev.preventDefault();
  const w=doc.defaultView,canvas=frame.closest('.canvas');
  const chip=doc.createElement('div');chip.className='nv-drag-chip';chip.textContent='⠿ '+info.label+' 내용 옮기기';doc.body.appendChild(chip);
  src.classList.add('nv-item-src');doc.body.classList.add('nv-dragging');
  try{g.setPointerCapture(ev.pointerId);}catch(e){}
  idrag={key,id:ev.pointerId,grip:g,src,items:info.items,from,to:null,hit:null,chip,y:ev.clientY,raf:0};
  const tick=()=>{if(!idrag)return;
   if(canvas){const r=frame.getBoundingClientRect(),k=frame.offsetHeight?r.height/frame.offsetHeight:1,cr=canvas.getBoundingClientRect(),hostY=r.top+idrag.y*k;
    if(hostY<cr.top+56)canvas.scrollTop-=14;else if(hostY>cr.bottom-56)canvas.scrollTop+=14;}
   idrag.raf=w.requestAnimationFrame(tick);};
  idrag.raf=w.requestAnimationFrame(tick);
 };
 const moveItemDrag=ev=>{
  if(!idrag)return;const d=idrag,w=doc.defaultView;d.y=ev.clientY;
  d.chip.style.top=Math.max(0,ev.clientY+w.scrollY-16)+'px';d.chip.style.left=Math.max(0,ev.clientX+14)+'px';
  let best=null,bd=Infinity;
  d.items.forEach((el,i)=>{if(!el?.getClientRects().length)return;const r=el.getBoundingClientRect();
   const inside=ev.clientX>=r.left&&ev.clientX<=r.right&&ev.clientY>=r.top&&ev.clientY<=r.bottom;
   const dx=ev.clientX-(r.left+r.width/2),dy=ev.clientY-(r.top+r.height/2),dist=inside?-1:dx*dx+dy*dy;
   if(dist<bd){bd=dist;best=i;}});
  const hit=best!==null&&best!==d.from?d.items[best]:null;
  if(hit!==d.hit){d.hit?.classList.remove('nv-item-drop');hit?.classList.add('nv-item-drop');d.hit=hit;}
  d.to=best;
 };
 doc.addEventListener('pointerdown',startItemDrag);
 doc.addEventListener('pointermove',moveItemDrag);
 doc.addEventListener('pointerup',()=>endItemDrag(true));
 doc.addEventListener('pointercancel',()=>endItemDrag(false));
 bar.addEventListener('pointerdown',startDrag);
 bar.addEventListener('pointermove',moveDrag);
 bar.addEventListener('pointerup',()=>endDrag(true));
 bar.addEventListener('pointercancel',()=>endDrag(false));
 doc.addEventListener('mouseover',ev=>{if(drag||idrag||menu||ev.target.closest('.nv-tools,.nv-item-grip'))return;const b=ev.target.closest('[data-block]');if(b===over)return;over=b;draw();});
 doc.addEventListener('mouseleave',()=>{if(menu||drag||idrag)return;over=null;draw();});
 doc.addEventListener('keydown',ev=>{if(ev.key==='Escape'){if(idrag)endItemDrag(false);else if(drag)endDrag(false);else close();}});
 // 편집 화면이 순서 · 배치 · 모양을 바꾼 뒤 부른다 — 옮겨진 영역을 따라가고 눌린 표시를 다시 그린다
 frame.nvToolsRefresh=()=>draw();
 return {
  click(ev){const b=ev.target.closest('.nv-tools button');if(!b){if(!ev.target.closest('.nv-tools'))close();return;}
   ev.preventDefault();ev.stopPropagation();if(b.getAttribute('aria-disabled')==='true')return;
   // 손잡이는 끌기 전용이다 — 그냥 누르면 아무 일도 없다
   if(b.dataset.tool==='grip')return;
   if(b.dataset.tool==='menu'){menu=!menu;draw();return;}
   if(b.dataset.tool==='variant')menu=false;
   emit(b.dataset.tool,b.dataset.value);},
  // 창이 열려 있을 때 바깥을 누르면 닫기만 한다 — 그 클릭으로 문구 칸을 고르지 않는다
  open:()=>menu,close,
 };
}

/**
 * 편집 화면 미리보기의 「전체 보기」 — 페이지 전체가 미리보기 칸 높이에 들어오게 줄인다.
 *
 * ★ iframe 은 원래 폭(w) 그대로 그리고 transform 으로만 줄인다. 폭을 줄이면 페이지가
 *   모바일처럼 다시 배치돼서 "전체를 본다" 가 아니게 된다 — 썸네일(.thumb)과 같은 수법이다.
 * ★ 칸(.canvas-frame)의 크기를 줄어든 크기로 맞춘다. transform 은 자리를 안 줄여서, 안 맞추면 빈 스크롤이 남는다.
 * ★ 높이가 정해진 편집 화면(.workspace — .canvas 가 flex:1)에서만 한다. 다른 곳은 칸 높이가
 *   내용을 따라가서, 줄일수록 칸도 줄어드는 되먹임이 생긴다.
 * ★ 클릭 · 도구줄은 iframe 안 좌표라 줄여도 그대로 동작한다.
 */
function fitCanvasFrame(box){
 if(box.dataset.fitBound)return;
 const canvas=box.parentElement,frame=box.querySelector('iframe');
 if(!canvas?.closest('.workspace')||!frame)return;
 box.dataset.fitBound='true';
 const fit=()=>{
  if(!box.isConnected)return;
  const cs=getComputedStyle(canvas);
  const w=box.classList.contains('mobile')?390:canvas.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
  const room=canvas.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
  const h=frame.offsetHeight;
  if(w<=0||h<=0||room<=0)return;
  const r=Math.min(1,room/h);
  frame.style.width=w+'px';
  frame.style.transformOrigin='0 0';
  frame.style.transform=r<1?'scale('+r+')':'';
  box.style.width=Math.floor(w*r)+'px';
  box.style.height=Math.floor(h*r)+'px';
 };
 observeLayout(canvas,fit);
 observeLayout(frame,fit);
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
  const tools=bindTools(frame,doc);
  doc.addEventListener('click',ev=>{if(ev.target.closest('.nv-item-grip')){ev.preventDefault();ev.stopPropagation();return;}if(ev.target.closest('.nv-tools')){tools.click(ev);return;}if(tools.open()){ev.preventDefault();ev.stopPropagation();tools.close();return;}ev.preventDefault();ev.stopPropagation();frame.dispatchEvent(new CustomEvent('nv-pick',{bubbles:true,detail:{target:ev.target,x:ev.clientX,y:ev.clientY}}));},true);return;
 }
 // 서버 편집 화면의 AI 대화 — 누른 영역(data-block)을 편집 화면에 알린다. 유의사항은 서버 소유라 고를 수 없다
 if(mode==='server-select'){
  doc.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=true);
  doc.querySelectorAll('[data-block]').forEach(b=>{const own=b.dataset.block==='notices';b.style.cursor=own?'default':'pointer';b.title=own?'유의사항은 직접 수정 탭에서 편집할 수 있어요':(BLOCK_LABELS[b.dataset.block]||b.dataset.block)+' 영역 — 눌러서 고르기';});
  // 올린 영역에 이름표 — "누르면 고를 수 있다"를 미리보기 안에서 바로 알린다
  const tag=doc.createElement('div');tag.className='nv-pick-tag';tag.hidden=true;doc.body.appendChild(tag);
  let over=null;
  const label=b=>{const own=b.dataset.block==='notices',name=BLOCK_LABELS[b.dataset.block]||b.dataset.block;
   tag.textContent=own?name+' · 직접 수정 탭에서 편집':b.classList.contains('newvent-selected')?'✓ '+name+' 선택됨 · 눌러서 해제':name+' · 눌러서 고르기';
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
 /**
  * 공개 이벤트 상세 (사용자 화면).
  *
  * ★ **여기만 iframe 안에서 스크립트가 돈다** (sandboxFor 의 live). 서버가 붙인
  *   /assets/event-runtime.js 가 고르는 칸(.ev-game)을 맡고, 참여 버튼을 누르면
  *   입력을 모아 이 iframe 요소에서 nv-participate 를 올린다. 받는 쪽은 사용자 앱이다
  *   (user/main.js) — 로그인 토큰이 거기에만 있다.
  *
  * ★ 그래서 **참여에 쓰이는 것은 잠그지 않는다.** 예전에는 cta-link 빼고 전부 disabled 였는데,
  *   그러면 고르는 버튼이 눌리지 않고 runtime 이 입력을 못 모은다 (runtime 은 el.disabled 를 건너뛴다).
  *
  * ★ 호스트가 아직 맡는 것은 둘뿐이다.
  *   1) 바깥으로 나가는 클릭 막기 — 링크를 따라가면 iframe 이 통째로 바뀐다
  *   2) 이름표가 없는 옛 페이지의 「참여하기」(data-slot="cta-link") —
  *      runtime 은 [data-behavior] 만 보므로 그 버튼은 여기서 올려 준다
  *
  * ★ stopPropagation 은 **막을 때만** 쓴다. 여기는 capture 라 무조건 멈추면
  *   runtime 의 document 리스너(버블)가 아예 돌지 않는다.
  */
 if(mode==='live'){
  // 참여와 무관한 입력만 잠근다 (옛 템플릿의 체험용 폼 등)
  doc.querySelectorAll('button,input,select,textarea').forEach(el=>{
   if(!el.closest('[data-behavior],[data-slot="cta-link"]'))el.disabled=true;
  });
  if(ui.participated?.[frame.dataset.event])markParticipated(frame);
  doc.addEventListener('click',ev=>{
   const link=ev.target.closest('a[href]');
   // runtime 이 맡는 링크(data-behavior)는 그쪽이 preventDefault 한다
   if(link&&!link.closest('[data-behavior]')){ev.preventDefault();}
   const cta=ev.target.closest('[data-slot="cta-link"]');
   if(!cta||cta.closest('[data-behavior]'))return;           // 새 페이지 — runtime 이 맡는다
   ev.preventDefault();ev.stopPropagation();
   if(cta.getAttribute('aria-disabled')==='true')return;
   // 옛 페이지. 목적지는 서버가 data-href(button) 또는 href(a)로 넣는다 — 둘 다 /events/{id} 다
   const href=cta.dataset.href||cta.getAttribute('href')||'';
   frame.dispatchEvent(new CustomEvent('nv-participate',{bubbles:true,cancelable:true,detail:{href,eventId:frame.dataset.event}}));
  },true);
  return;
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
   doc.querySelectorAll('[data-vote]').forEach(x=>{const chosen=x===b;x.setAttribute('aria-pressed',String(chosen));x.style.outline=chosen?'3px solid #46b4e7':'';});
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
 root.querySelectorAll('.thumb, .template-preview-canvas').forEach((el) => {
  if(el.dataset.bound)return;
  // 썸네일 HTML 이 없으면 자리표시자(.thumb-empty)만 있고 iframe 이 없다.
  const frame=el.querySelector('iframe');
  if(!frame)return;
  el.dataset.bound='true';
  const isDetail = el.classList.contains('template-preview-canvas')
  const scale = () => {
    if (!el.isConnected) return

    const ratio = el.clientWidth / 720
    frame.style.transform = `scale(${ratio})`

    // 상세보기는 전체 문서의 축소된 높이만큼 공간을 확보한다.
    if (isDetail) {
      const height = Math.ceil(frame.offsetHeight * ratio)
      if (el.style.height !== `${height}px`) { el.style.height = `${height}px` }
    }
  }

  observeLayout(el, scale)

  if (isDetail) {
    observeLayout(frame, scale)
  }
 });
 root.querySelectorAll('.event-frame').forEach(frame=>{frame.onload=()=>bindFrame(frame);bindFrame(frame);});
 root.querySelectorAll('.canvas-frame.fit').forEach(fitCanvasFrame);
}

/**
 * 참여를 마친 페이지로 바꾼다.
 *
 * ★ **body 의 data-participated 가 본체다.** runtime 이 참여 버튼을 누를 때마다 이 속성을
 *   보고 「이미 참여한 이벤트예요」로 막는다 (event-runtime.js 의 participate).
 *   서버는 이 속성을 적지 않는다 — 로그인한 사람별이라 공유 링크 페이지는 알 수 없다.
 *   그래서 사용자 앱이 상태 API 로 알아내 여기서 붙인다.
 *
 * ★ 옛 페이지의 참여 버튼은 `[data-slot="cta-link"]` 다 — runtime 이 모르므로 문구까지 바꿔 잠근다.
 *   aria-disabled 로 잠근다 (<a> 는 disabled 가 없고, bindFrame 의 live 분기가 이 값을 본다).
 * ★ 새 페이지의 참여 버튼은 runtime 이 맡으니 **문구를 건드리지 않는다** — 디자인이 서버 것이다.
 *   누르면 안내 토스트가 뜨고, 눌렀다는 것 자체는 알려야 하니 흐리게만 둔다.
 */
function markParticipated(frame){
 const doc=frame?.contentDocument;if(!doc?.body||doc.body.hasAttribute('data-participated'))return;
 doc.body.setAttribute('data-participated','');
 doc.querySelectorAll('[data-slot="cta-link"]:not([data-behavior])').forEach(el=>{
  el.textContent='참여 완료';el.setAttribute('aria-disabled','true');
  if('disabled' in el)el.disabled=true;
 });
 doc.querySelectorAll('[data-behavior~="participate"]').forEach(el=>{el.style.opacity='.55';});
}

export { bindFrame, hydrate, markParticipated, replaceBlock }
