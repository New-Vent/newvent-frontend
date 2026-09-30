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
 // 서버가 Jsoup Safelist 로 정화한 HTML 만 온다는 전제이며,
 // 실질 방어선은 iframe sandbox 가 아니라 그 서버 정화다.
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
 const css='html,body{margin:0!important}body{overflow-x:hidden}body,body *{font-family:"Noto Sans KR Variable","Malgun Gothic",sans-serif!important}.ev-container{margin:0 auto!important}.nv-text-active{background:#fff1a8!important;color:#292330!important;outline:2px solid #d60076!important;outline-offset:3px;border-radius:3px;box-decoration-break:clone;-webkit-box-decoration-break:clone}.newvent-selected{outline:3px solid #d60076!important;outline-offset:-4px}button:disabled{opacity:.5;cursor:default}button:focus-visible{outline:3px solid #da3990;outline-offset:4px}'+(thumb?'\nhtml,body{width:720px!important;height:440px!important;overflow:hidden!important}.ev-container{width:720px!important;max-width:720px!important;box-shadow:none!important;border-radius:0!important}[data-block="hero"]{min-height:440px!important;max-height:440px;overflow:hidden;padding-top:30px!important}.hero-title{font-size:40px!important;line-height:1.2!important}.hero-desc{font-size:16px!important;line-height:1.6!important}':'');
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
 * allow-scripts 를 준다 — 템플릿의 window.newVentReinit 과 타이머가
 * 동작해야 블록 부분 교체 후 재연결이 된다 (AI_EDIT_RULES 2-2).
 *
 * ⚠ allow-scripts 와 allow-same-origin 을 함께 주면 sandbox 는 사실상
 *   무력해진다. 이 구성은 "서버가 Jsoup Safelist 로 정화한 HTML 만
 *   내려준다"는 팀 합의 위에 서 있고, 실질 방어선은 그 서버 정화다.
 */
const SANDBOX = 'allow-same-origin allow-scripts'

function thumb(e,snap){
 const s=snap||published(e)||e.versions[0].snapshot;
 return '<div class="thumb" aria-hidden="true"><iframe tabindex="-1" loading="lazy" sandbox="'+SANDBOX+'" title="이벤트 상단 디자인" data-doc="'+stageDocument(templateDocument(s,true))+'"></iframe></div>';
}

function fullFrame(e,s,mode){return '<iframe class="event-frame" data-event="'+esc(e.id)+'" data-mode="'+mode+'" title="'+(mode==='editor'?'관리자 미리보기':mode==='readonly'?'저장된 버전 미리보기':'게시된 이벤트')+'" sandbox="'+SANDBOX+'" data-doc="'+stageDocument(templateDocument(s))+'"></iframe>';}

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

export { templateDocument, thumb, fullFrame, applySnapshot, validSnapshot, takeStagedDocument, SERVER_OWNED }
