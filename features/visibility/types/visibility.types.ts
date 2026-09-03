// features/visibility/types/visibility.types.ts
export type VisibilityDuration = '1h' | '2h' | '4h' | 'allDay' | 'indefinite';

export type GroupVisibilityState = {
  isHidden: boolean;
  expiresAt: string | null;
};
