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

    // Mobile detection criteria with weighted importance
    const mobileChecks = {
      // Primary checks (most reliable)
      userAgent: /iphone|ipad|ipod|android|blackberry|windows phone|opera mini|silk/i.test(deviceInfo.userAgent),
      platform: /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(deviceInfo.platform),

      // Secondary checks (supporting evidence)
      touch: deviceInfo.touchPoints > 0 && deviceInfo.hasTouch,

      // Screen size is now a supplementary check, not primary
      screen: window.innerWidth <= 768 && !/macintosh|windows nt|linux/i.test(deviceInfo.platform)
    };

    // Log detailed detection info
    console.log('[useMobile] Device detection:', {
      ...deviceInfo,
      checks: mobileChecks,
      // Device is mobile if either userAgent or platform indicates mobile,
      // or if both touch and screen size suggest mobile
      result: mobileChecks.userAgent || mobileChecks.platform || (mobileChecks.touch && mobileChecks.screen)
    });

    return mobileChecks.userAgent || mobileChecks.platform || (mobileChecks.touch && mobileChecks.screen);
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