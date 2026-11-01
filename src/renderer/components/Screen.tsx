import type { MouseEvent, RefCallback } from 'react';
import { isScreenHidden } from '../../core/policies';
import { formatNumber, statusColor, statusText } from '../../shared/format';
import type { Command } from '../../shared/ipc';
import type { AccountView } from '../../shared/types';
import { ExpandIcon, LockIcon } from './Icons';

interface ScreenProps {
  account: AccountView;
  gameName: string;
  selected: boolean;
  now: number;
  gameArea: RefCallback<HTMLElement>;
}

interface Overlay {
  label: string;
  action: string;
  command: Command;
}

// A hidden view leaves the area of the game free, so this is the one place HTML may show over it.
function overlayFor(account: AccountView): Overlay | null {
  if (!isScreenHidden(account)) return null;
  const accountId = account.id;
  if (account.detached) {
    return { label: 'Destacada em janela', action: 'Trazer de volta', command: { type: 'reattach', accountId } };
  }
  switch (account.status) {
    case 'off':
      return { label: 'Conta desligada', action: 'Ligar', command: { type: 'enable', accountId } };
    case 'down':
      return { label: account.message ?? 'Não voltou', action: 'Tentar de novo', command: { type: 'retry', accountId } };
    case 'blocked':
      return { label: account.message ?? '5º nick bloqueado', action: 'Voltar ao login', command: { type: 'back-to-login', accountId } };
    default:
      return null;
  }
}

export function Screen({ account, gameName, selected, now, gameArea }: ScreenProps) {
  const overlay = overlayFor(account);
  const memory = account.memoryMb.at(-1);

  const expand = (event: MouseEvent): void => {
    event.stopPropagation();
    window.idleManager.send({ type: 'toggle-focus', accountId: account.id });
  };

  return (
    <article
      className={selected ? 'tile sel' : 'tile'}
      data-account={account.id}
      onClick={() => window.idleManager.send({ type: 'select', accountId: account.id })}
    >
      <header className="th">
        <span className="dot pulse" style={{ background: statusColor(account.status) }} />
        <b>{account.name}</b>
        <span className="st">{statusText(account, now)}</span>
        <span className="mem">{memory === undefined ? '—' : `${formatNumber(memory)} MB`}</span>
        <button className="ib" type="button" aria-label={`Expandir ${account.name}`} onClick={expand}>
          <ExpandIcon />
        </button>
      </header>
      <div className="addr">
        <LockIcon />
        <span>{account.host}</span>
        <span className="part">{account.partition}</span>
      </div>
      <div className="game" ref={gameArea}>
        <span className="t" style={{ color: account.color.accent }}>{gameName}</span>
        <div className="skel">
          <div />
          <div style={{ width: '72%' }} />
          <div style={{ width: '46%' }} />
        </div>
        {overlay !== null && (
          <div className="offlay">
            <span>{overlay.label}</span>
            <button type="button" onClick={() => window.idleManager.send(overlay.command)}>{overlay.action}</button>
          </div>
        )}
      </div>
    </article>
  );
}
