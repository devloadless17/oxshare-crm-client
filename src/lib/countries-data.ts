import { countries } from 'countries-list';

export interface CountryItem {
  name: string;
  code: string; // ISO2 code e.g. "LB"
  dialCode: string; // e.g. "+961"
  flag: string; // Emoji flag e.g. "🇱🇧"
}

/**
 * Countries this platform does not offer, by ISO2 code.
 *
 * A LIST rather than an inline `!== 'IL'`, so the next exclusion is a one-line
 * change in one place and the reason travels with it. Operating from Lebanon,
 * where trading with Israel is prohibited outright, this is a legal constraint
 * on the business rather than a UI preference.
 *
 * ## What this does and does not reach
 *
 * It filters `ALL_COUNTRIES`, which is the source for the phone dial-code picker
 * AND the KYC country dropdown — so the two agree by construction. A build that
 * refused an Israeli dial code while offering Israel as a country of residence
 * two fields later would be the same list disagreeing with itself.
 *
 * `ALL_NATIONALITIES` is a separate hand-written array of DEMONYMS with no code
 * to match on, so it is filtered by name below rather than by this list.
 *
 * ## This is presentation, NOT enforcement
 *
 * Removing an option stops it being offered; it does not stop it being SENT. A
 * client can still POST any dial code, and the server is the only place that can
 * refuse one (R-5.1 — every constraint is re-derived server-side). Treat this as
 * the list being honest about what is on offer, and nothing more.
 */
const EXCLUDED_COUNTRY_CODES = new Set(['IL']);

/** The same exclusion, as demonyms — see the note on the filter below. */
const EXCLUDED_NATIONALITIES = new Set(['Israeli']);

// Convert all 250+ countries from countries-list library
export const ALL_COUNTRIES: CountryItem[] = Object.entries(countries)
  .filter(([code]) => !EXCLUDED_COUNTRY_CODES.has(code.toUpperCase()))
  .map(([code, c]) => {
    const rawPhone = Array.isArray(c.phone) ? c.phone[0] : c.phone;
    const dialCode = rawPhone ? `+${rawPhone}` : '';
    return {
      name: c.name,
      code: code.toUpperCase(),
      dialCode,
      flag: (c as { emoji?: string }).emoji || '🏳️',
    };
  })
  .filter((c) => c.dialCode !== '')
  .sort((a, b) => a.name.localeCompare(b.name));

// Complete global list of nationalities derived from countries
export const ALL_NATIONALITIES: string[] = Array.from(
  new Set([
    'Afghan',
    'Albanian',
    'Algerian',
    'American',
    'Andorran',
    'Angolan',
    'Antiguan',
    'Argentine',
    'Armenian',
    'Australian',
    'Austrian',
    'Azerbaijani',
    'Bahamian',
    'Bahraini',
    'Bangladeshi',
    'Barbadian',
    'Belarusian',
    'Belgian',
    'Belizean',
    'Beninese',
    'Bhutanese',
    'Bolivian',
    'Bosnian',
    'Brazilian',
    'British',
    'Bruneian',
    'Bulgarian',
    'Burkinabe',
    'Burmese',
    'Burundian',
    'Cambodian',
    'Cameroonian',
    'Canadian',
    'Cape Verdean',
    'Central African',
    'Chadian',
    'Chilean',
    'Chinese',
    'Colombian',
    'Comoran',
    'Congolese',
    'Costa Rican',
    'Croatian',
    'Cuban',
    'Cypriot',
    'Czech',
    'Danish',
    'Djiboutian',
    'Dominican',
    'Dutch',
    'East Timorese',
    'Ecuadorean',
    'Egyptian',
    'Emirati',
    'Equatorial Guinean',
    'Eritrean',
    'Estonian',
    'Ethiopian',
    'Fijian',
    'Filipino',
    'Finnish',
    'French',
    'Gabonese',
    'Gambian',
    'Georgian',
    'German',
    'Ghanaian',
    'Greek',
    'Grenadian',
    'Guatemalan',
    'Guinean',
    'Guyanese',
    'Haitian',
    'Honduran',
    'Hungarian',
    'Icelander',
    'Indian',
    'Indonesian',
    'Iranian',
    'Iraqi',
    'Irish',
    'Israeli',
    'Italian',
    'Ivorian',
    'Jamaican',
    'Japanese',
    'Jordanian',
    'Kazakhstani',
    'Kenyan',
    'Kittitian',
    'Kuwaiti',
    'Kyrgyz',
    'Laotian',
    'Latvian',
    'Lebanese',
    'Liberian',
    'Libyan',
    'Liechtensteiner',
    'Lithuanian',
    'Luxembourger',
    'Macedonian',
    'Malagasy',
    'Malawian',
    'Malaysian',
    'Maldivian',
    'Malian',
    'Maltese',
    'Marshallese',
    'Mauritanian',
    'Mauritian',
    'Mexican',
    'Micronesian',
    'Moldovan',
    'Monacan',
    'Mongolian',
    'Montenegrin',
    'Moroccan',
    'Mozambican',
    'Namibian',
    'Nauruan',
    'Nepalese',
    'New Zealander',
    'Nicaraguan',
    'Nigerian',
    'Nigerien',
    'North Korean',
    'Norwegian',
    'Omani',
    'Pakistani',
    'Palauans',
    'Palestinian',
    'Panamanian',
    'Papua New Guinean',
    'Paraguayan',
    'Peruvian',
    'Polish',
    'Portuguese',
    'Qatari',
    'Romanian',
    'Russian',
    'Rwandan',
    'Saint Lucian',
    'Salvadoran',
    'Samoan',
    'San Marinese',
    'Sao Tomean',
    'Saudi',
    'Senegalese',
    'Serbian',
    'Seychellois',
    'Sierra Leonean',
    'Singaporean',
    'Slovak',
    'Slovenian',
    'Solomon Islander',
    'Somali',
    'South African',
    'South Korean',
    'South Sudanese',
    'Spanish',
    'Sri Lankan',
    'Sudanese',
    'Surinamer',
    'Swazi',
    'Swedish',
    'Swiss',
    'Syrian',
    'Taiwanese',
    'Tajik',
    'Tanzanian',
    'Thai',
    'Togolese',
    'Tongan',
    'Trinidadian',
    'Tunisian',
    'Turkish',
    'Turkmen',
    'Tuvaluan',
    'Ugandan',
    'Ukrainian',
    'Uruguayan',
    'Uzbek',
    'Vanuatuans',
    'Venezuelan',
    'Vietnamese',
    'Yemeni',
    'Zambian',
    'Zimbabwean',
  ]),
)
  /*
   * The demonym half of `EXCLUDED_COUNTRY_CODES`.
   *
   * This array is hand-written names with no ISO code to match on, so the
   * exclusion is by string and has to be kept in step with that set by hand —
   * which is why it is filtered HERE, next to the list, rather than at each of
   * the two call sites that would each have to remember.
   */
  .filter((nationality) => !EXCLUDED_NATIONALITIES.has(nationality))
  .sort((a, b) => a.localeCompare(b));
