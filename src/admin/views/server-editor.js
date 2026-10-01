/**
 * 편집 화면 — 서버 모드 (VITE_API_AUTH=on).
 *
 *   이벤트 정보   GET  /api/admin/events/{id}
 *   페이지 생성   POST /api/admin/events/{id}/generate      ┐ 같은 작업 자리 — GET …/generate/{jobId} 로 폴링,
 *   AI 대화 수정  POST /api/admin/events/{id}/edit          ┘ DELETE 로 중단
 *   직접 수정     POST /api/admin/events/{id}/versions/direct-edit  (바로 새 버전)
 *   미리보기      GET  /api/admin/events/{id}/preview       (최신 버전 + editableTexts)
 *   버전 저장     PUT  /api/admin/events/{id}/versions/{versionId}/checkpoint
 *   저장한 버전   GET  /api/admin/events/{id}/versions      (버전 이력 화면은 server-versions.js)
 *   게시 · 재게시 POST /api/admin/events/{id}/publish { versionId }
 *
 * ★ 버전 두 가지
 *   생성 · 수정이 성공할 때마다 서버에 버전 행이 하나씩 생긴다 (자동). 이력에는 안 나온다.
 *   "버전 저장" 을 누른 버전만 이력(체크포인트)에 남는다 — 무한히 쌓이는 건 자동 버전뿐이다.
 *
 * ★ 수정 기준은 항상 최신 버전이다 (AI 수정 · 직접 수정 모두)
 *   이전 버전에서 이어 가려면 이력 화면의 "이 버전에서 이어서 작업" 이 그 버전을 최신으로 가져온다.
 *
 * ★ AI 대화 내역은 서버에 남지 않는다 (백엔드 ChatMessage 저장 미구현) — 이 탭이 열려 있는 동안만 보인다
 *
 * ★ 목업 편집 화면(editor.js)을 쓰지 않는 이유
 *   그 화면은 목업 스냅샷(제목 · 소개 · 혜택 제목 · 버튼 필드)으로 그리고 고친다.
 *   서버는 완성된 HTML 조각을 준다.
 *
 * ★ 폴링 중에는 진행 표시(#server-progress)만 다시 그린다 — 전체를 그리면 미리보기 iframe 이 매초 다시 뜬다
 * ★ 직접 수정 입력은 다시 그리지 않고 미리보기 iframe 의 글자만 바꾼다 (포커스 유지 · 즉시 확인)
 */

import { BLOCK_LABELS } from '@shared/constants.js'
import { $, esc } from '@shared/dom.js'
import { badgeOf, serverStatus } from '@shared/format.js'
import { gradeLabel, REQUEST_MAX } from '@shared/grades.js'
import { icon } from '@shared/icons.js'
import { serverFrame } from '@shared/preview/document.js'
import { collectTexts, matches, normalize, textsOf } from '@shared/preview/server-texts.js'
import {
  cancelGeneration, directEdit, generationStatus, loadAdminEvent, loadPreview, loadVersions,
  publishEvent, saveCheckpoint, startEdit, startGenerate,
} from '@shared/repo.js'
import { ui } from '@shared/state.js'
import { button } from '@shared/ui/controls.js'
import { closeModal, modal } from '@shared/ui/modal.js'

import { resetAdminServer } from './list.js'
import { toast } from '@shared/ui/toast.js'

const POLL_MS = 1000

/** AI 대화 — 이벤트별. 편집 화면을 다시 열어도 탭이 살아 있는 동안은 남는다 */
const CHATS = {}
const GREETING = '어떻게 고쳐볼까요? 예: "제목을 가을 대축제로 바꿔줘", "혜택에 카페 쿠폰을 추가해줘". '
  + '요청 한 번이 새 버전 하나가 되고, 남기고 싶은 버전은 "버전 저장" 으로 이력에 올려요.'
const chatOf = (id) => (CHATS[id] ||= [{ role: 'assistant', text: GREETING }])

const freshDirect = () => ({ values: {}, style: {}, styleOn: {} })

/** 새로 만든 직후처럼 진행 중인 작업을 들고 들어올 때 — 목록에서 열 때는 인자 없이 */
function openServerEditor(id, { jobId = null, request = null, startError = null } = {}) {
  ui.serverEditor = {
    id: String(id),
    status: 'idle',                    // idle → loading → ready | error
    event: null,
    preview: null,
    versions: null,                    // 저장한 버전 목록 (못 불러 오면 null)
    job: jobId ? { jobId, kind: 'generate', phase: 'QUEUED', label: '대기 중', percent: 0, done: false } : null,
    request,                           // 이번에 보낸 생성 요청문 (AI 생성)
    prompt: request || '',             // 다시 만들기 입력칸
    chatInput: '',
    tab: 'chat',                       // chat | direct
    selected: [],                      // AI 대화 — 미리보기에서 고른 영역(data-block). 최대 MAX_SELECTED
    direct: freshDirect(),
    busy: false,                       // 직접 수정 적용 · 버전 저장 중
    notice: startError,                // 생성 시작 실패 문구
    error: null,
    polling: false,
  }
}

/** 렌더마다 부른다. 처음이면 불러 오고, 진행 중인 작업이 있으면 폴링을 이어 간다 */
function ensureServerEditor(id, rerender) {
  if (!ui.serverEditor || ui.serverEditor.id !== String(id)) openServerEditor(id)
  const s = ui.serverEditor
  if (s.status === 'idle') load(s, rerender)
  else if (s.status === 'ready' && s.job && !s.job.done && !s.polling) poll(s, rerender)
}

async function load(s, rerender) {
  s.status = 'loading'
  try {
    const [event, preview, versions] = await Promise.all([
      loadAdminEvent(s.id), loadPreview(s.id), loadVersions(s.id).catch(() => null),
    ])
    Object.assign(s, { event, preview, versions: versions?.versions ?? null, status: 'ready', error: null })
  } catch (e) {
    Object.assign(s, { status: 'error', error: e?.message || '이벤트를 불러오지 못했어요.' })
  }
  rerender()
  if (s.status === 'ready' && s.job && !s.job.done) poll(s, rerender)
}

