import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { esUY } from '@clerk/localizations';
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
  useCreateAgendaItem,
  useDeleteAgendaItem,
  useGetCurrentUser,
  useGetDashboardSummary,
  useGetRecentActivity,
  useListAgendaItems,
  useListSectors,
  useUpdateAgendaItem,
  type AgendaItem,
  type AgendaItemInput,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

const queryClient = new QueryClient();
const agendaTypes = ['cheque', 'vencimiento', 'tarea', 'pago', 'otro'] as const;
type AgendaType = typeof agendaTypes[number];
type ModalMode = { open: boolean; item?: AgendaItem };

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const navItems = [
  { href: '/dashboard', label: 'Resumen', icon: LayoutDashboard },
  { href: '/administracion', label: 'Administración', icon: ClipboardList },
  { href: '/liquidacion', label: 'Liquidación', icon: FileText },
  { href: '/guardias', label: 'Guardias', icon: CalendarDays },
  { href: '/inventario', label: 'Inventario', icon: PackageOpen },
  { href: '/instructivos', label: 'Instructivos', icon: Archive },
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

function Shell({ children, user }: { children: ReactNode; user?: { name?: string; email?: string; role?: string } }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const nav = <nav style={{ display: 'grid', gap: 3 }}>
    <div className="nav-label">Operación</div>
    {navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`nav-item ${location === href ? 'active' : ''}`} data-testid={`link-nav-${label.toLowerCase()}`}><Icon className="nav-icon" /><span>{label}</span></Link>)}
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
      </div>
    </aside>
    {mobileOpen && <div className="modal-backdrop" style={{ display: 'block', padding: 0 }} onClick={() => setMobileOpen(false)}><aside className="sidebar" style={{ display: 'flex', minHeight: '100dvh', width: 248 }} onClick={(event) => event.stopPropagation()}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><Brand /><button className="btn btn-icon btn-quiet" onClick={() => setMobileOpen(false)} data-testid="button-close-menu"><X size={16} /></button></div>{nav}</aside></div>}
    <div className="main-column">
      <header className="topbar">
        <button className="btn btn-quiet btn-icon mobile-menu" onClick={() => setMobileOpen(true)} data-testid="button-open-menu"><Menu size={18} /></button>
        <div className="topbar-meta"><span className="font-mono">SANATORIO SALVADOR</span><span style={{ margin: '0 8px', opacity: .35 }}>/</span><span>Operación interna</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><div style={{ textAlign: 'right' }}><div style={{ fontSize: 12, fontWeight: 700 }}>{user?.name || 'Sesión interna'}</div><div style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>{user?.email || 'Panel operativo'}</div></div><div className="avatar" data-testid="avatar-current-user">{initials(user?.name)}</div></div>
      </header>
      {children}
    </div>
  </div>;
}

function useCurrentUserSafe() {
  return useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false } });
}

function Dashboard({ user }: { user?: { name?: string; email?: string; role?: string } }) {
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
  const { isLoaded, isSignedIn } = useAuth();
  useEffect(() => { if (isLoaded && isSignedIn) setLocation('/dashboard'); }, [isLoaded, isSignedIn, setLocation]);
  return <div className="auth-layout"><section className="auth-aside"><Brand /><div className="auth-signal">Mesa operativa · Acceso interno</div><h1>El día claro.<br /><span style={{ color: 'hsl(var(--sidebar-primary))' }}>La operación</span> en orden.</h1><p>Un espacio de trabajo preciso para quienes sostienen el Sanatorio Salvador todos los días.</p></section><section className="auth-panel"><div className="auth-box"><div className="eyebrow">Sistema interno</div><h2>Bienvenido al equipo.</h2><p>Ingresá para revisar la agenda, los sectores y las prioridades de hoy.</p><div style={{ display: 'grid', gap: 10, marginTop: 28 }}><button className="btn btn-primary" onClick={() => setLocation('/sign-in')} data-testid="button-welcome-sign-in">Ingresar al sistema <ArrowUpRight size={15} /></button><button className="btn btn-quiet" onClick={() => setLocation('/sign-up')} data-testid="button-welcome-sign-up">Solicitar acceso</button></div><div className="auth-foot">Acceso reservado para personal autorizado</div></div></section></div>;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: import.meta.env.BASE_URL,
    logoImageUrl: `${window.location.origin}${import.meta.env.BASE_URL}logo.svg`,
  },
  variables: {
    colorPrimary: '#16817a',
    colorForeground: '#27434a',
    colorMutedForeground: '#6b7f82',
    colorDanger: '#bf4f4f',
    colorBackground: '#fffdf9',
    colorInput: '#fffdf9',
    colorInputForeground: '#27434a',
    colorNeutral: '#dfd9ce',
    fontFamily: 'DM Sans, sans-serif',
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fffdf9] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#27434a] font-bold',
    headerSubtitle: 'text-[#6b7f82]',
    socialButtonsBlockButtonText: 'text-[#27434a]',
    formFieldLabel: 'text-[#27434a]',
    footerActionLink: 'text-[#16817a] font-bold',
    footerActionText: 'text-[#6b7f82]',
    dividerText: 'text-[#6b7f82]',
    identityPreviewEditButton: 'text-[#16817a]',
    formFieldSuccessText: 'text-[#16817a]',
    alertText: 'text-[#bf4f4f]',
    logoBox: 'mb-4',
    logoImage: 'max-h-10',
    socialButtonsBlockButton: 'border-[#dfd9ce] bg-[#fffdf9]',
    formButtonPrimary: 'bg-[#16817a] hover:bg-[#126d67] text-white',
    formFieldInput: 'border-[#dfd9ce] bg-[#fffdf9] text-[#27434a]',
    footerAction: 'bg-transparent',
    dividerLine: 'bg-[#dfd9ce]',
    alert: 'bg-[#fff2f0] border-[#efc6c0]',
    otpCodeFieldInput: 'border-[#dfd9ce] bg-[#fffdf9] text-[#27434a]',
    formFieldRow: 'mb-4',
    main: 'bg-transparent',
  },
};

