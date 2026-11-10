# Размещение HeroicHeroes

Маршрут: GitHub `MrBoomer1981/HeroicHeroes`, ветка `main` → Railway, сервис `heroic-heroes`.

## Настройка сервиса

1. Подключить репозиторий GitHub и ветку main. Railway собирает корневой Dockerfile, в котором выполняются сборка и тесты.
2. Подключить постоянный Volume с Mount Path `/data`. Не задавать RAILWAY_VOLUME_MOUNT_PATH вручную: Railway добавляет её сам при подключении тома.
3. Создать Railway domain в Settings → Networking. Сервис слушает `0.0.0.0` и предоставленный `PORT`.
4. В Variables добавить:

| Переменная | Значение |
| --- | --- |
| APP_MODE | telegram |
| NODE_ENV | production |
| HOST | 0.0.0.0 |
| BOT_USERNAME | HeroicHeroesBot |
| BOT_TOKEN | настоящий токен из BotFather, вводится только в Railway |
| MINI_APP_URL | HTTPS-адрес корня сервиса, без параметров |
| RUN_BOT | true |
| DATA_DIR | /data |
| TZ | Europe/Moscow |
| ALLOWED_TELEGRAM_IDS | числовые ID участников через запятую; изначально может быть пустой |

`MINI_APP_URL` можно не задавать, если Railway уже предоставляет `RAILWAY_PUBLIC_DOMAIN`. Приложение использует его автоматически.

5. Запустить deployment. Проверка готовности: `GET /healthz` → `{"ok":true}`. Бот проверяет свой username и отсутствие webhook перед настройкой команд и кнопки меню.
6. Написать `/id` боту https://t.me/HeroicHeroesBot. Добавить полученный числовой ID в ALLOWED_TELEGRAM_IDS и применить изменения. Пока список пуст, вход в Mini App закрыт всем; бот отвечает и сообщает ID.
7. Открыть `/start` → «Открыть Лигу», получить первую карточку, перезапустить Mini App. Убедиться, что карточка на месте. Добавлять друзей тем же способом через /id.

## Обновления

Коммит и push в main запускают сборку Railway из GitHub. Dockerfile не допускает выпуск при упавших тестах. GitHub Actions также проверяет сборку и тесты. Не запускать отдельный `npm run bot`, когда RUN_BOT=true в Railway. Не увеличивать число реплик и не включать serverless sleep для сервиса с polling.

Данные лежат в `/data/league.sqlite` вместе с WAL-файлами; не размещать их в файловой системе образа. Перед существенными обновлениями делать резервную копию тома через Railway Backups. Для переноса живой базы использовать SQLite backup API или остановить запись; простое копирование одного `.sqlite` без WAL может потерять последние изменения.

## Перед приглашением друзей

- Проверить вход владельца и второго участника; коллекции должны быть разными.
- Проверить отказ аккаунту, которого нет в списке.
- Проверить повторный вход с другого устройства и сохранение после redeploy.
- Проверить мобильную вёрстку, кнопку назад, форму с клавиатурой и PNG-экспорт на устройствах участников.
- Если установлен webhook, текущий код остановится с объяснением. Удалять webhook автоматически нельзя: сначала определить, обслуживает ли он другой сценарий.

## Текущее состояние

Код подготовлен. Реальный BOT_TOKEN не получен и не добавлен; сообщения настоящему боту и вход из Telegram не проверены. Встроенный браузер недоступен; проверки DOM выполняются автоматически, но визуальная проверка остаётся открытой.

## Официальные источники

- [Подпись Telegram Mini Apps](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Railway Dockerfiles](https://docs.railway.com/builds/dockerfiles)
- [Railway Volumes](https://docs.railway.com/volumes)
- [Railway config as code](https://docs.railway.com/config-as-code/reference)
