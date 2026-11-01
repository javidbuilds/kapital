// Page: Ziele — ersetzt FIRE-Rechner und Prognose.
// Beantwortet "wann ist welches Geld wofür da?" statt einer einzelnen
// Hochrechnung mit fester Rendite.

const ZIEL_COLORS = { pessimistisch: "#c58cff", mittel: "var(--accent)", optimistisch: "#3fd17a" };

const fmtDauer = (m) => {
  if (m == null) return "nicht in 35 J.";
  if (m === 0) return "schon erreicht";
  const y = Math.floor(m / 12), mo = m % 12;
  return y === 0 ? `in ${mo} Mon.` : mo === 0 ? `in ${y} J.` : `in ${y} J. ${mo} M.`;
};
const fmtJahr = (m) => {
  if (m == null || m === 0) return "";
  const d = new Date(); d.setMonth(d.getMonth() + m);
  return d.toLocaleDateString("de-DE", { month: "short", year: "numeric" });
};

const ZielInput = ({ label, value, onChange, suffix = "€", step = 100, width = 110 }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "var(--muted)" }}>
    {label}
    <span style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 7, padding: "5px 9px", width }}>
      <input type="number" value={value ?? ""} step={step}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: "var(--fg)", fontFamily: "var(--mono)", fontSize: 13 }} />
      <span style={{ color: "var(--muted)" }}>{suffix}</span>
    </span>
  </label>
);

