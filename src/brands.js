import { randomUUID } from 'crypto';
import db from './db.js';
import { scrapeBrandSite, prefillBrandProfile, generateBrandProfile } from './brandBrain.js';

export function createBrand(req, res) {
  try {
    const { name, industry, colors, voiceDescription, targetAudience, competitors, sampleContent } = req.body;
    const userId = req.userId;

    const brandId = randomUUID();
    
    db.prepare(`
      INSERT INTO brands (
        id, user_id, name, industry, colors, voice_description, 
        target_audience, competitors, sample_content
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      brandId,
      userId,
      name,
      industry,
      JSON.stringify(colors || { primary: '#BFFF00', secondary: '#0a0a0a' }),
      voiceDescription,
      targetAudience,
      JSON.stringify(competitors || []),
      sampleContent
    );

    res.json({ id: brandId, name, industry });
  } catch (err) {
    console.error('Create brand error:', err);
    res.status(500).json({ error: 'Failed to create brand' });
  }
}

export function getBrands(req, res) {
  try {
    const userId = req.userId;
    const brands = db.prepare('SELECT * FROM brands WHERE user_id = ? AND active = 1').all(userId);
    
    const parsed = brands.map(b => ({
      ...b,
      colors: JSON.parse(b.colors),
      competitors: JSON.parse(b.competitors),
      contentPreferences: JSON.parse(b.content_preferences)
    }));

    res.json(parsed);
  } catch (err) {
    console.error('Get brands error:', err);
    res.status(500).json({ error: 'Failed to get brands' });
  }
}

export function getBrand(req, res) {
  try {
    const { brandId } = req.params;
    const userId = req.userId;

    const brand = db.prepare('SELECT * FROM brands WHERE id = ? AND user_id = ?').get(brandId, userId);
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    brand.colors = JSON.parse(brand.colors);
    brand.competitors = JSON.parse(brand.competitors);
    brand.contentPreferences = JSON.parse(brand.content_preferences);

    res.json(brand);
  } catch (err) {
    console.error('Get brand error:', err);
    res.status(500).json({ error: 'Failed to get brand' });
  }
}

export function updateBrand(req, res) {
  try {
    const { brandId } = req.params;
    const userId = req.userId;
    const updates = req.body;

    const brand = db.prepare('SELECT id FROM brands WHERE id = ? AND user_id = ?').get(brandId, userId);
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    const fields = [];
    const values = [];

    if (updates.name) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.colors) {
      fields.push('colors = ?');
      values.push(JSON.stringify(updates.colors));
    }
    if (updates.voiceDescription) {
      fields.push('voice_description = ?');
      values.push(updates.voiceDescription);
    }
    if (updates.targetAudience) {
      fields.push('target_audience = ?');
      values.push(updates.targetAudience);
    }
    if (updates.competitors) {
      fields.push('competitors = ?');
      values.push(JSON.stringify(updates.competitors));
    }
    if (updates.logoUrl) {
      fields.push('logo_url = ?');
      values.push(updates.logoUrl);
    }
    if (updates.metaPageId) {
      fields.push('meta_page_id = ?');
      values.push(updates.metaPageId);
    }
    if (updates.metaPageToken) {
      fields.push('meta_page_token = ?');
      values.push(updates.metaPageToken);
    }
    if (updates.metaIgAccountId) {
      fields.push('meta_ig_account_id = ?');
      values.push(updates.metaIgAccountId);
    }
    if ('onboarding_step' in updates) {
      fields.push('onboarding_step = ?');
      values.push(updates.onboarding_step);
    }
    if ('onboarding_complete' in updates) {
      fields.push('onboarding_complete = ?');
      values.push(updates.onboarding_complete);
    }
    if (updates.industry) {
      fields.push('industry = ?');
      values.push(updates.industry);
    }
    if (updates.sampleContent) {
      fields.push('sample_content = ?');
      values.push(updates.sampleContent);
    }
    if (updates.websiteUrl) {
      fields.push('website_url = ?');
      values.push(updates.websiteUrl);
    }
    if ('content_preferences' in updates) {
      fields.push('content_preferences = ?');
      values.push(JSON.stringify(updates.content_preferences));
    }

    if (fields.length === 0) {
      return res.json({ id: brandId });
    }

    values.push(brandId);
    db.prepare(`UPDATE brands SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    res.json({ id: brandId });
  } catch (err) {
    console.error('Update brand error:', err);
    res.status(500).json({ error: 'Failed to update brand' });
  }
}

export async function prefillBrand(req, res) {
  try {
    const { brandId } = req.params;
    const userId = req.userId;

    const brand = db.prepare('SELECT * FROM brands WHERE id = ? AND user_id = ?').get(brandId, userId);
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    if (!brand.website_url) {
      return res.json({});
    }

    // Scrape website
    const siteText = await scrapeBrandSite(brand.website_url);
    if (!siteText) {
      return res.json({});
    }

    // Get prefill suggestions
    const suggestions = await prefillBrandProfile(siteText);
    res.json(suggestions);
  } catch (err) {
    console.error('Prefill error:', err);
    res.json({});
  }
}

export async function regenerateBrandProfile(req, res) {
  try {
    const { brandId } = req.params;
    const userId = req.userId;

    const brand = db.prepare('SELECT * FROM brands WHERE id = ? AND user_id = ?').get(brandId, userId);
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    // Generate profile
    const profile = await generateBrandProfile(brand);

    // Save profile
    db.prepare('UPDATE brands SET content_preferences = ? WHERE id = ?').run(
      JSON.stringify(profile),
      brandId
    );

    res.json(profile);
  } catch (err) {
    console.error('Regenerate profile error:', err);
    res.status(500).json({ error: 'Failed to regenerate profile' });
  }
}
