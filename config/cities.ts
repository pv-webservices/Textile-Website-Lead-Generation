export interface CityQueries {
  justdial: string[];
  indiamart: string[];
}

export interface CityConfig {
  id: string;
  displayName: string;
  queries: CityQueries;
}

export const CITY_CONFIGS: Record<string, CityConfig> = {
  delhi: {
    id: "delhi",
    displayName: "Delhi",
    queries: {
      justdial: ["sofa fabric wholesaler", "curtain fabric dealer"],
      indiamart: ["upholstery fabric supplier", "curtain fabric distributor"],
    },
  },
  surat: {
    id: "surat",
    displayName: "Surat",
    queries: {
      justdial: ["fabric manufacturer", "curtain fabric manufacturer"],
      indiamart: ["sofa upholstery fabric surat", "jacquard fabric manufacturer"],
    },
  },
};

// Flat list of known city IDs — used for validation in runCity.ts
export const CITIES: string[] = Object.keys(CITY_CONFIGS);
