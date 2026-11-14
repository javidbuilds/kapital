// Kapital · Oberfläche. Kein Build-Schritt, kein Framework.
// Kern: Formatierung, Laden, Bausteine, Router. Die Seiten stehen in pages.js.
"use strict";

// ── Format ──────────────────────────────────────────────────────────────────
const nf0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MINUS = "−";
const eur = (n, dec = false) => n == null || isNaN(n) ? "–" : (n < 0 ? MINUS : "") + (dec ? nf2 : nf0).format(Math.abs(n)) + " €";
const signed = (n, dec = false) => n == null ? "–" : (n > 0 ? "+" : "") + eur(n, dec);
const num = n => (n < 0 ? MINUS : "") + nf0.format(Math.abs(n));
const pct = (n, d = 1) => n == null || isNaN(n) ? "–" : (n < 0 ? MINUS : "") + Math.abs(n).toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d }) + " %";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MON = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const MON_S = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."];
const ymName = ym => { const [y, m] = ym.split("-"); return `${MON[+m - 1]} ${y}`; };
const dShort = iso => { const [, m, d] = iso.split("-"); return `${+d}. ${MON_S[+m - 1]}`; };
const dLong = iso => { const [y, m, d] = iso.split("-"); return `${+d}. ${MON[+m - 1]} ${y}`; };
const monthsFromNow = n => { const d = new Date(); d.setMonth(d.getMonth() + n); return `${MON_S[d.getMonth()]} ${d.getFullYear()}`; };
const isoDate = d => d.toISOString().slice(0, 10);

// Bankdaten liefern Empfänger oft in Großbuchstaben mit Rechtsform und
// umbrochenen Wörtern. Anzeige-Namen, die Daten selbst bleiben unverändert.
// Eigene Einträge nach demselben Muster ergänzen: [/regex/i, "Anzeigename"].
const NICE = [[/paypal/i, "PayPal"], [/amazon|amzn/i, "Amazon"], [/^spotify/i, "Spotify"]];
function payee(p) {
  p = String(p || "").trim();
  for (const [re, n] of NICE) if (re.test(p)) return n;
  p = p.replace(/^(VISA|Lastschrift|Ueberweisung|Überweisung)\s+/i, "").replace(/\s+(GmbH|AG|S\.C\.A\.?|SE|e\.V\.|Aktiengesellschaft)$/i, "");
  if (p.length > 3 && p === p.toUpperCase() && /[A-Z]/.test(p)) p = p.toLowerCase().replace(/(^|[\s\-/(])\p{L}/gu, m => m.toUpperCase());
  return p || "Unbekannt";
}
function memo(d) {
  d = String(d || "").trim();
  if (/^BUY:/i.test(d)) return "Kauf " + d.slice(4).trim();
  if (/^SELL:/i.test(d)) return "Verkauf " + d.slice(5).trim();
  if (/^DIVIDEND:/i.test(d)) return "Dividende " + d.slice(9).trim();
  if (/INTEREST/i.test(d)) return "Zinsen";
  const digits = (d.match(/\d/g) || []).length;
  return !d || d.length > 46 || digits > 6 || /XXXX|\/PP\.|ARN\d/.test(d) ? "" : d;
}
const secName = n => String(n || "").split(/\s(Registered|Reg\.|Inhaber|Namens|Bearer|o\.N\.|Act\.|Actions)/)[0]
  .replace(/iShs(III|II|IV|VII|V)?-/g, "iShares ").replace(/^iShs\s|^iSh\./, "iShares ").replace("U.ETF", "UCITS ETF").replace("UC.ETF", "UCITS ETF")
  .replace("All Cnt.Wld", "ACWI").replace("Gl.Clean Ener.Tra.", "Global Clean Energy ").replace(/Glbl X ETFs-DEFENCE TECH ETF/i, "Global X Defence Tech ETF")
  .replace(/, The$/, "").replace(/.*Physical Metals.*Gold.*/i, "iShares Physical Gold").replace(/\s+/g, " ").trim();

// ── Laden ───────────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch("/api" + path, opts);
  let body = null;
  try { body = await res.json(); } catch (e) { /* leere Antwort */ }
  if (!res.ok) throw new Error((body && (body.detail?.message || body.detail)) || `${res.status} ${res.statusText}`);
  return body;
}
const send = (path, method, data) => api(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });

let toastT;
function toast(msg, bad = false) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.className = "toast on" + (bad ? " bad" : "");
  clearTimeout(toastT); toastT = setTimeout(() => t.className = "toast", 4200);
}

// ── Bausteine ───────────────────────────────────────────────────────────────
const stage = ({ kicker = "", big, unit = "", text = "", side = "", sideNote = "" }) => `
  <div class="stage"><div class="wrap">
    ${kicker ? `<div class="kicker-nav">${kicker}</div>` : ""}
    <div><div class="big">${big}${unit ? `<small>${unit}</small>` : ""}</div>${text ? `<p>${text}</p>` : ""}</div>
    ${side ? `<div class="side-fig">${side}${sideNote ? `<span>${sideNote}</span>` : ""}</div>` : ""}
  </div></div>`;
const strip = items => `<div class="strip" style="--n:${items.length}">` + items.map(it =>
  `<div class="${it.flag ? "flag" : ""}"><div class="l">${it.l}</div><div class="v ${it.cls || ""}">${it.v}</div>${it.s ? `<div class="s">${it.s}</div>` : ""}</div>`).join("") + "</div>";
