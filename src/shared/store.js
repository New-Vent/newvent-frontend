/**
 * 아주 작은 상태 저장소.
 *
 * 프로토타입의 전역 ui / db 객체가 여기로 온다. 화면이 innerHTML 을
 * 통째로 다시 그리는 구조라, 상태가 바뀌면 구독자에게 알리기만 하면 된다.
 */

export function createStore(initial) {
  let state = initial
  const listeners = new Set()

  return {
    get: () => state,

    /** 얕은 병합. patch 가 함수면 현재 상태를 받아 조각을 돌려준다. */
    set(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch
      state = { ...state, ...next }
      listeners.forEach((fn) => fn(state))
    },

    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}
