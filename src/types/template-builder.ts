export type TemplateBuilderStatus = "draft" | "published" | "archived";

export type TemplatePageSize = "A4" | "F4";
export type TemplateOrientation = "portrait" | "landscape";
export type TemplateElementType =
  | "logo"
  | "text"
  | "field"
  | "line"
  | "box"
  | "note_box"
  | "repeater_table"
  | "signature_grid";

export type TemplateBindingSource =
  | "static"
  | "surat"
  | "pengaju"
  | "items"
  | "units"
  | "recommendations"
  | "attachments"
  | "signers";

export type TemplateTextAlign = "left" | "center" | "right";
export type TemplateVerticalAlign = "top" | "middle" | "bottom";

export interface TemplateStyle {
  fontSize?: number;
  fontWeight?: "normal" | "medium" | "semibold" | "bold";
  italic?: boolean;
  align?: TemplateTextAlign;
  verticalAlign?: TemplateVerticalAlign;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  radius?: number;
  padding?: number;
  lineHeight?: number;
}

export interface TemplateRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TemplateTableColumn {
  id: string;
  label: string;
  binding: string;
  width: number;
  align?: TemplateTextAlign;
  headerAlign?: TemplateTextAlign;
  bodyAlign?: TemplateTextAlign;
  format?: "text" | "number" | "currency" | "date" | "index" | "checkmark";
}

export interface TemplateElement {
  id: string;
  type: TemplateElementType;
  label: string;
  rect: TemplateRect;
  binding?: string;
  source?: TemplateBindingSource;
  content?: string;
  imageUrl?: string;
  style?: TemplateStyle;
  columns?: TemplateTableColumn[];
  minRows?: number;
  maxRows?: number;
  rowHeight?: number;
  repeatHeader?: boolean;
  signaturePattern?: string;
  signatureAutoSize?: boolean;
  locked?: boolean;
}

export interface TemplateDefinition {
  page: {
    size: TemplatePageSize;
    orientation: TemplateOrientation;
    margin: number;
  };
  elements: TemplateElement[];
}

export interface TemplateInputField {
  id: string;
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select" | "file" | "table";
  required?: boolean;
  source?: TemplateBindingSource;
  options?: Array<{ label: string; value: string }>;
}

export interface TemplateInputSchema {
  fields: TemplateInputField[];
}

export interface DocumentTemplateBuilder {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  status: TemplateBuilderStatus;
  owner_department_id?: string | null;
  active_version_id?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  master_departments?: {
    id: string;
    name: string;
    code?: string | null;
  } | null;
}

export interface DocumentTemplateBuilderVersion {
  id: string;
  template_id: string;
  version_number: number;
  status: TemplateBuilderStatus;
  definition: TemplateDefinition;
  input_schema: TemplateInputSchema;
  created_by?: string | null;
  created_at?: string;
  published_at?: string | null;
}

export interface TemplateBuilderRecord extends DocumentTemplateBuilder {
  document_template_builder_versions?: DocumentTemplateBuilderVersion[];
}
