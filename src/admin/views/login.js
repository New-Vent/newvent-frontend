/**
 * 관리자 로그인.
 * 사용자와 엔드포인트·쿠키가 다르다 — Refresh 는 nv_admin_rt (Path=/api/admin/auth).
 * 원본: loginView
 */

import { esc } from '@shared/dom.js'
import { icon } from '@shared/icons.js'
import { button } from '@shared/ui/controls.js'
import { AUTH_ENABLED } from '@shared/api.js'
import { loginForm } from '@shared/login-form.js'

function loginView(title='NewVent에 오신 것을 환영해요'){
 if(AUTH_ENABLED) return '<div class="container"><section class="login card"><span class="eyebrow">NEWVENT ADMIN</span><h1>관리자 로그인</h1><p>관리자 계정으로 로그인해주세요.</p>'+loginForm()+'</section></div>';
 return '<div class="container"><section class="login card"><span class="eyebrow">WELCOME TO NEWVENT</span><h1>'+esc(title)+'</h1><p>프로토타입에서 체험할 역할을 선택해주세요.</p>'+button('role',icon('user')+'사용자로 체험하기','data-role="user"','btn primary wide')+button('role',icon('layers')+'관리자로 체험하기','data-role="admin"','btn wide')+'<p class="helper" style="margin:20px 0 0">실제 계정 없이 화면과 동작을 확인할 수 있습니다.</p></section></div>';
}

export { loginView }
