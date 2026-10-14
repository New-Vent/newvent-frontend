/**
 * RAG · LLM 호출 로그 목업.
 * VITE_API_AUTH=off(목업 모드)에서 repo.js RAG 함수들이 돌려주는 고정 응답.
 * 모양은 백엔드 ApiResponse.data 와 같게 맞춘다 (success 래퍼는 api.js 가 벗긴다).
 */

export function mockIndexStatus(eventId) {
  return {
    eventId,
    totalVersions: 3,
    indexedVersions: 2,
    pendingVersions: 1,
    chunkCount: 7,
    lastIndexedAt: '2026-10-01T01:23:45Z',
  }
}

export function mockSearchPreview(eventId, query) {
  return {
    eventId,
    query,
    topK: 3,
    results: [
      { chunkId: 101, blockKey: 'benefits', chunkIndex: 0, content: '데이터 3GB — 가입 즉시 지급', distance: 0.21 },
      { chunkId: 102, blockKey: 'hero', chunkIndex: 0, content: '여름 데이터 대방출', distance: 0.34 },
      { chunkId: 103, blockKey: 'steps', chunkIndex: 0, content: '앱에서 쿠폰함에 담으세요', distance: 0.42 },
    ],
  }
}

export function mockPromptDrafts() {
  return [
    { versionId: 7, eventTitle: '여름 데이터 대방출', blockKey: 'benefits', prompt: '데이터 3GB를 드립니다' },
    { versionId: 9, eventTitle: '가을 할인 쿠폰', blockKey: 'cta', prompt: '지금 쿠폰 받기' },
  ]
}

export function mockSimilarVersions() {
  return [
    { versionId: 5, versionNo: 2, similarity: 0.78, topChunks: [] },
    { versionId: 3, versionNo: 1, similarity: 0.61, topChunks: [] },
  ]
}

export function mockQualityTrend() {
  return [
    { weekStart: '2026-09-14', totalCalls: 12, ragUsedCalls: 5, chunkCount: 20 },
    { weekStart: '2026-09-21', totalCalls: 18, ragUsedCalls: 9, chunkCount: 25 },
    { weekStart: '2026-09-28', totalCalls: 15, ragUsedCalls: 7, chunkCount: 25 },
    { weekStart: '2026-10-05', totalCalls: 22, ragUsedCalls: 14, chunkCount: 31 },
  ]
}

export function mockReindexAllStatus(running) {
  return running
    ? { running: true, startedAt: new Date().toISOString(), finishedAt: null, lastResult: null }
    : {
        running: false,
        startedAt: null,
        finishedAt: new Date().toISOString(),
        lastResult: { totalEvents: 3, succeeded: 3, failedEvents: [], totalChunks: 15 },
      }
}

export function mockLlmCallLogs() {
  return {
    content: [
      { id: 1, eventId: 3, modelName: 'mock', provider: 'mock', callOk: true, validOk: true, inputTokens: 1200, outputTokens: 300, responseTimeMs: 1400, ragUsed: true, createdAt: '2026-10-11T10:00:00Z' },
      { id: 2, eventId: 3, modelName: 'mock', provider: 'mock', callOk: false, validOk: false, inputTokens: 800, outputTokens: null, responseTimeMs: 60000, ragUsed: false, createdAt: '2026-10-11T09:00:00Z' },
    ],
    page: 0,
    size: 10,
    totalElements: 2,
  }
}

/** id 를 받아 실패분기를 나눈다 — 목록에 없는 실패원인·청크ID가 여기 있다 */
export function mockLlmCallLog(id) {
  if (Number(id) === 2) {
    return {
      id: 2,
      eventId: 3,
      modelName: 'mock',
      callOk: false,
      validOk: false,
      failureType: 'TIMEOUT',
      failureMessage: 'Bedrock 호출이 60초 안에 끝나지 않았어요.',
      ragUsed: false,
      chunkIds: null,
      createdAt: '2026-10-11T09:00:00Z',
    }
  }
  return {
    id: 1,
    eventId: 3,
    modelName: 'mock',
    callOk: true,
    validOk: true,
    failureType: null,
    failureMessage: null,
    ragUsed: true,
    chunkIds: '101,102',
    createdAt: '2026-10-11T10:00:00Z',
  }
}
