import type { ReactNode } from 'react';
import { formatNumber } from '../../shared/format';
import type { AppView, Layout } from '../../shared/types';
import type { ActivePanel } from '../App';
import { FocusIcon, GearIcon, GridIcon, HistoryIcon, RowIcon } from './Icons';

interface StatusBarProps {
  view: AppView;
  activePanel: ActivePanel;
  onOpenPanel: (panel: ActivePanel) => void;
}

const LAYOUTS: readonly { layout: Layout; label: string; icon: ReactNode }[] = [
  { layout: 'grid', label: 'Grade 2×2', icon: <GridIcon /> },
  { layout: 'focus', label: 'Uma tela (foco)', icon: <FocusIcon /> },
  { layout: 'row', label: 'Lado a lado em linha', icon: <RowIcon /> },
];

function attentionText(count: number): string {
  if (count === 0) return 'Tudo certo';
  return count === 1 ? '1 conta precisa de você' : `${count} contas precisam de você`;
}

export function StatusBar({ view, activePanel, onOpenPanel }: StatusBarProps) {
  const percentOfRam = Math.round(view.ramFraction * 100);
  return (
    <footer className="status">
      <span className="ok">
        <i style={{ background: view.attentionCount === 0 ? 'var(--on)' : 'var(--xp)' }} />
        {attentionText(view.attentionCount)}
      </span>
      <div className="seg" role="group" aria-label="Disposição das telas">
        {LAYOUTS.map(({ layout, label, icon }) => (
          <button
            key={layout}
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={view.preferences.layout === layout}
            onClick={() => window.idleManager.send({ type: 'set-layout', layout })}
          >
            {icon}
          </button>
        ))}
      </div>
      <div className="right">
        <span>
          IdleManager <b>{formatNumber(view.totalMemoryMb)} MB</b> · {formatNumber(view.totalCpu, 1)}% CPU
          <span className="bar" title={`${percentOfRam}% da memória do PC`}>
            <span style={{ width: `${percentOfRam}%` }} />
          </span>
        </span>
        <button className="ib" type="button" aria-label="Histórico" aria-pressed={activePanel === 'history'} onClick={() => onOpenPanel('history')}>
          <HistoryIcon />
        </button>
        <span className="ver">v{view.version}</span>
        <button className="ib" type="button" aria-label="Configurações" aria-pressed={activePanel === 'settings'} onClick={() => onOpenPanel('settings')}>
          <GearIcon />
        </button>
      </div>
    </footer>
  );
}
