export interface ConfidentField<T> {
  value: T;
  _confidence: number;
}

export interface VendorField {
  name: string;
  address?: string | null;
  _confidence: number;
}

export interface LineItem {
  description: string;
  quantity?: number | null;
  unit_price?: number | null;
  amount: number;
  _confidence: number;
}

export interface InvoiceDraft {
  vendor: VendorField;
  invoice_number: ConfidentField<string>;
  invoice_date: ConfidentField<string>;
  due_date: ConfidentField<string>;
  line_items: LineItem[];
  subtotal: ConfidentField<number>;
  tax: ConfidentField<number>;
  total: ConfidentField<number>;
  _arithmetic_valid?: boolean;
}

export type ItemStatus = "escalated" | "approved" | "rejected" | "extraction_failed";

export interface QueueItem {
  id: string;
  source_id: string;
  status: ItemStatus;
  draft_extraction: InvoiceDraft | null;
  extraction_error: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}
