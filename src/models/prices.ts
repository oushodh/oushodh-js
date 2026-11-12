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
