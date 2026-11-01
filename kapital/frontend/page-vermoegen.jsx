// Vermögen — die Ansicht, die bisher gefehlt hat.
//
// Die App konnte den Kontostand von heute und eine Hochrechnung in die Zukunft,
// aber nicht die Frage "wie hat sich mein Vermögen entwickelt". Für eine
// Finanz-App ist das die zentrale Kurve.
//
// Konten sind exakt (kalibrierter Stand, rückwärts gerechnet). Depot und Krypto
// stehen zum Marktwert am Monatsende (Stück × Kurs, wie Portfolio → Entwicklung).

// Gestapelt: Konten (exakt, rückwärts vom kalibrierten Stand), Depot und
// Krypto zum Marktwert am Monatsende. Die Oberkante ist das Gesamtvermögen.
// Gestrichelt: Konten + Einstand — so viel wäre es OHNE Kursbewegungen; der
// Abstand zur Oberkante ist der Markt.
const WEALTH_LAYERS = [
  { key: "wealth", label: "Konten", color: "var(--accent)" },
  { key: "depot", label: "Depot", color: "#3fd17a" },
  { key: "crypto", label: "Krypto", color: "#ffb547" },
  { key: "contracts", label: "Verträge", color: "#b98ec9" },
];

const WealthChart = ({ rows, height = 280 }) => {
  const [hover, setHover] = React.useState(null);
  const [ref, size] = useElementSize();
  if (!rows || rows.length === 0) return null;
  const width = Math.max(size.w || 860, 560);

  const padL = 64, padR = 18, padT = 18, padB = 30;
  const w = width - padL - padR, h = height - padT - padB;
  const tops = rows.map(r => (r.wealth || 0) + (r.depot || 0) + (r.crypto || 0));
  const vals = [...tops, ...rows.map(r => r.wealth), ...rows.map(r => r.without_market ?? r.wealth)];
  const { axMin, axMax, ticks } = niceAxis(Math.min(...vals, 0), Math.max(...vals, 1));
  const x = (i) => padL + (rows.length > 1 ? (i / (rows.length - 1)) * w : w / 2);
  const y = (v) => padT + h - ((v - axMin) / (axMax - axMin || 1)) * h;

  // Kumulierte Grenzen je Schicht
  const bounds = rows.map(r => {
    let acc = 0;
    return WEALTH_LAYERS.map(l => { const lo = acc; acc += (r[l.key] || 0); return [lo, acc]; });
  });
  const band = (li) => {
    const up = rows.map((_, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(bounds[i][li][1]).toFixed(1)}`).join(" ");
    const down = rows.map((_, j) => { const i = rows.length - 1 - j; return `L${x(i).toFixed(1)},${y(bounds[i][li][0]).toFixed(1)}`; }).join(" ");
    return `${up} ${down} Z`;
  };
  const line = (fn) => rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(fn(r, i)).toFixed(1)}`).join(" ");

  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const rel = e.clientX - box.left - padL;
    const i = Math.max(0, Math.min(rows.length - 1, Math.round((rel / w) * (rows.length - 1))));
    setHover({ i, x: e.clientX - box.left });
  };
  const hr = hover ? rows[hover.i] : null;
  const labelEvery = Math.max(1, Math.ceil(rows.length / 14));

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <svg width={width} height={height} style={{ display: "block" }}
           onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? "" : "2 4"} />
            <text x={padL - 10} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--muted)" fontFamily="var(--mono)">{compactNum(t)}</text>
          </g>
        ))}
        {rows.map((r, i) => i % labelEvery === 0 && (
          <text key={r.month} x={x(i)} y={height - padB + 16} textAnchor="middle" fontSize="9" fill="var(--muted)" fontFamily="var(--mono)">{r.month.slice(2)}</text>
        ))}
        {WEALTH_LAYERS.map((l, li) => (
          <path key={l.key} d={band(li)} fill={l.color} opacity={li === 0 ? 0.28 : 0.45} />
        ))}
        <path d={line((r) => r.without_market ?? r.wealth)} fill="none" stroke="var(--fg)" strokeWidth="1.3" strokeDasharray="4 4" opacity="0.55" />
        <path d={line((_, i) => tops[i])} fill="none" stroke="var(--fg)" strokeWidth="2" strokeLinejoin="round" />
        {hr && <line x1={x(hover.i)} x2={x(hover.i)} y1={padT} y2={padT + h} stroke="var(--muted)" strokeDasharray="3 3" />}
      </svg>
      {hr && (
        <div style={{
          position: "absolute", left: Math.min(hover.x + 14, width - 230), top: 10,
          background: "var(--bg-1)", border: "1px solid var(--line)", borderRadius: 8,
          padding: "8px 12px", fontSize: 12, pointerEvents: "none", boxShadow: "0 4px 14px var(--shadow)", minWidth: 210,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontFamily: "var(--mono)" }}>{hr.month}</div>
          {[...WEALTH_LAYERS].reverse().map(l => (hr[l.key] || 0) !== 0 && (
            <div key={l.key} style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
              <span style={{ color: "var(--muted)" }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: l.color, marginRight: 6 }} />{l.label}</span>
              <span style={{ fontFamily: "var(--mono)" }}>{fmtEUR(hr[l.key], { decimals: 0 })}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, borderTop: "1px solid var(--line)", marginTop: 5, paddingTop: 5, fontWeight: 600 }}>
            <span>Gesamt</span><span style={{ fontFamily: "var(--mono)" }}>{fmtEUR(tops[hover.i], { decimals: 0 })}</span>
          </div>
          {hr.without_market != null && (hr.depot || hr.crypto) ? (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, color: "var(--muted)", fontSize: 11, marginTop: 3 }}>
              <span>davon Kursgewinn</span>
              <span style={{ fontFamily: "var(--mono)", color: tops[hover.i] - hr.without_market >= 0 ? "var(--pos)" : "var(--neg)" }}>
                {fmtEUR(tops[hover.i] - hr.without_market, { decimals: 0, sign: true })}
              </span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

const PageVermoegen = () => {
  const [months, setMonths] = React.useState(36);
  const [reload, setReload] = React.useState(0);
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    setLoading(true); setError("");
    fetch(`/api/networth/history?months=${months}`)
      .then(async r => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.detail || `Serverfehler ${r.status}`);
        return j;
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [months, reload]);

  if (loading && !data) return <Spinner />;
  if (error && !data) return (
    <div style={{ padding: "24px 32px" }}>
      <EmptyState icon="info" title="Vermögen konnte nicht geladen werden" desc={error} />
    </div>
  );
  if (!data || !data.series.length) return (
    <div style={{ padding: "24px 32px" }}>
      <EmptyState icon="bank" title="Noch keine Daten"
        desc="Importiere zuerst Kontoauszüge unter Import." />
    </div>
  );

  const c = data.current || {};
  const rows = data.series;
  const first = rows[0], last = rows[rows.length - 1];
  const tot = (r) => (r.total != null ? r.total : r.wealth);
  const delta = tot(last) - tot(first);
  const perMonth = rows.length > 1 ? delta / (rows.length - 1) : 0;

  return (
    <div style={{ padding: "24px 32px 48px", display: "flex", flexDirection: "column", gap: 20 }}>
      <WarningStrip warnings={data.note ? [data.note] : []} />

      {/* Woraus das Vermögen besteht */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
        <Card level="primary" style={{ gridColumn: "span 2" }}><Stat label="Gesamtvermögen" value={fmtEUR(c.total)} large
                    sub={c.depot_as_of ? `Depot per ${fmtDate(c.depot_as_of)}` : "Depot ohne Stichtag"} /></Card>
        <Card><Stat label="Liquide Konten" value={fmtEUR(c.liquid)} sub="Giro, Tagesgeld" /></Card>
        <Card><Stat label="Depot" value={fmtEUR(c.depot)} sub="laut Depotauszug" /></Card>
        {c.crypto != null && <Card><Stat label="Krypto" value={fmtEUR(c.crypto)} sub="Kraken, aktueller Kurs" /></Card>}
        {c.contracts > 0 && <Card><Stat label="Verträge" value={fmtEUR(c.contracts)} sub="Rentenversicherungen, Kaution" /></Card>}
        <Card><Stat label="Freies Guthaben" value={fmtEUR(c.broker_cash)} sub="beim Broker" /></Card>
      </div>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Vermögensverlauf</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
              {first.month} bis {last.month} ·{" "}
              <span style={{ color: delta >= 0 ? "var(--pos)" : "var(--neg)" }}>
                {fmtEUR(delta, { decimals: 0, sign: true })}
              </span>{" "}
              gesamt, das sind {fmtEUR(perMonth, { decimals: 0, sign: true })} im Monat
            </div>
          </div>
          <Segmented value={String(months)} onChange={(v) => setMonths(Number(v))}
            options={[{ value: "12", label: "1 J." }, { value: "36", label: "3 J." },
                      { value: "60", label: "5 J." }, { value: "240", label: "Alles" }]} />
        </div>

        <WealthChart rows={rows} />

        <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--muted)", marginTop: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {WEALTH_LAYERS.map(l => (
            <span key={l.key}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: l.color, opacity: 0.7, marginRight: 5, verticalAlign: "middle" }} />{l.label}</span>
          ))}
          <span><span style={{ display: "inline-block", width: 14, height: 0, borderTop: "2px dashed var(--fg)", opacity: 0.55, marginRight: 5, verticalAlign: "middle" }} />ohne Kursgewinne (Konten + Einstand)</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, lineHeight: 1.6 }}>
          Konten vom heutigen kalibrierten Stand rückwärts gerechnet. Depot und Krypto zum Marktwert am Monatsende
          (Stückzahl × Kurs; einzelne Altpositionen ohne Kurshistorie zum Einstand). Der Abstand zwischen der
          durchgezogenen und der gestrichelten Linie ist, was die Kurse beigetragen haben.
        </div>
      </Card>

      {/* Konten im Detail */}
      <Card>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Konten</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>
          Umbenennen unter Übersicht → Konten
        </div>
        {(c.accounts || []).map(a => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" }}>
                {a.type}
                {a.holdings != null && <> · Krypto {fmtEUR(a.holdings, { decimals: 0 })}{Math.abs(a.balance) >= 0.01 ? ` + Cash ${fmtEUR(a.balance, { decimals: 0 })}` : ""}</>}
                {a.holdings != null ? null : a.calibrated
                  ? <> · Anfangssaldo {fmtEUR(a.opening, { decimals: 0 })}</>
                  : <span style={{ color: "var(--warn)" }}> · kein Kontostand hinterlegt</span>}
              </div>
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 600,
                          color: a.balance < 0 ? "var(--neg)" : "var(--fg)" }}>
              {fmtEUR(a.balance + (a.holdings || 0))}
            </div>
          </div>
        ))}
      </Card>

      {/* Verträge */}
      {(c.contract_list || []).length > 0 && (
        <Card>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Verträge</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6, lineHeight: 1.5 }}>
            Private Rentenversicherungen und Kaution: Geld, das dir gehört, aber nicht auf einem Konto liegt.
            Den aktuellen Rückkaufswert findest du in der jährlichen Standmitteilung oder im Kundenportal.
          </div>
          {c.contract_list.map(k => <ContractRow key={k.id} c={k} onSaved={() => setReload(t => t + 1)} />)}
        </Card>
      )}
    </div>
  );
};

