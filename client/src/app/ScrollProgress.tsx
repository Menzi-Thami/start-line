import { useEffect, useRef, useState } from 'react'

/** A quiet, non-interactive progress rail for long training plans and activity histories. */
export function ScrollProgress() {
  const rail = useRef<HTMLDivElement>(null)
  const [canReturn, setCanReturn] = useState(false)

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const available = document.documentElement.scrollHeight - window.innerHeight
      const fraction = available > 0 ? Math.min(1, Math.max(0, window.scrollY / available)) : 0
      if (rail.current) {
        rail.current.style.transform = `scaleX(${fraction})`
        rail.current.style.opacity = available > 200 ? '1' : '0'
      }
      setCanReturn(window.scrollY > 640)
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    observer?.observe(document.body)
    return () => {
      observer?.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <>
      <div className="scroll-progress" ref={rail} aria-hidden="true" />
      {canReturn && (
        <button type="button" className="back-to-top" aria-label="Back to top" onClick={() => {
          document.querySelector<HTMLButtonElement>('.wordmark-button')?.focus({ preventScroll: true })
          window.scrollTo({ top: 0, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
        }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 14 7-7 7 7M12 7v12" /></svg>
        </button>
      )}
    </>
  )
}
