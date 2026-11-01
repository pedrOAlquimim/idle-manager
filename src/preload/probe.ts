import { ipcRenderer } from 'electron';
import { adapterFor } from '../games/adapter';
import { PROBE_INTERVAL_MS } from '../shared/constants';
import { CHANNELS } from '../shared/ipc';

// Read-only probe: it watches the page and reports to the main process. It exposes nothing to the page.
const GAME_ARGUMENT = '--idlemanager-game=';

const gameArgument = process.argv.find((argument) => argument.startsWith(GAME_ARGUMENT));
const adapter = adapterFor(gameArgument === undefined ? '' : gameArgument.slice(GAME_ARGUMENT.length));

function sendReading(): void {
  try {
    ipcRenderer.send(CHANNELS.probeReading, adapter.read(document, localStorage));
  } catch {
    // Between documents, or storage is blocked: no reading this round. The supervisor treats silence.
  }
}

setInterval(sendReading, PROBE_INTERVAL_MS);

// Escape leaves the focused view only if nothing in the game wanted it. Two details keep that honest:
// `escapeIsFree` is read in the capture phase, before the game reacts (a modal that closes on Escape
// would otherwise already look closed), and whether a handler consumed the key is checked only after
// every handler has run.
window.addEventListener(
  'keydown',
  (event) => {
    if (event.key !== 'Escape' || !adapter.escapeIsFree(document)) return;
    setTimeout(() => {
      if (!event.defaultPrevented) ipcRenderer.send(CHANNELS.probeEscape);
    }, 0);
  },
  true,
);
