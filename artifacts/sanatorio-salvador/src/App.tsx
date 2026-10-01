import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  Activity as ActivityIcon,
  Archive,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  ClipboardList,
  Clock3,
  FileText,
  Hospital,
  LayoutDashboard,
  Menu,
  PackageOpen,
  Pencil,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  getGetCurrentUserQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetRecentActivityQueryKey,
  getListAgendaItemsQueryKey,
  getListSectorsQueryKey,
  getListUsersQueryKey,
  useChangePassword,
  useContinuePassword,
  useCreateAgendaItem,
  useCreateUser,
  useDeleteAgendaItem,
  useDeleteUser,
  useLogin,
  useLogout,
  useGetCurrentUser,
  useGetDashboardSummary,
  useGetRecentActivity,
  useListAgendaItems,
  useListSectors,
  useListUsers,
  useResetUserPassword,
  useUpdateAgendaItem,
  useUpdateUser,
  type AgendaItem,
  type AgendaItemInput,
  type CreateUserBody,
  type UserAdmin,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

const queryClient = new QueryClient();
const agendaTypes = ['cheque', 'vencimiento', 'tarea', 'pago', 'otro'] as const;
type AgendaType = typeof agendaTypes[number];
type ModalMode = { open: boolean; item?: AgendaItem };

const navItems = [
  { href: '/dashboard', label: 'Resumen', icon: LayoutDashboard },
  { href: '/administracion', label: 'Administración', icon: ClipboardList },
  { href: '/liquidacion', label: 'Liquidación', icon: FileText },
  { href: '/guardias', label: 'Guardias', icon: CalendarDays },
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
  return <Link href="/dashboard" className="sidebar-brand" data-testid="link-brand">
    <div className="brand-mark"><Hospital size={20} strokeWidth={2.5} /></div>
    {!compact && <div><div className="font-display" style={{ fontWeight: 800, fontSize: 14, letterSpacing: '-.03em' }}>Sanatorio Salvador</div><div style={{ fontSize: 10, opacity: .52, marginTop: 2 }}>SISTEMA INTERNO</div></div>}
  </Link>;
}

