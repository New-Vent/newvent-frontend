/**
 * 참여 관리 — 참여 설정과 참여자 목록.
 *
 *   설정       GET · PUT /api/admin/events/{id}/participation-config
 *   목록       GET       /api/admin/events/{id}/participations
 *   경기 결과  PUT       /api/admin/events/{id}/sports-result   (승부 예측형만)
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
 *
 * ── 승부 예측형 (백엔드 PR #215) ────────────────────────────────
 * 설정이 셋으로 늘었다 — 선택지(predictionOptions) · 발표 시각(announcementAt) ·
 * 혜택 목록(rewards). 그리고 **정답은 설정이 아니다** — 경기가 끝난 뒤 따로 등록하고
 * (sports-result), 발표 시각이 지나면 배치가 혜택별로 추첨한다. 그래서 참여는
 * 그때까지 전부 PENDING 이다.
 */

import { esc } from '@shared/dom.js'
import { icon } from '@shared/icons.js'
import {
  configWithoutProgress, loadAdminEvent, loadAllParticipants, loadParticipants,
  loadParticipationConfig, registerSportsResult, saveParticipationConfig,
} from '@shared/repo.js'
import { ui } from '@shared/state.js'
import { button, metric } from '@shared/ui/controls.js'
import { ask } from '@shared/ui/modal.js'
import { toast } from '@shared/ui/toast.js'
import { eventDatetimeField, syncDatetimeFields } from './event-datetime-field.js'

const PAGE_SIZE = 20

