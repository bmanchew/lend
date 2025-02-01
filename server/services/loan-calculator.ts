
export function calculateMonthlyPayment(
  amount: number,
  annualInterestRate: number,
  termMonths: number
): number {
  // Convert annual interest rate to monthly decimal rate
  const monthlyRate = (annualInterestRate / 100) / 12;
  
  // Calculate loan amount after 5% down payment
  const downPayment = amount * 0.05;
  const principalAfterDownPayment = amount - downPayment;
  
  // Use amortization formula: PMT = P * (r(1+r)^n)/((1+r)^n-1)
  const numerator = monthlyRate * Math.pow(1 + monthlyRate, termMonths);
  const denominator = Math.pow(1 + monthlyRate, termMonths) - 1;
  
  return principalAfterDownPayment * (numerator / denominator);
}

export function calculateTotalInterest(
  monthlyPayment: number,
  amount: number,
  termMonths: number
): number {
  const downPayment = amount * 0.05;
  return (monthlyPayment * termMonths) - (amount - downPayment);
}