// ── Verträge: Rückkaufswert hinterlegen ─────────────────────────────────────
const ContractRow = ({ c, onSaved }) => {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(c.value ?? "");
  const [date, setDate] = React.useState(c.value_date || new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = React.useState(false);
  const save = async (clear) => {
    setBusy(true);
    const body = clear ? { value: null } : { value: Number(String(value).replace(",", ".")), value_date: date };
    const r = await fetch(`/api/contracts/${c.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) { setEditing(false); onSaved && onSaved(); }
  };
  const sourceText = {
    "eingezahlt": "Summe der Einzahlungen — der Rückkaufswert liegt meist darunter",
    "hinterlegt": "gezahlt minus zurückerhalten",
    "angegeben": `Rückkaufswert vom ${c.value_date ? fmtDate(c.value_date) : ""}`,
    "angegeben + Beiträge seither": `Rückkaufswert vom ${c.value_date ? fmtDate(c.value_date) : ""} + Beiträge seither (Schätzung)`,
  }[c.source] || c.source;
  const inp = { padding: "5px 8px", background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 7, color: "var(--fg)", fontSize: 12, fontFamily: "var(--mono)" };
  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
          <div style={{ fontSize: 11, color: c.source === "eingezahlt" ? "var(--warn)" : "var(--muted)", marginTop: 2 }}>{sourceText}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)", marginTop: 2 }}>
            {c.n_payments} {c.kind === "kaution" ? "Bewegungen" : "Zahlungen"} seit {c.first ? fmtDate(c.first) : "—"} · {c.kind === "kaution" ? "netto hinterlegt" : "eingezahlt"} {fmtEUR(c.paid, { decimals: 0 })}
            {c.monthly ? ` · zuletzt ${fmtEUR(c.monthly)}/Monat` : ""}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 600 }}>{fmtEUR(c.current_value)}</div>
          {c.kind === "vorsorge" && !editing && (
            <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", padding: 0, marginTop: 3, cursor: "pointer", color: "var(--accent)", fontSize: 11, fontFamily: "inherit" }}>
              {c.value != null ? "Wert ändern" : "Rückkaufswert eintragen"}
            </button>
          )}
        </div>
      </div>
      {editing && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>Rückkaufswert</span>
          <input value={value} onChange={e => setValue(e.target.value)} placeholder="z. B. 4200" style={{ ...inp, width: 110 }} />
          <span style={{ fontSize: 11, color: "var(--muted)" }}>zum</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
          <Btn size="sm" variant="primary" disabled={busy || value === ""} onClick={() => save(false)}>Speichern</Btn>
          {c.value != null && <Btn size="sm" disabled={busy} onClick={() => save(true)}>Angabe löschen</Btn>}
          <Btn size="sm" onClick={() => setEditing(false)}>Abbrechen</Btn>
        </div>
      )}
    </div>
  );
};

window.PageVermoegen = PageVermoegen;
