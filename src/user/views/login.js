/** 로그인. 원본: loginView */

import { esc } from '@shared/dom.js'
import { icon } from '@shared/icons.js'
import { button } from '@shared/ui/controls.js'
import { AUTH_ENABLED } from '@shared/api.js'
import { loginForm } from '@shared/login-form.js'
import { ui } from '@shared/state.js'

function loginView(title='NewVent에 오신 것을 환영해요'){
 if(AUTH_ENABLED){
  // 가입 직후 넘어오면 방금 만든 아이디를 채워 둔다 (main.js serverSignup 이 넣는다). 한 번 쓰고 버린다.
  const hint=ui.loginHint||'';ui.loginHint=null;
  return '<div class="container"><section class="login card"><span class="eyebrow">WELCOME TO NEWVENT</span><h1>'+esc(title)+'</h1><p>아이디와 비밀번호로 로그인해주세요.</p>'+loginForm(hint)
   +'<p class="helper" style="margin:18px 0 0">아직 계정이 없으신가요? '+button('route','회원가입','data-route="signup"','btn soft sm')+'</p></section></div>';
 }
 return '<div class="container"><section class="login card"><span class="eyebrow">WELCOME TO NEWVENT</span><h1>'+esc(title)+'</h1><p>프로토타입에서 체험할 역할을 선택해주세요.</p>'+button('role',icon('user')+'사용자로 체험하기','data-role="user"','btn primary wide')+button('role',icon('layers')+'관리자로 체험하기','data-role="admin"','btn wide')+'<p class="helper" style="margin:20px 0 0">실제 계정 없이 화면과 동작을 확인할 수 있습니다.</p></section></div>';
}

export { loginView }
