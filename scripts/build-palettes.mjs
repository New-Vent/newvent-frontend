// 팔레트 확장 생성기 — 아래 색 명세 한 벌에서 확장 팔레트 CSS 와 어두운 팔레트 목록을 만든다
//
//   node scripts/build-palettes.mjs          → 90-palettes/03-expansion.css 를 쓰고, 95 · 99 의 어두운 목록을 맞춘다
//   node scripts/build-palettes.mjs --check  → 쓰지 않고 맞는지만 본다 (CI · 커밋 전)
//   node scripts/build-palettes.mjs --java   → 백엔드 registry/Palette.java 의 확장 enum 줄을 찍는다 (저장소가 달라 손으로 붙인다)
//
// ★ 값을 손으로 고치지 않는다. 03-expansion.css 를 직접 고치면 다음 실행에서 덮인다 — 명세(L · D)를 고친다
// ★ 대비는 생성기가 맞춘다. 명세의 색은 "의도한 색" 이고, 글자로 쓰일 때 기준에 모자라면 밝기만 옮긴다
// ★ 겹침 검사: 다른 팔레트(기존 01 · 02 포함)와 색 거리가 MIN_DISTANCE 보다 가까우면 실패한다.
//   대비를 맞추느라 밝기를 옮기면 비슷한 색끼리 한 값으로 모인다 — 이름이 달라도 화면은 같아진다
//   (처음 129종을 만들었을 때 20쌍이 그랬다)
// 이 파일을 고쳤으면 npm run css 로 event.css 를 다시 만든다
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIR = join(ROOT, 'src', 'event-css', '90-palettes');
const MIN_DISTANCE = 0.035;

