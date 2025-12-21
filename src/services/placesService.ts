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

interface PlaceDetails {
  opening_hours?: OpeningHours;
  [key: string]: any;
}

interface GooglePlace {
  rating?: number;
  price_level?: number;
  photos?: Photo[];
  photo_urls?: string[];
  place_id?: string;
  opening_hours?: OpeningHours;
  closes_at?: string;
  [key: string]: any;
}

interface GooglePlacesResponse {
  results: GooglePlace[];
  next_page_token?: string;
  status: string;
}

class PlacesService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
  private readonly detailsBaseUrl = 'https://maps.googleapis.com/maps/api/place/details/json';
  private readonly photoBaseUrl = 'https://maps.googleapis.com/maps/api/place/photo';

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
      pageToken,
      rating
    } = options;

    try {
      // Build URL with query parameters
      const url = new URL(this.baseUrl);
      url.searchParams.append('location', `${lat},${lng}`);
      url.searchParams.append('radius', radius.toString());
      url.searchParams.append('opennow', 'true');
      url.searchParams.append('key', this.apiKey);

      // Add optional parameters only if provided
      if (type) {
        url.searchParams.append('type', type);
      }
      if (keyword) {
        url.searchParams.append('keyword', keyword);
      }
      // Note: Don't send minprice/maxprice to Google API to avoid filtering out places without price data
      // We'll filter client-side instead
      if (pageToken) {
        url.searchParams.append('pagetoken', pageToken);
      }

      // Make request to Google Places API
      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error(`Google Places API error: ${response.statusText}`);
      }

      const data = await response.json() as GooglePlacesResponse;

      // Filter by rating if provided
      if (rating !== undefined && data.results) {
        data.results = data.results.filter(
          place => place.rating !== undefined && place.rating >= rating
        );
      }

      // Filter by price level if provided (client-side to include places without price data)
      if ((minprice !== undefined || maxprice !== undefined) && data.results) {
        data.results = data.results.filter(place => {
          // If place has no price_level, include it (better UX - don't hide places without data)
          if (place.price_level === undefined || place.price_level === null) {
            return true;
          }
          
          // Apply price range filters
          if (minprice !== undefined && place.price_level < minprice) {
            return false;
          }
          if (maxprice !== undefined && place.price_level > maxprice) {
            return false;
          }
          return true;
        });
      }

      // Enrich results with photo URLs and closing times
      let enrichedResults = this.enrichWithPhotoUrls(data.results || []);
      enrichedResults = await this.enrichWithClosingTimes(enrichedResults);

      return {
        results: enrichedResults,
        next_page_token: data.next_page_token,
        status: data.status
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch places: ${error.message}`);
      }
      throw new Error('Failed to fetch places: Unknown error');
    }
  }

  private enrichWithPhotoUrls(places: GooglePlace[]): GooglePlace[] {
    return places.map(place => {
      if (place.photos && place.photos.length > 0) {
        // Generate photo URLs for all available photos
        place.photo_urls = place.photos.map(photo => 
          `${this.photoBaseUrl}?maxwidth=400&photo_reference=${photo.photo_reference}&key=${this.apiKey}`
        );
      }
      return place;
    });
  }

  private async enrichWithClosingTimes(places: GooglePlace[]): Promise<GooglePlace[]> {
    // Fetch place details for all places in parallel
    const detailsPromises = places.map(place => 
      place.place_id ? this.getPlaceDetails(place.place_id) : Promise.resolve(null)
    );

    const detailsResults = await Promise.all(detailsPromises);

    return places.map((place, index) => {
      const details = detailsResults[index];
      if (details?.opening_hours) {
        place.opening_hours = details.opening_hours;
        place.closes_at = this.extractClosingTime(details.opening_hours);
      }
      return place;
    });
  }

  private async getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
    try {
      const url = new URL(this.detailsBaseUrl);
      url.searchParams.append('place_id', placeId);
      url.searchParams.append('fields', 'opening_hours');
      url.searchParams.append('key', this.apiKey);

      const response = await fetch(url.toString());
      if (!response.ok) {
        console.error(`Failed to fetch details for place ${placeId}`);
        return null;
      }

      const data = await response.json() as { result?: PlaceDetails };
      return data.result || null;
    } catch (error) {
      console.error(`Error fetching place details for ${placeId}:`, error);
      return null;
    }
  }

  private extractClosingTime(openingHours: OpeningHours): string | undefined {
    if (!openingHours.periods || openingHours.periods.length === 0) {
      return undefined;
    }

    // Get current day of week (0 = Sunday, 6 = Saturday)
    const now = new Date();
    const currentDay = now.getDay();

    // Find today's period
    const todayPeriod = openingHours.periods.find(
      period => period.open?.day === currentDay
    );

    if (todayPeriod?.close?.time) {
      // Format time from HHMM to HH:MM
      const time = todayPeriod.close.time;
      return `${time.slice(0, 2)}:${time.slice(2)}`;
    }

    return undefined;
  }
}

export default new PlacesService();
