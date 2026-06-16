declare module "suncalc" {
  export interface SunTimes {
    sunrise: Date;
    sunset: Date;
    [key: string]: Date;
  }

  export function getTimes(
    date: Date,
    latitude: number,
    longitude: number
  ): SunTimes;

  const SunCalc: {
    getTimes: typeof getTimes;
  };

  export default SunCalc;
}
