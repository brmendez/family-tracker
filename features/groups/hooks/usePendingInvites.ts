// features/groups/hooks/usePendingInvites.ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../../../context/auth.context';
import { supabase } from '../../../lib/supabase';

export type PendingInvite = {
  id: string;
  groupId: string;
  groupName: string;
  createdAt: string;
};

type RespondDecision = 'accept' | 'decline';

type UsePendingInvitesResult = {
  invites: PendingInvite[];
  loading: boolean;
  errorMessage: string | null;
  refetch: () => Promise<void>;
  respond: (inviteId: string, decision: RespondDecision) => Promise<{ error: string | null }>;
  respondingId: string | null;
  respondErrorMessage: string | null;
  respondErrorInviteId: string | null;
};

type PendingInviteRow = {
  invite_id: string;
  group_id: string;
  group_name: string;
  created_at: string;
};

const toPendingInvite = (row: PendingInviteRow): PendingInvite => ({
  id: row.invite_id,
  groupId: row.group_id,
  groupName: row.group_name,
  createdAt: row.created_at,
});

/**
 * FT-10: mirrors useGroups' shape. Fetches via the list_my_pending_invites
 * RPC on mount and whenever userId changes — invites has no client SELECT
 * grant, everything is RPC-mediated (see 0006_invite_responses.sql).
 * respond() calls accept_invite/decline_invite and refetches on success,
 * so a responded-to row simply drops out of the next list (its status is
 * no longer 'pending'). respondingId tracks a single in-flight id rather
 * than a boolean map, since a user can only reasonably act on one invite
 * at a time.
 */
export const usePendingInvites = (): UsePendingInvitesResult => {
  const { userId } = useAuth();
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [respondErrorMessage, setRespondErrorMessage] = useState<string | null>(
    null,
  );
  const [respondErrorInviteId, setRespondErrorInviteId] = useState<string | null>(
    null,
  );

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchInvites = useCallback(async () => {
    if (!userId) {
      setInvites([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.rpc('list_my_pending_invites');

    if (!isMountedRef.current) {
      return;
    }

    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as PendingInviteRow[];

    setInvites(rows.map(toPendingInvite));
    setErrorMessage(null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  const respond = useCallback(
    async (
      inviteId: string,
      decision: RespondDecision,
    ): Promise<{ error: string | null }> => {
      setRespondingId(inviteId);
      setRespondErrorMessage(null);
      setRespondErrorInviteId(null);

      const rpcName = decision === 'accept' ? 'accept_invite' : 'decline_invite';
      const { error } = await supabase.rpc(rpcName, { p_invite_id: inviteId });

      if (error) {
        if (isMountedRef.current) {
          setRespondErrorMessage(error.message);
          setRespondErrorInviteId(inviteId);
          setRespondingId(null);
        }

        return { error: error.message };
      }

      await fetchInvites();

      if (isMountedRef.current) {
        setRespondingId(null);
      }

      return { error: null };
    },
    [fetchInvites],
  );

  return {
    invites,
    loading,
    errorMessage,
    refetch: fetchInvites,
    respond,
    respondingId,
    respondErrorMessage,
    respondErrorInviteId,
  };
};
