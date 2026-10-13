/**
 * 참여 관리 — 참여 설정과 참여자 목록.
 *
 *   설정   GET · PUT /api/admin/events/{id}/participation-config
 *   목록   GET       /api/admin/events/{id}/participations
 *
 * 두 가지를 한 화면에 둔 이유 — **설정을 얼마나 잠글지가 참여 수로 결정된다.**
 * 참여가 한 건이라도 있으면 결과를 뒤집는 값(방식 · 확률 · 선택지)은 서버가 막고
 * 경품명 · 발표시각만 받는다. 두 화면으로 나누면 그 판단에 쓸 수를 두 번 불러야 한다.
 *
 * ★ summary 는 **필터와 무관하게 전체**다. resultStatus=WON 을 걸어도
 *   summary.totalParticipationCount 는 전체 참여 수이고, 거른 수는 totalElements 다.
 *   위 카드 3개는 summary 로만, 표 위의 "N명"은 totalElements 로만 그린다.
 *
 * ★ 전화번호가 들어오는 응답이다 (사전예약형). 화면에서 가리고, 로그로 찍지 않는다.
 */

import { esc } from '@shared/dom.js'
import { icon } from '@shared/icons.js'
import {
  loadAllParticipants, loadParticipants, loadParticipationConfig, saveParticipationConfig,
} from '@shared/repo.js'
import { ui } from '@shared/state.js'
import { button, metric } from '@shared/ui/controls.js'
import { toast } from '@shared/ui/toast.js'

const PAGE_SIZE = 20

/** 참여 방식 — 서버 games.code 와 같아야 한다 */
const GAMES = [
  { code: 'BASIC', label: '기본형', desc: '추가 입력 없이 참여만 받아요.' },
  { code: 'SPORTS_PREDICTION', label: '승부 예측형', desc: '보기 중 하나를 고르게 해요.' },
  { code: 'PRE_REGISTRATION', label: '사전예약형', desc: '휴대폰 번호를 받아요. 설정할 값은 없어요.' },
  { code: 'LUCKY_POUCH', label: '복주머니형', desc: '여러 칸 중 하나를 고르게 해요.' },
]
const gameLabel = (code) => GAMES.find((g) => g.code === code)?.label ?? code ?? '—'

/** 결과 상태 — null 은 "결과 없음" 이지 미당첨이 아니다 */
const RESULT = {
  WON: { label: '당첨', tone: 'green' },
  LOST: { label: '미당첨', tone: '' },
  PENDING: { label: '결과 대기', tone: 'amber' },
}
const FILTERS = [[null, '전체'], ['WON', '당첨'], ['LOST', '미당첨'], ['PENDING', '결과 대기']]

const stamp = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
})
const when = (iso) => (iso ? stamp.format(new Date(iso)) : '—')

/**
 * 전화번호를 가린다 — 01012345678 → 010-****-5678.
 * ★ 경품 발송에 필요한 뒷자리만 남긴다. 전체가 필요하면 내려받기로 가져간다.
 */
function maskPhone(v) {
  const d = String(v).replace(/\D/g, '')
  if (d.length < 8) return '***'
  return d.slice(0, 3) + '-****-' + d.slice(-4)
}

/**
 * 참여 입력 한 줄. 방식마다 칸이 달라서 **열을 고정하지 않는다** —
 * 하드코딩하면 방식이 바뀔 때 빈칸이 된다.
 */
function submitted(data, gameCode) {
  const d = data || {}
  if (d.phoneNumber) return maskPhone(d.phoneNumber)
  if (d.prediction) return esc(String(d.prediction))
  if (d.pouchIndex != null) return esc(String(d.pouchIndex)) + '번'
  // 키가 더 늘어도 깨지지 않게, 모르는 모양은 있는 그대로 적는다
  const keys = Object.keys(d)
  if (!keys.length) return gameCode === 'BASIC' ? '—' : '—'
  return esc(keys.map((k) => k + ': ' + d[k]).join(' · '))
}

/* ───────────────────────── 상태 ───────────────────────── */

function state() {
  return (ui.participants ??= {
    eventId: null, status: 'idle', error: null,
    summary: null, list: null, filter: null, page: 0,
    config: null, configState: 'idle', busy: false, downloading: false,
  })
}

