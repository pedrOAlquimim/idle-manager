import type { AppView, GameId } from '../../shared/types';
import { useMeasureScreens } from '../hooks/useMeasureScreens';
import { ExpandSidebarIcon } from './Icons';
import { Screen } from './Screen';

interface ScreenGridProps {
  view: AppView;
  onAddAccount: (game: GameId) => void;
}

export function ScreenGrid({ view, onAddAccount }: ScreenGridProps) {
  const gameArea = useMeasureScreens();
  const { layout, selectedId, sidebarOpen } = view.preferences;

  const selected = view.accounts.find((account) => account.id === selectedId) ?? view.accounts[0];
  const group = view.groups.find((candidate) => candidate.gameId === selected?.gameId) ?? view.groups[0];
  const accounts = view.accounts.filter((account) => account.gameId === group?.gameId);
  const screens = layout === 'focus' ? accounts.filter((account) => account.id === selected?.id) : accounts;

  const columns = layout === 'row' ? screens.length : layout === 'focus' ? 1 : 2;
  const rows = layout === 'grid' ? Math.ceil(screens.length / 2) : 1;

  return (
    <main className="main">
      {!sidebarOpen && (
        <button className="show-side" type="button" onClick={() => window.idleManager.send({ type: 'toggle-sidebar' })}>
          <ExpandSidebarIcon /> Mostrar contas
        </button>
      )}
      {screens.length === 0 ? (
        <div className="empty">
          <p>Adicione sua primeira conta</p>
          {group !== undefined && (
            <button type="button" onClick={() => onAddAccount(group.gameId)}>Nova conta</button>
          )}
        </div>
      ) : (
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          }}
        >
          {screens.map((account) => (
            <Screen
              key={account.id}
              account={account}
              gameName={group?.name ?? ''}
              selected={account.id === selected?.id}
              now={view.now}
              gameArea={gameArea(account.id)}
            />
          ))}
        </div>
      )}
    </main>
  );
}
