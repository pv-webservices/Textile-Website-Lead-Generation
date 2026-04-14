export interface GoogleMapsQuery {
  query: string;
  maxCrawledPlaces?: number;
}

export interface CityQueries {
  justdial: string[];
  maps: GoogleMapsQuery[];
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
      maps: [
        { query: "upholstery fabric store Delhi", maxCrawledPlaces: 80 },
        { query: "curtain fabric shop Delhi", maxCrawledPlaces: 80 },
        { query: "sofa fabric store Delhi", maxCrawledPlaces: 80 },
        { query: "furnishing fabric Delhi", maxCrawledPlaces: 80 },
      ],
    },
  },
  surat: {
    id: "surat",
    displayName: "Surat",
    queries: {
      justdial: ["fabric manufacturer", "curtain fabric manufacturer"],
      maps: [
        { query: "fabric manufacturer Surat", maxCrawledPlaces: 80 },
        { query: "curtain fabric store Surat", maxCrawledPlaces: 80 },
        { query: "upholstery fabric Surat", maxCrawledPlaces: 80 },
      ],
    },
  },
};

// Flat list of known city IDs — used for validation in runCity.ts
export const CITIES: string[] = Object.keys(CITY_CONFIGS);
