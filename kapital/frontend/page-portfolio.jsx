// Page: Portfolio

const PagePortfolio = () => {
  const { data, loading } = useFetch("/api/portfolio");
  const [tab, setTab] = React.useState("entwicklung");

  if (loading) return <Spinner />;
  if (!data || (!data.positions?.length && !data.sold?.length)) return (
    <EmptyState title="Keine Portfoliodaten" desc="Importiere Trade Republic CSV oder PDF." />
  );

  const { positions = [], sold = [], summary = {}, allocation = {}, dividends = [], trades = [], income = {} } = data;
  const plColor = (v) => v == null ? "var(--muted)" : v >= 0 ? "var(--pos)" : "var(--neg)";
  const fmtXirr = (v) => v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)} %`;

  const tabs = [
    ["entwicklung", "Entwicklung"],
    ["positionen", "Positionen"],
    ["analyse", "Analyse"],
    ["trades", "Trades"],
    ["dividenden", "Dividenden"],
    ["krypto", "Krypto"],
    ["ki_prognose", "KI-Prognose"],
  ];
  if (sold.length > 0) tabs.splice(2, 0, ["realisiert", "Realisiert"]);

  return (
    <div style={{ padding: "24px 32px 48px", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <Card>
          <Stat label="Depotwert" value={fmtEUR(summary.total_value)} large sub={`${summary.n_positions} Positionen`} />
        </Card>
        <Card>
          <Stat
            label="Unrealisiert"
            value={fmtEUR(summary.total_pl)}
            delta={summary.total_pl_pct != null ? `${summary.total_pl_pct > 0 ? "+" : ""}${summary.total_pl_pct?.toFixed(2)} %` : null}
            deltaTone={summary.total_pl >= 0 ? "pos" : "neg"}
            sub="Buchgewinn/-verlust"
          />
        </Card>
        <Card>
          <Stat
            label="Realisiert"
            value={fmtEUR(summary.total_realized_gain)}
            deltaTone={summary.total_realized_gain >= 0 ? "pos" : "neg"}
            sub={`${summary.n_sold || 0} Positionen verkauft`}
          />
        </Card>
        <Card>
          <Stat label="Freies Guthaben" value={fmtEUR(summary.tr_cash)} sub="TR Konto" />
          {allocation.etf_pct > 0 && (
            <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--muted)", marginTop: 10 }}>
              <span>ETFs <strong style={{ color: "var(--fg)" }}>{allocation.etf_pct?.toFixed(0)}%</strong></span>
              <span>Aktien <strong style={{ color: "var(--fg)" }}>{allocation.stock_pct?.toFixed(0)}%</strong></span>
            </div>
          )}
        </Card>
      </div>

      {/* Tabs */}
      <Segmented
        options={tabs.map(([v, l]) => ({ value: v, label: l }))}
        value={tab}
        onChange={setTab}
      />

      <WarningStrip warnings={data.warnings} />

      {tab === "entwicklung" && <EntwicklungTab />}
      {tab === "krypto" && <KryptoTab />}

      {/* Positionen */}
      {tab === "positionen" && (
        positions.length === 0 ? <EmptyState title="Keine offenen Positionen" /> : (
          <Card padding={0}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid var(--line)" }}>
                  <th style={{ textAlign: "left", padding: "11px 20px", fontWeight: 500 }}>Name</th>
                  <th style={{ textAlign: "right", padding: "11px 14px", fontWeight: 500 }}>Stück</th>
                  <th style={{ textAlign: "right", padding: "11px 14px", fontWeight: 500 }}>Ø Kauf</th>
                  <th style={{ textAlign: "right", padding: "11px 14px", fontWeight: 500 }}>Kurs</th>
                  <th style={{ textAlign: "right", padding: "11px 14px", fontWeight: 500 }}>Wert</th>
                  <th style={{ textAlign: "right", padding: "11px 14px", fontWeight: 500 }}>G/V</th>
                  <th style={{ textAlign: "right", padding: "11px 20px", fontWeight: 500 }}>XIRR</th>
                </tr>
              </thead>
              <tbody>
                {positions.map(p => (
                  <tr key={p.isin} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "12px 20px" }}>
                      <div style={{ fontWeight: 500 }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)", marginTop: 2 }}>
                        {p.isin}
                        {p.is_etf && <span style={{ marginLeft: 6, padding: "1px 5px", background: "var(--accent-soft)", color: "var(--accent)", borderRadius: 4, fontSize: 9 }}>ETF</span>}
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 12 }}>{p.qty}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 12 }}>
                      {p.avg_price != null ? fmtEUR(p.avg_price) : <span style={{ color: "var(--muted)" }}>—</span>}
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 12 }}>
                      {p.current_price != null ? fmtEUR(p.current_price) : <span style={{ color: "var(--muted)" }}>—</span>}
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "var(--mono)", fontWeight: 600 }}>{fmtEUR(p.value)}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right" }}>
                      <div style={{ fontFamily: "var(--mono)", fontWeight: 500, color: plColor(p.pl), fontSize: 13 }}>
                        {p.pl >= 0 ? "+" : ""}{fmtEUR(p.pl)}
                      </div>
                      {p.pl_pct != null && (
                        <div style={{ fontSize: 10, color: plColor(p.pl_pct), fontFamily: "var(--mono)" }}>
                          {p.pl_pct >= 0 ? "+" : ""}{p.pl_pct?.toFixed(2)} %
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px 20px", textAlign: "right" }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: p.xirr == null ? "var(--muted)" : plColor(p.xirr) }}>
                        {fmtXirr(p.xirr)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      {/* Analyse */}
      {tab === "analyse" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Income breakdown */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            <Card>
              <Stat label="Zinsen (TR)" value={fmtEUR(income.interest || 0)} deltaTone="pos" sub="Zinseinnahmen" />
            </Card>
            <Card>
              <Stat label="Dividenden" value={fmtEUR(income.dividends || 0)} deltaTone="pos" sub="Ausschüttungen" />
            </Card>
            <Card>
              <Stat label="Cashback / Prämien" value={fmtEUR(income.cashback || 0)} deltaTone="pos" sub="Runden, Prämien" />
            </Card>
            <Card>
              <Stat label="Sonstige Einnahmen" value={fmtEUR(income.other || 0)} deltaTone="neutral" sub="Sonstiges" />
            </Card>
          </div>

          {/* Portfolio health */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Card>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Allokation</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { label: "ETFs", value: allocation.etf_value, pct: allocation.etf_pct, color: "var(--accent)" },
                  { label: "Einzelaktien", value: allocation.stock_value, pct: allocation.stock_pct, color: "var(--neg)" },
                ].map(row => (
                  <div key={row.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 13 }}>{row.label}</span>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 500 }}>{fmtEUR(row.value)}</span>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", marginLeft: 8 }}>{row.pct?.toFixed(1)} %</span>
                      </div>
                    </div>
                    <div style={{ height: 6, background: "var(--bg-2)", borderRadius: 3 }}>
                      <div style={{ width: `${row.pct || 0}%`, height: "100%", background: row.color, opacity: 0.95, borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
                <div style={{ paddingTop: 8, borderTop: "1px solid var(--line)", fontSize: 12, color: "var(--muted)" }}>
                  Top-3-Konzentration: <strong style={{ color: "var(--fg)" }}>{allocation.top3_pct || 0} %</strong> des Depots
                  {allocation.top3_pct > 60 && <span style={{ color: "var(--neg)", marginLeft: 6 }}>⚠ Hohe Konzentration</span>}
                </div>
              </div>
            </Card>

            <Card>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Performance (XIRR)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {positions
                  .filter(p => p.xirr != null)
                  .sort((a, b) => (b.xirr || 0) - (a.xirr || 0))
                  .slice(0, 8)
                  .map(p => (
                    <div key={p.isin} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{p.name}</span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, flexShrink: 0, color: plColor(p.xirr) }}>
                        {fmtXirr(p.xirr)}
                      </span>
                    </div>
                  ))}
                {positions.filter(p => p.xirr == null).length > 0 && (
                  <div style={{ fontSize: 11, color: "var(--muted)", paddingTop: 4 }}>
                    {positions.filter(p => p.xirr == null).length} Positionen ohne Preis — XIRR nicht berechenbar
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Underperformers */}
          {positions.filter(p => p.pl_pct != null && p.pl_pct < -10).length > 0 && (
            <Card>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Unterdurchschnittliche Positionen</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>Buchverlust &gt; 10 %</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {positions.filter(p => p.pl_pct != null && p.pl_pct < -10).map(p => (
                  <div key={p.isin} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--neg-soft)", borderRadius: 8, border: "1px solid var(--neg-soft)" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)" }}>{p.isin}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "var(--mono)", color: "var(--neg)", fontWeight: 600 }}>{p.pl_pct?.toFixed(2)} %</div>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--neg)" }}>{fmtEUR(p.pl)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Realisierte Gewinne/Verluste */}
      {tab === "realisiert" && (
        sold.length === 0 ? <EmptyState title="Keine realisierten Positionen" /> : (
          <Card padding={0}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600 }}>Verkaufte Positionen</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 600, color: plColor(summary.total_realized_gain) }}>
                Gesamt: {summary.total_realized_gain >= 0 ? "+" : ""}{fmtEUR(summary.total_realized_gain)}
              </span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid var(--line)" }}>
                  <th style={{ textAlign: "left", padding: "11px 20px", fontWeight: 500 }}>Name</th>
                  <th style={{ textAlign: "right", padding: "11px 14px", fontWeight: 500 }}>Investiert</th>
                  <th style={{ textAlign: "right", padding: "11px 14px", fontWeight: 500 }}>Erlöse</th>
                  <th style={{ textAlign: "right", padding: "11px 20px", fontWeight: 500 }}>Realisierter G/V</th>
                </tr>
              </thead>
              <tbody>
                {sold.map(p => (
                  <tr key={p.isin} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "12px 20px" }}>
                      <div style={{ fontWeight: 500 }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)", marginTop: 2 }}>{p.isin}</div>
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 12 }}>{fmtEUR(p.total_invested)}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 12 }}>{fmtEUR(p.total_proceeds)}</td>
                    <td style={{ padding: "12px 20px", textAlign: "right" }}>
                      <span style={{ fontFamily: "var(--mono)", fontWeight: 600, color: plColor(p.realized_gain) }}>
                        {p.realized_gain >= 0 ? "+" : ""}{fmtEUR(p.realized_gain)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      {/* Trades */}
      {tab === "trades" && (
        trades.length === 0 ? <EmptyState title="Keine Trades" /> : (
          <Card padding={0}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid var(--line)" }}>
                  <th style={{ textAlign: "left", padding: "11px 20px", fontWeight: 500 }}>Datum</th>
                  <th style={{ textAlign: "left", padding: "11px 14px", fontWeight: 500 }}>Art</th>
                  <th style={{ textAlign: "left", padding: "11px 14px", fontWeight: 500 }}>ISIN</th>
                  <th style={{ textAlign: "right", padding: "11px 14px", fontWeight: 500 }}>Stück</th>
                  <th style={{ textAlign: "right", padding: "11px 14px", fontWeight: 500 }}>Preis</th>
                  <th style={{ textAlign: "right", padding: "11px 20px", fontWeight: 500 }}>Betrag</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "11px 20px", fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{t.date}</td>
                    <td style={{ padding: "11px 14px" }}>
                      <Pill tone={t.action === "BUY" ? "pos" : "neg"} size="sm">{t.action === "BUY" ? "Kauf" : "Verkauf"}</Pill>
                    </td>
                    <td style={{ padding: "11px 14px", fontFamily: "var(--mono)", fontSize: 11 }}>{t.isin}</td>
                    <td style={{ padding: "11px 14px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 12 }}>{t.qty}</td>
                    <td style={{ padding: "11px 14px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 12 }}>{fmtEUR(t.price)}</td>
                    <td style={{ padding: "11px 20px", textAlign: "right", fontFamily: "var(--mono)", fontWeight: 500, color: t.amount > 0 ? "var(--pos)" : "var(--fg)" }}>
                      {fmtEUR(t.amount, { sign: t.amount > 0 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      {/* Dividenden */}
      {tab === "dividenden" && (
        dividends.length === 0 ? <EmptyState title="Keine Dividenden / Ausschüttungen" /> : (
          <Card padding={0}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600 }}>Dividenden & Ausschüttungen</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 600, color: "var(--pos)" }}>
                +{fmtEUR(income.dividends)}
              </span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid var(--line)" }}>
                  <th style={{ textAlign: "left", padding: "11px 20px", fontWeight: 500 }}>Datum</th>
                  <th style={{ textAlign: "left", padding: "11px 14px", fontWeight: 500 }}>ISIN</th>
                  <th style={{ textAlign: "left", padding: "11px 14px", fontWeight: 500 }}>Art</th>
                  <th style={{ textAlign: "right", padding: "11px 20px", fontWeight: 500 }}>Betrag</th>
                </tr>
              </thead>
              <tbody>
                {dividends.map((d, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "11px 20px", fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{d.date}</td>
                    <td style={{ padding: "11px 14px", fontFamily: "var(--mono)", fontSize: 11 }}>{d.isin}</td>
                    <td style={{ padding: "11px 14px", fontSize: 12 }}>{d.type}</td>
                    <td style={{ padding: "11px 20px", textAlign: "right", fontFamily: "var(--mono)", fontWeight: 500, color: "var(--pos)" }}>
                      +{fmtEUR(d.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}
      {/* KI-Prognose */}
      {tab === "ki_prognose" && (
        <KiPrognoseTab positions={positions} />
      )}
    </div>
  );
};

const KiPrognoseTab = ({ positions }) => {
  const [selectedIsin, setSelectedIsin] = React.useState(positions[0]?.isin || "");
  const [days, setDays] = React.useState(30);
  const [kronosModel, setKronosModel] = React.useState("small");
  const [result, setResult] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [apiKeyInput, setApiKeyInput] = React.useState("");
  const [apiKeyStatus, setApiKeyStatus] = React.useState(null); // {set: bool, preview: str}
  const [savingKey, setSavingKey] = React.useState(false);
  const toast = useToast();

  React.useEffect(() => {
    fetch("/api/settings").then(r => r.json()).then(d => setApiKeyStatus(d)).catch(() => {});
  }, []);

  const saveApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    setSavingKey(true);
    const res = await fetch("/api/settings/twelve_data_key", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKeyInput.trim() }),
    });
    setSavingKey(false);
    if (res.ok) {
      setApiKeyStatus({ twelve_data_api_key_set: true, twelve_data_api_key_preview: `${apiKeyInput.slice(0, 4)}…` });
      setApiKeyInput("");
      toast("Twelve Data API-Key gespeichert");
    }
  };

  const selectedPos = positions.find(p => p.isin === selectedIsin);

  const runForecast = async () => {
    if (!selectedIsin) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/kronos/forecast?isin=${selectedIsin}&days=${days}&model=${kronosModel}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || "Unbekannter Fehler");
      setResult(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Build chart data: historical (type=hist) + forecast (type=fc)
  const chartData = React.useMemo(() => {
    if (!result) return [];
    const hist = result.historical.map(d => ({ date: d.date, hist: d.close, fc: null }));
    // Overlap: last hist point as first forecast anchor
    const lastHist = hist[hist.length - 1];
    const fc = result.forecast.map((d) => ({
      date: d.date,
      hist: null,
      fc: d.close,
    }));
    // Join last hist point to first fc point for visual continuity
    fc[0] = { ...fc[0], histAnchor: lastHist.hist };
    return [...hist, ...fc];
  }, [result]);

  const lastClose = result?.historical?.at(-1)?.close;
  const fcClose = result?.forecast?.at(-1)?.close;
  const fcChange = lastClose && fcClose ? ((fcClose - lastClose) / lastClose) * 100 : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Controls */}
      <Card>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Kronos KI-Kursprognose</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "end" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Position</div>
            <select
              value={selectedIsin}
              onChange={e => setSelectedIsin(e.target.value)}
              style={{ width: "100%", padding: "9px 14px", background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 10, color: "var(--fg)", fontSize: 13, fontFamily: "var(--mono)", outline: "none" }}
            >
              {positions.map(p => (
                <option key={p.isin} value={p.isin}>{p.name} ({p.isin})</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Modell</div>
            <select
              value={kronosModel}
              onChange={e => { setKronosModel(e.target.value); setResult(null); }}
              style={{ padding: "9px 14px", background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 10, color: "var(--fg)", fontSize: 13, fontFamily: "var(--mono)", outline: "none" }}
            >
              <option value="mini">mini · 4M</option>
              <option value="small">small · 25M</option>
              <option value="base">base · 100M</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Tage</div>
            <select
              value={days}
              onChange={e => setDays(parseInt(e.target.value))}
              style={{ padding: "9px 14px", background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 10, color: "var(--fg)", fontSize: 13, fontFamily: "var(--mono)", outline: "none" }}
            >
              {[10, 20, 30, 45, 60].map(d => <option key={d} value={d}>{d} Tage</option>)}
            </select>
          </div>
          <Btn variant="primary" onClick={runForecast} disabled={loading || !selectedIsin}>
            {loading ? "Lädt …" : "Prognose starten"}
          </Btn>
        </div>

        {/* First-use hint */}
        {!result && !loading && !error && (
          <div style={{ marginTop: 14, padding: "10px 14px", background: "var(--bg-2)", borderRadius: 8, fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
            <strong style={{ color: "var(--fg)" }}>Kronos</strong> ist ein KI-Foundation-Model (AAAI 2026), trainiert auf Candlestick-Daten von 45+ Börsen.{" "}
            Downloadgröße: <strong style={{ color: "var(--fg)" }}>mini ~20 MB · small ~100 MB · base ~400 MB</strong>. Jedes Modell wird einmalig von HuggingFace geladen und dann gecacht.
          </div>
        )}
      </Card>

      {/* Twelve Data API-Key */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Twelve Data API-Key</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
              Fallback-Datenquelle für ISINs, die yfinance nicht kennt. Kostenlos unter{" "}
              <span style={{ color: "var(--accent)", fontFamily: "var(--mono)" }}>twelvedata.com</span>
            </div>
          </div>
          {apiKeyStatus?.twelve_data_api_key_set && (
            <Pill tone="pos" size="sm">✓ {apiKeyStatus.twelve_data_api_key_preview}</Pill>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            type="password"
            value={apiKeyInput}
            onChange={e => setApiKeyInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && saveApiKey()}
            placeholder={apiKeyStatus?.twelve_data_api_key_set ? "Neuen Key eingeben zum Überschreiben …" : "API-Key eingeben …"}
            style={{
              flex: 1, padding: "8px 12px", background: "var(--bg-2)", border: "1px solid var(--line)",
              borderRadius: 8, color: "var(--fg)", fontSize: 12, fontFamily: "var(--mono)", outline: "none",
            }}
          />
          <Btn variant="secondary" onClick={saveApiKey} disabled={savingKey || !apiKeyInput.trim()}>
            {savingKey ? "Speichert …" : "Speichern"}
          </Btn>
        </div>
      </Card>

      {/* Error */}
      {error && (
        <div style={{ padding: "14px 18px", background: "var(--neg-soft)", border: "1px solid var(--neg-soft)", borderRadius: 10, fontSize: 13, color: "var(--neg)" }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <Card>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "32px 0" }}>
            <Spinner />
            <div style={{ fontSize: 13, color: "var(--muted)" }}>Kronos läuft … (erste Anfrage lädt Modell von HuggingFace)</div>
          </div>
        </Card>
      )}

      {/* Results */}
      {result && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            <Card>
              <Stat label="Letzter Kurs" value={fmtMoney(lastClose, result.currency || "EUR")} sub={result.historical.at(-1)?.date} />
            </Card>
            <Card>
              <Stat
                label={`Prognose in ${days} Tagen`}
                value={fmtMoney(fcClose, result.currency || "EUR")}
                delta={fcChange != null ? `${fcChange >= 0 ? "+" : ""}${fcChange.toFixed(2)} %` : null}
                deltaTone={fcChange >= 0 ? "pos" : "neg"}
                sub={result.forecast.at(-1)?.date}
              />
            </Card>
            <Card>
              <Stat label="Ticker" value={result.ticker} sub={`${result.isin} · Kronos-${result.model}`} />
            </Card>
          </div>

          <Card padding={0}>
            <div style={{ padding: "18px 22px 0" }}>
              <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>KI-Kursprognose · {selectedPos?.name}</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>Verlauf (60 Tage) + Prognose ({days} Tage)</div>
            </div>
            <div style={{ padding: "14px 12px 4px" }}>
              <KronosChart historical={result.historical} forecast={result.forecast} currency={result.currency || "EUR"} />
            </div>
            <div style={{ padding: "8px 22px 16px", display: "flex", gap: 20, fontSize: 11, color: "var(--muted)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 12, height: 2, background: "var(--muted)", display: "inline-block", borderRadius: 1 }} /> Verlauf
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 12, height: 2, background: "var(--accent)", display: "inline-block", borderRadius: 1 }} /> KI-Prognose
              </span>
            </div>
          </Card>

          {/* Disclaimer */}
          <div style={{ padding: "12px 16px", background: "rgba(250,204,21,0.06)", border: "1px solid rgba(250,204,21,0.2)", borderRadius: 8, fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
            <strong style={{ color: "rgba(250,204,21,0.8)" }}>Hinweis:</strong> Diese Prognose ist eine experimentelle KI-Vorhersage und <strong>keine Anlageempfehlung</strong>. Finanzmärkte sind hochgradig unvorhersehbar. Das Modell basiert auf historischen Kursmustern und berücksichtigt keine Fundamentaldaten, Nachrichten oder makroökonomischen Faktoren.
          </div>
        </>
      )}
    </div>
  );
};

const KronosChart = ({ historical, forecast, currency = "EUR" }) => {
  const [tooltip, setTooltip] = React.useState(null);
  const svgRef = React.useRef(null);

  const width = 800, height = 260;
  const padL = 72, padR = 16, padT = 16, padB = 32;
  const w = width - padL - padR;
  const h = height - padT - padB;

  const allPoints = [...historical, ...forecast];
  const allClose = allPoints.map(d => d.close);
  const { axMin, axMax, ticks: yTicks } = niceAxis(Math.min(...allClose), Math.max(...allClose));

  const n = allPoints.length;
  const xScale = (i) => padL + (i / (n - 1)) * w;
  const yScale = (v) => padT + h - ((v - axMin) / (axMax - axMin)) * h;

  const histPts = historical.map((d, i) => [xScale(i), yScale(d.close)]);
  const fcPts = forecast.map((d, i) => [xScale(historical.length - 1 + i), yScale(d.close)]);
  // Connect forecast to last hist point
  const fcLine = [histPts[histPts.length - 1], ...fcPts];

  const toPath = (pts) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const fcAreaPath = `${toPath(fcLine)} L${fcLine[fcLine.length-1][0]},${padT+h} L${fcLine[0][0]},${padT+h} Z`;

  const showTip = (e, d, isFc) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, d, isFc });
  };

  // X-axis labels: show ~8 evenly spaced dates
  const xLabels = allPoints
    .map((d, i) => ({ i, date: d.date }))
    .filter((_, i) => i % Math.ceil(n / 8) === 0 || i === n - 1);

  const splitX = xScale(historical.length - 1);

  return (
    <div style={{ position: "relative" }}>
      <svg ref={svgRef} width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block" }} onMouseLeave={() => setTooltip(null)}>
        {/* Grid */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={width - padR} y1={yScale(t)} y2={yScale(t)} stroke="var(--line)" strokeWidth="1" strokeDasharray={i === 0 ? "" : "2 4"} />
            <text x={padL - 8} y={yScale(t) + 4} textAnchor="end" fontSize="10" fill="var(--muted)" fontFamily="var(--mono)">{compactNum(t)}</text>
          </g>
        ))}
        {xLabels.map(({ i, date }) => (
          <text key={i} x={xScale(i)} y={height - padB + 16} textAnchor="middle" fontSize="9" fill="var(--muted)" fontFamily="var(--mono)">{date}</text>
        ))}

        {/* Forecast zone background */}
        <rect x={splitX} y={padT} width={width - padR - splitX} height={h} fill="var(--accent)" opacity="0.03" />
        <line x1={splitX} x2={splitX} y1={padT} y2={padT + h} stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />

        {/* Forecast area fill */}
        <defs>
          <linearGradient id="grad-fc" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={fcAreaPath} fill="url(#grad-fc)" />

        {/* Historical line */}
        <path d={toPath(histPts)} fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinejoin="round" opacity="0.7" />

        {/* Forecast line */}
        <path d={toPath(fcLine)} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />

        {/* Hover overlay per point */}
        {allPoints.map((d, i) => (
          <rect
            key={i}
            x={xScale(i) - w / n / 2}
            y={padT}
            width={w / n}
            height={h}
            fill="transparent"
            onMouseEnter={(e) => showTip(e, d, i >= historical.length)}
            onMouseMove={(e) => showTip(e, d, i >= historical.length)}
          />
        ))}

        {/* Endpoint dot */}
        {fcPts.length > 0 && (
          <circle cx={fcPts[fcPts.length-1][0]} cy={fcPts[fcPts.length-1][1]} r="4" fill="var(--accent)" stroke="var(--bg-1)" strokeWidth="2" />
        )}
      </svg>

      {tooltip && (
        <div style={{
          position: "absolute",
          left: tooltip.x + 14,
          top: tooltip.y - 14,
          background: "var(--bg-1)",
          border: `1px solid ${tooltip.isFc ? "var(--accent)" : "var(--line)"}`,
          borderRadius: 6,
          padding: "7px 12px",
          fontSize: 12,
          fontFamily: "var(--mono)",
          color: "var(--fg)",
          pointerEvents: "none",
          zIndex: 20,
          whiteSpace: "nowrap",
          boxShadow: "0 4px 12px var(--shadow)"
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4, color: tooltip.isFc ? "var(--accent)" : "var(--fg)" }}>
            {tooltip.isFc ? "KI-Prognose" : "Kurs"} · {tooltip.d.date}
          </div>
          <div>O: {fmtMoney(tooltip.d.open, currency)} / H: {fmtMoney(tooltip.d.high, currency)}</div>
          <div>L: {fmtMoney(tooltip.d.low, currency)} / <strong>C: {fmtMoney(tooltip.d.close, currency)}</strong></div>
        </div>
      )}
    </div>
  );
};

window.PagePortfolio = PagePortfolio;

// ── Entwicklung: Depot vs. Index vs. Inflation ──────────────────────────────
// Ein Vergleich über IDENTISCHE Cashflows: jede Ein- und Auszahlung des Depots
// wird am selben Tag auch im Vergleichs-ETF gebucht und mit dem HVPI
// fortgeschrieben. Damit bewertet die Kurve die Auswahl der Papiere — nicht,
// wann und wie viel gespart wurde.
const PERF_SERIES = [
  { key: "total_return_value", label: "Dein Depot", color: "var(--accent)", width: 2.4 },
  { key: "benchmark", label: null, color: "#ffb547", width: 2 },
  { key: "inflation_line", label: "Kaufkraft erhalten", color: "#3fd17a", width: 1.6, dash: "6 4" },
  { key: "invested", label: "Netto eingezahlt", color: "var(--muted)", width: 1.2, dash: "2 4" },
];

const PerformanceChart = ({ rows, benchLabel, height = 300 }) => {
  const [ref, size] = useElementSize();
  const [hover, setHover] = React.useState(null);
  const width = Math.max(size.w, 320);
  const padL = 64, padR = 16, padT = 14, padB = 28;
  const w = width - padL - padR, h = height - padT - padB;
  const series = PERF_SERIES.map(s => ({ ...s, label: s.label || benchLabel }));
  const vals = rows.flatMap(r => series.map(s => r[s.key]).filter(v => v != null));
  const { axMin, axMax, ticks } = niceAxis(Math.min(0, ...vals), Math.max(...vals, 1));
  const x = (i) => padL + (i / Math.max(rows.length - 1, 1)) * w;
  const y = (v) => padT + h - ((v - axMin) / (axMax - axMin || 1)) * h;
  const path = (k) => {
    let d = "", pen = false;
    rows.forEach((r, i) => {
      const v = r[k];
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    return d;
  };
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round(((px - padL) / w) * (rows.length - 1));
    if (i >= 0 && i < rows.length) setHover({ i, px });
  };
  const hr = hover ? rows[hover.i] : null;
  // Nur Januare beschriften; der erste Punkt nur, wenn kein Januar direkt folgt
  // (Start im Dezember hätte sonst "2020" und "2021" übereinander gesetzt).
  const yearTicks = rows.map((r, i) => [r, i]).filter(([r, i]) =>
    r.month.endsWith("-01") || (i === 0 && !rows.slice(1, 4).some(x => x.month.endsWith("-01"))));

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <svg width={width} height={height} style={{ display: "block" }}
           onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? "" : "2 4"} />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--muted)" fontFamily="var(--mono)">{compactNum(t)}</text>
          </g>
        ))}
        {yearTicks.map(([r, i]) => (
          <text key={r.month} x={x(i)} y={height - 8} textAnchor="middle" fontSize="10" fill="var(--muted)" fontFamily="var(--mono)">
            {r.month.slice(0, 4)}
          </text>
        ))}
        {series.slice().reverse().map(s => (
          <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth={s.width}
                strokeDasharray={s.dash || ""} strokeLinejoin="round" />
        ))}
        {hr && <line x1={x(hover.i)} x2={x(hover.i)} y1={padT} y2={padT + h} stroke="var(--line-strong)" />}
        {hr && series.map(s => hr[s.key] != null && (
          <circle key={s.key} cx={x(hover.i)} cy={y(hr[s.key])} r="3.5" fill={s.color} stroke="var(--bg-1)" strokeWidth="1.5" />
        ))}
      </svg>
      {hr && (
        <div style={{
          position: "absolute", top: 8, left: Math.min(hover.px + 14, width - 230),
          background: "var(--bg-1)", border: "1px solid var(--line)", borderRadius: 8,
          padding: "8px 12px", fontSize: 12, pointerEvents: "none", boxShadow: "0 4px 12px var(--shadow)",
          minWidth: 200,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontFamily: "var(--mono)" }}>{hr.month}</div>
          {series.map(s => hr[s.key] != null && (
            <div key={s.key} style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
              <span style={{ color: "var(--muted)" }}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: s.color, marginRight: 6 }} />
                {s.label}
              </span>
              <span style={{ fontFamily: "var(--mono)" }}>{fmtEUR(hr[s.key], { decimals: 0 })}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8, paddingLeft: padL, fontSize: 11, color: "var(--muted)" }}>
        {series.map(s => (
          <span key={s.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="18" height="4"><line x1="0" x2="18" y1="2" y2="2" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash || ""} /></svg>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
};

const EntwicklungTab = () => {
  const [bench, setBench] = React.useState("msci_world");
  const { data, loading, error } = useFetch(`/api/portfolio/performance?benchmark=${bench}`);

  if (loading && !data) return (
    <Card>
      <Spinner />
      <div style={{ textAlign: "center", fontSize: 12, color: "var(--muted)", marginTop: -8 }}>
        Lade Kurshistorie und Inflationsdaten … (beim ersten Mal bis zu 30 Sekunden)
      </div>
    </Card>
  );
  if (error || !data) return <EmptyState title="Wertentwicklung nicht verfügbar" desc={error || ""} />;
  if (!data.months?.length) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <WarningStrip warnings={data.warnings} />
      <EmptyState title="Keine Wertentwicklung" />
    </div>
  );

  const k = data.kpis || {};
  const bl = data.benchmark?.label || "Index";
  const sgn = (v) => v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")} %`;
  const tone = (v) => v == null ? "neutral" : v >= 0 ? "pos" : "neg";
  const toneColor = { pos: "var(--pos)", neg: "var(--neg)", neutral: "var(--muted)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, opacity: loading ? 0.6 : 1, transition: "opacity .2s" }}>
      <WarningStrip warnings={data.warnings} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16 }}>
        <Card>
          <Stat label="Deine Rendite" value={sgn(k.xirr)} tone={tone(k.xirr)}
                sub={`pro Jahr seit ${(k.since || "").slice(0, 7)}${k.simple_return != null ? ` · gesamt ${sgn(k.simple_return)} (wie TR-App)` : ""}`} />
        </Card>
        <Card>
          <Stat label={`${bl} (gleiche Einzahlungen)`} value={sgn(k.xirr_benchmark)}
                delta={k.vs_benchmark != null ? `${k.vs_benchmark >= 0 ? "+" : ""}${fmtEUR(k.vs_benchmark, { decimals: 0 })} für dich` : null}
                deltaTone={tone(k.vs_benchmark)} />
        </Card>
        <Card>
          <Stat label="Inflation DE" value={sgn(k.inflation_cum)}
                sub={`gesamt ${k.cpi_first_month} – ${k.cpi_last_month} · auf dein Geld gewichtet ${sgn(k.xirr_inflation)} p.a.`
                     + (k.inflation_12m != null ? ` · letzte 12 Mon. ${sgn(k.inflation_12m)}` : "")} />
        </Card>
        <Card>
          <Stat label="Real, nach Inflation" value={sgn(k.real_xirr)} tone={tone(k.real_xirr)}
                delta={k.vs_inflation != null ? `${k.vs_inflation >= 0 ? "+" : ""}${fmtEUR(k.vs_inflation, { decimals: 0 })} Kaufkraft` : null}
                deltaTone={tone(k.vs_inflation)} />
        </Card>
      </div>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Wertentwicklung</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, maxWidth: 560, lineHeight: 1.5 }}>
              Depotwert am Monatsende inkl. erhaltener Ausschüttungen. Zum Vergleich: dieselben Käufe und
              Verkäufe am selben Tag in einen {bl}-ETF, und was das eingezahlte Geld wert sein müsste, um nur
              seine Kaufkraft zu halten (HVPI Deutschland, Eurostat).
            </div>
          </div>
          <Segmented size="sm" value={bench} onChange={setBench}
                     options={(data.benchmarks || []).map(b => ({ value: b.key, label: b.label }))} />
        </div>
        <PerformanceChart rows={data.months} benchLabel={bl} />
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)", fontSize: 12, color: "var(--muted)" }}>
          <span>Depotwert <strong style={{ color: "var(--fg)", fontFamily: "var(--mono)" }}>{fmtEUR(k.value, { decimals: 0 })}</strong></span>
          <span>+ Ausschüttungen <strong style={{ color: "var(--fg)", fontFamily: "var(--mono)" }}>{fmtEUR(k.dividends, { decimals: 0 })}</strong></span>
          <span>Netto eingezahlt <strong style={{ color: "var(--fg)", fontFamily: "var(--mono)" }}>{fmtEUR(k.invested, { decimals: 0 })}</strong></span>
          <span>Gewinn <strong style={{ color: k.gain >= 0 ? "var(--pos)" : "var(--neg)", fontFamily: "var(--mono)" }}>{fmtEUR(k.gain, { decimals: 0, sign: true })}</strong></span>
          <span>{bl} <strong style={{ color: "var(--fg)", fontFamily: "var(--mono)" }}>{fmtEUR(k.benchmark_value, { decimals: 0 })}</strong></span>
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
          {data.benchmark?.desc}. Renditen geldgewichtet (XIRR). Nur das TR-Depot — freies Guthaben und Krypto (eigener Tab) sind nicht enthalten.
        </div>
      </Card>

      {(data.insights || []).length > 0 && (
        <Card>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Einordnung</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.insights.map((it, i) => (
              <div key={i} style={{
                display: "flex", gap: 12, padding: "12px 14px", borderRadius: 10,
                background: "var(--bg-2)", borderLeft: `3px solid ${toneColor[it.tone] || "var(--muted)"}`,
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{it.title}</div>
                  <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4, lineHeight: 1.55 }}>{it.text}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 12 }}>
            Automatische Auswertung deiner Daten, keine Anlageberatung.
          </div>
        </Card>
      )}
    </div>
  );
};

