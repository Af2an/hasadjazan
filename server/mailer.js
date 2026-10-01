import nodemailer from "nodemailer";

// SMTP credentials live only in the server environment. Notifications are
// plain text and point to the admin panel instead of carrying contact details.
export function createMailer(config, logger = console) {
  const { host, port, user, pass } = config.smtp;
  if (!host || !user || !pass) {
    logger.warn("[mail] SMTP is not configured; notifications are disabled");
    return { async notify() {} };
  }
  const transport = nodemailer.createTransport({
    host, port, secure: port === 465, requireTLS: port !== 465,
    auth: { user, pass },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000
  });
  return {
    async notify(subject, lines) {
      try {
        await transport.sendMail({ from: config.mailFrom, to: config.mailTo, subject, text: lines.join("\n") });
      } catch (e) {
        logger.error("[mail] notification failed:", e && e.code ? e.code : "error");
      }
    }
  };
}
