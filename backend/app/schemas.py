from datetime import date as Date
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Quantity = Annotated[Decimal, Field(gt=0, le=1_000_000_000, decimal_places=3)]
Money = Annotated[int, Field(ge=0, le=1_000_000_000_000, strict=True)]
PositiveMoney = Annotated[int, Field(gt=0, le=1_000_000_000_000, strict=True)]


FarmDate = Annotated[Date, Field(ge=Date(2000, 1, 1), le=Date(2100, 12, 31))]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Login(Input):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=256)


class Password(Input):
    current_password: str = Field(max_length=256)
    new_password: str = Field(min_length=10, max_length=256)


class UserCreate(Input):
    username: str = Field(pattern=r"^[a-zA-Z0-9_.-]{3,40}$")
    password: str = Field(min_length=10, max_length=256)
    role: Literal["admin", "user"] = "user"


class UserUpdate(Input):
    username: str = Field(pattern=r"^[a-zA-Z0-9_.-]{3,40}$")
    role: Literal["admin", "user"] = "user"
    active: bool = True


class OptionInput(Input):
    kind: Literal["asset_type", "group", "product", "unit", "category", "feed_type"]
    name: Name
    unit: str | None = Field(default=None, max_length=30)
    kg_per_sack: Quantity | None = None
    tracks_quantity: bool = False


class ProductionInput(Input):
    date: FarmDate
    group_id: int
    kg: Quantity
    notes: str = Field(default="", max_length=2000)


class ExpenseInput(Input):
    date: FarmDate
    category_id: int
    feed_type_id: int | None = None
    quantity: Quantity | None = None
    unit_price: Money | None = None
    amount: Money | None = None
    notes: str = Field(default="", max_length=2000)


class SaleInput(Input):
    date: FarmDate
    product_id: int
    unit_id: int
    quantity: Quantity
    unit_price: Money
    buyer: Name
    notes: str = Field(default="", max_length=2000)
    paid_in_full: bool = False
    first_payment: Money = 0

    @model_validator(mode="after")
    def payment_choice(self):
        if self.paid_in_full and self.first_payment:
            raise ValueError("Pilih lunas atau pembayaran awal, bukan keduanya.")
        return self


class PaymentInput(Input):
    date: FarmDate
    amount: PositiveMoney
    notes: str = Field(default="", max_length=2000)


class DebtInput(Input):
    date: FarmDate
    lender: Name
    amount: PositiveMoney
    due_date: FarmDate | None = None
    interest_rate: Decimal = Field(default=Decimal(0), ge=0, le=1000, decimal_places=3)
    notes: str = Field(default="", max_length=2000)

    @model_validator(mode="after")
    def due_after_loan(self):
        if self.due_date and self.due_date < self.date:
            raise ValueError("Jatuh tempo tidak boleh sebelum tanggal pinjaman.")
        return self


class AssetInput(Input):
    name: Name
    type_id: int
    group_id: int | None = None
    quantity: Quantity
    unit_price: Money
    date: FarmDate
    depreciation_months: int = Field(ge=1, le=1200)
    age_weeks_at_purchase: int = Field(default=0, ge=0, le=1000)
    notes: str = Field(default="", max_length=2000)


class AdjustmentInput(Input):
    date: FarmDate
    reason: Literal["dead", "sold", "missing"]
    quantity: Quantity
    notes: str = Field(default="", max_length=2000)
