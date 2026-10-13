/**
 * NewVent 이벤트 페이지 런타임 — 요소의 data-behavior 를 실행한다.
 *
 * ★ 이벤트 페이지의 실행 코드는 이 파일 하나뿐이다
 *   서버가 미리보기 · 공개 HTML 을 완전한 문서로 감싸면서 이 파일을 붙인다(PageShell.standalone).
 *   이름표가 있는 페이지는 서버가 HTML 안의 <script> 를 지운다.
 *
 * ★ 이름표 이전에 만든 페이지는 옛 <script> 가 그대로 남아 동작한다
 *   이 파일도 같이 실리지만 [data-behavior] 가 없어서 아무것도 하지 않는다.
 *   window.newVentReinit 은 옛 스크립트의 것을 덮지 않고 이어서 부른다.
 *
 * ★ behavior 이름 목록은 서버가 정본이다 — newvent-backend registry/Behavior.java
 *   여기 핸들러를 추가하면 거기에도 이름을 추가한다. 한쪽만 있으면 정화에서 지워지거나 눌러도 아무 일이 없다.
 *
 * ★ HTML 은 "무엇을" 만 적는다. data-endpoint 같은 속성은 서버 정화가 지운다
 *
 * ★ 서버에 요청을 보내지 않는다 — 화면 동작(안내 · 스크롤 · 흔들기 · 열기 · 고르기 · 타이머)만 한다.
 *   참여 버튼(participate)은 입력을 모아 **페이지를 띄운 사용자 앱에 알리기만** 한다(nv-participate).
 *   로그인 토큰은 사용자 앱에만 있다. 요청 · 결과 표시는 거기서 한다 (src/user/participation.js)
 *
 * ★ 참여 방식은 서버가 body 에 적는다 — data-event-id · data-game (PageShell.standalone)
 *   고르는 버튼 · 전화번호 칸(.ev-game)도 서버가 참여 설정대로 그려서 준다. 여기서는 읽기만 한다
 *
 * ★ 모르는 behavior · 핸들러 오류는 무시한다 — 버튼 하나 때문에 페이지가 멈추면 안 된다
 *
 *   <button data-behavior="vote toast" data-vote="kor" data-demo-msg="…">
 */
