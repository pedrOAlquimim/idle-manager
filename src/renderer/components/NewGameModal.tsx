import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { GAME_NAME_EXAMPLE, GAME_URL_EXAMPLE } from '../../games/examples';
import type { NewGameError } from '../../shared/types';
import { Modal } from './Modal';

type Field = 'game' | 'url' | 'account';

function explain(error: NewGameError): { field: Field; message: string | null } {
  switch (error) {
    case 'empty-game-name':
      return { field: 'game', message: null };
    case 'duplicate-game-name':
      return { field: 'game', message: 'Já existe um grupo com esse nome' };
    case 'invalid-url':
      return { field: 'url', message: `Esse endereço não parece uma URL. Exemplo: ${GAME_URL_EXAMPLE}` };
    case 'not-a-site':
      return { field: 'url', message: 'Use um endereço de site, começando com https://' };
    case 'duplicate-site':
      return { field: 'url', message: 'Já existe um grupo para esse site' };
    case 'empty-account-name':
      return { field: 'account', message: null };
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}

export function NewGameModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [accountName, setAccountName] = useState('Principal');
  const [error, setError] = useState<NewGameError | null>(null);
  const fields = {
    game: useRef<HTMLInputElement>(null),
    url: useRef<HTMLInputElement>(null),
    account: useRef<HTMLInputElement>(null),
  };

  const problem = error === null ? null : explain(error);
  const invalid = problem?.field;

  useEffect(() => {
    if (invalid !== undefined) fields[invalid].current?.focus();
  }, [error]);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const refused = await window.idleManager.createGame({ name, url, accountName });
    if (refused === null) onClose();
    else setError(refused);
  };

  return (
    <Modal title="Novo grupo de jogo" onClose={onClose}>
      <form noValidate onSubmit={(event) => void submit(event)}>
        <div className="mbody">
          <p>Um grupo reúne as contas de um mesmo jogo. Cada conta abre numa tela própria, com login separado.</p>
          <div className="field">
            <label htmlFor="game-name">Nome do jogo</label>
            <input
              id="game-name"
              ref={fields.game}
              type="text"
              autoComplete="off"
              maxLength={24}
              placeholder={`Ex.: ${GAME_NAME_EXAMPLE}`}
              aria-invalid={invalid === 'game'}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
            />
            {invalid === 'game' && problem?.message != null && <span className="err">{problem.message}</span>}
          </div>
          <div className="field">
            <label htmlFor="game-url">URL do jogo</label>
            <input
              id="game-url"
              ref={fields.url}
              type="url"
              autoComplete="off"
              placeholder={GAME_URL_EXAMPLE}
              aria-invalid={invalid === 'url'}
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                setError(null);
              }}
            />
            {invalid === 'url' && problem?.message != null ? (
              <span className="err">{problem.message}</span>
            ) : (
              <span className="hint">Cole o endereço que você abre no navegador para jogar.</span>
            )}
          </div>
          <div className="field">
            <label htmlFor="first-account">Nome da primeira conta</label>
            <input
              id="first-account"
              ref={fields.account}
              type="text"
              autoComplete="off"
              maxLength={24}
              placeholder="Ex.: Principal"
              aria-invalid={invalid === 'account'}
              value={accountName}
              onChange={(event) => {
                setAccountName(event.target.value);
                setError(null);
              }}
            />
          </div>
        </div>
        <div className="mfoot">
          <button className="btn ghost" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn primary" type="submit">Criar grupo</button>
        </div>
      </form>
    </Modal>
  );
}
