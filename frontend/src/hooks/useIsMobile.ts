import { useEffect, useState } from "react";

const DEFAULT_BREAKPOINT = 768;

/**
 * Hook to detect if the current viewport is mobile-sized.
 * Uses MediaQuery API for efficient reactive updates.
 *
 * @param breakpoint - The max-width breakpoint in pixels (default: 768)
 * @returns boolean - true if viewport is below breakpoint
 */
export function useIsMobile(breakpoint: number = DEFAULT_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    setIsMobile(mq.matches);

    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);

    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);

  return isMobile;
}
