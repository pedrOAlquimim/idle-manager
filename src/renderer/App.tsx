import { useEffect, useState } from 'react';
import type { GameId } from '../shared/types';
import { ScreenGrid } from './components/ScreenGrid';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { useAppView } from './hooks/useAppView';

export type ActivePanel = 'account' | 'history' | 'settings';

export function App() {
  const view = useAppView();
  const [, setActivePanel] = useState<ActivePanel>('account');
  const [addingTo, setAddingTo] = useState<GameId | null>(null);

  useEffect(() => {
    // The main process decides: it knows the current layout, this page may be a moment behind.
    const leaveFocusOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') window.idleManager.send({ type: 'leave-focus' });
    };
    window.addEventListener('keydown', leaveFocusOnEscape);
    return () => window.removeEventListener('keydown', leaveFocusOnEscape);
  }, []);

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
        <aside className="panel" aria-label="Detalhes da conta" />
      </div>
      <StatusBar view={view} onOpenPanel={setActivePanel} />
    </div>
  );
}
