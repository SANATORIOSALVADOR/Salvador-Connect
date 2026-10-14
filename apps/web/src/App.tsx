import { lazy, Suspense, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { PrintHeader } from "@/components/print-header";
import { Buscador } from "@/components/buscador";
import { Notificaciones } from "@/components/notificaciones";
import { PasswordInput } from "@/components/password-input";
import { FeedbackHost } from "@/components/feedback";
import { AccesoNombre } from "@/components/acceso-nombre";
import { guardarTema, useApariencia } from '@/pages/shared/apariencia';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  Activity as ActivityIcon,
  Archive,
  ArrowUpRight,
  Bell,
  CalendarDays,
  ClipboardList,
  Clock3,
  FileText,
  Hospital,
  LayoutDashboard,
  Menu,
  PackageOpen,
  Plus,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import {
  getGetCurrentUserQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetRecentActivityQueryKey,
  getListSectorsQueryKey,
  useChangePassword,
  useContinuePassword,
  useLogin,
  useLogout,
  useGetCurrentUser,
  useGetDashboardSummary,
  useGetRecentActivity,
  useListSectors,
} from '@salvador/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

// Cada módulo se descarga recién cuando se abre (la primera carga es más liviana).
const AdministracionPage = lazy(() => import("@/pages/Administracion"));
const GuardiasMedicasPage = lazy(() => import("@/pages/GuardiasMedicas"));
const InventarioPage = lazy(() => import("@/pages/Inventario"));
const InstructivosPage = lazy(() => import("@/pages/Instructivos"));
const ConfiguracionPage = lazy(() => import("@/pages/Configuracion"));
const UsuariosPage = lazy(() => import("@/pages/Usuarios"));
const PerfilPage = lazy(() => import("@/pages/Perfil"));
const DashboardGraficos = lazy(() => import("@/components/dashboard-graficos").then((m) => ({ default: m.DashboardGraficos })));

const queryClient = new QueryClient();

const navItems = [
  { href: '/dashboard', label: 'Resumen', icon: LayoutDashboard },
  { href: '/administracion', label: 'Administración', icon: ClipboardList },
  { href: '/liquidacion', label: 'Liquidación', icon: FileText },
  { href: '/guardias', label: 'Guardias Médicas', icon: CalendarDays },
  { href: '/inventario', label: 'Inventario', icon: PackageOpen },
  { href: '/instructivos', label: 'Instructivos', icon: Archive },
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
    {!collapsed && <div className="nav-label">Operación</div>}
    {visibleNavItems.map(({ href, label, icon: Icon }) => (
      <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`nav-item ${location === href ? 'active' : ''}`} aria-current={location === href ? 'page' : undefined} title={label} data-testid={`link-nav-${label.toLowerCase()}`}>
        <Icon className="nav-icon" />{!collapsed && <span>{label}</span>}
      </Link>
    ))}
    {user?.role === 'superadmin' && !collapsed && <div className="nav-label">Espacio</div>}
    {user?.role === 'superadmin' && <Link href="/configuracion" onClick={() => setMobileOpen(false)} className={`nav-item ${location === '/configuracion' || location === '/usuarios' ? 'active' : ''}`} aria-current={location === '/configuracion' || location === '/usuarios' ? 'page' : undefined} title="Configuración" data-testid="link-nav-configuracion">
      <Settings2 className="nav-icon" />{!collapsed && <span>Configuración</span>}
    </Link>}
  </nav>;
  const sideW = collapsed ? 72 : 248;
  return <div className={`workspace-shell${collapsed ? " is-collapsed" : ""}`} style={{ minHeight: '100vh', width: '100%', maxWidth: '100vw', overflowX: 'hidden' }}>
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
          <Menu size={15} strokeWidth={2.2} />
        </button>
      </div>
      {nav}
      <div className="sidebar-foot" style={{ marginTop: 'auto', flexShrink: 0, borderTop: '1px solid hsl(var(--sidebar-border) / 0.5)', paddingTop: 12 }}>
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 8px' }}>
            <div className="avatar" style={{ width: 32, height: 32, background: 'hsl(var(--sidebar-primary) / .18)', color: 'hsl(var(--sidebar-primary))', border: 'none' }}>{initials(user?.name)}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name || 'Usuario interno'}</div>
              <div style={{ fontSize: 10, opacity: .48, marginTop: 2 }}>{user?.role || 'Acceso operativo'}</div>
            </div>
          </div>
        )}
        <button className="btn btn-quiet" style={{ width: '100%', marginTop: collapsed ? 0 : 4, color: 'hsl(var(--sidebar-foreground) / .78)', background: 'transparent', borderColor: 'hsl(var(--sidebar-border))', padding: collapsed ? '10px' : undefined }} onClick={doLogout} disabled={logout.isPending} data-testid="button-logout" title="Cerrar sesión">
          {collapsed ? <span aria-hidden="true">⎋</span> : "Cerrar sesión"}{collapsed && <span className="sr-only">Cerrar sesión</span>}
        </button>
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
          <div style={{ borderTop: '1px solid hsl(var(--sidebar-border) / 0.5)', padding: '12px 4px 4px' }}>
            <button className="btn btn-quiet" style={{ width: '100%', color: 'hsl(var(--sidebar-foreground) / .78)', background: 'transparent', borderColor: 'hsl(var(--sidebar-border))' }} onClick={doLogout} disabled={logout.isPending} data-testid="button-logout-drawer">Cerrar sesión</button>
          </div>
        </aside>
      </div>
    )}
    <div className="main-column" style={{ marginLeft: sideW, paddingLeft: 8, width: `calc(100% - ${sideW}px)`, maxWidth: `calc(100% - ${sideW}px)`, minWidth: 0, display: 'flex', flexDirection: 'column', overflowX: 'hidden', boxSizing: 'border-box' }}>
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

