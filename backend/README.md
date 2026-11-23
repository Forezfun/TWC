# Backend

FastAPI + SQLAlchemy 2 (async) + Alembic + PostgreSQL. Все пути под `/api`,
слушает `127.0.0.1:3000` (см. `deploy/nginx/twc.conf.example`).

## Запуск локально

Требования: Python 3.12+, [uv](https://docs.astral.sh/uv/), PostgreSQL 16+.
PostgreSQL можно запустить локально или через Docker Compose, как показано ниже.

Из корня репозитория перейдите в backend. Если терминал открыт в другой папке,
укажите полный путь к каталогу `backend`.

```bash
cd backend
cp -n .env.example .env
```

В `.env` проверьте `DATABASE_URL` и замените `JWT_SECRET=change-me` случайным
секретом, который можно получить командой `openssl rand -hex 32`.
`cp -n` сохраняет существующий `.env` при повторном запуске.

Если `uv` установлен в `~/.local/bin`, но терминал пишет `command not found: uv`,
добавьте этот каталог в PATH текущего терминала:

```bash
export PATH="$HOME/.local/bin:$PATH"
uv --version
```

Если PostgreSQL ещё не запущен, поднимите его через Docker Compose из этой папки
(нужен установленный и запущенный Docker):

```bash
docker compose up -d
```

Установите зависимости в `.venv`, примените миграции и заполните три ветки
навигатора и настройки. Повторный запуск `app.seed` безопасен. Затем создайте
первого сотрудника: замените `admin@example.com` своим адресом и введите пароль
в терминале. Последняя команда запускает сервер.

Команды можно копировать в интерактивный zsh: комментарии после команд убраны,
поскольку по умолчанию zsh может воспринимать их как аргументы.

```bash
uv sync
uv run alembic upgrade head
uv run python -m app.seed
uv run python -m app.create_admin admin@example.com
uv run uvicorn app.main:app --reload --port 3000
```

Документация эндпоинтов генерируется автоматически: `http://127.0.0.1:3000/api/docs`.

## Структура

```
app/
  main.py          # приложение, CORS, роутеры
  config.py        # настройки из .env
  db.py            # engine, сессии, Base
  models/          # таблицы: content.py (сценарии, настройки), consultation.py (слоты, заявки)
  schemas/         # Pydantic-схемы запросов/ответов
  api/public.py    # то, что дёргает сайт
  api/auth.py      # вход, сотрудники, смена пароля
  api/admin.py     # админка (Bearer JWT)
  auth.py          # bcrypt + JWT
  create_admin.py  # создать первого сотрудника
  seed.py          # стартовое наполнение
alembic/           # миграции
```

## Модель данных

- `scenario_nodes` — дерево навигатора. У узла есть `audience`
  (`parents` / `specialists` / `self`), `parent_id`, `kind`
  (`menu`, `answer`, `consult`, `donate`, `volunteer`, `link`), подпись кнопки
  `title`, текст `body`, `image_url` (пиктограмма), `audio_url` (озвучка),
  `link_url`, порядок `position`, флаг `is_published`.
- `settings` — ключ/значение, редактируемое из админки: `welcome_text`,
  `donate_url`, `donate_message`, `coordinator_contact`, `registration_open`.
- `consultation_slots` — свободные окна календаря. Слот занят, если на него
  есть заявка не в статусе `cancelled`.
- `consultation_requests` — заявки: имя, контакт, аудитория, слот или
  `preferred_time` текстом, статус `new` / `confirmed` / `done` / `cancelled`.
- `callback_requests` — подтверждения просьб перезвонить. Хранят исходный номер,
  согласие и ключ защиты от повтора, связаны с общей заявкой в `consultation_requests`.
  После создания у общей заявки заполнен только контакт, статус `new`.
  Вход заявителю не нужен.

## API

Публичное:

| Метод | Путь | Что делает |
|---|---|---|
| GET | `/api/scenarios/{audience}` | Опубликованное дерево аудитории целиком |
| GET | `/api/nodes/{id}` | Один узел |
| GET | `/api/settings` | Все настройки словарём |
| GET | `/api/slots` | Свободные слоты |
| POST | `/api/requests` | Создать заявку (409 если слот занят или запись закрыта) |
| POST | `/api/callback-requests` | Сохранить просьбу перезвонить: `{phone, consent: true, idempotency_key}`; 201 при создании, 200 при повторе |
| GET | `/api/health` | Проверка живости |

Авторизация админки:

| Метод | Путь | Что делает |
|---|---|---|
| POST | `/api/admin/login` | `{email, password}` → `{token, user}`; JWT живёт `JWT_TTL_HOURS` |
| GET | `/api/admin/me` | Текущий сотрудник |
| POST | `/api/admin/me/password` | Сменить свой пароль |
| GET/POST | `/api/admin/users` | Список / добавить сотрудника |
| PATCH | `/api/admin/users/{id}/active?active=` | Включить или отключить доступ |

Первого сотрудника создаёт команда (пароль спросит в терминале):

```bash
uv run python -m app.create_admin admin@anokolibri.ru "Имя"
```

Админка (заголовок `Authorization: Bearer <token>`):

| Метод | Путь | Что делает |
|---|---|---|
| GET/POST | `/api/admin/nodes` | Список / создать узел (`?audience=` для фильтра) |
| PATCH/DELETE | `/api/admin/nodes/{id}` | Изменить / удалить узел с потомками |
| GET | `/api/admin/settings` | Список настроек |
| PUT | `/api/admin/settings/{key}` | Создать или изменить настройку |
| GET/POST | `/api/admin/slots` | Слоты с признаком занятости / создать |
| DELETE | `/api/admin/slots/{id}` | Удалить слот |
| GET | `/api/admin/requests` | Общий список заявок, включая обратные звонки (`?status=` для фильтра) |
| GET | `/api/admin/callback-requests` | Исторический интерфейс чтения подтверждений обратных звонков |
| PATCH | `/api/admin/requests/{id}` | Изменить заявку. Действие `no_consultation` завершает заявку до назначения встречи и сохраняет причину |
| GET | `/api/admin/requests/export.csv` | Выгрузка в CSV |

## Тесты

Ходят в отдельную базу `twc_test` на том же Postgres (создать один раз:
`createdb -O twc twc_test`). Схема пересоздаётся на каждый запуск, таблицы
чистятся перед каждым тестом.

```bash
uv run pytest          # или TEST_DATABASE_URL=... uv run pytest
```

Покрыто: вход и JWT, сотрудники, дерево сценариев и публикация, права админки, слоты и двойная
запись, освобождение слота при отмене, закрытие записи, фильтр и CSV-выгрузка.

## Соглашения

- Код: `ruff check .` и `ruff format .` перед коммитом, строки до 100 символов.
- Миграции: менять модели, затем `uv run alembic revision --autogenerate -m "..."`,
  просмотреть файл в `alembic/versions`, затем `alembic upgrade head`.
- Для эндпоинтов документация обязательна: docstring у функции попадает в `/api/docs`.
- Внутренние функции документируем по необходимости.

## Что не сделано

- Уведомление координатора о новой заявке (место помечено `TODO` в `api/public.py`).
- Загрузка картинок и аудио для узлов (сейчас только URL).
