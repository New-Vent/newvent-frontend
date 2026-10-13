import { esc } from '@shared/dom.js'
import { icon } from '@shared/icons.js'
import { ui } from '@shared/state.js'
import { button } from '@shared/ui/controls.js'
import { modal, closeModal } from '@shared/ui/modal.js'
import { toast } from '@shared/ui/toast.js'
import {
  USE_SERVER,
  loadAdminUsers,
  loadAdminUser,
  changeAdminUserPlan,
} from '@shared/repo.js'

// 기존 프론트의 요금제 목록.
// 서버에는 코드가 아닌 선택한 월 금액을 전달한다.
const PLANS = [
  { name: '베이직', amount: 35000 },
  { name: '스탠다드', amount: 55000 },
  { name: '프리미엄', amount: 79000 },
  { name: '패밀리', amount: 99000 },
]

// 백엔드 MembershipGrade 값에 맞춘다.
const GRADES = {
  NORMAL: '일반',
  EXCELLENT: '우수',
  BEST: '최우수',
}

const money = (amount) => Number(amount).toLocaleString('ko-KR')

const planName = (amount) =>
  PLANS.find((plan) => plan.amount === Number(amount))?.name
  ?? '기존 요금제'

const planLabel = (amount) =>
  `${planName(amount)} · 월 ${money(amount)}원`

function gradeBadge(grade) {
  const color = grade === 'NORMAL'
    ? ''
    : grade === 'EXCELLENT'
      ? 'green'
      : 'pink'

  return `<span class="badge ${color}">
    ${esc(GRADES[grade] ?? grade ?? '–')}
  </span>`
}

function initialState() {
  return {
    status: 'idle',
    keyword: '',
    grade: '',
    page: 0,
    size: 10,
    data: {
      content: [],
      totalElements: 0,
      totalPages: 0,
    },
    error: '',
    request: 0,
  }
}

let usersState = initialState()
let editing = null

/** 로그아웃 시 조회한 사용자 정보를 비운다. */
export function resetAdminUsers() {
  usersState = initialState()
  editing = null
}

/** 사용자 목록을 처음 열 때 한 번 조회한다. */
export function ensureAdminUsers(render) {
  if (USE_SERVER && usersState.status === 'idle') {
    reloadAdminUsers(render)
  }
}

/** 검색 조건에 맞는 목록을 서버에서 조회한다. */
export async function reloadAdminUsers(render) {
  const current = usersState
  const request = ++current.request

  current.status = 'loading'
  current.error = ''
  render()

  try {
    const data = await loadAdminUsers({
      keyword: current.keyword,
      grade: current.grade,
      page: current.page,
      size: current.size,
    })

    // 로그아웃했거나 더 최근 요청이 있으면 이전 응답은 무시한다.
    if (
      usersState !== current
      || request !== current.request
    ) return

    // 등급 변경으로 마지막 페이지가 비면 유효한 페이지로 이동한다.
    if (current.page > 0 && data.content.length === 0) {
      current.page = Math.max(0, data.totalPages - 1)
      return reloadAdminUsers(render)
    }

    current.data = data
    current.status = 'ready'
  } catch (error) {
    if (
      usersState !== current
      || request !== current.request
    ) return

    current.status = 'error'
    current.error =
      error?.message || '사용자 목록을 불러오지 못했어요.'
  }

  render()
}

/** 사용자 목록 표 */
function userTable() {
  if (!USE_SERVER) {
    return `
      <div class="empty">
        <p>서버 인증을 켜면 사용자 목록을 조회할 수 있어요.</p>
      </div>
    `
  }

  if (['idle', 'loading'].includes(usersState.status)) {
    return `
      <div class="empty" role="status">
        사용자를 불러오고 있어요.
      </div>
    `
  }

  if (usersState.status === 'error') {
    return `
      <div class="empty">
        <p>${esc(usersState.error)}</p>
        ${button('users-reload', '다시 불러오기', '', 'btn sm')}
      </div>
    `
  }

  const rows = usersState.data.content.map((user) => `
    <tr>
      <td>
        <h3>${esc(user.name)}</h3>
        <small>ID ${esc(user.id)} · ${esc(user.loginId)}</small>
      </td>
      <td>${esc(user.email ?? '–')}</td>
      <td>
        <h3>${esc(planName(user.plan))}</h3>
        <small>월 ${money(user.plan)}원</small>
      </td>
      <td>${gradeBadge(user.membershipGrade)}</td>
      <td>${esc(user.joinedAt ?? '–')}</td>
      <td>
        <div class="row">
          ${button(
            'users-detail',
            '상세 보기',
            `data-id="${user.id}"`,
            'btn sm',
          )}
          ${button(
            'users-plan',
            '요금제 변경',
            `data-id="${user.id}"`,
            'btn sm soft',
          )}
        </div>
      </td>
    </tr>
  `).join('')

  return `
    <table class="admin-table users-table">
      <thead>
        <tr>
          <th>사용자</th>
          <th>이메일</th>
          <th>요금제 · 월 요금</th>
          <th>등급</th>
          <th>가입일</th>
          <th>관리</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `
          <tr>
            <td colspan="6">검색 결과가 없습니다.</td>
          </tr>
        `}
      </tbody>
    </table>
  `
}

