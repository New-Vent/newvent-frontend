/**
 * 이벤트 목록.
 *
 * 서버 모드에서는 공개 목록(`GET /api/public/events`)이 **제목 · 기간 · 상태 · 참여 대상 등급**을 준다.
 * 혜택 요약 · 참여 방식 · 정책은 응답에 없다(목업에만 있던 값이다).
 *
 * 썸네일은 목록 응답에 HTML 이 없어 지금은 안 나온다. 백엔드에 요청해둔 상태이고,
 * `thumbnailHtml` 이 오면 serverThumb() 가 바로 그린다.
 *
 * 원본: homeView · eventCard · filteredEvents · resultsHTML · activity
 */

import { $, esc } from '@shared/dom.js'
import { deadline, eventStatus, personalBadge, shortDate } from '@shared/format.js'
import { gradeLabel } from '@shared/grades.js'
import { icon } from '@shared/icons.js'
import { serverFrame, thumb } from '@shared/preview/document.js'
import { hydrate } from '@shared/preview/frame.js'
import { USE_SERVER } from '@shared/repo.js'
import { published, rows } from '@shared/selectors.js'
import { state, ui } from '@shared/state.js'
import { button } from '@shared/ui/controls.js'

/* ───────────── 서버 모드 ───────────── */

function myParticipationBadge(eventId) {
  if (!ui.logged || ui.homeParticipations?.state !== 'done') return ''

  const participation =
    ui.homeParticipations.byEvent[String(eventId)]

  if (!participation) return ''

  const pending = participation.resultStatus === 'PENDING'

  return '<span class="event-my-status'
    + (pending ? ' pending' : '') + '">'
    + (pending ? '결과 대기' : '참여 완료')
    + '</span>'
}

/** 날짜 다음 줄. 상세의 「참여 대상 / 일반 이상」과 같은 말. */
function gradeLine(label) {
  if (!label) return ''
  return '<p class="event-grade"><span>참여 대상</span>' + esc(label) + '</p>'
}

function listGrade(e) {
  if (e.grade) return gradeLabel(e.grade)
  if (String(e.audience || '').includes('VIP')) return '우수 이상'
  if (e.audience) return '일반 이상'
  return ''
}

/** 서버 목록 항목 → 카드. 있는 값만 쓴다. */
function serverCard(e) {
  const period = shortDate(e.startDate.slice(0, 10))
    + ' ~ ' + shortDate(e.endDate.slice(0, 10))

  const progress = progressOf(e, Date.now())
  const progressLabel = {
    live: '진행 중',
    upcoming: '오픈 예정',
    ended: '종료',
  }[progress]

  return '<article class="event-card">'
    + '<button class="card-link" data-act="event" data-id="' + esc(e.id) + '">'
    + '<div style="position:relative">' + serverThumb(e)
    + (e.closingSoon
      ? '<span class="thumb-badge badge event-closing-badge">마감 임박</span>'
      : '')
    + '</div>'
    + '<div class="event-body">'
    + '<div class="event-status-row">'
    + '<div class="event-progress ' + progress + '">'
    + '<span aria-hidden="true">●</span> ' + progressLabel
    + '</div>'
    + myParticipationBadge(e.id)
    + '</div>'
    + '<h3>' + esc(e.title) + '</h3>'
    + '<p class="event-period">' + period + '</p>'
    + gradeLine(listGrade(e))
    + '<div class="event-bottom">'
    + '<span>' + (progress === 'live'
      ? '이벤트 진행 중'
      : progress === 'upcoming'
        ? '오픈 예정 이벤트'
        : '종료된 이벤트') + '</span>'
    + '<span class="card-action">자세히 보기' + icon('arrow') + '</span>'
    + '</div>'
    + '</div>'
    + '</button></article>'
}

/**
 * 목록 응답에 HTML 이 오면 미리보기를, 없으면 자리표시자를 그린다.
 * 백엔드가 thumbnailHtml(hero 블록만) 또는 publishedHtml 을 주면 자동으로 켜진다.
 */
function eventThumbnailHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const hero = doc.querySelector('[data-block="hero"]')

  if (!hero) return html

  // 기존 테마를 유지하면서 첫 배너만 남긴다.
  const container = hero.closest('.ev-container')

  if (container) {
    container.replaceChildren(hero)
  } else {
    doc.body.replaceChildren(hero)
  }

  const style = doc.createElement('style')
  style.textContent = `
    html,
    body {
      margin: 0 !important;
      padding: 0 !important;
      width: 720px !important;
      overflow: hidden !important;
    }

    .ev-container {
      box-sizing: border-box !important;
      width: 720px !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }

    [data-block="hero"] {
      box-sizing: border-box !important;
      width: 100% !important;
      max-width: none !important;
      height: 440px !important;
      min-height: 440px !important;
      max-height: 440px !important;
      margin: 0 !important;
      border-radius: 0 !important;
      overflow: hidden !important;
      align-content: center !important;
    }
  `

  doc.body.appendChild(style)
  return doc.body.outerHTML
}

function serverThumb(e) {
  const html = e.thumbnailHtml || e.publishedHtml

  if (html) {
    return '<div class="thumb">'
      + serverFrame(eventThumbnailHtml(html), '이벤트 미리보기')
      + '</div>'
  }

  return '<div class="thumb thumb-empty" aria-hidden="true">'
    + icon('gift')
    + '</div>'
}

function progressOf(event, now) {
  if (event.status === 'ENDED') return 'ended'
  if (new Date(event.startDate).getTime() > now) return 'upcoming'
  if (new Date(event.endDate).getTime() <= now) return 'ended'
  return 'live'
}

function serverResults() {
  const query = ui.query.trim().toLowerCase()
  const filter = ui.filter || 'all'
  const now = Date.now()

  const events = (ui.serverEvents || []).filter((event) => {
    const matchesTitle = event.title.toLowerCase().includes(query)
    const matchesProgress =
      filter === 'all' || progressOf(event, now) === filter

    return matchesTitle && matchesProgress
  })

  const filters = [
    ['all', '전체'],
    ['live', '진행 중'],
    ['upcoming', '오픈 예정'],
  ].map(([value, label]) =>
    button(
      'filter',
      label,
      'data-value="' + value + '" aria-pressed="' + (filter === value) + '"',
      filter === value ? 'active' : '',
    ),
  ).join('')

  return '<div class="filterbar">'
    + '<div class="filters">' + filters + '</div>'
    + '<span class="result-count">' + events.length + '개의 이벤트</span>'
    + '</div>'
    + '<div class="event-grid">'
    + (events.length
      ? events.map(serverCard).join('')
      : '<div class="empty">'
        + icon('search')
        + '<h3>일치하는 이벤트가 없어요</h3>'
        + '<p>검색어나 필터를 변경해보세요.</p>'
        + button('clear-filter', '전체 이벤트 보기', '', 'btn soft')
        + '</div>')
    + '</div>'
}

/* ───────────── 목업 모드 ───────────── */

function activity(){
 const ps=rows(),benefits=ps.filter(p=>p.reward).length;
 if(!ui.logged)return '<section class="activity card"><div class="activity-intro"><span class="avatar">'+icon('user')+'</span><div><h2>나에게 찾아온 혜택을 모아보세요</h2><p>로그인하면 참여 내역과 결과를 한눈에 볼 수 있어요.</p></div></div>'+button('route','로그인하기 '+icon('arrow'),'data-route="login"','btn soft')+'</section>';
 return '<section class="activity card" aria-label="나의 이벤트 활동"><div class="activity-intro"><span class="avatar">'+icon('user')+'</span><div><h2>'+esc(ui.userName||'회원')+'님, 반가워요!</h2><p>작은 즐거움이 쌓이는 나의 이벤트 기록</p></div></div><div class="activity-stat"><span>참여한 이벤트</span><strong>'+new Set(ps.map(p=>p.eventId)).size+'<small>개</small></strong></div><div class="activity-stat"><span>받은 혜택</span><strong>'+benefits+'<small>건</small></strong></div>'+button('route','내 활동 보기 '+icon('arrow'),'data-route="my"','btn ghost sm')+'</section>';
}

