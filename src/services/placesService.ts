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

interface GooglePlace {
  rating?: number;
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
      radius = 2000,
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
      if (minprice !== undefined) {
        url.searchParams.append('minprice', minprice.toString());
      }
      if (maxprice !== undefined) {
        url.searchParams.append('maxprice', maxprice.toString());
      }
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

      return {
        results: data.results || [],
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
}

export default new PlacesService();
