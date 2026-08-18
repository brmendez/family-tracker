// features/groups/components/InviteForm.tsx
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type InviteFormProps = {
  onInvite: (email: string) => Promise<{ error: string | null }>;
  sending: boolean;
  sendErrorMessage: string | null;
};

const isValidEmailShape = (email: string): boolean => {
  return email.includes('@') && email.includes('.');
};

/**
 * FT-9's invite form: mirrors CreateGroupForm's controlled-input +
 * submit + spinner + inline error shape, plus an inline success state
 * ("Invite sent"). Client validation is light (non-empty + @/.) — real
 * validation happens server-side in send_invite.
 */
export const InviteForm = ({
  onInvite,
  sending,
  sendErrorMessage,
}: InviteFormProps) => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const trimmedEmail = email.trim();
  const isEmailValid =
    trimmedEmail.length > 0 && isValidEmailShape(trimmedEmail);

  const handleChangeText = (text: string) => {
    setEmail(text);
    setSent(false);
  };

  const handleInvite = async () => {
    if (!isEmailValid) {
      return;
    }

    const { error } = await onInvite(trimmedEmail);

    if (!error) {
      setEmail('');
      setSent(true);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={handleChangeText}
        placeholder="Email address"
        autoCapitalize="none"
        keyboardType="email-address"
        editable={!sending}
      />

      {email.length > 0 && !isEmailValid ? (
        <Text style={styles.error}>Enter a valid email address.</Text>
      ) : null}

      {sendErrorMessage ? (
        <Text style={styles.error}>{sendErrorMessage}</Text>
      ) : null}

      {sent ? <Text style={styles.success}>Invite sent</Text> : null}

      <Pressable
        style={[
          styles.button,
          (sending || !isEmailValid) && styles.buttonDisabled,
        ]}
        onPress={handleInvite}
        disabled={sending || !isEmailValid}
      >
        {sending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Send invite</Text>
        )}
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  error: {
    color: '#c0392b',
    fontSize: 14,
  },
  success: {
    color: '#15803d',
    fontSize: 14,
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
