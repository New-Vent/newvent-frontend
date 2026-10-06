/**
 * 템플릿 라이브러리 목업.
 *
 * 서버(PR #133)의 `GET /api/admin/template-library` 응답과 **같은 모양**으로 돌려준다.
 * 그래서 views/templates.js 는 목업·서버를 가르지 않는다 — 목록 모양이 하나다.
 *
 * ★ 목업에는 기본 제공 5종만 있다. 관리자 등록본은 저장된 버전에서 만들어지므로
 *   서버가 있어야 생긴다(등록·수정·비활성화 버튼은 목업에서 막아 둔다).
 */

import { TEMPLATE_KEYS } from '@shared/grades.js'

import { CONFIGS } from './configs.js'
import { TEMPLATE_BODIES } from './templates.js'

/** 목업 CONFIGS → 서버 TemplateLibraryResponse 모양 */
const ITEMS = CONFIGS.map((c) => ({
  templateKey: TEMPLATE_KEYS[c.templateId],
  name: c.name,
  description: c.kind + ' · ' + c.category,
  builtin: true,
  active: true,
  thumbnailPath: null,
}))

/** 서버 PageResponse 모양. keyword · builtin · page · size 를 같은 규칙으로 흉내 낸다 */
export function mockLibraryPage({ keyword = '', builtin = null, page = 0, size = 12 } = {}) {
  const q = keyword.trim().toLowerCase()
  const all = ITEMS
    .filter((t) => builtin === null || t.builtin === builtin)
    .filter((t) => !q || t.name.toLowerCase().includes(q))

  const totalPages = Math.max(1, Math.ceil(all.length / size))
  const p = Math.min(Math.max(0, page), totalPages - 1)
  return {
    content: all.slice(p * size, (p + 1) * size),
    page: p,
    size,
    totalElements: all.length,
    totalPages,
  }
}

/**
 * 서버 `GET …/{code}/preview` 와 같이 **`.ev-container` 조각**을 돌려준다.
 * ★ 기간 슬롯은 비운다 — 서버도 템플릿에서는 기간을 비워서 준다.
 */
export function mockTemplatePreview(code) {
  const id = Object.keys(TEMPLATE_KEYS).find((k) => TEMPLATE_KEYS[k] === code)
  const body = id && TEMPLATE_BODIES[id]
  if (!body) throw new Error('템플릿을 찾을 수 없습니다.')

  const doc = new DOMParser().parseFromString(body, 'text/html')
  doc.querySelectorAll('[data-slot="period"]').forEach((n) => (n.textContent = ''))
  return { templateKey: code, html: doc.querySelector('.ev-container')?.outerHTML || '' }
}
