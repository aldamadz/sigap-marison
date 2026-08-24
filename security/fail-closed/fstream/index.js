const STREAMING_DISABLED_MESSAGE =
  "ExcelJS streaming XLSX file extraction is disabled in SIGAP; use the in-memory workbook API instead.";

class BlockedFstreamWriter {
  constructor() {
    throw new Error(STREAMING_DISABLED_MESSAGE);
  }
}

module.exports = {
  Reader: BlockedFstreamWriter,
  Writer: BlockedFstreamWriter,
  STREAMING_DISABLED_MESSAGE,
};
