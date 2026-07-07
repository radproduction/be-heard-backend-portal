import axios from 'axios';
import { randomUUID } from 'crypto';
import { Analytics, Brand, Content } from './models/index.js';

const META_GRAPH_URL = 'https://graph.facebook.com/v18.0';

export async function getAnalytics(req, res) {
  try {
    const userId = req.userId;
    const { brandId, dateRange } = req.query;

    const brand = await Brand.findOne({ id: brandId, user_id: userId }).lean();
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    if (!brand.meta_page_id || !brand.meta_page_token) {
      return res.json({
        connected: false,
        message: 'Connect Meta account to view analytics'
      });
    }

    const days = parseInt(dateRange) || 7;
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    let pageInsights = {};
    try {
      const pageRes = await axios.get(
        `${META_GRAPH_URL}/${brand.meta_page_id}/insights`,
        {
          params: {
            metric: 'page_impressions,page_engaged_users,page_fans',
            period: 'day',
            since: Math.floor(startDate.getTime() / 1000),
            until: Math.floor(endDate.getTime() / 1000),
            access_token: brand.meta_page_token
          }
        }
      );

      pageRes.data.data?.forEach(metric => {
        pageInsights[metric.name] = metric.values || [];
      });
    } catch (err) {
      console.warn('Failed to fetch page insights:', err.message);
    }

    let igInsights = {};
    if (brand.meta_ig_account_id) {
      try {
        const igRes = await axios.get(
          `${META_GRAPH_URL}/${brand.meta_ig_account_id}/insights`,
          {
            params: {
              metric: 'impressions,reach,follower_count',
              period: 'day',
              since: Math.floor(startDate.getTime() / 1000),
              until: Math.floor(endDate.getTime() / 1000),
              access_token: brand.meta_page_token
            }
          }
        );

        igRes.data.data?.forEach(metric => {
          igInsights[metric.name] = metric.values || [];
        });
      } catch (err) {
        console.warn('Failed to fetch IG insights:', err.message);
      }
    }

    // Content performance grouped by platform
    const contentMetrics = await Content.aggregate([
      { $match: { brand_id: brandId, status: 'published', published_at: { $gte: startDate } } },
      {
        $group: {
          _id: '$platform',
          total_posts: { $sum: 1 },
          avg_engagement: { $avg: '$performance.engagement' },
          avg_impressions: { $avg: '$performance.impressions' },
          avg_reach: { $avg: '$performance.reach' }
        }
      }
    ]);

    // Top posts by engagement
    const topPosts = await Content.find({ brand_id: brandId, status: 'published' })
      .sort({ 'performance.engagement': -1 })
      .limit(5)
      .lean();

    await Analytics.create({
      id: randomUUID(),
      brand_id: brandId,
      metric_name: 'sync_timestamp',
      metric_value: Date.now()
    });

    res.json({
      connected: true,
      brandId,
      dateRange: days,
      pageInsights,
      igInsights,
      contentMetrics: contentMetrics.map(m => ({
        platform: m._id,
        total_posts: m.total_posts,
        avg_engagement: Math.round(m.avg_engagement || 0),
        avg_impressions: Math.round(m.avg_impressions || 0),
        avg_reach: Math.round(m.avg_reach || 0)
      })),
      topPosts: topPosts.map(p => ({
        id: p.id,
        platform: p.platform,
        engagement: p.performance?.engagement || 0,
        impressions: p.performance?.impressions || 0,
        published_at: p.published_at
      })),
      fetchedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Get analytics error:', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
}

export async function syncAnalytics(req, res) {
  try {
    const userId = req.userId;
    const { brandId } = req.body;

    const brand = await Brand.findOne({ id: brandId, user_id: userId }).lean();
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    if (!brand.meta_page_id || !brand.meta_page_token) {
      return res.status(400).json({ error: 'Meta account not connected' });
    }

    let synced = 0;

    try {
      const pageRes = await axios.get(
        `${META_GRAPH_URL}/${brand.meta_page_id}/insights`,
        {
          params: {
            metric: 'page_impressions,page_engaged_users,page_fans',
            period: 'day',
            access_token: brand.meta_page_token
          }
        }
      );

      for (const metric of pageRes.data.data || []) {
        await Analytics.create({
          id: randomUUID(),
          brand_id: brandId,
          metric_name: `page_${metric.name}`,
          metric_value: metric.values?.[0]?.value || 0
        });
        synced++;
      }
    } catch (err) {
      console.warn('Failed to sync page insights:', err.message);
    }

    if (brand.meta_ig_account_id) {
      try {
        const igRes = await axios.get(
          `${META_GRAPH_URL}/${brand.meta_ig_account_id}/insights`,
          {
            params: {
              metric: 'impressions,reach,follower_count',
              period: 'day',
              access_token: brand.meta_page_token
            }
          }
        );

        for (const metric of igRes.data.data || []) {
          await Analytics.create({
            id: randomUUID(),
            brand_id: brandId,
            metric_name: `ig_${metric.name}`,
            metric_value: metric.values?.[0]?.value || 0
          });
          synced++;
        }
      } catch (err) {
        console.warn('Failed to sync IG insights:', err.message);
      }
    }

    // Per-post insights
    const publishedContent = await Content.find({
      brand_id: brandId,
      status: 'published',
      meta_post_id: { $ne: null }
    }).select('id meta_post_id platform -_id').lean();

    for (const content of publishedContent) {
      try {
        const postRes = await axios.get(
          `${META_GRAPH_URL}/${content.meta_post_id}/insights`,
          {
            params: {
              metric: 'engagement,impressions,reach',
              access_token: brand.meta_page_token
            }
          }
        );

        const performance = {};
        postRes.data.data?.forEach(metric => {
          performance[metric.name] = metric.values?.[0]?.value || 0;
        });

        await Content.updateOne({ id: content.id }, { $set: { performance } });
        synced++;
      } catch (err) {
        console.warn(`Failed to sync post ${content.meta_post_id}:`, err.message);
      }
    }

    res.json({
      success: true,
      brandId,
      metricsSync: synced,
      syncedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Sync analytics error:', err);
    res.status(500).json({ error: 'Failed to sync analytics' });
  }
}

export async function getAnalyticsHistory(req, res) {
  try {
    const { brandId, metric } = req.query;

    const filter = { brand_id: brandId };
    if (metric) filter.metric_name = new RegExp(metric, 'i');

    const history = await Analytics.find(filter)
      .sort({ recorded_at: -1 })
      .limit(100)
      .select('metric_name metric_value recorded_at -_id')
      .lean();

    res.json(history);
  } catch (err) {
    console.error('Get analytics history error:', err);
    res.status(500).json({ error: 'Failed to get analytics history' });
  }
}
