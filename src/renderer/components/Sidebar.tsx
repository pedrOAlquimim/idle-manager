import { formatNumber, statusColor } from '../../shared/format';
import type { AccountView, AppView, GameId, GroupView } from '../../shared/types';
import onigiri from '../onigiri.png';
import { CollapseIcon, DownIcon, GridIcon, MoreIcon, PlusIcon } from './Icons';

interface SidebarProps {
  view: AppView;
  onNewGame: () => void;
  onAddAccount: (game: GameId) => void;
}

const isAtLimit = (group: GroupView): boolean => group.limit !== null && group.accountIds.length >= group.limit;

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

export function Sidebar({ view, onNewGame, onAddAccount }: SidebarProps) {
  const enabled = view.accounts.filter((account) => account.status !== 'off').length;
  const memory = view.groups.reduce((total, group) => total + group.memoryMb, 0);
  const selected = view.accounts.find((account) => account.id === view.preferences.selectedId) ?? view.accounts[0];
  const activeGame = selected?.gameId ?? view.groups[0]?.gameId;

  return (
    <nav className="side" aria-label="Contas">
      <div className="brand">
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <img className="logo" src={onigiri} alt="" />
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
        <section className={group.gameId === activeGame ? 'group' : 'group inactive'} key={group.gameId}>
          <div className="ghead">
            <span style={{ color: 'var(--muted)', display: 'flex' }}><DownIcon /></span>
            <span className="gdot" style={{ background: group.dot }} />
            <span className="stack">
              <b>{group.name}</b>
              <span className="sub">{group.enabledCount} ligadas · {formatNumber(group.memoryMb)} MB</span>
            </span>
            <button
              className="ib"
              type="button"
              aria-label="Adicionar conta ao grupo"
              title={isAtLimit(group) ? `Limite de ${group.limit} contas do ${group.name}` : undefined}
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

      <button className="add" type="button" onClick={onNewGame}>
        <PlusIcon /> Novo grupo de jogo
      </button>
    </nav>
  );
}
