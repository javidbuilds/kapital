from fastapi import APIRouter, Query
from ..deps import get_df, df_to_records

router = APIRouter()


@router.get("/jahresuebersicht")
def get_jahresuebersicht(account: str = Query("all")):
    from kapital.finance import analytics
    full_df = get_df()
    from ..deps import account_options, filter_by_accounts
    all_accounts = account_options(full_df)
    df = filter_by_accounts(full_df, account)
    if df.empty:
        return {"years": [], "monthly": [], "all_accounts": all_accounts}

    yearly = analytics.yearly_summary(df)
    monthly = analytics.monthly_summary(df)

    years_data = []
    for _, row in yearly.iterrows():
        years_data.append({
            "year": int(row["year"]),
            "einnahmen": round(float(row.get("einnahmen", 0)), 2),
            "ausgaben":  round(float(row.get("ausgaben", 0)), 2),
            "investiert": round(float(row.get("investiert", 0)), 2),
            "ersparnis":  round(float(row.get("ersparnis", 0)), 2),
            "sparrate":   round(float(row.get("sparrate", 0)) * 100, 1),
        })

    monthly_data = []
    for _, row in monthly.iterrows():
        monthly_data.append({
            "ym": str(row["ym"]),
            "einnahmen": round(float(row.get("einnahmen", 0)), 2),
            "ausgaben":  round(float(row.get("ausgaben", 0)), 2),
            "investiert": round(float(row.get("investiert", 0)), 2),
            "ersparnis":  round(float(row.get("ersparnis", 0)), 2),
            "sparrate":   round(float(row.get("sparrate", 0)) * 100, 1),
        })

    # Kategorien je Jahr. Vorher: eine Gesamtsumme seit Importbeginn, und der
    # Router las die Spalte "total", die category_breakdown "betrag" nennt —
    # jede Kategorie stand auf 0 €.
    exp = analytics._expenses(df)
    cat_data = []
    cat_meta = {"years": [], "months": {}}
    if not exp.empty:
        exp = exp.assign(year=exp["date"].dt.year)
        all_ym = df["date"].dt.to_period("M")
        months_per_year = all_ym.groupby(all_ym.dt.year).nunique().to_dict()
        cat_years = sorted(exp["year"].unique().tolist())[-5:]
        pivot = (exp[exp["year"].isin(cat_years)]
                 .pivot_table(index="category", columns="year", values="amount",
                              aggfunc="sum", fill_value=0)
                 .abs())
        cur = cat_years[-1]
        prev = cat_years[-2] if len(cat_years) > 1 else None
        for cat, row in pivot.iterrows():
            # Ø pro Monat statt Jahressumme vergleichen: das laufende Jahr ist
            # unvollständig, die Summe wäre immer kleiner als im Vorjahr.
            avg_cur = float(row.get(cur, 0)) / max(months_per_year.get(cur, 1), 1)
            avg_prev = (float(row.get(prev, 0)) / max(months_per_year.get(prev, 1), 1)) if prev else None
            change = ((avg_cur / avg_prev - 1) * 100) if avg_prev else None
            cat_data.append({
                "category": str(cat),
                "years": {str(y): round(float(row.get(y, 0)), 2) for y in cat_years},
                "avg_month": round(avg_cur, 2),
                "avg_month_prev": round(avg_prev, 2) if avg_prev is not None else None,
                "change_pct": round(change, 1) if change is not None else None,
            })
        cat_data.sort(key=lambda c: c["avg_month"], reverse=True)
        cat_meta = {"years": [str(y) for y in cat_years],
                    "months": {str(y): int(months_per_year.get(y, 0)) for y in cat_years}}

    return {"years": years_data, "monthly": monthly_data, "categories": cat_data,
            "category_meta": cat_meta, "all_accounts": all_accounts}
