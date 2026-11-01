import { app, BaseWindow, WebContentsView } from 'electron';

// Temporary skeleton, replaced by the account manager in Task 7.
const START_URL = 'https://pokeidle.io/app';

function openWindow(): void {
  const window = new BaseWindow({ width: 1280, height: 800, title: 'IdleManager' });
  const view = new WebContentsView({
    webPreferences: {
      partition: 'persist:pokeidle-test',
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  const fit = (): void => {
    const { width, height } = window.getContentBounds();
    view.setBounds({ x: 0, y: 0, width, height });
  };

  window.contentView.addChildView(view);
  window.on('resize', fit);
  fit();
  view.webContents.loadURL(START_URL).catch((error: unknown) => console.error(error));
}

void app.whenReady().then(openWindow);
app.on('window-all-closed', () => app.quit());
