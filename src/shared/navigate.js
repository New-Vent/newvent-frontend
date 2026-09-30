/**
 * 화면 이동을 뷰에서도 부를 수 있게 하는 얇은 다리.
 *
 * 이식한 뷰 함수들은 원본처럼 `navigate('editor', id)` 를 그냥 부른다.
 * 그런데 실제 구현은 각 앱의 main.js 에 있다(라우터가 거기 있으니까).
 * 뷰가 main.js 를 import 하면 순환이 되므로, main.js 가 시작할 때
 * 자기 구현을 여기에 등록하고 뷰는 이 모듈만 부른다.
 */

let impl = null

/** 앱 셸이 시작할 때 한 번 등록한다. */
export function setNavigate(fn) {
  impl = fn
}

/** 뷰에서 부르는 쪽. 등록 전에 불리면 조용히 넘어가지 않고 알려준다. */
export function navigate(route, id) {
  if (!impl) {
    console.error('[newvent] navigate 가 아직 등록되지 않았습니다 (setNavigate 확인)')
    return
  }
  return impl(route, id)
}