function reset(eventId) {
  ui.participants = {
    eventId: String(eventId), status: 'idle', error: null,
    summary: null, list: null, filter: null, page: 0,
    config: null, configState: 'idle', busy: false, downloading: false,
  }
}

/** 목록만 다시 읽는다 (필터 · 페이지가 바뀔 때) */
async function loadList(onDone) {
  const s = state()
  s.status = 'loading'
  try {
    const d = await loadParticipants(s.eventId, { resultStatus: s.filter, page: s.page, size: PAGE_SIZE })
    if (ui.participants !== s) return
    s.summary = d.summary
    s.list = d.participants
    s.status = 'ready'
    s.error = null
  } catch (e) {
    if (ui.participants !== s) return
    s.status = 'error'
    s.error = e?.message || '참여자를 불러오지 못했어요.'
  }
  onDone?.()
}

/** 화면에 들어올 때 — 설정과 목록을 한 번씩 */
function ensureParticipants(eventId, onDone) {
  const s = state()
  if (s.eventId !== String(eventId)) reset(eventId)
  const cur = state()
  if (cur.status === 'idle') loadList(onDone)
  if (cur.configState === 'idle') {
    cur.configState = 'loading'
    loadParticipationConfig(eventId).then(
      (c) => { if (ui.participants === cur) { cur.config = c; cur.configState = 'ready'; onDone?.() } },
      (e) => { if (ui.participants === cur) {
        cur.configState = 'error'
        cur.configError = e?.message || '참여 설정을 불러오지 못했어요.'
        onDone?.()
      } },
    )
  }
}

/* ───────────────────────── 참여 설정 ───────────────────────── */

/** 참여가 시작됐나 — 시작됐으면 결과를 뒤집는 값이 잠긴다 */
const started = (s) => (s.summary?.totalParticipationCount ?? 0) > 0

const LOCKED = 'disabled title="참여가 시작돼 바꿀 수 없어요. 경품명과 발표 시각만 고칠 수 있어요"'

function field(name, label, value, extra = '', helper = '') {
  return '<label class="field">' + label
    + (helper ? '<span class="helper">' + helper + '</span>' : '')
    + '<input data-pconf="' + name + '" value="' + esc(value ?? '') + '" ' + extra + '></label>'
}

/** 방식별 설정 칸. lock 이 걸리면 결과를 뒤집는 값만 막는다 */
function configFields(gameCode, c, lock) {
  if (gameCode === 'PRE_REGISTRATION') {
    return '<p class="helper">사전예약형은 설정할 값이 없어요. 휴대폰 번호는 참여할 때 받습니다.</p>'
  }
  if (gameCode === 'SPORTS_PREDICTION') {
    return field('predictionOptions', '보기', (c.predictionOptions || []).join(', '), lock,
      '쉼표로 구분해주세요. 예: 대한민국 승, 무승부, 상대팀 승')
  }
  if (gameCode === 'LUCKY_POUCH') {
    const rows = (c.pouches || []).map((p) => [p.pouchIndex, p.winProbability, p.prizeName].join(' / ')).join('\n')
    return '<label class="field">주머니'
      + '<span class="helper">한 줄에 하나씩 <code>번호 / 당첨확률(0~100) / 경품명</code>. 번호는 1부터 빠짐없이.</span>'
      + '<textarea data-pconf="pouches" rows="4" ' + lock + ' placeholder="1 / 10 / 상품권&#10;2 / 100 / 데이터 1GB">'
      + esc(rows) + '</textarea></label>'
  }
  // BASIC
  const mode = c.resultMode || ''
  const modes = [['', '결과 없음 (접수만)'], ['IMMEDIATE', '즉시 추첨'], ['GUARANTEED', '전원 당첨'], ['DELAYED', '추후 발표']]
  return '<label class="field">결과 방식'
    + '<select data-pconf="resultMode" ' + lock + '>'
    + modes.map(([v, t]) => '<option value="' + v + '"' + (mode === v ? ' selected' : '') + '>' + t + '</option>').join('')
    + '</select></label>'
    + (mode === 'IMMEDIATE' ? field('winProbability', '당첨 확률', c.winProbability, lock + ' type="number" min="0" max="100"', '0~100') : '')
    + (mode === 'DELAYED' ? field('winnerCount', '당첨 인원', c.winnerCount, lock + ' type="number" min="1"', '1명 이상') : '')
    + (mode === 'DELAYED' ? field('announcementAt', '발표 시각', (c.announcementAt || '').slice(0, 16), 'type="datetime-local"', '참여가 시작된 뒤에도 바꿀 수 있어요') : '')
    + (mode ? field('prizeName', '경품명', c.prizeName, '', '참여가 시작된 뒤에도 바꿀 수 있어요') : '')
}

