import { useEffect, useState, useCallback } from 'react';

export function useMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    // Default to desktop on server-side
    if (typeof window === 'undefined') return false;

    // Initial check based on user agent and platform
    const ua = navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod|android|blackberry|windows phone|opera mini|silk/i.test(ua);
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

    // Simplified mobile detection
    const isMobileDevice = /mobile|android|ios|iphone|ipad|ipod/.test(deviceInfo.userAgent);
    const isSmallScreen = window.innerWidth <= 768;

    const isMobile = isMobileDevice || isSmallScreen;

    // Log detailed detection info
    console.log('[useMobile] Device detection:', {
      ...deviceInfo,
      isMobileDevice,
      isSmallScreen,
      isMobile
    });

    return isMobile;
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const wasMobile = isMobile;
      const nowMobile = detectMobile();

      if (wasMobile !== nowMobile) {
        console.log('[useMobile] Device type changed:', {
          from: wasMobile ? 'mobile' : 'desktop',
          to: nowMobile ? 'mobile' : 'desktop',
          width: window.innerWidth,
          platform: navigator.platform,
          userAgent: navigator.userAgent
        });
        setIsMobile(nowMobile);
      }
    };

    // Initial detection
    handleResize();

    // Add resize and orientation change listeners
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