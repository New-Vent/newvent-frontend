/** 프로토타입 전역 상수. 원본: newvent-design.html */

const STORAGE_KEY = 'newvent-design-enhanced-v1';

const DEMO_DATE = '2026-09-22';

const USER_ID = 'demo-user';

const LABELS={title:'메인 제목',intro:'소개 문구',benefitHeading:'혜택 영역 제목',cta:'참여 버튼 문구',start:'시작일',end:'종료일'};

const FIELD_BLOCK={title:'hero',intro:'hero',benefitHeading:'benefits',cta:'cta',start:'hero',end:'hero'};

const BLOCK_LABELS={hero:'제목·소개',highlight:'강조 배너',intro:'이벤트 소개',stats:'숫자로 보는 혜택',benefits:'혜택',prize:'경품',coupon:'쿠폰',compare:'비교표',audience:'참여 대상',steps:'참여 방법',schedule:'일정',faq:'자주 묻는 질문',notices:'유의사항',cta:'참여 버튼'};

/**
 * 순서를 못 옮기는 블록. 유의사항은 법적 고지, 참여 버튼은 전환 동선이라 늘 맨 끝이다.
 * ★ 서버 Block.canMove() 와 같은 목록이다. 보내도 서버가 무시하지만, 끌 수 없게 하는 게 맞다
 */
const PINNED_BLOCKS = ['notices', 'cta']

const CONTENT_FIELDS={title:'.hero-title',intro:'.hero-desc',benefitHeading:'[data-block="benefits"] h2',cta:'[data-slot="cta-link"]'};

export { STORAGE_KEY, DEMO_DATE, USER_ID, LABELS, FIELD_BLOCK, BLOCK_LABELS, PINNED_BLOCKS, CONTENT_FIELDS }