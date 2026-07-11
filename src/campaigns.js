import { randomUUID } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { Campaign, Brand, Content } from './models/index.js';
import { buildBrandSystemPrompt } from './brandBrain.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateCampaignPlan(req, res) {
  try {
    const { brandId, name, objective, startDate, endDate, budget, channels, frequency } = req.body;
    const userId = req.userId;

    const brand = await Brand.findOne({ id: brandId, user_id: userId }).lean();
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    const brandData = {
      name: brand.name,
      voice: brand.voice_description,
      audience: brand.target_audience,
      industry: brand.industry
    };

    const prompt = `You are a marketing strategist for ${brandData.name}, a ${brandData.industry} brand.

Brand Voice: ${brandData.voice}
Target Audience: ${brandData.audience}

Create a comprehensive ${objective} campaign plan for:
- Campaign Name: ${name}
- Duration: ${startDate} to ${endDate}
- Budget: $${budget}
- Channels: ${channels.join(', ')}
- Frequency: ${frequency}

Generate a JSON response with:
{
  "strategy": "Overall strategy description",
  "key_messages": ["message1", "message2", "message3"],
  "content_plan": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "platform": "instagram|facebook|twitter|linkedin|email|blog",
      "type": "Social Post|Blog|Email|Ad Copy|Thread|Reel Script",
      "topic": "content topic",
      "brief": "brief description",
      "time": "HH:MM",
      "generate_image": true|false
    }
  ],
  "kpis": {
    "metric1": "target1",
    "metric2": "target2"
  }
}

Generate exactly 5 content items across the campaign period. Ensure variety in platforms and content types. Keep each brief to one short sentence. Return ONLY the JSON object, no markdown fences or extra text.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 6000,
      messages: [{ role: 'user', content: prompt }]
    });

    let plan;
    try {
      const jsonMatch = message.content[0].text.match(/\{[\s\S]*\}/);
      plan = JSON.parse(jsonMatch[0]);
    } catch {
      return res.status(500).json({ error: 'Failed to parse campaign plan' });
    }

    res.json({
      strategy: plan.strategy,
      key_messages: plan.key_messages,
      content_plan: plan.content_plan,
      kpis: plan.kpis
    });
  } catch (err) {
    console.error('Generate campaign plan error:', err);
    res.status(500).json({ error: 'Failed to generate campaign plan' });
  }
}

export async function createCampaign(req, res) {
  try {
    const { brandId, name, objective, startDate, endDate, budget, channels, frequency, strategy, key_messages, content_plan, kpis } = req.body;
    const userId = req.userId;

    const campaignId = randomUUID();

    await Campaign.create({
      id: campaignId,
      brand_id: brandId,
      user_id: userId,
      name,
      objective,
      start_date: startDate,
      end_date: endDate,
      budget,
      channels: channels || [],
      frequency,
      strategy,
      key_messages: key_messages || [],
      content_plan: content_plan || [],
      kpis: kpis || {},
      status: 'active'
    });

    res.json({ id: campaignId, status: 'active' });
  } catch (err) {
    console.error('Create campaign error:', err);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
}

export async function getCampaigns(req, res) {
  try {
    const userId = req.userId;
    const campaigns = await Campaign.find({ user_id: userId }).sort({ created_at: -1 }).lean();
    res.json(campaigns);
  } catch (err) {
    console.error('Get campaigns error:', err);
    res.status(500).json({ error: 'Failed to get campaigns' });
  }
}

export async function getCampaignById(req, res) {
  try {
    const { campaignId } = req.params;
    const userId = req.userId;

    const campaign = await Campaign.findOne({ id: campaignId, user_id: userId }).lean();
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    campaign.content = await Content.find({ campaign_id: campaignId }).lean();

    res.json(campaign);
  } catch (err) {
    console.error('Get campaign error:', err);
    res.status(500).json({ error: 'Failed to get campaign' });
  }
}

export async function generateCampaignContent(req, res) {
  try {
    const { campaignId } = req.params;
    const userId = req.userId;

    const campaign = await Campaign.findOne({ id: campaignId, user_id: userId }).lean();
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const contentPlan = Array.isArray(campaign.content_plan) ? campaign.content_plan : [];

    const results = [];
    let generated = 0;

    for (const item of contentPlan) {
      try {
        generated++;

        const textPrompt = `Generate a ${item.type} for ${item.platform}. Topic: ${item.topic}. Brief: ${item.brief}. Generate 3 versions separated by ===VERSION===.`;

        const textMessage = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          messages: [{ role: 'user', content: textPrompt }]
        });

        const versions = textMessage.content[0].text.split('===VERSION===').map(v => v.trim()).filter(v => v);

        const contentId = randomUUID();
        const scheduledFor = new Date(`${item.date}T${item.time}:00Z`);

        await Content.create({
          id: contentId,
          brand_id: campaign.brand_id,
          user_id: userId,
          campaign_id: campaignId,
          type: item.type,
          platform: item.platform,
          body: versions,
          status: 'scheduled',
          scheduled_for: scheduledFor,
          media_brief: item.brief
        });

        results.push({
          contentId,
          platform: item.platform,
          type: item.type,
          status: 'generated',
          progress: `${generated} of ${contentPlan.length}`
        });
      } catch (err) {
        console.error(`Failed to generate content for ${item.topic}:`, err);
        results.push({
          platform: item.platform,
          status: 'failed',
          error: err.message
        });
      }
    }

    await Campaign.updateOne({ id: campaignId }, { $set: { status: 'launched' } });

    res.json({
      success: true,
      generated,
      total: contentPlan.length,
      results
    });
  } catch (err) {
    console.error('Generate campaign content error:', err);
    res.status(500).json({ error: 'Failed to generate campaign content' });
  }
}

export async function getCalendarEvents(req, res) {
  try {
    const userId = req.userId;
    const { startDate, endDate } = req.query;

    const filter = { user_id: userId, scheduled_for: { $ne: null } };
    if (startDate && endDate) {
      filter.scheduled_for = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const events = await Content.find(filter).sort({ scheduled_for: 1 }).lean();

    // Attach brand_name to each event
    const brandIds = [...new Set(events.map(e => e.brand_id).filter(Boolean))];
    const brands = await Brand.find({ id: { $in: brandIds } }).select('id name -_id').lean();
    const brandNameById = Object.fromEntries(brands.map(b => [b.id, b.name]));

    const enriched = events.map(e => ({ ...e, brand_name: brandNameById[e.brand_id] || null }));

    res.json(enriched);
  } catch (err) {
    console.error('Get calendar events error:', err);
    res.status(500).json({ error: 'Failed to get calendar events' });
  }
}

export async function updateCalendarEvent(req, res) {
  try {
    const { contentId } = req.params;
    const userId = req.userId;
    const { scheduledFor, status } = req.body;

    const content = await Content.findOne({ id: contentId, user_id: userId }).select('id').lean();
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const set = {};
    if (scheduledFor !== undefined) set.scheduled_for = scheduledFor;
    if (status !== undefined) set.status = status;

    if (Object.keys(set).length === 0) {
      return res.json({ id: contentId });
    }

    await Content.updateOne({ id: contentId }, { $set: set });

    res.json({ id: contentId });
  } catch (err) {
    console.error('Update calendar event error:', err);
    res.status(500).json({ error: 'Failed to update event' });
  }
}
