import db from './db.js';
import { randomUUID } from 'crypto';

const userId = 'demo-user-1';
const brandId = 'brand-1';

function seedPRPieces() {
  console.log('✓ Database initialized');

  const prPieces = [
    {
      type: 'press-release',
      title: 'Rad Launches Revolutionary AI-Powered Marketing Platform',
      body: `FOR IMMEDIATE RELEASE

Rad Unveils BeHeard: The AI-Powered Marketing Platform Transforming Brand Communication

Dubai, UAE – Rad, a leading technology solutions provider, today announced the launch of BeHeard, an innovative AI-powered marketing platform designed to help brands create, schedule, and publish content across multiple channels with unprecedented ease and intelligence.

BeHeard combines advanced artificial intelligence with intuitive design to streamline the entire content creation workflow. From AI-generated copy to intelligent image creation, the platform empowers marketing teams to produce professional-quality content in minutes, not hours.

"BeHeard represents our commitment to democratizing advanced marketing technology," said Aamir, Founder & COO of Rad. "We've built a platform that doesn't just save time—it amplifies creativity and strategic thinking."

Key Features:
- AI-powered content generation using Claude and Gemini
- Real-time publishing to Instagram and Facebook
- Intelligent campaign planning and execution
- Comprehensive analytics with real Meta Insights data
- Creative studio for visual content generation
- PR writing and media outreach tools

BeHeard is now available for early access. Learn more at beheard.io

About Rad:
Rad is a technology-driven company providing innovative business solutions to startups and enterprises across the UAE and beyond.

###`,
      target_outlets: JSON.stringify([
        { name: 'TechCrunch', type: 'Tech News', focus: 'AI and marketing innovation' },
        { name: 'Marketing Dive', type: 'Industry Publication', focus: 'Marketing automation' },
        { name: 'Entrepreneur Middle East', type: 'Business Magazine', focus: 'Startup innovation' },
        { name: 'Arabian Business', type: 'Business News', focus: 'UAE tech startups' },
        { name: 'Forbes Middle East', type: 'Business Magazine', focus: 'Innovation and leadership' }
      ]),
      status: 'published'
    },
    {
      type: 'media-pitch',
      title: 'Why Every Marketing Team Needs AI-Powered Content Creation',
      body: `Subject: Story Idea: The Future of Marketing is AI-Powered

Dear [Editor Name],

I'm reaching out with a compelling story idea that I believe would resonate with your audience.

STORY IDEA: "The AI Revolution in Marketing: How Brands Are Staying Ahead of the Curve"

In today's fast-paced digital landscape, marketing teams are drowning in content demands. Social media, email, blogs, ads—the channels multiply, but the time and resources don't.

Enter AI-powered content creation. Platforms like BeHeard are changing the game by enabling teams to:

1. Generate 3 versions of every piece of content for A/B testing
2. Create professional images in seconds using advanced generative AI
3. Plan entire campaigns with AI-suggested strategies
4. Publish directly to multiple platforms with one click
5. Track real performance metrics across channels

This isn't science fiction—it's happening now. And it's reshaping how forward-thinking brands compete.

ANGLE: Interview with Aamir, Founder & COO of Rad, on how AI is democratizing professional marketing and what it means for the industry.

KEY TALKING POINTS:
- AI is not replacing marketers; it's amplifying their capabilities
- Real data integration (Meta Insights) provides actionable intelligence
- The future belongs to teams that embrace AI tools
- Smaller brands can now compete with enterprise-level resources

I'd love to discuss this further and arrange an interview. Aamir is available for a call this week.

Best regards,
[Your Name]`,
      target_outlets: JSON.stringify([
        { name: 'Marketing Dive', type: 'Industry Publication', focus: 'Marketing trends' },
        { name: 'AdWeek', type: 'Advertising News', focus: 'Marketing innovation' },
        { name: 'Content Marketing Institute', type: 'Industry Resource', focus: 'Content strategy' },
        { name: 'HubSpot Blog', type: 'Industry Blog', focus: 'Marketing tools' },
        { name: 'Forrester', type: 'Research Firm', focus: 'Marketing technology' }
      ]),
      status: 'published'
    },
    {
      type: 'brand-story',
      title: 'The Rad Story: From Idea to Impact',
      body: `THE RAD STORY: Transforming Ideas Into Profitable Products

Every great company starts with a problem. For Rad, it was this: Why do brilliant ideas struggle to become successful products?

THE BEGINNING

With 15+ years of experience in project management and marketing, our founder Aamir saw the pattern repeatedly. Talented teams had innovative ideas, but lacked the tools, strategy, or execution framework to bring them to market successfully.

In 2015, Rad was born with a simple mission: Help startups and SMEs transform ideas into profitable, scalable products.

THE JOURNEY

Since then, Rad has:
- Spearheaded the creation and launch of 55+ startups
- Developed 12 SaaS products
- Generated over $3 million in revenue for clients
- Delivered cutting-edge digital solutions for multinational brands

From PopVapor to LiggityBrands, from AiGenix to BeHeard—each project taught us something new about what it takes to succeed in the digital age.

THE PHILOSOPHY

We believe in three core principles:

1. INNOVATION FIRST: Technology should solve real problems, not create new ones.
2. PEOPLE MATTER: The best products are built by diverse, talented teams who care deeply about their work.
3. IMPACT OVER HYPE: We measure success not by vanity metrics, but by real business results.

THE FUTURE

Today, BeHeard represents the culmination of everything we've learned. It's not just a tool—it's a philosophy. A commitment to democratizing access to enterprise-grade marketing technology.

We're just getting started. The best is yet to come.

Welcome to Rad. Welcome to BeHeard.`,
      target_outlets: JSON.stringify([
        { name: 'Entrepreneur', type: 'Business Magazine', focus: 'Founder stories' },
        { name: 'Forbes', type: 'Business Magazine', focus: 'Leadership' },
        { name: 'Inc.', type: 'Business Magazine', focus: 'Startup stories' },
        { name: 'Medium', type: 'Publishing Platform', focus: 'Thought leadership' },
        { name: 'LinkedIn News', type: 'Social Platform', focus: 'Professional insights' }
      ]),
      status: 'draft'
    },
    {
      type: 'thought-leadership',
      title: 'The AI-First Marketing Mindset: What Leaders Need to Know',
      body: `THE AI-FIRST MARKETING MINDSET: What Leaders Need to Know in 2024

The question is no longer "Should we use AI in marketing?" It's "How do we build an AI-first marketing strategy?"

This shift represents one of the most significant transformations in marketing since the rise of digital advertising. And leaders who understand it will thrive. Those who don't will be left behind.

THE CURRENT STATE

We're at an inflection point. AI tools are no longer experimental—they're essential. From content generation to analytics, AI is becoming the backbone of modern marketing operations.

But here's what many leaders miss: It's not about the technology. It's about the mindset.

THE AI-FIRST MINDSET

An AI-first marketing mindset means:

1. SPEED OVER PERFECTION: AI enables rapid iteration. Test more, learn faster, optimize continuously.

2. DATA-DRIVEN DECISIONS: AI excels at pattern recognition. Use it to uncover insights humans might miss.

3. HUMAN + MACHINE: The best results come from combining AI efficiency with human creativity and judgment.

4. CONTINUOUS LEARNING: AI models improve with more data. Build systems that learn and adapt over time.

5. ETHICAL RESPONSIBILITY: With great power comes great responsibility. Use AI transparently and ethically.

THE PRACTICAL IMPLICATIONS

For marketing leaders, this means:

- Invest in AI tools that integrate with your existing tech stack
- Train your team to work alongside AI, not fear it
- Focus on strategy and creativity—let AI handle the repetitive work
- Measure everything; optimize relentlessly
- Stay curious and adaptable

THE OPPORTUNITY

Brands that embrace an AI-first mindset will:
- Launch campaigns 3x faster
- Test more variations and find winners quicker
- Allocate budgets more efficiently
- Deliver more personalized experiences
- Scale operations without proportional cost increases

THE CHALLENGE

The challenge isn't technology—it's culture. It's helping teams see AI as a partner, not a threat. It's building systems and processes that leverage AI's strengths while preserving human judgment.

THE FUTURE

In five years, "AI-powered marketing" won't be a differentiator—it will be table stakes. The question won't be whether you use AI. It will be how well you use it.

Leaders who start building an AI-first mindset today will be the ones writing the rules tomorrow.

The future of marketing is AI-first. The question is: Are you ready?`,
      target_outlets: JSON.stringify([
        { name: 'Harvard Business Review', type: 'Business Magazine', focus: 'Leadership' },
        { name: 'McKinsey & Company', type: 'Consulting Firm', focus: 'Business strategy' },
        { name: 'Gartner', type: 'Research Firm', focus: 'Marketing trends' },
        { name: 'Deloitte Insights', type: 'Consulting Firm', focus: 'Digital transformation' },
        { name: 'World Economic Forum', type: 'Think Tank', focus: 'Future of work' }
      ]),
      status: 'draft'
    }
  ];

  prPieces.forEach(piece => {
    const prId = randomUUID();
    db.prepare(`
      INSERT INTO pr_pieces (
        id, brand_id, user_id, type, title, body, target_outlets, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      prId,
      brandId,
      userId,
      piece.type,
      piece.title,
      piece.body,
      piece.target_outlets,
      piece.status,
      new Date().toISOString()
    );
    console.log(`✓ Seeded PR: ${piece.title}`);
  });

  console.log('✓ Seeded 4 PR pieces');
}

try {
  seedPRPieces();
} catch (err) {
  console.error('Seed PR error:', err.message);
}
