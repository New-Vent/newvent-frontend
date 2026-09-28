import './styles.css'

import { $ } from '@shared/dom.js'
import { state, ui } from '@shared/state.js'
import { persist } from '@shared/persist.js'
import { icon } from '@shared/icons.js'
import { button } from '@shared/ui/controls.js'
import { toast } from '@shared/ui/toast.js'
import { closeModal } from '@shared/ui/modal.js'
import { hydrate } from '@shared/preview/frame.js'
import { createRouter } from '@shared/router.js'
import { initialDatabase } from '@shared/mock/fixtures.js'

import { homeView, refreshResults } from './views/home.js'
import { eventView } from './views/event.js'
import { myView } from './views/my.js'
import { loginView } from './views/login.js'
import { showLoginPrompt, showResult } from './actions.js'

/**
 * 사용자 앱 셸.
 *
 * 원본(newvent-design.html)은 ui.route 문자열 하나로 화면을 갈랐다.
 * 여기서는 URL 을 진짜로 바꾸되, ui.route 는 그대로 둬서 이식한 뷰
 * 함수들을 손대지 않는다. 라우터가 주소를 읽어 ui.route 를 맞춘다.
 */
const VIEWS = { home: homeView, event: eventView, my: myView, login: loginView }

const ROUTES = [
  { path: '/', name: 'home' },
  { path: '/events/:id', name: 'event' },
  { path: '/my', name: 'my' },
  { path: '/login', name: 'login' },
]

/** ui.route → URL. navigate() 가 쓴다. */
const PATH = {
  home: () => '/',
  event: (id) => `/events/${id}`,
  my: () => '/my',
  login: () => '/login',
}

function header() {
  $('#header').innerHTML =
    '<div class="container">' +
    '<a class="brand" href="/" data-link aria-label="NewVent 홈">' +
    '<span class="brand-mark"></span><span>New<b>Vent</b></span></a>' +
    '<nav class="nav" aria-label="주 메뉴">' +
    button('route', '이벤트', 'data-route="home"', ui.route === 'home' || ui.route === 'event' ? 'active' : '') +
    button('route', '내 혜택', 'data-route="my"', ui.route === 'my' ? 'active' : '') +
    '</nav><div class="account">' +
    (ui.logged
      ? '<span class="avatar">' + icon('user') + '</span><span class="name">헌진님</span>' +
        button('logout', '로그아웃', '', 'btn ghost sm')
      : button('route', '로그인', 'data-route="login"', 'btn soft sm')) +
    '</div></div>'

  $('#footer').innerHTML =
    '<div class="container spread"><span class="brand">New<b>Vent</b></span>' +
    '<p>데모 데이터로 동작하는 화면입니다. 실제 경품은 지급되지 않습니다.</p></div>'
}

function render(scroll = false) {
  state.observers.forEach((x) => x.disconnect())
  state.observers = []
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

  if (a === 'close') return closeModal()
  if (a === 'route') return navigate(b.dataset.route)
  if (a === 'event') return navigate('event', b.dataset.id)
  if (a === 'login-prompt') return showLoginPrompt()
  if (a === 'result') return ui.logged ? showResult(b.dataset.id) : showLoginPrompt()
  if (a === 'logout') {
    ui.logged = false
    navigate('home')
    toast('로그아웃했어요.')
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

document.addEventListener('input', (ev) => {
  if (ev.target.id === 'event-search') {
    ui.query = ev.target.value
    refreshResults()
  }
})

$('#overlay').addEventListener('click', (ev) => {
  if (ev.target.classList.contains('modal-backdrop')) closeModal()
})

ui.logged = true
ui.role = 'user'
router.start()
