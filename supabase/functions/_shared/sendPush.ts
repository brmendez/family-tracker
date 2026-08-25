// supabase/functions/_shared/sendPush.ts
// FT-15: shared send primitive for FT-17/FT-27's trigger functions to
// import directly (same Edge Functions project, no extra network hop).
// Not deployed as its own HTTP-reachable function — nothing calls it yet.
// Generic on purpose: no geofence/activity fields, just title/body/an
// opaque data payload the caller shapes.
import { createClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const EXPO_PUSH_BATCH_SIZE = 100; // Expo's documented max messages per request.

type SendPushInput = {
  userIds: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type ExpoPushTicket = {
  status: 'ok' | 'error';
  id?: string;
  details?: { error?: string };
};

type ExpoPushReceipt = {
  status: 'ok' | 'error';
  details?: { error?: string };
};

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
};

const getServiceRoleClient = () => {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }

  return createClient(url, serviceRoleKey);
};

/**
 * Sends messages to Expo's push API and returns, per token, either the
 * DeviceNotRegistered error reported immediately in the ticket, or the
 * receipt id to check later.
 */
const sendBatch = async (
  tokens: string[],
  content: Pick<SendPushInput, 'title' | 'body' | 'data'>,
): Promise<{ tokensToPrune: string[]; receiptIdToToken: Map<string, string> }> => {
  const messages = tokens.map((token) => ({ to: token, ...content }));

  const response = await fetch(EXPO_PUSH_SEND_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });

  const { data: tickets } = (await response.json()) as { data: ExpoPushTicket[] };

  const tokensToPrune: string[] = [];
  const receiptIdToToken = new Map<string, string>();

  tickets.forEach((ticket, index) => {
    const token = tokens[index];

    if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
      tokensToPrune.push(token);
      return;
    }

    if (ticket.status === 'ok' && ticket.id) {
      receiptIdToToken.set(ticket.id, token);
    }
  });

  return { tokensToPrune, receiptIdToToken };
};

/**
 * Checks delivery receipts for previously-sent tickets and returns
 * tokens whose receipt reported DeviceNotRegistered. Best-effort: Expo
 * receipts aren't guaranteed to be available this soon after sending, so
 * this is a lightweight prune on top of location's lazy uninstall
 * handling, not the only line of defense.
 */
const checkReceipts = async (receiptIdToToken: Map<string, string>): Promise<string[]> => {
  if (receiptIdToToken.size === 0) {
    return [];
  }

  const tokensToPrune: string[] = [];

  for (const idBatch of chunk([...receiptIdToToken.keys()], EXPO_PUSH_BATCH_SIZE)) {
    const response = await fetch(EXPO_PUSH_RECEIPTS_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: idBatch }),
    });

    const { data: receipts } = (await response.json()) as {
      data: Record<string, ExpoPushReceipt>;
    };

    for (const [id, receipt] of Object.entries(receipts ?? {})) {
      if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
        const token = receiptIdToToken.get(id);

        if (token) {
          tokensToPrune.push(token);
        }
      }
    }
  }

  return tokensToPrune;
};

export const sendPushNotification = async ({
  userIds,
  title,
  body,
  data,
}: SendPushInput): Promise<void> => {
  if (userIds.length === 0) {
    return;
  }

  const supabase = getServiceRoleClient();

  const { data: tokenRows, error } = await supabase
    .from('push_tokens')
    .select('expo_push_token')
    .in('user_id', userIds);

  if (error) {
    throw new Error(`Failed to look up push tokens: ${error.message}`);
  }

  const tokens = (tokenRows ?? []).map((row) => row.expo_push_token as string);

  if (tokens.length === 0) {
    return;
  }

  const tokensToPrune: string[] = [];
  const receiptIdToToken = new Map<string, string>();

  for (const tokenBatch of chunk(tokens, EXPO_PUSH_BATCH_SIZE)) {
    const result = await sendBatch(tokenBatch, { title, body, data });

    tokensToPrune.push(...result.tokensToPrune);
    result.receiptIdToToken.forEach((token, id) => receiptIdToToken.set(id, token));
  }

  tokensToPrune.push(...(await checkReceipts(receiptIdToToken)));

  if (tokensToPrune.length > 0) {
    await supabase.from('push_tokens').delete().in('expo_push_token', tokensToPrune);
  }
};
