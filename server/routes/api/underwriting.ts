import { Router } from 'express';
import { bankAnalysisService } from '../../services/bank-analysis';
import { logger } from '../../lib/logger';
import { z } from 'zod';

const router = Router();

// Validation schemas
const underwritingRequestSchema = z.object({
  accessToken: z.string(),
  proposedPayment: z.number().positive()
});

const loanApplicationSchema = z.object({
  accessToken: z.string(),
  proposedPayment: z.number().positive(),
  loanAmount: z.number().positive(),
  loanTerm: z.number().int().positive(),
  merchantId: z.number().int().positive()
});

// Main underwriting analysis endpoint
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

// Pre-qualification endpoint
router.post('/prequalify', async (req, res) => {
  try {
    const { accessToken, proposedPayment, loanAmount, loanTerm, merchantId } = 
      loanApplicationSchema.parse(req.body);

    logger.info('Starting pre-qualification analysis', {
      proposedPayment,
      loanAmount,
      loanTerm,
      merchantId,
      timestamp: new Date().toISOString()
    });

    // Get underwriting metrics
    const metrics = await bankAnalysisService.calculateUnderwritingMetrics(
      accessToken, 
      proposedPayment
    );

    // Additional risk checks specific to pre-qualification
    const additionalRiskFactors = [];
    if (loanAmount > metrics.disposableIncome * 12) {
      additionalRiskFactors.push('Loan amount exceeds annual disposable income');
    }
    
    if (loanTerm > 60) {
      additionalRiskFactors.push('Loan term exceeds maximum allowed period');
    }

    const allRiskFactors = [...metrics.riskFactors, ...additionalRiskFactors];

    const response = {
      isPreQualified: allRiskFactors.length === 0 && metrics.debtToIncomeRatio <= 43,
      maxApprovedAmount: Math.min(
        metrics.disposableIncome * 12,
        metrics.recommendedMaxPayment * loanTerm
      ),
      suggestedMonthlyPayment: metrics.recommendedMaxPayment,
      riskFactors: allRiskFactors,
      metrics,
      timestamp: new Date().toISOString()
    };

    logger.info('Completed pre-qualification analysis', {
      isPreQualified: response.isPreQualified,
      maxApprovedAmount: response.maxApprovedAmount,
      riskFactorCount: response.riskFactors.length
    });

    res.json(response);
  } catch (error: any) {
    logger.error('Error in pre-qualification analysis:', {
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
      error: 'Failed to complete pre-qualification analysis',
      message: error.message || 'Internal server error'
    });
  }
});

export default router;
