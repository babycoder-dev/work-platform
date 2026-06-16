import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CurrentUserDto } from '@work/platform-contract';
import type { NotificationDto } from '@work/notification-contract';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell, LoginView, WorkbenchHome } from './App';
import type { NavigationGroup, NavigationItem } from './navigation';
import type { NotificationApiClient } from '../platform/notification-api';

const currentUser: CurrentUserDto = {
  id: 'user-001',
  account: 'admin',
  employeeNo: 'E001',
  name: '张三',
  enterpriseId: 'ent-default',
  departmentId: 'dept-001',
  departmentName: '运营部',
  roles: ['admin'],
  permissions: [{ code: 'presence:board:view', name: '看板', moduleName: 'presence' }],
  dataScopes: { profile: ['company'], presence: ['company'], report: ['self'] },
  mustChangePassword: false,
};

const navigationItems: NavigationItem[] = [
  {
    id: 'presence',
    title: '在位看板',
    path: '/presence/board',
    moduleName: 'presence',
    permissionCode: 'presence:board:view',
  },
  {
    id: 'roles',
    title: '角色管理',
    path: '/platform/roles',
    moduleName: 'platform',
    permissionCode: 'platform:role:view',
  },
];

const navigationGroups: NavigationGroup[] = [
  {
    id: 'group-work',
    title: '协作',
    moduleName: 'presence',
    items: [navigationItems[0]],
  },
  {
    id: 'group-platform',
    title: '平台管理',
    moduleName: 'platform',
    items: [navigationItems[1]],
  },
];

const notification: NotificationDto = {
  id: 'notification-001',
  recipientUserId: 'user-001',
  title: '在位状态变更',
  content: '李四更新了在位状态',
  sourceModule: 'presence',
  sourceId: 'presence-001',
  channel: 'in_app',
  createdAt: '2026-06-16T00:00:00.000Z',
};

