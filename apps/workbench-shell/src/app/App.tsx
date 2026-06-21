import type { CurrentUserDto, LoginInput, MenuDto } from '@work/platform-contract';
import type { NotificationDto } from '@work/notification-contract';
import { createHttpClient } from '@work/http-client';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Dropdown,
  EmptyState,
  Icon,
  Input,
  Menu,
  StatCard,
  Toast,
  type IconName,
  type StatTone,
} from '@work/ui';
import type { ComponentType, FormEvent, LazyExoticComponent, ReactNode } from 'react';
import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BrowserRouter as Router,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { moduleRegistry } from '../module-registry/module-registry';
import {
  createNotificationApiClient,
  type NotificationApiClient,
} from '../platform/notification-api';
import { createPlatformApiClient } from '../platform/platform-api';
import { clearAccessToken, readAccessToken, saveAccessToken } from '../platform/session-storage';
import { FirstLoginWizard } from './FirstLoginWizard';
import {
  buildModuleRouteTable,
  buildNavigationGroups,
  buildNavigationItems,
  normalizePath,
  type NavigationGroup,
  type NavigationItem,
} from './navigation';
import { useNotifications, type NotificationsState } from './use-notifications';

interface ModuleRouteEntry {
  path: string;
  permission?: string;
  Lazy: LazyExoticComponent<ComponentType>;
}

const SIDEBAR_COLLAPSED_KEY = 'work-platform.shell.collapsed';

const moduleRouteTable: ModuleRouteEntry[] = buildModuleRouteTable(moduleRegistry.getModules()).map(
  (route) => ({
    path: route.path,
    permission: route.permission,
    Lazy: lazy(() => route.load().then((mod) => ({ default: mod.default as ComponentType }))),
  }),
);

interface SessionState {
  accessToken?: string;
  currentUser?: CurrentUserDto;
  menus: MenuDto[];
}

