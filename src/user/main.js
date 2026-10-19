import './styles.css'

import { $, esc } from '@shared/dom.js'
import { AUTH_ENABLED, createApi } from '@shared/api.js'
import { handleLoginSubmit } from '@shared/login-form.js'
import { loadEvent, loadEvents, loadMembershipGrades, loadMyProfile, loadParticipations, loadParticipationStatus, participate, participationBody, signUp, updateMyProfile, useApi, USE_SERVER } from '@shared/repo.js'
import { ensureServerEvent, isUpcomingEvent } from './event-loading.js'
import { state, ui } from '@shared/state.js'
import { persist } from '@shared/persist.js'
import { icon } from '@shared/icons.js'
import { button } from '@shared/ui/controls.js'
import { toast } from '@shared/ui/toast.js'
import { closeModal, ask } from '@shared/ui/modal.js'
import { hydrate, markParticipated } from '@shared/preview/frame.js'
import { createRouter } from '@shared/router.js'
import { setNavigate } from '@shared/navigate.js'
import { initialDatabase, PLANS, gradeOfPlan } from '@shared/mock/fixtures.js'

import { homeView, refreshResults } from './views/home.js'
import { eventView } from './views/event.js'
import { myView } from './views/my.js'
import { loginView } from './views/login.js'
import { firstSignupError, signupView } from './views/signup.js'
import { accountView } from './views/account.js'
import { showLoginPrompt, showResult } from './actions.js'

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
  ui.serverMe = null
  ui.serverMeError = null

  try {
    const me = await loadMyProfile()
    ui.serverMe = me
    ui.userName = me.name
    // 등급 안내 — membershipGrade 는 EXCELLENT 같은 영문 코드라 화면에 그대로 쓸 수 없다.
    // 곁들이는 정보라 실패해도 그냥 둔다 (그때는 코드가 보인다).
    loadMembershipGrades().then((gs) => { ui.serverGrades = gs }, () => {})
  } catch (error) {
    ui.userName = null
    ui.serverMeError =
      error?.message || '내 정보를 불러오지 못했어요.'
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
  if (['loading', 'done', 'error'].includes(ui.serverEventsState)) return
  ui.serverEventsState = 'loading'
  loadEvents().then(
    (list) => { ui.serverEvents = list; ui.serverEventsState = 'done'; rerender() },
    (err) => { ui.serverEventsError = err?.message || '목록을 불러오지 못했어요.'
               ui.serverEventsState = 'error'; rerender() },
  )
}

/** 상세 — 보고 있는 이벤트가 바뀌면 다시 부른다. */
function ensureEvent(id, rerender) {
  if (USE_SERVER) ensureServerEvent(ui, id, loadEvent, rerender)
}


/**
 * 참여 가능 여부 — 상세 화면의 옆 패널이 쓴다.
 *
 * 공개 상세(loadEvent)에는 참여 정보가 없어서 따로 부른다. 로그인해야 하는
 * 엔드포인트라 로그아웃 상태에서는 아예 묻지 않는다 (패널이 로그인 안내를 띄운다).
 *
 * ★ 이벤트가 바뀌면 다시 묻는다. 참여 직후에는 다시 묻지 않는다 —
 *   result 를 들고 있는 동안은 그 결과를 보여줘야 하기 때문이다.
 */
function ensureParticipationStatus(id, rerender) {
  if (!USE_SERVER || !id || !ui.logged) return
  const s = ui.serverParticipation
  if (s && s.eventId === String(id) && (s.state === 'loading' || s.state === 'done' || s.state === 'error')) return
  ui.serverParticipation = { eventId: String(id), state: 'loading', data: null, error: null, busy: false, result: null }
  loadParticipationStatus(id).then(
    (d) => { const cur = ui.serverParticipation
             if (cur?.eventId !== String(id)) return
             cur.data = d; cur.state = 'done'
             // 이미 참여했으면 페이지 안의 버튼도 잠가 둔다 (frame.js live 분기가 읽는다)
             if (d?.participated) ui.participated = { ...(ui.participated || {}), [String(id)]: true }
             rerender() },
    (err) => { const cur = ui.serverParticipation
               if (cur?.eventId !== String(id)) return
               cur.error = err?.message || '참여 가능 여부를 확인하지 못했어요.'
               cur.state = 'error'; rerender() },
  )
}

