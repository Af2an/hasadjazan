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
import { parseRestaurant, parseNeed, parseSupplier, parseSupplyReport, parseBatch, parseInspection, parseAllocation, parseDelivery, parseNeedUpdate, parseFollowUp, parseAgreement, parseExpense, parseSupplierOrder, parseReceive, parsePayment, parsePayout, parseAdminNeed, parseSummary, parseLogin, isUuid, isToken } from "./validation.js";

const DEFAULT_DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const TEN_MINUTES = 10 * 60 * 1000;

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
  const needLimiter = limiter(10, TEN_MINUTES);
  const linkReadLimiter = limiter(60, TEN_MINUTES);
  const loginLimiter = limiter(5, 15 * 60 * 1000, { skipSuccessfulRequests: true });

  const adminLink = config.appOrigin ? config.appOrigin + "/admin" : "/admin";
  const done = (res, ok) => (ok ? res.json({ ok: true }) : res.status(404).json({ error: "not_found" }));
  // repo answers "ok" or a reason code; reasons become a 409 the admin screen explains
  const result = (res, r) => (r === "ok" ? res.json({ ok: true }) : r === "missing" ? res.status(404).json({ error: "not_found" }) : res.status(409).json({ error: r }));

  // ── public: restaurant registration ──
  api.post("/submit", submitLimiter, async (req, res) => {
    const d = parseRestaurant(req.body);
    if (!d) return res.status(400).json({ error: "invalid" });
    // Honeypot: bots that fill the hidden field get the same generic answer, nothing is stored.
    if (d.website) return res.json({ ok: true });
    if ((await repo.insertRestaurantLead(d)) === "other") return res.status(409).json({ error: "phone_in_use" });
    void mailer.notify("تسجيل مطعم جديد", ["وصل تسجيل مطعم جديد.", "يرغب بالتواصل: " + d.wants_contact, "التفاصيل في لوحة الإدارة: " + adminLink]);
    res.json({ ok: true });
  });

  // ── public: the personal link of a verified restaurant ──
  api.get("/r/:token", linkReadLimiter, async (req, res) => {
    const view = isToken(req.params.token) ? await repo.getRestaurantView(req.params.token) : null;
    if (!view) return res.status(404).json({ error: "not_found" });
    res.json(view);
  });
  api.post("/r/:token/needs", needLimiter, async (req, res) => {
    if (!isToken(req.params.token)) return res.status(404).json({ error: "not_found" });
    const d = parseNeed(req.body);
    if (!d) return res.status(400).json({ error: "invalid" });
    if (d.website) return res.json({ ok: true });
    const id = await repo.createNeedByToken(req.params.token, d);
    if (!id) return res.status(404).json({ error: "not_found" });
    void mailer.notify("احتياج جديد من مطعم", ["وصل احتياج جديد ليوم " + d.date + ".", "راجعه من لوحة الإدارة: " + adminLink]);
    res.json({ ok: true });
  });

  // ── admin ──
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

  // Every successful admin change is written to the change log (what and when, never request bodies).
  const audit = (req, res, next) => {
    res.on("finish", () => {
      if (res.statusCode < 300 && req.route) void repo.addAudit(req.route.path, req.params.id || req.params.type || "").catch(() => {});
    });
    next();
  };
  const admin = [requireAdmin, requireCsrf, audit];
  const withId = (fn) => async (req, res) => (isUuid(req.params.id) ? fn(req, res, req.params.id) : res.status(404).json({ error: "not_found" }));

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


  // restaurants and suppliers
  api.get("/admin/leads", requireAdmin, async (req, res) => res.json(await repo.listLeads()));
  api.post("/admin/suppliers", ...admin, async (req, res) => {
    const d = parseSupplier(req.body);
    if (!d) return res.status(400).json({ error: "invalid" });
    if ((await repo.insertSupplier(d)) === "other") return res.status(409).json({ error: "phone_in_use" });
    res.json({ ok: true });
  });
  api.post("/admin/leads/:type/:id/update", ...admin, async (req, res) => {
    const { type, id } = req.params;
    if (!(type === "restaurant" || type === "fish") || !isUuid(id)) return res.status(404).json({ error: "not_found" });
    const d = type === "restaurant" ? parseRestaurant({ ...req.body, consent: true }) : parseSupplier(req.body);
    if (!d) return res.status(400).json({ error: "invalid" });
    const r = await repo.updateLead(type, id, d);
    if (r === "other") return res.status(409).json({ error: "phone_in_use" });
    done(res, r === "saved");
  });
  api.post("/admin/leads/:type/:id/delete", ...admin, async (req, res) => {
    const { type, id } = req.params;
    done(res, (type === "restaurant" || type === "fish") && isUuid(id) && (await repo.deleteLead(type, id)));
  });
  // verifying a restaurant issues its personal link (256-bit, CSPRNG); revoking it stops the link at once
  api.post("/admin/restaurants/:id/link", ...admin, withId(async (req, res, id) => done(res, await repo.setOrderToken(id, randomBytes(32).toString("base64url")))));
  api.post("/admin/restaurants/:id/unlink", ...admin, withId(async (req, res, id) => done(res, await repo.setOrderToken(id, null))));

  // needs
  api.get("/admin/needs", requireAdmin, async (req, res) => res.json(await repo.listNeeds()));
  api.post("/admin/needs/:id/update", ...admin, withId(async (req, res, id) => {
    const d = parseNeedUpdate(req.body);
    if (!d) return res.status(400).json({ error: "invalid" });
    done(res, await repo.updateNeed(id, d));
  }));

  api.post("/admin/needs", ...admin, async (req, res) => {
    const d = parseAdminNeed(req.body);
    if (!d) return res.status(400).json({ error: "invalid" });
    const id = await repo.createNeedForRestaurant(d.restaurant_id, d);
    id ? res.json({ ok: true, id }) : res.status(404).json({ error: "not_found" });
  });
  api.post("/admin/needs/:id/payments", ...admin, withId(async (req, res, id) => {
    const d = parsePayment(req.body);
    if (!d) return res.status(400).json({ error: "invalid" });
    done(res, await repo.addPayment(id, d));
  }));
  api.post("/admin/payments/:id/delete", ...admin, withId(async (req, res, id) => done(res, await repo.deletePayment(id))));
  api.post("/admin/batches/:id/payout", ...admin, withId(async (req, res, id) => {
    const d = parsePayout(req.body);
    if (!d) return res.status(400).json({ error: "invalid" });
    done(res, await repo.payoutBatch(id, d));
  }));

  api.post("/admin/restaurants/:id/follow", ...admin, withId(async (req, res, id) => {
    const d = parseFollowUp(req.body);
    if (!d) return res.status(400).json({ error: "invalid" });
    done(res, await repo.setFollowUp(id, d));
  }));
  api.post("/admin/restaurants/:id/agreement", ...admin, withId(async (req, res, id) => {
    const d = parseAgreement(req.body);
    if (!d) return res.status(400).json({ error: "invalid" });
    done(res, await repo.setAgreement(id, d));
  }));
  api.get("/admin/expenses", requireAdmin, async (req, res) => res.json(await repo.listExpenses()));
  api.post("/admin/expenses", ...admin, async (req, res) => {
    const d = parseExpense(req.body);
    if (!d) return res.status(400).json({ error: "invalid" });
    await repo.addExpense(d);
    res.json({ ok: true });
  });
  api.post("/admin/expenses/:id/delete", ...admin, withId(async (req, res, id) => done(res, await repo.deleteExpense(id))));
  api.get("/admin/audit", requireAdmin, async (req, res) => res.json(await repo.listAudit()));

  api.get("/admin/supplier-orders", requireAdmin, async (req, res) => res.json(await repo.listSupplierOrders()));
  api.post("/admin/supplier-orders", ...admin, async (req, res) => {
    const d = parseSupplierOrder(req.body);
    if (!d) return res.status(400).json({ error: "invalid" });
    const id = await repo.createSupplierOrder(d);
    id ? res.json({ ok: true, id }) : res.status(404).json({ error: "not_found" });
  });
  api.post("/admin/supplier-orders/:id/receive", ...admin, withId(async (req, res, id) => {
    const d = parseReceive(req.body);
    if (!d) return res.status(400).json({ error: "invalid" });
    result(res, await repo.receiveSupplierOrder(id, d));
  }));
  api.post("/admin/supplier-orders/:id/cancel", ...admin, withId(async (req, res, id) => done(res, await repo.cancelSupplierOrder(id))));

  // supplier reports
  api.get("/admin/supply-reports", requireAdmin, async (req, res) => res.json(await repo.listSupplyReports()));
  api.post("/admin/supply-reports", ...admin, async (req, res) => {
    const d = parseSupplyReport(req.body);
    if (!d) return res.status(400).json({ error: "invalid" });
    const id = await repo.addSupplyReport(d);
    id ? res.json({ ok: true, id }) : res.status(404).json({ error: "not_found" });
  });
  api.post("/admin/supply-reports/:id/delete", ...admin, withId(async (req, res, id) => done(res, await repo.deleteSupplyReport(id))));

  // purchases, inspection, allocation, delivery
  api.get("/admin/batches", requireAdmin, async (req, res) => res.json(await repo.listBatches()));
  api.post("/admin/batches", ...admin, async (req, res) => {
    const d = parseBatch(req.body);
    if (!d) return res.status(400).json({ error: "invalid" });
    const id = await repo.createBatch(d);
    id ? res.json({ ok: true, id }) : res.status(404).json({ error: "not_found" });
  });
  api.post("/admin/batches/:id/inspect", ...admin, withId(async (req, res, id) => {
    const d = parseInspection(req.body);
    if (!d) return res.status(400).json({ error: "invalid" });
    result(res, await repo.inspectBatch(id, d));
  }));
  api.post("/admin/batches/:id/delete", ...admin, withId(async (req, res, id) => result(res, await repo.deleteBatch(id))));
  api.post("/admin/allocations", ...admin, async (req, res) => {
    const d = parseAllocation(req.body);
    if (!d) return res.status(400).json({ error: "invalid" });
    result(res, await repo.allocate(d));
  });
  api.post("/admin/allocations/:id/deliver", ...admin, withId(async (req, res, id) => {
    const d = parseDelivery(req.body);
    if (!d) return res.status(400).json({ error: "invalid" });
    done(res, await repo.deliverAllocation(id, d));
  }));
  api.post("/admin/allocations/:id/delete", ...admin, withId(async (req, res, id) => done(res, await repo.deleteAllocation(id))));
  api.get("/admin/report", requireAdmin, async (req, res) => res.json(await repo.report()));

  // Saved order summaries: prices and fees live only here, behind the admin session.
  api.get("/admin/summaries", requireAdmin, async (req, res) => res.json(await repo.listSummaries()));
  api.post("/admin/summaries", ...admin, async (req, res) => {
    const d = parseSummary(req.body);
    if (!d) return res.status(400).json({ error: "invalid" });
    res.json({ ok: true, id: await repo.saveSummary(d) });
  });
  api.post("/admin/summaries/:id/update", ...admin, withId(async (req, res, id) => {
    const d = parseSummary(req.body);
    if (!d) return res.status(400).json({ error: "invalid" });
    done(res, await repo.updateSummary(id, d));
  }));
  api.post("/admin/summaries/:id/delete", ...admin, withId(async (req, res, id) => done(res, await repo.deleteSummary(id))));

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
  // the personal order link of a restaurant: the token must not leak through Referer
  app.get("/r/:token", privatePage, (req, res) => {
    res.setHeader("Referrer-Policy", "no-referrer");
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