/** 사용자 관리 화면 */
export function usersView() {
  const s = usersState

  const filters = Object.entries({
    '': '전체',
    ...GRADES,
  }).map(([value, label]) =>
    button(
      'users-grade',
      label,
      `data-grade="${value}" aria-pressed="${s.grade === value}"`,
      s.grade === value ? 'active' : '',
    ),
  ).join('')

  const count = s.status === 'ready'
    ? `${s.data.totalElements}명 사용자`
    : ''

  const totalPages = s.data.totalPages

// 현재 페이지 주변 최대 5개 번호 표시
const start = Math.max(
  0,
  Math.min(s.page - 2, totalPages - 5),
)
const end = Math.min(totalPages, start + 5)

const pageButtons = Array.from(
  { length: Math.max(0, end - start) },
  (_, index) => {
    const page = start + index
    const active = page === s.page

    return button(
      'users-page',
      String(page + 1),
      `data-page="${page}"${
        active ? ' aria-current="page"' : ''
      }`,
      `btn sm ${active ? 'primary' : 'ghost'}`,
    )
  },
).join('')

    const pager = s.status === 'ready' && totalPages > 1
    ? `
        <div class="admin-pager" aria-label="사용자 목록 페이지">
        ${button(
            'users-page',
            '이전',
            `data-page="${s.page - 1}"${
            s.page === 0 ? ' disabled' : ''
            }`,
            'btn sm ghost',
        )}

        ${pageButtons}

        ${button(
            'users-page',
            '다음',
            `data-page="${s.page + 1}"${
            s.page + 1 >= totalPages ? ' disabled' : ''
            }`,
            'btn sm ghost',
        )}
        </div>
    `
    : ''

  return `
    <div class="container">
      <div class="page-heading">
        <span class="eyebrow">USER MANAGEMENT</span>
        <h1>사용자 관리</h1>
        <p>사용자 정보를 확인하고, 요금제를 변경하세요.</p>
      </div>

      <section class="users-list">
        <div class="section-title spread">
          <h2>사용자 목록</h2>

          <form id="users-search-form" class="row users-search-form">
            <label class="search">
              ${icon('search')}
              <input
                name="keyword"
                aria-label="사용자 검색"
                placeholder="이름, 아이디, 이메일 검색"
                value="${esc(s.keyword)}"
              >
            </label>
            <button
              type="submit"
              class="btn sm primary"
              ${!USE_SERVER ? 'disabled' : ''}
            >
              검색
            </button>
          </form>
        </div>

        <div class="admin-status-filters">
          ${filters}
        </div>

        <p class="admin-result-count" aria-live="polite">
          ${count}
        </p>

        <div
          class="card table-wrap"
          aria-busy="${s.status === 'loading'}"
        >
          ${userTable()}
        </div>

        ${pager}
      </section>
    </div>
  `
}

/** 상세 창에 표시할 사용자 정보 */
function userDetails(user) {
  return `
    <dl class="users-details">
      <dt>이름</dt>
      <dd>${esc(user.name)}</dd>

      <dt>아이디</dt>
      <dd>${esc(user.loginId)}</dd>

      <dt>이메일</dt>
      <dd>${esc(user.email ?? '–')}</dd>

      <dt>전화번호</dt>
      <dd>${esc(user.phone ?? '–')}</dd>

      <dt>가입일</dt>
      <dd>${esc(user.joinedAt ?? '–')}</dd>

      <dt>현재 요금제</dt>
      <dd>${esc(planLabel(user.plan))}</dd>

      <dt>멤버십 등급</dt>
      <dd>${gradeBadge(user.membershipGrade)}</dd>
    </dl>
  `
}