/** 새 버전이 생긴 뒤 — 미리보기와 저장한 버전 목록을 다시 읽는다. 고치던 직접 수정 값은 버린다 */
async function refreshPage(s) {
  const [preview, versions] = await Promise.all([loadPreview(s.id), loadVersions(s.id).catch(() => null)])
  s.preview = preview
  if (versions) s.versions = versions.versions
  s.direct = freshDirect()
  // ★ 고른 영역은 남긴다 — 같은 영역을 이어서 다듬는 경우가 많다. 새 버전에서 사라진 영역만 뺀다
  s.selected = s.selected.filter((k) => preview?.html?.includes('data-block="' + k + '"'))
}

/* ───────────────────────── AI 대화 — 영역 고르기 ───────────────────────── */

/** 서버 EditRequest 의 @Size(max = 4) 와 같다 */
const MAX_SELECTED = 4

/** 고른 영역을 Block 선언 순서로 — 칩 · 요청 본문이 늘 같은 순서로 보이게 */
const BLOCK_ORDER = Object.keys(BLOCK_LABELS)
const ordered = (keys) => [...keys].sort((a, b) => BLOCK_ORDER.indexOf(a) - BLOCK_ORDER.indexOf(b))

const labelOf = (k) => BLOCK_LABELS[k] || k

function selectionHTML(s, busy) {
  // 비어 있어도 "어디를 고치는지"를 늘 보여 준다 — 범위를 좁힐 수 있다는 걸 여기서 알게 된다
  if (!s.selected.length) {
    return '<div class="sel-row"><span class="sel-label">고칠 곳</span><span class="sel-chip all">페이지 전체</span></div>'
      + '<p class="helper sel-hint">' + icon('sparkle') + '오른쪽 미리보기에서 영역을 누르면 그 부분만 고쳐요 (최대 ' + MAX_SELECTED + '개)</p>'
  }
  return '<div class="sel-row"><span class="sel-label">고칠 곳</span>'
    + s.selected.map((k) => '<span class="sel-chip">' + esc(labelOf(k))
      + button('server-unselect', '×', 'data-block="' + esc(k) + '" aria-label="' + esc(labelOf(k)) + ' 선택 해제" ' + (busy ? 'disabled' : ''), 'sel-x')
      + '</span>').join('')
    + button('server-unselect-all', '전체 해제', busy ? 'disabled' : '', 'sel-clear') + '</div>'
    + '<p class="helper sel-hint">고른 영역 밖은 바뀌지 않아요</p>'
}

/** 입력칸 안내도 고른 영역을 따라간다 */
const chatPlaceholder = (s) => (s.selected.length
  ? s.selected.map(labelOf).join(' · ') + '을(를) 어떻게 바꿀까요? 예: 더 눈에 띄게'
  : '예: 제목을 가을 대축제로 바꿔줘')

/** 다시 그리지 않고 칩 · 미리보기 외곽선만 고친다 — iframe 을 새로 띄우면 깜빡인다 */
function paintSelection(s) {
  const box = $('#server-selection')
  if (box) box.innerHTML = selectionHTML(s, running(s))
  const input = $('#server-chat')
  if (input) input.placeholder = chatPlaceholder(s)
  const doc = $('.event-frame')?.contentDocument
  doc?.querySelectorAll('[data-block]').forEach((n) => n.classList.toggle('newvent-selected', s.selected.includes(n.dataset.block)))
}

function toggleBlock(s, key) {
  if (key === 'notices') { toast('유의사항은 승인된 문구라 고칠 수 없어요.'); return }
  if (s.selected.includes(key)) s.selected = s.selected.filter((k) => k !== key)
  else if (s.selected.length >= MAX_SELECTED) { toast('영역은 ' + MAX_SELECTED + '개까지 고를 수 있어요.'); return }
  else s.selected = ordered([...s.selected, key])
  paintSelection(s)
}

/** 미리보기에서 누른 영역 — frame.js 의 server-select 모드가 보낸다 */
function handleServerBlock(ev) {
  const s = ui.serverEditor
  if (!s || s.tab !== 'chat' || running(s)) return
  const key = ev.detail?.block
  if (key) toggleBlock(s, key)
}

const alive = (s) => ui.serverEditor === s && ['editor', 'versions'].includes(ui.route)

async function poll(s, rerender) {
  if (s.polling) return
  s.polling = true
  const { jobId, kind } = s.job
  while (alive(s) && s.job && s.job.jobId === jobId && !s.job.done) {
    await new Promise((r) => setTimeout(r, POLL_MS))
    if (!alive(s)) break
    try {
      s.job = { ...s.job, ...(await generationStatus(s.id, jobId)) }
    } catch (e) {
      // ★ 작업 기록은 서버 메모리에만 있다 — 서버가 다시 떴으면 404 다
      s.job = { ...s.job, done: true, phase: 'FAILED', message: e?.message || '진행 상태를 확인하지 못했어요.' }
    }
    const el = $('#server-progress')
    if (el) el.innerHTML = progressHTML(s)
  }
  s.polling = false
  if (ui.serverEditor !== s || !s.job?.done) return
  if (s.job.phase === 'DONE') {
    try { await refreshPage(s) } catch { /* 미리보기는 다시 열 때 읽는다 */ }
  }
  if (kind === 'edit') chatOf(s.id).push({ role: 'assistant', tone: s.job.phase, text: editReply(s) })
  else if (s.job.phase === 'DONE' && s.preview) toast('v' + s.preview.versionNo + ' 로 만들었어요.')
  rerender()
}

function editReply(s) {
  const j = s.job
  if (j.phase === 'DONE') return (s.preview ? 'v' + s.preview.versionNo + ' 로 반영했어요. ' : '반영했어요. ') + '미리보기에서 확인해주세요.'
  if (j.phase === 'CANCELLED') return '요청을 중단했어요. 페이지는 그대로예요.'
  return j.message || (j.phase === 'ASK_BACK' ? '어느 부분을 어떻게 바꿀지 알려주세요.' : '요청을 반영하지 못했어요.')
}

