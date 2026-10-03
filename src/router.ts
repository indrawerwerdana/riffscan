import { useSyncExternalStore } from 'react';

const sub = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useRoute(): string {
  return useSyncExternalStore(sub, () => window.location.hash || '#/');
}

export function navigate(hash: string) {
  if (window.location.hash !== hash) window.location.hash = hash;
  window.scrollTo({ top: 0 });
}
