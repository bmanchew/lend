
import SMSService from '../sms';

describe('SMSService', () => {
  describe('formatPhoneNumber', () => {
    it('formats 10-digit number correctly', () => {
      const result = (SMSService as any).formatPhoneNumber('1234567890');
      expect(result).toBe('+11234567890');
    });

    it('handles number with formatting characters', () => {
      const result = (SMSService as any).formatPhoneNumber('(123) 456-7890');
      expect(result).toBe('+11234567890');
    });

    it('throws error for invalid numbers', () => {
      expect(() => (SMSService as any).formatPhoneNumber('123')).toThrow();
    });
  });
});
