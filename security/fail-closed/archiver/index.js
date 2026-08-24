const STREAMING_DISABLED_MESSAGE =
  "ExcelJS streaming XLSX output is disabled in SIGAP; use the in-memory workbook API instead.";

module.exports = function blockedArchiver() {
  throw new Error(STREAMING_DISABLED_MESSAGE);
};

module.exports.STREAMING_DISABLED_MESSAGE = STREAMING_DISABLED_MESSAGE;
