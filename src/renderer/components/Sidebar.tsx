import { useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { formatNumber, statusColor } from '../../shared/format';
import type { AccountView, AppView, GameId, GroupView } from '../../shared/types';
import { CollapseIcon, DownIcon, GridIcon, MoreIcon, PlusIcon } from './Icons';

interface SidebarProps {
  view: AppView;
  addingTo: GameId | null;
  onAddAccount: (game: GameId | null) => void;
}

const isAtLimit = (group: GroupView): boolean => group.limit !== null && group.accountIds.length >= group.limit;

function AddAccountForm({ group, accounts, onClose }: { group: GroupView; accounts: readonly AccountView[]; onClose: () => void }) {
  const [name, setName] = useState(group.suggestedName);
  const [duplicate, setDuplicate] = useState(false);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') return;
    const taken = accounts.some(
      (account) => account.gameId === group.gameId && account.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (taken) {
      setDuplicate(true);
      return;
    }
    window.idleManager.send({ type: 'add-account', gameId: group.gameId, name: trimmed });
    onClose();
  };

  const cancelOnEscape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onClose();
  };

  return (
    <form className="add-form" onSubmit={submit} onKeyDown={cancelOnEscape}>
      <label>
        Nome da conta
        <input
          autoFocus
          maxLength={40}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setDuplicate(false);
          }}
          onFocus={(event) => event.target.select()}
        />
      </label>
      {duplicate && <p className="err">Já existe uma conta com esse nome</p>}
      <div className="row">
        <button type="submit">Criar</button>
        <button type="button" onClick={onClose}>Cancelar</button>
      </div>
    </form>
  );
}

function AccountRow({ account, selected }: { account: AccountView; selected: boolean }) {
  const memory = account.memoryMb.at(-1);
  return (
    <button
      className="acc"
      type="button"
      aria-pressed={selected}
      onClick={() => window.idleManager.send({ type: 'select', accountId: account.id })}
    >
      <span className="av" style={{ background: account.color.background, color: account.color.foreground }}>
        {account.initials}
        <i style={{ background: statusColor(account.status) }} />
      </span>
      <span className="n">{account.name}</span>
      <span className="sub">{memory === undefined ? '—' : `${formatNumber(memory)} MB`}</span>
    </button>
  );
}

export function Sidebar({ view, addingTo, onAddAccount }: SidebarProps) {
  const enabled = view.accounts.filter((account) => account.status !== 'off').length;
  const memory = view.groups.reduce((total, group) => total + group.memoryMb, 0);
  const firstGroup = view.groups[0];
  const formGroup = view.groups.find((group) => group.gameId === addingTo);

  return (
    <nav className="side" aria-label="Contas">
      <div className="brand">
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <span className="logo">IM</span>
          <b>IdleManager</b>
        </span>
        <button
          className="ib"
          type="button"
          aria-label="Recolher barra lateral"
          onClick={() => window.idleManager.send({ type: 'toggle-sidebar' })}
        >
          <CollapseIcon />
        </button>
      </div>

      <div className="profile">
        <span className="av lg" style={{ background: '#3b3466', color: '#d6ccff' }}><GridIcon /></span>
        <span className="stack">
          <b style={{ fontSize: 14 }}>Todas as contas</b>
          <span className="sub">{enabled} de {view.accounts.length} ligadas · {formatNumber(memory)} MB</span>
        </span>
      </div>

      {view.groups.map((group) => (
        <section className="group" key={group.gameId}>
          <div className="ghead">
            <span style={{ color: 'var(--muted)', display: 'flex' }}><DownIcon /></span>
            <span className="gdot" />
            <span className="stack">
              <b>{group.name}</b>
              <span className="sub">{group.enabledCount} ligadas · {formatNumber(group.memoryMb)} MB</span>
            </span>
            <button
              className="ib"
              type="button"
              aria-label="Adicionar conta ao grupo"
              disabled={isAtLimit(group)}
              onClick={() => onAddAccount(group.gameId)}
            >
              <PlusIcon />
            </button>
            <button
              className="ib"
              type="button"
              aria-label="Opções do grupo"
              onClick={() => window.idleManager.send({ type: 'open-group-menu', gameId: group.gameId })}
            >
              <MoreIcon />
            </button>
          </div>
          <div className="accounts">
            {view.accounts
              .filter((account) => account.gameId === group.gameId)
              .map((account) => (
                <AccountRow key={account.id} account={account} selected={account.id === view.preferences.selectedId} />
              ))}
          </div>
        </section>
      ))}

      {formGroup !== undefined && !isAtLimit(formGroup) ? (
        <AddAccountForm
          key={`${formGroup.gameId}-${formGroup.suggestedName}`}
          group={formGroup}
          accounts={view.accounts}
          onClose={() => onAddAccount(null)}
        />
      ) : (
        firstGroup !== undefined && (
          <button className="add" type="button" disabled={isAtLimit(firstGroup)} onClick={() => onAddAccount(firstGroup.gameId)}>
            {isAtLimit(firstGroup) ? (
              `Limite de ${firstGroup.limit} contas do ${firstGroup.name}`
            ) : (
              <>
                <PlusIcon /> Adicionar conta
              </>
            )}
          </button>
        )
      )}
    </nav>
  );
}
