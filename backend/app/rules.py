import calendar
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from app.config import Settings, now
from app.models import (
    Adjustment,
    Asset,
    Option,
    Payment,
    Repayment,
)

ZERO = Decimal(0)


def money(value: Decimal | int) -> int:
    return int(Decimal(value).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def fail(message: str):
    raise HTTPException(422, message)


def option(db: Session, id: int | None, kind: str) -> Option:
    item = db.get(Option, id) if id is not None else None
    if not item or item.kind != kind:
        fail(f"Pilihan {kind} tidak valid.")
    assert item is not None
    return item


def seed_options(db: Session, user_id: int):
    if db.exec(select(Option)).first():
        return
    entries: list[dict[str, Any]] = [
        {"kind": "asset_type", "name": "Ayam", "role": "chicken"},
        {"kind": "asset_type", "name": "Peralatan"},
        {"kind": "asset_type", "name": "Bangunan"},
        {"kind": "group", "name": "Kandang A"},
        {"kind": "group", "name": "Kandang B"},
        {"kind": "product", "name": "Telur", "role": "egg"},
        {"kind": "product", "name": "Ayam afkir"},
        {"kind": "unit", "name": "Kg", "role": "kg"},
        {"kind": "unit", "name": "Kotak", "role": "box"},
        {"kind": "unit", "name": "Ekor"},
        {"kind": "unit", "name": "Pcs"},
        {
            "kind": "category",
            "name": "Pakan",
            "role": "feed",
            "unit": "Karung",
            "tracks_quantity": True,
        },
        {
            "kind": "category",
            "name": "Pembelian telur",
            "role": "egg_purchase",
            "unit": "Kg",
            "tracks_quantity": True,
        },
        {
            "kind": "category",
            "name": "Pembelian ayam",
            "role": "chicken_purchase",
            "unit": "Ekor",
            "tracks_quantity": True,
        },
        {
            "kind": "category",
            "name": "Pembelian kotak",
            "role": "box_purchase",
            "unit": "Pcs",
            "tracks_quantity": True,
        },
        {"kind": "category", "name": "Listrik"},
        {"kind": "category", "name": "Operasional"},
        {"kind": "feed_type", "name": "Pakan layer", "kg_per_sack": Decimal(50)},
    ]
    for data in entries:
        db.add(Option(**data, created_by=user_id, updated_by=user_id))
    db.commit()


def remaining(db: Session, asset: Asset, as_of: date | None = None) -> Decimal:
    statement = select(func.coalesce(func.sum(Adjustment.quantity), 0)).where(
        Adjustment.asset_id == asset.id
    )
    if as_of:
        statement = statement.where(Adjustment.date <= as_of)
    return asset.quantity - Decimal(db.exec(statement).one())


def asset_view(db: Session, asset: Asset, as_of: date | None = None) -> dict:
    today = as_of or now().date()
    anniversary = min(asset.date.day, calendar.monthrange(today.year, today.month)[1])
    months = max(
        0,
        (today.year - asset.date.year) * 12
        + today.month
        - asset.date.month
        - (today.day < anniversary),
    )
    count = remaining(db, asset, today)
    initial = asset.quantity * asset.unit_price
    monthly = initial / asset.depreciation_months
    original_book = max(ZERO, initial - monthly * months)
    book = original_book * count / asset.quantity if today >= asset.date else ZERO
    chicken = option(db, asset.type_id, "asset_type").role == "chicken"
    month_index = asset.date.year * 12 + asset.date.month - 1 + asset.depreciation_months
    year, month = month_index // 12, month_index % 12 + 1
    zero_date = date(year, month, min(asset.date.day, calendar.monthrange(year, month)[1]))
    return {
        **asset.model_dump(),
        "remaining_quantity": count,
        "purchase_value": money(initial),
        "monthly_depreciation": money(monthly * count / asset.quantity),
        "elapsed_months": months,
        "book_value": money(book),
        "zero_date": zero_date,
        "age_weeks": asset.age_weeks_at_purchase + max(0, (today - asset.date).days // 7)
        if chicken
        else None,
        "is_chicken": chicken,
    }


def balance(total: int, paid: int) -> dict:
    return {
        "paid_amount": paid,
        "outstanding": max(0, total - paid),
        "overpaid": max(0, paid - total),
        "status": "paid" if paid >= total else "unpaid",
    }


def view(db: Session, kind: str, record: Any, settings: Settings) -> dict:
    data = record.model_dump()
    if kind == "production":
        data["estimated_eggs"] = money(record.kg / Decimal(str(settings.average_egg_kg)))
        data["group_name"] = option(db, record.group_id, "group").name
    if kind in {"sales", "debts"}:
        cls, key = (Payment, Payment.sale_id) if kind == "sales" else (Repayment, Repayment.debt_id)
        paid = db.exec(select(func.coalesce(func.sum(cls.amount), 0)).where(key == record.id)).one()
        data.update(balance(record.total if kind == "sales" else record.amount, paid))
    if kind == "expenses":
        data["category_name"] = option(db, record.category_id, "category").name
    if kind == "sales":
        data["product_name"] = option(db, record.product_id, "product").name
        data["unit_name"] = option(db, record.unit_id, "unit").name
    if kind == "assets":
        data = asset_view(db, record)
        data["type_name"] = option(db, record.type_id, "asset_type").name
    return data


def prepare(db: Session, kind: str, data: dict, settings: Settings, current: Any = None) -> dict:
    if kind == "production":
        option(db, data["group_id"], "group")
    if kind == "expenses":
        category = option(db, data["category_id"], "category")
        if category.tracks_quantity:
            if data["quantity"] is None or data["unit_price"] is None:
                fail("Jumlah dan harga satuan wajib diisi untuk kategori ini.")
            data["amount"] = money(data["quantity"] * data["unit_price"])
            data["unit"] = category.unit
            if category.role == "feed":
                feed = option(db, data["feed_type_id"], "feed_type")
                if not feed.kg_per_sack:
                    fail("Isi faktor kg per karung pada jenis pakan.")
                data["kg"] = data["quantity"] * feed.kg_per_sack
            elif category.role == "egg_purchase":
                data["kg"] = data["quantity"]
                data["feed_type_id"] = None
            else:
                data.update(kg=None, feed_type_id=None)
            # Preserve the unit and factor snapshot when unrelated fields are edited.
            if current and all(
                getattr(current, key) == data[key]
                for key in ("category_id", "feed_type_id", "quantity")
            ):
                data.update(unit=current.unit, kg=current.kg)
        else:
            if data["amount"] is None:
                fail("Nominal pengeluaran wajib diisi.")
            data.update(quantity=None, unit_price=None, unit=None, feed_type_id=None, kg=None)
    if kind == "sales":
        product = option(db, data["product_id"], "product")
        unit = option(db, data["unit_id"], "unit")
        data["total"] = money(data["quantity"] * data["unit_price"])
        data["egg_kg"] = ZERO
        if product.role == "egg":
            if unit.role not in {"kg", "box"}:
                fail("Penjualan telur menggunakan Kg atau Kotak.")
            data["egg_kg"] = data["quantity"] * (
                Decimal(str(settings.box_kg)) if unit.role == "box" else 1
            )
            if current and all(
                getattr(current, key) == data[key] for key in ("product_id", "unit_id", "quantity")
            ):
                data["egg_kg"] = current.egg_kg
        if current and (data.get("paid_in_full") or data.get("first_payment")):
            fail("Ubah pembayaran melalui riwayat pembayaran.")
    if kind == "assets":
        asset_type = option(db, data["type_id"], "asset_type")
        if data["group_id"]:
            option(db, data["group_id"], "group")
        if asset_type.role == "chicken":
            if data["quantity"] != int(data["quantity"]):
                fail("Jumlah ayam harus bilangan bulat.")
            if not data["group_id"]:
                fail("Pilih kelompok kandang untuk ayam.")
        else:
            data["group_id"] = None
        if current and db.exec(select(Adjustment).where(Adjustment.asset_id == current.id)).first():
            for key in (
                "quantity",
                "date",
                "type_id",
                "group_id",
                "unit_price",
                "depreciation_months",
            ):
                if getattr(current, key) != data[key]:
                    fail(
                        "Aset dengan pengurangan hanya boleh diubah nama, catatan, dan usia awalnya."
                    )
    if kind == "options":
        if current and current.role:
            if data["kind"] != current.kind:
                fail("Jenis pilihan perhitungan tidak boleh diubah.")
            if current.role in {"feed", "egg_purchase", "chicken_purchase", "box_purchase"}:
                data["tracks_quantity"] = True
            if current.role == "egg_purchase":
                data["unit"] = "Kg"
        if current and data["kind"] != current.kind:
            fail("Jenis pilihan tidak dapat diubah; buat pilihan baru.")
        if data["tracks_quantity"] and not data["unit"]:
            fail("Kategori jumlah harus memiliki satuan.")
        if data["kind"] == "feed_type" and not data["kg_per_sack"]:
            fail("Jenis pakan harus memiliki faktor kg per karung.")
    for key in ("amount", "total"):
        if data.get(key, 0) is not None and data.get(key, 0) > 1_000_000_000_000:
            fail("Nilai transaksi melebihi batas Rp1 triliun.")
    if kind == "assets" and data["quantity"] * data["unit_price"] > 1_000_000_000_000:
        fail("Nilai aset melebihi batas Rp1 triliun.")
    return data


def check_adjustment(db: Session, asset: Asset, data: dict):
    if option(db, asset.type_id, "asset_type").role != "chicken":
        fail("Pengurangan ternak hanya untuk aset ayam.")
    if data["quantity"] != int(data["quantity"]):
        fail("Jumlah ayam harus bilangan bulat.")
    if data["date"] < asset.date or data["date"] > now().date():
        fail("Tanggal pengurangan harus antara tanggal pembelian dan hari ini.")
    if data["quantity"] > remaining(db, asset):
        fail("Jumlah pengurangan melebihi ayam yang masih ada.")