/** 참여 방식 — 서버 games.code 와 같아야 한다 */
const GAMES = [
  { code: 'BASIC', label: '기본형', desc: '추가 입력 없이 참여만 받아요.' },
  { code: 'SPORTS_PREDICTION', label: '승부 예측형', desc: '보기 중 하나를 고르고, 발표 시각에 혜택별로 추첨해요.' },
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

function blank(eventId) {
  return {
    eventId: String(eventId), status: 'idle', error: null,
    summary: null, list: null, filter: null, page: 0,
    config: null, configState: 'idle', busy: false, downloading: false,
    event: null, eventState: 'idle', resultBusy: false,
    listSeq: 0,
  }
}

function state() {
  return (ui.participants ??= blank(null))
}

function reset(eventId) {
  ui.participants = blank(eventId)
}

/**
 * 목록만 다시 읽는다 (필터 · 페이지가 바뀔 때).
 *
 * ★ **늦게 온 응답이 최신 목록을 덮어쓰지 않게** 요청 번호를 센다.
 *   필터를 빠르게 바꾸면 요청이 겹치는데, 같은 화면이라 상태 객체(s)는 그대로다 —
 *   객체 비교만으로는 "이 응답이 아직 쓸모 있나" 를 가릴 수 없다.
 *   실측: 당첨 → 전체 로 연달아 누르고 당첨 응답을 늦추면, 필터는 「전체」인데
 *   목록에는 당첨 3건만 남았다.
 */
async function loadList(onDone) {
  const s = state()
  const seq = ++s.listSeq
  // 이 응답이 아직 최신인가 — 화면이 바뀌었거나 더 새 요청이 떴으면 버린다
  const current = () => ui.participants === s && s.listSeq === seq
  s.status = 'loading'
  try {
    const d = await loadParticipants(s.eventId, { resultStatus: s.filter, page: s.page, size: PAGE_SIZE })
    if (!current()) return
    s.summary = d.summary
    s.list = d.participants
    s.status = 'ready'
    s.error = null
  } catch (e) {
    if (!current()) return
    s.status = 'error'
    s.error = e?.message || '참여자를 불러오지 못했어요.'
  }
  onDone?.()
}

/** 설정만 다시 읽는다 (저장 · 정답 등록 뒤) */
async function reloadConfig(onDone) {
  const s = state()
  try {
    const c = await loadParticipationConfig(s.eventId)
    if (ui.participants !== s) return
    s.config = c
    s.configState = 'ready'
  } catch (e) {
    if (ui.participants !== s) return
    s.configState = 'error'
    s.configError = e?.message || '참여 설정을 불러오지 못했어요.'
  }
  onDone?.()
}

/**
 * 화면에 들어올 때 — 설정 · 목록 · 이벤트를 한 번씩.
 *
 * ★ 이벤트를 읽는 이유는 **종료 시각**이다. 승부 예측형의 발표 시각은 종료 이후여야
 *   하는데(서버가 검사한다), 설정 응답에는 이벤트 기간이 없다.
 */
function ensureParticipants(eventId, onDone) {
  const s = state()
  if (s.eventId !== String(eventId)) reset(eventId)
  const cur = state()
  if (cur.status === 'idle') loadList(onDone)
  if (cur.configState === 'idle') {
    cur.configState = 'loading'
    reloadConfig(onDone)
  }
  if (cur.eventState === 'idle') {
    cur.eventState = 'loading'
    loadAdminEvent(eventId).then(
      (e) => { if (ui.participants === cur) { cur.event = e; cur.eventState = 'ready'; onDone?.() } },
      // 이벤트를 못 읽어도 화면은 돈다 — 발표 시각을 서버가 다시 검사한다
      () => { if (ui.participants === cur) { cur.eventState = 'error'; onDone?.() } },
    )
  }
}

/* ───────────────────────── 참여 설정 ───────────────────────── */

/** 참여가 시작됐나 — 시작됐으면 결과를 뒤집는 값이 잠긴다 */
const started = (s) => (s.summary?.totalParticipationCount ?? 0) > 0

const LOCKED = 'disabled title="참여가 시작돼 바꿀 수 없어요"'

/** 지금 보고 있는 설정 (저장 전 입력 중인 값이 있으면 그것) */
const draftGame = (s) => s.configDraft?.gameCode ?? s.config?.gameCode ?? ''
const draftConfig = (s) => s.configDraft?.config ?? s.config?.config ?? {}

function field(name, label, value, extra = '', helper = '') {
  return '<label class="field">' + label
    + (helper ? '<span class="helper">' + helper + '</span>' : '')
    + '<input data-pconf="' + name + '" value="' + esc(value ?? '') + '" ' + extra + '></label>'
}

/** datetime-local 칸에 넣을 값. 서버는 +09:00 이 붙은 ISO 를 준다 */
const localValue = (iso) => (iso || '').slice(0, 16)

/* ── 승부 예측형 혜택 ─────────────────────────────── */

const TARGETS = [['ALL_PARTICIPANTS', '참여자 전원'], ['CORRECT_PREDICTIONS', '정답자']]
const SELECTIONS = [['ALL', '대상 전원 지급'], ['DRAW', '대상 중 추첨']]

function pick(name, options, value, extra = '') {
  return '<select data-rfield="' + name + '" ' + extra + '>'
    + options.map(([v, t]) => '<option value="' + v + '"' + (value === v ? ' selected' : '') + '>'
      + esc(t) + '</option>').join('')
    + '</select>'
}

/**
 * 혜택 한 줄. 대상 × 선정 조합이 그대로 서버 계약이다.
 *
 *   정답자 · 추첨        정답자 중 N명 추첨
 *   정답자 · 전원 지급   정답을 맞힌 모두
 *   참여자 전원 · 전원   참여만 해도 받는 참가 보상
 *
 * ★ 인원(winnerCount)은 **추첨일 때만** 보낸다. 전원 지급에는 쓰이지 않는다
 *   (서버가 0 으로 저장한다).
 * ★ rewardId 는 참여 기록(result_data.rewards)에 박히는 식별자다. 발표가 끝난 뒤
 *   바꾸면 그 기록을 설명할 수 없게 되므로 화면에 보여주되 고치게 하지 않는다.
 */
function rewardRow(r, i, lock) {
  const draw = (r.selection ?? 'ALL') === 'DRAW'
  return '<div class="reward-row" data-reward="' + i + '">'
    + '<input type="hidden" data-rfield="rewardId" value="' + esc(r.rewardId || '') + '">'
    + '<label class="field">대상' + pick('target', TARGETS, r.target ?? 'ALL_PARTICIPANTS', lock) + '</label>'
    + '<label class="field">선정' + pick('selection', SELECTIONS, r.selection ?? 'ALL', lock) + '</label>'
    + '<label class="field">' + (draw ? '인원' : '<span class="muted">인원</span>')
    + '<input data-rfield="winnerCount" type="number" min="1" value="' + esc(draw ? (r.winnerCount ?? '') : '')
    + '" ' + (draw ? lock : 'disabled title="전원 지급에는 인원이 필요 없어요"') + '></label>'
    + '<label class="field">경품명<input data-rfield="prizeName" value="' + esc(r.prizeName || '') + '" '
    + lock + '></label>'
    + button('pconf-reward-del', icon('close'), 'data-index="' + i + '" aria-label="혜택 지우기" '
      + (lock ? 'disabled' : ''), 'icon-btn')
    + '</div>'
}

/** 다음 rewardId — 지금 있는 것과 겹치지 않게 r1, r2 … 로 붙인다 */
function nextRewardId(rewards) {
  const used = new Set(rewards.map((r) => r.rewardId))
  for (let n = 1; ; n++) if (!used.has('r' + n)) return 'r' + n
}

/**
 * 승부 예측형 설정 칸.
 *
 * ★ 잠금이 방식마다 다르다. 참여가 시작되면 서버가 바꿔 주는 것은 announcementAt 뿐이고
 *   **rewards 는 경품명만 고치려 해도 거절한다** (실측 409 PARTICIPATION409-3 —
 *   ParticipationConfigLock 의 중첩 경품명 특례가 pouches 에만 있다).
 *   그래서 기본형처럼 "경품명은 열려 있다" 고 그리면 거짓이 된다.
 */
function sportsFields(c, lock, s, openLock) {
  const rewards = c.rewards || []
  const endAt = s.event?.endAt
  return field('predictionOptions', '보기', (c.predictionOptions || []).join(', '), lock,
    '쉼표로 구분해주세요. 예: 대한민국 승, 무승부, 상대팀 승'
    + (lock ? ' (참여가 시작돼 바꿀 수 없어요 — 지운 보기를 고른 참여 기록이 떠버립니다)' : ''))
    + eventDatetimeField(
      'announcementAt',
      '발표 시각',
      localValue(c.announcementAt),
      {
        extra: openLock,
        helper: '이벤트 종료 이후여야 해요'
          + (endAt ? ' (종료 ' + when(endAt) + ')' : '')
          + '. 한국 시간 기준이며, 이 시각이 지나면 등록한 경기 결과로 추첨이 돌아요.',
      },
    )
    + '<div class="field">'
    + '<div class="participation-rewards-heading">'
    + '<span>혜택</span>'
    + (lock ? '' : button('pconf-reward-add', '+ 혜택 추가', '', 'btn sm participation-reward-add'))
    + '</div>'
    + '<span class="helper">대상과 선정 방식을 고르세요. 「참여자 전원 · 전원 지급」은 참가 보상, '
    + '「정답자 · 추첨」은 정답자 중 추첨이에요.</span>'
    + (rewards.length ? rewards.map((r, i) => rewardRow(r, i, lock)).join('')
      : '<p class="helper">혜택이 없으면 저장할 수 없어요. 하나 이상 넣어주세요.</p>')
    + '</div>'
}

/**
 * 방식별 설정 칸.
 *
 * @param lock      결과를 뒤집는 값에 거는 잠금
 * @param openLock  참여가 시작돼도 열려 있던 값(경품명 · 발표 시각)까지 잠글 때.
 *                  승부 예측형에서 정답이 등록되면 그것마저 저장이 거절된다
 */
function configFields(gameCode, c, lock, s, openLock = '') {
  if (gameCode === 'PRE_REGISTRATION') {
    return '<p class="helper">사전예약형은 설정할 값이 없어요. 휴대폰 번호는 참여할 때 받습니다.</p>'
  }
  if (gameCode === 'SPORTS_PREDICTION') return sportsFields(c, lock, s, openLock)
  if (gameCode === 'LUCKY_POUCH') {
    const rows = (c.pouches || []).map((p) => [p.pouchIndex, p.winProbability, p.prizeName].join(' / ')).join('\n')
    // ★ 참여가 시작돼도 **칸을 막지 않는다** — 서버는 경품명만 바뀌면 받아 준다
    //   (ParticipationConfigLock.pouchPrizeNameOnly, 실측 확인). 통째로 잠그면
    //   서버가 허락하는 오타 수정을 화면이 막는 셈이 된다. 대신 보내기 전에 확인한다.
    const pouchLock = started(s) ? '' : lock
    return '<label class="field">주머니'
      + '<span class="helper">한 줄에 하나씩 <code>번호 / 당첨확률(0~100) / 경품명</code>. '
      + (started(s) ? '참여가 시작돼 <strong>경품명만</strong> 고칠 수 있어요 — 번호 · 확률은 그대로 두세요.'
        : '번호는 1부터 빠짐없이.')
      + '</span>'
      + '<textarea data-pconf="pouches" rows="4" ' + pouchLock + ' placeholder="1 / 10 / 상품권&#10;2 / 100 / 데이터 1GB">'
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
    + (mode === 'DELAYED' ? eventDatetimeField('announcementAt', '발표 시각', localValue(c.announcementAt), { helper: '한국 시간 기준 · 참여가 시작된 뒤에도 바꿀 수 있어요' } ) : '')
    + (mode ? field('prizeName', '경품명', c.prizeName, '', '참여가 시작된 뒤에도 바꿀 수 있어요') : '')
}

/** 참여가 시작된 뒤 무엇이 열려 있나 — 방식마다 다르다 */
function startedNotice(s, gameCode) {
  const n = s.summary.totalParticipationCount
  const open = gameCode === 'SPORTS_PREDICTION'
    ? '<strong>발표 시각만</strong> 바꿀 수 있어요. 혜택은 경품명까지 잠깁니다'
    : gameCode === 'LUCKY_POUCH'
      ? '<strong>칸의 경품명만</strong> 바꿀 수 있어요 (확률 · 칸 수는 잠깁니다)'
      : '<strong>경품명 · 발표 시각만</strong> 바꿀 수 있어요'
  return '<p class="review-note">이미 ' + n + '명이 참여했어요. 결과를 뒤집는 값은 잠기고 ' + open + '.</p>'
}

/**
 * **저장돼 있는** 설정이 지금 규칙을 통과하나.
 *
 * ★ 통과하지 못하는 행이 실제로 있다 — 승부 예측형은 전에 보기만 있으면 저장됐다.
 *   그 뒤 발표 시각 · 혜택이 필수가 되면서, 옛 모양으로 저장된 이벤트는
 *   **사용자에게 "준비 중" 으로 보이고 참여가 열리지 않는다** (서버가 설정을 읽다 실패한다).
 *   화면이 조용히 있으면 관리자는 왜 참여가 안 되는지 알 수 없다.
 * ★ 참여 기록까지 있으면 이 화면에서는 손쓸 수 없다 — 바꿔야 하는 값이 전부 잠겨 있다.
 */
function staleNotice(s) {
  const gameCode = s.config?.gameCode
  if (gameCode !== 'SPORTS_PREDICTION') return ''
  const saved = s.config.config || {}
  if (saved.drawnAt) return ''
  const bad = checkSports(saved, s)
  if (!bad) return ''
  return '<p class="review-note">저장된 설정이 지금 규칙에 맞지 않아요 — <strong>' + esc(bad) + '</strong> '
    + '이 상태로는 사용자에게 「준비 중」으로 보이고 참여가 열리지 않아요.'
    + (started(s)
      ? ' 참여 기록이 있어 이 화면에서는 고칠 수 없습니다 (잠긴 값이라 저장이 거절돼요).'
      : ' 아래에서 채우고 저장해주세요.')
    + '</p>'
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

  const gameCode = draftGame(s)
  const c = draftConfig(s)
  const saved = s.config?.config || {}
  // ★ 통째로 잠기는 두 경우. 어느 칸을 고쳐도 저장이 거절되므로 폼 전체를 막는다 —
  //   늘 실패하는 버튼을 두지 않는다.
  //   1) 발표 완료(drawnAt): 저장은 drawnAt 을 떼게 되고, 그것만으로 "바뀌었다" 가 된다
  //   2) 정답 등록 + 참여 기록: 같은 이유로 winningPrediction 이 떨어져 나간다.
  //      열려 있다던 발표 시각조차 못 옮긴다 (실측 409-3)
  const frozen = !!saved.drawnAt
  const answerFrozen = !frozen && started(s) && !!saved.winningPrediction
  const lock = (started(s) || frozen) ? LOCKED : ''

  return '<section class="panel"><div class="panel-head">참여 설정</div><div class="panel-body">'
    + (gameCode ? '' : '<p class="review-note">아직 참여 방식을 정하지 않았어요. '
        + '<strong>설정하기 전까지 사용자는 참여할 수 없습니다.</strong></p>')
    + (frozen
      ? '<p class="review-note">발표가 끝난 이벤트예요. <strong>참여 설정은 더 바꿀 수 없습니다</strong> — '
        + '확정된 당첨을 설명하는 설정이라 그대로 둡니다.</p>'
      : answerFrozen
        ? '<p class="review-note">경기 결과(<strong>' + esc(saved.winningPrediction) + '</strong>)가 등록돼 있고 '
          + '참여 기록도 있어요. 지금은 <strong>어느 값도 저장할 수 없습니다</strong> — 설정을 보낼 때는 '
          + '등록된 결과를 함께 보낼 수 없는데, 서버는 그것을 「설정이 바뀌었다」 로 봅니다. '
          + '발표 시각을 옮겨야 하면 백엔드에 문의해주세요.</p>'
        : started(s) ? startedNotice(s, gameCode) : '')
    + staleNotice(s)
    // ★ 정답이 등록돼 있으면 저장이 그것을 지운다 (실측). 누르기 전에 알려준다
    //   (참여 기록까지 있으면 저장 자체가 막히므로 위에서 이미 설명했다)
    + (saved.winningPrediction && !saved.drawnAt && !answerFrozen
      ? '<p class="review-note">경기 결과(<strong>' + esc(saved.winningPrediction) + '</strong>)가 등록돼 있어요. '
        + '설정을 다시 저장하면 <strong>등록한 결과가 지워집니다</strong> — 저장 뒤 다시 등록해주세요.</p>'
      : '')
    + '<form id="pconf-form" class="fields" novalidate>'
    + '<label class="field">참여 방식<select data-pconf="gameCode" ' + lock + '>'
    + '<option value="">고르지 않음</option>'
    + GAMES.map((g) => '<option value="' + g.code + '"' + (gameCode === g.code ? ' selected' : '') + '>'
        + esc(g.label) + ' — ' + esc(g.desc) + '</option>').join('')
    + '</select></label>'
    + (gameCode ? configFields(gameCode, c, lock, s, (frozen || answerFrozen) ? LOCKED : '') : '')
    + '<p class="create-error" role="alert"></p>'
    + '<div class="create-actions">'
    + '<button type="submit" class="btn primary"'
    + (s.busy || !gameCode || frozen || answerFrozen ? ' disabled' : '') + '>'
    + (s.busy ? '저장 중…' : '참여 설정 저장') + '</button></div>'
    + '</form></div></section>'
}

/* ───────────────────────── 경기 결과 (승부 예측형) ───────────────────────── */

/**
 * 정답 등록 패널.
 *
 * ★ 정답은 **설정이 아니다.** 설정 PUT 에 끼워 보내면 서버가 거절한다 (409-1).
 *   경기가 끝난 뒤에야 알 수 있는 값이라 참여 기록이 있어도 등록할 수 있다.
 * ★ 발표 처리(drawnAt)가 끝나면 잠긴다 — 이미 확정된 당첨을 뒤집지 않는다 (409-4).
 */
function resultPanel(s) {
  if (s.configState !== 'ready') return ''
  if (s.config?.gameCode !== 'SPORTS_PREDICTION') return ''

  const c = s.config.config || {}
  const options = c.predictionOptions || []
  if (!options.length) return ''

  const answer = c.winningPrediction || ''
  const drawn = c.drawnAt

  const head = '<section class="panel"><div class="panel-head">경기 결과'
    + (drawn ? '<span class="badge green">발표 완료</span>'
      : answer ? '<span class="badge">등록됨</span>' : '<span class="badge amber">미등록</span>')
    + '</div><div class="panel-body">'

  if (drawn) {
    return head
      + '<p class="helper">정답 <strong>' + esc(answer) + '</strong> · ' + when(drawn)
      + ' 발표 완료. 확정된 당첨은 바꿀 수 없습니다.</p>'
      + '</div></section>'
  }

  return head
    + '<form id="psr-form" class="fields" novalidate>'
    + '<label class="field">실제 경기 결과'
    + '<span class="helper">'
    + (answer ? '지금 등록된 값은 <strong>' + esc(answer) + '</strong> — 발표 전까지 정정할 수 있어요.'
      : '경기가 끝난 뒤 골라주세요. 발표 시각'
        + (c.announcementAt ? ' (' + when(c.announcementAt) + ')' : '') + '이 지나면 이 값으로 추첨이 돌아요.')
    + '</span>'
    + '<select data-psr="winningPrediction">'
    + (answer ? '' : '<option value="">고르지 않음</option>')
    + options.map((o) => '<option value="' + esc(o) + '"' + (answer === o ? ' selected' : '') + '>'
      + esc(o) + '</option>').join('')
    + '</select></label>'
    + '<p class="create-error" role="alert"></p>'
    + '<div class="create-actions"><button type="submit" class="btn primary"'
    + (s.resultBusy ? ' disabled' : '') + '>'
    + (s.resultBusy ? '등록 중…' : answer ? '경기 결과 정정' : '경기 결과 등록') + '</button></div>'
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
    return '<div class="empty participants-empty">' + icon('user')
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
      // ★ 두 가지 ID 를 모두 남긴다. 회원 ID 는 사람을 가리키고, 참여 ID 는 이 기록
      //   하나를 가리킨다 — 문의 대응 · 경품 발송 대조는 참여 ID 로 한다 (CSV 와 같은 값).
      return '<tr><td><h3>' + esc(p.userName || '—') + '</h3>'
        + '<small>회원 ' + esc(String(p.userId))
        + ' · 참여 #' + esc(String(p.participationId)) + '</small></td>'
        + '<td>' + when(p.participatedAt) + '</td>'
        + '<td>' + submitted(p.submittedData, gameCode) + '</td>'
        + '<td>' + (r ? '<span class="badge ' + r.tone + '">' + r.label + '</span>'
            : '<span class="helper">결과 없음</span>') + '</td>'
        + '<td>' + (p.prizeName ? esc(p.prizeName) : '—') + '</td></tr>'
    }).join('')
    + '</tbody></table>'
}

