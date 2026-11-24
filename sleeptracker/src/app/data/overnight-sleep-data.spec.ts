import { OvernightSleepData } from './overnight-sleep-data';

describe('OvernightSleepData', () => {
  it('should create an instance', () => {
    expect(new OvernightSleepData(new Date(2026, 10, 23, 23, 30), new Date(2026, 10, 24, 7, 15))).toBeTruthy();
  });
});
