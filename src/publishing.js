import axios from 'axios';
import db from './db.js';

const META_API_VERSION = 'v18.0';
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export async function publishContent(req, res) {
  try {
    const { contentId, platform } = req.body;
    const userId = req.userId;

    // Get content
    const content = db.prepare('SELECT * FROM content WHERE id = ? AND user_id = ?').get(contentId, userId);
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    // Get brand
    const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(content.brand_id);
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    // Get first version if multiple versions
    let bodyText = content.body;
    try {
      const versions = JSON.parse(content.body);
      if (Array.isArray(versions)) {
        bodyText = versions[0];
      }
    } catch (e) {
      // body is already a string
    }

    if (platform === 'instagram') {
      return publishToInstagram(res, content, brand, bodyText);
    } else if (platform === 'facebook') {
      return publishToFacebook(res, content, brand, bodyText);
    } else {
      return res.status(400).json({ error: 'Invalid platform' });
    }
  } catch (err) {
    console.error('Publish error:', err);
    res.status(500).json({ error: 'Failed to publish' });
  }
}

async function publishToInstagram(res, content, brand, bodyText) {
  try {
    if (!brand.meta_ig_account_id || !brand.meta_page_token) {
      return res.status(400).json({ error: 'Instagram not connected' });
    }

    if (!content.image_url) {
      return res.status(400).json({ error: 'Image required for Instagram' });
    }

    // Create media
    const publishUrl = `${META_GRAPH_URL}/${brand.meta_ig_account_id}/media`;
    
    const hashtags = JSON.parse(content.hashtags || '[]');
    const caption = `${bodyText}\n\n${hashtags.join(' ')}`;

    const response = await axios.post(publishUrl, {
      image_url: content.image_url,
      caption: caption,
      access_token: brand.meta_page_token
    });

    const mediaId = response.data.id;

    // Publish media
    const containerUrl = `${META_GRAPH_URL}/${brand.meta_ig_account_id}/media_publish`;
    await axios.post(containerUrl, {
      creation_id: mediaId,
      access_token: brand.meta_page_token
    });

    // Update content
    db.prepare(`
      UPDATE content 
      SET status = 'published', published_at = datetime('now'), meta_post_id = ?
      WHERE id = ?
    `).run(mediaId, content.id);

    res.json({
      success: true,
      platform: 'instagram',
      postId: mediaId
    });
  } catch (err) {
    console.error('Instagram publish error:', err.response?.data || err.message);
    res.status(500).json({
      error: 'Failed to publish to Instagram',
      details: err.response?.data?.error?.message || err.message
    });
  }
}

async function publishToFacebook(res, content, brand, bodyText) {
  try {
    if (!brand.meta_page_id || !brand.meta_page_token) {
      return res.status(400).json({ error: 'Facebook not connected' });
    }

    const hashtags = JSON.parse(content.hashtags || '[]');
    const message = `${bodyText}\n\n${hashtags.join(' ')}`;

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

    // Update content
    db.prepare(`
      UPDATE content 
      SET status = 'published', published_at = datetime('now'), meta_post_id = ?
      WHERE id = ?
    `).run(postId, content.id);

    res.json({
      success: true,
      platform: 'facebook',
      postId
    });
  } catch (err) {
    console.error('Facebook publish error:', err.response?.data || err.message);
    res.status(500).json({
      error: 'Failed to publish to Facebook',
      details: err.response?.data?.error?.message || err.message
    });
  }
}

export async function scheduleContent(req, res) {
  try {
    const { contentId, scheduledFor } = req.body;
    const userId = req.userId;

    const content = db.prepare('SELECT id FROM content WHERE id = ? AND user_id = ?').get(contentId, userId);
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    db.prepare(`
      UPDATE content 
      SET status = 'scheduled', scheduled_for = ?
      WHERE id = ?
    `).run(scheduledFor, contentId);

    res.json({ success: true, scheduledFor });
  } catch (err) {
    console.error('Schedule error:', err);
    res.status(500).json({ error: 'Failed to schedule content' });
  }
}