function configPanel(s) {
  if (s.configState === 'loading' || s.configState === 'idle') {
    return '<section class="panel"><div class="panel-head">참여 설정</div>'
      + '<div class="panel-body"><p class="helper">불러오는 중…</p></div></section>'
  }
  if (s.configState === 'error') {
    return '<section class="panel"><div class="panel-head">참여 설정</div><div class="panel-body">'
      + '<p class="create-error">' + esc(s.configError || '') + '</p>'
      + button('pconf-reload', '다시 시도', '', 'btn sm') + '</div></section>'
  }

  const gameCode = s.configDraft?.gameCode ?? s.config?.gameCode ?? ''
  const c = s.configDraft?.config ?? s.config?.config ?? {}
  const lock = started(s) ? LOCKED : ''

  return '<section class="panel"><div class="panel-head">참여 설정</div><div class="panel-body">'
    + (gameCode ? '' : '<p class="review-note">아직 참여 방식을 정하지 않았어요. '
        + '<strong>설정하기 전까지 사용자는 참여할 수 없습니다.</strong></p>')
    + (started(s) ? '<p class="review-note">이미 ' + s.summary.totalParticipationCount + '명이 참여했어요. '
        + '결과를 뒤집는 값(방식 · 확률 · 보기)은 잠기고 <strong>경품명 · 발표 시각만</strong> 바꿀 수 있어요.</p>' : '')
    + '<form id="pconf-form" class="fields" novalidate>'
    + '<label class="field">참여 방식<select data-pconf="gameCode" ' + lock + '>'
    + '<option value="">고르지 않음</option>'
    + GAMES.map((g) => '<option value="' + g.code + '"' + (gameCode === g.code ? ' selected' : '') + '>'
        + esc(g.label) + ' — ' + esc(g.desc) + '</option>').join('')
    + '</select></label>'
    + (gameCode ? configFields(gameCode, c, lock) : '')
    + '<p class="create-error" role="alert"></p>'
    + '<div class="create-actions">'
    + '<button type="submit" class="btn primary"' + (s.busy || !gameCode ? ' disabled' : '') + '>'
    + (s.busy ? '저장 중…' : '참여 설정 저장') + '</button></div>'
    + '</form></div></section>'
}

/* ───────────────────────── 참여자 목록 ───────────────────────── */

function pager(page, totalPages) {
  if (totalPages <= 1) return ''
  const nums = Array.from({ length: totalPages }, (_, i) => i)
    .map((n) => button('pt-page', String(n + 1), `data-page="${n}" aria-current="${n === page}"`,
      'btn sm ' + (n === page ? 'primary' : 'ghost'))).join('')
  return '<div class="admin-pager">'
    + button('pt-page', '이전', `data-page="${page - 1}"${page === 0 ? ' disabled' : ''}`, 'btn sm ghost')
    + nums
    + button('pt-page', '다음', `data-page="${page + 1}"${page >= totalPages - 1 ? ' disabled' : ''}`, 'btn sm ghost')
    + '</div>'
}

