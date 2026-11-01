import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { MeasuredScreen } from '../../shared/ipc';
import type { AccountId } from '../../shared/types';

type ElementRef = (element: HTMLElement | null) => void;

// The game pages are native views laid over the window, so the main process has to be told where each
// `.game` area is. The observer catches a change of size. The measure after every render catches what
// it cannot see: removing an account moves the next area without changing its size.
// An unchanged measurement is not sent again.
export function useMeasureScreens(): (id: AccountId) => ElementRef {
  const elements = useRef(new Map<AccountId, HTMLElement>());
  const references = useRef(new Map<AccountId, ElementRef>());
  const observer = useRef<ResizeObserver | null>(null);
  const lastSent = useRef('');

  const measure = useCallback(() => {
    const screens: MeasuredScreen[] = [...elements.current].map(([accountId, element]) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      const rect = { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
      return { accountId, rect };
    });
    const serialized = JSON.stringify(screens);
    if (serialized === lastSent.current) return;
    lastSent.current = serialized;
    window.idleManager.send({ type: 'screens', screens });
  }, []);

  useEffect(() => {
    const watcher = new ResizeObserver(measure);
    observer.current = watcher;
    for (const element of elements.current.values()) watcher.observe(element);
    return () => {
      watcher.disconnect();
      observer.current = null;
    };
  }, [measure]);

  useLayoutEffect(measure);

  return useCallback((id) => {
    const known = references.current.get(id);
    if (known !== undefined) return known;
    const reference: ElementRef = (element) => {
      const previous = elements.current.get(id);
      if (previous !== undefined) observer.current?.unobserve(previous);
      if (element === null) {
        elements.current.delete(id);
      } else {
        elements.current.set(id, element);
        observer.current?.observe(element);
      }
    };
    references.current.set(id, reference);
    return reference;
  }, []);
}
