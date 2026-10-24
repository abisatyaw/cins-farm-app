# Cins Farm

A local-first bookkeeping and egg-farm management app for a small team. FastAPI +
SQLite backend, React + TypeScript frontend, Indonesian interface, and Jakarta farm dates.
All totals, stock, payment status, depreciation, and productivity calculations run in Python.

## Clone and run locally

Prerequisites: [uv](https://docs.astral.sh/uv/getting-started/installation/) and
[Node.js](https://nodejs.org/) **22.12+ or 24 LTS**, with npm. uv installs the pinned
Python 3.12 runtime if necessary. Use Bash on macOS/Linux, or WSL on Windows.

```bash
git clone https://github.com/abisatyaw/cins-farm-app.git
cd cins-farm-app
./scripts/dev.sh
```

On a fresh clone the script installs locked dependencies, then starts both servers.
Open **http://localhost:5173**. The API documentation is at http://localhost:8000/docs.
Keep the terminal open; Ctrl+C stops both servers. Use the same hostname throughout
(login cookies for `localhost` and `127.0.0.1` are separate).

On first startup, the database, migrations, default options, and `admin` user are
created automatically. Read the generated initial password in another terminal:

```bash
cat .local/admin-initial-password
```

Log in as **admin**. You must change this password before using the app. There is no
shared default password. The generated file is private and ignored by Git; after
changing the password you may remove it. Alternatively, set
`FARM_INITIAL_ADMIN_PASSWORD` securely before the first startup. It only affects an
empty database. New users also have to change their initial password.

To install/update dependencies explicitly, run `./scripts/setup.sh`. To run servers
separately (including in PowerShell), use two terminals from the project root:

```bash
uv sync --frozen
npm --prefix frontend ci
# Terminal 1
uv run --frozen uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
# Terminal 2
npm --prefix frontend run dev -- --port 5173 --strictPort
```

## What's implemented

- 30-day, renewable cookie sessions, CSRF protection, password hashing, forced initial
  password change, and backend-enforced admin/user access. Only admins manage users
  and options or delete records. User deletion revokes access while retaining audit history.
- Configurable asset types, chicken groups, products, units, expense categories,
  and feed factors. Calculation roles survive renaming. Referenced options cannot be deleted.
- Production by date and group, egg-count estimates, filtering, totals, and CRUD.
- Expense quantity/price previews, automatic totals, feed kilograms, and saved unit/factor snapshots.
- Sales with initial/full payment, complete editable payment histories, computed
  receivables and overpayments. Sales and their payments delete together.
- Debts, due dates, informational interest, and repayment histories with overpayment support.
- Equipment and flock assets, straight-line monthly depreciation, age in weeks, and
  append-only flock reductions (death/sale/missing), with quantity guards. The owner's
  chosen rule reduces remaining book value proportionally for flock sales.
- Dashboard: period filters, production trend/groups, egg stock, eight-week expense
  breakdown, customer receivables, outstanding debt, FCR and HDP with targets.
- Monthly/yearly P&L, a monthly profit trend, and a real Excel workbook export.
- SQLite migrations, schema drift test, online backups, health checks, Docker, and CI workflows.

**Not implemented:** live market-price scraping (a verified Bantul/Yogyakarta source
is still needed). The price panel explicitly reports unavailable data; it does not show invented prices.
See [the implementation plan](docs/ROADMAP.md).

## Start with your farm

1. In **Daftar pilihan**, rename groups and adjust feed kg-per-sack factors.
2. Add chicken flocks under **Aset & ternak**, with a group and acquisition date.
3. Record daily production, purchases/expenses, and sales.
4. Open sale/debt details to manage payments. Open flock details to record reductions.
5. Review the dashboard and download financial reports.

Normal users can create and edit business records and add/edit payments; deletion,
options, and user management are admin-only. There is no seeded sample transaction data.

## Accounting conventions

Money uses integer rupiah; multiplication rounds half up. Quantities allow three
fractional digits. One transaction/asset is limited to Rp1 trillion. The default egg
weight is 0.06 kg and a box is 15 kg; both are configurable. Saved sale kilograms and
purchase units/feed factors are retained when unrelated fields are edited.

Stock is cumulative production + egg purchases − egg sales through the period end.
Negative stock remains visible so missing records can be corrected. Receivables and
debt totals are balances through that date; the sales/expense metrics use the selected period.
HDP uses estimated eggs divided by hen-days in the selected period. No production or
flock data means no ratio, rather than a fabricated zero.

P&L recognizes revenue on the sale date and expenses on the expense date, regardless
of payments. Feed/egg/chicken purchases are expensed immediately as cost of goods;
this is a simple farm-management convention, not inventory-accrual accounting. Loans
and repayments do not count as income/expenses. Depreciation is charged on each monthly
purchase-date anniversary, clamped to month end. Flock reductions proportionally reduce
remaining book value and future depreciation. Record proceeds from chicken sales
separately under Sales; a flock adjustment alone creates no revenue. Losses on disposals
are not separate P&L expense lines in this MVP. Asset purchase and expense entries are
separate: avoid double-entering purchases when interpreting your reports.

## Configuration and storage

Defaults work without an `.env` file or external service. To override, copy
`.env.example` to `.env`. Settings are loaded from the project-root file and `FARM_`
environment variables. Do not commit secrets or databases. Data lives in
`.local/farm.sqlite3` by default. Keep `.local/` between restarts.

For use behind HTTPS, set `FARM_COOKIE_SECURE=true` and include the public origin in
`FARM_ALLOWED_ORIGINS` (JSON array). The default development servers listen only on
loopback. This release targets a single farm, one application process, and a local
SQLite disk. Don't run multiple application workers or place SQLite on a network filesystem.

## Back up and restore

While the application is running, from the project root:

```bash
uv run --frozen --directory backend python -m app.backup
# Optionally choose an output path; existing backups are never overwritten:
uv run --frozen --directory backend python -m app.backup --output ../backups/manual.sqlite3
```

Default backups go to the project-root `backups/` directory. The SQLite online
backup API includes committed WAL data and verifies the backup with `integrity_check`.
Copy backups off the machine regularly. Backup files contain private farm data.

To restore: **stop the app**, preserve the current `.local/` directory, then copy a
verified backup into a fresh `.local/farm.sqlite3`. Do not leave old `farm.sqlite3-wal`
or `farm.sqlite3-shm` files alongside the restored database. Restart the application;
existing accounts and their current passwords come from the backup. Do not delete the
only copy of your database or backup to reset a password.

## Docker

With Docker Engine/Desktop and Compose:

```bash
docker compose up --build -d
# Open http://localhost:8000 (the built React app is served by FastAPI).
docker compose exec farm cat .local/admin-initial-password
docker compose logs -f farm
```

The `farm-data` volume retains SQLite and the bootstrap file; `farm-backups` retains
container backups. `docker compose down` keeps both volumes. **Do not use `down -v`**
unless you intend to erase those volumes.

```bash
docker compose exec farm python -m app.backup
docker compose cp farm:/app/backups ./backups
```

If your network uses a private certificate authority, the Docker build supports an
optional BuildKit `build_ca` secret containing your trusted CA bundle (for example,
`docker build --secret id=build_ca,src=/path/to/ca-bundle.pem -t cins-farm-app .`).
This preserves TLS verification without baking the certificate into the image.

The image runs as a non-root user. A health check verifies `/health`. The image workflow
publishes to GHCR on a `v*` tag or manual run; it is not run merely by cloning this repo.

## Development checks

```bash
./scripts/check.sh
```

This runs Ruff lint/format checks, `ty` type checking, pytest against isolated temporary
SQLite databases, and the TypeScript/Vite production build. Tests cover role/CSRF
rules, migrations and schema drift, payments and overpayments, option references,
unit snapshots, flock limits and valuation, stock/productivity, financial exports,
and online backups. Running tests does not change your live farm database.

The frontend is divided into pages, reusable forms, and UI components. HTTP contracts
are documented by FastAPI at `/docs`; `/health` works without login. Business endpoints
live under `/api`; business records have `created_by`/`updated_by` and timestamps.
