/**
 * AI 사용량 대시보드 — 신규 뷰 1개 (라우트 /usage).
 *
 *   LLM 호출 로그 GET /api/admin/llm-calls?page&size&from   — 최근 8주 전체를 페이지로 걷는다
 *   재색인 이력   GET /api/admin/rag/reindex-logs           — 임베딩 추정의 재료 (청크 수)
 *
 * 구성:
 *   종합 카드 — 도넛은 "비용 구성"(생성 측정 / 임베딩 추정)을 담는다. 성공·실패 비율은 한쪽이
 *   대부분이라 도넛으로 볼 가치가 없어 빼고, 상한 대비는 숫자 게이지("오늘 12/200")로 보여준다.
 *   주차별 카드 — 막대 높이는 그 주 토큰 볼륨(입력+출력 합계). RAG 참고 비중은 /rag 품질 페이지가
 *   전담하므로 여기 두지 않는다 (같은 차트를 두 메뉴에 그리는 중복을 피함).
 *
 * 데이터 근거 표기 원칙:
 *   - 생성 비용은 로그의 inputTokens/outputTokens × 모델 단가 — 측정값이다.
 *   - 임베딩 호출은 로그에 안 남는다(재색인·검색은 llm_call_logs 밖) — 재색인 이력의 청크 수에
 *     청크 1개당 토큰 가정을 곱해 근사하므로 "(추정)" 라벨을 붙인다. 라벨은 절대 섞지 않는다.
 *
 * 차트 라이브러리 없이 conic-gradient + div 높이로 그린다 (프로덕션 의존성 제로 원칙).
 * 도넛·범례 색 견본도 인라인 스타일로 닫는다 — admin.css 의 막대 차트 패턴만 재사용한다.
 */

import { esc } from '@shared/dom.js'
import { loadLlmCallLogs, loadReindexLogs } from '@shared/repo.js'
import { ui } from '@shared/state.js'

/* ───── 기준 상수 ───── */

/** 하루 상한 — backend application.yaml 의 llm.daily-limit (현재 200) 와 짝을 맞춘 상수. 서로 바뀌면 같이 고친다 */
const DAILY_LIMIT = 200
/** 주 문턱은 하루 상한 × 7 — 표기용 (상한 고정 축이 아니라 "몇 대비 몇" 숫자다) */
const WEEK_QUOTA = DAILY_LIMIT * 7
/** 그릴 범위 — /rag 품질 추이(8주)와 같은 창으로 맞춘다 */
const WEEKS = 8
/** 페이지 크기·걷기 한계 — 최악(200회/일 × 56일)에도 루프가 끝나게 방어선을 둔다.
 *  50은 백엔드 컨트롤러의 제약(@Max(50))과 맞춘 값 — 이보다 크면 400으로 거절되고
 *  그 실패를 빈 걷기로 흡수해 화면이 "기록 없음"으로 나온다(2026-10-19 실제로 그랬다) */
const PAGE_SIZE = 50
const MAX_PAGES = 30

/**
 * 모델 단가 표 — USD / 1M 토큰(2026-10 기준 Bedrock 가격). 모델 이름에 접두가 들어 있으면 맞춘다.
 * 이름을 모르면 sonnet급으로 둔다 — 과소평가가 아니라 과대평가가 안전하다.
 * 자체 호스트(qwen, mock)는 0원이다 — 인프라 비용은 이 카드의 계산 범위가 아니다.
 */
const MODEL_PRICES = [
  // 운영 모델 — Bedrock gemma-3-27b-it, 표준 On-Demand(2026-10 AWS 공시 $0.23/$0.38 per 1M).
  // 접두 매칭이라 'us.gemma-3-27b-it' 같은 리전 접두 형태도 이 행으로 계산된다
  ['gemma', { in: 0.23, out: 0.38 }],
  ['claude-3-7', { in: 3.0, out: 15.0 }],
  ['claude-3-5', { in: 3.0, out: 15.0 }],
  ['claude', { in: 3.0, out: 15.0 }],
  ['haiku', { in: 0.8, out: 4.0 }],
  ['qwen', { in: 0.0, out: 0.0 }],
  ['mock', { in: 0.0, out: 0.0 }],
]
const FALLBACK_PRICE = { in: 3.0, out: 15.0 }

/** 임베딩 — cohere.embed-multilingual-v3 (Bedrock). 입력 US$0.10/1M 토큰, 청크 1개(800자) ≈ 400 토큰 가정 */
const EMBED_USD_PER_TOKEN = 0.10 / 1_000_000
const TOKENS_PER_CHUNK = 400
/** 환율 — 원화 표기용 예시 상수. 실제 담당이 값 확정하면 이 한 줄만 고치면 된다 */
const USD_KRW = 1400

