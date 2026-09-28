/** 데모 데이터 저장. 원본: persist() */

import { ui } from '@shared/state.js'

import { state } from './state.js'
import { STORAGE_KEY } from './constants.js'
import { toast } from './ui/toast.js'

function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state.db));}catch(e){state.storageEnabled=false;toast('이 브라우저에서는 새로고침 후 작업이 유지되지 않을 수 있어요.');}}

export { persist }
