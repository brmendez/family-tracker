// features/map/hooks/useOtherProfile.ts
import { useEffect, useState } from 'react';

import { useAuth } from '../../../context/auth.context';
import { supabase } from '../../../lib/supabase';

export type OtherProfile = {
  id: string;
  displayName: string;
  avatarColor: string | null;
};

type UseOtherProfileResult = {
  otherProfile: OtherProfile | null; // null while loading OR if none exists yet
  loading: boolean;
  errorMessage: string | null;
};

/**
 * v1-only: with exactly two hardcoded users, "the other profile" is simply
 * "the profiles row that isn't mine." Queries profiles where id != own
 * userId. Zero rows is a valid state (not an error) — the other person
 * hasn't signed up yet. If a third profile exists before FT-12, which one
 * comes back is undefined — accepted v1 limitation.
 */
export const useOtherProfile = (): UseOtherProfileResult => {
  const { userId } = useAuth();
  const [otherProfile, setOtherProfile] = useState<OtherProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setOtherProfile(null);
      setLoading(false);
      return;
    }

    let isCancelled = false;

    const loadOtherProfile = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_color')
        .neq('id', userId)
        .limit(1);

      if (isCancelled) {
        return;
      }

      if (error) {
        setErrorMessage(error.message);
        setOtherProfile(null);
        setLoading(false);
        return;
      }

      const row = data[0] ?? null;
      setOtherProfile(
        row
          ? {
              id: row.id,
              displayName: row.display_name,
              avatarColor: row.avatar_color,
            }
          : null,
      );
      setErrorMessage(null);
      setLoading(false);
    };

    loadOtherProfile();

    return () => {
      isCancelled = true;
    };
  }, [userId]);

  return { otherProfile, loading, errorMessage };
};
