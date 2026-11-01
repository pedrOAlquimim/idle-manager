import { BaseWindow } from 'electron';
import type { WebContentsView } from 'electron';

const DETACHED_WIDTH = 1100;
const DETACHED_HEIGHT = 700;

// Moves the account's own view, page and all, into a window of its own: nothing reloads. The view leaves
// the window before it closes, so `onClose` can hand it back to the main window while it is still alive.
export function detachAccount(view: WebContentsView, title: string, onClose: () => void): BaseWindow {
  const window = new BaseWindow({
    width: DETACHED_WIDTH,
    height: DETACHED_HEIGHT,
    title,
    backgroundColor: '#0d111b',
  });

  const fit = (): void => {
    const { width, height } = window.getContentBounds();
    view.setBounds({ x: 0, y: 0, width, height });
  };

  window.contentView.addChildView(view);
  view.setVisible(true);
  view.webContents.setZoomFactor(1);
  fit();
  // The window manager may resize the content area after the window exists (title bar, borders) without
  // any resize event: only the content view's own bounds-changed event always reports it.
  window.contentView.on('bounds-changed', fit);
  window.on('close', () => {
    window.contentView.removeChildView(view);
    onClose();
  });
  return window;
}
