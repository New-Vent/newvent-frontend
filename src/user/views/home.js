/** 이벤트 목록. 원본: homeView · eventCard · filteredEvents · resultsHTML · activity */

import { $, esc } from '@shared/dom.js'
import { actionLabel, deadline, eventStatus, personalBadge, policyLabel, shortDate } from '@shared/format.js'
import { icon } from '@shared/icons.js'
import { CONFIGS } from '@shared/mock/configs.js'
import { thumb } from '@shared/preview/document.js'
import { hydrate } from '@shared/preview/frame.js'
import { currentParticipation, published, rows } from '@shared/selectors.js'
import { state, ui } from '@shared/state.js'
import { button } from '@shared/ui/controls.js'

function activity(){
 const ps=rows(),benefits=ps.filter(p=>p.reward).length;
 if(!ui.logged)return '<section class="activity card"><div class="activity-intro"><span class="avatar">'+icon('user')+'</span><div><h2>나에게 찾아온 혜택을 모아보세요</h2><p>로그인하면 참여 내역과 결과를 한눈에 볼 수 있어요.</p></div></div>'+button('route','로그인하기 '+icon('arrow'),'data-route="login"','btn soft')+'</section>';
 return '<section class="activity card" aria-label="나의 이벤트 활동"><div class="activity-intro"><span class="avatar">'+icon('user')+'</span><div><h2>헌진님, 반가워요!</h2><p>작은 즐거움이 쌓이는 나의 이벤트 기록</p></div></div><div class="activity-stat"><span>참여한 이벤트</span><strong>'+new Set(ps.map(p=>p.eventId)).size+'<small>개</small></strong></div><div class="activity-stat"><span>받은 혜택</span><strong>'+benefits+'<small>건</small></strong></div>'+button('route','내 활동 보기 '+icon('arrow'),'data-route="my"','btn ghost sm')+'</section>';
}

function eventCard(e){
 const s=published(e);
 return '<article class="event-card"><button class="card-link" data-act="event" data-id="'+e.id+'"><div style="position:relative">'+thumb(e)+'<span class="thumb-badge badge '+(eventStatus(e)==='live'?'pink':'')+'">'+deadline(e)+'</span></div><div class="event-body"><div class="event-meta"><span>'+esc(e.category)+' · '+esc(e.kind)+'</span>'+personalBadge(e)+'</div><h3>'+esc(s.title)+'</h3><p class="benefit">'+esc(e.benefit)+'</p><div class="event-bottom"><span>'+shortDate(s.start).slice(5)+' – '+shortDate(s.end).slice(5)+' · '+policyLabel(e)+'</span><span class="card-action">'+actionLabel(e)+icon('arrow')+'</span></div></div></button></article>';
}

function filteredEvents(){
 return state.db.events.filter(e=>!e.deletedAt&&published(e)).filter(e=>ui.category==='all'||e.category===ui.category).filter(e=>{
 if(ui.filter==='available')return eventStatus(e)==='live'&&(!ui.logged||!currentParticipation(e));
 return ui.filter==='all'||eventStatus(e)===ui.filter;
 }).filter(e=>(published(e).title+' '+e.benefit+' '+e.kind+' '+e.name+' '+e.category).toLowerCase().includes(ui.query.trim().toLowerCase()));
}

function resultsHTML(){
 const es=filteredEvents();
 return '<div class="filterbar"><div class="filters">'+[['all','전체'],['live','진행 중'],['upcoming','오픈 예정'],['available','참여 가능']].map(([v,t])=>button('filter',t,'data-value="'+v+'" aria-pressed="'+(ui.filter===v)+'"',ui.filter===v?'active':'')).join('')+'</div><span class="result-count">'+es.length+'개의 이벤트</span></div><div class="event-grid">'+(es.length?es.map(eventCard).join(''):'<div class="empty">'+icon('search')+'<h3>일치하는 이벤트가 없어요</h3><p>다른 검색어나 카테고리로 찾아보세요.</p>'+button('clear-filter','전체 이벤트 보기','','btn soft')+'</div>')+'</div>';
}

function homeView(){
 const featured=state.db.events.filter(e=>!e.deletedAt&&published(e)).slice(0,3);
 if(!featured.length)return '<div class="container"><div class="empty"><h3>게시된 이벤트가 없어요</h3><p>관리자가 이벤트를 게시하면 이곳에서 확인할 수 있어요.</p></div></div>';
 const e=featured[ui.hero%featured.length];
 return '<div class="container"><section class="hero"><div class="hero-copy"><span class="eyebrow">YOUR EVERYDAY EVENT</span><h1>작은 참여,<br><em>기분 좋은 혜택.</em></h1><p>취향에 맞는 이벤트를 만나고,<br>나만의 즐거운 순간을 만들어보세요.</p>'+button('event','추천 이벤트 만나기 '+icon('arrow'),'data-id="'+e.id+'"','btn primary')+'<div class="hero-controls">'+button('hero-prev',icon('back'),'aria-label="이전 추천 이벤트"','icon-btn')+'<strong>'+String(ui.hero%featured.length+1).padStart(2,'0')+'</strong><span class="line"></span><span>'+String(featured.length).padStart(2,'0')+'</span>'+button('hero-next',icon('arrow'),'aria-label="다음 추천 이벤트"','icon-btn')+'</div></div><div class="hero-preview"><div class="preview-bar"><i></i><i></i><i></i><span>NEWVENT PICK · '+esc(e.name)+'</span></div>'+thumb(e)+'<div class="hero-caption">'+icon(e.icon)+'<span>'+esc(e.name)+' 이벤트</span>'+button('event',icon('arrow'),'data-id="'+e.id+'" aria-label="추천 이벤트 상세 보기"','icon-btn')+'</div></div></section>'+activity()+
 '<section id="events-section"><div class="section-title spread"><div><span class="eyebrow">FIND YOUR EVENT</span><h2>오늘은 어떤 즐거움을 만나볼까요?</h2><p>응원부터 선물까지, 가볍게 참여하고 혜택을 확인해보세요.</p></div><label class="search">'+icon('search')+'<input id="event-search" type="search" placeholder="이벤트명, 혜택 검색" aria-label="이벤트 검색" value="'+esc(ui.query)+'"></label></div><div class="categories">'+button('category',icon('grid')+'전체','data-value="all" aria-pressed="'+(ui.category==='all')+'"','category '+(ui.category==='all'?'active':''))+CONFIGS.map(c=>button('category',icon(c.icon)+esc(c.category),'data-value="'+esc(c.category)+'" aria-pressed="'+(ui.category===c.category)+'"','category '+(ui.category===c.category?'active':''))).join('')+'</div><div id="event-results">'+resultsHTML()+'</div></section><aside class="guide-strip"><div><h3>참여부터 결과 확인까지, 한곳에서 간편하게</h3><p>내 혜택에서 참여한 이벤트와 받은 선물을 다시 확인할 수 있어요.</p></div><div class="guide-steps"><span><b>1</b>이벤트 선택</span><span><b>2</b>즐겁게 참여</span><span><b>3</b>내 혜택 확인</span></div></aside></div>';
}

function refreshResults(){const box=$('#event-results');if(box){box.innerHTML=resultsHTML();hydrate(box);}}

export { homeView, resultsHTML, refreshResults }
