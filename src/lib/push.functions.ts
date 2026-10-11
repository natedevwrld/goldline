import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const subSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ auth: z.string().min(1), p256dh: z.string().min(1) }),
});

export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  return { key: process.env["VAPID_PUBLIC_KEY"] ?? "" };
});

export const sendWelcomePush = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => subSchema.parse(d))
  .handler(async ({ data }) => {
    const { buildPushPayload } = await import("@block65/webcrypto-web-push");
    const payload = await buildPushPayload(
      {
        data: {
          title: "Welcome to Goldline Markets",
          body: "You're in. We'll alert you on market moves and account updates.",
          url: "/",
        },
        options: { ttl: 3600, urgency: "high" },
      },
      { ...data, expirationTime: data.expirationTime ?? null },
      {
        subject: "mailto:support@goldlinemarkets.com",
        publicKey: process.env["VAPID_PUBLIC_KEY"],
        privateKey: process.env["VAPID_PRIVATE_KEY"],
      },
    );
    const res = await fetch(data.endpoint, payload);
    if (!res.ok) throw new Error(`Push failed: ${res.status}`);
    return { ok: true };
  });