(function () {
  'use strict'

  if (window.__newventRuntime) return
  window.__newventRuntime = true

  var body = document.body

  function names(el) {
    return (el.getAttribute('data-behavior') || '').trim().split(/\s+/).filter(Boolean)
  }

  function byIds(value) {
    return (value || '').trim().split(/\s+/).filter(Boolean)
      .map(function (id) { return document.getElementById(id) })
      .filter(Boolean)
  }

  // ── 공용 ─────────────────────────────────────────────────────────

  var toastTimer = null
  function toast(msg) {
    var el = document.getElementById('evToast')
    if (!el) {
      el = document.createElement('div')
      el.id = 'evToast'
      el.className = 'ev-toast'
      body.appendChild(el)
    }
    el.textContent = msg
    placeInFrame(el)
    el.classList.add('show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(function () { el.classList.remove('show') }, 3000)
  }

  /**
   * iframe 안이면 토스트를 "지금 보이는 영역" 아래쪽에 둔다.
   *
   * ★ 공개 상세 · 미리보기 iframe 은 내용 높이만큼 늘어나 있다(스크롤은 바깥 페이지가 한다).
   *   그대로 두면 position: fixed 의 bottom 이 iframe 맨 아래라 화면 밖에 뜬다.
   *   바깥 문서를 못 읽으면(다른 출처) 손대지 않는다 — 단독 페이지에서는 원래 규칙이 맞다.
   */
  function placeInFrame(el) {
    var frame = null
    try { frame = window.frameElement } catch (e) { return }
    if (!frame) return
    try {
      var r = frame.getBoundingClientRect()
      var visibleBottom = Math.min(r.bottom, window.parent.innerHeight) - r.top
      if (visibleBottom >= window.innerHeight) { el.style.top = ''; el.style.bottom = ''; return }
      el.style.bottom = 'auto'
      el.style.top = Math.max(16, visibleBottom - 30 - el.offsetHeight) + 'px'
    } catch (e) { /* 바깥 문서를 못 읽는다 — 원래 위치 */ }
  }

  function shake(el) {
    el.classList.remove('shake')
    void el.offsetWidth          // 연달아 눌러도 다시 흔들리게 애니메이션을 처음부터
    el.classList.add('shake')
    setTimeout(function () { el.classList.remove('shake') }, 500)
  }

  /** 누른 요소에서 가장 가까운 [data-shake] — 자신 · 조상 · 조상 안쪽 순으로 */
  function nearestShake(el) {
    for (var n = el; n && n !== body; n = n.parentElement) {
      if (n.hasAttribute('data-shake')) return n
      var inside = n.querySelector('[data-shake]')
      if (inside) return inside
    }
    return null
  }

  /** 완료 상태로 — open 이 data-target 으로 가리킨 요소들 */
  function complete(el) {
    el.setAttribute('data-state', 'completed')
    if (el.classList.contains('cta-btn')) el.classList.add('cta-completed')
    var text = el.getAttribute('data-done-text')
    if (text) el.textContent = text
    var msg = el.getAttribute('data-done-msg')
    if (msg) el.setAttribute('data-demo-msg', msg)
  }

  // ── 누를 때 ───────────────────────────────────────────────────────

  var CLICK = {
    toast: function (el) {
      toast(el.getAttribute('data-demo-msg') || '(데모)')
    },

    'scroll-to': function (el) {
      if (el.getAttribute('data-state') === 'completed') return
      var target = document.getElementById(el.getAttribute('data-target'))
      if (!target) return
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      var s = target.querySelector('[data-shake]')
      if (s) shake(s)
    },

    shake: function (el) {
      var s = nearestShake(el)
      if (s) shake(s)
    },

    open: function (el) {
      el.classList.add('opened')
      var text = el.getAttribute('data-done-text')
      if (text) el.textContent = text
      byIds(el.getAttribute('data-target')).forEach(complete)
    },

    // 같은 묶음(부모가 같은 투표 버튼)에서 하나만 고른다
    vote: function (el) {
      var group = el.parentElement ? el.parentElement.querySelectorAll('[data-behavior~="vote"]') : []
      Array.prototype.forEach.call(group, function (b) {
        b.classList.toggle('active', b === el)
        b.setAttribute('aria-pressed', String(b === el))
      })
    },

    // 참여 버튼 — 입력을 모아 사용자 앱에 알린다. 참여 설정이 없는 이벤트는 안내만 한다
    participate: function (el) {
      var game = body.getAttribute('data-game')
      if (!game) { toast(el.getAttribute('data-demo-msg') || '참여 기능은 준비 중이에요.'); return }
      if (body.hasAttribute('data-participated')) { toast('이미 참여한 이벤트예요.'); return }
      var payload = collect(game)
      if (!payload) return
      if (!notifyHost({ eventId: Number(body.getAttribute('data-event-id')), game: game, payload: payload })) {
        toast(inFrame() ? '미리보기에서는 참여가 접수되지 않아요.' : 'NewVent 에서 로그인한 뒤 참여할 수 있어요.')
      }
    },
  }

  // ── 참여 ─────────────────────────────────────────────────────────

  function inFrame() {
    try { return !!window.frameElement } catch (e) { return false }
  }

  /** 고른 버튼 — vote 가 같은 묶음에서 하나에만 active 를 준다 */
  function chosen(attr) {
    var el = document.querySelector('.ev-game [' + attr + '].active')
    return el ? el.getAttribute(attr) : null
  }

  /**
   * 참여 방식에 맞는 요청 본문. 모자라면 안내하고 null.
   *
   * ★ 서버 ParticipationCreateRequest 와 짝이다 — 방식에 맞는 필드 하나만 보낸다. 다른 필드가 섞이면 서버가 거절한다
   */
  function collect(game) {
    if (game === 'SPORTS_PREDICTION') {
      var prediction = chosen('data-vote')
      if (prediction === null) { toast('먼저 하나를 골라 주세요.'); return null }
      return { prediction: prediction }
    }
    if (game === 'LUCKY_POUCH') {
      var pouch = chosen('data-pouch')
      if (pouch === null) { toast('먼저 복주머니를 하나 골라 주세요.'); return null }
      return { pouchIndex: Number(pouch) }
    }
    if (game === 'PRE_REGISTRATION') {
      var input = document.querySelector('.ev-game input[type="tel"]')
      var digits = input ? input.value.replace(/\D/g, '') : ''
      if (!/^01[016789]\d{7,8}$/.test(digits)) {
        if (input) input.focus()
        toast('휴대폰 번호를 확인해 주세요.')
        return null
      }
      return { phoneNumber: digits }
    }
    return {}
  }

  /**
   * 페이지를 띄운 앱에 알린다 — iframe 요소에서 nv-participate 가 올라간다.
   *
   * @returns 앱이 받았으면 true. 받은 쪽이 preventDefault 로 표시한다.
   *          단독 페이지(/e/{id}) · 받는 쪽이 없는 화면(관리자 미리보기)이면 false
   */
  function notifyHost(detail) {
    try {
      var frame = window.frameElement
      if (!frame) return false
      var Event = frame.ownerDocument.defaultView.CustomEvent
      return !frame.dispatchEvent(new Event('nv-participate', { bubbles: true, cancelable: true, detail: detail }))
    } catch (e) {
      return false
    }
  }

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest && ev.target.closest('[data-behavior]')
    if (!el || el.disabled) return
    var list = names(el)
    if (el.tagName === 'A' && list.some(function (n) { return CLICK[n] })) ev.preventDefault()
    list.forEach(function (name) {
      var fn = CLICK[name]
      if (!fn) return
      try { fn(el) } catch (e) { console.warn('[newvent] behavior 실패:', name, e) }
    })
  })

  // ── 불러올 때 ─────────────────────────────────────────────────────

  function pad(n) { return String(n).padStart(2, '0') }

  var INIT = {
    // data-until(서버가 넣는 종료 시각)이 있으면 그때까지, 없으면 data-seconds 초 데모, 둘 다 없으면 비워 둔다
    countdown: function (el) {
      var until = Date.parse(el.getAttribute('data-until') || '')
      if (isNaN(until)) {
        var secs = parseInt(el.getAttribute('data-seconds'), 10)
        if (isNaN(secs)) return
        until = Date.now() + secs * 1000
      }
      var digits = el.querySelectorAll('.fs-timer-digit')
      function render() {
        var left = Math.max(0, Math.floor((until - Date.now()) / 1000))
        var h = Math.floor(left / 3600)
        var hms = [pad(h), pad(Math.floor(left % 3600 / 60)), pad(left % 60)]
        if (digits.length >= 3) {
          hms.forEach(function (p, i) { digits[i].textContent = p })
        } else {
          var days = Math.floor(h / 24)
          el.textContent = left <= 0 ? '마감되었습니다'
            : (days > 0 ? days + '일 ' + pad(h % 24) : hms[0]) + ':' + hms[1] + ':' + hms[2]
        }
        return left
      }
      render()
      var t = setInterval(function () {
        if (!el.isConnected || render() <= 0) clearInterval(t)
      }, 1000)
    },
  }

  function init(root) {
    var scope = root || document
    var els = scope.querySelectorAll('[data-behavior]')
    if (scope !== document && scope.hasAttribute && scope.hasAttribute('data-behavior')) {
      els = [scope].concat(Array.prototype.slice.call(els))
    }
    Array.prototype.forEach.call(els, function (el) {
      if (el.__newventInit) return
      names(el).forEach(function (name) {
        var fn = INIT[name]
        if (!fn) return
        el.__newventInit = true
        try { fn(el) } catch (e) { console.warn('[newvent] behavior 초기화 실패:', name, e) }
      })
    })
  }

  init()

  // 편집 화면이 블록을 갈아 끼운 뒤 부른다(frame.js) — 새 블록의 타이머를 다시 건다
  // ★ 옛 페이지의 스크립트가 먼저 정의했으면 그것도 부른다 — 덮어쓰면 옛 페이지 재연결이 멈춘다
  var legacyReinit = typeof window.newVentReinit === 'function' ? window.newVentReinit : null
  window.newVentReinit = function (block) {
    if (legacyReinit) {
      try { legacyReinit(block) } catch (e) { console.warn('[newvent] 옛 스크립트 재연결 실패:', e) }
    }
    init(block ? document.querySelector('[data-block="' + block + '"]') : document)
  }
})()
