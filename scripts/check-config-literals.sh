#!/usr/bin/env bash
set -euo pipefail

guard_script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
guard_repo_root=$(cd "${guard_script_dir}/.." && pwd)
cd "${guard_repo_root}"

guard_failed=false

report_matches() {
  local guard_label=$1
  local guard_matches=$2
  if [ -n "${guard_matches}" ]; then
    printf '%s\n%s\n' "${guard_label}" "${guard_matches}" >&2
    guard_failed=true
  fi
}

backend_environment_reads=$(rg -n 'process\.env(\.|\[)' backend/src backend/knexfile.ts \
  --glob '*.ts' \
  --glob '!backend/src/config/environment.ts' \
  --glob '!backend/src/test/setupEnvironment.ts' \
  --glob '!**/__tests__/**' || true)
report_matches 'Direct backend environment reads must use src/config/environment.ts:' \
  "${backend_environment_reads}"

frontend_environment_reads=$(rg -n 'import\.meta\.env' frontend \
  --glob '*.{ts,vue}' \
  --glob '!frontend/src/config/environment.ts' \
  --glob '!frontend/vitest.config.ts' \
  --glob '!**/__tests__/**' || true)
report_matches 'Direct frontend environment reads must use src/config/environment.ts:' \
  "${frontend_environment_reads}"

legacy_aliases=$(rg -n '\b(DURIS_DB_(HOST|PORT|USER|PASSWORD|NAME)|MUD_WS_HOST|REDIS_HOST|REDIS_PORT|MUD_ACCOUNTS_DIR)\b' \
  backend/src backend/knexfile.ts frontend/src \
  --glob '!backend/src/config/environment.ts' \
  --glob '!**/__tests__/**' || true)
report_matches 'Legacy configuration aliases remain outside the rejection boundary:' \
  "${legacy_aliases}"

deployment_literals=$(rg -ni '(/home/(resakse|duris)|static2\.resakse\.com|newduris\.com|\bnewduris\b|\bduris\.sbs\b)' \
  README.md docs backend/src frontend/src frontend/public frontend/index.html deploy scripts podman-compose.yml \
  --glob '!scripts/check-config-literals.sh' \
  --glob '!backend/src/**/__tests__/**' \
  --glob '!frontend/src/**/__tests__/**' || true)
report_matches 'Known deployment-specific paths, domains, or branding remain active:' \
  "${deployment_literals}"

for obsolete_file in \
  backend/durisweb-backend.service \
  frontend/durisweb-frontend.service \
  deploy/systemd/durisweb-cloudflared.service \
  deploy/systemd/durisweb-production.service \
  deploy/systemd/durisweb-redis.service \
  deploy/redis/redis.conf.example \
  nginx-durisweb-initial.conf \
  nginx-durisweb.conf; do
  if [ -e "${obsolete_file}" ]; then
    printf 'Obsolete deployment file remains: %s\n' "${obsolete_file}" >&2
    guard_failed=true
  fi
done

if [ "${guard_failed}" = true ]; then
  exit 1
fi

printf 'Configuration literal regression check passed.\n'
