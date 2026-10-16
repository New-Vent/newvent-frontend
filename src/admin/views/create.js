/**
 * 이벤트 생성 (2단계 초안 흐름).
 * 최종 확인 전까지는 아무것도 저장하지 않는다.
 * 원본: creationView · creationSummary · creationError ·
 *       validateCreation · startCreation · finishCreation
 */

import { clone } from '@shared/dom.js'

import { navigate } from '@shared/navigate.js'

import { DEMO_DATE } from '@shared/constants.js'
import { $, esc } from '@shared/dom.js'
import { daysBetween, policyLabel, shortDate } from '@shared/format.js'
import { icon } from '@shared/icons.js'
import { AI_START, CONFIGS } from '@shared/mock/configs.js'
import { baseSnapshot } from '@shared/mock/fixtures.js'
import { persist } from '@shared/persist.js'
import { serverFrame, thumb } from '@shared/preview/document.js'
import { collectTexts } from '@shared/preview/server-texts.js'
import { state, ui } from '@shared/state.js'
import { button, field } from '@shared/ui/controls.js'
import { toast } from '@shared/ui/toast.js'
import { modal } from '@shared/ui/modal.js'
import { GRADES, REQUEST_MAX, TEMPLATE_KEYS, audienceOf, gradeLabel } from '@shared/grades.js'
import { BLOCK_LABELS } from '@shared/constants.js'
import { createEvent, loadAdminEvents, loadSimilarVersions, loadVersion, loadVersions, startGenerate, USE_SERVER, loadBasicTemplates, loadBasicTemplate } from '@shared/repo.js'
import { LAYOUTS, layoutPicks } from '@shared/layouts.js'
import { resetAdminServer } from './list.js'
import { openServerEditor } from './server-editor.js'

function creationTemplates() {
  if (!USE_SERVER) return CONFIGS

  return (ui.creation?.serverTemplates || []).map((template) => {
    const templateId = Object.keys(TEMPLATE_KEYS).find((id) => TEMPLATE_KEYS[id] === template.templateKey,)
    const local = CONFIGS.find((cfg) => cfg.templateId === templateId)

    return {
      ...local,
      ...template,
      templateId: templateId || template.templateKey,
      previewConfig: local,
    }
  })
}

export function ensureCreationTemplates(rerender) {
  const c = ui.creation
  if (!USE_SERVER || !c || c.step !== 2 || c.mode !== 'template') return
  if (c.templatesState) return

  c.templatesState = 'loading'

  loadBasicTemplates()
    .then((templates) => {
      if (ui.creation !== c) return

      c.serverTemplates = templates.filter((template) => template.active)
      c.templatesState = 'done'
    })
    .catch((error) => {
      if (ui.creation !== c) return

      c.templatesState = 'error'
      c.templatesError = error?.message || '템플릿 목록을 불러오지 못했어요.'
    })
    .finally(() => {
      if (ui.creation === c && ui.route === 'create') rerender()
    })
}

export async function selectCreationTemplate(templateId, rerender) {
  const c = ui.creation
  if (!c || c.submitting) return

  const template = creationTemplates().find((item) => item.templateId === templateId,)
  if (!template) return

  if (templateId === 'tpl-3' && c.grade === 'NORMAL') { creationError('먼저 기본 정보에서 참여 대상을 우수 이상으로 바꿔주세요.'); return }

  // 같은 카드를 다시 눌렀을 때 중복 조회하지 않는다.
  if (c.templateId === templateId && ['loading', 'done'].includes(c.templateDetailState)) { return }

  c.templateId = templateId
  c.templateDetail = null
  c.templateDetailError = null

  if (!USE_SERVER) { updateCreationSelection();  return }

  const requestId = (c.templateRequestId || 0) + 1
  c.templateRequestId = requestId
  c.templateDetailState = 'loading'

  updateCreationSelection()

  try {
    const detail = await loadBasicTemplate(template.templateKey)

    if (ui.creation !== c || c.templateRequestId !== requestId) return
    if (!detail.active) throw new Error('사용할 수 없는 템플릿이에요.')

    c.templateDetail = detail
    c.templateDetailState = 'done'
  } catch (error) {
    if (ui.creation !== c || c.templateRequestId !== requestId) return

    c.templateDetailState = 'error'
    c.templateDetailError = error?.message || '템플릿 상세 정보를 불러오지 못했어요.'
  }

  if (ui.creation === c && ui.route === 'create') { updateCreationSelection() }
}

