import axios from 'axios';
import { Content, Brand } from './models/index.js';

const META_API_VERSION = 'v18.0';
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;

function firstVersion(body) {
  if (Array.isArray(body)) return body[0];
  return body;
}

export async function publishContent(req, res) {
  try {
    const { contentId, platform } = req.body;
    const userId = req.userId;

    const content = await Content.findOne({ id: contentId, user_id: userId }).lean();
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const brand = await Brand.findOne({ id: content.brand_id }).lean();
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    const bodyText = firstVersion(content.body);

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

    const publishUrl = `${META_GRAPH_URL}/${brand.meta_ig_account_id}/media`;
    const hashtags = content.hashtags || [];
    const caption = `${bodyText}\n\n${hashtags.join(' ')}`;

    const response = await axios.post(publishUrl, {
      image_url: content.image_url,
      caption,
      access_token: brand.meta_page_token
    });

    const mediaId = response.data.id;

    const containerUrl = `${META_GRAPH_URL}/${brand.meta_ig_account_id}/media_publish`;
    await axios.post(containerUrl, {
      creation_id: mediaId,
      access_token: brand.meta_page_token
    });

    await Content.updateOne(
      { id: content.id },
      { $set: { status: 'published', published_at: new Date(), meta_post_id: mediaId } }
    );

    res.json({ success: true, platform: 'instagram', postId: mediaId });
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

    const hashtags = content.hashtags || [];
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

    await Content.updateOne(
      { id: content.id },
      { $set: { status: 'published', published_at: new Date(), meta_post_id: postId } }
    );

    res.json({ success: true, platform: 'facebook', postId });
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

    const content = await Content.findOne({ id: contentId, user_id: userId }).select('id').lean();
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    await Content.updateOne(
      { id: contentId },
      { $set: { status: 'scheduled', scheduled_for: scheduledFor } }
    );

    res.json({ success: true, scheduledFor });
  } catch (err) {
    console.error('Schedule error:', err);
    res.status(500).json({ error: 'Failed to schedule content' });
  }
}

export async function checkScheduledContent() {
  try {
    const now = new Date();

    const scheduledContent = await Content.find({
      status: 'scheduled',
      scheduled_for: { $lte: now }
    }).lean();

    if (scheduledContent.length > 0) {
      console.log(`Found ${scheduledContent.length} scheduled content to publish`);
    }

    for (const content of scheduledContent) {
      try {
        const brand = await Brand.findOne({ id: content.brand_id }).lean();
        if (!brand) continue;

        const bodyText = firstVersion(content.body);

        if (content.platform === 'instagram' || content.platform === 'both') {
          await publishToInstagramDirect(content, brand, bodyText);
        }
        if (content.platform === 'facebook' || content.platform === 'both') {
          await publishToFacebookDirect(content, brand, bodyText);
        }

        console.log(`✓ Published scheduled content: ${content.id}`);
      } catch (err) {
        console.error(`Failed to publish scheduled content ${content.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Check scheduled content error:', err);
  }
}

async function publishToInstagramDirect(content, brand, bodyText) {
  if (!brand.meta_ig_account_id || !brand.meta_page_token || !content.image_url) {
    throw new Error('Instagram not properly configured');
  }

  const publishUrl = `${META_GRAPH_URL}/${brand.meta_ig_account_id}/media`;
  const hashtags = content.hashtags || [];
  const caption = `${bodyText}\n\n${hashtags.join(' ')}`;

  const response = await axios.post(publishUrl, {
    image_url: content.image_url,
    caption,
    access_token: brand.meta_page_token
  });

  const mediaId = response.data.id;

  const containerUrl = `${META_GRAPH_URL}/${brand.meta_ig_account_id}/media_publish`;
  await axios.post(containerUrl, {
    creation_id: mediaId,
    access_token: brand.meta_page_token
  });

  await Content.updateOne(
    { id: content.id },
    { $set: { status: 'published', published_at: new Date(), meta_post_id: mediaId } }
  );
}

async function publishToFacebookDirect(content, brand, bodyText) {
  if (!brand.meta_page_id || !brand.meta_page_token) {
    throw new Error('Facebook not properly configured');
  }

  const hashtags = content.hashtags || [];
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

  await Content.updateOne(
    { id: content.id },
    { $set: { status: 'published', published_at: new Date(), meta_post_id: postId } }
  );
}

export async function fetchContentAnalytics(req, res) {
  try {
    const { contentId } = req.params;
    const userId = req.userId;

    const content = await Content.findOne({ id: contentId, user_id: userId }).lean();
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    if (!content.meta_post_id) {
      return res.json({ performance: {} });
    }

    const brand = await Brand.findOne({ id: content.brand_id }).lean();
    if (!brand || !brand.meta_page_token) {
      return res.json({ performance: {} });
    }

    try {
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

      await Content.updateOne({ id: contentId }, { $set: { performance } });

      res.json({ performance });
    } catch (err) {
      console.error('Fetch analytics error:', err.message);
      res.json({ performance: content.performance || {} });
    }
  } catch (err) {
    console.error('Get analytics error:', err);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
}
