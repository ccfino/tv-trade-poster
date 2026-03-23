import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';

// ── Helpers ──────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtPrice(v) {
  if (v === undefined || v === null || v === '') return '—';
  if (Array.isArray(v)) return v.map(x => Number(x).toLocaleString('en-IN')).join(' / ');
  if (typeof v === 'string' && v.includes('-')) {
    const [a, b] = v.split('-').map(x => Number(x.trim()).toLocaleString('en-IN'));
    return `${a}–${b}`;
  }
  return Number(v).toLocaleString('en-IN');
}

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
}

function statusLabel(s) {
  return { queued: 'QUEUED', processing: 'PROCESSING…', posted: '✓ POSTED', failed: '✗ FAILED', dry_run: 'DRY RUN' }[s] || (s || '').toUpperCase();
}

function lsGet(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

// ── Main Component ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [activeTab, setActiveTab]   = useState('feed');
  const [posts, setPosts]           = useState([]);
  const [logs, setLogs]             = useState([]);
  const [wsStatus, setWsStatus]     = useState({ connected: false });
  const [igLimit, setIgLimit]       = useState({ used: 0, limit: 100, remaining: 100 });
  const [postsToday, setPostsToday] = useState(0);
  const [totalPosts, setTotalPosts] = useState(0);
  const [logFilter, setLogFilter]   = useState('all');
  const [lightbox, setLightbox]     = useState(null);
  const [prefs, setPrefs]           = useState(null);
  const [prefMsg, setPrefMsg]       = useState(null);
  const [perfHistory, setPerfHistory] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const imgUrls = useRef(new Set());
  const postsRef = useRef([]);

  // Restore from localStorage on mount
  useEffect(() => {
    const saved = lsGet('tvtp_tab', 'feed');
    if (saved) setActiveTab(saved);
    const savedFilter = lsGet('tvtp_logfilter', 'all');
    if (savedFilter) setLogFilter(savedFilter);

    // Hydrate from cache
    const cachedPosts = lsGet('tvtp_posts', []);
    if (cachedPosts.length) {
      setPosts(cachedPosts);
      postsRef.current = cachedPosts;
      cachedPosts.forEach(p => { if (p.postImageUrl) imgUrls.current.add(p.postImageUrl); });
    }
    const cachedLogs = lsGet('tvtp_logs', []);
    if (cachedLogs.length) setLogs(cachedLogs);
  }, []);

  // Polling
  useEffect(() => {
    async function poll() {
      try {
        const r = await fetch('/api/dashboard');
        if (!r.ok) return;
        const data = await r.json();
        setWsStatus(data.wsStatus || { connected: false });
        setIgLimit(data.igLimit || { used: 0, limit: 100 });
        setPostsToday(data.postsToday || 0);
        setTotalPosts(data.totalPosts || 0);

        // Merge incoming posts with local state
        const incoming = data.posts || [];
        incoming.forEach(p => { if (p.postImageUrl) imgUrls.current.add(p.postImageUrl); });
        setPosts(incoming);
        postsRef.current = incoming;
        lsSet('tvtp_posts', incoming.slice(0, 50));
        lsSet('tvtp_igused', data.igLimit?.used || 0);

        const incomingLogs = data.logs || [];
        setLogs(incomingLogs);
        lsSet('tvtp_logs', incomingLogs.slice(0, 100));
      } catch {}
    }

    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  // Load performance when tab selected
  useEffect(() => {
    if (activeTab === 'performance') {
      fetch('/api/performance').then(r => r.json()).then(setPerfHistory).catch(() => {});
    }
    if (activeTab === 'preferences') {
      fetch('/api/preferences').then(r => r.json()).then(setPrefs).catch(() => {});
    }
  }, [activeTab]);

  function switchTab(tab) {
    setActiveTab(tab);
    lsSet('tvtp_tab', tab);
  }

  // ── Prefs save ──
  async function savePrefs(updated) {
    try {
      const r = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      const d = await r.json();
      if (d.success) {
        setPrefs(d.preferences);
        setPrefMsg({ type: 'success', text: 'Saved — takes effect immediately.' });
      } else {
        setPrefMsg({ type: 'error', text: d.error });
      }
    } catch (err) {
      setPrefMsg({ type: 'error', text: err.message });
    }
    setTimeout(() => setPrefMsg(null), 4000);
  }

  // ── Performance refresh ──
  async function refreshPerf() {
    setRefreshing(true);
    try {
      await fetch('/api/performance?action=refresh', { method: 'POST' });
      const r = await fetch('/api/performance');
      setPerfHistory(await r.json());
    } finally {
      setRefreshing(false);
    }
  }

  const filteredLogs = logFilter === 'all' ? logs : logs.filter(l => l.level === logFilter);
  const imagesWithUrl = posts.filter(p => p.postImageUrl);

  return (
    <>
      <Head>
        <title>TV Trade Poster · Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.9)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',cursor:'zoom-out' }}>
          <img src={lightbox} alt="" style={{ maxHeight:'92vh',maxWidth:'92vw',borderRadius:8,objectFit:'contain' }} />
        </div>
      )}

      <div className="shell">
        {/* Navbar */}
        <nav className="navbar">
          <div className="logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="4" width="20" height="14" rx="2" stroke="#F0B429" strokeWidth="1.8"/>
              <path d="M8 20h8M12 18v2" stroke="#F0B429" strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M7 9l3 3-3 3M13 15h4" stroke="#F0B429" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            TV Trade Poster
          </div>
          <div className="nav-stats">
            <div className="stat-chip ws-indicator">
              <div className={`ws-dot${wsStatus.connected ? ' connected' : ''}`} />
              <span className={`ws-text${wsStatus.connected ? ' connected' : ''}`}>
                {wsStatus.connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <div className="stat-chip">Today: <strong>{postsToday}</strong></div>
            <div className="stat-chip">Total: <strong>{totalPosts}</strong></div>
            <div className="stat-chip">IG: <strong>{igLimit.used}</strong><span style={{color:'var(--dimmer)'}}>/{igLimit.limit}</span></div>
          </div>
        </nav>

        {/* Tabbar */}
        <div className="tabbar">
          {['feed','images','performance','preferences','logs'].map(tab => (
            <button key={tab} className={`tab${activeTab === tab ? ' active' : ''}`} onClick={() => switchTab(tab)}>
              {tab === 'feed' && <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              {tab === 'images' && <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}
              {tab === 'performance' && <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><rect x="2" y="12" width="4" height="10" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="9" y="7" width="4" height="15" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="16" y="3" width="4" height="19" rx="1" stroke="currentColor" strokeWidth="2"/></svg>}
              {tab === 'preferences' && <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><line x1="4" y1="6" x2="20" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="4" y1="18" x2="20" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="8" cy="6" r="2" fill="var(--bg2)" stroke="currentColor" strokeWidth="2"/><circle cx="16" cy="12" r="2" fill="var(--bg2)" stroke="currentColor" strokeWidth="2"/><circle cx="10" cy="18" r="2" fill="var(--bg2)" stroke="currentColor" strokeWidth="2"/></svg>}
              {tab === 'logs' && <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="2"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}
              <span style={{textTransform:'capitalize'}}>{tab === 'feed' ? 'Live Feed' : tab}</span>
              {tab === 'feed' && <span className="tab-badge">{posts.length}</span>}
              {tab === 'images' && <span className="tab-badge">{imagesWithUrl.length}</span>}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="content">

          {/* Feed */}
          {activeTab === 'feed' && (
            <div className="tab-pane">
              <div id="feed-list">
                {posts.length === 0 ? (
                  <div className="empty">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="#5a6a7a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Waiting for recommendations…
                  </div>
                ) : posts.map(entry => <RecCard key={`${entry.rec?.stock}::${entry.time}`} entry={entry} onImage={setLightbox} />)}
              </div>
            </div>
          )}

          {/* Images */}
          {activeTab === 'images' && (
            <div className="tab-pane">
              {imagesWithUrl.length === 0 ? (
                <div className="empty">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="#5a6a7a" strokeWidth="1.5"/><circle cx="8.5" cy="8.5" r="1.5" fill="#5a6a7a"/><path d="M21 15l-5-5L5 21" stroke="#5a6a7a" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  No images yet
                </div>
              ) : (
                <div className="image-grid">
                  {imagesWithUrl.map(entry => (
                    <div key={entry.postImageUrl} className="img-tile" onClick={() => setLightbox(entry.postImageUrl)}>
                      <img src={entry.postImageUrl} alt={entry.rec?.stock || ''} loading="lazy" />
                      <div className="img-tile-info">
                        <div className="img-tile-stock">{entry.rec?.stock || 'Unknown'}</div>
                        <div className="img-tile-meta">
                          <span className={`action-pill ${entry.rec?.action === 'BUY' ? 'buy' : 'sell'}`} style={{fontSize:9,padding:'2px 7px'}}>{entry.rec?.action}</span>
                          <span>{fmtTime(entry.time)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Performance */}
          {activeTab === 'performance' && (
            <div className="tab-pane">
              <div className="perf-toolbar">
                <div className="perf-summary">
                  {[
                    ['Total Posts', perfHistory.length],
                    ['Total Likes', perfHistory.reduce((s,p) => s + (p.metrics?.likes||0), 0).toLocaleString()],
                    ['Comments',    perfHistory.reduce((s,p) => s + (p.metrics?.comments||0), 0).toLocaleString()],
                    ['Avg Engagement', perfHistory.length ? (((perfHistory.reduce((s,p)=>s+(p.metrics?.likes||0)+(p.metrics?.comments||0),0))/perfHistory.length).toFixed(1)) : 0],
                  ].map(([label, val]) => (
                    <div key={label} className="perf-stat-card"><strong>{val}</strong><span>{label}</span></div>
                  ))}
                </div>
                <button className="btn-refresh" onClick={refreshPerf} disabled={refreshing}>
                  {refreshing ? '↻ Refreshing…' : '↻ Refresh Metrics'}
                </button>
              </div>
              {perfHistory.length === 0 ? (
                <div className="empty" style={{padding:60}}>No posts recorded yet</div>
              ) : (
                <div className="perf-grid">
                  {perfHistory.slice(0,100).map((p, i) => (
                    <div key={i} className="perf-card">
                      {p.imageUrl
                        ? <img className="perf-thumb" src={p.imageUrl} onClick={() => setLightbox(p.imageUrl)} alt="" />
                        : <div className="perf-thumb" style={{display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,color:'var(--dimmer)'}}>No img</div>
                      }
                      <div className="perf-info">
                        <div className="perf-stock">
                          <span className={`action-pill ${p.action==='BUY'?'buy':'sell'}`} style={{fontSize:9,padding:'1px 6px',marginRight:4}}>{p.action}</span>
                          {p.stock}
                        </div>
                        <div className="perf-meta">
                          <span className="perf-metric">♥ {(p.metrics?.likes||0).toLocaleString()}</span>
                          <span className="perf-metric">💬 {(p.metrics?.comments||0).toLocaleString()}</span>
                          {p.storyId && <span className="perf-metric">📖 Story</span>}
                          <span className="type-pill" style={{fontSize:9}}>{p.tradeType||'equity'}</span>
                        </div>
                        <div className="perf-time">📺 {p.channel} · {fmtDateTime(p.postedAt)}</div>
                        {p.permalink && <a href={p.permalink} target="_blank" rel="noreferrer" className="perf-link">View post ↗</a>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Preferences */}
          {activeTab === 'preferences' && (
            <div className="tab-pane">
              {prefs ? <PrefsForm prefs={prefs} onSave={savePrefs} msg={prefMsg} /> : <div className="empty">Loading…</div>}
            </div>
          )}

          {/* Logs */}
          {activeTab === 'logs' && (
            <div className="tab-pane">
              <div className="log-toolbar">
                {['all','error','warn','info','debug'].map(f => (
                  <button key={f} className={`log-filter-btn${logFilter===f?' active':''}`} onClick={() => { setLogFilter(f); lsSet('tvtp_logfilter', f); }}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
              <div className="log-list">
                {filteredLogs.length === 0
                  ? <div className="empty" style={{padding:40}}>No logs</div>
                  : filteredLogs.map((entry, i) => (
                    <div key={i} className="log-row" data-level={entry.level}>
                      <span className="log-ts">{entry.time ? new Date(entry.time).toLocaleTimeString() : ''}</span>
                      <span className={`log-lvl ${entry.level}`}>{(entry.level||'').toUpperCase().slice(0,4)}</span>
                      <span className={`log-text ${entry.level}`}>{entry.message}</span>
                    </div>
                  ))
                }
              </div>
            </div>
          )}

        </div>
      </div>

      <style jsx global>{`
        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
        :root {
          --bg:#0A0E1A; --bg2:#111827; --bg3:#1a2235;
          --accent:#F0B429; --accent-dim:rgba(240,180,41,0.15); --accent-glow:rgba(240,180,41,0.35);
          --buy:#00E676; --sell:#FF1744; --white:#FFFFFF;
          --dim:#B0BEC5; --dimmer:#5a6a7a;
          --card:rgba(255,255,255,0.04); --border:rgba(240,180,41,0.2); --border2:rgba(255,255,255,0.07);
          --processing:#60A5FA; --success:#34D399; --danger:#F87171; --warn:#FDE68A;
          --radius:10px; --font:'Inter',system-ui,-apple-system,sans-serif;
        }
        html,body { height:100%; overflow:hidden; font-family:var(--font); background:var(--bg); color:var(--white); }
        .shell { display:flex; flex-direction:column; height:100vh; }
        .navbar { display:flex; align-items:center; gap:20px; padding:0 20px; height:56px; background:var(--bg2); border-bottom:1px solid var(--border); flex-shrink:0; }
        .logo { font-size:15px; font-weight:800; color:var(--accent); letter-spacing:0.3px; white-space:nowrap; display:flex; align-items:center; gap:8px; }
        .nav-stats { display:flex; gap:20px; align-items:center; flex:1; }
        .stat-chip { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--dim); white-space:nowrap; }
        .stat-chip strong { color:var(--white); font-size:14px; font-weight:700; }
        .ws-indicator { display:flex; align-items:center; gap:6px; }
        .ws-dot { width:7px; height:7px; border-radius:50%; background:var(--danger); flex-shrink:0; transition:background 0.4s; }
        .ws-dot.connected { background:var(--success); box-shadow:0 0 6px var(--success); animation:blink 2.5s infinite; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.45} }
        .ws-text { font-size:11px; color:var(--dimmer); transition:color 0.4s; }
        .ws-text.connected { color:var(--success); }
        .tabbar { display:flex; background:var(--bg2); border-bottom:1px solid var(--border2); padding:0 20px; flex-shrink:0; }
        .tab { background:none; border:none; border-bottom:2px solid transparent; color:var(--dimmer); padding:10px 18px; cursor:pointer; font-size:12px; font-weight:600; letter-spacing:0.3px; transition:color 0.2s,border-color 0.2s; display:flex; align-items:center; gap:6px; }
        .tab:hover { color:var(--dim); }
        .tab.active { color:var(--accent); border-bottom-color:var(--accent); }
        .tab-badge { background:var(--accent-dim); color:var(--accent); font-size:10px; font-weight:700; padding:1px 6px; border-radius:100px; min-width:18px; text-align:center; }
        .content { flex:1; overflow:hidden; display:flex; flex-direction:column; }
        .tab-pane { flex:1; overflow-y:auto; padding:20px; }
        .empty { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; padding:80px 20px; color:var(--dimmer); font-size:13px; text-align:center; }

        /* Feed */
        #feed-list { display:flex; flex-direction:column; gap:10px; max-width:820px; }
        .rec-card { background:var(--card); border:1px solid var(--border2); border-radius:var(--radius); padding:14px 16px; transition:border-color 0.4s; animation:slideDown 0.3s ease; }
        @keyframes slideDown { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
        .rec-card.s-posted    { border-color:rgba(52,211,153,0.35); }
        .rec-card.s-failed    { border-color:rgba(248,113,113,0.35); }
        .rec-card.s-processing{ border-color:rgba(96,165,250,0.35); }
        .rec-card.s-dry_run   { border-color:rgba(250,204,21,0.3); }
        .rec-top { display:flex; align-items:center; gap:7px; margin-bottom:11px; flex-wrap:wrap; }
        .ch-badge { font-size:9px; font-weight:800; letter-spacing:0.8px; text-transform:uppercase; color:var(--accent); background:var(--accent-dim); border:1px solid var(--border); padding:2px 7px; border-radius:4px; }
        .action-pill { font-size:10px; font-weight:800; letter-spacing:1px; padding:2px 9px; border-radius:100px; }
        .action-pill.buy  { background:rgba(0,230,118,0.13); color:var(--buy);  border:1px solid rgba(0,230,118,0.4); }
        .action-pill.sell { background:rgba(255,23,68,0.13);  color:var(--sell); border:1px solid rgba(255,23,68,0.4); }
        .type-pill { font-size:9px; color:var(--dim); background:rgba(255,255,255,0.05); border:1px solid var(--border2); padding:2px 7px; border-radius:4px; }
        .status-pill { margin-left:auto; font-size:9px; font-weight:700; letter-spacing:0.5px; padding:2px 8px; border-radius:4px; }
        .status-pill.queued     { background:rgba(156,163,175,0.12); color:#9CA3AF; }
        .status-pill.processing { background:rgba(96,165,250,0.12);  color:var(--processing); }
        .status-pill.posted     { background:rgba(52,211,153,0.12);  color:var(--success); }
        .status-pill.failed     { background:rgba(248,113,113,0.12); color:var(--danger); }
        .status-pill.dry_run    { background:rgba(250,204,21,0.12);  color:var(--warn); }
        .rec-body { display:flex; align-items:flex-start; gap:14px; }
        .rec-info { flex:1; min-width:0; }
        .stock-name { font-size:18px; font-weight:700; color:var(--white); margin-bottom:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .price-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:7px; }
        .price-cell { background:rgba(255,255,255,0.03); border:1px solid var(--border2); border-radius:7px; padding:7px 9px; }
        .price-label { font-size:9px; color:var(--dimmer); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:2px; }
        .price-val { font-size:13px; font-weight:700; color:var(--white); }
        .price-cell.entry .price-val { color:var(--accent); }
        .price-cell.target .price-val { color:var(--buy); }
        .price-cell.sl .price-val { color:var(--sell); }
        .rec-thumb { width:76px; height:76px; border-radius:7px; object-fit:cover; border:1px solid var(--border2); cursor:pointer; flex-shrink:0; transition:transform 0.2s,border-color 0.2s; background:var(--bg3); }
        .rec-thumb:hover { transform:scale(1.04); border-color:var(--border); }
        .thumb-placeholder { width:76px; height:76px; border-radius:7px; border:1px dashed var(--border2); flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:9px; color:var(--dimmer); background:var(--bg3); }
        .rec-footer { margin-top:10px; display:flex; align-items:center; gap:8px; font-size:11px; color:var(--dimmer); flex-wrap:wrap; }
        .rec-footer .time { margin-left:auto; }
        .rec-footer .analyst { font-weight:600; color:var(--dim); }

        /* Caption block inside feed cards */
        .caption-block { margin-top:10px; border-top:1px solid var(--border2); padding-top:8px; }
        .caption-toggle { background:none; border:1px solid var(--border2); border-radius:6px; color:var(--dim); font-size:11px; padding:4px 10px; cursor:pointer; transition:all 0.2s; }
        .caption-toggle:hover { border-color:var(--border); color:var(--white); }
        .caption-text { display:none; margin-top:8px; padding:10px 12px; background:var(--bg); border:1px solid var(--border2); border-radius:8px; font-size:11px; line-height:1.55; color:var(--dim); white-space:pre-wrap; word-break:break-word; max-height:300px; overflow-y:auto; font-family:var(--font); }
        .caption-text.open { display:block; }

        /* Freq row */
        .freq-row { display:flex; align-items:center; gap:10px; font-size:12px; color:var(--dim); flex-wrap:wrap; }
        .freq-row input[type="number"], .freq-row select { background:var(--bg); border:1px solid var(--border2); color:var(--white); border-radius:6px; padding:6px 10px; font-size:12px; }

        /* Images */
        .image-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:14px; }
        .img-tile { background:var(--card); border:1px solid var(--border2); border-radius:var(--radius); overflow:hidden; cursor:pointer; transition:border-color 0.2s,transform 0.2s; }
        .img-tile:hover { border-color:var(--border); transform:translateY(-3px); }
        .img-tile img { width:100%; aspect-ratio:1; object-fit:cover; display:block; }
        .img-tile-info { padding:9px 11px; }
        .img-tile-stock { font-size:12px; font-weight:700; color:var(--white); margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .img-tile-meta { display:flex; align-items:center; justify-content:space-between; font-size:10px; color:var(--dimmer); }

        /* Logs */
        .log-toolbar { display:flex; align-items:center; gap:6px; margin-bottom:12px; }
        .log-filter-btn { background:var(--card); border:1px solid var(--border2); color:var(--dimmer); padding:5px 12px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; transition:all 0.2s; }
        .log-filter-btn:hover { color:var(--dim); border-color:rgba(255,255,255,0.15); }
        .log-filter-btn.active { background:var(--accent-dim); border-color:var(--border); color:var(--accent); }
        .log-list { font-family:'Fira Code','JetBrains Mono',ui-monospace,monospace; font-size:11.5px; display:flex; flex-direction:column; gap:1px; }
        .log-row { display:flex; align-items:baseline; gap:10px; padding:4px 6px; border-radius:5px; line-height:1.5; }
        .log-row:hover { background:rgba(255,255,255,0.03); }
        .log-ts { color:var(--dimmer); flex-shrink:0; font-size:10.5px; }
        .log-lvl { font-weight:800; flex-shrink:0; width:36px; font-size:10px; letter-spacing:0.3px; }
        .log-lvl.error { color:var(--danger); }
        .log-lvl.warn  { color:var(--accent); }
        .log-lvl.info  { color:var(--processing); }
        .log-lvl.debug { color:var(--dimmer); }
        .log-text { color:var(--dim); word-break:break-word; }
        .log-text.error { color:var(--danger); }
        .log-text.warn  { color:var(--warn); }

        /* Performance */
        .perf-toolbar { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; flex-wrap:wrap; gap:8px; }
        .perf-summary { display:flex; gap:12px; flex-wrap:wrap; }
        .perf-stat-card { background:var(--card); border:1px solid var(--border2); border-radius:var(--radius); padding:14px 20px; min-width:120px; text-align:center; }
        .perf-stat-card strong { display:block; font-size:24px; font-weight:800; color:var(--accent); }
        .perf-stat-card span { font-size:11px; color:var(--dimmer); }
        .perf-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px; }
        .perf-card { background:var(--card); border:1px solid var(--border2); border-radius:var(--radius); overflow:hidden; display:flex; gap:10px; padding:12px; }
        .perf-thumb { width:64px; height:64px; border-radius:7px; object-fit:cover; border:1px solid var(--border2); cursor:pointer; flex-shrink:0; background:var(--bg3); }
        .perf-info { flex:1; min-width:0; }
        .perf-stock { font-size:13px; font-weight:700; color:var(--white); margin-bottom:3px; }
        .perf-meta { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .perf-metric { font-size:11px; color:var(--dim); display:flex; align-items:center; gap:3px; }
        .perf-time { font-size:10px; color:var(--dimmer); margin-top:4px; }
        .perf-link { font-size:10px; color:var(--accent); text-decoration:none; }
        .perf-link:hover { text-decoration:underline; }
        .btn-refresh { background:var(--accent-dim); border:1px solid var(--border); color:var(--accent); padding:7px 14px; border-radius:7px; font-size:12px; font-weight:600; cursor:pointer; }
        .btn-refresh:hover { background:var(--accent-glow); }
        .btn-refresh:disabled { opacity:0.5; cursor:not-allowed; }

        /* Preferences */
        .pref-section { background:var(--card); border:1px solid var(--border2); border-radius:var(--radius); padding:16px; margin-bottom:14px; }
        .pref-section-title { font-size:10px; font-weight:800; color:var(--accent); text-transform:uppercase; letter-spacing:1px; margin-bottom:4px; }
        .pref-section-desc { font-size:11px; color:var(--dimmer); margin-bottom:12px; }
        .pref-check-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:10px; }
        .pref-check-item { display:flex; align-items:flex-start; gap:10px; background:var(--bg); border:1px solid var(--border2); border-radius:8px; padding:10px 12px; cursor:pointer; transition:border-color 0.2s; }
        .pref-check-item:hover { border-color:var(--border); }
        .pref-check-item input { margin-top:2px; flex-shrink:0; accent-color:var(--accent); width:14px; height:14px; cursor:pointer; }
        .pref-check-label span { display:block; font-size:12px; font-weight:600; color:var(--white); }
        .pref-check-label small { font-size:10px; color:var(--dimmer); }
        .toggle-row { display:flex; align-items:center; justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--border2); }
        .toggle-row:last-child { border-bottom:none; padding-bottom:0; }
        .toggle-label { font-size:13px; color:var(--white); font-weight:500; }
        .toggle-sublabel { font-size:11px; color:var(--dimmer); }
        .toggle-switch { position:relative; width:44px; height:24px; flex-shrink:0; }
        .toggle-switch input { opacity:0; width:0; height:0; position:absolute; }
        .toggle-slider { position:absolute; cursor:pointer; inset:0; background:var(--dimmer); border-radius:12px; transition:0.25s; }
        .toggle-slider::before { content:''; position:absolute; width:18px; height:18px; left:3px; top:3px; background:white; border-radius:50%; transition:0.25s; }
        .toggle-switch input:checked + .toggle-slider { background:var(--accent); }
        .toggle-switch input:checked + .toggle-slider::before { transform:translateX(20px); }
        .channel-tags { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; min-height:32px; }
        .ch-tag { display:flex; align-items:center; gap:5px; background:var(--accent-dim); border:1px solid var(--border); color:var(--accent); font-size:11px; font-weight:600; padding:4px 8px 4px 10px; border-radius:100px; }
        .ch-tag-remove { background:none; border:none; color:var(--accent); cursor:pointer; font-size:14px; line-height:1; padding:0; opacity:0.7; }
        .ch-tag-remove:hover { opacity:1; }
        .channel-add-row { display:flex; gap:8px; }
        .channel-add-row input { flex:1; background:var(--bg); border:1px solid var(--border2); color:var(--white); padding:7px 11px; border-radius:7px; font-size:12px; outline:none; font-family:var(--font); }
        .channel-add-row input:focus { border-color:rgba(240,180,41,0.5); }
        .btn-add-ch { background:var(--accent-dim); border:1px solid var(--border); color:var(--accent); padding:7px 14px; border-radius:7px; font-size:12px; font-weight:600; cursor:pointer; white-space:nowrap; }
        .pref-msg { padding:9px 13px; border-radius:7px; font-size:12px; margin-top:10px; }
        .pref-msg.success { background:rgba(52,211,153,0.1); border:1px solid rgba(52,211,153,0.3); color:var(--success); }
        .pref-msg.error   { background:rgba(248,113,113,0.1); border:1px solid rgba(248,113,113,0.3); color:var(--danger); }
        .btn-save-prefs { width:100%; background:var(--accent); color:#000; border:none; padding:11px; border-radius:8px; font-size:13px; font-weight:800; cursor:pointer; transition:opacity 0.2s; margin-top:4px; font-family:var(--font); }
        .btn-save-prefs:hover { opacity:0.88; }

        /* Scrollbar */
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.08); border-radius:3px; }
      `}</style>
    </>
  );
}

// ── RecCard component ─────────────────────────────────────────────────────────
function RecCard({ entry, onImage }) {
  const rec = entry.rec || {};
  const status = entry.status || 'queued';
  const isBuy = rec.action === 'BUY';
  const [captionOpen, setCaptionOpen] = useState(false);

  const exitBadge = rec.exitReason
    ? <span className="status-pill" style={{
        background: rec.exitReason === 'TARGET_HIT' ? 'rgba(0,230,118,0.12)' : 'rgba(255,23,68,0.12)',
        color: rec.exitReason === 'TARGET_HIT' ? 'var(--buy)' : 'var(--sell)',
      }}>{rec.exitReason === 'TARGET_HIT' ? '✅ TARGET HIT' : '🛑 SL HIT'}</span>
    : null;

  const targetLabel = rec.exitReason === 'TARGET_HIT' ? 'Exit (Target)'
    : rec.exitReason === 'SL_HIT' ? 'Exit (SL Hit)' : 'Target';
  const targetVal = rec.exitPrice != null ? rec.exitPrice : rec.target;

  return (
    <div className={`rec-card s-${status}`}>
      <div className="rec-top">
        <span className="ch-badge">{rec.channel || 'Unknown'}</span>
        <span className={`action-pill ${isBuy ? 'buy' : 'sell'}`}>{rec.action || '?'}</span>
        {rec.tradeType && <span className="type-pill">{rec.tradeType.toUpperCase()}</span>}
        {exitBadge}
        <span className={`status-pill ${status}`}>{statusLabel(status)}</span>
      </div>
      <div className="rec-body">
        <div className="rec-info">
          <div className="stock-name">{rec.stock || 'Unknown'}</div>
          <div className="price-grid">
            <div className="price-cell entry"><div className="price-label">Entry</div><div className="price-val">₹{fmtPrice(rec.entry)}</div></div>
            <div className="price-cell target"><div className="price-label">{targetLabel}</div><div className="price-val">₹{fmtPrice(targetVal)}</div></div>
            <div className="price-cell sl"><div className="price-label">Stop Loss</div><div className="price-val">₹{fmtPrice(rec.stopLoss)}</div></div>
          </div>
        </div>
        {entry.postImageUrl
          ? <img className="rec-thumb" src={entry.postImageUrl} alt="" onClick={() => onImage(entry.postImageUrl)} />
          : <div className="thumb-placeholder">{status === 'queued' || status === 'processing' ? 'Pending…' : '—'}</div>
        }
      </div>
      {entry.caption && (
        <div className="caption-block">
          <button className="caption-toggle" onClick={() => setCaptionOpen(o => !o)}>
            {captionOpen ? '📝 Hide Caption' : '📝 View Caption'}
          </button>
          <pre className={`caption-text${captionOpen ? ' open' : ''}`}>{entry.caption}</pre>
        </div>
      )}
      <div className="rec-footer">
        {rec.analyst && <span className="analyst">👤 {rec.analyst}</span>}
        {rec.returnPct != null && (
          <span style={{color: rec.returnPct >= 0 ? 'var(--buy)' : 'var(--sell)'}}>
            Return: {rec.returnPct >= 0 ? '+' : ''}{Number(rec.returnPct).toFixed(2)}%
          </span>
        )}
        <span className="time">{fmtTime(entry.time)}</span>
        {entry.error && <span style={{color:'var(--danger)',fontSize:10}}>{entry.error}</span>}
      </div>
    </div>
  );
}

// ── PrefsForm component ───────────────────────────────────────────────────────
function PrefsForm({ prefs, onSave, msg }) {
  const [local, setLocal] = useState(() => JSON.parse(JSON.stringify(prefs)));
  const [channelInput, setChannelInput] = useState('');

  function setTradeType(type, val) {
    setLocal(p => ({ ...p, tradeTypes: { ...p.tradeTypes, [type]: val } }));
  }

  function setExitFilter(key, val) {
    setLocal(p => ({ ...p, exitReasonFilter: { ...p.exitReasonFilter, [key]: val } }));
  }

  function setFreq(key, val) {
    setLocal(p => ({ ...p, postingFrequency: { ...p.postingFrequency, [key]: val } }));
  }

  function addChannel() {
    const val = channelInput.trim().toLowerCase().replace(/[\s-]/g, '_');
    if (val && !local.channels.includes(val)) {
      setLocal(p => ({ ...p, channels: [...p.channels, val] }));
    }
    setChannelInput('');
  }

  function removeChannel(i) {
    setLocal(p => ({ ...p, channels: p.channels.filter((_, j) => j !== i) }));
  }

  return (
    <div style={{maxWidth:700}}>

      {/* Trade Outcome Filter */}
      <div className="pref-section">
        <div className="pref-section-title">Trade Outcome Filter</div>
        <div className="pref-section-desc">Control which closed trades trigger a post. Open trades are never posted.</div>
        <div className="toggle-row">
          <div>
            <div className="toggle-label">Only post closed trades</div>
            <div className="toggle-sublabel">Never post new/open trade recommendations — only post when target or SL is hit</div>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" checked={local.onlyClosedTrades !== false} onChange={e => setLocal(p => ({...p, onlyClosedTrades: e.target.checked}))} />
            <span className="toggle-slider" />
          </label>
        </div>
        <div style={{marginTop:12}}>
          <div className="pref-section-desc" style={{marginBottom:8}}>Select which outcomes to post:</div>
          <div className="pref-check-grid">
            <label className="pref-check-item">
              <input type="checkbox" checked={local.exitReasonFilter?.targetHit !== false} onChange={e => setExitFilter('targetHit', e.target.checked)} />
              <div className="pref-check-label"><span>Target Hit</span><small>Post when trade reaches profit target</small></div>
            </label>
            <label className="pref-check-item">
              <input type="checkbox" checked={local.exitReasonFilter?.slHit !== false} onChange={e => setExitFilter('slHit', e.target.checked)} />
              <div className="pref-check-label"><span>Stop Loss Hit</span><small>Post when trade hits stop loss</small></div>
            </label>
          </div>
        </div>
      </div>

      {/* Trade Type Filters */}
      <div className="pref-section">
        <div className="pref-section-title">Trade Type Filters</div>
        <div className="pref-section-desc">Only trades matching selected types will be posted to Instagram</div>
        <div className="pref-check-grid">
          {[
            ['equity',      'Equity Stocks',   'TATASTEEL, RELIANCE…'],
            ['indexOption', 'Index Options',   'NIFTY…CE/PE, BANKNIFTY…'],
            ['stockOption', 'Stock Options',   'BAJAJFINSV…CE/PE'],
            ['indexFuture', 'Index Futures',   'NIFTYFUT, BANKNIFTYFUT'],
            ['stockFuture', 'Stock Futures',   'TATASTEEL FUT…'],
          ].map(([key, label, hint]) => (
            <label key={key} className="pref-check-item">
              <input type="checkbox" checked={local.tradeTypes?.[key] !== false} onChange={e => setTradeType(key, e.target.checked)} />
              <div className="pref-check-label"><span>{label}</span><small>{hint}</small></div>
            </label>
          ))}
        </div>
      </div>

      {/* Posting Options */}
      <div className="pref-section">
        <div className="pref-section-title">Posting Options</div>
        <div>
          {[
            ['postToFeed',  'Post to Feed',  'Publish as a regular Instagram feed post'],
            ['postToStory', 'Post as Story', 'Also publish as an Instagram Story (24-hour). Image includes TARGET HIT / STOP LOSS HIT banner.'],
          ].map(([key, label, sub]) => (
            <div key={key} className="toggle-row">
              <div><div className="toggle-label">{label}</div><div className="toggle-sublabel">{sub}</div></div>
              <label className="toggle-switch">
                <input type="checkbox" checked={!!local[key]} onChange={e => setLocal(p => ({...p,[key]:e.target.checked}))} />
                <span className="toggle-slider" />
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Posting Frequency */}
      <div className="pref-section">
        <div className="pref-section-title">Posting Frequency (Feed Posts)</div>
        <div className="pref-section-desc">Throttle how often feed posts are published. Stories are not affected by this cap.</div>
        <div className="toggle-row">
          <div><div className="toggle-label">Enable frequency cap</div><div className="toggle-sublabel">Limit how many feed posts go out per time period</div></div>
          <label className="toggle-switch">
            <input type="checkbox" checked={local.postingFrequency?.enabled === true} onChange={e => setFreq('enabled', e.target.checked)} />
            <span className="toggle-slider" />
          </label>
        </div>
        <div className="freq-row" style={{marginTop:14}}>
          <label>Max posts:</label>
          <input type="number" min="1" max="100" value={local.postingFrequency?.maxPosts ?? 1} onChange={e => setFreq('maxPosts', parseInt(e.target.value || '1', 10))} style={{width:60}} />
          <label>per</label>
          <select value={local.postingFrequency?.perUnit ?? 'hour'} onChange={e => setFreq('perUnit', e.target.value)}>
            <option value="minute">Minute</option>
            <option value="hour">Hour</option>
            <option value="day">Day</option>
          </select>
        </div>
      </div>

      {/* Story Daily Limit */}
      <div className="pref-section">
        <div className="pref-section-title">Story Daily Limit</div>
        <div className="pref-section-desc">Maximum number of Instagram Stories to post per calendar day. Resets at midnight.</div>
        <div className="freq-row">
          <label>Max stories per day:</label>
          <input type="number" min="1" max="100" value={local.maxStoriesPerDay ?? 20} onChange={e => setLocal(p => ({...p, maxStoriesPerDay: parseInt(e.target.value || '20', 10)}))} style={{width:60}} />
        </div>
        <div style={{fontSize:11,color:'var(--dimmer)',marginTop:8}}>Recommended: 20 or fewer to avoid Instagram rate limiting on stories.</div>
      </div>

      {/* Channel Allowlist */}
      <div className="pref-section">
        <div className="pref-section-title">Channel Allowlist</div>
        <div className="pref-section-desc">Only trades from these TV channels will be posted</div>
        <div className="channel-tags">
          {(local.channels || []).map((c, i) => (
            <div key={i} className="ch-tag">
              {c}
              <button className="ch-tag-remove" onClick={() => removeChannel(i)}>×</button>
            </div>
          ))}
        </div>
        <div className="channel-add-row">
          <input value={channelInput} onChange={e => setChannelInput(e.target.value)} onKeyDown={e => e.key==='Enter'&&addChannel()} placeholder="e.g. zee_business" />
          <button className="btn-add-ch" onClick={addChannel}>+ Add</button>
        </div>
      </div>

      <button className="btn-save-prefs" onClick={() => onSave(local)}>Save Preferences</button>
      {msg && <div className={`pref-msg ${msg.type}`}>{msg.text}</div>}
    </div>
  );
}