function Shell({ children, user }: { children: ReactNode; user?: { name?: string; username?: string; email?: string | null; role?: string; modules?: string[] } }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [, setLocation] = useLocation();
  const logout = useLogout();
  const visibleNavItems = navItems.filter((item) => user?.role === 'superadmin' || user?.modules?.includes(item.href.slice(1)));
  const nav = <nav style={{ display: 'grid', gap: 3 }}>
    <div className="nav-label">Operación</div>
    {visibleNavItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`nav-item ${location === href ? 'active' : ''}`} data-testid={`link-nav-${label.toLowerCase()}`}><Icon className="nav-icon" /><span>{label}</span></Link>)}
    <div className="nav-label" style={{ marginTop: 22 }}>Espacio</div>
    <Link href="/configuracion" onClick={() => setMobileOpen(false)} className={`nav-item ${location === '/configuracion' ? 'active' : ''}`} data-testid="link-nav-configuracion"><Settings2 className="nav-icon" /><span>Configuración</span></Link>
  </nav>;
  return <div className="workspace-shell">
    <aside className="sidebar">
      <Brand />
      {nav}
      <div style={{ marginTop: 'auto', borderTop: '1px solid hsl(var(--sidebar-border))', paddingTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px' }}>
          <div className="avatar" style={{ width: 31, height: 31, background: 'hsl(var(--sidebar-primary) / .18)', color: 'hsl(var(--sidebar-primary))', border: 'none' }}>{initials(user?.name)}</div>
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name || 'Usuario interno'}</div><div style={{ fontSize: 10, opacity: .5, marginTop: 2 }}>{user?.role || 'Acceso operativo'}</div></div>
        </div>
        <button className="btn btn-quiet" style={{ width: '100%', marginTop: 11, color: 'hsl(var(--sidebar-foreground) / .78)', background: 'transparent', borderColor: 'hsl(var(--sidebar-border))' }} onClick={() => logout.mutate(undefined, { onSuccess: () => { queryClient.clear(); setLocation('/'); } })} data-testid="button-logout">Cerrar sesión</button>
      </div>
    </aside>
    {mobileOpen && <div className="modal-backdrop" style={{ display: 'block', padding: 0 }} onClick={() => setMobileOpen(false)}><aside className="sidebar" style={{ display: 'flex', minHeight: '100dvh', width: 248 }} onClick={(event) => event.stopPropagation()}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><Brand /><button className="btn btn-icon btn-quiet" onClick={() => setMobileOpen(false)} data-testid="button-close-menu"><X size={16} /></button></div>{nav}</aside></div>}
    <div className="main-column">
      <header className="topbar">
        <button className="btn btn-quiet btn-icon mobile-menu" onClick={() => setMobileOpen(true)} data-testid="button-open-menu"><Menu size={18} /></button>
        <div className="topbar-meta"><span className="font-mono">SANATORIO SALVADOR</span><span style={{ margin: '0 8px', opacity: .35 }}>/</span><span>Operación interna</span></div>
         <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><div style={{ textAlign: 'right' }}><div style={{ fontSize: 12, fontWeight: 700 }}>{user?.name || 'Sesión interna'}</div><div style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>@{user?.username || 'usuario'}</div></div><div className="avatar" data-testid="avatar-current-user">{initials(user?.name)}</div></div>
      </header>
      {children}
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
      <div><div className="eyebrow">Martes, 18 de junio de 2024</div><h1 className="page-title">Buen día, {firstName}.</h1><p className="page-subtitle">Esta es la lectura operativa para mantener el día en orden.</p></div>
      <button className="btn btn-primary" onClick={() => setLocation('/administracion?nuevo=1')} data-testid="button-new-agenda"><Plus size={16} />Nueva agenda</button>
    </div>
    {summary.isLoading ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 18 }}>{[1,2,3,4].map((item) => <div key={item} className="metric-card card skeleton" />)}</div> : summary.isError ? <StatusMessage title="No pudimos cargar el resumen" detail="La conexión con el espacio de trabajo no respondió." action={() => summary.refetch()} /> : <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 18 }}>
        <Metric label="Recordatorios próximos" value={data?.upcomingReminders ?? 0} note="En los próximos 7 días" icon={<Bell size={16} />} />
        <Metric label="Guardias pendientes" value={data?.pendingGuardias ?? 0} note="Para revisar" icon={<CalendarDays size={16} />} />
        <Metric label="Ítems con stock bajo" value={data?.lowStockItems ?? 0} note="Requieren atención" icon={<PackageOpen size={16} />} />
        <Metric label="Actividad reciente" value={data?.recentActivityCount ?? 0} note="Movimientos registrados" icon={<ActivityIcon size={16} />} />
      </div>
      <div className="dashboard-grid">
        <div className="card section-card">
          <div className="section-head"><div><div className="section-title">Próximo en agenda</div><div className="section-kicker">La prioridad más cercana de tu operación</div></div><Link href="/administracion" className="btn btn-quiet" style={{ padding: '8px 11px' }} data-testid="link-view-agenda">Ver agenda <ArrowUpRight size={14} /></Link></div>
          <div className="reminder-highlight"><div><div className="eyebrow">Siguiente recordatorio</div><div style={{ fontFamily: 'var(--app-font-display)', fontWeight: 800, fontSize: 19, marginTop: 7 }}>{data?.nextReminder || 'No hay recordatorios próximos'}</div></div><div className="reminder-date">{formatDate(data?.nextReminderDate)}</div></div>
          <div className="section-head" style={{ marginTop: 21, marginBottom: 7 }}><div><div className="section-title">Accesos directos</div><div className="section-kicker">Atajos para las tareas más frecuentes</div></div></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><QuickAction icon={<ClipboardList size={16} />} title="Revisar agenda" note="Fechas y responsables" href="/administracion" /><QuickAction icon={<Users size={16} />} title="Ver sectores" note={`${sectors.data?.length ?? 0} sectores activos`} href="/configuracion" /></div>
        </div>
        <div className="card section-card"><div className="section-head"><div><div className="section-title">Actividad reciente</div><div className="section-kicker">Últimos movimientos del espacio</div></div><ActivityIcon size={17} color="hsl(var(--muted-foreground))" /></div>{activity.isLoading ? <div style={{ display: 'grid', gap: 12 }}>{[1,2,3].map((item) => <div className="skeleton" style={{ height: 42 }} key={item} />)}</div> : activity.isError ? <div className="empty-state" style={{ padding: '20px 5px' }}>La actividad no está disponible.</div> : activity.data?.length ? activity.data.map((entry) => <ActivityRow key={entry.id} entry={entry} />) : <div className="empty-state" style={{ padding: '20px 5px' }}>Todavía no hay movimientos registrados.</div>}</div>
      </div>
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

