import calendar
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from fastapi import HTTPException
from sqlmodel import Session, select

from app.config import Settings, now
from app.models import (
    Adjustment,
    Asset,
    Debt,
    Expense,
    Option,
    Payment,
    Production,
    Repayment,
    Sale,
)
from app.rules import ZERO, balance, money, remaining


def date_range(period: str, start: date | None, end: date | None) -> tuple[date, date]:
    today = now().date()
    if period == "custom":
        if not start or not end:
            raise HTTPException(422, "Tanggal awal dan akhir wajib diisi.")
    elif period == "today":
        start, end = today, today
    elif period == "week":
        start, end = today - timedelta(days=today.weekday()), today
    elif period == "month":
        start, end = today.replace(day=1), today
    elif period == "year":
        start, end = today.replace(month=1, day=1), today
    else:
        raise HTTPException(422, "Periode tidak valid.")
    assert start is not None and end is not None
    if start > end or (end - start).days > 366:
        raise HTTPException(422, "Rentang tanggal maksimal 367 hari dan harus berurutan.")
    return start, end


def summary(db: Session, settings: Settings, start: date, end: date) -> dict:
    products = {o.id: o for o in db.exec(select(Option)).all()}
    productions = db.exec(select(Production).where(Production.date <= end)).all()
    expenses = db.exec(select(Expense).where(Expense.date <= end)).all()
    sales = db.exec(select(Sale).where(Sale.date <= end)).all()
    debts = db.exec(select(Debt).where(Debt.date <= end)).all()
    payments: dict[int | None, int] = defaultdict(int)
    for p in db.exec(select(Payment).where(Payment.date <= end)).all():
        payments[p.sale_id] += p.amount
    repayments: dict[int | None, int] = defaultdict(int)
    for p in db.exec(select(Repayment).where(Repayment.date <= end)).all():
        repayments[p.debt_id] += p.amount
    production = sum((p.kg for p in productions if p.date >= start), ZERO)
    revenue = sum(s.total for s in sales if s.date >= start)
    spending = sum(e.amount for e in expenses if e.date >= start)
    customer_balances: dict[str, int] = defaultdict(int)
    for s in sales:
        customer_balances[s.buyer] += balance(s.total, payments[s.id])["outstanding"]
    stock = sum((p.kg for p in productions), ZERO)
    stock += sum(
        (e.kg or ZERO for e in expenses if products[e.category_id].role == "egg_purchase"), ZERO
    )
    stock -= sum((s.egg_kg for s in sales), ZERO)
    feed_kg = sum(
        (
            e.kg or ZERO
            for e in expenses
            if e.date >= start and products[e.category_id].role == "feed"
        ),
        ZERO,
    )
    chicken_assets = [
        a for a in db.exec(select(Asset)).all() if products[a.type_id].role == "chicken"
    ]
    first_week = end - timedelta(days=end.weekday(), weeks=7)
    changes: dict[int | None, list[Adjustment]] = defaultdict(list)
    for adjustment in db.exec(select(Adjustment).where(Adjustment.date <= end)).all():
        changes[adjustment.asset_id].append(adjustment)
    hens_by_day: dict[date, Decimal] = {}
    day = min(start, first_week)
    while day <= end:
        hens_by_day[day] = sum(
            (
                a.quantity - sum((r.quantity for r in changes[a.id] if r.date <= day), ZERO)
                for a in chicken_assets
                if a.date <= day
            ),
            ZERO,
        )
        day += timedelta(days=1)
    hen_days = sum((count for day, count in hens_by_day.items() if day >= start), ZERO)
    groups: dict[str, Decimal] = defaultdict(Decimal)
    trends: dict[str, Decimal] = defaultdict(Decimal)
    weekly: dict[str, Decimal] = defaultdict(Decimal)
    for p in productions:
        if p.date >= start:
            groups[products[p.group_id].name] += p.kg
            key = p.date.isoformat() if (end - start).days <= 62 else p.date.strftime("%Y-%m")
            trends[key] += p.kg
            weekly[(p.date - timedelta(days=p.date.weekday())).isoformat()] += p.kg
    weeks = []
    efficiency_weeks = []
    current_week = end - timedelta(days=end.weekday())
    for i in range(7, -1, -1):
        week = current_week - timedelta(weeks=i)
        categories: dict[str, int] = defaultdict(int)
        for e in expenses:
            if week <= e.date <= min(end, week + timedelta(days=6)):
                categories[products[e.category_id].name] += e.amount
        weeks.append(
            {"date": week, "amount": sum(categories.values()), "categories": dict(categories)}
        )
        last = min(end, week + timedelta(days=6))
        week_production = sum((p.kg for p in productions if week <= p.date <= last), ZERO)
        week_feed = sum(
            (
                e.kg or ZERO
                for e in expenses
                if week <= e.date <= last and products[e.category_id].role == "feed"
            ),
            ZERO,
        )
        week_hens = sum((count for day, count in hens_by_day.items() if week <= day <= last), ZERO)
        efficiency_weeks.append(
            {
                "date": week,
                "fcr": week_feed / week_production if week_production else None,
                "hdp": week_production / Decimal(str(settings.average_egg_kg)) / week_hens * 100
                if week_hens
                else None,
            }
        )
    estimated = production / Decimal(str(settings.average_egg_kg))
    return {
        "start": start,
        "end": end,
        "sales": revenue,
        "expenses": spending,
        "margin": revenue - spending,
        "production_kg": production,
        "estimated_eggs": money(estimated),
        "receivables": sum(customer_balances.values()),
        "debt_outstanding": sum(balance(d.amount, repayments[d.id])["outstanding"] for d in debts),
        "customers": [
            {"name": name, "outstanding": amount}
            for name, amount in sorted(customer_balances.items(), key=lambda x: -x[1])
            if amount > 0
        ],
        "stock_kg": stock,
        "stock_boxes": stock / Decimal(str(settings.box_kg)),
        "feed_kg": feed_kg,
        "fcr": feed_kg / production if production else None,
        "hdp": estimated / hen_days * 100 if hen_days else None,
        "target_fcr": settings.target_fcr,
        "target_hdp": settings.target_hdp,
        "by_group": [{"name": key, "kg": val} for key, val in groups.items()],
        "production_trend": [{"date": key, "kg": val} for key, val in sorted(trends.items())],
        "production_weeks": [{"date": key, "kg": val} for key, val in sorted(weekly.items())],
        "expense_weeks": weeks,
        "efficiency_weeks": efficiency_weeks,
    }