describe('workbench shell frontend foundation', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders the restyled login and preserves submit behavior', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<LoginView isBootstrapping={false} isSubmitting={false} onSubmit={onSubmit} />);

    await userEvent.clear(screen.getByLabelText('账号'));
    await userEvent.type(screen.getByLabelText('账号'), 'alice');
    await userEvent.type(screen.getByLabelText('密码'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(onSubmit).toHaveBeenCalledWith({ account: 'alice', password: 'secret' });
  });

  it('renders grouped manifest navigation and persists sidebar collapse', async () => {
    renderShell();

    expect(screen.getByText('协作')).toBeInTheDocument();
    const mainNavigation = screen.getByRole('navigation', { name: '主导航' });
    expect(within(mainNavigation).getByRole('link', { name: /在位看板/ })).toHaveAttribute(
      'href',
      '/presence/board',
    );

    await userEvent.click(screen.getByRole('button', { name: '折叠侧栏' }));
    expect(window.localStorage.getItem('work-platform.shell.collapsed')).toBe('true');
  });

  it('supports topbar search, notification and avatar menu interactions', async () => {
    const onLogout = vi.fn();
    const notificationApi = createNotificationApi({ count: 1, items: [notification] });
    renderShell(onLogout, notificationApi);

    await userEvent.keyboard('{Control>}k{/Control}');
    expect(screen.getByText('搜索后端待接入')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '折叠侧栏' }));
    expect(screen.queryByText('搜索后端待接入')).not.toBeInTheDocument();

    await userEvent.click(screen.getByPlaceholderText(/搜索应用/));
    expect(screen.getByText('搜索后端待接入')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /通知/ }));
    expect(screen.queryByText('搜索后端待接入')).not.toBeInTheDocument();
    await screen.findAllByText('在位状态变更');
    expect(screen.getByText('李四更新了在位状态')).toBeInTheDocument();
    const notificationButton = screen
      .getAllByRole('button', { name: /在位状态变更/ })
      .find((button) => !button.hasAttribute('disabled'));
    expect(notificationButton).toBeDefined();
    await userEvent.click(notificationButton as HTMLButtonElement);
    expect(notificationApi.markRead).toHaveBeenCalledWith('notification-001');

    await userEvent.click(screen.getByRole('button', { name: '张' }));
    expect(screen.queryByText('李四更新了在位状态')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: '退出登录' }));
    expect(onLogout).toHaveBeenCalled();
  });

  it('marks all notifications read from the topbar', async () => {
    const notificationApi = createNotificationApi({ count: 2, items: [notification] });
    renderShell(vi.fn(), notificationApi);

    const notificationButton = screen.getByRole('button', { name: /通知/ });
    expect(await within(notificationButton).findByText('2')).toBeInTheDocument();
    await userEvent.click(notificationButton);
    await userEvent.click(screen.getByRole('button', { name: '全部已读' }));

    expect(notificationApi.markAllRead).toHaveBeenCalled();
  });

  it('formats large notification counts in the topbar badge', async () => {
    renderShell(vi.fn(), createNotificationApi({ count: 120, items: [] }));
    expect(await screen.findByText('99+')).toBeInTheDocument();
  });

  it('closes topbar search with Escape', async () => {
    renderShell();

    await userEvent.keyboard('{Control>}k{/Control}');
    expect(screen.getByText('搜索后端待接入')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('搜索后端待接入')).not.toBeInTheDocument();
  });

  it('renders home from real user/menu data and leaves unavailable data empty', () => {
    render(
      <MemoryRouter>
        <WorkbenchHome currentUser={currentUser} navigationItems={navigationItems} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/张三/)).toBeInTheDocument();
    expect(screen.getByText(/运营部/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /在位看板/ })).toHaveAttribute('href', '/presence/board');
    expect(screen.getAllByText(/数据待接入/).length).toBeGreaterThan(0);

    const home = screen.getByText('待处理事项').closest('section')?.parentElement;
    expect(home).toBeTruthy();
    expect(within(home as HTMLElement).queryByText('12')).not.toBeInTheDocument();
    expect(within(home as HTMLElement).queryByText('9')).not.toBeInTheDocument();
    expect(within(home as HTMLElement).queryByText('5')).not.toBeInTheDocument();
    expect(within(home as HTMLElement).queryByText('231')).not.toBeInTheDocument();
  });

  it('renders workbench notification statistic and latest messages from notification state', () => {
    render(
      <MemoryRouter>
        <WorkbenchHome
          currentUser={currentUser}
          navigationItems={navigationItems}
          notifications={{ unreadCount: 3, recent: [notification] }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('未读消息')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('最新消息')).toBeInTheDocument();
    expect(screen.getByText('在位状态变更')).toBeInTheDocument();
  });
});

function renderShell(onLogout = vi.fn(), notificationApi = createNotificationApi()) {
  return render(
    <MemoryRouter>
      <AppShell
        currentUser={currentUser}
        navigationGroups={navigationGroups}
        navigationItems={navigationItems}
        notificationApi={notificationApi}
        onLogout={onLogout}
        permissionCodes={['presence:board:view']}
      />
    </MemoryRouter>,
  );
}

function createNotificationApi({
  count = 0,
  items = [],
}: {
  count?: number;
  items?: NotificationDto[];
} = {}) {
  return {
    listNotifications: vi.fn().mockResolvedValue({ items, total: items.length }),
    unreadCount: vi.fn().mockResolvedValue({ count }),
    markRead: vi.fn().mockResolvedValue({}),
    markAllRead: vi.fn().mockResolvedValue({ count }),
    stream: vi.fn().mockImplementation((options) => {
      options.onOpen?.();
      return { close: vi.fn() };
    }),
  } as unknown as NotificationApiClient & {
    listNotifications: ReturnType<typeof vi.fn>;
    unreadCount: ReturnType<typeof vi.fn>;
    markRead: ReturnType<typeof vi.fn>;
    markAllRead: ReturnType<typeof vi.fn>;
    stream: ReturnType<typeof vi.fn>;
  };
}
