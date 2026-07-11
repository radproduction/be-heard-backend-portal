import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { GeneratedImage, Brand } from './models/index.js';
import { generateImageDataUri } from './imagegen.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FORMATS = {
  'ig-post': { name: 'Instagram Post', ratio: '1:1' },
  'ig-story': { name: 'Instagram Story', ratio: '9:16' },
  'carousel': { name: 'Carousel', ratio: '1:1' },
  'cover': { name: 'Cover Image', ratio: '16:9' },
  'banner': { name: 'Banner', ratio: '1280:400' }
};

const STYLES = ['Photo', 'Illustration', 'Abstract', '3D', 'Flat', 'Minimal'];

export async function generateCreative(req, res) {
  try {
    const { brandId, contentId, description, format, style } = req.body;
    const userId = req.userId;

    if (!FORMATS[format] || !STYLES.includes(style)) {
      return res.status(400).json({ error: 'Invalid format or style' });
    }

    const brand = await Brand.findOne({ id: brandId, user_id: userId }).lean();
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    const brandData = {
      name: brand.name,
      colors: brand.colors || {}
    };

    // Generate image prompt via Claude
    const promptRequest = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Create a detailed image prompt for a ${FORMATS[format].name} (${FORMATS[format].ratio}) in ${style} style for ${brandData.name}.
${description ? `Context: ${description}` : ''}
Brand colors: ${JSON.stringify(brandData.colors)}

Requirements:
- Professional, high-quality
- No text or watermarks
- Optimized for ${format}
- Style: ${style}
- Aspect ratio: ${FORMATS[format].ratio}

Respond with ONLY the detailed image prompt.`
      }]
    });

    const imagePrompt = promptRequest.content[0].text;

    const imageUrl = await generateImageDataUri(imagePrompt);
    if (!imageUrl) {
      return res.status(500).json({ error: 'Failed to generate image' });
    }

    const creativeId = randomUUID();
    await GeneratedImage.create({
      id: creativeId,
      content_id: contentId || null,
      brand_id: brandId,
      user_id: userId,
      prompt: imagePrompt,
      image_url: imageUrl,
      format
    });

    res.json({
      id: creativeId,
      imageUrl,
      prompt: imagePrompt,
      format,
      style,
      brandId,
      contentId
    });
  } catch (err) {
    console.error('Generate creative error:', err);
    res.status(500).json({ error: 'Failed to generate creative' });
  }
}

export async function getCreativeGallery(req, res) {
  try {
    const userId = req.userId;
    const { brandId } = req.query;

    const filter = { user_id: userId };
    if (brandId) filter.brand_id = brandId;

    const images = await GeneratedImage.find(filter).sort({ created_at: -1 }).lean();

    // Attach brand_name
    const brandIds = [...new Set(images.map(i => i.brand_id).filter(Boolean))];
    const brands = await Brand.find({ id: { $in: brandIds } }).select('id name -_id').lean();
    const brandNameById = Object.fromEntries(brands.map(b => [b.id, b.name]));

    const enriched = images.map(i => ({ ...i, brand_name: brandNameById[i.brand_id] || null }));

    res.json(enriched);
  } catch (err) {
    console.error('Get creative gallery error:', err);
    res.status(500).json({ error: 'Failed to get gallery' });
  }
}

export async function regenerateCreative(req, res) {
  try {
    const { creativeId } = req.params;
    const userId = req.userId;

    const creative = await GeneratedImage.findOne({ id: creativeId, user_id: userId }).lean();
    if (!creative) {
      return res.status(404).json({ error: 'Creative not found' });
    }

    const imageUrl = await generateImageDataUri(creative.prompt);
    if (!imageUrl) {
      return res.status(500).json({ error: 'Failed to regenerate image' });
    }

    await GeneratedImage.updateOne({ id: creativeId }, { $set: { image_url: imageUrl } });

    res.json({ id: creativeId, imageUrl });
  } catch (err) {
    console.error('Regenerate creative error:', err);
    res.status(500).json({ error: 'Failed to regenerate creative' });
  }
}

export async function deleteCreative(req, res) {
  try {
    const { creativeId } = req.params;
    const userId = req.userId;

    const creative = await GeneratedImage.findOne({ id: creativeId, user_id: userId }).select('id').lean();
    if (!creative) {
      return res.status(404).json({ error: 'Creative not found' });
    }

    await GeneratedImage.deleteOne({ id: creativeId });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete creative error:', err);
    res.status(500).json({ error: 'Failed to delete creative' });
  }
}
