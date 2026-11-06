/* One ad as an HTML page, sized to a format. Three layouts: phone (app screenshot), statement (big words), list (checklist). */
import {FORMATS} from './lib.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
/* **word** in a headline is drawn in the accent color. */
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<em>$1</em>');

export function adHtml({ad, format, brand, fontsDir, screenPath, logoSvg}) {
  const [W, H] = FORMATS[format];
  const u = Math.min(W, H) / 100;
  const tall = H / W > 1.15, wide = W / H > 1.4;
  const theme = ad.theme === 'light' ? brand.colors.light : brand.colors.dark;
  const C = brand.colors;
  const shape = wide ? 'wide' : tall ? 'tall' : 'square';
  const layout = ad.layout === 'phone' || (ad.layout === 'list' && !wide) ? ad.layout : ad.layout;
  const note = ad.note || brand.screens?.note || '';
  /* The "sample data" note sits in the phone's top bezel so it never collides with the words or the screen. */
  const phone = (layout === 'phone' || layout === 'list') && screenPath
    ? `<div class="phone ${layout}"><div class="bezel">${note ? `<span class="pnote">${esc(note)}</span>` : '<span class="notch"></span>'}</div><img src="${esc(screenPath)}" alt=""${ad.focus ? ` style="object-position:center ${esc(ad.focus)}"` : ''}></div>` : '';
  const bullets = (ad.bullets || []).map((b) => `<li><span class="tick"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>${esc(b)}</li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Display;src:url("${fontsDir}/display.woff2") format("woff2");font-weight:200 800}
@font-face{font-family:Body;src:url("${fontsDir}/body.woff2") format("woff2");font-weight:300 900}
*{box-sizing:border-box;margin:0}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{font-family:Body,system-ui,sans-serif;color:${theme.ink};background:${theme.bg};position:relative;-webkit-font-smoothing:antialiased}
.glow{position:absolute;border-radius:50%;filter:blur(${u * 6}px);opacity:.55;pointer-events:none}
.g1{width:${u * 70}px;height:${u * 70}px;right:${-u * 18}px;top:${-u * 22}px;background:${theme.glow1}}
.g2{width:${u * 60}px;height:${u * 60}px;left:${-u * 22}px;bottom:${-u * 24}px;background:${theme.glow2}}
.frame{position:absolute;inset:0;padding:${u * 7}px ${u * 7}px ${u * 6}px;display:flex;flex-direction:column;gap:${u * 3.2}px}
.top{display:flex;align-items:center;gap:${u * 2.2}px}
.logo{width:${u * 8.5}px;height:${u * 8.5}px;border-radius:${u * 2.4}px;display:grid;place-items:center;background:linear-gradient(160deg,${C.accent},${C.accent2});box-shadow:0 ${u * .8}px ${u * 2.4}px ${C.accentShadow}}
.logo svg{width:62%;height:62%}
.name{font-family:Display,sans-serif;font-weight:800;font-size:${u * 4.6}px;letter-spacing:-.02em}
.badge{margin-left:auto;font-weight:800;font-size:${u * 2.7}px;letter-spacing:.06em;text-transform:uppercase;padding:${u * 1.1}px ${u * 2.2}px;border-radius:99px;background:${theme.chip};color:${theme.chipInk}}
h1{font-family:Display,sans-serif;font-weight:800;letter-spacing:-.035em;line-height:1.02;text-wrap:balance}
h1 em{font-style:normal;background:linear-gradient(170deg,${C.accent},${C.accent2});-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{font-weight:500;line-height:1.3;opacity:.86;text-wrap:pretty}
.cta{display:inline-flex;align-items:center;gap:${u * 1.6}px;align-self:flex-start;font-weight:800;padding:${u * 2.2}px ${u * 4}px;border-radius:${u * 3}px;color:${C.accentInk};
  background:linear-gradient(170deg,${C.accent},${C.accent2});box-shadow:inset 0 ${u * .3}px 0 rgba(255,255,255,.5),inset 0 -${u * .5}px 0 rgba(0,0,0,.15),0 ${u * 1.4}px ${u * 3.6}px ${C.accentShadow}}
.url{font-weight:700;opacity:.7;letter-spacing:.01em}
.note{position:absolute;left:${u * 4}px;bottom:${u * 2.4}px;font-size:${u * 1.9}px;font-weight:600;opacity:.6}
.phone{position:relative;background:#0B0915;border-radius:${u * 7}px;padding:${u * 5.6}px ${u * 1.3}px ${u * 1.3}px;box-shadow:0 ${u * 4}px ${u * 10}px rgba(10,5,25,.45),0 0 0 ${u * .35}px rgba(255,255,255,.14) inset}
.phone img{display:block;width:100%;height:100%;object-fit:cover;object-position:top;border-radius:${u * 5.8}px}
.bezel{position:absolute;top:0;left:0;right:0;height:${u * 5.6}px;display:grid;place-items:center}
.notch{width:28%;height:${u * 2.4}px;border-radius:99px;background:#000}
.pnote{font-size:${u * 1.9}px;font-weight:600;letter-spacing:.02em;color:rgba(255,255,255,.62)}
ul{list-style:none;padding:0;display:grid;gap:${u * 2.2}px}
li{display:flex;gap:${u * 2}px;align-items:center;font-weight:700;line-height:1.2}
.tick{flex:none;width:${u * 6}px;height:${u * 6}px;border-radius:50%;display:grid;place-items:center;color:${C.accentInk};background:linear-gradient(170deg,${C.accent},${C.accent2})}
.tick svg{width:60%;height:60%}

/* tall: words on top, phone rising from the bottom edge */
.tall h1{font-size:${u * (ad.layout === 'statement' ? 13 : 10)}px}
.tall .sub{font-size:${u * 4.4}px;max-width:92%}
.tall .cta{font-size:${u * 4}px}
.tall .url{font-size:${u * 3}px}
.tall .phone{position:absolute;left:50%;transform:translateX(-50%);bottom:${-u * 16}px;width:${u * 62}px;height:${H * (format === 'story' ? .54 : .46)}px}
.tall .phone.list{width:${u * 44}px;left:auto;right:${u * 6}px;transform:none;height:${H * .36}px}
.tall ul{font-size:${u * 4.2}px;margin-top:${u * 1}px}
.tall.list-layout ul{max-width:56%}
.tall.statement-layout .frame{justify-content:center}
.tall.statement-layout .top{position:absolute;top:${u * 7}px;left:${u * 7}px;right:${u * 7}px}

/* square: words left, phone right */
.square h1{font-size:${u * (ad.layout === 'statement' ? 11 : 8.4)}px}
.square .sub{font-size:${u * 3.7}px}
.square .cta{font-size:${u * 3.5}px}
.square .url{font-size:${u * 2.7}px}
.square .words{max-width:${ad.layout === 'statement' ? 90 : 54}%;display:flex;flex-direction:column;gap:${u * 3}px}
.square .phone{position:absolute;right:${u * 5}px;bottom:${-u * 14}px;width:${u * 38}px;height:${u * 78}px}
.square ul{font-size:${u * 3.6}px}
.square.statement-layout .frame{justify-content:center}
.square.statement-layout .top{position:absolute;top:${u * 7}px;left:${u * 7}px;right:${u * 7}px}

/* wide: words left, phone right, cropped */
.wide .frame{padding:${u * 8}px ${u * 9}px}
.wide h1{font-size:${u * (ad.layout === 'statement' ? 12 : 9.6)}px}
.wide .sub{font-size:${u * 4.3}px}
.wide .cta{font-size:${u * 3.9}px}
.wide .url{font-size:${u * 3.1}px}
.wide .words{max-width:${ad.layout === 'statement' ? 86 : 60}%;display:flex;flex-direction:column;gap:${u * 3.4}px}
.wide .phone{position:absolute;right:${u * 9}px;top:${u * 12}px;width:${u * 46}px;height:${u * 100}px}
.wide ul{font-size:${u * 4.2}px}
.wide.statement-layout .frame{justify-content:center}
.wide.statement-layout .top{position:absolute;top:${u * 8}px;left:${u * 9}px;right:${u * 9}px}
.spacer{flex:1}
</style></head><body class="${shape} ${ad.layout}-layout">
<div class="glow g1"></div><div class="glow g2"></div>
${phone}
<div class="frame">
  <div class="top"><span class="logo">${logoSvg}</span><span class="name">${esc(brand.name)}</span>${ad.badge ? `<span class="badge">${esc(ad.badge)}</span>` : ''}</div>
  <div class="words" style="display:flex;flex-direction:column;gap:${u * 3}px">
    <h1>${rich(ad.headline)}</h1>
    ${ad.sub ? `<p class="sub">${esc(ad.sub)}</p>` : ''}
    ${bullets ? `<ul>${bullets}</ul>` : ''}
    ${ad.cta ? `<span class="cta">${esc(ad.cta)} →</span>` : ''}
    <span class="url">${esc(brand.displayUrl)}</span>
  </div>
</div>
${ad.note && !phone ? `<span class="note">${esc(ad.note)}</span>` : ''}
</body></html>`;
}
