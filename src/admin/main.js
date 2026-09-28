import './styles.css'

import { $, mount, delegate } from '@shared/dom.js'
import { createRouter } from '@shared/router.js'
import { createStore } from '@shared/store.js'
import { createApi } from '@shared/api.js'

import { listView } from './views/list.js'
import { editorView } from './views/editor.js'
import { versionsView } from './views/versions.js'
import { createView } from './views/create.js'
import { loginView } from './views/login.js'
import { notFoundView } from './views/notFound.js'

// 사용자 앱과 인증 경로가 다르다 — Refresh 쿠키가 nv_admin_rt (Path=/api/admin/auth) 다.
export const api = createApi({ authBase: '/api/admin/auth' })

export const store = createStore({
  admin: null,
  events: [],
  // 편집 화면 전용 — 서버 상태가 아니라 화면 상태다.
  selectedBlock: null,
  generating: null,
  draftDirty: false,
})

const views = {
  list: listView,
  editor: editorView,
  versions: versionsView,
  create: createView,
  login: loginView,
  notFound: notFoundView,
}

// BASE 가 '/admin/' 이므로 여기 경로는 그 아래 기준이다.
// '/events/:id/edit' → 실제 주소 '/admin/events/:id/edit'
const routes = [
  { path: '/', name: 'list' },
  { path: '/login', name: 'login' },
  { path: '/events/new', name: 'create' },
  { path: '/events/:id/edit', name: 'editor' },
  { path: '/events/:id/versions', name: 'versions' },
]

const PUBLIC_ROUTES = new Set(['login'])

let current = { name: 'list', params: {} }

function render() {
  const state = store.get()

  if (!state.admin && !PUBLIC_ROUTES.has(current.name)) {
    // 화면 가드일 뿐이다. 실제 인가는 서버가 한다.
    router.navigate('/login', { replace: true })
    return
  }

  const view = views[current.name] ?? notFoundView
  mount($('#app'), view({ params: current.params, state }))
  document.body.classList.toggle('editing-workspace', current.name === 'editor')
}

export const router = createRouter(routes, (match) => {
  current = match
  render()
})

store.subscribe(render)

delegate(document.body, 'click', 'a[data-link]', (el, ev) => {
  ev.preventDefault()
  router.navigate(el.getAttribute('href'))
})

// 편집 중 이탈 경고. 기획의 "작업 내용 자동 보존" 과 짝이다.
window.addEventListener('beforeunload', (ev) => {
  if (!store.get().draftDirty) return
  ev.preventDefault()
  ev.returnValue = ''
})

router.start()