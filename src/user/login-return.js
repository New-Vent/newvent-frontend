/**
 * 로그인 화면으로 가기 전에 보던 화면을 기억했다가, 로그인하면 거기로 돌려보낸다.
 *
 * ★ 주소 문자열이 아니라 (화면 이름, id) 만 담는다. 돌아갈 곳은 PATH 표로 다시 만들기 때문에
 *   바깥 주소로 보내는 일이 생기지 않는다.
 * ★ 로그인·회원가입 화면 사이를 오가는 동안만 들고 있고, 다른 화면으로 가면 버린다.
 *   안 버리면 한참 뒤 로그아웃하고 다시 로그인했을 때 옛 이벤트로 끌려간다.
 */

/** 로그인 안내가 뜨는 화면들. 홈은 어차피 기본 도착지라 담지 않는다 */
const RETURNABLE = ['event', 'my']

/** 이 화면들 사이를 오가는 동안은 기억을 유지한다 */
const KEEP_ON = ['login', 'signup']

export function rememberLoginReturn(ui) {
  if (!RETURNABLE.includes(ui.route)) return
  ui.loginReturn = { route: ui.route, id: ui.route === 'event' ? ui.activeId : undefined }
}

/** 화면이 바뀔 때 부른다. 로그인·회원가입이 아닌 화면에 도착하면 기억을 버린다 */
export function dropLoginReturnOn(ui, route) {
  if (!KEEP_ON.includes(route)) ui.loginReturn = null
}

/** 한 번만 꺼낸다. 없으면 null */
export function takeLoginReturn(ui) {
  const back = ui.loginReturn ?? null
  ui.loginReturn = null
  return back
}
