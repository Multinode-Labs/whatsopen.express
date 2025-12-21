# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview
WhatsOpen Express is a Node.js/Express API that integrates with Google Places API to search for nearby places that are currently open. The API provides location-based search with filtering capabilities including radius, type, keyword, rating, and price range.

## Development Commands

### Build and Run
- `npm run build` - Compile TypeScript to JavaScript in `dist/` directory
- `npm run dev` - Run development server with hot reload using nodemon
- `npm start` - Run production build from `dist/app.js`

### Important Notes
- No test suite is currently configured (`npm test` will fail)
- No linting or type-checking scripts are configured in package.json
- TypeScript compilation must complete successfully before running production

## Architecture

### Tech Stack
- **Runtime**: Node.js with ES2022 modules
- **Framework**: Express 5.x
- **Language**: TypeScript (strict mode enabled)
- **External APIs**: Google Places API (Nearby Search & Place Details)

### Project Structure
```
src/
├── app.ts                    # Main application entry point
├── routes/
│   └── places.ts            # Places endpoint route handler
└── services/
    └── placesService.ts     # Google Places API integration
```

### Application Flow
1. **Entry Point** (`app.ts`): Express server setup with rate limiting (100 requests per 5 minutes), health check endpoint at `/api/health`
2. **Routes** (`routes/places.ts`): Single `/places` endpoint that validates query parameters and delegates to service layer
3. **Service** (`services/placesService.ts`): Encapsulates Google Places API logic with three key responsibilities:
   - Nearby search with `opennow=true` filter
   - Photo URL generation for place images
   - Parallel fetching of place details to extract closing times

### Key Implementation Details
- **ESM Modules**: Project uses ES modules (`.js` extensions required in imports even for `.ts` files)
- **Rate Limiting**: Global rate limiter applied to all routes via `express-rate-limit`
- **Coordinate Flexibility**: Accepts either `lat`/`lng` or `locationLat`/`locationLng` query parameters
- **Data Enrichment**: Service layer enriches Google Places responses with:
  - Full photo URLs (not just references)
  - `closes_at` field extracted from opening hours
  - Rating filtering applied client-side after API response

### Environment Variables
- `GMAPS_KEY` (required): Google Maps API key - must have Places API enabled
- `PORT` (optional): Server port, defaults to 3000

### Development Configuration
- **nodemon**: Watches `src/**/*.ts` and `src/**/*.json`, ignores test files, uses `ts-node/esm` loader
- **TypeScript**: Strict mode with ES2022 target, outputs to `dist/` with source maps and declarations
- **ts-node**: Configured for ESM with experimental specifier resolution

## Common Patterns
- All imports from local TypeScript files must include `.js` extension (ESM requirement)
- Error handling uses try-catch with typed Error checks
- Service returns Google API response structure with enriched data
- Query parameter validation happens in route layer before service call