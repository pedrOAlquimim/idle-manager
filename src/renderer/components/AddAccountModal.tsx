import { useState } from 'react';
import type { FormEvent } from 'react';
import type { AccountView, GroupView } from '../../shared/types';
import { Modal } from './Modal';

interface AddAccountModalProps {
  group: GroupView;
  accounts: readonly AccountView[];
  onClose: () => void;
}

type Problem = 'empty' | 'duplicate';

export function AddAccountModal({ group, accounts, onClose }: AddAccountModalProps) {
  const [name, setName] = useState(group.suggestedName);
  const [problem, setProblem] = useState<Problem | null>(null);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') {
      setProblem('empty');
      return;
    }
    const taken = accounts.some(
      (account) => account.gameId === group.gameId && account.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (taken) {
      setProblem('duplicate');
      return;
    }
    window.idleManager.send({ type: 'add-account', gameId: group.gameId, name: trimmed });
    onClose();
  };

  return (
    <Modal title="Adicionar conta" onClose={onClose}>
      <form noValidate onSubmit={submit}>
        <div className="mbody">
          <p>A conta entra no grupo {group.name} e abre {group.host} com login separado.</p>
          <div className="field">
            <label htmlFor="account-name">Nome da conta</label>
            <input
              id="account-name"
              type="text"
              autoComplete="off"
              maxLength={24}
              placeholder="Ex.: Principal"
              aria-invalid={problem !== null}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setProblem(null);
              }}
            />
            {problem === 'duplicate' && <span className="err">Já existe uma conta com esse nome</span>}
          </div>
        </div>
        <div className="mfoot">
          <button className="btn ghost" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn primary" type="submit">Adicionar conta</button>
        </div>
      </form>
    </Modal>
  );
}
