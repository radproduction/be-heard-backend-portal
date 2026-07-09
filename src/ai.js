import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { randomUUID } from 'crypto';
import db from './db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildBrandSystemPrompt } from './brandBrain.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function generateContent(req, res) {
  try {
    const { brandId, contentType, platform, topic, tone, length, hashtags: includeHashtags, cta, generateImage } = req.body;
    const userId = req.userId;

    // Get brand details
    const brand = db.prepare('SELECT * FROM brands WHERE id = ? AND user_id = ?').get(brandId, userId);
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    const brandData = {
      name: brand.name,
      colors: brand.colors ? JSON.parse(brand.colors) : {}
    };

    // Build comprehensive system prompt from brand profile
    const systemPrompt = buildBrandSystemPrompt(brand) + '\n\nGenerate 3 versions separated by ===VERSION===. ONLY content, no explanations.';
    
    // Get hashtags from brand profile if available
    const profile = brand.content_preferences ? JSON.parse(brand.content_preferences) : {};
    const hashtagBank = profile.hashtag_bank?.[platform?.toLowerCase()] || [];
    const hashtagSuggestion = hashtagBank.length > 0 ? `Use these hashtags when relevant: ${hashtagBank.join(', ')}. ` : '';

    const userPrompt = `Generate a ${contentType} for ${platform}. Topic: ${topic}. Tone: ${tone}. Length: ${length}.${includeHashtags ? ` Include relevant hashtags. ${hashtagSuggestion}` : ''}${cta ? ' Include a call-to-action.' : ''}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    // Parse 3 versions
    const versions = message.content[0].text.split('===VERSION===').map(v => v.trim()).filter(v => v);
    
    // Save to database
    const contentId = randomUUID();
    db.prepare(`
      INSERT INTO content (
        id, brand_id, user_id, type, platform, body, 
        hashtags, status, ai_prompt, media_brief
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      contentId,
      brandId,
      userId,
      contentType,
      platform,
      JSON.stringify(versions),
      JSON.stringify([]),
      'draft',
      userPrompt,
      topic
    );

    // Generate image if requested
    let imageUrl = null;
    if (generateImage) {
      try {
        imageUrl = await generateImageForContent(contentId, brandId, userId, topic, brandData);
      } catch (err) {
        console.error('Image generation error:', err);
        // Continue without image
      }
    }

    res.json({
      id: contentId,
      versions,
      imageUrl,
      platform,
      type: contentType
    });
  } catch (err) {
    console.error('Generate content error:', err);
    res.status(500).json({ error: 'Failed to generate content' });
  }
}

