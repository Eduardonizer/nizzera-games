const { setSession, send } = require("./_lib");

module.exports = (req, res) => {
  if (req.method !== "POST") return send(res, 405, { ok: false });
  setSession(res, "", 0);
  send(res, 200, { ok: true });
};
