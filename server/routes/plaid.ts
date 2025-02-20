
import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { LedgerManager } from '../services/ledger-manager';

const router = Router();
const ledgerManager = new LedgerManager();

router.post('/ledger/start-sweeps', asyncHandler(async (req, res) => {
  await ledgerManager.startSweeps();
  res.json({ status: 'success' });
}));

router.post('/ledger/stop-sweeps', asyncHandler(async (req, res) => {
  await ledgerManager.stopSweeps();
  res.json({ status: 'success' });
}));

router.post('/ledger/manual-sweep', asyncHandler(async (req, res) => {
  const { type, amount } = req.body;
  const result = await ledgerManager.manualSweep(type, amount);
  res.json(result);
}));

export default router;
