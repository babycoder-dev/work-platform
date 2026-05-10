import { moduleRegistry } from '../module-registry/module-registry';

export function App() {
  const modules = moduleRegistry.getModules();

  return (
    <main className="shell">
      <aside className="shell__sidebar">
        <div className="shell__brand">Work Platform</div>
        <nav className="shell__nav">
          {modules.flatMap((module) =>
            module.manifest.menus.map((menu) => (
              <a key={menu.path} href={menu.path}>
                {menu.title}
              </a>
            )),
          )}
        </nav>
      </aside>
      <section className="shell__content">
        <header className="shell__header">
          <h1>工作台基座</h1>
          <span>模块化接入协议已启用</span>
        </header>
        <div className="shell__panel">
          <h2>已注册模块</h2>
          <ul>
            {modules.map((module) => (
              <li key={module.manifest.name}>
                {module.manifest.title} - {module.manifest.basePath}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
