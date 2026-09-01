#!/usr/bin/env bash
set -euo pipefail

dev_script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
dev_repo_root=$(cd "${dev_script_dir}/.." && pwd)

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

if [ ! -f "${dev_repo_root}/backend/.env" ]; then
  printf 'Missing backend/.env. Follow docs/onboarding.md before starting.\n' >&2
  exit 1
fi

if [ ! -f "${dev_repo_root}/frontend/.env" ]; then
  printf 'frontend/.env is absent; Vite development defaults will be used.\n' >&2
  export VITE_API_URL="${VITE_API_URL:-http://localhost:3001}"
  export VITE_WS_URL="${VITE_WS_URL:-ws://localhost:3001/ws}"
fi

for dev_package in backend frontend; do
  if [ ! -d "${dev_repo_root}/${dev_package}/node_modules" ]; then
    pnpm --dir "${dev_repo_root}/${dev_package}" install --frozen-lockfile
  fi
done

docker compose --project-directory "${dev_repo_root}" \
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

printf 'DurisWeb development processes started.\n'
printf 'Frontend: http://localhost:5173\n'
printf 'Backend health: http://localhost:3001/health (with example PORT=3001)\n'
printf 'Press Ctrl-C to stop the application processes. MySQL and Redis remain running.\n'

wait -n "${dev_backend_pid}" "${dev_frontend_pid}"
