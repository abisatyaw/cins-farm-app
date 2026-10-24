from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="FARM_", env_file=ROOT / ".env", extra="ignore")
    database_url: str = f"sqlite:///{ROOT / '.local/farm.sqlite3'}"
    initial_admin_password: str | None = None
    cookie_secure: bool = False
    allowed_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]
    average_egg_kg: float = 0.06
    box_kg: float = 15
    target_fcr: float = 2.2
    target_hdp: float = 85


def now() -> datetime:
    return datetime.now(ZoneInfo("Asia/Jakarta"))
