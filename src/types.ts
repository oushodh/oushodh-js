export type MedicineType = "allopathic" | "homoeopathic" | "herbal" | "ayurvedic" | "unani";

export interface UnitPrice {
  size: string | null;
  price: number;
}

export interface PriceAmount {
  amount: number;
  source: string;
}

export interface SizePrice {
  size: string | null;
  amount: number;
  source: string;
}

export interface StripPrice {
  amount: number;
  units: number | null;
  source: string;
}

export interface PackPrice {
  amount: number;
  units: number | null;
  label: string;
  source: string;
}

export interface Prices {
  currency: string;
  unit: PriceAmount | null;
  sizes: SizePrice[];
  strip: StripPrice | null;
  packs: PackPrice[];
}

export interface Medicine {
  id: string;
  uuid: string;
  brand: string;
  category: string | null;
  product_name: string;
  product_image: string | null;
  images: string[];
  unit: string | null;
  size: string | null;
  price: number | null;
  price_per: string | null;
  price_source: string | null;
  unit_prices: UnitPrice[];
  prices: Prices;
  description_en: string | null;
  description_bn: string | null;
  dosage_form: string | null;
  strength: string | null;
  generic_name: string | null;
  manufacturer: string | null;
  source_url: string | null;
  last_updated: string;
  dgda_listed: boolean;
  medicine_type: MedicineType | null;
}

export interface Monograph {
  source: string;
  indications: string | null;
  composition: string | null;
  pharmacology: string | null;
  dosage: string | null;
  interactions: string | null;
  contraindications: string | null;
  side_effects: string | null;
  pregnancy_lactation: string | null;
  precautions: string | null;
  overdose: string | null;
  storage: string | null;
}

export interface MedicineDetail extends Medicine {
  monograph: Monograph | null;
}

export interface Page {
  items: Medicine[];
  next: string | null;
  total: number;
}

export interface SearchResult {
  items: Medicine[];
  total: number;
}

export interface Meta {
  client: string;
  id_profile: string;
  medicines: number;
  last_import: string | null;
}

export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "plan_expired"
  | "plan_limit"
  | "not_found"
  | "rate_limited"
  | "quota_exceeded"
  | "internal";
