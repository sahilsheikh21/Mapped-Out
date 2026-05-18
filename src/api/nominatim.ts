/**
 * Nominatim geocoding API for address-to-coordinates conversion.
 */

import { NOMINATIM_API_URL } from '../utils/constants';

export interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  place_id: number;
  type: string;
  importance: number;
  boundingbox: [string, string, string, string];
}

/**
 * Search for a location by name/address and return coordinates.
 */
export async function geocodeAddress(query: string): Promise<NominatimResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '5',
    addressdetails: '1',
  });

  const response = await fetch(`${NOMINATIM_API_URL}?${params}`);

  if (!response.ok) {
    throw new Error(`Nominatim error: ${response.status}`);
  }

  return response.json();
}
