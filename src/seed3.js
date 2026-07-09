import { randomUUID } from 'crypto';
import db from './db.js';
import { initializeDatabase } from './db.js';

const campaigns = [
  {
    name: 'Summer Product Launch',
    objective: 'launch',
    channels: ['instagram', 'facebook', 'twitter'],
    frequency: 'Daily',
    start_date: '2024-06-01',
    end_date: '2024-06-30',
    budget: '5000',
    strategy: 'A comprehensive product launch campaign targeting young professionals and tech enthusiasts through social media with daily content updates, influencer partnerships, and exclusive early-bird offers.',
    key_messages: [
      'Revolutionary features that save time',
      'Join thousands of satisfied users',
      'Limited launch pricing available'
    ],
    content_plan: [
      { day: 1, date: '2024-06-01', platform: 'instagram', type: 'Social Post', topic: 'Product announcement', brief: 'Teaser post', time: '09:00', generate_image: true },
      { day: 1, date: '2024-06-01', platform: 'facebook', type: 'Ad Copy', topic: 'Early access', brief: 'Ad campaign', time: '12:00', generate_image: true },
      { day: 2, date: '2024-06-02', platform: 'twitter', type: 'Thread', topic: 'Features overview', brief: 'Thread', time: '10:00', generate_image: false },
      { day: 3, date: '2024-06-03', platform: 'instagram', type: 'Reel Script', topic: 'Demo video', brief: 'Reel', time: '15:00', generate_image: true },
      { day: 4, date: '2024-06-04', platform: 'facebook', type: 'Social Post', topic: 'Customer testimonials', brief: 'Testimonial post', time: '14:00', generate_image: true }
    ],
    kpis: { reach: '50000', engagement: '5000', conversions: '500' }
  },
  {
    name: 'Brand Awareness Campaign',
    objective: 'awareness',
    channels: ['instagram', 'linkedin', 'blog'],
    frequency: 'Weekly',
    start_date: '2024-06-15',
    end_date: '2024-08-15',
    budget: '3000',
    strategy: 'Build brand recognition through educational content, thought leadership articles, and community engagement across multiple platforms.',
    key_messages: [
      'Industry leaders trust our expertise',
      'Innovative solutions for modern challenges',
      'Join our growing community'
    ],
    content_plan: [
      { day: 1, date: '2024-06-15', platform: 'blog', type: 'Blog', topic: 'Industry trends', brief: 'Blog post', time: '10:00', generate_image: true },
      { day: 3, date: '2024-06-17', platform: 'linkedin', type: 'Social Post', topic: 'Thought leadership', brief: 'LinkedIn post', time: '09:00', generate_image: false },
      { day: 5, date: '2024-06-19', platform: 'instagram', type: 'Carousel', topic: 'Behind the scenes', brief: 'Carousel', time: '18:00', generate_image: true },
      { day: 7, date: '2024-06-21', platform: 'blog', type: 'Blog', topic: 'Case study', brief: 'Case study', time: '11:00', generate_image: true }
    ],
    kpis: { impressions: '100000', reach: '30000', shares: '1000' }
  },
  {
    name: 'Engagement Boost',
    objective: 'engagement',
    channels: ['instagram', 'facebook', 'email'],
    frequency: '3x Week',
    start_date: '2024-07-01',
    end_date: '2024-07-31',
    budget: '2000',
    strategy: 'Increase community engagement through interactive content, contests, and personalized email campaigns targeting existing customers.',
    key_messages: [
      'Your feedback shapes our future',
      'Exclusive rewards for loyal customers',
      'Be part of our community'
    ],
    content_plan: [
      { day: 1, date: '2024-07-01', platform: 'instagram', type: 'Social Post', topic: 'Contest announcement', brief: 'Contest post', time: '10:00', generate_image: true },
      { day: 2, date: '2024-07-02', platform: 'email', type: 'Email', topic: 'Weekly digest', brief: 'Email newsletter', time: '09:00', generate_image: false },
      { day: 3, date: '2024-07-03', platform: 'facebook', type: 'Social Post', topic: 'User stories', brief: 'UGC post', time: '14:00', generate_image: true },
      { day: 5, date: '2024-07-05', platform: 'instagram', type: 'Reel Script', topic: 'How-to guide', brief: 'Tutorial reel', time: '16:00', generate_image: true },
      { day: 6, date: '2024-07-06', platform: 'email', type: 'Email', topic: 'Exclusive offer', brief: 'Promotional email', time: '10:00', generate_image: false }
    ],
    kpis: { engagement_rate: '8%', comments: '500', shares: '300' }
  }
];

function seedCampaigns() {
  try {
    initializeDatabase();

    // Get demo user
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@beheard.ai');
    const brand = db.prepare('SELECT id FROM brands WHERE user_id = ?').get(user.id);

    if (!user || !brand) {
      console.error('Demo user or brand not found');
      return;
    }

    // Check if campaigns already exist
    const existing = db.prepare('SELECT COUNT(*) as count FROM campaigns WHERE user_id = ?').get(user.id);
    if (existing.count > 0) {
      console.log('✓ Campaigns already seeded');
      return;
    }

    // Insert campaigns
    campaigns.forEach(campaign => {
      const campaignId = randomUUID();
      
      db.prepare(`
        INSERT INTO campaigns (
          id, brand_id, user_id, name, objective, start_date, end_date,
          budget, channels, frequency, strategy, key_messages, content_plan, kpis, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        campaignId,
        brand.id,
        user.id,
        campaign.name,
        campaign.objective,
        campaign.start_date,
        campaign.end_date,
        campaign.budget,
        JSON.stringify(campaign.channels),
        campaign.frequency,
        campaign.strategy,
        JSON.stringify(campaign.key_messages),
        JSON.stringify(campaign.content_plan),
        JSON.stringify(campaign.kpis),
        'active'
      );

      console.log(`✓ Seeded campaign: ${campaign.name}`);
    });

    console.log('✓ Seeded 3 campaigns');
  } catch (err) {
    console.error('Seed campaigns error:', err);
    process.exit(1);
  }
}

seedCampaigns();
