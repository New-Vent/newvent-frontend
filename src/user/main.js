import './styles.css'

import { $, esc } from '@shared/dom.js'
import { AUTH_ENABLED, createApi } from '@shared/api.js'
import { handleLoginSubmit } from '@shared/login-form.js'
import { loadEvent, loadEvents, loadParticipations, useApi, USE_SERVER } from '@shared/repo.js'
import { state, ui } from '@shared/state.js'
import { persist } from '@shared/persist.js'
import { icon } from '@shared/icons.js'
import { button } from '@shared/ui/controls.js'
import { toast } from '@shared/ui/toast.js'
import { closeModal, ask } from '@shared/ui/modal.js'
import { hydrate } from '@shared/preview/frame.js'
import { createRouter } from '@shared/router.js'
import { setNavigate } from '@shared/navigate.js'
import { initialDatabase, PLANS, gradeOfPlan } from '@shared/mock/fixtures.js'

import { homeView, refreshResults } from './views/home.js'
import { eventView } from './views/event.js'
import { myView } from './views/my.js'
import { loginView } from './views/login.js'
import { signupView } from './views/signup.js'
import { accountView } from './views/account.js'
import { showLoginPrompt, showResult } from './actions.js'

const PLAN_FEES = {
  BASIC: 35000,
  STANDARD: 55000,
  PREMIUM: 79000,
  FAMILY: 99000,
}

/**
 * 사용자 앱 셸.
 *
 * 원본(newvent-design.html)은 ui.route 문자열 하나로 화면을 갈랐다.
 * 여기서는 URL 을 진짜로 바꾸되, ui.route 는 그대로 둬서 이식한 뷰
 * 함수들을 손대지 않는다. 라우터가 주소를 읽어 ui.route 를 맞춘다.
 */
export const api = createApi({ authBase: '/api/auth' })

// repo 가 이 클라이언트로 서버를 부른다 (목업 모드면 안 쓰인다).
useApi(api)

const VIEWS = { home: homeView, event: eventView, my: myView, login: loginView, signup: signupView, account: accountView }

const ROUTES = [
  { path: '/', name: 'home' },
  { path: '/events/:id', name: 'event' },
  { path: '/my', name: 'my' },
  { path: '/login', name: 'login' },
  { path: '/signup', name: 'signup' },
  { path: '/account', name: 'account' },
]

/** ui.route → URL. navigate() 가 쓴다. */
const PATH = {
  home: () => '/',
  event: (id) => `/events/${id}`,
  my: () => '/my',
  login: () => '/login',
  signup: () => '/signup',
  account: () => '/account',
}

/** 헤더에 띄울 이름. 서버 인증이면 /api/users/me 의 name, 목업이면 원본 그대로 */
function displayName() {
  return AUTH_ENABLED ? ui.userName || '회원' : '헌진'
}

/** 로그인 · 새로고침 복구 뒤 내 정보를 읽는다. 실패해도 로그인 상태는 유지한다 (이름만 기본값) */
async function loadMe() {
  try {
    ui.userName = (await api.get('/api/users/me')).name
  } catch {
    ui.userName = null
  }
}

function header() {
  $('#header').innerHTML =
    '<div class="container">' +
    '<a class="brand" href="/" data-link aria-label="NewVent 홈">' +
    '<span class="brand-mark"></span><span>New<b>Vent</b></span></a>' +
    '<nav class="nav" aria-label="주 메뉴">' +
    button('route', '이벤트', 'data-route="home"', ui.route === 'home' || ui.route === 'event' ? 'active' : '') +
    button('route', '내 혜택', 'data-route="my"', ui.route === 'my' ? 'active' : '') +
    (ui.logged ? button('route', '내 정보', 'data-route="account"', ui.route === 'account' ? 'active' : '') : '') +
    '</nav><div class="account">' +
    (ui.logged
      ? '<span class="avatar">' + icon('user') + '</span><span class="name">' + esc(displayName()) + '님</span>' +
        button('logout', '로그아웃', '', 'btn ghost sm')
      : button('route', '로그인', 'data-route="login"', 'btn soft sm') +
        button('route', '회원가입', 'data-route="signup"', 'btn sm')) +
    '</div></div>'

  $('#footer').innerHTML =
    '<div class="container spread"><span class="brand">New<b>Vent</b></span>' +
    '<p>데모 데이터로 동작하는 화면입니다. 실제 경품은 지급되지 않습니다.</p></div>'
}

