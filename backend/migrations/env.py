from pathlib import Path

from alembic import context
from app import models  # noqa: F401
from app.config import Settings
from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel

config = context.config
url = config.get_main_option("sqlalchemy.url")
if url == "sqlite:///.local/farm.sqlite3":
    config.set_main_option("sqlalchemy.url", Settings().database_url.replace("%", "%%"))

db_url = config.get_main_option("sqlalchemy.url")
if db_url.startswith("sqlite:///"):
    Path(db_url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)

if context.is_offline_mode():
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=SQLModel.metadata,
        literal_binds=True,
    )
    with context.begin_transaction():
        context.run_migrations()
else:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section), prefix="sqlalchemy.", poolclass=pool.NullPool
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=SQLModel.metadata, render_as_batch=True
        )
        with context.begin_transaction():
            context.run_migrations()
