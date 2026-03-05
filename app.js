/* ===================================================================
   TABLEAU INTELLIGENCE HUB — Häcker Küchen  (ONLINE VERSION)
   Supabase Auth + Database · Vercel Hosting
   3 Themes · PDF Export · Team Filters · Strong Accents
   =================================================================== */

/* === SUPABASE CLIENT === */
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentAuthUser = null;

/* === CONFIG & CONSTANTS === */
const STORAGE_KEYS = {
  reports: 'reports',
  datasources: 'datasources',
  users: 'users',
  categoryNotes: 'category_notes',
  theme: 'tih_theme',
  rollout: 'rollout',
  teams: 'teams',
  categories: 'categories',
  workbooksToday: 'workbooks_today',
  workbooksPast: 'workbooks_past',
  reportsPast: 'reports_past',
  reportNotes: 'report_notes'
};

const DEFAULT_CATEGORIES = {
  operativer_einkauf:      { label: 'Operativer Einkauf',      icon: '\u2699\uFE0F', color: '#3B82F6' },
  strategischer_einkauf:   { label: 'Strategischer Einkauf',   icon: '\uD83C\uDFAF', color: '#A855F7' },
  controlling:             { label: 'Controlling',             icon: '\uD83D\uDCCA', color: '#14B8A6' },
  gesamter_einkauf:        { label: 'Gesamter Einkauf',        icon: '\uD83C\uDFE2', color: '#D4B039' },
  angrenzende_abteilungen: { label: 'Angrenzende Abteilungen', icon: '\uD83D\uDD17', color: '#F43F5E' }
};

const CATEGORY_ICONS = ['\u2699\uFE0F', '\uD83C\uDFAF', '\uD83D\uDCCA', '\uD83C\uDFE2', '\uD83D\uDD17', '\uD83D\uDCC8', '\uD83D\uDEE0\uFE0F', '\uD83D\uDCB0', '\uD83D\uDCE6', '\uD83D\uDD0D', '\uD83D\uDCA1', '\uD83C\uDF10', '\u2B50', '\uD83D\uDE80', '\uD83D\uDCC1'];
const CATEGORY_COLORS = ['#3B82F6', '#A855F7', '#14B8A6', '#D4B039', '#F43F5E', '#F97316', '#EC4899', '#6366F1', '#0EA5E9', '#84CC16'];

/** Get categories from Supabase or defaults */
function getCategories() {
  return getData(STORAGE_KEYS.categories) || JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
}

/** Save categories to Supabase */
function saveCategories(cats) {
  saveData(STORAGE_KEYS.categories, cats);
}

/** Backwards-compatible CATEGORIES getter for existing code */
let CATEGORIES = DEFAULT_CATEGORIES;

const STATUSES = {
  idee:            { label: 'Idee',            css: 'badge-idee' },
  in_planung:      { label: 'In Planung',      css: 'badge-in_planung' },
  in_entwicklung:  { label: 'In Entwicklung',   css: 'badge-in_entwicklung' },
  aktiv:           { label: 'Aktiv',            css: 'badge-aktiv' },
  deprecated:      { label: 'Deprecated',       css: 'badge-deprecated' }
};

const PRIORITIES = {
  hoch:    { label: 'Hoch',    dot: 'priority-dot-hoch' },
  mittel:  { label: 'Mittel',  dot: 'priority-dot-mittel' },
  niedrig: { label: 'Niedrig', dot: 'priority-dot-niedrig' }
};

const ROLES = {
  operativer_einkäufer:    { label: 'Operativer Einkäufer',    color: '#3B82F6' },
  strategischer_einkäufer: { label: 'Strategischer Einkäufer', color: '#A855F7' },
  einkaufsleitung:         { label: 'Einkaufsleitung',         color: '#D4B039' },
  controlling:             { label: 'Controlling',             color: '#14B8A6' },
  angrenzende_abteilung:   { label: 'Angrenzende Abteilung',  color: '#F43F5E' }
};

const DS_TYPES = {
  sap:      { label: 'SAP',      icon: '\uD83D\uDD37' },
  excel:    { label: 'Excel',    icon: '\uD83D\uDCD7' },
  database: { label: 'Datenbank', icon: '\uD83D\uDDC4\uFE0F' },
  api:      { label: 'API',      icon: '\uD83D\uDD0C' },
  manual:   { label: 'Manuell',  icon: '\u270D\uFE0F' },
  other:    { label: 'Sonstige', icon: '\uD83D\uDCE6' }
};

const STATUS_ORDER = ['idee', 'in_planung', 'in_entwicklung', 'aktiv', 'deprecated'];
const CATEGORY_TARGET = 6;
const MAX_REPORTS_LIMIT = 30;

/** Category colors as raw hex strings for inline CSS and charts */
function getCatColor(cat) {
  const cats = getCategories();
  if (cats[cat] && cats[cat].color) return cats[cat].color;
  const defaultMap = {
    operativer_einkauf: '#3B82F6',
    strategischer_einkauf: '#A855F7',
    controlling: '#14B8A6',
    gesamter_einkauf: '#D4B039',
    angrenzende_abteilungen: '#F43F5E'
  };
  return defaultMap[cat] || '#64748B';
}

/** Refresh the global CATEGORIES variable from cache */
function refreshCategories() {
  CATEGORIES = getCategories();
}

/** Runtime state for filters, toggles, charts */
let state = {
  currentView: 'dashboard',
  reportsViewMode: 'grid',
  reportFilters: { search: '', categories: [], statuses: [], priority: '', userId: '', datasourceId: '', workbookId: '' },
  reportsPastFilters: { search: '', workbookId: '' },
  selectedUserId: null,
  userTab: 'primär',
  sortColumn: null,
  sortDir: 'asc',
  chartInstances: {}
};

/* === DATA LAYER (Supabase-backed with in-memory cache) === */

/** In-memory cache — loaded from Supabase on login */
let dataCache = {};

/** Read from cache (returns deep copy for safe mutation, same as JSON.parse) */
function getData(key) {
  const val = dataCache[key];
  if (val === undefined || val === null) return null;
  return JSON.parse(JSON.stringify(val));
}

/** Write to cache AND persist to Supabase in background */
function saveData(key, data) {
  dataCache[key] = data;
  const userId = currentAuthUser ? currentAuthUser.id : null;
  supabaseClient.from('app_store')
    .upsert({
      store_key: key,
      data: data,
      updated_at: new Date().toISOString(),
      updated_by: userId
    }, { onConflict: 'store_key' })
    .then(({ error }) => { if (error) console.error('Supabase save error:', error); });
}

/** Load ALL data from Supabase into the cache */
async function loadAllData() {
  const { data, error } = await supabaseClient.from('app_store').select('*');
  if (error) { console.error('Load error:', error); return; }
  dataCache = {};
  if (data) data.forEach(row => { dataCache[row.store_key] = row.data; });
}

function generateId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxx-xxxx-xxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));
}

/** Completeness score 0–5 for a report */
function getCompleteness(r) {
  let s = 0;
  if (r.description && r.description.trim()) s++;
  if (r.data_source_ids && r.data_source_ids.length) s++;
  if (r.user_assignments && r.user_assignments.length) s++;
  if (r.use_cases && r.use_cases.length) s++;
  if (r.refresh_cycle && r.refresh_cycle.trim()) s++;
  return s;
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

/* === SEED DATA === */

async function seedIfEmpty() {
  if (getData(STORAGE_KEYS.reports)) return;

  const ds = [
    { id: generateId(), name: 'SAP ERP', type: 'sap', owner: 'IT / Einkauf', description: 'Zentrales ERP-System' },
    { id: generateId(), name: 'Excel-Lieferantenliste', type: 'excel', owner: 'Strategischer Einkauf', description: 'Manuelle Lieferantenpflege' },
    { id: generateId(), name: 'Marktdaten-API', type: 'api', owner: 'Controlling', description: 'Externe Marktpreisdaten' },
    { id: generateId(), name: 'Excel-Verträge', type: 'excel', owner: 'Einkaufsleitung', description: 'Rahmenvertragsdokumentation' },
    { id: generateId(), name: 'Excel-Budget', type: 'excel', owner: 'Controlling', description: 'Budgetplanung & Forecasts' }
  ];
  saveData(STORAGE_KEYS.datasources, ds);

  const users = [
    { id: generateId(), name: 'Thomas Brandt', role: 'einkaufsleitung', department: 'Einkauf' },
    { id: generateId(), name: 'Sarah Müller', role: 'strategischer_einkäufer', department: 'Strategischer Einkauf' },
    { id: generateId(), name: 'Markus Klein', role: 'operativer_einkäufer', department: 'Operativer Einkauf' },
    { id: generateId(), name: 'Julia Hoffmann', role: 'controlling', department: 'Controlling' },
    { id: generateId(), name: 'Andreas Weber', role: 'angrenzende_abteilung', department: 'Produktmanagement' }
  ];
  saveData(STORAGE_KEYS.users, users);

  const D = (n) => ds.find(d => d.name.includes(n)).id;
  const U = (n) => users.find(u => u.name.includes(n)).id;
  const now = new Date().toISOString();

  const reports = [
    { id: generateId(), title: 'Lieferantenbewertung Übersicht', description: 'Zentrale Bewertungsübersicht aller aktiven Lieferanten mit Scorecards und Trendanalysen.', category: 'strategischer_einkauf', status: 'aktiv', priority: 'hoch', refresh_cycle: 'monatlich', tableau_url: '', jira_ticket: 'EINK-101', jira_url: '', data_source_ids: [D('SAP'), D('Lieferanten')], user_assignments: [{ user_id: U('Sarah'), relevance: 'primär' }, { user_id: U('Thomas'), relevance: 'sekundär' }], use_cases: [{ id: generateId(), title: 'Lieferantenranking', question: 'Welche Lieferanten performen am besten?', description: '' }], created_at: now, updated_at: now },
    { id: generateId(), title: 'Bestellvolumen nach Warengruppe', description: 'Detaillierte Aufschlüsselung des Bestellvolumens nach Warengruppen und Zeiträumen.', category: 'controlling', status: 'aktiv', priority: 'hoch', refresh_cycle: 'wöchentlich', tableau_url: '', jira_ticket: 'EINK-102', jira_url: '', data_source_ids: [D('SAP')], user_assignments: [{ user_id: U('Julia'), relevance: 'primär' }, { user_id: U('Thomas'), relevance: 'sekundär' }], use_cases: [], created_at: now, updated_at: now },
    { id: generateId(), title: 'Liefertreue-Cockpit', description: 'Echtzeit-Überwachung der Liefertreue aller Lieferanten mit Alerts bei Abweichungen.', category: 'operativer_einkauf', status: 'aktiv', priority: 'hoch', refresh_cycle: 'täglich', tableau_url: '', jira_ticket: 'EINK-103', jira_url: '', data_source_ids: [D('SAP')], user_assignments: [{ user_id: U('Markus'), relevance: 'primär' }, { user_id: U('Thomas'), relevance: 'info' }], use_cases: [], created_at: now, updated_at: now },
    { id: generateId(), title: 'Preisindex-Monitor', description: 'Tracking relevanter Preisindizes und deren Auswirkung auf die Beschaffungskosten.', category: 'strategischer_einkauf', status: 'in_entwicklung', priority: 'hoch', refresh_cycle: 'wöchentlich', tableau_url: '', jira_ticket: 'EINK-104', jira_url: '', data_source_ids: [D('SAP'), D('Marktdaten')], user_assignments: [{ user_id: U('Sarah'), relevance: 'primär' }, { user_id: U('Julia'), relevance: 'sekundär' }], use_cases: [], created_at: now, updated_at: now },
    { id: generateId(), title: 'Rahmenvertragsübersicht', description: 'Übersicht aller laufenden Rahmenverträge inkl. Laufzeiten und Konditionen.', category: 'gesamter_einkauf', status: 'aktiv', priority: 'mittel', refresh_cycle: 'monatlich', tableau_url: '', jira_ticket: '', jira_url: '', data_source_ids: [D('SAP'), D('Verträge')], user_assignments: [{ user_id: U('Thomas'), relevance: 'primär' }], use_cases: [], created_at: now, updated_at: now },
    { id: generateId(), title: 'Wareneingang & Reklamationen', description: 'Tagesaktuelle Auswertung von Wareneingängen und zugehörigen Reklamationen.', category: 'operativer_einkauf', status: 'aktiv', priority: 'mittel', refresh_cycle: 'täglich', tableau_url: '', jira_ticket: 'EINK-106', jira_url: '', data_source_ids: [D('SAP')], user_assignments: [{ user_id: U('Markus'), relevance: 'primär' }, { user_id: U('Thomas'), relevance: 'info' }], use_cases: [], created_at: now, updated_at: now },
    { id: generateId(), title: 'Spend-Analyse Kategoriensicht', description: 'Analyse der Einkaufsausgaben nach Kategorien mit Savings-Potenzial.', category: 'controlling', status: 'in_planung', priority: 'hoch', refresh_cycle: '', tableau_url: '', jira_ticket: '', jira_url: '', data_source_ids: [D('SAP')], user_assignments: [{ user_id: U('Julia'), relevance: 'primär' }, { user_id: U('Sarah'), relevance: 'sekundär' }], use_cases: [], created_at: now, updated_at: now },
    { id: generateId(), title: 'Lieferantenstamm-Qualität', description: 'Analyse der Datenqualität im Lieferantenstamm mit Bereinigungsempfehlungen.', category: 'strategischer_einkauf', status: 'idee', priority: 'niedrig', refresh_cycle: '', tableau_url: '', jira_ticket: '', jira_url: '', data_source_ids: [D('SAP')], user_assignments: [], use_cases: [], created_at: now, updated_at: now },
    { id: generateId(), title: 'Einkaufsbudget vs. Ist', description: 'Soll/Ist-Vergleich des Einkaufsbudgets mit Forecasting und Abweichungsanalyse.', category: 'angrenzende_abteilungen', status: 'aktiv', priority: 'hoch', refresh_cycle: 'monatlich', tableau_url: '', jira_ticket: 'EINK-109', jira_url: '', data_source_ids: [D('SAP'), D('Budget')], user_assignments: [{ user_id: U('Julia'), relevance: 'primär' }, { user_id: U('Andreas'), relevance: 'primär' }], use_cases: [], created_at: now, updated_at: now },
    { id: generateId(), title: 'Neue Lieferanten Pipeline', description: 'Tracking neuer Lieferanten im Onboarding-Prozess mit Statusübersicht.', category: 'strategischer_einkauf', status: 'in_planung', priority: 'mittel', refresh_cycle: '', tableau_url: '', jira_ticket: '', jira_url: '', data_source_ids: [D('Lieferanten')], user_assignments: [{ user_id: U('Sarah'), relevance: 'primär' }], use_cases: [], created_at: now, updated_at: now }
  ];
  saveData(STORAGE_KEYS.reports, reports);
  saveData(STORAGE_KEYS.categoryNotes, {});

  // Seed categories
  saveData(STORAGE_KEYS.categories, JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)));

  // Seed teams
  saveData(STORAGE_KEYS.teams, ['Einkauf', 'Strategischer Einkauf', 'Operativer Einkauf', 'Controlling', 'Produktmanagement']);

  // Seed workbooks
  const wbToday = [
    { id: generateId(), name: 'Einkaufscontrolling', color: '#3B82F6', description: 'Controlling-relevante Auswertungen', created_at: now },
    { id: generateId(), name: 'Lieferantenmanagement', color: '#A855F7', description: 'Lieferantenbezogene Reports', created_at: now },
    { id: generateId(), name: 'Operative Beschaffung', color: '#14B8A6', description: 'Tagesgeschaeft Einkauf', created_at: now }
  ];
  saveData(STORAGE_KEYS.workbooksToday, wbToday);
  reports.forEach(r => {
    if (r.category === 'controlling' || r.category === 'angrenzende_abteilungen') r.workbook_id = wbToday[0].id;
    else if (r.category === 'strategischer_einkauf') r.workbook_id = wbToday[1].id;
    else r.workbook_id = wbToday[2].id;
    r.usage_count = 0;
  });

  saveData(STORAGE_KEYS.workbooksPast, []);
  saveData(STORAGE_KEYS.reportsPast, []);
  saveData(STORAGE_KEYS.reportNotes, {});

  // Seed rollout data
  const rolloutData = {};
  reports.forEach(r => {
    if (r.status === 'aktiv') rolloutData[r.id] = { phase: 'abgeschlossen', go_live: '' };
    else if (r.status === 'in_entwicklung') rolloutData[r.id] = { phase: 'pilotierung', go_live: '' };
    else if (r.status === 'in_planung') rolloutData[r.id] = { phase: 'geplant', go_live: '' };
    else rolloutData[r.id] = { phase: 'geplant', go_live: '' };
  });
  saveData(STORAGE_KEYS.rollout, rolloutData);
}

/* === THEME === */

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEYS.theme, theme);
  document.querySelectorAll('.theme-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === theme);
  });
  // Re-render current view to update chart colors
  if (state.currentView === 'dashboard') renderDashboard();
}