function Dashboard({ user }: { user?: { name?: string; email?: string | null; role?: string } }) {
  const summary = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey(), retry: false } });
  const activity = useGetRecentActivity({ limit: 5 }, { query: { queryKey: getGetRecentActivityQueryKey({ limit: 5 }), retry: false } });
  const sectors = useListSectors({ query: { queryKey: getListSectorsQueryKey(), retry: false } });
  const [, setLocation] = useLocation();
  const data = summary.data;
  const firstName = user?.name?.split(' ')[0] || 'equipo';
  return <main className="content-wrap">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap', marginBottom: 25 }}>
      <div><div className="eyebrow" style={{ textTransform: 'capitalize' }}>{new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div><h1 className="page-title">Buen día, {firstName}.</h1><p className="page-subtitle">Esta es la lectura operativa para mantener el día en orden.</p></div>
      <button className="btn btn-primary" onClick={() => setLocation('/administracion?nuevo=1')} data-testid="button-new-agenda"><Plus size={16} />Nuevo vencimiento</button>
    </div>
    {summary.isLoading ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 18 }}>{[1,2,3,4].map((item) => <div key={item} className="metric-card card skeleton" />)}</div> : summary.isError ? <StatusMessage title="No pudimos cargar el resumen" detail="La conexión con el espacio de trabajo no respondió." action={() => summary.refetch()} /> : <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 18 }}>
        <Metric label="Vencimientos próximos" value={data?.upcomingReminders ?? 0} note="Vencidos y próximos 7 días" icon={<Bell size={16} />} />
        <Metric label="Guardias de hoy" value={data?.pendingGuardias ?? 0} note="Cargadas para hoy" icon={<CalendarDays size={16} />} />
        <Metric label="Equipos en reparación" value={data?.lowStockItems ?? 0} note="Inventario" icon={<PackageOpen size={16} />} />
        <Metric label="Actividad reciente" value={data?.recentActivityCount ?? 0} note="Últimos 7 días" icon={<ActivityIcon size={16} />} />
      </div>
      <div className="dashboard-grid">
        <div className="card section-card">
          <div className="section-head"><div><div className="section-title">Próximo en agenda</div><div className="section-kicker">La prioridad más cercana de tu operación</div></div><Link href="/administracion" className="btn btn-quiet" style={{ padding: '8px 11px' }} data-testid="link-view-agenda">Ver agenda <ArrowUpRight size={14} /></Link></div>
          <div className="reminder-highlight"><div><div className="eyebrow">Siguiente vencimiento pendiente</div><div style={{ fontFamily: 'var(--app-font-display)', fontWeight: 700, fontSize: 19, marginTop: 7 }}>{data?.nextReminder || 'No hay vencimientos pendientes'}</div></div><div className="reminder-date">{formatDate(data?.nextReminderDate)}</div></div>
          <div className="section-head" style={{ marginTop: 21, marginBottom: 7 }}><div><div className="section-title">Accesos directos</div><div className="section-kicker">Atajos para las tareas más frecuentes</div></div></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><QuickAction icon={<ClipboardList size={16} />} title="Revisar agenda" note="Fechas y responsables" href="/administracion" /><QuickAction icon={<Users size={16} />} title="Ver sectores" note={`${sectors.data?.length ?? 0} sectores activos`} href="/configuracion" /></div>
        </div>
        <div className="card section-card"><div className="section-head"><div><div className="section-title">Actividad reciente</div><div className="section-kicker">Últimos movimientos del espacio</div></div><ActivityIcon size={17} color="hsl(var(--muted-foreground))" /></div>{activity.isLoading ? <div style={{ display: 'grid', gap: 12 }}>{[1,2,3].map((item) => <div className="skeleton" style={{ height: 42 }} key={item} />)}</div> : activity.isError ? <div className="empty-state" style={{ padding: '20px 5px' }}>La actividad no está disponible.</div> : activity.data?.length ? activity.data.map((entry) => <ActivityRow key={entry.id} entry={entry} />) : <div className="empty-state" style={{ padding: '20px 5px' }}>Todavía no hay movimientos registrados.</div>}</div>
      </div>
      <Suspense fallback={null}><DashboardGraficos /></Suspense>
    </>}
  </main>;
}

