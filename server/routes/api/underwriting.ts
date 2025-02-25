import { Router } from 'express';
import { bankAnalysisService } from '../../services/bank-analysis';
import { logger } from '../../lib/logger';
import { z } from 'zod';

const router = Router();

// Log version on module load
logger.info('Initializing Underwriting API v2 with enhanced scoring system');

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
    logger.info('Starting underwriting analysis with enhanced scoring', {
      timestamp: new Date().toISOString()
    });

    const { accessToken, proposedPayment } = underwritingRequestSchema.parse(req.body);

    const metrics = await bankAnalysisService.calculateUnderwritingMetrics(accessToken, proposedPayment);

    logger.info('Completed underwriting analysis', {
      tier: metrics.tier,
      totalScore: metrics.totalScore,
      isQualified: metrics.isQualified
    });

    res.json({
      status: metrics.isQualified ? 'qualified' : 'not_qualified',
      underwriting: {
        tier: metrics.tier,
        totalScore: metrics.totalScore,
        factorScores: {
          income: metrics.assetMetrics?.incomeScore || 0,
          employment: metrics.employmentScore,
          credit: 5, // Placeholder
          dti: metrics.expenses?.dtiScore || 0,
          housing: metrics.assetMetrics?.housingScore || 0,
          delinquency: 5 // Placeholder
        }
      },
      financials: {
        income: {
          monthly: metrics.disposableIncome,
          annual: metrics.annualIncome,
          stability: metrics.hasStableIncome ? 'stable' : 'unstable'
        },
        debtToIncome: {
          ratio: metrics.debtToIncomeRatio,
          score: metrics.expenses?.dtiScore || 0
        },
        assets: {
          total: metrics.assetMetrics?.totalAssets || 0,
          averageBalance: metrics.assetMetrics?.averageBalance || 0,
          stability: metrics.assetMetrics?.balanceStability || 0,
          housingStatus: metrics.assetMetrics?.housingStatus || 'Unknown'
        }
      },
      assessment: {
        maxMonthlyPayment: metrics.recommendedMaxPayment,
        riskFactors: metrics.riskFactors,
      },
      timestamp: new Date().toISOString()
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

// Pre-qualification endpoint with asset verification
router.post('/prequalify', async (req, res) => {
  try {
    logger.info('Starting pre-qualification analysis with enhanced scoring');

    const { accessToken, proposedPayment, loanAmount, loanTerm, merchantId } = 
      loanApplicationSchema.parse(req.body);

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
      status: metrics.isQualified && allRiskFactors.length === 0 ? 'pre_qualified' : 'not_qualified',
      underwriting: {
        tier: metrics.tier,
        totalScore: metrics.totalScore,
        factorScores: {
          income: metrics.assetMetrics?.incomeScore || 0,
          employment: metrics.employmentScore,
          credit: 5, // Placeholder
          dti: metrics.expenses?.dtiScore || 0,
          housing: metrics.assetMetrics?.housingScore || 0,
          delinquency: 5 // Placeholder
        }
      },
      terms: {
        maxApprovedAmount: Math.min(
          metrics.disposableIncome * 12,
          metrics.recommendedMaxPayment * loanTerm
        ),
        suggestedMonthlyPayment: metrics.recommendedMaxPayment,
        maxTerm: 60
      },
      assessment: {
        riskFactors: allRiskFactors
      },
      timestamp: new Date().toISOString()
    };

    logger.info('Completed pre-qualification analysis', {
      tier: metrics.tier,
      totalScore: metrics.totalScore,
      isPreQualified: response.status === 'pre_qualified',
      maxApprovedAmount: response.terms.maxApprovedAmount
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