import { gridShape } from '../../core/policies';
import type { AppView, GameId } from '../../shared/types';
import { useMeasureScreens } from '../hooks/useMeasureScreens';
import { ExpandSidebarIcon } from './Icons';
import { Screen } from './Screen';

interface ScreenGridProps {
  view: AppView;
  onNewGame: () => void;
  onAddAccount: (game: GameId) => void;
}

export function ScreenGrid({ view, onNewGame, onAddAccount }: ScreenGridProps) {
  const gameArea = useMeasureScreens();
  const { layout, selectedId, sidebarOpen } = view.preferences;

  const selected = view.accounts.find((account) => account.id === selectedId) ?? view.accounts[0];
  const group = view.groups.find((candidate) => candidate.gameId === selected?.gameId) ?? view.groups[0];
  const accounts = view.accounts.filter((account) => account.gameId === group?.gameId);
  const screens = layout === 'focus' ? accounts.filter((account) => account.id === selected?.id) : accounts;

  const { columns, rows } = gridShape(screens.length, layout);

  return (
    <main className="main">
      {!sidebarOpen && (
        <button className="show-side" type="button" onClick={() => window.idleManager.send({ type: 'toggle-sidebar' })}>
          <ExpandSidebarIcon /> Mostrar contas
        </button>
      )}
      {screens.length === 0 ? (
        <div className="empty">
          <p>{group === undefined ? 'Crie seu primeiro grupo' : 'Adicione sua primeira conta'}</p>
          {group === undefined ? (
            <button type="button" onClick={onNewGame}>Novo grupo de jogo</button>
          ) : (
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
