import { useEffect, useRef } from 'react';
import type { KeyboardEvent, MouseEvent, ReactNode, SyntheticEvent } from 'react';
import { CloseIcon } from './Icons';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

// Game views sit above any HTML of the window, so the main process hides them while a modal is open.
export function Modal({ title, onClose, children }: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    window.idleManager.send({ type: 'set-modal-open', open: true });
    dialog.current?.showModal();
    // Set here because a dialog that is not open yet cannot take the focus, so autoFocus would miss it.
    const firstField = dialog.current?.querySelector('input');
    firstField?.focus();
    firstField?.select();
    return () => window.idleManager.send({ type: 'set-modal-open', open: false });
  }, []);

  const closeOnCancel = (event: SyntheticEvent): void => {
    event.preventDefault();
    onClose();
  };
  // The form fills the dialog, so a click that lands on the dialog itself is a click on its backdrop.
  const closeOnBackdrop = (event: MouseEvent): void => {
    if (event.target === event.currentTarget) onClose();
  };
  // Esc belongs to the modal: it must not reach the window, where it would leave the focus layout.
  const keepEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') event.stopPropagation();
  };

  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="modal-title"
      onCancel={closeOnCancel}
      onClick={closeOnBackdrop}
      onKeyDown={keepEscape}
    >
      <div className="mhead">
        <h2 id="modal-title">{title}</h2>
        <button className="ib" type="button" aria-label="Fechar" onClick={onClose}><CloseIcon /></button>
      </div>
      {children}
    </dialog>
  );
}
