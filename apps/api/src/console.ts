/** A minimal served console (the richer Next.js + shadcn console is apps/console, TBD). */
export const CONSOLE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Auriga — console</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font: 14px/1.5 system-ui, sans-serif; margin: 2rem; color: #1a1a1a; }
    h1 { font-size: 1.4rem; } h2 { font-size: 1rem; margin-top: 1.5rem; }
    table { border-collapse: collapse; margin: .5rem 0; }
    th, td { border: 1px solid #ddd; padding: .3rem .6rem; text-align: left; }
    .muted { color: #666; } code { background:#f4f4f4; padding:0 .25rem; }
  </style>
</head>
<body>
  <h1>Auriga · the charioteer</h1>
  <p class="muted">Harness job platform — control-plane console.</p>
  <div id="totals"></div>
  <h2>Tenants</h2><div id="tenants"></div>
  <h2>Recent audit</h2><div id="audit"></div>
  <script type="module">
    // All values are inserted via textContent — never innerHTML — so API data
    // (factio, action, job ids) can't inject markup/script (no XSS).
    const d = await (await fetch('/dashboard')).json();
    const el = (tag, s) => { const n = document.createElement(tag); if (s !== undefined) n.textContent = s; return n; };
    const table = (headers, rows) => {
      const t = el('table');
      const hr = el('tr');
      for (const h of headers) hr.append(el('th', h));
      t.append(hr);
      for (const r of rows) {
        const tr = el('tr');
        for (const c of r) tr.append(el('td', c));
        t.append(tr);
      }
      return t;
    };
    document.getElementById('totals').append(
      el('p', \`\${d.totals.jobs} jobs · \${d.totals.tenants} tenants · ~$\${d.totals.cost_usd.toFixed(4)}\`));
    document.getElementById('tenants').append(table(['factio', 'jobs', 'states', 'cost'],
      d.tenants.map(t => [t.factio, String(t.total),
        Object.entries(t.byState).map(([k, v]) => k + ':' + v).join(' '),
        '~$' + t.cost_usd.toFixed(4)])));
    document.getElementById('audit').append(table(['ts', 'factio', 'action', 'job'],
      d.recentAudit.map(e => [e.ts, e.factio, e.action, e.job_id ?? ''])));
  </script>
</body>
</html>`;
