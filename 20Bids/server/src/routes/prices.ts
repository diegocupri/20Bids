import express, { Request, Response } from 'express';
import { fetchAggregates, AggregateRange } from '../services/polygon';

const router = express.Router();

const VALID_RANGES = new Set<AggregateRange>(['1D', '1W', '1M', '3M', '1Y', 'ALL']);

// In-memory TTL cache keyed by symbol+range. Polygon free tier limits to 5 RPM.
const cache = new Map<string, { expires: number; payload: any }>();

function ttlFor(range: AggregateRange): number {
    return range === '1D' ? 60_000 : 5 * 60_000;
}

router.get('/history', async (req: Request, res: Response) => {
    try {
        const symbol = (req.query.symbol as string | undefined)?.toUpperCase();
        const range = (req.query.range as string | undefined)?.toUpperCase() as AggregateRange;

        if (!symbol) {
            res.status(400).json({ error: 'symbol query param is required' });
            return;
        }
        if (!range || !VALID_RANGES.has(range)) {
            res.status(400).json({ error: 'range must be one of 1D|1W|1M|3M|1Y|ALL' });
            return;
        }

        const key = `${symbol}:${range}`;
        const hit = cache.get(key);
        if (hit && hit.expires > Date.now()) {
            res.json(hit.payload);
            return;
        }

        let { points, resolution } = await fetchAggregates(symbol, range);

        // 1D fallback: weekends + pre-market hours produce zero bars. Pull
        // a wider window and serve only the latest day with data so the
        // chart shows e.g. "last Friday" instead of "Chart unavailable".
        if (range === '1D' && points.length === 0) {
            const wider = await fetchAggregates(symbol, '1W');
            if (wider.points.length) {
                const groups = new Map<string, typeof wider.points>();
                for (const p of wider.points) {
                    const dayKey = new Date(p.t).toISOString().slice(0, 10);
                    const arr = groups.get(dayKey) ?? [];
                    arr.push(p);
                    groups.set(dayKey, arr);
                }
                const latestDay = [...groups.keys()].sort().pop();
                if (latestDay) {
                    points = groups.get(latestDay)!;
                    resolution = wider.resolution;
                }
            }
        }

        const payload = { symbol, range, resolution, points };

        cache.set(key, { expires: Date.now() + ttlFor(range), payload });
        res.json(payload);
    } catch (error: any) {
        console.error('Price history error:', error);
        res.status(500).json({ error: error?.message || 'Failed to fetch price history' });
    }
});

export default router;