function AgendaPage() {
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  const agenda = useListAgendaItems(undefined, { query: { queryKey: getListAgendaItemsQueryKey(), retry: false } });
  const create = useCreateAgendaItem();
  const update = useUpdateAgendaItem();
  const remove = useDeleteAgendaItem();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [typeFilter, setTypeFilter] = useState('todos');
  const [modal, setModal] = useState<ModalMode>({ open: false });
  const [notice, setNotice] = useState('');
  const items = useMemo(() => (agenda.data || []).filter((item) => `${item.title} ${item.description} ${item.responsibleName}`.toLowerCase().includes(search.toLowerCase())).filter((item) => statusFilter === 'todos' || item.status === statusFilter).filter((item) => typeFilter === 'todos' || item.type === typeFilter).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()), [agenda.data, search, statusFilter, typeFilter]);
  useEffect(() => { if (location.includes('nuevo=1')) setModal({ open: true }); }, [location]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListAgendaItemsQueryKey() });
  const onSave = (data: AgendaItemInput, item?: AgendaItem) => {
    const done = () => { refresh(); setModal({ open: false }); setLocation('/administracion'); setNotice(item ? 'Agenda actualizada.' : 'Agenda creada.'); setTimeout(() => setNotice(''), 2600); };
    if (item) update.mutate({ id: item.id, data }, { onSuccess: done, onError: () => setNotice('No se pudo actualizar la agenda.') });
    else create.mutate({ data }, { onSuccess: done, onError: () => setNotice('No se pudo crear la agenda.') });
  };
  const complete = (item: AgendaItem) => update.mutate({ id: item.id, data: { status: item.status === 'completado' ? 'pendiente' : 'completado' } }, { onSuccess: () => { refresh(); setNotice(item.status === 'completado' ? 'Agenda reabierta.' : 'Agenda completada.'); setTimeout(() => setNotice(''), 2600); } });
  const del = (item: AgendaItem) => { if (window.confirm(`¿Eliminar "${item.title}"?`)) remove.mutate({ id: item.id }, { onSuccess: () => { refresh(); setNotice('Agenda eliminada.'); setTimeout(() => setNotice(''), 2600); } }); };
  return <main className="content-wrap"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}><div><div className="eyebrow">Administración / Agenda</div><h1 className="page-title">Agenda de trabajo</h1><p className="page-subtitle">Fechas, pagos y tareas administrativas en un solo lugar.</p></div><button className="btn btn-primary" onClick={() => setModal({ open: true })} data-testid="button-create-agenda"><Plus size={16} />Agregar agenda</button></div>
    <div className="agenda-toolbar"><div className="search-control"><Search size={15} /><input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por título o responsable" data-testid="input-search-agenda" /></div><select className="select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} data-testid="select-filter-status"><option value="todos">Todos los estados</option><option value="pendiente">Pendientes</option><option value="completado">Completados</option></select><select className="select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} data-testid="select-filter-type"><option value="todos">Todos los tipos</option>{agendaTypes.map((type) => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}</select><div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, color: 'hsl(var(--muted-foreground))', fontSize: 11 }}><span className="font-mono">{items.length.toString().padStart(2, '0')}</span> resultados</div></div>
    {agenda.isLoading ? <div className="card" style={{ padding: 20, display: 'grid', gap: 12 }}>{[1,2,3,4,5].map((item) => <div className="skeleton" style={{ height: 48 }} key={item} />)}</div> : agenda.isError ? <StatusMessage title="La agenda no está disponible" detail="Revisá tu conexión e intentá nuevamente." action={() => agenda.refetch()} /> : <div className="card agenda-table-wrap"><table className="agenda-table"><thead><tr><th>Actividad</th><th>Vencimiento</th><th>Tipo</th><th>Responsable</th><th>Estado</th><th style={{ textAlign: 'right' }}>Acciones</th></tr></thead><tbody>{items.length ? items.map((item) => <AgendaRow item={item} key={item.id} onComplete={complete} onEdit={() => setModal({ open: true, item })} onDelete={() => del(item)} />) : <tr><td colSpan={6}><div className="empty-state"><div className="empty-icon"><ClipboardList size={20} /></div><strong>{search || statusFilter !== 'todos' || typeFilter !== 'todos' ? 'No encontramos coincidencias' : 'Tu agenda está despejada'}</strong><p className="section-kicker">{search || statusFilter !== 'todos' || typeFilter !== 'todos' ? 'Probá cambiar los filtros.' : 'Agregá una fecha para empezar a organizar el día.'}</p>{!search && statusFilter === 'todos' && <button className="btn btn-primary" onClick={() => setModal({ open: true })} data-testid="button-create-empty-agenda"><Plus size={14} />Agregar agenda</button>}</div></td></tr>}</tbody></table></div>}
    {modal.open && <AgendaModal item={modal.item} busy={create.isPending || update.isPending} onClose={() => { setModal({ open: false }); setLocation('/administracion'); }} onSave={onSave} />}
    {notice && <div className="toast-note" data-testid="status-agenda-action">{notice}</div>}
  </main>;
}

function AgendaRow({ item, onComplete, onEdit, onDelete }: { item: AgendaItem; onComplete: (item: AgendaItem) => void; onEdit: () => void; onDelete: () => void }) {
  return <tr data-testid={`row-agenda-${item.id}`}><td><div className="agenda-title">{item.title}</div><div className="agenda-description">{item.description || 'Sin descripción'}</div></td><td><div style={{ fontWeight: 700 }}>{formatDate(item.dueDate)}</div><div style={{ color: 'hsl(var(--muted-foreground))', fontSize: 10 }}>Recordatorio: {formatDate(item.reminderDate)}</div></td><td><span className="badge badge-type">{item.type}</span></td><td>{item.responsibleName}<div style={{ color: 'hsl(var(--muted-foreground))', fontSize: 10 }}>{item.sectorName || 'General'}</div></td><td><span className={`badge ${item.status === 'completado' ? 'badge-done' : 'badge-pending'}`}>{item.status === 'completado' ? 'Completado' : 'Pendiente'}</span></td><td><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 5 }}><button className="btn btn-quiet btn-icon" title={item.status === 'completado' ? 'Reabrir' : 'Completar'} onClick={() => onComplete(item)} data-testid={`button-complete-agenda-${item.id}`}>{item.status === 'completado' ? <Clock3 size={14} /> : <Check size={14} />}</button><button className="btn btn-quiet btn-icon" title="Editar" onClick={onEdit} data-testid={`button-edit-agenda-${item.id}`}><Pencil size={14} /></button><button className="btn btn-danger btn-icon" title="Eliminar" onClick={onDelete} data-testid={`button-delete-agenda-${item.id}`}><Trash2 size={14} /></button></div></td></tr>;
}

