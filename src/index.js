import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cron from 'node-cron';

import { connectDB } from './db.js';
import { authMiddleware, signup, login, getMe, deleteAccount } from './auth.js';
import { createBrand, getBrands, getBrand, updateBrand, prefillBrand, regenerateBrandProfile } from './brands.js';
import { generateContent, regenerateImage } from './ai.js';
import { createContent, getContent, getContentById, updateContent, deleteContent, getDashboardStats } from './content.js';
import { publishContent, scheduleContent, checkScheduledContent, fetchContentAnalytics } from './publishing.js';
import { generateCampaignPlan, createCampaign, getCampaigns, getCampaignById, generateCampaignContent, getCalendarEvents, updateCalendarEvent } from './campaigns.js';
import { generatePR, getPRPieces, getPRById, updatePR, deletePR } from './pr.js';
import { generateCreative, getCreativeGallery, regenerateCreative, deleteCreative } from './creative.js';
import { getAnalytics, syncAnalytics, getAnalyticsHistory } from './analytics.js';
import { uploadMiddleware, handleUpload } from './upload.js';
import { getMetaOAuthUrl, handleMetaCallback } from './meta.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ----- CORS -----
// Allow the deployed frontend (CLIENT_URL). Falls back to allowing all origins
// so local dev and API testing keep working. Set CLIENT_URL in production.
const allowedOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, true); // permissive by default; tighten if needed
  },
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ----- Health check -----
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ----- Auth -----
app.post('/api/auth/signup', signup);
app.post('/api/auth/login', login);
app.get('/api/auth/me', authMiddleware, getMe);
app.delete('/api/auth/account', authMiddleware, deleteAccount);

// ----- Brands -----
app.post('/api/brands', authMiddleware, createBrand);
app.get('/api/brands', authMiddleware, getBrands);
app.get('/api/brands/:brandId', authMiddleware, getBrand);
app.put('/api/brands/:brandId', authMiddleware, updateBrand);
app.post('/api/brands/:brandId/prefill', authMiddleware, prefillBrand);
app.post('/api/brands/:brandId/regenerate-profile', authMiddleware, regenerateBrandProfile);

// Upload route (returns a base64 data URI)
app.post('/api/upload', authMiddleware, uploadMiddleware, handleUpload);

// ----- AI -----
app.post('/api/content/generate', authMiddleware, generateContent);
app.post('/api/images/regenerate', authMiddleware, regenerateImage);

// ----- Content -----
app.post('/api/content', authMiddleware, createContent);
app.get('/api/content', authMiddleware, getContent);
app.get('/api/content/:contentId', authMiddleware, getContentById);
app.patch('/api/content/:contentId', authMiddleware, updateContent);
app.delete('/api/content/:contentId', authMiddleware, deleteContent);

// ----- Dashboard -----
app.get('/api/dashboard/stats', authMiddleware, getDashboardStats);

// ----- Publishing -----
app.post('/api/content/:contentId/publish', authMiddleware, publishContent);
app.post('/api/content/:contentId/schedule', authMiddleware, scheduleContent);
app.get('/api/content/:contentId/analytics', authMiddleware, fetchContentAnalytics);

// ----- Campaigns -----
app.post('/api/campaigns/generate', authMiddleware, generateCampaignPlan);
app.post('/api/campaigns', authMiddleware, createCampaign);
app.get('/api/campaigns', authMiddleware, getCampaigns);
app.get('/api/campaigns/:campaignId', authMiddleware, getCampaignById);
app.post('/api/campaigns/:campaignId/generate-content', authMiddleware, generateCampaignContent);
app.get('/api/calendar', authMiddleware, getCalendarEvents);
app.patch('/api/calendar/:contentId', authMiddleware, updateCalendarEvent);

// ----- PR -----
app.post('/api/pr/generate', authMiddleware, generatePR);
app.get('/api/pr', authMiddleware, getPRPieces);
app.get('/api/pr/:prId', authMiddleware, getPRById);
app.patch('/api/pr/:prId', authMiddleware, updatePR);
app.delete('/api/pr/:prId', authMiddleware, deletePR);

// ----- Creative Studio -----
app.post('/api/creative/generate', authMiddleware, generateCreative);
app.get('/api/creative/gallery', authMiddleware, getCreativeGallery);
app.post('/api/creative/:creativeId/regenerate', authMiddleware, regenerateCreative);
app.delete('/api/creative/:creativeId', authMiddleware, deleteCreative);

// ----- Analytics -----
app.get('/api/analytics', authMiddleware, getAnalytics);
app.post('/api/analytics/sync', authMiddleware, syncAnalytics);
app.get('/api/analytics/history', authMiddleware, getAnalyticsHistory);

// ----- Meta OAuth -----
app.get('/api/meta/oauth-url', authMiddleware, getMetaOAuthUrl);
app.get('/api/meta/callback', handleMetaCallback);

// ----- Root -----
app.get('/', (req, res) => {
  res.json({ name: 'BeHeard API', status: 'running', docs: '/api/health' });
});

// ----- Error handling -----
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ----- Start -----
async function start() {
  await connectDB();

  // Scheduled publishing check every minute
  cron.schedule('* * * * *', () => {
    checkScheduledContent();
  });

  app.listen(PORT, () => {
    console.log(`\n🚀 BeHeard API running on port ${PORT}`);
    console.log(`⏰ Scheduled publishing check enabled\n`);
  });
}

start();
