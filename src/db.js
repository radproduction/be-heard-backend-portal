import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data/beheard.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

export function initializeDatabase() {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      password_hash TEXT NOT NULL,
      company_name TEXT,
      plan TEXT DEFAULT 'starter',
      onboarding_complete INTEGER DEFAULT 0,
      preferences TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Brands table
  db.exec(`
    CREATE TABLE IF NOT EXISTS brands (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      name TEXT NOT NULL,
      logo_url TEXT,
      colors TEXT DEFAULT '{"primary":"#BFFF00","secondary":"#0a0a0a"}',
      voice_description TEXT,
      target_audience TEXT,
      industry TEXT,
      competitors TEXT DEFAULT '[]',
      sample_content TEXT,
      content_preferences TEXT DEFAULT '{}',
      meta_page_id TEXT,
      meta_page_token TEXT,
      meta_ig_account_id TEXT,
      onboarding_step INTEGER DEFAULT 1,
      onboarding_complete INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Migration: Add onboarding columns if they don't exist
  try {
    db.prepare('SELECT onboarding_step FROM brands LIMIT 1').get();
  } catch (err) {
    if (err.message.includes('no such column')) {
      db.exec(`ALTER TABLE brands ADD COLUMN onboarding_step INTEGER DEFAULT 1`);
      db.exec(`ALTER TABLE brands ADD COLUMN onboarding_complete INTEGER DEFAULT 0`);
    }
  }

  // Migration: Add website_url column if it doesn't exist
  try {
    db.prepare('SELECT website_url FROM brands LIMIT 1').get();
  } catch (err) {
    if (err.message.includes('no such column')) {
      db.exec(`ALTER TABLE brands ADD COLUMN website_url TEXT`);
    }
  }

  // Content table (must be after campaigns)
  db.exec(`
    CREATE TABLE IF NOT EXISTS content (
      id TEXT PRIMARY KEY,
      brand_id TEXT,
      user_id TEXT,
      type TEXT NOT NULL,
      platform TEXT,
      title TEXT,
      body TEXT NOT NULL,
      image_url TEXT,
      image_data TEXT,
      media_brief TEXT,
      hashtags TEXT DEFAULT '[]',
      status TEXT DEFAULT 'draft',
      scheduled_for TEXT,
      published_at TEXT,
      meta_post_id TEXT,
      campaign_id TEXT REFERENCES campaigns(id),
      performance TEXT DEFAULT '{}',
      ai_prompt TEXT,
      version INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Campaigns table
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      brand_id TEXT,
      user_id TEXT,
      name TEXT NOT NULL,
      objective TEXT,
      target_audience TEXT,
      channels TEXT DEFAULT '[]',
      frequency TEXT,
      start_date TEXT,
      end_date TEXT,
      budget TEXT,
      status TEXT DEFAULT 'planning',
      strategy TEXT,
      key_messages TEXT DEFAULT '[]',
      content_plan TEXT DEFAULT '[]',
      kpis TEXT DEFAULT '{}',
      performance_summary TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Calendar events table
  db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      content_id TEXT,
      brand_id TEXT,
      user_id TEXT,
      platform TEXT,
      scheduled_date TEXT,
      scheduled_time TEXT,
      status TEXT DEFAULT 'scheduled',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // PR pieces table
  db.exec(`
    CREATE TABLE IF NOT EXISTS pr_pieces (
      id TEXT PRIMARY KEY,
      brand_id TEXT,
      user_id TEXT,
      type TEXT,
      title TEXT,
      body TEXT,
      target_outlets TEXT DEFAULT '[]',
      status TEXT DEFAULT 'draft',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Analytics table
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics (
      id TEXT PRIMARY KEY,
      brand_id TEXT,
      platform TEXT,
      date TEXT,
      followers INTEGER DEFAULT 0,
      posts_count INTEGER DEFAULT 0,
      total_reach INTEGER DEFAULT 0,
      total_impressions INTEGER DEFAULT 0,
      total_engagement INTEGER DEFAULT 0,
      engagement_rate REAL DEFAULT 0,
      data TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Generated images table
  db.exec(`
    CREATE TABLE IF NOT EXISTS generated_images (
      id TEXT PRIMARY KEY,
      content_id TEXT,
      brand_id TEXT,
      user_id TEXT,
      prompt TEXT,
      image_url TEXT,
      image_data TEXT,
      format TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  console.log('✓ Database initialized');
}

export default db;
