// Kapital · alle Seiten. Nutzt die Helfer aus app.js (eur, api, stage, …).
"use strict";

const catNames = async () => (await api("/categories")).categories.map(c => c.name);
const opts = (list, sel) => list.map(v => Array.isArray(v) ? `<option value="${esc(v[0])}" ${v[0] === sel ? "selected" : ""}>${esc(v[1])}</option>` : `<option ${v === sel ? "selected" : ""}>${esc(v)}</option>`).join("");
const confirmTyped = (msg, word) => (prompt(`${msg}\n\nZum Bestätigen „${word}“ eintippen:`) || "").trim().toUpperCase() === word;
async function act(fn, ok) {
  try { const r = await fn(); if (ok) toast(typeof ok === "function" ? ok(r) : ok); return r; }
  catch (e) { toast(e.message, true); throw e; }
}
const download = (href, name) => { const a = document.createElement("a"); a.href = href; if (name) a.download = name; document.body.append(a); a.click(); a.remove(); };

// ═══ Gemeinsame Bausteine für Zeitraum und Cashflow ═════════════════════════
const RANGES = [["30d", "30 Tage"], ["3m", "3 Monate"], ["6m", "6 Monate"], ["1y", "1 Jahr"], ["ytd", "Dieses Jahr"], ["all", "Gesamt"]];
function rangeOf(key) {
  const now = new Date(), d = new Date(now);
  if (key === "30d") d.setDate(d.getDate() - 30);
  else if (key === "3m") d.setMonth(d.getMonth() - 3);
  else if (key === "6m") d.setMonth(d.getMonth() - 6);
  else if (key === "1y") d.setFullYear(d.getFullYear() - 1);
  else if (key === "ytd") { d.setMonth(0); d.setDate(1); }
  else return ["", ""];
  return [isoDate(d), isoDate(now)];
}
// Ein- und Ausgaben als Balkenpaar, Überschuss als Punkt. rows: {label, in, out, savings}
function flowChart(rows, { h = 240, W = 1100, label = "Cashflow" } = {}) {
  if (!rows.length) return `<p class="empty">Keine Daten im Zeitraum.</p>`;
  const pad = 52, top = 10, bottom = 24, n = rows.length, slot = (W - pad) / n, bw = Math.max(2, slot * 0.36);
  const max = Math.max(1, ...rows.map(r => Math.max(r.in, r.out, r.savings))) * 1.08, min = Math.min(0, ...rows.map(r => r.savings)) * 1.1;
  const y = v => top + (max - v) / (max - min) * (h - top - bottom);
  const every = Math.ceil(n / 12);
  let s = `<svg viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label)}">`;
  const step = max > 40000 ? 20000 : max > 10000 ? 5000 : max > 4000 ? 2000 : 1000;
  for (let v = 0; v <= max; v += step) s += `<line x1="${pad}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--hair)"/><text x="0" y="${y(v) + 4}">${v >= 1000 ? v / 1000 + "k" : v}</text>`;
  rows.forEach((r0, i) => {
    // Mehr Erstattungen als Ausgaben ergibt netto negative Ausgaben; der Balken bleibt dann bei 0.
    const r = { ...r0, in: Math.max(0, r0.in), out: Math.max(0, r0.out) };
    const x = pad + i * slot + slot * 0.12;
    s += `<rect x="${x}" y="${y(r.in)}" width="${bw}" height="${y(0) - y(r.in)}" fill="var(--ink)"><title>${esc(r.label)}: Einnahmen ${eur(r.in)}</title></rect>`;
    s += `<rect x="${x + bw + 2}" y="${y(r.out)}" width="${bw}" height="${y(0) - y(r.out)}" fill="var(--over)"><title>${esc(r.label)}: Ausgaben ${eur(r.out)}</title></rect>`;
    s += `<rect x="${x + bw - 3}" y="${y(r.savings) - 3}" width="8" height="8" fill="${r.savings < 0 ? "var(--neg)" : "var(--stage)"}"><title>${esc(r.label)}: übrig ${eur(r.savings)}</title></rect>`;
    if (i % every === 0 || i === n - 1) s += `<text x="${x + bw}" y="${h - 4}" text-anchor="middle">${esc(r.label)}</text>`;
  });
  s += `<line x1="${pad}" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)" stroke-width="3"/>`;
  return `<div class="chart">${s}</svg></div><div class="legend"><span style="--k:var(--ink)">Einnahmen</span><span style="--k:var(--over)">Ausgaben</span><span style="--k:var(--stage)">übrig</span></div>`;
}
const accLabel = a => /^DE\d/.test(a) ? "Giro · " + a.slice(-4) : a;

// ═══ Übersicht (Auswertung über frei wählbare Zeiträume) ═════════════════════
P.uebersicht = async (el, arg) => {
  const st = Object.assign({ r: "all", from: "", to: "", acc: "all", sa: false, cf: "monthly", top: "items" }, Object.fromEntries(new URLSearchParams(arg || "")));
  st.sa = st.sa === true || st.sa === "1";
  const [f0, t0] = st.r === "custom" ? [st.from, st.to] : rangeOf(st.r);
  const qs = new URLSearchParams({ date_from: f0, date_to: t0, account: st.acc, exclude_sonderausgaben: st.sa });
  const d = await api("/dashboard?" + qs);
  const s = d.summary, konsum = s.total_expenses - s.total_refunds;
  const go = patch => { const n = { ...st, ...patch }; location.hash = "#/uebersicht/" + new URLSearchParams({ r: n.r, from: n.from, to: n.to, acc: n.acc, sa: n.sa ? 1 : 0, cf: n.cf, top: n.top }); };
  const rName = st.r === "custom" ? `${f0 ? dLong(f0) : "Beginn"} bis ${t0 ? dLong(t0) : "heute"}` : RANGES.find(x => x[0] === st.r)[1];
  const cf = (st.cf === "weekly" ? d.weekly_cashflow : d.monthly_cashflow) || [];
  const cfRows = cf.map(r => ({ label: st.cf === "weekly" ? r.label : MON_S[+r.label.slice(5) - 1].slice(0, 3) + " " + r.label.slice(2, 4), in: r.in, out: r.out - (r.refunds || 0), savings: r.savings }));
  const topCats = (d.top_categories || []).filter(c => c.value > 0), maxCat = Math.max(1, ...topCats.map(c => c.value));
  el.innerHTML = stage({ kicker: `<span>${esc(rName)}</span>${st.acc !== "all" ? `<span class="tag">${esc(accLabel(st.acc))}</span>` : ""}${st.sa ? `<span class="tag">ohne Sonderausgaben</span>` : ""}`,
      ...bigEur(s.savings), text: `übrig im Zeitraum, bei ${eur(s.total_income)} Einnahmen. Netto-Cashflow ${signed(s.net_cashflow)}.`, side: pct(s.savings_rate * 100, 0), sideNote: "Sparrate" }) +
    strip([{ l: "Einnahmen", v: eur(s.total_income) }, { l: "Konsum", v: eur(konsum), s: `${eur(s.total_expenses)} minus ${eur(s.total_refunds)} Erstattungen` },
      { l: "Netto investiert", v: eur(s.total_invested), s: `Käufe minus Verkäufe · ${pct(s.total_income ? s.total_invested / s.total_income * 100 : 0, 0)} der Einnahmen` }, { l: "Buchungen", v: num(s.n_transactions) }]) +
    `<div class="wrap content">
      <div class="tools">
        <div class="seg" role="group" aria-label="Zeitraum">${RANGES.map(([k, l]) => `<button type="button" data-r="${k}" aria-pressed="${st.r === k}">${l}</button>`).join("")}</div>
        <input class="field" type="date" id="from" value="${esc(f0)}" aria-label="von"><input class="field" type="date" id="to" value="${esc(t0)}" aria-label="bis">
        <select class="field" id="acc" aria-label="Konto"><option value="all">Alle Konten</option>${(d.all_accounts || []).map(a => `<option value="${esc(a)}" ${a === st.acc ? "selected" : ""}>${esc(accLabel(a))}</option>`).join("")}</select>
        <label class="check"><input type="checkbox" id="sa" ${st.sa ? "checked" : ""}> Sonderausgaben herausrechnen</label>
      </div>
      <div class="grid"><div>` +
      sec("Cashflow", `<div class="tools"><div class="seg" role="group" aria-label="Auflösung"><button type="button" data-cf="monthly" aria-pressed="${st.cf === "monthly"}">Monat</button><button type="button" data-cf="weekly" aria-pressed="${st.cf === "weekly"}">Woche</button></div></div>` +
        flowChart(cfRows.slice(-36), { label: "Ein- und Ausgaben", W: 640, h: 300 }), st.cf === "weekly" ? "letzte Wochen" : `${Math.min(cfRows.length, 36)} Monate`) +
      sec("Konten", `<table><tbody>${(d.accounts || []).filter(a => !(/kraken/i.test(a.name) && Math.abs(a.balance) < 1 && d.crypto?.value)).map(a => `<tr><td>${esc(a.name)}${a.type && a.type !== a.name ? `<span class="sub">${esc(a.type)}</span>` : ""}</td><td class="n">${eur(a.balance)}</td></tr>`).join("")}
          <tr><td>Depot<span class="sub">${d.depot?.as_of ? "Auszug " + dLong(d.depot.as_of) : ""}</span></td><td class="n">${eur(d.depot?.value || 0)}</td></tr>
          ${d.crypto?.value ? `<tr><td>Krypto<span class="sub">Kraken, aktueller Kurs</span></td><td class="n">${eur(d.crypto.value)}</td></tr>` : ""}
          ${(d.contracts || []).map(k => `<tr><td>${esc(k.name)}<span class="sub">${esc(k.source || "")}</span></td><td class="n">${eur(k.current_value ?? k.value)}</td></tr>`).join("")}
        </tbody><tfoot><tr><td>Vermögen</td><td class="n">${eur((d.accounts || []).reduce((x, a) => x + a.balance, 0) + (d.depot?.value || 0) + (d.crypto?.value || 0) + (d.contracts || []).reduce((x, k) => x + (k.current_value ?? k.value ?? 0), 0))}</td></tr></tfoot></table>`) +
      `</div><div>` +
      sec("Größte Ausgaben", `<div class="tools"><div class="seg" role="group" aria-label="Ansicht"><button type="button" data-top="items" aria-pressed="${st.top === "items"}">Buchungen</button><button type="button" data-top="cats" aria-pressed="${st.top === "cats"}">Kategorien</button></div></div>` +
        (st.top === "cats" ? `<table><tbody>${topCats.map(c => `<tr><td><a href="#/kategorie/${encodeURIComponent(c.name)}">${esc(c.name)}</a><div class="meter"><i style="width:${c.value / maxCat * 100}%"></i></div></td><td class="n">${eur(c.value)}</td></tr>`).join("")}</tbody></table>`
          : `<table><tbody>${(d.top_expenses || []).map(t => `<tr><td>${esc(payee(t.payee))}<span class="sub">${dLong(t.date)} · ${esc(t.category)}${t.is_sonderausgabe ? " · Sonderausgabe" : ""}</span></td><td class="n">${eur(t.amount, true)}</td></tr>`).join("") || `<tr><td class="empty">Keine Ausgaben im Zeitraum.</td></tr>`}</tbody></table>
             ${d.top_expenses_hidden ? `<p class="body" style="margin-top:12px;font-size:13px">${num(d.top_expenses_hidden)} Buchungen aus ${esc((d.top_expenses_excluded || []).join(", "))} ausgeblendet. Einstellbar unter <a href="#/einstellungen">Einstellungen</a>.</p>` : ""}`)) +
      sec("Letzte Buchungen", `<table><tbody>${(d.recent_transactions || []).map(t => `<tr><td>${esc(payee(t.payee))}<span class="sub">${dShort(t.date)} · ${t.is_transfer ? "Umbuchung" : esc(t.category)}</span></td><td class="n ${t.amount > 0 ? "pos" : ""}">${signed(t.amount, true)}</td></tr>`).join("")}</tbody></table>
        <p style="margin-top:14px"><a class="btn" href="#/buchungen">Alle Buchungen</a></p>`) +
      `</div></div></div>`;
  el.querySelectorAll("[data-r]").forEach(b => b.onclick = () => go({ r: b.dataset.r, from: "", to: "" }));
  el.querySelectorAll("[data-cf]").forEach(b => b.onclick = () => go({ cf: b.dataset.cf }));
  el.querySelectorAll("[data-top]").forEach(b => b.onclick = () => go({ top: b.dataset.top }));
  ["#from", "#to"].forEach(sel => el.querySelector(sel).onchange = () => go({ r: "custom", from: el.querySelector("#from").value, to: el.querySelector("#to").value }));
  el.querySelector("#acc").onchange = e => go({ acc: e.target.value });
  el.querySelector("#sa").onchange = e => go({ sa: e.target.checked });
};