/* ───────────── 서버 모드 데이터 ─────────────
 * 화면이 동기 렌더라 먼저 불러오고 끝나면 다시 그린다.
 * 상태를 ui 에 담아 뷰가 로딩 · 오류를 그릴 수 있게 한다.
 */

/** 목록 — 한 번만 부르고, 실패하면 다시 시도 버튼이 재호출한다. */
function ensureEvents(rerender) {
  if (!USE_SERVER) return
  if (ui.serverEventsState === 'loading' || ui.serverEventsState === 'done') return
  ui.serverEventsState = 'loading'
  loadEvents().then(
    (list) => { ui.serverEvents = list; ui.serverEventsState = 'done'; rerender() },
    (err) => { ui.serverEventsError = err?.message || '목록을 불러오지 못했어요.'
               ui.serverEventsState = 'error'; rerender() },
  )
}

/** 상세 — 보고 있는 이벤트가 바뀌면 다시 부른다. */
function ensureEvent(id, rerender) {
  if (!USE_SERVER || !id) return
  if (ui.serverEvent?.id === Number(id) && ui.serverEventState === 'done') return
  if (ui.serverEventState === 'loading' && ui.serverEventId === String(id)) return
  ui.serverEventId = String(id)
  ui.serverEventState = 'loading'
  loadEvent(id).then(
    (ev) => { if (ui.serverEventId !== String(id)) return
              ui.serverEvent = ev; ui.serverEventState = 'done'; rerender() },
    (err) => { if (ui.serverEventId !== String(id)) return
               ui.serverEventError = err?.message || '이벤트를 불러오지 못했어요.'
               ui.serverEventState = 'error'; rerender() },
  )
}


/**
 * 내 참여 목록 — 요약과 목록을 한 번에 받는다.
 * 필터(전체/받은 혜택)가 바뀌면 서버에 다시 묻는다. 서버가 거르는 쪽이
 * 요약 숫자와 어긋나지 않는다 — 페이지네이션이 있어 현재 페이지만으로는 셀 수 없다.
 */
function ensureMy(rerender) {
  if (!USE_SERVER || !ui.logged) return
  const want = ui.myFilter === 'rewards' ? 'REWARDS' : 'ALL'
  if (ui.serverMyState === 'loading') return
  if (ui.serverMyState === 'done' && ui.serverMyFilter === want) return
  ui.serverMyFilter = want
  ui.serverMyState = 'loading'
  loadParticipations({ filter: want }).then(
    (d) => { ui.serverMy = d; ui.serverMyState = 'done'; rerender() },
    (err) => { ui.serverMyError = err?.message || '참여 내역을 불러오지 못했어요.'
               ui.serverMyState = 'error'; rerender() },
  )
}


