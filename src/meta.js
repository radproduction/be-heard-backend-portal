import axios from 'axios';
import { randomUUID } from 'crypto';
import db from './db.js';

const META_API_VERSION = 'v18.0';
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;

// In-memory store for nonce → { brandId, state, expiresAt }
// In production, use Redis or a database table
const nonceStore = new Map();

export async function publishToInstagram(req, res) {
  try {
    const { contentId, brandId } = req.body;
    const userId = req.userId;

    // Get content
    const content = db.prepare('SELECT * FROM content WHERE id = ? AND user_id = ?').get(contentId, userId);
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    // Get brand with Meta credentials
    const brand = db.prepare('SELECT * FROM brands WHERE id = ? AND user_id = ?').get(brandId, userId);
    if (!brand || !brand.meta_ig_account_id || !brand.meta_page_token) {
      return res.status(400).json({ error: 'Instagram not connected for this brand' });
    }

    // Check if image URL is public
    if (!content.image_url) {
      return res.status(400).json({ error: 'Content must have an image to publish' });
    }

    // Create caption with hashtags
    const hashtags = JSON.parse(content.hashtags || '[]');
    const caption = `${content.body}\n\n${hashtags.join(' ')}`;

    // Publish to Instagram
    const publishUrl = `${META_GRAPH_URL}/${brand.meta_ig_account_id}/media`;
    
    const response = await axios.post(publishUrl, {
      image_url: content.image_url,
      caption: caption,
      access_token: brand.meta_page_token
    });

    const mediaId = response.data.id;

    // Publish the media
    const containerUrl = `${META_GRAPH_URL}/${brand.meta_ig_account_id}/media_publish`;
    await axios.post(containerUrl, {
      creation_id: mediaId,
      access_token: brand.meta_page_token
    });

    // Update content status
    db.prepare(`
      UPDATE content 
      SET status = 'published', published_at = datetime('now'), meta_post_id = ?
      WHERE id = ?
    `).run(mediaId, contentId);

    res.json({
      success: true,
      mediaId,
      platform: 'instagram'
    });
  } catch (err) {
    console.error('Instagram publish error:', err.response?.data || err.message);
    res.status(500).json({ 
      error: 'Failed to publish to Instagram',
      details: err.response?.data?.error?.message || err.message
    });
  }
}

export async function publishToFacebook(req, res) {
  try {
    const { contentId, brandId } = req.body;
    const userId = req.userId;

    // Get content
    const content = db.prepare('SELECT * FROM content WHERE id = ? AND user_id = ?').get(contentId, userId);
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    // Get brand with Meta credentials
    const brand = db.prepare('SELECT * FROM brands WHERE id = ? AND user_id = ?').get(brandId, userId);
    if (!brand || !brand.meta_page_id || !brand.meta_page_token) {
      return res.status(400).json({ error: 'Facebook not connected for this brand' });
    }

    // Create post data
    const hashtags = JSON.parse(content.hashtags || '[]');
    const message = `${content.body}\n\n${hashtags.join(' ')}`;

    const postData = {
      message,
      access_token: brand.meta_page_token
    };

    if (content.image_url) {
      postData.picture = content.image_url;
    }

    // Publish to Facebook
    const publishUrl = `${META_GRAPH_URL}/${brand.meta_page_id}/feed`;
    const response = await axios.post(publishUrl, postData);

    const postId = response.data.id;

    // Update content status
    db.prepare(`
      UPDATE content 
      SET status = 'published', published_at = datetime('now'), meta_post_id = ?
      WHERE id = ?
    `).run(postId, contentId);

    res.json({
      success: true,
      postId,
      platform: 'facebook'
    });
  } catch (err) {
    console.error('Facebook publish error:', err.response?.data || err.message);
    res.status(500).json({ 
      error: 'Failed to publish to Facebook',
      details: err.response?.data?.error?.message || err.message
    });
  }
}

