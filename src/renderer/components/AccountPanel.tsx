import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { canOptimize } from '../../core/optimize';
import { isScreenHidden } from '../../core/policies';
import { EVENTS_IN_PANEL } from '../../shared/constants';
import { formatNumber, formatTime, optimizeText, statusColor, statusText } from '../../shared/format';
import type { AccountId, AccountView, AppView } from '../../shared/types';
import { CollapsePanelIcon, FocusIcon, HomeIcon, MoreIcon, MuteIcon, NextIcon, OptimizeIcon, PopIcon, PowerIcon, ReloadIcon, SoundIcon } from './Icons';
import { Sparkline } from './Sparkline';

interface AccountPanelProps {
  view: AppView;
  renamingId: string | null;
  onRenameDone: () => void;
  onConfigureOptimize: (id: AccountId) => void;
}

const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

function RenameField({ account, accounts, onDone }: { account: AccountView; accounts: readonly AccountView[]; onDone: () => void }) {
  const [name, setName] = useState(account.name);
  const [duplicate, setDuplicate] = useState(false);

  // Leaving the account (another one gets selected) ends the rename too.
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => () => done.current(), []);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') return;
    const taken = accounts.some(
      (other) => other.id !== account.id && other.gameId === account.gameId && sameName(other.name, trimmed),
    );
    if (taken) {
      setDuplicate(true);
      return;
    }
    window.idleManager.send({ type: 'rename-account', accountId: account.id, name: trimmed });
    onDone();
  };

  const cancelOnEscape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onDone();
  };

  return (
    <form className="rename" onSubmit={submit} onKeyDown={cancelOnEscape}>
      <input
        aria-label="Nome da conta"
        autoFocus
        maxLength={40}
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setDuplicate(false);
        }}
        onFocus={(event) => event.target.select()}
      />
      {duplicate && <span className="err">Já existe uma conta com esse nome</span>}
    </form>
  );
}

export function AccountPanel({ view, renamingId, onRenameDone, onConfigureOptimize }: AccountPanelProps) {
  const { selectedId, layout } = view.preferences;
  const account = view.accounts.find((candidate) => candidate.id === selectedId) ?? view.accounts[0];
  const stableDone = useCallback(onRenameDone, [onRenameDone]);

  if (account === undefined) return <div className="panel-empty">Nenhuma conta</div>;

  const send = window.idleManager.send;
  const id = account.id;
  const hasPage = !isScreenHidden({ status: account.status, detached: false });

  const sameGame = view.accounts.filter((other) => other.gameId === account.gameId);
  const next = sameGame[(sameGame.findIndex((other) => other.id === id) + 1) % sameGame.length];
  const memory = account.memoryMb.at(-1);
  const cpu = account.cpu.at(-1);

  return (
    <>
      <div className="phead">
        <span className="av xl" style={{ background: account.color.background, color: account.color.foreground }}>
          {account.initials}
          <i style={{ background: statusColor(account.status) }} />
        </span>
        <span className="stack">
          {renamingId === id ? <RenameField account={account} accounts={view.accounts} onDone={stableDone} /> : <b>{account.name}</b>}
          <span className="sub" style={{ fontSize: 12 }}>{statusText(account, view.now)}</span>
        </span>
        <button
          className="ib"
          type="button"
          aria-label="Próxima conta"
          onClick={() => next !== undefined && send({ type: 'select', accountId: next.id })}
        >
          <NextIcon />
        </button>
        <button
          className="ib"
          type="button"
          aria-label="Recolher painel da conta"
          onClick={() => send({ type: 'toggle-panel' })}
        >
          <CollapsePanelIcon />
        </button>
      </div>

      <div className="acts acts4">
        <button className="act" type="button" disabled={!hasPage} onClick={() => send({ type: 'go-home', accountId: id })}>
          <HomeIcon />Início
        </button>
        <button className="act" type="button" disabled={!hasPage} onClick={() => send({ type: 'reload', accountId: id })}>
          <ReloadIcon />Recarregar
        </button>
        <button className="act" type="button" aria-pressed={account.muted} onClick={() => send({ type: 'toggle-sound', accountId: id })}>
          {account.muted ? <MuteIcon /> : <SoundIcon />}
          {account.muted ? 'Mudo' : 'Som'}
        </button>
        <button
          className="act"
          type="button"
          disabled={!hasPage && !account.detached}
          onClick={() => send({ type: account.detached ? 'reattach' : 'detach', accountId: id })}
        >
          <PopIcon />{account.detached ? 'Trazer' : 'Destacar'}
        </button>
      </div>

      <div className="sec">
        <span className="lab">CONSUMO NOS ÚLTIMOS 1 MIN</span>
        <div className="kv"><span>Memória</span><b>{memory === undefined ? '—' : `${formatNumber(memory)} MB`}</b></div>
        <Sparkline values={account.memoryMb} color="var(--mem)" />
        <div className="kv"><span>CPU</span><b>{cpu === undefined ? '—' : `${formatNumber(cpu, 1)}%`}</b></div>
        <Sparkline values={account.cpu} color="var(--cpu)" ceiling={1.5} />
        <div className="opt">
          {/* "6 h" must not break across two lines. */}
          <span>{optimizeText(account, view.now).replace(/(\d+) h\b/, '$1\u00a0h')}</span>
          <button className="link" type="button" onClick={() => onConfigureOptimize(id)}>Configurar</button>
        </div>
      </div>

      <div className="sec hist">
        <span className="lab">HISTÓRICO DESTA CONTA</span>
        {account.history.length === 0 ? (
          <span style={{ color: 'var(--fg-2)' }}>Nada por enquanto.</span>
        ) : (
          account.history.slice(0, EVENTS_IN_PANEL).map((event) => (
            <div className="row" key={event.id}>
              <span style={{ color: 'var(--cpu)' }}>●</span>
              {event.text}
              <em>{formatTime(event.at)}</em>
            </div>
          ))
        )}
      </div>

      <div className="acts acts4 bottom">
        <button className="act" type="button" aria-pressed={layout === 'focus'} onClick={() => send({ type: 'toggle-focus', accountId: id })}>
          <FocusIcon />Foco
        </button>
        <button
          className="act"
          type="button"
          disabled={!canOptimize(account.status)}
          onClick={() => send({ type: 'optimize', accountId: id })}
        >
          <OptimizeIcon />Otimizar
        </button>
        <button
          className="act"
          type="button"
          onClick={() => send({ type: account.status === 'off' ? 'enable' : 'disable', accountId: id })}
        >
          <PowerIcon />{account.status === 'off' ? 'Ligar' : 'Desligar'}
        </button>
        <button className="act" type="button" onClick={() => send({ type: 'open-account-menu', accountId: id })}>
          <MoreIcon />Mais
        </button>
      </div>
    </>
  );
}
