interface SearchOptions {
  lat: number;
  lng: number;
  radius?: number;
  type?: string;
  keyword?: string;
  minprice?: number;
  maxprice?: number;
  pageToken?: string;
  rating?: number;
}

interface Photo {
  photo_reference: string;
  height: number;
  width: number;
  html_attributions?: string[];
}

interface OpeningHours {
  open_now?: boolean;
  periods?: Array<{
    close?: { day: number; time: string };
    open?: { day: number; time: string };
  }>;
  weekday_text?: string[];
}

interface GooglePlace {
  rating?: number;
  price_level?: number;
  photos?: Photo[];
  photo_urls?: string[];
  place_id?: string;
  types?: string[];
  opening_hours?: OpeningHours;
  closes_at?: string;
  [key: string]: any;
}

interface GooglePlacesResponse {
  results: GooglePlace[];
  next_page_token?: string;
  status: string;
}

// Places API (New) response types
interface PlacesNewPhoto {
  name: string;
  widthPx: number;
  heightPx: number;
  authorAttributions?: Array<{ displayName: string; uri: string }>;
}

interface PlacesNewOpeningHours {
  openNow?: boolean;
  periods?: Array<{
    open: { day: number; hour: number; minute: number };
    close?: { day: number; hour: number; minute: number };
  }>;
  weekdayDescriptions?: string[];
}

interface PlacesNewPlace {
  id: string;
  displayName?: { text: string; languageCode: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  types?: string[];
  photos?: PlacesNewPhoto[];
  regularOpeningHours?: PlacesNewOpeningHours;
  currentOpeningHours?: PlacesNewOpeningHours;
  primaryType?: string;
  shortFormattedAddress?: string;
  [key: string]: any;
}

interface PlacesNewResponse {
  places?: PlacesNewPlace[];
  nextPageToken?: string;
}

// All price level strings in order (index = numeric level)
const PRICE_LEVEL_STRINGS = [
  'PRICE_LEVEL_FREE',
  'PRICE_LEVEL_INEXPENSIVE',
  'PRICE_LEVEL_MODERATE',
  'PRICE_LEVEL_EXPENSIVE',
  'PRICE_LEVEL_VERY_EXPENSIVE',
] as const;

class PlacesService {
  private readonly apiKey: string;
  private readonly nearbyUrl = 'https://places.googleapis.com/v1/places:searchNearby';
  private readonly textSearchUrl = 'https://places.googleapis.com/v1/places:searchText';
  private readonly photoBaseUrl = 'https://places.googleapis.com/v1';

  private readonly fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.shortFormattedAddress',
    'places.location',
    'places.rating',
    'places.userRatingCount',
    'places.priceLevel',
    'places.types',
    'places.primaryType',
    'places.photos',
    'places.regularOpeningHours',
    'places.currentOpeningHours',
  ].join(',');

