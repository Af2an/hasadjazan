import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

export function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

// Signed, HttpOnly admin session cookie. The payload carries no secret: a
// random session id, the CSRF token for this session, and the expiry.
export function createSessions({ secret, ttlMs, production }) {
  const name = production ? "__Host-hj_admin" : "hj_admin";
  const revoked = new Map(); // sid -> exp, for sessions logged out before expiry
  const sign = (data) => createHmac("sha256", secret).update(data).digest("base64url");
  const cookieOptions = { httpOnly: true, secure: production, sameSite: "strict", path: "/" };

  const sweep = () => { const now = Date.now(); for (const [sid, exp] of revoked) if (exp <= now) revoked.delete(sid); };

  return {
    name,
    start(res) {
      const session = { sid: randomBytes(16).toString("base64url"), csrf: randomBytes(32).toString("base64url"), exp: Date.now() + ttlMs };
      const data = Buffer.from(JSON.stringify(session)).toString("base64url");
      res.cookie(name, data + "." + sign(data), { ...cookieOptions, maxAge: ttlMs });
      return session;
    },
    read(req) {
      const raw = readCookie(req, name);
      if (!raw) return null;
      const i = raw.lastIndexOf(".");
      if (i < 1) return null;
      const data = raw.slice(0, i);
      if (!safeEqual(raw.slice(i + 1), sign(data))) return null;
      let session;
      try { session = JSON.parse(Buffer.from(data, "base64url").toString("utf8")); } catch { return null; }
      if (!session || typeof session.sid !== "string" || typeof session.csrf !== "string" || typeof session.exp !== "number") return null;
      if (session.exp <= Date.now() || revoked.has(session.sid)) return null;
      return session;
    },
    end(req, res) {
      const session = this.read(req);
      if (session) { sweep(); revoked.set(session.sid, session.exp); }
      res.clearCookie(name, cookieOptions);
    }
  };
}
