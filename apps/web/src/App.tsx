import { lazy, Suspense, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { PrintHeader } from "@/components/print-header";
import { Buscador } from "@/components/buscador";
import { Notificaciones } from "@/components/notificaciones";
import { PasswordInput } from "@/components/password-input";
import { FeedbackHost } from "@/components/feedback";
import { AccesoNombre } from "@/components/acceso-nombre";
import { EstadoSistemaHost } from "@/components/estado-sistema";
import { MODULOS_PROXIMAMENTE, Proximamente } from "@/components/proximamente";
import { guardarTema, useApariencia } from '@/pages/shared/apariencia';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  Activity as ActivityIcon,
  Archive,
  ArrowUpRight,
  Bell,
  CalendarDays,
  ChevronsLeft,
  ClipboardList,
  Clock3,
  FileText,
  Hospital,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageOpen,
  Plus,
  Settings2,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import {
  getGetCurrentUserQueryKey,
  useChangePassword,
  useContinuePassword,
  useLogin,
  useLogout,
  useGetCurrentUser,
} from '@salvador/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { VerComoAviso } from "@/components/ver-como";

// Cada módulo se descarga recién cuando se abre (la primera carga es más liviana).
const AdministracionPage = lazy(() => import("@/pages/Administracion"));
const GuardiasMedicasPage = lazy(() => import("@/pages/GuardiasMedicas"));
const ConfiguracionPage = lazy(() => import("@/pages/Configuracion"));
const UsuariosPage = lazy(() => import("@/pages/Usuarios"));
const PerfilPage = lazy(() => import("@/pages/Perfil"));
const InicioPage = lazy(() => import("@/pages/Inicio"));

const queryClient = new QueryClient();

const navItems = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
  { href: '/administracion', label: 'Administración', icon: ClipboardList },
  { href: '/guardias', label: 'Guardias Médicas', icon: CalendarDays },
  { href: '/inventario', label: 'Inventario', icon: PackageOpen },
  { href: '/instructivos', label: 'Instructivos', icon: Archive },
  { href: '/liquidacion', label: 'Liquidación', icon: FileText },
  { href: '/usuarios', label: 'Usuarios', icon: Users },
];

