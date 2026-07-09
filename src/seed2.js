import { randomUUID } from 'crypto';
import db from './db.js';
import { initializeDatabase } from './db.js';

const CONTENT_TYPES = ['Social Post', 'Blog', 'Email', 'Ad Copy', 'Product Desc', 'Thread', 'Reel Script', 'Carousel'];
const PLATFORMS = ['instagram', 'facebook', 'twitter', 'linkedin'];

const sampleContent = [
  {
    type: 'Social Post',
    platform: 'instagram',
    status: 'published',
    body: ['🚀 Excited to announce our latest AI feature! This will revolutionize how you create content. #AI #Marketing #Innovation', 'Just launched something amazing! Check it out and let us know what you think. #BeHeard #ContentCreation', 'New feature alert! 🎉 Your content creation just got easier. Try it now!'],
    engagement: 245,
    impressions: 1200,
    reach: 890
  },
  {
    type: 'Blog',
    platform: 'linkedin',
    status: 'published',
    body: ['The Future of AI-Powered Marketing: How BeHeard is Changing the Game', 'Why Your Brand Needs AI Content Generation Now', 'Top 5 Content Marketing Trends for 2024'],
    engagement: 156,
    impressions: 3400,
    reach: 2100
  },
  {
    type: 'Email',
    platform: 'email',
    status: 'published',
    body: ['Subject: Discover the Power of AI Content Generation\n\nHi there!\n\nWe\'re thrilled to introduce BeHeard...', 'Subject: Your Brand Voice, Amplified\n\nDear Valued Customer,\n\nImagine creating content...', 'Subject: Limited Time: 50% Off AI Content Generation\n\nHello!\n\nFor a limited time only...'],
    engagement: 89,
    impressions: 450,
    reach: 320
  },
  {
    type: 'Ad Copy',
    platform: 'facebook',
    status: 'published',
    body: ['Transform Your Marketing with AI-Powered Content. Start Free Today!', 'Your Brand Deserves Better Content. Let AI Help. Try BeHeard Now!', 'Stop Struggling with Content. Start Creating with AI. Join Thousands Today!'],
    engagement: 567,
    impressions: 8900,
    reach: 5600
  },
  {
    type: 'Thread',
    platform: 'twitter',
    status: 'published',
    body: ['🧵 Thread: The Evolution of Content Marketing\n\n1/ Content is king, but creation is exhausting...', '🧵 Why AI is the Future of Marketing\n\n1/ Let\'s be honest, content creation takes forever...', '🧵 5 Ways AI is Transforming Digital Marketing\n\n1/ Personalization at scale...'],
    engagement: 234,
    impressions: 2100,
    reach: 1450
  },
  {
    type: 'Reel Script',
    platform: 'instagram',
    status: 'scheduled',
    body: ['[0s] Hook: "Wait, you\'re still writing content manually?"\n[3s] Problem: "Content creation is hard"\n[6s] Solution: "Meet BeHeard"\n[9s] CTA: "Try free today"', '[0s] "This changed everything for our marketing"\n[4s] "We went from 5 hours to 30 minutes"\n[8s] "BeHeard AI did the heavy lifting"\n[12s] "Join us"', '[0s] "Your content, but better"\n[3s] "AI-powered, brand-aligned"\n[6s] "Instantly generated"\n[9s] "BeHeard - Try now"'],
    engagement: 0,
    impressions: 0,
    reach: 0
  },
  {
    type: 'Carousel',
    platform: 'instagram',
    status: 'scheduled',
    body: ['Slide 1: "Tired of Content Writer\'s Block?"\nSlide 2: "Introducing BeHeard AI"\nSlide 3: "Generate 3 versions instantly"\nSlide 4: "Publish to Instagram & Facebook"\nSlide 5: "Track real engagement metrics"', 'Slide 1: "The Content Creation Revolution"\nSlide 2: "AI-Powered Writing"\nSlide 3: "Real Image Generation"\nSlide 4: "Scheduled Publishing"\nSlide 5: "Join 1000+ Creators"', 'Slide 1: "Your Brand Voice"\nSlide 2: "Amplified by AI"\nSlide 3: "3 Versions to Choose"\nSlide 4: "Professional Images"\nSlide 5: "Start Free Today"'],
    engagement: 0,
    impressions: 0,
    reach: 0
  },
  {
    type: 'Product Desc',
    platform: 'shopify',
    status: 'draft',
    body: ['BeHeard AI Content Generator - The smart way to create marketing content. Generate 3 versions, choose your favorite, publish instantly.', 'Transform your marketing with AI. BeHeard generates engaging content tailored to your brand voice. Instagram, Facebook, Email, and more.', 'Professional content in seconds. BeHeard AI uses advanced language models to create content that resonates with your audience.'],
    engagement: 0,
    impressions: 0,
    reach: 0
  },
  {
    type: 'Social Post',
    platform: 'facebook',
    status: 'draft',
    body: ['Just launched our new dashboard! Better stats, faster publishing, and smarter content recommendations. #BeHeard #MarketingTools', 'Your feedback shaped this update. Check out the new features we built based on what you asked for! #ProductUpdate #Grateful', 'Dashboard 2.0 is here! Cleaner interface, faster performance, and more insights. Update now!'],
    engagement: 0,
    impressions: 0,
    reach: 0
  },
  {
    type: 'Email',
    platform: 'email',
    status: 'draft',
    body: ['Subject: Your Content Calendar is Ready\n\nHi [Name],\n\nWe\'ve pre-filled your content calendar...', 'Subject: Quick Tip: How to Write Better CTAs\n\nHello,\n\nA strong call-to-action can increase...', 'Subject: Case Study: How [Brand] 3x Their Engagement\n\nDear [Name],\n\nWe\'re excited to share...'],
    engagement: 0,
    impressions: 0,
    reach: 0
  },
  {
    type: 'Ad Copy',
    platform: 'instagram',
    status: 'draft',
    body: ['Stop wasting time on content. Start creating with AI. BeHeard makes it easy. Try free!', 'Your competitors are using AI. Are you? Join the content revolution with BeHeard.', 'Content that converts. Powered by AI. Trusted by creators. BeHeard.'],
    engagement: 0,
    impressions: 0,
    reach: 0
  },
  {
    type: 'Blog',
    platform: 'website',
    status: 'draft',
    body: ['The Complete Guide to AI-Powered Content Marketing in 2024', 'How to Choose the Right Content AI Tool for Your Brand', 'Measuring Content ROI: Metrics That Matter'],
    engagement: 0,
    impressions: 0,
    reach: 0
  },
  {
    type: 'Thread',
    platform: 'twitter',
    status: 'draft',
    body: ['🧵 The Real Cost of Manual Content Creation\n\n1/ Let\'s talk about time...', '🧵 AI Content: Myth vs Reality\n\n1/ Myth: AI content is robotic...', '🧵 How to Leverage AI Without Losing Your Brand Voice\n\n1/ The biggest fear...'],
    engagement: 0,
    impressions: 0,
    reach: 0
  },
  {
    type: 'Reel Script',
    platform: 'instagram',
    status: 'draft',
    body: ['[0s] "Before BeHeard: 8 hours of content creation"\n[4s] "After BeHeard: 15 minutes"\n[8s] "The difference? AI"\n[12s] "Try it free"', '[0s] "Content creators hate this one trick"\n[3s] "Actually, they love it"\n[6s] "It\'s called BeHeard"\n[9s] "Generate content instantly"', '[0s] "This is what AI content looks like now"\n[3s] "Professional. On-brand. Instant."\n[6s] "Welcome to the future"\n[9s] "BeHeard AI"'],
    engagement: 0,
    impressions: 0,
    reach: 0
  },
  {
    type: 'Carousel',
    platform: 'facebook',
    status: 'draft',
    body: ['Slide 1: "Content Creation Made Easy"\nSlide 2: "AI-Powered Generation"\nSlide 3: "3 Versions Instantly"\nSlide 4: "Professional Images"\nSlide 5: "Schedule & Publish"', 'Slide 1: "Meet Your New Content Team"\nSlide 2: "Powered by Advanced AI"\nSlide 3: "Trained on Your Brand"\nSlide 4: "Always On-Brand"\nSlide 5: "Get Started Free"', 'Slide 1: "The Future of Marketing"\nSlide 2: "Is Here"\nSlide 3: "With BeHeard"\nSlide 4: "AI Content Generation"\nSlide 5: "Try Now"'],
    engagement: 0,
    impressions: 0,
    reach: 0
  }
];

