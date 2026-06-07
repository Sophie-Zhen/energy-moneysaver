// Default residential load profile, scaled to 3,500 kWh/year.
//
// Numbers baked from tariffs/profiles/dublin_2person_mixed.yaml after
// scale_profile_to_annual_kwh(weekday, weekend, 3500). In M2 this becomes
// a runtime computation against profiles.json.

import type { HourlySeries } from "./types";

export const DEFAULT_WEEKDAY_HOURLY_3500KWH: HourlySeries = [
  0.923092, 0.602947, 0.252131, 0.15391, 0.145386, 0.148443, 0.157524,
  0.16086, 0.170682, 0.258803, 0.342847, 0.39066, 0.386398, 0.333303,
  0.36453, 0.461824, 0.534285, 0.529281, 0.523258, 0.599797, 0.501854,
  0.504077, 0.560694, 0.568662,
];

export const DEFAULT_WEEKEND_HOURLY_3500KWH: HourlySeries = [
  0.733599, 0.756394, 0.346275, 0.149277, 0.134915, 0.14381, 0.150853,
  0.161138, 0.160211, 0.189492, 0.339326, 0.387046, 0.382691, 0.329226,
  0.348499, 0.437269, 0.540123, 0.742866, 0.573944, 0.578021, 0.516679,
  0.483507, 0.471461, 0.566902,
];
