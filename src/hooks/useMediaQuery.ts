import { useEffect, useState } from 'react';

/**
 * Reactive media-query state. Unlike reading `window.innerWidth` during
 * render, this re-renders on resize/rotation so CSS breakpoints and JS
 * behaviour stay in sync.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