// [slug, 프롬프트 설명("이름 — 색"), 기본색, 2차색, hero 3단]
// 어두운 팔레트는 6번째에 바탕색
const L = [
  ['retro', '레트로 — 크림, 바랜 빨강, 겨자', '#b4442f', '#c9a227', ['#3b1d14', '#7a2e1f', '#c2603f']],
  ['lemonade', '레모네이드 — 레몬 노랑, 연두', '#4d7c0f', '#facc15', ['#3f3a05', '#a16207', '#facc15']],
  ['aqua', '아쿠아 — 청록, 물빛', '#0e7490', '#22d3ee', ['#083344', '#0e7490', '#2dd4bf']],
  ['emerald', '에메랄드 — 에메랄드 초록, 보석', '#047857', '#34d399', ['#022c22', '#065f46', '#10b981']],
  ['cupcake', '컵케이크 — 분홍, 민트, 크림', '#c2416c', '#5eead4', ['#5b1a34', '#a33a63', '#f49cbb']],
  ['bumblebee', '꿀벌 — 노랑, 검정 줄무늬', '#a16207', '#111827', ['#1c1917', '#78350f', '#eab308']],
  ['corporate', '기업 — 신뢰감 있는 파랑, 회색', '#1d4ed8', '#64748b', ['#0f172a', '#1e3a8a', '#3b82f6']],
  ['garden', '가든 — 꽃분홍, 잎 초록', '#be185d', '#16a34a', ['#3f0d24', '#9d174d', '#4ade80']],
  ['fantasy', '판타지 — 보라, 하늘, 몽환적', '#7e22ce', '#38bdf8', ['#2e1065', '#6b21a8', '#60a5fa']],
  ['cmyk', 'CMYK — 인쇄 원색 (청록, 자홍, 노랑)', '#0e7490', '#db2777', ['#083344', '#be185d', '#eab308']],
  ['acid', '애시드 — 형광 연두, 자홍', '#4d7c0f', '#d946ef', ['#1a2e05', '#65a30d', '#d946ef']],
  ['wireframe', '와이어프레임 — 흰 바탕, 검은 선, 회색', '#27272a', '#a1a1aa', ['#18181b', '#3f3f46', '#a1a1aa']],
  ['caramel', '카라멜 — 카라멜 갈색, 라떼 크림', '#9a5b13', '#d6a35c', ['#2d1a0b', '#7c4a14', '#c88a3a']],
  ['silk', '실크 — 아이보리, 은은한 베이지', '#7c6a55', '#c8b79e', ['#2e2a24', '#5c5144', '#a8977f']],
  ['zinc', '징크 — 중성 회색, 차분한', '#3f3f46', '#a1a1aa', ['#09090b', '#27272a', '#71717a']],
  ['slate', '슬레이트 — 푸른 회색, 차가운 돌', '#334e68', '#7dd3fc', ['#0f1c2e', '#243b55', '#5b7fa6']],
  ['stone', '스톤 — 따뜻한 회색', '#57534e', '#a8a29e', ['#1c1917', '#44403c', '#a8a29e']],
  ['rose', '로즈 — 장미 빨강 단색', '#be123c', '#fb7185', ['#4c0519', '#9f1239', '#f43f5e']],
  ['violet', '바이올렛 — 보라색 단색', '#6d28d9', '#a78bfa', ['#2e1065', '#5b21b6', '#8b5cf6']],
  ['orange', '오렌지 — 주황색 단색', '#c2410c', '#fb923c', ['#431407', '#9a3412', '#f97316']],
  ['chuseok', '추석 — 보름달 황금, 달빛 남색, 한가위', '#a16207', '#1e3a8a', ['#0b1437', '#1e3a8a', '#eab308']],
  ['pepero', '빼빼로데이 — 초콜릿 갈색, 딸기 분홍', '#7c2d12', '#ec4899', ['#2b1208', '#6b2d16', '#ec4899']],
  ['rainy', '장마 — 회청색, 빗방울', '#3b5b7a', '#7dd3fc', ['#1b2838', '#33506b', '#7896b2']],
  ['cherry', '벚꽃 — 진한 벚꽃 분홍, 꽃놀이', '#be185d', '#f9a8d4', ['#500724', '#be185d', '#f9a8d4']],
  ['suneung', '수능 응원 — 응원 주황, 남색, 합격', '#c2410c', '#1e3a8a', ['#172554', '#1e3a8a', '#f97316']],
  ['childrens-day', '어린이날 — 하늘, 노랑, 초록, 풍선', '#0369a1', '#facc15', ['#0c4a6e', '#0284c7', '#4ade80']],
  ['early-spring', '초봄 — 새싹 연두, 연노랑', '#4d7c0f', '#fde047', ['#1a2e05', '#4d7c0f', '#a3e635']],
  ['monsoon', '장마철 — 짙은 남청, 비구름', '#1e3a5f', '#38bdf8', ['#0b1726', '#1e3a5f', '#3b6e99']],
  ['heatwave', '폭염 — 이글거리는 다홍, 한여름', '#b42318', '#facc15', ['#3b0505', '#dc2626', '#fb923c']],
  ['first-snow', '첫눈 — 흰색, 은회색, 눈송이', '#475569', '#cbd5e1', ['#1e293b', '#475569', '#cbd5e1']],
  ['foliage', '단풍 — 진홍 단풍잎, 와인빛 가을', '#9f1d2b', '#f59e0b', ['#2a0a0a', '#7f1d1d', '#d9480f']],
  ['seollal', '설날 — 색동 (분홍, 노랑, 초록, 파랑)', '#be185d', '#16a34a', ['#7f1d1d', '#be185d', '#2563eb']],
  ['dano', '단오 — 창포 초록, 붉은 부채', '#15803d', '#dc2626', ['#052e16', '#166534', '#dc2626']],
  ['hangul-day', '한글날 — 먹색, 한지 크림', '#292524', '#a16207', ['#0c0a09', '#292524', '#78716c']],
  ['parents-day', '어버이날 — 카네이션 빨강, 잎 초록', '#be123c', '#16a34a', ['#4c0519', '#be123c', '#fb7185']],
  ['teachers-day', '스승의 날 — 카네이션 분홍, 칠판 초록', '#be185d', '#15803d', ['#14532d', '#166534', '#ec4899']],
  ['white-day', '화이트데이 — 은빛 회청, 흰색, 하늘', '#4f6d9a', '#e2e8f0', ['#334155', '#64748b', '#e0f2fe']],
  ['graduation', '졸업 · 입학 — 꽃다발 분홍, 남색 학사모', '#be185d', '#1e3a8a', ['#172554', '#3b2a7a', '#ec4899']],
  ['worldcup', '월드컵 응원 — 응원 빨강, 함성', '#b91c1c', '#1d4ed8', ['#450a0a', '#b91c1c', '#ef4444']],
  ['baseball', '야구 시즌 — 잔디 초록, 흰 공, 빨강 실밥', '#166534', '#dc2626', ['#052e16', '#166534', '#22c55e']],
  ['easter', '부활절 — 달걀 파스텔 (연보라, 연노랑, 민트)', '#7e22ce', '#fde047', ['#4c1d95', '#7e22ce', '#5eead4']],
  ['st-patrick', '성 패트릭 — 클로버 초록, 금', '#15803d', '#ca8a04', ['#052e16', '#15803d', '#ca8a04']],
  ['diwali', '디왈리 — 등불 금색, 주황', '#a16207', '#ea580c', ['#431407', '#c2410c', '#facc15']],
  ['y2k', 'Y2K — 은빛, 핑크, 하늘, 레트로 디지털', '#c026d3', '#7dd3fc', ['#3b0764', '#a21caf', '#7dd3fc']],
  ['vintage', '빈티지 — 바랜 크림, 올리브, 갈색', '#6b5b2a', '#a16207', ['#2b2410', '#5c4f24', '#a38f55']],
  ['earth', '어스 — 흙 갈색, 올리브', '#7c5a2c', '#65a30d', ['#291d0e', '#5c4321', '#8a7d3a']],
  ['ocean-deep', '깊은 바다 — 진청, 청록', '#0c4a6e', '#14b8a6', ['#04121f', '#0c4a6e', '#0e7490']],
  ['candy', '캔디 — 사탕 분홍, 하늘, 노랑', '#db2777', '#38bdf8', ['#831843', '#db2777', '#38bdf8']],
  ['matcha', '말차 — 회녹색 말차, 크림', '#5b7042', '#d9c79e', ['#1f2a17', '#4a5d36', '#a3b18a']],
  ['peach', '피치 — 복숭아, 코랄', '#c2410c', '#fda4af', ['#4a1d10', '#c2410c', '#fb923c']],
  ['burgundy', '버건디 — 와인 빨강, 금', '#881337', '#ca8a04', ['#2a0410', '#6b0f2a', '#9f1239']],
  ['monochrome-blue', '파랑 단색 — 파란색 한 가지 명도 단계', '#1d4ed8', '#93c5fd', ['#172554', '#1e40af', '#60a5fa']],
  ['sepia', '세피아 — 바랜 사진 갈색 톤', '#7c4a1e', '#c8a27a', ['#2a1a0c', '#5e3a1a', '#a37650']],
  ['high-contrast', '고대비 — 검정 글자, 진한 파랑, 읽기 쉽게', '#0b3d91', '#000000', ['#000000', '#0b1f4d', '#0b3d91']],
  ['colorblind-safe', '색약 배려 — 파랑, 주황 (빨강 · 초록 구분에 기대지 않음)', '#1d4ed8', '#ea580c', ['#0f172a', '#1e40af', '#ea580c']],
  ['catppuccin-latte', '카푸치노 라테 — 밝은 파스텔 (라벤더, 분홍, 하늘)', '#7c3aed', '#ea76cb', ['#4c1d95', '#7c3aed', '#04a5e5']],
  ['nord-aurora', '노르드 오로라 — 회청 바탕에 오로라 (빨강, 노랑, 초록, 보라)', '#5e81ac', '#b48ead', ['#2e3440', '#4c566a', '#88c0d0']],
  ['nord', '노르드 — 차가운 회청색, 북극', '#4c6a8c', '#88c0d0', ['#2e3440', '#3b4252', '#5e81ac']],
  ['solarized-light', '솔라라이즈드 — 크림 바탕, 청록, 주황', '#0f766e', '#cb4b16', ['#002b36', '#073642', '#2aa198']],
  ['rose-pine-dawn', '로제 파인 새벽 — 밝은 장미 베이지, 소나무 청록', '#a6435f', '#286983', ['#3b2033', '#7a3b52', '#d7827e']],
  ['everforest', '에버포레스트 — 부드러운 숲 초록, 이끼', '#4d7c4f', '#d6a54a', ['#1e2a21', '#3d5a40', '#7fa36f']],
  ['tomato', '토마토 — 토마토 빨강', '#c2310f', '#fb923c', ['#450a0a', '#b42b0f', '#f0573a']],
  ['plum', '자두 — 자두 보라', '#86198f', '#e879f9', ['#3b0b3f', '#701a75', '#c026d3']],
  ['iris', '아이리스 — 붓꽃 남보라', '#4338ca', '#a5b4fc', ['#1e1b4b', '#3730a3', '#6366f1']],
  ['jade', '비취 — 비취 초록, 옥', '#047857', '#6ee7b7', ['#022c22', '#047857', '#34d399']],
  ['grass', '풀 — 싱그러운 풀 초록', '#15803d', '#bef264', ['#052e16', '#15803d', '#4ade80']],
  ['mint', '민트 — 밝은 민트, 청량한', '#0d9488', '#a7f3d0', ['#134e4a', '#14b8a6', '#99f6e4']],
  ['bronze', '브론즈 — 청동, 녹청빛', '#7a5c3e', '#4f8a78', ['#1c1a14', '#4a4632', '#7f9c8a']],
  ['gold', '골드 — 금색, 고급', '#8a6a0a', '#eab308', ['#1c1505', '#6b4f04', '#ca8a04']],
  ['teal', '틸 — 청록색', '#0f766e', '#2dd4bf', ['#042f2e', '#115e59', '#14b8a6']],
  ['lime', '라임 — 라임 연두', '#4d7c0f', '#bef264', ['#1a2e05', '#3f6212', '#84cc16']],
  ['amber', '앰버 — 호박색, 노란 주황', '#b45309', '#fbbf24', ['#451a03', '#92400e', '#f59e0b']],
  ['sky', '스카이 — 하늘색, 맑은', '#0369a1', '#7dd3fc', ['#082f49', '#0369a1', '#38bdf8']],
  ['fuchsia', '푸크시아 — 자홍, 핫핑크', '#a21caf', '#f0abfc', ['#4a044e', '#a21caf', '#e879f9']],
  ['m3-baseline', 'M3 기본 — 차분한 보라 톤', '#6750a4', '#7d5260', ['#21005d', '#4f378b', '#7f67be']],
  ['dancheong', '단청 — 녹청, 주홍, 황', '#0f766e', '#c2410c', ['#042f2e', '#0f766e', '#d97706']],
  ['obangsaek', '오방색 — 청, 적, 황, 백, 흑', '#1d4ed8', '#dc2626', ['#111111', '#1d4ed8', '#eab308']],
  ['hanbok', '한복 — 쪽빛 남색, 연분홍, 노랑 저고리', '#1e3a8a', '#f9a8d4', ['#172554', '#1e3a8a', '#f472b6']],
  ['celadon', '청자 — 비색 연녹, 은은한', '#3f7a6b', '#a7c4b5', ['#1b3a33', '#3f7a6b', '#8fb8a8']],
  ['baekja', '백자 — 백자 흰색, 청화 남색', '#1e3a8a', '#cbd5e1', ['#172554', '#1e3a8a', '#94a3b8']],
  ['jeju', '제주 — 현무암 회색, 귤 주황, 바다', '#c2410c', '#0e7490', ['#1c1917', '#44403c', '#f97316']],
  ['busan', '부산 바다 — 해운대 청록 바다, 모래', '#155e75', '#d6b98c', ['#083344', '#155e75', '#e7c9a0']],
  ['hanok', '한옥 — 나무 갈색, 기와 회색, 창호지', '#7c4a1e', '#78716c', ['#1c1917', '#44403c', '#a16207']],
  ['boknal', '복날 — 인삼 갈색, 삼계탕 크림, 한여름 보양', '#9c6b30', '#4d7c0f', ['#2a1e0e', '#6b5427', '#e6d3a3']],
  ['gwangbokjeol', '광복절 — 태극 빨강, 파랑, 흰색', '#1d4ed8', '#dc2626', ['#172554', '#1d4ed8', '#dc2626']],
  ['kimjang', '김장 — 배추 연두, 고춧가루 빨강', '#b91c1c', '#84cc16', ['#3b0a0a', '#991b1b', '#65a30d']],
  ['back-to-school', '개학 — 공책 하늘, 연필 노랑', '#0369a1', '#facc15', ['#0c4a6e', '#0369a1', '#facc15']],
  ['summer-vacation', '여름 휴가 — 수박 빨강, 초록, 바다', '#be123c', '#16a34a', ['#0c4a6e', '#0284c7', '#f43f5e']],
  ['singles-day', '광군제 11.11 — 빨강, 금, 대할인', '#b91c1c', '#eab308', ['#450a0a', '#b91c1c', '#eab308']],
  ['cyber-monday', '사이버먼데이 — 전자 파랑, 형광 하늘', '#1d4ed8', '#22d3ee', ['#020617', '#1e3a8a', '#22d3ee']],
  ['thanksgiving', '추수감사절 — 호박 주황, 갈색, 수확', '#b45309', '#7c2d12', ['#2b1208', '#7c2d12', '#d97706']],
  ['citrus', '시트러스 — 오렌지, 레몬, 라임', '#c2410c', '#84cc16', ['#431407', '#ea580c', '#facc15']],
  ['berry', '베리 — 블루베리, 라즈베리', '#7e22ce', '#e11d48', ['#2e1065', '#6b21a8', '#e11d48']],
  ['lagoon', '라군 — 깊은 산호초 청록, 모래', '#0b5d5e', '#f2c48d', ['#032b2c', '#0b5d5e', '#f2c48d']],
  ['desert', '사막 — 모래 베이지, 마른 흙', '#8a6a3c', '#c2410c', ['#2b2213', '#7a5f36', '#e3c992']],
  ['tropical', '트로피컬 — 야자 초록, 망고 노랑, 핑크', '#15803d', '#f472b6', ['#052e16', '#15803d', '#fbbf24']],
  ['nordic', '북유럽 — 흰 나무, 연회색, 짙은 초록', '#2f5d50', '#d4c4a8', ['#1a2e28', '#2f5d50', '#94a3a0']],
  ['terracotta', '테라코타 — 구운 흙 주황, 크림', '#a8441f', '#e8c39e', ['#2e130a', '#8a3a1c', '#d2734a']],
  ['lavender-fog', '라벤더 안개 — 회보라, 안개 흰색', '#6b5b95', '#c4b5fd', ['#2a2440', '#5b4d82', '#a99bd0']],
  ['mocha-mousse', '모카 무스 — 모카 갈색, 우유', '#7a5541', '#c8a58f', ['#2a1c14', '#5e4232', '#a47e68']],
  ['electric', '일렉트릭 — 전기 파랑, 형광 노랑', '#1d4ed8', '#facc15', ['#0b1437', '#1d4ed8', '#22d3ee']],
  ['sorbet', '셔벗 — 딸기, 멜론, 레몬 셔벗', '#db2777', '#86efac', ['#831843', '#db2777', '#fde047']],
  ['ink', '먹 — 먹 검정, 붉은 낙관', '#1c1917', '#b91c1c', ['#0c0a09', '#1c1917', '#57534e']],
];

