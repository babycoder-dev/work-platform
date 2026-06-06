import { Button } from '../Button/Button';
import { Modal } from '../Modal/Modal';

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确认',
  danger,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      description={description}
      footer={
        <>
          <Button onClick={onCancel}>取消</Button>
          <Button onClick={onConfirm} variant={danger ? 'danger' : 'primary'}>
            {confirmText}
          </Button>
        </>
      }
      onClose={onCancel}
      open={open}
      title={title}
    />
  );
}