function Metric({ label, value, note, icon }: { label: string; value: number; note: string; icon: ReactNode }) {
  return <div className="card metric-card" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div style={{ display: 'flex', justifyContent: 'space-between' }}><div className="metric-label">{label}</div><div style={{ color: 'hsl(var(--primary))' }}>{icon}</div></div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></div>;
}

function QuickAction({ icon, title, note, href }: { icon: ReactNode; title: string; note: string; href: string }) {
  return <Link href={href} className="quick-action" data-testid={`link-quick-${title.toLowerCase().replaceAll(' ', '-')}`}><div className="quick-icon">{icon}</div><div><div className="quick-title">{title}</div><div className="quick-note">{note}</div></div><ArrowUpRight size={14} style={{ marginLeft: 'auto', color: 'hsl(var(--muted-foreground))' }} /></Link>;
}

function ActivityRow({ entry }: { entry: { id: number; title: string; detail: string; actor: string; createdAt: string } }) {
  return <div className="activity-row" data-testid={`activity-row-${entry.id}`}><div className="activity-dot" /><div style={{ minWidth: 0 }}><div className="activity-title">{entry.title}</div><div className="activity-detail">{entry.detail} · {entry.actor}</div></div><div className="activity-time">{formatTime(entry.createdAt)}</div></div>;
}

function PlaceholderPage({ kind, title, description, icon: Icon }: { kind: string; title: string; description: string; icon: typeof FileText }) {
  return <main className="content-wrap"><div className="eyebrow">Módulo / {kind}</div><h1 className="page-title">{title}</h1><p className="page-subtitle">{description}</p><div className="placeholder-banner" style={{ marginTop: 29 }}><div className="eyebrow" style={{ color: 'hsl(var(--sidebar-primary))' }}>Próximamente</div><h2>Módulo en desarrollo</h2><p>Estamos preparando una vista clara y específica para este espacio. Mientras tanto, la información quedará lista para incorporarse sin interrumpir la operación.</p></div><div className="info-grid"><div className="card info-card"><Icon size={19} /><h3>Datos ordenados</h3><p>La estructura va a respetar tus sectores y permisos de trabajo.</p></div><div className="card info-card"><Clock3 size={19} /><h3>Cuando esté listo</h3><p>Vas a encontrar aquí las acciones que más usás, sin pasos extra.</p></div><div className="card info-card"><ShieldCheck size={19} /><h3>Acceso controlado</h3><p>El contenido será visible según el rol y sector asignado.</p></div></div></main>;
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
  return <div className="auth-layout"><section className="auth-aside"><Brand /><div className="auth-signal">{apariencia.nombre} · Área protegida</div><h1>{apariencia.tituloLogin}</h1>{apariencia.mensajeLogin && <p>{apariencia.mensajeLogin}</p>}</section><section className="auth-panel"><div className="auth-box"><div className="eyebrow">Acceso interno</div><h2>Iniciar sesión.</h2><p>Usá tu usuario y contraseña para entrar al sistema.</p><form onSubmit={submit} className="auth-form"><label className="field"><span className="field-label">Usuario</span><input className="input" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus required data-testid="input-login-username" /></label><label className="field"><span className="field-label">Contraseña</span><PasswordInput value={password} onChange={setPassword} autoComplete="current-password" required testId="input-login-password" /></label>{login.isError && <div className="form-error">{loginErrorMessage(login.error)}</div>}<button className="btn btn-primary" type="submit" disabled={login.isPending} data-testid="button-login-submit">{login.isPending ? 'Ingresando…' : 'Ingresar'} <ArrowUpRight size={15} /></button></form><div className="auth-foot">Los usuarios son creados y administrados por el superadmin.</div></div></section></div>;
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
  return <div className="auth-layout"><section className="auth-aside"><Brand /><div className="auth-signal">Primer acceso · Cuenta interna</div><h1>Elegí cómo <span style={{ color: 'hsl(var(--sidebar-primary))' }}>continuar.</span></h1><p>Tu usuario fue creado por el superadmin. Podés mantener la clave inicial o definir una nueva ahora.</p></section><section className="auth-panel"><div className="auth-box"><div className="eyebrow">Hola, {user.name?.split(' ')[0] || 'equipo'}</div><h2>Confirmá tu contraseña.</h2><p>Por seguridad, esta decisión se registra al completar el primer acceso.</p><div style={{ display: 'grid', gap: 10, marginTop: 27 }}><button className="btn btn-primary" onClick={() => keep.mutate(undefined, { onSuccess: finish })} disabled={keep.isPending} data-testid="button-keep-password">Continuar con la misma clave</button><div className="card" style={{ padding: 17, marginTop: 5 }}><div className="section-title" style={{ fontSize: 14 }}>Modificar contraseña</div><div className="form-grid" style={{ marginTop: 14 }}><label className="field full"><span className="field-label">Nueva contraseña</span><PasswordInput value={password} onChange={setPassword} autoComplete="new-password" minLength={6} testId="input-first-password" /></label><label className="field full"><span className="field-label">Repetir contraseña</span><PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" minLength={6} testId="input-first-password-confirm" /></label></div><button className="btn btn-quiet" style={{ width: '100%', marginTop: 13 }} disabled={change.isPending || password.length < 6 || password !== confirm} onClick={() => change.mutate({ data: { newPassword: password } }, { onSuccess: finish, onError: () => setNotice('No se pudo actualizar la contraseña.') })} data-testid="button-change-first-password">{change.isPending ? 'Guardando…' : 'Guardar nueva contraseña'}</button></div>{notice && <div className="form-error">{notice}</div>}</div></div></section></div>;
}

