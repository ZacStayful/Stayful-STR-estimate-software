import type { PropertyInput, AnalysisResult, ShortLetData, LongLetData, DemandDrivers, NearbyEvent } from '@/lib/types';
import { geocodePostcode } from '@/lib/apis/geocode';
import { getShortLetData } from '@/lib/apis/airbtics';
import { getLongLetData } from '@/lib/apis/propertydata';
import { getNearbyAmenities } from '@/lib/apis/google-places';
import { getNearbyEvents } from '@/lib/apis/ticketmaster';
import { calculateFinancials, assessRisk, generateVerdict } from '@/lib/analysis';

// ─── Rate Limiter (in-memory, per IP) ────────────────────────────
// 10 requests per IP per 60-second window. Protects against API credit abuse.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

// Clean up stale entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 300_000);

export async function POST(request: Request) {
  try {
    // Rate limiting
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() || 'unknown';

    if (isRateLimited(ip)) {
      return Response.json(
        { error: 'Too many requests. Please wait a minute before trying again.' },
        { status: 429 },
      );
    }

    const body = await request.json();

    // Validate input
    const { address, postcode, bedrooms, guests } = body;

    if (!address || typeof address !== 'string' || address.trim().length === 0) {
      return Response.json(
        { error: 'A valid property address is required.' },
        { status: 400 },
      );
    }

    if (!postcode || typeof postcode !== 'string' || postcode.trim().length < 3) {
      return Response.json(
        { error: 'A valid UK postcode is required.' },
        { status: 400 },
      );
    }

    const bedroomCount = Number(bedrooms);
    if (!Number.isFinite(bedroomCount) || bedroomCount < 1 || bedroomCount > 10) {
      return Response.json(
        { error: 'Bedrooms must be a number between 1 and 10.' },
        { status: 400 },
      );
    }

    const guestCount = Number(guests);
    if (!Number.isFinite(guestCount) || guestCount < 1 || guestCount > 16) {
      return Response.json(
        { error: 'Guests must be a number between 1 and 16.' },
        { status: 400 },
      );
    }

    const property: PropertyInput = {
      address: address.trim(),
      postcode: postcode.trim().toUpperCase(),
      bedrooms: bedroomCount,
      guests: guestCount,
    };

    // Geocode the postcode
    let coordinates: { lat: number; lng: number };
    try {
      coordinates = await geocodePostcode(property.postcode);
    } catch (err) {
      console.error('Geocoding failed:', err);
      return Response.json(
        { error: 'Could not geocode the provided postcode. Please check it and try again.' },
        { status: 422 },
      );
    }

    // Call all 4 APIs in parallel
    const [shortLetResult, longLetResult, amenitiesResult, eventsResult] = await Promise.allSettled([
      getShortLetData(property.postcode, property.bedrooms, property.guests),
      getLongLetData(property.postcode, property.bedrooms),
      getNearbyAmenities(coordinates.lat, coordinates.lng),
      getNearbyEvents(coordinates.lat, coordinates.lng),
    ]);

    // Extract results with safe defaults
    const shortLet: ShortLetData = shortLetResult.status === 'fulfilled'
      ? shortLetResult.value
      : {
          annualRevenue: 0,
          monthlyRevenue: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          occupancyRate: 0,
          averageDailyRate: 0,
          activeListings: 0,
          comparables: [],
        };

    const longLet: LongLetData = longLetResult.status === 'fulfilled'
      ? longLetResult.value
      : {
          monthlyRent: 0,
          estimateHigh: 0,
          estimateLow: 0,
          comparables: [],
        };

    const demandDrivers: DemandDrivers = amenitiesResult.status === 'fulfilled'
      ? amenitiesResult.value
      : {
          hospitals: [],
          universities: [],
          airports: [],
          trainStations: [],
          busStations: [],
          subwayStations: [],
        };

    const nearbyEvents: { events: NearbyEvent[]; totalEvents: number } =
      eventsResult.status === 'fulfilled'
        ? eventsResult.value
        : { events: [], totalEvents: 0 };

    // Log any API failures
    if (shortLetResult.status === 'rejected') {
      console.error('Airbtics API failed:', shortLetResult.reason);
    }
    if (longLetResult.status === 'rejected') {
      console.error('PropertyData API failed:', longLetResult.reason);
    }
    if (amenitiesResult.status === 'rejected') {
      console.error('Google Places API failed:', amenitiesResult.reason);
    }
    if (eventsResult.status === 'rejected') {
      console.error('Ticketmaster API failed:', eventsResult.reason);
    }

    // Run analysis calculations
    const financials = calculateFinancials(shortLet, longLet);
    const risk = assessRisk(shortLet, longLet, demandDrivers, nearbyEvents);
    const verdict = generateVerdict(financials, risk);

    const now = new Date().toISOString();

    const result: AnalysisResult = {
      property,
      coordinates,
      shortLet,
      longLet,
      demandDrivers,
      nearbyEvents,
      financials,
      risk,
      verdict,
      createdAt: now,
      updatedAt: now,
    };

    return Response.json(result);
  } catch (err) {
    console.error('Unexpected error in /api/analyse:', err);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 },
    );
  }
}
