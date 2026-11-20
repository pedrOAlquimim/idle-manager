import { useState } from 'react';
import type { FormEvent } from 'react';
import { parseOptimizeHours } from '../../core/optimize';
import { OPTIMIZE_PRESETS_HOURS } from '../../shared/constants';
import type { AccountView } from '../../shared/types';
import { Modal } from './Modal';

const DEFAULT_PRESET = 6;
const isPreset = (hours: number): boolean => (OPTIMIZE_PRESETS_HOURS as readonly number[]).includes(hours);

export function OptimizeModal({ account, onClose }: { account: AccountView; onClose: () => void }) {
  const saved = account.autoOptimizeHours;
  const [enabled, setEnabled] = useState(saved !== null);
  const [preset, setPreset] = useState<number | null>(saved === null ? DEFAULT_PRESET : isPreset(saved) ? saved : null);
  const [custom, setCustom] = useState(saved !== null && !isPreset(saved) ? String(saved) : '');
  const [invalid, setInvalid] = useState(false);

  const send = (scope: 'account' | 'group'): void => {
    let hours: number | null = null;
    if (enabled) {
      hours = preset ?? parseOptimizeHours(custom);
      if (hours === null) {
        setInvalid(true);
        return;
      }
    }
    window.idleManager.send({ type: 'set-auto-optimize', accountId: account.id, hours, scope });
    onClose();
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    send('account');
  };

  return (
    <Modal title={`Otimização automática — ${account.name}`} onClose={onClose}>
      <form noValidate onSubmit={submit}>
        <div className="mbody">
          <p>Reinicia a página da conta para liberar a memória que ela acumulou. O login continua.</p>
          <label className="check">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            Otimizar sozinha
          </label>
          <div className="field">
            <span className="field-label">A cada</span>
            <div className="presets">
              {OPTIMIZE_PRESETS_HOURS.map((hours) => (
                <button
                  key={hours}
                  type="button"
                  className="preset"
                  disabled={!enabled}
                  aria-pressed={preset === hours}
                  onClick={() => {
                    setPreset(hours);
                    setCustom('');
                    setInvalid(false);
                  }}
                >
                  {hours} h
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="custom-hours">Personalizado</label>
            <span className="custom">
              <input
                id="custom-hours"
                type="text"
                inputMode="numeric"
                aria-label="Horas personalizadas"
                autoComplete="off"
                disabled={!enabled}
                aria-invalid={invalid}
                value={custom}
                onChange={(event) => {
                  setCustom(event.target.value);
                  setPreset(null);
                  setInvalid(false);
                }}
              />
              horas
            </span>
            {invalid && <span className="err">Use de 1 a 72 horas</span>}
          </div>
        </div>
        <div className="mfoot">
          <button className="btn ghost apply" type="button" onClick={() => send('group')}>Aplicar às outras contas</button>
          <button className="btn ghost" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn primary" type="submit">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}