function table(s) {
  if (s.status === 'loading' || s.status === 'idle') {
    return '<div class="empty"><strong>참여자를 불러오고 있어요</strong></div>'
  }
  if (s.status === 'error') {
    return '<div class="empty"><strong>참여자를 불러오지 못했어요</strong><p>' + esc(s.error) + '</p>'
      + button('pt-reload', '다시 불러오기', '', 'btn sm') + '</div>'
  }
  const rows = s.list?.content || []
  if (!rows.length) {
    return '<div class="empty">' + icon('user')
      + '<strong>' + (s.filter ? '해당하는 참여자가 없어요' : '아직 참여자가 없어요') + '</strong>'
      + '<p>' + (s.filter ? '다른 조건으로 찾아보세요.'
        : started(s) ? '' : '참여 설정을 저장하면 사용자가 참여할 수 있어요.') + '</p></div>'
  }
  const gameCode = s.config?.gameCode
  return '<table class="admin-table"><thead><tr>'
    + '<th>참여자</th><th>참여 시각</th><th>참여 입력</th><th>결과</th><th>경품</th>'
    + '</tr></thead><tbody>'
    + rows.map((p) => {
      // ★ resultStatus 가 null 일 수 있다 (결과를 내지 않는 방식). 미당첨이 아니다
      const r = RESULT[p.resultStatus]
      return '<tr><td><h3>' + esc(p.userName || '—') + '</h3><small>ID ' + esc(String(p.userId)) + '</small></td>'
        + '<td>' + when(p.participatedAt) + '</td>'
        + '<td>' + submitted(p.submittedData, gameCode) + '</td>'
        + '<td>' + (r ? '<span class="badge ' + r.tone + '">' + r.label + '</span>'
            : '<span class="helper">결과 없음</span>') + '</td>'
        + '<td>' + (p.prizeName ? esc(p.prizeName) : '—') + '</td></tr>'
    }).join('')
    + '</tbody></table>'
}

function participantsView() {
  const s = state()
  const sum = s.summary
  const back = button('route', icon('back') + '이벤트 관리로', 'data-route="admin"', 'backlink')

  const filters = '<div class="admin-status-filters" role="group" aria-label="결과 필터">'
    + FILTERS.map(([v, t]) => button('pt-filter', t,
        'data-value="' + (v ?? '') + '" aria-pressed="' + (s.filter === v) + '"',
        s.filter === v ? 'active' : '')).join('')
    + '</div>'

  return '<div class="container">' + back
    + '<div class="page-heading spread"><div><span class="eyebrow">PARTICIPANTS</span>'
    + '<h1>참여 관리</h1><p>참여 방식을 정하고, 참여자와 당첨자를 확인하세요.</p></div>'
    + button('pt-download', s.downloading ? '내려받는 중…' : '당첨자 내려받기 (CSV)',
        (s.downloading || !(sum?.rewardCount)) ? 'disabled' : '', 'btn soft')
    + '</div>'

    // ★ 이 숫자 3개는 summary 로만 그린다 — 필터와 무관한 전체다
    + '<div class="metrics">'
    + metric('참여자', (sum?.totalParticipationCount ?? '–') + '<small class="small"> 명</small>', '전체 참여 기록', 'user')
    + metric('당첨', (sum?.rewardCount ?? '–') + '<small class="small"> 명</small>', '경품을 받은 참여', 'gift')
    + metric('결과 대기', (sum?.pendingCount ?? '–') + '<small class="small"> 명</small>', '발표를 기다리는 참여', 'clock')
    + '</div>'

    + configPanel(s)

    + '<section class="admin-list-section">'
    + '<div class="section-title spread"><h2>참여자</h2></div>'
    + filters
    // ★ 여기는 totalElements 다 — 필터가 걸린 수. 위 카드(전체)와 섞지 않는다
    + '<p class="admin-result-count">'
    + (s.status === 'ready' ? (s.list?.totalElements ?? 0) + '명'
        + (s.filter ? ' · 전체 ' + (sum?.totalParticipationCount ?? 0) + '명 중' : '') : '불러오는 중…')
    + '</p>'
    + '<div class="card table-wrap">' + table(s) + '</div>'
    + (s.status === 'ready' ? pager(s.list?.page ?? 0, s.list?.totalPages ?? 1) : '')
    + '<p class="review-note">참여 입력에 휴대폰 번호가 있으면 가운데를 가려서 보여줘요. '
    + '경품 발송에 전체 번호가 필요하면 <strong>당첨자 내려받기</strong>를 쓰세요 — 개인정보이니 다룰 때 주의해주세요.</p>'
    + '</section></div>'
}

/* ───────────────────────── 저장 · 내려받기 ───────────────────────── */

