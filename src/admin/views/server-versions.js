/**
 * 버전 이력 — 서버 모드 (VITE_API_AUTH=on).
 *
 *   전체 목록   GET    /api/admin/events/{id}/versions
 *   미리보기    GET    /api/admin/events/{id}/versions/{versionId}
 *   북마크 추가 PUT    /api/admin/events/{id}/versions/{versionId}/checkpoint
 *   북마크 해제 DELETE /api/admin/events/{id}/versions/{versionId}/checkpoint
 *   템플릿 등록 POST   /api/admin/template-library
 *   되돌리기    POST   /api/admin/events/{id}/versions/{versionId}/restore
 *
 * 전체 버전을 이력에 표시한다.
 * 북마크 추가·해제는 기존 버전의 checkpoint 표시만 변경한다.
 * 게시하면 자동으로 북마크가 추가되며, 게시 중에는 해제할 수 없다.
 *
 * 상태는 편집 화면과 같이 쓴다 (ui.serverEditor, server-editor.js).
 */

import { esc } from '@shared/dom.js'
import { icon } from '@shared/icons.js'
import { serverFrame } from '@shared/preview/document.js'
import { loadVersion, loadVersions, reindexVersion, removeCheckpoint, restoreVersion, saveCheckpoint } from '@shared/repo.js'
import { ensureRagPanel, ragPanel, refreshRagPanel } from './rag-panel.js'
import { ui } from '@shared/state.js'
import { button } from '@shared/ui/controls.js'
import { ask, modal } from '@shared/ui/modal.js'
import { toast } from '@shared/ui/toast.js'

import { loadingView, openPublish, refreshPage, running } from './server-editor.js'
import { resetAdminServer } from './list.js'
import { openRegister } from './templates.js'

const stamp = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
})
const when = (iso) => (iso ? stamp.format(new Date(iso)) : '')

const validVersionId = (id) => (typeof id === 'number' || typeof id === 'string')
  && String(id).trim() !== '' && Number.isSafeInteger(Number(id)) && Number(id) > 0
const sameVersion = (a, b) => validVersionId(a?.versionId) && validVersionId(b?.versionId)
  && Number(a.versionId) === Number(b.versionId)
function canRestoreVersion(s, v) {
  return !!s && !!v && validVersionId(v.versionId) && s.status === 'ready'
    && !s.busy && !running(s) && s.event?.status !== 'ENDED' && !sameVersion(v, s.preview)
}


async function reindexOne(eventId, versionId, rerender) {
  const s = ui.serverEditor
  try {
    await reindexVersion(eventId, versionId)
    await refreshRagPanel(eventId)
    toast('다시 색인했어요.')
  } catch (e) {
    // 전체 재색인이 돌고 있으면 409 — 기다렸다가 다시 누르면 된다
    toast(e?.status === 409 ? '전체 재색인이 돌고 있어요. 끝나고 다시 눌러주세요.' : (e?.message || '재색인하지 못했어요.'))
  } finally {
    if (ui.serverEditor === s) rerender()
  }
}

