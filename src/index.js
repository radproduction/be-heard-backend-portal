import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import { initializeDatabase } from './db.js';
import { authMiddleware, signup, login, getMe } from './auth.js';
import { createBrand, getBrands, getBrand, updateBrand, prefillBrand, regenerateBrandProfile } from './brands.js';
import { generateContent, regenerateImage } from './ai.js';
import { createContent, getContent, getContentById, updateContent, deleteContent, getDashboardStats } from './content.js';
import { publishContent, scheduleContent, checkScheduledContent, fetchContentAnalytics } from './publishing.js';
import { generateCampaignPlan, createCampaign, getCampaigns, getCampaignById, generateCampaignContent, getCalendarEvents, updateCalendarEvent } from './campaigns.js';
import { generatePR, getPRPieces, getPRById, updatePR, deletePR } from './pr.js';
import { generateCreative, getCreativeGallery, regenerateCreative, deleteCreative } from './creative.js';
import { getAnalytics, syncAnalytics, getAnalyticsHistory } from './analytics.js';
import { uploadMiddleware, handleUpload } from './upload.js';
import { getMetaOAuthUrl, handleMetaCallback, selectMetaPage, publishToInstagram, publishToFacebook } from './meta.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve uploads directory statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));


// Initialize database
initializeDatabase();

// Auth routes
app.post('/api/auth/signup', signup);
app.post('/api/auth/login', login);
app.get('/api/auth/me', authMiddleware, getMe);

// Brand routes
app.post('/api/brands', authMiddleware, createBrand);
app.get('/api/brands', authMiddleware, getBrands);
app.get('/api/brands/:brandId', authMiddleware, getBrand);
app.put('/api/brands/:brandId', authMiddleware, updateBrand);
app.post('/api/brands/:brandId/prefill', authMiddleware, prefillBrand);
app.post('/api/brands/:brandId/regenerate-profile', authMiddleware, regenerateBrandProfile);

// Upload route
app.post('/api/upload', authMiddleware, uploadMiddleware, handleUpload);

// AI routes
app.post('/api/content/generate', authMiddleware, generateContent);
app.post('/api/images/regenerate', authMiddleware, regenerateImage);

// Content routes
app.post('/api/content', authMiddleware, createContent);
app.get('/api/content', authMiddleware, getContent);
app.get('/api/content/:contentId', authMiddleware, getContentById);
app.patch('/api/content/:contentId', authMiddleware, updateContent);
app.delete('/api/content/:contentId', authMiddleware, deleteContent);

// Dashboard
app.get('/api/dashboard/stats', authMiddleware, getDashboardStats);

// Publishing routes
app.post('/api/content/:contentId/publish', authMiddleware, publishContent);
app.post('/api/content/:contentId/schedule', authMiddleware, scheduleContent);
app.get('/api/content/:contentId/analytics', authMiddleware, fetchContentAnalytics);

// Campaign routes
app.post('/api/campaigns/generate', authMiddleware, generateCampaignPlan);
app.post('/api/campaigns', authMiddleware, createCampaign);
app.get('/api/campaigns', authMiddleware, getCampaigns);
app.get('/api/campaigns/:campaignId', authMiddleware, getCampaignById);
app.post('/api/campaigns/:campaignId/generate-content', authMiddleware, generateCampaignContent);
app.get('/api/calendar', authMiddleware, getCalendarEvents);
app.patch('/api/calendar/:contentId', authMiddleware, updateCalendarEvent);

// PR routes
app.post('/api/pr/generate', authMiddleware, generatePR);
app.get('/api/pr', authMiddleware, getPRPieces);
app.get('/api/pr/:prId', authMiddleware, getPRById);
app.patch('/api/pr/:prId', authMiddleware, updatePR);
app.delete('/api/pr/:prId', authMiddleware, deletePR);

// Creative Studio routes
app.post('/api/creative/generate', authMiddleware, generateCreative);
app.get('/api/creative/gallery', authMiddleware, getCreativeGallery);
app.post('/api/creative/:creativeId/regenerate', authMiddleware, regenerateCreative);
app.delete('/api/creative/:creativeId', authMiddleware, deleteCreative);

// Analytics routes
app.get('/api/analytics', authMiddleware, getAnalytics);
app.post('/api/analytics/sync', authMiddleware, syncAnalytics);
app.get('/api/analytics/history', authMiddleware, getAnalyticsHistory);

// Meta OAuth routes
app.get('/api/meta/oauth-url', authMiddleware, getMetaOAuthUrl);
app.get('/api/meta/callback', handleMetaCallback);
app.post('/api/meta/select-page', authMiddleware, selectMetaPage);

// Publishing routes
app.post('/api/publish/instagram', authMiddleware, publishToInstagram);
app.post('/api/publish/facebook', authMiddleware, publishToFacebook);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Serve client in production (MUST be after all API routes)
if (process.env.NODE_ENV === 'production') {
  const clientPath = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
  });
}

// Start scheduled publishing check every minute
cron.schedule('* * * * *', () => {
  checkScheduledContent();
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 BeHeard server running on http://localhost:${PORT}`);
  console.log(`📁 Uploads directory: ${path.join(__dirname, '../uploads')}`);
  console.log(`🗄️  Database: ${path.join(__dirname, '../data/beheard.db')}`);
  console.log(`⏰ Scheduled publishing check enabled\n`);
});
