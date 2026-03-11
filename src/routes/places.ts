import { Router, Request, Response } from 'express';
import placesService from '../services/placesService.js';

const router = Router();

router.get('/places', async (req: Request, res: Response) => {
  try {
    const {
      lat,
      lng,
      radius,
      type,
      keyword,
      rating,
      minprice,
      maxprice,
      locationLat,
      locationLng,
      pageToken
    } = req.query;

    // Determine search coordinates
    let searchLat: number;
    let searchLng: number;

    if (locationLat && locationLng) {
      // Use location coordinates if provided
      searchLat = parseFloat(locationLat as string);
      searchLng = parseFloat(locationLng as string);
    } else if (lat && lng) {
      // Fall back to lat/lng
      searchLat = parseFloat(lat as string);
      searchLng = parseFloat(lng as string);
    } else {
      return res.status(400).json({
        error: 'Either lat & lng, or locationLat & locationLng are required'
      });
    }

    // Validate coordinates
    if (isNaN(searchLat) || isNaN(searchLng)) {
      return res.status(400).json({
        error: 'Invalid coordinates provided'
      });
    }

    // Parse optional parameters - no defaults
    const options: any = {
      lat: searchLat,
      lng: searchLng
    };

    // Add optional parameters if provided
    if (radius) {
      const parsedRadius = parseInt(radius as string);
      if (!isNaN(parsedRadius)) {
        options.radius = parsedRadius;
      }
    }

    if (type) {
      options.type = type as string;
    }

    if (keyword) {
      options.keyword = keyword as string;
    }

    if (rating) {
      const parsedRating = parseFloat(rating as string);
      if (!isNaN(parsedRating) && parsedRating >= 1 && parsedRating <= 5) {
        options.rating = parsedRating;
      }
    }

    if (minprice) {
      const parsedMinPrice = parseInt(minprice as string);
      if (!isNaN(parsedMinPrice) && parsedMinPrice >= 0 && parsedMinPrice <= 5) {
        // Convert Flutter's 1-5 scale to Google's 0-4 scale
        options.minprice = Math.max(parsedMinPrice - 1, 0);
      }
    }

    if (maxprice) {
      const parsedMaxPrice = parseInt(maxprice as string);
      if (!isNaN(parsedMaxPrice) && parsedMaxPrice >= 0 && parsedMaxPrice <= 5) {
        // Convert Flutter's 1-5 scale to Google's 0-4 scale
        options.maxprice = Math.min(parsedMaxPrice - 1, 4);
      }
    }

    if (pageToken) {
      options.pageToken = pageToken as string;
    }

    // Call service
    const data = await placesService.searchPlaces(options);

    // Return response
    res.json({
      results: data.results,
      next_page_token: data.next_page_token,
      status: data.status
    });

  } catch (error) {
    console.error('Error in /places endpoint:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

export default router;
