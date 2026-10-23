/**
 * 편집 화면 — 서버 모드 (VITE_API_AUTH=on).
 *
 *   이벤트 정보   GET  /api/admin/events/{id}
 *   페이지 생성   POST /api/admin/events/{id}/generate      ┐ 같은 작업 자리 — GET …/generate/{jobId} 로 폴링,
 *   AI 대화 수정  POST /api/admin/events/{id}/edit          ┘ DELETE 로 중단
 *   직접 수정     POST /api/admin/events/{id}/versions/direct-edit  (바로 새 버전)
 *                 문구 · 버튼 디자인 · 블록 순서 · 페이지 배치 · 영역 모양 — 전부 모델을 안 부른다
 *   미리보기      GET  /api/admin/events/{id}/preview       (최신 버전 + editableTexts)
 *   북마크 추가   PUT  /api/admin/events/{id}/versions/{versionId}/checkpoint
 *   전체 버전     GET  /api/admin/events/{id}/versions      (버전 이력 화면은 server-versions.js)
 *   게시 · 재게시 POST /api/admin/events/{id}/publish { versionId }
 *
 * ★ 버전과 북마크
 *   AI 생성·수정 완료 또는 직접 수정의 변경 저장 시 서버에 새 버전이 생긴다.
 *   전체 버전을 이력에 표시하고, 중요한 버전에는 북마크(checkpoint)를 추가한다.
 *   게시하면 자동으로 북마크가 추가되며, 게시 중에는 해제할 수 없다.
 * 
 * ★ 수정 기준은 항상 최신 버전이다 (AI 수정 · 직접 수정 모두)
 *   이전 버전에서 이어 가려면 이력 화면의 "이 버전에서 이어서 작업" 이 그 버전을 최신으로 가져온다.
 *
 * ★ AI 대화 내역은 서버에 저장된다.
 *   편집 화면을 열 때 조회하고, 현재 작업의 대화는 화면에 즉시 추가한다.
 *
 * ★ 목업 편집 화면(editor.js)을 쓰지 않는 이유
 *   그 화면은 목업 스냅샷(제목 · 소개 · 혜택 제목 · 버튼 필드)으로 그리고 고친다.
 *   서버는 완성된 HTML 조각을 준다.
 *
 * ★ 폴링 중에는 진행 표시(#server-progress)만 다시 그린다 — 전체를 그리면 미리보기 iframe 이 매초 다시 뜬다
 * ★ 직접 수정 입력은 다시 그리지 않고 미리보기 iframe 의 글자만 바꾼다 (포커스 유지 · 즉시 확인)
 */

import { BLOCK_LABELS, PINNED_BLOCKS } from '@shared/constants.js'
import { $, esc } from '@shared/dom.js'
import { badgeOf, serverStatus } from '@shared/format.js'
import { GRADES, gradeLabel, REQUEST_MAX } from '@shared/grades.js'
import { icon } from '@shared/icons.js'
import { LAYOUTS, STACK, layoutPicks, markPick } from '@shared/layouts.js'
import { hexToRgb, parseHex, rgbToHex } from '@shared/color-code.js'
import { hasVariantIcons, shortName, variantIcon } from '@shared/variant-icons.js'
import { diffBlocks, orderChanged } from '@shared/preview/block-diff.js'
import { serverFrame, takeStagedDocument } from '@shared/preview/document.js'
import { collectTexts, matches, normalize, textsOf } from '@shared/preview/server-texts.js'
import {
  cancelGeneration, deleteAsset, directEdit, endEvent, generationStatus,
  loadAdminEvent, loadAssets, loadChatMessages, loadPreview, loadVersions,
  uploadAsset,
  publishEvent, saveCheckpoint, startEdit, startGenerate, updateEventInfo,
  searchRagPreview, loadPromptDrafts,
} from '@shared/repo.js'
import { ui } from '@shared/state.js'
import { button } from '@shared/ui/controls.js'
import { closeModal, modal } from '@shared/ui/modal.js'

import { resetAdminServer } from './list.js'
import { toast } from '@shared/ui/toast.js'
import { eventRangePicker } from './event-range-picker.js'

const POLL_MS = 1000

/* ── 올린 이미지 ──
 * ★ 자리는 AI 대화 입력칸의 + 다. 직접 수정 탭이 아니다 —
 *   올리는 것만으로는 아무 일도 안 난다. "배경으로 깔아줘" 를 모델에게 말해야 들어간다.
 * ★ 서버 asset.max-bytes 와 같은 값이다. 여기서 먼저 걸러 주면 3MB 짜리를 올려 보고
 *   기다린 뒤 거절당하는 일이 없다
 */
const ASSET_MAX_BYTES = 3 * 1024 * 1024
const ASSET_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp'

/** AI 대화 — 이벤트별. 편집 화면을 다시 열어도 탭이 살아 있는 동안은 남는다 */
const CHATS = {}
const GREETING = '바꾸고 싶은 내용을 말해 주세요. 오른쪽 미리보기에서 영역을 고르면 그 부분만 바뀌어요.'
const chatOf = (id) => (CHATS[id] ||= [{ role: 'assistant', text: GREETING }])

// order 는 null 로 시작한다 — 아직 안 건드렸다는 뜻이다. 미리보기 순서를 그대로 쓴다
// layout 도 null 로 시작한다. variants 는 고친 영역만 담는다 (영역 → class)
const freshDirect = () => ({
  values: {}, formats: {}, style: {}, styleOn: {}, order: null, layout: null, variants: {}, query: '',
  removeBlocks: [], removeItems: {},
  // 직접 수정 접기 상태 — 다시 그려도 열림/닫힘을 유지 (looks · order · title · button)
  folds: {},
  // 블록 순서 · 삭제 · 항목 맞바꾸기를 한 단계씩 되돌리는 기록 (pushHistory · undoLast)
  history: [],
})

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
    genLayout: '',                     // 다시 만들기 — 고른 페이지 배치. '' 는 자동(AI 가 고른다)
    chatInput: '',
    chatError: null,
    tab: 'chat',                       // chat | direct
    selected: [],                      // AI 대화 — 미리보기에서 고른 영역(data-block). 최대 MAX_SELECTED
    compare: null,                     // 가장 최근 AI 수정의 이전 모습 { before, versionNo, versionId }
    showBefore: false,                 // 미리보기에 이전 모습을 띄우는 중
    changedKeys: [],                   // 가장 최근 AI 수정이 바꾼 영역 — 미리보기에서 강조
    direct: freshDirect(),
    assets: [],                        // 올린 이미지 (서버 모드만. 목업은 늘 빈 배열)
    assetBusy: false,                  // 올리기 · 지우기 중
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

async function restoreChatHistory(s) {
  // 이전 접속의 화면 캐시 대신 서버 이력을 다시 읽는다.
  CHATS[s.id] = [{ role: 'assistant', text: GREETING }]
  s.chatError = null

  try {
    const messages = await loadChatMessages(s.id)

    if (ui.serverEditor !== s) return

    CHATS[s.id] = messages.length
      ? messages.map((message) => ({
          id: message.id,
          role: message.role === 'ADMIN' ? 'user' : 'assistant',
          text: message.content,
          tone: message.status === 'COMPLETED'
            ? 'DONE'
            : message.status,
          blocks: message.targetBlock
            ? message.targetBlock.split(',').map((block) => block.trim())
                .filter(Boolean)
            : [],
        }))
      : [{ role: 'assistant', text: GREETING }]
  } catch (error) {
    s.chatError = error?.message || '이전 대화를 불러오지 못했어요.'
  }
}

async function load(s, rerender) {
  s.status = 'loading'
  try {
    // ★ 이미지 목록은 못 읽어도 편집은 열려야 한다 — 없으면 + 로 다시 올릴 수 있다
    const [event, preview, versions, assets] = await Promise.all([
      loadAdminEvent(s.id), loadPreview(s.id), loadVersions(s.id).catch(() => null),
      loadAssets(s.id).catch(() => []), restoreChatHistory(s),
    ])

    // 조회 도중 다른 이벤트로 이동했다면 화면을 갱신하지 않는다.
    if (ui.serverEditor !== s) return

    Object.assign(s, {
      event, preview, versions: versions?.versions ?? null, assets, status: 'ready', error: null,
    })
  } catch (e) {
    if (ui.serverEditor !== s) return

    Object.assign(s, { status: 'error', error: e?.message || '이벤트를 불러오지 못했어요.' })
  }
  rerender()
  if (s.status === 'ready' && s.job && !s.job.done) poll(s, rerender)
}

/** 새 버전이 생긴 뒤 — 미리보기와 저장한 버전 목록을 다시 읽는다. 고치던 직접 수정 값은 버린다 */
async function refreshPage(s, { strictVersions = false } = {}) {
  const versionsRequest = loadVersions(s.id)
  const [preview, versions] = await Promise.all([
    loadPreview(s.id), strictVersions ? versionsRequest : versionsRequest.catch(() => null),
  ])
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

/**
 * 입력칸 안내 — 고른 영역을 따라가고, 처음부터 다시 만드는 중이면 그 말을 한다.
 * ★ 같은 칸을 두 가지로 쓰므로(수정 · 새로 만들기) 안내가 갈라져야 한다.
 */
const chatPlaceholder = (s) => (s.regen
  ? '예: 가을 맞이 데이터 이벤트. 혜택은 데이터 3GB, 카페 쿠폰 추첨.'
  : s.selected.length
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
  if (key === 'notices') { toast('유의사항은 직접 수정 탭에서 문구를 편집할 수 있어요.'); return }
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
  // ★ 다시 읽으면 이전 미리보기가 사라진다 — AI 수정이 무엇을 바꿨는지 보여 주려고 먼저 잡아 둔다
  const beforeHtml = s.preview?.html
  const versionBefore = s.preview?.versionNo
  if (s.job.phase === 'DONE') {
    try { await refreshPage(s) } catch { /* 미리보기는 다시 열 때 읽는다 */ }
  }
  if (kind === 'edit') {
    const reply = { role: 'assistant', tone: s.job.phase, text: editReply(s) }
    const changes = s.job.phase === 'DONE' ? changesOf(beforeHtml, s.preview?.html) : null
    if (changes) {
      reply.changes = changes
      // 이전 모습은 가장 최근 한 번만 둔다 — 대화가 길어져도 HTML 이 쌓이지 않게
      s.compare = { before: beforeHtml, versionNo: versionBefore, versionId: s.preview.versionId }
      s.changedKeys = changes.filter((c) => c.key && c.kind !== 'removed').map((c) => c.key)
    }
    chatOf(s.id).push(reply)
  } else if (s.job.phase === 'DONE' && s.preview) {
    toast('v' + s.preview.versionNo + ' 로 만들었어요.')
    // ★ 생성도 성공하면서 안내를 남긴다 — "요청에 없던 기간 · 혜택 표현이 들어 있다"
    //   (GenerationService 의 notePeriodWarnings). 토스트는 몇 초 뒤 사라지므로
    //   게시 전에 확인해야 하는 말은 화면에 남긴다
    if (s.job.message) s.notice = s.job.message
  }
  rerender()
}

/** AI 수정 전 · 후 — 말풍선에 붙일 변경 목록. 바뀐 게 없으면 null */
function changesOf(beforeHtml, afterHtml) {
  if (!beforeHtml || !afterHtml || beforeHtml === afterHtml) return null
  const list = diffBlocks(beforeHtml, afterHtml).map((d) => ({ ...d, label: labelOf(d.key) }))
  if (orderChanged(beforeHtml, afterHtml)) list.push({ key: null, kind: 'order', label: '영역 순서', summary: '순서 변경' })
  return list.length ? list : null
}

/** 이전 모습 비교 중인가 — 가장 최근 수정의 결과 버전을 보고 있을 때만 */
const comparing = (s) => !!(s.showBefore && s.tab === 'chat' && s.compare && s.preview?.versionId === s.compare.versionId)

/**
 * 수정 결과 말풍선 문구.
 *
 * ★★ **성공해도 message 를 버리지 않는다.** 서버는 일부만 반영된 경우 성공(DONE)으로
 *   끝내면서 무엇이 안 됐는지를 message 에 담는다 (EditService 의 job.notice —
 *   "○○ 영역은 바꾸지 못했습니다. 나머지는 반영했습니다.").
 *   전에는 DONE 이면 고정 문구만 써서, 두 가지를 시켰는데 하나만 된 경우에도
 *   "반영했어요" 만 보였다. 화면을 새로 고쳐 서버 대화 이력을 다시 읽어야 알 수 있었다.
 */
function editReply(s) {
  const j = s.job
  if (j.phase === 'DONE') {
    const done = (s.preview ? 'v' + s.preview.versionNo + ' 로 반영했어요. ' : '반영했어요. ') + '미리보기에서 확인해주세요.'
    return j.message ? done + ' ' + j.message : done
  }
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
    const r = await startGenerate(s.id, template ? {} : { requestText: text, ...(s.genLayout ? { layout: s.genLayout } : {}) })
    s.request = template ? null : text
    s.job = { jobId: r.jobId, kind: 'generate', phase: r.phase, label: '대기 중', percent: r.percent ?? 0, done: false }
  } catch (e) {
    s.notice = e?.message || '페이지 생성을 시작하지 못했어요.'
  }
  rerender()
  if (running(s)) poll(s, rerender)
}

/* ───────── 새로 시작하기 — 같은 입력칸으로 처음부터 다시 만든다 ───────── */

const RESTART_GREETING = '처음부터 다시 만들어요. 어떤 이벤트인지 적어 주세요.'

/**
 * 「새로 시작하기」 — 묻고 나서 비운다.
 *
 * ★ 되돌릴 수 없는 일이라 먼저 묻는다. 지금까지의 대화가 화면에서 사라지고,
 *   다음 입력은 수정이 아니라 **페이지를 통째로 다시 만드는** 요청이 된다.
 */
function askRestart() {
  const s = ui.serverEditor
  if (!s || running(s)) return
  modal('새로 시작하기',
    '<p>처음부터 다시 생성할까요? 지금까지 입력한 채팅 내역이 초기화됩니다.</p>',
    button('close', '취소') + button('server-restart-confirm', '초기화', '', 'btn primary'))
}

/** 대화를 비우고 입력칸을 "새로 만들기" 쪽으로 돌린다 (입력칸은 그대로 쓴다) */
function startOver(rerender) {
  const s = ui.serverEditor
  if (!s) return
  closeModal()
  CHATS[s.id] = [{ role: 'assistant', text: RESTART_GREETING }]
  s.regen = true
  s.chatInput = ''
  s.prompt = ''
  s.selected = []          // 고른 영역은 수정에서만 뜻이 있다
  s.notice = null
  rerender()
  $('#server-chat')?.focus()
}

/**
 * 새로 만들기 요청 — 입력칸의 글을 그대로 쓴다.
 * ★ 작업이 실제로 시작됐을 때만 모드를 되돌린다. 실패하면 적어 둔 글이 남아야 다시 누를 수 있다.
 */
