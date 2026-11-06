// Ejecuta la línea de estado con varios anchos y la enseña en texto plano
// Uso: node pruebas/ver.js <seis.json|gasto.json|...|real> <columnas> [más columnas]
// (el carril gris de la barra, que son espacios con fondo, se dibuja como ░).
const { execFileSync } = require('child_process');
const path = require('path');
const sl = path.join(__dirname, '..', 'statusline-clauth.js');
const [feed, ...anchos] = process.argv.slice(2);
for (const cols of anchos) {
  const env = { ...process.env, COLUMNS: cols };
  if (feed !== 'real') env.CLAUTH_SL_FEED = path.join(__dirname, feed);
  const t0 = Date.now();
  const raw = execFileSync('node', [sl], { env, encoding: 'utf8' });
  const ms = Date.now() - t0;
  const plano = raw
    .replace(/\x1b\[48;5;238m((?:\x1b\[[0-9;]*m)*)([█▏▎▍▌▋▊▉]*)( *)\x1b\[0m/g, (_, c, f, e) => f + '░'.repeat(e.length))
    .replace(/\x1b\[[0-9;]*m/g, '');
  const maxW = Math.max(...plano.trimEnd().split('\n').map((l) => [...l].length));
  console.log(`--- ${feed} · COLUMNS=${cols} · línea más larga ${maxW} · ${ms} ms`);
  console.log(plano.trimEnd());
}
