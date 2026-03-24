export const ITEM_TYPES: string[];
export const ITEM_TYPE_IDS: Record<string, string>;
export const ITEM_QUALITIES: string[];
export const ITEM_SHAPES: string[];

export interface CatalogItem {
  id: string;
  name: string;
  price: number;
  width: number;
  height: number;
  size: number;
  shape: string;
  quality: string;
  type: string;
  desc: string;
}

export const ITEM_CATALOG: CatalogItem[];