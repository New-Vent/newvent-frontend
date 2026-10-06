/**
 * 템플릿 라이브러리 — 백엔드 PR #133.
 *
 *   목록      GET    /api/admin/template-library?keyword&builtin&includeInactive&page&size
 *   미리보기  GET    /api/admin/template-library/{code}/preview
 *   등록      POST   /api/admin/template-library                  (server-versions.js 에서 부른다)
 *   정보 수정 PATCH  /api/admin/template-library/{code}
 *   비활성화  DELETE /api/admin/template-library/{code}
 *   사용      POST   /api/admin/template-library/{code}/events
 *
 * 공개 범위 — 기본 제공본은 공통, 관리자 등록본은 **등록자만** 본다.
 * 그래서 "내가 등록" 탭에 남의 등록본이 섞이지 않는다 (서버가 404 로 막는다).
 *
 * ★ 검색은 서버가 한다. 그래서 글자마다 요청하지 않고 **입력창 제출(엔터)** 로 찾는다.
 *   (관리자 이벤트 목록은 전부 받아와 화면에서 걸러서 즉시 반응한다 — 여기는 다르다.)
 *
 * ★ 목업 모드(VITE_API_AUTH off)에서도 목록 · 미리보기는 보인다 (mock/library.js).
 *   등록 · 수정 · 비활성화 · 사용은 서버가 있어야 하므로 버튼을 막아 둔다.
 */

import { esc } from '@shared/dom.js'
import { icon } from '@shared/icons.js'
import { GRADES } from '@shared/grades.js'
import { serverFrame } from '@shared/preview/document.js'
import {
  deactivateTemplate, loadTemplateLibrary, loadTemplatePreview, registerTemplate,
  updateTemplate, useTemplate, USE_SERVER,
} from '@shared/repo.js'
import { ui } from '@shared/state.js'
import { button } from '@shared/ui/controls.js'
import { ask, closeModal, modal } from '@shared/ui/modal.js'
import { toast } from '@shared/ui/toast.js'

/** 목록 탭 → 서버 builtin 파라미터. null 은 "전체"(파라미터를 안 보낸다) */
const SCOPES = [
  { key: 'all', label: '전체', builtin: null },
  { key: 'builtin', label: '기본 제공', builtin: true },
  { key: 'mine', label: '내가 등록', builtin: false },
]

const PAGE_SIZE = 12

const SERVER_ONLY = 'disabled title="서버 모드(VITE_API_AUTH=on)에서만 쓸 수 있어요"'
const BUILTIN_FIXED = 'disabled title="기본 제공 템플릿은 변경할 수 없어요"'
const INACTIVE_USE = 'disabled title="비활성 템플릿은 새 이벤트에 고를 수 없어요"'

/** 화면 상태. idle → loading → ready | error */
function lib() {
  return (ui.library ??= {
    status: 'idle', data: null, error: null, busy: false,
    keyword: '', scope: 'all', includeInactive: false, page: 0,
  })
}

const scopeOf = (s) => SCOPES.find((x) => x.key === s.scope) ?? SCOPES[0]

/** 현재 필터로 다시 불러온다. 끝나면 onDone() — 보통 render */
async function loadLibrary(onDone) {
  const s = lib()
  s.status = 'loading'
  try {
    s.data = await loadTemplateLibrary({
      keyword: s.keyword,
      builtin: scopeOf(s).builtin,
      includeInactive: s.includeInactive,
      page: s.page,
      size: PAGE_SIZE,
    })
    s.status = 'ready'
    s.error = null
  } catch (e) {
    s.status = 'error'
    s.error = e?.message || '템플릿을 불러오지 못했어요.'
  }
  onDone?.()
}

/** 아직 안 불렀으면 부른다. 렌더마다 불러도 한 번만 돈다 */
function ensureLibrary(onDone) {
  if (lib().status === 'idle') loadLibrary(onDone)
}

/** 로그아웃 · 템플릿 변경 후 다시 읽게 한다 */
function resetLibrary() {
  ui.library = null
}

/* ───────────────────────── 목록 ───────────────────────── */

