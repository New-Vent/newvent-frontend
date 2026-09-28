/**
 * 이벤트 미리보기 문서 조립.
 *
 * 원본은 embedded-font 와 event.css 를 Blob URL 로 iframe 에 넣었다.
 * 여기서는 /assets/event.css 를 실제 파일로 링크한다 (nginx 가 서빙).
 */

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

function templateDocument(snapshot,thumb=false){
 const doc=new DOMParser().parseFromString(TEMPLATE_BODIES[snapshot.templateId],'text/html');
 markEditableText(doc);applyContentEdits(doc,snapshot);
 const put=(s,t)=>{const x=doc.querySelector(s);if(x)x.textContent=t;};
 put('.hero-title',snapshot.title);put('.hero-desc',snapshot.intro);
 put('[data-block="benefits"] h2',snapshot.benefitHeading);put('[data-slot="cta-link"]',snapshot.cta);
 doc.querySelectorAll('[data-slot="period"]').forEach(n=>n.textContent=shortDate(snapshot.start)+' ~ '+shortDate(snapshot.end));
 doc.querySelectorAll('script,iframe').forEach(n=>n.remove());
 doc.querySelectorAll('*').forEach(n=>{Array.from(n.attributes).forEach(a=>{if(a.name.startsWith('on'))n.removeAttribute(a.name);});});
 doc.querySelectorAll('input[type="tel"]').forEach(n=>{n.value='';n.setAttribute('value','');});
 applyButtonStyle(doc,snapshot);
 let body=doc.body.outerHTML;
 if(thumb){
  const hero=doc.querySelector('[data-block="hero"]');
  body='<body class="'+esc(doc.body.className)+'"><div class="ev-container event-page">'+(hero?hero.outerHTML:'')+'</div></body>';
 }
 const css='html,body{margin:0!important}body{overflow-x:hidden}body,body *{font-family:"Noto Sans KR Variable","Malgun Gothic",sans-serif!important}.ev-container{margin:0 auto!important}.nv-text-active{background:#fff1a8!important;color:#292330!important;outline:2px solid #d60076!important;outline-offset:3px;border-radius:3px;box-decoration-break:clone;-webkit-box-decoration-break:clone}.newvent-selected{outline:3px solid #d60076!important;outline-offset:-4px}button:disabled{opacity:.5;cursor:default}button:focus-visible{outline:3px solid #da3990;outline-offset:4px}'+(thumb?'\nhtml,body{width:720px!important;height:440px!important;overflow:hidden!important}.ev-container{width:720px!important;max-width:720px!important;box-shadow:none!important;border-radius:0!important}[data-block="hero"]{min-height:440px!important;max-height:440px;overflow:hidden;padding-top:30px!important}.hero-title{font-size:40px!important;line-height:1.2!important}.hero-desc{font-size:16px!important;line-height:1.6!important}':'');
 return '<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+EVENT_STYLE_LINKS+'<style>'+css+'</style>'+doc.querySelector('#nv-button-style').outerHTML+'</head>'+body+'</html>';
}

function thumb(e,snap){
 const s=snap||published(e)||e.versions[0].snapshot;
 return '<div class="thumb" aria-hidden="true"><iframe tabindex="-1" loading="lazy" sandbox="allow-same-origin" title="이벤트 상단 디자인" srcdoc="'+esc(templateDocument(s,true))+'"></iframe></div>';
}

function fullFrame(e,s,mode){return '<iframe class="event-frame" data-event="'+esc(e.id)+'" data-mode="'+mode+'" title="'+(mode==='editor'?'관리자 미리보기':mode==='readonly'?'저장된 버전 미리보기':'게시된 이벤트')+'" sandbox="allow-same-origin" srcdoc="'+esc(templateDocument(s))+'"></iframe>';}

function applySnapshot(doc,s){
 applyContentEdits(doc,s);
 applyButtonStyle(doc,s);
 const set=(q,v)=>{const el=doc.querySelector(q);if(el)el.textContent=v;};
 set('.hero-title',s.title);set('.hero-desc',s.intro);set('[data-block="benefits"] h2',s.benefitHeading);set('[data-slot="cta-link"]',s.cta);
 doc.querySelectorAll('[data-slot="period"]').forEach(el=>el.textContent=shortDate(s.start)+' ~ '+shortDate(s.end));
}

function validSnapshot(s){
 if(!s.title.trim()||!s.intro.trim()||!s.benefitHeading.trim()||!s.cta.trim()){toast('제목과 문구를 빈칸 없이 입력해주세요.');return false;}
 const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x));
 if(!validDate(s.start)||!validDate(s.end)||s.start>s.end){toast('시작일과 종료일을 확인해주세요.');return false;}
 return true;
}

export { templateDocument, thumb, fullFrame, applySnapshot, validSnapshot }
