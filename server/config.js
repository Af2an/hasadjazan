import { randomBytes } from "node:crypto";

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  const trust = env.TRUST_PROXY ?? "1";
  const config = {
    production,
    port: Number(env.PORT) || 3000,
    databaseUrl: env.DATABASE_URL || "",
    sessionSecret: env.SESSION_SECRET || "",
    adminPasswordHash: env.ADMIN_PASSWORD_HASH || "",
    appOrigin: (env.APP_ORIGIN || "").replace(/\/+$/, ""),
    trustProxy: /^\d+$/.test(trust) ? Number(trust) : trust,
    sessionTtlMs: 8 * 60 * 60 * 1000,
    smtp: {
      host: env.SMTP_HOST || "",
      port: Number(env.SMTP_PORT) || 587,
      user: env.SMTP_USER || "",
      pass: env.SMTP_PASS || ""
    },
    mailTo: env.MAIL_TO || "hasadjaz@gmail.com",
    mailFrom: env.MAIL_FROM || env.SMTP_USER || ""
  };

  const missing = [];
  if (!config.databaseUrl) missing.push("DATABASE_URL");
  if (production) {
    if (config.sessionSecret.length < 32) missing.push("SESSION_SECRET (32+ chars)");
    if (!/^\$2[aby]\$\d{2}\$.{53}$/.test(config.adminPasswordHash)) missing.push("ADMIN_PASSWORD_HASH (bcrypt)");
  }
  if (missing.length) throw new Error("Missing or invalid environment variables: " + missing.join(", "));

  // Development only: a throwaway secret so sessions work without setup.
  if (!config.sessionSecret) config.sessionSecret = randomBytes(32).toString("hex");
  return config;
}