/** 폼 → 서버가 받는 config. 빈 값은 보내지 않는다 (서버가 모양을 검사한다) */
function readConfig(form, gameCode) {
  const v = (k) => form.querySelector('[data-pconf="' + k + '"]')?.value?.trim() ?? ''
  if (gameCode === 'PRE_REGISTRATION') return {}
  if (gameCode === 'SPORTS_PREDICTION') {
    const options = v('predictionOptions').split(',').map((x) => x.trim()).filter(Boolean)
    return { predictionOptions: options }
  }
  if (gameCode === 'LUCKY_POUCH') {
    const pouches = v('pouches').split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
      const [i, p, ...name] = line.split('/').map((x) => x.trim())
      return { pouchIndex: Number(i), winProbability: Number(p), prizeName: name.join('/').trim() }
    })
    return { pouches }
  }
  const mode = v('resultMode')
  if (!mode) return {}
  const c = { resultMode: mode, prizeName: v('prizeName') }
  if (mode === 'IMMEDIATE') c.winProbability = Number(v('winProbability'))
  if (mode === 'DELAYED') {
    c.winnerCount = Number(v('winnerCount'))
    // datetime-local 은 시간대가 없다. 서버는 OffsetDateTime 을 파싱하므로 KST 를 붙인다
    const at = v('announcementAt')
    if (at) c.announcementAt = at.length === 16 ? at + ':00+09:00' : at
  }
  return c
}

/** 화면이 먼저 보는 것 — 서버 409 는 어느 칸이 틀렸는지 말해주지 않는다 */
function checkConfig(gameCode, c) {
  if (gameCode === 'SPORTS_PREDICTION' && !c.predictionOptions.length) return '보기를 하나 이상 입력해주세요.'
  if (gameCode === 'LUCKY_POUCH') {
    if (!c.pouches.length) return '주머니를 하나 이상 입력해주세요.'
    const bad = c.pouches.find((p) => !Number.isInteger(p.pouchIndex) || p.pouchIndex < 1
      || !Number.isFinite(p.winProbability) || p.winProbability < 0 || p.winProbability > 100 || !p.prizeName)
    if (bad) return '주머니는 "번호 / 확률(0~100) / 경품명" 모양으로 적어주세요.'
    const nums = c.pouches.map((p) => p.pouchIndex).sort((a, b) => a - b)
    if (nums.some((n, i) => n !== i + 1)) return '주머니 번호는 1부터 빠짐없이 이어져야 해요.'
  }
  if (c.resultMode === 'IMMEDIATE' && !(c.winProbability >= 0 && c.winProbability <= 100)) {
    return '당첨 확률을 0~100 으로 입력해주세요.'
  }
  if (c.resultMode === 'DELAYED') {
    if (!(c.winnerCount >= 1)) return '당첨 인원을 1명 이상으로 입력해주세요.'
    if (!c.announcementAt) return '발표 시각을 입력해주세요.'
  }
  if (c.resultMode && !c.prizeName) return '경품명을 입력해주세요.'
  return null
}

/** 서버가 바꿔 주기로 한 값 — 나머지는 참여가 시작되면 잠긴다 */
const EDITABLE_AFTER_START = ['prizeName', 'announcementAt']

/**
 * 409 PARTICIPATION409-3 안내 문구.
 *
 * ★ 서버 쪽 잠금 규칙이 두 가지다. 어느 쪽인지에 따라 할 말이 다르다.
 *   - 키별 잠금(지금 계약): 경품명 · 발표 시각만 열려 있다
 *   - 통째로 잠금(옛 동작): 같은 값을 그대로 보내도 거절한다
 *   그래서 **잠긴 값을 안 건드렸는데도 거절당했으면** 서버가 아직 옛 동작이라는 뜻이다.
 *   그때 "경품명은 고칠 수 있어요" 라고 하면 거짓말이 된다.
 */
function lockedMessage(s, gameCode, config) {
  const was = s.config?.config || {}
  const changedLocked = gameCode !== (s.config?.gameCode ?? gameCode)
    || [...new Set([...Object.keys(was), ...Object.keys(config)])].some((k) =>
      !EDITABLE_AFTER_START.includes(k) && JSON.stringify(was[k]) !== JSON.stringify(config[k]))

  return changedLocked
    ? '참여가 시작돼 바꿀 수 없는 값이에요. 경품명과 발표 시각만 고칠 수 있어요.'
    : '이 서버는 참여가 시작되면 참여 설정을 통째로 잠급니다 — 경품명도 바꿀 수 없어요.'
}

