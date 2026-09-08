const fs = require('fs');

let attention = fs.readFileSync('backend/src/modules/attention/attention-runtime.ts', 'utf8');

attention = attention.replace(
  'getSupabase: () => AttentionSupabaseClient;',
  'getSupabase: () => AttentionSupabaseClient | null;'
);

fs.writeFileSync('backend/src/modules/attention/attention-runtime.ts', attention);
