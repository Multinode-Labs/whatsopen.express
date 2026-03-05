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
}

class PlacesService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://places.googleapis.com/v1/places:searchNearby';
  private readonly photoBaseUrl = 'https://places.googleapis.com/v1';

  constructor() {
    this.apiKey = process.env.GMAPS_KEY || '';
    if (!this.apiKey) {
      throw new Error('GMAPS_KEY environment variable is not set');
    }
  }

  async searchNearby(options: SearchOptions): Promise<GooglePlacesResponse> {
    const {
      lat,
      lng,
      radius = 10000,
      type,
      keyword,
      minprice,
      maxprice,
      rating
    } = options;

    try {
      // Default place types if no type filter provided
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
        'amusement_park'
      ];

      // Build request body for Places API (New)
      const requestBody: any = {
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: radius
          }
        },
        maxResultCount: 20
      };

      // Add type filter - Places API (New) uses includedTypes array
      if (type) {
        requestBody.includedTypes = [type];
      } else {
        requestBody.includedTypes = defaultTypes;
      }

      // Exclude lodging from results
      requestBody.excludedTypes = ['lodging'];

      // Make request to Places API (New)
      // Field mask determines what data we get and the pricing tier
      const fieldMask = [
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
        'places.currentOpeningHours'
      ].join(',');

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': fieldMask
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Google Places API error: ${response.statusText} - ${errorBody}`);
      }

      const data = await response.json() as PlacesNewResponse;

      // Transform Places API (New) response to legacy format for mobile app compatibility
      let results = this.transformToLegacyFormat(data.places || []);

      // Filter by rating if provided
      if (rating !== undefined) {
        results = results.filter(
          place => place.rating !== undefined && place.rating >= rating
        );
      }

      // Filter by price level if provided
      if (minprice !== undefined || maxprice !== undefined) {
        results = results.filter(place => {
          if (place.price_level === undefined || place.price_level === null) {
            return true;
          }
          if (minprice !== undefined && place.price_level < minprice) {
            return false;
          }
          if (maxprice !== undefined && place.price_level > maxprice) {
            return false;
          }
          return true;
        });
      }

      // Filter by keyword if provided (search in name and types)
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase();
        results = results.filter(place => {
          const nameMatch = place.name?.toLowerCase().includes(lowerKeyword);
          const typeMatch = place.types?.some(t => t.toLowerCase().includes(lowerKeyword));
          return nameMatch || typeMatch;
        });
      }

      return {
        results,
        status: 'OK'
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch places: ${error.message}`);
      }
      throw new Error('Failed to fetch places: Unknown error');
    }
  }

  // Transform Places API (New) response to legacy format for backward compatibility
  private transformToLegacyFormat(places: PlacesNewPlace[]): GooglePlace[] {
    return places.map(place => {
      const legacyPlace: GooglePlace = {
        place_id: place.id,
        name: place.displayName?.text,
        vicinity: place.shortFormattedAddress || place.formattedAddress,
        formatted_address: place.formattedAddress,
        geometry: place.location ? {
          location: {
            lat: place.location.latitude,
            lng: place.location.longitude
          }
        } : undefined,
        rating: place.rating,
        user_ratings_total: place.userRatingCount,
        price_level: this.convertPriceLevel(place.priceLevel),
        types: place.types,
        opening_hours: this.convertOpeningHours(place.regularOpeningHours || place.currentOpeningHours),
        closes_at: this.extractClosingTimeFromNew(place.regularOpeningHours || place.currentOpeningHours)
      };

      // Convert photos to legacy format and generate URLs
      if (place.photos && place.photos.length > 0) {
        legacyPlace.photos = place.photos.map(photo => ({
          photo_reference: photo.name, // In new API, 'name' is the resource name
          height: photo.heightPx,
          width: photo.widthPx
        }));
        // Generate photo URLs using Places API (New) format
        legacyPlace.photo_urls = place.photos.map(photo => 
          `${this.photoBaseUrl}/${photo.name}/media?maxWidthPx=400&key=${this.apiKey}`
        );
      }

      return legacyPlace;
    });
  }

  // Convert Places API (New) price level string to legacy numeric format
  private convertPriceLevel(priceLevel?: string): number | undefined {
    if (!priceLevel) return undefined;
    const priceLevelMap: Record<string, number> = {
      'PRICE_LEVEL_FREE': 0,
      'PRICE_LEVEL_INEXPENSIVE': 1,
      'PRICE_LEVEL_MODERATE': 2,
      'PRICE_LEVEL_EXPENSIVE': 3,
      'PRICE_LEVEL_VERY_EXPENSIVE': 4
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
          time: `${period.open.hour.toString().padStart(2, '0')}${period.open.minute.toString().padStart(2, '0')}`
        },
        close: period.close ? {
          day: period.close.day,
          time: `${period.close.hour.toString().padStart(2, '0')}${period.close.minute.toString().padStart(2, '0')}`
        } : undefined
      })),
      weekday_text: newHours.weekdayDescriptions
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
      period => period.open.day === currentDay
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
