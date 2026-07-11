import 'dotenv/config';
import bcryptjs from 'bcryptjs';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import { connectDB } from './db.js';
import { User, Brand } from './models/index.js';

async function seed() {
  try {
    await connectDB();

    const existing = await User.findOne({ email: 'demo@beheard.ai' }).lean();
    if (existing) {
      // Ensure the demo brand is marked onboarding-complete for the new BrandGate
      await Brand.updateMany({ user_id: existing.id }, { $set: { onboarding_complete: 1 } });
      console.log('✓ Demo user already exists (ensured brand onboarding_complete=1)');
      await mongoose.connection.close();
      return;
    }

    const userId = randomUUID();
    const passwordHash = await bcryptjs.hash('demo123', 10);

    await User.create({
      id: userId,
      email: 'demo@beheard.ai',
      name: 'Demo User',
      password_hash: passwordHash,
      company_name: 'Demo Company',
      onboarding_complete: 1
    });

    await Brand.create({
      id: randomUUID(),
      user_id: userId,
      name: 'Heard',
      industry: 'Technology',
      colors: { primary: '#BFFF00', secondary: '#0a0a0a' },
      voice_description: 'Confident, direct, slightly witty. No jargon.',
      target_audience: 'Tech entrepreneurs 25-45',
      competitors: ['Jasper', 'Copy.ai', 'HubSpot', 'Hootsuite'],
      onboarding_complete: 1,
      active: 1
    });

    console.log('✓ Seed data created');
    console.log('  Demo user: demo@beheard.ai / demo123');
    console.log('  Demo brand: Heard');

    await mongoose.connection.close();
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

seed();
