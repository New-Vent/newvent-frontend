
import { CONTENT_FIELDS, LABELS } from '@shared/constants.js'
import { showSelectedTarget } from '@shared/editor-state.js'
import { validSnapshot } from '@shared/preview/document.js'
import { applySelection } from '@shared/preview/editable.js'
import { version } from '@shared/selectors.js'
import './styles.css'

import { $, esc } from '@shared/dom.js'
import { AUTH_ENABLED, createApi } from '@shared/api.js'
import { handleLoginSubmit } from '@shared/login-form.js'
import { useApi } from '@shared/repo.js'
import { state, ui } from '@shared/state.js'
import { persist } from '@shared/persist.js'
import { icon } from '@shared/icons.js'
import { button } from '@shared/ui/controls.js'
import { toast } from '@shared/ui/toast.js'
import { modal, closeModal, ask } from '@shared/ui/modal.js'
import { hydrate } from '@shared/preview/frame.js'
import { createRouter } from '@shared/router.js'
import { eventById, currentEvent, currentDraft } from '@shared/selectors.js'
import { requestFor, requestPending, updateEditor } from '@shared/editor-state.js'
import { refreshButtonEditor, refreshContentEditor, highlightEditingText, editButton } from '@shared/preview/editable.js'

import { adminView } from './views/list.js'
import { editorView, refreshChat, addChat, stopRequest, handlePrompt, setEditorMode, changeChatSide } from './views/editor.js'
import { versionsView, previewVersion, saveVersion, showPublish, chooseVersion } from './views/versions.js'
import { creationView, startCreation, creationError, validateCreation, finishCreation } from './views/create.js'
import { loginView } from './views/login.js'

/**
 * 관리자 앱 셸.
 *
 * 사용자 앱과 같은 방식이다 — 라우터가 URL 을 읽어 ui.route 를 맞추고,
 * 이식한 뷰 함수는 원본 그대로 둔다.
 * BASE 가 '/admin/' 이라 아래 경로는 전부 그 아래 기준이다.
 */
// 사용자 앱과 인증 경로가 다르다 — Refresh 쿠키가 nv_admin_rt (Path=/api/admin/auth).
export const api = createApi({ authBase: '/api/admin/auth' })

// repo 가 이 클라이언트로 서버를 부른다 (목업 모드면 안 쓰인다).
useApi(api)

const VIEWS = { admin: adminView, editor: editorView, versions: versionsView, create: creationView, login: loginView }

const ROUTES = [
  { path: '/', name: 'admin' },
  { path: '/login', name: 'login' },
  { path: '/events/new', name: 'create' },
  { path: '/events/:id/edit', name: 'editor' },
  { path: '/events/:id/versions', name: 'versions' },
]

const PATH = {
  admin: () => '/',
  login: () => '/login',
  create: () => '/events/new',
  editor: (id) => `/events/${id}/edit`,
  versions: (id) => `/events/${id}/versions`,
}

function header() {
  $('#header').innerHTML =
    '<div class="container">' +
    '<a class="brand" href="/" data-link aria-label="NewVent 관리자">' +
    '<span class="brand-mark"></span><span>New<b>Vent</b></span></a>' +
    '<nav class="nav" aria-label="주 메뉴">' +
    button('route', '이벤트 관리', 'data-route="admin"',
      ['admin', 'editor', 'versions', 'create'].includes(ui.route) ? 'active' : '') +
    '</nav><div class="account">' +
    (ui.logged
      ? '<span class="avatar">' + icon('layers') + '</span><span class="name">운영자님</span>' +
        button('logout', '로그아웃', '', 'btn ghost sm')
      : button('route', '로그인', 'data-route="login"', 'btn soft sm')) +
    '</div></div>'
}

function render(scroll = false) {
  state.observers.forEach((x) => x.disconnect())
  state.observers = []
  if (!ui.logged && ui.route !== 'login') {
    router.navigate('/login', { replace: true })
    return
  }
  document.body.classList.toggle('editing-workspace', ui.route === 'editor')
  header()
  $('#app').innerHTML = (VIEWS[ui.route] || adminView)()
  hydrate()
  document.title = (ui.route === 'editor' ? '이벤트 제작 스튜디오' : '이벤트 관리') + ' | NewVent'
  if (scroll) window.scrollTo(0, 0)
}

const router = createRouter(ROUTES, (match) => {
  ui.route = match.name
  if (match.params.id) ui.activeId = match.params.id
  render(true)
})

/** 이식한 뷰들이 부르는 navigate(route, id) 를 라우터로 넘긴다. */
function navigate(route, id) {
  if (id) ui.activeId = id
  closeModal()
  router.navigate(PATH[route] ? PATH[route](id ?? ui.activeId) : '/')
}

