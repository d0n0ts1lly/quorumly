/**
 * Cloudflare Worker: приймає заявку з форми на сайті та пересилає її в Telegram.
 *
 * ВАЖЛИВО: TELEGRAM_BOT_TOKEN та TELEGRAM_CHAT_ID НЕ прописані тут як текст.
 * Вони підставляються Cloudflare під час виконання зі "секретів" (env),
 * які ви задаєте окремою командою — і які ніколи не потрапляють у git-репозиторій.
 *
 * Як задати секрети (один раз, з терміналу, після встановлення wrangler):
 *   npx wrangler secret put TELEGRAM_BOT_TOKEN
 *   npx wrangler secret put TELEGRAM_CHAT_ID
 * Wrangler запитає значення в терміналі — просто вставте токен і чат-ID.
 *
 * Задеплоїти воркер:
 *   npx wrangler deploy
 *
 * Після деплою Cloudflare видасть адресу виду:
 *   https://badun-contact-form.<ваш-субдомен>.workers.dev
 * Цю адресу треба вставити в index.html у змінну FORM_ENDPOINT.
 */

// Тільки з цього джерела прийматимуться запити (ваш сайт на GitHub Pages).
const ALLOWED_ORIGIN = "https://d0n0ts1lly.github.io";

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return new Response("Bad request", { status: 400, headers: corsHeaders() });
    }

    const name = (data.name || "").toString().slice(0, 200);
    const contact = (data.contact || "").toString().slice(0, 200);
    const service = (data.service || "").toString().slice(0, 200);
    const message = (data.message || "").toString().slice(0, 2000);

    if (!name || !contact || !message) {
      return new Response("Missing fields", { status: 400, headers: corsHeaders() });
    }

    const text =
      `🆕 Нова заявка з сайту\n\n` +
      `Ім'я: ${name}\n` +
      `Контакт: ${contact}\n` +
      `Послуга: ${service}\n` +
      `Повідомлення: ${message}`;

    const tgRes = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text,
        }),
      }
    );

    if (!tgRes.ok) {
      return new Response("Telegram error", { status: 502, headers: corsHeaders() });
    }

    return new Response("OK", { status: 200, headers: corsHeaders() });
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
