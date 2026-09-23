import { type LucideIcon } from "lucide-react";

export type DocsAudience = "user" | "admin" | "troubleshooting";

export type DocsSection =
  | {
      type: "group";
      title: string;
      description?: string;
      sections: DocsSection[];
    }
  | {
      type: "feature-grid";
      title: string;
      description?: string;
      items: Array<{ title: string; description: string }>;
    }
  | {
      type: "steps";
      title: string;
      description?: string;
      items: string[];
    }
  | {
      type: "list";
      title: string;
      description?: string;
      items: string[];
    }
  | {
      type: "table";
      title: string;
      description?: string;
      columns: string[];
      rows: string[][];
    }
  | {
      type: "callout";
      title: string;
      description: string;
      tone?: "info" | "success" | "warning";
    }
  | {
      type: "troubleshooting";
      title: string;
      description?: string;
      items: Array<{ problem: string; solution: string }>;
    };

export interface DocsEntry {
  id: string;
  title: string;
  menu: string;
  audience: DocsAudience;
  icon: LucideIcon;
  version: string;
  updatedAt: string;
  summary: string;
  whenToUse: string[];
  steps: string[];
  examples: string[];
  troubleshooting: string[];
  related?: string[];
  sections?: DocsSection[];
}

export interface DocsChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}
