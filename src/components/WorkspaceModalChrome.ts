import { addMobileModalClose } from './MobileModalChrome';

/** Use the editor's in-header close control on desktop and on phones. */
export function addWorkspaceModalClose(modal: HTMLElement, header: HTMLElement, onClose: () => void): HTMLButtonElement {
    modal.classList.add('has-workspace-inline-close');
    modal.querySelectorAll(':scope > :is(.modal-header-button, .modal-close-button)').forEach(button => button.remove());
    const close = addMobileModalClose(modal, header, onClose);
    close.classList.add('lorebase-workspace-close');
    return close;
}
