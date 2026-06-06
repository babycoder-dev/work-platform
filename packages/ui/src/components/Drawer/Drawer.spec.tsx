import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Drawer } from './Drawer';

describe('Drawer', () => {
  it('renders narrow drawer and closes via button, scrim and Escape', async () => {
    const onClose = vi.fn();
    render(
      <Drawer onClose={onClose} open title="抽屉" width="narrow">
        内容
      </Drawer>,
    );

    expect(screen.getByRole('dialog')).toHaveClass('work-drawer--narrow');
    await userEvent.click(screen.getByRole('button', { name: '关闭' }));
    await userEvent.click(document.querySelector('.work-scrim') as HTMLElement);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('does not render when closed', () => {
    render(
      <Drawer onClose={() => undefined} open={false} title="抽屉">
        内容
      </Drawer>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
