// Registers the Telegram webhook and the Calendly org webhook against APP_URL.
import "./env";
import { setWebhook } from "../lib/telegram";
import { registerWebhook } from "../lib/calendly";

(async () => {
  const base = process.env.APP_URL;
  if (!base) throw new Error("APP_URL not set");
  await setWebhook(`${base}/api/webhooks/telegram`, process.env.TELEGRAM_WEBHOOK_SECRET!);
  console.log("Telegram webhook set");
  if (process.env.CALENDLY_ADMIN_TOKEN) {
    await registerWebhook({ token: process.env.CALENDLY_ADMIN_TOKEN }, `${base}/api/webhooks/calendly`, process.env.CALENDLY_WEBHOOK_SIGNING_KEY!)
      .then(() => console.log("Calendly webhook set"))
      .catch((e) => console.error("Calendly webhook:", e.message, "(already registered? Needs a paid plan + org admin token)"));
  }
  console.log(`Vaani webhook URL to paste into Vaani: ${base}/api/webhooks/vaani?key=<VAANI_WEBHOOK_KEY>`);
})().catch((e) => { console.error(e); process.exit(1); });