function AgendaModal({ item, busy, onClose, onSave }: { item?: AgendaItem; busy: boolean; onClose: () => void; onSave: (data: AgendaItemInput, item?: AgendaItem) => void }) {
  const [form, setForm] = useState({ title: item?.title || '', description: item?.description || '', dueDate: item?.dueDate?.slice(0, 10) || '', type: (item?.type || 'tarea') as AgendaType, responsibleName: item?.responsibleName || '', sectorName: item?.sectorName || '' });
  const submit = (event: FormEvent) => { event.preventDefault(); if (!form.title.trim() || !form.dueDate || !form.responsibleName.trim()) return; onSave({ title: form.title, description: form.description, dueDate: form.dueDate, type: form.type, responsibleName: form.responsibleName, sectorName: form.sectorName || null, ...(item ? { status: item.status } : {}) }, item); };
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="agenda-modal-title"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}><div><div className="eyebrow">{item ? 'Editar registro' : 'Nuevo registro'}</div><h2 id="agenda-modal-title" className="page-title" style={{ fontSize: 25, marginTop: 5 }}>{item ? 'Actualizar agenda' : 'Agregar a la agenda'}</h2></div><button className="btn btn-quiet btn-icon" onClick={onClose} data-testid="button-close-agenda-modal"><X size={16} /></button></div><form onSubmit={submit}><div className="form-grid"><label className="field full"><span className="field-label">Título</span><input className="input" value={form.title} onChange={(event) => set('title', event.target.value)} placeholder="Ej. Renovación de seguro" required data-testid="input-agenda-title" /></label><label className="field full"><span className="field-label">Descripción <span className="field-hint">(opcional)</span></span><textarea className="textarea" rows={3} value={form.description} onChange={(event) => set('description', event.target.value)} placeholder="Detalle útil para quien lo gestione" data-testid="input-agenda-description" /></label><label className="field"><span className="field-label">Fecha de vencimiento</span><input className="input" type="date" value={form.dueDate} onChange={(event) => set('dueDate', event.target.value)} required data-testid="input-agenda-due-date" /></label><label className="field"><span className="field-label">Tipo</span><select className="select" style={{ width: '100%' }} value={form.type} onChange={(event) => set('type', event.target.value)} data-testid="select-agenda-type">{agendaTypes.map((type) => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}</select></label><label className="field"><span className="field-label">Responsable</span><input className="input" value={form.responsibleName} onChange={(event) => set('responsibleName', event.target.value)} placeholder="Nombre y apellido" required data-testid="input-agenda-responsible" /></label><label className="field"><span className="field-label">Sector <span className="field-hint">(opcional)</span></span><input className="input" value={form.sectorName} onChange={(event) => set('sectorName', event.target.value)} placeholder="Administración" data-testid="input-agenda-sector" /></label></div><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, marginTop: 23 }}><button type="button" className="btn btn-quiet" onClick={onClose} data-testid="button-cancel-agenda">Cancelar</button><button type="submit" className="btn btn-primary" disabled={busy} data-testid="button-save-agenda">{busy ? 'Guardando…' : item ? 'Guardar cambios' : 'Crear agenda'}</button></div></form></div></div>;
}

function PlaceholderPage({ kind, title, description, icon: Icon }: { kind: string; title: string; description: string; icon: typeof FileText }) {
  return <main className="content-wrap"><div className="eyebrow">Módulo / {kind}</div><h1 className="page-title">{title}</h1><p className="page-subtitle">{description}</p><div className="placeholder-banner" style={{ marginTop: 29 }}><div className="eyebrow" style={{ color: 'hsl(var(--sidebar-primary))' }}>Próximamente</div><h2>Módulo en desarrollo</h2><p>Estamos preparando una vista clara y específica para este espacio. Mientras tanto, la información quedará lista para incorporarse sin interrumpir la operación.</p></div><div className="info-grid"><div className="card info-card"><Icon size={19} /><h3>Datos ordenados</h3><p>La estructura va a respetar tus sectores y permisos de trabajo.</p></div><div className="card info-card"><Clock3 size={19} /><h3>Cuando esté listo</h3><p>Vas a encontrar aquí las acciones que más usás, sin pasos extra.</p></div><div className="card info-card"><ShieldCheck size={19} /><h3>Acceso controlado</h3><p>El contenido será visible según el rol y sector asignado.</p></div></div></main>;
}