// ═══ Ziele ══════════════════════════════════════════════════════════════════
const fmtDauer = m => m == null ? "nicht in 35 J." : m === 0 ? "schon erreicht" : (() => { const y = Math.floor(m / 12), mo = m % 12; return y === 0 ? `in ${mo} Mon.` : mo === 0 ? `in ${y} J.` : `in ${y} J. ${mo} M.`; })();
P.ziele = async el => {
  let data = await api("/ziele");
  let goals = data.goals_config.map(g => ({ ...g })), A = { ...data.assumptions }, savings = Math.round(data.monthly_savings);
  const s0 = data.start;
  const field = (key, val, label, unit, step) => `<label class="frm"><span>${label}</span><span class="inp"><input class="field" type="number" step="${step}" data-k="${key}" value="${val ?? ""}"><i>${unit}</i></span></label>`;
  const goalInputs = g => g.type === "notgroschen" ? field("g:" + g.id + ":months", g.months, "Monate Grundlast", "Mon.", 1)
    : g.type === "immobilie" ? field("g:" + g.id + ":price", g.price, "Kaufpreis", "€", 10000) + field("g:" + g.id + ":equity_pct", g.equity_pct, "Eigenkapital", "%", 5) + field("g:" + g.id + ":costs_pct", g.costs_pct, "Nebenkosten", "%", 1) + field("g:" + g.id + ":max_depot_pct", g.max_depot_pct ?? 100, "Höchstens aus dem Depot", "%", 10)
    : g.type === "fire" ? field("g:" + g.id + ":swr", g.swr, "Entnahmerate", "%", 0.25) + field("a:pension_earned", A.pension_earned, "Rente bereits erreicht (Renteninformation)", "€/Mon.", 50) + field("a:pension_at_retirement", A.pension_at_retirement, `Rente bei Arbeit bis ${A.retirement_age}`, "€/Mon.", 50) + field("a:pension_deduction_pct", A.pension_deduction_pct ?? 11, "Abzug Kranken- und Pflegeversicherung", "%", 1) + field("a:age", A.age, "Alter heute", "Jahre", 1) + field("a:retirement_age", A.retirement_age, "Rentenbeginn", "Jahre", 1) : "";

  el.innerHTML = `<div id="zi-top"></div><div class="wrap content">
      <div class="grid"><div>${sec("Deine Ziele", `<p class="body" style="font-size:13px">In heutiger Kaufkraft. Die Ziele bauen aufeinander auf: Jedes kommt zu den vorherigen dazu. „Erreicht“ heißt, dein Vermögen deckt dieses Ziel und alle davor.</p><div id="zi-goals"></div>`)}</div>
      <div>${sec("Annahmen", `<form class="form" id="zi-ass" onsubmit="return false">
          <label class="frm"><span>Sparrate pro Monat</span><span class="inp"><input class="field" type="number" step="50" data-k="savings" value="${savings}"><i>€</i></span></label>
          <div class="tools" id="zi-sav"></div>
          ${field("a:invest_share", A.invest_share, "Anteil der Sparrate ins Depot", "%", 10)}${field("a:inflation", A.inflation, "Inflation", "%", 0.25)}${field("a:cash_rate", A.cash_rate, "Zins auf Cash (netto)", "%", 0.25)}
          ${field("a:loan_rate", A.loan_rate, "Bauzins", "%", 0.1)}${field("a:loan_repayment", A.loan_repayment, "Tilgung", "%", 0.5)}${field("a:state_pension", A.state_pension, "Gesetzliche Rente (falls ohne Renteninformation)", "€/Mon.", 50)}${field("a:vorsorge_return", A.vorsorge_return, "Rendite der Rentenverträge", "%", 0.5)}
          <p class="body" style="font-size:13px;margin-top:6px" id="zi-state">Änderungen werden sofort gerechnet und gespeichert. Keine Anlageberatung.</p></form>`)}</div></div>
      <div id="zi-chart" style="margin-top:52px"></div><div id="zi-levers" style="margin-top:52px"></div></div>`;

  function paint() {
    const d = data, s = d.start, fire = d.goals.find(g => g.type === "fire"), last = d.goals[d.goals.length - 1];
    const cashShare = s.total ? s.cash / s.total * 100 : 0;
    el.querySelector("#zi-top").innerHTML = stage({ big: fire && fire.age_at ? nf0.format(Math.floor(fire.age_at)) : "–", unit: " Jahre",
        text: fire ? `alt bist du im mittleren Szenario, wenn dein freies Vermögen ${eur(fire.passive_income)} im Monat trägt.` : "Kein Ziel für finanzielle Unabhängigkeit angelegt.",
        side: fire ? fmtDauer(fire.reached_months.mittel).replace("in ", "") : "", sideNote: fire && fire.reached_months.mittel ? `um ${monthsFromNow(fire.reached_months.mittel)}` : "" }) +
      strip([{ l: "Verfügbares Vermögen", v: eur(s.total), s: s.gebunden ? `ohne ${eur(s.gebunden)} gebunden in Rentenverträgen und Kaution` : "Konten, Depot, Krypto" },
        { l: "Davon Cash", v: eur(s.cash), s: `${pct(cashShare, 0)} · Konten ${eur(s.liquid)} · Broker ${eur(s.broker_cash)}`, flag: cashShare > 50 },
        { l: "Davon investiert", v: eur(s.invested), s: `${pct(100 - cashShare, 0)}${s.crypto ? ` · inkl. ${eur(s.crypto)} Krypto` : ""}` },
        { l: "Sparrate", v: eur(savings), s: `Ø ${ymName(s.window[0]).split(" ")[0].slice(0, 3)} bis ${ymName(s.window[s.window.length - 1])}` }]);
    el.querySelector("#zi-sav").innerHTML = `<button type="button" class="chip" data-sav="${Math.round(s.monthly_savings_real)}" aria-pressed="${savings === Math.round(s.monthly_savings_real)}">realistisch ${eur(s.monthly_savings_real)}</button>
      <button type="button" class="chip" data-sav="${Math.round(s.monthly_savings_max)}" aria-pressed="${savings === Math.round(s.monthly_savings_max)}">ohne Einmaliges ${eur(s.monthly_savings_max)}</button>`;
    el.querySelector("#zi-goals").innerHTML = d.goals.map((g, i) => {
      const cfg = goals.find(x => x.id === g.id) || g, m = g.reached_months, done = m.mittel === 0;
      const expl = g.type === "notgroschen" ? `${cfg.months} × Grundlast von ${eur(s.monthly_expenses)}. Bleibt als Cash liegen.`
        : g.type === "immobilie" ? `${(cfg.max_depot_pct ?? 100) < 100 ? `Aus dem Depot höchstens ${cfg.max_depot_pct} % (heute ${eur(s.invested * (cfg.max_depot_pct ?? 100) / 100)}), der Rest aus Cash. ` : ""}Kredit danach etwa ${eur(g.loan)}, Rate etwa <b>${eur(g.monthly_rate)} im Monat</b> (${A.loan_rate} % Zins plus ${A.loan_repayment} % Tilgung).`
        : g.type === "fire" ? `Nötiges freies Vermögen, um mit der Arbeit aufzuhören${g.age_at ? `, mit etwa <b>${String(g.age_at).replace(".", ",")} Jahren</b>` : ""}. Bis ${A.retirement_age} trägt es die vollen Ausgaben (${eur(s.monthly_expenses)} im Monat), danach nur die Lücke ${g.state_pension > 0 ? `nach ${eur(g.state_pension)} gesetzlicher Rente netto${g.state_pension_mode === "renteninformation" ? " (wer früher aufhört, zahlt weniger ein)" : ""}` : `<span class="warn">ohne gesetzliche Rente, sie ist noch nicht eingetragen</span>`}${g.vorsorge_now > 0 ? ` und abzüglich deiner Rentenverträge (heute ${eur(g.vorsorge_now)})` : ""}. Einfache Rechnung zum Vergleich (Ausgaben ÷ Entnahmerate, ohne Renten): ${eur(g.simple_target)}.` : "";
      return `<div class="goalrow">
        <div class="gl"><span class="gn ${done ? "done" : ""}">${done ? "✓" : i + 1}</span><div><b>${esc(g.name)}</b><div class="ga">${eur(g.amount)}</div>${i ? `<span class="sub">kumuliert ${eur(g.cumulative)}</span>` : ""}</div>
          <div class="gw"><b class="${done ? "pos" : ""}">${fmtDauer(m.mittel)}</b>${m.mittel ? `<span class="sub">${monthsFromNow(m.mittel)}</span><span class="sub">Spanne ${fmtDauer(m.optimistisch).replace("in ", "")} bis ${m.pessimistisch == null ? "über 35 J." : fmtDauer(m.pessimistisch).replace("in ", "")}</span>` : ""}</div></div>
        <div class="gf" data-goal="${esc(g.id)}">${goalInputs(cfg)}</div><p class="body" style="font-size:13px;margin:8px 0 0">${expl}</p></div>`;
    }).join("");
    const yr = d.yearly, now = new Date().getFullYear();
    const topV = Math.max(...d.goals.map(g => g.cumulative), ...yr.map(r => r.mittel)) * 1.05;
    const step = topV > 1.5e6 ? 500000 : topV > 600000 ? 250000 : 100000;
    const ticks = []; for (let v = 0; v <= topV; v += step) ticks.push(v);
    let chart = lineChart({ labels: yr.map(r => String(now + r.year)), lines: [{ v: yr.map(r => Math.min(r.pessimistisch, topV)), c: "var(--over)", w: 2, dash: 1 }, { v: yr.map(r => Math.min(r.optimistisch, topV)), c: "var(--pos)", w: 2, dash: 1 }, { v: yr.map(r => Math.min(r.mittel, topV)), c: "var(--stage)", w: 4 }],
      max: topV * 1.05, ticks, tickFmt: v => v >= 1e6 ? (v / 1e6).toLocaleString("de-DE") + " Mio." : v ? v / 1000 + "k" : "0", every: 5, label: "Vermögen in heutiger Kaufkraft" });
    // Ziel-Linien und Werte je Jahr ins Diagramm legen (Hover zeigt alle drei Szenarien).
    const W = 1100, pad = 52, h = 260, tp = 10, bt = 24, yy = v => tp + (topV * 1.05 - v) / (topV * 1.05) * (h - tp - bt), xx = i => pad + i / (yr.length - 1) * (W - pad);
    const extra = d.goals.filter(g => g.cumulative <= topV).map(g => `<line x1="${pad}" x2="${W}" y1="${yy(g.cumulative)}" y2="${yy(g.cumulative)}" stroke="var(--ink)" stroke-dasharray="3 5" stroke-width="1.5"/><text x="${W - 4}" y="${yy(g.cumulative) - 6}" text-anchor="end" style="fill:var(--ink)">${esc(g.name)}</text>`).join("") +
      yr.map((r, i) => `<rect x="${xx(i) - (W - pad) / yr.length / 2}" y="${tp}" width="${(W - pad) / yr.length}" height="${h - tp - bt}" fill="transparent"><title>${now + r.year}: optimistisch ${eur(r.optimistisch)} · mittel ${eur(r.mittel)} · pessimistisch ${eur(r.pessimistisch)}</title></rect>`).join("");
    chart = chart.replace("</svg>", extra + "</svg>");
    el.querySelector("#zi-chart").innerHTML = sec("Vermögen in heutiger Kaufkraft", chart + `<div class="legend"><span style="--k:var(--pos)">optimistisch ${pct(d.scenarios.optimistisch)}</span><span style="--k:var(--stage)">mittel ${pct(d.scenarios.mittel)}</span><span style="--k:var(--over)">pessimistisch ${pct(d.scenarios.pessimistisch)}</span><span style="--k:var(--ink)">deine Ziele</span></div>
      <p class="body" style="font-size:13px;margin-top:8px">Depotrendite nominal pro Jahr, Cash ${pct(A.cash_rate)}, Inflation ${pct(A.inflation)}. Mit der Maus über das Diagramm zeigt die Werte je Jahr.</p>`, "35 Jahre");
    el.querySelector("#zi-levers").innerHTML = sec("Was dein letztes Ziel verschiebt", `<p class="body" style="font-size:13px">${esc(last ? last.name : "")} im mittleren Szenario: ${fmtDauer(d.base_months)}.</p><table><tbody>${(d.levers || []).map(l => { const dm = l.delta_months;
        return `<tr><td>${esc(l.label)}<span class="sub">${esc(l.detail)}</span></td><td class="n ${dm == null ? "neg" : dm > 0 ? "pos" : dm < 0 ? "neg" : ""}">${dm == null ? "nicht erreicht" : dm === 0 ? "±0" : `${Math.abs(dm) >= 12 ? (Math.abs(dm) / 12).toFixed(1).replace(".", ",") + " J." : Math.abs(dm) + " Mon."} ${dm > 0 ? "früher" : "später"}`}</td></tr>`; }).join("")}</tbody></table>`);
  }
  paint();

  let t, seq = 0;
  const recalc = () => { clearTimeout(t); el.querySelector("#zi-state").textContent = "Rechne …"; t = setTimeout(async () => {
    const my = ++seq;
    try {
      const r = await send("/ziele", "POST", { goals, assumptions: A, monthly_savings: savings === Math.round(s0.monthly_savings_real) ? null : savings });
      if (my !== seq) return;
      data = r; paint(); el.querySelector("#zi-state").textContent = "Gespeichert. Änderungen werden sofort gerechnet. Keine Anlageberatung.";
    } catch (e) { el.querySelector("#zi-state").innerHTML = `<span class="warn">${esc(e.message)}</span>`; }
  }, 400); };
  el.addEventListener("input", e => {
    const k = e.target.dataset.k; if (!k) return;
    const v = e.target.value === "" ? null : Number(e.target.value);
    if (k === "savings") savings = v ?? 0;
    else if (k.startsWith("a:")) A[k.slice(2)] = v ?? 0;
    else if (k.startsWith("g:")) { const [, id, key] = k.split(":"); goals = goals.map(g => g.id === id ? { ...g, [key]: v ?? (key === "max_depot_pct" ? 100 : 0) } : g); }
    recalc();
  });
  el.addEventListener("click", e => {
    const b = e.target.closest("[data-sav]"); if (!b) return;
    savings = +b.dataset.sav; el.querySelector('[data-k="savings"]').value = savings; recalc();
  });
  // Goal-Eingaben werden bei paint() neu erzeugt. Fokus und Cursor bleiben erhalten, solange man tippt,
  // weil paint() erst nach der Antwort läuft und nur dann, wenn das Feld nicht fokussiert ist.
  const origPaint = paint;
  paint = () => { const f = document.activeElement?.dataset?.k; const pos = document.activeElement?.selectionStart; origPaint(); if (f) { const n = el.querySelector(`[data-k="${CSS.escape(f)}"]`); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (err) { /* number inputs */ } } } };
};

// ═══ Monat ══════════════════════════════════════════════════════════════════
const vsPrev = (v, p, lowerIsBetter = false) => { if (!p) return ""; const d = (v - p) / Math.abs(p) * 100; const good = lowerIsBetter ? d < 0 : d > 0;
  return `<span class="${Math.abs(d) < 1 ? "" : good ? "pos" : "warn"}">${d > 0 ? "+" : ""}${pct(d, 0)}</span> zum Vormonat`; };
