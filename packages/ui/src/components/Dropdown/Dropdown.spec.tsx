import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../Button/Button';
import { Menu } from '../Menu/Menu';
import { Dropdown } from './Dropdown';

describe('Dropdown', () => {
  it('closes on outside click and Escape', async () => {
    render(
      <div>
        <Dropdown trigger={<Button>打开</Button>}>
          <Menu items={[{ key: 'logout', label: '退出' }]} />
        </Dropdown>
        <button type="button">外部</button>
      </div>,
    );

    await userEvent.click(screen.getByRole('button', { name: '打开' }));
    expect(screen.getByRole('menuitem', { name: '退出' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '外部' }));
    expect(screen.queryByRole('menuitem', { name: '退出' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '打开' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menuitem', { name: '退出' })).not.toBeInTheDocument();
  });

  it('supports controlled open state', async () => {
    const onOpenChange = vi.fn();
    render(
      <Dropdown open={false} onOpenChange={onOpenChange} trigger={<Button>打开</Button>}>
        <Menu items={[{ key: 'logout', label: '退出' }]} />
      </Dropdown>,
    );

    await userEvent.click(screen.getByRole('button', { name: '打开' }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('menuitem', { name: '退出' })).not.toBeInTheDocument();
  });
});