export function App() {
  const [session, setSession] = useState<SessionState>({
    accessToken: readAccessToken(),
    menus: [],
  });
  const [isBootstrapping, setIsBootstrapping] = useState(Boolean(session.accessToken));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const mustChangePasswordRef = useRef(Boolean(session.currentUser?.mustChangePassword));

  const api = useMemo(
    () =>
      createPlatformApiClient({
        getAccessToken: () => session.accessToken,
        onUnauthorized: () => {
          clearAccessToken();
          setSession({ menus: [] });
        },
      }),
    [session.accessToken],
  );

  const bootstrap = useCallback(async () => {
    if (!session.accessToken) {
      setIsBootstrapping(false);
      return;
    }

    setIsBootstrapping(true);
    try {
      const data = await api.bootstrap();
      setSession((current) => ({
        ...current,
        currentUser: data.currentUser,
        menus: data.menus,
      }));
      setErrorMessage(undefined);

      moduleRegistry.applyRuntime({
        currentUser: data.currentUser,
        createHttpClient: ({ baseUrl }) =>
          createHttpClient({
            baseUrl: new URL(baseUrl, window.location.origin).toString(),
            getAccessToken: () => readAccessToken() ?? '',
            onUnauthorized: () => {
              clearAccessToken();
              setSession({ menus: [] });
            },
          }),
      });
    } catch (error) {
      clearAccessToken();
      setSession({ menus: [] });
      setErrorMessage(readErrorMessage(error));
    } finally {
      setIsBootstrapping(false);
    }
  }, [api, session.accessToken]);

  useEffect(() => {
    mustChangePasswordRef.current = Boolean(session.currentUser?.mustChangePassword);
  }, [session.currentUser?.mustChangePassword]);

  useEffect(() => {
    if (mustChangePasswordRef.current) {
      return;
    }
    void bootstrap();
  }, [bootstrap]);

  const permissionCodes = useMemo(
    () => session.currentUser?.permissions.map((permission) => permission.code) ?? [],
    [session.currentUser],
  );
  const navigationItems = useMemo(() => buildNavigationItems(session.menus), [session.menus]);
  const navigationGroups = useMemo(() => buildNavigationGroups(session.menus), [session.menus]);

  const handleLogin = useCallback(
    async (input: LoginInput) => {
      setIsSubmitting(true);
      try {
        const login = await api.login(input);
        saveAccessToken(login.accessToken);
        setSession({
          accessToken: login.accessToken,
          currentUser: login.currentUser,
          menus: [],
        });
        setErrorMessage(undefined);
      } catch (error) {
        setErrorMessage(readErrorMessage(error));
      } finally {
        setIsSubmitting(false);
      }
    },
    [api],
  );

  const handleLogout = useCallback(() => {
    clearAccessToken();
    setSession({ menus: [] });
    setErrorMessage(undefined);
  }, []);

  const handleFirstLoginCompleted = useCallback(async () => {
    await bootstrap();
  }, [bootstrap]);

  if (!session.accessToken || !session.currentUser) {
    return (
      <LoginView
        errorMessage={errorMessage}
        isBootstrapping={isBootstrapping}
        isSubmitting={isSubmitting}
        onSubmit={handleLogin}
      />
    );
  }

  if (session.currentUser.mustChangePassword) {
    return (
      <FirstLoginWizard
        api={api}
        onCompleted={handleFirstLoginCompleted}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <Router>
      <AppShell
        currentUser={session.currentUser}
        errorMessage={errorMessage}
        navigationGroups={navigationGroups}
        navigationItems={navigationItems}
        onLogout={handleLogout}
        permissionCodes={permissionCodes}
      />
    </Router>
  );
}

export function AppShell(props: {
  currentUser: CurrentUserDto;
  navigationGroups: NavigationGroup[];
  navigationItems: NavigationItem[];
  permissionCodes: string[];
  errorMessage?: string;
  notificationApi?: NotificationApiClient;
  onLogout: () => void;
}) {
  const [isCollapsed, setIsCollapsed] = useState(
    () => window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true',
  );
  const [toast, setToast] = useState<string>();
  const location = useLocation();
  const activeNavigationItem = props.navigationItems.find(
    (item) => item.path === normalizePath(location.pathname),
  );
  const notificationApi = useMemo(
    () =>
      props.notificationApi ??
      createNotificationApiClient({
        getAccessToken: () => readAccessToken() ?? '',
        onUnauthorized: props.onLogout,
      }),
    [props.notificationApi, props.onLogout],
  );
  const notifications = useNotifications(notificationApi);

  function toggleCollapsed() {
    setIsCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  }

  function showPlaceholder(label: string) {
    setToast(`${label} 数据待接入`);
  }

  return (
    <main className={isCollapsed ? 'app-shell app-shell--collapsed' : 'app-shell'}>
      <aside className="app-shell__side">
        <div className="app-shell__brand">
          <span className="app-shell__logo">工</span>
          <strong>内网工作台</strong>
        </div>
        <nav className="app-shell__nav" aria-label="主导航">
          <section className="app-shell__nav-group">
            <NavLink
              className={({ isActive }) =>
                isActive ? 'app-shell__nav-item app-shell__nav-item--active' : 'app-shell__nav-item'
              }
              end
              to="/"
            >
              <Icon name="dashboard" />
              <span className="app-shell__nav-label">工作台</span>
            </NavLink>
          </section>
          {props.navigationGroups.length === 0
            ? null
            : buildSidebarSections(props.navigationGroups).map((group) => (
                <section className="app-shell__nav-group" key={group.id}>
                  <div className="app-shell__nav-title">{group.title}</div>
                  {group.items.map((item) => (
                    <NavLink
                      className={({ isActive }) =>
                        isActive
                          ? 'app-shell__nav-item app-shell__nav-item--active'
                          : 'app-shell__nav-item'
                      }
                      end
                      key={item.path}
                      to={item.path}
                    >
                      <ModuleIcon moduleName={item.moduleName} title={item.title} />
                      <span className="app-shell__nav-label">{item.title}</span>
                      {isMessagingModule(item.moduleName) && notifications.unreadCount > 0 ? (
                        <Badge count={formatUnreadCount(notifications.unreadCount)} />
                      ) : null}
                    </NavLink>
                  ))}
                </section>
              ))}
        </nav>
        <div className="app-shell__user">
          <Avatar name={props.currentUser.name} />
          <div>
            <strong>{props.currentUser.name}</strong>
            <span>{resolveUserSubtitle(props.currentUser)}</span>
          </div>
        </div>
      </aside>
      <section className="app-shell__main">
        <Topbar
          activeTitle={activeNavigationItem?.title ?? '概览'}
          currentUser={props.currentUser}
          notifications={notifications}
          onLogout={props.onLogout}
          onPlaceholder={showPlaceholder}
          onToggleCollapsed={toggleCollapsed}
        />
        {props.errorMessage ? <div className="app-shell__error">{props.errorMessage}</div> : null}
        <div className="app-shell__content">
          <RouteErrorBoundary>
            <Suspense fallback={<ShellState description="正在加载模块页面。" title="加载中" />}>
              <Routes>
                <Route
                  element={
                    <WorkbenchHome
                      currentUser={props.currentUser}
                      navigationItems={props.navigationItems}
                      notifications={notifications}
                    />
                  }
                  index
                />
                {moduleRouteTable.map((entry) => (
                  <Route
                    element={
                      <RequirePermission
                        permission={entry.permission}
                        permissionCodes={props.permissionCodes}
                      >
                        <entry.Lazy />
                      </RequirePermission>
                    }
                    key={entry.path}
                    path={entry.path}
                  />
                ))}
                <Route
                  element={<UnknownPathView navigationItems={props.navigationItems} />}
                  path="*"
                />
              </Routes>
            </Suspense>
          </RouteErrorBoundary>
        </div>
      </section>
      {toast ? (
        <Toast durationMs={1800} message={toast} onClose={() => setToast(undefined)} />
      ) : null}
    </main>
  );
}

function Topbar(props: {
  activeTitle: string;
  currentUser: CurrentUserDto;
  notifications: Pick<NotificationsState, 'unreadCount' | 'recent' | 'markAllRead' | 'markRead'>;
  onLogout: () => void;
  onPlaceholder: (label: string) => void;
  onToggleCollapsed: () => void;
}) {
  const [activePopover, setActivePopover] = useState<'search' | 'notifications' | 'profile'>();
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isSearchOpen = activePopover === 'search';
  const navigate = useNavigate();

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setActivePopover('search');
        searchInputRef.current?.focus();
      }
      if (event.key === 'Escape') {
        setActivePopover(undefined);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    if (!isSearchOpen) {
      return undefined;
    }
    function handlePointer(event: MouseEvent) {
      if (!searchRef.current?.contains(event.target as Node)) {
        setActivePopover(undefined);
      }
    }
    document.addEventListener('mousedown', handlePointer);
    return () => document.removeEventListener('mousedown', handlePointer);
  }, [isSearchOpen]);

  function handleSearchKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter') {
      event.preventDefault();
    }
    if (event.key === 'Escape') {
      setActivePopover(undefined);
    }
  }

  return (
    <header className="app-topbar">
      <Button
        aria-label="折叠侧栏"
        className="app-topbar__icon-button"
        onClick={props.onToggleCollapsed}
      >
        <Icon name="menu" />
      </Button>
      <div className="app-topbar__crumb">
        工作台 <span>/</span> <b>{props.activeTitle}</b>
      </div>
      <div className="app-topbar__grow" />
      <div className="app-topbar__search" ref={searchRef}>
        <Input
          aria-haspopup="dialog"
          onChange={(event) => setSearchQuery(event.target.value)}
          onFocus={() => setActivePopover('search')}
          onKeyDown={handleSearchKey}
          placeholder="搜索应用、文档、成员"
          prefix={<Icon name="search" />}
          ref={searchInputRef}
          value={searchQuery}
        />
        {isSearchOpen ? (
          <div className="app-topbar__search-pop" role="dialog">
            <EmptyState
              title="搜索后端待接入"
              description="全局搜索 API 将在 M7 接入，当前仅保留交互壳。"
            />
          </div>
        ) : null}
      </div>
      <Button
        aria-label="帮助"
        className="app-topbar__icon-button"
        onClick={() => props.onPlaceholder('帮助中心')}
      >
        <Icon name="help" />
      </Button>
      <Dropdown
        onOpenChange={(open) => setActivePopover(open ? 'notifications' : undefined)}
        open={activePopover === 'notifications'}
        trigger={
          <Button aria-label="通知" className="app-topbar__icon-button">
            <Icon name="bell" />
            {props.notifications.unreadCount > 0 ? (
              <Badge count={formatUnreadCount(props.notifications.unreadCount)} />
            ) : null}
          </Button>
        }
      >
        <div className="app-topbar__popover">
          <div className="app-topbar__popover-head">
            <h3>通知</h3>
            <Button
              disabled={props.notifications.unreadCount === 0}
              onClick={() => void props.notifications.markAllRead().catch(() => undefined)}
            >
              全部已读
            </Button>
          </div>
          {props.notifications.recent.length === 0 ? (
            <EmptyState title="暂无通知" description="有新通知时会在这里显示。" />
          ) : (
            <NotificationList
              notifications={props.notifications.recent}
              onSelect={(notification) => {
                void props.notifications
                  .markRead(notification)
                  .then(() => {
                    const target = resolveNotificationTarget(notification);
                    if (target) {
                      navigate(target);
                      setActivePopover(undefined);
                    }
                  })
                  .catch(() => undefined);
              }}
            />
          )}
        </div>
      </Dropdown>
      <Dropdown
        onOpenChange={(open) => setActivePopover(open ? 'profile' : undefined)}
        open={activePopover === 'profile'}
        trigger={
          <button className="app-topbar__avatar-button" type="button">
            <Avatar name={props.currentUser.name} />
          </button>
        }
      >
        <div className="app-topbar__profile">
          <div className="app-topbar__profile-head">
            <Avatar name={props.currentUser.name} size="lg" />
            <div>
              <strong>{props.currentUser.name}</strong>
              <span>{props.currentUser.departmentName ?? '默认组织'}</span>
            </div>
          </div>
          <Menu
            items={[
              { key: 'profile', label: '个人信息（待接入）', disabled: true },
              { key: 'presence', label: '设置在位状态（待接入）', disabled: true },
              { key: 'preference', label: '偏好设置（待接入）', disabled: true },
              { key: 'logout', label: '退出登录' },
            ]}
            onSelect={(key) => {
              if (key === 'logout') {
                props.onLogout();
              } else {
                props.onPlaceholder(key);
              }
            }}
          />
        </div>
      </Dropdown>
    </header>
  );
}