function serverVersionsView() {
  const s = ui.serverEditor
  const fromEditor = ui.versionsBackRoute === 'editor'
  const back = fromEditor
    ? button('edit', icon('back') + '편집 화면으로', 'data-id="' + (s?.id ?? ui.activeId) + '"', 'backlink' ) 
    : button('route', icon('back') + '이벤트 관리로', 'data-route="admin"', 'backlink' )
  ensureRagPanel(s.id)
  const pending = loadingView(s, back)
  if (pending) return pending
  const latest = s.preview
  const list = s.versions
  const busy = running(s) || s.busy
  const ended = s.event?.status === 'ENDED'
  const rows = list == null
    ? '<div class="empty"><strong>버전 이력을 불러오지 못했어요</strong>' + button('server-reload', '다시 불러오기', '', 'btn sm') + '</div>'
    : !list.length
      ? '<div class="empty"><strong>아직 생성된 버전이 없어요</strong><p>페이지를 생성하거나 수정하면 버전이 여기에 표시돼요.</p></div>'
      : '<div class="card">' + list.map((v) => {
        const isLatest = sameVersion(v, latest)
        return '<div class="version-row server-version-row' + (isLatest ? ' is-current' : '') + '"><div class="version-number">v' + v.versionNo + '</div><div class="version-text"><h3>'
          + esc(v.changeSummary?.trim() || (v.sourceVersionNo ? 'v' + v.sourceVersionNo + ' 에서 변경한 버전' : '처음 만든 버전')) + ' '
          + (v.published ? '<span class="badge green">게시 중</span>' : '')
          + (v.checkpoint ? '<span class="badge version-bookmark-badge">★ 북마크</span>' : '')
          + (isLatest ? '<span class="badge pink">현재 작업</span>' : '') + '</h3>'
          + '<p>' + when(v.createdAt) + ' · ' + (v.sourceVersionNo ? 'v' + v.sourceVersionNo + '에서 이어진 버전' : '최초 버전') + '</p></div>'
          + '<div class="version-actions">'
          + button('server-version-preview', '미리보기', 'data-version="' + v.versionId + '"', 'btn sm')
          + button('server-version-publish', v.published ? '게시 중' : '이 버전 게시',
              'data-version="' + v.versionId + '" ' + ((v.published || busy || ended) ? 'disabled' : ''), 'btn sm version-publish-btn ' + (v.published ? 'ghost' : 'soft'))
          + button('server-version-restore', '이 버전에서 이어서 작업', 'data-version="' + v.versionId + '" '
              + (canRestoreVersion(s, v) ? '' : 'disabled'), 'btn sm')
          + button('server-version-template', '템플릿으로 등록', 'data-version="' + v.versionId + '"' + (busy ? ' disabled' : ''), 'btn sm soft version-template-btn')
          + '<div class="version-bookmark-action">'
          + button(
              v.checkpoint ? 'server-version-unsave' : 'server-version-bookmark',
              v.checkpoint ? '북마크 해제' : '북마크 추가',
              'data-version="' + v.versionId + '"'
                + (busy || (v.checkpoint && v.published) ? ' disabled' : ''),
              'btn sm ghost',
            )
          + (v.checkpoint && v.published
              ? '<span class="version-bookmark-note">게시 중에는 해제할 수 없어요</span>'
              : '')
          + '</div>'
          + button('server-rag-reindex-one', '재색인', 'data-version="' + v.versionId + '"' + (busy ? ' disabled' : ''), 'btn sm version-reindex-btn')
          + '</div></div>'
      }).join('') + '</div>'

  return '<div class="container">' + back
    + '<div class="page-heading">'
    +   '<div class="admin-page-title">'
    +     '<div class="admin-detail-title-row">'
    +       '<h1>버전 이력</h1>'
    +       '<span class="admin-detail-event-name">' + esc(s.event.name) + '</span>'
    +     '</div>'
    +     '<p>전체 버전을 확인하고, 중요한 버전에 북마크를 추가하세요.</p>'
    +   '</div>'
    + '</div>'
    + '<div class="version-history-heading">'
    + '<h2>버전 이력</h2>'
    + (list == null ? '' : '<span>' + list.length + '개</span>')
    + '</div>'
    + rows + ragPanel(s.id)
    + '<p class="review-note">AI 생성·수정 완료 또는 직접 수정의 변경 저장 시 새 버전이 전체 이력에 표시돼요. '
    + '중요한 버전에는 북마크를 추가할 수 있어요. 게시하면 자동으로 북마크가 추가되며, 게시 중에는 해제할 수 없어요. '
    + '마음에 드는 버전은 <strong>템플릿으로 등록</strong>해 두면 다른 이벤트에서 다시 쓸 수 있어요. '
    + '이전 버전에서 이어서 작업하면 그 내용으로 새 최신 버전이 만들어져요. 기존 이력과 게시 중인 페이지는 유지돼요.</p></div>'
}

