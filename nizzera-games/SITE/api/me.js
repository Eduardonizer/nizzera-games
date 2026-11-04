const { isAuthed, send } = require("./_lib");

module.exports = (req, res) => {
  send(res, 200, { ok: isAuthed(req) });
};
