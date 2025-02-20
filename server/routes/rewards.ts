
import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { rewardsBalances } from '@db/schema';

const router = Router();

router.get('/balance', asyncHandler(async (req, res) => {
  const balance = await rewardsBalances.findFirst({
    where: { userId: req.user.id }
  });
  res.json({ balance });
}));

export default router;
