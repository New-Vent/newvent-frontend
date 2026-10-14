// 브라우저 안에서 도는 대비 측정 스크립트 — tests/template-contrast.test.mjs 가 페이지에 넣는다.
//
// 템플릿 × 팔레트마다 글자 요소의 (글자색 · 뒤 배경) 대비를 재서
// "팔레트를 붙여서 새로 기준 미달이 됐거나 눈에 띄게 나빠진" 요소를 모은다.
// 기준선은 같은 템플릿의 팔레트 없는 상태다 — 템플릿이 원래부터 못 넘는 곳은 이 테스트의 대상이 아니다.
//
// baseFails: 팔레트 없는 기본 상태에서 기준 미달인 요소 (#220)
//
// 결과는 #result 에 base64(UTF-8 JSON) 로 적는다.
(function () {
  var CONFIG = window.__CONFIG__
  var TOLERANCE = 0.2          // 기준선보다 이만큼 이상 나빠져야 "나빠졌다"로 센다 (팔레트 바탕색 차이의 잡음)
  var EMOJI = /\p{Extended_Pictographic}/u
  var COLOR_FN = /(?:rgba?|oklch|oklab|color)\((?:[^()]|\([^()]*\))*\)/g

  // 계산값이 oklch() · color() 로 나오는 색은 캔버스로 실제 칠해지는 값을 읽어 푼다
  var cv = document.createElement('canvas'); cv.width = cv.height = 1
  var cx = cv.getContext('2d', { willReadFrequently: true })
  function parse(c) {
    if (!c) return null
    if (/^(oklch|oklab|color)\(/.test(c)) {
      var am = c.match(/\/\s*([\d.]+%?)\s*\)$/), a = 1
      if (am) a = am[1].slice(-1) === '%' ? parseFloat(am[1]) / 100 : parseFloat(am[1])
      cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'
      cx.fillStyle = c.replace(/\s*\/\s*[\d.]+%?\s*\)$/, ')'); cx.fillRect(0, 0, 1, 1)
      var d = cx.getImageData(0, 0, 1, 1).data
      return { r: d[0], g: d[1], b: d[2], a: a }
    }
    var m = c.match(/[\d.]+/g); if (!m) return null
    var n = m.map(Number)
    return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 }
  }
  function blend(t, b) { return { r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 } }
  function lum(c) { function k(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) } return 0.2126 * k(c.r) + 0.7152 * k(c.g) + 0.0722 * k(c.b) }
  function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }

  // 뒤 배경: 불투명 색을 만날 때까지 위로 올라간다. 그라데이션은 불투명 정지점마다 후보로 삼는다
  function backgrounds(el) {
    var layers = []
    for (var e = el; e; e = e.parentElement) {
      var cs = getComputedStyle(e), c = parse(cs.backgroundColor), bi = cs.backgroundImage
      if (bi !== 'none' && !(c && c.a >= 1)) {
        if (/gradient/.test(bi)) {
          var solid = (bi.match(COLOR_FN) || []).map(parse).filter(function (x) { return x && x.a >= 0.99 })
          if (solid.length) return solid
          if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break }
          continue                      // 불투명 정지점이 없는 그라데이션(광택 등)은 바탕으로 치지 않는다
        }
        return null                     // 이미지 바탕은 못 잰다
      }
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break }
    }
    var base = { r: 255, g: 255, b: 255, a: 1 }
    for (var i = layers.length - 1; i >= 0; i--) base = blend(layers[i], base)
    return [base]
  }

  function measure(root) {
    var out = {}
    var els = root.querySelectorAll('*')
    for (var idx = 0; idx < els.length; idx++) {
      var el = els[idx]
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue
      var own = [].filter.call(el.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim() })
        .map(function (n) { return n.textContent.trim() }).join(' ')
      if (!own || EMOJI.test(own)) continue
      var cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue
      var r = el.getBoundingClientRect(); if (!r.width || !r.height) continue
      var bgs = backgrounds(el); if (!bgs) continue
      var fg = parse(cs.color), fs = parseFloat(cs.fontSize), fw = parseInt(cs.fontWeight, 10) || 400
      out[idx] = {
        c: Math.min.apply(null, bgs.map(function (b) { return ratio(blend(fg, b), b) })),
        need: (fs >= 24 || (fs >= 18.66 && fw >= 700)) ? 3 : 4.5,     // WCAG: 큰 글자는 3
        name: el.tagName.toLowerCase() + (el.classList[0] ? '.' + el.classList[0] : ''),
        text: own.slice(0, 16),
      }
    }
    return out
  }

  var root = document.getElementById('root')
  var result = { contrast: {}, tokens: {} }

  Object.keys(CONFIG.templates).forEach(function (theme) {
    var doc = new DOMParser().parseFromString(CONFIG.templates[theme], 'text/html')
    var src = doc.querySelector('.ev-container')
    ;[].forEach.call(src.querySelectorAll('script'), function (s) { s.remove() })
    root.innerHTML = src.innerHTML

    // 대비
    root.className = 'ev-container event-page theme-' + theme
    var base = measure(root), regressions = []
    CONFIG.palettes.forEach(function (p) {
      root.className = 'ev-container event-page theme-' + theme + ' palette-' + p
      var now = measure(root)
      Object.keys(now).forEach(function (i) {
        var b = base[i]; if (!b) return
        var failsNow = now[i].c < now[i].need
        var wasFailing = b.c < b.need
        if (failsNow && (!wasFailing || now[i].c < b.c - TOLERANCE)) {
          regressions.push({ palette: p, name: now[i].name, text: now[i].text, c: +now[i].c.toFixed(2), need: now[i].need, base: +b.c.toFixed(2) })
        }
      })
    })
    var baseFails = Object.keys(base).filter(function (i) { return base[i].c < base[i].need })
      .map(function (i) { return { name: base[i].name, text: base[i].text, c: +base[i].c.toFixed(2), need: base[i].need } })
    result.contrast[theme] = { total: Object.keys(base).length, regressions: regressions, baseFails: baseFails }

    // 토큰: 20-themes 에 정의된 --tpl-* 가 팔레트에서 바뀌는가
    root.className = 'ev-container event-page theme-' + theme
    var names = []
    ;[].forEach.call(document.styleSheets, function (sheet) {
      ;[].forEach.call(sheet.cssRules, function (rule) {
        if (rule.selectorText === '.theme-' + theme) [].forEach.call(rule.style, function (n) { if (n.indexOf('--tpl-') === 0 && names.indexOf(n) < 0) names.push(n) })
      })
    })
    var plain = {}
    names.forEach(function (n) { plain[n] = getComputedStyle(root).getPropertyValue(n).trim() })
    result.tokens[theme] = {}
    names.forEach(function (n) { result.tokens[theme][n] = 0 })
    CONFIG.palettes.forEach(function (p) {
      root.className = 'ev-container event-page theme-' + theme + ' palette-' + p
      names.forEach(function (n) { if (getComputedStyle(root).getPropertyValue(n).trim() !== plain[n]) result.tokens[theme][n]++ })
    })
  })

  var bytes = new TextEncoder().encode(JSON.stringify(result)), bin = ''
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  document.getElementById('result').textContent = btoa(bin)
})()