function render(scroll = false) {
  state.observers.forEach((x) => x.disconnect())
  state.observers = []
  if (ui.route === 'home') ensureEvents(() => render())
  if (ui.route === 'event') ensureEvent(ui.activeId, () => render())
  if (ui.route === 'my') ensureMy(() => render())
  header()
  $('#app').innerHTML = (VIEWS[ui.route] || homeView)()
  hydrate()
  document.title = (ui.route === 'my' ? '내 혜택' : '이벤트로 만나는 즐거움') + ' | NewVent'
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

// 이식한 뷰들이 @shared/navigate.js 를 통해 이걸 부른다.
setNavigate(navigate)

document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-act], a[data-link]')
  if (!b) return
  if (b.matches('a[data-link]')) {
    ev.preventDefault()
    router.navigate(b.getAttribute('href'))
    return
  }
  ev.preventDefault()
  if (b.disabled) return
  const a = b.dataset.act

  if (a === 'signup-plan') {
    ui.signup = { ...(ui.signup ?? {}), plan: b.dataset.plan }

    document.querySelectorAll('[data-act="signup-plan"]').forEach((card) => {
      const selected = card.dataset.plan === b.dataset.plan
      card.classList.toggle('selected', selected)
      card.setAttribute('aria-pressed', String(selected))
    })
    return
  }
  if (a === 'change-plan') {
    const next = PLANS.find((p) => p.code === b.dataset.plan)
    if (!next) return
    ask(
      next.name + ' 요금제로 바꿀까요?',
      '멤버십 등급이 ' + state.db.me.grade + ' 에서 ' + next.grade + ' 로 바뀝니다. ' +
        '등급에 따라 참여할 수 있는 이벤트가 달라져요.',
      () => {
        state.db.me.plan = next.code
        state.db.me.grade = next.grade
        // 참여 판정이 등급을 보므로 같이 맞춰준다.
        ui.demoGrade = next.grade === '일반' ? '일반' : 'VIP · FAMILY'
        persist()
        render()
        toast(next.name + ' 요금제로 바꿨어요. 등급은 ' + next.grade + ' 입니다.')
      },
      '변경하기',
    )
    return
  }
  // ask() 가 띄운 확인 모달의 '확인' 버튼. 이게 없으면 ask() 가 통째로 죽는다.
  if (a === 'confirm-local') {
    const fn = state.confirmAction
    closeModal()
    if (fn) fn()
    return
  }
  if (a === 'reload-my') {
    ui.serverMyState = null
    render()
    return
  }
  if (a === 'reload-events') {
    ui.serverEventsState = null
    render()
    return
  }
  if (a === 'close') return closeModal()
  if (a === 'route') return navigate(b.dataset.route)
  if (a === 'event') return navigate('event', b.dataset.id)
  if (a === 'login-prompt') return showLoginPrompt()
  if (a === 'result') return ui.logged ? showResult(b.dataset.id) : showLoginPrompt()
  if (a === 'logout') {
    logout()
    return
  }
  if (a === 'hero-prev') {
    ui.hero = (ui.hero || 0) - 1
    render()
    return
  }
  if (a === 'hero-next') {
    ui.hero = (ui.hero || 0) + 1
    render()
    return
  }
  if (a === 'filter') {
    ui.filter = b.dataset.value
    refreshResults()
    return
  }
  if (a === 'category') {
    ui.category = b.dataset.value
    render()
    return
  }
  if (a === 'clear-filter') {
    ui.filter = 'all'
    ui.category = 'all'
    ui.query = ''
    render()
    return
  }
  if (a === 'my-filter') {
    ui.myFilter = b.dataset.value
    // 서버 모드는 필터를 서버가 건다. 상태를 비워 ensureMy 가 다시 묻게 한다.
    if (USE_SERVER) ui.serverMyState = null
    render()
    return
  }
  if (a === 'reset') {
    state.db = initialDatabase()
    persist()
    render()
    toast('체험 데이터를 초기화했어요.')
    return
  }
})

async function logout() {
  if (AUTH_ENABLED) await api.logout()
  ui.logged = false
  ui.userName = null
  navigate('home')
  toast('로그아웃했어요.')
}

document.addEventListener('submit', (ev) => {
  if (ev.target.id !== 'login-form') return
  handleLoginSubmit(ev, api, async () => {
    ui.logged = true
    await loadMe()
    toast('로그인했어요.')
    // 로그인 화면에서 왔으면 홈으로, 내 혜택 등 다른 화면 안에서 로그인했으면 그 자리에서 다시 그린다
    if (ui.route === 'login') navigate('home')
    else render()
  })
})

document.addEventListener('input', (ev) => {
  if (ev.target.id === 'event-search') {
    ui.query = ev.target.value
    refreshResults()
  }
})

/**
 * 회원가입 · 내 정보 저장.
 * 회원가입은 서버 모드에서 API를 호출하고, 성공 후 로그인 화면으로 이동한다.
 * 내 정보 저장은 아직 목업으로 처리한다.
 */
