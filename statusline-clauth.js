#!/usr/bin/env node
// Línea de estado de Claude Code con el uso (5 h y 7 días) de TODAS las cuentas de clauth.
//
// De dónde salen los datos: ~/.clauth/status.json, que `clauth daemon` reescribe cada
// segundo y refresca contra Anthropic cada pocos minutos. Si ese fichero no existe, pide
// una foto a `clauth status --json` (lee la caché, no consulta nada).
// Este script NO hace llamadas de red ni lee credenciales: solo nombres y porcentajes.
//
// Contrato del fichero: wiki/Daemon.md de clauth (schema 2).
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// ---- Ajustes ---------------------------------------------------------------
const MAX_CUENTAS_POR_LINEA = 3;  // con la terminal ancha: 6 cuentas = 2 líneas de 3
const ANCHO_BARRA = 5;            // celdas de cada barrita
const AMARILLO_DESDE = 50;        // % a partir del cual se pinta en amarillo
const ROJO_DESDE = 80;            // % a partir del cual se pinta en rojo y sale cuándo se reinicia
// ----------------------------------------------------------------------------

const HOME = os.homedir();
const FEED = process.env.CLAUTH_SL_FEED || path.join(HOME, '.clauth', 'status.json');

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  verde: '\x1b[32m', amarillo: '\x1b[33m', rojo: '\x1b[31m', naranja: '\x1b[38;5;208m',
  fondoBarra: '\x1b[48;5;238m',
};
const pinta = (color, txt) => color + txt + C.reset;
const ancho = (txt) => [...txt.replace(/\x1b\[[0-9;]*m/g, '')].length;   // ancho visible
const rellena = (txt, w) => txt + ' '.repeat(Math.max(0, w - ancho(txt)));

function cargar() {
  try {
    return { datos: JSON.parse(fs.readFileSync(FEED, 'utf8')), deDaemon: true };
  } catch { /* no existe, o pillado a mitad de renombrar: probamos la foto */ }
  try {
    const exe = path.join(HOME, '.cargo', 'bin', process.platform === 'win32' ? 'clauth.exe' : 'clauth');
    const salida = execFileSync(fs.existsSync(exe) ? exe : 'clauth', ['status', '--json'], {
      encoding: 'utf8', timeout: 3000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    });
    return { datos: JSON.parse(salida), deDaemon: false };
  } catch {
    return null;
  }
}

function colorPct(pct) {
  if (pct >= ROJO_DESDE) return C.rojo;
  if (pct >= AMARILLO_DESDE) return C.amarillo;
  return C.verde;
}

// Barrita con precisión de 1/8 de celda sobre un carril gris: ███▌░ => "███▌ " con fondo.
const OCTAVOS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];
function barra(pct) {
  const p = Math.max(0, Math.min(100, pct));
  const celdas = (p / 100) * ANCHO_BARRA;
  let llenas = Math.floor(celdas);
  let octavos = Math.round((celdas - llenas) * 8);
  if (octavos === 8) { llenas += 1; octavos = 0; }
  const parcial = OCTAVOS[octavos];
  const vacias = ANCHO_BARRA - llenas - (parcial ? 1 : 0);
  return C.fondoBarra + colorPct(pct) + '█'.repeat(llenas) + parcial + ' '.repeat(vacias) + C.reset;
}

const pctTxt = (pct) => pinta(colorPct(pct), String(pct).padStart(2) + '%');

function hora(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

// Reinicio semanal: el día ("dom") si falta más de 24 h; la hora si es antes.
function diaOHora(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  if (d - Date.now() < 24 * 3600e3) return hora(iso);
  return d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '');
}

function hace(ms) {
  const min = Math.round(ms / 60000);
  if (min < 60) return min + ' min';
  const h = Math.round(min / 60);
  if (h < 48) return h + ' h';
  return Math.round(h / 24) + ' días';
}

// Una ventana (5h o 7d) => "5h ███▌  42%", y la hora de reinicio si va alta.
function ventana(p, etiqueta, formatoReinicio) {
  const w = (p.windows || []).find((x) => x && x.label === etiqueta);
  const et = pinta(C.dim, etiqueta + ' ');
  if (!w || typeof w.utilization_pct !== 'number') {
    // Sin la ventana: si clauth ya leyó la cuenta, es que no hay consumo en esa ventana.
    if (!p.fetched_at) return et + C.fondoBarra + ' '.repeat(ANCHO_BARRA) + C.reset + ' ' + pinta(C.dim, ' – ');
    return et + barra(0) + ' ' + pctTxt(0);
  }
  const pct = Math.round(w.utilization_pct);
  let txt = et + barra(pct) + ' ' + pctTxt(pct);
  if (pct >= ROJO_DESDE && w.resets_at) txt += pinta(C.dim, ' ↻' + formatoReinicio(w.resets_at));
  return txt;
}

