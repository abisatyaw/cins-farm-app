from datetime import date as Date
from datetime import datetime
from decimal import Decimal

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel

from app.config import now


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True)
    password_hash: str
    role: str = "user"
    must_change_password: bool = True
    active: bool = True
    deleted: bool = False


class Session(SQLModel, table=True):
    token_hash: str = Field(primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    csrf_hash: str
    expires_at: datetime


class Audit(SQLModel):
    id: int | None = Field(default=None, primary_key=True)
    created_by: int = Field(foreign_key="user.id")
    updated_by: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class Option(Audit, table=True):
    __table_args__ = (UniqueConstraint("kind", "name"),)
    kind: str = Field(index=True)
    name: str
    role: str | None = Field(default=None, unique=True)
    unit: str | None = None
    kg_per_sack: Decimal | None = Field(default=None, max_digits=14, decimal_places=3)
    tracks_quantity: bool = False


class Production(Audit, table=True):
    date: Date = Field(index=True)
    group_id: int = Field(foreign_key="option.id")
    kg: Decimal = Field(max_digits=14, decimal_places=3)
    notes: str = ""


class Expense(Audit, table=True):
    date: Date = Field(index=True)
    category_id: int = Field(foreign_key="option.id")
    feed_type_id: int | None = Field(default=None, foreign_key="option.id")
    quantity: Decimal | None = Field(default=None, max_digits=14, decimal_places=3)
    unit_price: int | None = None
    unit: str | None = None
    amount: int
    kg: Decimal | None = Field(default=None, max_digits=14, decimal_places=3)
    notes: str = ""


class Sale(Audit, table=True):
    date: Date = Field(index=True)
    product_id: int = Field(foreign_key="option.id")
    unit_id: int = Field(foreign_key="option.id")
    quantity: Decimal = Field(max_digits=14, decimal_places=3)
    unit_price: int
    total: int
    egg_kg: Decimal = Field(default=Decimal(0), max_digits=14, decimal_places=3)
    buyer: str = Field(index=True)
    notes: str = ""


class Payment(Audit, table=True):
    sale_id: int = Field(foreign_key="sale.id", index=True)
    date: Date
    amount: int
    notes: str = ""


class Debt(Audit, table=True):
    date: Date = Field(index=True)
    lender: str = Field(index=True)
    amount: int
    due_date: Date | None = None
    interest_rate: Decimal = Field(default=Decimal(0), max_digits=8, decimal_places=3)
    notes: str = ""


class Repayment(Audit, table=True):
    debt_id: int = Field(foreign_key="debt.id", index=True)
    date: Date
    amount: int
    notes: str = ""


class Asset(Audit, table=True):
    name: str = Field(index=True)
    type_id: int = Field(foreign_key="option.id")
    group_id: int | None = Field(default=None, foreign_key="option.id")
    quantity: Decimal = Field(max_digits=14, decimal_places=3)
    unit_price: int
    date: Date
    depreciation_months: int
    age_weeks_at_purchase: int = 0
    notes: str = ""


class Adjustment(Audit, table=True):
    asset_id: int = Field(foreign_key="asset.id", index=True)
    date: Date
    reason: str
    quantity: Decimal = Field(max_digits=14, decimal_places=3)
    notes: str = ""
