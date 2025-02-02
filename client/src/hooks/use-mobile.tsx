import { useEffect, useState, useCallback } from 'react';

export function useMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    // Initial check based on window width if available
    if (typeof window !== 'undefined') {
      return window.innerWidth <= 768;
    }
    return false; // Default to desktop on server-side
  });

  const detectMobile = useCallback(() => {
    if (typeof window === 'undefined') return false;

    // Detailed device information for logging
    const deviceInfo = {
      userAgent: navigator.userAgent.toLowerCase(),
      platform: navigator.platform,
      width: window.innerWidth,
      height: window.innerHeight,
      touchPoints: navigator.maxTouchPoints,
      hasTouch: 'ontouchstart' in window,
      orientation: window.screen.orientation?.type || 'unknown'
    };

    // Mobile detection criteria
    const mobileChecks = {
      userAgent: /iphone|ipad|ipod|android|blackberry|windows phone|opera mini|silk/i.test(deviceInfo.userAgent),
      screen: window.innerWidth <= 768,
      touch: deviceInfo.touchPoints > 0 || deviceInfo.hasTouch,
      platform: /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(deviceInfo.platform)
    };

    // Log detailed detection info
    console.log('[useMobile] Device detection:', {
      ...deviceInfo,
      checks: mobileChecks,
      result: Object.values(mobileChecks).some(Boolean)
    });

    return Object.values(mobileChecks).some(Boolean);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const wasMobile = isMobile;
      const nowMobile = detectMobile();

      if (wasMobile !== nowMobile) {
        console.log('[useMobile] Device type changed:', {
          from: wasMobile ? 'mobile' : 'desktop',
          to: nowMobile ? 'mobile' : 'desktop',
          width: window.innerWidth
        });
        setIsMobile(nowMobile);
      }
    };

    // Initial detection
    handleResize();

    // Add resize listener
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [detectMobile]);

  return isMobile;
}

// Alias for backward compatibility
export const useIsMobile = useMobile;