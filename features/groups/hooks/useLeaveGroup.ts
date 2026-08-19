// features/groups/hooks/useLeaveGroup.ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../../../context/auth.context';
import { supabase } from '../../../lib/supabase';

type UseLeaveGroupResult = {
  leaveGroup: (groupId: string) => Promise<{ error: string | null }>;
  leaving: boolean;
  leaveErrorMessage: string | null;
};

// Matches the exception text raised by prevent_ownerless_group_leave()
// (0007_leave_group_owner_guard.sql) — used to distinguish that specific,
// expected failure from any other unexpected delete error.
const OWNER_GUARD_ERROR_FRAGMENT = 'cannot leave a group that still has other members';
const OWNER_GUARD_FRIENDLY_MESSAGE =
  "You're the owner — remove the other members first, or wait until you're the only one left, before leaving this group.";
const GENERIC_FAILURE_MESSAGE = 'Could not leave this group. Please try again.';

/**
 * FT-11: mirrors useSendInvite's shape. Deletes the caller's own
 * group_members row directly — group_members_delete_self_or_owner
 * (0004_groups.sql) already permits it, no RPC needed. FT-7's
 * delete_group_if_empty trigger and this ticket's
 * prevent_ownerless_group_leave trigger (0007) both run server-side as a
 * result.
 */
export const useLeaveGroup = (): UseLeaveGroupResult => {
  const { userId } = useAuth();
  const [leaving, setLeaving] = useState(false);
  const [leaveErrorMessage, setLeaveErrorMessage] = useState<string | null>(
    null,
  );

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const leaveGroup = useCallback(
    async (groupId: string): Promise<{ error: string | null }> => {
      if (!userId) {
        return { error: GENERIC_FAILURE_MESSAGE };
      }

      setLeaving(true);
      setLeaveErrorMessage(null);

      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', userId);

      if (!isMountedRef.current) {
        return { error: error?.message ?? null };
      }

      setLeaving(false);

      if (error) {
        const friendlyMessage = error.message.includes(OWNER_GUARD_ERROR_FRAGMENT)
          ? OWNER_GUARD_FRIENDLY_MESSAGE
          : GENERIC_FAILURE_MESSAGE;

        setLeaveErrorMessage(friendlyMessage);
        return { error: friendlyMessage };
      }

      return { error: null };
    },
    [userId],
  );

  return { leaveGroup, leaving, leaveErrorMessage };
};