P.monat = async (el, arg) => {
  const months = (await api("/monatsabschluss/months")).months || [];
  const ov = await api("/monatsabschluss/uebersicht?month=" + encodeURIComponent(arg || ""));
  const ym = ov.month;
  const [rv, dash, cfg, base] = await Promise.all([api("/monatsabschluss/bewertung?month=" + ym), api("/dashboard"), api("/monatsabschluss/budget"), api("/baseline")]);
  const k = ov.kennzahlen, vm = ov.vormonat, net = k.ausgaben - k.erstattungen;
  const list = months.map(m => m.month), idx = list.indexOf(ym), prev = list[idx + 1], next = list[idx - 1];
  const mc = dash.monthly_cashflow || [];
  const upto = mc.filter(r => r.label <= ym).slice(-6), inc6 = upto.reduce((a, r) => a + r.in, 0);
  const avgRate = inc6 ? upto.reduce((a, r) => a + r.savings, 0) / inc6 * 100 : null;
  const mName = ymName(ym).split(" ")[0];
  let line = k.ersparnis >= 0 ? `sind im ${mName} übrig geblieben.` : `mehr ausgegeben als eingenommen.`;
  if (vm) line += ` Im ${ymName(vm.monat).split(" ")[0]} waren es ${pct(vm.sparrate * 100)} Sparrate.`;
  const kicker = `<button type="button" data-go="${prev || ""}" ${prev ? "" : "disabled"} aria-label="Vormonat">‹</button>
    <select aria-label="Monat wählen">${list.map(m => `<option value="${m}" ${m === ym ? "selected" : ""}>${ymName(m)}</option>`).join("")}</select>
    <button type="button" data-go="${next || ""}" ${next ? "" : "disabled"} aria-label="Nächster Monat">›</button>
    ${ov.is_complete ? "" : `<span class="tag">läuft noch</span>`}${ov.open ? `<a class="tag" href="#/import">${ov.open} offen</a>` : ""}`;
  const overInvest = k.investiert > Math.max(0, k.ersparnis) && k.investiert > 0;

  let html = stage({ kicker, ...bigEur(k.ersparnis), text: line, side: pct(k.sparrate * 100), sideNote: `Sparrate${avgRate != null ? " · Ø 6 Mon. " + pct(avgRate, 0) : ""}` }) +
    strip([{ l: "Einnahmen", v: eur(k.einnahmen), s: vm ? vsPrev(k.einnahmen, vm.einnahmen) : "" },
      { l: "Ausgaben netto", v: eur(net), s: (k.erstattungen ? `${eur(k.ausgaben)} minus ${eur(k.erstattungen)} Erstattungen` : "") + (vm ? `<br>${vsPrev(net, vm.ausgaben - vm.erstattungen, true)}` : "") },
      { l: "Ins Depot", v: eur(k.investiert), s: overInvest ? `${eur(k.investiert - Math.max(0, k.ersparnis))} mehr als übrig` : (vm ? vsPrev(k.investiert, vm.investiert) : ""), flag: overInvest }]);

  const r = rv.result || {};
  let verdict;
  if (rv.exists && rv.result) {
    verdict = `<div class="score">${r.punktzahl}<span>/ 100 · ${esc(r.gesamturteil)}</span></div>
      <h3>${esc(r.headline)}</h3><p class="body">${esc(r.zusammenfassung)}</p>
      <div class="notes">
        <div><h4>Lief gut</h4><ul>${(r.lob || []).map(x => `<li><b>${esc(x.titel)}</b><span>${esc(x.text)}</span></li>`).join("")}</ul></div>
        <div><h4>Ansehen</h4><ul>${(r.kritik || []).map(x => `<li><b>${esc(x.titel)}</b><span>${esc(x.text)}</span></li>`).join("")}</ul></div>
      </div>
      ${r.frage ? `<div class="ask"><b>Frage an dich</b>${esc(r.frage)}</div>` : ""}
      <div class="meta"><span>${esc(rv.model || "Claude")} · ${rv.created_at ? dLong(rv.created_at.slice(0, 10)) : ""}</span>
        ${rv.stale ? `<span class="warn">Die Daten haben sich seit der Bewertung geändert.</span>` : ""}
        <button class="link" type="button" data-review="force" ${rv.api_key_set ? "" : "disabled"}>Neu bewerten</button>
        <button class="link" type="button" data-review="delete">Bewertung löschen</button></div>`;
  } else if (ov.open) {
    verdict = `<p class="body">Für ${ymName(ym)} sind noch ${ov.open} Buchungen ohne Kategorie. Erst danach lässt sich der Monat bewerten.</p><a class="btn black" href="#/import">Buchungen zuordnen</a>`;
  } else if (!rv.api_key_set) {
    verdict = `<p class="body">Für die Bewertung fehlt der Anthropic-API-Key.</p><a class="btn black" href="#/einstellungen">Key eintragen</a>`;
  } else {
    verdict = `<p class="body">${ymName(ym)} ist noch nicht bewertet. Claude bekommt dafür die Monatssummen, keine IBANs und keine Kontoauszüge.</p><button class="btn black" type="button" data-review="new">Monat bewerten</button>`;
  }
  const extra = rv.exists ? (r.depot?.text ? sec("Depot", `<p class="body">${esc(r.depot.text)}</p>`, esc(r.depot.urteil || "")) : "") +
    ((r.massnahmen || []).filter(m => m.titel).length ? sec("Nächster Monat", `<ol class="steps">${r.massnahmen.filter(m => m.titel).map(m => `<li><div><b>${esc(m.titel)}</b><span>${esc(m.text)}</span></div></li>`).join("")}</ol>`) : "") : "";

  const cats = (ov.categories || []).slice().sort((a, b) => b.delta - a.delta);
  const over = cats.filter(c => c.delta > 0.5);
  const budRows = arr => arr.map(c => { const m = Math.max(c.ist, c.ziel, 1);
    return `<tr><td>${esc(c.category)}<span class="sub">${c.quelle === "manuell" ? "Ziel selbst gesetzt" : "Ziel = Ø " + ov.avg_months + " Monate"} · ${c.count} Buchungen</span>
      <div class="meter"><i class="${c.delta > 0.5 ? "over" : ""}" style="width:${c.ist / m * 100}%"></i><b style="left:calc(${c.ziel / m * 100}% - 1.5px)"></b></div></td>
      <td class="n">${eur(c.ist)}<span class="sub"><button class="link" type="button" data-ziel="${esc(c.category)}" data-v="${c.quelle === "manuell" ? Math.round(c.ziel) : ""}" data-avg="${Math.round(c.durchschnitt)}">Ziel ${eur(c.ziel)}</button></span></td>
      <td class="n ${c.delta > 0.5 ? "warn" : ""}">${signed(Math.round(c.delta))}</td></tr>`; }).join("");
  const budget = `<div class="tools"><div class="seg" role="group" aria-label="Filter"><button type="button" aria-pressed="true" data-bud="over">Über Ziel (${over.length})</button><button type="button" aria-pressed="false" data-bud="all">Alle (${cats.length})</button></div>
      <select class="field" id="avgm" aria-label="Ziel aus Durchschnitt">${opts([[3, "Ø 3 Monate"], [6, "Ø 6 Monate"], [12, "Ø 12 Monate"]].map(([v, l]) => [String(v), l]), String(cfg.avg_months))}</select>
      <label class="check"><input type="checkbox" id="exsa" ${cfg.exclude_sonderausgaben ? "checked" : ""}> ohne Sonderausgaben</label></div>
    <table><tbody id="bud">${budRows(over.length ? over : cats)}</tbody>
    <tfoot><tr><td>Gesamt</td><td class="n">${eur(ov.total_ist)}<span class="sub">Ziel ${eur(ov.total_ziel)}</span></td><td class="n">${signed(Math.round(ov.total_delta))}</td></tr></tfoot></table>
    <p class="body" style="margin-top:12px;font-size:13px">Ziel anklicken, um es selbst festzulegen. Leer lassen setzt es zurück auf den Durchschnitt.</p>`;

  const baseline = `<table><tbody>
      <tr><td>Ausgaben</td><td class="n">${eur(base.avg_spend)}<span class="sub">inkl. aller ${eur(base.avg_spend_incl_all)}</span></td></tr>
      <tr><td>Einnahmen</td><td class="n">${eur(base.avg_income)}</td></tr>
      <tr><td>Übrig</td><td class="n pos">${eur(base.avg_savings)}<span class="sub">${pct(base.savings_rate * 100, 0)} Sparrate</span></td></tr>
      ${base.sonderausgaben_avg ? `<tr><td>Sonderausgaben<span class="sub">nicht eingerechnet</span></td><td class="n">${eur(base.sonderausgaben_avg)}</td></tr>` : ""}
    </tbody></table>
    <div class="tools" style="margin-top:14px"><select class="field" id="basem" aria-label="Zeitraum">${opts([3, 6, 12].map(v => [String(v), `letzte ${v} Monate`]), String(base.n_months))}</select></div>
    <details class="more-info"><summary>Je Monat und je Kategorie</summary>
      <table><thead><tr><th>Monat</th><th class="n">Ausgaben</th><th class="n">Einnahmen</th><th class="n">Übrig</th></tr></thead><tbody>${(base.per_month || []).slice().reverse().map(m => `<tr><td>${ymName(m.month)}${m.excluded ? `<span class="sub">ohne ${eur(m.excluded)} ausgeschlossen</span>` : ""}</td><td class="n">${eur(m.spend)}</td><td class="n">${eur(m.income)}</td><td class="n ${m.savings < 0 ? "neg" : ""}">${eur(m.savings)}</td></tr>`).join("")}</tbody></table>
      <table style="margin-top:18px"><tbody>${(base.categories || []).map(c => `<tr><td>${esc(c.category)}</td><td class="n">${eur(c.avg)}<span class="sub">Ø im Monat</span></td></tr>`).join("")}</tbody></table>
    </details>`;

  const last12 = mc.filter(x => x.label <= ym).slice(-12);
  html += `<div class="wrap content grid"><div>${sec("Bewertung", verdict)}${extra}
      ${sec("Zwölf Monate", cols(last12.map(x => x.savings), last12.map(x => MON_S[+x.label.slice(5) - 1]), { now: last12.length - 1 }), "übrig pro Monat")}</div>
    <div>${sec(over.length ? "Über Ziel" : "Budget", budget)}${sec("Ein normaler Monat", baseline, `Ø ${ymName(base.months[0]).split(" ")[0].slice(0, 3)}–${ymName(base.months[base.months.length - 1]).split(" ")[0].slice(0, 3)}`)}</div></div>`;
  el.innerHTML = html;

  el.querySelectorAll("[data-go]").forEach(b => b.onclick = () => b.dataset.go && (location.hash = "#/monat/" + b.dataset.go));
  el.querySelector(".kicker-nav select").onchange = e => location.hash = "#/monat/" + e.target.value;
  el.querySelectorAll("[data-bud]").forEach(b => b.onclick = () => {
    el.querySelectorAll("[data-bud]").forEach(x => x.setAttribute("aria-pressed", x === b));
    el.querySelector("#bud").innerHTML = budRows(b.dataset.bud === "all" ? cats : (over.length ? over : cats));
  });
  el.querySelector("#bud").addEventListener("click", async e => {
    const b = e.target.closest("[data-ziel]"); if (!b) return;
    const v = prompt(`Monatsziel für ${b.dataset.ziel} in €.\nLeer = Durchschnitt (${eur(+b.dataset.avg)}).`, b.dataset.v);
    if (v === null) return;
    const val = v.trim() === "" ? null : parseFloat(v.replace(/\./g, "").replace(",", "."));
    if (val !== null && (isNaN(val) || val < 0)) return toast("Bitte einen Betrag ab 0 eingeben", true);
    await act(() => send(`/monatsabschluss/ziel/${encodeURIComponent(b.dataset.ziel)}`, "PUT", { value: val }), val === null ? "Ziel zurück auf Durchschnitt" : `Ziel ${eur(val)} gesetzt`);
    route();
  });
  el.querySelector("#avgm").onchange = async e => { await act(() => send("/monatsabschluss/budget", "PUT", { avg_months: +e.target.value }), "Zielzeitraum geändert"); route(); };
  el.querySelector("#exsa").onchange = async e => { await act(() => send("/monatsabschluss/budget", "PUT", { exclude_sonderausgaben: e.target.checked }), "Gespeichert"); route(); };
  el.querySelector("#basem").onchange = async e => { await act(() => send("/baseline/config", "PUT", { months: +e.target.value }), "Gespeichert"); route(); };
  el.querySelectorAll("[data-review]").forEach(b => b.onclick = async () => {
    if (b.dataset.review === "delete") {
      if (!confirm(`Bewertung für ${ymName(ym)} löschen?`)) return;
      await act(() => api("/monatsabschluss/bewertung?month=" + ym, { method: "DELETE" }), "Bewertung gelöscht"); return route();
    }
    b.disabled = true; b.textContent = "Claude bewertet …";
    try { await api(`/monatsabschluss/bewertung?month=${ym}&force=${b.dataset.review === "force"}`, { method: "POST" }); toast("Bewertung fertig"); route(); }
    catch (err) { toast("Bewertung fehlgeschlagen: " + err.message, true); b.disabled = false; b.textContent = "Nochmal versuchen"; }
  });
};

// ═══ Buchungen ══════════════════════════════════════════════════════════════
P.buchungen = async (el, arg) => {
  const state = { search: "", kind: "all", account: "all", category: arg ? decodeURIComponent(arg) : "all", sonder: "all", range: "all", sort: "date_desc", min: "", max: "", offset: 0 };
  const [first, allCats] = await Promise.all([api("/transactions?limit=1"), catNames()]);
  const accounts = first.accounts || [];
  const ranges = { all: "Gesamt", m0: "Dieser Monat", m1: "Letzter Monat", m3: "3 Monate", y0: "Dieses Jahr", y1: "Letztes Jahr" };
  const accName = a => /^DE\d/.test(a) ? "Giro" : a;
  el.innerHTML = stage({ big: num(first.total), unit: " Buchungen", text: `aus ${accounts.length} Konten: ${[...new Set(accounts.map(accName))].join(", ")}.` }) +
    `<div class="strip" id="tx-strip" style="--n:3"></div>
    <div class="wrap content">
      <div class="tools">
        <input class="field grow" type="search" id="q" placeholder="Empfänger, Zweck oder Betrag" aria-label="Buchungen durchsuchen">
        <div class="seg" role="group" aria-label="Art">${[["all", "Alle"], ["ausgaben", "Ausgaben"], ["einnahmen", "Einnahmen"], ["erstattungen", "Erstattung"], ["umbuchungen", "Umbuchung"], ["investitionen", "Invest"]]
          .map(([k, l]) => `<button type="button" data-kind="${k}" aria-pressed="${k === "all"}">${l}</button>`).join("")}</div>
      </div>
      <div class="tools">
        <select class="field" id="cat" aria-label="Kategorie"><option value="all">Alle Kategorien</option>${opts(allCats, state.category)}</select>
        <select class="field" id="acc" aria-label="Konto"><option value="all">Alle Konten</option>${accounts.map(a => `<option value="${esc(a)}">${esc(accName(a))}${accName(a) !== a ? " · " + esc(a.slice(-4)) : ""}</option>`).join("")}</select>
        <select class="field" id="range" aria-label="Zeitraum">${opts(Object.entries(ranges), "all")}</select>
        <select class="field" id="sonder" aria-label="Sonderausgaben">${opts([["all", "mit Sonderausgaben"], ["false", "ohne Sonderausgaben"], ["true", "nur Sonderausgaben"]], "all")}</select>
        <select class="field" id="sort" aria-label="Sortierung">${opts([["date_desc", "Neueste zuerst"], ["date_asc", "Älteste zuerst"], ["amount_asc", "Größte Ausgaben zuerst"], ["amount_desc", "Größte Eingänge zuerst"], ["amount_abs_desc", "Größter Betrag zuerst"]], "date_desc")}</select>
        <span class="range-in"><input class="field" id="amin" type="number" min="0" step="1" placeholder="Betrag von" aria-label="Betrag von, ohne Vorzeichen"><input class="field" id="amax" type="number" min="0" step="1" placeholder="bis" aria-label="Betrag bis"><i>€</i></span>
        <a class="btn" href="/api/transactions/export" download>CSV</a>
      </div>
      <div class="bulk" id="bulk" hidden>
        <b id="bulk-n"></b>
        <select class="field" id="bulk-cat" aria-label="Kategorie für Auswahl"><option value="">Kategorie setzen …</option>${opts(allCats)}</select>
        <button class="btn" type="button" data-bulk="sonder1">Sonderausgabe</button>
        <button class="btn" type="button" data-bulk="sonder0">Keine Sonderausgabe</button>
        <button class="btn" type="button" data-bulk="delete">Löschen</button>
        <button class="link" type="button" data-bulk="none">Auswahl aufheben</button>
      </div>
      <table><thead><tr><th style="width:28px"><input type="checkbox" id="all" aria-label="Alle sichtbaren auswählen"></th><th>Empfänger</th><th class="hide-s">Kategorie</th><th class="hide-s">Markierung</th><th class="n">Betrag</th></tr></thead><tbody id="tx"></tbody></table>
      <div style="margin-top:20px"><button class="btn" type="button" id="more" hidden>Weitere laden</button></div>
    </div>`;
  const rangeDates = r => {
    const now = new Date(), y = now.getFullYear(), m = now.getMonth();
    return { m0: [new Date(y, m, 1), now], m1: [new Date(y, m - 1, 1), new Date(y, m, 0)], m3: [new Date(y, m - 2, 1), now], y0: [new Date(y, 0, 1), now], y1: [new Date(y - 1, 0, 1), new Date(y - 1, 11, 31)] }[r] || [null, null];
  };
  const sel = new Set(), byId = new Map();
  let lastDay = "";
  const flag = (t, key, on, label, title) => `<button type="button" class="chip" data-flag="${key}" data-id="${esc(t.id)}" aria-pressed="${!!on}" title="${title}">${label}</button>`;
  const rows = items => items.map(t => {
    byId.set(t.id, t);
    let h = "";
    if (state.sort.startsWith("date") && t.date !== lastDay) { lastDay = t.date; h += `<tr class="day"><td colspan="5">${dLong(t.date)}</td></tr>`; }
    const sub = memo(t.description);
    return h + `<tr data-row="${esc(t.id)}" class="${sel.has(t.id) ? "picked" : ""}"><td><input type="checkbox" data-pick="${esc(t.id)}" ${sel.has(t.id) ? "checked" : ""} aria-label="Auswählen"></td>
      <td>${esc(payee(t.payee))}${sub ? `<span class="sub">${esc(sub)}</span>` : ""}<span class="sub">${state.sort.startsWith("date") ? "" : dLong(t.date) + " · "}${esc(accName(t.account))}${t.booking_date && t.booking_date.slice(0, 7) !== t.date.slice(0, 7) ? ` · zählt für ${ymName(t.date.slice(0, 7))}, gebucht ${dShort(t.booking_date)}` : ""}</span></td>
      <td class="hide-s">${t.is_transfer ? '<span class="dim">Umbuchung</span>' : `<select class="catsel" data-id="${esc(t.id)}" aria-label="Kategorie">${opts(allCats, t.category)}</select>`}</td>
      <td class="hide-s"><div class="chips">${flag(t, "sonder", t.is_sonderausgabe, "Sonder", "Sonderausgabe: zählt nicht zum normalen Monat")}${flag(t, "abo", t.is_abo, "Abo", "Als Abo führen")}${flag(t, "transfer", t.is_transfer, "Umbuchung", "Umbuchung zwischen eigenen Konten")}</div></td>
      <td class="n ${t.amount > 0 ? "pos" : ""}">${signed(t.amount, true)}</td></tr>`;
  }).join("");
  async function load(reset) {
    if (reset) { state.offset = 0; lastDay = ""; byId.clear(); }
    const [f, t] = rangeDates(state.range);
    const qs = new URLSearchParams({ search: state.search, kind: state.kind, account: state.account, category: state.category, sonderausgabe: state.sonder, limit: 100, offset: state.offset, sort: state.sort });
    if (state.min !== "") qs.set("amount_min", state.min);
    if (state.max !== "") qs.set("amount_max", state.max);
    if (f) { qs.set("date_from", isoDate(f)); qs.set("date_to", isoDate(t)); }
    const d = await api("/transactions?" + qs);
    const body = el.querySelector("#tx");
    if (reset) body.innerHTML = "";
    body.insertAdjacentHTML("beforeend", d.items.length ? rows(d.items) : (reset ? `<tr><td colspan="5" class="empty">Keine Buchung passt. <button class="link" type="button" id="reset">Filter zurücksetzen</button></td></tr>` : ""));
    state.offset += d.items.length;
    el.querySelector("#more").hidden = state.offset >= d.total;
    el.querySelector("#tx-strip").style.setProperty("--n", 4);
    el.querySelector("#tx-strip").innerHTML = `<div><div class="l">Treffer</div><div class="v">${num(d.total)}</div></div>
      <div><div class="l">Eingänge</div><div class="v">${eur(d.sums.sum_in)}</div></div><div><div class="l">Ausgänge</div><div class="v">${eur(d.sums.sum_out)}</div></div>
      <div><div class="l">Saldo</div><div class="v ${d.sums.sum_in + d.sums.sum_out < 0 ? "neg" : ""}">${signed(d.sums.sum_in + d.sums.sum_out)}</div></div>`;
    const rs = el.querySelector("#reset");
    if (rs) rs.onclick = () => { Object.assign(state, { search: "", kind: "all", account: "all", category: "all", sonder: "all", range: "all", sort: "date_desc", min: "", max: "" });
      ["#q", "#amin", "#amax"].forEach(s => el.querySelector(s).value = ""); ["#acc", "#cat", "#range", "#sonder"].forEach(s => el.querySelector(s).value = "all"); el.querySelector("#sort").value = "date_desc"; setKind(); load(true); };
  }
  const setKind = () => el.querySelectorAll("[data-kind]").forEach(b => b.setAttribute("aria-pressed", b.dataset.kind === state.kind));
  const drawBulk = () => { const b = el.querySelector("#bulk"); b.hidden = !sel.size; el.querySelector("#bulk-n").textContent = `${sel.size} ausgewählt`; };
  let deb;
  el.querySelector("#q").oninput = e => { clearTimeout(deb); deb = setTimeout(() => { state.search = e.target.value.trim(); load(true); }, 250); };
  el.querySelectorAll("[data-kind]").forEach(b => b.onclick = () => { state.kind = b.dataset.kind; setKind(); load(true); });
  [["#acc", "account"], ["#cat", "category"], ["#range", "range"], ["#sonder", "sonder"], ["#sort", "sort"]].forEach(([s, k]) => el.querySelector(s).onchange = e => { state[k] = e.target.value; load(true); });
  // Wert sofort übernehmen, nur das Laden verzögern. Sonst geht bei schnellem Tippen in beiden Feldern der erste Wert verloren.
  let deb2; [["#amin", "min"], ["#amax", "max"]].forEach(([s, k]) => el.querySelector(s).oninput = e => { state[k] = e.target.value.trim(); clearTimeout(deb2); deb2 = setTimeout(() => load(true), 350); });
  el.querySelector("#more").onclick = () => load(false);
  el.querySelector("#all").onchange = e => { el.querySelectorAll("[data-pick]").forEach(c => { c.checked = e.target.checked; c.closest("tr").classList.toggle("picked", c.checked); e.target.checked ? sel.add(c.dataset.pick) : sel.delete(c.dataset.pick); }); drawBulk(); };
  const tb = el.querySelector("#tx");
  tb.addEventListener("change", async e => {
    const pick = e.target.closest("[data-pick]");
    if (pick) { pick.checked ? sel.add(pick.dataset.pick) : sel.delete(pick.dataset.pick); pick.closest("tr").classList.toggle("picked", pick.checked); return drawBulk(); }
    const s = e.target.closest(".catsel"); if (!s) return;
    await act(() => send(`/transactions/${encodeURIComponent(s.dataset.id)}/category`, "PUT", { category: s.value }), `Kategorie: ${s.value}`);
  });
  tb.addEventListener("click", async e => {
    const c = e.target.closest("[data-flag]"); if (!c) return;
    const on = c.getAttribute("aria-pressed") !== "true", id = encodeURIComponent(c.dataset.id);
    const call = { sonder: () => send(`/transactions/${id}/sonderausgabe`, "PUT", { is_sonderausgabe: on }), abo: () => send(`/transactions/${id}/abo`, "PUT", { is_abo: on }),
      transfer: () => send(`/transactions/${id}/transfer`, "PUT", { is_transfer: on }) }[c.dataset.flag];
    await act(call, { sonder: on ? "Als Sonderausgabe markiert" : "Keine Sonderausgabe mehr", abo: on ? "Als Abo markiert" : "Kein Abo mehr", transfer: on ? "Als Umbuchung markiert" : "Keine Umbuchung mehr" }[c.dataset.flag]);
    c.setAttribute("aria-pressed", on);
    if (c.dataset.flag === "transfer") load(true);
  });
  el.querySelector("#bulk-cat").onchange = async e => {
    if (!e.target.value) return;
    await act(() => send("/transactions/bulk", "PUT", { tx_hashes: [...sel], category: e.target.value }), `${sel.size} Buchungen: ${e.target.value}`);
    sel.clear(); drawBulk(); load(true);
  };
  el.querySelectorAll("[data-bulk]").forEach(b => b.onclick = async () => {
    const a = b.dataset.bulk;
    if (a === "none") { sel.clear(); el.querySelectorAll("[data-pick]").forEach(c => { c.checked = false; c.closest("tr").classList.remove("picked"); }); el.querySelector("#all").checked = false; return drawBulk(); }
    if (a === "delete") {
      if (!confirm(`${sel.size} Buchungen endgültig löschen? Das lässt sich nur über ein Backup rückgängig machen.`)) return;
      await act(() => api("/transactions/bulk", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tx_hashes: [...sel] }) }), `${sel.size} gelöscht`);
    } else {
      await act(() => send("/transactions/bulk", "PUT", { tx_hashes: [...sel], is_sonderausgabe: a === "sonder1" }), "Gespeichert");
    }
    sel.clear(); drawBulk(); load(true);
  });
  await load(true);
};

