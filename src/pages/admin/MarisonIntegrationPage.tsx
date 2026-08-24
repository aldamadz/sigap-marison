import { MarisonIntegrationPanel } from "@/components/admin/MarisonIntegrationPanel";
import { MarisonOutboundQueuePanel } from "@/components/admin/MarisonOutboundQueuePanel";

export default function MarisonIntegrationPage() {
  return <div className="space-y-6"><MarisonIntegrationPanel /><MarisonOutboundQueuePanel /></div>;
}