function initials(name?: string) {
  return (name || 'SS').split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function formatDate(value?: string | null) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function formatTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function StatusMessage({ title, detail, action }: { title: string; detail: string; action?: () => void }) {
  return <div className="card empty-state" data-testid="status-message">
    <div className="empty-icon"><ShieldCheck size={20} /></div>
    <strong>{title}</strong>
    <p className="section-kicker">{detail}</p>
    {action && <button className="btn btn-quiet" onClick={action} data-testid="button-retry">Reintentar</button>}
  </div>;
}

function Brand({ compact = false }: { compact?: boolean }) {
  const { apariencia } = useApariencia();
  return <Link href="/dashboard" className="sidebar-brand" data-testid="link-brand">
    <div className="brand-mark" style={apariencia.logo ? { background: '#fff', padding: 3, overflow: 'hidden' } : undefined}>
      {apariencia.logo ? <img src={apariencia.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <Hospital size={18} strokeWidth={2.4} />}
    </div>
    {!compact && (
      <div style={{ minWidth: 0 }}>
        <div className="font-display" title={apariencia.nombre}>{apariencia.nombre}</div>
        {apariencia.subtitulo && <div className="brand-sub">{apariencia.subtitulo}</div>}
      </div>
    )}
  </Link>;
}

function Shell({ children, user }: { children: ReactNode; user?: { name?: string; username?: string; email?: string | null; role?: string; modules?: string[] } }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("sc-sidebar-collapsed") === "1"; } catch { return false; }
  });
  const [, setLocation] = useLocation();
  const logout = useLogout();
  const { oscuro, apariencia } = useApariencia();
  // Sale siempre: aunque la sesión ya no exista en el servidor (vencida o cerrada), limpia y vuelve al login.
  const doLogout = () => logout.mutate(undefined, { onSettled: () => {
    queryClient.clear();
    // La app instalable borra las copias de datos guardadas (equipos compartidos).
    navigator.serviceWorker?.controller?.postMessage('logout');
    setMobileOpen(false);
    setLocation('/');
  } });
  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem("sc-sidebar-collapsed", next ? "1" : "0"); } catch {}
      return next;
    });
  };
  // Usuarios vive dentro de Configuración (solo superadmin).
  const visibleNavItems = navItems.filter((item) => item.href !== '/usuarios' && (user?.role === 'superadmin' || user?.modules?.includes(item.href.slice(1))));
  const nav = <nav aria-label="Menú principal" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
    <div className="nav-label">{collapsed ? <span aria-hidden="true" className="nav-label-linea" /> : 'Operación'}</div>
    {visibleNavItems.filter((i) => !MODULOS_PROXIMAMENTE.includes(i.href)).map(({ href, label, icon: Icon }) => (
      <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`nav-item ${location === href ? 'active' : ''}`} aria-current={location === href ? 'page' : undefined} title={label} data-testid={`link-nav-${label.toLowerCase()}`}>
        <span className="nav-ico"><Icon className="nav-icon" /></span>{!collapsed && <span className="nav-txt">{label}</span>}
      </Link>
    ))}
    {visibleNavItems.some((i) => MODULOS_PROXIMAMENTE.includes(i.href)) && <div className="nav-label">{collapsed ? <span aria-hidden="true" className="nav-label-linea" /> : 'Próximamente'}</div>}
    {visibleNavItems.filter((i) => MODULOS_PROXIMAMENTE.includes(i.href)).map(({ href, label, icon: Icon }) => (
      <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`nav-item nav-pronto ${location === href ? 'active' : ''}`} aria-current={location === href ? 'page' : undefined} title={`${label} (próximamente)`} data-testid={`link-nav-${label.toLowerCase()}`}>
        <span className="nav-ico"><Icon className="nav-icon" /></span>{!collapsed && <><span className="nav-txt">{label}</span><span className="nav-badge">Pronto</span></>}
      </Link>
    ))}
    {user?.role === 'superadmin' && <div className="nav-label">{collapsed ? <span aria-hidden="true" className="nav-label-linea" /> : 'Espacio'}</div>}
    {user?.role === 'superadmin' && <Link href="/configuracion" onClick={() => setMobileOpen(false)} className={`nav-item ${location === '/configuracion' || location === '/usuarios' ? 'active' : ''}`} aria-current={location === '/configuracion' || location === '/usuarios' ? 'page' : undefined} title="Configuración" data-testid="link-nav-configuracion">
      <span className="nav-ico"><Settings2 className="nav-icon" /></span>{!collapsed && <span className="nav-txt">Configuración</span>}
    </Link>}
  </nav>;
  const sideW = collapsed ? 72 : 248;
  return <div className={`workspace-shell${collapsed ? " is-collapsed" : ""}`} style={{ minHeight: '100vh', width: '100%', maxWidth: '100vw', overflowX: 'clip' }}>
    <a href="#contenido" className="skip-link">Saltar al contenido</a>
    <aside className="sidebar" style={{
      position: 'fixed', left: 0, top: 0, bottom: 0,
      width: sideW, minWidth: sideW, maxWidth: sideW,
      boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column',
      padding: collapsed ? '12px 6px 14px' : '14px 10px 16px',
      overflowX: 'hidden', overflowY: 'auto', zIndex: 40,
    }}>
      <div className="sidebar-top" style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', gap: 8, padding: '0 4px 12px', marginBottom: 2, borderBottom: '1px solid hsl(var(--sidebar-border) / 0.5)', flexShrink: 0, flexDirection: collapsed ? 'column' : 'row' }}>
        <Brand compact={collapsed} />
        <button type="button" className="sidebar-toggle" onClick={toggleCollapsed} title={collapsed ? "Expandir menú" : "Contraer menú"} aria-label={collapsed ? "Expandir menú" : "Contraer menú"}>
          <ChevronsLeft size={16} strokeWidth={2.2} style={{ transform: collapsed ? 'rotate(180deg)' : undefined, transition: 'transform .25s' }} />
        </button>
      </div>
      {nav}
      <div className="sidebar-foot">
        <div className="side-user">
          <Link href="/perfil" className="side-user-link" title="Mi perfil">
            <span className="side-avatar" aria-hidden="true">{initials(user?.name)}</span>
            {!collapsed && (
              <span className="side-user-txt">
                <b>{user?.name || 'Usuario interno'}</b>
                <small>{user?.role === 'superadmin' ? 'Superadministrador' : 'Usuario'}</small>
              </span>
            )}
          </Link>
          <button type="button" className="side-logout" onClick={doLogout} disabled={logout.isPending} data-testid="button-logout" title="Cerrar sesión" aria-label="Cerrar sesión">
            <LogOut size={16} strokeWidth={2.1} />
          </button>
        </div>
      </div>
    </aside>
    {mobileOpen && (
      <div className="modal-backdrop" style={{ display: 'block', padding: 0, zIndex: 50 }} onClick={() => setMobileOpen(false)}>
        <aside className="sidebar sidebar-drawer" style={{ display: 'flex', minHeight: '100dvh', width: 268, position: 'fixed', left: 0, top: 0, zIndex: 51 }} onClick={(event) => event.stopPropagation()}>
          <div className="sidebar-top" style={{ borderBottom: 'none' }}>
            <Brand />
            <button className="sidebar-toggle" onClick={() => setMobileOpen(false)} data-testid="button-close-menu"><X size={15} /></button>
          </div>
          {nav}
          <div className="sidebar-foot">
            <div className="side-user">
              <Link href="/perfil" className="side-user-link" title="Mi perfil" onClick={() => setMobileOpen(false)}>
                <span className="side-avatar" aria-hidden="true">{initials(user?.name)}</span>
                <span className="side-user-txt"><b>{user?.name || 'Usuario interno'}</b><small>{user?.role === 'superadmin' ? 'Superadministrador' : 'Usuario'}</small></span>
              </Link>
              <button type="button" className="side-logout" onClick={doLogout} disabled={logout.isPending} data-testid="button-logout-drawer" title="Cerrar sesión" aria-label="Cerrar sesión"><LogOut size={16} strokeWidth={2.1} /></button>
            </div>
          </div>
        </aside>
      </div>
    )}
    <div className="main-column" style={{ marginLeft: sideW, paddingLeft: 8, width: `calc(100% - ${sideW}px)`, maxWidth: `calc(100% - ${sideW}px)`, minWidth: 0, display: 'flex', flexDirection: 'column', overflowX: 'clip', boxSizing: 'border-box' }}>
      <VerComoAviso />
      <header className="topbar" style={{ paddingLeft: 20, paddingRight: 20 }}>
        <button className="btn btn-quiet btn-icon mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Abrir menú" data-testid="button-open-menu"><Menu size={18} /></button>
        <div className="topbar-meta"><span style={{ fontWeight: 600 }}>{apariencia.nombre}</span><span style={{ margin: '0 8px', opacity: .35 }}>/</span><span>Operación interna</span></div>
        <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/perfil" title="Mi perfil" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }} data-testid="link-perfil">
            <div className="topbar-user-text" style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{user?.name || 'Sesión interna'}</div>
              <div style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>@{user?.username || 'usuario'}</div>
            </div>
            <div className="avatar" data-testid="avatar-current-user">{initials(user?.name)}</div>
          </Link>
          <Buscador pantallas={visibleNavItems.map(({ href, label }) => ({ href, label }))} esSuperadmin={user?.role === 'superadmin'} />
          <Notificaciones usuario={user?.username} />
          <button className="btn btn-quiet btn-icon" onClick={() => guardarTema(oscuro ? 'claro' : 'oscuro')} title={oscuro ? 'Pasar a modo claro' : 'Pasar a modo oscuro'} aria-label={oscuro ? 'Pasar a modo claro' : 'Pasar a modo oscuro'} data-testid="button-theme" style={{ fontSize: 15, width: 34, height: 34 }}>{oscuro ? '☀' : '☾'}</button>
          <button className="btn btn-quiet" style={{ fontSize: 12, padding: '6px 10px' }} onClick={doLogout} disabled={logout.isPending} title="Cerrar sesión" data-testid="button-logout-top">Salir</button>
        </div>
      </header>
      <div id="contenido" tabIndex={-1} style={{ outline: 'none' }} />
      <PrintHeader usuario={user?.name} />
      {/* Mientras se descarga un módulo se muestra un esqueleto en lugar de una pantalla en blanco. */}
      <Suspense fallback={<main className="content-wrap" aria-busy="true"><div className="skeleton" style={{ height: 34, width: 260, marginBottom: 16 }} /><div className="skeleton" style={{ height: 320 }} /></main>}>{children}</Suspense>
    </div>
  </div>;
}