function ConfigPage() {
  const user = useCurrentUserSafe();
  const sectors = useListSectors({ query: { queryKey: getListSectorsQueryKey(), retry: false } });
  return <main className="content-wrap"><div className="eyebrow">Espacio / Configuración</div><h1 className="page-title">Configuración</h1><p className="page-subtitle">Personas, sectores y permisos del sistema interno.</p><div className="dashboard-grid" style={{ marginTop: 28 }}><div className="card section-card"><div className="section-head"><div><div className="section-title">Tu perfil operativo</div><div className="section-kicker">Información de la sesión actual</div></div><Users size={18} color="hsl(var(--primary))" /></div><div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0 18px' }}><div className="avatar" style={{ width: 52, height: 52, fontSize: 16 }}>{initials(user.data?.name)}</div><div><div style={{ fontFamily: 'var(--app-font-display)', fontWeight: 800, fontSize: 16 }}>{user.data?.name || 'Usuario interno'}</div><div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 3 }}>{user.data?.email || 'Sesión activa'}</div></div></div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><span className="badge badge-done">{user.data?.role || 'Rol operativo'}</span>{user.data?.sectors?.map((sector) => <span className="badge badge-type" key={sector.id}>{sector.shortName}</span>)}</div></div><div className="card section-card"><div className="section-head"><div><div className="section-title">Sectores</div><div className="section-kicker">Áreas disponibles para tu equipo</div></div><span className="font-mono" style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>{sectors.data?.length ?? 0}</span></div>{sectors.isLoading ? <div style={{ display: 'grid', gap: 9 }}>{[1,2,3].map((item) => <div className="skeleton" style={{ height: 42 }} key={item} />)}</div> : sectors.isError ? <div className="empty-state" style={{ padding: 18 }}>No se pudieron cargar los sectores.</div> : sectors.data?.length ? sectors.data.map((sector) => <div key={sector.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid hsl(var(--border) / .7)' }}><div><div style={{ fontWeight: 700, fontSize: 13 }}>{sector.name}</div><div style={{ color: 'hsl(var(--muted-foreground))', fontSize: 11, marginTop: 2 }}>{sector.shortName}</div></div><div className="font-mono" style={{ color: 'hsl(var(--muted-foreground))', fontSize: 11 }}>{sector.members ?? 0} integrantes</div></div>) : <div className="empty-state" style={{ padding: 18 }}>Aún no hay sectores configurados.</div>}</div></div><div className="card section-card" style={{ marginTop: 18 }}><div className="section-head" style={{ marginBottom: 5 }}><div><div className="section-title">Gestión de acceso</div><div className="section-kicker">La administración de usuarios y roles se habilitará en este espacio.</div></div><Settings2 size={18} color="hsl(var(--primary))" /></div></div></main>;
}

function Welcome() {
  const [location, setLocation] = useLocation();
  return <div className="auth-layout"><section className="auth-aside"><Brand /><div className="auth-signal">Mesa operativa · Acceso interno</div><h1>El día claro.<br /><span style={{ color: 'hsl(var(--sidebar-primary))' }}>La operación</span> en orden.</h1><p>Un espacio de trabajo preciso para quienes sostienen el Sanatorio Salvador todos los días.</p></section><section className="auth-panel"><div className="auth-box"><div className="eyebrow">Sistema interno</div><h2>Bienvenido al equipo.</h2><p>Ingresá para revisar la agenda, los sectores y las prioridades de hoy.</p><div style={{ display: 'grid', gap: 10, marginTop: 28 }}><button className="btn btn-primary" onClick={() => setLocation('/sign-in')} data-testid="button-welcome-sign-in">Ingresar al sistema <ArrowUpRight size={15} /></button><button className="btn btn-quiet" onClick={() => setLocation('/sign-up')} data-testid="button-welcome-sign-up">Solicitar acceso</button></div><div className="auth-foot">Acceso reservado para personal autorizado</div></div></section></div>;
  return <div className="auth-layout"><section className="auth-aside"><Brand /><div className="auth-signal">Mesa operativa · Acceso interno</div><h1>El día claro.<br /><span style={{ color: 'hsl(var(--sidebar-primary))' }}>La operación</span> en orden.</h1><p>Un espacio de trabajo preciso para quienes sostienen el Sanatorio Salvador todos los días.</p></section><section className="auth-panel"><div className="auth-box"><div className="eyebrow">Sistema interno</div><h2>Bienvenido al equipo.</h2><p>Ingresá con el usuario y la contraseña asignados por el superadmin.</p><div style={{ display: 'grid', gap: 10, marginTop: 28 }}><button className="btn btn-primary" onClick={() => setLocation('/sign-in')} data-testid="button-welcome-sign-in">Ingresar al sistema <ArrowUpRight size={15} /></button></div><div className="auth-foot">Acceso reservado para personal autorizado</div></div></section></div>;
}

