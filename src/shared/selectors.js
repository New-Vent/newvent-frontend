/** 상태 조회. 원본: eventById · currentEvent · version · published … */

import { clone } from '@shared/dom.js'

import { state, ui } from './state.js'
import { USER_ID, DEMO_DATE } from './constants.js'
import { baseSnapshot } from './mock/fixtures.js'
import { CONFIGS } from './mock/configs.js'

function eventById(id){return state.db.events.find(e=>e.id===id);}

function currentEvent(){return eventById(ui.activeId)||state.db.events[0];}

function version(e,v){return e.versions.find(x=>x.v===Number(v));}

function published(e){return version(e,e.publishedVersion)?.snapshot||null;}

function currentDraft(e=currentEvent()){
 if(!ui.drafts[e.id]){
  const v=e.versions[e.versions.length-1];
  ui.drafts[e.id]={base:v.v,snapshot:clone(v.snapshot)};
 }
 return ui.drafts[e.id];
}

function isDirty(e=currentEvent()){const d=currentDraft(e);return JSON.stringify(d.snapshot)!==JSON.stringify(version(e,d.base).snapshot);}

function rows(){return state.db.participations.filter(p=>p.userId===USER_ID);}

function latestParticipation(e){return rows().filter(p=>p.eventId===e.id).at(-1);}

function currentParticipation(e){return rows().filter(p=>p.eventId===e.id&&(e.policy!=='daily'||p.day===DEMO_DATE)).at(-1);}

export { eventById, currentEvent, version, published, currentDraft, isDirty, rows, latestParticipation, currentParticipation }