async function submitConfig(form, rerender) {
  const s = state()
  if (s.busy) return
  const err = (m) => { const el = form.querySelector('.create-error'); if (el) el.textContent = m }
  const gameCode = form.querySelector('[data-pconf="gameCode"]')?.value || ''
  if (!gameCode) return err('참여 방식을 골라주세요.')

  const config = readConfig(form, gameCode)
  const bad = checkConfig(gameCode, config)
  if (bad) return err(bad)

  s.busy = true
  rerender()
  try {
    s.config = await saveParticipationConfig(s.eventId, { gameCode, config })
    s.configDraft = null
    s.busy = false
    rerender()
    toast('참여 설정을 저장했어요.')
  } catch (e) {
    s.busy = false
    rerender()
    const box = document.querySelector('#pconf-form .create-error')
    const msg = e?.code === 'PARTICIPATION409-3' ? lockedMessage(s, gameCode, config)
      : e?.code === 'PARTICIPATION409-1' ? '설정 모양을 확인해주세요.'
      : e?.message || '참여 설정을 저장하지 못했어요.'
    if (box) box.textContent = msg; else toast(msg)
  }
}

/**
 * 당첨자 CSV — 서버에 엔드포인트가 없어서 화면이 페이지를 끝까지 모아 만든다.
 * ★ 전화번호를 **가리지 않고** 넣는다. 경품 발송에 쓰는 파일이다 —
 *   화면에서는 가리지만 내려받기는 원본이 필요하다.
 */
async function downloadWinners(rerender) {
  const s = state()
  if (s.downloading) return
  s.downloading = true
  rerender()
  try {
    const rows = await loadAllParticipants(s.eventId, 'WON')
    const head = ['참여ID', '회원ID', '이름', '참여시각', '참여입력', '경품']
    const cell = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"'
    const body = rows.map((p) => [
      p.participationId, p.userId, p.userName, p.participatedAt,
      Object.entries(p.submittedData || {}).map(([k, v]) => k + '=' + v).join(' '),
      p.prizeName,
    ].map(cell).join(','))
    // ★ BOM 을 붙인다 — 없으면 엑셀이 한글을 깨서 연다
    const blob = new Blob(['﻿' + [head.map(cell).join(','), ...body].join('\n')],
      { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'winners-' + s.eventId + '.csv'
    a.click()
    URL.revokeObjectURL(url)
    toast(rows.length + '명의 당첨자를 내려받았어요.')
  } catch (e) {
    toast(e?.message || '당첨자를 내려받지 못했어요.')
  } finally {
    s.downloading = false
    rerender()
  }
}

/* ───────────────────────── 위임 ───────────────────────── */

/** main.js 의 click 위임에서 부른다. 처리했으면 true */
function handleParticipantsClick(a, b, rerender) {
  const s = state()
  switch (a) {
    case 'pt-filter':
      s.filter = b.dataset.value || null
      s.page = 0
      loadList(rerender); rerender(); return true
    case 'pt-page':
      s.page = Number(b.dataset.page)
      loadList(rerender); rerender(); return true
    case 'pt-reload':
      loadList(rerender); rerender(); return true
    case 'pconf-reload':
      s.configState = 'idle'; rerender(); return true
    case 'pt-download':
      downloadWinners(rerender); return true
  }
  return false
}

/** main.js 의 submit 위임에서 부른다 */
function handleParticipantsSubmit(ev, rerender) {
  if (ev.target.id !== 'pconf-form') return false
  ev.preventDefault()
  submitConfig(ev.target, rerender)
  return true
}

/**
 * 방식 · 결과 방식을 바꾸면 아래 칸이 달라진다 — 입력 중인 값을 들고 다시 그린다.
 * (전체 재렌더라 draft 에 담아 두지 않으면 고르던 값이 날아간다)
 */
function handleParticipantsChange(ev, rerender) {
  const key = ev.target.dataset?.pconf
  if (key !== 'gameCode' && key !== 'resultMode') return false
  const s = state()
  const form = ev.target.closest('form')
  const gameCode = form.querySelector('[data-pconf="gameCode"]')?.value || ''
  s.configDraft = { gameCode, config: gameCode ? readConfig(form, gameCode) : {} }
  rerender()
  return true
}

function resetParticipants() {
  ui.participants = null
}

export {
  participantsView, ensureParticipants, resetParticipants,
  handleParticipantsClick, handleParticipantsSubmit, handleParticipantsChange,
}