function NotificationList({
  compact,
  notifications,
  onSelect,
}: {
  compact?: boolean;
  notifications: NotificationDto[];
  onSelect?: (notification: NotificationDto) => void;
}) {
  return (
    <ul className={compact ? 'notification-list notification-list--compact' : 'notification-list'}>
      {notifications.map((notification) => (
        <li
          className={
            notification.readAt
              ? 'notification-list__item'
              : 'notification-list__item notification-list__item--unread'
          }
          key={notification.id}
        >
          <button disabled={!onSelect} onClick={() => onSelect?.(notification)} type="button">
            <span className="notification-list__title">
              {!notification.readAt ? (
                <span aria-label="未读" className="notification-list__dot" />
              ) : null}
              {notification.title}
            </span>
            {!compact ? (
              <span className="notification-list__content">{notification.content}</span>
            ) : null}
            <time dateTime={notification.createdAt}>
              {formatNotificationTime(notification.createdAt)}
            </time>
          </button>
        </li>
      ))}
    </ul>
  );
}

function RequirePermission(props: {
  permission?: string;
  permissionCodes: string[];
  children: ReactNode;
}) {
  if (props.permission && !props.permissionCodes.includes(props.permission)) {
    return <ShellState description="当前账号没有访问该模块页面的权限。" title="无权访问" />;
  }

  return <>{props.children}</>;
}

