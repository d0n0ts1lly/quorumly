// Общий Cloudflare Worker для двух сайтов — webpulse.* и tochmed.com.ua.
// Оба фронтенда шлют сюда POST с JSON, воркер собирает текст и пересылает
// его в один и тот же Telegram-бот через Bot API.
//
// Секреты воркера (задаются через `wrangler secret put`, НЕ в коде):
//   TELEGRAM_BOT_TOKEN — токен Telegram-бота
//   TELEGRAM_CHAT_ID   — chat_id, куда слать сообщения
//
// Формат запроса определяется автоматически:
//   • есть поле "type" ("contact" | "call" | "order")  → заявка с tochmed.com.ua
//   • поля "name" + "contact" (+ "service", "message"), без "type" → заявка с webpulse

export default {
  async fetch(request, env) {
    const corsHeaders = {
      // Список источников, которым разрешено слать сюда запросы.
      // При желании можно сузить проверку origin ниже вместо "*".
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", {
        status: 405,
        headers: corsHeaders,
      });
    }

    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      return json({ ok: false, error: "invalid json" }, 400, corsHeaders);
    }

    // honeypot-поле (антиспам), если добавишь его в форму
    if (payload._hp) {
      return json({ ok: true }, 200, corsHeaders);
    }

    const text = buildMessage(payload);
    if (!text) {
      return json({ ok: false, error: "invalid payload" }, 400, corsHeaders);
    }

    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
      return json({ ok: false, error: "bot not configured" }, 500, corsHeaders);
    }

    const tgUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const tgRes = await fetch(tgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: "Markdown",
      }),
    });

    if (!tgRes.ok) {
      const errText = await tgRes.text();
      console.error("Telegram error:", errText);
      return json({ ok: false, error: "telegram_error" }, 502, corsHeaders);
    }

    return json({ ok: true }, 200, corsHeaders);
  },
};

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function esc(v) {
  return (v ?? "").toString().trim();
}

function buildMessage(payload) {
  if (!payload || typeof payload !== "object") return null;

  // ---------- tochmed.com.ua: типизированные заявки ----------
  if (payload.type) {
    return buildTochmedMessage(payload);
  }

  // ---------- webpulse: форма заказа сайта ----------
  return buildWebpulseMessage(payload);
}

function buildWebpulseMessage(payload) {
  const { name, contact, service, message } = payload;
  if (!name || !contact || !message) return null;

  let msg = `🌐 *НОВА ЗАЯВКА WEBPULSE* 🌐\n\n`;
  msg += `👤 *Ім'я:* ${esc(name)}\n`;
  msg += `📞 *Контакт:* ${esc(contact)}\n`;
  if (service) msg += `🛠 *Послуга:* ${esc(service)}\n`;
  msg += `💬 *Повідомлення:* ${esc(message)}`;
  return msg;
}

function buildTochmedMessage(payload) {
  const { type } = payload;

  if (type === "order") {
    const {
      firstName,
      lastName,
      phone,
      email,
      novaPoshta,
      comments,
      items,
      total,
    } = payload;
    if (
      !firstName ||
      !lastName ||
      !phone ||
      !novaPoshta ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return null;
    }

    let msg = `📦 *НОВЫЙ ЗАКАЗ ТОЧМЕД* 📦\n\n`;
    msg += `👤 *Клиент:* ${esc(firstName)} ${esc(lastName)}\n`;
    msg += `📞 *Телефон:* ${esc(phone)}\n`;
    if (email) msg += `📧 *Email:* ${esc(email)}\n`;
    msg += `🚚 *Отделение Новой Почты:* ${esc(novaPoshta)}\n`;
    if (comments) msg += `💬 *Комментарий:* ${esc(comments)}\n\n`;

    msg += `🛒 *Товары в заказе:*\n`;
    items.forEach((item) => {
      msg += `• ${esc(item.name)} - ${esc(item.quantity)} шт. - ${esc(
        item.itemTotal
      )}\n`;
    });

    msg += `\n💰 *Общая сумма:* ${esc(total)}`;
    return msg;
  }

  if (type === "call") {
    const { name, phone, email, message } = payload;
    if (!name || !phone) return null;

    let msg = `📞 *ЗАПРОС ЗВОНКА ТОЧМЕД* 📞\n\n`;
    msg += `👤 *Имя:* ${esc(name)}\n`;
    msg += `📞 *Телефон:* ${esc(phone)}\n`;
    if (email) msg += `📧 *Email:* ${esc(email)}\n`;
    if (message) msg += `💬 *Сообщение:* ${esc(message)}`;
    return msg;
  }

  if (type === "contact") {
    const { name, email, message } = payload;
    if (!name || !email || !message) return null;

    let msg = `📧 *СООБЩЕНИЕ С САЙТА ТОЧМЕД* 📧\n\n`;
    msg += `👤 *Имя:* ${esc(name)}\n`;
    msg += `📧 *Email:* ${esc(email)}\n`;
    msg += `💬 *Сообщение:* ${esc(message)}`;
    return msg;
  }

  return null;
}