const D = [
  ['cyberpunk', '사이버펑크 — 어두운 밤, 형광 노랑, 분홍', '#facc15', '#ec4899', ['#0a0a0f', '#1a1033', '#be185d'], '#0a0a0f'],
  ['synthwave', '신스웨이브 — 어두운 보라, 네온 분홍', '#f472b6', '#22d3ee', ['#0d0221', '#2b0b5a', '#a21caf'], '#0d0221'],
  ['halloween', '핼러윈 — 검정, 호박 주황, 보라', '#fb923c', '#a855f7', ['#0a0a0a', '#1c1022', '#c2410c'], '#0c0a0d'],
  ['dracula', '드라큘라 — 어두운 진보라, 분홍, 연두', '#bd93f9', '#ff79c6', ['#191a21', '#282a36', '#6272a4'], '#1e1f29'],
  ['luxury', '럭셔리 — 검정, 샴페인 금', '#d6b25e', '#e7d3a3', ['#000000', '#141414', '#3a3222'], '#0a0a0a'],
  ['business', '비즈니스 — 어두운 남색, 차분한 파랑', '#7aa2f7', '#94a3b8', ['#0b1220', '#13203a', '#1e3a8a'], '#0b1220'],
  ['dim', '딤 — 어둡지만 부드러운 회청, 은은한 빛', '#9fb4d8', '#c4b5fd', ['#1a1f2b', '#252b3a', '#3b4560'], '#1c2130'],
  ['abyss', '심해 — 심해 남청색, 발광 청록', '#2dd4bf', '#60a5fa', ['#010b14', '#04223a', '#0e4a6e'], '#020d18'],
  ['blackfriday', '블랙프라이데이 — 검정, 형광 빨강, 대할인', '#ff4d5e', '#facc15', ['#000000', '#1a0505', '#b91c1c'], '#09090b'],
  ['black-day', '블랙데이 — 검정, 짜장 갈색', '#d6a35c', '#a8a29e', ['#0c0a09', '#1c1410', '#5c3a1e'], '#0c0a09'],
  ['neon-night', '네온 나이트 — 검정, 형광 분홍, 형광 파랑', '#f472b6', '#38bdf8', ['#05050a', '#140a2a', '#7e22ce'], '#06060c'],
  ['sakura-night', '밤벚꽃 — 남색 밤하늘, 벚꽃 분홍', '#f9a8d4', '#c4b5fd', ['#0b1028', '#1e1b4b', '#9d174d'], '#0c1124'],
  ['catppuccin-mocha', '카푸치노 모카 — 어두운 바탕에 파스텔 (라벤더, 분홍)', '#cba6f7', '#f5c2e7', ['#11111b', '#1e1e2e', '#45475a'], '#1e1e2e'],
  ['solarized-dark', '솔라라이즈드 어둡게 — 짙은 청록 바탕, 노랑', '#e0b341', '#2aa198', ['#001e26', '#002b36', '#073642'], '#002b36'],
  ['gruvbox', '그루브박스 — 어두운 레트로 갈색, 주황, 노랑', '#fabd2f', '#fe8019', ['#1d2021', '#282828', '#504945'], '#282828'],
  ['rose-pine', '로제 파인 — 어두운 보라 바탕, 먼지 낀 장미', '#ebbcba', '#9ccfd8', ['#191724', '#1f1d2e', '#403d52'], '#191724'],
  ['tokyo-night', '도쿄 나이트 — 도시 밤 남색, 네온 파랑', '#7aa2f7', '#bb9af7', ['#16161e', '#1a1b26', '#24283b'], '#1a1b26'],
  ['kanagawa', '가나가와 — 먹빛 남색 바탕, 크림, 파도', '#e6c384', '#7e9cd8', ['#16161d', '#1f1f28', '#2a2a37'], '#1f1f28'],
  ['one-dark', '원 다크 — 어두운 회청, 선명한 파랑', '#61afef', '#c678dd', ['#1e2127', '#282c34', '#3e4451'], '#282c34'],
  ['seoul-night', '서울 야경 — 남산 야경 남색, 불빛 노랑', '#fbbf24', '#60a5fa', ['#050a1a', '#0b1736', '#1e3a8a'], '#070d1f'],
  ['daeboreum', '정월대보름 — 밤하늘, 보름달 노랑', '#fde68a', '#93c5fd', ['#050816', '#0f172a', '#1e293b'], '#070b18'],
  ['chilseok', '칠석 — 은하수 남색, 별빛', '#c4b5fd', '#f9a8d4', ['#050520', '#14123a', '#3b2a7a'], '#080824'],
];