function UnknownPathView(props: { navigationItems: NavigationItem[] }) {
  const location = useLocation();
  const path = normalizePath(location.pathname);
  const navigationItem = props.navigationItems.find((item) => item.path === path);
  if (navigationItem) {
    return (
      <ShellState
        description={`${navigationItem.title} 已由平台菜单授权，但当前 Shell 尚未接入对应页面。`}
        title="页面待接入"
      />
    );
  }

  return <ShellState description={`未找到路径 ${path} 对应的页面。`} title="页面不存在" />;
}

class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: Error | undefined }> {
  state = { error: undefined as Error | undefined };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <ShellState description={readErrorMessage(this.state.error)} title="页面加载失败" />;
    }

    return this.props.children;
  }
}

export function LoginView(props: {
  errorMessage?: string;
  isBootstrapping: boolean;
  isSubmitting: boolean;
  onSubmit: (input: LoginInput) => Promise<void>;
}) {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await props.onSubmit({ account, password });
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-card__logo">工</div>
        <div>
          <h1>登录工作台</h1>
          <p>企业内网账号统一登录入口</p>
        </div>
        <Input
          autoComplete="username"
          label="账号"
          onChange={(event) => setAccount(event.target.value)}
          placeholder="请输入工号或邮箱"
          prefix={<Icon name="user" />}
          size="lg"
          value={account}
        />
        <Input
          autoComplete="current-password"
          label="密码"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="请输入密码"
          prefix={<Icon name="lock" />}
          size="lg"
          type="password"
          value={password}
        />
        <div className="login-card__row">
          <Checkbox
            checked={remember}
            label="记住登录"
            onChange={(event) => setRemember(event.target.checked)}
          />
          <button className="login-card__link" disabled type="button">
            忘记密码？
          </button>
        </div>
        {props.errorMessage ? <div className="login-card__error">{props.errorMessage}</div> : null}
        <Button
          block
          disabled={props.isSubmitting || props.isBootstrapping}
          size="lg"
          type="submit"
          variant="primary"
        >
          {props.isSubmitting || props.isBootstrapping ? '处理中' : '登 录'}
        </Button>
        <p className="login-card__hint">登录即代表同意《内网使用规范》与《安全协议》</p>
      </form>
    </main>
  );
}

