import React from "react";
import type { UsageModuleContext } from "../usage-contract";

export function NonUnitContextPanel({ ctx }: { ctx: UsageModuleContext }) {
  // NonUnitRequestEditor is currently rendered by orchestrator via renderTableField due to 
  // dependency on project mapping logic which is quite heavy in orchestrator right now.
  // We can just keep it there for now or move it here. 
  // Let's just return null and keep the NonUnitRequestEditor rendering in the orchestrator's `renderTableField`,
  // since the orchestration boundary specifies we should keep `items` overrides clean.
  return null;
}
