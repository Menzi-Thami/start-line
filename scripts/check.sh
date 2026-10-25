#!/usr/bin/env bash
# Every check, run here before a merge: the same ground CI used to cover on each pull request, so merging never waits
# on GitHub Actions minutes. Stops at the first failure. Usage, from the repo root: scripts/check.sh [--quick]
#   --quick  skips the end-to-end suite (a few minutes) for small, client-only text changes.
#
# Needs the .NET SDK, Node and SQL Server LocalDB (or STARTLINE_TEST_SQL set to another SQL Server), as in the README.
set -euo pipefail
cd "$(dirname "$0")/.."

quick=false
[ "${1:-}" = "--quick" ] && quick=true
step() { printf '\n== %s\n' "$1"; }

# A fresh database each run, so integration tests never meet an old schema.
export STARTLINE_TEST_SQL="${STARTLINE_TEST_SQL:-Server=(localdb)\\MSSQLLocalDB;Database=StartLineCheck$(date +%Y%m%d%H%M%S);Trusted_Connection=True;TrustServerCertificate=True}"

step 'Backend: format'
dotnet format StartLine.slnx --verify-no-changes
step 'Backend: build (warnings are errors)'
dotnet build StartLine.slnx -c Release -v q -nologo
step 'Backend: tests'
dotnet test StartLine.slnx -c Release --no-build -v q -nologo
step 'Backend: no model change without a migration'
dotnet ef migrations has-pending-model-changes --project src/StartLine.Infrastructure --startup-project src/StartLine.Infrastructure --no-build --configuration Release

cd client
step 'Client: install'
npm ci --silent
step 'Client: lint'
npm run -s lint
step 'Client: typecheck'
npm run -s typecheck
step 'Client: tests'
# One worker: on slower Windows machines parallel workers time out before they start.
npx vitest run --testTimeout=30000 --maxWorkers=1
step 'Client: build'
npm run -s build
step 'Client: audit'
npm audit --audit-level=high

if [ "$quick" = false ]; then
  step 'End to end (Playwright, Chromium)'
  npx playwright install chromium >/dev/null
  npx playwright test --reporter=line
fi

printf '\nAll checks passed.\n'
