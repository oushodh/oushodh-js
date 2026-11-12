import type { Medicine } from "./medicine.js";

export interface Page {
  items: Medicine[];
  next: string | null;
  total: number;
}

export interface SearchResult {
  items: Medicine[];
  total: number;
}
