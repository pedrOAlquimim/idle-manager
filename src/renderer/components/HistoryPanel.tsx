import { formatTime } from '../../shared/format';
import type { AppView } from '../../shared/types';
import { BackIcon } from './Icons';

const GLOBAL_EVENTS = 50;

export function HistoryPanel({ view, onBack }: { view: AppView; onBack: () => void }) {
  const events = view.accounts
    .flatMap((account) => account.history.map((event) => ({ event, name: account.name, color: account.color.accent })))
    .sort((a, b) => b.event.at - a.event.at || b.event.id - a.event.id)
    .slice(0, GLOBAL_EVENTS);

  return (
    <>
      <div className="phead">
        <button className="ib" type="button" aria-label="Voltar" onClick={onBack}><BackIcon /></button>
        <b>Histórico</b>
      </div>
      <div className="sec hist">
        {events.length === 0 ? (
          <span style={{ color: 'var(--fg-2)' }}>Nada por enquanto.</span>
        ) : (
          events.map(({ event, name, color }) => (
            <div className="row" key={`${event.accountId}-${event.id}`}>
              <span style={{ color }}>●</span>
              <span className="who">{name}</span>
              {event.text}
              <em>{formatTime(event.at)}</em>
            </div>
          ))
        )}
      </div>
    </>
  );
}