  private readonly textSearchFieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.shortFormattedAddress',
    'places.location',
    'places.rating',
    'places.userRatingCount',
    'places.priceLevel',
    'places.types',
    'places.primaryType',
    'places.photos',
    'places.regularOpeningHours',
    'places.currentOpeningHours',
    'nextPageToken',
  ].join(',');

  constructor() {
    this.apiKey = process.env.GMAPS_KEY || '';
    if (!this.apiKey) {
      throw new Error('GMAPS_KEY environment variable is not set');
    }
  }

  // Public entry point — decides which Google API endpoint to use
  async searchPlaces(options: SearchOptions): Promise<GooglePlacesResponse> {
    const { keyword, pageToken } = options;

    // Use Text Search when there's a keyword/category or pagination token
    if (keyword || pageToken) {
      return this.searchText(options);
    }

    // Default browse — use Nearby Search
    return this.searchNearby(options);
  }

  // ---------------------------------------------------------------------------
  // Nearby Search (New) — used for default browse (no keyword)
  // ---------------------------------------------------------------------------
  private async searchNearby(options: SearchOptions): Promise<GooglePlacesResponse> {
    const { lat, lng, radius = 10000, type, rating, minprice, maxprice } = options;

    try {
      const defaultTypes = [
        'restaurant',
        'cafe',
        'bar',
        'pharmacy',
        'night_club',
        'movie_theater',
        'shopping_mall',
        'gym',
        'park',
        'museum',
        'bowling_alley',
        'amusement_park',
      ];

      const requestBody: any = {
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: radius,
          },
        },
        maxResultCount: 20,
      };

      if (type) {
        requestBody.includedTypes = [type];
      } else {
        requestBody.includedTypes = defaultTypes;
      }

      requestBody.excludedTypes = ['lodging'];

      const response = await fetch(this.nearbyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': this.fieldMask,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Google Places API error: ${response.statusText} - ${errorBody}`);
      }

      const data = (await response.json()) as PlacesNewResponse;
      let results = this.transformToLegacyFormat(data.places || []);

      // Client-side openNow filter (Nearby Search doesn't support it natively)
      results = results.filter(place => {
        // Keep places with no opening hours data (parks, public spaces, etc.)
        if (!place.opening_hours) return true;
        return place.opening_hours.open_now === true;
      });

      // Client-side rating filter
      if (rating !== undefined) {
        results = results.filter(
          place => place.rating !== undefined && place.rating >= rating,
        );
      }

      // Client-side price level filter
      if (minprice !== undefined || maxprice !== undefined) {
        results = results.filter(place => {
          if (place.price_level === undefined || place.price_level === null) return true;
          if (minprice !== undefined && place.price_level < minprice) return false;
          if (maxprice !== undefined && place.price_level > maxprice) return false;
          return true;
        });
      }

      // No pagination for Nearby Search
      return { results, status: 'OK' };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch places: ${error.message}`);
      }
      throw new Error('Failed to fetch places: Unknown error');
    }
  }

  // ---------------------------------------------------------------------------
  // Text Search (New) — used for keyword / category searches + pagination
  // ---------------------------------------------------------------------------
  private async searchText(options: SearchOptions): Promise<GooglePlacesResponse> {
    const {
      lat,
      lng,
      radius = 10000,
      keyword,
      rating,
      minprice,
      maxprice,
      pageToken,
    } = options;

    try {
      const requestBody: any = {
        openNow: true,
        pageSize: 20,
      };

      // Text query — use keyword directly; Google NLU handles "Food", "Bars", etc.
      if (keyword) {
        requestBody.textQuery = keyword;
      } else if (pageToken) {
        // Pagination requires repeating the original textQuery — use a broad default
        requestBody.textQuery = 'places';
      }

      // Hard location restriction (rectangle) to only return nearby results,
      // matching the old Nearby Search behaviour that used a strict radius.
      requestBody.locationRestriction = this.circleToRect(lat, lng, radius);

      // Min rating (server-side)
      if (rating !== undefined) {
        requestBody.minRating = rating;
      }

      // Price levels (server-side)
      if (minprice !== undefined || maxprice !== undefined) {
        requestBody.priceLevels = this.buildPriceLevels(minprice ?? 0, maxprice ?? 4);
      }

      // Pagination token
      if (pageToken) {
        requestBody.pageToken = pageToken;
      }

      const response = await fetch(this.textSearchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': this.textSearchFieldMask,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Google Places API error: ${response.statusText} - ${errorBody}`);
      }

      const data = (await response.json()) as PlacesNewResponse;
      const results = this.transformToLegacyFormat(data.places || []);

      return {
        results,
        next_page_token: data.nextPageToken,
        status: 'OK',
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch places: ${error.message}`);
      }
      throw new Error('Failed to fetch places: Unknown error');
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  // Build array of PRICE_LEVEL_* strings for a numeric min–max range (0–4)
  // Note: Google Text Search does not support PRICE_LEVEL_FREE, so we start from 1
  private buildPriceLevels(min: number, max: number): string[] {
    const levels: string[] = [];
    const effectiveMin = Math.max(min, 1); // Skip PRICE_LEVEL_FREE
    for (let i = effectiveMin; i <= max && i < PRICE_LEVEL_STRINGS.length; i++) {
      levels.push(PRICE_LEVEL_STRINGS[i]);
    }
    return levels;
  }

  // Convert a circle (centre + radius in metres) to a rectangular viewport
  // for use with Text Search's locationRestriction (which only accepts rectangles).
  private circleToRect(lat: number, lng: number, radiusMeters: number) {
    const earthRadius = 6_371_000; // metres
    const latDelta = (radiusMeters / earthRadius) * (180 / Math.PI);
    const lngDelta =
      (radiusMeters / earthRadius) * (180 / Math.PI) /
      Math.cos(lat * (Math.PI / 180));

    return {
      rectangle: {
        low: { latitude: lat - latDelta, longitude: lng - lngDelta },
        high: { latitude: lat + latDelta, longitude: lng + lngDelta },
      },
    };
  }

  // Transform Places API (New) response to legacy format for backward compatibility
  private transformToLegacyFormat(places: PlacesNewPlace[]): GooglePlace[] {
    return places.map(place => {
      // Prefer currentOpeningHours for real-time open/closed status
      const openingHours = place.currentOpeningHours || place.regularOpeningHours;

      const legacyPlace: GooglePlace = {
        place_id: place.id,
        name: place.displayName?.text,
        vicinity: place.shortFormattedAddress || place.formattedAddress,
        formatted_address: place.formattedAddress,
        geometry: place.location
          ? {
              location: {
                lat: place.location.latitude,
                lng: place.location.longitude,
              },
            }
          : undefined,
        rating: place.rating,
        user_ratings_total: place.userRatingCount,
        price_level: this.convertPriceLevel(place.priceLevel),
        types: place.types,
        opening_hours: this.convertOpeningHours(openingHours),
        closes_at: this.extractClosingTimeFromNew(openingHours),
      };

      // Convert photos to legacy format and generate URLs
      if (place.photos && place.photos.length > 0) {
        legacyPlace.photos = place.photos.map(photo => ({
          photo_reference: photo.name,
          height: photo.heightPx,
          width: photo.widthPx,
        }));
        legacyPlace.photo_urls = place.photos.map(
          photo =>
            `${this.photoBaseUrl}/${photo.name}/media?maxWidthPx=400&key=${this.apiKey}`,
        );
      }

      return legacyPlace;
    });
  }

  // Convert Places API (New) price level string to legacy numeric format
  private convertPriceLevel(priceLevel?: string): number | undefined {
    if (!priceLevel) return undefined;
    const priceLevelMap: Record<string, number> = {
      PRICE_LEVEL_FREE: 0,
      PRICE_LEVEL_INEXPENSIVE: 1,
      PRICE_LEVEL_MODERATE: 2,
      PRICE_LEVEL_EXPENSIVE: 3,
      PRICE_LEVEL_VERY_EXPENSIVE: 4,
    };
    return priceLevelMap[priceLevel];
  }

  // Convert Places API (New) opening hours to legacy format
  private convertOpeningHours(newHours?: PlacesNewOpeningHours): OpeningHours | undefined {
    if (!newHours) return undefined;

    return {
      open_now: newHours.openNow,
      periods: newHours.periods?.map(period => ({
        open: {
          day: period.open.day,
          time: `${period.open.hour.toString().padStart(2, '0')}${period.open.minute.toString().padStart(2, '0')}`,
        },
        close: period.close
          ? {
              day: period.close.day,
              time: `${period.close.hour.toString().padStart(2, '0')}${period.close.minute.toString().padStart(2, '0')}`,
            }
          : undefined,
      })),
      weekday_text: newHours.weekdayDescriptions,
    };
  }

  // Extract closing time from Places API (New) format
  private extractClosingTimeFromNew(openingHours?: PlacesNewOpeningHours): string | undefined {
    if (!openingHours?.periods || openingHours.periods.length === 0) {
      return undefined;
    }

    const now = new Date();
    const currentDay = now.getDay();

    const todayPeriod = openingHours.periods.find(
      period => period.open.day === currentDay,
    );

    if (todayPeriod?.close) {
      const hour = todayPeriod.close.hour.toString().padStart(2, '0');
      const minute = todayPeriod.close.minute.toString().padStart(2, '0');
      return `${hour}:${minute}`;
    }

    return undefined;
  }
}

export default new PlacesService();
