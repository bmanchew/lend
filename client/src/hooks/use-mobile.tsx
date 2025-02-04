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

    // Enhanced device information for logging
    const deviceInfo = {
      userAgent: navigator.userAgent.toLowerCase(),
      platform: navigator.platform,
      vendor: navigator.vendor,
      dimensions: {
        screen: {
          width: window.screen.width,
          height: window.screen.height,
          orientation: window.screen.orientation?.type || 'unknown'
        },
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      },
      touch: {
        maxTouchPoints: navigator.maxTouchPoints,
        hasTouch: 'ontouchstart' in window,
        hasFinePointer: window.matchMedia('(pointer: fine)').matches,
        hasCoarsePointer: window.matchMedia('(pointer: coarse)').matches,
        hasHover: window.matchMedia('(hover: hover)').matches
      },
      hardware: {
        memory: (navigator as any).deviceMemory,
        cores: navigator.hardwareConcurrency,
        connection: (navigator as any).connection?.effectiveType || 'unknown'
      }
    };

    // Enhanced mobile detection criteria with weighted scoring
    const mobileIndicators = {
      // Primary indicators (most reliable)
      userAgent: /iphone|ipad|ipod|android|blackberry|windows phone|opera mini|silk/i.test(deviceInfo.userAgent),
      platform: /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(deviceInfo.platform),

      // Secondary indicators
      touch: {
        hasTouch: deviceInfo.touch.hasTouch,
        noFinePointer: !deviceInfo.touch.hasFinePointer,
        hasCoarsePointer: deviceInfo.touch.hasCoarsePointer,
        noHover: !deviceInfo.touch.hasHover
      },

      // Supplementary indicators
      screen: {
        isNarrow: window.innerWidth <= 768,
        isPortrait: window.innerHeight > window.innerWidth,
        hasHighDensity: window.devicePixelRatio > 1
      }
    };

    // Calculate mobile score (0-100)
    const weights = {
      userAgent: 40,
      platform: 30,
      touch: 20,
      screen: 10
    };

    let mobileScore = 0;
    if (mobileIndicators.userAgent) mobileScore += weights.userAgent;
    if (mobileIndicators.platform) mobileScore += weights.platform;

    // Touch score (up to 20)
    const touchScore = (
      (mobileIndicators.touch.hasTouch ? 5 : 0) +
      (mobileIndicators.touch.noFinePointer ? 5 : 0) +
      (mobileIndicators.touch.hasCoarsePointer ? 5 : 0) +
      (mobileIndicators.touch.noHover ? 5 : 0)
    );
    mobileScore += touchScore;

    // Screen score (up to 10)
    const screenScore = (
      (mobileIndicators.screen.isNarrow ? 4 : 0) +
      (mobileIndicators.screen.isPortrait ? 3 : 0) +
      (mobileIndicators.screen.hasHighDensity ? 3 : 0)
    );
    mobileScore += screenScore;

    const isMobileDevice = mobileScore >= 60; // Threshold for mobile classification

    // Log detailed detection info
    console.log('[useMobile] Device detection:', {
      ...deviceInfo,
      indicators: mobileIndicators,
      scores: {
        total: mobileScore,
        touch: touchScore,
        screen: screenScore
      },
      result: isMobileDevice
    });

    return isMobileDevice;
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const wasMobile = isMobile;
      const nowMobile = detectMobile();

      if (wasMobile !== nowMobile) {
        console.log('[useMobile] Device type changed:', {
          from: wasMobile ? 'mobile' : 'desktop',
          to: nowMobile ? 'mobile' : 'desktop',
          timestamp: new Date().toISOString(),
          screen: {
            width: window.innerWidth,
            height: window.innerHeight,
            orientation: window.screen.orientation?.type
          }
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