export function checkScheduledContent() {
  try {
    const now = new Date().toISOString();
    
    // Find scheduled content that's ready to publish
    const scheduledContent = db.prepare(`
      SELECT * FROM content 
      WHERE status = 'scheduled' AND scheduled_for <= ?
    `).all(now);

    console.log(`Found ${scheduledContent.length} scheduled content to publish`);

    scheduledContent.forEach(async (content) => {
      try {
        const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(content.brand_id);
        if (!brand) return;

        // Get first version if multiple
        let bodyText = content.body;
        try {
          const versions = JSON.parse(content.body);
          if (Array.isArray(versions)) {
            bodyText = versions[0];
          }
        } catch (e) {
          // body is already a string
        }

        // Publish to all platforms
        if (content.platform === 'instagram' || content.platform === 'both') {
          await publishToInstagramDirect(content, brand, bodyText);
        }
        if (content.platform === 'facebook' || content.platform === 'both') {
          await publishToFacebookDirect(content, brand, bodyText);
        }

        console.log(`✓ Published scheduled content: ${content.id}`);
      } catch (err) {
        console.error(`Failed to publish scheduled content ${content.id}:`, err);
      }
    });
  } catch (err) {
    console.error('Check scheduled content error:', err);
  }
}

async function publishToInstagramDirect(content, brand, bodyText) {
  if (!brand.meta_ig_account_id || !brand.meta_page_token || !content.image_url) {
    throw new Error('Instagram not properly configured');
  }

  const publishUrl = `${META_GRAPH_URL}/${brand.meta_ig_account_id}/media`;
  const hashtags = JSON.parse(content.hashtags || '[]');
  const caption = `${bodyText}\n\n${hashtags.join(' ')}`;

  const response = await axios.post(publishUrl, {
    image_url: content.image_url,
    caption: caption,
    access_token: brand.meta_page_token
  });

  const mediaId = response.data.id;

  const containerUrl = `${META_GRAPH_URL}/${brand.meta_ig_account_id}/media_publish`;
  await axios.post(containerUrl, {
    creation_id: mediaId,
    access_token: brand.meta_page_token
  });

  db.prepare(`
    UPDATE content 
    SET status = 'published', published_at = datetime('now'), meta_post_id = ?
    WHERE id = ?
  `).run(mediaId, content.id);
}

async function publishToFacebookDirect(content, brand, bodyText) {
  if (!brand.meta_page_id || !brand.meta_page_token) {
    throw new Error('Facebook not properly configured');
  }

  const hashtags = JSON.parse(content.hashtags || '[]');
  const message = `${bodyText}\n\n${hashtags.join(' ')}`;

  const postData = {
    message,
    access_token: brand.meta_page_token
  };

  if (content.image_url) {
    postData.picture = content.image_url;
  }

  const publishUrl = `${META_GRAPH_URL}/${brand.meta_page_id}/feed`;
  const response = await axios.post(publishUrl, postData);

  const postId = response.data.id;

  db.prepare(`
    UPDATE content 
    SET status = 'published', published_at = datetime('now'), meta_post_id = ?
    WHERE id = ?
  `).run(postId, content.id);
}

export async function fetchContentAnalytics(req, res) {
  try {
    const { contentId } = req.params;
    const userId = req.userId;

    const content = db.prepare('SELECT * FROM content WHERE id = ? AND user_id = ?').get(contentId, userId);
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    if (!content.meta_post_id) {
      return res.json({ performance: {} });
    }

    const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(content.brand_id);
    if (!brand || !brand.meta_page_token) {
      return res.json({ performance: {} });
    }

    try {
      // Fetch insights from Meta
      const insightsUrl = `${META_GRAPH_URL}/${content.meta_post_id}/insights`;
      const response = await axios.get(insightsUrl, {
        params: {
          metric: 'engagement,impressions,reach',
          access_token: brand.meta_page_token
        }
      });

      const insights = response.data.data || [];
      const performance = {};

      insights.forEach(metric => {
        performance[metric.name] = metric.values[0]?.value || 0;
      });

      // Update database
      db.prepare('UPDATE content SET performance = ? WHERE id = ?').run(
        JSON.stringify(performance),
        contentId
      );

      res.json({ performance });
    } catch (err) {
      console.error('Fetch analytics error:', err.message);
      res.json({ performance: JSON.parse(content.performance || '{}') });
    }
  } catch (err) {
    console.error('Get analytics error:', err);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
}