function seedContent() {
  try {
    initializeDatabase();

    // Get demo user and brand
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@beheard.ai');
    const brand = db.prepare('SELECT id FROM brands WHERE user_id = ?').get(user.id);

    if (!user || !brand) {
      console.error('Demo user or brand not found');
      return;
    }

    // Check if content already exists
    const existing = db.prepare('SELECT COUNT(*) as count FROM content WHERE brand_id = ?').get(brand.id);
    if (existing.count > 0) {
      console.log('✓ Content already seeded');
      return;
    }

    // Insert 15 content pieces
    sampleContent.forEach((item, index) => {
      const contentId = randomUUID();
      const scheduledFor = item.status === 'scheduled' 
        ? new Date(Date.now() + (index + 1) * 3600000).toISOString()
        : null;

      db.prepare(`
        INSERT INTO content (
          id, brand_id, user_id, type, platform, body, status, 
          scheduled_for, performance, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        contentId,
        brand.id,
        user.id,
        item.type,
        item.platform,
        JSON.stringify(item.body),
        item.status,
        scheduledFor,
        JSON.stringify({
          engagement: item.engagement,
          impressions: item.impressions,
          reach: item.reach,
          engagement_rate: item.impressions > 0 ? ((item.engagement / item.impressions) * 100).toFixed(2) : 0
        })
      );
    });

    console.log('✓ Seeded 15 content pieces');
    console.log('  - 5 published with metrics');
    console.log('  - 5 scheduled');
    console.log('  - 5 drafts');
  } catch (err) {
    console.error('Seed content error:', err);
    process.exit(1);
  }
}

seedContent();
