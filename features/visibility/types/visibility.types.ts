// features/visibility/types/visibility.types.ts
export type VisibilityDuration = '1h' | '2h' | '4h' | 'allDay' | 'indefinite';

export type GroupVisibilityState = {
  isHidden: boolean;
  expiresAt: string | null;
};

// Structurally identical to GroupVisibilityState but kept as a separate
// named type — global and per-group hidden states are semantically
// distinct, not interchangeable.
export type GlobalVisibilityState = {
  isHidden: boolean;
  expiresAt: string | null;
};