function useCurrentUserSafe(enabled = true) {
  return useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), enabled, retry: false } });
}

function loginErrorMessage(error: unknown): string {
  const e = error as { status?: number; data?: { message?: string } } | null;
  return e?.data?.message || 'Usuario o contraseña incorrectos.';
}

function LoginPage() {
  const { apariencia } = useApariencia();
  const [, setLocation] = useLocation();
  const login = useLogin();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ data: { username, password } }, {
      onSuccess: (result) => {
        queryClient.setQueryData(getGetCurrentUserQueryKey(), result.user);
        setLocation(result.user.mustChangePassword ? '/primer-acceso' : '/dashboard');
      },
    });
  };
  return <div className="auth-layout">
    <section className="auth-aside">
      <div className="auth-aside-deco" aria-hidden="true" />
      <div className="auth-aside-top"><Brand /></div>
      <div className="auth-aside-main">
        <div className="auth-signal"><ShieldCheck size={14} aria-hidden="true" />{apariencia.nombre} · Área protegida</div>
        <h1>{apariencia.tituloLogin}</h1>
        {apariencia.mensajeLogin && <p>{apariencia.mensajeLogin}</p>}
        <ul className="auth-chips" aria-label="Módulos del sistema">
          <li><CalendarDays size={15} aria-hidden="true" />Guardias médicas</li>
          <li><ClipboardList size={15} aria-hidden="true" />Administración</li>
          <li><Bell size={15} aria-hidden="true" />Vencimientos y avisos</li>
        </ul>
      </div>
      <div className="auth-aside-foot">© {new Date().getFullYear()} {apariencia.nombre} · Uso interno</div>
    </section>
    <section className="auth-panel">
      <div className="auth-box">
        <div className="auth-pill"><span className="auth-dot" aria-hidden="true" />Red interna del sanatorio</div>
        <div className="eyebrow">Acceso interno</div>
        <h2>Iniciar sesión</h2>
        <p className="lead">Usá tu usuario y contraseña para entrar al sistema.</p>
        <form onSubmit={submit} className="auth-form">
          <label className="field"><span className="field-label">Usuario</span>
            <div className="auth-ico"><UserRound size={18} aria-hidden="true" /><input className="input" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus required placeholder="Tu usuario" data-testid="input-login-username" /></div>
          </label>
          <label className="field"><span className="field-label">Contraseña</span>
            <div className="auth-ico"><KeyRound size={18} aria-hidden="true" /><PasswordInput value={password} onChange={setPassword} autoComplete="current-password" required testId="input-login-password" /></div>
          </label>
          {login.isError && <div className="form-error">{loginErrorMessage(login.error)}</div>}
          <button className="btn btn-primary auth-submit" type="submit" disabled={login.isPending} data-testid="button-login-submit">{login.isPending ? 'Ingresando…' : 'Ingresar'} <ArrowUpRight size={17} /></button>
        </form>
        <div className="auth-foot">Los usuarios son creados y administrados por el <strong>área de Sistemas</strong>.<span className="auth-foot-extra"><br />¿No podés entrar? Comunicate con Sistemas.</span></div>
      </div>
    </section>
  </div>;
}

