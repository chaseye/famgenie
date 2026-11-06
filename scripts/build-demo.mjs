/* Builds one self-contained HTML file of the app (demo mode), for sharing as a Claude artifact or by email.
 * node scripts/build-demo.mjs  →  dist/famgenie-demo.html */
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const html = read('public/index.html');
const css = read('public/assets/style.css');
const shared = read('public/assets/shared.js').replace(/^export /gm, '');
const app = read('public/assets/app.js').replace(/^import \{[\s\S]*?\} from '\.\/shared\.js';\n/m, '');
const fonts = html.match(/<link rel="preconnect"[\s\S]*?display=swap">/)[0];
const body = html.match(/<!--APP-->([\s\S]*?)<!--\/APP-->/)[1];
const out = `<title>FamGenie</title>
<meta name="claude:viewport-fit-sides" content="cover">
${fonts}
<style>
${css}
</style>
${body}
<script>
(function () {
${shared}
${app}
})();
</script>
`;
mkdirSync(new URL('../dist/', import.meta.url), {recursive: true});
writeFileSync(new URL('../dist/famgenie-demo.html', import.meta.url), out);
console.log('dist/famgenie-demo.html', (out.length / 1024).toFixed(0) + ' KB');
