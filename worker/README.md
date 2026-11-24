# wishkov-proxy

Небольшой Cloudflare Worker для кофе-копилки: по публичной ссылке вишлиста на [wishkov.ru](https://wishkov.ru) отдаёт JSON с товарами (название, цена, ссылка, фото).

Публичный адрес после деплоя:

`https://wishkov-proxy.artur-kontrabaev.workers.dev/?list=<slug>`

Пример: https://wishkov-proxy.artur-kontrabaev.workers.dev/?list=sydycbwq

`slug` — только `[a-z0-9]+`. Воркер сам ходит на `https://wishkov.ru/w/<slug>/` и никуда больше: произвольный URL передать нельзя, это не открытый прокси. Кэш ответа — 5 минут, CORS — `Access-Control-Allow-Origin: *`.

`&fresh=1` — обойти кэш и сходить на wishkov.ru сразу; свежий результат кладётся в 5-минутный кэш для обычных запросов. Пример: https://wishkov-proxy.artur-kontrabaev.workers.dev/?list=sydycbwq&fresh=1

Деплой (токен в окружении, в репозиторий не класть):

```bash
cd worker
npx wrangler deploy
```