function creationTemplateCards(c) {
  if (USE_SERVER && c.templatesState === 'error') {
    return '<p role="alert">' + esc(c.templatesError) + '</p>'
      + button('retry-create-templates', '다시 불러오기', '', 'btn sm')
  }

  if (USE_SERVER && c.templatesState !== 'done') {
    return '<p class="helper">템플릿을 불러오는 중…</p>'
  }

  const templates = creationTemplates()
  if (!templates.length) {
    return '<p class="helper">사용 가능한 기본 템플릿이 없어요.</p>'
  }

  const cards = templates.map((cfg) => {
    const selected = c.templateId === cfg.templateId
    const restricted = cfg.templateId === 'tpl-3' && c.grade === 'NORMAL'
    const preview = USE_SERVER ? cfg.previewConfig : cfg
    const description = USE_SERVER
      ? cfg.description || ''
      : cfg.kind + ' · ' + policyLabel(cfg)

    return '<button type="button" class="template-option '
      + (selected ? 'selected' : '')
      + '" data-act="select-create-template" data-template="'
      + esc(cfg.templateId)
      + '" aria-pressed="' + selected + '"'
      + (restricted ? ' aria-disabled="true"' : '') + '>'
      + (preview ? thumb(preview, baseSnapshot(preview)) : '')
      + '<span class="name">' + esc(cfg.name)
      + (selected ? ' <span class="badge pink">선택됨</span>' : '')
      + '</span>'
      + '<span class="create-template-detail">' + esc(description) + '</span>'
      + (restricted
        ? '<span class="template-restriction">참여 대상을 우수 이상으로 설정해주세요.</span>'
        : '')
      + '</button>'
  }).join('')

  return '<div class="template-grid create-template-grid">'
    + cards + '</div>'
    + '<div id="creation-template-detail" aria-live="polite">'
    + creationTemplateDetail(c)
    + '</div>'
}

function creationTemplateDetail(c) {
  if (!USE_SERVER || !c.templateId) return ''

  if (c.templateDetailState === 'loading') {
    return '<p class="helper">선택한 템플릿을 확인하는 중…</p>'
  }

  if (c.templateDetailState === 'error') {
    return '<p role="alert">' + esc(c.templateDetailError) + '</p>'
      + button('retry-create-template-detail', '다시 확인', '', 'btn sm')
  }

  return c.templateDetail
    ? '<p class="helper">' + esc(c.templateDetail.description || '') + '</p>'
    : ''
}

function updateCreationSelection() {
  const c = ui.creation
  if (!c || ui.route !== 'create') return

  document.querySelectorAll(
    '[data-act="select-create-template"]',
  ).forEach((card) => {
    const selected = card.dataset.template === c.templateId

    card.classList.toggle('selected', selected)
    card.setAttribute('aria-pressed', String(selected))

    const name = card.querySelector('.name')
    name?.querySelectorAll('.badge').forEach((badge) => badge.remove())

    if (selected && name) {
      const badge = document.createElement('span')
      badge.className = 'badge pink'
      badge.textContent = '선택됨'
      name.appendChild(badge)
    }
  })

  const summary = document.getElementById('creation-summary')
  if (summary) summary.innerHTML = creationSummary()

  const detail = document.getElementById('creation-template-detail')
  if (detail) detail.innerHTML = creationTemplateDetail(c)

  const error = document.getElementById('create-error')
  if (error) error.textContent = ''
}

function startCreation(){
 ui.creation={step:1,title:'',start:DEMO_DATE,end:'2026-10-06',grade:'NORMAL',mode:'template',templateId:null,prompt:''};
 navigate('create');
}

/**
 * 오른쪽 요약 카드 — 입력할 때마다 #creation-summary 안만 다시 그린다.
 * 항목마다 아이콘 · 라벨 · 값, 아래에 준비 상태(채운 항목 수)를 보여 준다.
 */
