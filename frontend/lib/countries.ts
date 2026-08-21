import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js";

export type Country = {
  code: CountryCode;
  name: string;
  callingCode: string;
};

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

// Full ISO 3166-1 country list with calling codes, derived from
// libphonenumber-js's metadata (the same underlying Google libphonenumber
// data the backend validates against) rather than a hand-maintained list.
export const COUNTRIES: Country[] = getCountries()
  .map((code) => ({
    code,
    name: regionNames.of(code) ?? code,
    callingCode: getCountryCallingCode(code),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

export function findCountry(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code);
}
