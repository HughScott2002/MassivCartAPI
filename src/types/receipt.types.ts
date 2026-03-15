export interface ReceiptItem {
  name: string;
  price: number;
  quantity?: number;
  unit?: string;
  dosage?: string;
}

export interface ReceiptData {
  store?: string | null;
  address?: string | null;
  addressConfident?: boolean;
  date?: string | null;
  items: ReceiptItem[];
  total?: number;
  currency?: string;
  rawText?: string;
  imageType?:
    | "receipt"
    | "shopping_list"
    | "prescription"
    | "gas_price"
    | "unknown";
  prescriber?: string | null;
  patient?: string | null;
}