// ═══ Vermögen ═══════════════════════════════════════════════════════════════
P.vermoegen = async (el, arg) => {
  const months = ["12", "36", "60", "240"].includes(arg) ? arg : "36";
  const [h, ct] = await Promise.all([api("/networth/history?months=" + months), api("/contracts")]);
  const c = h.current, s = h.series || [];
  const first = s[0], last = s[s.length - 1];
  const gain = last && first ? last.total - first.total : 0, market = last ? last.total - last.without_market : 0;
  el.innerHTML = stage({ ...bigEur(c.total), text: first ? `Vermögen heute. Seit ${ymName(first.month)} ${signed(gain)}, davon ${eur(market)} Kursgewinne.` : "Vermögen heute.",
      side: pct(c.total ? (c.depot + c.crypto) / c.total * 100 : 0, 0), sideNote: "in Wertpapieren und Krypto" }) +
    strip([{ l: "Konten", v: eur(c.liquid) }, { l: "Broker-Guthaben", v: eur(c.broker_cash) }, { l: "Depot", v: eur(c.depot), s: c.depot_as_of ? "Auszug " + dShort(c.depot_as_of) : "" },
      { l: "Krypto", v: eur(c.crypto) }, { l: "Verträge", v: eur(c.contracts) }]) +
    `<div class="wrap content">` +
    sec("Verlauf", lineChart({ labels: s.map(r => MON_S[+r.month.slice(5) - 1].slice(0, 3) + " " + r.month.slice(2, 4)), every: Math.max(1, Math.ceil(s.length / 8)), lines: [{ v: s.map(r => r.without_market), c: "var(--ink-3)", dash: 1, w: 2 }, { v: s.map(r => r.total), c: "var(--stage)", w: 4 }],
      ticks: [0, 50000, 100000, 150000, 200000].filter(v => v <= Math.max(...s.map(r => r.total)) * 1.05), tickFmt: v => v / 1000 + "k", label: "Vermögensverlauf" }) +
      `<div class="legend"><span style="--k:var(--stage)">Vermögen</span><span style="--k:var(--ink-3)">ohne Kursgewinne (Konten plus Einstand)</span></div>
       ${h.note ? `<p class="body" style="font-size:13px;margin-top:8px">${esc(h.note)}</p>` : ""}`,
      `<span class="seg seg-s" role="group" aria-label="Zeitraum">${[["12", "1 J."], ["36", "3 J."], ["60", "5 J."], ["240", "Alles"]].map(([v, l]) => `<a href="#/vermoegen/${v}" aria-pressed="${v === months}">${l}</a>`).join("")}</span>`) +
    `<div class="grid even" style="margin-top:52px">` +
    sec("Konten", `<table><tbody>${(c.accounts || []).map(a => { const kr = /kraken/i.test(a.name) && Math.abs(a.balance) < 1 && c.crypto;
        const sub = [a.type && a.type !== a.name ? esc(a.type) : "", kr ? `Bestand als Krypto: ${eur(c.crypto)}` : "", a.calibrated === false ? '<span class="warn">Saldo nicht abgeglichen</span>' : ""].filter(Boolean).join(" · ");
        return `<tr><td>${esc(a.name)}${sub ? `<span class="sub">${sub}</span>` : ""}</td><td class="n">${eur(a.balance)}</td></tr>`; }).join("")}</tbody>
      <tfoot><tr><td>Summe</td><td class="n">${eur((c.accounts || []).reduce((x, a) => x + a.balance, 0))}</td></tr></tfoot></table>
      <p class="body" style="margin-top:12px;font-size:13px">Namen und Salden-Abgleich unter <a href="#/einstellungen">Einstellungen</a>.</p>`) +
    sec("Verträge", `<table><tbody>${(ct.contracts || []).map(k => `<tr><td>${esc(k.name)}<span class="sub">${esc(k.source || "")}${k.monthly ? " · " + eur(k.monthly, true) + "/Monat" : ""}</span>
        <span class="sub">${k.value_date ? `Angabe ${eur(k.value)} vom ${dLong(k.value_date)}` : `eingezahlt ${eur(k.paid)}, kein Rückkaufwert eingetragen`}</span></td>
        <td class="n">${eur(k.current_value ?? k.value)}<span class="sub"><button class="link" type="button" data-ct="${esc(k.id)}" data-name="${esc(k.name)}" data-v="${k.value_date ? Math.round(k.value) : ""}">${k.value_date ? "Wert ändern" : "Wert eintragen"}</button></span></td></tr>`).join("")}</tbody></table>
      <p class="body" style="margin-top:12px;font-size:13px">Den Rückkaufwert findest du in der jährlichen Standmitteilung. Beiträge danach rechnet Kapital selbst dazu.</p>`) + `</div></div>`;
  el.querySelectorAll("[data-ct]").forEach(b => b.onclick = async () => {
    const v = prompt(`Rückkaufwert ${b.dataset.name} in €.\nLeer = Angabe löschen (dann zählen die Einzahlungen).`, b.dataset.v);
    if (v === null) return;
    const val = v.trim() === "" ? null : parseFloat(v.replace(/\./g, "").replace(",", "."));
    if (val !== null && isNaN(val)) return toast("Bitte einen Betrag eingeben", true);
    let date = null;
    if (val !== null) { date = prompt("Stand vom (JJJJ-MM-TT):", isoDate(new Date())); if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return toast("Datum bitte als JJJJ-MM-TT", true); }
    await act(() => send(`/contracts/${encodeURIComponent(b.dataset.ct)}`, "PUT", { value: val, value_date: date }), "Vertrag gespeichert"); route();
  });
};

// ═══ Portfolio ══════════════════════════════════════════════════════════════
const PF_TABS = [["entwicklung", "Entwicklung"], ["positionen", "Positionen"], ["realisiert", "Realisiert"], ["analyse", "Analyse"], ["trades", "Trades"], ["dividenden", "Dividenden"], ["krypto", "Krypto"]];
const plc = v => v == null ? "" : v > 0 ? "pos" : v < 0 ? "neg" : "";
const sgnPct = (v, d = 1) => v == null ? "–" : (v > 0 ? "+" : "") + pct(v, d);
const units = n => n == null ? "–" : n.toLocaleString("de-DE", { maximumFractionDigits: n < 1 ? 6 : n < 100 ? 4 : 2 });

P.portfolio = async (el, arg) => {
  const tab = PF_TABS.some(t => t[0] === arg) ? arg : "entwicklung";
  const [p, perf] = await Promise.all([api("/portfolio"), api("/portfolio/performance").catch(() => null)]);
  const s = p.summary, a = p.allocation, K = perf?.kpis;
  const nameOf = Object.fromEntries([...(p.trades || []), ...(p.sold || []), ...(p.positions || [])].map(x => [x.isin, secName(x.name)]));
  el.innerHTML = stage({ ...bigEur(s.total_value), text: `Depotwert bei ${s.n_positions} Positionen. Einstand ${eur(s.total_cost)}.`, side: sgnPct(s.total_pl_pct), sideNote: `${signed(s.total_pl)} Kursgewinn` }) +
    strip([{ l: "Rendite p. a.", v: K ? pct(K.xirr) : "–", s: K ? `${perf.benchmark.label} ${pct(K.xirr_benchmark)} · real ${pct(K.real_xirr)}` : "", flag: K && K.xirr < K.xirr_benchmark },
      { l: "Realisiert", v: signed(s.total_realized_gain), s: `${s.n_sold} verkaufte Positionen` },
      { l: "ETF-Anteil", v: pct(a.etf_pct, 0), s: `größte drei ${pct(a.top3_pct, 0)}` }, { l: "Freies Guthaben", v: eur(s.tr_cash), s: "bei Trade Republic, nicht investiert" }]) +
    `<div class="wrap"><nav class="tabs" aria-label="Portfolio">${PF_TABS.map(([k, l]) => `<a href="#/portfolio/${k}" ${k === tab ? 'aria-current="page"' : ""}>${l}</a>`).join("")}</nav></div>
    <div class="wrap content" id="pf"></div>`;
  const box = el.querySelector("#pf");
  await PF[tab](box, { p, perf, nameOf });
};

const PF = {};

PF.entwicklung = async (box, { perf }) => {
  const draw = d => {
    if (!d || !d.months?.length) { box.innerHTML = `<p class="empty">Für die Entwicklung fehlen Kursdaten.</p>`; return; }
    const k = d.kpis, bl = d.benchmark.label, M = d.months;
    const top = Math.max(...M.map(m => Math.max(m.value, m.benchmark || 0, m.inflation_line || 0)));
    box.innerHTML = sec("Depot gegen " + esc(bl), `<div class="tools"><div class="seg" role="group" aria-label="Vergleich">${(d.benchmarks || []).map(b => `<button type="button" data-bench="${esc(b.key)}" aria-pressed="${b.key === d.benchmark.key}">${esc(b.label)}</button>`).join("")}</div></div>` +
      lineChart({ labels: M.map(m => m.month.slice(2).replace("-", "/")), every: 12,
        lines: [{ v: M.map(m => m.invested), c: "var(--ink-3)", dash: 1, w: 2 }, { v: M.map(m => m.inflation_line), c: "var(--flag)", w: 2 }, { v: M.map(m => m.benchmark), c: "var(--over)", w: 2 }, { v: M.map(m => m.value), c: "var(--stage)", w: 4 }],
        ticks: [0, 10000, 20000, 30000, 40000, 50000].filter(v => v <= top * 1.05), tickFmt: v => v / 1000 + "k", label: "Depot gegen Vergleich" }) +
      `<div class="legend"><span style="--k:var(--stage)">Depot</span><span style="--k:var(--over)">gleiche Einzahlungen in ${esc(bl)}</span><span style="--k:var(--flag)">Kaufkraft erhalten</span><span style="--k:var(--ink-3)">eingezahlt</span></div>
       <p class="body" style="margin-top:12px;font-size:13px">${esc(d.benchmark.desc || "")}. Renditen geldgewichtet (XIRR). Nur das Depot, ohne freies Guthaben und Krypto.</p>`, `seit ${ymName(M[0].month)}`) +
      `<div class="grid even" style="margin-top:44px">` +
      sec("Kennzahlen", `<table><tbody>
        <tr><td>Depotwert</td><td class="n">${eur(k.value)}</td></tr>
        <tr><td>Eingezahlt<span class="sub">Käufe minus Verkäufe</span></td><td class="n">${eur(k.invested)}</td></tr>
        <tr><td>Dividenden</td><td class="n">${eur(k.dividends)}</td></tr>
        <tr><td>Gewinn<span class="sub">einfach ${sgnPct(k.simple_return)}</span></td><td class="n ${plc(k.gain)}">${signed(k.gain)}</td></tr>
        <tr><td>Rendite p. a.</td><td class="n">${pct(k.xirr)}</td></tr>
        <tr><td>${esc(bl)} mit gleichen Einzahlungen<span class="sub">${pct(k.xirr_benchmark)} p. a.</span></td><td class="n">${eur(k.benchmark_value)}<span class="sub ${plc(-k.vs_benchmark)}">${signed(-k.vs_benchmark)} für dich</span></td></tr>
        <tr><td>Kaufkraft erhalten<span class="sub">Inflation ${pct(k.inflation_cum)} seit ${esc(k.cpi_first_month || "")}, zuletzt ${pct(k.inflation_12m)} im Jahr</span></td><td class="n">${eur(k.inflation_value)}<span class="sub ${plc(k.vs_inflation)}">${signed(k.vs_inflation)} real</span></td></tr>
        <tr><td>Rendite nach Inflation</td><td class="n">${pct(k.real_xirr)} p. a.</td></tr>
      </tbody></table>${(d.warnings || []).length ? `<p class="body warn" style="margin-top:12px">${d.warnings.map(esc).join(" · ")}</p>` : ""}`) +
      sec("Einordnung", (d.insights || []).length ? `<ul class="plain">${d.insights.map(i => `<li class="${i.tone === "neg" ? "neg-i" : i.tone === "pos" ? "pos-i" : ""}"><b>${esc(i.title)}</b><span>${esc(i.text)}</span></li>`).join("")}</ul>` : `<p class="empty">Keine Hinweise.</p>`) + `</div>`;
    box.querySelectorAll("[data-bench]").forEach(b => b.onclick = async () => {
      b.textContent = "…"; draw(await act(() => api("/portfolio/performance?benchmark=" + encodeURIComponent(b.dataset.bench))));
    });
  };
  draw(perf);
};