document.addEventListener('click', (ev) => {
  const link = ev.target.closest('a[data-link]')
  if (link) {
    ev.preventDefault()
    router.navigate(link.getAttribute('href'))
    return
  }
  const b = ev.target.closest('[data-act]')
  if (!b) return
  ev.preventDefault()
  if (b.disabled) return
  const a = b.dataset.act

  if (a === 'logout') {
    Object.keys(ui.requests).forEach((id) => stopRequest(id, '로그아웃하여 요청을 중단했어요. 기존 내용은 유지됩니다.'))
    logout()
    return
  }

  if(a==='publish-latest'){
    const e=eventById(b.dataset.id); if(!e||e.deletedAt) return
    const latest=e.versions.at(-1)
    if(!validSnapshot(latest.snapshot)) return
    const was=e.publishedVersion
    ask(was?'v'+latest.v+'으로 재게시할까요?':'v'+latest.v+'을 게시할까요?',
      esc(e.name)+' 이벤트가 사용자 화면에 '+(was?'v'+latest.v+' 내용으로 바뀝니다.':'공개됩니다.'),
      ()=>{ e.publishedVersion=latest.v; e.endedAt=null; persist(); render()
            toast('v'+latest.v+'을 게시했어요. 사용자 화면에서 확인하세요.') },
      was?'재게시하기':'게시하기')
    return
  }
  if(a==='end-event'){
    const e=eventById(b.dataset.id); if(!e||e.deletedAt||e.endedAt) return
    ask('이벤트를 종료할까요?',
      esc(e.name)+' 이벤트가 사용자 화면에서 종료 상태가 됩니다. 기간이 남아 있어도 참여를 받지 않아요. 다시 게시하면 되살릴 수 있습니다.',
      ()=>{ e.endedAt=new Date().toISOString(); persist(); render(); toast('이벤트를 종료했어요.') },
      '종료하기')
    return
  }
  if(a==='toggle-checkpoint'){
    const e=currentEvent(), v=version(e,Number(b.dataset.version))
    if(!v) return
    v.checkpoint=!v.checkpoint; persist(); render()
    toast(v.checkpoint?'v'+v.v+'을 저장 지점으로 지정했어요.':'v'+v.v+'의 저장 지점을 해제했어요.')
    return
  }
  if(a==='admin-page'){ui.adminPage=Number(b.dataset.page);render(true);return;}
  if(a==='clear-period'){ui.adminFrom='';ui.adminTo='';ui.adminPage=1;render();return;}
  if(a==='chat-side'){changeChatSide(b.dataset.side);return;}
  if(a==='admin-list'){ui.adminShowDeleted=b.dataset.view==='deleted';ui.adminStatus='all';render();return;}
  if(a==='admin-status'){ui.adminStatus=b.dataset.status;render();return;}
  if(a==='delete-event'){const e=eventById(b.dataset.id);if(!e||e.deletedAt||ui.role!=='admin')return;ask('이벤트를 삭제할까요?',esc(e.name)+' 이벤트가 목록과 사용자 화면에서 숨겨집니다. 버전과 참여 기록은 보관되며 휴지통에서 복구할 수 있어요.',()=>{stopRequest(e.id);e.deletedAt=new Date().toISOString();persist();render();toast('이벤트를 휴지통으로 옮겼어요.');},'삭제하기');return;}
  if(a==='restore-event'){const e=eventById(b.dataset.id);if(!e?.deletedAt||ui.role!=='admin')return;delete e.deletedAt;persist();render();toast('이벤트를 복구했어요.');return;}
  if(a==='editor-mode'){setEditorMode(b.dataset.mode);return;}
  if(a==='close'){closeModal();return;}
  if(a==='route'){navigate(b.dataset.route);return;}
  if(a==='edit'){navigate('editor',b.dataset.id);return;}
  if(a==='versions'){navigate('versions',b.dataset.id);return;}
  if(a==='new'){startCreation();return;}
  if(a==='cancel-create'){ui.creation=null;navigate('admin');return;}
  if(a==='create-back'){ui.creation.step=1;render(true);return;}
  if(a==='create-mode'){ui.creation.mode=b.dataset.mode;render();document.querySelector('[data-act="create-mode"][data-mode="'+ui.creation.mode+'"]')?.focus({preventScroll:true});return;}
  if(a==='select-create-template'){   if(b.getAttribute('aria-disabled')==='true'){creationError('먼저 기본 정보에서 참여 대상을 VIP · FAMILY 회원으로 바꿔주세요.');return;}   ui.creation.templateId=b.dataset.template;const y=window.scrollY;render();window.scrollTo(0,y);document.querySelector('[data-act="select-create-template"][data-template="'+ui.creation.templateId+'"]')?.focus({preventScroll:true});return;  }
  if(a==='finish-create'){finishCreation();return;}
  if(a==='device'){ui.mobile=b.dataset.mode==='mobile';render();return;}
  if(a==='block'){   ui.block=b.dataset.block;showSelectedTarget(currentEvent());applySelection();refreshButtonEditor();refreshContentEditor();   const frame=$('.event-frame[data-mode="editor"]'),block=frame?.contentDocument?.querySelector('[data-block="'+ui.block+'"]');   const canvas=$('.canvas');if(block&&canvas)canvas.scrollTo({top:block.offsetTop,behavior:'smooth'});   if(ui.block==='notices')toast('유의사항은 수정 대상에서 제외돼요.');return;  }
  if(a==='reset-button-style'){if(!requestPending()){delete currentDraft().snapshot.buttonStyle;updateEditor();refreshButtonEditor();}return;}
  if(a==='save'){saveVersion();return;}
  if(a==='preview-version'){previewVersion(Number(b.dataset.version));return;}
  if(a==='select-version'){chooseVersion(Number(b.dataset.version));return;}
  if(a==='publish'){showPublish();return;}
  if(a==='confirm-publish'){   const e=state.publishSelection&&eventById(state.publishSelection.eventId);   const selected=e&&version(e,state.publishSelection.version);   if(!ui.logged||ui.role!=='admin'||!selected)return;   if(!publicationChecks(e,selected).every(x=>x.ok)){toast('게시 전 확인이 필요한 항목이 있어요.');return;}   if(!validSnapshot(selected.snapshot))return;   e.publishedVersion=selected.v;persist();closeModal();render();toast('v'+selected.v+'을 게시했어요. 사용자 화면에서 확인하세요.');return;  }
  if(a==='confirm-local'){const fn=state.confirmAction;closeModal();if(fn)fn();return;}
  if(a==='prompt'){const p=$('#chat-form textarea');if(p&&!requestPending()){ui.chatInputs[currentEvent().id]=b.dataset.prompt;p.value=b.dataset.prompt;p.focus();}return;}
  if(a==='request-scenario'){const id=currentEvent().id;if(requestPending(id))return;ui.scenarios[id]=b.dataset.scenario;ui.demoOpen[id]=true;refreshChat(id);document.querySelector('[data-act="request-scenario"][data-scenario="'+b.dataset.scenario+'"]')?.focus({preventScroll:true});return;}
  if(a==='cancel-request'){stopRequest(currentEvent().id);return;}
  if(a==='retry-request'){const r=requestFor();if(['error','cancelled'].includes(r.status)&&r.prompt)handlePrompt(r.prompt,{retry:true,scenario:'normal'});return;}
  if(a==='edit-request'){const id=currentEvent().id,r=requestFor(id);ui.chatInputs[id]=r.prompt;const input=$('#chat-form textarea');if(input&&!input.disabled){input.value=r.prompt;input.focus();}return;}
  if(a==='answer-request'){if(requestFor().status!=='clarify')return;const prompt=b.dataset.answer==='title'?'제목을 짧게 정리해줘':'소개를 친근하게 바꿔줘';handlePrompt(prompt,{scenario:'normal'});return;}
  if(a==='info'){   modal('NewVent 프로토타입','<p>AI 기반 이벤트 페이지 제작·게시 관리 프로젝트의 화면 체험용 파일입니다.</p><p style="margin-top:12px">이벤트 탐색과 참여 기록, 템플릿 편집과 버전 이력, 게시 흐름을 확인할 수 있어요. 로그인, AI 응답, 참여 결과는 시연용이며 실제 외부 서비스와 연결되지 않습니다.</p><p style="margin-top:12px">오른쪽 아래에서 사용자·관리자 화면을 전환할 수 있습니다. 변경한 기록은 가능한 경우 현재 브라우저에 보관됩니다.</p>',button('close','확인','','btn primary'));return;  }
})

