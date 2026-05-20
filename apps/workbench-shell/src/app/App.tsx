import type { CurrentUserDto, LoginInput, MenuDto } from '@work/platform-contract';
import type { ComponentType, FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { moduleRegistry } from '../module-registry/module-registry';
import { createPlatformApiClient } from '../platform/platform-api';
import { clearAccessToken, readAccessToken, saveAccessToken } from '../platform/session-storage';
import { buildNavigationItems, findRouteMatch, normalizePath } from './navigation';

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

  useEffect(() => {
    const routeMatch = findRouteMatch(modules, currentPath, permissionCodes);
    if (!routeMatch) {
      setRouteComponent(undefined);
      return;
    }

    let cancelled = false;
    routeMatch.route
      .load()
      .then((loaded) => {
        if (!cancelled) {
          setRouteComponent(() => loaded.default as ComponentType);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRouteComponent(undefined);
          setErrorMessage(readErrorMessage(error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentPath, permissionCodes]);

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
        <div className="shell__panel">
          {ActiveRouteComponent ? (
            <ActiveRouteComponent />
          ) : (
            <WorkbenchHome menus={navigationItems.length} permissions={permissionCodes.length} />
          )}
        </div>
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

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return '请求失败';
}