PF.positionen = async (box, { p }) => {
  const pos = (p.positions || []).slice().sort((x, y) => (y.value || 0) - (x.value || 0)), tot = p.summary.total_value || 1;
  const unpriced = pos.filter(r => r.current_price == null);
  box.innerHTML = sec("Positionen", `<table><thead><tr><th>Name</th><th class="n hide-s">Stück</th><th class="n hide-s">Ø Kauf · Kurs</th><th class="n">Wert</th><th class="n">Gewinn</th><th class="n hide-s">p. a.</th></tr></thead><tbody>` +
    pos.map(r => `<tr><td>${esc(secName(r.name))}<span class="sub">${r.is_etf ? "ETF" : "Aktie"} · ${esc(r.isin)} · ${r.n_buys} Käufe${r.n_sells ? `, ${r.n_sells} Verkäufe` : ""}</span>
        <span class="share" style="margin-top:6px"><i style="width:${(r.value || 0) / tot * 100}%"></i></span><span class="sub" style="display:inline">${pct((r.value || 0) / tot * 100, 1)}</span></td>
      <td class="n hide-s">${units(r.qty)}</td><td class="n hide-s">${eur(r.avg_price, true)}<span class="sub">${r.current_price != null ? eur(r.current_price, true) : "kein Kurs"}</span></td>
      <td class="n">${eur(r.value)}<span class="sub">Einstand ${eur(r.cost)}</span></td>
      <td class="n ${plc(r.pl)}">${r.pl == null ? "–" : signed(r.pl)}<span class="sub ${plc(r.pl_pct)}">${sgnPct(r.pl_pct)}</span></td>
      <td class="n hide-s">${r.xirr == null ? "–" : pct(r.xirr)}</td></tr>`).join("") +
    `</tbody><tfoot><tr><td>Summe</td><td class="hide-s"></td><td class="hide-s"></td><td class="n">${eur(p.summary.total_value)}<span class="sub">Einstand ${eur(p.summary.total_cost)}</span></td><td class="n ${plc(p.summary.total_pl)}">${signed(p.summary.total_pl)}<span class="sub">${sgnPct(p.summary.total_pl_pct)}</span></td><td class="hide-s"></td></tr></tfoot></table>
    ${unpriced.length ? `<p class="body" style="margin-top:12px;font-size:13px">Ohne aktuellen Kurs: ${unpriced.map(r => esc(secName(r.name))).join(", ")}. Ein Ticker lässt sich unter <code>data/isin_tickers.json</code> zuordnen.</p>` : ""}`, `${pos.length} Positionen`);
};

PF.realisiert = async (box, { p }) => {
  const S = (p.sold || []).slice().sort((x, y) => (y.date || "").localeCompare(x.date || ""));
  if (!S.length) { box.innerHTML = `<p class="empty">Noch keine Position vollständig verkauft.</p>`; return; }
  const win = S.filter(r => r.realized_gain > 0), loss = S.filter(r => r.realized_gain < 0);
  box.innerHTML = `<div class="grid"><div>` + sec("Verkaufte Positionen", `<table><thead><tr><th>Name</th><th class="n hide-s">Investiert</th><th class="n hide-s">Erlös</th><th class="n">Ergebnis</th></tr></thead><tbody>` +
    S.map(r => `<tr><td>${esc(secName(r.name))}<span class="sub">${r.date ? dLong(r.date) : ""}${r.closed_by_corp_action ? " · durch Kapitalmaßnahme" : ""} · ${r.n_buys} Käufe, ${r.n_sells} Verkäufe</span></td>
      <td class="n hide-s">${eur(r.total_invested)}</td><td class="n hide-s">${eur(r.total_proceeds)}</td><td class="n ${plc(r.realized_gain)}">${signed(r.realized_gain)}</td></tr>`).join("") +
    `</tbody><tfoot><tr><td>Summe</td><td class="n hide-s">${eur(S.reduce((x, r) => x + r.total_invested, 0))}</td><td class="n hide-s">${eur(S.reduce((x, r) => x + r.total_proceeds, 0))}</td><td class="n ${plc(p.summary.total_realized_gain)}">${signed(p.summary.total_realized_gain)}</td></tr></tfoot></table>`, `${S.length} Positionen`) +
    `</div><div>` + sec("Bilanz", `<table><tbody>
      <tr><td>Mit Gewinn verkauft<span class="sub">${win.length} Positionen</span></td><td class="n pos">${signed(win.reduce((x, r) => x + r.realized_gain, 0))}</td></tr>
      <tr><td>Mit Verlust verkauft<span class="sub">${loss.length} Positionen</span></td><td class="n neg">${signed(loss.reduce((x, r) => x + r.realized_gain, 0))}</td></tr>
      <tr><td>Größter Gewinn<span class="sub">${win.length ? esc(secName(win.slice().sort((x, y) => y.realized_gain - x.realized_gain)[0].name)) : "–"}</span></td><td class="n">${win.length ? signed(Math.max(...win.map(r => r.realized_gain))) : "–"}</td></tr>
      <tr><td>Größter Verlust<span class="sub">${loss.length ? esc(secName(loss.slice().sort((x, y) => x.realized_gain - y.realized_gain)[0].name)) : "–"}</span></td><td class="n">${loss.length ? signed(Math.min(...loss.map(r => r.realized_gain))) : "–"}</td></tr>
    </tbody></table><p class="body" style="margin-top:12px;font-size:13px">Steuerlich zählen realisierte Gewinne zu den Kapitalerträgen, siehe <a href="#/steuer">Steuer</a>.</p>`) + `</div></div>`;
};

PF.analyse = async (box, { p }) => {
  const pos = p.positions || [], inc = p.income || {}, a = p.allocation;
  const ranked = pos.filter(r => r.xirr != null).sort((x, y) => y.xirr - x.xirr);
  const weak = pos.filter(r => r.pl_pct != null && r.pl_pct < -10).sort((x, y) => x.pl_pct - y.pl_pct);
  const bar = (label, val, share, color) => `<tr><td>${label}<div class="meter"><i style="width:${share || 0}%;background:${color}"></i></div></td><td class="n">${eur(val)}<span class="sub">${pct(share, 1)}</span></td></tr>`;
  box.innerHTML = strip([{ l: "Zinsen", v: eur(inc.interest || 0) }, { l: "Dividenden", v: eur(inc.dividends || 0) }, { l: "Cashback & Prämien", v: eur(inc.cashback || 0) }, { l: "Sonstiges", v: eur(inc.other || 0) }]).replace('class="strip"', 'class="strip boxed"') +
    `<div class="grid even" style="margin-top:44px"><div>` +
    sec("Aufteilung", `<table><tbody>${bar("ETFs", a.etf_value, a.etf_pct, "var(--stage)")}${bar("Einzelaktien", a.stock_value, a.stock_pct, "var(--over)")}</tbody></table>
      <p class="body" style="margin-top:12px">Die drei größten Positionen machen <b>${pct(a.top3_pct, 0)}</b> des Depots aus.${a.top3_pct > 60 ? ` <span class="warn">Das ist viel, außer es sind breite Welt-ETFs.</span>` : ""}</p>`) +
    (weak.length ? sec("Mehr als 10 % im Minus", `<table><tbody>${weak.map(r => `<tr><td>${esc(secName(r.name))}<span class="sub">${esc(r.isin)} · Einstand ${eur(r.cost)}</span></td><td class="n neg">${signed(r.pl)}<span class="sub neg">${sgnPct(r.pl_pct)}</span></td></tr>`).join("")}</tbody></table>`, `${weak.length} Positionen`) : "") +
    `</div><div>` +
    sec("Rendite p. a. je Position", `<table><tbody>${ranked.map(r => `<tr><td>${esc(secName(r.name))}<span class="share" style="margin-top:6px;width:100%"><i style="width:${Math.min(100, Math.abs(r.xirr) / Math.max(...ranked.map(x => Math.abs(x.xirr))) * 100)}%;background:${r.xirr < 0 ? "var(--over)" : "var(--ink)"}"></i></span></td><td class="n ${plc(r.xirr)}">${sgnPct(r.xirr)}</td></tr>`).join("")}</tbody></table>
      ${pos.length > ranked.length ? `<p class="body" style="margin-top:12px;font-size:13px">${pos.length - ranked.length} Positionen ohne Kurs, dort lässt sich keine Rendite berechnen.</p>` : ""}`, "geldgewichtet") + `</div></div>`;
};

PF.trades = async (box, { p, nameOf }) => {
  const T = (p.trades || []).slice().sort((x, y) => y.date.localeCompare(x.date));
  const state = { side: "all", q: "" };
  box.innerHTML = `<div class="tools"><input class="field grow" type="search" id="tq" placeholder="Name oder ISIN" aria-label="Trades durchsuchen">
    <div class="seg" role="group" aria-label="Art">${[["all", "Alle"], ["buy", "Käufe"], ["sell", "Verkäufe"]].map(([k, l]) => `<button type="button" data-side="${k}" aria-pressed="${k === "all"}">${l}</button>`).join("")}</div></div>
    <div class="sums" id="tsum"></div><table><thead><tr><th>Datum</th><th>Name</th><th class="n hide-s">Stück</th><th class="n hide-s">Kurs</th><th class="n">Betrag</th></tr></thead><tbody id="tl"></tbody></table>`;
  const draw = () => {
    const q = state.q.toLowerCase();
    const rows = T.filter(t => (state.side === "all" || new RegExp(state.side, "i").test(t.action)) && (!q || ((nameOf[t.isin] || t.name) + " " + t.isin).toLowerCase().includes(q)));
    const buy = rows.filter(t => /buy/i.test(t.action)).reduce((x, t) => x + t.amount, 0), sell = rows.filter(t => /sell/i.test(t.action)).reduce((x, t) => x + t.amount, 0);
    box.querySelector("#tsum").innerHTML = `<span><b>${rows.length}</b> Trades</span><span>gekauft <b>${eur(Math.abs(buy))}</b></span><span>verkauft <b>${eur(sell)}</b></span>`;
    let lastY = "";
    box.querySelector("#tl").innerHTML = rows.map(t => { const y = t.date.slice(0, 4); const h = y !== lastY ? (lastY = y, `<tr class="day"><td colspan="5">${y}</td></tr>`) : "";
      return h + `<tr><td style="width:100px">${dShort(t.date)}</td><td>${esc(nameOf[t.isin] || secName(t.name))}<span class="sub">${/buy/i.test(t.action) ? "Kauf" : "Verkauf"} · ${esc(t.isin)}</span></td>
        <td class="n hide-s">${units(t.qty)}</td><td class="n hide-s">${t.price ? eur(t.price, true) : "–"}</td><td class="n ${t.amount > 0 ? "pos" : ""}">${signed(t.amount, true)}</td></tr>`; }).join("") || `<tr><td colspan="5" class="empty">Kein Trade passt.</td></tr>`;
  };
  let deb; box.querySelector("#tq").oninput = e => { clearTimeout(deb); deb = setTimeout(() => { state.q = e.target.value.trim(); draw(); }, 200); };
  box.querySelectorAll("[data-side]").forEach(b => b.onclick = () => { state.side = b.dataset.side; box.querySelectorAll("[data-side]").forEach(x => x.setAttribute("aria-pressed", x === b)); draw(); });
  draw();
};