function creationSummary(){
 const c = ui.creation
 const cfg = USE_SERVER
   ? c.templateDetail
   : CONFIGS.find((x) => x.templateId === c.templateId)
 const grade=GRADES.find(g=>g.code===c.grade);
 const validPeriod=c.start&&c.end&&c.start<=c.end;
 const days=validPeriod?daysBetween(c.start,c.end)+1:0;
 const method=c.step===1?null:c.mode==='ai'
  ?{icon:'sparkle',name:USE_SERVER?'AI로 새로 만들기':'AI로 새로 만들기 · 체험',sub:c.prompt.trim()?c.prompt.trim().length+'자 요청':'요청을 적어주세요'}
  :cfg?{icon:'grid',name:cfg.name+' 템플릿',sub:'템플릿으로 바로 시작'}:null;
 const checks=[!!c.title.trim(),validPeriod,!!grade,!!method&&(c.mode!=='ai'||!!c.prompt.trim())];
 const done=checks.filter(Boolean).length;
 const row=(ico,label,value,sub,empty)=>'<div class="sum-row'+(empty?' empty':'')+'"><span class="sum-icon">'+icon(ico)+'</span><div class="sum-text"><dt>'+label+'</dt><dd>'+value+'</dd>'+(sub?'<small>'+sub+'</small>':'')+'</div></div>';
 return '<div class="sum-head"><span class="eyebrow">NEW EVENT</span><h3>이번에 만들 이벤트</h3></div>'
  +'<dl class="sum-list">'
  +row('edit','이벤트명',c.title.trim()?esc(c.title.trim()):'이벤트명을 입력해주세요','',!c.title.trim())
  +row('clock','기간',validPeriod?esc(shortDate(c.start))+' <span class="sum-arrow">→</span> '+esc(shortDate(c.end)):'기간을 확인해주세요',validPeriod?'<span class="sum-chip">'+days+'일간</span>':'',!validPeriod)
  +row('user','참여 대상',grade?'<span class="sum-grade">'+esc(grade.label)+'</span>':'선택해주세요',grade?esc(grade.desc):'',!grade)
  +row(method?.icon||'layers','시작 방식',method?esc(method.name):c.step===1?'다음 단계에서 선택':'템플릿을 선택해주세요',method?esc(method.sub):'',!method)
  +'</dl>'
  +'<div class="sum-ready"><div class="sum-ready-head"><span>준비 상태</span><strong>'+done+' / '+checks.length+'</strong></div>'
  +'<div class="sum-bar"><span style="width:'+(done/checks.length*100)+'%"></span></div>'
  +'<p>'+(done===checks.length?'모두 준비됐어요. 만들기를 눌러주세요.':'비어 있는 항목을 채워주세요.')+'</p></div>';
}