// ── 색 계산 ──
const hex = (h) => h.replace('#', '').match(/../g).map((x) => parseInt(x, 16));
const toHex = (rgb) => '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v * (1 - t) + B[i] * t)); };
const lum = (h) => { const [r, g, b] = hex(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const rgba = (h, a) => { const [r, g, b] = hex(h); return `rgba(${r}, ${g}, ${b}, ${a})`; };
const darkenTo = (c, bg, need) => { let x = c; for (let i = 0; i < 40 && contrast(x, bg) < need; i++) x = mix(x, '#000000', 0.04); return x; };
const lightenTo = (c, bg, need) => { let x = c; for (let i = 0; i < 40 && contrast(x, bg) < need; i++) x = mix(x, '#ffffff', 0.05); return x; };

const report = [];
function light([slug, desc, p0, acc, hero]) {
  const bg = mix(p0, '#ffffff', 0.97);
  const p = darkenTo(p0, '#ffffff', 4.5);          // 흰 바탕 글자 기준
  const hover = darkenTo(mix(p, '#000000', 0.15), '#ffffff', 5.7);   // 흰 글자를 얹는 채움 (README 기준)
  report.push([slug, p0 !== p ? `${p0}→${p}` : p, contrast(p, '#ffffff').toFixed(2), contrast(hover, '#ffffff').toFixed(2)]);
  return { slug, desc, dark: false, css: [
    `--ev-primary: ${p}; --ev-primary-hover: ${hover}; --ev-primary-light: ${mix(p, '#ffffff', 0.92)};`,
    `--ev-primary-glow: ${rgba(p, 0.25)};`,
    `--ev-gradient-hero: linear-gradient(135deg, ${hero[0]} 0%, ${hero[1]} 55%, ${hero[2]} 100%);`,
    `--ev-gradient-cta: linear-gradient(135deg, ${mix(p, '#ffffff', 0.18)} 0%, ${p} 100%);`,
    `--ev-accent-tag: ${acc};`,
    `--ev-bg: ${bg}; --ev-surface: #ffffff; --ev-surface-subtle: ${mix(p, '#ffffff', 0.94)}; --ev-border: ${mix(p, '#ffffff', 0.8)};`,
  ] };
}
function dark([slug, desc, p0, acc, hero, bg]) {
  const surface = mix(bg, '#ffffff', 0.06);
  // 어두운 카드 위 글자, 그리고 그 위에 #111 글자를 얹는 버튼 (99-dark-fixes) 둘 다 읽혀야 한다
  // ★ 카드(surface)만 보면 모자란다 — 영역 바탕(surface-subtle)이 더 밝고, 소제목 · 혜택 값이 그 위에 앉는다
  //   (테마 3종 × 팔레트 측정에서 dracula · one-dark … 7종이 3.9 ~ 4.5 였다)
  let p = lightenTo(p0, surface, 5.5); p = lightenTo(p, mix(bg, '#ffffff', 0.11), 5); p = lightenTo(p, '#111111', 5);
  // hover 는 두 자리에 동시에 쓰인다 (95-template-accent · 99-dark-fixes, 대비 테스트 실측):
  //   ① 버튼 그라데이션 끝 — 그 위에 #111 글자 → 너무 진하면 안 된다
  //   ② deep(= hover 에 검정 22%) — 흰 카드 위 글자 → 너무 밝으면 안 된다
  // 둘 다 4.6 이 되는 섞는 양 중 0.15 에 가장 가까운 것
  //   ③ 테마(basic · bloom)가 소제목 · 혜택 값 글자로 쓴다 — 카드 · 영역 바탕 · 알약(primary-light) 위
  //      (테마 3종 × 팔레트 실측: one-dark 의 혜택 값이 3.3)
  const darkBgs = [surface, mix(bg, '#ffffff', 0.11), mix(p, bg, 0.84)];
  //   (② 흰 카드 위 진한 글자는 99-dark-fixes 의 --nv-dark-ink 가 따로 맡는다 — hover 를 그 기준으로 고르면
  //    ③ 과 동시에 맞출 수 없는 팔레트가 있었다)
  const ok = (t) => { const h = mix(p, '#000000', t); return contrast('#111111', h) >= 4.6
    && darkBgs.every((b) => contrast(h, b) >= 4.6)
    && contrast(mix(h, '#000000', 0.42), '#ffffff') >= 4.6; };   // ② --nv-dark-ink (hover 58% · 검정 42%)
  const ts = Array.from({ length: 301 }, (_, i) => i / 500).filter(ok).sort((a, b) => Math.abs(a - 0.15) - Math.abs(b - 0.15));
  if (!ts.length) throw new Error(slug + ': hover 를 고를 수 없다');
  const hover = mix(p, '#000000', ts[0]);
  const main = mix('#ffffff', p, 0.04), muted = mix(bg, '#ffffff', 0.64), lighter = mix(bg, '#ffffff', 0.47);
  // ★ 2차색도 글자로 쓰인다 — basic 의 소제목, bloom 의 혜택 값(primary-light 알약 위). 어두운 바탕 둘 다에서 4.6
  const pLight = mix(p, bg, 0.84);
  acc = lightenTo(lightenTo(acc, mix(bg, '#ffffff', 0.11), 4.6), pLight, 4.6);
  report.push([slug, p0 !== p ? `${p0}→${p}` : p, contrast(p, surface).toFixed(2), contrast('#111111', p).toFixed(2), 'muted ' + contrast(muted, surface).toFixed(2)]);
  return { slug, desc, dark: true, css: [
    `--ev-primary: ${p}; --ev-primary-hover: ${hover}; --ev-primary-light: ${mix(p, bg, 0.84)};`,
    `--ev-primary-glow: ${rgba(p, 0.3)};`,
    `--ev-gradient-hero: linear-gradient(135deg, ${hero[0]} 0%, ${hero[1]} 55%, ${hero[2]} 100%);`,
    `--ev-gradient-cta: linear-gradient(135deg, ${mix(p, '#ffffff', 0.18)} 0%, ${hover} 100%);`,
    `--ev-accent-tag: ${acc};`,
    `--ev-bg: ${bg}; --ev-surface: ${surface}; --ev-surface-subtle: ${mix(bg, '#ffffff', 0.11)}; --ev-border: ${mix(bg, '#ffffff', 0.2)};`,
    `--ev-text-main: ${main}; --ev-text-muted: ${muted}; --ev-text-light: ${lighter};`,
  ] };
}

const all = [...L.map(light), ...D.map(dark)];
const slugs = all.map((x) => x.slug);
if (new Set(slugs).size !== slugs.length) throw new Error('slug 중복');

const args = process.argv.slice(2);
const block = (x) => `.palette-${x.slug},\nbody:has(.palette-${x.slug}) {\n  ${x.css.join('\n  ')}\n}\n`;
const expansion =
  `/* 팔레트 확장 — registry/Palette.java 와 짝 (후보 목록: newvent-backend docs/registry-candidates.json)\n` +
  ` * ★★ 생성 파일이다 — 직접 고치지 않는다. 원본: scripts/build-palettes.mjs 의 색 명세\n` +
  ` * ★ 01 · 02 와 같은 변수 11개(어두우면 text-* 3개 더). 값은 생성기로 맞췄다 —\n` +
  ` *   밝은 팔레트: primary 는 흰 바탕 4.5 이상, hover 는 흰 글자 5.7 이상 (README 「팔레트 연결」 기준)\n` +
  ` *   어두운 팔레트: primary · hover · 2차색이 카드 · 영역 바탕 · 알약 위 4.6 이상, 버튼의 #111 글자 4.6 이상\n` +
  ` * ★ 어두운 팔레트는 99-dark-fixes 의 night 보정을 같이 받는다 (목록도 이 생성기가 맞춘다) */\n\n` +
  `/* ── 밝은 팔레트 ── */\n\n` + all.filter((x) => !x.dark).map(block).join('\n') +
  `\n/* ── 어두운 팔레트 ── */\n\n` + all.filter((x) => x.dark).map(block).join('\n');

// ── 겹침 검사 — 기존 01 · 02 의 팔레트까지 같이 본다 ──
const read = (f) => readFileSync(join(DIR, f), 'utf8').replace(/\r\n/g, '\n');
const varsOf = (css) => [...css.matchAll(/\.palette-([a-z0-9-]+),\s*body:has\(\.palette-\1\)\s*\{([^}]*)\}/g)].map((m) => {
  const v = (k) => (m[2].match(new RegExp('--ev-' + k + ':\\s*(#[0-9a-fA-F]{6})')) || [])[1];
  const hero = [...((m[2].match(/--ev-gradient-hero:[^;]*/) || [''])[0]).matchAll(/#[0-9a-fA-F]{6}/g)].map((x) => x[0]);
  return { n: m[1], p: v('primary'), a: v('accent-tag'), hero };
});
const lab = (h) => {
  const [r, g, b] = hex(h).map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  const l = Math.cbrt(0.4122214708 * r + 0.5363627495 * g + 0.0514459929 * b), M = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * M - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * M + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * M - 0.80867553 * s];
};
const de = (x, y) => { const A = lab(x), B = lab(y); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
// 화면에서 눈에 띄는 비중 — 기본색(버튼 · 강조 글자) > hero 가운데 · 끝 > 2차색
const distance = (x, y) => de(x.p, y.p) * 0.5 + de(x.hero[1], y.hero[1]) * 0.25 + de(x.hero[2], y.hero[2]) * 0.15 + de(x.a, y.a) * 0.1;
const everyone = [...varsOf(read('01-base-set.css')), ...varsOf(read('02-extra-set.css')), ...varsOf(expansion)];
const near = [];
for (let i = 0; i < everyone.length; i++) for (let j = i + 1; j < everyone.length; j++) {
  const s = distance(everyone[i], everyone[j]);
  if (s < MIN_DISTANCE) near.push(`  ${everyone[i].n} ↔ ${everyone[j].n}  ${s.toFixed(3)}  (${everyone[i].p} / ${everyone[j].p})`);
}
if (near.length) {
  console.error(`팔레트 ${near.length}쌍이 너무 비슷합니다 (거리 < ${MIN_DISTANCE}). 명세의 색을 벌리거나 하나를 뺍니다:\n` + near.join('\n'));
  process.exit(1);
}

// ── 어두운 팔레트 목록 — 95 · 99 와 템플릿 대비 보정(40-templates/09)의 :is(.palette-night, …) 를 이 명세에 맞춘다 ──
// ★ 09 를 빠뜨렸을 때 어두운 확장 22종에서 템플릿 유의사항 · 단계 설명이 흰 카드 위 밝은 글자가 됐다 (대비 2.0 — template-contrast 테스트)
const darkNames = all.filter((x) => x.dark).map((x) => '.palette-' + x.slug).join(', ');
const withDarkList = (css) => css.replace(/:is\(\.palette-night(, \.palette-esports)?(?:, \.palette-[a-z0-9-]+)*\)/g,
  (_, esports) => `:is(.palette-night${esports ?? ''}, ${darkNames})`);
const files = { '03-expansion.css': expansion };
for (const f of ['95-template-accent.css', '99-dark-fixes.css', '../40-templates/09-default-contrast.css']) files[f] = withDarkList(read(f));

if (args.includes('--java')) {
  const constName = (s) => s.toUpperCase().replace(/-/g, '_');
  console.log(all.map((x) => `    ${constName(x.slug)}("palette-${x.slug}", "${x.desc}", false, ${x.dark}),`).join('\n'));
} else if (args.includes('--check')) {
  const stale = Object.entries(files).filter(([f, css]) => { try { return read(f) !== css; } catch { return true; } }).map(([f]) => f);
  if (stale.length) { console.error('팔레트 CSS 가 명세와 다릅니다: ' + stale.join(', ') + ' — node scripts/build-palettes.mjs 를 실행하세요'); process.exit(1); }
  console.log(`팔레트 최신 상태 (확장 ${all.length}종: 밝음 ${L.length} · 어두움 ${D.length}, 겹침 없음)`);
} else {
  for (const [f, css] of Object.entries(files)) writeFileSync(join(DIR, f), css, 'utf8');
  if (args.includes('--report')) console.table(report);
  console.log(`팔레트를 다시 만들었습니다 (확장 ${all.length}종: 밝음 ${L.length} · 어두움 ${D.length}, 겹침 없음). 이어서 npm run css`);
}
