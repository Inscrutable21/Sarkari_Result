const server = require("../backend/server.js");

module.exports = (req, res) => {
  server.emit("request", req, res);
};
