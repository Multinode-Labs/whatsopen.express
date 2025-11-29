import express from 'express';
import dotenv from 'dotenv';
import placesRouter from './routes/places.js';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON
app.use(express.json());

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
