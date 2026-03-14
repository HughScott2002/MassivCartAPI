export interface SearchRequestBody {
  terms: string[];
  savingsMode?: number;
  userLat?: number;
  userLng?: number;
}

export interface SearchResultPrice {
  store_id: number;
  store_name: string;
  branch: string | null;
  parish: string | null;
  price: number;
  confidence_score: number | null;
  date_recorded: string | null;
  distance_km: number | null;
}

export interface SearchResult {
  product_id: number;
  canonical_name: string;
  category: string | null;
  unit_type: string | null;
  cheapest_price: number;
  cheapest_store: string;
  prices: SearchResultPrice[];
}