document.addEventListener('input',ev=>{
 if(ev.target.matches('#chat-form textarea')){ui.chatInputs[currentEvent().id]=ev.target.value;return;}
 if(ev.target.dataset.create&&ui.creation){
  const k=ev.target.dataset.create;
  if(['title','start','end','audience','prompt'].includes(k))ui.creation[k]=ev.target.value;
  if(k==='audience'&&ui.creation.audience!=='VIP · FAMILY 회원'&&ui.creation.templateId==='tpl-3')ui.creation.templateId=null;
  if($('#create-error'))$('#create-error').textContent='';
  if($('#creation-summary'))$('#creation-summary').innerHTML=creationSummary();return;
 }
 if(ev.target.id==='event-search'){ui.query=ev.target.value;refreshResults();return;}
 if(ev.target.id==='admin-search'){ui.adminQuery=ev.target.value;$('#admin-results').innerHTML=adminTable(adminFilteredEvents());const count=$('#admin-result-count');if(count)count.textContent=adminFilteredEvents().length+'개 이벤트';return;}
 const k=ev.target.dataset.field;if(k&&Object.hasOwn(LABELS,k)&&ui.role==='admin'&&!requestPending()){currentDraft().snapshot[k]=ev.target.value;updateEditor();}
});

document.addEventListener('change',ev=>{
 if(ev.target.id==='admin-from'||ev.target.id==='admin-to'){
  if(ev.target.id==='admin-from')ui.adminFrom=ev.target.value; else ui.adminTo=ev.target.value;
  ui.adminPage=1;render();return;
 }
 if(ev.target.matches('[data-demo-grade]')){ui.demoGrade=ev.target.value;render();return;}
 if(ev.target.dataset.select!=='publish-version'||!state.publishSelection)return;
 const e=eventById(state.publishSelection.eventId),selected=e&&version(e,Number(ev.target.value));
 if(!selected)return;
 state.publishSelection.version=selected.v;
 $('#publish-summary').innerHTML=publishSummary(e,selected);$('#publish-checks').innerHTML=publicationCheck(e,selected);
 $('#confirm-publish').textContent='v'+selected.v+' 게시 확정';
 $('#confirm-publish').disabled=!publicationChecks(e,selected).every(x=>x.ok);
});

