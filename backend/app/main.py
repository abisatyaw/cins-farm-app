import secrets
from collections.abc import Generator
from contextlib import asynccontextmanager
from datetime import date, timedelta
from io import BytesIO
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from openpyxl import Workbook
from pydantic import ValidationError
from sqlalchemy import literal
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import schemas as schema
from app.config import ROOT, Settings, now
from app.db import make_engine, migrate
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
    User,
)
from app.models import Session as LoginSession
from app.reports import date_range, financial, summary
from app.rules import check_adjustment, fail, prepare, seed_options, view
from app.security import (
    authenticate,
    check_origin,
    cookies,
    digest,
    hash_password,
    public_user,
    rate_limit,
    require_admin,
    seed_admin,
    verify_password,
)

MODELS: dict[str, Any] = {
    "production": Production,
    "expenses": Expense,
    "sales": Sale,
    "debts": Debt,
    "assets": Asset,
    "options": Option,
}
SCHEMAS: dict[str, Any] = {
    "production": schema.ProductionInput,
    "expenses": schema.ExpenseInput,
    "sales": schema.SaleInput,
    "debts": schema.DebtInput,
    "assets": schema.AssetInput,
    "options": schema.OptionInput,
}


def get_db(request: Request) -> Generator[Session]:
    with Session(request.app.state.engine, expire_on_commit=False) as db:
        # Serialize writes before reading balances so concurrent flock reductions
        # cannot both validate against the same remaining quantity.
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            db.connection().exec_driver_sql("BEGIN IMMEDIATE")
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise


def get_user(request: Request, response: Response, db: Session = Depends(get_db)) -> User:
    return authenticate(request, response, db)


def model_for(kind: str):
    if kind not in MODELS:
        raise HTTPException(404, "Jenis catatan tidak ditemukan.")
    return MODELS[kind]


def record_for(db: Session, kind: str, record_id: int):
    record = db.get(model_for(kind), record_id)
    if not record:
        raise HTTPException(404, "Catatan tidak ditemukan.")
    return record


def validated(kind: str, data: dict) -> dict:
    model_for(kind)
    return SCHEMAS[kind].model_validate(data).model_dump()


def audit(user: User) -> dict:
    return {"created_by": user.id, "updated_by": user.id}