export function WorkbenchHome(props: {
  currentUser: CurrentUserDto;
  navigationItems: NavigationItem[];
  notifications?: Pick<NotificationsState, 'unreadCount' | 'recent'>;
}) {
  const greeting = getGreeting();
  const quickEntries = props.navigationItems.slice(0, 8);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const dateLabel = `${now.getMonth() + 1} 月 ${now.getDate()} 日 ${WEEKDAYS[now.getDay()]}`;
  // Honest placeholders — these data sources are not built yet (see W-3 / L2 boundary).
  // We keep the design's stat-card visuals but never fabricate the design's demo numbers.
  const placeholderStats: {
    key: string;
    title: string;
    icon: IconName;
    tone: StatTone;
    milestone: string;
  }[] = [
    { key: 'approval', title: '待我审批', icon: 'todo', tone: 'warning', milestone: 'M11' },
    { key: 'todo', title: '我的待办', icon: 'clock', tone: 'blue', milestone: 'vNext' },
    {
      key: 'presence',
      title: '在岗成员',
      icon: 'users',
      tone: 'success',
      milestone: 'presence 汇总 API',
    },
  ];

  return (
    <section className="workbench-home">
      <header className="workbench-home__head">
        <div>
          <h1>
            {greeting}，{props.currentUser.name}
          </h1>
          <p>
            {props.currentUser.departmentName ?? '默认组织'} · 你有{' '}
            <b>{props.notifications?.unreadCount ?? 0}</b> 条未读消息
          </p>
        </div>
        <div className="workbench-home__clock">
          <div className="workbench-home__time">{clock}</div>
          <div className="workbench-home__date">{dateLabel}</div>
        </div>
      </header>

      <div className="workbench-home__stats">
        <StatCard
          footer="来自通知中心未读数"
          icon={<Icon name="message" />}
          label="未读消息"
          tone="purple"
          value={props.notifications?.unreadCount ?? 0}
        />
        {placeholderStats.map((stat) => (
          <StatCard
            footer={`数据待接入（${stat.milestone}）`}
            icon={<Icon name={stat.icon} />}
            key={stat.key}
            label={stat.title}
            tone={stat.tone}
            value="待接入"
          />
        ))}
      </div>

      <div className="workbench-home__cols">
        <div className="workbench-home__col">
          <Card title="待处理事项">
            <EmptyState
              description="审批、待办等聚合来源待接入（M7/M11）。"
              title="暂无待处理事项"
            />
          </Card>
          <Card flush title="常用应用">
            {quickEntries.length ? (
              <div className="work-quick-grid">
                {quickEntries.map((entry) => (
                  <NavLink className="work-quick" key={entry.path} to={entry.path}>
                    <span
                      aria-hidden="true"
                      className={`work-quick__icon work-quick__icon--${resolveQuickTone(entry.title, entry.moduleName)}`}
                    >
                      <Icon name={resolveMenuIcon(entry.title, entry.moduleName)} />
                    </span>
                    <span className="work-quick__label">{entry.title}</span>
                  </NavLink>
                ))}
              </div>
            ) : (
              <EmptyState description="当前账号尚无可访问菜单。" title="暂无应用入口" />
            )}
          </Card>
        </div>
        <div className="workbench-home__col">
          <Card title="最新消息">
            {props.notifications?.recent.length ? (
              <NotificationList compact notifications={props.notifications.recent.slice(0, 5)} />
            ) : (
              <EmptyState description="暂无通知消息。" title="暂无消息" />
            )}
          </Card>
          <Card title="系统动态">
            <EmptyState
              description="系统动态来源待接入，当前不展示原型演示数据。"
              title="暂无动态"
            />
          </Card>
        </div>
      </div>
    </section>
  );
}

