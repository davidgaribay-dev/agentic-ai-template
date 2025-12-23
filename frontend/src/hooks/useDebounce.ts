import { useEffect, useState } from "react";

/**
 * Debounces a value by the specified delay.
 *
 * Useful for search inputs to reduce API calls while typing.
 *
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default: 300ms)
 * @returns The debounced value
 *
 * @example
 * const [searchQuery, setSearchQuery] = useState("")
 * const debouncedQuery = useDebounce(searchQuery, 300)
 *
 * useEffect(() => {
 *   if (debouncedQuery) {
 *     // Perform search with debouncedQuery
 *   }
 * }, [debouncedQuery])
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