function templateCard(t) {
  const mine = !t.builtin
  // 기본 제공본은 서버가 수정 · 비활성화를 403 으로 막는다 (EVENT403-0) — 버튼부터 막아 둔다.
  const manage = !USE_SERVER ? SERVER_ONLY : t.builtin ? BUILTIN_FIXED : ''
  const code = esc(t.templateKey)

  return '<article class="card template-card' + (t.active ? '' : ' inactive') + '">'
    + '<div class="template-card-head"><h3>' + esc(t.name) + '</h3>'
    + '<span class="badge' + (mine ? ' pink' : '') + '">' + (mine ? '내 등록' : '기본 제공') + '</span>'
    + (t.active ? '' : '<span class="badge amber">비활성</span>')
    + '</div>'
    // ★ 수식어를 `empty` 로 쓰면 안 된다 — components.css 의 빈 상태 박스(.empty)가
    //   같이 걸려서 설명 한 줄에 55px 패딩이 붙는다.
    + '<p class="template-card-desc' + (t.description ? '' : ' no-desc') + '">'
    + esc(t.description || '설명이 없어요.') + '</p>'
    + '<small class="template-card-key">' + code + '</small>'
    + '<div class="row template-card-actions">'
    + button('template-preview', '미리보기', 'data-code="' + code + '"', 'btn sm')
    + button('template-use', '이 템플릿으로 만들기',
        'data-code="' + code + '" ' + (!USE_SERVER ? SERVER_ONLY : t.active ? '' : INACTIVE_USE),
        'btn sm primary')
    + button('template-edit', '정보 수정', 'data-code="' + code + '" ' + manage, 'btn sm soft')
    + button('template-deactivate', '비활성화', 'data-code="' + code + '" '
        + (manage || (t.active ? '' : 'disabled title="이미 비활성이에요"')), 'btn sm ghost')
    + '</div></article>'
}

function pager(page, totalPages) {
  if (totalPages <= 1) return ''
  const nums = Array.from({ length: totalPages }, (_, i) => i)
    .map((n) => button('library-page', String(n + 1),
      `data-page="${n}" aria-current="${n === page}"`,
      'btn sm ' + (n === page ? 'primary' : 'ghost')))
    .join('')
  return '<div class="admin-pager">'
    + button('library-page', '이전', `data-page="${page - 1}"${page === 0 ? ' disabled' : ''}`, 'btn sm ghost')
    + nums
    + button('library-page', '다음', `data-page="${page + 1}"${page >= totalPages - 1 ? ' disabled' : ''}`, 'btn sm ghost')
    + '</div>'
}

function grid() {
  const s = lib()
  if (s.status === 'idle' || s.status === 'loading') {
    return '<div class="empty"><strong>템플릿을 불러오고 있어요</strong></div>'
  }
  if (s.status === 'error') {
    return '<div class="empty"><strong>템플릿을 불러오지 못했어요</strong><p>' + esc(s.error) + '</p>'
      + button('library-reload', '다시 불러오기', '', 'btn sm') + '</div>'
  }
  const items = s.data?.content || []
  if (!items.length) {
    const mine = s.scope === 'mine'
    return '<div class="empty">' + icon('grid')
      + '<strong>' + (s.keyword ? '검색 결과가 없어요' : mine ? '등록한 템플릿이 없어요' : '템플릿이 없어요') + '</strong>'
      + '<p>' + (mine
        ? '이벤트 편집 화면에서 버전을 저장한 뒤, 버전 이력에서 "템플릿으로 등록"을 눌러보세요.'
        : '검색어를 바꿔보세요.') + '</p></div>'
  }
  return '<div class="template-library-grid">' + items.map(templateCard).join('') + '</div>'
}

