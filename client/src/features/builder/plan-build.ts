import { ApiError } from '../../lib/api-client'

/** Covers generation, the story and saving an edited plan, including a stalled token request. */
export const PLAN_BUILD_TIMEOUT_MS = 30_000

export async function withPlanBuildDeadline<T>(parent: AbortSignal, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let cancel: () => void = () => {}
  const stopped = new Promise<never>((_, reject) => {
    cancel = () => {
      controller.abort(parent.reason)
      reject(parent.reason ?? new DOMException('Plan opening cancelled', 'AbortError'))
    }
    if (parent.aborted) { cancel(); return }
    parent.addEventListener('abort', cancel, { once: true })
    timer = setTimeout(() => {
      const error = new ApiError('Your plan is taking longer than expected. Your answers are still here. Check your saved plan before trying an update again.', 0, {}, 'plan_build_timeout')
      controller.abort(error)
      reject(error)
    }, PLAN_BUILD_TIMEOUT_MS)
  })
  try {
    return await Promise.race([stopped, Promise.resolve().then(() => {
      controller.signal.throwIfAborted()
      return work(controller.signal)
    })])
  } finally {
    controller.abort()
    clearTimeout(timer)
    parent.removeEventListener('abort', cancel)
  }
}
