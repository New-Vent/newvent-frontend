/**
 * 이벤트 미리보기 문서 조립.
 *
 * 원본은 embedded-font 와 event.css 를 Blob URL 로 iframe 에 넣었다.
 * 여기서는 /assets/event.css 를 실제 파일로 링크한다 (nginx 가 서빙).
 */

import { field } from '@shared/ui/controls.js'

import { clone, esc } from '@shared/dom.js'
import { shortDate } from '@shared/format.js'
import { TEMPLATE_BODIES } from '@shared/mock/templates.js'
import { applyButtonStyle, applyContentEdits, markEditableText } from '@shared/preview/editable.js'
import { published } from '@shared/selectors.js'
import { button } from '@shared/ui/controls.js'
import { toast } from '@shared/ui/toast.js'

/**
 * 미리보기 문서가 링크할 스타일.
 *
 * 원본은 event.css 와 한글 폰트를 Blob URL 로 만들어 심었다(문서 크기 698KB).
 * 여기서는 event.css 를 public/assets/event.css 실제 파일로 빼서 링크한다 —
 * nginx 의 /assets/ 경로가 이걸 서빙하고, 게시된 페이지(/e/{slug})도 같은
 * 파일을 참조하므로 미리보기와 실제 화면이 같은 스타일을 쓴다.
 */
const EVENT_STYLE_LINKS =
  '<link rel="stylesheet" href="/assets/event.css">' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@100..900&display=swap">'

/**
 * 서버 소유 블록 — LLM 이 준 HTML 이 와도 적용하지 않는다.
 * AI_EDIT_RULES: 법적 고지·공통 유의사항은 서버가 직접 삽입한다.
 */
const SERVER_OWNED = new Set(['notices'])

/** 필드 → 그 필드가 속한 블록. 블록이 LLM 소유면 필드 치환을 건너뛴다. */
const FIELD_BLOCK = { title: 'hero', intro: 'hero', benefitHeading: 'benefits', cta: 'cta' }

/**
 * snapshot.blocks 의 블록 HTML 을 문서에 끼워 넣는다.
 *
 * LLM 은 `<section data-block="…">` 전체(outerHTML)를 반환한다.
 * 그 규격이 아니면(내부 조각만 오면) 무시한다 — 중첩 section 이 생기면
 * event.css 레이아웃이 깨진다.
 *
 * @returns {Set<string>} 실제로 교체된 블록 키
 */
function applyBlocks(doc, blocks) {
  const applied = new Set()
  if (!blocks) return applied

  for (const [key, html] of Object.entries(blocks)) {
    if (!html || SERVER_OWNED.has(key)) continue
    const target = doc.querySelector(`[data-block="${key}"]`)
    if (!target) continue
    const next = new DOMParser()
      .parseFromString(html, 'text/html')
      .querySelector(`[data-block="${key}"]`)
    if (!next) continue
    target.replaceWith(doc.importNode(next, true))
    applied.add(key)
  }
  return applied
}

