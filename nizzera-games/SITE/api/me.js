const { isAuthed, send, totpEnabled } = require("./_lib");

module.exports = (req, res) => {
  if (req.method !== "GET") return send(res, 405, { ok: false });
  send(res, 200, { ok: isAuthed(req), totp: totpEnabled() });
};
