import { esc } from '@shared/dom.js'
import { icon } from '@shared/icons.js'
import { toast } from '@shared/ui/toast.js'

const TYPES = {
  STARTED: { label: '이벤트 시작', icon: 'rocket' },
  CLOSING_SOON: { label: '종료 임박', icon: 'clock' },
  ENDED: { label: '이벤트 종료', icon: 'check' },
}

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function createAdminNotifications(api, enabled) {
  let active = false
  let open = false
  let items = []
  let loading = false
  let loaded = false
  let error = ''
  let generation = 0
  let timer = null
  const pending = new Set()

  function view() {
    const unread = items.filter((item) => !item.read).length

    const content = error
      ? `
        <div class="admin-notifications-empty" role="alert">
          <p>${esc(error)}</p>
          <button type="button"
            class="admin-notifications-retry"
            data-notification-action="reload">
            다시 불러오기
          </button>
        </div>
      `
      : !loaded && loading
        ? '<div class="admin-notifications-empty">알림을 불러오는 중이에요.</div>'
        : !items.length
          ? '<div class="admin-notifications-empty">아직 도착한 알림이 없어요.</div>'
          : items.map((item) => {
            const type = TYPES[item.type] || {
              label: '알림',
              icon: 'bell',
            }
            const busy = pending.has(String(item.id))

            return `
              <button type="button"
                class="admin-notification-item ${item.read ? '' : 'is-unread'}"
                data-notification-action="read"
                data-notification-id="${esc(String(item.id))}"
                ${busy ? 'disabled aria-busy="true"' : ''}>
                <span class="admin-notification-icon">
                  ${icon(type.icon)}
                </span>
                <span class="admin-notification-content">
                  <span class="admin-notification-top">
                    <span>${esc(type.label)}</span>
                    <span class="admin-notification-read">
                      ${busy ? '처리 중' : item.read ? '읽음' : '안 읽음'}
                    </span>
                  </span>
                  <span class="admin-notification-message">
                    ${esc(item.message || '')}
                  </span>
                  <time class="admin-notification-time"
                    datetime="${esc(item.createdAt || '')}">
                    ${esc(formatDate(item.createdAt))}
                  </time>
                </span>
              </button>
            `
          }).join('')

    return `
      <button type="button"
        class="admin-notifications-bell"
        data-notification-action="toggle"
        aria-label="${unread ? `알림, 안 읽은 알림 ${unread}개` : '알림'}"
        aria-expanded="${open}"
        aria-controls="admin-notifications-panel">
        ${icon('bell')}
        ${unread ? '<span class="admin-notifications-dot" aria-hidden="true"></span>' : ''}
      </button>

      <section id="admin-notifications-panel"
        class="admin-notifications-panel"
        aria-label="알림 목록"
        ${open ? '' : 'hidden'}>
        <div class="admin-notifications-heading">
          <div class="admin-notifications-title">알림</div>

          ${loaded && !error && unread > 0
            ? `<span class="admin-notifications-description">
                안 읽은 알림 ${unread}개
              </span>`
            : ''}

          <button type="button"
            class="admin-notifications-close"
            data-notification-action="close"
            aria-label="알림 닫기">
            ${icon('close')}
          </button>
        </div>

        <div class="admin-notifications-list">
          ${content}
        </div>

        <div class="admin-notifications-footer">
          알림을 누르면 읽음으로 표시돼요.
        </div>
      </section>
    `
  }

  function paint() {
    const target = document.getElementById('admin-notifications')
    if (!target || !active) return

    // 읽음 처리 후에도 누른 알림의 포커스를 유지한다.
    const focused = target.contains(document.activeElement)
      ? document.activeElement
      : null
    const action = focused?.dataset.notificationAction
    const id = focused?.dataset.notificationId
    const scrollTop = target.querySelector('.admin-notifications-list')?.scrollTop || 0

    target.innerHTML = view()

    const list = target.querySelector('.admin-notifications-list')
    if (list) list.scrollTop = scrollTop

    if (action) {
      const next = Array.from(target.querySelectorAll('button')).find((button) =>
        button.dataset.notificationAction === action &&
        button.dataset.notificationId === id
      )
      next?.focus({ preventScroll: true })
    }
  }

  async function reload() {
    if (!active || loading || pending.size) return

    const currentGeneration = generation
    loading = true
    error = ''
    paint()

    try {
      // 전체 목록을 조회해 오래된 안 읽은 알림도 빨간 점에 반영한다.
      const result = []
      let page = 0
      let totalPages = 1

      while (page < totalPages) {
        const data = await api.get(
          `/api/admin/notifications?page=${page}&size=50`
        )

        if (!active || generation !== currentGeneration) return

        result.push(...data.content)
        totalPages = data.totalPages
        page += 1
      }

      // 조회 도중 새 알림이 추가되어 페이지가 밀리는 경우 중복을 제거한다.
      items = Array.from(
        new Map(result.map((item) => [String(item.id), item])).values()
      )
      loaded = true
    } catch (err) {
      if (generation !== currentGeneration) return
      error = err?.message || '알림을 불러오지 못했어요.'
    } finally {
      if (generation === currentGeneration) {
        loading = false
        paint()
      }
    }
  }

  async function markRead(id) {
    const item = items.find((value) => String(value.id) === id)
    if (!item || item.read || pending.has(id) || loading) return

    const currentGeneration = generation
    pending.add(id)
    paint()

    try {
      await api.patch(
        `/api/admin/notifications/${encodeURIComponent(id)}/read`
      )

      if (!active || generation !== currentGeneration) return

      // 서버가 성공한 뒤에만 화면을 읽음으로 바꾼다.
      item.read = true
    } catch (err) {
      if (generation !== currentGeneration) return
      toast(err?.message || '읽음 처리하지 못했어요.')
    } finally {
      if (generation === currentGeneration) {
        pending.delete(id)
        paint()
      }
    }
  }

  function close(restoreFocus = false) {
    if (!open) return

    open = false
    paint()

    if (restoreFocus) {
      document.querySelector(
        '#admin-notifications .admin-notifications-bell'
      )?.focus()
    }
  }

  function mount(logged) {
    if (!logged || !enabled) {
      reset()
      return
    }

    const first = !active
    active = true
    paint()

    if (first) {
      void reload()
      timer = window.setInterval(() => {
        if (!document.hidden) void reload()
      }, 60_000)
    }
  }

  function reset() {
    generation += 1
    active = false
    open = false
    items = []
    loaded = false
    loading = false
    error = ''
    pending.clear()
    window.clearInterval(timer)
    timer = null

    const target = document.getElementById('admin-notifications')
    if (target) target.innerHTML = ''
  }

  document.addEventListener('click', (event) => {
    if (!active) return

    const target = document.getElementById('admin-notifications')
    const button = event.target.closest('[data-notification-action]')

    if (!target?.contains(event.target)) {
      close()
      return
    }

    if (!button || button.disabled) return

    switch (button.dataset.notificationAction) {
      case 'toggle':
        open = !open
        paint()
        if (open) void reload()
        break
      case 'close':
        close(true)
        break
      case 'reload':
        void reload()
        break
      case 'read':
        void markRead(button.dataset.notificationId)
        break
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close(true)
  })

  window.addEventListener('focus', () => {
    if (active) void reload()
  })

  return { mount, reset }
}