function creationView(){
 if(!ui.creation)ui.creation={step:1,title:'',start:DEMO_DATE,end:'2026-10-06',grade:'NORMAL',mode:'template',templateId:null,prompt:''};
 const c=ui.creation;
 const progress='<ol class="create-progress" aria-label="이벤트 생성 단계"><li class="'+(c.step===1?'current':'done')+'" '+(c.step===1?'aria-current="step"':'')+'><span>'+(c.step===1?'1':icon('check'))+'</span>기본 정보</li><li class="'+(c.step===2?'current':'')+'" '+(c.step===2?'aria-current="step"':'')+'><span>2</span>시작 방식</li></ol>';
 let content='';
 if(c.step===1){
  content='<section class="panel"><div class="panel-head">먼저 이벤트의 기본 정보를 알려주세요</div><form id="create-basics" class="panel-body fields" novalidate><label class="field">이벤트명 <span class="helper">관리 목록과 이벤트 페이지의 제목으로 사용해요.</span><input data-create="title" name="title" maxlength="100" required placeholder="예: 가을맞이 함께하는 응원 이벤트" value="'+esc(c.title)+'"></label><div class="field-pair"><label class="field">시작일<input data-create="start" type="date" required value="'+esc(c.start)+'"></label><label class="field">종료일<input data-create="end" type="date" required value="'+esc(c.end)+'"></label></div><label class="field">참여 대상<select data-create="grade">'+GRADES.map(g=>'<option value="'+g.code+'" '+(c.grade===g.code?'selected':'')+'>'+esc(g.label)+' · '+esc(g.desc)+'</option>').join('')+'</select><span class="helper">이 등급 이상인 회원만 참여할 수 있어요.</span></label><p id="create-error" class="create-error" role="alert"></p><div class="create-actions">'+button('cancel-create','취소')+'<button type="submit" class="btn primary">다음 · 시작 방식 선택 '+icon('arrow')+'</button></div></form></section>';
 }else{
  const modes='<div class="creation-methods">'+button('create-mode',icon('grid')+'<strong>템플릿으로 시작</strong><span>완성된 디자인을 고르고 내용을 다듬어요.</span>','data-mode="template" aria-pressed="'+(c.mode==='template')+'"','method-card '+(c.mode==='template'?'selected':''))+button('create-mode',icon('sparkle')+'<strong>AI로 새로 만들기 '+(USE_SERVER?'':'<small class="badge">체험</small>')+'</strong><span>원하는 이벤트를 설명하고 초안에서 시작해요.</span>','data-mode="ai" aria-pressed="'+(c.mode==='ai')+'"','method-card '+(c.mode==='ai'?'selected':''))+'</div>';
  const templates='<div class="creation-section-title"><h3>어울리는 템플릿을 선택해주세요</h3><p>디자인을 선택한 다음 아래 버튼으로 편집을 시작해요.</p></div>'+ creationTemplateCards(c)
  const ai='<div class="creation-section-title"><h3>어떤 이벤트를 만들고 싶으신가요?</h3><p>목적, 원하는 분위기, 확정된 혜택 등을 자유롭게 적어주세요.</p></div><label class="field">이벤트 기획<textarea data-create="prompt" maxlength="'+REQUEST_MAX+'" rows="6" placeholder="예: 가을맞이 고객 감사 이벤트를 만들고 싶어요. 흰색과 분홍색으로 따뜻하게 표현하고, 혜택은 아직 정해지지 않았으니 임의로 추가하지 말아주세요.">'+esc(c.prompt)+'</textarea></label>' + (USE_SERVER ? '<div class="chips">' + button('create-rag-drafts', '초안 보기', '', 'chip') + button('create-rag-similar', '유사 이벤트 찾기', '', 'chip') + '</div>' : '') + '<div class="review-note">'+(USE_SERVER?'<strong>AI 가 요청을 읽고 페이지를 만듭니다.</strong><br>수십 초 걸릴 수 있어요. 요청에 없는 혜택은 만들지 않으니 확정된 혜택을 적어주세요. 최대 '+REQUEST_MAX+'자.':'<strong>AI 생성 흐름을 확인하는 체험 모드입니다.</strong><br>입력한 기획은 대화창에 전달되고, 공통 구조의 예시 초안이 열립니다. 실제 AI가 요청을 해석해 HTML을 생성하지는 않습니다.<br>예시 참여 방식: 로그인 후 계정당 1회 응모.')+'</div>'+(USE_SERVER?layoutField(c):'');
  content='<section class="panel"><div class="panel-head">어떤 방식으로 시작할까요?</div><div class="panel-body">'+modes+(c.mode==='template'?templates:ai)+'<p id="create-error" class="create-error" role="alert"></p><div class="create-actions">'+button('create-back',icon('back')+'기본 정보 수정')+button('finish-create',c.mode==='template'?'선택한 템플릿으로 시작 '+icon('arrow'):(USE_SERVER?'AI 로 만들기 ':'AI 초안 체험하기 ')+icon('sparkle'),'','btn primary')+'</div></div></section>';
 }
 return '<div class="container create-container">'+button('cancel-create',icon('back')+'이벤트 관리로','', 'backlink')+'<div class="page-heading"><span class="eyebrow">START SOMETHING NEW</span><h1>새 이벤트 만들기</h1><p>기본 정보를 정하고, 나에게 맞는 제작 방식으로 시작하세요.</p></div>'+progress+'<div class="create-layout"><div>'+content+'</div><aside id="creation-summary" class="card creation-summary">'+creationSummary()+'</aside></div></div>';
}

function creationError(text,field){
 const el=$('#create-error');if(el)el.textContent=text;
 if(field)document.querySelector('[data-create="'+field+'"]')?.focus();
 return false;
}

function validateCreation(){
 const c=ui.creation;
 if(!c||!c.title.trim())return creationError('이벤트명을 입력해주세요.','title');
 if(c.title.trim().length>100)return creationError('이벤트명은 100자 이내로 입력해주세요.','title');
 const dateOK=x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
 if(!dateOK(c.start)||!dateOK(c.end))return creationError('시작일과 종료일을 입력해주세요.','start');
 if(c.start>c.end)return creationError('종료일은 시작일보다 빠를 수 없어요.','end');
 if(!GRADES.some(g=>g.code===c.grade))return creationError('참여 대상을 선택해주세요.','grade');
 return true;
}