/** 목업 카드도 제목 · 썸네일 · 기간으로 맞춘다 (서버 모드와 같은 모양). */
function eventCard(e){
 const s=published(e);
 return '<article class="event-card"><button class="card-link" data-act="event" data-id="'+e.id+'"><div style="position:relative">'+thumb(e)+'<span class="thumb-badge badge '+(eventStatus(e)==='live'?'pink':'')+'">'+deadline(e)+'</span></div><div class="event-body"><div class="event-meta">'+personalBadge(e)+'</div><h3>'+esc(s.title)+'</h3><p class="event-period">'+shortDate(s.start)+' ~ '+shortDate(s.end)+'</p>'+gradeLine(listGrade(e))+'<div class="event-bottom"><span class="card-action">자세히 보기'+icon('arrow')+'</span></div></div></button></article>';
}

function filteredEvents(){
 return state.db.events.filter(e=>!e.deletedAt&&published(e)).filter(e=>{
 if(ui.filter==='available')return eventStatus(e)==='live';
 return ui.filter==='all'||eventStatus(e)===ui.filter;
 }).filter(e=>published(e).title.toLowerCase().includes(ui.query.trim().toLowerCase()));
}

function mockResults(){
 const es=filteredEvents();
 return '<div class="filterbar"><div class="filters">'+[['all','전체'],['live','진행 중'],['upcoming','오픈 예정']].map(([v,t])=>button('filter',t,'data-value="'+v+'" aria-pressed="'+(ui.filter===v)+'"',ui.filter===v?'active':'')).join('')+'</div><span class="result-count">'+es.length+'개의 이벤트</span></div><div class="event-grid">'+(es.length?es.map(eventCard).join(''):'<div class="empty">'+icon('search')+'<h3>일치하는 이벤트가 없어요</h3><p>다른 검색어로 찾아보세요.</p>'+button('clear-filter','전체 이벤트 보기','','btn soft')+'</div>')+'</div>';
}

/* ───────────── 화면 ───────────── */

function resultsHTML() {
  return USE_SERVER ? serverResults() : mockResults()
}

function serverHero() {
  const featured = (ui.serverEvents || []).slice(0, 3)

  if (!featured.length) return ''

  const index = ((ui.hero || 0) % featured.length + featured.length)
    % featured.length
  const event = featured[index]

  return `
    <section class="hero user-featured" aria-label="추천 이벤트">
      <div class="hero-copy">
        <span class="eyebrow">NEWVENT 추천</span>
        <h1>오늘의 작은 참여가<br><em>특별한 혜택으로.</em></h1>
        <p>
          일상에 즐거움을 더할<br>
          이벤트를 만나보세요.
        </p>

        ${button(
          'event',
          '추천 이벤트 만나기 ' + icon('arrow'),
          'data-id="' + esc(event.id) + '"',
          'btn primary',
        )}

        <div class="hero-controls">
          ${button(
            'hero-prev',
            icon('back'),
            'aria-label="이전 추천 이벤트"'
              + (featured.length === 1 ? ' disabled' : ''),
            'icon-btn',
          )}
          <strong aria-live="polite">
            ${String(index + 1).padStart(2, '0')}
          </strong>
          <span class="line"></span>
          <span>${String(featured.length).padStart(2, '0')}</span>
          ${button(
            'hero-next',
            icon('arrow'),
            'aria-label="다음 추천 이벤트"'
              + (featured.length === 1 ? ' disabled' : ''),
            'icon-btn',
          )}
        </div>
      </div>

      <div class="hero-preview">
        <div class="preview-bar">
          <i></i><i></i><i></i>
          <span>NEWVENT PICK</span>
        </div>

        ${serverThumb(event)}

        <div class="hero-caption">
          ${icon('gift')}
          <span>${esc(event.title)}</span>
          ${button(
            'event',
            icon('arrow'),
            'data-id="' + esc(event.id)
              + '" aria-label="추천 이벤트 상세 보기"',
            'icon-btn',
          )}
        </div>
      </div>
    </section>
  `
}