/* ───── 작은 도구 ───── */

const priceOf = (modelName) => {
  const m = String(modelName ?? '').toLowerCase()
  for (const [prefix, price] of MODEL_PRICES) {
    if (m.includes(prefix)) return price
  }
  return FALLBACK_PRICE
}

/** 주어 1행의 비용(USD). 단가는 USD/1M 토큰이므로 토큰 수를 100만으로 나눠 계산한다 —
 *  이 나눗셈을 빼먹으면 토큰 1,200개가 276 USD(한국돈 약 38만 원)로 나와 가격이 폭등한다(2026-10-19 실사고) */
const rowCost = (l) => {
  const p = priceOf(l.modelName)
  return (p.in * (l.inputTokens || 0) + p.out * (l.outputTokens || 0)) / 1e6
}

/** 3자리 콤마 — ICU 로캘 다차이를 피하려 직접 넣는다 */
const num = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** 로그 시각 → KST 날짜 'YYYY-MM-DD'. dashboard-rag 의 logDateKst 와 같은 계산 */
const kstDate = (iso) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600000)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/** 날짜 'YYYY-MM-DD' → 그 주 월요일 (UTC 절단). 백엔드 주간 집계도 KST 기준이라 같은 절기로 담는다 */
const mondayOf = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7)
  return d.toISOString().slice(0, 10)
}

/** 주 시작 'YYYY-MM-DD' → 'MM/DD-MM/DD' 표기 */
const weekRange = (start) => {
  const s = new Date(start + 'T00:00:00Z')
  s.setUTCDate(s.getUTCDate() + 6)
  const end = s.toISOString().slice(0, 10)
  const tail = (d) => d.slice(5).replace('-', '/')
  return tail(start) + '-' + tail(end)
}

/* ───── 데이터 모으기 ───── */

/**
 * 최근 WEEKS 주 전체 로그를 걷는다 — 합계·주별 집계는 화면쪽 계산으로 MVP를 맞춘다.
 * 행 수가 커지는 시점이 오면 같은 식을 백엔드 SUM 집계 엔드포인트로 옮긴다 (quality-trend 옆).
 */
async function pullCallPages() {
  const from = new Date(Date.now() - WEEKS * 7 * 86400000).toISOString()
  const rows = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await loadLlmCallLogs({ from, page, size: PAGE_SIZE }).catch(() => null)
    if (!res) break
    const list = Array.isArray(res) ? res : (res.content ?? [])
    rows.push(...list)
    const totalPages = Array.isArray(res)
      ? list.length
      : (res.totalPages ?? (res.size ? Math.ceil((res.totalElements || 0) / res.size) : 1))
    if (page + 1 >= totalPages) break
  }
  return rows
}

/**
 * 기간 집계. weeks 는 월요일 시작(오름차순), 데이터 없는 주는 비워둔다 —
 * /rag 품질 추이와 같은 자리에서 같은 절기로 읽히도록.
 */
function aggregate(rows, reindexLogs) {
  const weeks = new Map()
  const today = kstDate(new Date().toISOString())
  const thisWeek = mondayOf(today)
  let ok = 0
  let todayCalls = 0
  let weekCalls = 0
  let inTokens = 0
  let outTokens = 0
  let ms = 0
  let msCount = 0
  let generationUsd = 0

  for (const l of rows) {
    const dateStr = kstDate(l.createdAt)
    const key = mondayOf(dateStr)
    const w = weeks.get(key) || { weekStart: key, calls: 0, tokens: 0, costUsd: 0 }
    w.calls += 1
    w.tokens += (l.inputTokens || 0) + (l.outputTokens || 0)
    inTokens += l.inputTokens || 0
    outTokens += l.outputTokens || 0
    w.costUsd += rowCost(l)
    weeks.set(key, w)
    if (l.validOk) ok += 1
    if (dateStr === today) todayCalls += 1
    if (key === thisWeek) weekCalls += 1
    if (l.responseTimeMs != null) { ms += l.responseTimeMs; msCount += 1 }
    generationUsd += rowCost(l)
  }

  // 임베딩 추정 — 재색인 이력의 청크 수 합계 × (청크당 토큰 가정 × 단가). 검색 임베딩은 기록이 없어
  // 여기까지만 근사할 수 있고, 그래서 라벨을 "(추정)"으로 둔다.
  const embedChunks = (reindexLogs || []).reduce((sum, l) => sum + (l.chunkCount || 0), 0)
  const embedUsd = embedChunks * TOKENS_PER_CHUNK * EMBED_USD_PER_TOKEN

  // 월 예상(생성 기준) — 최근 4주 평균 주 비용 × 4.33주(52/12). 전체 8주 평균이 아니라 최근 흐름을 본다
  const recent = [...weeks.values()].sort((a, b) => String(a.weekStart) < String(b.weekStart) ? -1 : 1)
  const last4 = recent.slice(-4)
  const avgWeekUsd = last4.length ? last4.reduce((s, w) => s + w.costUsd, 0) / last4.length : 0
  const monthlyUsd = avgWeekUsd * 4.33

  return {
    rows: rows.length,
    okRate: rows.length ? Math.round((ok / rows.length) * 100) : 100,
    todayCalls,
    weekCalls,
    avgMs: msCount ? Math.round(ms / msCount) : null,
    inTokens,
    outTokens,
    generationUsd,
    embedChunks,
    embedUsd,
    weekly: recent.slice(-WEEKS),
    monthlyUsd,
  }
}