function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEYS.theme) || 'dark';
  setTheme(saved);
}

/* === ROUTER === */

function navigateTo(viewName) {
  refreshCategories();
  document.querySelectorAll('.view').forEach(v => v.classList.remove('view-active'));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add('view-active');

  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.toggle('active', l.dataset.view === viewName));

  state.currentView = viewName;
  window.location.hash = viewName;

  const titles = { dashboard: 'Dashboard', reports: 'Auswertungen Heute', reports_past: 'Auswertungen Vergangenheit', report_stats: 'Auswertungs-Statistik', users: 'Nutzer', datasources: 'Datenquellen', categories: 'Kategorien', rollout: 'Rollout-Planung', consolidation: 'Konsolidierung' };
  document.getElementById('navbar-title').textContent = titles[viewName] || viewName;

  const renderers = { dashboard: renderDashboard, reports: renderReports, reports_past: renderReportsPast, report_stats: renderReportStats, users: renderUsers, datasources: renderDatasources, categories: renderCategories, rollout: renderRollout, consolidation: renderConsolidation };
  if (renderers[viewName]) renderers[viewName]();
}

/* === RENDER: DASHBOARD === */

function renderDashboard() {
  const reports = getData(STORAGE_KEYS.reports) || [];
  const datasources = getData(STORAGE_KEYS.datasources) || [];

  const activeCount = reports.filter(r => r.status === 'aktiv').length;
  const avgComp = reports.length ? (reports.reduce((s, r) => s + getCompleteness(r), 0) / reports.length).toFixed(1) : 0;
  const highP = reports.filter(r => r.priority === 'hoch').length;

  const statusCounts = {};
  STATUS_ORDER.forEach(s => statusCounts[s] = 0);
  reports.forEach(r => { if (statusCounts[r.status] !== undefined) statusCounts[r.status]++; });

  const catCounts = {};
  Object.keys(CATEGORIES).forEach(c => catCounts[c] = 0);
  reports.forEach(r => { if (catCounts[r.category] !== undefined) catCounts[r.category]++; });

  const complete = reports.filter(r => getCompleteness(r) >= 4).length;
  const incomplete = reports.length - complete;

  const dsUsage = {};
  datasources.forEach(d => dsUsage[d.id] = { name: d.name, count: 0 });
  reports.forEach(r => (r.data_source_ids || []).forEach(did => { if (dsUsage[did]) dsUsage[did].count++; }));
  const topDs = Object.values(dsUsage).sort((a, b) => b.count - a.count);
  const maxDs = topDs.length ? topDs[0].count : 1;

  const recent = [...reports].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 5);

  const el = document.getElementById('dashboard-content');
  el.innerHTML = `
    <div class="view-header" style="text-align:center;margin-bottom:40px">
      <h1 class="view-title" style="font-size:42px;margin-bottom:8px">Tableau Intelligence Hub</h1>
      <p class="view-subtitle">Strategische Steuerung aller Einkaufs-Auswertungen bei Häcker Küchen</p>
    </div>
    <div class="kpi-row">
      <div class="kpi-card"><div class="kpi-card-icon" style="background:rgba(212,176,57,0.12);color:var(--accent)">\uD83D\uDCCA</div><div class="kpi-card-value" data-count="${reports.length}">0</div><div class="kpi-card-label">Auswertungen gesamt</div></div>
      <div class="kpi-card"><div class="kpi-card-icon" style="background:rgba(34,197,94,0.12);color:var(--success)">\u2705</div><div class="kpi-card-value" data-count="${activeCount}">0</div><div class="kpi-card-label">Aktive Auswertungen</div></div>
      <div class="kpi-card"><div class="kpi-card-icon" style="background:rgba(244,63,94,0.12);color:var(--rose)">\uD83D\uDD25</div><div class="kpi-card-value" data-count="${highP}">0</div><div class="kpi-card-label">Hohe Priorität</div></div>
      <div class="kpi-card"><div class="kpi-card-icon" style="background:rgba(168,85,247,0.12);color:var(--purple)">\uD83D\uDCC8</div><div class="kpi-card-value" data-count="${avgComp}" data-decimal="true">0</div><div class="kpi-card-label">Ø Vollständigkeit (von 5)</div></div>
    </div>
    <div class="charts-row">
      <div class="chart-card"><div class="chart-card-title">Auswertungen nach Kategorie</div><div class="chart-wrap"><canvas id="chart-categories"></canvas></div></div>
      <div class="chart-card"><div class="chart-card-title">Vollständigkeit</div><div class="chart-wrap"><canvas id="chart-completeness"></canvas></div></div>
    </div>
    <div class="dashboard-section">
      <div class="dashboard-section-title">Status-Pipeline</div>
      <div class="pipeline">${STATUS_ORDER.map((s, i) => `<div class="pipeline-stage"><div class="pipeline-stage-box"><div class="pipeline-stage-count">${statusCounts[s]}</div><div class="pipeline-stage-label">${STATUSES[s].label}</div></div></div>${i < STATUS_ORDER.length - 1 ? '<div class="pipeline-arrow">\u2192</div>' : ''}`).join('')}</div>
    </div>
    <div class="bottom-row">
      <div class="dashboard-section">
        <div class="dashboard-section-title">Top Datenquellen</div>
        <div class="card-flat"><div class="datasource-rank-list">${topDs.map(d => `<div class="datasource-rank-item"><span class="datasource-rank-name">${d.name}</span><div class="datasource-rank-bar-wrap"><div class="datasource-rank-bar" style="width:${(d.count / maxDs) * 100}%"></div></div><span class="datasource-rank-count">${d.count}</span></div>`).join('')}</div></div>
      </div>
      <div class="dashboard-section">
        <div class="dashboard-section-title">Letzte Änderungen</div>
        <div class="recent-list">${recent.map(r => `<div class="recent-item" data-report-id="${r.id}"><div class="recent-item-cat" style="background:${getCatColor(r.category)}"></div><span class="recent-item-title">${r.title}</span><span class="badge ${STATUSES[r.status]?.css || ''}">${STATUSES[r.status]?.label || r.status}</span></div>`).join('')}</div>
      </div>
    </div>`;

  animateCountUps();
  renderCategoryChart(catCounts);
  renderCompletenessChart(complete, incomplete);

  el.querySelectorAll('.recent-item').forEach(item => {
    item.addEventListener('click', () => openReportModal(item.dataset.reportId));
  });
}