const ZieleChart = ({ yearly, goals, height = 300 }) => {
  const [ref, size] = useElementSize();
  const [hover, setHover] = React.useState(null);
  const width = Math.max(size.w, 320);
  const padL = 64, padR = 16, padT = 14, padB = 28;
  const w = width - padL - padR, h = height - padT - padB;
  // Achse bis knapp über das höchste Ziel bzw. die mittlere Linie — sonst
  // drückt das optimistische Szenario nach 35 Jahren alles andere platt.
  const top = Math.max(...goals.map(g => g.cumulative), ...yearly.map(r => r.mittel)) * 1.05;
  const { axMin, axMax, ticks } = niceAxis(0, top);
  const x = (i) => padL + (i / Math.max(yearly.length - 1, 1)) * w;
  const y = (v) => padT + h - ((Math.min(v, axMax) - axMin) / (axMax - axMin || 1)) * h;
  const path = (k) => yearly.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r[k]).toFixed(1)}`).join(" ");
  const band = yearly.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r.optimistisch).toFixed(1)}`).join(" ")
    + " " + yearly.slice().reverse().map((r, j) => `L${x(yearly.length - 1 - j).toFixed(1)},${y(r.pessimistisch).toFixed(1)}`).join(" ") + " Z";
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left - padL) / w) * (yearly.length - 1));
    if (i >= 0 && i < yearly.length) setHover({ i, px: e.clientX - rect.left });
  };
  const hr = hover ? yearly[hover.i] : null;
  const year0 = new Date().getFullYear();

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <svg width={width} height={height} style={{ display: "block" }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? "" : "2 4"} />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--muted)" fontFamily="var(--mono)">{compactNum(t)}</text>
          </g>
        ))}
        {yearly.filter(r => r.year % 5 === 0).map(r => (
          <text key={r.year} x={x(r.year)} y={height - 8} textAnchor="middle" fontSize="10" fill="var(--muted)" fontFamily="var(--mono)">{year0 + r.year}</text>
        ))}
        <path d={band} fill="var(--accent)" opacity="0.14" />
        {goals.map(g => g.cumulative <= axMax && (
          <g key={g.id}>
            <line x1={padL} x2={width - padR} y1={y(g.cumulative)} y2={y(g.cumulative)} stroke="var(--warn)" strokeDasharray="5 4" opacity="0.7" />
            <text x={width - padR - 4} y={y(g.cumulative) - 5} textAnchor="end" fontSize="10" fill="var(--warn)">{g.name}</text>
          </g>
        ))}
        {["pessimistisch", "optimistisch", "mittel"].map(k => (
          <path key={k} d={path(k)} fill="none" stroke={ZIEL_COLORS[k]} strokeWidth={k === "mittel" ? 2.4 : 1.3} strokeDasharray={k === "mittel" ? "" : "4 3"} />
        ))}
        {hr && <line x1={x(hover.i)} x2={x(hover.i)} y1={padT} y2={padT + h} stroke="var(--line-strong)" />}
      </svg>
      {hr && (
        <div style={{ position: "absolute", top: 8, left: Math.min(hover.px + 14, width - 210), background: "var(--bg-1)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px", fontSize: 12, pointerEvents: "none", boxShadow: "0 4px 12px var(--shadow)", minWidth: 190 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontFamily: "var(--mono)" }}>{year0 + hr.year}</div>
          {["optimistisch", "mittel", "pessimistisch"].map(k => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
              <span style={{ color: "var(--muted)" }}>{k}</span>
              <span style={{ fontFamily: "var(--mono)", color: ZIEL_COLORS[k] }}>{fmtEUR(hr[k], { decimals: 0 })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const PageZiele = () => {
  const [data, setData] = React.useState(null);
  const [goals, setGoals] = React.useState(null);
  const [assump, setAssump] = React.useState(null);
  const [savings, setSavings] = React.useState(null);
  const [error, setError] = React.useState("");
  const first = React.useRef(true);

  React.useEffect(() => {
    fetch("/api/ziele").then(r => r.json()).then(d => {
      setData(d); setGoals(d.goals_config); setAssump(d.assumptions); setSavings(Math.round(d.monthly_savings));
    }).catch(e => setError(e.message));
  }, []);

  // Jede Änderung neu rechnen und merken — mit kurzer Verzögerung beim Tippen.
  React.useEffect(() => {
    if (!goals || !assump) return;
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => {
      fetch("/api/ziele", {
        method: "POST", headers: { "Content-Type": "application/json" },
        // Der "realistische" Wert wird nicht festgeschrieben, damit er mit
        // jedem neuen Monat mitwandert. Nur eine eigene Zahl wird gespeichert.
        body: JSON.stringify({ goals, assumptions: assump,
          monthly_savings: data && savings === Math.round(data.start.monthly_savings_real) ? null : savings }),
      }).then(r => r.json()).then(setData).catch(e => setError(e.message));
    }, 350);
    return () => clearTimeout(t);
  }, [JSON.stringify(goals), JSON.stringify(assump), savings]);

  if (error && !data) return <EmptyState title="Ziele nicht berechenbar" desc={error} />;
  if (!data || !goals) return <Spinner />;

  const s = data.start;
  const setGoal = (id, patch) => setGoals(gs => gs.map(g => g.id === id ? { ...g, ...patch } : g));
  const setA = (k, v) => setAssump(a => ({ ...a, [k]: v ?? 0 }));
  const cashShare = s.total ? (s.cash / s.total) * 100 : 0;

  return (
    <div style={{ padding: "24px 32px 48px", display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Ausgangslage */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        <Card><Stat label="Verfügbares Vermögen" value={fmtEUR(s.total, { decimals: 0 })} large
          sub={s.gebunden ? `ohne ${fmtEUR(s.gebunden, { decimals: 0 })} gebunden (Rentenverträge, Kaution)` : "Konten, Depot, Krypto"} /></Card>
        <Card><Stat label="Davon Cash" value={fmtEUR(s.cash, { decimals: 0 })}
          sub={`${cashShare.toFixed(0)} % · ING ${fmtEUR(s.liquid, { decimals: 0 })} · TR ${fmtEUR(s.broker_cash, { decimals: 0 })}`} /></Card>
        <Card><Stat label="Davon investiert" value={fmtEUR(s.invested, { decimals: 0 })} sub={`${(100 - cashShare).toFixed(0)} %${s.crypto ? ` · inkl. ${fmtEUR(s.crypto, { decimals: 0 })} Krypto` : " · Depot"}`} /></Card>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <Stat label="Sparrate / Monat" value={fmtEUR(savings, { decimals: 0 })}
              sub={`Ø ${s.window[0]} – ${s.window[s.window.length - 1]}`} />
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            <Btn size="sm" variant={savings === Math.round(s.monthly_savings_real) ? "primary" : "secondary"} onClick={() => setSavings(Math.round(s.monthly_savings_real))}>
              realistisch {fmtEUR(s.monthly_savings_real, { decimals: 0 })}
            </Btn>
            <Btn size="sm" variant={savings === Math.round(s.monthly_savings_max) ? "primary" : "secondary"} onClick={() => setSavings(Math.round(s.monthly_savings_max))}>
              ohne Einmaliges {fmtEUR(s.monthly_savings_max, { decimals: 0 })}
            </Btn>
          </div>
        </Card>
      </div>

      {/* Ziele */}
      <Card padding={0}>
        <div style={{ padding: "16px 20px 10px" }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Deine Ziele</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>
            In heutiger Kaufkraft. Die Ziele bauen aufeinander auf: jedes kommt zusätzlich zu den vorherigen.
            „Erreicht" heißt, dein Vermögen deckt dieses Ziel und alle davor.
          </div>
        </div>
        {data.goals.map((g, i) => {
          const cfg = goals.find(x => x.id === g.id) || g;
          const m = g.reached_months;
          const done = m.mittel === 0;
          return (
            <div key={g.id} style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.3fr) minmax(260px, 2fr) minmax(200px, 1.2fr)", gap: 16, padding: "14px 20px", borderTop: "1px solid var(--line)", alignItems: "center" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, background: done ? "var(--pos)" : "var(--bg-2)", color: done ? "var(--on-accent)" : "var(--muted)" }}>
                    {done ? "✓" : i + 1}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{g.name}</span>
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 600, marginTop: 6 }}>{fmtEUR(g.amount, { decimals: 0 })}</div>
                {i > 0 && <div style={{ fontSize: 11, color: "var(--muted)" }}>kumuliert {fmtEUR(g.cumulative, { decimals: 0 })}</div>}
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                {g.type === "notgroschen" && (
                  <ZielInput label="Monate Grundlast" value={cfg.months} suffix="M." step={1} width={90}
                    onChange={v => setGoal(g.id, { months: v || 0 })} />
                )}
                {g.type === "immobilie" && (<>
                  <ZielInput label="Kaufpreis" value={cfg.price} step={10000} width={130} onChange={v => setGoal(g.id, { price: v || 0 })} />
                  <ZielInput label="Eigenkapital" value={cfg.equity_pct} suffix="%" step={5} width={80} onChange={v => setGoal(g.id, { equity_pct: v || 0 })} />
                  <ZielInput label="Nebenkosten" value={cfg.costs_pct} suffix="%" step={1} width={80} onChange={v => setGoal(g.id, { costs_pct: v || 0 })} />
                  <ZielInput label="Max. aus Depot" value={cfg.max_depot_pct ?? 100} suffix="%" step={10} width={80} onChange={v => setGoal(g.id, { max_depot_pct: v ?? 100 })} />
                </>)}
                {g.type === "fire" && (<>
                  <ZielInput label="Entnahmerate" value={cfg.swr} suffix="%" step={0.25} width={80} onChange={v => setGoal(g.id, { swr: v || 0 })} />
                  <ZielInput label="Rente bereits erreicht" value={assump.pension_earned} suffix="€/M." step={50} width={120} onChange={v => setA("pension_earned", v)} />
                  <ZielInput label={`Rente bei Arbeit bis ${assump.retirement_age}`} value={assump.pension_at_retirement} suffix="€/M." step={50} width={130} onChange={v => setA("pension_at_retirement", v)} />
                  <ZielInput label="Abzug KV/PV" value={assump.pension_deduction_pct ?? 11} suffix="%" step={1} width={70} onChange={v => setA("pension_deduction_pct", v)} />
                  <ZielInput label="Alter heute" value={assump.age} suffix="J." step={1} width={70} onChange={v => setA("age", v)} />
                  <ZielInput label="Rentenbeginn" value={assump.retirement_age} suffix="J." step={1} width={70} onChange={v => setA("retirement_age", v)} />
                </>)}
                <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5, flexBasis: "100%" }}>
                  {g.type === "notgroschen" && <>{cfg.months} × Grundlast von {fmtEUR(s.monthly_expenses, { decimals: 0 })} — bleibt als Cash liegen.</>}
                  {g.type === "immobilie" && <>{(cfg.max_depot_pct ?? 100) < 100 && <>Aus dem Depot höchstens {cfg.max_depot_pct} % (heute {fmtEUR(s.invested * (cfg.max_depot_pct ?? 100) / 100, { decimals: 0 })}), der Rest aus Cash. </>}Kredit danach ca. {fmtEUR(g.loan, { decimals: 0 })} · Rate ca. <strong style={{ color: "var(--fg)" }}>{fmtEUR(g.monthly_rate, { decimals: 0 })}/Monat</strong> ({assump.loan_rate} % Zins + {assump.loan_repayment} % Tilgung)</>}
                  {g.type === "fire" && <>
                    Nötiges <strong style={{ color: "var(--fg)" }}>freies</strong> Vermögen, um aufzuhören{g.age_at ? <> — mit ca. <strong style={{ color: "var(--fg)" }}>{String(g.age_at).replace(".", ",")} Jahren</strong></> : ""}.
                    Bis {assump.retirement_age} trägt es die vollen Ausgaben ({fmtEUR(s.monthly_expenses, { decimals: 0 })}/Monat), danach nur die Lücke
                    {g.state_pension > 0
                      ? <> nach {fmtEUR(g.state_pension, { decimals: 0 })} gesetzlicher Rente netto{g.state_pension_mode === "renteninformation" ? <> (bei Ausstieg {g.age_at ? `mit ${String(g.age_at).replace(".", ",")}` : `mit ${assump.retirement_age}`} — wer früher aufhört, zahlt weniger ein)</> : ""}</>
                      : <> — <span style={{ color: "var(--warn)" }}>gesetzliche Rente noch nicht eingetragen (Renteninformation: „bereits erreicht“ und „bei Fortsetzung der Beiträge“)</span></>}
                    {g.vorsorge_now > 0 ? <> und abzüglich deiner Rentenverträge (heute {fmtEUR(g.vorsorge_now, { decimals: 0 })}, wachsen bis {assump.retirement_age} weiter)</> : ""}.
                    Zum Vergleich die einfache Rechnung (Ausgaben ÷ Entnahmerate, ohne Renten): {fmtEUR(g.simple_target, { decimals: 0 })}.
                  </>}
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: done ? "var(--pos)" : "var(--fg)" }}>{fmtDauer(m.mittel)}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{fmtJahr(m.mittel)}</div>
                {!done && (
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                    Spanne: {fmtDauer(m.optimistisch).replace("in ", "")} bis {m.pessimistisch == null ? "über 35 J." : fmtDauer(m.pessimistisch).replace("in ", "")}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </Card>

      {/* Verlauf */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Vermögen in heutiger Kaufkraft</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
              Depotrendite {data.scenarios.pessimistisch} / {data.scenarios.mittel} / {data.scenarios.optimistisch} % p. a. nominal,
              Cash {assump.cash_rate} %, Inflation {assump.inflation} %. Gestrichelt: deine Ziele.
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--muted)", alignItems: "center" }}>
            {["optimistisch", "mittel", "pessimistisch"].map(k => (
              <span key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 14, height: 2, background: ZIEL_COLORS[k], display: "inline-block" }} />{k}
              </span>
            ))}
          </div>
        </div>
        <ZieleChart yearly={data.yearly} goals={data.goals} />
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        {/* Hebel */}
        <Card>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Was dein letztes Ziel verschiebt</div>
          <div style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 12px" }}>
            {data.goals.length ? data.goals[data.goals.length - 1].name : ""} im mittleren Szenario: {fmtDauer(data.base_months)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.levers.map(l => {
              const d = l.delta_months;
              const tone = d == null ? "var(--neg)" : d > 0 ? "var(--pos)" : d < 0 ? "var(--neg)" : "var(--muted)";
              return (
                <div key={l.label} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 12px", background: "var(--bg-2)", borderRadius: 8, borderLeft: `3px solid ${tone}` }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{l.label}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{l.detail}</div>
                  </div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, color: tone, whiteSpace: "nowrap" }}>
                    {d == null ? "nicht erreicht" : d === 0 ? "±0" : `${d > 0 ? "−" : "+"}${Math.abs(d) >= 12 ? (Math.abs(d) / 12).toFixed(1).replace(".", ",") + " J." : Math.abs(d) + " M."}`}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Annahmen */}
        <Card>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Annahmen</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <ZielInput label="Anteil Sparrate ins Depot" value={assump.invest_share} suffix="%" step={10} width={100} onChange={v => setA("invest_share", v)} />
            <ZielInput label="Inflation" value={assump.inflation} suffix="%" step={0.25} width={90} onChange={v => setA("inflation", v)} />
            <ZielInput label="Zins auf Cash (netto)" value={assump.cash_rate} suffix="%" step={0.25} width={90} onChange={v => setA("cash_rate", v)} />
            <ZielInput label="Bauzins" value={assump.loan_rate} suffix="%" step={0.1} width={90} onChange={v => setA("loan_rate", v)} />
            <ZielInput label="Tilgung" value={assump.loan_repayment} suffix="%" step={0.5} width={90} onChange={v => setA("loan_repayment", v)} />
            <ZielInput label="Sparrate (eigene)" value={savings} step={50} width={110} onChange={v => setSavings(v ?? 0)} />
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 14, lineHeight: 1.55 }}>
            „Realistisch" = Einnahmen minus alle Ausgaben inkl. Urlaub und Sonderausgaben. „Ohne Einmaliges" ist die Obergrenze.
            Eingaben werden automatisch gespeichert. Keine Anlageberatung.
          </div>
        </Card>
      </div>
    </div>
  );
};

window.PageZiele = PageZiele;
