const fs = require('fs');

let inbox = fs.readFileSync('backend/src/modules/surat/inbox-runtime.ts', 'utf8');

// Insert type guard after INBOX_TASK_TYPE_ALLOWLIST
inbox = inbox.replace(
  'export const INBOX_TASK_TYPE_ALLOWLIST = ["approval", "verification"] as const;',
  `export const INBOX_TASK_TYPE_ALLOWLIST = ["approval", "verification"] as const;
export type InboxTaskType = typeof INBOX_TASK_TYPE_ALLOWLIST[number];
export const isInboxTaskType = (value: string): value is InboxTaskType =>
  (INBOX_TASK_TYPE_ALLOWLIST as readonly string[]).includes(value as InboxTaskType);`
);

// Replace taskType as any
inbox = inbox.replace(
  'if (!INBOX_TASK_TYPE_ALLOWLIST.includes(taskType as any)) throw new Error("task_type tidak valid");',
  'if (!isInboxTaskType(taskType)) throw new Error("task_type tidak valid");'
);

// Replace raw as any
inbox = inbox.replace(
  'if (!INBOX_TASK_TYPE_ALLOWLIST.includes(raw as any)) return { error: "task_type tidak valid", value: null };',
  'if (!isInboxTaskType(raw)) return { error: "task_type tidak valid", value: null };'
);

// Replace a: any, b: any
inbox = inbox.replace(
  'sort((a: any, b: any) =>',
  'sort((a: SignatureSummary, b: SignatureSummary) =>'
);

// Replace v: any
inbox = inbox.replace(
  'some((v: any) =>',
  'some((v: VerifierSnapshot) =>'
);

fs.writeFileSync('backend/src/modules/surat/inbox-runtime.ts', inbox);
