
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
  const [isMobile, setIsMobile] = React.useState(true) // Default to true for initial state

  React.useEffect(() => {
    const checkMobile = () => {
      console.log('[useMobile] Starting mobile detection');
      // User agent detection
      const ua = navigator.userAgent.toLowerCase()
      const isMobileUA = /iphone|ipad|ipod|android|blackberry|windows phone|opera mini|silk/i.test(ua)
      
      // Screen size detection
      const isMobileScreen = window.innerWidth <= MOBILE_BREAKPOINT
      
      // Touch capability detection
      const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0)
      
      // Platform detection
      const isMobilePlatform = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.platform)
      
      console.log('[useMobile] Enhanced detection:', {
        userAgent: ua,
        isMobileUA,
        isMobileScreen,
        isTouchDevice,
        isMobilePlatform,
        maxTouchPoints: navigator.maxTouchPoints,
        platform: navigator.platform
      })
      
      // Combine all checks
      const isDeviceMobile = isMobileUA || isMobilePlatform || (isTouchDevice && isMobileScreen)
      setIsMobile(isDeviceMobile)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  return isMobile
}
