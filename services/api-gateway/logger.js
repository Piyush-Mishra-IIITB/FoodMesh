const fs = require("fs");
const path = require("path");

const logFile = path.join(__dirname, "logs", "gateway.log");

const writeLog = (message) => {
  const timestamp = new Date().toISOString();

  fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
};

module.exports = writeLog;