function templatesView() {
  const s = lib()
  const d = s.data

  const tabs = SCOPES.map((x) =>
    button('library-scope', x.label, `data-scope="${x.key}" aria-pressed="${s.scope === x.key}"`,
      s.scope === x.key ? 'active' : '')).join('')

  // 비활성 포함은 등록본에만 의미가 있다 — 기본 제공본은 비활성화할 수 없다.
  const inactiveToggle = s.scope === 'builtin' ? '' :
    '<label class="template-inactive-toggle"><input type="checkbox" id="library-inactive"'
    + (s.includeInactive ? ' checked' : '') + '> 비활성 템플릿도 보기</label>'

  return '<div class="container">'
    + '<div class="page-heading spread"><div><span class="eyebrow">TEMPLATE LIBRARY</span>'
    + '<h1>템플릿 라이브러리</h1>'
    + '<p>저장한 디자인을 템플릿으로 두고, 새 이벤트를 바로 시작하세요.</p></div>'
    + button('new', '새 이벤트 만들기 ' + icon('sparkle'), '', 'btn primary')
    + '</div>'
    + '<section class="admin-list-section">'
    + '<div class="section-title spread"><div class="admin-list-tabs">' + tabs + '</div>'
    + '<form id="library-search-form" class="search" role="search">' + icon('search')
    + '<input id="library-search" aria-label="템플릿 검색" placeholder="템플릿 이름 검색 후 엔터" '
    + 'maxlength="100" value="' + esc(s.keyword) + '"></form></div>'
    + inactiveToggle
    + '<p class="admin-result-count">'
    + (s.status === 'ready' ? (d?.totalElements ?? 0) + '개 템플릿' : '불러오는 중…') + '</p>'
    + grid()
    + (s.status === 'ready' ? pager(d?.page ?? 0, d?.totalPages ?? 1) : '')
    + '<p class="review-note">템플릿은 <strong>본인 이벤트의 저장된 버전</strong>으로만 등록해요. '
    + '외부 HTML 이나 파일 업로드는 받지 않습니다. 비활성화해도 그 템플릿으로 이미 만든 이벤트는 그대로예요.</p>'
    + '</section></div>'
}

/* ───────────────────────── 미리보기 ───────────────────────── */

async function openPreview(code) {
  const s = lib()
  const t = (s.data?.content || []).find((x) => x.templateKey === code)
  try {
    const p = await loadTemplatePreview(code)
    modal((t?.name || code) + ' · 템플릿 미리보기',
      '<p class="helper">읽기 전용 · 기간과 참여 링크는 비어 있어요. 이벤트를 만들면 채워집니다.</p>'
      + '<div class="version-preview-frame">' + serverFrame(p.html, (t?.name || code) + ' 미리보기') + '</div>',
      button('close', '닫기', '', 'btn primary'), true)
    document.querySelector('#overlay .modal')?.classList.add('version-preview-modal')
  } catch (e) {
    toast(e?.message || '템플릿 미리보기를 불러오지 못했어요.')
  }
}

/* ───────────────────────── 정보 수정 ───────────────────────── */

function openEdit(code) {
  const t = (lib().data?.content || []).find((x) => x.templateKey === code)
  if (!t) return
  modal('템플릿 정보 수정',
    '<form id="library-edit-form" class="fields" novalidate data-code="' + esc(code) + '">'
    + '<label class="field">템플릿 이름<input name="name" maxlength="100" required value="' + esc(t.name) + '"></label>'
    + '<label class="field">설명 <span class="helper">비우면 설명이 지워져요.</span>'
    + '<textarea name="description" maxlength="255" rows="3">' + esc(t.description || '') + '</textarea></label>'
    + '<p class="create-error" role="alert"></p>'
    + '<div class="modal-actions">' + button('close', '취소')
    + '<button type="submit" class="btn primary">저장하기</button></div></form>')
}

/* ───────────────────────── 저장된 버전을 템플릿으로 등록 ───────────────────────── */

/**
 * 버전 이력(server-versions.js)에서 부른다.
 * 등록은 **저장된 버전 ID** 로만 한다 — 외부 HTML · 업로드는 받지 않는다.
 */
function openRegister({ eventId, versionId, versionNo, eventName }) {
  modal('v' + versionNo + ' 을 템플릿으로 등록',
    '<form id="library-register-form" class="fields" novalidate '
    + 'data-event="' + esc(String(eventId)) + '" data-version="' + esc(String(versionId)) + '">'
    + '<p class="helper">이 버전의 HTML 을 따로 복사해 보관해요. 원본 이벤트를 고치거나 지워도 등록본은 남습니다. '
    + '기간과 참여 링크는 비워서 저장돼요.</p>'
    + '<label class="field">템플릿 이름 <span class="helper">라이브러리 목록에 보이는 이름이에요.</span>'
    + '<input name="name" maxlength="100" required value="' + esc(eventName || '') + '"></label>'
    + '<label class="field">설명 <span class="helper">선택 · 255자까지</span>'
    + '<textarea name="description" maxlength="255" rows="3" placeholder="예: 가을 프로모션에 쓴 디자인"></textarea></label>'
    + '<p class="create-error" role="alert"></p>'
    + '<div class="modal-actions">' + button('close', '취소')
    + '<button type="submit" class="btn primary">템플릿으로 등록</button></div></form>')
}

