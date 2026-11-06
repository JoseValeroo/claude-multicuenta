// Genera ficheros status.json de prueba con el formato schema 2 de clauth.
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const ahora = Date.now();
const iso = (msDesdeAhora) => new Date(ahora + msDesdeAhora).toISOString().replace('Z', '+00:00');
const H = 3600e3;

const base = (perfiles, extra = {}) => ({
  schema: 2, generated_at: iso(-1000), active_profile: 'cuenta1', pending_switch: null,
  refresh_interval_ms: 300000, clauth_version: '0.18.2', profiles: perfiles, ...extra,
});
const perfil = (name, windows, extra = {}) => ({
  name, active: false, provider: 'anthropic', tier: 'Team', harness: 'claude', auth_status: 'ok',
  fetch_status: 'Fresh', stale: false, fetched_at: iso(-60e3), windows, spend: null, ...extra,
});

const seis = [
  perfil('cuenta1', [{ label: '5h', utilization_pct: 42.4, resets_at: iso(2 * H) }, { label: '7d', utilization_pct: 18, resets_at: iso(90 * H) }], { active: true }),
  perfil('cuenta2', [{ label: '5h', utilization_pct: 91, resets_at: iso(1.5 * H) }, { label: '7d', utilization_pct: 63, resets_at: iso(50 * H) }]),
  perfil('cuenta3', [{ label: '7d', utilization_pct: 88, resets_at: iso(30 * H) }]),
  perfil('cuenta4', [{ label: '5h', utilization_pct: 12, resets_at: iso(4 * H) }, { label: '7d', utilization_pct: 30, resets_at: iso(70 * H) }], { stale: true }),
  perfil('cuenta5', [], { auth_status: 'broken' }),
  perfil('cuenta6', [], { fetch_status: null, fetched_at: null }),
];

const casos = {
  'seis.json': base(seis),
  'gasto.json': base([perfil('empresa', [], { spend: { enabled: true, percent: 64 } }), ...seis.slice(0, 2)]),
  'vacio.json': base([]),
  'schema3.json': base(seis, { schema: 3 }),
  'daemon_parado.json': base(seis, { generated_at: iso(-3 * H) }),
  'daemon_nunca.json': base(seis, { generated_at: '1970-01-01T00:00:00+00:00' }),
  'con_codex.json': base([...seis.slice(0, 2), { ...perfil('cx', [{ label: '5h', utilization_pct: 5 }]), harness: 'codex' }]),
};
for (const [n, d] of Object.entries(casos)) fs.writeFileSync(path.join(dir, n), JSON.stringify(d, null, 2));
console.log('ok', Object.keys(casos).join(', '));