/** 미리보기 iframe 공통 스타일 — 여백 · 글꼴 · 편집 하이라이트. thumb 면 목록 썸네일 크기로 자른다 */
const frameCss=(thumb=false)=>'html,body{margin:0!important}body{overflow-x:hidden}.ev-container{margin:0 auto!important}.nv-text-active{background:#fff1a8!important;color:#292330!important;outline:2px solid #0284c7!important;outline-offset:3px;border-radius:3px;box-decoration-break:clone;-webkit-box-decoration-break:clone}.newvent-selected{outline:3px solid #0284c7!important;outline-offset:-4px}.nv-pick-hover:not(.newvent-selected){outline:2px dashed #46b4e7!important;outline-offset:-4px;cursor:pointer}.nv-pick-tag{position:absolute;z-index:2147483647;pointer-events:none;padding:4px 10px;border-radius:999px;background:#292330;color:#fff;font-size:12px;font-weight:700;line-height:1.4;box-shadow:0 2px 8px rgba(0,0,0,.2)}.nv-pick-tag.on{background:#0284c7}.nv-pick-tag.own{background:#7a7484}button:disabled{opacity:.5;cursor:default}button:focus-visible{outline:3px solid #39a7da;outline-offset:4px}.nv-tool-hover{outline:2px dashed #46b4e7!important;outline-offset:-4px}.nv-tools{position:absolute;z-index:2147483646;display:flex;align-items:center;gap:5px;max-width:calc(100% - 8px);flex-wrap:wrap;justify-content:flex-end;padding:5px 7px;border-radius:10px;background:#292330;color:#fff;font:600 12px/1.3 system-ui,-apple-system,"Noto Sans KR",sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.28)}.nv-tools[hidden]{display:none}.nv-tools b{padding:0 3px;font-weight:700;white-space:nowrap}.nv-tools i{width:1px;height:16px;background:rgba(255,255,255,.28)}.nv-tools button{all:unset;box-sizing:border-box;cursor:pointer;padding:4px 7px;border-radius:6px;background:rgba(255,255,255,.14);color:#fff;font:inherit;line-height:1.3}.nv-tools button:hover{background:rgba(255,255,255,.26)}.nv-tools button.on{background:#0284c7}.nv-tools button[aria-disabled=true]{opacity:.35;cursor:default}.nv-tools select{font:inherit;font-weight:500;max-width:170px;padding:3px 4px;border:0;border-radius:6px;background:#fff;color:#292330}'+(thumb?'\nhtml,body{width:720px!important;height:440px!important;overflow:hidden!important}.ev-container{width:720px!important;max-width:720px!important;padding:0!important;box-shadow:none!important;border-radius:0!important}[data-block="hero"]{margin:0!important;border-radius:0!important}[data-block="hero"]{min-height:440px!important;max-height:440px;overflow:hidden;padding-top:30px!important}.hero-title{font-size:40px!important;line-height:1.2!important}.hero-desc{font-size:16px!important;line-height:1.6!important}':'');

function templateDocument(snapshot,thumb=false){
 const doc=new DOMParser().parseFromString(TEMPLATE_BODIES[snapshot.templateId],'text/html');
 const llmBlocks=applyBlocks(doc,snapshot.blocks);
 markEditableText(doc);applyContentEdits(doc,snapshot);
 // LLM 이 통째로 만든 블록은 필드 값으로 덮어쓰지 않는다.
 const put=(s,t,field)=>{if(llmBlocks.has(FIELD_BLOCK[field]))return;const x=doc.querySelector(s);if(x)x.textContent=t;};
 put('.hero-title',snapshot.title,'title');put('.hero-desc',snapshot.intro,'intro');
 put('[data-block="benefits"] h2',snapshot.benefitHeading,'benefitHeading');put('[data-slot="cta-link"]',snapshot.cta,'cta');
 doc.querySelectorAll('[data-slot="period"]').forEach(n=>n.textContent=shortDate(snapshot.start)+' ~ '+shortDate(snapshot.end));
 // script 는 남긴다 — 템플릿의 window.newVentReinit 과 타이머가 여기 있다.
 // 실제로 도는 모드는 editor 하나뿐이다 (sandboxFor 참고). user · thumb · readonly 로
 // 띄우면 같은 문서라도 실행되지 않으니, 타이머는 HTML 에 적힌 값에서 멈춰 있다.
 doc.querySelectorAll('iframe').forEach(n=>n.remove());
 doc.querySelectorAll('*').forEach(n=>{Array.from(n.attributes).forEach(a=>{if(a.name.startsWith('on'))n.removeAttribute(a.name);});});
 doc.querySelectorAll('input[type="tel"]').forEach(n=>{n.value='';n.setAttribute('value','');});
 applyButtonStyle(doc,snapshot);
 let body=doc.body.outerHTML;
 if(thumb){
  const hero=doc.querySelector('[data-block="hero"]');
  // 컨테이너를 새로 만들되 원본의 class 를 그대로 옮긴다.
  // 테마(theme-*)가 .ev-container 에 붙어 있으므로, 하드코딩하면
  // 목록 썸네일만 테마를 잃는다.
  const container=doc.querySelector('.ev-container');
  const containerClass=container?.className||'ev-container event-page';
  body='<body class="'+esc(doc.body.className)+'"><div class="'+esc(containerClass)+'">'+(hero?hero.outerHTML:'')+'</div></body>';
 }
 const css=frameCss(thumb);
 return '<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+EVENT_STYLE_LINKS+'<style>'+css+'</style>'+doc.querySelector('#nv-button-style').outerHTML+'</head>'+body+'</html>';
}

