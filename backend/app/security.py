import hashlib
import os
import secrets
from collections import defaultdict, deque
from datetime import timedelta
from pathlib import Path

from fastapi import HTTPException, Request, Response
from sqlmodel import Session, col, select

from app.config import ROOT, now
from app.models import Session as LoginSession
from app.models import User


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    key = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1)
    return f"{salt}${key.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    salt, expected = encoded.split("$", 1)
    key = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1)
    return secrets.compare_digest(key.hex(), expected)


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def public_user(user: User) -> dict:
    return user.model_dump(exclude={"password_hash", "deleted"})


def cookies(response: Response, token: str, csrf: str, secure: bool):
    for name, value, http_only in [("farm_session", token, True), ("farm_csrf", csrf, False)]:
        response.set_cookie(
            name,
            value,
            max_age=30 * 86400,
            httponly=http_only,
            secure=secure,
            samesite="lax",
            path="/",
        )


def check_origin(request: Request):
    origin = request.headers.get("origin")
    if origin and origin not in request.app.state.settings.allowed_origins:
        raise HTTPException(403, "Asal permintaan tidak diizinkan.")


def authenticate(request: Request, response: Response, db: Session) -> User:
    token = request.cookies.get("farm_session", "")
    session = db.get(LoginSession, digest(token)) if token else None
    if not session or session.expires_at < now():
        raise HTTPException(401, "Silakan masuk terlebih dahulu.")
    user = db.get(User, session.user_id)
    if not user or not user.active or user.deleted:
        raise HTTPException(401, "Akun tidak aktif.")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        check_origin(request)
        csrf = request.headers.get("x-csrf-token", "")
        if not csrf or not secrets.compare_digest(digest(csrf), session.csrf_hash):
            raise HTTPException(403, "Sesi tidak cocok. Muat ulang halaman.")
    if user.must_change_password and request.url.path not in {
        "/api/auth/session",
        "/api/auth/password",
        "/api/auth/logout",
    }:
        raise HTTPException(403, "Ganti kata sandi awal sebelum melanjutkan.")
    session.expires_at = now() + timedelta(days=30)
    db.add(session)
    db.flush()
    cookies(
        response,
        token,
        request.cookies.get("farm_csrf", ""),
        request.app.state.settings.cookie_secure,
    )
    request.state.login_session = session
    return user


def require_admin(user: User):
    if user.role != "admin":
        raise HTTPException(403, "Hanya admin yang boleh melakukan tindakan ini.")


_attempts: dict[str, deque] = defaultdict(deque)


def rate_limit(request: Request):
    key = request.client.host if request.client else "unknown"
    current = now().timestamp()
    attempts = _attempts[key]
    while attempts and attempts[0] < current - 300:
        attempts.popleft()
    if len(attempts) >= 15:
        raise HTTPException(429, "Terlalu banyak percobaan. Coba lagi dalam 5 menit.")
    attempts.append(current)


def seed_admin(
    db: Session,
    initial_password: str | None,
    password_path: Path = ROOT / ".local/admin-initial-password",
) -> User:
    existing = db.exec(select(User).order_by(col(User.id))).first()
    if existing:
        return existing
    password = initial_password or secrets.token_urlsafe(18)
    if len(password) < 10:
        raise RuntimeError("FARM_INITIAL_ADMIN_PASSWORD must contain at least 10 characters")
    if not initial_password:
        password_path.parent.mkdir(parents=True, exist_ok=True)
        # Never overwrite an earlier bootstrap password or print the password to logs.
        with open(
            password_path, "x", opener=lambda path, flags: os.open(path, flags, 0o600)
        ) as file:
            file.write(password + "\n")
    user = User(username="admin", password_hash=hash_password(password), role="admin")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
