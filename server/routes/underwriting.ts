import { Router } from 'express';
import { bankAnalysisService } from '../services/bank-analysis';
import { logger } from '../lib/logger';
import { z } from 'zod';

const router = Router();

const underwritingRequestSchema = z.object({
  accessToken: z.string(),
  proposedPayment: z.number().positive()
});

router.post('/analyze', async (req, res) => {
  try {
    const { accessToken, proposedPayment } = underwritingRequestSchema.parse(req.body);

    logger.info('Starting underwriting analysis', {
      proposedPayment,
      timestamp: new Date().toISOString()
    });

    const [income, expenses, metrics] = await Promise.all([
      bankAnalysisService.analyzeIncome(accessToken),
      bankAnalysisService.analyzeExpenses(accessToken),
      bankAnalysisService.calculateUnderwritingMetrics(accessToken, proposedPayment)
    ]);

    logger.info('Completed underwriting analysis', {
      dti: metrics.debtToIncomeRatio,
      hasStableIncome: metrics.hasStableIncome,
      riskFactorCount: metrics.riskFactors.length
    });

    res.json({
      income,
      expenses,
      metrics,
      timestamp: new Date().toISOString(),
      isApproved: metrics.riskFactors.length === 0 && metrics.debtToIncomeRatio <= 43
    });
  } catch (error: any) {
    logger.error('Error in underwriting analysis:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request parameters',
        details: error.errors
      });
    }

    res.status(500).json({
      error: 'Failed to complete underwriting analysis',
      message: error.message || 'Internal server error'
    });
  }
});

export default router;