def touch(record: Any, user: User):
    record.updated_by = user.id
    record.updated_at = now()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    assert settings is not None
    if settings.average_egg_kg <= 0 or settings.box_kg <= 0:
        raise ValueError("Egg weight and box weight must be positive")

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        migrate(settings.database_url)
        app.state.engine = make_engine(settings.database_url)
        with Session(app.state.engine) as db:
            admin = seed_admin(db, settings.initial_admin_password)
            assert admin.id is not None
            seed_options(db, admin.id)
        yield
        app.state.engine.dispose()

    app = FastAPI(title="Cins Farm API", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, error: StarletteHTTPException):
        return JSONResponse(
            {"error": {"code": error.status_code, "message": str(error.detail), "details": []}},
            status_code=error.status_code,
        )

    async def validation_error(request: Request, error: Any):
        details = [
            {"field": ".".join(str(v) for v in e["loc"]), "message": str(e["msg"])}
            for e in error.errors()
        ]
        return JSONResponse(
            {
                "error": {
                    "code": 422,
                    "message": "Data belum valid. Periksa kolom yang diisi.",
                    "details": details,
                }
            },
            status_code=422,
        )

    app.add_exception_handler(RequestValidationError, validation_error)
    app.add_exception_handler(ValidationError, validation_error)

    @app.exception_handler(IntegrityError)
    async def integrity_error(request: Request, error: IntegrityError):
        return JSONResponse(
            {
                "error": {
                    "code": 409,
                    "message": "Data duplikat atau masih digunakan oleh catatan lain.",
                    "details": [],
                }
            },
            status_code=409,
        )

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, error: Exception):
        import logging

        logging.getLogger(__name__).exception("Unhandled application error", exc_info=error)
        return JSONResponse(
            {
                "error": {
                    "code": 500,
                    "message": "Terjadi kesalahan server. Silakan coba kembali.",
                    "details": [],
                }
            },
            status_code=500,
        )

    @app.get("/health")
    def health(db: Session = Depends(get_db)):
        db.exec(select(literal(1))).one()
        return {"status": "ok", "timezone": "Asia/Jakarta", "date": now().date()}

    @app.post("/api/auth/login")
    def login(
        data: schema.Login, request: Request, response: Response, db: Session = Depends(get_db)
    ):
        check_origin(request)
        rate_limit(request)
        user = db.exec(
            select(User).where(User.username == data.username, col(User.deleted).is_(False))
        ).first()
        encoded = user.password_hash if user else hash_password("timing-placeholder")
        valid = verify_password(data.password, encoded)
        if not user or not valid or not user.active:
            raise HTTPException(401, "Nama pengguna atau kata sandi salah.")
        assert user.id is not None
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
        db.add(
            LoginSession(
                token_hash=digest(token),
                csrf_hash=digest(csrf),
                user_id=user.id,
                expires_at=(now() + timedelta(days=30)),
            )
        )
        for expired in db.exec(select(LoginSession).where(LoginSession.expires_at < now())).all():
            db.delete(expired)
        db.commit()
        cookies(response, token, csrf, settings.cookie_secure)
        return public_user(user)

    @app.get("/api/auth/session")
    def current(user: User = Depends(get_user)):
        return public_user(user)

    @app.post("/api/auth/logout")
    def logout(
        request: Request,
        response: Response,
        user: User = Depends(get_user),
        db: Session = Depends(get_db),
    ):
        db.delete(request.state.login_session)
        db.commit()
        response.delete_cookie("farm_session")
        response.delete_cookie("farm_csrf")
        return {"message": "Anda sudah keluar."}

    @app.post("/api/auth/password")
    def password(
        data: schema.Password,
        request: Request,
        user: User = Depends(get_user),
        db: Session = Depends(get_db),
    ):
        if not verify_password(data.current_password, user.password_hash):
            raise HTTPException(422, "Kata sandi saat ini salah.")
        if verify_password(data.new_password, user.password_hash):
            fail("Kata sandi baru harus berbeda.")
        user.password_hash = hash_password(data.new_password)
        user.must_change_password = False
        db.add(user)
        for old in db.exec(select(LoginSession).where(LoginSession.user_id == user.id)).all():
            if old.token_hash != request.state.login_session.token_hash:
                db.delete(old)
        db.commit()
        return public_user(user)

    @app.get("/api/meta")
    def meta(user: User = Depends(get_user)):
        return {
            "today": now().date(),
            "timezone": "Asia/Jakarta",
            "average_egg_kg": settings.average_egg_kg,
            "box_kg": settings.box_kg,
            "flock_sale_rule": "proportional",
        }

    @app.get("/api/users")
    def users(q: str = "", user: User = Depends(get_user), db: Session = Depends(get_db)):
        require_admin(user)
        return [
            public_user(u)
            for u in db.exec(
                select(User).where(col(User.deleted).is_(False)).order_by(User.username)
            ).all()
            if q.casefold() in u.username.casefold()
        ]

    @app.post("/api/users", status_code=201)
    def create_user(
        data: schema.UserCreate, user: User = Depends(get_user), db: Session = Depends(get_db)
    ):
        require_admin(user)
        new = User(
            username=data.username, password_hash=hash_password(data.password), role=data.role
        )
        db.add(new)
        db.commit()
        db.refresh(new)
        return public_user(new)

    @app.put("/api/users/{id}")
    def update_user(
        id: int,
        data: schema.UserUpdate,
        user: User = Depends(get_user),
        db: Session = Depends(get_db),
    ):
        require_admin(user)
        target = db.get(User, id)
        if not target or target.deleted:
            raise HTTPException(404, "Pengguna tidak ditemukan.")
        if target.id == user.id and (data.role != "admin" or not data.active):
            fail("Anda tidak dapat mencabut akses admin sendiri.")
        for key, val in data.model_dump().items():
            setattr(target, key, val)
        db.add(target)
        db.commit()
        return public_user(target)

    @app.delete("/api/users/{id}")
    def delete_user(id: int, user: User = Depends(get_user), db: Session = Depends(get_db)):
        require_admin(user)
        target = db.get(User, id)
        if not target or target.deleted:
            raise HTTPException(404, "Pengguna tidak ditemukan.")
        if id == user.id:
            fail("Anda tidak dapat menghapus akun sendiri.")
        target.deleted, target.active = True, False
        db.add(target)
        for token in db.exec(select(LoginSession).where(LoginSession.user_id == id)).all():
            db.delete(token)
        db.commit()
        return {"message": "Pengguna dihapus; jejak audit tetap disimpan."}

    @app.get("/api/records/{kind}")
    def records(
        kind: str,
        start: date | None = None,
        end: date | None = None,
        q: str = "",
        group_id: int | None = None,
        status: str | None = None,
        offset: int = Query(0, ge=0),
        limit: int = Query(100, ge=1, le=500),
        user: User = Depends(get_user),
        db: Session = Depends(get_db),
    ):
        cls = model_for(kind)
        statement = select(cls).order_by(cls.id.desc())
        if kind != "options":
            if start:
                statement = statement.where(cls.date >= start)
            if end:
                statement = statement.where(cls.date <= end)
        if kind == "production" and group_id:
            statement = statement.where(Production.group_id == group_id)
        items = [view(db, kind, r, app.state.settings) for r in db.exec(statement).all()]
        if q:
            items = [
                r
                for r in items
                if q.casefold()
                in " ".join(
                    str(r.get(k, ""))
                    for k in (
                        "buyer",
                        "lender",
                        "name",
                        "notes",
                        "category_name",
                        "group_name",
                        "product_name",
                    )
                ).casefold()
            ]
        if status and kind in {"sales", "debts"}:
            items = [r for r in items if r["status"] == status]
        total = sum(
            DecimalValue(
                r.get(
                    {
                        "production": "kg",
                        "expenses": "amount",
                        "sales": "total",
                        "debts": "outstanding",
                        "assets": "book_value",
                    }.get(kind, "_"),
                    0,
                )
            )
            for r in items
        )
        return {"items": items[offset : offset + limit], "count": len(items), "total": total}

    @app.post("/api/records/{kind}/preview")
    def preview(
        kind: str, data: dict, user: User = Depends(get_user), db: Session = Depends(get_db)
    ):
        if kind not in {"sales", "expenses"}:
            raise HTTPException(404, "Pratinjau tidak tersedia.")
        return prepare(db, kind, validated(kind, data), settings)

    @app.post("/api/records/{kind}", status_code=201)
    def create(
        kind: str, data: dict, user: User = Depends(get_user), db: Session = Depends(get_db)
    ):
        cls = model_for(kind)
        if kind == "options":
            require_admin(user)
        values = prepare(db, kind, validated(kind, data), settings)
        initial_payment = values.pop("first_payment", 0)
        paid_in_full = values.pop("paid_in_full", False)
        record = cls(**values, **audit(user))
        db.add(record)
        db.flush()
        if kind == "sales":
            amount = record.total if paid_in_full else initial_payment
            if amount:
                db.add(Payment(sale_id=record.id, date=record.date, amount=amount, **audit(user)))
        db.commit()
        db.refresh(record)
        return view(db, kind, record, settings)

    @app.get("/api/records/{kind}/{id}")
    def detail(kind: str, id: int, user: User = Depends(get_user), db: Session = Depends(get_db)):
        record = record_for(db, kind, id)
        data = view(db, kind, record, settings)
        if kind in {"sales", "debts", "assets"}:
            cls, key = {
                "sales": (Payment, Payment.sale_id),
                "debts": (Repayment, Repayment.debt_id),
                "assets": (Adjustment, Adjustment.asset_id),
            }[kind]
            data["history"] = [
                p.model_dump()
                for p in db.exec(
                    select(cls).where(key == id).order_by(col(cls.date), col(cls.id))
                ).all()
            ]
        return data

    @app.put("/api/records/{kind}/{id}")
    def update(
        kind: str,
        id: int,
        data: dict,
        user: User = Depends(get_user),
        db: Session = Depends(get_db),
    ):
        if kind == "options":
            require_admin(user)
        record = record_for(db, kind, id)
        values = prepare(db, kind, validated(kind, data), settings, record)
        if kind in {"sales", "debts"}:
            cls, key = (
                (Payment, Payment.sale_id) if kind == "sales" else (Repayment, Repayment.debt_id)
            )
            if db.exec(select(cls).where(key == id, cls.date < values["date"])).first():
                fail("Tanggal catatan tidak boleh setelah tanggal pembayaran yang sudah ada.")
        values.pop("first_payment", None)
        values.pop("paid_in_full", None)
        for key, val in values.items():
            setattr(record, key, val)
        touch(record, user)
        db.add(record)
        db.commit()
        db.refresh(record)
        return view(db, kind, record, settings)

    @app.delete("/api/records/{kind}/{id}")
    def delete(kind: str, id: int, user: User = Depends(get_user), db: Session = Depends(get_db)):
        require_admin(user)
        record = record_for(db, kind, id)
        if kind == "options" and record.role:
            raise HTTPException(
                409, "Pilihan ini digunakan untuk perhitungan dan tidak dapat dihapus."
            )
        for name, cls, key in [
            ("sales", Payment, Payment.sale_id),
            ("debts", Repayment, Repayment.debt_id),
            ("assets", Adjustment, Adjustment.asset_id),
        ]:
            if kind == name:
                for child in db.exec(select(cls).where(key == id)).all():
                    db.delete(child)
                db.flush()
        db.delete(record)
        db.commit()
        return {"message": "Catatan dihapus."}

    @app.post("/api/records/{kind}/{id}/history", status_code=201)
    def add_history(
        kind: str,
        id: int,
        data: dict,
        user: User = Depends(get_user),
        db: Session = Depends(get_db),
    ):
        parent = record_for(db, kind, id)
        if kind == "assets":
            values = schema.AdjustmentInput.model_validate(data).model_dump()
            check_adjustment(db, parent, values)
            record = Adjustment(asset_id=id, **values, **audit(user))
        elif kind in {"sales", "debts"}:
            values = schema.PaymentInput.model_validate(data).model_dump()
            if values["date"] < parent.date:
                fail("Tanggal pembayaran tidak boleh sebelum tanggal catatan.")
            record = (
                Payment(sale_id=id, **values, **audit(user))
                if kind == "sales"
                else Repayment(debt_id=id, **values, **audit(user))
            )
        else:
            raise HTTPException(404, "Riwayat tidak tersedia.")
        touch(parent, user)
        db.add(parent)
        db.add(record)
        db.commit()
        db.refresh(record)
        return record

    @app.put("/api/records/{kind}/{id}/history/{child_id}")
    def update_history(
        kind: str,
        id: int,
        child_id: int,
        data: schema.PaymentInput,
        user: User = Depends(get_user),
        db: Session = Depends(get_db),
    ):
        parent = record_for(db, kind, id)
        if kind not in {"sales", "debts"}:
            raise HTTPException(405, "Pengurangan ayam tidak dapat diubah. Hapus lalu buat ulang.")
        cls, fk = (Payment, "sale_id") if kind == "sales" else (Repayment, "debt_id")
        record = db.get(cls, child_id)
        if not record or getattr(record, fk) != id:
            raise HTTPException(404, "Pembayaran tidak ditemukan.")
        if data.date < parent.date:
            fail("Tanggal pembayaran tidak boleh sebelum tanggal catatan.")
        for key, val in data.model_dump().items():
            setattr(record, key, val)
        touch(record, user)
        touch(parent, user)
        db.add(record)
        db.add(parent)
        db.commit()
        return record

    @app.delete("/api/records/{kind}/{id}/history/{child_id}")
    def delete_history(
        kind: str,
        id: int,
        child_id: int,
        user: User = Depends(get_user),
        db: Session = Depends(get_db),
    ):
        require_admin(user)
        parent = record_for(db, kind, id)
        if kind not in {"sales", "debts", "assets"}:
            raise HTTPException(404, "Riwayat tidak tersedia.")
        cls, fk = {
            "sales": (Payment, "sale_id"),
            "debts": (Repayment, "debt_id"),
            "assets": (Adjustment, "asset_id"),
        }[kind]
        record = db.get(cls, child_id)
        if not record or getattr(record, fk) != id:
            raise HTTPException(404, "Riwayat tidak ditemukan.")
        db.delete(record)
        touch(parent, user)
        db.add(parent)
        db.commit()
        return {"message": "Riwayat dihapus."}

    @app.get("/api/dashboard")
    def dashboard(
        period: str = "month",
        start: date | None = None,
        end: date | None = None,
        user: User = Depends(get_user),
        db: Session = Depends(get_db),
    ):
        first, last = date_range(period, start, end)
        return summary(db, settings, first, last)

    @app.get("/api/reports/financial")
    def report(
        year: int = Query(default=now().year, ge=2000, le=2100),
        month: int = Query(default=now().month, ge=1, le=12),
        user: User = Depends(get_user),
        db: Session = Depends(get_db),
    ):
        return financial(db, year, month)

    @app.get("/api/reports/export")
    def export(
        year: int = Query(default=now().year, ge=2000, le=2100),
        month: int = Query(default=now().month, ge=1, le=12),
        user: User = Depends(get_user),
        db: Session = Depends(get_db),
    ):
        data = financial(db, year, month)
        workbook = Workbook()
        sheet = workbook.active
        assert sheet is not None
        sheet.title = "Laba Rugi"
        sheet.append(["Cins Farm · Laporan laba rugi", year, month])
        sheet.append(["Komponen", "Bulan", "Tahun"])
        labels = {
            "revenue": "Pendapatan",
            "cost_of_goods": "Harga pokok",
            "operating_expenses": "Operasional",
            "gross_profit": "Laba kotor",
            "ebitda": "EBITDA",
            "depreciation": "Penyusutan",
            "net_profit": "Laba bersih",
        }
        for key, label in labels.items():
            sheet.append([label, data["month"][key], data["year"][key]])
        sheet.column_dimensions["A"].width = 32
        trend = workbook.create_sheet("Tren Bulanan")
        trend.append(["Bulan", "Pendapatan", "Laba bersih"])
        for row in data["trend"]:
            trend.append([row["month"], row["revenue"], row["net_profit"]])
        stream = BytesIO()
        workbook.save(stream)
        stream.seek(0)
        return StreamingResponse(
            stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="cins-farm-{year}-{month:02d}.xlsx"'
            },
        )

    @app.get("/api/market-prices")
    def market_prices(user: User = Depends(get_user)):
        return {
            "status": "not_configured",
            "prices": [],
            "message": "Sumber harga Bantul/Yogyakarta belum dikonfigurasi. Tidak ada harga langsung yang ditampilkan.",
        }

    @app.post("/api/market-prices/refresh")
    def refresh_market(user: User = Depends(get_user)):
        raise HTTPException(
            503, "Sumber harga belum tersedia. Hubungkan sumber terverifikasi terlebih dahulu."
        )

    dist = ROOT / "frontend/dist"
    if dist.is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/")
        def frontend():
            return FileResponse(dist / "index.html")

    return app


# Decimal conversion stays on the server; record list totals never use binary float arithmetic.
from decimal import Decimal as DecimalValue  # noqa: E402

app = create_app()
