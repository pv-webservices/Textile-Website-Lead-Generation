export interface CityQueries {
  justdial: string[];
  maps: string[];
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
      maps: ["upholstery fabric store Delhi", "curtain fabric store Delhi", "sofa fabric dealer Delhi"],
    },
  },
  surat: {
    id: "surat",
    displayName: "Surat",
    queries: {
      justdial: ["fabric manufacturer", "curtain fabric manufacturer"],
      maps: ["fabric manufacturer Surat", "curtain fabric store Surat", "upholstery fabric Surat"],
    },
  },
};

// Flat list of known city IDs — used for validation in runCity.ts
export const CITIES: string[] = Object.keys(CITY_CONFIGS);
