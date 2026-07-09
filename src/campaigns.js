import { randomUUID } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import db from './db.js';
import { buildBrandSystemPrompt } from './brandBrain.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateCampaignPlan(req, res) {
  try {
    const { brandId, name, objective, startDate, endDate, budget, channels, frequency } = req.body;
    const userId = req.userId;

    // Get brand details
    const brand = db.prepare('SELECT * FROM brands WHERE id = ? AND user_id = ?').get(brandId, userId);
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    // Build comprehensive system prompt from brand profile
    const systemPrompt = buildBrandSystemPrompt(brand);

    // Generate campaign plan via Claude
    const prompt = `Create a comprehensive ${objective} campaign plan for:
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

Generate 10-15 content items across the campaign period. Ensure variety in platforms and content types.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
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

export function createCampaign(req, res) {
  try {
    const { brandId, name, objective, startDate, endDate, budget, channels, frequency, strategy, key_messages, content_plan, kpis } = req.body;
    const userId = req.userId;

    const campaignId = randomUUID();
    
    db.prepare(`
      INSERT INTO campaigns (
        id, brand_id, user_id, name, objective, start_date, end_date, 
        budget, channels, frequency, strategy, key_messages, content_plan, kpis, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      campaignId,
      brandId,
      userId,
      name,
      objective,
      startDate,
      endDate,
      budget,
      JSON.stringify(channels),
      frequency,
      strategy,
      JSON.stringify(key_messages),
      JSON.stringify(content_plan),
      JSON.stringify(kpis),
      'active'
    );

    res.json({ id: campaignId, status: 'active' });
  } catch (err) {
    console.error('Create campaign error:', err);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
}

export function getCampaigns(req, res) {
  try {
    const userId = req.userId;
    const campaigns = db.prepare('SELECT * FROM campaigns WHERE user_id = ? ORDER BY created_at DESC').all(userId);

    const parsed = campaigns.map(c => ({
      ...c,
      channels: JSON.parse(c.channels),
      key_messages: JSON.parse(c.key_messages),
      content_plan: JSON.parse(c.content_plan),
      kpis: JSON.parse(c.kpis)
    }));

    res.json(parsed);
  } catch (err) {
    console.error('Get campaigns error:', err);
    res.status(500).json({ error: 'Failed to get campaigns' });
  }
}

export function getCampaignById(req, res) {
  try {
    const { campaignId } = req.params;
    const userId = req.userId;

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND user_id = ?').get(campaignId, userId);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    campaign.channels = JSON.parse(campaign.channels);
    campaign.key_messages = JSON.parse(campaign.key_messages);
    campaign.content_plan = JSON.parse(campaign.content_plan);
    campaign.kpis = JSON.parse(campaign.kpis);

    // Get linked content
    const content = db.prepare('SELECT * FROM content WHERE campaign_id = ?').all(campaignId);
    campaign.content = content.map(c => ({
      ...c,
      body: JSON.parse(c.body),
      hashtags: JSON.parse(c.hashtags),
      performance: JSON.parse(c.performance)
    }));

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

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND user_id = ?').get(campaignId, userId);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(campaign.brand_id);
    const contentPlan = JSON.parse(campaign.content_plan);

    const results = [];
    let generated = 0;

    for (const item of contentPlan) {
      try {
        generated++;
        
        // Generate text via Claude
        const textPrompt = `Generate a ${item.type} for ${item.platform}. Topic: ${item.topic}. Brief: ${item.brief}. Generate 3 versions separated by ===VERSION===.`;
        
        const textMessage = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          messages: [{ role: 'user', content: textPrompt }]
        });

        const versions = textMessage.content[0].text.split('===VERSION===').map(v => v.trim()).filter(v => v);

        // Create content item
        const contentId = randomUUID();
        const scheduledFor = new Date(`${item.date}T${item.time}:00Z`).toISOString();

        db.prepare(`
          INSERT INTO content (
            id, brand_id, user_id, campaign_id, type, platform, body, 
            status, scheduled_for, media_brief
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          contentId,
          campaign.brand_id,
          userId,
          campaignId,
          item.type,
          item.platform,
          JSON.stringify(versions),
          'scheduled',
          scheduledFor,
          item.brief
        );

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

    // Update campaign status
    db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run('launched', campaignId);

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

export function getCalendarEvents(req, res) {
  try {
    const userId = req.userId;
    const { startDate, endDate } = req.query;

    let query = `
      SELECT c.*, b.name as brand_name 
      FROM content c
      JOIN brands b ON c.brand_id = b.id
      WHERE c.user_id = ? AND c.scheduled_for IS NOT NULL
    `;
    const params = [userId];

    if (startDate && endDate) {
      query += ` AND c.scheduled_for BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    }

    query += ` ORDER BY c.scheduled_for ASC`;

    const events = db.prepare(query).all(...params);

    const parsed = events.map(e => ({
      ...e,
      body: JSON.parse(e.body),
      hashtags: JSON.parse(e.hashtags)
    }));

    res.json(parsed);
  } catch (err) {
    console.error('Get calendar events error:', err);
    res.status(500).json({ error: 'Failed to get calendar events' });
  }
}

export function updateCalendarEvent(req, res) {
  try {
    const { contentId } = req.params;
    const userId = req.userId;
    const { scheduledFor, status } = req.body;

    const content = db.prepare('SELECT id FROM content WHERE id = ? AND user_id = ?').get(contentId, userId);
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const updates = [];
    const values = [];

    if (scheduledFor !== undefined) {
      updates.push('scheduled_for = ?');
      values.push(scheduledFor);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }

    if (updates.length === 0) {
      return res.json({ id: contentId });
    }

    values.push(contentId);
    db.prepare(`UPDATE content SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    res.json({ id: contentId });
  } catch (err) {
    console.error('Update calendar event error:', err);
    res.status(500).json({ error: 'Failed to update event' });
  }
}