function Protected({ children, user, allowFirstAccess = false }: { children: ReactNode; user?: { mustChangePassword?: boolean }; allowFirstAccess?: boolean }) {
  const [, setLocation] = useLocation();
  const currentUser = useCurrentUserSafe();
  useEffect(() => { if (currentUser.isError) setLocation('/'); }, [currentUser.isError, setLocation]);
  useEffect(() => { if (currentUser.data?.mustChangePassword && !allowFirstAccess) setLocation('/primer-acceso'); }, [allowFirstAccess, currentUser.data?.mustChangePassword, setLocation]);
  if (currentUser.isLoading) return <div className="auth-layout"><div className="skeleton" style={{ width: 260, height: 18, margin: 'auto' }} /></div>;
  if (currentUser.isError || !currentUser.data) return null;
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
    <Route path="/dashboard"><Protected user={shellUser}><Shell user={shellUser}><Dashboard user={shellUser} /></Shell></Protected></Route>
    <Route path="/administracion"><Protected user={shellUser}><Shell user={shellUser}><AdministracionPage /></Shell></Protected></Route>
    <Route path="/liquidacion"><Protected user={shellUser}><Shell user={shellUser}><PlaceholderPage kind="Liquidación" title="Liquidación" description="Un espacio para centralizar el seguimiento de liquidaciones." icon={FileText} /></Shell></Protected></Route>
    <Route path="/guardias"><Protected user={shellUser}><Shell user={shellUser}><GuardiasMedicasPage /></Shell></Protected></Route>
    <Route path="/inventario"><Protected user={shellUser}><Shell user={shellUser}><InventarioPage /></Shell></Protected></Route>
    <Route path="/instructivos"><Protected user={shellUser}><Shell user={shellUser}><InstructivosPage /></Shell></Protected></Route>
    <Route path="/configuracion"><Protected user={shellUser}><Shell user={shellUser}><ConfiguracionPage /></Shell></Protected></Route>
    <Route path="/perfil"><Protected user={shellUser}><Shell user={shellUser}><PerfilPage /></Shell></Protected></Route>
    <Route path="/usuarios"><Protected user={shellUser}><Shell user={shellUser}><UsuariosPage /></Shell></Protected></Route>
    <Route><Protected user={shellUser}><Shell user={shellUser}><StatusMessage title="Página no encontrada" detail="El enlace que buscás no existe dentro del sistema." action={() => window.history.back()} /></Shell></Protected></Route>
  </Switch>;
}

function App() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  return <WouterRouter base={basePath}><QueryClientProvider client={queryClient}><TooltipProvider><ErrorBoundary><Router /></ErrorBoundary><Toaster /><FeedbackHost /><AccesoNombre /></TooltipProvider></QueryClientProvider></WouterRouter>;
}

export default App;
