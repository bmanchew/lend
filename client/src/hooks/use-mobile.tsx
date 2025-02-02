import { useEffect, useState } from 'react';

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const ua = navigator.userAgent;
      setIsMobile(
        /Mobile|Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)
      );
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}


export function useMobile() {
  const [isMobile, setIsMobile] = useState(true) // Default to true for initial state

  useEffect(() => {
    const checkMobile = () => {
      console.log('[useMobile] Starting mobile detection');
      // User agent detection
      const ua = navigator.userAgent.toLowerCase()
      const isMobileUA = /iphone|ipad|ipod|android|blackberry|windows phone|opera mini|silk/i.test(ua)
      
      // Screen size detection
      const isMobileScreen = window.innerWidth <= 768
      
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