function finishCreation(){
 if(ui.route!=='create'||!ui.logged||ui.role!=='admin'||!validateCreation())return;
 const c=ui.creation;
 if(c.mode==='template'&&!c.templateId)return creationError('시작할 템플릿을 선택해주세요.');
 if(c.mode==='ai'&&!c.prompt.trim())return creationError('만들고 싶은 이벤트를 설명해주세요.','prompt');
 if(c.mode==='ai'&&c.prompt.trim().length>REQUEST_MAX)return creationError('기획은 '+REQUEST_MAX+'자 이내로 입력해주세요.','prompt');
 if (USE_SERVER && c.mode === 'template') {
  const selected = creationTemplates().find((item) => item.templateId === c.templateId,)

  if (c.templateDetailState !== 'done'|| !c.templateDetail?.active || c.templateDetail.templateKey !== selected?.templateKey) { return creationError('선택한 템플릿의 상세 정보를 먼저 확인해주세요.')}
}

const cfg = c.mode === 'ai'
  ? AI_START
  : creationTemplates().find((item) => item.templateId === c.templateId)

if (!cfg) return
 if(cfg.templateId==='tpl-3'&&c.grade==='NORMAL')return creationError('VIP 감사 템플릿은 참여 대상이 우수 이상일 때 사용할 수 있어요.');
 if(USE_SERVER)return serverCreate(c,cfg);
 const id='EVT-2026-'+String(Math.max(...state.db.events.map(e=>Number(e.id.split('-').at(-1))))+1).padStart(3,'0');
 const s=baseSnapshot(cfg);s.title=c.title.trim();s.start=c.start;s.end=c.end;
 const e={...clone(cfg),id,audience:audienceOf(c.grade),start:c.start,end:c.end,creationMethod:c.mode,creationPrompt:c.mode==='ai'?c.prompt.trim():null,publishedVersion:null,versions:[{v:1,source:null,createdAt:new Date().toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}),summary:c.mode==='ai'?'기획을 보관하고 예시 초안으로 시작':'기본 정보를 적용해 템플릿으로 시작',snapshot:s}]};
 state.db.events.push(e);
 ui.chats[id]=c.mode==='ai'?[{role:'user',text:c.prompt.trim()},{role:'assistant',text:'기획을 작업 공간에 가져왔어요. 지금 보이는 화면은 AI 생성 흐름을 확인하기 위한 공통 구조의 예시 초안입니다. 입력한 이벤트명과 기간이 적용되어 있어요.'}]:[{role:'assistant',text:cfg.name+' 템플릿에 이벤트명과 기간을 적용했어요. 미리보기를 확인하고 문구를 다듬어보세요.'}];
 ui.creation=null;persist();navigate('editor',id);toast('기본 정보를 적용한 새 작업 공간을 만들었어요.');
}

/**
 * 서버 모드 — 이벤트를 만들고 페이지 생성을 시작한 뒤 편집 화면(서버 미리보기)으로 간다.
 *   ① POST /api/admin/events            (템플릿이면 templateKey 를 붙인다)
 *   ② POST /api/admin/events/{id}/generate   템플릿 {} / AI { requestText }
 *
 * ★ ①은 됐는데 ②가 실패해도 이벤트는 남는다 — 편집 화면에서 다시 생성할 수 있게 넘어간다
 * ★ 기간은 날짜만 받으므로 KST 하루의 시작 · 끝으로 보낸다
 */
async function serverCreate(c,cfg){
 if(c.submitting)return;
 c.submitting=true;
 const btn=$('[data-act="finish-create"]');
 if(btn){btn.disabled=true;btn.textContent='만드는 중…';}
 let event;
 try{
  event = await createEvent({
    name: c.title.trim(),
    startAt: c.start + 'T00:00:00+09:00',
    endAt: c.end + 'T23:59:59+09:00',
    grade: c.grade,
    ...(c.mode === 'template'
      ? { templateKey: c.templateDetail.templateKey }
      : {}),
  })
 }catch(e){
  c.submitting=false;
  if(btn){btn.disabled=false;btn.textContent=c.mode==='template'?'선택한 템플릿으로 시작':'AI 로 만들기';}
  return creationError(e?.message||'이벤트를 만들지 못했어요.');
 }
 const request=c.mode==='ai'?c.prompt.trim():null;
 let jobId=null,startError=null;
 // 고른 배치 — 비어 있으면(자동) 보내지 않는다. AI 가 고른다
 try{jobId=(await startGenerate(event.id,request?{requestText:request,...(c.layout?{layout:c.layout}:{})}:{})).jobId;}
 catch(e){startError=e?.message||'페이지 생성을 시작하지 못했어요.';}
 ui.creation=null;
 resetAdminServer();
 openServerEditor(event.id,{jobId,request,startError});
 navigate('editor',String(event.id));
 toast(startError?'이벤트를 만들었어요. 페이지 생성은 다시 시도해주세요.':'이벤트를 만들고 페이지를 생성하고 있어요.');
}