async function generateImageForContent(contentId, brandId, userId, topic, brandData) {
  try {
    // First, ask Claude for detailed image prompt
    const imagePromptRequest = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `Write a detailed image prompt for a ${brandData.name} post about: ${topic}. No text in image. Match brand colors ${JSON.stringify(brandData.colors)}. Respond with ONLY the prompt.`
      }]
    });

    const imagePrompt = imagePromptRequest.content[0].text;

    // Generate image via Gemini
    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const imageId = randomUUID();
    const filename = `${imageId}.png`;
    const filepath = path.join(uploadsDir, filename);

    try {
      // Try gemini-2.0-flash-exp with image generation
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: imagePrompt }] }],
        generationConfig: { responseModalities: ['image', 'text'] }
      });

      // Extract actual image data from response
      let imageGenerated = false;
      for (const part of result.response.candidates[0].content.parts) {
        if (part.inlineData) {
          const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
          fs.writeFileSync(filepath, imageBuffer);
          imageGenerated = true;
          break;
        }
      }

      if (!imageGenerated) {
        throw new Error('No image data in response');
      }
    } catch (geminiErr) {
      console.warn('Gemini image generation failed, trying Imagen API:', geminiErr.message);
      
      // Fallback to Imagen API
      try {
        const imagenModel = genAI.getGenerativeModel({ model: 'imagen-3.0-generate-002' });
        const imagenResult = await imagenModel.generateContent({
          contents: [{ role: 'user', parts: [{ text: imagePrompt }] }]
        });

        let imageGenerated = false;
        for (const part of imagenResult.response.candidates[0].content.parts) {
          if (part.inlineData) {
            const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
            fs.writeFileSync(filepath, imageBuffer);
            imageGenerated = true;
            break;
          }
        }

        if (!imageGenerated) {
          throw new Error('No image data from Imagen');
        }
      } catch (imagenErr) {
        console.error('Both Gemini and Imagen failed:', imagenErr.message);
        throw new Error('Image generation failed with both models');
      }
    }

    const imageUrl = `${process.env.APP_URL}/uploads/${filename}`;

    // Save to database
    const generatedImageId = randomUUID();
    db.prepare(`
      INSERT INTO generated_images (
        id, content_id, brand_id, user_id, prompt, image_url
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      generatedImageId,
      contentId,
      brandId,
      userId,
      imagePrompt,
      imageUrl
    );

    // Update content with image
    db.prepare('UPDATE content SET image_url = ? WHERE id = ?').run(imageUrl, contentId);

    return imageUrl;
  } catch (err) {
    console.error('Image generation error:', err);
    throw err;
  }
}

export async function regenerateImage(req, res) {
  try {
    const { contentId, versionIndex } = req.body;
    const userId = req.userId;

    // Get content
    const content = db.prepare('SELECT * FROM content WHERE id = ? AND user_id = ?').get(contentId, userId);
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    // Get brand
    const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(content.brand_id);
    const brandData = {
      name: brand.name,
      colors: JSON.parse(brand.colors)
    };

    // Get version text
    const versions = JSON.parse(content.body);
    const versionText = versions[versionIndex] || versions[0];

    // Generate new image
    const imagePromptRequest = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `Write a detailed image prompt for this ${content.platform} post: "${versionText.substring(0, 200)}". No text in image. Match brand colors ${JSON.stringify(brandData.colors)}. Respond with ONLY the prompt.`
      }]
    });

    const imagePrompt = imagePromptRequest.content[0].text;

    // Save image directory
    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const imageId = randomUUID();
    const filename = `${imageId}.png`;
    const filepath = path.join(uploadsDir, filename);

    // Generate image via Gemini with real image data
    try {
      // Try gemini-2.0-flash-exp with image generation
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: imagePrompt }] }],
        generationConfig: { responseModalities: ['image', 'text'] }
      });

      // Extract actual image data from response
      let imageGenerated = false;
      for (const part of result.response.candidates[0].content.parts) {
        if (part.inlineData) {
          const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
          fs.writeFileSync(filepath, imageBuffer);
          imageGenerated = true;
          break;
        }
      }

      if (!imageGenerated) {
        throw new Error('No image data in response');
      }
    } catch (geminiErr) {
      console.warn('Gemini image generation failed, trying Imagen API:', geminiErr.message);
      
      // Fallback to Imagen API
      try {
        const imagenModel = genAI.getGenerativeModel({ model: 'imagen-3.0-generate-002' });
        const imagenResult = await imagenModel.generateContent({
          contents: [{ role: 'user', parts: [{ text: imagePrompt }] }]
        });

        let imageGenerated = false;
        for (const part of imagenResult.response.candidates[0].content.parts) {
          if (part.inlineData) {
            const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
            fs.writeFileSync(filepath, imageBuffer);
            imageGenerated = true;
            break;
          }
        }

        if (!imageGenerated) {
          throw new Error('No image data from Imagen');
        }
      } catch (imagenErr) {
        console.error('Both Gemini and Imagen failed:', imagenErr.message);
        throw new Error('Image generation failed with both models');
      }
    }

    const imageUrl = `${process.env.APP_URL}/uploads/${filename}`;

    // Save to database
    const generatedImageId = randomUUID();
    db.prepare(`
      INSERT INTO generated_images (
        id, content_id, brand_id, user_id, prompt, image_url
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      generatedImageId,
      contentId,
      content.brand_id,
      userId,
      imagePrompt,
      imageUrl
    );

    // Update content with image
    db.prepare('UPDATE content SET image_url = ? WHERE id = ?').run(imageUrl, contentId);

    res.json({
      id: generatedImageId,
      imageUrl,
      contentId,
      versionIndex
    });
  } catch (err) {
    console.error('Regenerate image error:', err);
    res.status(500).json({ error: 'Failed to regenerate image' });
  }
}
