import type { SavedList } from "@repo/client/viewer/types";
import { APP_NAME } from "@repo/config/app";
import { CopyIcon, Link2Icon, LockIcon, RestartIcon, ShareIcon, XIcon } from "@repo/ui/icon";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { View } from "react-native";

import { confirmDestructive } from "@/components/saved/confirm";
import { Button } from "@/components/ui/button";
import { feel } from "@/components/ui/haptics";
import { Row, Section } from "@/components/ui/list";
import { useTell } from "@/components/ui/toast";
import { ENV } from "@/env";
import { shareLink } from "@/lib/share";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

import { listName } from "./items";
import { listLinkOf } from "./links";
import { TextField } from "./text-field";
import type { useListMutations } from "./use-list-mutations";

// Sharing a list, as the web's `ShareListDialog` does, in the grouped rows of a list's screen:
// its link to copy or to send through the phone's own share sheet, how many accounts kept it,
// the password it may ask for, a new link and the end of it, each of the two asked first. The
// list's private spots are said before the link is made: whoever has it sees them (decision
// 035).

// A password as the API takes it.
const PASSWORD_LEAST = 4;
const PASSWORD_MOST = 72;

type ShareSectionProps = {
  list: SavedList;
  /** How many of the list's spots only their owner sees today. */
  privateSpots: number;
  mutations: ReturnType<typeof useListMutations>;
};

export function ShareSection({ list, privateSpots, mutations }: ShareSectionProps) {
  const tell = useTell();
  const share = list.share;
  const busy = mutations.isSharing;

  const warning =
    privateSpots > 0 ? (
      <Row
        icon={LockIcon}
        title={
          privateSpots === 1 ? m.share_private_one() : m.share_private_some({ count: privateSpots })
        }
      />
    ) : null;

  if (!share) {
    return (
      <Section title={m.native_sharing()} footer={m.share_what()}>
        {warning}
        <Row
          icon={Link2Icon}
          title={m.share_create()}
          chevron={false}
          disabled={busy}
          onPress={() => {
            void mutations.share.mutateAsync({ id: list.id }).then(
              () => feel("done"),
              () => {},
            );
          }}
        />
      </Section>
    );
  }

  const link = listLinkOf(ENV.EXPO_PUBLIC_SITE_URL, getLocale(), share.token);
  const name = listName(list);

  async function copy() {
    try {
      await Clipboard.setStringAsync(link);
      tell({ title: m.share_copied(), tone: "success" });
    } catch {
      tell({ title: m.share_copy_failed(), tone: "danger" });
    }
  }

  async function send() {
    await shareLink({
      title: name,
      message: m.place_share_text({ name, app: APP_NAME }),
      url: link,
    });
  }

  async function renew() {
    const sure = await confirmDestructive({
      title: m.share_renew(),
      message: m.native_share_renew_text(),
      confirm: m.share_renew(),
    });
    if (!sure) return;
    await mutations.renewShare.mutateAsync({ id: list.id }).then(
      () => tell({ title: m.share_renewed(), tone: "success" }),
      () => {},
    );
  }

  async function stop() {
    const sure = await confirmDestructive({
      title: m.share_stop(),
      message: m.native_share_stop_text(),
      confirm: m.share_stop(),
    });
    if (!sure) return;
    await mutations.unshare.mutateAsync({ id: list.id }).then(
      () => tell({ title: m.share_stopped(), tone: "success" }),
      () => {},
    );
  }

  const members =
    share.members === 0
      ? m.share_members_none()
      : share.members === 1
        ? m.share_members_one()
        : m.share_members_some({ count: share.members });

  return (
    <>
      <Section title={m.native_sharing()} footer={members}>
        <Row
          icon={CopyIcon}
          title={m.native_copy_link()}
          description={link}
          chevron={false}
          onPress={() => void copy()}
        />
        <Row
          icon={ShareIcon}
          title={m.native_send_link()}
          chevron={false}
          onPress={() => void send()}
        />
        {warning}
      </Section>
      <Section title={m.share_password()}>
        {share.hasPassword ? (
          <Row key="on" icon={LockIcon} title={m.share_password_on()} />
        ) : (
          <PasswordRow
            key="field"
            busy={busy}
            onAdd={(password) => mutations.share.mutateAsync({ id: list.id, password })}
          />
        )}
        {share.hasPassword ? (
          <Row
            key="remove"
            title={m.share_password_remove()}
            chevron={false}
            disabled={busy}
            onPress={() => {
              void mutations.share.mutateAsync({ id: list.id, password: null }).then(
                () => feel("done"),
                () => {},
              );
            }}
          />
        ) : null}
      </Section>
      <Section>
        <Row
          icon={RestartIcon}
          title={m.share_renew()}
          chevron={false}
          disabled={busy}
          onPress={() => void renew()}
        />
        <Row
          icon={XIcon}
          title={m.share_stop()}
          destructive
          chevron={false}
          disabled={busy}
          onPress={() => void stop()}
        />
      </Section>
    </>
  );
}

/** The password a link may ask for, typed in its row and added with the keyboard's own key too. */
function PasswordRow({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (password: string) => Promise<unknown>;
}) {
  const { space } = useTheme();
  const [password, setPassword] = useState("");
  const enough = password.length >= PASSWORD_LEAST;

  const add = () => {
    if (!enough || busy) return;
    void onAdd(password).then(
      () => {
        feel("done");
        setPassword("");
      },
      // What failed was told: what was typed stays, to be sent again.
      () => {},
    );
  };

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.s,
        paddingLeft: space.m,
        paddingRight: space.xs,
        paddingVertical: space.xxs,
      }}
    >
      <TextField
        value={password}
        onChangeText={setPassword}
        placeholder={m.share_password_placeholder()}
        accessibilityLabel={m.share_password()}
        accessibilityHint={m.share_password_placeholder()}
        maxLength={PASSWORD_MOST}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        textContentType="none"
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
        onSubmitEditing={add}
        editable={!busy}
      />
      <Button variant="secondary" onPress={add} disabled={!enough} loading={busy && enough}>
        {m.share_password_add()}
      </Button>
    </View>
  );
}