/** AI 생성의 페이지 배치 고르기 — 맨 앞이 자동(AI 가 고른다). 고르면 서버가 그 배치로 건다 */
/* ── 만들기 화면 RAG (기획 단계 — eventId 없음, query 모드로만 부른다) ── */

/** 기획 입력창 내용. 저장 전이라 DOM 값을 직접 읽는다 */
function planningText() {
  const ta = document.querySelector('[data-create="prompt"]')
  return ((ta?.value ?? ui.creation?.prompt ?? '')).trim()
}

async function fillCreateBox(load) {
  const box = document.getElementById('rag-result')
  if (!box) return
  box.innerHTML = '<p class="helper">불러오는 중…</p>'
  try {
    box.innerHTML = await load()
  } catch (e) {
    box.innerHTML = '<p>' + esc(e?.message || '불러오지 못했어요.') + '</p>'
  }
}

let draftEvents = null

/** 초안 보기 — 지난 이벤트 목록 (기획용). 임베딩이 아니라 목록 API로 가져와 제목으로 가린다 */
async function openCreateDrafts() {
  draftEvents = null
  modal('초안 보기',
    '<div class="rag-board-head"><p class="helper">지난 기획 목록이에요. [담기]를 누르면 기획 입력창에 참고 문구로 들어갑니다.</p>'
    + '<div class="rag-board-search"><input id="rag-q" type="search" value="" placeholder="제목 검색" aria-label="지난 기획 검색어">'
    + button('create-rag-drafts-run', icon('search'), 'aria-label="지난 기획 검색"', 'btn sm') + '</div></div>'
    + '<div id="rag-result"><p class="helper">목록을 불러오는 중…</p></div>',
    button('close', '닫기'), true)
  document.getElementById('rag-q')?.addEventListener('input', runCreateDrafts)
  document.getElementById('rag-q')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') runCreateDrafts() })
  try {
    draftEvents = await loadAdminEvents()
  } catch (e) {
    draftEvents = []
    const box = document.getElementById('rag-result')
    if (box) box.innerHTML = '<p>' + esc(e?.message || '불러오지 못했어요.') + '</p>'
    return
  }
  runCreateDrafts()
}

function runCreateDrafts() {
  const box = document.getElementById('rag-result')
  if (!box) return
  const q = (document.getElementById('rag-q')?.value ?? '').trim()
  const items = (draftEvents ?? []).filter((e) => !q || String(e.title ?? e.name ?? '').includes(q))
  if (!items.length) {
    box.innerHTML = '<p>지난 기획이 없어요.' + (q ? ' 검색어를 바꿔보세요.' : '') + '</p>'
    return
  }
  box.innerHTML = '<p class="helper">지난 기획 ' + items.length + '건</p>' + items.map((e) => {
    const title = String(e.title ?? e.name ?? '').replace(/^SEED:\s*/, '')
    const period = (String(e.startAt ?? e.start ?? '').slice(0, 10)) + '~' + (String(e.endAt ?? e.end ?? '').slice(0, 10))
    return '<div class="rag-rec-row"><div class="rag-rec-text"><p class="rag-rec-title">' + esc(title) + '</p>'
      + '<p class="rag-rec-desc">' + esc(period) + (e.latestVersionNo ? ' · v' + e.latestVersionNo : '') + '</p></div>'
      + button('create-rag-preview', '미리보기', 'data-event="' + e.id + '" data-title="' + esc(title) + '"', 'btn sm ghost')
      + button('create-rag-copy', '담기', 'data-event="' + e.id + '"', 'btn sm primary') + '</div>'
  }).join('')
}