function animateCountUps() {
  document.querySelectorAll('.kpi-card-value[data-count]').forEach(el => {
    const target = parseFloat(el.dataset.count);
    const dec = el.dataset.decimal === 'true';
    const dur = 800;
    const start = performance.now();
    function step(now) {
      const p = Math.min((now - start) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = dec ? (target * e).toFixed(1) : Math.round(target * e);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}

/* === RENDER: REPORTS === */

function renderReports() {
  const reports = getData(STORAGE_KEYS.reports) || [];
  const datasources = getData(STORAGE_KEYS.datasources) || [];
  const users = getData(STORAGE_KEYS.users) || [];
  const workbooks = getData(STORAGE_KEYS.workbooksToday) || [];
  const f = state.reportFilters;

  let filtered = reports.filter(r => {
    if (f.search && !r.title.toLowerCase().includes(f.search.toLowerCase()) && !(r.description || '').toLowerCase().includes(f.search.toLowerCase())) return false;
    if (f.categories.length && !f.categories.includes(r.category)) return false;
    if (f.statuses.length && !f.statuses.includes(r.status)) return false;
    if (f.priority && r.priority !== f.priority) return false;
    if (f.userId && !(r.user_assignments || []).some(a => a.user_id === f.userId)) return false;
    if (f.datasourceId && !(r.data_source_ids || []).includes(f.datasourceId)) return false;
    if (f.workbookId && r.workbook_id !== f.workbookId) return false;
    return true;
  });

  if (state.sortColumn && state.reportsViewMode === 'table') {
    filtered.sort((a, b) => {
      let va = a[state.sortColumn] || '', vb = b[state.sortColumn] || '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      return va < vb ? (state.sortDir === 'asc' ? -1 : 1) : va > vb ? (state.sortDir === 'asc' ? 1 : -1) : 0;
    });
  }

  const el = document.getElementById('reports-content');
  el.innerHTML = `
    <div class="view-header"><h1 class="view-title">Auswertungen Heute</h1><p class="view-subtitle">${reports.length} Auswertungen insgesamt</p></div>
    <div class="workbook-pills">
      <button class="workbook-pill ${!f.workbookId ? 'active' : ''}" data-wb="" type="button">Alle</button>
      ${workbooks.map(wb => `<button class="workbook-pill ${f.workbookId === wb.id ? 'active' : ''}" data-wb="${wb.id}" type="button" style="border-color:${f.workbookId === wb.id ? wb.color : ''}"><span class="workbook-pill-dot" style="background:${wb.color}"></span>${wb.name}<span class="workbook-pill-count">${reports.filter(r => r.workbook_id === wb.id).length}</span></button>`).join('')}
      <button class="btn btn-ghost btn-sm" id="btn-new-workbook-today" type="button">+ Workbook</button>
    </div>
    <div class="filter-bar">
      <div class="filter-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input type="text" id="report-search" placeholder="Suchen\u2026" value="${f.search}"></div>
      <div class="filter-dropdown" id="filter-cat-dd"><button class="filter-dropdown-btn ${f.categories.length ? 'has-selection' : ''}" type="button">Kategorie ${f.categories.length ? `(${f.categories.length})` : ''} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button><div class="filter-dropdown-menu" id="filter-cat-menu">${Object.entries(CATEGORIES).map(([k, v]) => `<label class="filter-dropdown-item ${f.categories.includes(k) ? 'selected' : ''}"><input type="checkbox" value="${k}" ${f.categories.includes(k) ? 'checked' : ''}>${v.label}</label>`).join('')}</div></div>
      <div class="filter-pills" id="status-pills">${STATUS_ORDER.map(s => `<button class="filter-pill ${f.statuses.includes(s) ? 'active' : ''}" data-status="${s}" type="button">${STATUSES[s].label}</button>`).join('')}</div>
      <div class="filter-dropdown" id="filter-prio-dd"><button class="filter-dropdown-btn ${f.priority ? 'has-selection' : ''}" type="button">Priorität <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button><div class="filter-dropdown-menu"><div class="filter-dropdown-item ${!f.priority ? 'selected' : ''}" data-priority="">Alle</div>${Object.entries(PRIORITIES).map(([k, v]) => `<div class="filter-dropdown-item ${f.priority === k ? 'selected' : ''}" data-priority="${k}">${v.label}</div>`).join('')}</div></div>
      <div class="filter-dropdown" id="filter-user-dd"><button class="filter-dropdown-btn ${f.userId ? 'has-selection' : ''}" type="button">Nutzer <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button><div class="filter-dropdown-menu"><div class="filter-dropdown-item ${!f.userId ? 'selected' : ''}" data-user="">Alle</div>${users.map(u => `<div class="filter-dropdown-item ${f.userId === u.id ? 'selected' : ''}" data-user="${u.id}">${u.name}</div>`).join('')}</div></div>
      <div class="view-toggle">
        <button class="view-toggle-btn ${state.reportsViewMode === 'grid' ? 'active' : ''}" data-mode="grid" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> Karten</button>
        <button class="view-toggle-btn ${state.reportsViewMode === 'table' ? 'active' : ''}" data-mode="table" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg> Tabelle</button>
      </div>
    </div>
    <div id="reports-list">${filtered.length === 0 ? renderEmptyState() : (state.reportsViewMode === 'grid' ? renderGrid(filtered, users) : renderTable(filtered, users))}</div>`;

  // Workbook pill events
  el.querySelectorAll('.workbook-pill').forEach(p => p.addEventListener('click', () => { state.reportFilters.workbookId = p.dataset.wb; renderReports(); }));
  const newWbBtn = el.querySelector('#btn-new-workbook-today');
  if (newWbBtn) newWbBtn.addEventListener('click', () => showWorkbookModal(STORAGE_KEYS.workbooksToday, null, renderReports));

  // Archive buttons (table view)
  el.querySelectorAll('.table-action-btn[data-action="archive"]').forEach(b => b.addEventListener('click', () => archiveReport(b.dataset.id)));

  // Events
  document.getElementById('report-search').addEventListener('input', e => { state.reportFilters.search = e.target.value; renderReports(); });

  const catDD = document.getElementById('filter-cat-dd');
  catDD.querySelector('.filter-dropdown-btn').addEventListener('click', () => catDD.querySelector('.filter-dropdown-menu').classList.toggle('open'));
  catDD.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.addEventListener('change', () => { state.reportFilters.categories = [...catDD.querySelectorAll('input:checked')].map(c => c.value); renderReports(); }); });

  document.querySelectorAll('#status-pills .filter-pill').forEach(p => {
    p.addEventListener('click', () => { const s = p.dataset.status; const i = state.reportFilters.statuses.indexOf(s); if (i === -1) state.reportFilters.statuses.push(s); else state.reportFilters.statuses.splice(i, 1); renderReports(); });
  });

  bindDropdown('filter-prio-dd', 'data-priority', v => { state.reportFilters.priority = v; renderReports(); });
  bindDropdown('filter-user-dd', 'data-user', v => { state.reportFilters.userId = v; renderReports(); });

  el.querySelectorAll('.view-toggle-btn').forEach(b => b.addEventListener('click', () => { state.reportsViewMode = b.dataset.mode; renderReports(); }));
  el.querySelectorAll('.report-card-edit').forEach(b => { b.addEventListener('click', e => { e.stopPropagation(); openReportModal(b.dataset.id); }); });
  el.querySelectorAll('.report-card-delete').forEach(b => { b.addEventListener('click', e => { e.stopPropagation(); showDeleteConfirmCard(e.currentTarget, b.dataset.id); }); });
  el.querySelectorAll('.report-card-pdf').forEach(b => { b.addEventListener('click', e => { e.stopPropagation(); generateReportPdf(b.dataset.id); }); });
  el.querySelectorAll('.report-card').forEach(c => c.addEventListener('click', () => openReportModal(c.dataset.id)));
  el.querySelectorAll('.table-action-btn[data-action="edit"]').forEach(b => b.addEventListener('click', () => openReportModal(b.dataset.id)));
  el.querySelectorAll('.table-action-btn[data-action="delete"]').forEach(b => b.addEventListener('click', e => showDeleteConfirm(e.currentTarget, b.dataset.id)));
  el.querySelectorAll('.table-action-btn[data-action="pdf"]').forEach(b => b.addEventListener('click', () => generateReportPdf(b.dataset.id)));
  el.querySelectorAll('.table th[data-sort]').forEach(th => { th.addEventListener('click', () => { const c = th.dataset.sort; if (state.sortColumn === c) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc'; else { state.sortColumn = c; state.sortDir = 'asc'; } renderReports(); }); });

  document.addEventListener('click', handleDropdownClose);
}

function renderEmptyState() {
  return `<div class="empty-state"><div class="empty-state-art"><div class="empty-state-inner-circle"></div></div><div class="empty-state-title">Keine Auswertungen gefunden</div><div class="empty-state-text">Erstellen Sie Ihre erste Auswertung oder passen Sie die Filter an.</div><button class="btn btn-primary" id="empty-cta" type="button">+ Erste Auswertung erstellen</button></div>`;
}

function renderGrid(reports, users) {
  return `<div class="card-grid">${reports.map(r => renderReportCard(r, users)).join('')}</div>`;
}

function renderReportCard(r, users) {
  const comp = getCompleteness(r);
  const assigned = (r.user_assignments || []).map(a => users.find(u => u.id === a.user_id)).filter(Boolean);
  const dsC = (r.data_source_ids || []).length;
  const hasUrl = r.tableau_url && r.tableau_url.trim();
  const hasJira = r.jira_ticket && r.jira_ticket.trim();
  const rNotes = getData(STORAGE_KEYS.reportNotes) || {};
  const hasNote = rNotes[r.id] && rNotes[r.id].trim();
  return `<div class="report-card" data-id="${r.id}" style="border-left-color:${getCatColor(r.category)}">
    <div class="report-card-actions-top">
      ${hasUrl ? `<a class="report-card-action-btn tableau-link-btn" href="${r.tableau_url}" target="_blank" rel="noopener" title="In Tableau öffnen" onclick="event.stopPropagation()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>` : ''}
      <button class="report-card-action-btn report-card-pdf" data-id="${r.id}" type="button" title="Stammblatt PDF" onclick="event.stopPropagation()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg></button>
      <button class="report-card-edit" data-id="${r.id}" type="button" title="Bearbeiten" onclick="event.stopPropagation()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      <button class="report-card-delete" data-id="${r.id}" type="button" title="Löschen" onclick="event.stopPropagation()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
    </div>
    ${hasJira ? `<a class="jira-badge" href="${r.jira_url || '#'}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="JIRA öffnen">${r.jira_ticket}</a>` : ''}
    <div class="report-card-title">${r.title}</div>
    <div class="report-card-desc">${r.description || 'Keine Beschreibung'}</div>
    <div class="report-card-footer">
      <span class="badge ${STATUSES[r.status]?.css || ''}">${STATUSES[r.status]?.label || r.status}</span>
      <span class="priority-dot ${PRIORITIES[r.priority]?.dot || ''}"></span>
      ${dsC ? `<span class="ds-count-pill">\uD83D\uDDC4\uFE0F ${dsC}</span>` : ''}
      ${hasNote ? '<span class="notes-indicator" title="Notizen vorhanden">\uD83D\uDCDD</span>' : ''}
      ${(r.usage_count || 0) > 0 ? `<span class="usage-badge">${r.usage_count}</span>` : ''}
      <div class="completeness-dots">${[1,2,3,4,5].map(i => `<div class="completeness-dot ${i <= comp ? 'filled' : ''}"></div>`).join('')}</div>
      ${assigned.length ? `<div class="report-card-avatars">${assigned.slice(0, 3).map(u => `<div class="avatar-circle" style="background:${ROLES[u.role]?.color || '#64748B'}" title="${u.name}">${getInitials(u.name)}</div>`).join('')}${assigned.length > 3 ? `<div class="avatar-circle" style="background:var(--card2)">+${assigned.length - 3}</div>` : ''}</div>` : ''}
    </div></div>`;
}

function renderTable(reports, users) {
  const arrow = c => state.sortColumn === c ? `<span class="sort-arrow">${state.sortDir === 'asc' ? '\u2191' : '\u2193'}</span>` : '<span class="sort-arrow">\u2195</span>';
  const sorted = c => state.sortColumn === c ? 'sorted' : '';
  const workbooks = getData(STORAGE_KEYS.workbooksToday) || [];
  return `<div class="table-wrap"><table class="table"><thead><tr>
    <th>JIRA</th>
    <th data-sort="title" class="${sorted('title')}">Titel ${arrow('title')}</th>
    <th>Workbook</th>
    <th data-sort="category" class="${sorted('category')}">Kategorie ${arrow('category')}</th>
    <th data-sort="status" class="${sorted('status')}">Status ${arrow('status')}</th>
    <th data-sort="priority" class="${sorted('priority')}">Priorit\u00E4t ${arrow('priority')}</th>
    <th>Aufrufe</th><th>Quellen</th><th>Score</th><th>Aktionen</th>
  </tr></thead><tbody>${reports.map(r => {
    const au = (r.user_assignments || []).map(a => users.find(u => u.id === a.user_id)).filter(Boolean);
    const comp = getCompleteness(r);
    const hasJira = r.jira_ticket && r.jira_ticket.trim();
    const wb = workbooks.find(w => w.id === r.workbook_id);
    return `<tr><td>${hasJira ? `<a class="jira-badge jira-badge-table" href="${r.jira_url || '#'}" target="_blank" rel="noopener">${r.jira_ticket}</a>` : '<span style="color:var(--muted)">\u2013</span>'}</td><td><strong>${r.title}</strong></td><td>${wb ? `<span style="color:${wb.color};font-size:12px;font-weight:600">${wb.name}</span>` : '<span style="color:var(--muted)">\u2013</span>'}</td><td style="color:${getCatColor(r.category)}">${CATEGORIES[r.category]?.label || r.category}</td><td><span class="badge ${STATUSES[r.status]?.css || ''}">${STATUSES[r.status]?.label || ''}</span></td><td><span class="priority-dot ${PRIORITIES[r.priority]?.dot || ''}" style="display:inline-block"></span> ${PRIORITIES[r.priority]?.label || ''}</td><td><span class="usage-badge">${r.usage_count || 0}</span></td><td>${(r.data_source_ids || []).length}</td><td><div class="completeness-dots">${[1,2,3,4,5].map(i => `<div class="completeness-dot ${i <= comp ? 'filled' : ''}"></div>`).join('')}</div></td><td><div class="table-actions" style="position:relative"><button class="table-action-btn" data-action="pdf" data-id="${r.id}" type="button" title="Stammblatt PDF"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg></button><button class="table-action-btn" data-action="edit" data-id="${r.id}" type="button" title="Bearbeiten"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="table-action-btn" data-action="archive" data-id="${r.id}" type="button" title="Archivieren"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg></button><button class="table-action-btn danger" data-action="delete" data-id="${r.id}" type="button" title="L\u00F6schen"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button></div></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

/* === RENDER: USERS === */

function renderUsers() {
  const users = getData(STORAGE_KEYS.users) || [];
  const reports = getData(STORAGE_KEYS.reports) || [];
  if (!state.selectedUserId && users.length) state.selectedUserId = users[0].id;
  const sel = users.find(u => u.id === state.selectedUserId);

  const el = document.getElementById('users-content');
  el.innerHTML = `
    <div class="view-header"><h1 class="view-title">Nutzer</h1><p class="view-subtitle">${users.length} Nutzer registriert</p></div>
    <div class="users-layout">
      <div class="users-panel-left">
        ${users.map(u => `<div class="user-list-card ${u.id === state.selectedUserId ? 'selected' : ''}" data-uid="${u.id}"><div class="avatar-circle" style="background:${ROLES[u.role]?.color || '#64748B'};width:36px;height:36px;font-size:13px">${getInitials(u.name)}</div><div><div class="user-list-card-name">${u.name}</div><div style="font-size:11px;color:var(--muted)">${ROLES[u.role]?.label || u.role}</div></div></div>`).join('')}
        <button class="btn btn-ghost btn-sm" id="btn-add-user" type="button" style="width:100%;margin-top:12px">+ Nutzer hinzufügen</button>
      </div>
      <div class="users-panel-right">${sel ? renderUserDetail(sel, reports, users) : '<div class="empty-state"><div class="empty-state-title">Keinen Nutzer ausgewählt</div></div>'}</div>
    </div>
    ${renderTeamsSection()}`;

  el.querySelectorAll('.user-list-card').forEach(c => c.addEventListener('click', () => { state.selectedUserId = c.dataset.uid; state.userTab = 'primär'; renderUsers(); }));
  el.querySelectorAll('.user-tab').forEach(t => t.addEventListener('click', () => { state.userTab = t.dataset.tab; renderUsers(); }));

  const editBtn = el.querySelector('#btn-edit-user');
  if (editBtn && sel) editBtn.addEventListener('click', () => showUserEditForm(sel));

  const addBtn = el.querySelector('#btn-add-user');
  if (addBtn) addBtn.addEventListener('click', () => {
    const u = { id: generateId(), name: 'Neuer Nutzer', role: 'operativer_einkäufer', department: '' };
    const all = getData(STORAGE_KEYS.users) || [];
    all.push(u);
    saveData(STORAGE_KEYS.users, all);
    state.selectedUserId = u.id;
    updateProgressPill();
    renderUsers();
    showToast('Nutzer hinzugefügt', 'success');
  });

  // Report clicks in user detail
  el.querySelectorAll('.recent-item[data-report-id]').forEach(item => {
    item.addEventListener('click', () => openReportModal(item.dataset.reportId));
  });

  // Teams section
  bindTeamEvents(el);
}

function renderUserDetail(user, reports) {
  const tabs = ['primär', 'sekundär', 'info'];
  const ur = {};
  tabs.forEach(t => ur[t] = reports.filter(r => (r.user_assignments || []).some(a => a.user_id === user.id && a.relevance === t)));
  const at = state.userTab || 'primär';
  const tr = ur[at] || [];

  return `<div class="user-detail-header"><div class="user-detail-avatar" style="background:${ROLES[user.role]?.color || '#64748B'}">${getInitials(user.name)}</div><div class="user-detail-info"><div class="user-detail-name">${user.name}</div><div class="user-detail-meta">${ROLES[user.role]?.label || user.role} \u00B7 ${user.department || '\u2013'}</div></div><button class="btn btn-ghost btn-sm" id="btn-edit-user" type="button">Bearbeiten</button></div>
  <div class="user-tabs">${tabs.map(t => `<button class="user-tab ${at === t ? 'active' : ''}" data-tab="${t}" type="button">${t === 'primär' ? 'Primäre' : t === 'sekundär' ? 'Sekundäre' : 'Info'} (${ur[t].length})</button>`).join('')}</div>
  <div>${tr.length ? tr.map(r => `<div class="recent-item" style="margin-bottom:6px;cursor:pointer" data-report-id="${r.id}"><div class="recent-item-cat" style="background:${getCatColor(r.category)}"></div><span class="recent-item-title">${r.title}</span><span class="badge ${STATUSES[r.status]?.css || ''}">${STATUSES[r.status]?.label || ''}</span></div>`).join('') : '<div class="empty-state" style="padding:40px"><div class="empty-state-title">Keine Auswertungen zugewiesen</div></div>'}</div>`;
}

function showUserEditForm(user) {
  const h = document.querySelector('.user-detail-header');
  if (!h) return;
  const teams = getTeams();
  h.outerHTML = `<div class="user-edit-form" id="user-edit-form"><div class="avatar-circle" style="background:${ROLES[user.role]?.color || '#64748B'};width:48px;height:48px;font-size:18px;flex-shrink:0">${getInitials(user.name)}</div><input class="form-input" id="edit-u-name" value="${user.name}" placeholder="Name"><select class="form-select" id="edit-u-role">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${user.role === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select><select class="form-select" id="edit-u-dept"><option value="">-- Abteilung --</option>${teams.map(t => `<option value="${t}" ${user.department === t ? 'selected' : ''}>${t}</option>`).join('')}</select><button class="btn btn-primary btn-sm" id="btn-save-u" type="button">Speichern</button><button class="btn btn-ghost btn-sm" id="btn-cancel-u" type="button">Abbrechen</button></div>`;
  document.getElementById('btn-save-u').addEventListener('click', () => {
    const all = getData(STORAGE_KEYS.users) || [];
    const u = all.find(x => x.id === user.id);
    if (u) { u.name = document.getElementById('edit-u-name').value || u.name; u.role = document.getElementById('edit-u-role').value; u.department = document.getElementById('edit-u-dept').value; saveData(STORAGE_KEYS.users, all); showToast('Nutzer aktualisiert', 'success'); }
    renderUsers();
  });
  document.getElementById('btn-cancel-u').addEventListener('click', () => renderUsers());
}

/* === RENDER: DATASOURCES === */

function renderDatasources() {
  const datasources = getData(STORAGE_KEYS.datasources) || [];
  const reports = getData(STORAGE_KEYS.reports) || [];
  const catKeys = Object.keys(CATEGORIES);

  const heatmap = datasources.map(ds => {
    const counts = {}; catKeys.forEach(c => counts[c] = 0);
    reports.forEach(r => { if ((r.data_source_ids || []).includes(ds.id) && counts[r.category] !== undefined) counts[r.category]++; });
    return { ds, counts };
  });
  const hMax = Math.max(1, ...heatmap.flatMap(h => Object.values(h.counts)));

  const el = document.getElementById('datasources-content');
  el.innerHTML = `
    <div class="view-header"><h1 class="view-title">Datenquellen</h1><p class="view-subtitle">${datasources.length} Datenquellen registriert</p></div>
    <button class="btn btn-primary btn-sm" id="btn-add-ds" type="button" style="margin-bottom:16px">+ Neue Datenquelle</button>
    <div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Typ</th><th>Beschreibung</th><th>Verantwortlich</th><th>Genutzt in</th><th>Aktionen</th></tr></thead><tbody id="ds-tbody">${datasources.map(ds => {
      const used = reports.filter(r => (r.data_source_ids || []).includes(ds.id)).length;
      return `<tr><td><strong>${ds.name}</strong></td><td>${DS_TYPES[ds.type]?.icon || '\uD83D\uDCE6'} ${DS_TYPES[ds.type]?.label || ds.type}</td><td style="color:var(--muted)">${ds.description || '\u2013'}</td><td>${ds.owner || '\u2013'}</td><td><a class="ds-used-link" data-ds-id="${ds.id}" style="color:var(--accent);cursor:pointer">${used} Auswertungen</a></td><td><div class="table-actions" style="position:relative"><button class="table-action-btn" data-action="edit-ds" data-id="${ds.id}" type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="table-action-btn danger" data-action="delete-ds" data-id="${ds.id}" type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button></div></td></tr>`;
    }).join('')}</tbody></table></div>
    <div class="dashboard-section" style="margin-top:32px"><div class="dashboard-section-title">Nutzungs-Heatmap</div><div class="card-flat" style="overflow-x:auto"><div class="heatmap-grid" style="grid-template-columns:180px repeat(${catKeys.length},1fr);min-width:${180 + catKeys.length * 100}px"><div class="heatmap-header"></div>${catKeys.map(c => `<div class="heatmap-header" style="color:${getCatColor(c)}">${CATEGORIES[c].label}</div>`).join('')}${heatmap.map(h => `<div class="heatmap-row-label">${h.ds.name}</div>${catKeys.map(c => { const cnt = h.counts[c]; const bg = cnt === 0 ? 'var(--card2)' : `rgba(212,176,57,${0.15 + (cnt / hMax) * 0.6})`; return `<div class="heatmap-cell" style="background:${bg}">${cnt === 0 ? '\u2013' : cnt}</div>`; }).join('')}`).join('')}</div></div></div>`;

  document.getElementById('btn-add-ds').addEventListener('click', showInlineAddDs);
  el.querySelectorAll('.ds-used-link').forEach(l => l.addEventListener('click', () => { state.reportFilters = { search: '', categories: [], statuses: [], priority: '', userId: '', datasourceId: l.dataset.dsId }; navigateTo('reports'); }));
  el.querySelectorAll('[data-action="edit-ds"]').forEach(b => b.addEventListener('click', () => showEditDsModal(b.dataset.id)));
  el.querySelectorAll('[data-action="delete-ds"]').forEach(b => b.addEventListener('click', e => showDeleteConfirmDs(e.currentTarget, b.dataset.id)));
}

function showInlineAddDs() {
  const tb = document.getElementById('ds-tbody');
  if (!tb || tb.querySelector('.inline-add-row')) return;
  const row = document.createElement('tr');
  row.innerHTML = `<td colspan="6"><div class="inline-add-row"><input class="form-input" id="new-ds-name" placeholder="Name"><select class="form-select" id="new-ds-type" style="max-width:130px">${Object.entries(DS_TYPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select><input class="form-input" id="new-ds-desc" placeholder="Beschreibung"><input class="form-input" id="new-ds-owner" placeholder="Verantwortlich"><button class="btn btn-primary btn-sm" id="btn-save-ds" type="button">Speichern</button><button class="btn btn-ghost btn-sm" id="btn-cx-ds" type="button">Abbrechen</button></div></td>`;
  tb.insertBefore(row, tb.firstChild);
  document.getElementById('btn-save-ds').addEventListener('click', () => {
    const name = document.getElementById('new-ds-name').value.trim();
    if (!name) { showToast('Name ist erforderlich', 'warning'); return; }
    const all = getData(STORAGE_KEYS.datasources) || [];
    all.push({ id: generateId(), name, type: document.getElementById('new-ds-type').value, description: document.getElementById('new-ds-desc').value.trim(), owner: document.getElementById('new-ds-owner').value.trim() });
    saveData(STORAGE_KEYS.datasources, all);
    showToast('Datenquelle hinzugefügt', 'success');
    renderDatasources();
  });
  document.getElementById('btn-cx-ds').addEventListener('click', () => row.remove());
}

function showEditDsModal(dsId) {
  const all = getData(STORAGE_KEYS.datasources) || [];
  const ds = all.find(d => d.id === dsId);
  if (!ds) return;

  // Find the table row for this datasource and replace inline
  const rows = document.querySelectorAll('#ds-tbody tr');
  for (const row of rows) {
    const editBtn = row.querySelector(`[data-id="${dsId}"][data-action="edit-ds"]`);
    if (!editBtn) continue;

    row.innerHTML = `<td colspan="6"><div class="inline-add-row"><input class="form-input" id="ed-ds-name" value="${ds.name}" placeholder="Name"><select class="form-select" id="ed-ds-type" style="max-width:130px">${Object.entries(DS_TYPES).map(([k, v]) => `<option value="${k}" ${ds.type === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select><input class="form-input" id="ed-ds-desc" value="${ds.description || ''}" placeholder="Beschreibung"><input class="form-input" id="ed-ds-own" value="${ds.owner || ''}" placeholder="Verantwortlich"><button class="btn btn-primary btn-sm" id="btn-save-edit-ds" type="button">Speichern</button><button class="btn btn-ghost btn-sm" id="btn-cx-edit-ds" type="button">Abbrechen</button></div></td>`;

    document.getElementById('btn-save-edit-ds').addEventListener('click', () => {
      const all2 = getData(STORAGE_KEYS.datasources) || [];
      const item = all2.find(d => d.id === dsId);
      if (item) {
        item.name = document.getElementById('ed-ds-name').value.trim() || item.name;
        item.type = document.getElementById('ed-ds-type').value;
        item.description = document.getElementById('ed-ds-desc').value.trim();
        item.owner = document.getElementById('ed-ds-own').value.trim();
        saveData(STORAGE_KEYS.datasources, all2);
        showToast('Aktualisiert', 'success');
      }
      renderDatasources();
    });
    document.getElementById('btn-cx-edit-ds').addEventListener('click', () => renderDatasources());
    document.getElementById('ed-ds-name').focus();
    break;
  }
}

/* === RENDER: CATEGORIES === */

function renderCategories() {
  refreshCategories();
  const reports = getData(STORAGE_KEYS.reports) || [];
  const notes = getData(STORAGE_KEYS.categoryNotes) || {};
  const users = getData(STORAGE_KEYS.users) || [];
  const cats = getCategories();
  const catKeys = Object.keys(cats);

  const el = document.getElementById('categories-content');
  el.innerHTML = `<div class="view-header"><h1 class="view-title">Kategorien</h1><p class="view-subtitle">${catKeys.length} Kategorien mit Ziel je ${CATEGORY_TARGET} Auswertungen</p></div>
  <button class="btn btn-primary btn-sm" id="btn-add-category" type="button" style="margin-bottom:20px">+ Neue Kategorie</button>
  ${catKeys.map(key => {
    const cat = cats[key];
    const cr = reports.filter(r => r.category === key);
    const prog = Math.min((cr.length / CATEGORY_TARGET) * 100, 100);
    return `<div class="category-section" data-cat="${key}"><div class="category-header"><div class="category-color-bar" style="background:${cat.color || getCatColor(key)}"></div><span class="category-icon">${cat.icon}</span><span class="category-name">${cat.label}</span><span class="category-count">${cr.length} Auswertungen</span><div class="category-progress"><div class="category-progress-bar" style="width:${prog}%;background:${cat.color || getCatColor(key)}"></div></div><div class="category-actions-inline"><button class="btn-icon-sm cat-edit-btn" data-cat-key="${key}" type="button" title="Bearbeiten"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="btn-icon-sm cat-delete-btn" data-cat-key="${key}" type="button" title="L\u00F6schen"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button></div><svg class="category-expand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></div><div class="category-body">${cr.length ? `<div class="card-grid">${cr.map(r => renderReportCard(r, users)).join('')}</div>` : '<div class="empty-state" style="padding:30px"><div class="empty-state-title">Keine Auswertungen</div></div>'}<div class="category-notes-area"><div class="category-notes-label">Strategie-Notizen</div><textarea class="category-notes-textarea" data-cat="${key}" placeholder="Strategische Notizen\u2026">${notes[key] || ''}</textarea></div></div></div>`;
  }).join('')}`;

  el.querySelectorAll('.category-header').forEach(h => h.addEventListener('click', (e) => { if (e.target.closest('.cat-edit-btn') || e.target.closest('.cat-delete-btn')) return; h.closest('.category-section').classList.toggle('expanded'); }));
  el.querySelectorAll('.category-notes-textarea').forEach(ta => ta.addEventListener('blur', () => { const n = getData(STORAGE_KEYS.categoryNotes) || {}; n[ta.dataset.cat] = ta.value; saveData(STORAGE_KEYS.categoryNotes, n); }));
  el.querySelectorAll('.report-card').forEach(c => c.addEventListener('click', () => openReportModal(c.dataset.id)));
  el.querySelectorAll('.report-card-edit').forEach(b => { b.addEventListener('click', e => { e.stopPropagation(); openReportModal(b.dataset.id); }); });
  el.querySelectorAll('.report-card-delete').forEach(b => { b.addEventListener('click', e => { e.stopPropagation(); showDeleteConfirmCard(e.currentTarget, b.dataset.id); }); });
  el.querySelectorAll('.report-card-pdf').forEach(b => { b.addEventListener('click', e => { e.stopPropagation(); generateReportPdf(b.dataset.id); }); });

  // Add category button
  document.getElementById('btn-add-category').addEventListener('click', () => showCategoryForm(null));

  // Edit category
  el.querySelectorAll('.cat-edit-btn').forEach(b => { b.addEventListener('click', (e) => { e.stopPropagation(); showCategoryForm(b.dataset.catKey); }); });

  // Delete category
  el.querySelectorAll('.cat-delete-btn').forEach(b => { b.addEventListener('click', (e) => { e.stopPropagation(); deleteCategoryConfirm(b.dataset.catKey); }); });
}

/** Show modal to add or edit a category */
function showCategoryForm(editKey) {
  const cats = getCategories();
  const isEdit = !!editKey;
  const cat = isEdit ? (cats[editKey] || { label: '', icon: '\uD83D\uDCC1', color: '#3B82F6' }) : { label: '', icon: '\uD83D\uDCC1', color: '#3B82F6' };

  const m = document.getElementById('modal-container');
  m.innerHTML = `<div class="modal-header"><div class="modal-title">${isEdit ? 'Kategorie bearbeiten' : 'Neue Kategorie'}</div><button class="modal-close" id="cat-modal-close" type="button">\u00D7</button></div>
  <div class="modal-body">
    <div class="form-group"><label class="form-label">Name *</label><input class="form-input" id="cat-label" value="${cat.label}" placeholder="Kategoriename"></div>
    <div class="form-group"><label class="form-label">Icon</label><div class="icon-picker" id="icon-picker">${CATEGORY_ICONS.map(ic => `<button class="icon-pick-btn ${cat.icon === ic ? 'active' : ''}" data-icon="${ic}" type="button">${ic}</button>`).join('')}</div><input type="hidden" id="cat-icon" value="${cat.icon}"></div>
    <div class="form-group"><label class="form-label">Farbe</label><div class="color-picker" id="color-picker">${CATEGORY_COLORS.map(c => `<button class="color-pick-btn ${cat.color === c ? 'active' : ''}" data-color="${c}" type="button" style="background:${c}"></button>`).join('')}</div><input type="hidden" id="cat-color" value="${cat.color}"></div>
  </div>
  <div class="modal-footer"><button class="btn btn-ghost" id="cat-cancel" type="button">Abbrechen</button><button class="btn btn-primary" id="cat-save" type="button">Speichern</button></div>`;

  document.getElementById('modal-overlay').classList.add('open');

  m.querySelectorAll('.icon-pick-btn').forEach(b => b.addEventListener('click', () => { m.querySelectorAll('.icon-pick-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); document.getElementById('cat-icon').value = b.dataset.icon; }));
  m.querySelectorAll('.color-pick-btn').forEach(b => b.addEventListener('click', () => { m.querySelectorAll('.color-pick-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); document.getElementById('cat-color').value = b.dataset.color; }));

  m.querySelector('#cat-modal-close').addEventListener('click', closeModal);
  m.querySelector('#cat-cancel').addEventListener('click', closeModal);
  m.querySelector('#cat-save').addEventListener('click', () => {
    const label = document.getElementById('cat-label').value.trim();
    if (!label) { showToast('Name ist erforderlich', 'warning'); return; }
    const icon = document.getElementById('cat-icon').value;
    const color = document.getElementById('cat-color').value;

    const allCats = getCategories();
    const key = isEdit ? editKey : label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_\u00E4\u00F6\u00FC\u00DF]/g, '').replace(/\u00E4/g, 'ae').replace(/\u00F6/g, 'oe').replace(/\u00FC/g, 'ue').replace(/\u00DF/g, 'ss').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'cat_' + Date.now();

    if (!isEdit && allCats[key]) {
      showToast('Kategorie mit diesem Namen existiert bereits', 'warning');
      return;
    }

    allCats[key] = { label, icon, color };
    saveCategories(allCats);
    refreshCategories();
    closeModal();
    renderCategories();
    showToast(isEdit ? 'Kategorie aktualisiert' : 'Kategorie erstellt', 'success');
  });
}

/** Confirm and delete a category (only if no reports assigned) */
function deleteCategoryConfirm(catKey) {
  const cats = getCategories();
  const cat = cats[catKey];
  if (!cat) return;
  const reports = getData(STORAGE_KEYS.reports) || [];
  const count = reports.filter(r => r.category === catKey).length;
  if (count > 0) {
    showToast('Kategorie "' + cat.label + '" hat noch ' + count + ' Auswertungen. Bitte erst verschieben.', 'warning');
    return;
  }
  if (confirm('Kategorie "' + cat.label + '" wirklich l\u00F6schen?')) {
    delete cats[catKey];
    saveCategories(cats);
    refreshCategories();
    renderCategories();
    showToast('Kategorie gel\u00F6scht', 'success');
  }
}

/* === RENDER: CONSOLIDATION === */

function renderConsolidation() {
  const reports = getData(STORAGE_KEYS.reports) || [];
  const users = getData(STORAGE_KEYS.users) || [];
  const datasources = getData(STORAGE_KEYS.datasources) || [];

  const groups = [];
  for (let i = 0; i < reports.length; i++) {
    for (let j = i + 1; j < reports.length; j++) {
      const shared = (reports[i].data_source_ids || []).filter(d => (reports[j].data_source_ids || []).includes(d));
      if (shared.length >= 2) {
        let g = groups.find(g => g.rids.has(reports[i].id) || g.rids.has(reports[j].id));
        if (g) { g.rids.add(reports[i].id); g.rids.add(reports[j].id); shared.forEach(s => g.dsids.add(s)); }
        else groups.push({ rids: new Set([reports[i].id, reports[j].id]), dsids: new Set(shared) });
      }
    }
  }
  const orphans = reports.filter(r => !(r.user_assignments || []).length);
  const incompletes = reports.filter(r => getCompleteness(r) < 3);
  const deprWithUsers = reports.filter(r => r.status === 'deprecated' && (r.user_assignments || []).length > 0);
  const total = groups.length + orphans.length + incompletes.length + deprWithUsers.length;

  const el = document.getElementById('consolidation-content');
  el.innerHTML = `<div class="view-header"><h1 class="view-title">Konsolidierung</h1><p class="view-subtitle">Identifizierte Verbesserungspotenziale</p></div>
  <div class="consolidation-banner"><span class="consolidation-banner-icon">\uD83D\uDD0D</span><span class="consolidation-banner-text"><span class="consolidation-banner-count">${total}</span> potenzielle Verbesserungen</span></div>

  <div class="consolidation-panel"><div class="consolidation-panel-title">Konsolidierungskandidaten <span class="consolidation-panel-count">${groups.length}</span></div>${groups.length ? groups.map(g => { const gr = [...g.rids].map(id => reports.find(r => r.id === id)).filter(Boolean); const gd = [...g.dsids].map(id => datasources.find(d => d.id === id)).filter(Boolean); return `<div class="cluster-card"><div class="cluster-reports">${gr.map(r => `<span class="cluster-report-chip" style="border-left:3px solid ${getCatColor(r.category)}">${r.title}</span>`).join('')}</div><div class="cluster-shared">${gr.length} Auswertungen teilen ${gd.length} Datenquellen: ${gd.map(d => d.name).join(', ')}</div><button class="btn btn-ghost btn-sm consolidate-btn" data-rid="${[...g.rids][0]}" type="button">Zusammenführen?</button></div>`; }).join('') : '<div style="color:var(--muted);padding:12px">Keine Kandidaten</div>'}</div>

  <div class="consolidation-panel"><div class="consolidation-panel-title">Waisen-Auswertungen <span class="consolidation-panel-count">${orphans.length}</span></div>${orphans.length ? orphans.map(r => `<div class="orphan-card"><div class="recent-item-cat" style="background:${getCatColor(r.category)}"></div><span class="orphan-card-title">${r.title}</span><button class="btn btn-ghost btn-sm" data-action="assign" data-id="${r.id}" type="button">Nutzer zuweisen</button><button class="btn btn-danger btn-sm" data-action="del-orphan" data-id="${r.id}" type="button">Löschen</button></div>`).join('') : '<div style="color:var(--muted);padding:12px">Keine Waisen</div>'}</div>

  <div class="consolidation-panel"><div class="consolidation-panel-title">Unvollständige <span class="consolidation-panel-count">${incompletes.length}</span></div>${incompletes.length ? incompletes.map(r => { const checks = [{ l: 'Beschreibung', d: !!(r.description && r.description.trim()) }, { l: 'Datenquellen', d: (r.data_source_ids || []).length > 0 }, { l: 'Nutzer', d: (r.user_assignments || []).length > 0 }, { l: 'Use Cases', d: (r.use_cases || []).length > 0 }, { l: 'Refresh', d: !!(r.refresh_cycle && r.refresh_cycle.trim()) }]; return `<div class="incomplete-card"><div class="incomplete-card-header"><span class="incomplete-card-title">${r.title}</span><button class="btn btn-ghost btn-sm" data-action="complete" data-id="${r.id}" type="button">Vervollständigen</button></div><div class="incomplete-checklist">${checks.map(c => `<span class="incomplete-check-item ${c.d ? 'done' : ''}">${c.d ? '\u2705' : '\u274C'} ${c.l}</span>`).join('')}</div></div>`; }).join('') : '<div style="color:var(--muted);padding:12px">Alle vollständig</div>'}</div>

  <div class="consolidation-panel"><div class="consolidation-panel-title">Deprecated mit Nutzern <span class="consolidation-panel-count">${deprWithUsers.length}</span></div>${deprWithUsers.length ? deprWithUsers.map(r => { const au = (r.user_assignments || []).map(a => users.find(u => u.id === a.user_id)).filter(Boolean); return `<div class="deprecated-card"><div class="deprecated-card-header"><span class="deprecated-card-title">${r.title}</span><button class="btn btn-ghost btn-sm" data-action="rm-depr" data-id="${r.id}" type="button">Nutzer entfernen</button></div><div class="deprecated-users">${au.map(u => `<span class="deprecated-user-chip"><div class="avatar-circle" style="background:${ROLES[u.role]?.color || '#64748B'};width:20px;height:20px;font-size:9px">${getInitials(u.name)}</div> ${u.name}</span>`).join('')}</div></div>`; }).join('') : '<div style="color:var(--muted);padding:12px">Keine</div>'}</div>`;

  el.querySelectorAll('[data-action="assign"]').forEach(b => b.addEventListener('click', () => openReportModal(b.dataset.id)));
  el.querySelectorAll('[data-action="del-orphan"]').forEach(b => b.addEventListener('click', e => showDeleteConfirm(e.currentTarget, b.dataset.id)));
  el.querySelectorAll('[data-action="complete"]').forEach(b => b.addEventListener('click', () => openReportModal(b.dataset.id)));
  el.querySelectorAll('[data-action="rm-depr"]').forEach(b => b.addEventListener('click', () => {
    const all = getData(STORAGE_KEYS.reports) || [];
    const r = all.find(x => x.id === b.dataset.id);
    if (r) { r.user_assignments = []; r.updated_at = new Date().toISOString(); saveData(STORAGE_KEYS.reports, all); showToast('Nutzer entfernt', 'success'); updateProgressPill(); renderConsolidation(); }
  }));
  el.querySelectorAll('.consolidate-btn').forEach(b => b.addEventListener('click', () => openReportModal(b.dataset.rid)));
}

/* === MODAL (create/edit report) === */

function openReportModal(reportId) {
  refreshCategories();
  const reports = getData(STORAGE_KEYS.reports) || [];
  const datasources = getData(STORAGE_KEYS.datasources) || [];
  const users = getData(STORAGE_KEYS.users) || [];
  const isEdit = !!reportId;
  const workbooks = getData(STORAGE_KEYS.workbooksToday) || [];
  const reportNotes = getData(STORAGE_KEYS.reportNotes) || {};
  const report = isEdit ? { ...reports.find(r => r.id === reportId) } : { id: '', title: '', description: '', category: 'operativer_einkauf', status: 'idee', priority: 'mittel', refresh_cycle: '', tableau_url: '', jira_ticket: '', jira_url: '', data_source_ids: [], user_assignments: [], use_cases: [], workbook_id: '', usage_count: 0 };
  if (isEdit && !report.jira_ticket) report.jira_ticket = '';
  if (isEdit && !report.jira_url) report.jira_url = '';
  if (isEdit && !report.workbook_id) report.workbook_id = '';
  if (isEdit && !report.usage_count) report.usage_count = 0;
  let mNotes = isEdit ? (reportNotes[reportId] || '') : '';
  if (!report || (!isEdit && report === undefined)) return;

  let tab = 0;
  let mDs = [...(report.data_source_ids || [])];
  let mUa = JSON.parse(JSON.stringify(report.user_assignments || []));
  let mUc = JSON.parse(JSON.stringify(report.use_cases || []));

  function render() {
    const m = document.getElementById('modal-container');
    const comp = getCompleteness({ ...report, data_source_ids: mDs, user_assignments: mUa, use_cases: mUc });

    m.innerHTML = `<div class="modal-header"><div class="modal-title">${isEdit ? report.title : 'Neue Auswertung'}</div><button class="modal-close" id="mc" type="button">\u00D7</button></div>
    <div class="modal-tabs">${['Grunddaten', 'Datenquellen', 'Nutzer & Relevanz', 'Use Cases', 'Notizen', 'Vorschau'].map((t, i) => `<div class="modal-tab ${tab === i ? 'active' : ''}" data-tab="${i}">${t}</div>`).join('')}</div>
    <div class="modal-body">
      <div class="modal-tab-content ${tab === 0 ? 'active' : ''}">
        <div class="form-group"><label class="form-label">Titel *</label><input class="form-input" id="mt" value="${report.title}" placeholder="Auswertungstitel"></div>
        <div class="form-group"><label class="form-label">Beschreibung</label><textarea class="form-input" id="md" rows="3" placeholder="Kurzbeschreibung\u2026">${report.description || ''}</textarea></div>
        <div class="form-row"><div class="form-group"><label class="form-label">Kategorie</label><select class="form-select" id="mcat">${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}" ${report.category === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div><div class="form-group"><label class="form-label">Status</label><select class="form-select" id="mstat">${Object.entries(STATUSES).map(([k, v]) => `<option value="${k}" ${report.status === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div></div>
        <div class="form-row"><div class="form-group"><label class="form-label">Priorität</label><div class="priority-toggle">${Object.entries(PRIORITIES).map(([k, v]) => `<button class="priority-btn ${k} ${report.priority === k ? 'active' : ''}" data-p="${k}" type="button">${v.label}</button>`).join('')}</div></div><div class="form-group"><label class="form-label">Aktualisierungszyklus</label><input class="form-input" id="mref" value="${report.refresh_cycle || ''}" placeholder="z.B. täglich, wöchentlich"></div></div>
        <div class="form-group"><label class="form-label">Tableau URL</label><input class="form-input" id="mturl" value="${report.tableau_url || ''}" placeholder="https://tableau.haecker.com/..."></div>
        <div class="form-row"><div class="form-group"><label class="form-label">JIRA Ticketnummer</label><input class="form-input" id="mjira" value="${report.jira_ticket || ''}" placeholder="z.B. EINK-1234"></div><div class="form-group"><label class="form-label">JIRA Link</label><input class="form-input" id="mjiraurl" value="${report.jira_url || ''}" placeholder="https://jira.haecker.com/browse/EINK-1234"></div></div>
        <div class="form-row"><div class="form-group"><label class="form-label">Workbook</label><select class="form-select" id="mwb"><option value="">-- Kein Workbook --</option>${workbooks.map(w => `<option value="${w.id}" ${report.workbook_id === w.id ? 'selected' : ''}>${w.name}</option>`).join('')}</select></div><div class="form-group"><label class="form-label">Aufrufe (manuell)</label><input class="form-input" id="musage" type="number" min="0" value="${report.usage_count || 0}"></div></div>
      </div>
      <div class="modal-tab-content ${tab === 1 ? 'active' : ''}">${mDs.length ? `<div class="selected-tags">${mDs.map(did => { const d = datasources.find(x => x.id === did); return d ? `<span class="selected-tag">${DS_TYPES[d.type]?.icon || ''} ${d.name} <span class="selected-tag-remove" data-rm-ds="${d.id}">\u00D7</span></span>` : ''; }).join('')}</div>` : ''}<div class="ds-checklist">${datasources.map(d => `<label class="ds-check-item ${mDs.includes(d.id) ? 'checked' : ''}"><input type="checkbox" value="${d.id}" ${mDs.includes(d.id) ? 'checked' : ''}><span class="ds-type-icon">${DS_TYPES[d.type]?.icon || ''}</span><span class="ds-check-name">${d.name}</span><span class="ds-check-owner">${d.owner || ''}</span></label>`).join('')}</div></div>
      <div class="modal-tab-content ${tab === 2 ? 'active' : ''}"><div class="user-assign-list">${users.map(u => { const a = mUa.find(x => x.user_id === u.id); const ch = !!a; const rel = a ? a.relevance : 'primär'; return `<div class="user-assign-item ${ch ? 'checked' : ''}" data-uid="${u.id}"><input type="checkbox" value="${u.id}" ${ch ? 'checked' : ''} style="appearance:none;-webkit-appearance:none;width:18px;height:18px;border:2px solid var(--muted);border-radius:5px;flex-shrink:0;cursor:pointer;position:relative;${ch ? 'background:var(--accent);border-color:var(--accent)' : ''}"><div class="avatar-circle" style="background:${ROLES[u.role]?.color || '#64748B'};width:32px;height:32px;font-size:12px">${getInitials(u.name)}</div><span class="user-assign-name">${u.name}</span><span class="user-assign-role">${ROLES[u.role]?.label || ''}</span>${ch ? `<div class="relevance-toggle" data-uid="${u.id}">${['primär', 'sekundär', 'info'].map(r => `<button class="relevance-btn ${rel === r ? 'active' : ''}" data-rel="${r}" type="button">${r[0].toUpperCase() + r.slice(1)}</button>`).join('')}</div>` : ''}</div>`; }).join('')}</div></div>
      <div class="modal-tab-content ${tab === 3 ? 'active' : ''}"><div class="use-case-list">${mUc.map((uc, i) => `<div class="use-case-row" data-idx="${i}"><button class="use-case-remove" data-rm-uc="${i}" type="button">\u00D7</button><div class="form-group"><label class="form-label">Titel</label><input class="form-input uc-t" value="${uc.title || ''}"></div><div class="form-group"><label class="form-label">Fragestellung</label><input class="form-input uc-q" value="${uc.question || ''}"></div><div class="form-group"><label class="form-label">Beschreibung</label><textarea class="form-input uc-d" rows="2">${uc.description || ''}</textarea></div></div>`).join('')}</div><button class="btn btn-ghost btn-sm" id="btn-add-uc" type="button" style="margin-top:12px">+ Use Case</button></div>
      <div class="modal-tab-content ${tab === 4 ? 'active' : ''}"><div class="form-group"><label class="form-label">Notizen zu dieser Auswertung</label><textarea class="form-input" id="m-notes" rows="8" placeholder="Notizen, Anmerkungen, Kontext\u2026">${mNotes}</textarea></div></div>
      <div class="modal-tab-content ${tab === 5 ? 'active' : ''}"><div class="preview-section"><div class="preview-section-title">Grunddaten</div><div class="preview-field"><span class="preview-field-label">Titel:</span><span class="preview-field-value">${report.title || '\u2013'}</span></div><div class="preview-field"><span class="preview-field-label">Kategorie:</span><span class="preview-field-value">${CATEGORIES[report.category]?.label || ''}</span></div><div class="preview-field"><span class="preview-field-label">Status:</span><span class="preview-field-value">${STATUSES[report.status]?.label || ''}</span></div></div><div class="preview-section"><div class="preview-section-title">Vollständigkeit</div><div class="completeness-score-big">${comp} / 5</div><div class="completeness-checklist"><div class="completeness-item"><span class="completeness-icon">${report.description?.trim() ? '\u2705' : '\u274C'}</span> Beschreibung</div><div class="completeness-item"><span class="completeness-icon">${mDs.length ? '\u2705' : '\u274C'}</span> Datenquellen (${mDs.length})</div><div class="completeness-item"><span class="completeness-icon">${mUa.length ? '\u2705' : '\u274C'}</span> Nutzer (${mUa.length})</div><div class="completeness-item"><span class="completeness-icon">${mUc.length ? '\u2705' : '\u274C'}</span> Use Cases (${mUc.length})</div><div class="completeness-item"><span class="completeness-icon">${report.refresh_cycle?.trim() ? '\u2705' : '\u274C'}</span> Refresh</div></div></div></div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" id="mcx" type="button">Abbrechen</button><button class="btn btn-primary" id="msv" type="button">Speichern</button></div>`;

    m.querySelector('#mc').addEventListener('click', closeModal);
    m.querySelector('#mcx').addEventListener('click', closeModal);
    m.querySelectorAll('.modal-tab').forEach(t => t.addEventListener('click', () => { collect(); tab = parseInt(t.dataset.tab); render(); }));
    m.querySelectorAll('.priority-btn').forEach(b => b.addEventListener('click', () => { report.priority = b.dataset.p; m.querySelectorAll('.priority-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); }));
    m.querySelectorAll('.ds-check-item input').forEach(cb => cb.addEventListener('change', () => { if (cb.checked) { if (!mDs.includes(cb.value)) mDs.push(cb.value); } else mDs = mDs.filter(x => x !== cb.value); collect(); render(); }));
    m.querySelectorAll('[data-rm-ds]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); mDs = mDs.filter(x => x !== b.dataset.rmDs); collect(); render(); }));
    m.querySelectorAll('.user-assign-item input').forEach(cb => cb.addEventListener('change', () => { if (cb.checked) { if (!mUa.find(a => a.user_id === cb.value)) mUa.push({ user_id: cb.value, relevance: 'primär' }); } else mUa = mUa.filter(a => a.user_id !== cb.value); collect(); render(); }));
    m.querySelectorAll('.relevance-toggle').forEach(tg => tg.querySelectorAll('.relevance-btn').forEach(b => b.addEventListener('click', () => { const a = mUa.find(x => x.user_id === tg.dataset.uid); if (a) a.relevance = b.dataset.rel; collect(); render(); })));
    const addUc = m.querySelector('#btn-add-uc');
    if (addUc) addUc.addEventListener('click', () => { collectUc(); mUc.push({ id: generateId(), title: '', question: '', description: '' }); collect(); render(); });
    m.querySelectorAll('[data-rm-uc]').forEach(b => b.addEventListener('click', () => { collectUc(); mUc.splice(parseInt(b.dataset.rmUc), 1); collect(); render(); }));

    m.querySelector('#msv').addEventListener('click', () => {
      collect(); collectUc();
      const title = (document.getElementById('mt')?.value || '').trim();
      if (!title) { showToast('Titel erforderlich', 'warning'); return; }
      const allR = getData(STORAGE_KEYS.reports) || [];
      const now = new Date().toISOString();
      const data = { title, description: report.description, category: report.category, status: report.status, priority: report.priority, refresh_cycle: report.refresh_cycle, tableau_url: report.tableau_url || '', jira_ticket: report.jira_ticket || '', jira_url: report.jira_url || '', data_source_ids: mDs, user_assignments: mUa, use_cases: mUc, workbook_id: report.workbook_id || '', usage_count: report.usage_count || 0, updated_at: now };
      let savedId;
      if (isEdit) { const idx = allR.findIndex(r => r.id === reportId); if (idx !== -1) allR[idx] = { ...allR[idx], ...data }; savedId = reportId; }
      else { savedId = generateId(); allR.push({ id: savedId, ...data, created_at: now }); }
      saveData(STORAGE_KEYS.reports, allR);
      // Save notes
      const allNotes = getData(STORAGE_KEYS.reportNotes) || {};
      allNotes[savedId] = mNotes;
      saveData(STORAGE_KEYS.reportNotes, allNotes);
      closeModal(); updateProgressPill();
      const renderers = { dashboard: renderDashboard, reports: renderReports, reports_past: renderReportsPast, report_stats: renderReportStats, users: renderUsers, datasources: renderDatasources, categories: renderCategories, rollout: renderRollout, consolidation: renderConsolidation };
      if (renderers[state.currentView]) renderers[state.currentView]();
      showToast(isEdit ? 'Aktualisiert' : 'Erstellt', 'success');
    });
  }

  function collect() {
    const t = document.getElementById('mt'), d = document.getElementById('md'), c = document.getElementById('mcat'), s = document.getElementById('mstat'), r = document.getElementById('mref'), tu = document.getElementById('mturl'), jt = document.getElementById('mjira'), ju = document.getElementById('mjiraurl'), wb = document.getElementById('mwb'), us = document.getElementById('musage'), nt = document.getElementById('m-notes');
    if (t) report.title = t.value; if (d) report.description = d.value; if (c) report.category = c.value; if (s) report.status = s.value; if (r) report.refresh_cycle = r.value; if (tu) report.tableau_url = tu.value; if (jt) report.jira_ticket = jt.value; if (ju) report.jira_url = ju.value; if (wb) report.workbook_id = wb.value; if (us) report.usage_count = parseInt(us.value) || 0; if (nt) mNotes = nt.value;
  }
  function collectUc() {
    document.querySelectorAll('.use-case-row').forEach((row, i) => {
      if (mUc[i]) { const t = row.querySelector('.uc-t'), q = row.querySelector('.uc-q'), d = row.querySelector('.uc-d'); if (t) mUc[i].title = t.value; if (q) mUc[i].question = q.value; if (d) mUc[i].description = d.value; }
    });
  }

  document.getElementById('modal-overlay').classList.add('open');
  render();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

function closeAllModals() {
  document.getElementById('modal-overlay').classList.remove('open');
}

/* === PDF STAMMBLATT (Individual Report) === */

function generateReportPdf(reportId) {
  const reports = getData(STORAGE_KEYS.reports) || [];
  const users = getData(STORAGE_KEYS.users) || [];
  const datasources = getData(STORAGE_KEYS.datasources) || [];
  const r = reports.find(x => x.id === reportId);
  if (!r) { showToast('Auswertung nicht gefunden', 'error'); return; }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    showToast('PDF-Bibliothek wird geladen…', 'warning');
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js';
    s.onload = () => showToast('PDF geladen. Bitte erneut klicken.', 'success');
    document.head.appendChild(s);
    return;
  }

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210, pageH = 297, margin = 20, contentW = 170;
    let y = 0;

    function checkPage(needed) { if (y + needed > pageH - 20) { doc.addPage(); y = 20; } }
    function hexToRgb(hex) { if (!hex || hex.length < 7) return [100, 116, 139]; return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)]; }

    // --- Header bar ---
    const catColor = getCatColor(r.category);
    const [hr, hg, hb] = hexToRgb(catColor);
    doc.setFillColor(20, 61, 89);
    doc.rect(0, 0, pageW, 50, 'F');
    doc.setFillColor(hr, hg, hb);
    doc.rect(0, 50, pageW, 4, 'F');

    // Title
    doc.setTextColor(212, 176, 57);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('STAMMBLATT', margin, 16);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    const titleText = sanitizePdf(r.title || 'Ohne Titel');
    const titleLines = doc.splitTextToSize(titleText, contentW);
    doc.text(titleLines, margin, 28);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 200, 220);
    doc.text('Haecker Kuechen - Tableau Intelligence Hub', margin, 45);
    doc.text(new Date().toLocaleDateString('de-DE'), pageW - margin, 45, { align: 'right' });

    y = 62;

    // --- Metadata section ---
    doc.setFillColor(245, 247, 252);
    doc.roundedRect(margin, y, contentW, 48, 3, 3, 'F');

    const comp = getCompleteness(r);
    const meta = [
      ['Kategorie', sanitizePdf(CATEGORIES[r.category]?.label || r.category)],
      ['Status', sanitizePdf(STATUSES[r.status]?.label || r.status)],
      ['Prioritaet', sanitizePdf(PRIORITIES[r.priority]?.label || r.priority)],
      ['Aktualisierung', sanitizePdf(r.refresh_cycle || '–')],
      ['Score', comp + ' / 5'],
      ['JIRA', sanitizePdf(r.jira_ticket || '–')]
    ];

    const colW = contentW / 3;
    meta.forEach((m, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const mx = margin + 8 + col * colW;
      const my = y + 10 + row * 20;
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 130, 150);
      doc.text(m[0], mx, my);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 40, 60);
      doc.text(m[1], mx, my + 6);
    });

    y += 56;

    // --- Tableau & JIRA URLs ---
    if ((r.tableau_url && r.tableau_url.trim()) || (r.jira_url && r.jira_url.trim())) {
      checkPage(20);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 100, 130);
      if (r.tableau_url && r.tableau_url.trim()) {
        doc.text('Tableau: ' + sanitizePdf(r.tableau_url), margin, y);
        y += 5;
      }
      if (r.jira_url && r.jira_url.trim()) {
        doc.text('JIRA: ' + sanitizePdf(r.jira_url), margin, y);
        y += 5;
      }
      y += 4;
    }

    // --- Description ---
    if (r.description && r.description.trim()) {
      checkPage(25);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(20, 61, 89);
      doc.text('Beschreibung', margin, y);
      y += 7;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(50, 60, 80);
      const descLines = doc.splitTextToSize(sanitizePdf(r.description), contentW);
      descLines.forEach(line => { checkPage(6); doc.text(line, margin, y); y += 5; });
      y += 6;
    }

    // --- Datenquellen ---
    const rDs = (r.data_source_ids || []).map(did => datasources.find(d => d.id === did)).filter(Boolean);
    if (rDs.length) {
      checkPage(20);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(20, 61, 89);
      doc.text('Datenquellen (' + rDs.length + ')', margin, y);
      y += 8;

      rDs.forEach(d => {
        checkPage(12);
        doc.setFillColor(248, 249, 252);
        doc.roundedRect(margin, y - 3, contentW, 10, 2, 2, 'F');
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(40, 50, 70);
        doc.text(sanitizePdf(d.name), margin + 4, y + 3);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 115, 140);
        doc.text(sanitizePdf((d.type ? d.type.toUpperCase() : '') + (d.owner ? ' | ' + d.owner : '')), margin + contentW - 4, y + 3, { align: 'right' });
        y += 13;
      });
      y += 4;
    }

    // --- Nutzer & Relevanz ---
    const rUa = (r.user_assignments || []).map(a => { const u = users.find(x => x.id === a.user_id); return u ? { ...u, relevance: a.relevance } : null; }).filter(Boolean);
    if (rUa.length) {
      checkPage(20);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(20, 61, 89);
      doc.text('Nutzer & Relevanz (' + rUa.length + ')', margin, y);
      y += 8;

      rUa.forEach(u => {
        checkPage(12);
        doc.setFillColor(248, 249, 252);
        doc.roundedRect(margin, y - 3, contentW, 10, 2, 2, 'F');
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(40, 50, 70);
        doc.text(sanitizePdf(u.name), margin + 4, y + 3);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 115, 140);
        const relLabel = u.relevance === 'primär' ? 'Primaer' : u.relevance === 'sekundär' ? 'Sekundaer' : 'Info';
        doc.text(sanitizePdf((ROLES[u.role]?.label || '') + ' | ' + relLabel), margin + contentW - 4, y + 3, { align: 'right' });
        y += 13;
      });
      y += 4;
    }

    // --- Use Cases ---
    const rUc = r.use_cases || [];
    if (rUc.length) {
      checkPage(20);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(20, 61, 89);
      doc.text('Use Cases (' + rUc.length + ')', margin, y);
      y += 8;

      rUc.forEach((uc, idx) => {
        checkPage(22);
        doc.setFillColor(248, 249, 252);
        const ucH = 18 + (uc.description ? 5 : 0);
        doc.roundedRect(margin, y - 3, contentW, ucH, 2, 2, 'F');

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(40, 50, 70);
        doc.text(sanitizePdf((idx + 1) + '. ' + (uc.title || 'Ohne Titel')), margin + 4, y + 3);

        if (uc.question) {
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(80, 90, 110);
          doc.text(sanitizePdf('Frage: ' + uc.question), margin + 4, y + 10);
        }
        if (uc.description) {
          doc.setFontSize(8);
          doc.setTextColor(110, 120, 140);
          doc.text(sanitizePdf(uc.description).substring(0, 120), margin + 4, y + 15);
        }
        y += ucH + 4;
      });
      y += 4;
    }

    // --- Vollstaendigkeit ---
    checkPage(25);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 61, 89);
    doc.text('Vollstaendigkeit', margin, y);
    y += 8;

    const checks = [
      { l: 'Beschreibung', d: !!(r.description && r.description.trim()) },
      { l: 'Datenquellen', d: (r.data_source_ids || []).length > 0 },
      { l: 'Nutzer', d: (r.user_assignments || []).length > 0 },
      { l: 'Use Cases', d: (r.use_cases || []).length > 0 },
      { l: 'Aktualisierungszyklus', d: !!(r.refresh_cycle && r.refresh_cycle.trim()) }
    ];

    checks.forEach(c => {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(c.d ? 34 : 180, c.d ? 150 : 50, c.d ? 62 : 50);
      doc.text((c.d ? '[x]' : '[ ]') + '  ' + sanitizePdf(c.l), margin + 4, y);
      y += 6;
    });

    // --- Footer ---
    y = pageH - 15;
    doc.setDrawColor(200, 200, 210);
    doc.line(margin, y - 5, margin + contentW, y - 5);
    doc.setFontSize(7);
    doc.setTextColor(150, 160, 175);
    doc.text('Haecker Kuechen - Tableau Intelligence Hub - Stammblatt - ' + new Date().toLocaleString('de-DE'), pageW / 2, y, { align: 'center' });

    const fileName = 'Stammblatt_' + sanitizePdf(r.title || 'Report').replace(/\s+/g, '_').substring(0, 40) + '_' + new Date().toISOString().split('T')[0] + '.pdf';
    // Use Blob approach for reliable cross-browser download
    const pdfBlob = doc.output('blob');
    const blobUrl = URL.createObjectURL(pdfBlob);
    const downloadLink = document.createElement('a');
    downloadLink.href = blobUrl;
    downloadLink.download = fileName;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    showToast('Stammblatt heruntergeladen', 'success');

  } catch (err) {
    console.error('PDF Stammblatt error:', err);
    showToast('PDF-Fehler: ' + err.message, 'error');
  }
}

/** Sanitize text for jsPDF (replace special chars the default font can't render) */
function sanitizePdf(str) {
  if (!str) return '';
  return String(str)
    .replace(/ä/g, 'ae').replace(/Ä/g, 'Ae')
    .replace(/ö/g, 'oe').replace(/Ö/g, 'Oe')
    .replace(/ü/g, 'ue').replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
    .replace(/·/g, '-').replace(/—/g, '-').replace(/–/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

/* === FILTERS HELPER === */

function bindDropdown(id, attr, cb) {
  const c = document.getElementById(id);
  if (!c) return;
  c.querySelector('.filter-dropdown-btn').addEventListener('click', () => c.querySelector('.filter-dropdown-menu').classList.toggle('open'));
  c.querySelectorAll('.filter-dropdown-item').forEach(item => item.addEventListener('click', () => { cb(item.getAttribute(attr)); c.querySelector('.filter-dropdown-menu').classList.remove('open'); }));
}

function handleDropdownClose(e) {
  document.querySelectorAll('.filter-dropdown-menu.open').forEach(m => { if (!m.closest('.filter-dropdown').contains(e.target)) m.classList.remove('open'); });
}

/* === CHARTS === */

function renderCategoryChart(catCounts) {
  destroyChart('cat');
  const ctx = document.getElementById('chart-categories');
  if (!ctx) return;
  const textColor = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#6B7FA3';
  const labelColor = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#F0F4FF';

  state.chartInstances.cat = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(catCounts).map(k => CATEGORIES[k]?.label || k),
      datasets: [{ data: Object.values(catCounts), backgroundColor: Object.keys(catCounts).map(k => getCatColor(k)), borderRadius: 8, barThickness: 28 }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1A2740', titleColor: '#F0F4FF', bodyColor: '#F0F4FF', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, cornerRadius: 8, padding: 12 } },
      scales: { x: { grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { color: textColor, stepSize: 1 } }, y: { grid: { display: false }, ticks: { color: labelColor, font: { size: 12 } } } }
    }
  });
}

function renderCompletenessChart(complete, incomplete) {
  destroyChart('comp');
  const ctx = document.getElementById('chart-completeness');
  if (!ctx) return;
  const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#D4B039';
  const mutedColor = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#6B7FA3';

  state.chartInstances.comp = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Vollständig (\u22654/5)', 'Unvollständig (<4/5)'],
      datasets: [{ data: [complete, incomplete], backgroundColor: [accentColor, 'rgba(128,128,128,0.2)'], borderWidth: 0, hoverOffset: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: { legend: { position: 'bottom', labels: { color: mutedColor, padding: 16, font: { size: 12 } } }, tooltip: { backgroundColor: '#1A2740', titleColor: '#F0F4FF', bodyColor: '#F0F4FF', cornerRadius: 8, padding: 12 } }
    }
  });
}

function destroyChart(key) {
  if (state.chartInstances[key]) { state.chartInstances[key].destroy(); delete state.chartInstances[key]; }
}

/* === TOAST === */

function showToast(msg, type = 'success') {
  const c = document.getElementById('toast-container');
  const icons = { success: '\u2713', warning: '\u26A0', error: '\u2715' };
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type] || '\u2713'}</span> ${msg}`;
  c.appendChild(t);
  setTimeout(() => { t.classList.add('removing'); setTimeout(() => t.remove(), 250); }, 3000);
}

/* === DELETE CONFIRM === */

function showDeleteConfirmCard(btn, reportId) {
  document.querySelectorAll('.confirm-popover').forEach(p => p.remove());
  const card = btn.closest('.report-card') || btn.parentElement;
  card.style.position = 'relative';
  const pop = document.createElement('div');
  pop.className = 'confirm-popover confirm-popover-card';
  pop.innerHTML = `<div class="confirm-popover-text">Wirklich löschen?</div><div class="confirm-popover-actions"><button class="btn btn-ghost btn-sm cn" type="button">Nein</button><button class="btn btn-danger btn-sm cy" type="button">Ja</button></div>`;
  card.appendChild(pop);
  pop.querySelector('.cn').addEventListener('click', e => { e.stopPropagation(); pop.remove(); });
  pop.querySelector('.cy').addEventListener('click', e => {
    e.stopPropagation();
    let all = getData(STORAGE_KEYS.reports) || [];
    all = all.filter(r => r.id !== reportId);
    saveData(STORAGE_KEYS.reports, all);
    updateProgressPill(); showToast('Gelöscht', 'success'); pop.remove();
    const renderers = { dashboard: renderDashboard, reports: renderReports, users: renderUsers, datasources: renderDatasources, categories: renderCategories, rollout: renderRollout, consolidation: renderConsolidation };
    if (renderers[state.currentView]) renderers[state.currentView]();
  });
  setTimeout(() => { const handler = e => { if (!pop.contains(e.target) && e.target !== btn) { pop.remove(); document.removeEventListener('click', handler); } }; document.addEventListener('click', handler); }, 0);
}

function showDeleteConfirm(btn, reportId) {
  document.querySelectorAll('.confirm-popover').forEach(p => p.remove());
  const w = btn.closest('.table-actions') || btn.closest('.orphan-card') || btn.parentElement;
  w.style.position = 'relative';
  const pop = document.createElement('div');
  pop.className = 'confirm-popover';
  pop.innerHTML = `<div class="confirm-popover-text">Wirklich löschen?</div><div class="confirm-popover-actions"><button class="btn btn-ghost btn-sm cn" type="button">Nein</button><button class="btn btn-danger btn-sm cy" type="button">Ja</button></div>`;
  w.appendChild(pop);
  pop.querySelector('.cn').addEventListener('click', () => pop.remove());
  pop.querySelector('.cy').addEventListener('click', () => {
    let all = getData(STORAGE_KEYS.reports) || [];
    all = all.filter(r => r.id !== reportId);
    saveData(STORAGE_KEYS.reports, all);
    updateProgressPill(); showToast('Gelöscht', 'success'); pop.remove();
    const renderers = { dashboard: renderDashboard, reports: renderReports, users: renderUsers, datasources: renderDatasources, categories: renderCategories, rollout: renderRollout, consolidation: renderConsolidation };
    if (renderers[state.currentView]) renderers[state.currentView]();
  });
  setTimeout(() => { const handler = e => { if (!pop.contains(e.target) && e.target !== btn) { pop.remove(); document.removeEventListener('click', handler); } }; document.addEventListener('click', handler); }, 0);
}

function showDeleteConfirmDs(btn, dsId) {
  document.querySelectorAll('.confirm-popover').forEach(p => p.remove());
  const w = btn.closest('.table-actions') || btn.parentElement;
  w.style.position = 'relative';
  const pop = document.createElement('div');
  pop.className = 'confirm-popover';
  pop.innerHTML = `<div class="confirm-popover-text">Datenquelle löschen?</div><div class="confirm-popover-actions"><button class="btn btn-ghost btn-sm cn" type="button">Nein</button><button class="btn btn-danger btn-sm cy" type="button">Ja</button></div>`;
  w.appendChild(pop);
  pop.querySelector('.cn').addEventListener('click', () => pop.remove());
  pop.querySelector('.cy').addEventListener('click', () => {
    let all = getData(STORAGE_KEYS.datasources) || [];
    all = all.filter(d => d.id !== dsId);
    saveData(STORAGE_KEYS.datasources, all);
    const reps = getData(STORAGE_KEYS.reports) || [];
    reps.forEach(r => r.data_source_ids = (r.data_source_ids || []).filter(x => x !== dsId));
    saveData(STORAGE_KEYS.reports, reps);
    showToast('Gelöscht', 'success'); pop.remove(); renderDatasources();
  });
  setTimeout(() => { const handler = e => { if (!pop.contains(e.target) && e.target !== btn) { pop.remove(); document.removeEventListener('click', handler); } }; document.addEventListener('click', handler); }, 0);
}

/* === SEARCH (CMD+K) === */

function initSpotlight() {
  const ov = document.getElementById('spotlight-overlay');
  const inp = document.getElementById('spotlight-input');
  const res = document.getElementById('spotlight-results');

  function open() { ov.classList.add('open'); inp.value = ''; res.innerHTML = ''; setTimeout(() => inp.focus(), 50); }
  function close() { ov.classList.remove('open'); }

  function search(q) {
    if (!q.trim()) { res.innerHTML = ''; return; }
    const ql = q.toLowerCase();
    const reports = getData(STORAGE_KEYS.reports) || [];
    const dss = getData(STORAGE_KEYS.datasources) || [];
    const usrs = getData(STORAGE_KEYS.users) || [];

    const mr = reports.filter(r => r.title.toLowerCase().includes(ql) || (r.description || '').toLowerCase().includes(ql)).slice(0, 5);
    const md = dss.filter(d => d.name.toLowerCase().includes(ql)).slice(0, 3);
    const mu = usrs.filter(u => u.name.toLowerCase().includes(ql)).slice(0, 3);

    let h = '';
    if (mr.length) { h += `<div class="spotlight-group"><div class="spotlight-group-label">Auswertungen</div>${mr.map(r => `<div class="spotlight-item" data-act="report" data-id="${r.id}"><div class="spotlight-item-icon" style="color:${getCatColor(r.category)}">\uD83D\uDCCA</div><span class="spotlight-item-text">${r.title}</span><span class="spotlight-item-meta">${CATEGORIES[r.category]?.label || ''}</span></div>`).join('')}</div>`; }
    if (md.length) { h += `<div class="spotlight-group"><div class="spotlight-group-label">Datenquellen</div>${md.map(d => `<div class="spotlight-item" data-act="ds" data-id="${d.id}"><div class="spotlight-item-icon">${DS_TYPES[d.type]?.icon || ''}</div><span class="spotlight-item-text">${d.name}</span></div>`).join('')}</div>`; }
    if (mu.length) { h += `<div class="spotlight-group"><div class="spotlight-group-label">Nutzer</div>${mu.map(u => `<div class="spotlight-item" data-act="user" data-id="${u.id}"><div class="spotlight-item-icon" style="background:${ROLES[u.role]?.color || '#64748B'};color:#fff;border-radius:50%;font-size:11px">${getInitials(u.name)}</div><span class="spotlight-item-text">${u.name}</span></div>`).join('')}</div>`; }
    if (!h) h = '<div class="spotlight-empty">Keine Ergebnisse</div>';
    res.innerHTML = h;

    res.querySelectorAll('.spotlight-item').forEach(item => {
      item.addEventListener('click', () => {
        close();
        if (item.dataset.act === 'report') { navigateTo('reports'); setTimeout(() => openReportModal(item.dataset.id), 200); }
        else if (item.dataset.act === 'ds') navigateTo('datasources');
        else if (item.dataset.act === 'user') { state.selectedUserId = item.dataset.id; navigateTo('users'); }
      });
    });
  }

  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); ov.classList.contains('open') ? close() : open(); }
    if (e.key === 'Escape' && ov.classList.contains('open')) close();
  });
  inp.addEventListener('input', () => search(inp.value));
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  document.getElementById('navbar-search-btn').addEventListener('click', open);
}

/* === PROGRESS PILL === */

function updateProgressPill() {
  const reports = getData(STORAGE_KEYS.reports) || [];
  const ac = reports.filter(r => r.status === 'aktiv').length;
  const pill = document.getElementById('sidebar-progress');
  const text = document.getElementById('sidebar-progress-text');
  if (!pill || !text) return;
  pill.classList.remove('warning', 'danger');
  let suf = ' \u2713';
  if (ac > MAX_REPORTS_LIMIT) { pill.classList.add('danger'); suf = ' !'; }
  else if (ac > 20) { pill.classList.add('warning'); suf = ''; }
  text.textContent = `${ac} / ${MAX_REPORTS_LIMIT}${suf}`;
}

/* === RENDER: ROLLOUT === */

const ROLLOUT_PHASES = {
  geplant: { label: 'Geplant', css: 'rollout-phase-geplant' },
  pilotierung: { label: 'Pilotierung', css: 'rollout-phase-pilotierung' },
  rollout: { label: 'Rollout', css: 'rollout-phase-rollout' },
  abgeschlossen: { label: 'Abgeschlossen', css: 'rollout-phase-abgeschlossen' }
};
const ROLLOUT_PHASE_ORDER = ['geplant', 'pilotierung', 'rollout', 'abgeschlossen'];

function renderRollout() {
  const reports = getData(STORAGE_KEYS.reports) || [];
  const rolloutData = getData(STORAGE_KEYS.rollout) || {};

  // Ensure all reports have rollout data
  reports.forEach(r => {
    if (!rolloutData[r.id]) rolloutData[r.id] = { phase: 'geplant', go_live: '' };
  });

  const phaseCounts = {};
  ROLLOUT_PHASE_ORDER.forEach(p => phaseCounts[p] = 0);
  reports.forEach(r => { const rd = rolloutData[r.id]; if (rd && phaseCounts[rd.phase] !== undefined) phaseCounts[rd.phase]++; });

  // Sort: upcoming dates first, then by phase order
  const sorted = [...reports].sort((a, b) => {
    const ra = rolloutData[a.id] || {}, rb = rolloutData[b.id] || {};
    const phaseA = ROLLOUT_PHASE_ORDER.indexOf(ra.phase), phaseB = ROLLOUT_PHASE_ORDER.indexOf(rb.phase);
    if (phaseA !== phaseB) return phaseA - phaseB;
    if (ra.go_live && rb.go_live) return ra.go_live.localeCompare(rb.go_live);
    if (ra.go_live) return -1;
    if (rb.go_live) return 1;
    return 0;
  });

  const el = document.getElementById('rollout-content');
  el.innerHTML = `
    <div class="view-header"><h1 class="view-title">Rollout-Planung</h1><p class="view-subtitle">Zeitliche Planung aller Tableau-Auswertungen</p></div>
    <div class="rollout-stat-row">
      ${ROLLOUT_PHASE_ORDER.map(p => `<div class="rollout-stat"><div class="rollout-stat-value">${phaseCounts[p]}</div><div class="rollout-stat-label">${ROLLOUT_PHASES[p].label}</div></div>`).join('')}
    </div>
    <div class="rollout-filters">
      ${ROLLOUT_PHASE_ORDER.map(p => `<button class="filter-pill rollout-phase-filter" data-rphase="${p}" type="button">${ROLLOUT_PHASES[p].label}</button>`).join('')}
      <button class="filter-pill rollout-phase-filter active" data-rphase="" type="button">Alle</button>
    </div>
    <div class="rollout-timeline" id="rollout-timeline">
      ${sorted.map(r => {
        const rd = rolloutData[r.id] || { phase: 'geplant', go_live: '' };
        return `<div class="rollout-card" data-rid="${r.id}" style="border-left-color:${getCatColor(r.category)}">
          <div class="rollout-card-info">
            <div class="rollout-card-title">${r.title}</div>
            <div class="rollout-card-meta">
              <span style="color:${getCatColor(r.category)}">${CATEGORIES[r.category]?.label || ''}</span>
              <span class="badge ${STATUSES[r.status]?.css || ''}">${STATUSES[r.status]?.label || ''}</span>
              <span class="rollout-phase-badge ${ROLLOUT_PHASES[rd.phase]?.css || ''}">${ROLLOUT_PHASES[rd.phase]?.label || rd.phase}</span>
            </div>
          </div>
          <div class="rollout-card-date">
            <label style="font-size:12px;color:var(--muted);white-space:nowrap">Go-Live:</label>
            <input type="date" value="${rd.go_live || ''}" data-date-rid="${r.id}">
          </div>
          <div class="rollout-card-actions">
            <select class="form-select" style="width:auto;padding:6px 30px 6px 10px;font-size:12px" data-phase-rid="${r.id}">
              ${ROLLOUT_PHASE_ORDER.map(p => `<option value="${p}" ${rd.phase === p ? 'selected' : ''}>${ROLLOUT_PHASES[p].label}</option>`).join('')}
            </select>
          </div>
        </div>`;
      }).join('')}
    </div>`;

  // Phase filter
  let activePhaseFilter = '';
  el.querySelectorAll('.rollout-phase-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      activePhaseFilter = btn.dataset.rphase;
      el.querySelectorAll('.rollout-phase-filter').forEach(b => b.classList.toggle('active', b.dataset.rphase === activePhaseFilter));
      el.querySelectorAll('.rollout-card').forEach(card => {
        const rid = card.dataset.rid;
        const rd = rolloutData[rid] || {};
        card.style.display = (!activePhaseFilter || rd.phase === activePhaseFilter) ? '' : 'none';
      });
    });
  });

  // Date change
  el.querySelectorAll('[data-date-rid]').forEach(inp => {
    inp.addEventListener('change', () => {
      const rd = rolloutData[inp.dataset.dateRid] || { phase: 'geplant', go_live: '' };
      rd.go_live = inp.value;
      rolloutData[inp.dataset.dateRid] = rd;
      saveData(STORAGE_KEYS.rollout, rolloutData);
      showToast('Datum gespeichert', 'success');
    });
  });

  // Phase change
  el.querySelectorAll('[data-phase-rid]').forEach(sel => {
    sel.addEventListener('change', () => {
      const rd = rolloutData[sel.dataset.phaseRid] || { phase: 'geplant', go_live: '' };
      rd.phase = sel.value;
      rolloutData[sel.dataset.phaseRid] = rd;
      saveData(STORAGE_KEYS.rollout, rolloutData);
      showToast('Phase aktualisiert', 'success');
      renderRollout();
    });
  });
}

/* === TEAMS MANAGEMENT (in Users view) === */

function getTeams() {
  return getData(STORAGE_KEYS.teams) || ['Einkauf', 'Strategischer Einkauf', 'Operativer Einkauf', 'Controlling', 'Produktmanagement'];
}

function renderTeamsSection() {
  const teams = getTeams();
  return `<div class="teams-section">
    <div class="dashboard-section-title">Teams / Abteilungen verwalten</div>
    <div class="teams-grid" id="teams-grid">
      ${teams.map((t, i) => `<div class="team-chip">
        <span class="team-chip-name" data-tidx="${i}">${t}</span>
        <span class="team-chip-edit" data-edit-team="${i}" title="Bearbeiten">\u270F\uFE0F</span>
        <span class="team-chip-remove" data-rm-team="${i}" title="Entfernen">\u00D7</span>
      </div>`).join('')}
      <button class="btn btn-ghost btn-sm" id="btn-add-team" type="button">+ Team</button>
    </div>
  </div>`;
}

function bindTeamEvents(el) {
  const addBtn = el.querySelector('#btn-add-team');
  if (addBtn) addBtn.addEventListener('click', () => {
    const name = prompt('Neues Team / Abteilung:');
    if (name && name.trim()) {
      const teams = getTeams();
      teams.push(name.trim());
      saveData(STORAGE_KEYS.teams, teams);
      showToast('Team hinzugefügt', 'success');
      renderUsers();
    }
  });

  el.querySelectorAll('[data-edit-team]').forEach(btn => {
    btn.addEventListener('click', () => {
      const teams = getTeams();
      const idx = parseInt(btn.dataset.editTeam);
      const old = teams[idx];
      const newName = prompt('Team umbenennen:', old);
      if (newName && newName.trim() && newName.trim() !== old) {
        teams[idx] = newName.trim();
        saveData(STORAGE_KEYS.teams, teams);
        // Update users with old department name
        const users = getData(STORAGE_KEYS.users) || [];
        users.forEach(u => { if (u.department === old) u.department = newName.trim(); });
        saveData(STORAGE_KEYS.users, users);
        showToast('Team umbenannt', 'success');
        renderUsers();
      }
    });
  });

  el.querySelectorAll('[data-rm-team]').forEach(btn => {
    btn.addEventListener('click', () => {
      const teams = getTeams();
      const idx = parseInt(btn.dataset.rmTeam);
      if (confirm(`Team "${teams[idx]}" wirklich entfernen?`)) {
        teams.splice(idx, 1);
        saveData(STORAGE_KEYS.teams, teams);
        showToast('Team entfernt', 'success');
        renderUsers();
      }
    });
  });
}

/* === WORKBOOK MODAL === */

function showWorkbookModal(storageKey, workbookId, onSaveCallback) {
  const workbooks = getData(storageKey) || [];
  const isEdit = !!workbookId;
  const wb = isEdit ? workbooks.find(w => w.id === workbookId) : { id: '', name: '', color: '#3B82F6', description: '' };
  if (!wb) return;

  const m = document.getElementById('modal-container');
  m.innerHTML = `<div class="modal-header"><div class="modal-title">${isEdit ? 'Workbook bearbeiten' : 'Neues Workbook'}</div><button class="modal-close" id="wb-modal-close" type="button">\u00D7</button></div>
  <div class="modal-body">
    <div class="form-group"><label class="form-label">Name *</label><input class="form-input" id="wb-name" value="${wb.name}" placeholder="Workbook-Name"></div>
    <div class="form-group"><label class="form-label">Beschreibung</label><textarea class="form-input" id="wb-desc" rows="2" placeholder="Kurzbeschreibung\u2026">${wb.description || ''}</textarea></div>
    <div class="form-group"><label class="form-label">Farbe</label><div class="color-picker" id="wb-color-picker">${CATEGORY_COLORS.map(c => `<button class="color-pick-btn ${wb.color === c ? 'active' : ''}" data-color="${c}" type="button" style="background:${c}"></button>`).join('')}</div><input type="hidden" id="wb-color" value="${wb.color}"></div>
  </div>
  <div class="modal-footer">
    ${isEdit ? '<button class="btn btn-danger" id="wb-delete" type="button">L\u00F6schen</button>' : ''}
    <button class="btn btn-ghost" id="wb-cancel" type="button">Abbrechen</button>
    <button class="btn btn-primary" id="wb-save" type="button">Speichern</button>
  </div>`;

  document.getElementById('modal-overlay').classList.add('open');

  m.querySelectorAll('.color-pick-btn').forEach(b => b.addEventListener('click', () => { m.querySelectorAll('.color-pick-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); document.getElementById('wb-color').value = b.dataset.color; }));
  m.querySelector('#wb-modal-close').addEventListener('click', closeModal);
  m.querySelector('#wb-cancel').addEventListener('click', closeModal);

  m.querySelector('#wb-save').addEventListener('click', () => {
    const name = document.getElementById('wb-name').value.trim();
    if (!name) { showToast('Name ist erforderlich', 'warning'); return; }
    const all = getData(storageKey) || [];
    const now = new Date().toISOString();
    if (isEdit) {
      const idx = all.findIndex(w => w.id === workbookId);
      if (idx !== -1) { all[idx].name = name; all[idx].description = document.getElementById('wb-desc').value.trim(); all[idx].color = document.getElementById('wb-color').value; }
    } else {
      all.push({ id: generateId(), name, color: document.getElementById('wb-color').value, description: document.getElementById('wb-desc').value.trim(), created_at: now });
    }
    saveData(storageKey, all);
    closeModal();
    showToast(isEdit ? 'Workbook aktualisiert' : 'Workbook erstellt', 'success');
    if (onSaveCallback) onSaveCallback();
  });

  const delBtn = m.querySelector('#wb-delete');
  if (delBtn) delBtn.addEventListener('click', () => {
    if (!confirm('Workbook wirklich l\u00F6schen? Auswertungen verlieren ihre Zuordnung.')) return;
    let all = getData(storageKey) || [];
    all = all.filter(w => w.id !== workbookId);
    saveData(storageKey, all);
    closeModal();
    showToast('Workbook gel\u00F6scht', 'success');
    if (onSaveCallback) onSaveCallback();
  });
}

/* === ARCHIVE / REACTIVATE === */

function archiveReport(reportId) {
  const reports = getData(STORAGE_KEYS.reports) || [];
  const idx = reports.findIndex(r => r.id === reportId);
  if (idx === -1) return;
  const report = reports.splice(idx, 1)[0];
  saveData(STORAGE_KEYS.reports, reports);

  // Convert to past report
  const past = getData(STORAGE_KEYS.reportsPast) || [];
  report.archived_at = new Date().toISOString();
  report.usage_count = report.usage_count || 0;
  // Try to find matching past workbook or clear
  const wbToday = getData(STORAGE_KEYS.workbooksToday) || [];
  const wbPast = getData(STORAGE_KEYS.workbooksPast) || [];
  const origWb = wbToday.find(w => w.id === report.workbook_id);
  if (origWb) {
    let pastWb = wbPast.find(w => w.name === origWb.name);
    if (!pastWb) { pastWb = { ...origWb, id: generateId(), created_at: new Date().toISOString() }; wbPast.push(pastWb); saveData(STORAGE_KEYS.workbooksPast, wbPast); }
    report.workbook_id = pastWb.id;
  } else {
    report.workbook_id = '';
  }
  past.push(report);
  saveData(STORAGE_KEYS.reportsPast, past);
  updateProgressPill();
  showToast('Archiviert', 'success');
  const renderers = { dashboard: renderDashboard, reports: renderReports, report_stats: renderReportStats };
  if (renderers[state.currentView]) renderers[state.currentView]();
}

function reactivateReport(reportId) {
  const past = getData(STORAGE_KEYS.reportsPast) || [];
  const idx = past.findIndex(r => r.id === reportId);
  if (idx === -1) return;
  const report = past.splice(idx, 1)[0];
  saveData(STORAGE_KEYS.reportsPast, past);

  delete report.archived_at;
  // Try to map workbook back
  const wbPast = getData(STORAGE_KEYS.workbooksPast) || [];
  const wbToday = getData(STORAGE_KEYS.workbooksToday) || [];
  const origWb = wbPast.find(w => w.id === report.workbook_id);
  if (origWb) {
    let todayWb = wbToday.find(w => w.name === origWb.name);
    if (todayWb) report.workbook_id = todayWb.id;
    else report.workbook_id = '';
  } else {
    report.workbook_id = '';
  }
  const reports = getData(STORAGE_KEYS.reports) || [];
  reports.push(report);
  saveData(STORAGE_KEYS.reports, reports);
  updateProgressPill();
  showToast('Reaktiviert', 'success');
  const renderers = { reports_past: renderReportsPast, report_stats: renderReportStats };
  if (renderers[state.currentView]) renderers[state.currentView]();
}

/* === RENDER: REPORTS PAST === */

function renderReportsPast() {
  const pastReports = getData(STORAGE_KEYS.reportsPast) || [];
  const workbooks = getData(STORAGE_KEYS.workbooksPast) || [];
  const notes = getData(STORAGE_KEYS.reportNotes) || {};
  const f = state.reportsPastFilters;

  let filtered = pastReports.filter(r => {
    if (f.search && !r.title.toLowerCase().includes(f.search.toLowerCase()) && !(r.description || '').toLowerCase().includes(f.search.toLowerCase())) return false;
    if (f.workbookId && r.workbook_id !== f.workbookId) return false;
    return true;
  });

  const el = document.getElementById('reports_past-content');
  el.innerHTML = `
    <div class="view-header"><h1 class="view-title">Auswertungen Vergangenheit</h1><p class="view-subtitle">${pastReports.length} archivierte Auswertungen</p></div>
    <div class="workbook-pills">
      <button class="workbook-pill ${!f.workbookId ? 'active' : ''}" data-wb="" type="button">Alle</button>
      ${workbooks.map(wb => `<button class="workbook-pill ${f.workbookId === wb.id ? 'active' : ''}" data-wb="${wb.id}" type="button" style="border-color:${f.workbookId === wb.id ? wb.color : ''}"><span class="workbook-pill-dot" style="background:${wb.color}"></span>${wb.name}<span class="workbook-pill-count">${pastReports.filter(r => r.workbook_id === wb.id).length}</span></button>`).join('')}
      <button class="btn btn-ghost btn-sm" id="btn-new-workbook-past" type="button">+ Workbook</button>
    </div>
    <div class="filter-bar">
      <div class="filter-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input type="text" id="past-search" placeholder="Suchen\u2026" value="${f.search}"></div>
      <button class="btn btn-primary btn-sm" id="btn-add-past-report" type="button">+ Auswertung hinzuf\u00FCgen</button>
    </div>
    <div id="past-reports-list">
    ${workbooks.length === 0 && filtered.length === 0 ? '<div class="empty-state"><div class="empty-state-title">Noch keine archivierten Auswertungen</div><div class="empty-state-text">Archivieren Sie Auswertungen aus "Heute" oder legen Sie hier neue an.</div></div>' : ''}
    ${workbooks.map(wb => {
      const wbReports = filtered.filter(r => r.workbook_id === wb.id);
      if (f.workbookId && f.workbookId !== wb.id) return '';
      return `<div class="category-section" data-wb="${wb.id}">
        <div class="category-header">
          <div class="category-color-bar" style="background:${wb.color}"></div>
          <span class="category-name">${wb.name}</span>
          <span class="category-count">${wbReports.length} Auswertungen</span>
          <div class="category-actions-inline">
            <button class="btn-icon-sm wb-edit-btn" data-wb-id="${wb.id}" type="button" title="Bearbeiten"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          </div>
          <svg class="category-expand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="category-body">${wbReports.length ? `<div class="card-grid">${wbReports.map(r => renderPastReportCard(r, wb, notes)).join('')}</div>` : '<div class="empty-state" style="padding:30px"><div class="empty-state-title">Keine Auswertungen in diesem Workbook</div></div>'}</div>
      </div>`;
    }).join('')}
    ${(() => { const unassigned = filtered.filter(r => !r.workbook_id || !workbooks.find(w => w.id === r.workbook_id)); return unassigned.length ? `<div class="category-section"><div class="category-header"><div class="category-color-bar" style="background:var(--muted)"></div><span class="category-name">Ohne Workbook</span><span class="category-count">${unassigned.length}</span><svg class="category-expand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></div><div class="category-body"><div class="card-grid">${unassigned.map(r => renderPastReportCard(r, null, notes)).join('')}</div></div></div>` : ''; })()}
    </div>`;

  // Events
  el.querySelectorAll('.workbook-pill').forEach(p => p.addEventListener('click', () => { state.reportsPastFilters.workbookId = p.dataset.wb; renderReportsPast(); }));
  const newWbBtn = el.querySelector('#btn-new-workbook-past');
  if (newWbBtn) newWbBtn.addEventListener('click', () => showWorkbookModal(STORAGE_KEYS.workbooksPast, null, renderReportsPast));
  el.querySelectorAll('.wb-edit-btn').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); showWorkbookModal(STORAGE_KEYS.workbooksPast, b.dataset.wbId, renderReportsPast); }));

  const searchInp = el.querySelector('#past-search');
  if (searchInp) searchInp.addEventListener('input', e => { state.reportsPastFilters.search = e.target.value; renderReportsPast(); });

  const addBtn = el.querySelector('#btn-add-past-report');
  if (addBtn) addBtn.addEventListener('click', () => openPastReportModal(null));

  el.querySelectorAll('.category-header').forEach(h => h.addEventListener('click', (e) => { if (e.target.closest('.wb-edit-btn')) return; h.closest('.category-section').classList.toggle('expanded'); }));
  el.querySelectorAll('.past-report-card').forEach(c => c.addEventListener('click', () => openPastReportModal(c.dataset.id)));
}

function renderPastReportCard(r, wb, notes) {
  const hasNote = notes[r.id] && notes[r.id].trim();
  return `<div class="report-card past-report-card" data-id="${r.id}" style="border-left-color:${wb ? wb.color : 'var(--muted)'}">
    <div class="report-card-title">${r.title}</div>
    <div class="report-card-desc">${r.description || 'Keine Beschreibung'}</div>
    <div class="report-card-footer">
      <span class="usage-badge">${r.usage_count || 0} Aufrufe</span>
      ${hasNote ? '<span class="notes-indicator" title="Notizen vorhanden">\uD83D\uDCDD</span>' : ''}
      ${r.category ? `<span style="color:${getCatColor(r.category)};font-size:11px">${CATEGORIES[r.category]?.label || ''}</span>` : ''}
    </div>
  </div>`;
}

/* === PAST REPORT MODAL === */

function openPastReportModal(reportId) {
  const past = getData(STORAGE_KEYS.reportsPast) || [];
  const workbooks = getData(STORAGE_KEYS.workbooksPast) || [];
  const notes = getData(STORAGE_KEYS.reportNotes) || {};
  const isEdit = !!reportId;
  const report = isEdit ? { ...past.find(r => r.id === reportId) } : { id: '', title: '', description: '', category: '', workbook_id: '', usage_count: 0 };
  if (!report) return;

  const m = document.getElementById('modal-container');
  m.innerHTML = `<div class="modal-header"><div class="modal-title">${isEdit ? report.title : 'Neue vergangene Auswertung'}</div><button class="modal-close" id="pm-close" type="button">\u00D7</button></div>
  <div class="modal-body">
    <div class="form-group"><label class="form-label">Titel *</label><input class="form-input" id="pm-title" value="${report.title}" placeholder="Auswertungstitel"></div>
    <div class="form-group"><label class="form-label">Beschreibung</label><textarea class="form-input" id="pm-desc" rows="2" placeholder="Beschreibung\u2026">${report.description || ''}</textarea></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Workbook</label><select class="form-select" id="pm-wb"><option value="">-- Kein Workbook --</option>${workbooks.map(w => `<option value="${w.id}" ${report.workbook_id === w.id ? 'selected' : ''}>${w.name}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">Kategorie</label><select class="form-select" id="pm-cat"><option value="">-- Keine --</option>${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}" ${report.category === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
    </div>
    <div class="form-group"><label class="form-label">Aufrufe (manuell)</label><input class="form-input" id="pm-usage" type="number" min="0" value="${report.usage_count || 0}" placeholder="0"></div>
    <div class="form-group"><label class="form-label">Notizen</label><textarea class="form-input" id="pm-notes" rows="3" placeholder="Notizen\u2026">${notes[report.id] || ''}</textarea></div>
  </div>
  <div class="modal-footer">
    ${isEdit ? '<button class="btn btn-ghost" id="pm-reactivate" type="button">\u21A9 Reaktivieren</button>' : ''}
    ${isEdit ? '<button class="btn btn-danger" id="pm-delete" type="button">L\u00F6schen</button>' : ''}
    <button class="btn btn-ghost" id="pm-cancel" type="button">Abbrechen</button>
    <button class="btn btn-primary" id="pm-save" type="button">Speichern</button>
  </div>`;

  document.getElementById('modal-overlay').classList.add('open');
  m.querySelector('#pm-close').addEventListener('click', closeModal);
  m.querySelector('#pm-cancel').addEventListener('click', closeModal);

  m.querySelector('#pm-save').addEventListener('click', () => {
    const title = document.getElementById('pm-title').value.trim();
    if (!title) { showToast('Titel erforderlich', 'warning'); return; }
    const all = getData(STORAGE_KEYS.reportsPast) || [];
    const now = new Date().toISOString();
    const data = { title, description: document.getElementById('pm-desc').value.trim(), workbook_id: document.getElementById('pm-wb').value, category: document.getElementById('pm-cat').value, usage_count: parseInt(document.getElementById('pm-usage').value) || 0, updated_at: now };
    if (isEdit) { const idx = all.findIndex(r => r.id === reportId); if (idx !== -1) all[idx] = { ...all[idx], ...data }; }
    else { all.push({ id: generateId(), ...data, status: 'deprecated', priority: 'niedrig', data_source_ids: [], user_assignments: [], use_cases: [], created_at: now }); }
    saveData(STORAGE_KEYS.reportsPast, all);
    // Save notes
    const allNotes = getData(STORAGE_KEYS.reportNotes) || {};
    const rid = isEdit ? reportId : all[all.length - 1].id;
    allNotes[rid] = document.getElementById('pm-notes').value;
    saveData(STORAGE_KEYS.reportNotes, allNotes);
    closeModal();
    showToast(isEdit ? 'Aktualisiert' : 'Erstellt', 'success');
    renderReportsPast();
  });

  const reactBtn = m.querySelector('#pm-reactivate');
  if (reactBtn) reactBtn.addEventListener('click', () => { closeModal(); reactivateReport(reportId); });

  const delBtn = m.querySelector('#pm-delete');
  if (delBtn) delBtn.addEventListener('click', () => {
    if (!confirm('Auswertung endg\u00FCltig l\u00F6schen?')) return;
    let all = getData(STORAGE_KEYS.reportsPast) || [];
    all = all.filter(r => r.id !== reportId);
    saveData(STORAGE_KEYS.reportsPast, all);
    closeModal();
    showToast('Gel\u00F6scht', 'success');
    renderReportsPast();
  });
}

/* === RENDER: REPORT STATS === */

function renderReportStats() {
  const todayReports = getData(STORAGE_KEYS.reports) || [];
  const pastReports = getData(STORAGE_KEYS.reportsPast) || [];
  const allReports = [...todayReports.map(r => ({ ...r, source: 'Heute' })), ...pastReports.map(r => ({ ...r, source: 'Vergangenheit' }))];
  const wbToday = getData(STORAGE_KEYS.workbooksToday) || [];
  const wbPast = getData(STORAGE_KEYS.workbooksPast) || [];
  const allWb = [...wbToday, ...wbPast];

  const totalUsage = allReports.reduce((s, r) => s + (r.usage_count || 0), 0);
  const topReport = allReports.length ? allReports.reduce((a, b) => (b.usage_count || 0) > (a.usage_count || 0) ? b : a, allReports[0]) : null;
  const sorted = [...allReports].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));

  const el = document.getElementById('report_stats-content');
  el.innerHTML = `
    <div class="view-header"><h1 class="view-title">Auswertungs-Statistik</h1><p class="view-subtitle">\u00DCbersicht aller Auswertungen mit Nutzungszahlen</p></div>
    <div class="kpi-row">
      <div class="kpi-card"><div class="kpi-card-icon" style="background:rgba(212,176,57,0.12);color:var(--accent)">\uD83D\uDCCA</div><div class="kpi-card-value">${allReports.length}</div><div class="kpi-card-label">Gesamt-Auswertungen</div></div>
      <div class="kpi-card"><div class="kpi-card-icon" style="background:rgba(59,130,246,0.12);color:#3B82F6">\uD83D\uDC41</div><div class="kpi-card-value">${totalUsage}</div><div class="kpi-card-label">Gesamt-Aufrufe</div></div>
      <div class="kpi-card"><div class="kpi-card-icon" style="background:rgba(34,197,94,0.12);color:var(--success)">\u2705</div><div class="kpi-card-value">${todayReports.length}</div><div class="kpi-card-label">Heute aktiv</div></div>
      <div class="kpi-card"><div class="kpi-card-icon" style="background:rgba(168,85,247,0.12);color:#A855F7">\uD83D\uDCC1</div><div class="kpi-card-value">${pastReports.length}</div><div class="kpi-card-label">Vergangenheit</div></div>
    </div>
    ${topReport && (topReport.usage_count || 0) > 0 ? `<div class="stats-highlight"><span class="stats-highlight-label">\uD83C\uDFC6 Meistgenutzte Auswertung:</span> <strong>${topReport.title}</strong> (${topReport.usage_count} Aufrufe)</div>` : ''}
    <div class="table-wrap"><table class="table"><thead><tr><th>Titel</th><th>Quelle</th><th>Workbook</th><th>Kategorie</th><th>Aufrufe</th></tr></thead><tbody>${sorted.map(r => {
      const wb = allWb.find(w => w.id === r.workbook_id);
      return `<tr><td><strong>${r.title}</strong></td><td><span class="badge ${r.source === 'Heute' ? 'badge-aktiv' : 'badge-deprecated'}">${r.source}</span></td><td>${wb ? `<span style="color:${wb.color};font-weight:600;font-size:12px">${wb.name}</span>` : '<span style="color:var(--muted)">\u2013</span>'}</td><td style="color:${getCatColor(r.category)}">${CATEGORIES[r.category]?.label || r.category || '\u2013'}</td><td><span class="usage-badge">${r.usage_count || 0}</span></td></tr>`;
    }).join('')}</tbody></table></div>`;
}

/* === AUTH: LOGIN / REGISTER / LOGOUT === */

let isRegistering = false;

function showLoginScreen() {
  document.getElementById('login-overlay').style.display = 'flex';
  document.getElementById('login-overlay').classList.remove('hidden');
  document.getElementById('app-loading').style.display = 'none';
  document.getElementById('sidebar').style.display = 'none';
  document.getElementById('main-wrapper').style.display = 'none';
  initLoginForm();
}

function hideLoginScreen() {
  const overlay = document.getElementById('login-overlay');
  overlay.classList.add('hidden');
  setTimeout(() => { overlay.style.display = 'none'; }, 300);
  document.getElementById('app-loading').style.display = 'none';
  document.getElementById('sidebar').style.display = '';
  document.getElementById('main-wrapper').style.display = '';
}

function showAppLoading() {
  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('app-loading').style.display = 'flex';
}

function initLoginForm() {
  const form = document.getElementById('login-form');
  const toggleBtn = document.getElementById('login-toggle-btn');
  const toggleText = document.getElementById('login-toggle-text');
  const errorEl = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit');
  const btnText = document.getElementById('login-btn-text');
  const btnSpinner = document.getElementById('login-btn-spinner');

  // Toggle between login/register
  toggleBtn.onclick = () => {
    isRegistering = !isRegistering;
    toggleBtn.textContent = isRegistering ? 'Anmelden' : 'Registrieren';
    toggleText.textContent = isRegistering ? 'Bereits ein Konto?' : 'Noch kein Konto?';
    btnText.textContent = isRegistering ? 'Registrieren' : 'Anmelden';
    errorEl.style.display = 'none';
  };

  // Handle form submit
  form.onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      errorEl.textContent = 'Bitte E-Mail und Passwort eingeben.';
      errorEl.style.display = 'block';
      return;
    }
    if (password.length < 6) {
      errorEl.textContent = 'Passwort muss mindestens 6 Zeichen lang sein.';
      errorEl.style.display = 'block';
      return;
    }

    errorEl.style.display = 'none';
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'block';

    try {
      let result;
      if (isRegistering) {
        result = await supabaseClient.auth.signUp({ email, password });
        if (result.error) throw result.error;
        if (result.data.user && !result.data.session) {
          errorEl.textContent = 'Registrierung erfolgreich! Bitte E-Mail bestätigen.';
          errorEl.style.display = 'block';
          errorEl.style.background = 'rgba(34,197,94,0.12)';
          errorEl.style.borderColor = 'rgba(34,197,94,0.3)';
          errorEl.style.color = '#22C55E';
          submitBtn.disabled = false;
          btnText.style.display = '';
          btnSpinner.style.display = 'none';
          return;
        }
      } else {
        result = await supabaseClient.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
      }

      currentAuthUser = result.data.user;
      await startApp();
    } catch (err) {
      const msgs = {
        'Invalid login credentials': 'Ungültige Anmeldedaten.',
        'Email not confirmed': 'Bitte zuerst E-Mail bestätigen.',
        'User already registered': 'E-Mail bereits registriert.'
      };
      errorEl.textContent = msgs[err.message] || err.message || 'Anmeldung fehlgeschlagen.';
      errorEl.style.display = 'block';
      errorEl.style.background = '';
      errorEl.style.borderColor = '';
      errorEl.style.color = '';
    } finally {
      submitBtn.disabled = false;
      btnText.style.display = '';
      btnSpinner.style.display = 'none';
    }
  };
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  currentAuthUser = null;
  dataCache = {};
  showLoginScreen();
}

