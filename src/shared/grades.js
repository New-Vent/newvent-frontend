/**
 * 참여 대상 등급 · 템플릿 키 — **백엔드 기준**.
 *
 * ★ 등급은 "이 등급 이상만 참여" 다 (events.grade, ParticipationService 의 gradeRank 비교).
 *   NORMAL < EXCELLENT < BEST. 라벨도 백엔드 MembershipGrade 의 것을 쓴다.
 *
 * ★ 목업 이벤트 모델은 audience 문자열("로그인 회원" / "VIP · FAMILY 회원")을 쓴다.
 *   목업 참여 판정(participation.js)이 그 문자열을 보므로 audienceOf() 로 옮겨 적는다.
 */

export const GRADES = [
  { code: 'NORMAL', label: '일반 이상', desc: '모든 회원' },
  { code: 'EXCELLENT', label: '우수 이상', desc: '우수 · 최우수 회원' },
  { code: 'BEST', label: '최우수', desc: '최우수 회원만' },
]

export const gradeLabel = (code) => GRADES.find((g) => g.code === code)?.label ?? '일반 이상'

/** 목업 이벤트의 audience 로 — 우수 이상은 목업의 "VIP · FAMILY" 대상과 같게 본다 */
export const audienceOf = (code) => (code === 'NORMAL' ? '로그인 회원' : 'VIP · FAMILY 회원')

/** 목업 템플릿 id → 백엔드 템플릿 키 (event_templates.code) */
export const TEMPLATE_KEYS = {
  'tpl-1': 'sports_cheer',
  'tpl-2': 'holiday_gift',
  'tpl-3': 'member_appreciation',
  'tpl-4': 'flash_sale',
  'tpl-5': 'pre_registration',
}

/** 백엔드 GenerateRequest · EditRequest 의 requestText 상한 */
export const REQUEST_MAX = 500
