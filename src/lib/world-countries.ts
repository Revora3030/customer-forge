/**
 * Countries Revora serves remotely, with real major cities. Powers /countries
 * and /countries/$country. Revora is a remote service business, so these pages
 * say "serves", never "located in". No offices, staff or clients are claimed.
 */

export interface ServedCountry {
  slug: string;
  name: string;
  code: string;
  /** Largest real cities, biggest first. */
  cities: readonly string[];
  /** Local word for a postal code / region, for natural copy. */
  regionWord: string;
}

export const SERVED_COUNTRIES: readonly ServedCountry[] = [
  { slug: "united-kingdom", name: "United Kingdom", code: "GB", cities: ["London", "Manchester", "Birmingham", "Leeds", "Glasgow", "Bristol"], regionWord: "county" },
  { slug: "canada", name: "Canada", code: "CA", cities: ["Toronto", "Montreal", "Vancouver", "Calgary", "Edmonton", "Ottawa"], regionWord: "province" },
  { slug: "australia", name: "Australia", code: "AU", cities: ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Gold Coast"], regionWord: "state" },
  { slug: "new-zealand", name: "New Zealand", code: "NZ", cities: ["Auckland", "Wellington", "Christchurch", "Hamilton", "Tauranga"], regionWord: "region" },
  { slug: "ireland", name: "Ireland", code: "IE", cities: ["Dublin", "Cork", "Limerick", "Galway", "Waterford"], regionWord: "county" },
  { slug: "south-africa", name: "South Africa", code: "ZA", cities: ["Johannesburg", "Cape Town", "Durban", "Pretoria", "Port Elizabeth"], regionWord: "province" },
  { slug: "nigeria", name: "Nigeria", code: "NG", cities: ["Lagos", "Abuja", "Port Harcourt", "Ibadan", "Kano"], regionWord: "state" },
  { slug: "kenya", name: "Kenya", code: "KE", cities: ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret"], regionWord: "county" },
  { slug: "ghana", name: "Ghana", code: "GH", cities: ["Accra", "Kumasi", "Tamale", "Takoradi", "Cape Coast"], regionWord: "region" },
  { slug: "india", name: "India", code: "IN", cities: ["Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Chennai", "Pune"], regionWord: "state" },
  { slug: "philippines", name: "Philippines", code: "PH", cities: ["Manila", "Quezon City", "Cebu City", "Davao City", "Makati"], regionWord: "province" },
  { slug: "singapore", name: "Singapore", code: "SG", cities: ["Singapore"], regionWord: "district" },
  { slug: "united-arab-emirates", name: "United Arab Emirates", code: "AE", cities: ["Dubai", "Abu Dhabi", "Sharjah", "Ajman"], regionWord: "emirate" },
  { slug: "jamaica", name: "Jamaica", code: "JM", cities: ["Kingston", "Montego Bay", "Spanish Town", "Portmore"], regionWord: "parish" },
  { slug: "trinidad-and-tobago", name: "Trinidad and Tobago", code: "TT", cities: ["Port of Spain", "San Fernando", "Chaguanas", "Arima"], regionWord: "region" },
  { slug: "germany", name: "Germany", code: "DE", cities: ["Berlin", "Hamburg", "Munich", "Cologne", "Frankfurt"], regionWord: "state" },
  { slug: "france", name: "France", code: "FR", cities: ["Paris", "Marseille", "Lyon", "Toulouse", "Nice"], regionWord: "region" },
  { slug: "spain", name: "Spain", code: "ES", cities: ["Madrid", "Barcelona", "Valencia", "Seville", "Málaga"], regionWord: "province" },
  { slug: "netherlands", name: "Netherlands", code: "NL", cities: ["Amsterdam", "Rotterdam", "The Hague", "Utrecht", "Eindhoven"], regionWord: "province" },
  { slug: "mexico", name: "Mexico", code: "MX", cities: ["Mexico City", "Guadalajara", "Monterrey", "Puebla", "Tijuana"], regionWord: "state" },
  { slug: "brazil", name: "Brazil", code: "BR", cities: ["São Paulo", "Rio de Janeiro", "Brasília", "Salvador", "Belo Horizonte"], regionWord: "state" },
] as const;

export function findCountry(slug: string): ServedCountry | undefined {
  return SERVED_COUNTRIES.find((country) => country.slug === slug.toLowerCase());
}
