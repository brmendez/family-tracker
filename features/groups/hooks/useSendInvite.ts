// features/groups/hooks/useSendInvite.ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '../../../lib/supabase';

type UseSendInviteResult = {
  sendInvite: (email: string) => Promise<{ error: string | null }>;
  sending: boolean;
  sendErrorMessage: string | null;
};

/**
 * FT-9: mirrors useGroups' createGroup shape. Always goes through the
 * send_invite RPC — never a raw insert, since `invites` has no client
 * grants by design (see 0005_invites.sql).
 */
export const useSendInvite = (groupId: string | undefined): UseSendInviteResult => {
  const [sending, setSending] = useState(false);
  const [sendErrorMessage, setSendErrorMessage] = useState<string | null>(
    null,
  );

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const sendInvite = useCallback(
    async (email: string): Promise<{ error: string | null }> => {
      if (!groupId) {
        return { error: 'Missing group.' };
      }

      setSending(true);
      setSendErrorMessage(null);

      const { error } = await supabase.rpc('send_invite', {
        p_group_id: groupId,
        p_email: email,
      });

      if (!isMountedRef.current) {
        return { error: error?.message ?? null };
      }

      setSending(false);

      if (error) {
        setSendErrorMessage(error.message);
        return { error: error.message };
      }

      return { error: null };
    },
    [groupId],
  );

  return { sendInvite, sending, sendErrorMessage };
};