/**
 * 목록이 설명해야 하는 승부 예측형 사정 두 가지.
 *
 * ★ 발표 전에는 전원 PENDING 이다 — "아직 아무도 당첨되지 않았다" 가 아니라
 *   **아직 뽑지 않았다**는 뜻이다.
 * ★ 혜택이 둘 이상이면 목록의 「경품」은 믿을 수 없다 — 서버가 당첨 혜택 중
 *   **하나만** 준다 (result_data.rewards 를 내려주지 않는다). 실측: 정답자 2명 중
 *   1명이 추첨 경품에 당첨됐는데 목록에는 둘 다 참가 보상만 보였다.
 *   경품을 보내기 전에 반드시 확인이 필요하므로 숨기지 않고 적는다.
 */
function sportsNotes(s) {
  if (s.config?.gameCode !== 'SPORTS_PREDICTION') return ''
  const c = s.config.config || {}
  const notes = []
  if (!c.drawnAt) {
    notes.push('발표 전이라 참여는 모두 <strong>결과 대기</strong>예요. 발표 시각'
      + (c.announcementAt ? ' (' + when(c.announcementAt) + ')' : '')
      + '이 지나고 경기 결과가 등록돼 있으면 혜택별로 추첨이 돌아갑니다.')
  }
  if ((c.rewards || []).length > 1) {
    notes.push('혜택이 ' + c.rewards.length + '개예요. 목록의 <strong>경품 칸은 당첨 혜택 중 하나만</strong> 보여줘요 '
      + '— 서버가 하나만 내려줍니다. 추첨 혜택 당첨자를 이 화면에서 가려낼 수 없으니, '
      + '경품을 보내기 전에 꼭 확인해주세요.')
  }
  return notes.map((t) => '<p class="review-note">' + t + '</p>').join('')
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
    + '<div class="page-heading spread"><div class="admin-page-title">'
    + '<div class="admin-detail-title-row">'
    + '<h1>참여 관리</h1>'
    + (s.event?.name ? '<span class="admin-detail-event-name">' + esc(s.event.name) + '</span>' : '')
    + '</div>'
    + '<p>참여 방식을 정하고, 참여자와 당첨자를 확인하세요.</p></div>'
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
    + resultPanel(s)

    + '<section class="admin-list-section">'
    + '<div class="section-title spread"><h2>참여자</h2>'
    + (s.config?.gameCode ? '<span class="badge">' + esc(gameLabel(s.config.gameCode)) + '</span>' : '')
    + '</div>'
    + filters
    // ★ 여기는 totalElements 다 — 필터가 걸린 수. 위 카드(전체)와 섞지 않는다
    + '<p class="admin-result-count">'
    + (s.status === 'ready' ? (s.list?.totalElements ?? 0) + '명'
        + (s.filter ? ' · 전체 ' + (sum?.totalParticipationCount ?? 0) + '명 중' : '') : '불러오는 중…')
    + '</p>'
    + '<div class="card table-wrap">' + table(s) + '</div>'
    + (s.status === 'ready' ? pager(s.list?.page ?? 0, s.list?.totalPages ?? 1) : '')
    + sportsNotes(s)
    + '<p class="review-note">참여 입력에 휴대폰 번호가 있으면 가운데를 가려서 보여줘요. '
    + '경품 발송에 전체 번호가 필요하면 <strong>당첨자 내려받기</strong>를 쓰세요 — 개인정보이니 다룰 때 주의해주세요.</p>'
    + '</section></div>'
}