PF.dividenden = async (box, { p, nameOf }) => {
  const D = (p.dividends || []).slice().sort((x, y) => y.date.localeCompare(x.date));
  if (!D.length) { box.innerHTML = `<p class="empty">Noch keine Dividenden.</p>`; return; }
  const nm = d => d.type && d.type !== "DIVIDEND" ? payee(d.type) : (nameOf[d.isin] || d.isin);
  const byYear = {}, bySec = {};
  D.forEach(d => { const y = d.date.slice(0, 4); byYear[y] = (byYear[y] || 0) + d.amount; const k = nm(d); (bySec[k] = bySec[k] || { n: 0, s: 0, last: d.date }).n++; bySec[k].s += d.amount; });
  const years = Object.keys(byYear).sort();
  const total = D.reduce((x, d) => x + d.amount, 0);
  box.innerHTML = `<div class="grid"><div>` +
    sec("Pro Jahr", cols(years.map(y => byYear[y]), years, { now: years.length - 1 }) + `<table><tbody>${years.slice().reverse().map(y => `<tr><td>${y}</td><td class="n">${eur(byYear[y], true)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td>Summe<span class="sub">${D.length} Ausschüttungen</span></td><td class="n">${eur(total, true)}</td></tr></tfoot></table>`) +
    sec("Alle Ausschüttungen", `<table><tbody>${D.map(d => `<tr><td style="width:110px">${dLong(d.date).replace(/ \d{4}$/, "")}<span class="sub">${d.date.slice(0, 4)}</span></td><td>${esc(nm(d))}<span class="sub">${esc(d.isin)}</span></td><td class="n pos">${signed(d.amount, true)}</td></tr>`).join("")}</tbody></table>`) +
    `</div><div>` +
    sec("Nach Wertpapier", `<table><tbody>${Object.entries(bySec).sort((x, y) => y[1].s - x[1].s).map(([k, v]) => `<tr><td>${esc(k)}<span class="sub">${v.n} Zahlungen · zuletzt ${dLong(v.last)}</span></td><td class="n">${eur(v.s, true)}</td></tr>`).join("")}</tbody></table>`, "seit Beginn") + `</div></div>`;
};

PF.krypto = async box => {
  const cr = await api("/portfolio/crypto");
  if (!cr.positions?.length) { box.innerHTML = `<p class="empty">Keine Krypto-Bestände.</p>`; return; }
  const s = cr.summary;
  const lots = cr.positions.flatMap(c => (c.pending_lots || []).map(l => ({ ...l, symbol: c.symbol, value: c.price ? l.units * c.price : null }))).sort((x, y) => x.date.localeCompare(y.date));
  box.innerHTML = strip([{ l: "Wert", v: eur(s.value) }, { l: "Eingezahlt", v: eur(s.deposited), s: `davon ${eur(s.fees_deposit)} Gebühren` },
      { l: "Gegen Einzahlung", v: signed(s.vs_deposited), cls: plc(s.vs_deposited), s: s.deposited ? sgnPct(s.vs_deposited / s.deposited * 100) : "" }, { l: "Cash bei Kraken", v: eur(s.cash) }]).replace('class="strip"', 'class="strip boxed"') +
    `<div class="grid" style="margin-top:44px"><div>` +
    sec("Bestände", `<table><thead><tr><th>Coin</th><th class="n hide-s">Menge · Kurs</th><th class="n hide-s">Einstand</th><th class="n">Wert</th><th class="n">Steuerfrei</th></tr></thead><tbody>${cr.positions.map(c => `<tr>
        <td>${esc(c.name || c.symbol)}<span class="sub">${esc(c.symbol)}${c.is_stable ? " · Stablecoin (1 USD)" : ""}${c.cost === 0 ? " · geschenkt oder Bonus" : ""}</span></td>
        <td class="n hide-s">${units(c.units)}<span class="sub">${c.price != null ? eur(c.price, true) : "kein Kurs"}</span></td><td class="n hide-s">${eur(c.cost)}</td>
        <td class="n">${c.value != null ? eur(c.value) : "–"}<span class="sub ${plc(c.pl)}">${signed(c.pl)} · ${sgnPct(c.pl_pct)}</span></td>
        <td class="n ${c.tax_free_share >= 99.9 ? "pos" : ""}">${pct(c.tax_free_share, 0)}</td></tr>`).join("")}</tbody></table>
      <p class="body" style="margin-top:12px;font-size:13px">Krypto ist nach einem Jahr Haltedauer steuerfrei. Kapital rechnet nach FIFO: Was zuerst gekauft wurde, gilt als zuerst verkauft.</p>`) +
    `</div><div>` +
    sec("Wann wird was steuerfrei", lots.length ? (() => {
      // Staking-Erträge kommen wöchentlich in winzigen Mengen. Einzeln gelistet verdecken sie die echten Käufe.
      const small = lots.filter(l => !l.cost && (l.value || 0) < 1), big = lots.filter(l => !small.includes(l));
      const bySym = {}; small.forEach(l => { const g = bySym[l.symbol] = bySym[l.symbol] || { n: 0, u: 0, v: 0, first: l.date, last: l.date }; g.n++; g.u += l.units; g.v += l.value || 0; g.last = l.date; });
      return `<table><tbody>${big.map(l => `<tr><td>${dLong(l.date)}<span class="sub">${units(l.units)} ${esc(l.symbol)} · gekauft für ${eur(l.cost)}</span></td><td class="n">${l.value != null ? eur(l.value) : "–"}</td></tr>`).join("")}
        ${Object.entries(bySym).map(([k, g]) => `<tr><td>${g.n > 1 ? `${dLong(g.first)} bis ${dLong(g.last)}` : dLong(g.first)}<span class="sub">${g.n > 1 ? `${g.n} kleine ${esc(k)}-Erträge` : `ein kleiner ${esc(k)}-Ertrag`} (Staking), zusammen ${units(g.u)} ${esc(k)}</span></td><td class="n">${eur(g.v, true)}</td></tr>`).join("")}</tbody></table>`;
    })() : `<p class="empty">Alle gekauften Bestände sind bereits steuerfrei.</p>`, "nach einem Jahr Haltedauer") + `</div></div>`;
};

// ═══ Abos ═══════════════════════════════════════════════════════════════════
P.abos = async el => {
  const [a, cats] = await Promise.all([api("/abos"), catNames()]);
  const S = (a.subscriptions || []).slice().sort((x, y) => y.monthly_cost - x.monthly_cost);
  const yearly = S.reduce((x, r) => x + r.annual_cost, 0), changed = S.filter(r => Math.abs(r.change_pct || 0) >= 5);
  const nextUp = S.filter(r => r.next_expected).sort((x, y) => x.next_expected.localeCompare(y.next_expected))[0];
  const INT = [["weekly", "wöchentlich"], ["monthly", "monatlich"], ["bimonthly", "alle 2 Monate"], ["quarterly", "vierteljährlich"], ["halfyearly", "halbjährlich"], ["yearly", "jährlich"]];
  el.innerHTML = stage({ ...bigEur(a.total_monthly), text: `zahlst du jeden Monat für ${S.length} wiederkehrende Posten.`, side: eur(yearly), sideNote: "im Jahr" }) +
    strip([{ l: "Preis gestiegen", v: String(changed.filter(r => r.change_pct > 0).length), s: changed.slice(0, 3).map(r => payee(r.payee)).join(", "), flag: changed.length > 0 },
      { l: "Nächste Abbuchung", v: nextUp ? dShort(nextUp.next_expected) : "–", s: nextUp ? `${payee(nextUp.payee)}, ${eur(nextUp.last_amount, true)}` : "" },
      { l: "Ausgeblendet", v: String((a.hidden || []).length), s: "keine echten Abos" }]) +
    `<div class="wrap content">` +
    sec("Alle Abos", `<table><thead><tr><th>Name</th><th class="hide-s">Rhythmus</th><th class="n">Monat</th><th class="n hide-s">Jahr</th><th class="n">Nächste</th><th></th></tr></thead><tbody>` +
      S.map(r => `<tr><td>${esc(payee(r.payee))}<span class="sub">${esc(r.category)}${r.manual ? " · von Hand" : ""}${r.forced ? " · von dir markiert" : ""}${Math.abs(r.change_pct || 0) >= 5 ? ` · <span class="warn">früher ${eur(r.first_amount, true)}, heute ${eur(r.last_amount, true)} (${r.change_pct > 0 ? "+" : ""}${pct(r.change_pct, 0)})</span>` : ""}</span></td>
        <td class="hide-s">${esc(r.frequency)}</td><td class="n">${eur(r.monthly_cost, true)}</td><td class="n hide-s">${eur(r.annual_cost)}</td><td class="n dim">${r.next_expected ? dShort(r.next_expected) : "–"}</td>
        <td class="n">${r.manual ? `<button class="link" type="button" data-del="${esc(r.id)}">Löschen</button>` : r.forced ? `<button class="link" type="button" data-unforce="${esc(r.key)}">Nicht mehr markieren</button>` : `<button class="link" type="button" data-hide="${esc(r.payee)}" title="Ist kein Abo, dauerhaft ausblenden">Kein Abo</button>`}</td></tr>`).join("") +
      `</tbody><tfoot><tr><td>Summe</td><td class="hide-s"></td><td class="n">${eur(a.total_monthly, true)}</td><td class="n hide-s">${eur(yearly)}</td><td></td><td></td></tr></tfoot></table>`, "nach Monatskosten") +
    `<div class="grid even" style="margin-top:52px">` +
    sec("Abo von Hand anlegen", `<form id="man" class="form">
        <label class="frm"><span>Name</span><span class="inp"><input class="field" name="payee" required placeholder="z. B. Zeitung"></span></label>
        <label class="frm"><span>Betrag</span><span class="inp"><input class="field" name="amount" type="number" step="0.01" min="0" required><i>€</i></span></label>
        <label class="frm"><span>Rhythmus</span><span class="inp"><select class="field" name="interval">${opts(INT, "monthly")}</select></span></label>
        <label class="frm"><span>Kategorie</span><span class="inp"><select class="field" name="category">${opts(cats, "Sonstiges")}</select></span></label>
        <div class="tools" style="margin-top:12px"><button class="btn black" type="submit">Anlegen</button></div></form>
      <p class="body" style="margin-top:12px;font-size:13px">Für Zahlungen, die Kapital nicht selbst erkennt, etwa bar oder über eine andere Bank. Eine einzelne Buchung lässt sich auch unter <a href="#/buchungen">Buchungen</a> als Abo markieren.</p>`) +
    sec("Ausgeblendet", (a.hidden || []).length ? `<table><tbody>${a.hidden.map(h => `<tr><td>${esc(payee(h.label))}</td><td class="n"><button class="link" type="button" data-unhide="${esc(h.key)}">Wieder zeigen</button></td></tr>`).join("")}</tbody></table>` : `<p class="empty">Nichts ausgeblendet.</p>`) +
    `</div></div>`;
  el.onclick = async e => {
    const h = e.target.closest("[data-hide]"), u = e.target.closest("[data-unhide]"), d = e.target.closest("[data-del]"), uf = e.target.closest("[data-unforce]");
    if (uf) { await act(() => send("/abos/unforce", "POST", { key: uf.dataset.unforce }), "Markierung entfernt"); route(); }
    if (h) { await act(() => send("/abos/hide", "POST", { label: h.dataset.hide }), `${payee(h.dataset.hide)} ausgeblendet`); route(); }
    if (u) { await act(() => send("/abos/unhide", "POST", { key: u.dataset.unhide }), "Wieder sichtbar"); route(); }
    if (d && confirm("Dieses Abo löschen?")) { await act(() => api(`/abos/manual/${encodeURIComponent(d.dataset.del)}`, { method: "DELETE" }), "Gelöscht"); route(); }
  };
  el.querySelector("#man").onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target);
    await act(() => send("/abos/manual", "POST", { payee: f.get("payee"), avg_amount: +f.get("amount"), interval: f.get("interval"), category: f.get("category") }), "Abo angelegt"); route();
  };
};

// ═══ Jahresübersicht ════════════════════════════════════════════════════════
P.jahr = async (el, arg) => {
  const st = Object.assign({ y: "", acc: "all", v: "jahre" }, Object.fromEntries(new URLSearchParams(arg || "")));
  const [j, dash] = await Promise.all([api("/jahresuebersicht?account=" + encodeURIComponent(st.acc)), api("/dashboard")]);
  const Y = (j.years || []).slice().sort((a, b) => b.year - a.year);
  if (!Y.length) { el.innerHTML = stage({ big: "0", unit: " Jahre", text: "Noch keine Buchungen. Importiere zuerst Kontoauszüge." }); return; }
  const cur = Y.find(y => String(y.year) === st.y) || Y[0];
  const go = patch => { const n = { ...st, ...patch }; location.hash = "#/jahr/" + new URLSearchParams(n); };
  const ms = (j.monthly || []).filter(m => m.ym.startsWith(String(cur.year)));
  const lastM = ms.length ? MON[+ms[ms.length - 1].ym.slice(5) - 1] : "";
  const years = Y.map(y => y.year).sort();
  const kicker = `<select aria-label="Jahr" id="ysel">${Y.map(y => `<option ${y.year === cur.year ? "selected" : ""}>${y.year}</option>`).join("")}</select>${st.acc !== "all" ? `<span class="tag">${esc(accLabel(st.acc))}</span>` : ""}`;
  const views = [["jahre", "Jahre"], ["monate", "Monatsverlauf"], ["kategorien", "Kategorien × Jahre"]];
  let body;
  if (st.v === "monate") {
    body = sec("Monate " + cur.year, flowChart(ms.map(m => ({ label: MON_S[+m.ym.slice(5) - 1].slice(0, 3), in: m.einnahmen, out: m.ausgaben, savings: m.ersparnis })), { label: "Monatsverlauf" }) +
      `<table style="margin-top:20px"><thead><tr><th>Monat</th><th class="n">Einnahmen</th><th class="n">Ausgaben</th><th class="n hide-s">Investiert</th><th class="n">Gespart</th><th class="n">Quote</th></tr></thead><tbody>${ms.slice().reverse().map(m => `<tr><td><a href="#/monat/${m.ym}">${MON[+m.ym.slice(5) - 1]}</a></td><td class="n">${eur(m.einnahmen)}</td><td class="n">${eur(m.ausgaben)}</td><td class="n hide-s">${eur(m.investiert)}</td><td class="n ${m.ersparnis < 0 ? "neg" : ""}">${eur(m.ersparnis)}</td><td class="n">${pct(m.sparrate)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td>${cur.year}</td><td class="n">${eur(cur.einnahmen)}</td><td class="n">${eur(cur.ausgaben)}</td><td class="n hide-s">${eur(cur.investiert)}</td><td class="n">${eur(cur.ersparnis)}</td><td class="n">${pct(cur.sparrate)}</td></tr></tfoot></table>`);
  } else if (st.v === "kategorien") {
    const cats = (j.categories || []).slice().sort((a, b) => (b.years?.[cur.year] || 0) - (a.years?.[cur.year] || 0));
    const show = years.slice(-6);
    body = sec("Wofür das Geld geht, Jahr für Jahr", `<table><thead><tr><th>Kategorie</th>${show.map(y => `<th class="n ${y < show[show.length - 3] ? "hide-s" : ""}">${y}</th>`).join("")}<th class="n hide-s">Ø Monat</th></tr></thead><tbody>${cats.map(c => `<tr><td><a href="#/kategorie/${encodeURIComponent(c.category)}">${esc(c.category)}</a></td>${show.map(y => `<td class="n ${y < show[show.length - 3] ? "hide-s" : ""} ${y === cur.year ? "" : "dim"}">${c.years?.[y] ? eur(c.years[y]) : "–"}</td>`).join("")}<td class="n hide-s">${eur(c.avg_month)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td>Summe</td>${show.map(y => `<td class="n ${y < show[show.length - 3] ? "hide-s" : ""}">${eur(cats.reduce((x, c) => x + (c.years?.[y] || 0), 0))}</td>`).join("")}<td class="hide-s"></td></tr></tfoot></table>`, "Summe je Jahr");
  } else {
    const catRows = (j.categories || []).map(c => ({ ...c, v: c.years?.[cur.year] || 0, pv: c.years?.[cur.year - 1] || 0 })).filter(c => c.v || c.pv).sort((a, b) => b.v - a.v);
    body = `<div class="grid"><div>` +
      sec("Monate " + cur.year, cols(ms.map(m => m.ersparnis), ms.map(m => MON_S[+m.ym.slice(5) - 1]), { now: ms.length - 1 }), "gespart pro Monat") +
      sec("Jahre", `<table><thead><tr><th>Jahr</th><th class="n">Einnahmen</th><th class="n">Ausgaben</th><th class="n hide-s">Investiert</th><th class="n">Gespart</th><th class="n">Quote</th></tr></thead><tbody>` +
        Y.map(r => `<tr class="${r.year === cur.year ? "picked" : ""}"><td><button class="link" type="button" data-y="${r.year}">${r.year}</button></td><td class="n">${eur(r.einnahmen)}</td><td class="n">${eur(r.ausgaben)}</td><td class="n hide-s">${eur(r.investiert)}</td>
          <td class="n ${r.ersparnis < 0 ? "neg" : ""}">${eur(r.ersparnis)}</td><td class="n">${pct(r.sparrate)}</td></tr>`).join("") + `</tbody></table>`) +
      sec("Größte Einzelausgaben", `<table><tbody>${(dash.top_expenses || []).map(t => `<tr><td>${esc(payee(t.payee))}<span class="sub">${dLong(t.date)} · ${esc(t.category)}${t.is_sonderausgabe ? " · Sonderausgabe" : ""}</span></td><td class="n">${eur(t.amount, true)}</td></tr>`).join("")}</tbody></table>`, "gesamter Zeitraum") +
      `</div><div>` +
      sec("Kategorien " + cur.year, `<table><thead><tr><th>Kategorie</th><th class="n">${cur.year}</th><th class="n">Änderung</th></tr></thead><tbody>` +
        catRows.map(c => { const ch = c.pv ? (c.v - c.pv) / c.pv * 100 : null;
          return `<tr><td><a href="#/kategorie/${encodeURIComponent(c.category)}">${esc(c.category)}</a><span class="sub">${cur.year - 1}: ${eur(c.pv)}</span></td><td class="n">${eur(c.v)}</td><td class="n ${ch > 10 ? "warn" : ""}">${ch == null ? "neu" : (ch > 0 ? "+" : "") + pct(ch, 0)}</td></tr>`; }).join("") + `</tbody></table>`, "Summe im Jahr") + `</div></div>`;
  }
  el.innerHTML = stage({ kicker, ...bigEur(cur.ersparnis), text: `gespart ${cur.year}${lastM && lastM !== "Dezember" ? ", Januar bis " + lastM : ""}.`, side: pct(cur.sparrate), sideNote: "Sparrate" }) +
    strip([{ l: "Einnahmen", v: eur(cur.einnahmen) }, { l: "Ausgaben", v: eur(cur.ausgaben) }, { l: "Investiert", v: eur(cur.investiert) }]) +
    `<div class="wrap"><nav class="tabs" aria-label="Ansicht">${views.map(([k, l]) => `<a href="#/jahr/${new URLSearchParams({ ...st, v: k })}" ${k === st.v ? 'aria-current="page"' : ""}>${l}</a>`).join("")}</nav></div>
     <div class="wrap content"><div class="tools"><select class="field" id="acc" aria-label="Konto"><option value="all">Alle Konten</option>${(j.all_accounts || []).map(a => `<option value="${esc(a)}" ${a === st.acc ? "selected" : ""}>${esc(accLabel(a))}</option>`).join("")}</select></div>${body}</div>`;
  el.querySelector("#ysel").onchange = e => go({ y: e.target.value });
  el.querySelector("#acc").onchange = e => go({ acc: e.target.value });
  el.querySelectorAll("[data-y]").forEach(b => b.onclick = () => go({ y: b.dataset.y }));
};

// ═══ Steuer ═════════════════════════════════════════════════════════════════
P.steuer = async (el, arg) => {
  const s = await api("/steuer" + (arg ? "?year=" + arg : ""));
  const y = s.selected_year, years = (s.years || []).slice().sort((a, b) => b - a);
  const nt = await api("/nebentaetigkeit?jahr=" + y).catch(() => null);
  const used = s.freibetrag ? s.capital_income / s.freibetrag * 100 : 0, c = s.crypto || {};
  const kicker = `<select aria-label="Jahr">${years.map(v => `<option ${v === y ? "selected" : ""}>${v}</option>`).join("")}</select><span class="tag">Sparerpauschbetrag ${eur(s.freibetrag)}${s.zusammenveranlagt ? " · zusammen veranlagt" : ""}</span>`;
  const rows = (s.capital_rows || []).slice().sort((a, b) => b.date.localeCompare(a.date));
  const ntYear = nt?.years?.find(r => r.jahr === y), ntB = (nt?.buchungen || []).filter(b => String(b.datum).startsWith(String(y)));
  const rowHtml = r => { const m = memo(r.description), nm = payee(/^Dividende /.test(m) ? m.slice(10) : r.payee);
    return `<tr><td style="width:100px">${dShort(r.date)}</td><td>${esc(nm)}<span class="sub">${esc(/^Dividende /.test(m) ? "Dividende" : m || r.category)} · ${esc(accLabel(r.account || ""))}</span></td><td class="n ${r.amount > 0 ? "pos" : "neg"}">${signed(r.amount, true)}</td></tr>`; };
  el.innerHTML = stage({ kicker, ...bigEur(s.capital_income), text: `Kapitalerträge ${y}: Zinsen und Dividenden. Nach Steuer ${eur(s.net_income, true)}.`, side: pct(used, 0), sideNote: "des Pauschbetrags genutzt" }) +
    strip([{ l: "Noch frei", v: eur(Math.max(0, s.freibetrag - s.capital_income), true), flag: used > 90 }, { l: "Abgeführte Steuer", v: eur(s.tax_withheld, true), s: "Kapitalertragsteuer, Soli, Kirchensteuer" },
      { l: "Nettoertrag", v: eur(s.net_income, true), s: "nach Steuer" },
      ...(nt?.active ? [{ l: "Nebentätigkeit", v: ntYear ? signed(ntYear.ergebnis) : "–", s: `${esc(nt.category)} ${y}` }] : [])]) +
    `<div class="wrap content grid"><div>` +
    sec("Pro Monat", cols((s.monthly || []).map(m => m.capital), (s.monthly || []).map(m => MON_S[+m.month.slice(5) - 1]), { now: (s.monthly || []).length - 1 }) +
      `<table><thead><tr><th>Monat</th><th class="n">Erträge</th><th class="n">Steuer</th></tr></thead><tbody>${(s.monthly || []).slice().reverse().map(m => `<tr><td>${MON[+m.month.slice(5) - 1]}</td><td class="n">${eur(m.capital, true)}</td><td class="n dim">${eur(m.tax, true)}</td></tr>`).join("")}</tbody></table>`) +
    sec("Krypto", `<table><tbody>
        <tr><td>Verkaufserlöse<span class="sub">${c.n_sales || 0} Verkäufe in ${y}</span></td><td class="n">${eur(c.proceeds || 0)}</td></tr>
        <tr><td>Gewinn steuerpflichtig<span class="sub">private Veräußerungsgeschäfte, § 23 EStG, nicht im Sparerpauschbetrag</span></td><td class="n ${(c.gain_taxable || 0) > (c.freigrenze || 0) ? "warn" : ""}">${eur(c.gain_taxable || 0)}<span class="sub">Freigrenze ${eur(c.freigrenze || 0)}</span></td></tr>
        <tr><td>Gewinn steuerfrei<span class="sub">länger als ein Jahr gehalten</span></td><td class="n pos">${eur(c.gain_tax_free || 0)}</td></tr></tbody></table>
      ${(c.gain_taxable || 0) > (c.freigrenze || 0) ? `<p class="body warn" style="margin-top:10px">Über der Freigrenze: Dann ist der ganze Gewinn steuerpflichtig, nicht nur der Teil darüber.</p>` : ""}`) +
    (nt ? sec("Nebentätigkeit", `<div class="tools"><label class="frm" style="flex:1"><span>Kategorie</span><span class="inp"><select class="field" id="ntcat">${opts(nt.verfuegbare_kategorien || [], nt.category)}</select></span></label>
        <a class="btn" href="/api/nebentaetigkeit/export?category=${encodeURIComponent(nt.category)}&jahr=${y}" download>CSV ${y}</a><a class="btn" href="/api/nebentaetigkeit/export?category=${encodeURIComponent(nt.category)}" download>CSV alle</a></div>
      ${(() => { const Ys = nt.years || [], ein = Ys.reduce((x, r) => x + r.einnahmen, 0), aus = Ys.reduce((x, r) => x + r.ausgaben, 0);
        return `<div class="strip boxed" style="--n:3;margin-bottom:20px"><div><div class="l">Einnahmen gesamt</div><div class="v">${eur(ein)}</div></div><div><div class="l">Ausgaben gesamt</div><div class="v">${eur(Math.abs(aus))}</div></div><div><div class="l">Ergebnis</div><div class="v ${plc(nt.total)}">${signed(nt.total)}</div><div class="s">über ${Ys.length} Jahre</div></div></div>`; })()}
      <table><thead><tr><th>Jahr</th><th class="n">Einnahmen</th><th class="n">Ausgaben</th><th class="n">Ergebnis</th><th class="n hide-s">kumuliert</th></tr></thead><tbody>
        ${(nt.years || []).slice().sort((a, b) => b.jahr - a.jahr).map(r => `<tr class="${r.jahr === y ? "picked" : ""}"><td>${r.jahr}<span class="sub">${r.n} Buchungen</span></td><td class="n">${eur(r.einnahmen)}</td><td class="n">${eur(r.ausgaben)}</td>
          <td class="n ${r.ergebnis < 0 ? "neg" : "pos"}">${signed(r.ergebnis)}</td><td class="n hide-s dim">${signed(r.kumuliert)}</td></tr>`).join("")}</tbody></table>
      ${(nt.hinweise || []).length ? `<ul class="plain" style="margin-top:20px">${nt.hinweise.map(h => `<li><b>${h.jahr} · ${esc(h.art)}${h.betrag ? " · " + eur(h.betrag, true) : ""}</b><span>${esc(h.text)}</span></li>`).join("")}</ul>` : ""}
      ${ntB.length ? `<h4 class="frm-h" style="margin-top:28px">Buchungen ${y}</h4><table><tbody>${ntB.map(b => `<tr><td style="width:90px">${dShort(b.datum)}</td><td>${esc(payee(b.wer))}<span class="sub">${esc(b.art)}${memo(b.zweck) ? " · " + esc(memo(b.zweck)) : ""}</span></td><td class="n ${b.betrag > 0 ? "pos" : ""}">${signed(b.betrag, true)}</td></tr>`).join("")}</tbody></table>` : ""}`,
      "Einnahmen-Überschuss je Jahr") : "") +
    `</div><div>` +
    ((s.tax_rows || []).length ? sec("Steuerabzüge", `<table><tbody>${s.tax_rows.map(rowHtml).join("")}</tbody></table>`, `${s.tax_rows.length} Buchungen`) : "") +
    sec("Erträge " + y, rows.length ? `<table><tbody id="caprows">${rows.slice(0, 25).map(rowHtml).join("")}</tbody></table>${rows.length > 25 ? `<p style="margin-top:14px"><button class="btn" type="button" id="allrows">Alle ${rows.length} zeigen</button></p>` : ""}
      <p class="body" style="margin-top:12px;font-size:13px">Die Erkennung beruht auf Stichwörtern im Buchungstext. Maßgeblich ist die Steuerbescheinigung deiner Bank.</p>` : `<p class="empty">Keine Kapitalerträge in ${y}.</p>`, `${rows.length} Buchungen`) +
    `</div></div>`;
  el.querySelector(".kicker-nav select").onchange = e => location.hash = "#/steuer/" + e.target.value;
  const nc = el.querySelector("#ntcat");
  if (nc) nc.onchange = async e => { await act(() => send("/nebentaetigkeit/config", "PUT", { category: e.target.value }), `Nebentätigkeit: ${e.target.value}`); route(); };
  const ar = el.querySelector("#allrows");
  if (ar) ar.onclick = () => { el.querySelector("#caprows").innerHTML = rows.map(rowHtml).join(""); ar.remove(); };
};

// ═══ Kategorien & Regeln ════════════════════════════════════════════════════
P.regeln = async (el, arg) => {
  const st = Object.assign({ r: "ytd", cmp: "" }, Object.fromEntries(new URLSearchParams(arg || "")));
  const [f0, t0] = rangeOf(st.r);
  const cmp = st.cmp ? st.cmp.split("|").filter(Boolean) : [];
  const [rules, cats, ts] = await Promise.all([api("/regeln"), api("/categories?" + new URLSearchParams({ date_from: f0, date_to: t0 })),
    cmp.length ? api("/categories/timeseries?" + new URLSearchParams({ cats: cmp.join(","), date_from: f0, date_to: t0 })) : null]);
  const R = rules.slice().sort((a, b) => b.count - a.count), C = cats.categories.slice().sort((a, b) => b.spend - a.spend);
  const maxSpend = Math.max(1, ...C.map(c => c.spend));
  const FIELD = { payee: "Empfänger", description: "Verwendungszweck", both: "Empfänger oder Zweck" };
  const go = patch => { const n = { ...st, ...patch }; location.hash = "#/regeln/" + new URLSearchParams(n); };
  const COLORS = ["var(--stage)", "var(--over)", "var(--ink)", "var(--pos)", "#a21caf", "#0e7490"];
  let cmpHtml = "";
  if (ts && ts.months?.length) {
    cmpHtml = sec("Vergleich", lineChart({ labels: ts.months.map(m => MON_S[+m.slice(5) - 1].slice(0, 3) + " " + m.slice(2, 4)), every: Math.max(1, Math.ceil(ts.months.length / 12)),
        lines: ts.series.map((x, i) => ({ v: x.values, c: COLORS[i % COLORS.length], w: 3 })), tickFmt: v => eur(v), label: "Kategorien im Vergleich" }) +
      `<div class="legend">${ts.series.map((x, i) => `<span style="--k:${COLORS[i % COLORS.length]}">${esc(x.name)} <button class="link" type="button" data-uncmp="${esc(x.id)}">entfernen</button></span>`).join("")}</div>`, "pro Monat");
  }
  el.innerHTML = stage({ big: num(R.length), unit: " Regeln", text: "ordnen neue Buchungen beim Import automatisch einer Kategorie zu.", side: num(R.reduce((a, r) => a + r.count, 0)), sideNote: "Buchungen zugeordnet" }) +
    `<div class="wrap content">` + cmpHtml + `<div class="grid" ${cmpHtml ? 'style="margin-top:52px"' : ""}><div>` +
    sec("Kategorien", `<div class="tools"><div class="seg" role="group" aria-label="Zeitraum">${RANGES.map(([k, l]) => `<button type="button" data-r="${k}" aria-pressed="${st.r === k}">${l}</button>`).join("")}</div></div>
      <table><tbody>${C.map(c => `<tr><td><a href="#/kategorie/${encodeURIComponent(c.name)}">${esc(c.name)}</a><span class="sub">${num(c.count)} Buchungen${c.is_custom ? " · eigene" : ""}</span>${c.spend ? `<div class="meter"><i style="width:${c.spend / maxSpend * 100}%"></i></div>` : ""}</td>
        <td class="n">${c.spend ? eur(c.spend) : '<span class="dim">–</span>'}</td>
        <td class="n"><button class="chip" type="button" data-cmp="${esc(c.id)}" aria-pressed="${cmp.includes(c.id)}">Vergleichen</button>${c.is_custom ? `<br><button class="link" type="button" data-delcat="${esc(c.name)}">Löschen</button>` : ""}</td></tr>`).join("")}</tbody></table>
      <form class="tools" id="newcat" style="margin-top:16px"><input class="field grow" name="name" required placeholder="Neue Kategorie" aria-label="Name der neuen Kategorie"><button class="btn black" type="submit">Anlegen</button></form>`, RANGES.find(x => x[0] === st.r)[1]) +
    `</div><div>` +
    sec("Neue Regel", `<form class="tools" id="add">
        <input class="field grow" name="pattern" required placeholder="Stichwort, z. B. Netflix" aria-label="Stichwort">
        <select class="field" name="field" aria-label="Wo suchen">${opts([["both", "Empfänger + Zweck"], ["payee", "nur Empfänger"], ["description", "nur Zweck"]], "both")}</select>
        <select class="field" name="category" aria-label="Kategorie">${opts(C.map(c => c.name).sort())}</select>
        <button class="btn black" type="submit">Anlegen</button></form><p class="body" style="font-size:13px">Neue Regeln gelten sofort für alle Buchungen.</p>`) +
    sec("Regeln", `<div class="tools"><input class="field grow" id="rq" type="search" placeholder="Stichwort oder Kategorie" aria-label="Regeln durchsuchen"><button class="btn" type="button" id="apply">Alle neu anwenden</button></div>
      <table><thead><tr><th>Wenn … enthält</th><th>dann</th><th class="n">Treffer</th><th></th></tr></thead><tbody id="rl"></tbody></table>`, "nach Treffern") +
    `</div></div></div>`;
  const draw = () => {
    const q = el.querySelector("#rq").value.trim().toLowerCase();
    el.querySelector("#rl").innerHTML = R.filter(r => !q || (r.pattern + " " + r.category).toLowerCase().includes(q)).map(r =>
      `<tr><td><code>${esc(r.pattern)}</code><span class="sub">${FIELD[r.field] || esc(r.field)}</span></td><td>${esc(r.category)}</td><td class="n dim">${num(r.count)}</td>
       <td class="n"><button class="link" type="button" data-del="${esc(r.pattern)}" data-f="${esc(r.field)}">Löschen</button></td></tr>`).join("") || `<tr><td colspan="4" class="empty">Keine Regel passt.</td></tr>`;
  };
  el.querySelector("#rq").oninput = draw; draw();
  el.querySelectorAll("[data-r]").forEach(b => b.onclick = () => go({ r: b.dataset.r }));
  el.addEventListener("click", async e => {
    const d = e.target.closest("[data-del]"), dc = e.target.closest("[data-delcat]"), cm = e.target.closest("[data-cmp]"), un = e.target.closest("[data-uncmp]");
    if (cm) { const id = cm.dataset.cmp; go({ cmp: (cmp.includes(id) ? cmp.filter(x => x !== id) : [...cmp, id].slice(-6)).join("|") }); }
    if (un) go({ cmp: cmp.filter(x => x !== un.dataset.uncmp).join("|") });
    if (d) { if (!confirm(`Regel „${d.dataset.del}“ löschen? Bereits zugeordnete Buchungen behalten ihre Kategorie.`)) return;
      await act(() => api(`/regeln/${encodeURIComponent(d.dataset.del)}?field=${encodeURIComponent(d.dataset.f)}`, { method: "DELETE" }), "Regel gelöscht"); route(); }
    if (dc) { if (!confirm(`Kategorie „${dc.dataset.delcat}“ löschen? Ihre Buchungen landen in „Sonstiges“.`)) return;
      await act(() => api(`/categories/${encodeURIComponent(dc.dataset.delcat)}`, { method: "DELETE" }), "Kategorie gelöscht"); route(); }
  });
  el.querySelector("#add").onsubmit = async e => { e.preventDefault(); const f = new FormData(e.target);
    await act(() => send("/regeln", "POST", { pattern: f.get("pattern"), field: f.get("field"), category: f.get("category") }), "Regel angelegt und angewendet"); route(); };
  el.querySelector("#apply").onclick = async () => { await act(() => api("/regeln/apply", { method: "POST" }), r => `Regeln angewendet${r && r.updated != null ? `: ${r.updated} Buchungen geändert` : ""}`); route(); };
  el.querySelector("#newcat").onsubmit = async e => { e.preventDefault(); const n = new FormData(e.target).get("name"); await act(() => send("/categories", "POST", { name: n }), `Kategorie „${n}“ angelegt`); route(); };
};

P.kategorie = async (el, raw) => {
  const name = decodeURIComponent(raw || "");
  const d = await api(`/categories/${encodeURIComponent(name)}/detail`);
  const m = (d.monthly || []).slice(-24);
  el.innerHTML = stage({ kicker: `<a href="#/regeln" style="color:inherit;text-decoration:none">‹ Kategorien</a>`, ...bigEur(d.avg_monthly), text: `im Monat für ${esc(name)}, im Schnitt seit Beginn.`, side: eur(d.total), sideNote: `insgesamt · ${num(d.count)} Buchungen` }) +
    `<div class="wrap content grid"><div>` +
    sec("Verlauf", cols(m.map(x => x.amount), m.map(x => MON_S[+x.month.slice(5) - 1]), { now: m.length - 1 }), "letzte 24 Monate") +
    `<p><a class="btn" href="#/buchungen/${encodeURIComponent(name)}">Alle Buchungen dieser Kategorie</a></p>` +
    `</div><div>` +
    sec("Wichtigste Empfänger", `<table><tbody>${(d.top_payees || []).map(p => `<tr><td>${esc(payee(p.payee))}<span class="sub">${num(p.count)} Buchungen</span></td><td class="n">${eur(p.total)}</td></tr>`).join("")}</tbody></table>`) + `</div></div>`;
};

// ═══ Import ═════════════════════════════════════════════════════════════════
P.import = async el => {
  const st = await api("/review/status");
  const open = st.open_total || 0;
  el.innerHTML = stage({ big: num(open), unit: " offen", text: open ? "Buchungen haben noch keine Kategorie. Ordne sie zu, dann lässt sich der Monat bewerten." : "Alle Buchungen haben eine Kategorie." }) +
    `<div class="wrap content grid"><div>` +
    sec("Kontoauszug importieren", `<label class="drop" id="drop"><b>Datei hierher ziehen</b><p>CSV von DKB, ING, Sparkasse, Comdirect, Trade Republic oder PayPal, Depotauszug als PDF. Bereits importierte Buchungen werden übersprungen.</p>
      <span class="btn yellow">Datei wählen</span><input type="file" id="file" accept=".csv,.pdf,.txt" hidden multiple></label><div id="res" style="margin-top:18px"></div>`) +
    `</div><div>${sec("Offene Buchungen", `<div id="open"></div>`)}</div></div>`;
  async function drawOpen() {
    const box = el.querySelector("#open");
    const d = await api("/review/open?limit=300");
    if (!d.items.length) { box.innerHTML = `<p class="empty">Nichts offen.</p>`; return; }
    const names = d.categories.map(c => c.name);
    box.innerHTML = `<p class="body" style="font-size:13px">Eine Wahl gilt für alle offenen Buchungen desselben Händlers. Mit Haken wird daraus eine Regel für künftige Importe.</p><table><tbody>${d.items.map(t => { const pat = t.is_aggregator ? "" : (t.merchant || payee(t.payee));
      return `<tr><td>${esc(payee(t.payee))}${t.merchant && t.merchant !== t.payee ? ` · <b>${esc(t.merchant)}</b>` : ""}<span class="sub">${dShort(t.date)} ${t.date.slice(0, 4)}${memo(t.description) ? " · " + esc(memo(t.description)) : ""} · ${esc(accLabel(t.account || ""))}</span>
        <select class="field" data-id="${esc(t.id)}" data-group="${esc(t.group_key || "")}" style="margin-top:6px;width:100%" aria-label="Kategorie"><option value="">Kategorie wählen …</option>${names.map(n => `<option ${n === t.suggestion ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>
        ${t.suggestion ? `<span class="sub">${t.suggestion_hits}× bisher so zugeordnet</span>` : ""}
        <span class="rulerow"><label class="check"><input type="checkbox" data-mk="${esc(t.id)}" ${pat ? "checked" : ""}> Regel merken:</label><input class="field" data-pat="${esc(t.id)}" value="${esc(pat)}" aria-label="Stichwort im Empfänger"></span></td>
        <td class="n">${signed(t.amount, true)}</td></tr>`; }).join("")}</tbody></table>
      <div class="tools" style="margin-top:16px"><button class="btn black" type="button" id="assign">Zuordnen</button></div>`;
    // Gleicher Händler: eine Wahl gilt für alle offenen Buchungen der Gruppe.
    box.addEventListener("change", e => {
      const s = e.target.closest("select[data-group]"); if (!s || !s.dataset.group) return;
      box.querySelectorAll(`select[data-group="${CSS.escape(s.dataset.group)}"]`).forEach(o => { if (o !== s && !o.dataset.touched) o.value = s.value; });
      s.dataset.touched = "1";
    });
    box.querySelector("#assign").onclick = async () => {
      const seen = new Set();
      const items = [...box.querySelectorAll("select[data-id]")].filter(s => s.value).map(s => {
        const t = d.items.find(x => x.id === s.dataset.id), id = CSS.escape(s.dataset.id);
        const mk = box.querySelector(`[data-mk="${id}"]`).checked, pat = box.querySelector(`[data-pat="${id}"]`).value.trim();
        const rule = mk && pat && !seen.has(pat.toLowerCase()) ? { pattern: pat, field: t.merchant ? "both" : "payee" } : null;
        if (rule) seen.add(pat.toLowerCase());
        return { tx_hash: s.dataset.id, category: s.value, rule };
      });
      if (!items.length) return toast("Erst eine Kategorie wählen", true);
      await act(() => send("/review/assign", "POST", { items }), r => `${r.updated} zugeordnet${r.rules_added ? `, ${r.rules_added} Regeln angelegt` : ""}`); route();
    };
  }
  async function upload(files) {
    const res = el.querySelector("#res");
    for (const [i, f] of files.entries()) {
      res.insertAdjacentHTML("beforeend", `<p class="body" id="u-${i}"><b>${esc(f.name)}</b> wird gelesen …</p>`);
      const fd = new FormData(); fd.append("file", f);
      try { const r = await api("/upload", { method: "POST", body: fd });
        res.querySelector(`#u-${i}`).outerHTML = `<div class="upres"><b>${esc(f.name)}</b><span class="sub">${esc(r.format_name || r.type || "")}</span>
          <div class="strip boxed" style="--n:4"><div><div class="l">Gelesen</div><div class="v">${num(r.n_parsed || 0)}</div></div><div><div class="l">Neu</div><div class="v pos">${num(r.n_new || 0)}</div></div><div><div class="l">Duplikate</div><div class="v">${num(r.n_duplicates || 0)}</div></div><div><div class="l">Gesamt</div><div class="v">${num(r.n_total || 0)}</div></div></div>
          ${r.message ? `<p class="body" style="font-size:13px">${esc(r.message)}</p>` : ""}${(r.affected_months || []).length ? `<p class="body" style="font-size:13px">Betrifft ${r.affected_months.map(ymName).join(", ")}.</p>` : ""}</div>`; }
      catch (err) { res.querySelector(`#u-${i}`).innerHTML = `<b class="warn">${esc(f.name)}</b>: ${esc(err.message)}`; }
    }
    const st2 = await api("/review/status");
    el.querySelector(".big").innerHTML = `${num(st2.open_total)}<small> offen</small>`;
    drawOpen();
  }
  const drop = el.querySelector("#drop"), inp = el.querySelector("#file");
  inp.onchange = () => inp.files.length && upload([...inp.files]);
  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("hot"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("hot"); }));
  drop.addEventListener("drop", e => e.dataTransfer.files.length && upload([...e.dataTransfer.files]));
  await drawOpen();
};

// ═══ Einstellungen ══════════════════════════════════════════════════════════
P.einstellungen = async el => {
  const [s, acc, dash, cats, tx1] = await Promise.all([api("/settings"), api("/settings/accounts"), api("/dashboard"), catNames(), api("/transactions?limit=1")]);
  const excl = new Set(dash.top_expenses_excluded || []);
  const keyRow = (id, label, set, preview, hint) => `<tr><td>${label}<span class="sub">${set ? `hinterlegt (${esc(preview || "")})` : `<span class="warn">fehlt</span>`} · ${hint}</span></td>
    <td class="n"><button class="link" type="button" data-key="${id}">${set ? "Ändern" : "Eintragen"}</button></td></tr>`;
  el.innerHTML = stage({ big: num((acc.accounts || []).length), unit: " Konten", text: "Schlüssel, Konten und Sicherung. Alles liegt im Ordner data/ auf diesem Rechner." }) +
    `<div class="wrap content grid"><div>` +
    sec("API-Schlüssel", `<table><tbody>${keyRow("anthropic", "Anthropic (Claude)", s.anthropic_api_key_set, s.anthropic_api_key_preview, "für die Monatsbewertung")}
      ${keyRow("twelve", "Twelve Data", s.twelve_data_api_key_set, s.twelve_data_api_key_preview, "für Kurse, die Yahoo nicht liefert")}</tbody></table>`) +
    sec("Konten", `<table><thead><tr><th>Konto</th><th class="n">Buchungen</th><th class="n">Saldo</th><th></th></tr></thead><tbody>${(acc.accounts || []).map(a => `<tr><td>${esc(a.display_name)}<span class="sub">${a.is_renamed ? esc(a.raw_label) : "Originalname"}</span></td>
        <td class="n dim">${num(a.n_transactions)}</td><td class="n">${a.calibrated_balance != null ? eur(a.calibrated_balance) : eur(a.flow)}</td>
        <td class="n"><button class="link" type="button" data-ren="${esc(a.raw_label)}" data-name="${esc(a.display_name)}">Umbenennen</button><br><button class="link" type="button" data-delacc="${esc(a.raw_label)}" data-name="${esc(a.display_name)}" data-n="${a.n_transactions}">Buchungen löschen</button></td></tr>`).join("")}</tbody></table>`) +
    sec("Größte Einzelausgaben", `<p class="body">Diese Kategorien zählen nicht zu den größten Einzelausgaben, etwa weil die Miete sonst alles verdrängt.</p>
      <div class="chips wrapchips">${cats.map(c => `<button type="button" class="chip" data-excl="${esc(c)}" aria-pressed="${excl.has(c)}">${esc(c)}</button>`).join("")}</div>`) +
    `</div><div>` +
    sec("Sicherung", `<p class="body">Das Backup enthält Regeln, Kategorien, Ziele, Budgets, Verträge und Abo-Einstellungen. Buchungen stecken in den Kontoauszügen und lassen sich neu importieren.</p>
      <div class="tools"><a class="btn black" href="/api/settings/backup" download>Backup laden</a><a class="btn" href="/api/settings/backup?include_secrets=true" download>mit Schlüsseln und Salden</a></div>
      <label class="drop" style="padding:28px 16px;margin-top:8px"><b style="font-size:20px">Backup wiederherstellen</b><p>JSON-Datei wählen. Vor dem Schreiben siehst du, was sich ändert.</p><span class="btn">Datei wählen</span><input type="file" id="restore" accept=".json,application/json" hidden></label>
      <div id="restore-res" style="margin-top:14px"></div>`) +
    sec("Umbuchungen", `<p class="body">Sucht Paare aus Ab- und Zugang zwischen deinen Konten neu. Vorher siehst du, wie viele Buchungen sich ändern würden.</p>
      <button class="btn" type="button" id="redetect">Umbuchungen neu erkennen</button><div id="redetect-res" style="margin-top:12px"></div>`) +
    sec("Alle Buchungen löschen", `<p class="body">Löscht jede importierte Buchung. Regeln und Einstellungen bleiben. Kapital hält fünf frühere Stände als <code>transactions.parquet.1</code> bis <code>.5</code>.</p>
      <button class="btn" type="button" id="wipe" style="border-color:var(--over);color:var(--over)">Alle ${num(tx1.total)} Buchungen löschen</button>`) +
    `</div></div>`;
  el.addEventListener("click", async e => {
    const k = e.target.closest("[data-key]"), rn = e.target.closest("[data-ren]"), da = e.target.closest("[data-delacc]"), ex = e.target.closest("[data-excl]");
    if (k) {
      const v = prompt(k.dataset.key === "anthropic" ? "Anthropic-API-Key (beginnt mit sk-ant-):" : "Twelve-Data-API-Key:"); if (!v) return;
      await act(() => send(k.dataset.key === "anthropic" ? "/settings/anthropic_key" : "/settings/twelve_data_key", "PUT", { api_key: v.trim() }), "Schlüssel gespeichert"); route();
    }
    if (rn) { const v = prompt(`Neuer Name für ${rn.dataset.name}:`, rn.dataset.name); if (v == null) return;
      await act(() => send(`/settings/accounts/${encodeURIComponent(rn.dataset.ren)}/label`, "PUT", { label: v.trim() }), "Konto umbenannt"); route(); }
    if (da) { if (!confirmTyped(`Alle ${da.dataset.n} Buchungen von „${da.dataset.name}“ löschen?`, "LÖSCHEN")) return toast("Nicht gelöscht");
      await act(() => api(`/transactions/account/${encodeURIComponent(da.dataset.delacc)}`, { method: "DELETE" }), "Buchungen gelöscht"); route(); }
    if (ex) { const on = ex.getAttribute("aria-pressed") !== "true"; on ? excl.add(ex.dataset.excl) : excl.delete(ex.dataset.excl);
      await act(() => send("/settings/top_expenses_excluded", "PUT", { categories: [...excl] }), "Gespeichert"); ex.setAttribute("aria-pressed", on); }
  });
  el.querySelector("#restore").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const box = el.querySelector("#restore-res");
    let payload; try { payload = JSON.parse(await f.text()); } catch (err) { return toast("Keine gültige JSON-Datei", true); }
    const r = await act(() => send("/settings/restore", "POST", { payload, dry_run: true }));
    box.innerHTML = `<table><tbody>${(r.would_write || []).map(w => `<tr><td><code>${esc(w.file)}</code><span class="sub">${w.exists ? "wird überschrieben" : "neu"}</span></td><td class="n">${num(w.entries_new)} Einträge</td></tr>`).join("")}</tbody></table>
      ${(r.rejected || []).length ? `<p class="body warn">Abgelehnt: ${esc(r.rejected.map(x => x.file || x).join(", "))}</p>` : ""}
      <div class="tools" style="margin-top:12px"><button class="btn black" type="button" id="restore-go">Wiederherstellen</button><button class="link" type="button" id="restore-no">Abbrechen</button></div>`;
    box.querySelector("#restore-no").onclick = () => box.innerHTML = "";
    box.querySelector("#restore-go").onclick = async () => { await act(() => send("/settings/restore", "POST", { payload, dry_run: false }), "Backup wiederhergestellt"); route(); };
  };
  el.querySelector("#redetect").onclick = async () => {
    const box = el.querySelector("#redetect-res");
    const r = await act(() => api("/transactions/redetect-transfers?dry_run=true", { method: "POST" }));
    if (!r.changed) { box.innerHTML = `<p class="body">Alles passt, nichts würde sich ändern.</p>`; return; }
    box.innerHTML = `<p class="body">${r.was_not_now_transfer} Buchungen würden zu Umbuchungen, ${r.was_transfer_now_not} wären keine mehr. Betroffenes Volumen ${eur(r.volume_freed)}.</p>
      <button class="btn black" type="button" id="redetect-go">Übernehmen</button>`;
    box.querySelector("#redetect-go").onclick = async () => { await act(() => api("/transactions/redetect-transfers?dry_run=false", { method: "POST" }), "Umbuchungen aktualisiert"); route(); };
  };
  el.querySelector("#wipe").onclick = async () => {
    if (!confirmTyped("Wirklich ALLE Buchungen löschen?", "ALLES LÖSCHEN")) return toast("Nicht gelöscht");
    await act(() => api("/transactions/all", { method: "DELETE" }), "Alle Buchungen gelöscht"); route();
  };
};

route();