async function restoreSaved(s, versionId, rerender) {
  const v = s?.versions?.find((x) => validVersionId(x.versionId) && Number(x.versionId) === versionId)
  if (ui.serverEditor !== s || ui.route !== 'versions' || !canRestoreVersion(s, v)) return
  s.busy = true
  rerender()
  let restored = null
  try {
    restored = await restoreVersion(s.id, versionId)
    // 새 버전이 만들어진 뒤 재조회가 실패해도 POST를 다시 보내지 않는다.
    await refreshPage(s, { strictVersions: true })
    resetAdminServer()
    toast('v' + restored.versionNo + ' 로 이어서 작업할 준비가 됐어요. 편집 화면으로 이동하세요.')
  } catch (e) {
    if (restored) {
      resetAdminServer()
      s.status = 'error'
      s.error = 'v' + restored.versionNo + ' 생성은 완료됐지만 화면을 갱신하지 못했어요. 다시 불러오기를 눌러주세요.'
      toast(s.error)
    } else {
      toast(e?.message || '버전을 되돌리지 못했어요.')
    }
  } finally {
    s.busy = false
    if (ui.serverEditor === s) rerender()
  }
}

async function previewSaved(versionId) {
  const s = ui.serverEditor
  if (!s) return
  try {
    const v = await loadVersion(s.id, versionId)
    modal('v' + v.versionNo + ' · 저장된 버전 미리보기',
      '<p class="helper">읽기 전용 · ' + when(v.createdAt) + ' · 기간은 게시 · 미리보기 때 채워져요.</p>'
      + '<div class="version-preview-frame">' + serverFrame(v.htmlContent, 'v' + v.versionNo + ' 미리보기') + '</div>',
      button('close', '닫기', '', 'btn primary'), true)
    document.querySelector('#overlay .modal')?.classList.add('version-preview-modal')
  } catch (e) {
    toast(e?.message || '버전을 불러오지 못했어요.')
  }
}

async function toggleSaved(versionId, save, rerender) {
  const s = ui.serverEditor
  if (!s || s.busy) return
  s.busy = true
  rerender()
  try {
    await (save ? saveCheckpoint : removeCheckpoint)(s.id, versionId)
    s.versions = (await loadVersions(s.id)).versions
    toast(save ? '북마크를 추가했어요.' : '북마크를 해제했어요.')
  } catch (e) {
    toast(e?.message || '북마크를 변경하지 못했어요.')
  } finally {
    s.busy = false
    rerender()
  }
}

/** main.js 의 click 위임에서 부른다. 처리했으면 true */
function handleVersionsClick(a, b, rerender) {
  const s = ui.serverEditor
  const id = Number(b.dataset.version)
  switch (a) {
    case 'server-version-preview': previewSaved(id); return true
    // 템플릿 라이브러리 등록 (PR #133) — 저장된 버전 ID 로만 등록한다
    case 'server-version-template': {
      const v = (s?.versions || []).find((x) => x.versionId === id)
      if (v) openRegister({ eventId: s.id, versionId: id, versionNo: v.versionNo, eventName: s.event?.name })
      return true
    }
    case 'server-version-publish': openPublish(id); return true
    case 'server-version-save':
      if (s?.preview) toggleSaved(s.preview.versionId, true, rerender)
      return true
    case 'server-version-bookmark':
      if (validVersionId(id)) toggleSaved(id, true, rerender)
      return true
    case 'server-version-unsave':
      ask('북마크를 해제할까요?', '북마크 표시만 해제돼요. 버전은 전체 이력에 그대로 남습니다.',
        () => toggleSaved(id, false, rerender), '북마크 해제')
      return true
    case 'server-rag-reindex-one': {
      if (validVersionId(id) && !s.busy) reindexOne(s.id, id, rerender)
      return true
    }
    case 'server-version-restore': {
      const v = (s?.versions || []).find((x) => validVersionId(x.versionId) && Number(x.versionId) === id)
      if (!canRestoreVersion(s, v)) return true
      ask('v' + v.versionNo + ' 에서 이어서 작업할까요?',
        '선택한 버전의 내용으로 새 최신 버전을 만들어요. 저장하지 않은 직접 수정 내용은 사라지며, 기존 이력과 게시 중인 페이지는 그대로 유지돼요.',
        () => restoreSaved(s, id, rerender), '새 버전으로 이어서 작업')
      return true
    }
  }
  return false
}

export { serverVersionsView, handleVersionsClick }
