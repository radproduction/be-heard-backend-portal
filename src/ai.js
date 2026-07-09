import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { Content, Brand, GeneratedImage } from './models/index.js';
import { generateImageDataUri } from './imagegen.js';
import { buildBrandSystemPrompt } from './brandBrain.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateContent(req, res) {
  try {
    const { brandId, contentType, platform, topic, tone, length, hashtags: includeHashtags, cta, generateImage } = req.body;
    const userId = req.userId;

    const brand = await Brand.findOne({ id: brandId, user_id: userId }).lean();
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    const brandData = {
      name: brand.name,
      voice: brand.voice_description,
      audience: brand.target_audience,
      industry: brand.industry,
      colors: brand.colors || {}
    };

    // Build comprehensive system prompt from the brand profile (Brand Brain)
    const systemPrompt = buildBrandSystemPrompt(brand) + '\n\nGenerate 3 versions separated by ===VERSION===. ONLY content, no explanations.';

    // Pull hashtags from the brand profile when available
    const profile = (brand.content_preferences && typeof brand.content_preferences === 'object')
      ? brand.content_preferences : {};
    const hashtagBank = profile.hashtag_bank?.[platform?.toLowerCase()] || [];
    const hashtagSuggestion = hashtagBank.length > 0
      ? ` Use these hashtags when relevant: ${hashtagBank.join(', ')}.` : '';

    const userPrompt = `Generate a ${contentType} for ${platform}. Topic: ${topic}. Tone: ${tone}. Length: ${length}.${includeHashtags ? ` Include relevant hashtags.${hashtagSuggestion}` : ''}${cta ? ' Include a call-to-action.' : ''}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const versions = message.content[0].text.split('===VERSION===').map(v => v.trim()).filter(v => v);

    const contentId = randomUUID();
    await Content.create({
      id: contentId,
      brand_id: brandId,
      user_id: userId,
      type: contentType,
      platform,
      body: versions,
      hashtags: [],
      status: 'draft',
      ai_prompt: userPrompt,
      media_brief: topic
    });

    let imageUrl = null;
    if (generateImage) {
      try {
        imageUrl = await generateImageForContent(contentId, brandId, userId, topic, brandData);
      } catch (err) {
        console.error('Image generation error:', err);
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
  // Ask Claude for a detailed image prompt
  const imagePromptRequest = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `Write a detailed image prompt for a ${brandData.name} post about: ${topic}. No text in image. Match brand colors ${JSON.stringify(brandData.colors)}. Respond with ONLY the prompt.`
    }]
  });

  const imagePrompt = imagePromptRequest.content[0].text;

  const imageUrl = await generateImageDataUri(imagePrompt);
  if (!imageUrl) {
    throw new Error('Image generation failed with both models');
  }

  await GeneratedImage.create({
    id: randomUUID(),
    content_id: contentId,
    brand_id: brandId,
    user_id: userId,
    prompt: imagePrompt,
    image_url: imageUrl
  });

  await Content.updateOne({ id: contentId }, { $set: { image_url: imageUrl } });

  return imageUrl;
}

export async function regenerateImage(req, res) {
  try {
    const { contentId, versionIndex } = req.body;
    const userId = req.userId;

    const content = await Content.findOne({ id: contentId, user_id: userId }).lean();
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const brand = await Brand.findOne({ id: content.brand_id }).lean();
    const brandData = {
      name: brand?.name,
      colors: brand?.colors || {}
    };

    const versions = Array.isArray(content.body) ? content.body : [content.body];
    const versionText = String(versions[versionIndex] || versions[0] || '');

    const imagePromptRequest = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `Write a detailed image prompt for this ${content.platform} post: "${versionText.substring(0, 200)}". No text in image. Match brand colors ${JSON.stringify(brandData.colors)}. Respond with ONLY the prompt.`
      }]
    });

    const imagePrompt = imagePromptRequest.content[0].text;

    const imageUrl = await generateImageDataUri(imagePrompt);
    if (!imageUrl) {
      return res.status(500).json({ error: 'Failed to regenerate image' });
    }

    const generatedImageId = randomUUID();
    await GeneratedImage.create({
      id: generatedImageId,
      content_id: contentId,
      brand_id: content.brand_id,
      user_id: userId,
      prompt: imagePrompt,
      image_url: imageUrl
    });

    await Content.updateOne({ id: contentId }, { $set: { image_url: imageUrl } });

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