async function submitRestart(text, rerender) {
  const s = ui.serverEditor
  if (!s) return
  s.prompt = (text || '').trim()
  await regenerate(rerender)
  if (!s.job) return
  s.regen = false
  s.chatInput = ''
  const box = $('#server-chat')
  if (box) box.value = ''
  rerender()
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
  // 방금 보낸 말이 보이게 — 다시 그린 뒤 맨 아래로 붙인다
  s.chatStickBottom = true
  // 새 요청을 보내면 지난 수정의 강조 · 비교는 거둔다
  s.changedKeys = []
  s.showBefore = false
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

export function discardUnsavedDirectChanges() {
  const s = ui.serverEditor
  if (!s?.direct) return

  s.direct = freshDirect()
}

export function hasUnsavedDirectChanges() {
  const s = ui.serverEditor
  if (!s?.preview || !s.direct) return false

  const {
    edits, buttonStyle, textStyle, order, looks,
    removeBlocks, removeItems,
  } = directChanges(s)

  return Boolean(
    edits.length
    || buttonStyle
    || textStyle
    || order
    || looks?.count
    || removeBlocks.length
    || Object.values(removeItems).some((items) => items.length),
  )
}

/** 바뀐 문구 · 버튼 스타일만 모아 요청 본문으로 */
function directChanges(s) {
  const list = editable(s)
  const formats = s.direct.formats || {}
  const indexes = new Set([...Object.keys(s.direct.values), ...Object.keys(formats)])
  const edits = [...indexes].map((i) => ({
    index: Number(i), before: list[i]?.before, after: s.direct.values[i] ?? list[i]?.before,
    ...(formats[i] && Object.keys(formats[i]).length ? { format: formats[i] } : {}),
  })).filter((x) => x.before !== undefined && (x.format || normalize(x.after) !== normalize(x.before)))
  const st = s.direct.style, on = s.direct.styleOn
  const style = {}
  if (on.background && st.background) style.background = st.background
  if (on.color && st.color) style.color = st.color
  if (st.size) style.size = st.size
  if (st.shape) style.shape = st.shape

  // ★★ 제목 글자 크기 · 색. **고른 것만** 보낸다 —
  //   안 고른 항목까지 보내면 인라인 style 이 박혀서 그 제목만 팔레트를 안 따라간다.
  //   체크를 안 한 색은 아예 담지 않는 게 "테마를 따른다" 는 뜻이다.
  const text = {}
  if (on.titleColor && st.titleColor) text.titleColor = st.titleColor
  if (on.headingColor && st.headingColor) text.headingColor = st.headingColor
  if (st.titleSize) text.titleSize = st.titleSize
  if (st.headingSize) text.headingSize = st.headingSize

  return {
    edits,
    buttonStyle: Object.keys(style).length ? style : null,
    textStyle: Object.keys(text).length ? text : null,
    order: changedOrder(s),
    looks: changedLooks(s),
    removeBlocks: s.direct.removeBlocks,
    removeItems: s.direct.removeItems,
  }
}

/* ── 블록 순서 ──────────────────────────────────────────────── */

/** 미리보기 HTML 에 있는 블록을 보이는 순서대로 */
function blocksInHtml(html) {
  const out = []
  for (const m of String(html || '').matchAll(/data-block="([a-z-]+)"/g)) {
    if (BLOCK_LABELS[m[1]] && !out.includes(m[1])) out.push(m[1])
  }
  return out
}

/** 옮길 수 있는 블록만 — 지금 저장된 순서 */
const movableBlocks = (s) => blocksInHtml(s.preview?.html).filter((k) => !PINNED_BLOCKS.includes(k))

/** 화면에 보여 줄 순서. 아직 안 끌었으면 저장된 순서 그대로 */
const currentOrder = (s) => (s.direct.order || movableBlocks(s)).filter((k) => !s.direct.removeBlocks.includes(k))

const ITEM_SELECTORS = {
  benefits: 'ul li, .benefit-card', stats: 'ul li', prize: 'ul li', compare: 'table tr',
  steps: 'ol li, .step-card', schedule: 'ol li', faq: 'dl dt, details summary',
}
const ITEM_MINIMUMS = { benefits: 1, stats: 2, prize: 1, compare: 2, steps: 2, schedule: 2, faq: 2 }
const ADMIN_KEEP = ['hero', 'notices', 'cta']
function blockElement(s, key) { return $('.event-frame')?.contentDocument?.querySelector('[data-block="' + key + '"]') }
function itemElements(s, key) {
  const block = blockElement(s, key), selector = ITEM_SELECTORS[key]
  if (!block || !selector) return []
  return [...new Set([...block.querySelectorAll(selector)])]
}
function previewDeletes(s) {
  const doc = $('.event-frame')?.contentDocument
  if (!doc) return
  doc.querySelectorAll('[data-block]').forEach((el) => {
    if (el.dataset.nvDeleteStyle !== undefined) {
      if (el.dataset.nvDeleteStyle) el.setAttribute('style', el.dataset.nvDeleteStyle)
      else el.removeAttribute('style')
      el.style.removeProperty('display')
      delete el.dataset.nvDeleteStyle
    }
  })
  Object.keys(ITEM_SELECTORS).forEach((key) => itemElements(s, key).forEach((el) => {
    if (el.dataset.nvDeleteStyle !== undefined) {
      if (el.dataset.nvDeleteStyle) el.setAttribute('style', el.dataset.nvDeleteStyle)
      else el.removeAttribute('style')
      el.style.removeProperty('display')
      delete el.dataset.nvDeleteStyle
    }
  }))
  const hide = (el) => { if (!el) return; el.dataset.nvDeleteStyle = el.getAttribute('style') || ''; el.style.setProperty('display', 'none', 'important') }
  s.direct.removeBlocks.forEach((key) => hide(blockElement(s, key)))
  Object.entries(s.direct.removeItems).forEach(([key, indices]) => indices.forEach((index) => hide(itemElements(s, key)[index])))
}
function removeBlockDraft(s, key, rerender) {
  if (ADMIN_KEEP.includes(key)) return
  rememberDirectScroll(s)
  pushHistory(s, { type: 'block', removeBlocks: [...s.direct.removeBlocks], order: s.direct.order && [...s.direct.order] })
  s.direct.removeBlocks = s.direct.removeBlocks.includes(key) ? s.direct.removeBlocks : [...s.direct.removeBlocks, key]
  s.direct.order = currentOrder(s)
  previewDeletes(s); paintOrder(s); previewOrder(s); updateDirectCount(s); repaintDirectPanel(s, rerender)
}
function removeItemDraft(s, key, index, rerender) {
  const current = s.direct.removeItems[key] || []
  if (current.includes(index)) return
  rememberDirectScroll(s)
  pushHistory(s, { type: 'item', key, removed: [...current] })
  s.direct.removeItems[key] = [...current, index]
  previewDeletes(s); paintOrder(s); updateDirectCount(s); repaintDirectPanel(s, rerender)
}

/**
 * 직접 수정 패널(왼쪽)만 다시 그린다. 미리보기 iframe 은 그대로 둔다.
 * ★ 영역 · 항목을 지우거나 되돌리면 문구 칸 목록이 달라져서 패널은 다시 그려야 한다.
 *   그런데 화면 전체를 다시 그리면 iframe 이 새로 떠서 매번 깜빡인다 — 지운 모습은 previewDeletes 가 이미 제자리에서 입혔다.
 * ★ 패널을 못 찾으면(다른 탭 · 아직 안 그림) 예전처럼 전체를 다시 그린다.
 */
function repaintDirectPanel(s, rerender) {
  const side = $('.workspace-side .server-side'), old = $('#server-scroll')
  if (!side || !old || s.tab !== 'direct' || !$('.event-frame')) { rerender?.(); return }
  const top = old.scrollTop
  const holder = document.createElement('div')
  holder.innerHTML = directPanel(s)
  old.remove()
  side.querySelector(':scope > .server-foot')?.remove()
  side.append(...holder.childNodes)
  const scroller = $('#server-scroll')
  document.querySelectorAll('textarea[data-autogrow]').forEach((el) => {
    if (el.dataset.sedit !== undefined) {
      const index = Number(el.dataset.sedit)
      el.value = s.direct.values[index] ?? editable(s)[index]?.before ?? ''
    }
    grow(el)
  })
  applyTextFilter(s)
  updateDirectCount(s)
  bindDirectFolds(s)
  foldLooks()
  if (scroller) scroller.scrollTop = top
}

/* ── 한 단계 되돌리기 ────────────────────────────────────────────
 * 블록 순서 · 블록 삭제 · 항목 삭제 · 항목 내용 맞바꾸기를 하나씩 거꾸로 돌린다.
 * ★ 고친 문구를 한 글자씩 되돌리는 게 아니다 — 문구 칸의 입력은 브라우저의 되돌리기(Ctrl+Z)가 맡는다.
 * ★ 기록은 저장하면(= s.direct 를 새로 만들면) 비워진다. 저장한 버전은 버전 이력에서 되돌린다.
 */
const HISTORY_MAX = 50

function pushHistory(s, entry) {
  s.direct.history.push(entry)
  if (s.direct.history.length > HISTORY_MAX) s.direct.history.shift()
}

/** 가장 최근 한 단계를 되돌린다. 되돌릴 게 없으면 false */
function undoLast(s, rerender) {
  const entry = s.direct.history.pop()
  if (!entry) return false
  rememberDirectScroll(s)
  if (entry.type === 'order') {
    s.direct.order = entry.order
  } else if (entry.type === 'block') {
    s.direct.removeBlocks = entry.removeBlocks
    s.direct.order = entry.order
  } else if (entry.type === 'item') {
    if (entry.removed.length) s.direct.removeItems[entry.key] = entry.removed
    else delete s.direct.removeItems[entry.key]
  } else if (entry.type === 'swap') {
    entry.texts.forEach(({ index, value, format }) => {
      if (value === undefined) delete s.direct.values[index]
      else s.direct.values[index] = value
      if (format === undefined) delete s.direct.formats[index]
      else s.direct.formats[index] = format
    })
    restoreSwapPreview(s, entry.texts.map((t) => t.index))
  }
  previewDeletes(s); paintOrder(s); previewOrder(s)
  $('.event-frame')?.nvToolsRefresh?.()
  // 순서 · 맞바꾸기는 미리보기와 문구 칸을 제자리에서 맞춘다 — 전체를 다시 그리면 iframe 이 새로 떠서 깜빡인다.
  // 삭제를 되돌리면 문구 칸의 목록(지운 영역의 문구)이 달라지므로 그때만 왼쪽 패널을 다시 그린다 (iframe 은 그대로).
  if (entry.type === 'swap') syncTextFields(s, entry.texts.map((t) => t.index))
  updateDirectCount(s)
  if (entry.type === 'block' || entry.type === 'item') repaintDirectPanel(s, rerender)
  return true
}

/* ── 항목 내용 맞바꾸기 ───────────────────────────────────────────
 * ★ 항목을 옮기는 게 아니다. 서버에는 항목 순서를 바꾸는 요청이 없어서, 두 항목의 문구(와 문구 서식)를
 *   서로 바꿔 넣는다. 이미지 · 항목마다 다른 모양은 그대로이고, 저장하면 문구 수정으로 기록된다.
 * ★ 문구 조각 수가 같은 항목끼리만 된다. 단계 번호(01 · 02)는 제자리에 둔다 — 같이 바꾸면 번호가 거꾸로 선다.
 * ★ 자주 묻는 질문은 뺀다. 항목이 질문 줄 하나뿐이고 답은 따로라서, 질문만 바꾸면 짝이 어긋난다.
 */
const SWAPPABLE = ['benefits', 'stats', 'prize', 'steps', 'schedule', 'compare']
const COUNTER = /^\s*0?\d{1,2}\s*$/

const textValue = (s, i) => s.direct.values[i] ?? editable(s)[i]?.before ?? ''

/** 항목 안의 문구 조각 → 서버 문구 번호 (문서 순서) */
function itemTextIndexes(s, key, index) {
  const el = itemElements(s, key)[index]
  const live = liveTexts(s)
  if (!el || !live) return []
  const out = []
  live.forEach((t, i) => { if (t?.node && el.contains(t.node)) out.push(i) })
  return out
}

/** 서버가 준 저장 서식 → { color?, size?, bold? } */
function savedFormat(t) {
  const f = t?.format || {}, out = {}
  if (f.color) out.color = f.color
  if (f['font-size']) out.size = parseInt(f['font-size'], 10)
  if (f['font-weight']) out.bold = Number(f['font-weight']) >= 600
  return out
}
/** 고치는 중인 서식 → { color?, size?, bold? } (reset 은 뺀다) */
function patchPart(p) {
  const out = {}
  if (p?.color) out.color = p.color
  if (p?.size != null && p.size !== '') out.size = Number(p.size)
  if (p?.bold != null && p.bold !== '') out.bold = !!p.bold
  return out
}
/** 지금 이 문구에 입혀진 서식 = 저장돼 있던 것 + 고치는 중인 것 */
function effectiveFormat(s, i) {
  const patch = s.direct.formats?.[i]
  return patch?.reset ? patchPart(patch) : { ...savedFormat(editable(s)[i]), ...patchPart(patch) }
}
const sameFormat = (a, b) => ['color', 'size', 'bold'].every((k) => a[k] === b[k])

/** 문구 i 의 서식이 want 가 되게 고치는 중인 서식을 맞춘다 */
function setFormat(s, i, want) {
  if (sameFormat(effectiveFormat(s, i), want)) return
  // 저장돼 있던 서식과 같아지면 고칠 게 없다
  if (sameFormat(savedFormat(editable(s)[i]), want)) delete s.direct.formats[i]
  else s.direct.formats[i] = { reset: true, ...want }
}

/**
 * 두 항목을 맞바꿀 수 있는가. 된다면 [[번호 A, 번호 B], …] (제자리에 둘 번호는 뺀다), 안 되면 이유 문구.
 * 단추를 그릴 때도 부르므로 상태를 바꾸지 않는다.
 */
function swapPlan(s, key, a, b) {
  if (!SWAPPABLE.includes(key)) return { why: labelOf(key) + ' 항목은 짝이 있어서 맞바꿀 수 없어요' }
  const A = itemTextIndexes(s, key, a), B = itemTextIndexes(s, key, b)
  if (!A.length || A.length !== B.length) {
    return { why: '문구 조각 수가 달라서 맞바꿀 수 없어요 (' + A.length + '개 ↔ ' + B.length + '개)' }
  }
  const pairs = []
  for (let n = 0; n < A.length; n++) {
    const ca = COUNTER.test(textValue(s, A[n])), cb = COUNTER.test(textValue(s, B[n]))
    if (ca !== cb) return { why: '항목 구조가 달라서 맞바꿀 수 없어요' }
    if (!ca) pairs.push([A[n], B[n]])
  }
  return pairs.length ? { pairs } : { why: '바꿀 문구가 없어요' }
}

/** 두 항목의 문구와 서식을 서로 바꿔 넣는다. 한 단계 되돌리기에 쌓는다 */
const swapItems = (s, key, a, b) => swapChain(s, key, [[a, b]])

/**
 * 이웃한 항목끼리의 맞바꾸기를 이어서 한다 — [[a, b], [b, c], …]. 끌어서 옮기기가 이 길을 쓴다.
 * ★ 하나라도 안 되면 아무것도 바꾸지 않는다. 한 단계 되돌리기 한 번으로 통째로 돌아온다.
 * ★ 맞바꿔도 항목 자리와 문구 조각 수는 그대로라서, 처음에 본 계획이 끝까지 맞다.
 */
function swapChain(s, key, steps) {
  const plans = steps.map(([a, b]) => swapPlan(s, key, a, b))
  const bad = plans.find((p) => !p.pairs)
  if (bad || !plans.length) { toast(bad ? bad.why : '옮길 곳이 없어요'); return false }
  rememberDirectScroll(s)
  const touched = [...new Set(plans.flatMap((p) => p.pairs.flat()))]
  pushHistory(s, { type: 'swap', texts: touched.map((index) => ({
    index,
    value: s.direct.values[index],
    format: s.direct.formats[index] && { ...s.direct.formats[index] },
  })) })
  plans.forEach((plan) => plan.pairs.forEach(([x, y]) => {
    const vx = textValue(s, x), vy = textValue(s, y)
    const fx = effectiveFormat(s, x), fy = effectiveFormat(s, y)
    s.direct.values[x] = vy
    s.direct.values[y] = vx
    setFormat(s, x, fy)
    setFormat(s, y, fx)
  }))
  // ★ 전체를 다시 그리지 않는다 — 그러면 미리보기 iframe 이 새로 떠서 매번 화면이 깜빡인다.
  //   미리보기는 위에서 제자리로 고쳤고, 왼쪽 문구 칸만 지금 값에 맞춘다
  restoreSwapPreview(s, touched)
  syncTextFields(s, touched)
  paintOrder(s); updateDirectCount(s)
  return true
}

/**
 * 항목을 끌어 다른 항목 자리에 놓았다 — from 의 내용이 to 자리로 가고, 사이의 내용은 한 칸씩 밀린다.
 * 지운 항목(안 보임)은 건너뛴다. 번호는 itemElements 의 자리다.
 */
function moveItemContent(s, key, from, to) {
  if (!SWAPPABLE.includes(key)) return false
  const shown = itemElements(s, key).map((el, i) => (el.getClientRects().length ? i : -1)).filter((i) => i >= 0)
  const steps = chainSteps(shown, from, to)
  return steps.length ? swapChain(s, key, steps) : false
}

/** 보이는 항목 번호들(shown) 안에서 from 을 to 자리로 보내는 이웃끼리의 맞바꾸기 순서. 못 옮기면 [] */
function chainSteps(shown, from, to) {
  const p = shown.indexOf(from), q = shown.indexOf(to)
  if (p < 0 || q < 0 || p === q) return []
  const steps = []
  if (p < q) for (let k = p; k < q; k++) steps.push([shown[k], shown[k + 1]])
  else for (let k = p; k > q; k--) steps.push([shown[k], shown[k - 1]])
  return steps
}

/**
 * 왼쪽 문구 칸(글자 · 문구 서식)을 지금 값에 맞춘다. 맞바꾸기 · 되돌리기가 부른다.
 * 전체를 다시 그리는 길(rerender)은 iframe 을 새로 띄워 깜빡이므로 쓰지 않는다.
 */
function syncTextFields(s, indices) {
  indices.forEach((i) => {
    const area = document.querySelector('textarea[data-sedit="' + i + '"]')
    if (!area) return
    area.value = textValue(s, i)
    const changed = normalize(area.value) !== normalize(editable(s)[i]?.before ?? '')
    area.classList.toggle('changed', changed)
    document.querySelector('[data-sedit-no="' + i + '"]')?.classList.toggle('changed', changed)
    grow(area)
    const f = effectiveFormat(s, i)
    const control = (name) => document.querySelector('[data-text-format="' + name + '"][data-text-index="' + i + '"]')
    const color = control('color'), size = control('size'), bold = control('bold')
    if (color) color.value = f.color || '#222222'
    if (size) size.value = f.size ?? ''
    if (bold) bold.value = f.bold === true ? 'true' : f.bold === false ? 'false' : ''
  })
}

/** 미리보기의 해당 문구를 지금 값 · 서식으로 다시 맞춘다 (맞바꾸기 · 되돌리기가 부른다) */
function restoreSwapPreview(s, indices) {
  const live = liveTexts(s)
  if (!live) return
  indices.forEach((i) => {
    const node = live[i]?.node
    if (!node) return
    setPreviewText(node, i, textValue(s, i))
    const holder = node.parentElement
    if (textBaseStyles.has(holder)) holder.setAttribute('style', textBaseStyles.get(holder))
  })
  previewItemFormats(s)
}

/** 삭제 버튼을 눌러 다시 그려도 직접수정 패널과 페이지의 현재 위치를 유지한다. */
function rememberDirectScroll(s) {
  s.direct.scrollTop = $('#server-scroll')?.scrollTop ?? 0
  s.direct.windowScrollY = window.scrollY
}

/**
 * 전체를 다시 그리기 직전에 왼쪽 패널·창 스크롤을 기억한다.
 * ★ AI 대화가 끝나면 remount 때문에 스크롤이 맨 위로 리셋되던 문제를 막는다.
 *   맨 아래 근처였거나 방금 메시지를 보냈으면 아래로 붙이고, 위로 올려 읽고 있으면 그 자리를 유지한다.
 * ★ 대화/직접 수정 스크롤은 탭별로 따로 둔다 — 탭을 바꿔도 서로 섞이지 않게.
 */
function rememberSideScroll() {
  const s = ui.serverEditor
  if (!s || ui.route !== 'editor' || s.status !== 'ready') return
  const el = $('#server-scroll')
  if (el) {
    const max = Math.max(0, el.scrollHeight - el.clientHeight)
    const top = el.scrollTop
    const stickBottom = max <= 8 || top >= max - 48
    if (s.tab === 'chat') s.chatScroll = { top, stickBottom }
    else s.direct.scrollTop = top
  }
  s.windowScrollY = window.scrollY
  if (s.tab === 'direct') s.direct.windowScrollY = window.scrollY
}

/**
 * 미리보기 스크롤(.canvas) 유지.
 * ★ 전체를 다시 그리면 .canvas 도 iframe 도 새로 만들어져 스크롤이 0 으로 돌아간다.
 *   다시 그릴 때 읽으면 안 된다 — iframe 이 아직 짧을 때 맞춘 값(잘린 값)을 기억하게 된다.
 *   그래서 사람이 움직일 때마다 기억해 두고(bind), 다시 그린 뒤에는 iframe 높이가 자리 잡을 때까지
 *   그 값으로 맞춘다(restore). 맞추는 동안 생기는 scroll 이벤트는 기억하지 않는다.
 */
function bindCanvasScroll(s, canvas) {
  canvas?.addEventListener('scroll', () => { if (!s.canvasRestoring) s.canvasScroll = canvas.scrollTop }, { passive: true })
}

function restoreCanvasScroll(s, canvas) {
  const want = s.canvasScroll
  if (!canvas || !(want > 0)) return
  const frame = canvas.querySelector('.event-frame')
  if (!frame) return
  s.canvasRestoring = true
  // iframe 높이는 문서가 뜬 뒤에 자리 잡는다 — 높이가 바뀔 때마다 다시 맞추고, 닿으면 끝낸다
  // (닿지 못하는 경우 — 페이지가 줄었을 때 — 를 위해 8초 뒤에는 그만둔다)
  const stop = () => { s.canvasRestoring = false; observer.disconnect(); clearTimeout(timer) }
  const apply = () => {
    if (!s.canvasRestoring || ui.serverEditor !== s || !canvas.isConnected) return stop()
    canvas.scrollTop = want
    if (Math.abs(canvas.scrollTop - want) <= 1) stop()
  }
  const observer = new ResizeObserver(apply)
  const timer = setTimeout(stop, 8000)
  observer.observe(frame)
  // 맞추는 중에 사람이 직접 움직이면 그 뜻을 따른다
  for (const ev of ['wheel', 'touchstart', 'pointerdown', 'keydown']) canvas.addEventListener(ev, stop, { once: true, passive: true })
  apply()
}

const CHANGE_STYLE = '.nv-changed{outline:3px solid #f2b705!important;outline-offset:-3px}'
  + '.nv-flash{animation:nv-flash .9s ease-out 2}@keyframes nv-flash{50%{outline-color:#ff7a00}}'

/** 가장 최근 AI 수정이 바꾼 영역에 외곽선을 입힌다 — 새 iframe 이 뜰 때마다 다시 */
function paintChanges(s) {
  const doc = $('.event-frame')?.contentDocument
  if (!doc?.head || comparing(s)) return
  if (!doc.getElementById('nv-change-style')) {
    const style = doc.createElement('style')
    style.id = 'nv-change-style'
    style.textContent = CHANGE_STYLE
    doc.head.appendChild(style)
  }
  doc.querySelectorAll('[data-block]').forEach((n) => n.classList.toggle('nv-changed', s.changedKeys.includes(n.dataset.block)))
}

/** 변경 칩 — 미리보기를 그 영역으로 옮기고 외곽선을 잠깐 깜빡인다 */
function goToBlock(key) {
  const frame = $('.event-frame'), canvas = $('.canvas')
  const el = frame?.contentDocument?.querySelector('[data-block="' + key + '"]')
  if (!el || !canvas) return
  // 줄여 보기(fit)면 iframe 이 scale 로 줄어 있다 — 화면에 보이는 크기 비율로 바꿔 계산한다
  const scale = frame.offsetHeight ? frame.getBoundingClientRect().height / frame.offsetHeight : 1
  const top = frame.getBoundingClientRect().top - canvas.getBoundingClientRect().top + canvas.scrollTop + el.getBoundingClientRect().top * scale
  canvas.scrollTo({ top: Math.max(0, top - 12), behavior: 'smooth' })
  el.classList.remove('nv-flash')
  void el.offsetWidth
  el.classList.add('nv-flash')
}

/** 바꾼 게 있으면 보낼 목록, 없으면 null */
function changedOrder(s) {
  if (!s.direct.order) return null
  const was = movableBlocks(s), now = currentOrder(s)
  return now.length === was.length && now.every((k, i) => k === was[i]) ? null : now
}

/** 순서를 바꾸고 화면 세 곳을 맞춘다. 전체를 다시 그리지 않는다 — 입력 포커스가 날아간다 */
function setOrder(s, next) {
  const now = currentOrder(s)
  if (next.length === now.length && next.every((k, i) => k === now[i])) return
  pushHistory(s, { type: 'order', order: s.direct.order && [...s.direct.order] })
  s.direct.order = next
  paintOrder(s)
  previewOrder(s)
  // 옮긴 영역을 따라 미리보기 도구줄도 옮긴다
  $('.event-frame')?.nvToolsRefresh?.()
  updateDirectCount(s)
}

/** key 를 target 앞자리로. 끌어 놓기가 쓴다 (target 이 없으면 맨 끝) */
function moveBlock(s, key, target) {
  const list = currentOrder(s).filter((k) => k !== key)
  const at = list.indexOf(target)
  list.splice(at < 0 ? list.length : at, 0, key)
  setOrder(s, list)
}

/** 맨 위 · 맨 아래로. 목록이 길 때 ▲▼ 를 여러 번 누르지 않게 한다 */
function moveToEdge(s, key, edge) {
  const list = currentOrder(s)
  if (!list.includes(key)) return
  const rest = list.filter((k) => k !== key)
  setOrder(s, edge === 'top' ? [key, ...rest] : [...rest, key])
}

/** 한 칸 위/아래 — 끌기를 못 쓰는 환경(모바일 · 키보드)의 길 */
function nudgeBlock(s, key, step) {
  const list = currentOrder(s)
  const at = list.indexOf(key)
  const to = at + step
  if (at < 0 || to < 0 || to >= list.length) return
  const next = [...list]
  next.splice(at, 1)
  next.splice(to, 0, key)
  setOrder(s, next)
}

/**
 * 미리보기 iframe 의 섹션을 실제로 옮긴다.
 *
 * ★ 서버 PageShell.orderBlocks 와 같은 방법이다 — 원래 블록이 있던 자리에
 *   표식을 두고 거기에 다시 꽂는다. 그래야 블록 사이의 장식 · 스크립트가 제자리에 남는다.
 * ★ 고정 블록(유의사항 · 참여 버튼)은 목록에 없으므로 건드리지 않는다.
 */
function previewOrder(s) {
  // 섹션을 옮기기 전에 서버 인덱스와 문구 노드의 연결을 보관한다.
  liveTexts(s)
  const doc = $('.event-frame')?.contentDocument
  const root = doc?.querySelector('.ev-container, .event-page')
  if (!root) return
  const order = currentOrder(s)
  const slots = [...root.children].filter((el) =>
    el.matches('section[data-block]') && order.includes(el.dataset.block))
  const sorted = order.map((k) => slots.find((el) => el.dataset.block === k)).filter(Boolean)
  if (sorted.length !== slots.length) return
  const marks = slots.map((el) => { const m = doc.createElement('template'); el.before(m); return m })
  slots.forEach((el) => el.remove())
  marks.forEach((m, i) => m.replaceWith(sorted[i]))
}

/** 순서 묶음. 옮길 수 있는 블록이 둘 미만이면 아예 안 보여 준다. 접기 토글 안에 넣는다. */
function orderHTML(s, busy) {
  const available = currentOrder(s)
  if (available.length < 2 && !available.some((k) => !ADMIN_KEEP.includes(k) || ITEM_SELECTORS[k])) return ''
  return '<div class="sorder-head">' + undoButton(s, busy) + '</div>'
    + '<ol class="sorder" id="server-order">' + orderItems(s, busy) + '</ol>'
    + '<p class="helper">끌어서 옮기거나 ▲▼ 를 누르세요. 미리보기에서 영역 위의 ⠿ 를 끌어도 돼요. '
    + '🔒 영역은 이벤트에 꼭 필요해서 늘 맨 끝에 있어요.</p>'
    + '<p class="helper sorder-swap-help">항목 옆 ▲▼ 는 위·아래 항목과 <b>내용을 맞바꿔요</b>. 항목 자체가 움직이는 게 아니라서 이미지와 모양은 그대로예요. '
    + '문구 조각 수가 같은 항목끼리만 바꿀 수 있어요.</p>'
}

/** 한 단계 되돌리기 — 기록이 없으면 흐리게 둔다. 목록을 다시 그릴 때마다 paintOrder 가 맞춘다 */
function undoButton(s, busy) {
  const none = !s.direct.history.length
  return button('server-undo', '↶ 한 단계 되돌리기', (busy || none ? 'disabled ' : '') + 'id="server-undo" title="순서 · 삭제 · 맞바꾸기를 가장 최근 것부터 하나씩 되돌려요"', 'sorder-undo')
}

/** 못 옮기는 영역 — 목록 끝에 잠금으로 보여 준다. 끌기 · ▲▼ 가 없다 */
function lockedRows(s) {
  return blocksInHtml(s.preview?.html).filter((k) => PINNED_BLOCKS.includes(k) && !s.direct.removeBlocks.includes(k))
    .map((k) => '<li class="sorder-lock" aria-label="' + esc(labelOf(k)) + ' 맨 끝에 고정"><span aria-hidden="true">🔒</span>'
      + '<span class="sorder-name">' + esc(labelOf(k)) + '</span><em>맨 끝에 고정</em></li>').join('')
}

/**
 * ★ 한 줄은 [끌기 · 이름 · ▲▼× ] 이고, 항목 목록은 그 **아래 줄 전체 폭**에 둔다 (editor.css .sorder-items).
 *   예전에는 항목이 이름과 버튼 사이에 끼어 이름 칸이 한 글자 폭으로 눌렸다("혜/택").
 * ★ 삭제 단추는 블록 · 항목이 같은 모양(×, .sorder-del)이다. 못 지우는 항목은 왜인지 title 로 말한다.
 */
function orderItems(s, busy) {
  const list = currentOrder(s)
  return list.map((k, i) => '<li class="sorder-item" draggable="' + (busy ? 'false' : 'true')
    + '" data-sorder="' + esc(k) + '">'
    + '<span class="sorder-grip" aria-hidden="true">⠿</span>'
    + '<span class="sorder-name">' + esc(labelOf(k)) + '</span>'
    + '<span class="sorder-moves">'
    + button('server-order-top', '⤒', 'data-block="' + esc(k) + '" aria-label="' + esc(labelOf(k))
        + ' 맨 위로" title="맨 위로" ' + (busy || i === 0 ? 'disabled' : ''), 'btn sm sorder-edge')
    + button('server-order-bottom', '⤓', 'data-block="' + esc(k) + '" aria-label="' + esc(labelOf(k))
        + ' 맨 아래로" title="맨 아래로" ' + (busy || i === list.length - 1 ? 'disabled' : ''), 'btn sm sorder-edge')
    + button('server-order-up', '▲', 'data-block="' + esc(k) + '" aria-label="' + esc(labelOf(k))
        + ' 위로" ' + (busy || i === 0 ? 'disabled' : ''), 'btn sm')
    + button('server-order-down', '▼', 'data-block="' + esc(k) + '" aria-label="' + esc(labelOf(k))
        + ' 아래로" ' + (busy || i === list.length - 1 ? 'disabled' : ''), 'btn sm')
    + (ADMIN_KEEP.includes(k) ? '' : button('server-block-delete', '×', 'data-block="' + esc(k) + '" aria-label="' + esc(labelOf(k))
        + ' 블록 삭제" title="' + esc(labelOf(k)) + ' 블록 삭제" ' + (busy ? 'disabled' : ''), 'btn sm sorder-del'))
    + '</span>' + itemRows(s, k, busy) + '</li>').join('') + lockedRows(s)
}

/** 블록 안의 항목 — 한 줄에 하나, 길면 말줄임(전체 문구는 title). 최소 개수에 닿으면 지울 수 없다 */
function itemRows(s, k, busy) {
  if (!ITEM_SELECTORS[k]) return ''
  const items = itemElements(s, k)
  if (!items.length) return ''
  const removed = s.direct.removeItems[k] || []
  const atMinimum = items.length - removed.length <= (ITEM_MINIMUMS[k] || 0)
  const why = atMinimum ? labelOf(k) + ' 항목은 최소 ' + (ITEM_MINIMUMS[k] || 0) + '개가 필요해요' : labelOf(k) + ' 항목 삭제'
  const visible = items.map((el, index) => ({ text: el.textContent.trim().replace(/\s+/g, ' '), index }))
    .filter(({ index }) => !removed.includes(index))
  // 맞바꾸기 단추 — 위 · 아래 이웃(지워지지 않은 항목)과. 못 하는 이유는 title 로 말한다
  const swap = (index, withIndex, label) => {
    const plan = withIndex == null ? { why: label === '위' ? '맨 위 항목이에요' : '맨 아래 항목이에요' } : swapPlan(s, k, index, withIndex)
    const off = busy || !plan.pairs
    return button('server-item-swap', label === '위' ? '▲' : '▼', 'data-block="' + esc(k) + '" data-index="' + index + '" data-with="' + (withIndex ?? '')
      + '" aria-label="' + esc(labelOf(k)) + ' 항목을 ' + label + ' 항목과 내용 맞바꾸기" title="' + esc(plan.pairs ? label + ' 항목과 내용 맞바꾸기' : plan.why) + '" '
      + (off ? 'disabled' : ''), 'btn sm sorder-swap')
  }
  return '<span class="sorder-items">' + visible
    .map(({ text, index }, p) => '<span class="sorder-subitem"><span class="sorder-subtext" title="' + esc(text) + '">' + esc(text) + '</span>'
      + '<span class="sorder-swaps">' + swap(index, visible[p - 1]?.index, '위') + swap(index, visible[p + 1]?.index, '아래') + '</span>'
      + button('server-item-delete', '×', 'data-block="' + esc(k) + '" data-index="' + index + '" aria-label="' + esc(labelOf(k))
        + ' 항목 삭제" title="' + esc(why) + '" ' + (busy || atMinimum ? 'disabled' : ''), 'btn sm sorder-del') + '</span>').join('')
    + '</span>'
}

/** 목록만 다시 그린다 — 전체를 그리면 고치던 문구 칸의 포커스가 날아간다 */
function paintOrder(s) {
  const busy = running(s) || s.busy
  const ol = $('#server-order')
  if (ol) ol.innerHTML = orderItems(s, busy)
  const undo = $('#server-undo')
  if (undo) undo.disabled = busy || !s.direct.history.length
}

/* ── 페이지 배치 · 영역 모양 ────────────────────────────────────
 *
 * ★ 모델을 부르지 않는다. 고르는 것이 class 이름 하나라 서버가 바로 붙인다 (블록 순서와 같다).
 * ★ 선택지는 미리보기 응답의 looks 다 — 지금 페이지에서 못 고르는 것과 그 이유까지 서버가 준다.
 *   여기서는 조건(영역 수 · 항목 수)을 다시 적지 않는다.
 */

const looksOf = (s) => s.preview?.looks || null

/** 지금 화면에 보이는 값 — 고친 게 있으면 그것, 없으면 저장된 것 */
const layoutNow = (s) => s.direct.layout || looksOf(s)?.layout || STACK
const variantNow = (s, k) => s.direct.variants[k] ?? looksOf(s)?.blocks?.[k]?.variant ?? ''

/** 저장된 값과 달라진 것만 — 요청 본문에 그대로 실린다 */
function changedLooks(s) {
  const L = looksOf(s)
  if (!L || L.template) return null
  const layout = s.direct.layout && s.direct.layout !== L.layout ? s.direct.layout : null
  const variants = {}
  Object.entries(s.direct.variants).forEach(([k, v]) => { if (L.blocks[k] && v !== L.blocks[k].variant) variants[k] = v })
  const n = (layout ? 1 : 0) + Object.keys(variants).length
  return n ? { layout, variants, count: n } : null
}

function pickLayout(s, cls) {
  const L = looksOf(s)
  const opt = L?.layouts.find((l) => l.cssClass === cls)
  if (!opt || L.template) return
  if (opt.blocked && cls !== L.layout) { toast(opt.blocked); return }
  s.direct.layout = cls === L.layout ? null : cls
  syncLooks(s)
}

function pickVariant(s, key, cls) {
  const L = looksOf(s)
  const b = L?.blocks[key]
  if (!b || L.template) return
  const why = b.variants.find((v) => v.cssClass === cls)?.blocked
  if (why) { toast(why); syncLooks(s); return }
  s.direct.variants[key] = cls
  syncLooks(s)
}

/** 고른 것을 화면 세 곳(옆 패널 · 미리보기 · 미리보기 도구줄)에 맞춘다. 전체를 다시 그리지 않는다 */
function syncLooks(s) {
  paintLooks(s)
  previewLooks(s)
  updateDirectCount(s)
}

/** 미리보기 iframe 의 class 만 바꾼다 — 서버 Looks.apply 가 저장할 모양과 같다 */
function previewLooks(s) {
  const L = looksOf(s)
  const frame = $('.event-frame')
  const root = frame?.contentDocument?.querySelector('.ev-container, .event-page')
  if (!L || L.template || !root) return
  const layout = layoutNow(s)
  L.layouts.forEach((l) => root.classList.toggle(l.cssClass, l.cssClass === layout && layout !== STACK))
  Object.entries(L.blocks).forEach(([k, b]) => {
    const sec = [...root.children].find((el) => el.matches('section[data-block="' + k + '"]'))
    if (!sec) return
    const variant = variantNow(s, k)
    b.variants.forEach((v) => sec.classList.toggle(v.cssClass, v.cssClass === variant))
  })
  frame.nvToolsRefresh?.()
}

const layoutOptions = (s) => looksOf(s).layouts.map((l) => ({
  cssClass: l.cssClass, label: l.label, blocked: l.cssClass === looksOf(s).layout ? null : l.blocked,
  title: LAYOUTS.find((x) => x.cssClass === l.cssClass)?.hint || l.desc,
}))

const variantSelect = (s, k, b, dis) => '<select data-svariant="' + esc(k) + '" ' + dis + ' aria-label="' + esc(labelOf(k)) + ' 모양">'
  + '<option value=""' + (variantNow(s, k) === '' ? ' selected' : '') + '>기본 모양</option>'
  + b.variants.map((v) => '<option value="' + esc(v.cssClass) + '"' + (variantNow(s, k) === v.cssClass ? ' selected' : '')
    + (v.blocked ? ' disabled title="' + esc(v.blocked) + '"' : '') + '>' + esc(v.desc) + (v.blocked ? ' (항목 부족)' : '') + '</option>').join('')
  + '</select>'

/**
 * 모양을 아이콘으로 — 맨 앞이 기본 모양(class 없음)이다.
 * 항목이 모자라 못 쓰는 모양은 흐리게 그린다. disabled 로 막지 않는다 — 눌렀을 때 이유를 알려 준다
 */
const variantPicks = (s, k, b, dis) => '<div class="var-fold"><div class="lay-picks var-picks" role="group" aria-label="' + esc(labelOf(k)) + ' 모양">'
  + [{ cssClass: '', desc: '기본 모양' }, ...b.variants].map((v) => {
    const on = variantNow(s, k) === v.cssClass
    return '<button type="button" class="lay-pick' + (on ? ' active' : '') + (v.blocked ? ' blocked' : '') + '" data-act="server-variant" data-block="' + esc(k)
      + '" data-variant="' + esc(v.cssClass) + '" aria-pressed="' + on + '"' + (v.blocked ? ' aria-disabled="true"' : '')
      + ' title="' + esc(v.blocked || v.desc) + '" ' + dis + '>' + variantIcon(v.cssClass) + '<span>' + esc(shortName(v.cssClass, v.desc)) + '</span></button>'
  }).join('') + '</div><button type="button" class="var-more" data-act="server-variant-more" data-block="' + esc(k) + '" hidden></button></div>'

/** 펼쳐 둔 영역 — 다시 그려도 펼친 채로 둔다 */
const openLooks = new Set()

/**
 * 아이콘이 한 줄을 넘으면 첫 줄만 보이고 '더 보기'를 단다.
 * ★ 한 줄에 몇 개 들어가는지는 패널 너비에 따라 달라서 그린 뒤 실제 위치로 잰다.
 * ★ 지금 고른 모양이 접힌 쪽에 있으면 첫 줄 끝으로 당겨 보인다 (CSS order) — 고른 것이 안 보이면 안 된다.
 *   펼치면 원래 순서로 돌아간다
 */
function foldLooks() {
  document.querySelectorAll('#server-looks .var-fold').forEach((fold) => {
    const picks = fold.querySelector('.var-picks'), more = fold.querySelector('.var-more')
    const items = [...picks.children]
    picks.classList.remove('folded')
    picks.style.maxHeight = ''
    items.forEach((el) => { el.style.order = '' })
    const tops = [...new Set(items.map((el) => el.offsetTop))].sort((a, b) => a - b)
    if (tops.length <= 1) { more.hidden = true; return }
    const shown = items.filter((el) => el.offsetTop < tops[1]).length
    const open = openLooks.has(more.dataset.block)
    if (!open) {
      const active = items.findIndex((el) => el.classList.contains('active'))
      if (active >= shown) {
        items.forEach((el, i) => { el.style.order = String(i * 2) })
        items[active].style.order = String((shown - 1) * 2 - 1)
      }
      picks.classList.add('folded')
      picks.style.maxHeight = items[0].offsetHeight + 'px'
    }
    more.hidden = false
    more.textContent = open ? '접기' : '더 보기 (' + (items.length - shown) + ')'
    more.setAttribute('aria-expanded', String(open))
  })
}

/**
 * 모양을 고를 수 있는 영역만. 아이콘을 그려 둔 영역(제목·소개 · 혜택 · 경품 · 참여 방법 · 일정 · 자주 묻는 질문 · 참여 버튼)은 아이콘으로,
 * 나머지는 이름 목록으로 보여 준다
 */
function lookRows(s, busy) {
  const dis = busy ? 'disabled' : ''
  return Object.entries(looksOf(s).blocks).filter(([, b]) => b.variants.length).map(([k, b]) => (hasVariantIcons(b.variants)
    ? '<div class="look-block"><span class="look-name">' + esc(labelOf(k)) + '</span>' + variantPicks(s, k, b, dis) + '</div>'
    : '<div class="look-row"><span class="look-name">' + esc(labelOf(k)) + '</span>' + variantSelect(s, k, b, dis) + '</div>')).join('')
}

/** 배치 · 모양 본문 — 직접 수정에서는 접기(토글) 안에 넣는다 */
function looksHTML(s, busy) {
  const L = looksOf(s)
  if (!L) return ''
  if (L.template) {
    return '<p class="helper">템플릿으로 만든 페이지는 배치 · 모양을 바꿀 수 없어요. 문구와 순서는 바꿀 수 있어요.</p>'
  }
  return '<div class="sedit-group"><div class="sedit-subhead">페이지 배치</div><div id="server-layouts">'
    + layoutPicks('server-layout', layoutNow(s), layoutOptions(s), busy) + '</div>'
    + '<p class="helper">흐린 배치는 지금 영역 수로는 쓸 수 없어요. 누르면 이유를 알려드려요.</p></div>'
    + '<div class="sedit-group"><div class="sedit-subhead">영역 모양</div><div class="look-rows" id="server-looks">' + lookRows(s, busy) + '</div>'
    + '<p class="helper">미리보기에서 영역에 마우스를 올려도 바꿀 수 있어요.</p></div>'
}

/**
 * 접기(토글) 한 칸. 열림 상태는 s.direct.folds 에 기억하고, 아직 건드린 적 없으면 defaultOpen 을 따른다.
 *   idx    이 칸이 품은 문구 번호들 — 있으면 "변경됨" 표시를 입력에 맞춰 실시간으로 켜고 끈다 (updateGroupMarks)
 *   count  제목 옆에 붙는 문구 개수
 *   sub    문구 수정 안의 영역별 칸 (들여쓰기·작은 머리글)
 */
function foldSection(s, key, title, body, mark, { defaultOpen = false, sub = false, idx = null, count = null, note = '', preview = '' } = {}) {
  if (!body) return ''
  const open = (s.direct.folds?.[key] ?? defaultOpen) ? ' open' : ''
  const badge = idx
    ? '<span class="sedit-fold-mark"' + (mark ? '' : ' hidden') + '>변경됨</span>'
    : (mark ? ' <span class="sedit-fold-mark">' + esc(mark) + '</span>' : '')
  const num = count != null ? '<span class="sedit-fold-count">' + count + '개</span>' : ''
  // note: 머리글 오른쪽의 짧은 안내(예: 수정만 가능). preview: 접어 둬도 무슨 문구가 들었는지 알려 주는 한 줄
  const tag = note ? '<span class="sedit-fold-note">' + esc(note) + '</span>' : ''
  const peek = preview ? '<span class="sedit-fold-preview">' + esc(preview) + '</span>' : ''
  return '<details class="sedit-fold' + (sub ? ' sedit-subfold' : '') + '" data-fold="' + key + '"'
    + (idx ? ' data-idx="' + idx.join(',') + '"' : '') + (count != null ? ' data-n="' + count + '"' : '')
    + (defaultOpen ? ' data-def="1"' : '') + open + '>'
    + '<summary>' + title + num + tag + badge + peek + '</summary><div class="sedit-fold-body">' + body + '</div></details>'
}

/** 문구 하나를 고쳤거나 서식을 건드렸는가 */
function isEdited(s, i) {
  const before = editable(s)[i]?.before ?? ''
  return normalize(s.direct.values[i] ?? before) !== normalize(before) || Object.keys(s.direct.formats?.[i] || {}).length > 0
}

/** 접힌 칸 머리글의 "변경됨" — 접어 두어도 어디를 고쳤는지 보이게 */
function updateGroupMarks(s) {
  document.querySelectorAll('details.sedit-fold[data-idx]').forEach((el) => {
    const mark = el.querySelector(':scope > summary .sedit-fold-mark')
    if (mark) mark.hidden = !el.dataset.idx.split(',').some((i) => isEdited(s, Number(i)))
  })
}

/**
 * 접힌 칸 안의 칸을 열어 보이게 한다.
 * ★ 접힌 <details> 안의 textarea 는 scrollHeight 가 0 이라 자동 높이가 2px 로 접힌다 —
 *   열 때 다시 맞춘다. 미리보기에서 글자를 눌러 찾아 들어갈 때도 부모 칸을 먼저 연다.
 */
function revealField(el) {
  for (let d = el.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true
  el.closest('.sedit-fold-body')?.querySelectorAll('textarea[data-autogrow]').forEach(grow)
}

function bindDirectFolds(s) {
  document.querySelectorAll('details.sedit-fold[data-fold]').forEach((el) => {
    el.addEventListener('toggle', () => {
      if (ui.serverEditor !== s || !s.direct) return
      if (el.open) el.querySelectorAll('textarea[data-autogrow]').forEach(grow)
      // 검색 때문에 억지로 연 칸은 기억하지 않는다 — 검색을 지우면 사람이 정해 둔 상태로 돌아가야 한다
      if (el.dataset.forced) return
      s.direct.folds = s.direct.folds || {}
      s.direct.folds[el.dataset.fold] = el.open
    })
  })
}

/** 사람이 정해 둔 열림 상태 — 건드린 적 없으면 처음 기본값 */
const foldWanted = (s, el) => s.direct.folds?.[el.dataset.fold] ?? el.dataset.def === '1'

/**
 * 문구 검색 — s.direct.query 가 든 칸만 남기고, 맞는 영역은 펴서 보여 준다.
 * ★ 전체를 다시 그리지 않는다(입력 포커스 유지). 그린 직후에도 같은 함수로 맞춘다.
 * ★ 검색 때문에 연 칸은 data-forced 로 표시해 folds 에 기억하지 않는다. 검색을 지우면 원래대로 접힌다.
 */
function applyTextFilter(s) {
  const q = (s.direct.query || '').trim().toLowerCase()
  const force = (el, on) => {
    if (on) { el.dataset.forced = '1'; el.open = true }
    else if (el.dataset.forced) { delete el.dataset.forced; el.open = foldWanted(s, el) }
  }
  let total = 0
  document.querySelectorAll('details.sedit-subfold').forEach((d) => {
    let n = 0
    d.querySelectorAll('.sedit-item').forEach((item) => {
      const hit = !q || (item.querySelector('textarea')?.value || '').toLowerCase().includes(q)
      item.hidden = !hit
      if (hit) n++
    })
    d.hidden = !!q && n === 0
    const count = d.querySelector(':scope > summary .sedit-fold-count')
    if (count) count.textContent = q ? n + '개 일치' : d.dataset.n + '개'
    force(d, !!q && n > 0)
    total += n
  })
  const outer = document.querySelector('details[data-fold="texts"]')
  if (outer) force(outer, !!q)
  const none = $('#server-text-none')
  if (none) none.hidden = !(q && total === 0)
}

function paintLooks(s) {
  const L = looksOf(s)
  if (!L || L.template) return
  markPick($('#server-layouts'), layoutNow(s))
  // 고르던 select 의 포커스를 지킨다 — 다시 그리지 않고 값만 맞춘다
  const rows = $('#server-looks')
  rows?.querySelectorAll('select[data-svariant]').forEach((el) => { el.value = variantNow(s, el.dataset.svariant) })
  rows?.querySelectorAll('[data-act="server-variant"]').forEach((el) => {
    const on = variantNow(s, el.dataset.block) === el.dataset.variant
    el.classList.toggle('active', on)
    el.setAttribute('aria-pressed', String(on))
  })
  // 미리보기 도구줄에서 접힌 쪽 모양을 골랐을 수 있다 — 고른 것을 다시 보이게
  foldLooks()
}

/**
 * 미리보기 도구줄(frame.js 의 server-edit 모드)이 올린 영역에 무엇을 보여 줄지 묻는다.
 * 유의사항 · 작업 중에는 null — 도구줄을 안 띄운다
 */
function toolsOf(s, key) {
  if (ui.serverEditor !== s || s.tab !== 'direct' || running(s) || s.busy || key === 'notices') return null
  const L = looksOf(s)
  const b = L && !L.template ? L.blocks[key] : null
  const order = currentOrder(s), at = order.indexOf(key)
  const movable = at >= 0 && order.length > 1
  return {
    label: labelOf(key),
    move: movable ? { up: at > 0, down: at < order.length - 1 } : null,
    // 끌어서 옮길 수 있는 영역과, 놓을 수 있는 자리(= 지금 옮길 수 있는 영역 순서). 고정 영역은 둘 다 없다
    drag: movable,
    blocks: movable ? order : null,
    // 항목을 끌어 내용을 옮길 수 있는 영역 — 보이는 항목이 둘 이상일 때 (지운 항목은 센 뒤 손잡이를 안 그린다)
    items: SWAPPABLE.includes(key) && itemElements(s, key).filter((el) => el.getClientRects().length).length > 1
      ? itemElements(s, key) : null,
    variants: b?.variants.length ? b.variants : null,
    variant: variantNow(s, key),
  }
}

/** 미리보기 도구줄에서 누른 것 — main.js 가 nv-tool 을 넘긴다 */
function handleServerTool(ev) {
  const s = ui.serverEditor
  const { block, tool, value } = ev.detail || {}
  if (!s || s.tab !== 'direct' || running(s) || s.busy || !block) return
  if (tool === 'up') nudgeBlock(s, block, -1)
  else if (tool === 'down') nudgeBlock(s, block, 1)
  // 끌어 놓기 — value 는 그 앞에 놓을 영역, 빈 값이면 맨 끝
  else if (tool === 'move' && !PINNED_BLOCKS.includes(block)) moveBlock(s, block, value || null)
  // 항목 끌어 놓기 — value 는 '옮길 항목 번호:놓은 항목 번호'
  else if (tool === 'item-move') {
    const [from, to] = String(value || '').split(':').map(Number)
    if (Number.isInteger(from) && Number.isInteger(to)) moveItemContent(s, block, from, to)
  } else if (tool === 'variant') pickVariant(s, block, value ?? '')
}

async function applyDirect(rerender) {
  const s = ui.serverEditor
  if (!s?.preview || running(s) || s.busy) return
  const invalidSize = [...document.querySelectorAll('[data-text-format="size"]')].find((el) => el.value !== '' && !el.checkValidity())
  if (invalidSize) {
    toast('글자 크기는 10~96px 사이의 정수로 입력해주세요.')
    revealField(invalidSize)
    invalidSize.focus()
    return
  }
  const { edits, buttonStyle, textStyle, order, looks, removeBlocks, removeItems } = directChanges(s)
  if (hasEmptyNoticeEdit(s, edits)) {
    toast('유의사항은 빈칸으로 저장할 수 없어요. 내용을 입력해주세요.')
    return
  }
  if (!edits.length && !buttonStyle && !textStyle && !order && !looks && !removeBlocks.length && !Object.keys(removeItems).length) { toast('바꾼 내용이 없어요.'); return }
  // ★ 지운 항목의 지금 문구는 다시 그리기 전에 읽는다 — 그린 뒤에는 미리보기가 새로 떠서 찾을 수 없다(빈 문구가 간다)
  const removeItemsBody = Object.keys(removeItems).length
    ? Object.fromEntries(Object.entries(removeItems).map(([key, indices]) => [key,
      indices.map((index) => ({ index, before: itemElements(s, key)[index]?.textContent.trim().replace(/\s+/g, ' ') || '' }))]))
    : null
  s.busy = true
  rerender()
  try {
    const r = await directEdit(s.id, {
      sourceVersionId: s.preview.versionId,
      ...(edits.length ? { edits } : {}),
      ...(buttonStyle ? { buttonStyle } : {}),
      ...(textStyle ? { textStyle } : {}),
      ...(order ? { blockOrder: order } : {}),
      ...(removeBlocks.length ? { removeBlocks } : {}),
      ...(removeItemsBody ? { removeItems: removeItemsBody } : {}),
      ...(looks?.layout ? { layout: looks.layout } : {}),
      ...(looks && Object.keys(looks.variants).length ? { variants: looks.variants } : {}),
    })
    await refreshPage(s)
    toast('v' + r.versionNo + ' 로 저장했어요.')
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
  previewDeletes(s)
  rerender()
}

function hasEmptyNoticeEdit(s, edits) {
  const collected = textsOf(s.preview.html)
  return edits.some((edit) => collected[edit.index]?.block === 'notices' && !edit.after.trim())
}

const previewTextNodes = new WeakMap()

/** 서버 순서로 한 번 연결한 노드는 블록 위치가 바뀌어도 그대로 사용한다. */
function liveTexts(s) {
  const doc = $('.event-frame')?.contentDocument
  if (!doc) return null
  const cached = previewTextNodes.get(doc)
  if (cached?.versionId === s.preview.versionId && cached.list.every((t) => t.node.isConnected)) return cached.list
  const list = doc ? collectTexts(doc.body) : []
  if (!list.length) return null
  previewTextNodes.set(doc, { versionId: s.preview.versionId, list })
  return list
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

const textBaseStyles = new WeakMap()

/** 문구별 서식은 전용 span에만 적용한다. */
function previewItemFormats(s) {
  const live = liveTexts(s)
  if (!live) return
  Object.entries(s.direct.formats || {}).forEach(([i, format]) => {
    const node = live[i]?.node
    if (!node) return
    const textVal = s.direct.values[i] ?? node.data
    setPreviewText(node, i, textVal)
    const holder = node.parentElement
    if (!textBaseStyles.has(holder)) textBaseStyles.set(holder, holder.getAttribute('style') || '')
    holder.setAttribute('style', textBaseStyles.get(holder))
    if (format.reset) ['color', '-webkit-text-fill-color', 'font-size', 'font-weight'].forEach((key) => holder.style.removeProperty(key))
    if (format.color) {
      holder.style.setProperty('color', format.color)
      holder.style.setProperty('-webkit-text-fill-color', format.color)
    }
    if (format.size != null && format.size !== '') holder.style.setProperty('font-size', format.size + 'px')
    if (format.bold != null && format.bold !== '') holder.style.setProperty('font-weight', format.bold ? '700' : '400')
  })
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

const TITLE_SIZE = { small: '28px', medium: '36px', large: '46px', xlarge: '58px' }
const HEADING_SIZE = { small: '18px', medium: '22px', large: '27px', xlarge: '32px' }

/**
 * 제목 디자인을 미리보기에 바로 — 서버 DirectEditor.applyTextStyle 과 **같은 값**이다.
 *
 * ★★ 이게 없으면 고르고 나서 아무 일도 안 일어난다. 저장해야만 보이는데
 *   저장 전에는 맞는지 알 수가 없다 — 참여 버튼이 이미 같은 이유로 이걸 갖고 있다.
 * ★ 끌 때를 위해 **원래 style 을 기억해 둔다.** 안 하면 체크를 풀어도 색이 안 돌아온다.
 * ★ -webkit-text-fill-color 도 같이 건다. 글자를 투명하게 두고 배경을 깎아 넣는 변형이
 *   있어서(v-hero-gradient-text) color 만으로는 아무 일도 안 일어난다.
 */
function previewTextStyle(s) {
  const doc = $('.event-frame')?.contentDocument
  if (!doc) return
  const { textStyle } = directChanges(s)
  const paint = (els, color, size, table) => els.forEach((el) => {
    if (el.dataset.nvBaseStyle === undefined) el.dataset.nvBaseStyle = el.getAttribute('style') || ''
    el.setAttribute('style', el.dataset.nvBaseStyle)
    if (color) {
      el.style.setProperty('color', color)
      el.style.setProperty('-webkit-text-fill-color', color)
    }
    if (size && table[size]) el.style.setProperty('font-size', table[size])
  })
  paint([...doc.querySelectorAll('[data-block="hero"] h1')],
    textStyle?.titleColor, textStyle?.titleSize, TITLE_SIZE)
  // ★ hero 안의 h2 는 소제목이 아니다 — 서버(applyTextStyle)와 같은 기준이다
  paint([...doc.querySelectorAll('[data-block] h2, [data-block] .block-header .title')]
    .filter((el) => !el.closest('[data-block="hero"]')),
    textStyle?.headingColor, textStyle?.headingSize, HEADING_SIZE)
}

function updateDirectCount(s) {
  const { edits, buttonStyle, textStyle, order, looks } = directChanges(s)
  // ★★ textStyle 을 안 세서 **저장 버튼이 안 켜졌다.** 제목 디자인만 바꾸면
  //   "바꾼 항목 없음" 이 뜨고 버튼이 disabled 로 남는다 — 미리보기가 아니라 이쪽이 진짜 원인이었다
  const n = edits.length + (buttonStyle ? 1 : 0) + (textStyle ? 1 : 0)
    + (order ? 1 : 0) + (looks?.count || 0) + s.direct.removeBlocks.length
    + Object.values(s.direct.removeItems).reduce((sum, xs) => sum + xs.length, 0)
  const el = $('#server-direct-count')
  if (el) el.textContent = n ? '바꾼 항목 ' + n + '개' : '바꾼 항목 없음'
  updateGroupMarks(s)
  const apply = $('[data-act="server-direct-apply"]')
  if (apply) apply.disabled = !n || running(s) || s.busy
}

/* ───────────────────────── 북마크 추가 ───────────────────────── */

const isSaved = (s) => !!s.preview && (s.versions || []).some(
  (v) => String(v.versionId) === String(s.preview.versionId) && v.checkpoint,
)

async function saveCurrent(rerender) {
  const s = ui.serverEditor
  if (!s?.preview || running(s) || s.busy || isSaved(s)) return
  s.busy = true
  rerender()
  try {
    await saveCheckpoint(s.id, s.preview.versionId)
    s.versions = (await loadVersions(s.id)).versions
    toast('v' + s.preview.versionNo + ' 에 북마크를 추가했어요.')
  } catch (e) {
    toast(e?.message || '북마크를 추가하지 못했어요.')
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

/** 게시할 수 있는 전체 버전 — 최신 버전을 맨 위에 표시한다 */
function publishChoices(s) {
  const saved = s.versions || []
  const list = []
  if (s.preview) {
    const row = saved.find((v) => v.versionId === s.preview.versionId)
    list.push({ versionId: s.preview.versionId, versionNo: s.preview.versionNo, latest: true, saved: !!row?.checkpoint, published: !!row?.published })
  }
  saved.forEach((v) => {
    if (v.versionId !== s.preview?.versionId) list.push({ versionId: v.versionId, versionNo: v.versionNo, latest: false, saved: !!v.checkpoint, published: v.published })
  })
  return list
}

const choiceLabel = (c) => 'v' + c.versionNo + (c.latest ? ' · 최신' : '') + (c.published ? ' · 게시 중' : '') + (c.saved ? ' · 북마크' : '')

function publishSummary(s, c) {
  const e = s.event
  const cur = publishedVersion(s)
  return '<div class="publish-card"><strong>' + esc(e.name) + '</strong><br>'
    + dotted(e.startAt) + ' ~ ' + dotted(e.endAt) + ' · ' + esc(gradeLabel(e.grade)) + '<br>'
    + (cur ? '현재 게시 v' + cur.versionNo + ' → ' : '미게시 → ') + '선택 v' + c.versionNo + '</div>'
    + (c.published ? '<p class="review-note">이미 게시 중인 버전이에요. 다른 버전을 골라주세요.</p>' : '')
    + (c.saved ? '' : '<p class="review-note">게시하면 이 버전에 북마크가 자동으로 추가돼요.</p>')
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
  PENDING: ['pending', '진행 중'],
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

/** 생성 화면의 배치 선택지 — 맨 앞이 자동 */
const genLayoutOptions = () => [
  { cssClass: '', label: '자동', title: 'AI 가 내용에 맞춰 골라요', icon: icon('sparkle') },
  ...LAYOUTS.map((l) => ({ cssClass: l.cssClass, label: l.label, title: l.hint + (l.min ? ' 내용 영역 ' + l.min + '개 이상.' : '') })),
]

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
  // 배치 — 자동이면 AI 가 고른다. 고르면 서버가 그 배치로 건다 (영역이 모자라면 기본 배치로 만든다)
  const layouts = e.template ? '' : '<div class="field"><span>페이지 배치</span><div id="server-gen-layouts">'
    + layoutPicks('server-gen-layout', s.genLayout || '', genLayoutOptions(), busy) + '</div>'
    + '<span class="helper">자동은 AI 가 내용에 맞춰 골라요. 영역이 모자라 쓸 수 없는 배치는 기본 배치로 만들어져요.</span></div>'
  return (s.request && !hasPage ? '<p class="workspace-tip">요청: ' + esc(s.request) + '</p>' : '')
    + form + layouts
    + '<div class="row">' + button('server-generate', (e.template ? icon('grid') : icon('sparkle')) + (hasPage ? '처음부터 다시 만들기' : '페이지 만들기'),
        busy ? 'disabled' : '', hasPage ? 'btn sm' : 'btn primary') + '</div>'
}

const TONE ={ FAILED: 'tone-fail', ASK_BACK: 'tone-ask', CANCELLED: 'tone-ask' }

/** AI 대화 — 대화 · 다시 만들기는 스크롤, 입력칸은 아래 고정 */
function chatPanel(s) {
  const busy = running(s)
  const tags = (m) => (m.blocks?.length ? '<span class="bubble-tags">' + m.blocks.map((k) => '<span>' + esc(labelOf(k)) + '</span>').join('') + '</span>' : '')
  // 바뀐 곳 — 누르면 미리보기가 그 영역으로 간다. 이전 모습 비교는 가장 최근 수정에만 붙는다
  const changes = (m, last) => (m.changes?.length
    ? '<span class="bubble-changes">' + m.changes.map((c) => (c.key && c.kind !== 'removed'
      ? button('server-change-go', '<b>' + esc(c.label) + '</b><span>' + esc(c.summary) + '</span><em>보기</em>', 'data-block="' + esc(c.key) + '"', 'change-item')
      : '<span class="change-item static"><b>' + esc(c.label) + '</b><span>' + esc(c.summary) + '</span></span>')).join('')
      + (last && s.compare && s.compare.versionId === s.preview?.versionId
        ? button('server-compare', icon('layers') + '<span>' + (s.showBefore ? '변경 후 모습 보기' : '이전 모습과 비교') + '</span>', 'aria-pressed="' + !!s.showBefore + '"', 'change-compare')
        : '')
      + '</span>'
    : '')
  const history = chatOf(s.id)
  const lastWithChanges = history.map((m) => !!m.changes).lastIndexOf(true)
  const log = history.map((m, i) => {
    const statusLabel = m.tone && m.tone !== 'DONE'
      ? RESULT[m.tone]?.[1]
      : null

    const speaker = m.role === 'user'
      ? '관리자'
      : 'NewVent 어시스턴트' + (statusLabel ? ' · ' + statusLabel : '')

    return '<div class="bubble '
      + (m.role === 'user' ? 'me' : TONE[m.tone] || '')
      + '"><small>'
      + esc(speaker)
      + '</small>'
      + tags(m)
      + esc(m.text)
      + changes(m, i === lastWithChanges)
      + '</div>'
  }).join('')
  return '<div class="server-scroll" id="server-scroll">'
    + (s.chatError
      ? '<p class="helper" role="alert">'
        + esc(s.chatError)
        + ' 편집 화면을 다시 열면 재조회합니다.</p>'
      : '')
    + '<div class="chat" id="chat-log" role="log" aria-label="AI 대화" aria-live="polite">' + log + '</div>'
    + '</div>'
    + '<form class="server-foot" id="server-chat-form" aria-busy="' + busy + '">'
    + '<div id="server-selection">' + selectionHTML(s, busy) + '</div>'
    // 처음부터 다시 만드는 중 — 입력칸을 같이 쓰므로 지금 무엇을 쓰는 칸인지 적어 둔다.
    // 돌아갈 길도 같이 둔다. 없으면 수정하려다 페이지를 통째로 새로 만들게 된다
    + (s.regen
      ? '<p class="restart-hint">처음부터 다시 만드는 중이에요 — 어떤 이벤트인지 적고 <strong>입력</strong>을 눌러주세요. '
        + button('server-restart-cancel', '수정으로 돌아가기', 'type="button"', 'linklike') + '</p>'
      : '')
    + '<label class="field">'
    + '<textarea id="server-chat" rows="3" aria-label="' + (s.regen ? '새로 만들 내용' : '수정 요청') + '" maxlength="' + REQUEST_MAX + '" placeholder="' + esc(chatPlaceholder(s)) + '" ' + (busy ? 'disabled' : '') + '>'
    + esc(s.chatInput || '') + '</textarea></label>'
    + assetStrip(s)
    // 안내는 버튼 줄 위에 둔다 — 같은 줄에 두면 좁은 패널에서 「입력」이 아래로 밀린다
    + '<p class="foot-meta" title="수정은 항상 최신 버전을 기준으로 해요">'
    + '<span class="keyhint">Ctrl + Enter로 보내기</span> · <span id="server-chat-count">'
    + (s.chatInput || '').length + ' / ' + REQUEST_MAX + '자</span></p>'
    // 한 줄에 넷 — 이미지 추가 · 예시 찾기 · 새로 시작하기 (왼쪽), 입력 (오른쪽)
    + '<div class="foot-row">'
    + assetAdd(s)
    + button('server-rag-examples', '예시 찾기', 'type="button" ' + (busy ? 'disabled' : ''), 'foot-btn')
    + button('server-restart', '새로 시작하기', 'type="button" ' + (busy ? 'disabled' : ''), 'foot-btn')
    + '<button class="btn primary sm foot-send" type="submit" ' + (busy ? 'disabled' : '') + '>' + (busy ? '처리 중…' : '입력') + '</button></div></form>'
}

/**
 * 이미지 올리기 + — 입력칸 옆.
 *
 * ★ <label> 이 <input type=file> 을 품고 있다. 누르면 브라우저가 알아서 창을 띄운다 —
 *   click() 을 부르는 자바스크립트가 필요 없고, 막힌 상태(disabled)도 저절로 먹는다.
 */
function assetAdd(s) {
  const busy = running(s) || s.assetBusy
  return '<label class="chat-add" title="PNG · JPG · GIF · WEBP, 3MB 까지">'
    + (s.assetBusy ? icon('clock') + '올리는 중…' : '이미지 추가')
    + '<input type="file" id="server-asset-file" accept="' + ASSET_ACCEPT + '" ' + (busy ? 'disabled' : '') + '></label>'
}

/**
 * 올린 이미지의 **고정 번호**. 서버가 행에 박아 둔 값이다 (EventAsset.seq).
 *
 * ★★ i + 1 로 세면 안 된다. 1번을 지우는 순간 2번이 1번이 되고,
 *   "1번 이미지를 배경으로" 가 **다른 사진**을 가리킨다 — 제보로 올라온 문제가 그거다.
 * ★ 옛 응답(seq 없음)에는 순서로 버틴다. 새로 올리면 서버가 번호를 준다.
 */
function assetNo(a, i) {
  return a.seq ?? i + 1
}

/**
 * 올린 이미지 목록 — 입력칸 위.
 *
 * ★★ 번호가 핵심이다. 프롬프트에도 같은 번호로 실린다(Asset.promptLines) —
 *   관리자가 "2번 이미지를 배경으로" 라고 쓸 수 있는 유일한 끈이다.
 *
 * ★★ 페이지에 들어간 사진은 **배지로 접는다.** 전에는 흐리게만 해서 입력칸 위가
 *   계속 사진으로 막혀 있었다. 그렇다고 목록에서 빼면 "1번 이미지 지워줘" 를 쓸 수 없다 —
 *   번호는 살리고 자리만 비우는 쪽이 맞다. 배지를 누르면 그 사진만 다시 펼친다.
 */
function assetStrip(s) {
  const list = s.assets || []
  if (!list.length) return ''
  const busy = running(s) || s.assetBusy
  // ★ 페이지에 이미 들어간 것인지. 미리보기 HTML 에 그 주소가 박혀 있으면 쓰인 것이다
  const html = s.preview?.html || ''
  const used = (a) => html.includes(a.url)

  const del = (a, n) => button('server-asset-delete', '×',
    'data-id="' + esc(a.assetId) + '" aria-label="' + n + '번 이미지 지우기" ' + (busy ? 'disabled' : ''),
    'chat-asset-x')

  const thumb = (a, n, isUsed) => '<span class="chat-asset' + (isUsed ? ' is-used' : '') + '">'
    + '<img src="' + esc(a.url) + '" alt="">'
    + '<b class="chat-asset-no">' + n + '</b>'
    + (isUsed ? '<b class="chat-asset-used" title="페이지에 들어가 있어요">' + icon('check') + '</b>' : '')
    + del(a, n) + '</span>'

  // 들어간 사진 — 번호 + 체크만. 누르면 펼친다
  const badge = (a, n) => button('server-asset-peek', n + icon('check'),
    'data-id="' + esc(a.assetId) + '" title="' + n + '번 — 페이지에 들어가 있어요. 눌러서 사진 보기"'
    + ' aria-label="' + n + '번 이미지 보기"', 'chat-asset-done')

  const cells = list.map((a, i) => {
    const n = assetNo(a, i)
    const open = s.assetPeek === a.assetId
    return used(a) && !open ? badge(a, n) : thumb(a, n, used(a))
  }).join('')

  // ★ 안내는 **아직 안 쓴 게 있을 때만**. 다 넣고 나서도 계속 "넣으세요" 가 떠 있으면
  //   안 들어간 줄 알고 같은 말을 또 하게 된다
  const left = list.filter((a) => !used(a))
  const hint = left.length
    ? '올리기만 해서는 안 들어가요 — "' + assetNo(left[0], list.indexOf(left[0])) + '번 이미지를 배경으로 깔아줘" 처럼 말해 주세요'
    : '모두 페이지에 들어갔어요. 번호를 누르면 사진을 볼 수 있어요. 빼려면 "배경 이미지 없애줘" 처럼 말해 주세요'
  return '<div class="chat-assets">' + cells
    + '<span class="helper chat-assets-hint">' + hint + '</span></div>'
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
    if (s.direct.removeBlocks.includes(block)) return
    if (grouped && ITEM_SELECTORS[block] && (s.direct.removeItems[block] || []).some((index) => {
      const node = collected[i]?.node
      const section = node?.parentElement?.closest('[data-block="' + block + '"]')
      const item = section ? [...section.querySelectorAll(ITEM_SELECTORS[block])][index] : null
      return item && item.contains(node)
    })) return
    if (!groups.length || groups.at(-1).block !== block) groups.push({ block, items: [] })
    groups.at(-1).items.push({ ...t, index: i })
  })
  const field = (t) => {
    const v = s.direct.values[t.index] ?? t.before
    const changed = normalize(v) !== normalize(t.before)
    const attrs = 'class="sedit' + (changed ? ' changed' : '') + '" data-sedit="' + t.index + '" ' + (busy ? 'disabled' : '')
      + ' aria-label="' + esc(t.before.slice(0, 30) || '문구 ' + t.index) + '"'
    // Enter 입력을 허용하고 내용 높이만큼 칸을 늘린다.
    const input = '<textarea rows="1" data-autogrow ' + attrs + '></textarea>'
    // 번호 = 서버 editableTexts 의 index (직접 수정 요청에 그대로 실린다)
    return '<div class="sedit-item"><span class="sedit-no' + (changed ? ' changed' : '') + '" data-sedit-no="' + t.index
      + '" title="문구 번호 ' + t.index + '">' + t.index + '</span><div>' + input + itemFormatHTML(s, t, busy) + '</div></div>'
  }
  // ★ 영역별 문구는 접는다 — 문구가 수십 개면 "페이지 배치 · 영역 모양" 같은 아래 칸까지 한참 내려가야 했다.
  //   처음엔 머리글(영역 이름 · 문구 개수 · 변경됨)만 보이고 누르면 펴진다. 영역을 못 나눈 경우(하나뿐)만 펴 둔다
  const fields = groups.map((g) => {
    const idx = g.items.map((t) => t.index)
    // 접힌 머리글 아래 한 줄 — 앞의 문구 몇 개를 보여 줘서 열어 보지 않고도 어느 영역인지 알게 한다
    const peek = g.items.map((t) => t.before.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 3).join(' · ')
    return foldSection(s, 'text:' + g.block, esc(g.block === 'all' ? '문구' : BLOCK_LABELS[g.block] || g.block),
      g.items.map(field).join(''), idx.some((i) => isEdited(s, i)) ? '변경됨' : '',
      { defaultOpen: groups.length === 1, sub: true, idx, count: g.items.length, preview: peek, note: g.block === 'notices' ? '수정만 가능' : '' })
  }).join('')
  // 검색 · 모두 펼치기/접기 — 문구가 수십 개라 영역을 하나씩 열어 찾기 어렵다
  const tools = '<div class="sedit-tools"><input type="search" id="server-text-q" class="sedit-search" placeholder="문구 검색 (예: 응원)"'
    + ' aria-label="문구 검색" autocomplete="off" value="' + esc(s.direct.query || '') + '">'
    + button('server-folds-open', '모두 펼치기', '', 'sedit-tool') + button('server-folds-close', '모두 접기', '', 'sedit-tool') + '</div>'
    + '<p class="sedit-none" id="server-text-none" hidden>일치하는 문구가 없어요.</p>'
  const allIdx = groups.flatMap((g) => g.items.map((t) => t.index))
  const textsMark = allIdx.some((i) => isEdited(s, i)) ? '변경됨' : ''
  const hasCta = /data-slot="cta-link"/.test(s.preview.html)
  const st = s.direct.style, on = s.direct.styleOn
  const dis = busy ? 'disabled' : ''
  // ★ 한 줄 = 설정 하나. 색은 [직접 지정 스위치 · 색 칸], 크기 · 모양은 한 번에 보이는 단추 줄(라디오)이다.
  //   값은 예전과 같은 data-sstyle · data-sstyle-on 으로 읽는다 — 라디오도 change 의 t.value 가 고른 값이다
  //   색 칸 아래에 같은 색의 코드 입력줄(# 16진수 · R · G · B)을 둔다 — 색 고르기로는 정확한 색을 맞추기 어렵다.
  //   코드 칸은 색 칸과 같은 값을 보여 주고, 쓰면 색 칸을 직접 고른 것과 똑같이 처리한다 (applyColorCode)
  const color = (k, label, def) => {
    const hex = parseHex(st[k] || def) || def, rgb = hexToRgb(hex) || { r: 0, g: 0, b: 0 }
    const code = (part, text, extra) => '<input type="text" data-scolor="' + k + '" data-part="' + part + '" value="' + esc(text) + '" ' + dis + extra + '>'
    const num = (part, name, v) => '<label class="sstyle-rgb"><span aria-hidden="true">' + name + '</span><input type="number" min="0" max="255" step="1" inputmode="numeric" data-scolor="'
      + k + '" data-part="' + part + '" value="' + v + '" ' + dis + ' aria-label="' + label + ' ' + name + ' (0~255)"></label>'
    return '<div class="sstyle-row has-codes"><span class="sstyle-label">' + label + '</span><span class="sstyle-ctl">'
      + '<label class="sstyle-toggle" title="켜면 고른 색을, 끄면 테마 색을 따라요"><input type="checkbox" role="switch" data-sstyle-on="' + k + '" '
      + (on[k] ? 'checked' : '') + ' ' + dis + ' aria-label="' + label + ' 직접 지정"><span class="sstyle-state"></span></label>'
      + '<input type="color" data-sstyle="' + k + '" value="' + esc(hex) + '" ' + dis + ' aria-label="' + label + '"></span>'
      + '<span class="sstyle-codes">' + code('hex', hex, ' class="sstyle-hex" maxlength="7" spellcheck="false" autocomplete="off" placeholder="#rrggbb" aria-label="' + label + ' 16진수 색 코드"')
      + num('r', 'R', rgb.r) + num('g', 'G', rgb.g) + num('b', 'B', rgb.b) + '</span></div>'
  }
  const select = (k, label, opts) => '<div class="sstyle-row stack"><span class="sstyle-label">' + label + '</span>'
    + '<div class="sstyle-seg" role="radiogroup" aria-label="' + label + '">'
    + [['', '그대로'], ...opts].map(([v, t]) => '<label><input type="radio" name="sstyle-' + k + '" data-sstyle="' + k + '" value="' + v + '" '
      + ((st[k] || '') === v ? 'checked' : '') + ' ' + dis + '><span>' + t + '</span></label>').join('') + '</div></div>'
  const styleBody = hasCta ? '<div class="sstyle-list">'
    + color('background', '배경색', '#0284c7') + color('color', '글자색', '#ffffff')
    + select('size', '크기', [['small', '작게'], ['medium', '보통'], ['large', '크게']])
    + select('shape', '모양', [['square', '각지게'], ['round', '둥글게'], ['pill', '알약형']]) + '</div>' : ''

  /**
   * ★★ 제목 글자 크기 · 색. 모델이 못 하는 자리라서 여기 있다 —
   *   글자 크기와 색은 CSS 가 쥐고 있어서, 모델에게 시키면 "강조했습니다" 라고
   *   보고하고 화면은 그대로다(실측). 관리자가 고른 값을 인라인으로 박는 길만 확실하다.
   * ★ 색은 체크를 해야 들어간다. 안 하면 테마를 따른다 — 참여 버튼과 같은 약속이다.
   */
  const TSIZES = [['small', '작게'], ['medium', '보통'], ['large', '크게'], ['xlarge', '아주 크게']]
  const textBody = '<div class="sstyle-list">'
    + color('titleColor', '큰 제목 색', '#0f172a') + select('titleSize', '큰 제목 크기', TSIZES)
    + color('headingColor', '소제목 색', '#15803d') + select('headingSize', '소제목 크기', TSIZES)
    + '</div><p class="helper sstyle-help">색을 직접 지정하면 분위기 · 색감을 바꿔도 그 색이 유지돼요. 스위치를 끄면 다시 테마 색을 따라가요.</p>'

  // 문구가 먼저, 배치·모양·디자인은 접기 — 꼭 고칠 문구가 가려지지 않게
  const dirty = directChanges(s)
  const looksMark = dirty.looks ? '변경됨' : ''
  const orderMark = dirty.order ? '변경됨' : ''
  const titleMark = dirty.textStyle ? '변경됨' : ''
  const buttonMark = dirty.buttonStyle ? '변경됨' : ''
  const design = foldSection(s, 'looks', '페이지 배치 · 영역 모양', looksHTML(s, busy), looksMark)
    + foldSection(s, 'order', '블록 순서 · 삭제', orderHTML(s, busy), orderMark)
    + foldSection(s, 'title', '제목 디자인', textBody, titleMark)
    + foldSection(s, 'button', '참여 버튼 디자인', styleBody, buttonMark)

  return '<div class="server-scroll" id="server-scroll">'
    + '<p class="workspace-tip">미리보기에서 <b>고칠 글자를 누르면</b> 해당 칸이 열려요. 아래에서 영역을 골라도 돼요.</p>'
    + (grouped ? '' : '<p class="helper" style="margin-bottom:10px">영역 구분을 불러오지 못해 문구를 순서대로 보여줘요.</p>')
    + '<div id="server-direct">'
    + foldSection(s, 'texts', '문구 수정', tools + fields, textsMark, { defaultOpen: true, idx: allIdx, count: allIdx.length })
    + '</div>'
    // 문구 밖의 설정은 한 묶음으로 — 주 작업(문구)과 부가 작업(배치 · 디자인)이 한눈에 갈린다
    + (design ? '<p class="sedit-design-head">디자인 · 배치</p>' + design : '')
    + '</div>'
    + '<div class="server-foot"><div class="foot-row" style="margin-top:0"><span class="helper" id="server-direct-count"></span>'
    + '<div class="row" style="gap:6px">' + button('server-direct-reset', '되돌리기', dis, 'btn sm')
    + button('server-direct-apply', s.busy ? '저장하는 중…' : '변경 저장', 'disabled', 'btn primary sm') + '</div></div>'
    + '<p class="helper" style="margin-top:6px;font-weight:500">저장하면 새 버전이 만들어져요.</p></div>'
}

function itemFormatHTML(s, t, busy) {
  const patch = s.direct.formats?.[t.index] || {}
  const saved = patch.reset ? {} : t.format || {}
  const color = patch.color || saved.color || '#222222'
  const size = patch.size ?? (saved['font-size'] ? parseInt(saved['font-size'], 10) : '')
  const bold = patch.bold ?? (saved['font-weight'] ? Number(saved['font-weight']) >= 600 : null)
  const attrs = ' data-text-index="' + t.index + '" ' + (busy ? 'disabled' : '')
  return '<details class="sedit-format"><summary>문구 서식</summary><div class="sedit-format-tools">'
    + '<label>글자색 <input type="color" data-text-format="color" value="' + esc(color) + '"' + attrs + '></label>'
    + '<label>크기(px) <input type="number" min="10" max="96" step="1" placeholder="기본" data-text-format="size" value="' + esc(size) + '"' + attrs + '></label>'
    + '<label>굵기 <select data-text-format="bold"' + attrs + '><option value="">그대로</option><option value="true" ' + (bold === true ? 'selected' : '') + '>굵게</option><option value="false" ' + (bold === false ? 'selected' : '') + '>보통</option></select></label>'
    + button('server-text-format-reset', '서식 초기화', 'data-index="' + t.index + '" ' + (busy ? 'disabled' : ''), 'btn sm')
    + '</div><span class="helper">서식 초기화는 문구별 서식만 제거해요. 변경 저장 시 새 버전에 반영돼요.</span></details>'
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

const compareBarHTML = (s) => '<div class="compare-bar" role="status">' + icon('layers') + '<span>AI 수정 전'
  + (s.compare.versionNo ? ' v' + s.compare.versionNo : '') + ' 모습이에요. 수정은 변경 후 모습에서 할 수 있어요.</span></div>'

/**
 * 이전 모습 비교를 켜고 끈다 — 화면 전체를 다시 그리지 않는다.
 *
 * ★ 다시 그리면 미리보기 iframe 요소를 새로 만든다. 새 문서가 뜰 때까지 빈 화면이 보여서 깜빡인다.
 *   같은 iframe 의 srcdoc 만 바꾸면 새 문서가 준비될 때까지 옛 화면이 그대로 남아 있다.
 * ★ 문서를 만드는 길은 하나다 — serverFrame 이 찍어 둔 자리표시자에서 꺼낸다. 샌드박스 · 모드도 거기서 가져온다.
 * ★ 이전 모습은 읽기 전용이라 샌드박스 권한이 다르다. sandbox 는 다음 이동(srcdoc 교체)부터 적용된다.
 */
function toggleCompare(s) {
  const frame = $('.event-frame')
  if (!s.compare || !frame) return
  s.showBefore = !s.showBefore
  const before = comparing(s)
  const mode = before ? 'readonly' : (s.tab === 'direct' ? 'server-edit' : 'server-select')
  const holder = document.createElement('div')
  holder.innerHTML = serverFrame(before ? s.compare.before : s.preview.html, before ? 'AI 수정 전 미리보기' : '이벤트 미리보기', mode)
  const staged = holder.firstElementChild
  const doc = takeStagedDocument(staged.dataset.doc)
  if (doc === undefined) { s.showBefore = !s.showBefore; return }

  // 새 문서의 높이가 다를 수 있다 — 보던 자리로 스크롤을 맞춘다 (같은 iframe 이라 높이가 바뀔 때 다시 맞춘다)
  restoreCanvasScroll(s, $('.canvas'))
  frame.dataset.mode = mode
  frame.setAttribute('sandbox', staged.getAttribute('sandbox') || '')
  frame.setAttribute('title', staged.getAttribute('title') || '')
  // 영역 선택 · 바뀐 곳 외곽선은 새 문서에 다시 입힌다
  frame.addEventListener('load', () => { if (!comparing(s)) paintSelection(s); paintChanges(s) }, { once: true })
  frame.srcdoc = doc

  // 안내 줄 · 버튼 글자 · 힌트 — 자리에서 맞춘다
  const bar = document.querySelector('.compare-bar')
  if (before && !bar) $('.canvas')?.insertAdjacentHTML('beforebegin', compareBarHTML(s))
  if (!before) bar?.remove()
  const button = $('.change-compare')
  if (button) {
    button.setAttribute('aria-pressed', String(before))
    const label = button.querySelector('span')
    if (label) label.textContent = before ? '변경 후 모습 보기' : '이전 모습과 비교'
  }
  const hint = $('.preview-edit-hint')
  if (hint) hint.hidden = before
}

function previewPanel(s) {
  const p = s.preview
  const published = (s.versions || []).find((v) => v.published)
  const before = comparing(s)
  const body = p
    // ★ fit — 페이지 전체를 한 화면에 줄여 보여 준다. 줄이는 계산은 preview/frame.js 의 fitCanvasFrame
    // ★ 이전 모습은 읽기 전용이다 — 영역을 고르거나 문구를 고칠 수 없게 한다
    ? (before ? compareBarHTML(s) : '')
      + '<div class="canvas"><div class="canvas-frame ' + (ui.mobile ? 'mobile' : '') + (ui.fit ? ' fit' : '') + '">'
      + (before
        ? serverFrame(s.compare.before, 'AI 수정 전 미리보기', 'readonly')
        : serverFrame(p.html, '이벤트 미리보기', s.tab === 'direct' ? 'server-edit' : 'server-select'))
      + '</div></div>'
    : '<div class="empty"><strong>아직 만들어진 페이지가 없어요</strong><p>왼쪽에서 페이지를 만들어보세요.</p></div>'
  return '<div class="studio-preview-column"><section class="panel"><div class="preview-controls">'
    + '<div class="preview-status-line">'
    + '<span class="preview-label">미리보기</span>'
    + (p
      ? '<span class="preview-current">현재 v' + p.versionNo + '</span>'
        + '<span class="preview-save-state' + (isSaved(s) ? '' : ' is-unsaved') + '">'
        + (isSaved(s) ? '★ 북마크됨' : '북마크 없음') + '</span>'
      : '')
    + (published
      ? '<span class="preview-published">게시 중 v' + published.versionNo + '</span>'
      : '')
    + '</div>'
    // 이전 모습을 볼 때는 숨기기만 한다 — 자리는 남겨 둬야 비교를 끌 때 다시 그리지 않고 보여 줄 수 있다
    + (p && s.tab === 'chat'
      ? '<span class="preview-edit-hint"' + (before ? ' hidden' : '') + '>' + icon('sparkle') + '수정할 영역을 선택하세요</span>'
      : '')
    + '<div class="device-controls">'
    + (p ? button('preview-fit', icon('layers') + '<span>전체 보기</span>', 'aria-pressed="' + !!ui.fit
        + '" title="페이지 전체를 한 화면에 맞춰 봐요"', 'btn sm fit-toggle ' + (ui.fit ? 'active' : '')) : '')
    + button('device', icon('desktop'), 'data-mode="desktop" aria-label="데스크톱 미리보기"', 'btn sm ' + (!ui.mobile ? 'active' : ''))
    + button('device', icon('phone'), 'data-mode="mobile" aria-label="모바일 미리보기"', 'btn sm ' + (ui.mobile ? 'active' : ''))
    + '</div></div>' + body + '</section></div>'
}

/**
 * 목록으로 — 편집 화면 머리말에서는 **아이콘만** 쓴다 (compact).
 *
 * ★ 머리말은 한 줄이다. 글자까지 두면 이벤트명이 그만큼 일찍 잘린다.
 * ★ 아이콘만 남기면 화면에 이름이 없어지므로 aria-label · title 을 반드시 단다 —
 *   낭독기와 마우스 둘 다 "어디로 가는 버튼인지" 를 알아야 한다.
 * ★ 불러오는 중 · 실패 화면(loadingView)은 그대로 글자를 쓴다. 거기는 이 버튼
 *   하나뿐이라 줄을 아낄 이유가 없고, 아이콘만 덩그러니 두면 막막하다.
 */
const backToList = (compact = false) => button('route',
  icon('back') + (compact ? '' : '이벤트 관리'),
  'data-route="admin" aria-label="이벤트 관리로 돌아가기" title="이벤트 관리로 돌아가기"',
  compact ? 'backlink backlink-icon' : 'backlink')

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

function canEndEvent(s) {
  return s?.status === 'ready'
    && s.event?.ownedByMe === true
    && s.event.status === 'PUBLISHED'
}

function openEndEvent() {
  const s = ui.serverEditor
  if (!canEndEvent(s) || running(s) || s.busy) return

  modal(
    '이벤트 종료',
    '<p><strong>' + esc(s.event.name) + '</strong> 이벤트를 종료할까요?</p>'
      + '<p style="margin-top:12px">'
      + '종료하면 사용자 참여가 중단되며, 다시 게시하거나 수정할 수 없습니다.'
      + '</p>',
    button('close', '취소')
      + button(
          'server-end-confirm',
          '종료하기',
          'data-id="' + esc(s.id) + '"',
          'btn primary'
        )
  )
}

async function confirmEndEvent(eventId, rerender) {
  const s = ui.serverEditor

  // 확인창을 열었던 이벤트에만 요청한다.
  if (!s || s.id !== String(eventId)
      || !canEndEvent(s) || running(s) || s.busy) return

  s.busy = true
  closeModal()
  rerender()

  try {
    const updated = await endEvent(s.id)
    s.event = updated

    // 종료된 이벤트는 현재 게시 중인 버전 표시를 해제한다.
    if (s.versions) {
      s.versions = s.versions.map((v) => ({ ...v, published: false }))
    }

    resetAdminServer()
    toast('이벤트를 종료했어요.')
  } catch (e) {
    toast(e?.message || '이벤트를 종료하지 못했어요.')
  } finally {
    s.busy = false
    if (ui.serverEditor === s) rerender()
  }
}

// 서버 시각을 한국 시간의 날짜·시간 문자열로 변환한다.
function infoDateValue(value) {
  if (!value) return ''
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return ''
  return new Date(time + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
}

function openEventInfo() {
  const s = ui.serverEditor
  if (!s || s.status !== 'ready' || running(s) || s.busy) return
  if (isEnded(s)) {
    toast('종료된 이벤트는 수정할 수 없어요.')
    return
  }

  const e = s.event
  const startValue = infoDateValue(e.startAt)
  const endValue = infoDateValue(e.endAt)

  const options = GRADES.map((g) =>
    '<option value="' + g.code + '" '
    + (e.grade === g.code ? 'selected' : '') + '>'
    + esc(g.label) + '</option>'
  ).join('')

  modal(
    '이벤트 기본 정보 수정',
    '<form id="server-info-form">'
      + '<label class="field"><span>이벤트명</span>'
      + '<span class="helper">페이지에 표시되는 제목이에요.</span>'
      + '<input name="name" value="' + esc(e.name)
      + '" required maxlength="100"></label>'
      + '<div class="admin-datetime-widget admin-info-period">'
      + eventRangePicker(
        startValue.slice(0, 10),
        endValue.slice(0, 10),
        {
          creation: true,
          startTime: startValue.slice(11, 16),
          endTime: endValue.slice(11, 16),
        },
      )
      + '</div>'
      + '<label class="field"><span>참여 등급</span>'
      + '<select name="grade">' + options + '</select>'
      + '<span class="helper" data-info-grade-description></span>'
      + '</label>'
      + '<p id="server-info-error" role="alert"></p>'
      + '</form>',
    button('close', '취소')
      + '<button type="submit" form="server-info-form" '
      + 'class="btn primary">저장</button>'
  )

  const form = document.getElementById('server-info-form')
  const gradeSelect = form.querySelector('[name="grade"]')
  const gradeDescription = form.querySelector('[data-info-grade-description]')

  const descriptions = {
    NORMAL: '모든 회원이 참여할 수 있어요.',
    EXCELLENT: '우수·최우수 회원이 참여할 수 있어요.',
    BEST: '최우수 회원만 참여할 수 있어요.',
  }

  const syncGradeDescription = () => {
    gradeDescription.textContent = descriptions[gradeSelect.value] || ''
  }

  gradeSelect.addEventListener('change', syncGradeDescription)
  syncGradeDescription()
}

async function saveEventInfo(form, rerender) {
  const s = ui.serverEditor
  if (!s || running(s) || s.busy ) return
  if (!form.reportValidity()) return
  
  const data = new FormData(form)
  const name = String(data.get('name') || '').trim()
  const combineDateTime = (dateKey, timeKey, original) => {
    const date = String(data.get(dateKey) || '')
    const time = String(data.get(timeKey) || '')
    if (!date || !time) return ''

    const originalTime = infoDateValue(original).slice(11)
    const fullTime = time === originalTime.slice(0, 5)
      ? originalTime
      : time + ':00'

    return date + 'T' + fullTime
  }

  const startValue = combineDateTime('from', 'startTime', s.event.startAt)
  const endValue = combineDateTime('to', 'endTime', s.event.endAt)
  const grade = String(data.get('grade') || '')
  const error = form.querySelector('#server-info-error')
  const showError = (message) => { error.textContent = message }

  if (!name) {
    showError('이벤트명을 입력해주세요.')
    return
  }

  const startAt = new Date(startValue + '+09:00')
  const endAt = new Date(endValue + '+09:00')

  if (!Number.isFinite(startAt.getTime())
      || !Number.isFinite(endAt.getTime())
      || endAt <= startAt) {
    showError('종료 일시는 시작 일시보다 늦어야 해요.')
    return
  }

  const body = {}

  if (name !== s.event.name) body.name = name

  if (startAt.getTime() !==
      Math.floor(new Date(s.event.startAt).getTime() / 1000) * 1000) {
    body.startAt = startAt.toISOString()
  }

  if (endAt.getTime() !==
      Math.floor(new Date(s.event.endAt).getTime() / 1000) * 1000) {
    body.endAt = endAt.toISOString()
  }

  if (grade !== s.event.grade) body.grade = grade

  if (!Object.keys(body).length) {
    showError('변경한 내용이 없어요.')
    return
  }

  const submit = document.querySelector(
    'button[type="submit"][form="server-info-form"]'
  )
  s.busy = true
  submit.disabled = true
  submit.textContent = '저장 중…'
  showError('')

  try {
    const updated = await updateEventInfo(s.id, body)
    s.event = updated
    resetAdminServer()
    // 참여 설정 화면이 들고 있는 종료일도 낡았다 — 안 비우면 발표 시각을 옛 종료일로 검사한다
    if (ui.participants?.eventId === String(s.id)) ui.participants = null
    closeModal()
    toast('이벤트 기본 정보를 수정했어요.')

    try {
      s.preview = await loadPreview(s.id)
    } catch {
      toast('저장은 완료됐지만 미리보기를 새로 불러오지 못했어요.')
    }
  } catch (e) {
    showError(e?.message || '기본 정보를 수정하지 못했어요.')
  } finally {
    s.busy = false
    if (submit.isConnected) {
      submit.disabled = false
      submit.textContent = '저장'
    }
    if (ui.serverEditor === s) rerender()
  }
}

function serverEditorView() {
  const s = ui.serverEditor
  const pending = loadingView(s)
  if (pending) return pending
  const e = s.event
  const busy = running(s) || s.busy
  const saved = isSaved(s)
  return '<div class="container studio-container workspace">'
    + '<div class="workspace-toolbar"><div class="workspace-title">'
    + backToList(true)
    + '<strong>' + esc(e.name) + '</strong>'
    + '<div class="workspace-event-meta">'
    + '<span class="workspace-event-status">' + badgeOf(serverStatus(e)) + '</span>'
    + '<span>' + dotted(e.startAt) + ' ~ ' + dotted(e.endAt) + '</span>'
    + '<span>' + esc(gradeLabel(e.grade)) + '</span>'
    + '<span>ID ' + esc(e.id) + '</span>'
    + '</div></div>'
    + '<div class="row workspace-actions">'
    + (canEndEvent(s)
        ? button('server-end', '이벤트 종료', busy ? 'disabled' : '', 'btn sm')
        : '')
    + button('server-info', '기본 정보 수정', busy || isEnded(s) ? 'disabled' : '', 'btn sm')
    + button('versions', '버전 이력', 'data-id="' + e.id + '"', 'btn sm')
    + button('server-save', saved ? '북마크됨' : '북마크 추가', (!s.preview || saved || busy) ? 'disabled' : '', 'btn sm')
    + button('server-publish', isPublished(s) ? '재게시' : '게시하기',
        !s.preview ? 'disabled title="먼저 페이지를 만들어주세요"'
          : isEnded(s) ? 'disabled title="종료된 이벤트는 게시할 수 없어요"'
            : busy ? 'disabled' : '', 'btn primary sm')
    + '</div></div>'
    + '<div class="studio-layout workspace-layout">' + sidePanel(s) + previewPanel(s) + '</div></div>'
}

/** 그린 뒤 — 직접 수정 칸 개수 · 버튼 상태, 대화·창 스크롤 복원 */
function afterServerRender() {
  const s = ui.serverEditor
  if (!s || ui.route !== 'editor' || s.status !== 'ready') return
  const scroller = $('#server-scroll')
  if (scroller && s.tab === 'chat') {
    // 보낸 직후·맨 아래 근처면 최신 말풍선으로, 아니면 읽던 자리 유지 (상단으로 튀지 않게)
    const stick = s.chatStickBottom || s.chatScroll?.stickBottom || !s.chatScroll
    scroller.scrollTop = stick ? scroller.scrollHeight : s.chatScroll.top
    s.chatStickBottom = false
  }
  if (scroller && s.tab === 'direct' && s.direct.scrollTop != null) {
    scroller.scrollTop = s.direct.scrollTop
  }
  const canvas = $('.canvas')
  restoreCanvasScroll(s, canvas)
  bindCanvasScroll(s, canvas)
  requestAnimationFrame(() => {
    if (ui.serverEditor !== s) return
    const y = s.tab === 'direct' ? (s.direct.windowScrollY ?? s.windowScrollY) : s.windowScrollY
    if (y != null) window.scrollTo(0, y)
  })
  document.querySelectorAll('textarea[data-autogrow]').forEach((el) => {
    if (el.dataset.sedit !== undefined) {
      const index = Number(el.dataset.sedit)
      el.value = s.direct.values[index] ?? editable(s)[index]?.before ?? ''
    }
    grow(el)
  })
  if (s.tab === 'direct') {
    applyTextFilter(s)
    updateDirectCount(s)
    bindDirectFolds(s)
    foldLooks()
    const frame = $('.event-frame')
    // 미리보기 도구줄이 올린 영역에 보여 줄 것을 여기서 묻는다 (frame.js 의 server-edit 모드)
    if (frame) frame.nvTools = (key) => toolsOf(s, key)
    // 고치던 값 · 바꾼 순서 · 배치가 남아 있으면 (탭 전환 · 기기 전환) 새 iframe 에도 다시 입힌다
    const applyAll = () => {
      replayDirect(s); previewButtonStyle(s); previewTextStyle(s); previewItemFormats(s); previewOrder(s); previewLooks(s); previewDeletes(s)
    }
    if (frame) {
      if (frame.contentDocument?.readyState === 'complete') applyAll()
      frame.addEventListener('load', applyAll, { once: true })
    }
  } else {
    // 고른 영역 외곽선 — 새 iframe(새 버전 · 기기 전환)에도 다시 입힌다
    const frame = $('.event-frame')
    if (frame) frame.addEventListener('load', () => { if (!comparing(s)) paintSelection(s); paintChanges(s) }, { once: true })
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
  Object.entries(s.direct.values).forEach(([i, v]) => { if (live[i]) setPreviewText(live[i].node, i, v) })
}

function setPreviewText(node, index, value) {
  if (!node.parentElement.matches('span[id^="nv-direct-text-"]')) {
    const holder = node.ownerDocument.createElement('span')
    let id = 'nv-direct-text-' + index
    while (node.ownerDocument.getElementById(id)) id += '-next'
    holder.id = id
    node.replaceWith(holder)
    holder.appendChild(node)
  }
  node.parentElement.style.whiteSpace = 'pre-line'
  node.data = normalize(value)
}

/* ───────────────────────── 입력 · 동작 ───────────────────────── */

/** main.js 의 click 위임에서 부른다. 처리했으면 true */
function handleServerClick(a, b, rerender) {
/* ────────────────────── RAG 예시 찾기 ────────────────────── */

/** 예시 찾기 — 참고 예시(내 이벤트 문구) + 프롬프트 초안(다른 이벤트)을 한 모달에.
 * 두 API 는 따로 돌린다. 위는 그대로 담기, 아래는 추가 형태로 담기.
 */
function ragRow(title, desc, copyText) {
  return '<div class="rag-rec-row"><div class="rag-rec-text"><p class="rag-rec-title">' + esc(title) + '</p>'
    + '<p class="rag-rec-desc">' + esc(desc) + '</p></div>'
    + button('server-rag-copy', '담기', 'data-text="' + esc(copyText) + '"', 'btn sm primary') + '</div>'
}

/** 초안에서 예시 내용만 뽑는다 — 앞의 작성 가이드는 버린다.
    형식: "{가이드} {형태} (예시: {내용})" → "{내용}" */
function ragExample(prompt) {
  const s = String(prompt ?? '')
  const i = s.indexOf('(예시:')
  if (i < 0) return s
  return s.slice(i + 4).replace(/\)\s*$/, '').trim()
}

/** 문구를 키워드로 축약 — 짧은 구·숫자·기호 강조구만 최대 3개 */
function ragKeywords(text) {
  return String(text ?? '').split(/[.。!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s && (s.length <= 25 || /[0-9%GB]/.test(s) || /[★♪🎉💯🎅▶]/.test(s)))
    .slice(0, 3)
    .join(' / ')
}

/** 결과 칸 — 모달 안에서 검색어만 바꿔 다시 부른다 */
function ragResultBox(id, tip) {
  return '<div id="' + id + '"><p class="helper">' + tip + '</p></div>'
}

async function fillBox(id, load) {
  const box = document.getElementById(id)
  if (!box) return
  box.innerHTML = '<p class="helper">불러오는 중…</p>'
  try {
    box.innerHTML = await load()
  } catch (e) {
    box.innerHTML = '<p>' + esc(e?.message || '불러오지 못했어요.') + '</p>'
  }
}

async function openRagExamples() {
  const title = ui.serverEditor?.event?.name ?? ''
  modal('예시 찾기',
    '<div class="rag-board-head"><p class="helper">위에서 고른 문구는 그대로, 아래 초안은 추가 형태로 채팅창에 들어갑니다.</p>'
    + '<div class="rag-board-search"><input id="rag-q" type="search" value="' + esc(title) + '" placeholder="키워드 입력" aria-label="예시 검색어">'
    + button('server-rag-examples-run', icon('search'), 'aria-label="예시 검색"', 'btn sm') + '</div></div>'
    + '<h4 class="rag-sec">내 이벤트 문구</h4>' + ragResultBox('rag-mine', '이벤트명으로 찾는 중…')
    + '<h4 class="rag-sec">다른 이벤트 초안</h4>' + ragResultBox('rag-others', '이벤트명으로 찾는 중…'),
    button('close', '닫기'), true)
  document.getElementById('rag-q')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') runRagExamples() })
  if (title.trim()) runRagExamples()
}

async function runRagExamples() {
  const s = ui.serverEditor
  const q = document.getElementById('rag-q')?.value?.trim()
  if (!q) { toast('검색어를 입력해주세요.'); return }
  fillBox('rag-mine', async () => {
    const res = await searchRagPreview(s.id, q)
    const items = res?.results ?? []
    return items.length
      ? items.map((c) => {
        const kw = ragKeywords(c.content) || c.content
        return ragRow(labelOf(c.blockKey ?? ''), kw, kw)
      }).join('')
      : '<p>비슷한 문구가 없어요.</p>'
  })
  fillBox('rag-others', async () => {
    const items = await loadPromptDrafts(s.id, q, 10)
    if (!Array.isArray(items) || !items.length) return '<p>초안이 없어요. 검색어를 바꿔보세요.</p>'
    const rows = items.map((d) => {
      const label = labelOf(d.blockKey ?? '')
      const ex = ragExample(d.prompt)
      const kw = ragKeywords(ex) || ex
      const add = '‘' + label + '’ 영역에 추가해줘: ' + kw
      return ragRow(d.eventTitle ?? '', '[' + label + '] ' + kw, add)
    }).join('')
    return '<p class="helper">초안 ' + items.length + '건</p>' + rows
  })
}

  const s = ui.serverEditor
  switch (a) {
    case 'server-rag-examples': openRagExamples(); return true
    case 'server-rag-examples-run': runRagExamples(); return true
    case 'server-rag-copy': {
      // 예시 칩과 같은 길 — 복사한 문구를 채팅 입력창에 넣는다
      const input = $('#server-chat')
      if (s && input && !input.disabled) {
        const text = b.dataset.text || ''
        s.chatInput = (input.value ? input.value + ' ' : '') + text
        input.value = s.chatInput
        input.focus()
        onChatInput(s.chatInput)
      }
      return true
    }
    case 'server-generate': regenerate(rerender); return true
    case 'server-restart': askRestart(); return true
    case 'server-restart-confirm': startOver(rerender); return true
    case 'server-restart-cancel':
      if (s) { s.regen = false; rerender() }
      return true
    case 'server-cancel': cancel(); return true
    case 'server-reload': reloadServerEditor(rerender); return true
    case 'server-save': saveCurrent(rerender); return true
    case 'server-tab':
      if (s && s.tab !== b.dataset.tab) { s.tab = b.dataset.tab === 'direct' ? 'direct' : 'chat'; rerender() }
      return true
    case 'server-change-go': if (s) goToBlock(b.dataset.block); return true
    case 'server-folds-open':
    case 'server-folds-close': {
      const on = a === 'server-folds-open'
      document.querySelectorAll('details.sedit-subfold:not([hidden])').forEach((d) => { d.open = on })
      return true
    }
    case 'server-compare':
      if (s?.compare) toggleCompare(s)
      return true
    case 'server-unselect':
      if (s && !running(s)) { s.selected = s.selected.filter((k) => k !== b.dataset.block); paintSelection(s) }
      return true
    case 'server-unselect-all':
      if (s && !running(s)) { s.selected = []; paintSelection(s) }
      return true
    case 'server-layout': if (s && !running(s) && !s.busy) pickLayout(s, b.dataset.layout); return true
    case 'server-variant': if (s && !running(s) && !s.busy) pickVariant(s, b.dataset.block, b.dataset.variant || ''); return true
    case 'server-variant-more': {
      const key = b.dataset.block
      if (openLooks.has(key)) openLooks.delete(key)
      else openLooks.add(key)
      foldLooks()
      return true
    }
    case 'server-gen-layout':
      if (s && !running(s)) { s.genLayout = b.dataset.layout || ''; markPick($('#server-gen-layouts'), s.genLayout) }
      return true
    case 'server-order-up': if (s) nudgeBlock(s, b.dataset.block, -1); return true
    case 'server-order-down': if (s) nudgeBlock(s, b.dataset.block, 1); return true
    case 'server-order-top': if (s && !running(s) && !s.busy) moveToEdge(s, b.dataset.block, 'top'); return true
    case 'server-order-bottom': if (s && !running(s) && !s.busy) moveToEdge(s, b.dataset.block, 'bottom'); return true
    case 'server-undo': if (s && !running(s) && !s.busy) undoLast(s, rerender); return true
    case 'server-item-swap':
      if (s && !running(s) && !s.busy && b.dataset.with !== '') swapItems(s, b.dataset.block, Number(b.dataset.index), Number(b.dataset.with))
      return true
    case 'server-block-delete': if (s && !running(s) && !s.busy) removeBlockDraft(s, b.dataset.block, rerender); return true
    case 'server-item-delete': if (s && !running(s) && !s.busy) removeItemDraft(s, b.dataset.block, Number(b.dataset.index), rerender); return true
    case 'server-asset-delete': if (s) removeAsset(s, b.dataset.id, rerender); return true
    // ★ 접어 둔 사진을 하나만 펼친다. 같은 걸 또 누르면 다시 접는다
    case 'server-asset-peek':
      if (s) { s.assetPeek = s.assetPeek === b.dataset.id ? null : b.dataset.id; rerender() }
      return true
    case 'server-direct-apply': applyDirect(rerender); return true
    case 'server-direct-reset': resetDirect(rerender); return true
    case 'server-text-format-reset':
      if (s && !running(s) && !s.busy) {
        (s.direct.formats ||= {})[b.dataset.index] = { reset: true }
        previewItemFormats(s)
        updateDirectCount(s)
        rerender()
      }
      return true
    case 'server-publish': openPublish(); return true
    case 'server-publish-confirm': confirmPublish(rerender); return true
    case 'server-end': openEndEvent(); return true
    case 'server-end-confirm': confirmEndEvent(b.dataset.id, rerender); return true
    case 'server-info': openEventInfo(); return true
  }
  return false
}

function onChatInput(value) {
  if (!ui.serverEditor) return
  ui.serverEditor.chatInput = value
  const c = $('#server-chat-count')
  if (c) c.textContent = value.length + ' / ' + REQUEST_MAX + '자'
}

/* ── 색 코드 칸 ────────────────────────────────────────────────
 * 색 칸(<input type=color>) 하나가 진짜 값이고, # 16진수 · R · G · B 는 그 색을 코드로 보고 쓰는 창이다.
 * ★ 코드 칸에 쓴 값은 색 칸에 넣고 "색 칸을 직접 고른 것" 과 똑같이 처리한다 —
 *   스위치 켜기 · 미리보기 · 바뀐 개수 · 저장 요청이 한 길이라 따로 맞출 게 없다.
 * ★ 쓰는 도중에는 반영하지 않는다. 여섯 자리 · 0~255 정수가 갖춰질 때만 색이 된다
 *   (칸은 빨갛게 표시). 3자리(#abc)는 칸을 나올 때 늘린다.
 * ★ 쓰고 있는 칸은 건드리지 않는다 — 다른 칸이 따라 바뀌어도 내가 치는 글자가 바뀌면 못 쓴다.
 */
function colorCodeInputs(k) {
  const get = (part) => document.querySelector('[data-scolor="' + k + '"][data-part="' + part + '"]')
  return { hex: get('hex'), r: get('r'), g: get('g'), b: get('b') }
}

/** 색 칸의 색을 코드 칸 네 개에 보여 준다. 쓰고 있는 칸(all 이 아니면)은 건드리지 않는다 */
function syncColorCodes(k, all = false) {
  const picker = document.querySelector('input[type="color"][data-sstyle="' + k + '"]')
  const hex = parseHex(picker?.value), rgb = hexToRgb(hex)
  if (!rgb) return
  const box = colorCodeInputs(k)
  const set = (el, value) => {
    if (!el || (!all && el === document.activeElement)) return
    el.value = value
    el.classList.remove('invalid')
  }
  set(box.hex, hex); set(box.r, rgb.r); set(box.g, rgb.g); set(box.b, rgb.b)
}

/** 코드 칸에 쓴 값을 색으로 반영한다. final 은 칸을 나올 때(change) — 3자리를 늘리고 칸을 가지런히 한다 */
function applyColorCode(s, t, final) {
  const k = t.dataset.scolor
  const picker = document.querySelector('input[type="color"][data-sstyle="' + k + '"]')
  if (!picker || running(s) || s.busy) return true
  const box = colorCodeInputs(k)
  const hex = t.dataset.part === 'hex'
    ? parseHex(t.value, { short: final })
    : rgbToHex(box.r?.value, box.g?.value, box.b?.value)
  t.classList.toggle('invalid', !hex)
  if (!hex) {
    // 칸을 나왔는데 틀린 값이면 색 칸의 지금 색으로 되돌린다 — 빨간 칸을 그대로 두면 저장되는 색과 칸이 달라진다
    if (final) syncColorCodes(k, true)
    return true
  }
  picker.value = hex
  handleServerInput({ target: picker })
  if (final) syncColorCodes(k, true)
  return true
}

/** main.js 의 input 위임에서 부른다. 처리했으면 true — 전체를 다시 그리지 않는다 (포커스 유지) */
function handleServerInput(ev) {
  const s = ui.serverEditor
  const t = ev.target
  if (!s) return false
  if (t.dataset.textFormat !== undefined) {
    if (running(s) || s.busy) return true
    const i = Number(t.dataset.textIndex), key = t.dataset.textFormat
    if (!editable(s)[i]) return true
    if (key === 'size' && t.value !== '' && !t.checkValidity()) return true
    const format = (s.direct.formats ||= {})[i] ||= {}
    if (t.value === '') delete format[key]
    else format[key] = key === 'size' ? Number(t.value) : key === 'bold' ? t.value === 'true' : t.value
    previewItemFormats(s)
    highlight(s, i, false)
    updateDirectCount(s)
    return true
  }
  if (t.id === 'server-prompt') { onServerPromptInput(t.value); return true }
  if (t.id === 'server-chat') { onChatInput(t.value); return true }
  if (t.id === 'server-publish-version') { onPublishPick(t.value); return true }
  if (t.dataset.svariant !== undefined) { pickVariant(s, t.dataset.svariant, t.value); return true }
  if (t.id === 'server-text-q') { s.direct.query = t.value; applyTextFilter(s); return true }
  if (t.dataset.sedit !== undefined) {
    const i = Number(t.dataset.sedit)
    s.direct.values[i] = t.value
    const live = liveTexts(s)
    if (live?.[i]) {
      setPreviewText(live[i].node, i, t.value)
    }
    const before = editable(s)[i]?.before ?? ''
    const changed = normalize(t.value) !== normalize(before)
    t.classList.toggle('changed', changed)
    document.querySelector('[data-sedit-no="' + i + '"]')?.classList.toggle('changed', changed)
    if (t.dataset.autogrow !== undefined) grow(t)
    updateDirectCount(s)
    return true
  }
  // 색 코드 칸(# 16진수 · R · G · B) — 쓰는 중에는 여섯 자리 · 0~255 가 갖춰질 때만 반영한다
  if (t.dataset.scolor !== undefined) return applyColorCode(s, t, false)
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
    // 색 칸을 고르면 코드 칸(# · R · G · B)도 같은 색으로 맞춘다
    if (t.type === 'color') syncColorCodes(t.dataset.sstyle)
    previewButtonStyle(s)
    previewTextStyle(s)
    updateDirectCount(s)
    return true
  }
  return false
}

/**
 * main.js 의 change 위임에서 부른다. 처리했으면 true
 *
 * ★ input 이 아니라 change 다 — 파일 고르기는 input 이벤트를 내지 않는다.
 */
function handleServerChange(ev, rerender) {
  const s = ui.serverEditor
  const t = ev.target
  if (!s) return false
  // 코드 칸을 다 쓰고 나왔을 때 — 3자리(#abc)를 늘리고, 칸의 글자를 정해진 모양(#aabbcc)으로 고친다
  if (t.dataset?.scolor !== undefined) return applyColorCode(s, t, true)
  if (t.dataset?.textFormat !== undefined || t.dataset?.sstyle !== undefined || t.dataset?.sstyleOn !== undefined) {
    return handleServerInput(ev)
  }
  if (t.id !== 'server-asset-file') return false
  const file = t.files?.[0]
  // ★ 비워야 같은 파일을 다시 고를 수 있다 — 안 비우면 두 번째 선택에서 change 가 안 난다
  t.value = ''
  if (file) uploadPicked(s, file, rerender)
  return true
}

async function uploadPicked(s, file, rerender) {
  // ★ 서버도 막지만 여기서 먼저 말해 준다. 3MB 를 다 올려 보낸 뒤 거절당하면 한참 기다린 셈이다
  if (file.size > ASSET_MAX_BYTES) { toast('이미지는 3MB 까지 올릴 수 있어요.'); return }
  s.assetBusy = true
  rerender()
  try {
    const made = await uploadAsset(s.id, file)
    s.assets = [...(s.assets || []), made]
    toast((s.assets.length) + '번으로 올렸어요. "' + s.assets.length + '번 이미지를 배경으로 깔아줘" 처럼 말해 주세요.')
  } catch (e) {
    toast(e?.message || '이미지를 올리지 못했어요.')
  } finally {
    s.assetBusy = false
    rerender()
  }
}

/** ★ 이미 게시된 페이지가 이 이미지를 쓰고 있으면 그 자리가 깨진다. 서버가 막지 않는다 */
/**
 * ★★ 페이지가 쓰고 있는 사진은 못 지운다.
 *
 *   제보: 썸네일 × 로 먼저 지우고 "1번 이미지 없애줘" 했더니
 *   "아직 올린 이미지가 없어요" 가 나왔다. 행이 사라져서 번호가 가리킬 대상이 없는데
 *   **페이지의 <img> 는 그대로** 남아 있었다 — 뺄 방법이 사라진 것이다.
 *
 * ★ 지우는 쪽을 막는 게 맞다. 버튼 하나가 페이지를 고치게 두면 되돌리기가 헷갈린다.
 *   순서를 알려 주면 관리자가 두 걸음으로 끝낼 수 있다.
 */
function usedInPage(s, assetId) {
  const a = (s.assets || []).find((x) => String(x.assetId) === String(assetId))
  return !!a && (s.preview?.html || '').includes(a.url)
}

async function removeAsset(s, assetId, rerender) {
  if (usedInPage(s, assetId)) {
    const a = (s.assets || []).find((x) => String(x.assetId) === String(assetId))
    const n = assetNo(a, (s.assets || []).indexOf(a))
    toast('이 사진은 지금 페이지에 쓰이고 있어요. 먼저 "' + n + '번 이미지 지워줘" 로 페이지에서 뺀 다음 지워 주세요.')
    return
  }
  s.assetBusy = true
  rerender()
  try {
    await deleteAsset(s.id, assetId)
    s.assets = (s.assets || []).filter((a) => String(a.assetId) !== String(assetId))
    // ★ 펼쳐 둔 게 바로 그거였으면 접어 둔 상태도 지운다 — 없는 id 가 남아 있으면 안 된다
    if (String(s.assetPeek) === String(assetId)) s.assetPeek = null
  } catch (e) {
    toast(e?.message || '이미지를 지우지 못했어요.')
  } finally {
    s.assetBusy = false
    rerender()
  }
}

/**
 * 블록 순서 끌어 놓기 — main.js 의 dragstart · dragover · drop · dragend 위임에서 부른다.
 *
 * ★ 라이브러리를 안 쓴다. 목록이 열 줄 남짓이라 HTML5 끌기면 충분하다.
 * ★ 끌기를 못 쓰는 환경(모바일 · 키보드)에는 ▲▼ 가 있다. 둘이 같은 함수로 들어간다.
 */
let draggingBlock = null

function handleServerDrag(ev) {
  const s = ui.serverEditor
  if (!s || s.tab !== 'direct' || running(s) || s.busy) return
  const item = ev.target.closest?.('[data-sorder]')

  if (ev.type === 'dragstart') {
    if (!item) return
    draggingBlock = item.dataset.sorder
    ev.dataTransfer.effectAllowed = 'move'
    // ★ setData 가 없으면 Firefox 는 끌기를 시작조차 하지 않는다
    try { ev.dataTransfer.setData('text/plain', draggingBlock) } catch { /* 일부 브라우저가 막는다 */ }
    item.classList.add('dragging')
    return
  }
  if (ev.type === 'dragend') {
    draggingBlock = null
    document.querySelectorAll('.sorder-item.dragging, .sorder-item.over')
      .forEach((n) => n.classList.remove('dragging', 'over'))
    return
  }
  if (!draggingBlock || !item) return

  if (ev.type === 'dragover') {
    // ★ preventDefault 를 해야 놓을 수 있다. 안 하면 브라우저가 거절한다
    ev.preventDefault()
    ev.dataTransfer.dropEffect = 'move'
    document.querySelectorAll('.sorder-item.over').forEach((n) => n.classList.remove('over'))
    if (item.dataset.sorder !== draggingBlock) item.classList.add('over')
    return
  }
  if (ev.type === 'drop') {
    ev.preventDefault()
    if (item.dataset.sorder !== draggingBlock) moveBlock(s, draggingBlock, item.dataset.sorder)
    draggingBlock = null
  }
}

/** 대화 전송 — main.js 의 submit 위임에서 부른다 */
function handleServerSubmit(ev, rerender) {
  if (ev.target.id === 'server-info-form') {
    ev.preventDefault()
    saveEventInfo(ev.target, rerender)
    return true
  }

  if (ev.target.id !== 'server-chat-form') return false
  ev.preventDefault()
  const value = $('#server-chat')?.value
  // 같은 입력칸을 둘이 쓴다 — 「새로 시작하기」를 누른 뒤에는 수정이 아니라 다시 만들기다
  if (ui.serverEditor?.regen) submitRestart(value, rerender)
  else sendChat(value, rerender)
  return true
}

/** 직접 수정 칸에 들어가면 미리보기에서 그 문구를 비춘다 */
function handleServerFocus(ev) {
  const s = ui.serverEditor
  const index = ev.target.dataset?.sedit ?? ev.target.dataset?.textIndex
  if (!s || index === undefined) return
  const controls = ev.target.closest?.('.sedit-item')?.querySelector('.sedit-format')
  if (controls) controls.open = true
  highlight(s, Number(index), true)
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
  // 검색으로 가려 둔 칸이면 검색부터 지운다 — 눌러서 찾아 들어온 칸이 안 보이면 안 된다
  if (s.direct.query) {
    s.direct.query = ''
    const box = $('#server-text-q')
    if (box) box.value = ''
    applyTextFilter(s)
  }
  revealField(field)
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
  openServerEditor, ensureServerEditor, serverEditorView, afterServerRender, rememberSideScroll, loadingView, refreshPage, running, openPublish,
  regenerate, cancel as cancelServerGeneration, onServerPromptInput, reloadServerEditor,
  handleServerClick, handleServerInput, handleServerSubmit, handleServerFocus, handleServerPick, handleServerBlock,
  handleServerDrag, handleServerTool, handleServerChange,
}