function ClerkCacheInvalidator() {
  const { addListener } = useClerk();
  const cache = useQueryClient();
  const previousUser = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const userId = user?.id ?? null;
    if (previousUser.current !== undefined && previousUser.current !== userId) cache.clear();
    previousUser.current = userId;
  }), [addListener, cache]);
  return null;
}

function AuthPage({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  return <div className="auth-layout"><section className="auth-aside"><Brand /><div className="auth-signal">Sanatorio Salvador · Área protegida</div><h1>Una forma más <span style={{ color: 'hsl(var(--sidebar-primary))' }}>serena</span> de trabajar.</h1><p>La información que sostiene cada guardia, cada pago y cada sector, en el momento justo.</p></section><section className="auth-panel"><div className="auth-box clerk-card-wrap">{mode === 'sign-in' ? <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /> : <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />}</div></section></div>;
}

function Protected({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  useEffect(() => { if (isLoaded && !isSignedIn) setLocation('/'); }, [isLoaded, isSignedIn, setLocation]);
  if (!isLoaded || !isSignedIn) return <div className="auth-layout"><div className="skeleton" style={{ width: 260, height: 18, margin: 'auto' }} /></div>;
  return <>{children}</>;
}

function Router() {
  const currentUser = useCurrentUserSafe();
  const shellUser = currentUser.data;
  return <Switch>
    <Route path="/sign-in/*?"><AuthPage mode="sign-in" /></Route>
    <Route path="/sign-up/*?"><AuthPage mode="sign-up" /></Route>
    <Route path="/"><Welcome /></Route>
    <Route path="/dashboard"><Protected><Shell user={shellUser}><Dashboard user={shellUser} /></Shell></Protected></Route>
    <Route path="/administracion"><Protected><Shell user={shellUser}><AgendaPage /></Shell></Protected></Route>
    <Route path="/liquidacion"><Protected><Shell user={shellUser}><PlaceholderPage kind="Liquidación" title="Liquidación" description="Un espacio para centralizar el seguimiento de liquidaciones." icon={FileText} /></Shell></Protected></Route>
    <Route path="/guardias"><Protected><Shell user={shellUser}><PlaceholderPage kind="Guardias" title="Guardias" description="Planificación y seguimiento de guardias del sanatorio." icon={CalendarDays} /></Shell></Protected></Route>
    <Route path="/inventario"><Protected><Shell user={shellUser}><PlaceholderPage kind="Inventario" title="Inventario" description="Control de insumos, stock crítico y movimientos." icon={PackageOpen} /></Shell></Protected></Route>
    <Route path="/instructivos"><Protected><Shell user={shellUser}><PlaceholderPage kind="Instructivos" title="Instructivos" description="Guías internas para resolver cada proceso con claridad." icon={FileText} /></Shell></Protected></Route>
    <Route path="/configuracion"><Protected><Shell user={shellUser}><ConfigPage /></Shell></Protected></Route>
    <Route><Protected><Shell user={shellUser}><StatusMessage title="Página no encontrada" detail="El enlace que buscás no existe dentro del sistema." action={() => window.history.back()} /></Shell></Protected></Route>
  </Switch>;
}

function App() {
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  return <WouterRouter base={basePath}><ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={esUY}><QueryClientProvider client={queryClient}><ClerkCacheInvalidator /><TooltipProvider><ErrorBoundary><Router /></ErrorBoundary><Toaster /></TooltipProvider></QueryClientProvider></ClerkProvider></WouterRouter>;
}

export default App;
