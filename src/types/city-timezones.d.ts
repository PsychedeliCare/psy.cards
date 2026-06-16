declare module "city-timezones" {
  type CityMappingEntry = {
    city: string;
    lat: number;
    lng: number;
    pop?: number;
    timezone?: string;
  };

  type CityTimezonesModule = {
    cityMapping: CityMappingEntry[];
    lookupViaCity: (city: string) => CityMappingEntry[];
  };

  const cityTimezones: CityTimezonesModule;
  export default cityTimezones;
}