document.addEventListener('submit', async (ev) => {
  const form = ev.target

    if (form.id === 'signup-form') {
    ev.preventDefault()

    if (form.dataset.submitting === 'true') return

    const get = (key) => form.querySelector(`[data-signup="${key}"]`)
    const val = (key) => get(key)?.value.trim() ?? ''
    const errorBox = form.querySelector('#signup-error')

    const fail = (message, key) => {
      if (errorBox) errorBox.textContent = message
      if (key) get(key)?.focus()
    }

    if (errorBox) errorBox.textContent = ''

    const loginId = val('loginId')
    const password = get('password')?.value ?? ''
    const password2 = get('password2')?.value ?? ''
    const name = val('name')
    const email = val('email')
    const phone = val('phone')
    const plan = ui.signup?.plan ?? 'BASIC'
    const planFee = PLAN_FEES[plan]

    if (!loginId || loginId.length > 50) {
      return fail('아이디는 1~50자로 입력해주세요.', 'loginId')
    }

    if (!password.trim() || password.length < 8 || password.length > 100) {
      return fail('비밀번호는 8~100자로 입력해주세요.', 'password')
    }

    if (password !== password2) {
      return fail('비밀번호가 서로 다릅니다.', 'password2')
    }

    if (!name || name.length > 50) {
      return fail('이름은 1~50자로 입력해주세요.', 'name')
    }

    if (
      !email ||
      email.length > 100 ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
    ) {
      return fail('이메일 형식을 확인해주세요. 최대 100자까지 입력할 수 있어요.', 'email')
    }

    if (phone.length > 20) {
      return fail('휴대폰 번호는 최대 20자까지 입력할 수 있어요.', 'phone')
    }

    if (!planFee) {
      return fail('요금제를 선택해주세요.')
    }

    if (AUTH_ENABLED) {
      const submitButton = form.querySelector('button[type="submit"]')

      form.dataset.submitting = 'true'

      if (submitButton) {
        submitButton.disabled = true
        submitButton.textContent = '가입 중…'
      }

      try {
        await api.post('/api/public/users/signup', {
          loginId,
          password,
          name,
          email,
          phone: phone || null,
          plan: planFee,
        })

        ui.signup = null
        navigate('login')
        toast('회원가입이 완료됐어요. 로그인해주세요.')
      } catch (error) {
        if (errorBox) {
          errorBox.textContent =
            error?.message || '회원가입에 실패했어요. 다시 시도해주세요.'
        }
      } finally {
        delete form.dataset.submitting

        if (submitButton) {
          submitButton.disabled = false
          submitButton.textContent = '가입하기'
        }
      }

      return
    }

    // 서버 연동을 끈 경우에만 사용하는 목업 처리
    state.db.me = {
      ...state.db.me,
      loginId,
      name,
      email,
      phone,
      plan,
      grade: gradeOfPlan(plan),
      marketingOptIn: Boolean(get('agree')?.checked),
      joinedAt: new Date()
        .toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
        .replace(/\.$/, ''),
    }

    ui.signup = null
    ui.logged = true
    ui.demoGrade = gradeOfPlan(plan) === '일반' ? '일반' : 'VIP · FAMILY'
    persist()
    navigate('home')
    toast(state.db.me.name + '님, 가입을 환영해요!')
    return
  }

  if (form.id === 'account-form') {
    ev.preventDefault()
    const val = (k) => form.querySelector(`[data-account="${k}"]`)?.value.trim() ?? ''
    const box = $('#account-error')
    if (!val('name')) { if (box) box.textContent = '이름을 입력해주세요.'; return }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val('email'))) { if (box) box.textContent = '이메일 형식을 확인해주세요.'; return }
    if (!/^01[016789]\d{7,8}$/.test(val('phone').replace(/\D/g, ''))) { if (box) box.textContent = '휴대폰 번호 형식을 확인해주세요.'; return }

    Object.assign(state.db.me, {
      name: val('name'),
      email: val('email'),
      phone: val('phone'),
      marketingOptIn: Boolean(form.querySelector('[data-account="marketingOptIn"]')?.checked),
    })
    persist()
    render()
    toast('내 정보를 저장했어요.')
  }
})

$('#overlay').addEventListener('click', (ev) => {
  if (ev.target.classList.contains('modal-backdrop')) closeModal()
})

ui.role = 'user'

// 서버 인증 사용 여부는 AUTH_ENABLED (@shared/api.js). 꺼져 있으면 목업 로그인 상태로 돈다.

async function start() {
  if (AUTH_ENABLED) {
    // 새로고침으로 메모리 토큰이 비었어도 Refresh 쿠키로 되살린다.
    // 먼저 갱신하고 렌더해야 로그인 화면이 깜빡였다 바뀌지 않는다.
    // 성공하면 boot() 가 만료 전 갱신 폴링까지 시작한다.
    ui.logged = await api.boot()
    if (ui.logged) await loadMe()
  } else {
    ui.logged = true
  }
  router.start()
}

start()
