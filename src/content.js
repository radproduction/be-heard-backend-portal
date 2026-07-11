import { randomUUID } from 'crypto';
import { Content } from './models/index.js';

export async function createContent(req, res) {
  try {
    const { brandId, type, platform, body, imageUrl, status } = req.body;
    const userId = req.userId;

    const contentId = randomUUID();
    await Content.create({
      id: contentId,
      brand_id: brandId,
      user_id: userId,
      type,
      platform,
      body,
      image_url: imageUrl,
      status: status || 'draft'
    });

    res.json({ id: contentId, status: status || 'draft' });
  } catch (err) {
    console.error('Create content error:', err);
    res.status(500).json({ error: 'Failed to create content' });
  }
}

export async function getContent(req, res) {
  try {
    const userId = req.userId;
    const { type, platform, status, search } = req.query;

    const filter = { user_id: userId };
    if (type) filter.type = type;
    if (platform) filter.platform = platform;
    if (status) filter.status = status;
    if (search) {
      const rx = new RegExp(search, 'i');
      filter.$or = [
        { media_brief: rx },
        { title: rx },
        { body: { $elemMatch: { $regex: search, $options: 'i' } } }
      ];
    }

    const content = await Content.find(filter).sort({ created_at: -1 }).lean();
    res.json(content);
  } catch (err) {
    console.error('Get content error:', err);
    res.status(500).json({ error: 'Failed to get content' });
  }
}

export async function getContentById(req, res) {
  try {
    const { contentId } = req.params;
    const userId = req.userId;

    const content = await Content.findOne({ id: contentId, user_id: userId }).lean();
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    res.json(content);
  } catch (err) {
    console.error('Get content error:', err);
    res.status(500).json({ error: 'Failed to get content' });
  }
}

export async function updateContent(req, res) {
  try {
    const { contentId } = req.params;
    const userId = req.userId;
    const { body, imageUrl, status, scheduledFor } = req.body;

    const content = await Content.findOne({ id: contentId, user_id: userId }).select('id').lean();
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const set = {};
    if (body !== undefined) set.body = body;
    if (imageUrl !== undefined) set.image_url = imageUrl;
    if (status !== undefined) set.status = status;
    if (scheduledFor !== undefined) set.scheduled_for = scheduledFor;

    if (Object.keys(set).length === 0) {
      return res.json({ id: contentId });
    }

    await Content.updateOne({ id: contentId }, { $set: set });

    res.json({ id: contentId });
  } catch (err) {
    console.error('Update content error:', err);
    res.status(500).json({ error: 'Failed to update content' });
  }
}

export async function deleteContent(req, res) {
  try {
    const { contentId } = req.params;
    const userId = req.userId;

    const content = await Content.findOne({ id: contentId, user_id: userId }).select('id').lean();
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    await Content.deleteOne({ id: contentId });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete content error:', err);
    res.status(500).json({ error: 'Failed to delete content' });
  }
}

export async function getDashboardStats(req, res) {
  try {
    const userId = req.userId;
    const { brandId } = req.query;

    const base = { user_id: userId };
    if (brandId) base.brand_id = brandId;

    const [totalContent, scheduled, published, engagementAgg] = await Promise.all([
      Content.countDocuments(base),
      Content.countDocuments({ ...base, status: 'scheduled' }),
      Content.countDocuments({ ...base, status: 'published' }),
      Content.aggregate([
        { $match: { ...base, status: 'published' } },
        { $group: { _id: null, avg: { $avg: '$performance.engagement_rate' } } }
      ])
    ]);

    const engagementRate = Math.round(((engagementAgg[0]?.avg || 0)) * 100) / 100;

    res.json({
      totalContent,
      scheduled,
      published,
      engagementRate
    });
  } catch (err) {
    console.error('Get dashboard stats error:', err);
    res.status(500).json({ error: 'Failed to get stats' });
  }
}
