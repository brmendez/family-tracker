// features/groups/components/CreateGroupForm.tsx
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const DEFAULT_GROUP_NAME = 'Family';

type CreateGroupFormProps = {
  onCreate: (name: string) => Promise<{ error: string | null }>;
  creating: boolean;
  createErrorMessage: string | null;
};

/**
 * FT-8's create-group form: a text input prefilled with "Family" and a
 * Create button. Client-side validates non-empty (trimmed) to mirror the
 * DB's check(char_length(btrim(name)) > 0) constraint and avoid a
 * preventable round trip. On success, resets the input back to "Family" —
 * the new group itself shows up via GroupsScreen's list (useGroups
 * refetches on success), not anything this component touches directly.
 */
export const CreateGroupForm = ({
  onCreate,
  creating,
  createErrorMessage,
}: CreateGroupFormProps) => {
  const [name, setName] = useState(DEFAULT_GROUP_NAME);

  const trimmedName = name.trim();
  const isNameEmpty = trimmedName.length === 0;

  const handleCreate = async () => {
    if (isNameEmpty) {
      return;
    }

    const { error } = await onCreate(trimmedName);

    if (!error) {
      setName(DEFAULT_GROUP_NAME);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Group name"
        editable={!creating}
      />

      {isNameEmpty ? (
        <Text style={styles.error}>Group name can&apos;t be empty.</Text>
      ) : null}

      {createErrorMessage ? (
        <Text style={styles.error}>{createErrorMessage}</Text>
      ) : null}

      <Pressable
        style={[styles.button, (creating || isNameEmpty) && styles.buttonDisabled]}
        onPress={handleCreate}
        disabled={creating || isNameEmpty}
      >
        {creating ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Create</Text>
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
