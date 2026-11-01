import { useCallback, useEffect, useState } from 'react';
import type { GameId } from '../shared/types';
import { AccountPanel } from './components/AccountPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { ScreenGrid } from './components/ScreenGrid';
import { SettingsPanel } from './components/SettingsPanel';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { useAppView } from './hooks/useAppView';

export type ActivePanel = 'account' | 'history' | 'settings';

export function App() {
  const view = useAppView();
  const [activePanel, setActivePanel] = useState<ActivePanel>('account');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const stopRenaming = useCallback(() => setRenamingId(null), []);
  const [addingTo, setAddingTo] = useState<GameId | null>(null);

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

  const addAccount = (game: GameId): void => {
    if (!view.preferences.sidebarOpen) window.idleManager.send({ type: 'toggle-sidebar' });
    setAddingTo(game);
  };

  return (
    <div className="app">
      <div className="body">
        {view.preferences.sidebarOpen && <Sidebar view={view} addingTo={addingTo} onAddAccount={setAddingTo} />}
        <ScreenGrid view={view} onAddAccount={addAccount} />
        <aside className="panel" aria-label="Detalhes da conta">
          {activePanel === 'history' && <HistoryPanel view={view} onBack={() => setActivePanel('account')} />}
          {activePanel === 'settings' && <SettingsPanel view={view} onBack={() => setActivePanel('account')} />}
          {activePanel === 'account' && <AccountPanel view={view} renamingId={renamingId} onRenameDone={stopRenaming} />}
        </aside>
      </div>
      <StatusBar
        view={view}
        activePanel={activePanel}
        onOpenPanel={(panel) => setActivePanel((current) => (current === panel ? 'account' : panel))}
      />
    </div>
  );
}