/** 화면에 처음 들어올 때 한 번 읽는다. 실패하면 빈 목록으로 둔다 — 실시간 폴링 없이 진입 시점 기준 */
export function ensureUsage(onDone) {
  if (ui.usageSummary !== undefined) return
  ui.usageSummary = null
  let logs = []
  let reindex = []
  Promise.all([
    pullCallPages().then((rows) => { logs = rows }),
    loadReindexLogs(0, 50)
      .then((rows) => { reindex = Array.isArray(rows) ? rows : [] })
      .catch(() => {}),
  ]).finally(() => {
    ui.usageSummary = aggregate(logs, reindex)
    onDone()
  })
}

/* ───── 그리기 ───── */

/* 색은 admin.css 의 .rag-dash 팔레트 변수(--chart-main/soft)로 받는다 —
   이벤트 관리 '이벤트 상태' 도넛과 같은 색을 세 차트가 공유한다 */

/** 라벨과 값을 좌우로 배치한다 */
function usageStat(label, value) {
  return `
    <div class="usage-stat">
      <span>${esc(label)}</span>
      <strong>${esc(value)}</strong>
    </div>
  `
}

/** 상단 비용 요약 */
function summaryBody(summary) {
  const totalCost = num(
    (summary.generationUsd + summary.embedUsd) * USD_KRW,
  )

  return `
    <section class="card usage-panel usage-overview">
      <div class="usage-cost">
        <p class="usage-label">최근 8주 누적 예상 비용</p>

        <div class="usage-cost-value">
          ${totalCost}<span>원</span>
        </div>

        <div class="usage-cost-breakdown">
          <span>
            생성 · 측정
            <strong>${num(summary.generationUsd * USD_KRW)}원</strong>
          </span>
          <span>
            임베딩 · 추정
            <strong>${num(summary.embedUsd * USD_KRW)}원</strong>
          </span>
        </div>

        <p class="usage-note usage-embedding-note">
          임베딩 비용 추정 — 청크 ${num(summary.embedChunks)}개 기준
        </p>
      </div>

      <div class="usage-overview-details">
        ${usageStat(
          '월 예상 비용 · 생성 기준',
          '약 ' + num(summary.monthlyUsd * USD_KRW) + '원',
        )}
        ${usageStat(
          '누적 토큰',
          num(summary.inTokens + summary.outTokens),
        )}

        <div class="usage-token-details">
          ${usageStat('입력 토큰', num(summary.inTokens))}
          ${usageStat('출력 토큰', num(summary.outTokens))}
        </div>

        <p class="usage-note">
          월 예상 비용은 최근 4주 평균 기준
        </p>
      </div>
    </section>
  `
}

/** 호출 한도 카드 */
function usageQuotaCard(label, count, quota) {
  const percent = quota > 0 ? count / quota * 100 : 0
  const width = Math.min(100, Math.max(0, percent))

  return `
    <section class="card usage-panel usage-quota">
      <h3>${esc(label)}</h3>
      <div class="usage-quota-value">
        ${num(count)}<span>/ ${num(quota)}회</span>
      </div>
      <div
        class="usage-quota-track"
        role="meter"
        aria-label="${esc(label)} 한도 사용률"
        aria-valuemin="0"
        aria-valuemax="${quota}"
        aria-valuenow="${Math.min(quota, Math.max(0, count))}"
        aria-valuetext="${num(count)} / ${num(quota)}회"
      >
        <span style="width:${width.toFixed(1)}%"></span>
      </div>
      <p class="usage-note">한도 대비 ${percent.toFixed(1)}% 사용</p>
    </section>
  `
}

