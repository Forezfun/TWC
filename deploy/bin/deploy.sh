#!/usr/bin/env bash
# Выкладка релиза на VPS. Запускается от пользователя twc.
#
#   deploy.sh <git-sha> < release.tgz
#
# В GitHub Actions вызывается по SSH: ключ в authorized_keys привязан к этому
# скрипту (command="..."), ревизия приходит в SSH_ORIGINAL_COMMAND, архив — в stdin.
# Архив содержит backend/, shared/ и frontend/dist/ (собирается в CI).
set -euo pipefail

ROOT=/opt/twc
export PATH="$ROOT/.local/bin:$PATH"   # uv установлен пользователю twc
KEEP=2          # сколько релизов хранить (текущий + предыдущий для отката)
BACKEND_HEALTH=http://127.0.0.1:3000/api/health
FRONTEND_HEALTH=http://127.0.0.1:4000/

rev="${SSH_ORIGINAL_COMMAND:-${1:-}}"
if [[ ! "$rev" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "использование: deploy.sh <git-sha> < release.tgz" >&2
  exit 2
fi

exec 9>"$ROOT/deploy.lock"
flock -n 9 || { echo "другая выкладка ещё идёт" >&2; exit 1; }

log() { echo "[deploy ${rev:0:7}] $*"; }

restart() { sudo /usr/bin/systemctl restart twc-backend.service twc-frontend.service; }

healthy() {
  local i
  for i in $(seq 1 30); do
    if curl -fs -o /dev/null --max-time 3 "$BACKEND_HEALTH" &&
       curl -fs -o /dev/null --max-time 5 -H 'Host: localhost' "$FRONTEND_HEALTH"; then
      return 0
    fi
    sleep 2
  done
  return 1
}

new="$ROOT/releases/$(date -u +%Y%m%d%H%M%S)-${rev:0:7}"
mkdir -p "$new"
trap 'rm -rf "$new"' ERR

log "распаковка в $new"
tar -xzf - -C "$new" --no-same-owner --no-same-permissions
for path in backend/pyproject.toml backend/uv.lock shared frontend/dist/twc/server/server.mjs; do
  [[ -e "$new/$path" ]] || { echo "в архиве нет $path" >&2; exit 1; }
done
echo "$rev" > "$new/REVISION"

log "зависимости backend"
(cd "$new/backend" && UV_CACHE_DIR="$ROOT/.cache/uv" UV_PYTHON_DOWNLOADS=never \
  uv sync --frozen --no-dev --quiet)

prev=""
[[ -L "$ROOT/current" ]] && prev="$(readlink -f "$ROOT/current")"
trap - ERR

log "переключение на новый релиз"
ln -sfn "$new" "$ROOT/current.tmp"
mv -Tf "$ROOT/current.tmp" "$ROOT/current"
restart || true   # миграции выполняет twc-backend при старте (ExecStartPre)

if healthy; then
  log "сервисы отвечают"
else
  echo "[deploy ${rev:0:7}] проверка не прошла" >&2
  sudo /usr/bin/systemctl status twc-backend.service twc-frontend.service --no-pager -n 20 >&2 || true
  if [[ -n "$prev" && -d "$prev" ]]; then
    echo "[deploy ${rev:0:7}] откат на $(basename "$prev")" >&2
    ln -sfn "$prev" "$ROOT/current.tmp"
    mv -Tf "$ROOT/current.tmp" "$ROOT/current"
    restart || true
  else
    rm -f "$ROOT/current"
  fi
  rm -rf "$new"
  exit 1
fi

# Старые релизы и кэш uv: диск на VPS маленький.
ls -1d "$ROOT"/releases/*/ 2>/dev/null | sort | head -n -"$KEEP" | xargs -r rm -rf
UV_CACHE_DIR="$ROOT/.cache/uv" uv cache prune --quiet || true
log "готово"