async function submitRegister(form) {
  const name = form.elements.name.value.trim()
  if (!name) return formError(form, '템플릿 이름을 입력해주세요.')

  const unlock = lockForm(form, '등록 중…')
  try {
    await registerTemplate({
      eventId: Number(form.dataset.event),
      sourceVersionId: Number(form.dataset.version),
      name,
      description: form.elements.description.value.trim() || null,
    })
    closeModal()
    // 목록은 다음에 라이브러리 화면에 들어갈 때 다시 읽는다.
    resetLibrary()
    toast('템플릿 라이브러리에 등록했어요.')
  } catch (e) {
    unlock()
    formError(form, e?.message || '템플릿으로 등록하지 못했어요.')
  }
}

/* ───────────────────────── 이 템플릿으로 만들기 ───────────────────────── */

/** 오늘 + n일 (KST) → 'YYYY-MM-DD'. 기간 입력 기본값으로 쓴다 */
const ymd = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' })
const dayFromNow = (n) => ymd.format(new Date(Date.now() + n * 86400000))

function openUse(code) {
  const t = (lib().data?.content || []).find((x) => x.templateKey === code)
  if (!t) return
  modal(esc(t.name) + ' 템플릿으로 시작',
    '<form id="library-use-form" class="fields" novalidate data-code="' + esc(code) + '">'
    + '<p class="helper">템플릿 디자인을 그대로 복사해 초안(DRAFT)을 만들어요. AI 를 부르지 않고, 게시도 하지 않습니다.</p>'
    + '<label class="field">이벤트명 <span class="helper">관리 목록에서 쓰는 이름이에요. 페이지 안의 제목 문구는 편집 화면에서 고칩니다.</span>'
    + '<input name="name" maxlength="100" required placeholder="예: 가을맞이 응원 이벤트"></label>'
    + '<div class="field-pair">'
    + '<label class="field">시작일<input name="start" type="date" required value="' + dayFromNow(0) + '"></label>'
    + '<label class="field">종료일<input name="end" type="date" required value="' + dayFromNow(14) + '"></label></div>'
    + '<label class="field">참여 대상<select name="grade">'
    + GRADES.map((g) => '<option value="' + g.code + '">' + esc(g.label) + ' · ' + esc(g.desc) + '</option>').join('')
    + '</select></label>'
    + '<p class="create-error" role="alert"></p>'
    + '<div class="modal-actions">' + button('close', '취소')
    + '<button type="submit" class="btn primary">이 템플릿으로 만들기</button></div></form>')
}

/* ───────────────────────── 제출 · 클릭 ───────────────────────── */

const formError = (form, text) => {
  const el = form.querySelector('.create-error')
  if (el) el.textContent = text
  return false
}

/** 제출 중에는 버튼을 막는다 — 두 번 눌러 이벤트가 두 개 생기지 않게 */
function lockForm(form, label) {
  const btn = form.querySelector('button[type="submit"]')
  const was = btn?.textContent
  if (btn) { btn.disabled = true; btn.textContent = label }
  return () => { if (btn) { btn.disabled = false; btn.textContent = was } }
}

async function submitEdit(form, rerender) {
  const code = form.dataset.code
  const name = form.elements.name.value.trim()
  if (!name) return formError(form, '템플릿 이름을 입력해주세요.')

  const unlock = lockForm(form, '저장 중…')
  try {
    await updateTemplate(code, { name, description: form.elements.description.value.trim() || null })
    closeModal()
    toast('템플릿 정보를 바꿨어요.')
    loadLibrary(rerender)
  } catch (e) {
    unlock()
    formError(form, e?.message || '템플릿 정보를 바꾸지 못했어요.')
  }
}

/**
 * 템플릿으로 이벤트 만들기 → 성공하면 편집 화면으로 간다.
 * ★ 첫 버전이 같은 트랜잭션에서 만들어지므로 generate 를 따로 부르지 않는다.
 */