function FirstAccessPage({ user }: { user: { name?: string; mustChangePassword?: boolean } }) {
  const [, setLocation] = useLocation();
  const keep = useContinuePassword();
  const change = useChangePassword();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [notice, setNotice] = useState('');
  const finish = () => {
    queryClient.setQueryData(getGetCurrentUserQueryKey(), (current: any) => current ? { ...current, mustChangePassword: false } : current);
    setLocation('/dashboard');
  };
  return <div className="auth-layout"><section className="auth-aside"><div className="auth-aside-deco" aria-hidden="true" /><div className="auth-aside-top"><Brand /></div><div className="auth-aside-main"><div className="auth-signal"><ShieldCheck size={14} aria-hidden="true" />Primer acceso · Cuenta interna</div><h1>Elegí cómo <span style={{ color: 'hsl(var(--sidebar-primary))' }}>continuar.</span></h1><p>Tu usuario fue creado por el área de Sistemas. Podés mantener la clave inicial o definir una nueva ahora.</p></div><div className="auth-aside-foot">Ante cualquier duda, comunicate con el área de Sistemas.</div></section><section className="auth-panel"><div className="auth-box"><div className="eyebrow">Hola, {user.name?.split(' ')[0] || 'equipo'}</div><h2>Confirmá tu contraseña</h2><p className="lead">Por seguridad, esta decisión se registra al completar el primer acceso.</p><div style={{ display: 'grid', gap: 10, marginTop: 27 }}><button className="btn btn-primary" onClick={() => keep.mutate(undefined, { onSuccess: finish })} disabled={keep.isPending} data-testid="button-keep-password">Continuar con la misma clave</button><div className="card" style={{ padding: 17, marginTop: 5 }}><div className="section-title" style={{ fontSize: 14 }}>Modificar contraseña</div><div className="form-grid" style={{ marginTop: 14 }}><label className="field full"><span className="field-label">Nueva contraseña</span><PasswordInput value={password} onChange={setPassword} autoComplete="new-password" minLength={6} testId="input-first-password" /></label><label className="field full"><span className="field-label">Repetir contraseña</span><PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" minLength={6} testId="input-first-password-confirm" /></label></div><button className="btn btn-quiet" style={{ width: '100%', marginTop: 13 }} disabled={change.isPending || password.length < 6 || password !== confirm} onClick={() => change.mutate({ data: { newPassword: password } }, { onSuccess: finish, onError: () => setNotice('No se pudo actualizar la contraseña.') })} data-testid="button-change-first-password">{change.isPending ? 'Guardando…' : 'Guardar nueva contraseña'}</button></div>{notice && <div className="form-error">{notice}</div>}</div></div></section></div>;
}

