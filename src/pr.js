import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { PRPiece, Brand } from './models/index.js';
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

    const brand = await Brand.findOne({ id: brandId, user_id: userId }).lean();
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    const brandData = {
      name: brand.name,
      voice: brand.voice_description,
      industry: brand.industry
    };

    const prompt = `You are a professional PR writer for ${brandData.name}, a ${brandData.industry} company with this voice: ${brandData.voice}.

Generate a professional ${PR_TYPES[type]} about:
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
      system: buildBrandSystemPrompt(brand),
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

    const prId = randomUUID();
    await PRPiece.create({
      id: prId,
      brand_id: brandId,
      user_id: userId,
      type,
      title: topic,
      body: result.content,
      target_outlets: result.outlets || [],
      status: 'draft'
    });

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

export async function getPRPieces(req, res) {
  try {
    const userId = req.userId;
    const { type, status } = req.query;

    const filter = { user_id: userId };
    if (type) filter.type = type;
    if (status) filter.status = status;

    const pieces = await PRPiece.find(filter).sort({ created_at: -1 }).lean();
    res.json(pieces);
  } catch (err) {
    console.error('Get PR pieces error:', err);
    res.status(500).json({ error: 'Failed to get PR pieces' });
  }
}

export async function getPRById(req, res) {
  try {
    const { prId } = req.params;
    const userId = req.userId;

    const pr = await PRPiece.findOne({ id: prId, user_id: userId }).lean();
    if (!pr) {
      return res.status(404).json({ error: 'PR piece not found' });
    }

    res.json(pr);
  } catch (err) {
    console.error('Get PR error:', err);
    res.status(500).json({ error: 'Failed to get PR piece' });
  }
}

export async function updatePR(req, res) {
  try {
    const { prId } = req.params;
    const userId = req.userId;
    const { body, status } = req.body;

    const pr = await PRPiece.findOne({ id: prId, user_id: userId }).select('id').lean();
    if (!pr) {
      return res.status(404).json({ error: 'PR piece not found' });
    }

    const set = {};
    if (body !== undefined) set.body = body;
    if (status !== undefined) set.status = status;

    if (Object.keys(set).length === 0) {
      return res.json({ id: prId });
    }

    await PRPiece.updateOne({ id: prId }, { $set: set });

    res.json({ id: prId });
  } catch (err) {
    console.error('Update PR error:', err);
    res.status(500).json({ error: 'Failed to update PR piece' });
  }
}

export async function deletePR(req, res) {
  try {
    const { prId } = req.params;
    const userId = req.userId;

    const pr = await PRPiece.findOne({ id: prId, user_id: userId }).select('id').lean();
    if (!pr) {
      return res.status(404).json({ error: 'PR piece not found' });
    }

    await PRPiece.deleteOne({ id: prId });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete PR error:', err);
    res.status(500).json({ error: 'Failed to delete PR piece' });
  }
}