async function submitUse(form, { rerender, openEditor }) {
  const code = form.dataset.code
  const name = form.elements.name.value.trim()
  const start = form.elements.start.value
  const end = form.elements.end.value

  if (!name) return formError(form, '이벤트명을 입력해주세요.')
  if (!start || !end) return formError(form, '시작일과 종료일을 입력해주세요.')
  if (start > end) return formError(form, '종료일은 시작일보다 빠를 수 없어요.')

  const unlock = lockForm(form, '만드는 중…')
  try {
    // 기간은 날짜만 받으므로 KST 하루의 시작 · 끝으로 보낸다 (create.js 와 같은 규칙).
    const made = await useTemplate(code, {
      name,
      startAt: start + 'T00:00:00+09:00',
      endAt: end + 'T23:59:59+09:00',
      grade: form.elements.grade.value,
    })
    closeModal()
    toast('템플릿을 복사해 v' + made.versionNo + ' 초안을 만들었어요.')
    openEditor(made.eventId)
  } catch (e) {
    unlock()
    formError(form, e?.message || '이벤트를 만들지 못했어요.')
  }
}

/**
 * 검색 후에도 입력창에 커서를 둔다 — 렌더가 입력창을 새로 그리기 때문이다.
 * ★ 사용자가 다른 조작으로 옮겨 갔으면 가져오지 않는다 (body 로 풀렸을 때만 되돌린다).
 */
function keepSearchFocus() {
  const el = document.querySelector('#library-search')
  if (!el || document.activeElement === el) return
  if (document.activeElement && document.activeElement !== document.body) return
  el.focus()
  try { el.setSelectionRange(el.value.length, el.value.length) } catch {}
}

/** main.js 의 submit 위임에서 부른다. 처리했으면 true */
function handleLibrarySubmit(ev, { rerender, openEditor }) {
  if (ev.target.id === 'library-search-form') {
    ev.preventDefault()
    const s = lib()
    s.keyword = document.querySelector('#library-search')?.value ?? ''
    s.page = 0
    const draw = () => { rerender(); keepSearchFocus() }
    loadLibrary(draw)
    draw()
    return true
  }
  if (ev.target.id === 'library-edit-form') {
    ev.preventDefault()
    submitEdit(ev.target, rerender)
    return true
  }
  if (ev.target.id === 'library-use-form') {
    ev.preventDefault()
    submitUse(ev.target, { rerender, openEditor })
    return true
  }
  // 버전 이력에서 연 등록 폼 — 라이브러리 화면이 아니어도 온다
  if (ev.target.id === 'library-register-form') {
    ev.preventDefault()
    submitRegister(ev.target)
    return true
  }
  return false
}

/** main.js 의 change 위임에서 부른다. 처리했으면 true */
function handleLibraryChange(ev, rerender) {
  if (ev.target.id !== 'library-inactive') return false
  const s = lib()
  s.includeInactive = ev.target.checked
  s.page = 0
  loadLibrary(rerender)
  rerender()
  return true
}

/** main.js 의 click 위임에서 부른다. 처리했으면 true */
function handleLibraryClick(a, b, rerender) {
  const s = lib()
  const code = b.dataset.code
  switch (a) {
    case 'library-reload': loadLibrary(rerender); rerender(); return true
    case 'library-scope':
      s.scope = b.dataset.scope
      s.page = 0
      // 기본 제공 탭에서는 "비활성 포함" 이 의미가 없다 — 끄고 간다.
      if (s.scope === 'builtin') s.includeInactive = false
      loadLibrary(rerender)
      rerender()
      return true
    case 'library-page':
      s.page = Number(b.dataset.page)
      loadLibrary(rerender)
      rerender()
      return true
    case 'template-preview': openPreview(code); return true
    case 'template-edit': openEdit(code); return true
    case 'template-use': openUse(code); return true
    case 'template-deactivate': {
      const t = (s.data?.content || []).find((x) => x.templateKey === code)
      ask('템플릿을 비활성화할까요?',
        (t?.name || code) + ' 템플릿을 새 이벤트에서 고를 수 없게 합니다. 이미 이 템플릿으로 만든 이벤트와 게시 상태는 그대로예요. 지우는 것은 아니라서 "비활성 템플릿도 보기"로 다시 찾을 수 있어요.',
        async () => {
          try {
            await deactivateTemplate(code)
            toast('템플릿을 비활성화했어요.')
          } catch (e) {
            toast(e?.message || '비활성화하지 못했어요.')
          }
          loadLibrary(rerender)
        }, '비활성화')
      return true
    }
  }
  return false
}

export {
  templatesView, ensureLibrary, loadLibrary, resetLibrary, openRegister,
  handleLibraryClick, handleLibrarySubmit, handleLibraryChange,
}
