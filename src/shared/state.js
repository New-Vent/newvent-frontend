/**
 * 앱 전역 상태.
 *
 * 원본(newvent-design.html)은 전역 let db / const ui 였다.
 * db·observers 등은 재할당되므로 홀더 객체 state 에 담는다.
 * ui 는 제자리 변경만 하므로 그대로 내보낸다.
 */

import { initialDatabase } from './mock/fixtures.js'
import { STORAGE_KEY } from './constants.js'

export const state = {
  db: initialDatabase(),
  observers: [],
  storageEnabled: true,
  toastTimer: undefined,
  returnFocus: null,
  confirmAction: null,
  publishSelection: null,
}

// 저장된 데모 데이터가 있으면 복원한다.
try {
  const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
  if (
    raw && raw.schema === 1 && Array.isArray(raw.events) && raw.events.length &&
    raw.events.every((e) => Array.isArray(e.versions) && e.versions.length) &&
    Array.isArray(raw.participations)
  ) state.db = raw
} catch (e) {
  state.storageEnabled = false
}

export const ui = {chatSide:(()=>{try{return localStorage.getItem('newvent-admin-chat-side')==='right'?'right':'left'}catch{return 'left'}})(),adminShowDeleted:false,route:'home',role:'user',logged:true,activeId:state.db.events[0].id,filter:'all',category:'all',query:'',hero:0,mobile:false,block:'hero',drafts:{},chats:{},votes:{},myFilter:'all',adminQuery:'',adminStatus:'all',demoGrade:'일반',selectedTargets:{},requests:{},chatInputs:{},manualOpen:{},demoOpen:{},scenarios:{}};