/**
 * 미리보기 문서를 속성이 아니라 프로퍼티로 넘기기 위한 임시 보관소.
 *
 * 예전에는 srcdoc="…" 속성에 문서 전체를 이스케이프해 넣었다.
 * 서버가 내려준 HTML 은 길고 따옴표가 섞여 있어 그 방식이 취약하다.
 * 뷰는 자리표시자만 찍고, hydrate() 가 frame.srcdoc 에 직접 대입한다.
 */
const STAGED = new Map()
let stageSeq = 0

function stageDocument(html) {
  const id = 'nvdoc-' + ++stageSeq
  STAGED.set(id, html)
  // 렌더가 교체되어 소비되지 못한 항목이 쌓이지 않도록 상한을 둔다.
  if (STAGED.size > 64) STAGED.delete(STAGED.keys().next().value)
  return id
}

/** hydrate() 가 부른다. 한 번 꺼내면 지운다. */
function takeStagedDocument(id) {
  const html = STAGED.get(id)
  STAGED.delete(id)
  return html
}

/**
 * 미리보기 iframe 의 sandbox — **모드마다 다르다.**
 *
 * allow-same-origin 은 전부 준다. bindFrame(frame.js)이 frame.contentDocument 로
 * 이벤트 위임 · 높이 측정 · 블록 하이라이트를 하는데, 없으면 아무것도 못 한다.
 * 앞으로 붙일 참여 위젯(룰렛 · 복주머니)도 이 경로를 쓴다 — iframe 안 마크업은
 * "여기가 1번 칸" 이라고 선언만 하고, 클릭 처리와 API 호출은 호스트가 한다.
 * 그래야 LLM 이 만든 HTML 에 스크립트를 넣지 않아도 된다.
 *
 * allow-scripts 는 **editor 한 모드에만** 준다.
 *   editor         목업 편집기. 블록을 갈아 끼운 뒤 window.newVentReinit(key) 로
 *                  타이머 · 참가자 카운터를 다시 연결해야 한다 (AI_EDIT_RULES 2-2)
 *   그 외          server-edit · server-select · readonly · user · thumb —
 *                  전부 호스트가 contentDocument 로 처리한다. 스크립트가 필요 없다.
 *
 * ⚠ allow-scripts 와 allow-same-origin 을 함께 주면 sandbox 는 사실상 무력해진다.
 *   editor 는 목업 전용(TEMPLATE_BODIES — 우리가 쓴 HTML)이라 그 조합을 감수한다.
 *   서버가 내려준 HTML 이 들어오는 모드에는 주지 않는다.
 */
const SANDBOX_READ = 'allow-same-origin'                 // 스크립트 실행 안 됨
const SANDBOX_EDIT = 'allow-same-origin allow-scripts'   // newVentReinit 이 필요하다

const sandboxFor = (mode) => (mode === 'editor' ? SANDBOX_EDIT : SANDBOX_READ)

/**
 * 서버가 준 조각(GET …/preview 의 html)을 미리보기 문서로 감싼다.
 * ★ 조각에는 래퍼 · 테마 · 유의사항이 있고 스타일시트는 없다 — 여기서 /assets/event.css 를 붙인다
 * ★ <script> 를 굳이 걷어내지 않는다. 서버 조각을 띄우는 모드(readonly · server-edit ·
 *   server-select)는 sandbox 에 allow-scripts 가 없어서 **어차피 실행되지 않는다.**
 *   원본을 그대로 둬야 나중에 editor 로 띄울 때도 같은 문서를 쓸 수 있다.
 */
