import { useLayoutEffect, useRef, useState } from 'react'

/** On tall phones, reserve a separate action row below the scrollable question. */
export function useQuestionFrame(step: number, gate: string | null) {
  const formRef = useRef<HTMLFormElement>(null)
  const [frameHeight, setFrameHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    const form = formRef.current
    if (!form) return
    const measure = () => {
      const viewport = window.visualViewport
      const height = viewport?.height ?? window.innerHeight
      const bottom = height + (viewport?.offsetTop ?? 0)
      const dock = document.querySelector('.tab-bar')?.getBoundingClientRect()
      const dockSpace = dock ? Math.max(0, bottom - dock.top) : 0
      const available = Math.floor(bottom - Math.max(viewport?.offsetTop ?? 0, form.getBoundingClientRect().top) - dockSpace - 12)
      // Short landscape screens and the software keyboard use normal page scrolling.
      const next = window.innerWidth < 768 && height >= 560 && available >= 320 ? available : null
      setFrameHeight(previous => previous === next ? previous : next)
    }
    measure()
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    resize?.observe(form.closest('.wizard')!)
    const header = document.querySelector('.masthead')
    if (header) resize?.observe(header)
    const dock = document.querySelector('.tab-bar')
    if (dock) resize?.observe(dock)
    const visibility = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(measure, { threshold: [0, .25, .5, .75, 1] })
    visibility?.observe(form)
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    return () => {
      resize?.disconnect()
      visibility?.disconnect()
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
    }
  }, [step, gate])

  return { formRef, frameHeight }
}
