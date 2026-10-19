import { Button, Input, Label, TextField } from "heroui-native";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";

/** The account. For now, signing in and out, to prove the way there. */
export default function AccountScreen() {
  const session = authClient.useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (session.data) {
    return (
      <View className="flex-1 items-center justify-center gap-m bg-background p-l">
        <Text className="text-m text-foreground">{session.data.user.email}</Text>
        <Button variant="secondary" onPress={() => void authClient.signOut()}>
          <Button.Label>{m.auth_sign_out()}</Button.Label>
        </Button>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-m p-l pt-xxl"
      keyboardShouldPersistTaps="handled"
    >
      <TextField>
        <Label>{m.auth_email()}</Label>
        <Input
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
        />
      </TextField>
      <TextField>
        <Label>{m.auth_password()}</Label>
        <Input
          autoComplete="current-password"
          secureTextEntry
          textContentType="password"
          value={password}
          onChangeText={setPassword}
        />
      </TextField>
      {error ? <Text className="text-s text-danger">{error}</Text> : null}
      <Button
        onPress={async () => {
          setError(null);
          const signedIn = await authClient.signIn.email({ email, password });
          if (signedIn.error) setError(signedIn.error.message ?? signedIn.error.statusText);
        }}
      >
        <Button.Label>{m.auth_sign_in()}</Button.Label>
      </Button>
    </ScrollView>
  );
}
