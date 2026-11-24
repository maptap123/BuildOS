'use client'

import { useEffect, useState } from 'react'

interface KeyboardViewport {
  /** Null until mounted, preserving identical server/client initial markup. */
  viewportHeight: number | null
  /** Layout-viewport area below the visible viewport, including the keyboard. */
  keyboardHeight: number
}

/** Track the visible mobile viewport without blurring inputs or changing globals. */
export function useKeyboardViewport(): KeyboardViewport {
  const [viewport, setViewport] = useState<KeyboardViewport>({ viewportHeight: null, keyboardHeight: 0 })

  useEffect(() => {
    const visualViewport = window.visualViewport
    const mobilePointer = window.matchMedia('(pointer: coarse)')
    function update() {
      // Landscape phones can be wider than the desktop breakpoint. Pointer type,
      // not width, keeps this enabled there while leaving desktop zoom unchanged.
      const visibleHeight = mobilePointer.matches ? (visualViewport?.height ?? window.innerHeight) : window.innerHeight
      const inset = mobilePointer.matches && visualViewport
        ? Math.max(0, window.innerHeight - visualViewport.height - visualViewport.offsetTop)
        : 0
      setViewport(previous => previous.viewportHeight === visibleHeight && previous.keyboardHeight === inset
        ? previous : { viewportHeight: visibleHeight, keyboardHeight: inset })
    }
    visualViewport?.addEventListener('resize', update)
    visualViewport?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    mobilePointer.addEventListener('change', update)
    update()
    return () => {
      visualViewport?.removeEventListener('resize', update)
      visualViewport?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      mobilePointer.removeEventListener('change', update)
    }
  }, [])

  return viewport
}
