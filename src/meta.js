import axios from 'axios';
import jwt from 'jsonwebtoken';
import { Brand } from './models/index.js';

const META_API_VERSION = 'v18.0';
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;
const JWT_SECRET = process.env.JWT_SECRET || 'beheard-secret-key';

function clientOrigin() {
  return (process.env.CLIENT_URL || process.env.FRONTEND_URL || '')
    .split(',')[0]
    .trim()
    .replace(/\/$/, '');
}

// GET /api/meta/oauth-url?brandId=...  (authenticated)
// Returns the Facebook OAuth URL. brandId + userId are carried in a signed `state`.
export async function getMetaOAuthUrl(req, res) {
  try {
    const { brandId } = req.query;
    const userId = req.userId;

    if (!process.env.META_APP_ID) {
      return res.status(400).json({ error: 'Meta is not configured (META_APP_ID missing on the server).' });
    }
    if (!process.env.APP_URL) {
      return res.status(400).json({ error: 'Meta is not configured (APP_URL missing on the server).' });
    }
    if (!brandId) {
      return res.status(400).json({ error: 'brandId is required' });
    }

    const state = jwt.sign({ brandId, userId }, JWT_SECRET, { expiresIn: '15m' });
    const redirectUri = `${process.env.APP_URL.replace(/\/$/, '')}/api/meta/callback`;
    const scopes = [
      'pages_show_list',
      'pages_manage_posts',
      'pages_read_engagement',
      'instagram_basic',
      'instagram_content_publish'
    ].join(',');

    const url = `https://www.facebook.com/${META_API_VERSION}/dialog/oauth?` +
      `client_id=${encodeURIComponent(process.env.META_APP_ID)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${encodeURIComponent(state)}&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `response_type=code`;

    res.json({ url });
  } catch (err) {
    console.error('Get Meta OAuth URL error:', err);
    res.status(500).json({ error: 'Failed to build Meta OAuth URL' });
  }
}

// GET /api/meta/callback  (hit by Facebook's redirect — NOT authenticated)
// Exchanges the code, finds the page + IG account, saves them to the brand,
// then redirects back to the frontend.
export async function handleMetaCallback(req, res) {
  const client = clientOrigin();
  const fail = (brandId, message) =>
    res.redirect(`${client}${brandId ? `/brand/${brandId}` : ''}?meta=error&message=${encodeURIComponent(message)}`);

  try {
    const { code, state } = req.query;
    if (!code || !state) return fail(null, 'Missing authorization code');

    let payload;
    try {
      payload = jwt.verify(state, JWT_SECRET);
    } catch {
      return fail(null, 'Invalid or expired state');
    }
    const { brandId, userId } = payload;
    const redirectUri = `${process.env.APP_URL.replace(/\/$/, '')}/api/meta/callback`;

    // 1) Exchange code for a user access token
    const tokenRes = await axios.get(`${META_GRAPH_URL}/oauth/access_token`, {
      params: {
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        redirect_uri: redirectUri,
        code
      }
    });
    const userToken = tokenRes.data.access_token;

    // 2) Get the user's Facebook pages
    const pagesRes = await axios.get(`${META_GRAPH_URL}/me/accounts`, {
      params: { access_token: userToken }
    });
    const pages = pagesRes.data.data || [];
    if (pages.length === 0) return fail(brandId, 'No Facebook pages found on this account');

    const page = pages[0];
    const pageId = page.id;
    const pageToken = page.access_token;

    // 3) Get the linked Instagram business account (optional)
    let igAccountId = null;
    try {
      const igRes = await axios.get(`${META_GRAPH_URL}/${pageId}`, {
        params: { fields: 'instagram_business_account', access_token: pageToken }
      });
      igAccountId = igRes.data.instagram_business_account?.id || null;
    } catch (err) {
      console.warn('Could not fetch IG account:', err.message);
    }

    // 4) Save to the brand
    await Brand.updateOne(
      { id: brandId, user_id: userId },
      { $set: { meta_page_id: pageId, meta_page_token: pageToken, meta_ig_account_id: igAccountId } }
    );

    return res.redirect(`${client}/brand/${brandId}?meta=connected`);
  } catch (err) {
    console.error('Meta callback error:', err.response?.data || err.message);
    return fail(null, err.response?.data?.error?.message || 'Failed to connect Meta account');
  }
}
