import { useEffect, useState } from 'react';

export function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on); on();
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}