// ── Krypto (Kraken) ─────────────────────────────────────────────────────────
// Getrennt von den Wertpapieren: die Benchmark-Rechnung gegen den MSCI World
// bleibt so sauber, und Krypto hat eigene Steuerregeln (steuerfrei nach einem
// Jahr Haltedauer, § 23 EStG).
const KryptoTab = () => {
  const { data, loading } = useFetch("/api/portfolio/crypto");
  if (loading && !data) return <Spinner />;
  if (!data || !data.positions?.length) return (
    <EmptyState title="Kein Krypto-Bestand" desc="Lade den Kraken-Export hoch (Kraken → Dokumente → Export → Ledgers, CSV)." />
  );
  const s = data.summary;
  const plColor = (v) => v == null ? "var(--muted)" : v >= 0 ? "var(--pos)" : "var(--neg)";
  const fmtUnits = (u) => u >= 1 ? u.toLocaleString("de-DE", { maximumFractionDigits: 2 }) : u.toLocaleString("de-DE", { maximumSignificantDigits: 5 });
  const upcoming = data.positions
    .flatMap(p => p.pending_lots.filter(l => l.cost > 0).map(l => ({ ...l, symbol: p.symbol, value: p.price ? l.units * p.price : null })))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        <Card><Stat label="Krypto-Wert" value={fmtEUR(s.value)} large sub="aktueller Kurs" /></Card>
        <Card><Stat label="Eingezahlt" value={fmtEUR(s.deposited, { decimals: 0 })} sub={s.fees_deposit > 0 ? `davon ${fmtEUR(s.fees_deposit)} Einzahlungsgebühr` : "netto"} /></Card>
        <Card><Stat label="Ergebnis" value={fmtEUR(s.vs_deposited, { sign: true })} tone={s.vs_deposited >= 0 ? "pos" : "neg"}
          delta={s.deposited ? `${(s.vs_deposited / s.deposited * 100).toFixed(1).replace(".", ",")} %` : null} deltaTone={s.vs_deposited >= 0 ? "pos" : "neg"}
          sub="gegenüber eingezahlt" /></Card>
      </div>

      <Card padding={0}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "var(--muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid var(--line)" }}>
              <th style={{ textAlign: "left", padding: "11px 20px", fontWeight: 500 }}>Coin</th>
              <th style={{ textAlign: "right", padding: "11px 14px", fontWeight: 500 }}>Menge</th>
              <th style={{ textAlign: "right", padding: "11px 14px", fontWeight: 500 }}>Kurs</th>
              <th style={{ textAlign: "right", padding: "11px 14px", fontWeight: 500 }}>Einstand</th>
              <th style={{ textAlign: "right", padding: "11px 14px", fontWeight: 500 }}>Wert</th>
              <th style={{ textAlign: "right", padding: "11px 14px", fontWeight: 500 }}>G/V</th>
              <th style={{ textAlign: "right", padding: "11px 20px", fontWeight: 500 }}>Steuerfrei</th>
            </tr>
          </thead>
          <tbody>
            {data.positions.map(p => (
              <tr key={p.symbol} style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "12px 20px" }}>
                  <div style={{ fontWeight: 500 }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)", marginTop: 2 }}>
                    {p.symbol}{p.is_stable && " · Stablecoin (1 USD)"}{p.cost === 0 && " · geschenkt/Bonus"}
                  </div>
                </td>
                <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 12 }}>{fmtUnits(p.units)}</td>
                <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 12 }}>{p.price != null ? fmtEUR(p.price) : "—"}</td>
                <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 12 }}>{fmtEUR(p.cost)}</td>
                <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "var(--mono)", fontWeight: 600 }}>{p.value != null ? fmtEUR(p.value) : "—"}</td>
                <td style={{ padding: "12px 14px", textAlign: "right" }}>
                  <div style={{ fontFamily: "var(--mono)", color: plColor(p.pl) }}>{p.pl != null ? fmtEUR(p.pl, { sign: true }) : "—"}</div>
                  {p.pl_pct != null && <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: plColor(p.pl_pct) }}>{p.pl_pct > 0 ? "+" : ""}{p.pl_pct.toFixed(1).replace(".", ",")} %</div>}
                </td>
                <td style={{ padding: "12px 20px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 12, color: p.tax_free_share >= 99.9 ? "var(--pos)" : "var(--fg)" }}>
                  {p.tax_free_share.toFixed(0)} %
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Wann wird was steuerfrei?</div>
        <div style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 12px", lineHeight: 1.5 }}>
          Krypto-Gewinne sind in Deutschland nach mehr als einem Jahr Haltedauer steuerfrei (§ 23 EStG). Verkauft wird nach
          FIFO — zuerst die ältesten Käufe. Ein Verkauf vor dem Datum unten wäre für diesen Teil steuerpflichtig, sofern alle
          privaten Veräußerungsgewinne im Jahr 1.000 € übersteigen.
        </div>
        {upcoming.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--pos)" }}>Alle gekauften Bestände sind bereits steuerfrei.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {upcoming.map((l, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, padding: "8px 12px", background: "var(--bg-2)", borderRadius: 8 }}>
                <span>{fmtUnits(l.units)} {l.symbol} <span style={{ color: "var(--muted)" }}>· Einstand {fmtEUR(l.cost, { decimals: 0 })}{l.value != null ? ` · heute ${fmtEUR(l.value, { decimals: 0 })}` : ""}</span></span>
                <span style={{ fontFamily: "var(--mono)" }}>ab {fmtDate(l.date)}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }}>
          Staking-Belohnungen und Boni sind mit Einstand 0 € erfasst. Keine Steuerberatung.
        </div>
      </Card>
    </div>
  );
};