function updateSidebarUser() {
  const avatarEl = document.getElementById('sidebar-user-avatar');
  const emailEl = document.getElementById('sidebar-user-email');
  const logoutBtn = document.getElementById('sidebar-logout-btn');
  if (!currentAuthUser) return;
  const email = currentAuthUser.email || '';
  const initials = email.split('@')[0].slice(0, 2).toUpperCase();
  if (avatarEl) avatarEl.textContent = initials;
  if (emailEl) emailEl.textContent = email;
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
}

/* === APP START (after auth) === */

async function startApp() {
  showAppLoading();
  await loadAllData();
  await seedIfEmpty();
  hideLoginScreen();
  initUI();
}

/* === INIT UI (bind events, render) === */

function initUI() {
  initTheme();

  // Logo error fallback
  const logoW = document.getElementById('sidebar-logo-img');
  const logoD = document.getElementById('sidebar-logo-img-dark');
  const fb = document.getElementById('sidebar-logo-fallback');
  let logoFailed = 0;
  const checkFallback = () => { if (logoFailed >= 2) fb.classList.add('visible'); };
  if (logoW) logoW.addEventListener('error', () => { logoW.style.display = 'none'; logoFailed++; checkFallback(); });
  if (logoD) logoD.addEventListener('error', () => { logoD.style.display = 'none'; logoFailed++; checkFallback(); });

  // Theme switcher
  document.querySelectorAll('.theme-btn').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.theme)));

  // Sidebar collapse
  document.getElementById('sidebar-collapse-btn').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('collapsed'));
  document.getElementById('navbar-menu-btn').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('collapsed'));

  // Sidebar nav
  document.querySelectorAll('.sidebar-link').forEach(l => l.addEventListener('click', e => { e.preventDefault(); navigateTo(l.dataset.view); }));

  // Sidebar user
  updateSidebarUser();

  // New report
  document.getElementById('btn-new-report').addEventListener('click', () => openReportModal(null));

  // Modal overlays
  document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target.id === 'modal-overlay') closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAllModals(); });

  initSpotlight();
  updateProgressPill();

  // Route from hash
  const hash = window.location.hash.replace('#', '');
  const valid = ['dashboard', 'reports', 'reports_past', 'report_stats', 'users', 'datasources', 'categories', 'rollout', 'consolidation'];
  navigateTo(valid.includes(hash) ? hash : 'dashboard');
}

/* === BOOTSTRAP === */

async function initApp() {
  initTheme(); // Apply theme early for login screen

  const { data: { session } } = await supabaseClient.auth.getSession();

  if (session && session.user) {
    currentAuthUser = session.user;
    await startApp();
  } else {
    showLoginScreen();
  }

  // Listen for auth state changes (e.g., token refresh)
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      currentAuthUser = null;
      dataCache = {};
      showLoginScreen();
    }
  });
}

document.addEventListener('DOMContentLoaded', initApp);
