import express from 'express';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import placesRouter from './routes/places.js';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON
app.use(express.json());

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Apply rate limiting to all routes
app.use(limiter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Mount places routes
app.use('/', placesRouter);

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'WhatsOpen Express API',
    endpoints: {
      health: '/api/health',
      places: '/places?lat=<lat>&lng=<lng>&radius=<radius>&type=<type>&keyword=<keyword>&rating=<rating>&minprice=<minprice>&maxprice=<maxprice>&pageToken=<pageToken>'
    }
  });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

export default app;
