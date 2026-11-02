import { useCallback, useEffect, useState } from 'react';
import type { GameId } from '../shared/types';
import { AccountPanel } from './components/AccountPanel';
import { AddAccountModal } from './components/AddAccountModal';
import { HistoryPanel } from './components/HistoryPanel';
import { NewGameModal } from './components/NewGameModal';
import { ScreenGrid } from './components/ScreenGrid';
import { SettingsPanel } from './components/SettingsPanel';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { useAppView } from './hooks/useAppView';

export type ActivePanel = 'account' | 'history' | 'settings';

type OpenModal = { kind: 'new-game' } | { kind: 'add-account'; gameId: GameId };

export function App() {
  const view = useAppView();
  const [activePanel, setActivePanel] = useState<ActivePanel>('account');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const stopRenaming = useCallback(() => setRenamingId(null), []);
  const [modal, setModal] = useState<OpenModal | null>(null);

  useEffect(() => {
    // The main process decides: it knows the current layout, this page may be a moment behind.
    const leaveFocusOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') window.idleManager.send({ type: 'leave-focus' });
    };
    window.addEventListener('keydown', leaveFocusOnEscape);
    return () => window.removeEventListener('keydown', leaveFocusOnEscape);
  }, []);

  // The native account menu asks for a rename: show the account, then its field.
  useEffect(
    () =>
      window.idleManager.onRenameRequest((id) => {
        window.idleManager.send({ type: 'select', accountId: id });
        setActivePanel('account');
        setRenamingId(id);
      }),
    [],
  );

  if (view === null) return <div className="app" />;

  const openNewGame = (): void => setModal({ kind: 'new-game' });
  const openAddAccount = (gameId: GameId): void => setModal({ kind: 'add-account', gameId });
  const closeModal = (): void => setModal(null);
  const addingTo = modal?.kind === 'add-account' ? view.groups.find((group) => group.gameId === modal.gameId) : undefined;

  return (
    <div className="app">
      <div className="body">
        {view.preferences.sidebarOpen && <Sidebar view={view} onNewGame={openNewGame} onAddAccount={openAddAccount} />}
        <ScreenGrid view={view} onNewGame={openNewGame} onAddAccount={openAddAccount} />
        {view.preferences.panelOpen && (
          <aside className="panel" aria-label="Detalhes da conta">
            {activePanel === 'history' && <HistoryPanel view={view} onBack={() => setActivePanel('account')} />}
            {activePanel === 'settings' && <SettingsPanel view={view} onBack={() => setActivePanel('account')} />}
            {activePanel === 'account' && <AccountPanel view={view} renamingId={renamingId} onRenameDone={stopRenaming} />}
          </aside>
        )}
      </div>
      <StatusBar
        view={view}
        activePanel={activePanel}
        onOpenPanel={(panel) => {
          // With the panel closed the button opens it on that panel, instead of toggling back to the account.
          if (!view.preferences.panelOpen) {
            window.idleManager.send({ type: 'toggle-panel' });
            setActivePanel(panel);
          } else {
            setActivePanel((current) => (current === panel ? 'account' : panel));
          }
        }}
      />
      {modal?.kind === 'new-game' && <NewGameModal onClose={closeModal} />}
      {addingTo !== undefined && <AddAccountModal group={addingTo} accounts={view.accounts} onClose={closeModal} />}
    </div>
  );
}
