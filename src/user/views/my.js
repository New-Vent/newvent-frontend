/** 내 혜택. 원본: myView · metric */

import { esc } from '@shared/dom.js'
import { icon } from '@shared/icons.js'
import { eventById, rows } from '@shared/selectors.js'
import { ui } from '@shared/state.js'
import { button, metric } from '@shared/ui/controls.js'

import { loginView } from './login.js'

function myView(){
 if(!ui.logged)return loginView('참여 내역을 보려면 로그인해주세요');
 const ps=rows(),shown=ui.myFilter==='rewards'?ps.filter(p=>p.reward):ps;
 return '<div class="container"><div class="page-heading"><span class="eyebrow">MY EVENT COLLECTION</span><h1>나의 즐거움이 모이는 곳</h1><p>헌진님의 참여 기록과 받은 혜택을 확인하세요.</p></div><div class="metrics">'+metric('참여 기록',ps.length+'<small class="small"> 건</small>','지금까지 참여한 모든 기록','layers')+metric('받은 혜택',ps.filter(p=>p.reward).length+'<small class="small"> 건</small>','참여 결과로 확인한 선물','gift')+metric('결과 대기',ps.filter(p=>p.state==='pending').length+'<small class="small"> 건</small>','발표를 기다리는 이벤트','clock')+'</div><div class="filterbar"><div class="filters">'+button('my-filter','전체 참여 내역','data-value="all"',ui.myFilter==='all'?'active':'')+button('my-filter','받은 혜택','data-value="rewards"',ui.myFilter==='rewards'?'active':'')+'</div><span class="result-count">'+shown.length+'건</span></div><div class="stack">'+(shown.length?shown.slice().reverse().map(p=>{const e=eventById(p.eventId);return '<article class="history-card card"><div class="history-icon">'+icon(e?.icon||'gift')+'</div><div class="history-info"><h3>'+esc(p.title)+'</h3><div class="history-meta">'+p.at+' · '+p.id+'</div></div><div class="history-result"><span class="badge '+(p.state==='pending'?'amber':'green')+'">'+(p.state==='pending'?'결과 대기':'참여 완료')+'</span><p>'+esc(p.reward||p.result)+'</p></div>'+button('result','상세 보기','data-id="'+p.id+'"','btn sm')+'</article>';}).join(''):'<div class="empty">'+icon('gift')+'<h3>아직 기록이 없어요</h3><p>마음에 드는 이벤트에 참여해보세요.</p>'+button('route','이벤트 둘러보기','data-route="home"','btn soft')+'</div>')+'</div></div>';
}

export { myView }
