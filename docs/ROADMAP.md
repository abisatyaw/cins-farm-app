# Farm app implementation plan

The source specification describes an intended product; the starting repository contained only a README.

1. **Foundation:** FastAPI, SQLite, Alembic migration, Jakarta clock, session cookies,
   first-run administrator and password rotation, roles, configuration, tests and backup.
2. **Farm records:** configurable options; production; expense previews; sales and customer
   payments; debts and repayments; assets, depreciation and flock reductions. Keep rules on the server.
3. **User interface:** React forms and searchable lists, payment history, user/option management,
   Indonesian labels and rupiah formatting, dashboard and financial report.
4. **Local delivery:** locked dependencies, one-command development startup, Docker,
   Excel export, automated checks, documentation and functional validation.
5. **Follow-up:** verified Bantul/Yogyakarta market-price sources and live scraper;
   production hardening and wider browser testing.

## Decisions and boundaries

- A single farm and one SQLite database; money is stored as integer rupiah. Quantities use decimals.
- No external services or credentials are necessary to run locally.
- First startup generates a random admin password in a private, ignored local file, unless supplied
  via `FARM_INITIAL_ADMIN_PASSWORD`. First login requires password replacement.
- Interest is informational, payments can exceed balances, option roles survive renaming.
- The owner approved proportional book-value reduction for chicken sales. All flock
  adjustments reduce the remaining quantity and proportional book value. Never remove more
  chickens than remain. Acquisition month starts the straight-line monthly depreciation schedule.
- Live market prices are explicitly unavailable until a reliable source is configured; no synthetic
  prices are presented as real prices.
- This is a local MVP, not a claim of audited financial accounting or production deployment readiness.

## Current validation

- Steps 1–4 implemented. The standard development command starts both servers.
- Backend tests, Ruff, Python type checking and the TypeScript/production build pass.
- Chromium smoke check exercised login/password rotation, production, sale preview,
  partial/overpayment, dashboard, mobile navigation and financial report.
- A built Docker image was exercised as a non-root user, including database initialization,
  authentication, online backup and restart with a retained session.
- Docker package downloads in the onboarding machine needed the platform proxy's DNS
  mapping and trusted CA bundle. TLS and lockfile checksum verification stayed enabled.
- GitHub Actions workflows have been added; execution on GitHub and publication to GHCR
  have not occurred in this local setup.
