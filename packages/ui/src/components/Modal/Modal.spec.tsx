import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../Button/Button';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders title, description, footer and closes on Escape/scrim', async () => {
    const onClose = vi.fn();
    render(
      <Modal description="说明" footer={<Button>保存</Button>} onClose={onClose} open title="弹窗">
        内容
      </Modal>,
    );

    expect(screen.getByRole('dialog')).toHaveTextContent('弹窗');
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(document.querySelector('.work-scrim') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('does not render when closed', () => {
    render(<Modal onClose={() => undefined} open={false} title="弹窗" />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