function segmento(p, esEstaSesion, anchoNombre) {
  const nombre = esEstaSesion
    ? pinta(C.bold + C.naranja, rellena('▸' + p.name, anchoNombre))
    : rellena(' ' + p.name, anchoNombre);

  if (p.auth_status === 'broken') return nombre + ' ' + pinta(C.rojo, '! hay que volver a entrar');

  const ventanas = p.windows || [];
  const tiene5h7d = ventanas.some((x) => x && (x.label === '5h' || x.label === '7d'));
  if (!tiene5h7d && !p.fetched_at && !p.fetch_status) return nombre + ' ' + pinta(C.dim, 'sin datos aún');
  if (!tiene5h7d && p.spend && typeof p.spend.percent === 'number') {
    const pct = Math.round(p.spend.percent);
    return nombre + ' ' + pinta(C.dim, 'gasto ') + barra(pct) + ' ' + pctTxt(pct);
  }

  let txt = nombre + ' ' + ventana(p, '5h', hora) + ' ' + ventana(p, '7d', diaOHora);
  if (p.stale) txt = C.dim + txt.split(C.reset).join(C.reset + C.dim) + ' ?' + C.reset; // dato viejo
  return txt;
}

function main() {
  const carga = cargar();
  if (!carga) return pinta(C.dim, 'clauth: no encuentro clauth ni ~/.clauth/status.json');
  const { datos, deDaemon } = carga;

  if (typeof datos.schema === 'number' && datos.schema > 2) {
    return pinta(C.amarillo, 'clauth: formato de status.json nuevo (schema ' + datos.schema + '), hay que actualizar statusline-clauth.js');
  }

  const cuentas = (datos.profiles || []).filter((p) => p && (p.harness || 'claude') === 'claude');
  if (!cuentas.length) {
    return pinta(C.dim, 'clauth: sin cuentas · alta con  clauth capture <nombre>  y  clauth login <nombre>');
  }

  // Cuenta de ESTA sesión: si se abrió con `clauth start <cuenta>`, su CLAUDE_CONFIG_DIR es
  // ~/.clauth/profiles/<cuenta>/runtime-<id>. Si no, es la cuenta global activa.
  const m = (process.env.CLAUDE_CONFIG_DIR || '').match(/[\\/]\.clauth[\\/]profiles[\\/]([^\\/]+)[\\/]runtime/i);
  const deEstaSesion = m ? m[1] : datos.active_profile;

  // Segmentos del mismo ancho para que las barras queden en columna.
  const anchoNombre = 1 + Math.max(...cuentas.map((p) => [...p.name].length));
  const segs = cuentas.map((p) => segmento(p, p.name === deEstaSesion, anchoNombre));
  const W = Math.max(...segs.map(ancho));

  // Cuántas caben por línea según el ancho real de la terminal (Claude Code pasa COLUMNS).
  const SEP = pinta(C.dim, ' │ ');
  const columnas = parseInt(process.env.COLUMNS, 10) || 120;
  let porLinea = Math.floor((columnas - 2 + 3) / (W + 3));
  porLinea = Math.max(1, Math.min(porLinea, MAX_CUENTAS_POR_LINEA, segs.length));
  porLinea = Math.ceil(segs.length / Math.ceil(segs.length / porLinea));  // reparto equilibrado

  const lineas = [];
  for (let i = 0; i < segs.length; i += porLinea) {
    const fila = segs.slice(i, i + porLinea);
    lineas.push(fila.map((s, j) => (j < fila.length - 1 ? rellena(s, W) : s)).join(SEP));
  }

  // ¿Está vivo el daemon? Si no, los % se quedan congelados: avisarlo en su propia línea.
  const generado = Date.parse(datos.generated_at || '');
  let aviso = '';
  if (!deDaemon) {
    aviso = '⚠ clauth daemon no está en marcha: los % no se actualizan';
  } else if (isNaN(generado) || generado < Date.parse('2000-01-01')) {
    aviso = '⚠ clauth daemon no ha arrancado nunca';
  } else {
    const intervalo = Number(datos.refresh_interval_ms) || 300000;
    const edad = Date.now() - generado;
    if (edad > Math.max(3 * intervalo, 15 * 60000)) aviso = '⚠ clauth daemon parado, datos de hace ' + hace(edad);
  }
  if (aviso) lineas.push(pinta(C.amarillo, aviso));

  return lineas.join('\n');
}

try {
  process.stdout.write(main() + '\n');
} catch {
  process.stdout.write(pinta(C.dim, 'clauth: error leyendo el uso') + '\n');
}
