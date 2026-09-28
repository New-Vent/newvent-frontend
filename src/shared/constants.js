/** 프로토타입 전역 상수. 원본: newvent-design.html */

const STORAGE_KEY = 'newvent-design-enhanced-v1';

const DEMO_DATE = '2026-09-22';

const USER_ID = 'demo-user';

const LABELS={title:'메인 제목',intro:'소개 문구',benefitHeading:'혜택 영역 제목',cta:'참여 버튼 문구',start:'시작일',end:'종료일'};

const FIELD_BLOCK={title:'hero',intro:'hero',benefitHeading:'benefits',cta:'cta',start:'hero',end:'hero'};

const BLOCK_LABELS={hero:'제목·소개',benefits:'혜택',steps:'참여 방법',notices:'유의사항',cta:'참여 버튼'};

const CONTENT_FIELDS={title:'.hero-title',intro:'.hero-desc',benefitHeading:'[data-block="benefits"] h2',cta:'[data-slot="cta-link"]'};

export { STORAGE_KEY, DEMO_DATE, USER_ID, LABELS, FIELD_BLOCK, BLOCK_LABELS, CONTENT_FIELDS }