function ShellState(props: { title: string; description: string }) {
  return (
    <section className="shell-state">
      <h2>{props.title}</h2>
      <p>{props.description}</p>
    </section>
  );
}

const MODULE_ICONS: Record<string, IconName> = {
  presence: 'users',
  platform: 'settings',
  notification: 'bell',
  message: 'message',
  approval: 'approval',
  report: 'doc',
  forms: 'doc',
  files: 'doc',
  todo: 'todo',
};

const MODULE_TONES: Record<string, StatTone> = {
  presence: 'success',
  platform: 'purple',
  notification: 'cyan',
  message: 'cyan',
  approval: 'warning',
  report: 'blue',
};

// Per-menu icons so distinct entries don't all collapse to one module icon
// (the design gives each nav item its own line icon).
const MENU_TITLE_ICONS: Record<string, IconName> = {
  组织架构: 'appbox',
  员工管理: 'users',
  角色权限: 'settings',
  在位看板: 'dashboard',
  状态登记: 'todo',
  通知设置: 'bell',
  消息中心: 'message',
  我的待办: 'todo',
  审批中心: 'approval',
  文档资料: 'doc',
  应用管理: 'appbox',
};

function moduleIconName(moduleName: string): IconName {
  return MODULE_ICONS[moduleName] ?? 'appbox';
}

function resolveMenuIcon(title: string, moduleName: string): IconName {
  return MENU_TITLE_ICONS[title] ?? moduleIconName(moduleName);
}

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

// Per-menu quick-tile colour so the entry grid reads with a varied palette like
// the design (instead of one colour per module).
const MENU_TITLE_QUICK_TONES: Record<string, string> = {
  组织架构: 'blue',
  员工管理: 'cyan',
  角色权限: 'indigo',
  在位看板: 'success',
  状态登记: 'warning',
  通知设置: 'purple',
};

function resolveQuickTone(title: string, moduleName: string): string {
  return MENU_TITLE_QUICK_TONES[title] ?? moduleTone(moduleName);
}

function moduleTone(moduleName: string): StatTone {
  return MODULE_TONES[moduleName] ?? 'blue';
}

function isMessagingModule(moduleName: string): boolean {
  return moduleName === 'notification' || moduleName === 'message';
}

// Display label for a module-level sidebar section. These are the real module
// titles (not fabricated features); ideally sourced from each module manifest.
const MODULE_SECTION_LABELS: Record<string, string> = {
  platform: '平台管理',
  presence: '在位管理',
  notification: '通知中心',
  approval: '审批',
  report: '日报',
  forms: '表单',
  files: '文件',
};

function moduleSectionLabel(moduleName: string): string {
  return MODULE_SECTION_LABELS[moduleName] ?? moduleName;
}

// Build the two-level sidebar: real parent-grouped menus keep their group title;
// flat ("ungrouped") menus are merged per module under the module's section label
// so the nav reads as titled sections instead of one header per item.
function buildSidebarSections(groups: NavigationGroup[]): NavigationGroup[] {
  const sections: NavigationGroup[] = [];
  for (const group of groups) {
    if (!group.id.startsWith('ungrouped-')) {
      sections.push(group);
      continue;
    }
    const sectionId = `module-${group.moduleName}`;
    const existing = sections.find((section) => section.id === sectionId);
    if (existing) {
      existing.items.push(...group.items);
      continue;
    }
    sections.push({
      id: sectionId,
      moduleName: group.moduleName,
      title: moduleSectionLabel(group.moduleName),
      items: [...group.items],
    });
  }
  return sections;
}

function resolveUserSubtitle(currentUser: CurrentUserDto): string {
  return currentUser.roles[0] ?? currentUser.departmentName ?? '默认组织';
}

function ModuleIcon({ moduleName, title }: { moduleName: string; title?: string }) {
  return <Icon name={title ? resolveMenuIcon(title, moduleName) : moduleIconName(moduleName)} />;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) {
    return '早上好';
  }
  if (hour < 18) {
    return '下午好';
  }
  return '晚上好';
}

function resolveNotificationTarget(notification: NotificationDto): string | undefined {
  if (notification.sourceModule === 'presence') {
    return '/presence/board';
  }
  return undefined;
}

function formatUnreadCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}

function formatNotificationTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return '请求失败';
}
