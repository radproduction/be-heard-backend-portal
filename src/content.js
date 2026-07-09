import { randomUUID } from 'crypto';
import db from './db.js';

export function createContent(req, res) {
  try {
    const { brandId, type, platform, body, imageUrl, status } = req.body;
    const userId = req.userId;

    const contentId = randomUUID();
    db.prepare(`
      INSERT INTO content (
        id, brand_id, user_id, type, platform, body, image_url, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(contentId, brandId, userId, type, platform, body, imageUrl, status || 'draft');

    res.json({ id: contentId, status: status || 'draft' });
  } catch (err) {
    console.error('Create content error:', err);
    res.status(500).json({ error: 'Failed to create content' });
  }
}

export function getContent(req, res) {
  try {
    const userId = req.userId;
    const { type, platform, status, search } = req.query;

    let query = 'SELECT * FROM content WHERE user_id = ?';
    const params = [userId];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    if (platform) {
      query += ' AND platform = ?';
      params.push(platform);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (search) {
      query += ' AND (body LIKE ? OR media_brief LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY created_at DESC';

    const content = db.prepare(query).all(...params);

    const parsed = content.map(c => ({
      ...c,
      body: JSON.parse(c.body),
      hashtags: JSON.parse(c.hashtags),
      performance: JSON.parse(c.performance)
    }));

    res.json(parsed);
  } catch (err) {
    console.error('Get content error:', err);
    res.status(500).json({ error: 'Failed to get content' });
  }
}

export function getContentById(req, res) {
  try {
    const { contentId } = req.params;
    const userId = req.userId;

    const content = db.prepare('SELECT * FROM content WHERE id = ? AND user_id = ?').get(contentId, userId);
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    content.body = JSON.parse(content.body);
    content.hashtags = JSON.parse(content.hashtags);
    content.performance = JSON.parse(content.performance);

    res.json(content);
  } catch (err) {
    console.error('Get content error:', err);
    res.status(500).json({ error: 'Failed to get content' });
  }
}

export function updateContent(req, res) {
  try {
    const { contentId } = req.params;
    const userId = req.userId;
    const { body, imageUrl, status, scheduledFor } = req.body;

    const content = db.prepare('SELECT id FROM content WHERE id = ? AND user_id = ?').get(contentId, userId);
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const updates = [];
    const values = [];

    if (body !== undefined) {
      updates.push('body = ?');
      values.push(typeof body === 'string' ? body : JSON.stringify(body));
    }
    if (imageUrl !== undefined) {
      updates.push('image_url = ?');
      values.push(imageUrl);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }
    if (scheduledFor !== undefined) {
      updates.push('scheduled_for = ?');
      values.push(scheduledFor);
    }

    if (updates.length === 0) {
      return res.json({ id: contentId });
    }

    values.push(contentId);
    db.prepare(`UPDATE content SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    res.json({ id: contentId });
  } catch (err) {
    console.error('Update content error:', err);
    res.status(500).json({ error: 'Failed to update content' });
  }
}

export function deleteContent(req, res) {
  try {
    const { contentId } = req.params;
    const userId = req.userId;

    const content = db.prepare('SELECT id FROM content WHERE id = ? AND user_id = ?').get(contentId, userId);
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    db.prepare('DELETE FROM content WHERE id = ?').run(contentId);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete content error:', err);
    res.status(500).json({ error: 'Failed to delete content' });
  }
}

export function getDashboardStats(req, res) {
  try {
    const userId = req.userId;
    const brandId = req.query.brandId;

    const stats = {
      totalContent: 0,
      scheduled: 0,
      published: 0,
      engagementRate: 0
    };

    // Build WHERE clause: always filter by user_id, optionally by brand_id
    const whereClause = brandId
      ? 'WHERE user_id = ? AND brand_id = ?'
      : 'WHERE user_id = ?';
    const params = brandId ? [userId, brandId] : [userId];

    // Total content
    const total = db.prepare(`SELECT COUNT(*) as count FROM content ${whereClause}`).get(...params);
    stats.totalContent = total.count;

    // Scheduled
    const scheduled = db.prepare(`SELECT COUNT(*) as count FROM content ${whereClause} AND status = ?`).get(...params, 'scheduled');
    stats.scheduled = scheduled.count;

    // Published
    const published = db.prepare(`SELECT COUNT(*) as count FROM content ${whereClause} AND status = ?`).get(...params, 'published');
    stats.published = published.count;

    // Average engagement rate
    const engagement = db.prepare(`
      SELECT AVG(CAST(json_extract(performance, '$.engagement_rate') AS FLOAT)) as avg_rate
      FROM content 
      ${whereClause} AND status = 'published'
    `).get(...params);
    stats.engagementRate = Math.round((engagement.avg_rate || 0) * 100) / 100;

    res.json(stats);
  } catch (err) {
    console.error('Get dashboard stats error:', err);
    res.status(500).json({ error: 'Failed to get stats' });
  }
}