async function openCreateSimilar() {
  const q0 = planningText()
  modal('유사 이벤트 찾기',
    '<div class="rag-board-head"><p class="helper">기획 내용과 비슷한 지난 버전들이에요. [보기]로 내용을 확인하세요.</p>'
    + '<div class="rag-board-search"><input id="rag-q" type="search" value="' + esc(q0) + '" placeholder="키워드 입력" aria-label="사례 검색어">'
    + button('create-rag-similar-run', icon('search'), 'aria-label="사례 검색"', 'btn sm') + '</div></div>'
    + '<div id="rag-result"><p class="helper">기획 내용으로 찾는 중…</p></div>',
    button('close', '닫기'), true)
  document.getElementById('rag-q')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') runCreateSimilar() })
  if (q0) runCreateSimilar()
}

async function runCreateSimilar() {
  const q = document.getElementById('rag-q')?.value?.trim()
  if (!q) { toast('검색어를 입력해주세요.'); return }
  await fillCreateBox(async () => {
    const items = await loadSimilarVersions(null, null, 5, q)
    if (!Array.isArray(items) || !items.length) return '<p>비슷한 사례가 없어요. 검색어를 바꿔보세요.</p>'
    return items.map((v) => {
      const refs = (v.topChunks ?? []).map((c) => c.content).filter(Boolean).join(' / ')
      const src = '(출처: ' + (v.eventTitle ?? '') + ' v' + v.versionNo + ')\n참고: ' + refs
      return '<div class="rag-rec-row"><div class="rag-rec-text"><p class="rag-rec-title">'
      + esc(v.eventTitle ?? '') + ' · v' + v.versionNo
      + ' · 유사도 ' + Math.round((v.similarity ?? 0) * 100) + '%</p>'
      + (refs ? '<p class="rag-rec-desc">' + esc(refs) + '</p>' : '') + '</div>'
      + button('create-rag-similar-view', '보기', 'data-event="' + v.eventId + '" data-version="' + v.versionId + '"', 'btn sm ghost') + '</div>'
    }).join('')
  })
}

const draftLabelOf = (k) => BLOCK_LABELS[k] || k

/** 최신 버전 HTML을 블록별 텍스트로 묶는다. 미리보기·담기가 공유한다 */
async function loadDraftContent(eventId) {
  const list = (await loadVersions(eventId)).versions ?? []
  const latest = list.slice().sort((a, b) => a.versionNo - b.versionNo).at(-1)
  if (!latest) return null
  const v = await loadVersion(eventId, latest.versionId)
  const byBlock = {}
  for (const t of collectTexts(new DOMParser().parseFromString('<body>' + (v.htmlContent || '') + '</body>', 'text/html').body)) {
    (byBlock[t.block] ||= []).push(t.text)
  }
  return { html: v.htmlContent, blocks: byBlock }
}

/** 지난 기획 미리보기 — 게시물명 + 렌더 미리보기. 블록 요약은 보여주지 않는다 */
async function openCreateDraftPreview(eventId, title) {
  try {
    const d = await loadDraftContent(eventId)
    if (!d) { toast('버전이 없어요.'); return }
    modal(esc(title) + ' 미리보기',
      '<div class="version-preview-frame">' + serverFrame(d.html, '미리보기') + '</div>',
      button('create-rag-copy', '담기', 'data-event="' + eventId + '"', 'btn sm primary')
      + button('create-rag-drafts', '목록', '', 'btn sm')
      + button('close', '닫기', '', 'btn sm ghost'), true)
    document.querySelector('#overlay .modal')?.classList.add('version-preview-modal')
  } catch (e) {
    toast(e?.message || '미리보기를 불러오지 못했어요.')
  }
}

function appendPlanning(ta, text) {
  const have = ta.value || ''
  const fresh = String(text).split('\n')
    .map((ln) => ln.trim())
    .filter((ln) => ln && !have.includes(ln.length > 30 ? ln.slice(0, 30) : ln))
  if (!fresh.length) return false
  ta.value = (have ? have + '\n' : '') + fresh.join('\n')
  if (ui.creation) ui.creation.prompt = ta.value
  return true
}

/** 블록 텍스트에서 키워드 후보를 추린다 — 짧은 구, 숫자·단위 포함구, 기호 강조구 */
function draftKeywords(blocks) {
  const out = []
  for (const [k, ts] of Object.entries(blocks)) {
    const keys = ts.join(' ').split(/[.。!?\n]+/)
      .map((s) => s.trim())
      .filter((s) => s && (s.length <= 25 || /[0-9%GB]/.test(s) || /[★♪🎉💯🎅▶]/.test(s)))
      .slice(0, 4)
    if (keys.length) out.push('[' + draftLabelOf(k) + ' 키워드] ' + keys.join(' / '))
  }
  return out.join('\n')
}

