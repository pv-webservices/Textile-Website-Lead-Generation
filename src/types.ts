export interface Lead {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  website: string;
  source: string;       // e.g. "justdial", "indiamart", "shopify"
  category: string;     // e.g. "sofa fabric", "curtain fabric"
  phones: string[];
  emails: string[];
  platform?: "shopify" | "wix" | "wordpress" | "other" | "unknown";
  score?: number;
}