/** 상세 조회 후 상세 창 또는 요금제 변경 창을 연다. */
async function openUser(userId, changePlan) {
  const current = usersState
  editing = null

  modal(
    changePlan ? '요금제 변경' : '사용자 상세',
    '<div id="users-modal-body"><p>사용자 정보를 불러오고 있어요.</p></div>',
  )

  const body = document.getElementById('users-modal-body')

  try {
    const user = await loadAdminUser(userId)

    if (
      usersState !== current
      || ui.route !== 'users'
      || !body.isConnected
    ) return

    body.innerHTML = userDetails(user)

    if (!changePlan) {
      body.innerHTML += `
        <div class="modal-actions">
          ${button('close', '닫기')}
          ${button(
            'users-plan',
            '요금제 변경',
            `data-id="${user.id}"`,
            'btn primary',
          )}
        </div>
      `
      return
    }

    editing = {
      user,
      body,
      confirmed: null,
      busy: false,
    }

    const options = PLANS.map((plan) => {
      const isCurrent = plan.amount === Number(user.plan)

      return `
        <option value="${plan.amount}" ${isCurrent ? 'disabled' : ''}>
          ${esc(plan.name)} · 월 ${money(plan.amount)}원
          ${isCurrent ? '(현재)' : ''}
        </option>
      `
    }).join('')

    body.innerHTML += `
      <form id="users-plan-form">
        <label class="field">
          변경할 요금제
          <select name="plan" id="users-plan-select" required>
            <option value="" selected disabled>
              변경할 요금제를 선택해주세요
            </option>
            ${options}
          </select>
        </label>

        <p class="helper users-plan-help">
          요금제를 변경하면 서버가 멤버십 등급을 다시 계산합니다.
        </p>

        <p
          id="users-plan-message"
          class="users-plan-message"
          role="status"
        ></p>

        <div class="modal-actions">
          ${button('close', '취소')}
          <button
            type="submit"
            id="users-plan-save"
            class="btn primary"
            disabled
          >
            변경 내용 확인
          </button>
        </div>
      </form>
    `

    body.querySelector('select').focus()
  } catch (error) {
    if (usersState === current && body.isConnected) {
      body.innerHTML = `
        <p role="alert">
          ${esc(error?.message || '사용자 정보를 불러오지 못했어요.')}
        </p>
      `
    }
  }
}

/** 검색 외 버튼 클릭 처리 */
export function handleUsersClick(action, target, render) {
  if (!action.startsWith('users-')) return false
  if (!USE_SERVER) return true

  if (action === 'users-reload') {
    reloadAdminUsers(render)
  }

  if (action === 'users-grade') {
    usersState.grade = target.dataset.grade
    usersState.page = 0
    reloadAdminUsers(render)
  }

  if (action === 'users-page') {
    usersState.page = Number(target.dataset.page)
    reloadAdminUsers(render)
  }

  if (action === 'users-detail' || action === 'users-plan') {
    openUser(target.dataset.id, action === 'users-plan')
  }

  return true
}

/** 요금제 선택 변경 처리 */
export function handleUsersChange(event) {
  if (event.target.id !== 'users-plan-select') return false

  const edit = editing
  if (!edit || !edit.body.isConnected || edit.busy) return true

  edit.confirmed = null
  edit.body.querySelector('#users-plan-message').textContent = ''

  const save = edit.body.querySelector('#users-plan-save')
  save.disabled = !PLANS.some(
    (plan) => plan.amount === Number(event.target.value),
  )
  save.textContent = '변경 내용 확인'

  return true
}

/** 검색 및 요금제 변경 폼 제출 처리 */
export function handleUsersSubmit(event, render) {
  if (event.target.id === 'users-search-form') {
    event.preventDefault()
    if (!USE_SERVER) return true

    usersState.keyword = new FormData(event.target)
      .get('keyword')
      .trim()
    usersState.page = 0

    reloadAdminUsers(render)
    return true
  }

  if (event.target.id !== 'users-plan-form') return false

  event.preventDefault()

  const edit = editing
  if (!edit || edit.busy || !edit.body.isConnected) return true

  const amount = Number(new FormData(event.target).get('plan'))

  if (
    !PLANS.some((plan) => plan.amount === amount)
    || amount === Number(edit.user.plan)
  ) return true

  const message = edit.body.querySelector('#users-plan-message')
  const save = edit.body.querySelector('#users-plan-save')

  // 첫 제출은 변경 내용을 확인하고, 두 번째 제출에 저장한다.
  if (edit.confirmed !== amount) {
    edit.confirmed = amount
    message.textContent =
      `${planLabel(edit.user.plan)} → ${planLabel(amount)}으로 변경할까요?`
    save.textContent = '변경 확정'
    return true
  }

  edit.busy = true
  save.disabled = true
  edit.body.querySelector('select').disabled = true

  const current = usersState

  changeAdminUserPlan(edit.user.id, amount)
    .then((updated) => {
      if (usersState !== current) return

      if (edit.body.isConnected) closeModal()

      // 프론트에서 등급을 추측하지 않고 서버 응답을 사용한다.
      const grade =
        GRADES[updated.membershipGrade] ?? updated.membershipGrade

      toast(`요금제를 변경했어요. 현재 등급: ${grade}`)

      // 변경 후 등급 필터와 페이지에 맞게 목록을 다시 조회한다.
      reloadAdminUsers(render)
    })
    .catch((error) => {
      if (usersState !== current || !edit.body.isConnected) return

      message.textContent =
        error?.message || '요금제를 변경하지 못했어요.'
    })
    .finally(() => {
      edit.busy = false

      if (edit.body.isConnected) {
        save.disabled = false
        edit.body.querySelector('select').disabled = false
      }
    })

  return true
}