import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { randomUUID } from 'crypto';
import db from './db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const FORMATS = {
  'ig-post': { name: 'Instagram Post', ratio: '1:1' },
  'ig-story': { name: 'Instagram Story', ratio: '9:16' },
  'carousel': { name: 'Carousel', ratio: '1:1' },
  'cover': { name: 'Cover Image', ratio: '16:9' },
  'banner': { name: 'Banner', ratio: '1280:400' }
};

const STYLES = [
  'Photo', 'Illustration', 'Abstract', '3D', 'Flat', 'Minimal'
];

export async function generateCreative(req, res) {
  try {
    const { brandId, contentId, description, format, style } = req.body;
    const userId = req.userId;

    if (!FORMATS[format] || !STYLES.includes(style)) {
      return res.status(400).json({ error: 'Invalid format or style' });
    }

    // Get brand
    const brand = db.prepare('SELECT * FROM brands WHERE id = ? AND user_id = ?').get(brandId, userId);
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    const brandData = {
      name: brand.name,
      colors: JSON.parse(brand.colors || '{}')
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

    // Generate image via Gemini
    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const imageId = randomUUID();
    const filename = `${imageId}.png`;
    const filepath = path.join(uploadsDir, filename);

    let imageGenerated = false;

    try {
      // Try gemini-2.0-flash-exp with image generation
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: imagePrompt }] }],
        generationConfig: { responseModalities: ['image', 'text'] }
      });

      // Extract actual image data from response
      for (const part of result.response.candidates[0].content.parts) {
        if (part.inlineData) {
          const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
          fs.writeFileSync(filepath, imageBuffer);
          imageGenerated = true;
          break;
        }
      }
    } catch (geminiErr) {
      console.warn('Gemini image generation failed, trying Imagen API:', geminiErr.message);
      
      // Fallback to Imagen API
      try {
        const imagenModel = genAI.getGenerativeModel({ model: 'imagen-3.0-generate-002' });
        const imagenResult = await imagenModel.generateContent({
          contents: [{ role: 'user', parts: [{ text: imagePrompt }] }]
        });

        for (const part of imagenResult.response.candidates[0].content.parts) {
          if (part.inlineData) {
            const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
            fs.writeFileSync(filepath, imageBuffer);
            imageGenerated = true;
            break;
          }
        }
      } catch (imagenErr) {
        console.error('Both Gemini and Imagen failed:', imagenErr.message);
      }
    }

    if (!imageGenerated) {
      return res.status(500).json({ error: 'Failed to generate image' });
    }

    const imageUrl = `${process.env.APP_URL}/uploads/${filename}`;

    // Save to database
    const creativeId = randomUUID();
    db.prepare(`
      INSERT INTO generated_images (
        id, content_id, brand_id, user_id, prompt, image_url
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      creativeId,
      contentId || null,
      brandId,
      userId,
      imagePrompt,
      imageUrl
    );

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

export function getCreativeGallery(req, res) {
  try {
    const userId = req.userId;
    const { brandId } = req.query;

    let query = `
      SELECT gi.*, b.name as brand_name
      FROM generated_images gi
      LEFT JOIN brands b ON gi.brand_id = b.id
      WHERE gi.user_id = ?
    `;
    const params = [userId];

    if (brandId) {
      query += ' AND gi.brand_id = ?';
      params.push(brandId);
    }

    query += ' ORDER BY gi.created_at DESC';

    const images = db.prepare(query).all(...params);
    res.json(images);
  } catch (err) {
    console.error('Get creative gallery error:', err);
    res.status(500).json({ error: 'Failed to get gallery' });
  }
}

export async function regenerateCreative(req, res) {
  try {
    const { creativeId } = req.params;
    const userId = req.userId;

    const creative = db.prepare('SELECT * FROM generated_images WHERE id = ? AND user_id = ?').get(creativeId, userId);
    if (!creative) {
      return res.status(404).json({ error: 'Creative not found' });
    }

    // Delete old image
    const uploadsDir = path.join(__dirname, '../uploads');
    const oldFilename = creative.image_url.split('/').pop();
    const oldPath = path.join(uploadsDir, oldFilename);
    if (fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath);
    }

    // Generate new image
    const imageId = randomUUID();
    const filename = `${imageId}.png`;
    const filepath = path.join(uploadsDir, filename);

    let imageGenerated = false;

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: creative.prompt }] }],
        generationConfig: { responseModalities: ['image', 'text'] }
      });

      for (const part of result.response.candidates[0].content.parts) {
        if (part.inlineData) {
          const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
          fs.writeFileSync(filepath, imageBuffer);
          imageGenerated = true;
          break;
        }
      }
    } catch (geminiErr) {
      try {
        const imagenModel = genAI.getGenerativeModel({ model: 'imagen-3.0-generate-002' });
        const imagenResult = await imagenModel.generateContent({
          contents: [{ role: 'user', parts: [{ text: creative.prompt }] }]
        });

        for (const part of imagenResult.response.candidates[0].content.parts) {
          if (part.inlineData) {
            const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
            fs.writeFileSync(filepath, imageBuffer);
            imageGenerated = true;
            break;
          }
        }
      } catch (imagenErr) {
        console.error('Image regeneration failed:', imagenErr.message);
      }
    }

    if (!imageGenerated) {
      return res.status(500).json({ error: 'Failed to regenerate image' });
    }

    const imageUrl = `${process.env.APP_URL}/uploads/${filename}`;
    db.prepare('UPDATE generated_images SET image_url = ? WHERE id = ?').run(imageUrl, creativeId);

    res.json({ id: creativeId, imageUrl });
  } catch (err) {
    console.error('Regenerate creative error:', err);
    res.status(500).json({ error: 'Failed to regenerate creative' });
  }
}

export function deleteCreative(req, res) {
  try {
    const { creativeId } = req.params;
    const userId = req.userId;

    const creative = db.prepare('SELECT * FROM generated_images WHERE id = ? AND user_id = ?').get(creativeId, userId);
    if (!creative) {
      return res.status(404).json({ error: 'Creative not found' });
    }

    // Delete image file
    const uploadsDir = path.join(__dirname, '../uploads');
    const filename = creative.image_url.split('/').pop();
    const filepath = path.join(uploadsDir, filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }

    db.prepare('DELETE FROM generated_images WHERE id = ?').run(creativeId);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete creative error:', err);
    res.status(500).json({ error: 'Failed to delete creative' });
  }
}
