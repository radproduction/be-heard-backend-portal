import { randomUUID } from 'crypto';
import { Brand } from './models/index.js';

export async function createBrand(req, res) {
  try {
    const { name, industry, colors, voiceDescription, targetAudience, competitors, sampleContent } = req.body;
    const userId = req.userId;

    const brandId = randomUUID();

    await Brand.create({
      id: brandId,
      user_id: userId,
      name,
      industry,
      colors: colors || { primary: '#BFFF00', secondary: '#0a0a0a' },
      voice_description: voiceDescription,
      target_audience: targetAudience,
      competitors: competitors || [],
      sample_content: sampleContent
    });

    res.json({ id: brandId, name, industry });
  } catch (err) {
    console.error('Create brand error:', err);
    res.status(500).json({ error: 'Failed to create brand' });
  }
}

export async function getBrands(req, res) {
  try {
    const userId = req.userId;
    const brands = await Brand.find({ user_id: userId, active: 1 })
      .sort({ created_at: -1 })
      .lean();

    res.json(brands);
  } catch (err) {
    console.error('Get brands error:', err);
    res.status(500).json({ error: 'Failed to get brands' });
  }
}

export async function getBrand(req, res) {
  try {
    const { brandId } = req.params;
    const userId = req.userId;

    const brand = await Brand.findOne({ id: brandId, user_id: userId }).lean();
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    res.json(brand);
  } catch (err) {
    console.error('Get brand error:', err);
    res.status(500).json({ error: 'Failed to get brand' });
  }
}

export async function updateBrand(req, res) {
  try {
    const { brandId } = req.params;
    const userId = req.userId;
    const updates = req.body;

    const brand = await Brand.findOne({ id: brandId, user_id: userId }).select('id').lean();
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    const set = {};
    if (updates.name) set.name = updates.name;
    if (updates.colors) set.colors = updates.colors;
    if (updates.voiceDescription) set.voice_description = updates.voiceDescription;
    if (updates.targetAudience) set.target_audience = updates.targetAudience;
    if (updates.competitors) set.competitors = updates.competitors;
    if (updates.logoUrl) set.logo_url = updates.logoUrl;
    if (updates.metaPageId) set.meta_page_id = updates.metaPageId;
    if (updates.metaPageToken) set.meta_page_token = updates.metaPageToken;
    if (updates.metaIgAccountId) set.meta_ig_account_id = updates.metaIgAccountId;

    if (Object.keys(set).length === 0) {
      return res.json({ id: brandId });
    }

    await Brand.updateOne({ id: brandId }, { $set: set });

    res.json({ id: brandId });
  } catch (err) {
    console.error('Update brand error:', err);
    res.status(500).json({ error: 'Failed to update brand' });
  }
}
