import { app, Menu, nativeImage, Tray } from 'electron';
import { join } from 'node:path';
import { trayMenuTemplate } from './menu-templates';

// The window's close button only hides it, so this icon is how the window comes back and how the app quits.
export function createTray(show: () => void, quit: () => void): Tray {
  const tray = new Tray(nativeImage.createFromPath(join(app.getAppPath(), 'assets', 'tray.png')));
  tray.setToolTip('IdleManager');
  tray.setContextMenu(Menu.buildFromTemplate(trayMenuTemplate({ show, quit })));
  tray.on('click', show);
  return tray;
}
