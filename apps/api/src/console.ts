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
    const d = await (await fetch('/dashboard')).json();
    document.getElementById('totals').innerHTML =
      \`<p><b>\${d.totals.jobs}</b> jobs · <b>\${d.totals.tenants}</b> tenants · ~$\${d.totals.cost_usd.toFixed(4)}</p>\`;
    document.getElementById('tenants').innerHTML =
      '<table><tr><th>factio</th><th>jobs</th><th>states</th><th>cost</th></tr>' +
      d.tenants.map(t => \`<tr><td>\${t.factio}</td><td>\${t.total}</td><td>\${Object.entries(t.byState).map(([k,v])=>k+':'+v).join(' ')}</td><td>~$\${t.cost_usd.toFixed(4)}</td></tr>\`).join('') +
      '</table>';
    document.getElementById('audit').innerHTML =
      '<table><tr><th>ts</th><th>factio</th><th>action</th><th>job</th></tr>' +
      d.recentAudit.map(e => \`<tr><td>\${e.ts}</td><td>\${e.factio}</td><td><code>\${e.action}</code></td><td>\${e.job_id ?? ''}</td></tr>\`).join('') +
      '</table>';
  </script>
</body>
</html>`;
