import { useEffect, useState } from 'react';
import type { AppView } from '../../shared/types';

export function useAppView(): AppView | null {
  const [view, setView] = useState<AppView | null>(null);

  useEffect(() => {
    let mounted = true;
    void window.idleManager.requestView().then((first) => {
      if (mounted) setView((current) => current ?? first);
    });
    const stop = window.idleManager.onChange(setView);
    return () => {
      mounted = false;
      stop();
    };
  }, []);

  return view;
}