function LoginPage() {
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
  return <div className="auth-layout"><section className="auth-aside"><Brand /><div className="auth-signal">Sanatorio Salvador · Área protegida</div><h1>Una forma más <span style={{ color: 'hsl(var(--sidebar-primary))' }}>serena</span> de trabajar.</h1><p>Ingresá con las credenciales internas asignadas por el superadmin.</p></section><section className="auth-panel"><div className="auth-box"><div className="eyebrow">Acceso interno</div><h2>Iniciar sesión.</h2><p>Usá tu usuario y contraseña para entrar al sistema.</p><form onSubmit={submit} className="auth-form"><label className="field"><span className="field-label">Usuario</span><input className="input" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus required data-testid="input-login-username" /></label><label className="field"><span className="field-label">Contraseña</span><input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required data-testid="input-login-password" /></label>{login.isError && <div className="form-error">Usuario o contraseña incorrectos.</div>}<button className="btn btn-primary" type="submit" disabled={login.isPending} data-testid="button-login-submit">{login.isPending ? 'Ingresando…' : 'Ingresar'} <ArrowUpRight size={15} /></button></form><div className="auth-foot">Los usuarios son creados y administrados por el superadmin.</div></div></section></div>;
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
  return <div className="auth-layout"><section className="auth-aside"><Brand /><div className="auth-signal">Primer acceso · Cuenta interna</div><h1>Elegí cómo <span style={{ color: 'hsl(var(--sidebar-primary))' }}>continuar.</span></h1><p>Tu usuario fue creado por el superadmin. Podés mantener la clave inicial o definir una nueva ahora.</p></section><section className="auth-panel"><div className="auth-box"><div className="eyebrow">Hola, {user.name?.split(' ')[0] || 'equipo'}</div><h2>Confirmá tu contraseña.</h2><p>Por seguridad, esta decisión se registra al completar el primer acceso.</p><div style={{ display: 'grid', gap: 10, marginTop: 27 }}><button className="btn btn-primary" onClick={() => keep.mutate(undefined, { onSuccess: finish })} disabled={keep.isPending} data-testid="button-keep-password">Continuar con la misma clave</button><div className="card" style={{ padding: 17, marginTop: 5 }}><div className="section-title" style={{ fontSize: 14 }}>Modificar contraseña</div><div className="form-grid" style={{ marginTop: 14 }}><label className="field full"><span className="field-label">Nueva contraseña</span><input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={6} data-testid="input-first-password" /></label><label className="field full"><span className="field-label">Repetir contraseña</span><input className="input" type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" minLength={6} data-testid="input-first-password-confirm" /></label></div><button className="btn btn-quiet" style={{ width: '100%', marginTop: 13 }} disabled={change.isPending || password.length < 6 || password !== confirm} onClick={() => change.mutate({ data: { newPassword: password } }, { onSuccess: finish, onError: () => setNotice('No se pudo actualizar la contraseña.') })} data-testid="button-change-first-password">{change.isPending ? 'Guardando…' : 'Guardar nueva contraseña'}</button></div>{notice && <div className="form-error">{notice}</div>}</div></div></section></div>;
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

function UsersPage() {
  const users = useListUsers({ query: { queryKey: getListUsersQueryKey(), retry: false } });
  const sectors = useListSectors({ query: { queryKey: getListSectorsQueryKey(), retry: false } });
  const create = useCreateUser();
  const update = useUpdateUser();
  const remove = useDeleteUser();
  const reset = useResetUserPassword();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ open: boolean; mode: 'create' | 'edit' | 'reset'; user?: UserAdmin }>({ open: false, mode: 'create' });
  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'usuario' as 'usuario' | 'responsable', active: true, modules: ['dashboard'], sectorIds: [] as number[] });
  const [notice, setNotice] = useState('');
  const open = (mode: 'create' | 'edit' | 'reset', user?: UserAdmin) => {
    setModal({ open: true, mode, user });
    setForm({ name: user?.name || '', username: user?.username || '', password: '', role: (user?.role === 'responsable' ? 'responsable' : 'usuario'), active: user?.active ?? true, modules: user?.modules || ['dashboard'], sectorIds: user?.sectorIds || [] });
  };
  const close = () => setModal({ open: false, mode: 'create' });
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (modal.mode === 'reset' && modal.user) {
      reset.mutate({ id: modal.user.id, data: { password: form.password } }, { onSuccess: () => { close(); setNotice('Contraseña restablecida. El usuario deberá confirmarla al ingresar.'); refresh(); } });
      return;
    }
    const data: CreateUserBody = { name: form.name, username: form.username, password: form.password, role: form.role, active: form.active, modules: form.modules, sectorIds: form.sectorIds };
    if (modal.mode === 'edit' && modal.user) {
      update.mutate({ id: modal.user.id, data: { name: form.name, username: form.username, role: form.role, active: form.active, modules: form.modules, sectorIds: form.sectorIds } }, { onSuccess: () => { close(); setNotice('Usuario actualizado.'); refresh(); } });
    } else create.mutate({ data }, { onSuccess: () => { close(); setNotice('Usuario creado. Deberá confirmar la clave en su primer acceso.'); refresh(); } });
    setTimeout(() => setNotice(''), 2800);
  };
  const filtered = (users.data || []).filter((user) => `${user.name} ${user.username}`.toLowerCase().includes(search.toLowerCase()));
  const toggleModule = (module: string) => setForm((current) => ({ ...current, modules: current.modules.includes(module) ? current.modules.filter((item) => item !== module) : [...current.modules, module] }));
  const toggleSector = (id: number) => setForm((current) => ({ ...current, sectorIds: current.sectorIds.includes(id) ? current.sectorIds.filter((item) => item !== id) : [...current.sectorIds, id] }));
  const busy = create.isPending || update.isPending || reset.isPending;
  return <main className="content-wrap"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}><div><div className="eyebrow">Espacio / Usuarios</div><h1 className="page-title">Usuarios y permisos</h1><p className="page-subtitle">Creá accesos internos y definí exactamente qué puede ver cada persona.</p></div><button className="btn btn-primary" onClick={() => open('create')} data-testid="button-create-user"><Plus size={16} />Nuevo usuario</button></div><div className="user-summary-grid"><Metric label="Usuarios activos" value={(users.data || []).filter((user) => user.active).length} note="Con acceso habilitado" icon={<Users size={16} />} /><Metric label="Pendientes de confirmar" value={(users.data || []).filter((user) => user.mustChangePassword).length} note="Primer ingreso" icon={<ShieldCheck size={16} />} /><Metric label="Responsables" value={(users.data || []).filter((user) => user.role === 'responsable').length} note="Con permisos ampliados" icon={<Settings2 size={16} />} /></div><div className="agenda-toolbar"><div className="search-control"><Search size={15} /><input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre o usuario" data-testid="input-search-users" /></div><div style={{ marginLeft: 'auto', color: 'hsl(var(--muted-foreground))', fontSize: 11 }}><span className="font-mono">{filtered.length.toString().padStart(2, '0')}</span> usuarios</div></div>{users.isLoading ? <div className="card" style={{ padding: 20, display: 'grid', gap: 12 }}>{[1,2,3].map((item) => <div className="skeleton" style={{ height: 52 }} key={item} />)}</div> : users.isError ? <StatusMessage title="No se pudieron cargar los usuarios" detail="Revisá tu sesión de superadmin e intentá nuevamente." action={() => users.refetch()} /> : <div className="card agenda-table-wrap"><table className="agenda-table users-table"><thead><tr><th>Persona</th><th>Usuario</th><th>Rol</th><th>Módulos</th><th>Estado</th><th style={{ textAlign: 'right' }}>Acciones</th></tr></thead><tbody>{filtered.length ? filtered.map((user) => <tr key={user.id}><td><div className="agenda-title">{user.name}</div><div className="agenda-description">{user.lastLoginAt ? `Último acceso: ${formatDate(user.lastLoginAt)}` : 'Sin accesos registrados'}</div></td><td><span className="font-mono">@{user.username}</span></td><td><span className={`badge ${user.role === 'responsable' ? 'badge-type' : 'badge-done'}`}>{user.role === 'responsable' ? 'Responsable' : 'Usuario'}</span></td><td><div className="module-pills">{user.modules.slice(0, 3).map((module) => <span className="badge badge-type" key={module}>{module}</span>)}{user.modules.length > 3 && <span className="badge badge-type">+{user.modules.length - 3}</span>}</div></td><td><span className={`badge ${user.active ? 'badge-done' : 'badge-pending'}`}>{user.active ? (user.mustChangePassword ? 'Primer acceso' : 'Activo') : 'Inactivo'}</span></td><td><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 5 }}><button className="btn btn-quiet btn-icon" title="Editar permisos" onClick={() => open('edit', user)}><Pencil size={14} /></button><button className="btn btn-quiet btn-icon" title="Restablecer contraseña" onClick={() => open('reset', user)}><ShieldCheck size={14} /></button><button className="btn btn-danger btn-icon" title="Eliminar usuario" onClick={() => { if (window.confirm(`¿Eliminar a ${user.name}?`)) remove.mutate({ id: user.id }, { onSuccess: () => { refresh(); setNotice('Usuario eliminado.'); } }); }}><Trash2 size={14} /></button></div></td></tr>) : <tr><td colSpan={6}><div className="empty-state"><div className="empty-icon"><Users size={20} /></div><strong>No hay usuarios para mostrar</strong><p className="section-kicker">Creá el primer acceso interno desde este módulo.</p></div></td></tr>}</tbody></table></div>}{notice && <div className="toast-note">{notice}</div>}{modal.open ? <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div className="modal" role="dialog" aria-modal="true"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}><div><div className="eyebrow">{modal.mode === 'create' ? 'Nuevo acceso' : modal.mode === 'reset' ? 'Seguridad' : 'Administración'}</div><h2 className="page-title" style={{ fontSize: 25, marginTop: 5 }}>{modal.mode === 'create' ? 'Crear usuario' : modal.mode === 'reset' ? `Restablecer clave · @${modal.user?.username}` : 'Editar usuario y permisos'}</h2></div><button className="btn btn-quiet btn-icon" onClick={close}><X size={16} /></button></div><form onSubmit={save}>{modal.mode === 'reset' ? <label className="field"><span className="field-label">Nueva contraseña</span><input className="input" type="password" minLength={6} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" required data-testid="input-reset-password" /></label> : <><div className="form-grid"><label className="field full"><span className="field-label">Nombres y apellido</span><input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required data-testid="input-user-name" /></label><label className="field"><span className="field-label">Usuario</span><input className="input" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} required data-testid="input-user-username" /></label><label className="field"><span className="field-label">{modal.mode === 'create' ? 'Contraseña inicial' : 'Contraseña'}</span><input className="input" type="password" minLength={6} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" required={modal.mode === 'create'} data-testid="input-user-password" /></label><label className="field"><span className="field-label">Perfil</span><select className="select" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as 'usuario' | 'responsable' })}><option value="usuario">Usuario</option><option value="responsable">Responsable de sector</option></select></label><label className="field"><span className="field-label">Estado</span><select className="select" value={form.active ? 'activo' : 'inactivo'} onChange={(event) => setForm({ ...form, active: event.target.value === 'activo' })}><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select></label></div><div className="permission-section"><div className="field-label">Módulos habilitados</div><div className="permission-grid">{navItems.filter((item) => item.href !== '/usuarios').map((item) => <label className="permission-option" key={item.href}><input type="checkbox" checked={form.modules.includes(item.href.slice(1))} onChange={() => toggleModule(item.href.slice(1))} /><span>{item.label}</span></label>)}</div></div><div className="permission-section"><div className="field-label">Sectores asignados</div><div className="permission-grid">{(sectors.data || []).map((sector) => <label className="permission-option" key={sector.id}><input type="checkbox" checked={form.sectorIds.includes(sector.id)} onChange={() => toggleSector(sector.id)} /><span>{sector.name}</span></label>)}</div></div></>}</form><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, marginTop: 23 }}><button type="button" className="btn btn-quiet" onClick={close}>Cancelar</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => save({ preventDefault: () => {} } as FormEvent)}>{busy ? 'Guardando…' : modal.mode === 'reset' ? 'Restablecer contraseña' : modal.mode === 'create' ? 'Crear usuario' : 'Guardar cambios'}</button></div></div></div> : null}</main>;
}