export async function getMetaOAuthUrl(req, res) {
  try {
    const { brandId } = req.query;
    const userId = req.userId;

    if (!brandId) {
      return res.status(400).json({ error: 'brandId required' });
    }

    // Verify brand belongs to user
    const brand = db.prepare('SELECT id FROM brands WHERE id = ? AND user_id = ?').get(brandId, userId);
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    // Generate nonce and state
    const nonce = randomUUID();
    const state = randomUUID();

    // Store nonce with expiry (10 minutes)
    nonceStore.set(nonce, {
      brandId,
      state,
      expiresAt: Date.now() + 10 * 60 * 1000
    });

    const redirectUri = `${process.env.APP_URL}/api/meta/callback`;
    const scopes = 'pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish';
    
    // Embed nonce in state for CSRF protection
    const stateWithNonce = `${state}.${nonce}`;

    const url = `https://www.facebook.com/v${META_API_VERSION}/dialog/oauth?` +
      `client_id=${process.env.META_APP_ID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `state=${encodeURIComponent(stateWithNonce)}&` +
      `response_type=code`;

    res.json({ url });
  } catch (err) {
    console.error('Get OAuth URL error:', err);
    res.status(500).json({ error: 'Failed to get OAuth URL' });
  }
}

export async function handleMetaCallback(req, res) {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.redirect(`${process.env.APP_URL}?error=no_code`);
    }

    if (!state) {
      return res.redirect(`${process.env.APP_URL}?error=no_state`);
    }

    // Parse state and nonce
    const [stateValue, nonce] = state.split('.');
    if (!nonce) {
      return res.redirect(`${process.env.APP_URL}?error=invalid_state`);
    }

    // Validate nonce
    const nonceData = nonceStore.get(nonce);
    if (!nonceData) {
      return res.redirect(`${process.env.APP_URL}?error=invalid_nonce`);
    }

    if (nonceData.expiresAt < Date.now()) {
      nonceStore.delete(nonce);
      return res.redirect(`${process.env.APP_URL}?error=nonce_expired`);
    }

    if (nonceData.state !== stateValue) {
      return res.redirect(`${process.env.APP_URL}?error=state_mismatch`);
    }

    const { brandId } = nonceData;
    nonceStore.delete(nonce);

    // Exchange code for short-lived user token
    const tokenUrl = `${META_GRAPH_URL}/oauth/access_token`;
    const tokenResponse = await axios.post(tokenUrl, {
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      redirect_uri: `${process.env.APP_URL}/api/meta/callback`,
      code
    });

    const shortLivedToken = tokenResponse.data.access_token;
    const userId = tokenResponse.data.user_id;

    // Exchange short-lived token for long-lived token
    const longLivedTokenUrl = `${META_GRAPH_URL}/oauth/access_token`;
    const longLivedResponse = await axios.post(longLivedTokenUrl, {
      grant_type: 'fb_exchange_token',
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      fb_exchange_token: shortLivedToken
    });

    const longLivedToken = longLivedResponse.data.access_token;

    // Get user's pages and Instagram accounts
    const pagesUrl = `${META_GRAPH_URL}/${userId}/accounts`;
    const pagesResponse = await axios.get(pagesUrl, {
      params: { access_token: longLivedToken }
    });

    const pages = pagesResponse.data.data;
    if (pages.length === 0) {
      return res.redirect(`${process.env.APP_URL}/brand/${brandId}?meta=error&message=no_pages`);
    }

    // If only one page, auto-select it
    if (pages.length === 1) {
      const page = pages[0];
      const pageToken = page.access_token;
      const pageId = page.id;

      // Get Instagram account
      const igUrl = `${META_GRAPH_URL}/${pageId}?fields=instagram_business_account`;
      const igResponse = await axios.get(igUrl, {
        params: { access_token: pageToken }
      });

      const igAccountId = igResponse.data.instagram_business_account?.id;

      // Update brand
      db.prepare(`
        UPDATE brands 
        SET meta_page_id = ?, meta_page_token = ?, meta_ig_account_id = ?
        WHERE id = ?
      `).run(pageId, pageToken, igAccountId, brandId);

      return res.redirect(`${process.env.APP_URL}/brand/${brandId}?meta=connected`);
    }

    // Multiple pages: cache them and redirect to selection page
    const pagesNonce = randomUUID();
    nonceStore.set(pagesNonce, {
      pages,
      longLivedToken,
      brandId,
      expiresAt: Date.now() + 10 * 60 * 1000
    });

    res.redirect(`${process.env.APP_URL}/brand/${brandId}?meta=choose&pagesNonce=${pagesNonce}`);
  } catch (err) {
    console.error('Meta callback error:', err.response?.data || err.message);
    res.redirect(`${process.env.APP_URL}?error=callback_failed&message=${encodeURIComponent(err.message)}`);
  }
}

export async function selectMetaPage(req, res) {
  try {
    const { pageId, pagesNonce } = req.body;
    const userId = req.userId;

    if (!pageId || !pagesNonce) {
      return res.status(400).json({ error: 'pageId and pagesNonce required' });
    }

    // Get cached pages
    const pagesData = nonceStore.get(pagesNonce);
    if (!pagesData) {
      return res.status(400).json({ error: 'Invalid or expired pages nonce' });
    }

    if (pagesData.expiresAt < Date.now()) {
      nonceStore.delete(pagesNonce);
      return res.status(400).json({ error: 'Pages nonce expired' });
    }

    const { pages, longLivedToken, brandId } = pagesData;

    // Verify brand belongs to user
    const brand = db.prepare('SELECT id FROM brands WHERE id = ? AND user_id = ?').get(brandId, userId);
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    // Find selected page
    const page = pages.find(p => p.id === pageId);
    if (!page) {
      return res.status(400).json({ error: 'Page not found' });
    }

    const pageToken = page.access_token;

    // Get Instagram account
    const igUrl = `${META_GRAPH_URL}/${pageId}?fields=instagram_business_account`;
    const igResponse = await axios.get(igUrl, {
      params: { access_token: pageToken }
    });

    const igAccountId = igResponse.data.instagram_business_account?.id;

    // Update brand
    db.prepare(`
      UPDATE brands 
      SET meta_page_id = ?, meta_page_token = ?, meta_ig_account_id = ?
      WHERE id = ?
    `).run(pageId, pageToken, igAccountId, brandId);

    nonceStore.delete(pagesNonce);

    res.json({
      success: true,
      pageId,
      igAccountId,
      connected: true
    });
  } catch (err) {
    console.error('Select page error:', err.response?.data || err.message);
    res.status(500).json({ 
      error: 'Failed to select page',
      details: err.response?.data?.error?.message || err.message
    });
  }
}

export async function getAnalytics(req, res) {
  try {
    const { brandId } = req.params;
    const userId = req.userId;

    // Get brand
    const brand = db.prepare('SELECT * FROM brands WHERE id = ? AND user_id = ?').get(brandId, userId);
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    if (!brand.meta_ig_account_id || !brand.meta_page_token) {
      return res.status(400).json({ error: 'Instagram not connected' });
    }

    // Fetch Instagram insights
    const insightsUrl = `${META_GRAPH_URL}/${brand.meta_ig_account_id}/insights`;
    const response = await axios.get(insightsUrl, {
      params: {
        metric: 'impressions,reach,profile_views,follower_count,get_directions_clicks,website_clicks',
        access_token: brand.meta_page_token
      }
    });

    const insights = response.data.data || [];
    const analyticsData = {};

    insights.forEach(metric => {
      analyticsData[metric.name] = metric.values[0]?.value || 0;
    });

    res.json({
      brandId,
      platform: 'instagram',
      data: analyticsData,
      fetchedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Get analytics error:', err.response?.data || err.message);
    res.status(500).json({ 
      error: 'Failed to fetch analytics',
      details: err.response?.data?.error?.message || err.message
    });
  }
}
