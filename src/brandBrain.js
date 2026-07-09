import fetch from 'node-fetch';
import { Anthropic } from '@anthropic-ai/sdk';
import { JSDOM } from 'jsdom';

const client = new Anthropic();

/**
 * Scrape brand website (homepage + /about) and return cleaned text
 * @param {string} url - Website URL
 * @returns {Promise<string|null>} Cleaned text or null if failed
 */
export async function scrapeBrandSite(url) {
  try {
    if (!url) return null;

    let fullUrl = url;
    if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
      fullUrl = 'https://' + fullUrl;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let text = '';

    // Fetch homepage
    try {
      const res = await fetch(fullUrl, { signal: controller.signal });
      if (res.ok) {
        const html = await res.text();
        const dom = new JSDOM(html);
        text += dom.window.document.body.textContent || '';
      }
    } catch (err) {
      console.error('Failed to fetch homepage:', err.message);
    }

    // Fetch /about
    try {
      const aboutUrl = fullUrl.replace(/\/$/, '') + '/about';
      const res = await fetch(aboutUrl, { signal: controller.signal });
      if (res.ok) {
        const html = await res.text();
        const dom = new JSDOM(html);
        text += '\n' + (dom.window.document.body.textContent || '');
      }
    } catch (err) {
      console.error('Failed to fetch /about:', err.message);
    }

    clearTimeout(timeout);

    // Clean and cap text
    text = text
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 8000);

    return text || null;
  } catch (err) {
    console.error('Brand site scraping failed:', err.message);
    return null;
  }
}

/**
 * Pre-fill brand profile from website content
 * @param {string} siteText - Scraped website text
 * @returns {Promise<object>} Suggestions for voice, audience, industry
 */
export async function prefillBrandProfile(siteText) {
  try {
    if (!siteText) return {};

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Based on this website content, suggest a brand voice description, target audience, and industry. Return ONLY valid JSON with keys: voiceDescription, targetAudience, industry.

Website content:
${siteText}`
        }
      ]
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return {};
  } catch (err) {
    console.error('Prefill failed:', err.message);
    return {};
  }
}

/**
 * Generate comprehensive brand profile from all collected data
 * @param {object} brand - Brand record with all fields
 * @returns {Promise<object>} Brand profile JSON
 */
export async function generateBrandProfile(brand) {
  try {
    const profilePrompt = `You are a brand strategist. Analyze this brand data and create a comprehensive brand profile.

Brand Name: ${brand.name}
Industry: ${brand.industry || 'Not specified'}
Voice Description: ${brand.voice_description || 'Not specified'}
Target Audience: ${brand.target_audience || 'Not specified'}
Competitors: ${brand.competitors || '[]'}
Sample Content: ${brand.sample_content || 'Not specified'}
Colors: ${brand.colors || '{}'}
Website Content: ${brand.website_content || 'Not provided'}

Generate ONLY valid JSON (no markdown, no explanation) with this exact structure:
{
  "tone_attributes": [
    {"trait": "string", "intensity": 1-5}
  ],
  "dos": ["string"],
  "donts": ["string"],
  "key_messages": ["string"],
  "hashtag_bank": {
    "instagram": ["string"],
    "facebook": ["string"],
    "linkedin": ["string"]
  },
  "personas": [
    {"name": "string", "description": "string", "pain_points": ["string"]}
  ],
  "banned_words": ["string"]
}`;

    let attempt = 0;
    let profile = null;

    while (attempt < 2 && !profile) {
      try {
        const message = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          messages: [
            {
              role: 'user',
              content: profilePrompt
            }
          ]
        });

        const text = message.content[0].type === 'text' ? message.content[0].text : '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          profile = JSON.parse(jsonMatch[0]);
        }
      } catch (parseErr) {
        console.error(`Profile generation attempt ${attempt + 1} failed:`, parseErr.message);
        attempt++;
      }
    }

    return profile || {
      tone_attributes: [],
      dos: [],
      donts: [],
      key_messages: [],
      hashtag_bank: { instagram: [], facebook: [], linkedin: [] },
      personas: [],
      banned_words: []
    };
  } catch (err) {
    console.error('Brand profile generation failed:', err.message);
    return {
      tone_attributes: [],
      dos: [],
      donts: [],
      key_messages: [],
      hashtag_bank: { instagram: [], facebook: [], linkedin: [] },
      personas: [],
      banned_words: []
    };
  }
}

/**
 * Build comprehensive system prompt from brand profile
 * @param {object} brand - Brand with profile data
 * @returns {string} System prompt for AI generation
 */
export function buildBrandSystemPrompt(brand) {
  const profile = brand.content_preferences ? JSON.parse(brand.content_preferences) : {};

  let prompt = `You are a content creator for ${brand.name}.

Brand Voice:
${brand.voice_description || 'Professional and engaging'}

Target Audience:
${brand.target_audience || 'General audience'}

Industry: ${brand.industry || 'General'}

Key Messages:
${profile.key_messages?.map(m => `- ${m}`).join('\n') || '- Create engaging content'}

Tone Attributes:
${profile.tone_attributes?.map(t => `- ${t.trait} (intensity: ${t.intensity}/5)`).join('\n') || '- Professional'}

Do's:
${profile.dos?.map(d => `✓ ${d}`).join('\n') || '✓ Be authentic'}

Don'ts:
${profile.donts?.map(d => `✗ ${d}`).join('\n') || '✗ Be misleading'}

Brand Personas:
${profile.personas?.map(p => `- ${p.name}: ${p.description}`).join('\n') || '- General audience'}

Banned Words: ${profile.banned_words?.join(', ') || 'None'}

Brand Colors: ${brand.colors || '#BFFF00 and #0a0a0a'}

When creating content:
1. Reflect the brand voice and tone attributes
2. Address the target audience's needs
3. Follow the do's and don'ts
4. Incorporate key messages naturally
5. Avoid banned words
6. Consider the brand personas`;

  return prompt;
}