/**
 * 내 참여 목록 — 요약과 목록을 한 번에 받는다.
 * 필터(전체/받은 혜택)가 바뀌면 서버에 다시 묻는다. 서버가 거르는 쪽이
 * 요약 숫자와 어긋나지 않는다 — 페이지네이션이 있어 현재 페이지만으로는 셀 수 없다.
 */
function ensureMy(rerender) {
  if (!USE_SERVER || !ui.logged) return

  const filter = ui.myFilter === 'rewards' ? 'REWARDS' : 'ALL'
  const page = ui.myPage ?? 0
  const key = `${filter}:${page}`

  if (
    ui.serverMyKey === key
    && ['loading', 'done', 'error'].includes(ui.serverMyState)
  ) return

  ui.serverMyKey = key
  ui.serverMyFilter = filter
  ui.serverMyState = 'loading'
  ui.serverMyError = null

  loadParticipations({ filter, page, size: 10 }).then(
    (data) => {
      if (!ui.logged || ui.serverMyKey !== key) return

      // 기록 수가 줄어 현재 페이지가 사라졌으면 마지막 페이지로 이동한다.
      const lastPage = Math.max(0, data.totalPages - 1)

      if (page > lastPage) {
        ui.myPage = lastPage
        ui.serverMyState = null
        rerender()
        return
      }

      ui.serverMy = data
      ui.serverMyState = 'done'
      rerender()
    },
    (error) => {
      if (!ui.logged || ui.serverMyKey !== key) return

      ui.serverMyError =
        error?.message || '참여 내역을 불러오지 못했어요.'
      ui.serverMyState = 'error'
      rerender()
    },
  )
}


