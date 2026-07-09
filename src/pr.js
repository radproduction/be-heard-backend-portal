import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import db from './db.js';
import { buildBrandSystemPrompt } from './brandBrain.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PR_TYPES = {
  'press-release': 'Press Release',
  'media-pitch': 'Media Pitch',
  'brand-story': 'Brand Story',
  'crisis': 'Crisis Statement',
  'thought-leadership': 'Thought Leadership Article'
};

export async function generatePR(req, res) {
  try {
    const { brandId, type, topic, keyFacts, spokesperson, targetMedia } = req.body;
    const userId = req.userId;

    if (!PR_TYPES[type]) {
      return res.status(400).json({ error: 'Invalid PR type' });
    }

    // Get brand
    const brand = db.prepare('SELECT * FROM brands WHERE id = ? AND user_id = ?').get(brandId, userId);
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    // Build comprehensive system prompt from brand profile
    const systemPrompt = buildBrandSystemPrompt(brand) + '\n\nYou are a professional PR writer.';

    // Generate PR via Claude
    const prompt = `Generate a professional ${PR_TYPES[type]} about:
Topic: ${topic}
Key Facts: ${keyFacts}
Spokesperson: ${spokesperson}

Format it properly with:
- Headline (if Press Release/Media Pitch)
- Subheading
- Opening paragraph (hook)
- Body (3-4 paragraphs)
- Closing/Call to action
- Boilerplate about ${brandData.name}

Then, suggest 5 media outlets that would be interested in this story. Return as JSON:
{
  "content": "full PR text here",
  "outlets": [
    { "name": "outlet name", "type": "publication type", "focus": "why relevant" },
    ...
  ]
}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }]
    });

    let result;
    try {
      const jsonMatch = message.content[0].text.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch[0]);
    } catch {
      result = {
        content: message.content[0].text,
        outlets: []
      };
    }

    // Save to database
    const prId = randomUUID();
    db.prepare(`
      INSERT INTO pr_pieces (
        id, brand_id, user_id, type, title, body, target_outlets, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      prId,
      brandId,
      userId,
      type,
      topic,
      result.content,
      JSON.stringify(result.outlets || []),
      'draft'
    );

    res.json({
      id: prId,
      type,
      topic,
      content: result.content,
      outlets: result.outlets || []
    });
  } catch (err) {
    console.error('Generate PR error:', err);
    res.status(500).json({ error: 'Failed to generate PR' });
  }
}

export function getPRPieces(req, res) {
  try {
    const userId = req.userId;
    const { type, status } = req.query;

    let query = 'SELECT * FROM pr_pieces WHERE user_id = ?';
    const params = [userId];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const pieces = db.prepare(query).all(...params);

    const parsed = pieces.map(p => ({
      ...p,
      target_outlets: JSON.parse(p.target_outlets)
    }));

    res.json(parsed);
  } catch (err) {
    console.error('Get PR pieces error:', err);
    res.status(500).json({ error: 'Failed to get PR pieces' });
  }
}

export function getPRById(req, res) {
  try {
    const { prId } = req.params;
    const userId = req.userId;

    const pr = db.prepare('SELECT * FROM pr_pieces WHERE id = ? AND user_id = ?').get(prId, userId);
    if (!pr) {
      return res.status(404).json({ error: 'PR piece not found' });
    }

    pr.target_outlets = JSON.parse(pr.target_outlets);
    res.json(pr);
  } catch (err) {
    console.error('Get PR error:', err);
    res.status(500).json({ error: 'Failed to get PR piece' });
  }
}

export function updatePR(req, res) {
  try {
    const { prId } = req.params;
    const userId = req.userId;
    const { body, status } = req.body;

    const pr = db.prepare('SELECT id FROM pr_pieces WHERE id = ? AND user_id = ?').get(prId, userId);
    if (!pr) {
      return res.status(404).json({ error: 'PR piece not found' });
    }

    const updates = [];
    const values = [];

    if (body !== undefined) {
      updates.push('body = ?');
      values.push(body);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }

    if (updates.length === 0) {
      return res.json({ id: prId });
    }

    values.push(prId);
    db.prepare(`UPDATE pr_pieces SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    res.json({ id: prId });
  } catch (err) {
    console.error('Update PR error:', err);
    res.status(500).json({ error: 'Failed to update PR piece' });
  }
}

export function deletePR(req, res) {
  try {
    const { prId } = req.params;
    const userId = req.userId;

    const pr = db.prepare('SELECT id FROM pr_pieces WHERE id = ? AND user_id = ?').get(prId, userId);
    if (!pr) {
      return res.status(404).json({ error: 'PR piece not found' });
    }

    db.prepare('DELETE FROM pr_pieces WHERE id = ?').run(prId);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete PR error:', err);
    res.status(500).json({ error: 'Failed to delete PR piece' });
  }
}