/* ───────────────────────── 저장 · 내려받기 ───────────────────────── */

/** datetime-local 은 시간대가 없다. 서버는 OffsetDateTime 을 파싱하므로 KST 를 붙인다 */
const toOffset = (value) => {
  if (!value) return ''
  if (/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return value

  return (value.length === 16 ? value + ':00' : value) + '+09:00'
}

/** 혜택 줄들을 읽는다 — 인원은 추첨일 때만 넣는다 */
function readRewards(form) {
  return [...form.querySelectorAll('[data-reward]')].map((row) => {
    const v = (k) => row.querySelector('[data-rfield="' + k + '"]')?.value?.trim() ?? ''
    const selection = v('selection')
    const r = { rewardId: v('rewardId'), target: v('target'), selection, prizeName: v('prizeName') }
    if (selection === 'DRAW') r.winnerCount = Number(v('winnerCount'))
    return r
  })
}

/** 폼 → 서버가 받는 config. 빈 값은 보내지 않는다 (서버가 모양을 검사한다) */
function readConfig(form, gameCode) {
  const v = (k) => form.querySelector('[data-pconf="' + k + '"]')?.value?.trim() ?? ''
  if (gameCode === 'PRE_REGISTRATION') return {}
  if (gameCode === 'SPORTS_PREDICTION') {
    const c = {
      predictionOptions: v('predictionOptions').split(',').map((x) => x.trim()).filter(Boolean),
      rewards: readRewards(form),
    }
    const at = v('announcementAt')
    if (at) c.announcementAt = toOffset(at)
    return c
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
    const at = v('announcementAt')
    if (at) c.announcementAt = toOffset(at)
  }
  return c
}

/**
 * 승부 예측형 입력 검사 — 서버 SportsPredictionConfig.read 와 같은 규칙.
 * 서버는 어느 칸이 틀렸는지 말해주지 않고 409-1 하나로 답한다.
 */
function checkSports(c, s) {
  const options = c.predictionOptions || []
  const rewards = c.rewards || []
  if (!options.length) return '보기를 하나 이상 입력해주세요.'
  if (new Set(options).size !== options.length) return '보기에 같은 값이 두 번 있어요.'
  if (!c.announcementAt) return '발표 시각을 입력해주세요.'

  // 서버가 이벤트 종료 이후만 받는다. 종료 시각을 못 읽었으면 서버 판단에 맡긴다
  const endAt = s.event?.endAt
  if (endAt && !(new Date(c.announcementAt) > new Date(endAt))) {
    return '발표 시각은 이벤트 종료(' + when(endAt) + ') 이후여야 해요.'
  }

  if (!rewards.length) return '혜택을 하나 이상 넣어주세요.'
  const ids = rewards.map((r) => r.rewardId)
  if (ids.some((id) => !id)) return '혜택 식별자가 비어 있어요. 혜택을 지우고 다시 넣어주세요.'
  if (new Set(ids).size !== ids.length) return '혜택 식별자가 겹쳐요. 혜택을 지우고 다시 넣어주세요.'
  const bad = rewards.find((r) => !r.prizeName)
  if (bad) return '혜택의 경품명을 모두 입력해주세요.'
  const noCount = rewards.find((r) => r.selection === 'DRAW'
    && !(Number.isInteger(r.winnerCount) && r.winnerCount >= 1))
  if (noCount) return '추첨 혜택은 인원을 1명 이상으로 입력해주세요.'
  return null
}

/** 화면이 먼저 보는 것 — 서버 409 는 어느 칸이 틀렸는지 말해주지 않는다 */
function checkConfig(gameCode, c, s) {
  if (gameCode === 'SPORTS_PREDICTION') return checkSports(c, s)
  if (gameCode === 'LUCKY_POUCH') {
    if (!c.pouches.length) return '주머니를 하나 이상 입력해주세요.'
    const bad = c.pouches.find((p) => !Number.isInteger(p.pouchIndex) || p.pouchIndex < 1
      || !Number.isFinite(p.winProbability) || p.winProbability < 0 || p.winProbability > 100 || !p.prizeName)
    if (bad) return '주머니는 "번호 / 확률(0~100) / 경품명" 모양으로 적어주세요.'
    const nums = c.pouches.map((p) => p.pouchIndex).sort((a, b) => a - b)
    if (nums.some((n, i) => n !== i + 1)) return '주머니 번호는 1부터 빠짐없이 이어져야 해요.'

    // ★ 참여가 시작된 뒤에는 경품명만 바꿀 수 있다. 칸 구성이 달라지면 서버가 409 로
    //   거절하는데, 그 답에는 어느 줄이 문제인지 없다 — 여기서 먼저 잡아 준다
    if (started(s) && s.config?.gameCode === 'LUCKY_POUCH') {
      const was = s.config.config?.pouches || []
      const kept = was.length === c.pouches.length && was.every((p) => c.pouches.some((n) =>
        n.pouchIndex === p.pouchIndex && Number(n.winProbability) === Number(p.winProbability)))
      if (!kept) return '참여가 시작돼 칸 수와 당첨 확률은 바꿀 수 없어요 — 경품명만 고쳐주세요.'
    }
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

/**
 * 참여가 시작된 뒤에도 서버가 받아 주는 키.
 *
 * ★ 방식마다 다르다 — 승부 예측형은 **발표 시각뿐**이다. 경품명이 rewards 안에
 *   들어 있어서, 오타 하나만 고쳐도 서버는 "rewards 가 바뀌었다" 로 본다
 *   (ParticipationConfigLock 의 중첩 경품명 특례가 pouches 에만 있다 — 실측 확인).
 */
const EDITABLE_AFTER_START = {
  SPORTS_PREDICTION: ['announcementAt'],
  LUCKY_POUCH: ['prizeName', 'announcementAt', 'pouches'],   // 칸 안의 경품명만 바꾸면 통과한다
  default: ['prizeName', 'announcementAt'],
}

/**
 * 값 비교용 문자열.
 *
 * ★ 그냥 JSON.stringify 로 비교하면 **키 순서만 달라도 "바뀌었다"** 가 된다.
 *   서버에서 온 설정(jsonb)과 화면이 만든 객체는 키 순서가 다르다 —
 *   그대로 비교하면 아무것도 안 고쳤는데 "잠긴 값을 바꿨다" 고 안내하게 된다.
 */
const stable = (v) => JSON.stringify(v, (k, val) => (
  val && typeof val === 'object' && !Array.isArray(val)
    ? Object.fromEntries(Object.keys(val).sort().map((key) => [key, val[key]]))
    : val))

/**
 * 409 PARTICIPATION409-3 안내 문구.
 *
 * ★ 서버 쪽 잠금 규칙이 두 가지다. 어느 쪽인지에 따라 할 말이 다르다.
 *   - 키별 잠금(지금 계약): 방식마다 열린 키가 다르다 (위 EDITABLE_AFTER_START)
 *   - 통째로 잠금(옛 동작): 같은 값을 그대로 보내도 거절한다
 *   그래서 **잠긴 값을 안 건드렸는데도 거절당했으면** 서버가 아직 옛 동작이라는 뜻이다.
 *   그때 "경품명은 고칠 수 있어요" 라고 하면 거짓말이 된다.
 */
function lockedMessage(s, gameCode, config) {
  const savedAll = s.config?.config || {}

  // ★ 정답이 등록돼 있으면 **그것만으로** 거절된다. 설정에는 정답을 담을 수 없는데
  //   (담으면 409-1) 서버는 "사라진 키 = 변경" 으로 보기 때문이다 (실측).
  //   그래서 열려 있다던 발표 시각조차 옮길 수 없다 — 다른 말을 하면 거짓말이 된다.
  if (savedAll.winningPrediction) {
    return '경기 결과가 등록돼 있고 참여 기록도 있어서 설정을 바꿀 수 없어요. '
      + '발표 시각을 옮겨야 하면 백엔드에 문의해주세요.'
  }

  const was = configWithoutProgress(savedAll)
  const open = EDITABLE_AFTER_START[gameCode] ?? EDITABLE_AFTER_START.default
  const changedLocked = gameCode !== (s.config?.gameCode ?? gameCode)
    || [...new Set([...Object.keys(was), ...Object.keys(config)])].some((k) =>
      !open.includes(k) && stable(was[k]) !== stable(config[k]))

  // 바꾼 게 없는데도 거절당했다 — 서버가 아직 "참여 한 건이면 통째로 잠금" 이라는 뜻이다
  if (!changedLocked) {
    return '이 서버는 참여가 시작되면 참여 설정을 통째로 잠급니다 — 경품명도 바꿀 수 없어요.'
  }
  return gameCode === 'SPORTS_PREDICTION'
    ? '참여가 시작돼 바꿀 수 없는 값이에요. 발표 시각만 고칠 수 있어요 (혜택은 경품명까지 잠깁니다).'
    : '참여가 시작돼 바꿀 수 없는 값이에요. 경품명과 발표 시각만 고칠 수 있어요.'
}

async function putConfig(gameCode, raw, rerender) {
  const s = state()
  // ★ 정답 · 발표 완료 시각이 섞여 들어가면 서버가 저장을 거절한다 (409-1)
  const config = configWithoutProgress(raw)
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

async function submitConfig(form, rerender) {
  const s = state()
  if (s.busy) return
  const err = (m) => { const el = form.querySelector('.create-error'); if (el) el.textContent = m }
  const gameCode = form.querySelector('[data-pconf="gameCode"]')?.value || ''
  if (!gameCode) return err('참여 방식을 골라주세요.')

  const config = readConfig(form, gameCode)

  // ★ 보낸 값을 draft 에 남긴다. 저장 중 · 저장 실패에도 화면을 다시 그리는데,
  //   draft 가 없으면 **방금 고친 경품명이 저장돼 있던 옛 값으로 돌아간다.**
  //   (성공했을 때만 putConfig 가 비운다 — 그때는 s.config 가 새 값이다)
  s.configDraft = { gameCode, config }

  const bad = checkConfig(gameCode, config, s)
  if (bad) return err(bad)

  // ★ 정답 · 발표 시각은 설정이 아니다. 끼워 보내면 서버가 거절하고,
  //   떼고 보내면 서버에 있던 값이 지워진다 — 지워질 때는 먼저 물어본다
  const answer = s.config?.config?.winningPrediction
  if (answer && !s.config?.config?.drawnAt) {
    ask('등록한 경기 결과가 지워져요',
      '참여 설정을 저장하면 등록된 경기 결과 "' + answer + '" 가 지워집니다. '
      + '저장한 뒤 경기 결과를 다시 등록해주세요.',
      () => putConfig(gameCode, config, rerender), '저장하고 결과 지우기')
    return
  }

  putConfig(gameCode, config, rerender)
}

/** 경기 결과 등록 · 정정 */
async function submitResult(form, rerender) {
  const s = state()
  if (s.resultBusy) return
  const err = (m) => { const el = form.querySelector('.create-error'); if (el) el.textContent = m }
  const value = form.querySelector('[data-psr="winningPrediction"]')?.value || ''
  if (!value) return err('경기 결과를 골라주세요.')

  s.resultBusy = true
  rerender()
  try {
    await registerSportsResult(s.eventId, value)
    s.resultBusy = false
    // 서버가 config 안에 winningPrediction 을 넣는다 — 다시 읽어야 화면이 맞는다
    await reloadConfig(rerender)
    rerender()
    toast('경기 결과를 등록했어요.')
  } catch (e) {
    s.resultBusy = false
    rerender()
    const box = document.querySelector('#psr-form .create-error')
    const msg = e?.code === 'PARTICIPATION400-1' ? '보기에 없는 값이에요. 보기 중에서 골라주세요.'
      : e?.code === 'PARTICIPATION409-4' ? '이미 발표가 끝났어요. 확정된 당첨은 바꿀 수 없습니다.'
      : e?.code === 'PARTICIPATION409-1' ? '참여 설정을 확인해주세요 — 발표 시각이 이벤트 종료 이후여야 해요.'
      : e?.message || '경기 결과를 등록하지 못했어요.'
    if (box) box.textContent = msg; else toast(msg)
  }
}

/**
 * 당첨자 CSV — 서버에 엔드포인트가 없어서 화면이 페이지를 끝까지 모아 만든다.
 * ★ 전화번호를 **가리지 않고** 넣는다. 경품 발송에 쓰는 파일이다 —
 *   화면에서는 가리지만 내려받기는 원본이 필요하다.
 * ★ 승부 예측형에서 혜택이 둘 이상이면 「경품」은 당첨 혜택 중 하나뿐이다
 *   (서버가 하나만 준다). 화면에도 같은 안내를 띄운다.
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

/**
 * 지금 폼에 들어 있는 값을 draft 에 담는다.
 *
 * ★ 이 화면은 무슨 일이 생기든 **전체를 다시 그린다.** 목록 필터 하나만 눌러도
 *   설정 패널까지 새로 그려지므로, 담아 두지 않으면 입력하던 값이 저장된 값으로
 *   되돌아간다. 그래서 다시 그리기 전에는 항상 먼저 담는다.
 * ★ 폼이 없을 때(설정을 불러오는 중 · 실패)는 담지 않는다 — 빈 draft 를 남기면
 *   나중에 설정을 읽어 와도 빈 폼이 덮어쓴다.
 */
function captureDraft() {
  const s = state()
  const form = document.querySelector('#pconf-form')
  if (!form) return null
  const gameCode = form.querySelector('[data-pconf="gameCode"]')?.value || ''
  s.configDraft = { gameCode, config: gameCode ? readConfig(form, gameCode) : {} }
  return s.configDraft
}

/** main.js 의 click 위임에서 부른다. 처리했으면 true */
function handleParticipantsClick(a, b, rerender) {
  const s = state()
  // 목록 쪽 버튼도 설정 패널을 다시 그린다 — 입력하던 값을 먼저 담는다
  if (a.startsWith('pt-') || a.startsWith('pconf-')) captureDraft()
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
    case 'pconf-reward-add': {
      const d = s.configDraft
      if (d) {
        const rewards = d.config.rewards || (d.config.rewards = [])
        rewards.push({ rewardId: nextRewardId(rewards), target: 'ALL_PARTICIPANTS', selection: 'ALL', prizeName: '' })
      }
      rerender(); return true
    }
    case 'pconf-reward-del': {
      const d = s.configDraft
      if (d) (d.config.rewards || []).splice(Number(b.dataset.index), 1)
      rerender(); return true
    }
  }
  return false
}

/** main.js 의 submit 위임에서 부른다 */
function handleParticipantsSubmit(ev, rerender) {
  if (ev.target.id === 'pconf-form') {
    ev.preventDefault()
    syncDatetimeFields(ev.target)
    submitConfig(ev.target, rerender)
    return true
  }
  if (ev.target.id === 'psr-form') {
    ev.preventDefault()
    submitResult(ev.target, rerender)
    return true
  }
  return false
}

/**
 * 설정 폼의 값이 바뀌면 draft 에 담는다.
 *
 * ★ **모든 칸을 담는다.** 전에는 칸 구성을 바꾸는 셋(방식 · 결과 방식 · 선정)만
 *   담았는데, 그러면 경품명처럼 평범한 입력은 담기지 않아 다시 그릴 때 사라졌다.
 *   (텍스트 입력의 change 는 포커스를 잃을 때 뜬다 — 버튼을 누르면 그 전에 먼저 돈다)
 * ★ 다시 그리는 것은 셋뿐이다. 칸 구성이 달라지는 경우가 아니면 다시 그릴 이유가 없고,
 *   입력 중에 폼을 새로 만들면 커서가 튄다.
 */
const RELAYOUT = ['gameCode', 'resultMode']

function handleParticipantsChange(ev, rerender) {
  const t = ev.target
  const form = t.closest?.('#pconf-form')
  if (!form) return false

  syncDatetimeFields(form)
  captureDraft()
  if (RELAYOUT.includes(t.dataset?.pconf) || t.dataset?.rfield === 'selection') rerender()
  return true
}

function resetParticipants() {
  ui.participants = null
}

export {
  participantsView, ensureParticipants, resetParticipants,
  handleParticipantsClick, handleParticipantsSubmit, handleParticipantsChange,
}