function serverDocument(html){
 const doc=new DOMParser().parseFromString('<body>'+(html||'')+'</body>','text/html');
 doc.querySelectorAll('iframe').forEach(n=>n.remove());
 // 조각에 .ev-container 가 없으면 감싸준다.
 //   event.css 의 폭·여백·배경은 전부 .ev-container 기준이라, 없으면 본문이
 //   맨몸으로 붙어 읽기 어렵다. 템플릿으로 만든 페이지는 컨테이너를 들고 오지만
 //   LLM 을 안 거친 더미·초안은 <section> 조각만 오는 경우가 있다.
 //   이미 있으면 건드리지 않는다 — 테마 class 가 거기 붙어 있다.
 if(!doc.body.querySelector('.ev-container')){
  const wrap=doc.createElement('div');
  wrap.className='ev-container event-page';
  while(doc.body.firstChild)wrap.appendChild(doc.body.firstChild);
  doc.body.appendChild(wrap);
 }
 doc.querySelectorAll('*').forEach(n=>{Array.from(n.attributes).forEach(a=>{if(a.name.startsWith('on'))n.removeAttribute(a.name);});});
 return '<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+EVENT_STYLE_LINKS+'<style>'+frameCss()+'</style></head>'+doc.body.outerHTML+'</html>';
}

/**
 * 서버 조각을 미리보기 iframe 으로 — 버튼 · 링크는 bindFrame 이 막는다
 * mode  readonly     보기만
 *       server-edit  직접 수정 — 누른 글자를 nv-pick 이벤트로 알린다
 *       live         사용자 공개 상세 — 페이지의 「참여하기」가 nv-participate 를 올린다
 *
 * @param {string|number} [eventId] live 모드에서 어느 이벤트인지 (bindFrame 이 읽는다)
 */
function serverFrame(html,title='서버 미리보기',mode='readonly',eventId){
 return '<iframe class="event-frame" data-mode="'+mode+'"'
  +(eventId!==undefined?' data-event="'+esc(String(eventId))+'"':'')
  +' title="'+esc(title)+'" sandbox="'+sandboxFor(mode)+'" data-doc="'+stageDocument(serverDocument(html))+'"></iframe>';
}

// 썸네일은 모드가 없다 — 보여주기만 하므로 읽기 전용이다 (aria-hidden · tabindex="-1")
function thumb(e,snap){
 const s=snap||published(e)||e.versions[0].snapshot;
 return '<div class="thumb" aria-hidden="true"><iframe tabindex="-1" loading="lazy" sandbox="'+SANDBOX_READ+'" title="이벤트 상단 디자인" data-doc="'+stageDocument(templateDocument(s,true))+'"></iframe></div>';
}

function fullFrame(e,s,mode){return '<iframe class="event-frame" data-event="'+esc(e.id)+'" data-mode="'+mode+'" title="'+(mode==='editor'?'관리자 미리보기':mode==='readonly'?'저장된 버전 미리보기':'게시된 이벤트')+'" sandbox="'+sandboxFor(mode)+'" data-doc="'+stageDocument(templateDocument(s))+'"></iframe>';}

function applySnapshot(doc,s){
 applyContentEdits(doc,s);
 applyButtonStyle(doc,s);
 // templateDocument 와 같은 규칙 — LLM 소유 블록은 필드로 덮지 않는다.
 const owned=k=>Boolean(s.blocks?.[FIELD_BLOCK[k]]);
 const set=(q,v,field)=>{if(owned(field))return;const el=doc.querySelector(q);if(el)el.textContent=v;};
 set('.hero-title',s.title,'title');set('.hero-desc',s.intro,'intro');
 set('[data-block="benefits"] h2',s.benefitHeading,'benefitHeading');set('[data-slot="cta-link"]',s.cta,'cta');
 doc.querySelectorAll('[data-slot="period"]').forEach(el=>el.textContent=shortDate(s.start)+' ~ '+shortDate(s.end));
}

function validSnapshot(s){
 if(!s.title.trim()||!s.intro.trim()||!s.benefitHeading.trim()||!s.cta.trim()){toast('제목과 문구를 빈칸 없이 입력해주세요.');return false;}
 const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x));
 if(!validDate(s.start)||!validDate(s.end)||s.start>s.end){toast('시작일과 종료일을 확인해주세요.');return false;}
 return true;
}

export { templateDocument, thumb, fullFrame, applySnapshot, validSnapshot, takeStagedDocument, SERVER_OWNED, serverFrame }
