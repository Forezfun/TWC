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

## CI frontend

Workflow `.github/workflows/frontend-ci.yml` запускается для изменений во
`frontend/` при push в `main` и при открытии или обновлении pull request. Он:

1. устанавливает зависимости командой `npm ci`;
2. выполняет production-сборку Angular SSR.

Тесты и линтер можно добавить отдельными шагами после их настройки в проекте.

## Развёртывание frontend на VPS

Предполагаемое расположение репозитория на сервере — `/opt/twc`. Для приватного
репозитория серверу предварительно потребуется read-only deploy key.

```bash
cd /opt/twc
git pull --ff-only
cd frontend
npm ci
npm run build
```

После первой сборки:

1. скопировать `deploy/systemd/twc-frontend.service.example` в
   `/etc/systemd/system/twc-frontend.service`;
2. проверить пользователя, путь к репозиторию и путь к Node.js (`which node`);
3. создать `/etc/twc/frontend.env`, подставив публичный IP или домен VPS:

```dotenv
NG_ALLOWED_HOSTS=localhost,127.0.0.1,PUBLIC_IP_OR_DOMAIN
NG_TRUST_PROXY_HEADERS=x-forwarded-for,x-forwarded-proto
```

Не следует указывать `NG_ALLOWED_HOSTS=*`: точный список защищает SSR-сервер от
подмены заголовка `Host` и SSRF-атак.

4. выполнить:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now twc-frontend
sudo systemctl status twc-frontend
```

## Развёртывание backend на VPS

```bash
cd /opt/twc/backend
uv sync --no-dev
sudo cp ../deploy/systemd/twc-backend.service.example /etc/systemd/system/twc-backend.service
sudo nano /etc/twc/backend.env    # DATABASE_URL, ADMIN_TOKEN, CORS_ORIGINS — см. backend/.env.example
sudo systemctl daemon-reload
sudo systemctl enable --now twc-backend
```

Миграции применяются автоматически при старте сервиса.

Для внешнего доступа пример `deploy/nginx/twc.conf.example` направляет:

- запросы `/api/` на backend по адресу `127.0.0.1:3000`;
- остальные запросы на Angular SSR по адресу `127.0.0.1:4000`.

На firewall публично открываются только SSH и порты Nginx (`22`, `80`, `443`).
Порты `3000` и `4000` должны оставаться закрытыми для внешних подключений.
Без домена приложение можно открыть по HTTP через публичный IP-адрес VPS.