document.addEventListener('submit',ev=>{
 if(ev.target.id==='create-basics'){
  ev.preventDefault();
  if(validateCreation()){ui.creation.step=2;render(true);}
  return;
 }
 if(ev.target.id==='chat-form'){ev.preventDefault();const p=ev.target.querySelector('textarea').value.trim();if(p&&!requestPending())handlePrompt(p);}
});

document.addEventListener('toggle',ev=>{
 if(ui.route!=='editor'||!ev.target.isConnected)return;
 const id=currentEvent().id;
 if(ev.target.id==='manual-edit')ui.manualOpen[id]=ev.target.open;
 if(ev.target.id==='scenario-lab')ui.demoOpen[id]=ev.target.open;
});

document.addEventListener('keydown',ev=>{
 const m=$('#overlay .modal');if(!m)return;
 if(ev.key==='Escape'){closeModal();return;}
 if(ev.key==='Tab'){
  const list=Array.from(m.querySelectorAll('button:not(:disabled),input,select,textarea,a[href]')).filter(el=>el.offsetParent!==null);
  const first=list[0],last=list.at(-1);
  if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last?.focus();}
  if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first?.focus();}
 }
});

document.addEventListener('input',ev=>{
 const key=ev.target.dataset.contentKey;
 if(!key||ui.route!=='editor'||ui.role!=='admin'||requestPending())return;
 const s=currentDraft().snapshot;
 if(key.startsWith('field:')){
  const k=key.slice(6);if(!Object.hasOwn(CONTENT_FIELDS,k))return;s[k]=ev.target.value;
  const other=$('[data-field="'+k+'"]');if(other)other.value=s[k];
 }else{s.contentEdits={...(s.contentEdits||{}),[key]:ev.target.value};}
 updateEditor();
});

document.addEventListener('input',editButton);

async function logout() {
  if (AUTH_ENABLED) await api.logout()
  ui.logged = false
  navigate('login')
  toast('로그아웃했어요.')
}

document.addEventListener('submit', (ev) => {
  if (ev.target.id !== 'login-form') return
  handleLoginSubmit(ev, api, () => {
    ui.logged = true
    toast('로그인했어요.')
    navigate('admin')
  })
})

document.addEventListener('change',editButton);

document.addEventListener('focusin',()=>highlightEditingText(true));

document.addEventListener('focusout',()=>queueMicrotask(()=>highlightEditingText()));

$('#overlay').addEventListener('click', (ev) => {
  if (ev.target.classList.contains('modal-backdrop')) closeModal()
})

window.addEventListener('beforeunload', (ev) => {
  if (!Object.values(ui.requests || {}).some((r) => r.status === 'processing')) return
  ev.preventDefault()
  ev.returnValue = ''
})

ui.role = 'admin'
ui.route = 'admin'

// 서버 인증 사용 여부는 AUTH_ENABLED (@shared/api.js). 꺼져 있으면 목업 로그인 상태로 돈다.

async function start() {
  if (AUTH_ENABLED) {
    // 새로고침으로 메모리 토큰이 비었어도 Refresh 쿠키로 되살린다.
    // 먼저 갱신하고 렌더해야 로그인 화면이 깜빡였다 바뀌지 않는다.
    // 성공하면 boot() 가 만료 전 갱신 폴링까지 시작한다.
    ui.logged = await api.boot()
  } else {
    ui.logged = true
  }
  router.start()
}

start()
