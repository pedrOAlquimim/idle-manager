import type { AppView } from '../../shared/types';
import { BackIcon } from './Icons';

export function SettingsPanel({ view, onBack }: { view: AppView; onBack: () => void }) {
  const enabled = view.preferences.notifications;
  return (
    <>
      <div className="phead">
        <button className="ib" type="button" aria-label="Voltar" onClick={onBack}><BackIcon /></button>
        <b>Configurações</b>
      </div>
      <div className="sec">
        <div className="setting">
          <span className="stack">
            <b>Notificações</b>
            <span className="sub">Avisos do sistema quando uma conta precisa de você.</span>
          </span>
          <button
            className={enabled ? 'toggle on' : 'toggle'}
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Notificações"
            onClick={() => window.idleManager.send({ type: 'set-notifications', enabled: !enabled })}
          />
        </div>
      </div>
      <div className="sec">
        <button className="wide" type="button" onClick={() => window.idleManager.send({ type: 'open-data-folder' })}>
          Abrir pasta de dados
        </button>
      </div>
    </>
  );
}