function homeView() {
  const heading =
    '<div class="page-heading">'
    + '<span class="eyebrow">이벤트 모아보기</span>'
    + '<h1>어떤 이벤트에 참여해볼까요?</h1>'
    + '<p>진행 중인 이벤트와 오픈 예정 이벤트를 확인하세요.</p>'
    + '</div>'

  const search =
    '<div class="section-title spread"><div></div><label class="search">' + icon('search')
    + '<input id="event-search" type="search" placeholder="이벤트명 검색" aria-label="이벤트 검색" value="'
    + esc(ui.query) + '"></label></div>'

  if (USE_SERVER) {
    if (ui.serverEventsState === 'loading') {
      return '<div class="container">' + heading + '<div class="empty"><h3>이벤트를 불러오는 중…</h3></div></div>'
    }
    if (ui.serverEventsState === 'error') {
      return '<div class="container">' + heading
        + '<div class="empty"><h3>이벤트를 불러오지 못했어요</h3><p>' + esc(ui.serverEventsError || '') + '</p>'
        + button('reload-events', '다시 시도', '', 'btn soft') + '</div></div>'
    }

    return '<div class="container">'
      + serverHero()
      + '<section id="events-section" class="user-events-section">'
      + '<div class="user-events-heading">'
      + heading
      + search
      + '</div>'
      + '<div id="event-results">' + serverResults() + '</div>'
      + '</section>'
      + '</div>'
  }

  // 목업 — 추천 히어로까지 보여준다
  const featured = state.db.events.filter((e) => !e.deletedAt && published(e)).slice(0, 3)
  if (!featured.length) {
    return '<div class="container"><div class="empty"><h3>게시된 이벤트가 없어요</h3><p>관리자가 이벤트를 게시하면 이곳에서 확인할 수 있어요.</p></div></div>'
  }
  const e = featured[ui.hero % featured.length]
  return '<div class="container"><section class="hero"><div class="hero-copy"><span class="eyebrow">YOUR EVERYDAY EVENT</span><h1>작은 참여,<br><em>기분 좋은 혜택</em></h1><p>취향에 맞는 이벤트를 만나고,<br>나만의 즐거운 순간을 만들어보세요.</p>'+button('event','추천 이벤트 만나기 '+icon('arrow'),'data-id="'+e.id+'"','btn primary')+'<div class="hero-controls">'+button('hero-prev',icon('back'),'aria-label="이전 추천 이벤트"','icon-btn')+'<strong>'+String(ui.hero%featured.length+1).padStart(2,'0')+'</strong><span class="line"></span><span>'+String(featured.length).padStart(2,'0')+'</span>'+button('hero-next',icon('arrow'),'aria-label="다음 추천 이벤트"','icon-btn')+'</div></div><div class="hero-preview"><div class="preview-bar"><i></i><i></i><i></i><span>NEWVENT PICK</span></div>'+thumb(e)+'<div class="hero-caption">'+icon('gift')+'<span>'+esc(published(e).title)+'</span>'+button('event',icon('arrow'),'data-id="'+e.id+'" aria-label="추천 이벤트 상세 보기"','icon-btn')+'</div></div></section>'+activity()
   +'<section id="events-section">'+search+'<div id="event-results">'+mockResults()+'</div></section></div>'
}

function refreshResults(){const box=$('#event-results');if(box){box.innerHTML=resultsHTML();hydrate(box);}}

function refreshHero() {
  const hero = document.querySelector('.user-featured')
  if (!USE_SERVER || !hero) return false

  const template = document.createElement('template')
  template.innerHTML = serverHero().trim()

  const nextHero = template.content.firstElementChild
  if (!nextHero) return false

  const focusedAction = hero.contains(document.activeElement)
    ? document.activeElement.dataset.act
    : null

  hero.replaceWith(nextHero)
  hydrate(nextHero)

  if (focusedAction) {
    nextHero.querySelector(`[data-act="${focusedAction}"]`)?.focus()
  }

  return true
}

export { homeView, resultsHTML, refreshResults, refreshHero }