/** 주차별 토큰 사용량 */
function weeklyBody(summary) {
  if (!summary.weekly.length) {
    return '<p class="usage-note">아직 기록이 없어요.</p>'
  }

  const byWeek = new Map(
    summary.weekly.map((week) => [week.weekStart, week]),
  )
  const thisMonday = mondayOf(kstDate(new Date().toISOString()))

  const weeks = Array.from({ length: WEEKS }, (_, index) => {
    const date = new Date(thisMonday + 'T00:00:00Z')
    date.setUTCDate(date.getUTCDate() - (WEEKS - 1 - index) * 7)
    const weekStart = date.toISOString().slice(0, 10)

    return byWeek.get(weekStart) ?? {
      weekStart,
      calls: 0,
      tokens: 0,
      costUsd: 0,
    }
  })

  const maxTokens = Math.max(1, ...weeks.map((week) => week.tokens))
  const lastIndex = weeks.length - 1

  const cols = weeks.map((w, index) => {
    const description = weekRange(w.weekStart)
      + ' — 호출 ' + num(w.calls) + '회'
      + ' · 토큰 ' + num(w.tokens)
      + ' · 생성 예상 비용 약 ' + num(w.costUsd * USD_KRW) + '원'

    return `
      <div class="usage-week-col${index === lastIndex ? ' is-latest' : ''}">
        <div
          class="usage-week-bar"
          tabindex="0"
          aria-label="${esc(description)}"
        >
          <span class="usage-week-tip">
            <strong>${esc(weekRange(w.weekStart))}</strong>
            <span>호출 ${num(w.calls)}회</span>
            <span>토큰 ${num(w.tokens)}</span>
            <span>생성 예상 비용 약 ${num(w.costUsd * USD_KRW)}원</span>
          </span>
          <span
            class="usage-week-fill"
            style="height:${(w.tokens / maxTokens * 100).toFixed(1)}%"
          ></span>
        </div>
        <span class="usage-week-label">
          ${esc(w.weekStart.slice(5).replace('-', '/'))}
        </span>
      </div>
    `
  }).join('')

  return `
    <div class="usage-section-heading">
      <h3>주차별 사용량</h3>
      <span>입력 + 출력 토큰</span>
    </div>
    <div class="usage-week-chart">${cols}</div>
  `
}

/** 비용 → 호출 현황 → 주차별 사용량과 응답 품질 */
function usageCard(summary) {
  const avg = summary.avgMs == null
    ? '-'
    : (Math.round(summary.avgMs / 100) / 10) + '초'

  return `
    <div class="usage-dashboard">
      ${summaryBody(summary)}

      <div class="usage-quota-grid">
        ${usageQuotaCard('오늘 호출', summary.todayCalls, DAILY_LIMIT)}
        ${usageQuotaCard('이번 주 호출', summary.weekCalls, WEEK_QUOTA)}
      </div>

      <section class="card usage-panel usage-analysis">
        <div class="usage-weekly">
          ${weeklyBody(summary)}
        </div>

        <div class="usage-quality">
          <h3>응답 품질</h3>
          ${usageStat('성공률', summary.okRate + '%')}
          ${usageStat('평균 응답', avg)}
        </div>
      </section>
    </div>
  `
}

export function usageView() {
  const head = `
    <div class="page-heading admin-page-heading">
      <div class="admin-page-title">
        <div class="admin-page-title__path">
          <span>워크스페이스</span>
          <span aria-hidden="true">›</span>
          <span class="admin-page-title__current">AI 사용량</span>
        </div>
        <h1>AI 사용량</h1>
        <p>호출 수·토큰·예상 비용을 한눈에 봅니다.</p>
      </div>
    </div>
  `
  const s = ui.usageSummary
  if (s === null) {
    return '<div class="container rag-dash">' + head + '<div class="card"><p>불러오는 중…</p></div></div>'
  }
  if (!s.rows) {
    return '<div class="container rag-dash">' + head
      + '<div class="card"><p>아직 기록이 없어요. AI 생성을 돌리면 여기에 사용량이 쌓여요.</p></div></div>'
  }
  return '<div class="container rag-dash">' + head
    + usageCard(s)
    // 설명은 카드 밖 문단 — /rag 차트 카드에서와 같은 방식 (화면 배경 위의 조용한 문단).
    // 글자를 키우면서도 한 줄을 지키려 문장을 덜어냈다 — 13px 기준 약 820px 이라 컨테이너에 들어온다
    + '<p class="helper trend-helper" style="font-size:13px">하루 상한은 ' + num(DAILY_LIMIT) + '회(주 ' + num(WEEK_QUOTA)
    + '회) — 막대 높이는 주별 상대 비율, 비용은 단가·추정 기반 참고치라 청구 금액과 다를 수 있어요.</p>'
    + '</div>'
}
