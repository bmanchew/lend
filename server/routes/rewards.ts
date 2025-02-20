
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
import express from 'express';
import { asyncHandler } from '../lib/async-handler';
import { calculateRewards } from '../services/reward';

const router = express.Router();

router.post('/calculate', asyncHandler(async (req, res) => {
  const { paymentAmount, paymentType, contractId } = req.body;
  
  const rewards = await calculateRewards({
    amount: paymentAmount,
    type: paymentType,
    contractId
  });

  res.json({ rewards });
}));

export default router;
