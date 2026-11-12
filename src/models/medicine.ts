import type { Monograph } from "./monograph.js";
import type { Prices, UnitPrice } from "./prices.js";

export type MedicineType = "allopathic" | "homoeopathic" | "herbal" | "ayurvedic" | "unani";

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

export interface MedicineDetail extends Medicine {
  monograph: Monograph | null;
}
