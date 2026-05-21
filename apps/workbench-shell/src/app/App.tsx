import type { CurrentUserDto, LoginInput, MenuDto } from '@work/platform-contract';
import type { ComponentType, FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { moduleRegistry } from '../module-registry/module-registry';
import { createPlatformApiClient } from '../platform/platform-api';
import { clearAccessToken, readAccessToken, saveAccessToken } from '../platform/session-storage';
import { buildNavigationItems, normalizePath, resolveShellRoute } from './navigation';

type RouteComponent = ComponentType | undefined;

interface SessionState {
  accessToken?: string;
  currentUser?: CurrentUserDto;
  menus: MenuDto[];
}

const modules = moduleRegistry.getModules();

export function App() {
  const [session, setSession] = useState<SessionState>({ accessToken: readAccessToken(), menus: [] });
  const [currentPath, setCurrentPath] = useState(() => normalizePath(window.location.pathname));
  const [routeComponent, setRouteComponent] = useState<RouteComponent>();
  const [isBootstrapping, setIsBootstrapping] = useState(Boolean(session.accessToken));
  const [isRouteLoading, setIsRouteLoading] = useState(false);
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

  useEffect(() => {
    function syncPath() {
      setCurrentPath(normalizePath(window.location.pathname));
    }

    window.addEventListener('popstate', syncPath);
    return () => window.removeEventListener('popstate', syncPath);
  }, []);

  const permissionCodes = useMemo(
    () => session.currentUser?.permissions.map((permission) => permission.code) ?? [],
    [session.currentUser],
  );
  const navigationItems = useMemo(() => buildNavigationItems(session.menus), [session.menus]);
  const routeResolution = useMemo(
    () => resolveShellRoute(modules, navigationItems, currentPath, permissionCodes),
    [currentPath, navigationItems, permissionCodes],
  );

  useEffect(() => {
    if (routeResolution.kind !== 'loadable') {
      setRouteComponent(undefined);
      setIsRouteLoading(false);
      setErrorMessage(undefined);
      return;
    }

    let cancelled = false;
    setRouteComponent(undefined);
    setIsRouteLoading(true);
    setErrorMessage(undefined);
    routeResolution.match.route
      .load()
      .then((loaded) => {
        if (!cancelled) {
          setRouteComponent(() => loaded.default as ComponentType);
          setErrorMessage(undefined);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRouteComponent(undefined);
          setErrorMessage(readErrorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsRouteLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [routeResolution]);

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
    setRouteComponent(undefined);
    setErrorMessage(undefined);
  }

  function navigate(path: string) {
    const normalized = normalizePath(path);
    window.history.pushState({}, '', normalized);
    setCurrentPath(normalized);
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

  const ActiveRouteComponent = routeComponent;
  const content = renderShellContent({
    activeRouteComponent: ActiveRouteComponent,
    isRouteLoading,
    menus: navigationItems.length,
    permissions: permissionCodes.length,
    routeResolution,
  });

  return (
    <main className="shell">
      <aside className="shell__sidebar">
        <div className="shell__brand">Work Platform</div>
        <nav className="shell__nav">
          {navigationItems.map((item) => (
            <button
              className={item.path === currentPath ? 'shell__nav-item shell__nav-item--active' : 'shell__nav-item'}
              key={item.path}
              onClick={() => navigate(item.path)}
              type="button"
            >
              {item.title}
            </button>
          ))}
        </nav>
      </aside>
      <section className="shell__content">
        <header className="shell__header">
          <div>
            <h1>工作台</h1>
            <span>{session.currentUser.departmentName ?? '默认组织'}</span>
          </div>
          <div className="shell__account">
            <span>{session.currentUser.name}</span>
            <button onClick={handleLogout} type="button">
              退出
            </button>
          </div>
        </header>
        {errorMessage ? <div className="shell__error">{errorMessage}</div> : null}
        <div className="shell__panel">{content}</div>
      </section>
    </main>
  );
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

function renderShellContent(props: {
  activeRouteComponent: RouteComponent;
  isRouteLoading: boolean;
  menus: number;
  permissions: number;
  routeResolution: ReturnType<typeof resolveShellRoute>;
}) {
  if (props.isRouteLoading) {
    return <ShellState description="正在加载模块页面。" title="加载中" />;
  }

  if (props.routeResolution.kind === 'home') {
    return <WorkbenchHome menus={props.menus} permissions={props.permissions} />;
  }

  if (props.routeResolution.kind === 'loadable') {
    const ActiveRouteComponent = props.activeRouteComponent;
    return ActiveRouteComponent ? (
      <ActiveRouteComponent />
    ) : (
      <ShellState description="模块入口已注册，但页面加载失败，请查看上方错误信息。" title="页面加载失败" />
    );
  }

  if (props.routeResolution.kind === 'coming-soon') {
    return (
      <ShellState
        description={`${props.routeResolution.item.title} 已由平台菜单授权，但当前 Shell 尚未接入对应页面。`}
        title="页面待接入"
      />
    );
  }

  if (props.routeResolution.kind === 'forbidden') {
    return <ShellState description="当前账号没有访问该模块页面的权限。" title="无权访问" />;
  }

  return <ShellState description={`未找到路径 ${props.routeResolution.path} 对应的页面。`} title="页面不存在" />;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return '请求失败';
}