const sec = (title, body, aside = "") => `<section><div class="sh"><h2>${title}</h2>${aside ? `<span class="aside">${aside}</span>` : ""}</div>${body}</section>`;
const bigEur = n => ({ big: (n < 0 ? MINUS : "") + nf0.format(Math.abs(Math.round(n))), unit: " €" });

function cols(values, labels, { now = -1, fmt = eur } = {}) {
  const m = Math.max(1, ...values.map(v => Math.abs(v)));
  return `<div class="cols" role="img" aria-label="Balkendiagramm">` + values.map((v, i) =>
    `<div class="${v < 0 ? "neg" : ""} ${i === now ? "now" : ""}" style="height:${Math.max(2, Math.abs(v) / m * 100)}%" title="${esc(labels[i])}: ${fmt(v)}"><span>${esc(/^\d+$/.test(String(labels[i])) ? labels[i] : String(labels[i]).slice(0, 3))}</span></div>`).join("") + "</div>";
}

function lineChart({ labels, lines, band, h = 260, W = 1100, ticks, tickFmt, every = 6, label = "Diagramm", max: fixedMax }) {
  const pad = 52, top = 10, bottom = 24;
  const all = lines.flatMap(l => l.v).concat(band ? band[1] : []);
  const max = fixedMax ?? Math.max(...all) * 1.05, min = Math.min(0, ...all), n = labels.length;
  const x = i => pad + (n < 2 ? 0 : i / (n - 1)) * (W - pad), y = v => top + (max - v) / (max - min || 1) * (h - top - bottom);
  let s = `<svg viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label)}">`;
  (ticks || [0, max / 2]).forEach(v => s += `<line x1="${pad}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--hair)"/><text x="0" y="${y(v) + 4}">${tickFmt(v)}</text>`);
  s += `<line x1="${pad}" x2="${W}" y1="${y(min)}" y2="${y(min)}" stroke="var(--line)" stroke-width="4"/>`;
  if (band) s += `<path d="M${band[0].map((v, i) => `${x(i)},${y(v)}`).join("L")}L${band[1].map((v, i) => `${x(i)},${y(v)}`).reverse().join("L")}Z" fill="var(--stage)" opacity=".18"/>`;
  lines.forEach(l => s += `<polyline points="${l.v.map((v, i) => `${x(i)},${y(v)}`).join(" ")}" fill="none" stroke="${l.c}" stroke-width="${l.w || 3}" ${l.dash ? 'stroke-dasharray="6 5"' : ""} stroke-linejoin="round"/>`);
  labels.forEach((t, i) => { if (i % every === 0 || i === n - 1) s += `<text x="${x(i)}" y="${h - 4}" text-anchor="middle">${esc(t)}</text>`; });
  return `<div class="chart">${s}</svg></div>`;
}

// Seiten stehen in pages.js und hängen sich an P.
const P = {};

// ── Router ──────────────────────────────────────────────────────────────────
const TITLE = { monat: "Monat", buchungen: "Buchungen", vermoegen: "Vermögen", portfolio: "Portfolio", ziele: "Ziele", jahr: "Jahresübersicht", abos: "Abos", steuer: "Steuer", regeln: "Kategorien & Regeln", kategorie: "Kategorie", uebersicht: "Übersicht", import: "Import", einstellungen: "Einstellungen" };
let seq = 0;
async function route() {
  const h = (location.hash || "").replace(/^#\/?/, ""), cut = h.indexOf("/");
  const id0 = cut < 0 ? h : h.slice(0, cut), arg = cut < 0 ? "" : h.slice(cut + 1);
  const id = P[id0] ? id0 : "monat";
  const my = ++seq, el = document.getElementById("app");
  document.querySelectorAll("nav.main a, .more .menu a").forEach(a => a.getAttribute("href") === "#/" + id ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  document.querySelector(".more").classList.toggle("cur", ["jahr", "abos", "steuer", "regeln", "kategorie", "einstellungen"].includes(id));
  document.querySelector(".more").open = false;
  document.title = "Kapital · " + TITLE[id];
  el.innerHTML = `<div class="loading">${TITLE[id]} …</div>`;
  const tmp = document.createElement("div");
  try {
    await P[id](tmp, arg || "");
    if (my !== seq) return;
    el.replaceChildren(tmp);
    window.scrollTo(0, 0);
  } catch (e) {
    if (my !== seq) return;
    el.innerHTML = `<div class="error"><b>Das hat nicht geklappt</b>${esc(e.message)}<p class="body">Läuft Kapital? Starten mit <code>python -m kapital.run</code> im Projektordner.</p><button class="btn" type="button" onclick="route()">Nochmal</button></div>`;
  }
}
// Offene Buchungen in der Kopfzeile zeigen, wie v1 ("Offene Buchungen zuordnen").
async function updateOpen() {
  try {
    const n = (await api("/review/status")).open_total || 0, b = document.querySelector(".bar-right .btn.yellow");
    b.innerHTML = n ? `${n} offen zuordnen` : "Import";
    b.title = n ? `${n} Buchungen ohne Kategorie` : "Kontoauszug importieren";
  } catch (e) { /* Kopfzeile ist Komfort, kein Fehlerfall */ }
}
window.addEventListener("hashchange", route);
window.addEventListener("hashchange", updateOpen);
updateOpen();
document.addEventListener("click", e => { const m = document.querySelector(".more"); if (m.open && !m.contains(e.target)) m.open = false; });
document.getElementById("theme").onclick = () => {
  const r = document.documentElement, dark = r.dataset.theme ? r.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  r.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("kapital-theme", r.dataset.theme); } catch (e) { /* privat */ }
};
// route() startet am Ende von pages.js, wenn alle Seiten registriert sind.
