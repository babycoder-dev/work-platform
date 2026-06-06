import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Menu } from './Menu';

describe('Menu', () => {
  it('fires selected key and respects disabled item', async () => {
    const onSelect = vi.fn();
    render(
      <Menu
        items={[
          { key: 'profile', label: '个人信息' },
          { key: 'settings', label: '设置', disabled: true },
        ]}
        onSelect={onSelect}
      />,
    );

    await userEvent.click(screen.getByRole('menuitem', { name: '个人信息' }));
    await userEvent.click(screen.getByRole('menuitem', { name: '设置' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('profile');
  });
});
