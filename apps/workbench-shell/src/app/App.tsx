import type { CurrentUserDto, LoginInput, MenuDto } from '@work/platform-contract';
import type { ComponentType, FormEvent, LazyExoticComponent, ReactNode } from 'react';
import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { BrowserRouter as Router, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { moduleRegistry } from '../module-registry/module-registry';
import { createPlatformApiClient } from '../platform/platform-api';
import { clearAccessToken, readAccessToken, saveAccessToken } from '../platform/session-storage';
import { buildModuleRouteTable, buildNavigationItems, normalizePath, type NavigationItem } from './navigation';

interface ModuleRouteEntry {
  path: string;
  permission?: string;
  Lazy: LazyExoticComponent<ComponentType>;
}

const moduleRouteTable: ModuleRouteEntry[] = buildModuleRouteTable(moduleRegistry.getModules()).map((route) => ({
  path: route.path,
  permission: route.permission,
  Lazy: lazy(() => route.load().then((mod) => ({ default: mod.default as ComponentType }))),
}));

interface SessionState {
  accessToken?: string;
  currentUser?: CurrentUserDto;
  menus: MenuDto[];
}

export function App() {
  const [session, setSession] = useState<SessionState>({ accessToken: readAccessToken(), menus: [] });
  const [isBootstrapping, setIsBootstrapping] = useState(Boolean(session.accessToken));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

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
    } catch (error) {
      clearAccessToken();
      setSession({ menus: [] });
      setErrorMessage(readErrorMessage(error));
    } finally {
      setIsBootstrapping(false);
    }
  }, [api, session.accessToken]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const permissionCodes = useMemo(
    () => session.currentUser?.permissions.map((permission) => permission.code) ?? [],
    [session.currentUser],
  );
  const navigationItems = useMemo(() => buildNavigationItems(session.menus), [session.menus]);

  async function handleLogin(input: LoginInput) {
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
  }

  function handleLogout() {
    clearAccessToken();
    setSession({ menus: [] });
    setErrorMessage(undefined);
  }

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

  return (
    <Router>
      <AppShell
        currentUser={session.currentUser}
        errorMessage={errorMessage}
        navigationItems={navigationItems}
        onLogout={handleLogout}
        permissionCodes={permissionCodes}
      />
    </Router>
  );
}

function AppShell(props: {
  currentUser: CurrentUserDto;
  navigationItems: NavigationItem[];
  permissionCodes: string[];
  errorMessage?: string;
  onLogout: () => void;
}) {
  return (
    <main className="shell">
      <aside className="shell__sidebar">
        <div className="shell__brand">Work Platform</div>
        <nav className="shell__nav">
          {props.navigationItems.map((item) => (
            <NavLink
              className={({ isActive }) =>
                isActive ? 'shell__nav-item shell__nav-item--active' : 'shell__nav-item'
              }
              end
              key={item.path}
              to={item.path}
            >
              {item.title}
            </NavLink>
          ))}
        </nav>
      </aside>
      <section className="shell__content">
        <header className="shell__header">
          <div>
            <h1>工作台</h1>
            <span>{props.currentUser.departmentName ?? '默认组织'}</span>
          </div>
          <div className="shell__account">
            <span>{props.currentUser.name}</span>
            <button onClick={props.onLogout} type="button">
              退出
            </button>
          </div>
        </header>
        {props.errorMessage ? <div className="shell__error">{props.errorMessage}</div> : null}
        <div className="shell__panel">
          <RouteErrorBoundary>
            <Suspense fallback={<ShellState description="正在加载模块页面。" title="加载中" />}>
              <Routes>
                <Route
                  element={
                    <WorkbenchHome menus={props.navigationItems.length} permissions={props.permissionCodes.length} />
                  }
                  index
                />
                {moduleRouteTable.map((entry) => (
                  <Route
                    element={
                      <RequirePermission permission={entry.permission} permissionCodes={props.permissionCodes}>
                        <entry.Lazy />
                      </RequirePermission>
                    }
                    key={entry.path}
                    path={entry.path}
                  />
                ))}
                <Route element={<UnknownPathView navigationItems={props.navigationItems} />} path="*" />
              </Routes>
            </Suspense>
          </RouteErrorBoundary>
        </div>
      </section>
    </main>
  );
}

function RequirePermission(props: { permission?: string; permissionCodes: string[]; children: ReactNode }) {
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

function LoginView(props: {
  errorMessage?: string;
  isBootstrapping: boolean;
  isSubmitting: boolean;
  onSubmit: (input: LoginInput) => Promise<void>;
}) {
  const [account, setAccount] = useState('admin');
  const [password, setPassword] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await props.onSubmit({ account, password });
  }

  return (
    <main className="login">
      <form className="login__panel" onSubmit={handleSubmit}>
        <div>
          <h1>Work Platform</h1>
          <p>企业内部协作工作台</p>
        </div>
        <label>
          账号
          <input autoComplete="username" onChange={(event) => setAccount(event.target.value)} value={account} />
        </label>
        <label>
          密码
          <input
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
        </label>
        {props.errorMessage ? <div className="login__error">{props.errorMessage}</div> : null}
        <button disabled={props.isSubmitting || props.isBootstrapping} type="submit">
          {props.isSubmitting || props.isBootstrapping ? '处理中' : '登录'}
        </button>
      </form>
    </main>
  );
}

function WorkbenchHome(props: { menus: number; permissions: number }) {
  return (
    <section className="home">
      <h2>基座已连接</h2>
      <dl>
        <div>
          <dt>可用菜单</dt>
          <dd>{props.menus}</dd>
        </div>
        <div>
          <dt>权限点</dt>
          <dd>{props.permissions}</dd>
        </div>
      </dl>
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

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return '请求失败';
}
