import { useEffect, useState } from 'react';

export function useMobile() {
  const [isMobile, setIsMobile] = useState(true); // Default to true for initial state

  useEffect(() => {
    const checkMobile = () => {
      const ua = navigator.userAgent.toLowerCase();
      const isMobileUA = /iphone|ipad|ipod|android|blackberry|windows phone|opera mini|silk/i.test(ua);
      const isMobileScreen = window.innerWidth <= 768;
      const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      const isMobilePlatform = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.platform);

      console.log('[useMobile] Device detection:', {
        userAgent: ua,
        isMobileUA,
        isMobileScreen,
        isTouchDevice,
        isMobilePlatform,
        maxTouchPoints: navigator.maxTouchPoints,
        platform: navigator.platform
      });

      setIsMobile(isMobileUA || isMobilePlatform || (isTouchDevice && isMobileScreen));
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

// Alias for backward compatibility
export const useIsMobile = useMobile;