function Router() {
  const [location] = useLocation();
  const currentUser = useCurrentUserSafe(location !== '/' && location !== '/sign-in');
  const shellUser = currentUser.data;
  return <Switch>
    <Route path="/sign-in"><LoginPage /></Route>
    <Route path="/"><Welcome /></Route>
    <Route path="/primer-acceso"><Protected user={shellUser} allowFirstAccess><FirstAccessPage user={shellUser || {}} /></Protected></Route>
    <Route path="/dashboard"><Protected user={shellUser}><Shell user={shellUser}><Dashboard user={shellUser} /></Shell></Protected></Route>
    <Route path="/administracion"><Protected user={shellUser}><Shell user={shellUser}><AgendaPage /></Shell></Protected></Route>
    <Route path="/liquidacion"><Protected user={shellUser}><Shell user={shellUser}><PlaceholderPage kind="Liquidación" title="Liquidación" description="Un espacio para centralizar el seguimiento de liquidaciones." icon={FileText} /></Shell></Protected></Route>
    <Route path="/guardias"><Protected user={shellUser}><Shell user={shellUser}><PlaceholderPage kind="Guardias" title="Guardias" description="Planificación y seguimiento de guardias del sanatorio." icon={CalendarDays} /></Shell></Protected></Route>
    <Route path="/inventario"><Protected user={shellUser}><Shell user={shellUser}><PlaceholderPage kind="Inventario" title="Inventario" description="Control de insumos, stock crítico y movimientos." icon={PackageOpen} /></Shell></Protected></Route>
    <Route path="/instructivos"><Protected user={shellUser}><Shell user={shellUser}><PlaceholderPage kind="Instructivos" title="Instructivos" description="Guías internas para resolver cada proceso con claridad." icon={FileText} /></Shell></Protected></Route>
    <Route path="/configuracion"><Protected user={shellUser}><Shell user={shellUser}><ConfigPage /></Shell></Protected></Route>
    <Route path="/usuarios"><Protected user={shellUser}><Shell user={shellUser}><UsersPage /></Shell></Protected></Route>
    <Route><Protected user={shellUser}><Shell user={shellUser}><StatusMessage title="Página no encontrada" detail="El enlace que buscás no existe dentro del sistema." action={() => window.history.back()} /></Shell></Protected></Route>
  </Switch>;
}

function App() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  return <WouterRouter base={basePath}><QueryClientProvider client={queryClient}><TooltipProvider><ErrorBoundary><Router /></ErrorBoundary><Toaster /></TooltipProvider></QueryClientProvider></WouterRouter>;
}

export default App;