function render(scroll = false) {
  state.observers.forEach((x) => x.disconnect())
  state.observers = []
  if (ui.route === 'home') ensureEvents(() => render())
  if (ui.route === 'event') {
    ensureEvent(ui.activeId, () => render())
    ensureParticipationStatus(ui.activeId, () => render())
  }
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

  if (a === 'reload-account') {
    if (ui.accountReloading) return

    ui.accountReloading = true
    b.disabled = true

    loadMe().then(() => {
      ui.accountReloading = false
      render()
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
  if (a === 'reload-event') {
    ui.serverEventState = null
    render()
    return
  }
  if (a === 'close') return closeModal()
  if (a === 'route') return navigate(b.dataset.route)
  if (a === 'event') return navigate('event', b.dataset.id)
  if (a === 'login-prompt') return showLoginPrompt()
  if (a === 'result') return ui.logged ? showResult(b.dataset.id, b.dataset.eventId) : showLoginPrompt()
  if (a === 'participation-retry') {
    ui.serverParticipation = null
    render()
    return
  }
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
    ui.myPage = 0

    if (USE_SERVER) ui.serverMyState = null

    render()
    return
  }

  if (a === 'my-page') {
    if (!USE_SERVER || ui.serverMyState !== 'done') return

    const page = Number(b.dataset.page)
    const totalPages = ui.serverMy?.totalPages ?? 0

    if (
      !Number.isInteger(page)
      || page < 0
      || page >= totalPages
      || page === (ui.myPage ?? 0)
    ) return

    ui.myPage = page
    ui.serverMyState = null
    render(true)
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

/**
 * 서버 모드 참여 — 옆 패널의 폼.
 *
 * ★ 본문은 방식마다 하나만 보낸다 (participationBody). BASIC 은 아예 안 보낸다.
 * ★ 성공하면 결과를 패널에 남기고, 내 참여 목록 캐시를 비워 다음에 다시 읽게 한다.
 * ★ 409(이미 참여)는 화면이 낡은 것이다 — 상태를 다시 물어 버튼을 닫는다.
 */
/**
 * 페이지 안의 「참여하기」 — iframe 이 올린 nv-participate 를 받는다.
 *
 * 길이 둘이다. **어느 쪽인지는 detail.payload 로 갈린다.**
 *
 *   새 페이지  서버가 고르는 칸(.ev-game)과 runtime 을 심어 준다. runtime 이 입력을
 *              모아 { eventId, game, payload } 로 올린다 → 여기서 바로 참여 API 를 부른다.
 *   옛 페이지  이름표가 없어 runtime 이 모른다. frame.js 가 cta-link 클릭을
 *              { href, eventId } 로 올린다 → 옆 패널의 폼을 그대로 누른다.
 *
 * ★ **preventDefault 를 꼭 부른다.** runtime 은 "앱이 받았나" 를 그것으로 본다
 *   (event-runtime.js 의 notifyHost — cancelable 이벤트의 반환값).
 *   안 부르면 페이지가 「미리보기에서는 참여가 접수되지 않아요」를 띄운다.
 */
function participateFromPage(ev) {
  if (isUpcomingEvent(ui.serverEvent)) {
    ev?.preventDefault?.()
    toast('아직 시작 전인 이벤트입니다. 시작 시각 이후 참여해주세요.')
    return
  }
  const detail = ev?.detail || {}

  // 새 길 — runtime 이 모아 준 본문이 그대로 참여 API 본문이다 (ParticipationCreateRequest)
  if (detail.payload) {
    ev.preventDefault()                       // 받았다고 알린다 (이게 없으면 페이지가 안내를 띄운다)
    const frame = ev.target?.closest?.('.event-frame') || ev.target
    if (!ui.logged) return showLoginPrompt()
    submitFromPage(frame, detail)
    return
  }

  // 옛 길 — 입력이 패널에 있다. 검증 · 중복 방지 · 결과 표시가 거기 모여 있어 그대로 쓴다
  ev?.preventDefault?.()
  if (!ui.logged) return showLoginPrompt()

  const panel = $('.participation-access')
  const form = $('#participate-form')
  if (!form) {
    // 아직 확인 중이거나(로딩) 참여할 수 없는 상태 — 패널에 이유가 적혀 있다
    panel?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }

  const need = form.querySelector('[data-participate]')
  if (need && !need.value.trim()) {
    panel?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    need.focus()
    return
  }
  form.requestSubmit()
}

/** 참여 실패 안내 — 서버 코드마다 할 말이 다르다 */
function participationError(e) {
  // ★ 등급 부족은 403-0 이다. 409-3 은 「참여 설정이 잠김」으로 관리자 쪽 코드다
  if (e?.status === 401) return '로그인이 필요해요.'
  if (e?.code === 'PARTICIPATION403-0') return '참여할 수 있는 멤버십 등급이 아니에요.'
  if (e?.code === 'PARTICIPATION409-1') return '참여 설정이 없어요. 잠시 후 다시 확인해주세요.'
  if (e?.code === 'PARTICIPATION400-0') return '입력을 확인해주세요.'
  return e?.message || '참여하지 못했어요. 잠시 후 다시 시도해주세요.'
}

let sendingFromPage = false

/**
 * 페이지에서 올라온 참여를 접수한다.
 *
 * ★ 성공하면 iframe 안 body 에 data-participated 를 **바로** 붙인다 (markParticipated).
 *   다시 그리기를 기다리면 그 사이 한 번 더 누를 수 있고, 서버는 409 로 막는다.
 * ★ 결과는 옆 패널이 보여준다 — 패널과 페이지가 서로 다른 말을 하지 않게 한 곳에 모은다.
 */
async function submitFromPage(frame, { eventId, payload }) {
  if (sendingFromPage) return
  const id = String(eventId ?? frame?.dataset?.event ?? '')
  if (!id) return
  sendingFromPage = true
  try {
    const made = await participate(id, payload)
    ui.participated = { ...(ui.participated || {}), [id]: true }
    markParticipated(frame)
    const s = ui.serverParticipation
    if (s?.eventId === id) s.result = made.resultData || { status: 'PENDING' }
    // 내 혜택은 다음에 들어갈 때 서버에서 다시 읽는다
    ui.serverMy = null
    ui.serverMyState = null
    render()
    toast(made.resultData?.status === 'WON' ? '당첨되었어요!' : '참여가 접수되었어요.')
  } catch (e) {
    if (e?.status === 401) { showLoginPrompt(); return }
    if (e?.code === 'PARTICIPATION409-0') {
      // 다른 기기 · 탭에서 이미 참여했다 — 화면만 맞춘다
      ui.participated = { ...(ui.participated || {}), [id]: true }
      markParticipated(frame)
      ui.serverParticipation = null
      render()
      toast('이미 참여한 이벤트예요.')
      return
    }
    toast(participationError(e))
  } finally {
    sendingFromPage = false
  }
}

async function submitParticipation(form) {
  const s = ui.serverParticipation
  if (!s || s.busy || s.state !== 'done') return
  const err = (msg) => { const el = form.querySelector('.create-error'); if (el) el.textContent = msg }

  const gameCode = s.data?.gameCode
  const phone = form.querySelector('[data-participate="phoneNumber"]')?.value.trim() ?? ''
  if (gameCode === 'PRE_REGISTRATION' && !/^01[016789](\d{7,8}|-\d{3,4}-\d{4})$/.test(phone)) {
    return err('휴대폰 번호 형식을 확인해주세요.')
  }

  s.busy = true
  render()
  try {
    const made = await participate(s.eventId, participationBody(gameCode, { phoneNumber: phone }))
    s.busy = false
    s.result = made.resultData || { status: 'PENDING' }
    // 페이지 안의 「참여하기」도 잠근다. render 로 iframe 이 새로 떠도 되살아나야 해서
    // ui 에 적어 둔다 — frame.js 의 live 분기가 이 값을 보고 다시 잠근다
    ui.participated = { ...(ui.participated || {}), [s.eventId]: true }
    // 내 혜택은 다음에 들어갈 때 서버에서 다시 읽는다
    ui.serverMy = null
    ui.serverMyState = null
    render()
    toast(s.result.status === 'WON' ? '당첨되었어요!' : '참여가 접수되었어요.')
  } catch (e) {
    s.busy = false
    if (e?.code === 'PARTICIPATION409-0') {
      // 다른 탭에서 이미 참여했다 — 상태를 다시 물어 화면을 맞춘다
      ui.serverParticipation = null
      render()
      toast('이미 참여한 이벤트예요.')
      return
    }
    render()
    const box = document.querySelector('#participate-form .create-error')
    if (box) box.textContent = e?.message || '참여하지 못했어요.'
    else toast(e?.message || '참여하지 못했어요.')
  }
}


/**
 * 서버 회원가입 — 성공해도 **로그인되지 않는다.**
 * 응답이 토큰이 아니라 만들어진 회원이라서, 아이디를 채워 둔 로그인 화면으로 보낸다.
 *
 * 중복만 코드로 구분된다 (대소문자만 달라도 중복이다).
 *   USER409-0 아이디 · USER409-1 이메일
 */
async function serverSignup(form, values, fail) {
  const submit = form.querySelector('button[type="submit"]')
  if (submit?.disabled) return
  if (submit) { submit.disabled = true; submit.textContent = '가입하는 중…' }

  try {
    const me = await signUp({
      loginId: values.loginId,
      password: values.password,
      name: values.name,
      email: values.email,
      // 안 적었으면 아예 보내지 않는다 — 빈 문자열을 저장하지 않게.
      ...(values.phone ? { phone: values.phone } : {}),
    })
    ui.signup = null
    ui.loginHint = me.loginId
    navigate('login')
    toast(me.name + '님, 가입했어요. 이제 로그인해주세요.')
  } catch (e) {
    if (submit) { submit.disabled = false; submit.textContent = '가입하기' }
    if (e?.code === 'USER409-0') return fail('이미 사용 중인 아이디예요. 대소문자만 다른 아이디도 쓸 수 없어요.', 'loginId')
    if (e?.code === 'USER409-1') return fail('이미 사용 중인 이메일이에요. 대소문자만 다른 이메일도 쓸 수 없어요.', 'email')
    fail(e?.message || '가입하지 못했어요. 입력한 내용을 다시 확인해주세요.', 'loginId')
  }
}

/**
 * 로그아웃 — 계정에 딸린 캐시를 **전부 같이 비운다.**
 *
 * ★ 안 비우면 다음 사람이 앞사람 것을 본다.
 *   ensureMy 는 `serverMyState === 'done'` 이면 다시 묻지 않는다. 그래서
 *   A 가 로그아웃하고 B 가 로그인한 뒤 내 혜택에 들어가면, 참여 목록 API 를
 *   한 번도 부르지 않고 A 의 참여 기록이 그대로 떠 있었다.
 *
 * 공개 이벤트 목록(serverEvents)은 계정과 무관하므로 그대로 둔다.
 */
async function logout() {
  if (AUTH_ENABLED) await api.logout()
  ui.logged = false
  ui.userName = null
  ui.serverMe = null
  ui.serverMeError = null
  ui.serverMy = null
  ui.serverMyState = null
  ui.serverMyFilter = null
  ui.serverMyKey = null
  ui.myPage = 0
  ui.serverMyError = null
  ui.serverParticipation = null
  ui.serverGrades = null
  ui.participated = null
  navigate('home')
  toast('로그아웃했어요.')
}

// 페이지 안의 「참여하기」 — iframe(live 모드)이 올린다
document.addEventListener('nv-participate', participateFromPage)

document.addEventListener('submit', (ev) => {
  if (ev.target.id === 'participate-form') {
    ev.preventDefault()
    submitParticipation(ev.target)
    return
  }
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

document.addEventListener('keydown', (ev) => {
  if (ev.target.id !== 'event-search') return
  if (ev.key !== 'Enter' || ev.isComposing) return

  ev.preventDefault()
  ui.query = ev.target.value
  refreshResults()
})

/**
 * 회원가입 · 내 정보 저장.
 * 회원가입은 서버 모드에서 API를 호출하고, 성공 후 로그인 화면으로 이동한다.
 * 내 정보 저장은 서버 모드에서 PATCH /api/users/me를 호출한다.
 * 서버 연동을 끈 경우에는 목업으로 처리한다.
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

    if (!/^[A-Za-z0-9_]{4,50}$/.test(loginId)) {
      return fail(
        '아이디는 영문, 숫자, 밑줄(_)만 사용해 4~50자로 입력해주세요.',
        'loginId',
      )
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

    if (AUTH_ENABLED) {
      const submitButton = form.querySelector('button[type="submit"]')

      form.dataset.submitting = 'true'

      if (submitButton) {
        submitButton.disabled = true
        submitButton.textContent = '가입 중…'
      }

      try {
        const me = await signUp({
          loginId,
          password,
          name,
          email,
          phone: phone || null,
        })

        ui.signup = null
        // 가입해도 로그인되지 않는다 — 응답이 토큰이 아니라 만들어진 회원이다.
        // 방금 만든 아이디를 채워 둔 로그인 화면으로 보낸다 (views/login.js 가 읽고 버린다).
        ui.loginHint = me?.loginId ?? loginId
        navigate('login')
        toast((me?.name ?? name) + '님, 가입했어요. 이제 로그인해주세요.')
      } catch (error) {
        // 중복만 코드로 갈린다. 대소문자만 달라도 중복이라 그 점까지 알려 준다.
        if (error?.code === 'USER409-0') {
          fail('이미 사용 중인 아이디예요. 대소문자만 다른 아이디도 쓸 수 없어요.', 'loginId')
        } else if (error?.code === 'USER409-1') {
          fail('이미 사용 중인 이메일이에요. 대소문자만 다른 이메일도 쓸 수 없어요.', 'email')
        } else if (errorBox) {
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
    const plan = 'BASIC'
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

    if (form.dataset.submitting === 'true') return

    const get = (key) => form.querySelector(`[data-account="${key}"]`)
    const val = (key) => get(key)?.value.trim() ?? ''
    const errorBox = form.querySelector('#account-error')

    const fail = (message, key) => {
      if (errorBox) errorBox.textContent = message
      if (key) get(key)?.focus()
    }

    if (errorBox) errorBox.textContent = ''

    const name = val('name')
    const email = val('email')
    const phone = val('phone')

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

    if (AUTH_ENABLED) {
      const current = ui.serverMe

      if (!current) {
        return fail('내 정보를 다시 불러온 뒤 저장해주세요.')
      }

      if (current.phone && !phone) {
        return fail('등록된 휴대폰 번호는 비울 수 없어요.', 'phone')
      }

      const submitButton = form.querySelector('button[type="submit"]')
      form.dataset.submitting = 'true'

      if (submitButton) {
        submitButton.disabled = true
        submitButton.textContent = '저장 중…'
      }

      try {
        // 요금제는 보내지 않는다 — 사용자가 못 바꾼다 (PATCH /api/users/me/plan 은 삭제됐다)
        const me = await updateMyProfile({
          name,
          email,
          ...(phone ? { phone } : {}),
        })

        ui.serverMe = me
        ui.userName = me.name

        if (ui.route === 'account') render()
        else header()

        toast('내 정보를 저장했어요.')
      } catch (error) {
        // 이메일 중복만 코드로 갈린다. 대소문자만 달라도 중복이다
        if (error?.code === 'USER409-1') {
          fail('이미 사용 중인 이메일이에요. 대소문자만 다른 이메일도 쓸 수 없어요.', 'email')
        } else if (errorBox) {
          errorBox.textContent =
            error?.message || '내 정보 저장에 실패했어요.'
        }
      } finally {
        delete form.dataset.submitting

        if (submitButton) {
          submitButton.disabled = false
          submitButton.textContent = '변경 내용 저장'
        }
      }

      return
    }

    // 서버 연동을 끈 경우의 목업 처리
    Object.assign(state.db.me, {
      name,
      email,
      phone,
      marketingOptIn: Boolean(
        form.querySelector('[data-account="marketingOptIn"]')?.checked,
      ),
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
