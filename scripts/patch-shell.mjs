import fs from "node:fs";

const path = "apps/web/src/App.tsx";
let t = fs.readFileSync(path, "utf8");

if (!t.includes("compact = false")) {
  t = t.replace(
    /function Brand\(\) \{/,
    "function Brand({ compact = false }: { compact?: boolean }) {",
  );
}

const shellStart = t.indexOf("function Shell(");
if (shellStart < 0) throw new Error("Shell not found");
const shellEnd = t.indexOf("function useCurrentUserSafe", shellStart);
if (shellEnd < 0) throw new Error("useCurrentUserSafe not found");

const newShell = `function Shell({ children, user }: { children: ReactNode; user?: { name?: string; username?: string; email?: string | null; role?: string; modules?: string[] } }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("sc-sidebar-collapsed") === "1"; } catch { return false; }
  });
  const [, setLocation] = useLocation();
  const logout = useLogout();
  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem("sc-sidebar-collapsed", next ? "1" : "0"); } catch {}
      return next;
    });
  };
  const visibleNavItems = navItems.filter((item) => user?.role === 'superadmin' || user?.modules?.includes(item.href.slice(1)));
  const nav = <nav>
    {!collapsed && <div className="nav-label">Operación</div>}
    {visibleNavItems.map(({ href, label, icon: Icon }) => (
      <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={\`nav-item \${location === href ? 'active' : ''}\`} title={label} data-testid={\`link-nav-\${label.toLowerCase()}\`}>
        <Icon className="nav-icon" />{!collapsed && <span>{label}</span>}
      </Link>
    ))}
    {!collapsed && <div className="nav-label">Espacio</div>}
    <Link href="/configuracion" onClick={() => setMobileOpen(false)} className={\`nav-item \${location === '/configuracion' ? 'active' : ''}\`} title="Configuración" data-testid="link-nav-configuracion">
      <Settings2 className="nav-icon" />{!collapsed && <span>Configuración</span>}
    </Link>
  </nav>;
  return <div className={\`workspace-shell\${collapsed ? " is-collapsed" : ""}\`}>
    <aside className="sidebar">
      <div className="sidebar-top">
        <Brand compact={collapsed} />
        <button type="button" className="sidebar-toggle" onClick={toggleCollapsed} title={collapsed ? "Expandir menú" : "Contraer menú"} aria-label={collapsed ? "Expandir menú" : "Contraer menú"}>
          <Menu size={15} strokeWidth={2.2} />
        </button>
      </div>
      {nav}
      <div className="sidebar-foot">
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 8px' }}>
            <div className="avatar" style={{ width: 32, height: 32, background: 'hsl(var(--sidebar-primary) / .18)', color: 'hsl(var(--sidebar-primary))', border: 'none' }}>{initials(user?.name)}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name || 'Usuario interno'}</div>
              <div style={{ fontSize: 10, opacity: .48, marginTop: 2 }}>{user?.role || 'Acceso operativo'}</div>
            </div>
          </div>
        )}
        <button className="btn btn-quiet" style={{ width: '100%', marginTop: collapsed ? 0 : 4, color: 'hsl(var(--sidebar-foreground) / .78)', background: 'transparent', borderColor: 'hsl(var(--sidebar-border))', padding: collapsed ? '10px' : undefined }} onClick={() => logout.mutate(undefined, { onSuccess: () => { queryClient.clear(); setLocation('/'); } })} data-testid="button-logout" title="Cerrar sesión">
          {collapsed ? "⎋" : "Cerrar sesión"}
        </button>
      </div>
    </aside>
    {mobileOpen && (
      <div className="modal-backdrop" style={{ display: 'block', padding: 0 }} onClick={() => setMobileOpen(false)}>
        <aside className="sidebar sidebar-drawer" style={{ display: 'flex', minHeight: '100dvh', width: 268 }} onClick={(event) => event.stopPropagation()}>
          <div className="sidebar-top" style={{ borderBottom: 'none' }}>
            <Brand />
            <button className="sidebar-toggle" onClick={() => setMobileOpen(false)} data-testid="button-close-menu"><X size={15} /></button>
          </div>
          {nav}
        </aside>
      </div>
    )}
    <div className="main-column">
      <header className="topbar">
        <button className="btn btn-quiet btn-icon mobile-menu" onClick={() => setMobileOpen(true)} data-testid="button-open-menu"><Menu size={18} /></button>
        <div className="topbar-meta"><span className="font-mono">SANATORIO DEL SALVADOR</span><span style={{ margin: '0 8px', opacity: .35 }}>/</span><span>Operación interna</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{user?.name || 'Sesión interna'}</div>
            <div style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>@{user?.username || 'usuario'}</div>
          </div>
          <div className="avatar" data-testid="avatar-current-user">{initials(user?.name)}</div>
        </div>
      </header>
      {children}
    </div>
  </div>;
}

`;

t = t.slice(0, shellStart) + newShell + t.slice(shellEnd);
t = t.replace(/Sanatorio Salvador/g, "Sanatorio del Salvador");
t = t.replace(/SANATORIO SALVADOR/g, "SANATORIO DEL SALVADOR");

{
  const bi = t.indexOf("function Brand(");
  const be = t.indexOf("function Shell(", bi);
  if (bi >= 0 && be > bi) {
    t = t.slice(0, bi) + `function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/dashboard" className="sidebar-brand" data-testid="link-brand">
    <div className="brand-mark"><Hospital size={18} strokeWidth={2.4} /></div>
    {!compact && (
      <div style={{ minWidth: 0 }}>
        <div className="font-display">Sanatorio del Salvador</div>
        <div className="brand-sub">Sistema interno</div>
      </div>
    )}
  </Link>;
}

` + t.slice(be);
  }
}

fs.writeFileSync(path, t);
console.log("Shell patched OK");
