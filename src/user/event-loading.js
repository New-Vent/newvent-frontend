/** 실패한 상세 조회는 화면을 다시 그려도 자동 재시도하지 않는다. */
export function ensureServerEvent(state, id, load, rerender) {
  if (!id) return
  const key = String(id)
  if (state.serverEventId === key && ['loading', 'done', 'error'].includes(state.serverEventState)) return
  state.serverEventId = key
  state.serverEventState = 'loading'
  state.serverEventError = null
  state.serverEvent = null
  load(id).then(
    (event) => {
      if (state.serverEventId !== key) return
      state.serverEvent = event
      state.serverEventState = 'done'
      rerender()
    },
    (error) => {
      if (state.serverEventId !== key) return
      state.serverEventError = error?.message || '이벤트를 불러오지 못했어요.'
      state.serverEventState = 'error'
      rerender()
    },
  )
}

export function isUpcomingEvent(event, now = Date.now()) {
  return !!event?.startDate && new Date(event.startDate).getTime() > now
}