const running = (s) => !!(s?.job && !s.job.done)

/** 다시 만들기 — 템플릿 이벤트는 {}, 아니면 입력한 요청문으로 */
async function regenerate(rerender) {
  const s = ui.serverEditor
  if (!s?.event || running(s)) return
  const template = !!s.event.template
  const text = (s.prompt || '').trim()
  if (!template && !text) { s.notice = '만들고 싶은 이벤트를 설명해주세요.'; rerender(); return }
  if (text.length > REQUEST_MAX) { s.notice = '요청은 ' + REQUEST_MAX + '자 이내로 입력해주세요.'; rerender(); return }
  s.notice = null
  try {
    const r = await startGenerate(s.id, template ? {} : { requestText: text })
    s.request = template ? null : text
    s.job = { jobId: r.jobId, kind: 'generate', phase: r.phase, label: '대기 중', percent: r.percent ?? 0, done: false }
  } catch (e) {
    s.notice = e?.message || '페이지 생성을 시작하지 못했어요.'
  }
  rerender()
  if (running(s)) poll(s, rerender)
}

/** AI 대화 — 요청 한 번 = 작업 하나. 결과는 폴링이 끝나면 대화에 붙는다 */
async function sendChat(text, rerender) {
  const s = ui.serverEditor
  if (!s?.preview || running(s)) return
  const request = (text ?? s.chatInput ?? '').trim()
  if (!request) return
  if (request.length > REQUEST_MAX) { toast('요청은 ' + REQUEST_MAX + '자 이내로 입력해주세요.'); return }
  const chat = chatOf(s.id)
  const blocks = [...s.selected]
  // 고른 영역을 말풍선에 남긴다 — 대화를 다시 볼 때 무엇을 고쳤는지 보이게
  chat.push({ role: 'user', text: request, blocks })
  s.chatInput = ''
  s.notice = null
  try {
    const r = await startEdit(s.id, request, blocks)
    s.job = { jobId: r.jobId, kind: 'edit', phase: r.phase, label: '대기 중', percent: r.percent ?? 0, done: false }
  } catch (e) {
    chat.push({ role: 'assistant', tone: 'FAILED', text: e?.message || '요청을 보내지 못했어요.' })
    s.chatInput = request
  }
  rerender()
  if (running(s)) poll(s, rerender)
}

async function cancel() {
  const s = ui.serverEditor
  if (!running(s)) return
  try { await cancelGeneration(s.id, s.job.jobId) } catch { /* 이미 끝났을 수 있다 — 폴링이 결과를 보여준다 */ }
  const el = $('#server-progress')
  if (el) el.innerHTML = progressHTML(s, '중단을 요청했어요. 진행 중인 단계가 끝나면 멈춥니다.')
}

/* ───────────────────────── 직접 수정 ───────────────────────── */

const editable = (s) => s.preview?.editableTexts || []

/** 바뀐 문구 · 버튼 스타일만 모아 요청 본문으로 */
function directChanges(s) {
  const list = editable(s)
  const edits = Object.entries(s.direct.values)
    .map(([i, v]) => ({ index: Number(i), before: list[i]?.before, after: v }))
    .filter((x) => x.before !== undefined && normalize(x.after) !== normalize(x.before))
  const st = s.direct.style, on = s.direct.styleOn
  const style = {}
  if (on.background && st.background) style.background = st.background
  if (on.color && st.color) style.color = st.color
  if (st.size) style.size = st.size
  if (st.shape) style.shape = st.shape
  return { edits, buttonStyle: Object.keys(style).length ? style : null }
}

async function applyDirect(rerender) {
  const s = ui.serverEditor
  if (!s?.preview || running(s) || s.busy) return
  const { edits, buttonStyle } = directChanges(s)
  if (!edits.length && !buttonStyle) { toast('바꾼 내용이 없어요.'); return }
  if (edits.some((x) => !x.after.trim())) { toast('빈 문구로는 바꿀 수 없어요.'); return }
  s.busy = true
  rerender()
  try {
    const r = await directEdit(s.id, {
      sourceVersionId: s.preview.versionId,
      ...(edits.length ? { edits } : {}),
      ...(buttonStyle ? { buttonStyle } : {}),
    })
    await refreshPage(s)
    toast('v' + r.versionNo + ' 로 반영했어요. 이력에 남기려면 버전 저장을 눌러주세요.')
  } catch (e) {
    toast(e?.message || '직접 수정을 반영하지 못했어요.')
  } finally {
    s.busy = false
    rerender()
  }
}

function resetDirect(rerender) {
  const s = ui.serverEditor
  if (!s) return
  s.direct = freshDirect()
  rerender()
}

/** 미리보기 iframe 의 문구 노드 — 템플릿 스크립트가 글자를 바꿀 수 있어 개수만 맞춰 본다 */
function liveTexts(s) {
  const doc = $('.event-frame')?.contentDocument
  const list = doc ? collectTexts(doc.body) : []
  return list.length === editable(s).length ? list : null
}

