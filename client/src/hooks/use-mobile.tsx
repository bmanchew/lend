
import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}

export function useMobile() {
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    const checkMobile = () => {
      const ua = navigator.userAgent
      const isSafari = /Safari/i.test(ua) && !/Chrome/i.test(ua)
      const isChrome = /Chrome/i.test(ua)
      const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(ua)
      
      console.log('[useMobile] Browser detection:', {
        userAgent: ua,
        isSafari,
        isChrome,
        isMobileDevice
      })
      
      setIsMobile(isMobileDevice)
    }
    
    checkMobile()
  }, [])

  return isMobile
}
