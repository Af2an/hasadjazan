import path from "node:path";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import compression from "compression";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcryptjs";
import { createSessions, safeEqual } from "./session.js";
import { parseSubmit, parseOffer, parseDemand, parseLogin, isUuid, isToken } from "./validation.js";

const DEFAULT_DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const TEN_MINUTES = 10 * 60 * 1000;
const DEFAULT_TITLE = "احتياج حصاد جازان للتجربة";

export function createApp({ config, repo, mailer, logger = console, distDir = DEFAULT_DIST }) {
  const app = express();
  const sessions = createSessions({ secret: config.sessionSecret, ttlMs: config.sessionTtlMs, production: config.production });

  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);

  // Platform health check; answered before the HTTPS redirect.
  app.get("/healthz", (req, res) => res.type("text/plain").send("ok"));

  if (config.production) {
    // Redirect only when the proxy says the visitor came over plain HTTP. A proxy that
    // terminates TLS without sending X-Forwarded-Proto must not cause a redirect loop.
    app.use((req, res, next) => {
      const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
      if (proto !== "http") return next();
      res.redirect(308, (config.appOrigin || "https://" + req.headers.host) + req.originalUrl);
    });
  }

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"]
      }
    },
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: false },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    frameguard: { action: "deny" },
    crossOriginResourcePolicy: { policy: "same-origin" }
  }));
  app.use((req, res, next) => {
    res.setHeader("Permissions-Policy", "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()");
    next();
  });

  app.use(compression());

  // ── API ──────────────────────────────────────────────────────────────
  const api = express.Router();

  api.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setTimeout(15000, () => { if (!res.headersSent) res.status(503).json({ error: "timeout" }); });
    next();
  });

  // Same-origin only. No CORS headers are ever sent, and state-changing
  // requests that a browser marks as coming from another origin are refused.
  api.use((req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD") return next();
    const origin = req.headers.origin;
    const site = req.headers["sec-fetch-site"];
    let ok = true;
    if (origin) {
      let url = null;
      try { url = new URL(origin); } catch { /* malformed origin */ }
      // req.hostname follows X-Forwarded-Host from the trusted proxy, for hosts that rewrite Host.
      ok = (!!config.appOrigin && origin === config.appOrigin) || (!!url && (url.host === req.headers.host || url.hostname === req.hostname));
    } else if (site) {
      ok = site === "same-origin" || site === "none";
    }
    if (!ok) return res.status(403).json({ error: "forbidden" });
    if (!req.is("application/json")) return res.status(415).json({ error: "unsupported_media_type" });
    next();
  });

  api.use(express.json({ limit: "16kb", type: "application/json" }));

  const limiter = (limit, windowMs, extra) => rateLimit({
    windowMs, limit, standardHeaders: "draft-7", legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: "rate_limited" }),
    ...extra
  });
  const submitLimiter = limiter(5, TEN_MINUTES);
  const offerLimiter = limiter(5, TEN_MINUTES);
  const trialReadLimiter = limiter(60, TEN_MINUTES);
  const loginLimiter = limiter(5, 15 * 60 * 1000, { skipSuccessfulRequests: true });

  const adminLink = config.appOrigin ? config.appOrigin + "/admin" : "/admin";

  api.post("/submit", submitLimiter, async (req, res) => {
    const d = parseSubmit(req.body);
    if (!d) return res.status(400).json({ error: "invalid" });
    // Honeypot: bots that fill the hidden field get the same generic answer, nothing is stored.
    if (d.website) return res.json({ ok: true });
    if (d.type === "restaurant") {
      await repo.insertRestaurantLead(d);
      void mailer.notify("حصاد جازان | تسجيل مطعم جديد", ["وصل تسجيل جديد من مطعم.", "المنطقة: " + d.region + " · " + d.city, "مستعد للتجربة: " + d.trial, "التفاصيل في لوحة الإدارة: " + adminLink]);
    } else {
      await repo.insertFishLead(d);
      void mailer.notify("حصاد جازان | تسجيل صاحب أسماك جديد", ["وصل تسجيل جديد من " + d.kind + ".", "مستعد للتجربة: " + d.trial, "التفاصيل في لوحة الإدارة: " + adminLink]);
    }
    res.json({ ok: true });
  });

  api.get("/trial/:token", trialReadLimiter, async (req, res) => {
    const demand = isToken(req.params.token) ? await repo.getPublicDemand(req.params.token) : null;
    if (!demand) return res.status(404).json({ error: "not_found" });
    res.json(demand);
  });

  api.post("/trial/:token/offers", offerLimiter, async (req, res) => {
    if (!isToken(req.params.token)) return res.status(404).json({ error: "not_found" });
    const d = parseOffer(req.body);
    if (!d) return res.status(400).json({ error: "invalid" });
    if (d.website) return res.json({ ok: true });
    if (!(await repo.insertOffer(req.params.token, d))) return res.status(404).json({ error: "not_found" });
    void mailer.notify("حصاد جازان | عرض كمية جديد", ["وصل عرض كمية جديد على احتياج التجربة.", "راجعه من لوحة الإدارة: " + adminLink]);
    res.json({ ok: true });
  });

  // ── Admin ────────────────────────────────────────────────────────────
  const requireAdmin = (req, res, next) => {
    req.session = sessions.read(req);
    if (!req.session) return res.status(401).json({ error: "unauthorized" });
    next();
  };
  const requireCsrf = (req, res, next) => {
    const sent = req.headers["x-csrf-token"];
    if (typeof sent !== "string" || !safeEqual(sent, req.session.csrf)) return res.status(403).json({ error: "csrf" });
    next();
  };

  api.post("/admin/login", loginLimiter, async (req, res) => {
    const d = parseLogin(req.body);
    if (!d) return res.status(400).json({ error: "invalid" });
    const ok = !!config.adminPasswordHash && (await bcrypt.compare(d.password, config.adminPasswordHash));
    if (!ok) return res.status(401).json({ error: "invalid_credentials" });
    sessions.start(res);
    res.json({ ok: true });
  });

  api.get("/admin/session", requireAdmin, (req, res) => res.json({ csrf: req.session.csrf }));

  api.post("/admin/logout", requireAdmin, requireCsrf, (req, res) => {
    sessions.end(req, res);
    res.json({ ok: true });
  });

  api.get("/admin/leads", requireAdmin, async (req, res) => res.json(await repo.listLeads()));
  api.get("/admin/demands", requireAdmin, async (req, res) => res.json(await repo.listDemands()));

  api.post("/admin/demands", requireAdmin, requireCsrf, async (req, res) => {
    const d = parseDemand(req.body);
    if (!d) return res.status(400).json({ error: "invalid" });
    const token = randomBytes(32).toString("base64url"); // 256-bit, CSPRNG
    await repo.createDemand({ ...d, title: d.title || DEFAULT_TITLE }, token);
    res.json({ ok: true });
  });

  api.post("/admin/demands/:id/revoke", requireAdmin, requireCsrf, async (req, res) => {
    if (!isUuid(req.params.id) || !(await repo.revokeDemand(req.params.id))) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  });

  api.post("/admin/offers/:id/count", requireAdmin, requireCsrf, async (req, res) => {
    if (!isUuid(req.params.id) || !(await repo.countOffer(req.params.id))) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  });

  api.use((req, res) => res.status(404).json({ error: "not_found" }));
  app.use("/api", api);

  // ── Pages ────────────────────────────────────────────────────────────
  // index.html is read once; the share-card tags get the public origin so link previews resolve.
  let indexHtml = null;
  const sendIndex = (res) => {
    if (indexHtml === null) indexHtml = readFileSync(path.join(distDir, "index.html"), "utf8").replaceAll("__APP_ORIGIN__", config.appOrigin);
    res.type("html").send(indexHtml);
  };
  const page = (req, res) => { res.setHeader("Cache-Control", "no-cache"); sendIndex(res); };
  const privatePage = (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    next();
  };

  app.get("/admin", privatePage, (req, res) => {
    if (!sessions.read(req)) return res.redirect(302, "/admin/login");
    sendIndex(res);
  });
  app.get("/admin/login", privatePage, (req, res) => {
    if (sessions.read(req)) return res.redirect(302, "/admin");
    sendIndex(res);
  });
  app.get("/trial/:token", privatePage, (req, res) => {
    res.setHeader("Referrer-Policy", "no-referrer"); // the token must not leak through Referer
    sendIndex(res);
  });
  app.get("/", page);
  app.get("/privacy", page);

  app.use(express.static(distDir, {
    index: false,
    setHeaders(res, file) {
      if (file.includes(path.sep + "assets" + path.sep)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    }
  }));

  app.use((req, res) => res.status(404).type("text/plain").send("Not found"));

  // Generic answers only; logs carry no request body and no stack trace reaches the client.
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const wantsJson = req.originalUrl.startsWith("/api/");
    let status = 500, code = "server_error";
    if (err && err.type === "entity.too.large") { status = 413; code = "payload_too_large"; }
    else if (err && (err.type === "entity.parse.failed" || err.status === 400)) { status = 400; code = "invalid"; }
    else if (err && err.status === 404) { status = 404; code = "not_found"; }
    else logger.error("[error]", req.method, req.route ? req.route.path : "-", err && err.code ? err.code : (err && err.name) || "Error");
    if (wantsJson) return res.status(status).json({ error: code });
    res.status(status).type("text/plain").send(status === 404 ? "Not found" : "Error");
  });

  return app;
}
