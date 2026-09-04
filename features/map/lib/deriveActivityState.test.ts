import { deriveActivityState, getActivityLabel } from './deriveActivityState';

describe('deriveActivityState', () => {
  it('returns null for null input', () => {
    expect(deriveActivityState(null)).toBe(null);
  });

  it('returns "stopped" for speeds below 0.5 m/s', () => {
    expect(deriveActivityState(0)).toBe('stopped');
    expect(deriveActivityState(0.1)).toBe('stopped');
    expect(deriveActivityState(0.49)).toBe('stopped');
  });

  it('returns "stopped" at exactly 0 m/s', () => {
    expect(deriveActivityState(0)).toBe('stopped');
  });

  it('returns "walking" for speeds between 0.5 and 3 m/s', () => {
    expect(deriveActivityState(0.5)).toBe('walking');
    expect(deriveActivityState(1)).toBe('walking');
    expect(deriveActivityState(2.99)).toBe('walking');
  });

  it('returns "driving" for speeds 3 m/s and above', () => {
    expect(deriveActivityState(3)).toBe('driving');
    expect(deriveActivityState(5)).toBe('driving');
    expect(deriveActivityState(20)).toBe('driving');
  });
});

describe('getActivityLabel', () => {
  it('returns "Stopped" for stopped state', () => {
    expect(getActivityLabel('stopped')).toBe('Stopped');
  });

  it('returns "Walking" for walking state', () => {
    expect(getActivityLabel('walking')).toBe('Walking');
  });

  it('returns "Driving" for driving state', () => {
    expect(getActivityLabel('driving')).toBe('Driving');
  });

  it('returns null for null state', () => {
    expect(getActivityLabel(null)).toBe(null);
  });
});