def pnl(db: Session, start: date, end: date) -> dict:
    categories = {o.id: o for o in db.exec(select(Option)).all()}
    revenue = sum(
        s.total for s in db.exec(select(Sale).where(Sale.date >= start, Sale.date <= end)).all()
    )
    cogs, operating = 0, 0
    for e in db.exec(select(Expense).where(Expense.date >= start, Expense.date <= end)).all():
        if categories[e.category_id].role in {"feed", "egg_purchase", "chicken_purchase"}:
            cogs += e.amount
        else:
            operating += e.amount
    depreciation = ZERO
    for asset in db.exec(select(Asset).where(Asset.date <= end)).all():
        # Monthly straight-line charges occur on each acquisition anniversary.
        for n in range(
            1,
            min(
                asset.depreciation_months,
                (end.year - asset.date.year) * 12 + end.month - asset.date.month,
            )
            + 1,
        ):
            index = asset.date.year * 12 + asset.date.month - 1 + n
            year, month = index // 12, index % 12 + 1
            due = date(year, month, min(asset.date.day, calendar.monthrange(year, month)[1]))
            if start <= due <= end:
                depreciation += (
                    remaining(db, asset, due) * asset.unit_price / asset.depreciation_months
                )
    dep = money(depreciation)
    gross = revenue - cogs
    ebitda = gross - operating
    return {
        "start": start,
        "end": end,
        "revenue": revenue,
        "cost_of_goods": cogs,
        "operating_expenses": operating,
        "gross_profit": gross,
        "ebitda": ebitda,
        "depreciation": dep,
        "net_profit": ebitda - dep,
    }


def financial(db: Session, year: int, month: int) -> dict:
    return {
        "month": pnl(
            db, date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])
        ),
        "year": pnl(db, date(year, 1, 1), date(year, 12, 31)),
        "trend": [
            {
                "month": n,
                **pnl(db, date(year, n, 1), date(year, n, calendar.monthrange(year, n)[1])),
            }
            for n in range(1, 13)
        ],
    }