function highlight(s, index, scroll) {
  const live = liveTexts(s)
  const doc = $('.event-frame')?.contentDocument
  doc?.querySelectorAll('.nv-text-active').forEach((n) => n.classList.remove('nv-text-active'))
  const el = index == null ? null : live?.[index]?.node.parentElement
  if (!el) return
  el.classList.add('nv-text-active')
  if (scroll) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

const CTA_SIZE = {
  small: { 'font-size': '14px', padding: '10px 20px', 'min-height': '40px' },
  medium: { 'font-size': '18px', padding: '16px 28px', 'min-height': '52px' },
  large: { 'font-size': '22px', padding: '22px 32px', 'min-height': '64px' },
}
const CTA_SHAPE = { square: '0', round: '12px', pill: '999px' }

/** 버튼 스타일을 미리보기에 바로 — 서버 DirectEditor.applyButtonStyle 과 같은 값 */
function previewButtonStyle(s) {
  const cta = $('.event-frame')?.contentDocument?.querySelector('[data-slot="cta-link"]')
  if (!cta) return
  if (cta.dataset.nvBaseStyle === undefined) cta.dataset.nvBaseStyle = cta.getAttribute('style') || ''
  cta.setAttribute('style', cta.dataset.nvBaseStyle)
  const { buttonStyle } = directChanges(s)
  if (!buttonStyle) return
  if (buttonStyle.background) cta.style.setProperty('background', buttonStyle.background)
  if (buttonStyle.color) cta.style.setProperty('color', buttonStyle.color)
  Object.entries(CTA_SIZE[buttonStyle.size] || {}).forEach(([k, v]) => cta.style.setProperty(k, v))
  if (buttonStyle.shape) cta.style.setProperty('border-radius', CTA_SHAPE[buttonStyle.shape])
}

function updateDirectCount(s) {
  const { edits, buttonStyle } = directChanges(s)
  const n = edits.length + (buttonStyle ? 1 : 0)
  const el = $('#server-direct-count')
  if (el) el.textContent = n ? '바꾼 항목 ' + n + '개' : '바꾼 항목 없음'
  const apply = $('[data-act="server-direct-apply"]')
  if (apply) apply.disabled = !n || running(s) || s.busy
}

/* ───────────────────────── 버전 저장 ───────────────────────── */

const savedIds = (s) => new Set((s.versions || []).map((v) => v.versionId))
const isSaved = (s) => !!s.preview && savedIds(s).has(s.preview.versionId)

async function saveCurrent(rerender) {
  const s = ui.serverEditor
  if (!s?.preview || running(s) || s.busy || isSaved(s)) return
  s.busy = true
  rerender()
  try {
    await saveCheckpoint(s.id, s.preview.versionId)
    s.versions = (await loadVersions(s.id)).versions
    toast('v' + s.preview.versionNo + ' 을 버전 이력에 저장했어요.')
  } catch (e) {
    toast(e?.message || '버전을 저장하지 못했어요.')
  } finally {
    s.busy = false
    rerender()
  }
}

/* ───────────────────────── 게시 ─────────────────────────
 *   POST /api/admin/events/{id}/publish { versionId }
 *   DRAFT → PUBLISHED, 게시 중이면 버전만 바꾼다(재게시). 종료(ENDED)는 서버가 409.
 *   어느 버전이 게시 중인지는 버전 이력의 published 로 안다 (상세 응답에 게시 버전이 없다)
 */

const isEnded = (s) => s.event?.status === 'ENDED'
const isPublished = (s) => s.event?.status === 'PUBLISHED'
const publishedVersion = (s) => (s.versions || []).find((v) => v.published)

/** 고를 수 있는 버전 — 최신(이력에 저장 전일 수 있다)을 맨 위에, 그 아래 저장한 버전 */
function publishChoices(s) {
  const saved = s.versions || []
  const list = []
  if (s.preview) {
    const row = saved.find((v) => v.versionId === s.preview.versionId)
    list.push({ versionId: s.preview.versionId, versionNo: s.preview.versionNo, latest: true, saved: !!row, published: !!row?.published })
  }
  saved.forEach((v) => {
    if (v.versionId !== s.preview?.versionId) list.push({ versionId: v.versionId, versionNo: v.versionNo, latest: false, saved: true, published: v.published })
  })
  return list
}

const choiceLabel = (c) => 'v' + c.versionNo + (c.latest ? ' · 최신' : '') + (c.published ? ' · 게시 중' : '') + (c.saved ? '' : ' · 이력에 저장 전')

function publishSummary(s, c) {
  const e = s.event
  const cur = publishedVersion(s)
  return '<div class="publish-card"><strong>' + esc(e.name) + '</strong><br>'
    + dotted(e.startAt) + ' ~ ' + dotted(e.endAt) + ' · ' + esc(gradeLabel(e.grade)) + '<br>'
    + (cur ? '현재 게시 v' + cur.versionNo + ' → ' : '미게시 → ') + '선택 v' + c.versionNo + '</div>'
    + (c.published ? '<p class="review-note">이미 게시 중인 버전이에요. 다른 버전을 골라주세요.</p>' : '')
    + (c.saved ? '' : '<p class="review-note">이 버전은 이력에 저장 전이에요. 게시하면 버전 이력에도 저장돼요.</p>')
}

const confirmLabel = (s, c) => 'v' + c.versionNo + ' ' + (isPublished(s) ? '재게시' : '게시') + ' 확정'

/** 게시 창 — versionId 를 주면 그 버전을 골라 둔다 (버전 이력 화면의 "게시하기") */
function openPublish(versionId) {
  const s = ui.serverEditor
  if (!s?.preview || running(s) || s.busy) return
  if (isEnded(s)) { toast('종료된 이벤트는 게시할 수 없어요.'); return }
  const choices = publishChoices(s)
  const pick = choices.find((c) => c.versionId === versionId) || choices[0]
  s.publishPick = pick.versionId
  modal(isPublished(s) ? '재게시할 버전을 선택해주세요' : '게시할 버전을 선택해주세요',
    '<p>선택한 버전이 사용자 화면에 보여요.</p>'
    + '<label class="field" style="margin-top:20px">게시할 버전<select id="server-publish-version">'
    + choices.map((c) => '<option value="' + c.versionId + '" ' + (c.versionId === pick.versionId ? 'selected' : '') + '>' + esc(choiceLabel(c)) + '</option>').join('')
    + '</select></label><div id="server-publish-summary">' + publishSummary(s, pick) + '</div>',
    button('close', '취소')
    + button('server-publish-confirm', confirmLabel(s, pick), 'id="server-publish-confirm" ' + (pick.published ? 'disabled' : ''), 'btn primary'))
}

function onPublishPick(value) {
  const s = ui.serverEditor
  const c = s && publishChoices(s).find((x) => String(x.versionId) === value)
  if (!c) return
  s.publishPick = c.versionId
  $('#server-publish-summary').innerHTML = publishSummary(s, c)
  const btn = $('#server-publish-confirm')
  btn.textContent = confirmLabel(s, c)
  btn.disabled = c.published
}

async function confirmPublish(rerender) {
  const s = ui.serverEditor
  const c = s && publishChoices(s).find((x) => x.versionId === s.publishPick)
  if (!c || c.published || s.busy) return
  const again = isPublished(s)
  const btn = $('#server-publish-confirm')
  if (btn) { btn.disabled = true; btn.textContent = '게시하는 중…' }
  s.busy = true
  try {
    const event = await publishEvent(s.id, c.versionId)
    s.event = { ...s.event, ...event }
    s.versions = (await loadVersions(s.id)).versions
    resetAdminServer()             // 목록의 게시 상태도 다시 읽게
    closeModal()
    toast('v' + c.versionNo + ' ' + (again ? '재게시' : '게시') + '를 완료했어요. 사용자 화면에서 확인하세요.')
  } catch (e) {
    toast(e?.message || '게시하지 못했어요.')
    if (btn) { btn.disabled = false; btn.textContent = confirmLabel(s, c) }
  } finally {
    s.busy = false
    rerender()
  }
}

/* ───────────────────────── 그리기 ───────────────────────── */

const ymd = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' })
const dotted = (iso) => (iso ? ymd.format(new Date(iso)).replaceAll('-', '.') : '')

const RESULT = {
  DONE: ['success', '완료'],
  FAILED: ['error', '실패'],
  ASK_BACK: ['clarify', '확인 필요'],
  CANCELLED: ['cancelled', '중단됨'],
}

function progressHTML(s, extra) {
  const j = s.job
  const notice = s.notice ? '<p class="create-error" role="alert">' + esc(s.notice) + '</p>' : ''
  if (!j) return notice
  const edit = j.kind === 'edit'
  if (!j.done) {
    const hint = edit ? 'AI 가 요청을 반영하고 있어요.'
      : s.event?.template ? '템플릿을 불러오고 있어요.' : 'AI 가 페이지를 만들고 있어요. 수십 초 걸릴 수 있어요.'
    return '<div class="request-state processing" role="status" aria-live="polite">'
      + '<div class="request-state-head"><span class="request-spinner" aria-hidden="true"></span>'
      + '<strong>' + esc(j.label || '진행 중') + '</strong>'
      + (j.attempt > 1 ? '<span class="badge">' + j.attempt + '번째 시도</span>' : '') + '</div>'
      + '<p>' + (j.percent ?? 0) + '% · ' + hint + '</p>'
      + (extra ? '<p>' + esc(extra) + '</p>' : '')
      + button('server-cancel', '중단', '', 'btn sm ghost') + '</div>'
  }
  // 수정 결과는 대화에 붙는다. 생성 성공은 알림으로만 — 패널에 남기면 목록 자리를 먹는다
  if (edit || (j.phase === 'DONE' && s.preview)) return notice
  const [cls, label] = RESULT[j.phase] || ['error', j.phase]
  const text = j.phase === 'DONE'
    ? (s.preview ? 'v' + s.preview.versionNo + ' 로 만들었어요. 오른쪽에서 확인하세요.' : '페이지를 만들었어요.')
    : (j.message || '페이지를 만들지 못했어요.')
  return '<div class="request-state ' + cls + '" role="status"><div class="request-state-head"><strong>' + label + '</strong></div>'
    + '<p>' + esc(text) + '</p></div>' + notice
}

/** 생성 입력 — 페이지가 없을 때는 본 화면, 있을 때는 AI 대화 아래 "처음부터 다시 만들기" */
function generateForm(s) {
  const e = s.event
  const busy = running(s)
  const hasPage = !!s.preview
  const form = e.template
    ? '<p class="workspace-tip">템플릿 <strong>' + esc(e.template) + '</strong> 로 만든 이벤트예요. 다시 만들면 템플릿 원본으로 새 버전이 생겨요.</p>'
    : '<label class="field">AI 에게 요청할 내용<textarea id="server-prompt" maxlength="' + REQUEST_MAX + '" rows="5" '
      + (busy ? 'disabled' : '') + ' placeholder="예: 가을 맞이 데이터 이벤트. 혜택은 데이터 3GB, 카페 쿠폰 추첨.">'
      + esc(s.prompt || '') + '</textarea><span class="helper" id="server-prompt-count">'
      + (s.prompt || '').length + ' / ' + REQUEST_MAX + '자</span></label>'
  return (s.request && !hasPage ? '<p class="workspace-tip">요청: ' + esc(s.request) + '</p>' : '')
    + form
    + '<div class="row">' + button('server-generate', (e.template ? icon('grid') : icon('sparkle')) + (hasPage ? '처음부터 다시 만들기' : '페이지 만들기'),
        busy ? 'disabled' : '', hasPage ? 'btn sm' : 'btn primary') + '</div>'
}

const EXAMPLES = ['제목을 더 짧고 강렬하게 바꿔줘', '소개 문구를 친근하게 다듬어줘', '참여 방법을 3단계로 정리해줘']

const TONE = { FAILED: 'tone-fail', ASK_BACK: 'tone-ask', CANCELLED: 'tone-ask' }

/** AI 대화 — 대화 · 다시 만들기는 스크롤, 입력칸은 아래 고정 */
function chatPanel(s) {
  const busy = running(s)
  const tags = (m) => (m.blocks?.length ? '<span class="bubble-tags">' + m.blocks.map((k) => '<span>' + esc(labelOf(k)) + '</span>').join('') + '</span>' : '')
  const log = chatOf(s.id).map((m) => '<div class="bubble ' + (m.role === 'user' ? 'me' : TONE[m.tone] || '') + '"><small>'
    + (m.role === 'user' ? '관리자' : 'NewVent 어시스턴트' + (m.tone && m.tone !== 'DONE' ? ' · ' + (RESULT[m.tone]?.[1] || '') : ''))
    + '</small>' + tags(m) + esc(m.text) + '</div>').join('')
  return '<div class="server-scroll" id="server-scroll">'
    + '<div class="chat" id="chat-log" role="log" aria-label="AI 대화" aria-live="polite">' + log + '</div>'
    + '<details class="server-regen"><summary>처음부터 다시 만들기</summary>' + generateForm(s) + '</details></div>'
    + '<form class="server-foot" id="server-chat-form" aria-busy="' + busy + '">'
    + '<div id="server-selection">' + selectionHTML(s, busy) + '</div><label class="field">'
    + '<textarea id="server-chat" rows="3" aria-label="수정 요청" maxlength="' + REQUEST_MAX + '" placeholder="' + esc(chatPlaceholder(s)) + '" ' + (busy ? 'disabled' : '') + '>'
    + esc(s.chatInput || '') + '</textarea></label>'
    + '<div class="chips">' + EXAMPLES.map((t) => button('server-chat-example', t, 'data-prompt="' + esc(t) + '" ' + (busy ? 'disabled' : ''), 'chip')).join('') + '</div>'
    + '<div class="foot-row"><span class="helper" id="server-chat-count">' + (s.chatInput || '').length + ' / ' + REQUEST_MAX + '자 · 최신 버전 기준</span>'
    + '<button class="btn primary sm" type="submit" ' + (busy ? 'disabled' : '') + '>' + icon('sparkle') + (busy ? '처리 중…' : '보내기') + '</button></div></form>'
}

/** 직접 수정 — 문구 목록은 스크롤, 되돌리기 · 저장은 아래 고정 */
function directPanel(s) {
  const list = editable(s)
  if (!list.length) return '<div class="server-scroll"><p class="workspace-tip">이 페이지에는 직접 고칠 수 있는 문구가 없어요.</p></div>'
  const busy = running(s) || s.busy
  const collected = textsOf(s.preview.html)
  const grouped = matches(collected, list)
  const groups = []
  list.forEach((t, i) => {
    const block = grouped ? collected[i].block : 'all'
    if (!groups.length || groups.at(-1).block !== block) groups.push({ block, items: [] })
    groups.at(-1).items.push({ ...t, index: i })
  })
  const field = (t) => {
    const v = s.direct.values[t.index] ?? t.before
    const changed = normalize(v) !== normalize(t.before)
    const attrs = 'class="sedit' + (changed ? ' changed' : '') + '" data-sedit="' + t.index + '" ' + (busy ? 'disabled' : '')
      + ' aria-label="' + esc(t.before.slice(0, 30)) + '"'
    // 짧은 문구는 한 줄 칸, 긴 문구는 내용 높이만큼 늘어나는 칸
    const input = t.before.length <= 30 && !v.includes('\n')
      ? '<input type="text" ' + attrs + ' value="' + esc(v) + '">'
      : '<textarea rows="1" data-autogrow ' + attrs + '>' + esc(v) + '</textarea>'
    // 번호 = 서버 editableTexts 의 index (직접 수정 요청에 그대로 실린다)
    return '<div class="sedit-item"><span class="sedit-no' + (changed ? ' changed' : '') + '" data-sedit-no="' + t.index
      + '" title="문구 번호 ' + t.index + '">' + t.index + '</span>' + input + '</div>'
  }
  const fields = groups.map((g) => '<fieldset class="sedit-group"><legend>'
    + esc(g.block === 'all' ? '문구' : BLOCK_LABELS[g.block] || g.block) + '</legend>' + g.items.map(field).join('') + '</fieldset>').join('')
  const hasCta = /data-slot="cta-link"/.test(s.preview.html)
  const st = s.direct.style, on = s.direct.styleOn
  const dis = busy ? 'disabled' : ''
  const color = (k, label, def) => '<label class="check"><input type="checkbox" data-sstyle-on="' + k + '" ' + (on[k] ? 'checked' : '') + ' ' + dis + '>' + label + '</label>'
    + '<input type="color" data-sstyle="' + k + '" value="' + esc(st[k] || def) + '" ' + dis + ' aria-label="' + label + '">'
  const select = (k, label, opts) => '<span>' + label + '</span><select data-sstyle="' + k + '" ' + dis + ' aria-label="' + label + '"><option value="">그대로</option>'
    + opts.map(([v, t]) => '<option value="' + v + '" ' + (st[k] === v ? 'selected' : '') + '>' + t + '</option>').join('') + '</select>'
  const styleForm = hasCta ? '<fieldset class="sedit-group"><legend>참여 버튼 디자인</legend><div class="sedit-style">'
    + color('background', '배경색', '#d60076') + color('color', '글자색', '#ffffff')
    + select('size', '크기', [['small', '작게'], ['medium', '보통'], ['large', '크게']])
    + select('shape', '모양', [['square', '각지게'], ['round', '둥글게'], ['pill', '알약형']]) + '</div></fieldset>' : ''
  return '<div class="server-scroll" id="server-scroll">'
    + '<p class="workspace-tip">미리보기에서 문구를 누르면 해당 칸으로 이동해요. 기간 · 유의사항은 서버가 채우는 자리라 고칠 수 없어요.</p>'
    + (grouped ? '' : '<p class="helper" style="margin-bottom:10px">영역 구분을 불러오지 못해 문구를 순서대로 보여줘요.</p>')
    + '<div id="server-direct">' + fields + styleForm + '</div></div>'
    + '<div class="server-foot"><div class="foot-row" style="margin-top:0"><span class="helper" id="server-direct-count"></span>'
    + '<div class="row" style="gap:6px">' + button('server-direct-reset', '되돌리기', dis, 'btn sm')
    + button('server-direct-apply', s.busy ? '저장하는 중…' : '변경 저장', 'disabled', 'btn primary sm') + '</div></div>'
    + '<p class="helper" style="margin-top:6px;font-weight:500">저장하면 새 버전이 만들어져요.</p></div>'
}

function sidePanel(s) {
  if (!s.preview) {
    return '<section class="panel workspace-side"><div class="panel-head">페이지 생성</div><div class="server-side"><div class="server-scroll">'
      + '<div id="server-progress">' + progressHTML(s) + '</div>' + generateForm(s) + '</div></div></section>'
  }
  const tab = s.tab
  return '<aside class="panel workspace-side"><div class="workspace-tabs">'
    + button('server-tab', 'AI 대화', 'data-tab="chat" aria-pressed="' + (tab === 'chat') + '"', 'active-tab ' + (tab === 'chat' ? 'active' : ''))
    + button('server-tab', '직접 수정', 'data-tab="direct" aria-pressed="' + (tab === 'direct') + '"', 'active-tab ' + (tab === 'direct' ? 'active' : ''))
    + '</div><div class="server-side"><div id="server-progress">' + progressHTML(s) + '</div>'
    + (tab === 'chat' ? chatPanel(s) : directPanel(s)) + '</div></aside>'
}

function previewPanel(s) {
  const p = s.preview
  const published = (s.versions || []).find((v) => v.published)
  const body = p
    ? '<div class="canvas"><div class="canvas-frame ' + (ui.mobile ? 'mobile' : '') + '">'
      + serverFrame(p.html, '이벤트 미리보기', s.tab === 'direct' ? 'server-edit' : 'server-select') + '</div></div>'
    : '<div class="empty"><strong>아직 만들어진 페이지가 없어요</strong><p>왼쪽에서 페이지를 만들어보세요.</p></div>'
  return '<div class="studio-preview-column"><section class="panel"><div class="preview-controls"><div class="row wrap"><span>미리보기</span>'
    + (p ? '<span class="badge pink">최신 v' + p.versionNo + '</span>'
      + '<span class="badge ' + (isSaved(s) ? '' : 'amber') + '">' + (isSaved(s) ? '저장된 버전' : '이력에 저장 전') + '</span>' : '')
    + (published ? '<span class="badge green">게시 v' + published.versionNo + '</span>' : '')
    + (p && s.tab === 'chat' ? '<span class="pick-guide">' + icon('sparkle') + '영역을 눌러 고칠 곳을 고르세요</span>' : '')
    + '</div><div class="device-controls">'
    + button('device', icon('desktop'), 'data-mode="desktop" aria-label="데스크톱 미리보기"', 'btn sm ' + (!ui.mobile ? 'active' : ''))
    + button('device', icon('phone'), 'data-mode="mobile" aria-label="모바일 미리보기"', 'btn sm ' + (ui.mobile ? 'active' : ''))
    + '</div></div>' + body + '</section></div>'
}

const backToList = () => button('route', icon('back') + '이벤트 관리', 'data-route="admin"', 'backlink')

/** 불러오는 중 · 실패 — 버전 이력 화면도 같이 쓴다 */
function loadingView(s, back = backToList()) {
  if (!s || s.status === 'idle' || s.status === 'loading') {
    return '<div class="container">' + back + '<div class="empty"><strong>이벤트를 불러오고 있어요</strong></div></div>'
  }
  if (s.status === 'error') {
    return '<div class="container">' + back + '<div class="empty"><strong>이벤트를 불러오지 못했어요</strong><p>'
      + esc(s.error) + '</p>' + button('server-reload', '다시 불러오기', '', 'btn sm') + '</div></div>'
  }
  return null
}

function serverEditorView() {
  const s = ui.serverEditor
  const pending = loadingView(s)
  if (pending) return pending
  const e = s.event
  const busy = running(s) || s.busy
  const saved = isSaved(s)
  return '<div class="container studio-container workspace">'
    + '<div class="workspace-toolbar"><div class="workspace-title">' + backToList() + '<strong>' + esc(e.name) + '</strong></div>'
    + '<div class="row wrap">' + badgeOf(serverStatus(e))
    + '<span class="badge">' + dotted(e.startAt) + ' ~ ' + dotted(e.endAt) + '</span>'
    + '<span class="badge">' + esc(gradeLabel(e.grade)) + '</span>'
    + '<span class="badge">ID ' + e.id + '</span></div>'
    + '<div class="row workspace-actions">'
    + button('versions', '버전 이력', 'data-id="' + e.id + '"', 'btn sm')
    + button('server-save', saved ? '저장됨' : '버전 저장', (!s.preview || saved || busy) ? 'disabled' : '', 'btn sm')
    + button('server-publish', isPublished(s) ? '재게시' : '게시하기',
        !s.preview ? 'disabled title="먼저 페이지를 만들어주세요"'
          : isEnded(s) ? 'disabled title="종료된 이벤트는 게시할 수 없어요"'
            : busy ? 'disabled' : '', 'btn primary sm')
    + '</div></div>'
    + '<div class="studio-layout workspace-layout">' + sidePanel(s) + previewPanel(s) + '</div></div>'
}

/** 그린 뒤 — 직접 수정 칸 개수 · 버튼 상태, 대화 스크롤 */
function afterServerRender() {
  const s = ui.serverEditor
  if (!s || ui.route !== 'editor' || s.status !== 'ready') return
  // 대화는 최신 말이 보이게 맨 아래로
  const scroller = $('#server-scroll')
  if (scroller && s.tab === 'chat') scroller.scrollTop = scroller.scrollHeight
  document.querySelectorAll('textarea[data-autogrow]').forEach(grow)
  if (s.tab === 'direct') {
    updateDirectCount(s)
    const frame = $('.event-frame')
    // 고치던 값이 남아 있으면 (탭 전환 · 기기 전환) 새 iframe 에도 다시 입힌다
    if (frame) frame.addEventListener('load', () => { replayDirect(s); previewButtonStyle(s) }, { once: true })
  } else {
    // 고른 영역 외곽선 — 새 iframe(새 버전 · 기기 전환)에도 다시 입힌다
    const frame = $('.event-frame')
    if (frame) frame.addEventListener('load', () => paintSelection(s), { once: true })
  }
}

/** 긴 문구 칸은 내용 높이만큼 — 스크롤바 없이 한눈에 */
function grow(el) {
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 2 + 'px'
}

function replayDirect(s) {
  const live = liveTexts(s)
  if (!live) return
  Object.entries(s.direct.values).forEach(([i, v]) => { if (live[i]) live[i].node.data = v })
}

/* ───────────────────────── 입력 · 동작 ───────────────────────── */

/** main.js 의 click 위임에서 부른다. 처리했으면 true */
function handleServerClick(a, b, rerender) {
  const s = ui.serverEditor
  switch (a) {
    case 'server-generate': regenerate(rerender); return true
    case 'server-cancel': cancel(); return true
    case 'server-reload': reloadServerEditor(rerender); return true
    case 'server-save': saveCurrent(rerender); return true
    case 'server-tab':
      if (s && s.tab !== b.dataset.tab) { s.tab = b.dataset.tab === 'direct' ? 'direct' : 'chat'; rerender() }
      return true
    case 'server-chat-example': {
      const input = $('#server-chat')
      if (s && input && !input.disabled) { s.chatInput = b.dataset.prompt; input.value = s.chatInput; input.focus(); onChatInput(s.chatInput) }
      return true
    }
    case 'server-unselect':
      if (s && !running(s)) { s.selected = s.selected.filter((k) => k !== b.dataset.block); paintSelection(s) }
      return true
    case 'server-unselect-all':
      if (s && !running(s)) { s.selected = []; paintSelection(s) }
      return true
    case 'server-direct-apply': applyDirect(rerender); return true
    case 'server-direct-reset': resetDirect(rerender); return true
    case 'server-publish': openPublish(); return true
    case 'server-publish-confirm': confirmPublish(rerender); return true
  }
  return false
}

function onChatInput(value) {
  if (!ui.serverEditor) return
  ui.serverEditor.chatInput = value
  const c = $('#server-chat-count')
  if (c) c.textContent = value.length + ' / ' + REQUEST_MAX + '자'
}

/** main.js 의 input 위임에서 부른다. 처리했으면 true — 전체를 다시 그리지 않는다 (포커스 유지) */
function handleServerInput(ev) {
  const s = ui.serverEditor
  const t = ev.target
  if (!s) return false
  if (t.id === 'server-prompt') { onServerPromptInput(t.value); return true }
  if (t.id === 'server-chat') { onChatInput(t.value); return true }
  if (t.id === 'server-publish-version') { onPublishPick(t.value); return true }
  if (t.dataset.sedit !== undefined) {
    const i = Number(t.dataset.sedit)
    s.direct.values[i] = t.value
    const live = liveTexts(s)
    if (live?.[i]) live[i].node.data = t.value
    const before = editable(s)[i]?.before ?? ''
    const changed = normalize(t.value) !== normalize(before)
    t.classList.toggle('changed', changed)
    document.querySelector('[data-sedit-no="' + i + '"]')?.classList.toggle('changed', changed)
    if (t.dataset.autogrow !== undefined) grow(t)
    updateDirectCount(s)
    return true
  }
  if (t.dataset.sstyle || t.dataset.sstyleOn) {
    if (t.dataset.sstyleOn) {
      const k = t.dataset.sstyleOn
      s.direct.styleOn[k] = t.checked
      // 색을 안 건드리고 켜면 칸에 보이는 기본색을 쓴다
      if (!s.direct.style[k]) s.direct.style[k] = document.querySelector('[data-sstyle="' + k + '"]')?.value
    } else {
      s.direct.style[t.dataset.sstyle] = t.value
      // 색을 고르면 켠 것으로 본다
      const box = document.querySelector('[data-sstyle-on="' + t.dataset.sstyle + '"]')
      if (box && !box.checked && t.type === 'color') { box.checked = true; s.direct.styleOn[t.dataset.sstyle] = true }
    }
    previewButtonStyle(s)
    updateDirectCount(s)
    return true
  }
  return false
}

/** 대화 전송 — main.js 의 submit 위임에서 부른다 */
function handleServerSubmit(ev, rerender) {
  if (ev.target.id !== 'server-chat-form') return false
  ev.preventDefault()
  sendChat($('#server-chat')?.value, rerender)
  return true
}

/** 직접 수정 칸에 들어가면 미리보기에서 그 문구를 비춘다 */
function handleServerFocus(ev) {
  const s = ui.serverEditor
  if (!s || ev.target.dataset?.sedit === undefined) return
  highlight(s, Number(ev.target.dataset.sedit), true)
}

/** 미리보기에서 누른 글자 → 그 칸으로 */
function handleServerPick(ev) {
  const s = ui.serverEditor
  if (!s || s.tab !== 'direct') return
  const live = liveTexts(s)
  const target = ev.detail?.target
  if (!live || !target) return
  // 누른 요소 안의 첫 문구, 없으면 누른 요소를 품은 문구
  let i = live.findIndex((t) => target.contains(t.node))
  if (i < 0) i = live.findIndex((t) => t.node.parentElement?.contains(target))
  if (i < 0) { toast('이 부분은 직접 고칠 수 없어요.'); return }
  const field = document.querySelector('[data-sedit="' + i + '"]')
  if (!field) return
  field.scrollIntoView({ block: 'center', behavior: 'smooth' })
  field.focus({ preventScroll: true })
  highlight(s, i, false)
}

/** 입력칸 — 다시 만들기 요청문. 전체를 다시 그리지 않는다 (포커스 유지) */
function onServerPromptInput(value) {
  if (!ui.serverEditor) return
  ui.serverEditor.prompt = value
  const c = $('#server-prompt-count')
  if (c) c.textContent = value.length + ' / ' + REQUEST_MAX + '자'
}

function reloadServerEditor(rerender) {
  if (ui.serverEditor) ui.serverEditor.status = 'idle'
  ensureServerEditor(ui.serverEditor?.id ?? ui.activeId, rerender)
}

export {
  openServerEditor, ensureServerEditor, serverEditorView, afterServerRender, loadingView, refreshPage, running, openPublish,
  regenerate, cancel as cancelServerGeneration, onServerPromptInput, reloadServerEditor,
  handleServerClick, handleServerInput, handleServerSubmit, handleServerFocus, handleServerPick, handleServerBlock,
}