/** 지난 기획 담기 — 키워드 중심으로 기획창에 넣는다. 기획 길이 상한을 넘지 않게 자른다 */
async function copyDraftBlocks(eventId) {
  const ta = document.querySelector('[data-create="prompt"]')
  if (!ta || !Number.isSafeInteger(eventId) || eventId <= 0) return
  toast('담는 중…')
  try {
    const d = await loadDraftContent(eventId)
    if (!d) { toast('버전이 없어요.'); return }
    const payload = draftKeywords(d.blocks)
    if (!payload) { toast('뽑을 키워드가 없어요.'); return }
    const room = REQUEST_MAX - ta.value.length
    if (room <= 0) { toast('기획이 꽉 찼어요.'); return }
    toast(appendPlanning(ta, payload.slice(0, room)) ? '기획에 담았어요.' : '이미 담긴 내용이에요.')
  } catch (e) {
    toast(e?.message || '담지 못했어요.')
  }
}

/** 비슷한 사례 미리보기 — 저장된 버전을 읽기 전용으로 연다 */
async function openCreateSimilarVersion(eventId, versionId) {
  try {
    const v = await loadVersion(eventId, versionId)
    modal('v' + v.versionNo + ' · 저장된 버전 미리보기',
      '<div class="version-preview-frame">' + serverFrame(v.htmlContent, 'v' + v.versionNo + ' 미리보기') + '</div>',
      button('close', '닫기', '', 'btn primary'), true)
    document.querySelector('#overlay .modal')?.classList.add('version-preview-modal')
  } catch (e) {
    toast(e?.message || '버전을 불러오지 못했어요.')
  }
}

/**
 * 만들기 화면 RAG 버튼. 모달이라 화면을 다시 그리지 않는다.
 * @returns {boolean} 처리했으면 true
 */
export function handleCreateRagClick(a, b) {
  switch (a) {
    case 'create-rag-drafts': openCreateDrafts(); return true
    case 'create-rag-drafts-run': runCreateDrafts(); return true
    case 'create-rag-similar': openCreateSimilar(); return true
    case 'create-rag-similar-run': runCreateSimilar(); return true
    case 'create-rag-copy': {
      // 기획 입력창에 덧붙인다. 모달은 열어 둬서 여러 개를 고를 수 있다
      if (b.dataset.event) {
        copyDraftBlocks(Number(b.dataset.event))
        return true
      }
      const ta = document.querySelector('[data-create="prompt"]')
      const text = b.dataset.text || ''
      if (ta && text) {
        toast(appendPlanning(ta, text) ? '기획에 담았어요.' : '이미 담긴 내용이에요.')
      }
      return true
    }
    case 'create-rag-preview': {
      const previewId = Number(b.dataset.event)
      if (Number.isSafeInteger(previewId) && previewId > 0) openCreateDraftPreview(previewId, b.dataset.title || '')
      return true
    }
    case 'create-rag-similar-view': {
      const eventId = Number(b.dataset.event), versionId = Number(b.dataset.version)
      if (Number.isSafeInteger(eventId) && eventId > 0 && Number.isSafeInteger(versionId) && versionId > 0) {
        openCreateSimilarVersion(eventId, versionId)
      }
      return true
    }
  }
  return false
}

function layoutField(c){
 const options=[{cssClass:'',label:'자동',title:'AI 가 내용에 맞춰 골라요',icon:icon('sparkle')},...LAYOUTS.map(l=>({cssClass:l.cssClass,label:l.label,title:l.hint+(l.min?' 내용 영역 '+l.min+'개 이상.':'')}))];
 return '<div class="field lay-field"><span>페이지 배치</span><div id="create-layouts">'+layoutPicks('create-layout',c.layout||'',options)+'</div><span class="helper">자동은 AI 가 내용에 맞춰 골라요. 영역이 모자라 쓸 수 없는 배치는 기본 배치로 만들어져요. 만든 뒤 편집 화면에서 바꿀 수 있어요.</span></div>';
}

export { creationView, startCreation, creationError, validateCreation, finishCreation, creationSummary }
