/**
 * Google Places API (New) — fetches nearby amenities by category.
 */

import type { DemandDrivers, NearbyAmenity } from '../types';

const SEARCH_RADIUS = 5000; // metres
const MAX_RESULTS = 5;

const FIELD_MASK = [
  'places.displayName',
  'places.formattedAddress',
  'places.types',
  'places.rating',
  'places.location',
].join(',');

interface PlaceResult {
  displayName?: { text?: string };
  formattedAddress?: string;
  types?: string[];
  rating?: number;
  location?: { latitude?: number; longitude?: number };
}

/**
 * Calculates distance in km between two lat/lng points using the Haversine formula.
 */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

async function searchNearbyByType(
  lat: number,
  lng: number,
  includedType: string,
  apiKey: string,
): Promise<NearbyAmenity[]> {
  const body = {
    includedTypes: [includedType],
    maxResultCount: MAX_RESULTS,
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: SEARCH_RADIUS,
      },
    },
  };

  const response = await fetch(
    'https://places.googleapis.com/v1/places:searchNearby',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    console.error(
      `Google Places search for "${includedType}" returned HTTP ${response.status}`,
    );
    return [];
  }

  const data = await response.json();
  const places: PlaceResult[] = data.places ?? [];

  return places.map((place) => {
    const placeLat = place.location?.latitude ?? lat;
    const placeLng = place.location?.longitude ?? lng;

    return {
      name: place.displayName?.text ?? 'Unknown',
      type: includedType,
      address: place.formattedAddress ?? '',
      distance: haversineKm(lat, lng, placeLat, placeLng),
      rating: place.rating ?? null,
    };
  });
}

export async function getNearbyAmenities(
  lat: number,
  lng: number,
): Promise<DemandDrivers> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_PLACES_API_KEY is not set in environment variables.');
  }

  const types = ['hospital', 'university', 'airport', 'train_station'] as const;

  const results = await Promise.allSettled(
    types.map((type) => searchNearbyByType(lat, lng, type, apiKey)),
  );

  const extract = (result: PromiseSettledResult<NearbyAmenity[]>): NearbyAmenity[] => {
    if (result.status === 'fulfilled') return result.value;
    console.error('Places search failed:', result.reason);
    return [];
  };

  return {
    hospitals: extract(results[0]),
    universities: extract(results[1]),
    airports: extract(results[2]),
    trainStations: extract(results[3]),
  };
}
