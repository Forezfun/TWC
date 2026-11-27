# TWC

Монорепозиторий проекта:

- `frontend/` — Angular-приложение с SSR;
- `backend/` — FastAPI + PostgreSQL, см. `backend/README.md`;
- `deploy/` — примеры конфигурации для VPS;
- `.github/workflows/` — CI-процессы GitHub Actions.

## Frontend

Требования:

- Node.js 24.18.0;
- npm 11.16.0.

Установка зависимостей и запуск для разработки:

```bash
cd frontend
npm ci
npm start
```

Production-сборка и локальный запуск SSR-сервера:

```bash
cd frontend
npm ci
npm run build
PORT=4000 npm run serve:ssr:twc
```

После запуска frontend доступен на `http://127.0.0.1:4000`.

## Backend

Стек: Python 3.12, FastAPI, SQLAlchemy 2 (async), Alembic, PostgreSQL. Запуск,
структура, модель данных и список эндпоинтов — в `backend/README.md`. Сервер
слушает `127.0.0.1:3000`, все пути под `/api`, Swagger на `/api/docs`.
Админка для сотрудников НКО — на сайте по адресу `/admin` (вход по почте и паролю,
первого сотрудника создаёт `python -m app.create_admin`).

## CI

Проверки запускаются при push в `main` и при открытии или обновлении pull request.

`.github/workflows/frontend-ci.yml` — для изменений во `frontend/`:

1. устанавливает зависимости командой `npm ci`;
2. запускает модульные тесты (`npm test -- --watch=false`);
3. выполняет production-сборку Angular SSR.

`.github/workflows/backend-ci.yml` — для изменений в `backend/` и `shared/`:

1. устанавливает зависимости (`uv sync --frozen --group dev`);
2. проверяет код линтером `ruff`;
3. запускает `pytest` на PostgreSQL 16 в контейнере.

## Развёртывание на VPS

Стенд: https://twc.intexcor.ru (временный). Админка — `/admin`.

### Автовыкладка

Workflow `.github/workflows/deploy.yml` запускается при каждом push в `main`
(и вручную через «Run workflow»):

1. собирает Angular SSR в GitHub Actions — на сервере сборка не выполняется;
2. упаковывает `backend/`, `shared/` и `frontend/dist/` в архив;
3. передаёт архив по SSH скрипту `deploy/bin/deploy.sh`;
4. проверяет, что сайт и `/api/health` отвечают снаружи.

Скрипт на сервере распаковывает архив в `/opt/twc/releases/<дата>-<ревизия>`,
ставит зависимости backend (`uv sync --frozen --no-dev`), переключает ссылку
`/opt/twc/current`, перезапускает сервисы и ждёт ответа от обоих. Если сервисы
не поднялись, он возвращает предыдущий релиз и завершает workflow с ошибкой.
Хранятся два последних релиза. Миграции Alembic применяет `twc-backend` при старте.

Для работы нужен один секрет репозитория (Settings → Secrets and variables →
Actions): `DEPLOY_SSH_KEY` — приватный SSH-ключ выкладки. Его публичная часть на
сервере привязана к `deploy.sh` и не даёт доступа к оболочке. Адрес сервера и его
публичный ключ заданы в `env` самого workflow — при переезде меняются там.

### Устройство сервера

- пользователь `twc`, каталог `/opt/twc` (`releases/`, ссылка `current`);
- `/usr/local/bin/twc-deploy` — копия `deploy/bin/deploy.sh`, владелец root;
- systemd-сервисы из `deploy/systemd/*.service.example`: backend на
  `127.0.0.1:3000`, frontend на `127.0.0.1:4000`, с ограничением памяти;
- `/etc/twc/backend.env` — `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`
  (см. `backend/.env.example`);
- `/etc/twc/frontend.env`:

```dotenv
NG_ALLOWED_HOSTS=localhost,127.0.0.1,ДОМЕН
NG_TRUST_PROXY_HEADERS=x-forwarded-for,x-forwarded-proto
API_BASE_URL=http://127.0.0.1:3000
```

  Не следует указывать `NG_ALLOWED_HOSTS=*`: точный список защищает SSR-сервер от
  подмены заголовка `Host` и SSRF-атак.
- `twc` может через sudo только перезапускать `twc-backend` и `twc-frontend`;
- обратный прокси: `/api/` → backend, остальное → frontend. Примеры —
  `deploy/caddy/Caddyfile.example` и `deploy/nginx/twc.conf.example`.

Node.js на сервере нужен только для запуска SSR (версия из раздела Frontend),
Python 3.12 и `uv` — для backend. Порты `3000` и `4000` наружу не открываются.

### Ручные операции

```bash
journalctl -u twc-backend -u twc-frontend -n 100     # логи
sudo systemctl restart twc-backend twc-frontend      # перезапуск
cat /opt/twc/current/REVISION                        # какая ревизия выложена
```

Первого сотрудника админки создаёт `python -m app.create_admin EMAIL` из
`/opt/twc/current/backend` с переменными из `/etc/twc/backend.env`.
