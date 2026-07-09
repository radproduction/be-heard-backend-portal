import axios from 'axios';
import { randomUUID } from 'crypto';
import db from './db.js';

const META_GRAPH_URL = 'https://graph.facebook.com/v18.0';

export async function getAnalytics(req, res) {
  try {
    const userId = req.userId;
    const { brandId, dateRange } = req.query;

    // Get brand
    const brand = db.prepare('SELECT * FROM brands WHERE id = ? AND user_id = ?').get(brandId, userId);
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    // Check if Meta connected
    if (!brand.meta_page_id || !brand.meta_page_token) {
      return res.json({
        connected: false,
        message: 'Connect Meta account to view analytics'
      });
    }

    // Calculate date range
    const days = parseInt(dateRange) || 7;
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    // Fetch page insights
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

    // Fetch IG insights if connected
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

    // Get content performance
    const contentMetrics = db.prepare(`
      SELECT 
        platform,
        COUNT(*) as total_posts,
        AVG(CAST(json_extract(performance, '$.engagement') AS FLOAT)) as avg_engagement,
        AVG(CAST(json_extract(performance, '$.impressions') AS FLOAT)) as avg_impressions,
        AVG(CAST(json_extract(performance, '$.reach') AS FLOAT)) as avg_reach
      FROM content
      WHERE brand_id = ? AND status = 'published' AND published_at >= ?
      GROUP BY platform
    `).all(brandId, startDate.toISOString());

    // Get top posts
    const topPosts = db.prepare(`
      SELECT 
        id, title, platform, body,
        json_extract(performance, '$.engagement') as engagement,
        json_extract(performance, '$.impressions') as impressions,
        published_at
      FROM content
      WHERE brand_id = ? AND status = 'published'
      ORDER BY json_extract(performance, '$.engagement') DESC
      LIMIT 5
    `).all(brandId);

    // Store analytics
    const analyticsId = randomUUID();
    db.prepare(`
      INSERT INTO analytics (
        id, brand_id, metric_name, metric_value
      ) VALUES (?, ?, ?, ?)
    `).run(analyticsId, brandId, 'sync_timestamp', Date.now());

    res.json({
      connected: true,
      brandId,
      dateRange: days,
      pageInsights,
      igInsights,
      contentMetrics: contentMetrics.map(m => ({
        platform: m.platform,
        total_posts: m.total_posts,
        avg_engagement: Math.round(m.avg_engagement || 0),
        avg_impressions: Math.round(m.avg_impressions || 0),
        avg_reach: Math.round(m.avg_reach || 0)
      })),
      topPosts: topPosts.map(p => ({
        id: p.id,
        platform: p.platform,
        engagement: p.engagement || 0,
        impressions: p.impressions || 0,
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

    // Get brand
    const brand = db.prepare('SELECT * FROM brands WHERE id = ? AND user_id = ?').get(brandId, userId);
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    if (!brand.meta_page_id || !brand.meta_page_token) {
      return res.status(400).json({ error: 'Meta account not connected' });
    }

    let synced = 0;

    // Sync page insights
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

      pageRes.data.data?.forEach(metric => {
        const analyticsId = randomUUID();
        db.prepare(`
          INSERT INTO analytics (
            id, brand_id, metric_name, metric_value
          ) VALUES (?, ?, ?, ?)
        `).run(
          analyticsId,
          brandId,
          `page_${metric.name}`,
          metric.values?.[0]?.value || 0
        );
        synced++;
      });
    } catch (err) {
      console.warn('Failed to sync page insights:', err.message);
    }

    // Sync IG insights
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

        igRes.data.data?.forEach(metric => {
          const analyticsId = randomUUID();
          db.prepare(`
            INSERT INTO analytics (
              id, brand_id, metric_name, metric_value
            ) VALUES (?, ?, ?, ?)
          `).run(
            analyticsId,
            brandId,
            `ig_${metric.name}`,
            metric.values?.[0]?.value || 0
          );
          synced++;
        });
      } catch (err) {
        console.warn('Failed to sync IG insights:', err.message);
      }
    }

    // Sync per-post insights
    const publishedContent = db.prepare(`
      SELECT id, meta_post_id, platform FROM content
      WHERE brand_id = ? AND status = 'published' AND meta_post_id IS NOT NULL
    `).all(brandId);

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

        db.prepare(`
          UPDATE content SET performance = ? WHERE id = ?
        `).run(JSON.stringify(performance), content.id);

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

export function getAnalyticsHistory(req, res) {
  try {
    const userId = req.userId;
    const { brandId, metric } = req.query;

    let query = `
      SELECT metric_name, metric_value, recorded_at
      FROM analytics
      WHERE brand_id = ?
    `;
    const params = [brandId];

    if (metric) {
      query += ' AND metric_name LIKE ?';
      params.push(`%${metric}%`);
    }

    query += ' ORDER BY recorded_at DESC LIMIT 100';

    const history = db.prepare(query).all(...params);
    res.json(history);
  } catch (err) {
    console.error('Get analytics history error:', err);
    res.status(500).json({ error: 'Failed to get analytics history' });
  }
}
