import bcryptjs from 'bcryptjs';
import { randomUUID } from 'crypto';
import db from './db.js';
import { initializeDatabase } from './db.js';

async function seed() {
  try {
    initializeDatabase();

    // Check if demo user exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@beheard.ai');
    if (existing) {
      console.log('✓ Demo user already exists');
      return;
    }

    // Create demo user
    const userId = randomUUID();
    const passwordHash = await bcryptjs.hash('demo123', 10);

    db.prepare(`
      INSERT INTO users (id, email, name, password_hash, company_name, onboarding_complete)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, 'demo@beheard.ai', 'Demo User', passwordHash, 'Demo Company', 1);

    // Create demo brand
    const brandId = randomUUID();
    db.prepare(`
      INSERT INTO brands (
        id, user_id, name, industry, colors, voice_description, 
        target_audience, competitors, active, onboarding_complete
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      brandId,
      userId,
      'Heard',
      'Technology',
      JSON.stringify({ primary: '#BFFF00', secondary: '#0a0a0a' }),
      'Confident, direct, slightly witty. No jargon.',
      'Tech entrepreneurs 25-45',
      JSON.stringify(['Jasper', 'Copy.ai', 'HubSpot', 'Hootsuite']),
      1,
      1
    );

    console.log('✓ Seed data created');
    console.log('  Demo user: demo@beheard.ai / demo123');
    console.log('  Demo brand: Heard');
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

seed();