function Protected({ children, user, allowFirstAccess = false }: { children: ReactNode; user?: { mustChangePassword?: boolean }; allowFirstAccess?: boolean }) {
  const [, setLocation] = useLocation();
  const currentUser = useCurrentUserSafe();
  // Solo una sesión vencida (401/403) manda al ingreso. Si el sistema está caído o en mantenimiento
  // (5xx o sin red) se queda en la pantalla: la pantalla de estado la cubre y al volver sigue igual.
  const sinSesion = currentUser.isError && [401, 403].includes((currentUser.error as { status?: number } | null)?.status ?? 0);
  useEffect(() => { if (sinSesion) setLocation('/'); }, [sinSesion, setLocation]);
  useEffect(() => { if (currentUser.data?.mustChangePassword && !allowFirstAccess) setLocation('/primer-acceso'); }, [allowFirstAccess, currentUser.data?.mustChangePassword, setLocation]);
  if (currentUser.isLoading) return <div className="auth-layout"><div className="skeleton" style={{ width: 260, height: 18, margin: 'auto' }} /></div>;
  if (!currentUser.data) return null;
  return <>{children}</>;
}

function Router() {
  const [location] = useLocation();
  const currentUser = useCurrentUserSafe(location !== '/' && location !== '/sign-in');
  const shellUser = currentUser.data;
  return <Switch>
    <Route path="/sign-in"><LoginPage /></Route>
    <Route path="/"><LoginPage /></Route>
    <Route path="/primer-acceso"><Protected user={shellUser} allowFirstAccess><FirstAccessPage user={shellUser || {}} /></Protected></Route>
    <Route path="/dashboard"><Protected user={shellUser}><Shell user={shellUser}><InicioPage /></Shell></Protected></Route>
    <Route path="/administracion"><Protected user={shellUser}><Shell user={shellUser}><AdministracionPage /></Shell></Protected></Route>
    <Route path="/liquidacion"><Protected user={shellUser}><Shell user={shellUser}><Proximamente titulo="Liquidación" icono={FileText} resumen="Un espacio para centralizar el seguimiento de las liquidaciones del sanatorio." ideas={["Seguimiento de liquidaciones por período y obra social", "Estados y responsables de cada liquidación", "Vínculo con los vencimientos de Administración"]} /></Shell></Protected></Route>
    <Route path="/guardias"><Protected user={shellUser}><Shell user={shellUser}><GuardiasMedicasPage /></Shell></Protected></Route>
    <Route path="/inventario"><Protected user={shellUser}><Shell user={shellUser}><Proximamente titulo="Inventario" icono={PackageOpen} resumen="Control de los equipos y bienes de cada sector: qué hay, dónde está y en qué estado." ideas={["Registro de equipos y bienes por sector", "Movimientos entre sectores y responsables", "Equipos en reparación y mantenimientos"]} /></Shell></Protected></Route>
    <Route path="/instructivos"><Protected user={shellUser}><Shell user={shellUser}><Proximamente titulo="Instructivos" icono={Archive} resumen="Un lugar ordenado para los instructivos y procedimientos formales de cada área." ideas={["Instructivos por área, siempre en su última versión", "Búsqueda rápida por tema", "Aviso cuando se actualiza un procedimiento"]} /></Shell></Protected></Route>
    <Route path="/configuracion"><Protected user={shellUser}><Shell user={shellUser}><ConfiguracionPage /></Shell></Protected></Route>
    <Route path="/perfil"><Protected user={shellUser}><Shell user={shellUser}><PerfilPage /></Shell></Protected></Route>
    <Route path="/usuarios"><Protected user={shellUser}><Shell user={shellUser}><UsuariosPage /></Shell></Protected></Route>
    <Route><Protected user={shellUser}><Shell user={shellUser}><StatusMessage title="Página no encontrada" detail="El enlace que buscás no existe dentro del sistema." action={() => window.history.back()} /></Shell></Protected></Route>
  </Switch>;
}

function App() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  return <WouterRouter base={basePath}><QueryClientProvider client={queryClient}><TooltipProvider><ErrorBoundary><Router /></ErrorBoundary><Toaster /><FeedbackHost /><AccesoNombre /><EstadoSistemaHost /></TooltipProvider></QueryClientProvider></WouterRouter>;
}

export default App;
