const { setSession, send, rejectPost } = require("./_lib");

module.exports = (req, res) => {
  if (rejectPost(req, res)) return;
  setSession(res, "", 0);
  send(res, 200, { ok: true });
};
