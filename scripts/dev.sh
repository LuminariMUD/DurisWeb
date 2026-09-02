#!/usr/bin/env bash
set -euo pipefail

dev_script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
dev_repo_root=$(cd "${dev_script_dir}/.." && pwd)
dev_root_environment="${dev_repo_root}/.env"
dev_backend_environment="${dev_repo_root}/backend/.env"
dev_frontend_environment="${dev_repo_root}/frontend/.env"

for dev_command in docker pnpm; do
  if ! command -v "${dev_command}" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "${dev_command}" >&2
    exit 1
  fi
done

if ! docker compose version >/dev/null 2>&1; then
  printf 'Docker Compose is required (docker compose).\n' >&2
  exit 1
fi

for dev_environment in \
  "${dev_root_environment}" \
  "${dev_backend_environment}" \
  "${dev_frontend_environment}"; do
  if [ ! -f "${dev_environment}" ]; then
    printf 'Missing required environment file: %s\n' "${dev_environment}" >&2
    printf 'Follow docs/onboarding.md before starting.\n' >&2
    exit 78
  fi
done

read_required_value() {
  local dev_file=$1
  local dev_name=$2
  local dev_value
  dev_value=$(sed -n "s/^${dev_name}=//p" "${dev_file}" | tail -n 1)
  if [ -z "${dev_value}" ]; then
    printf 'Missing required value %s in %s\n' "${dev_name}" "${dev_file}" >&2
    exit 78
  fi
  if [[ "${dev_value}" =~ [Cc][Hh][Aa][Nn][Gg][Ee][_-]?[Mm][Ee]|[Rr][Ee][Pp][Ll][Aa][Cc][Ee]_[Ww][Ii][Tt][Hh] ]]; then
    printf 'Replace the example placeholder for %s in %s\n' "${dev_name}" "${dev_file}" >&2
    exit 78
  fi
  printf '%s' "${dev_value}"
}

for dev_name in \
  COMPOSE_MYSQL_IMAGE COMPOSE_MYSQL_ROOT_PASSWORD COMPOSE_MYSQL_USER \
  COMPOSE_MYSQL_PASSWORD COMPOSE_MYSQL_DATABASE COMPOSE_MYSQL_BIND_ADDRESS \
  COMPOSE_MYSQL_HOST_PORT COMPOSE_MYSQL_HEALTHCHECK_HOST COMPOSE_REDIS_IMAGE \
  COMPOSE_REDIS_PASSWORD COMPOSE_REDIS_BIND_ADDRESS COMPOSE_REDIS_HOST_PORT; do
  read_required_value "${dev_root_environment}" "${dev_name}" >/dev/null
done

for dev_name in \
  VITE_BASE_URL VITE_API_URL VITE_WS_URL VITE_STATIC_URL FRONTEND_DEV_HOST \
  FRONTEND_DEV_PORT FRONTEND_PREVIEW_HOST FRONTEND_PREVIEW_PORT FRONTEND_ALLOWED_HOSTS; do
  read_required_value "${dev_frontend_environment}" "${dev_name}" >/dev/null
done

for dev_package in backend frontend; do
  if [ ! -d "${dev_repo_root}/${dev_package}/node_modules" ]; then
    pnpm --dir "${dev_repo_root}/${dev_package}" install --frozen-lockfile
  fi
done

pnpm --dir "${dev_repo_root}/backend" config:check
pnpm --dir "${dev_repo_root}/frontend" config:check
docker compose --env-file "${dev_root_environment}" \
  --project-directory "${dev_repo_root}" \
  -f "${dev_repo_root}/podman-compose.yml" config --quiet
docker compose --env-file "${dev_root_environment}" \
  --project-directory "${dev_repo_root}" \
  -f "${dev_repo_root}/podman-compose.yml" up -d

dev_backend_pid=''
dev_frontend_pid=''

stop_dev_processes() {
  trap - EXIT INT TERM
  if [ -n "${dev_backend_pid}" ] && kill -0 "${dev_backend_pid}" 2>/dev/null; then
    kill "${dev_backend_pid}" 2>/dev/null || true
  fi
  if [ -n "${dev_frontend_pid}" ] && kill -0 "${dev_frontend_pid}" 2>/dev/null; then
    kill "${dev_frontend_pid}" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
}

trap stop_dev_processes EXIT INT TERM

pnpm --dir "${dev_repo_root}/backend" dev &
dev_backend_pid=$!
pnpm --dir "${dev_repo_root}/frontend" dev &
dev_frontend_pid=$!

dev_frontend_host=$(read_required_value "${dev_frontend_environment}" FRONTEND_DEV_HOST)
dev_frontend_port=$(read_required_value "${dev_frontend_environment}" FRONTEND_DEV_PORT)
dev_frontend_base=$(read_required_value "${dev_frontend_environment}" VITE_BASE_URL)
dev_backend_host=$(read_required_value "${dev_backend_environment}" HOST)
dev_backend_port=$(read_required_value "${dev_backend_environment}" PORT)

printf 'DurisWeb development processes started.\n'
printf 'Frontend: http://%s:%s%s\n' "${dev_frontend_host}" "${dev_frontend_port}" "${dev_frontend_base}"
printf 'Backend health: http://%s:%s/health\n' "${dev_backend_host}" "${dev_backend_port}"
printf 'Press Ctrl-C to stop the application processes. MySQL and Redis remain running.\n'

wait -n "${dev_backend_pid}" "${dev_frontend_pid}"
