/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import "./styles.css";

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { copyWithToast } from "@utils/discord";
import definePlugin from "@utils/types";
import { Channel, Message } from "@vencord/discord-types";
import { ChannelStore, Menu, MessageStore, showToast, Toasts } from "@webpack/common";




import { settings } from "./settings";
import { getSelectionChannelId, isInSelectionMode, isMessageSelected, SelectionActionBar, toggleMessageSelection } from "./selectionMode";
import { setShouldShowTranslateEnabledTooltip, TranslateChatBarIcon, TranslateIcon } from "./TranslateIcon";



import { handleTranslate, handleTranslateError, MessageSelectionIndicator, startTranslating, TranslationAccessory } from "./TranslationAccessory";
import { endProgress, startProgress, TranslationProgressBar } from "./progressBar";
import { TranslationStore } from "./translationStore";
import { cl, translate } from "./utils";


const messageCtxPatch: NavContextMenuPatchCallback = (children, { message }: { message: Message; }) => {

    const content = getMessageContent(message);
    if (!content) return;

    const group = findGroupChildrenByChildId("copy-text", children);
    if (!group) return;

    group.splice(group.findIndex(c => c?.props?.id === "copy-text") + 1, 0, (
        <Menu.MenuItem
            id="vc-trans"
            label="Translate"
            icon={TranslateIcon}
            action={async () => {
                startProgress(1);
                startTranslating(message.id);
                try {
                    const trans = await translate("received", content);
                    handleTranslate(message.id, trans);
                    TranslationStore.save(message.id, trans, settings.store.service === "openrouter" ? settings.store.openrouterModel : undefined);
                } catch (e) {
                    handleTranslateError(message.id, e instanceof Error ? e.message : "Translation failed");
                } finally {
                    endProgress();
                }
            }}
        />
    ));
};

// Store translated channel names: channelId -> { original, translated }
const channelTranslations = new Map<string, { original: string; translated: string; }>();

const channelCtxPatch: NavContextMenuPatchCallback = (children, { channel }: { channel: Channel; }) => {
    if (!channel?.name) return;

    const isTranslated = channelTranslations.has(channel.id);

    if (isTranslated) {
        // Option to remove translation
        children.push(
            <Menu.MenuItem
                id="vc-trans-channel-remove"
                label="Remove Channel Translation"
                icon={TranslateIcon}
                action={() => {
                    const cached = channelTranslations.get(channel.id);
                    if (cached) {
                        (channel as any).name = cached.original;
                        channelTranslations.delete(channel.id);
                        showToast("Translation removed", Toasts.Type.SUCCESS);
                    }
                }}
            />
        );
    } else {
        // Option to translate
        children.push(
            <Menu.MenuItem
                id="vc-trans-channel"
                label="Translate"
                icon={TranslateIcon}
                action={async () => {
                    startProgress(1);
                    showToast("Translating...", Toasts.Type.MESSAGE);
                    try {
                        const originalName = channel.name;
                        const trans = await translate("received", originalName);

                        // Store translation and modify channel name
                        channelTranslations.set(channel.id, {
                            original: originalName,
                            translated: trans.text
                        });

                        // Modify the channel name client-side
                        (channel as any).name = `${originalName} [${trans.text}]`;
                        showToast(`Translated: ${trans.text}`, Toasts.Type.SUCCESS);
                    } catch (e) {
                        showToast(e instanceof Error ? e.message : "Translation failed", Toasts.Type.FAILURE);
                    } finally {
                        endProgress();
                    }
                }}
            />
        );
    }
};


function getMessageContent(message: Message) {
    // Message snapshots is an array, which allows for nested snapshots, which Discord does not do yet.
    // no point collecting content or rewriting this to render in a certain way that makes sense
    // for something currently impossible.
    return message.content
        || message.messageSnapshots?.[0]?.message.content
        || message.embeds?.find(embed => embed.type === "auto_moderation_message")?.rawDescription || "";
}

let tooltipTimeout: any;

export default definePlugin({
    name: "Translate",
    description: "Translate messages with Google Translate, DeepL, or OpenRouter (LLM)",
    authors: [Devs.Ven, Devs.AshtonMemer],
    settings,
    start: () => TranslationStore.load(),


    contextMenus: {
        "message": messageCtxPatch,
        "channel-context": channelCtxPatch,
        "thread-context": channelCtxPatch
    },
    // not used, just here in case some other plugin wants it or w/e
    translate,


    renderMessageAccessory: props => (
        <>
            <MessageSelectionIndicator messageId={props.message.id} />
            <TranslationAccessory message={props.message} />
            <SelectionActionBar />
            <TranslationProgressBar />
        </>
    ),


    chatBarButton: {
        icon: TranslateIcon,
        render: TranslateChatBarIcon
    },

    messagePopoverButton: {
        icon: TranslateIcon,
        render(message: Message) {
            const content = getMessageContent(message);
            if (!content) return null;

            const inSelectionMode = isInSelectionMode();
            const currentSelectionChannel = getSelectionChannelId();
            const inSelectionModeForChannel = inSelectionMode && (currentSelectionChannel === null || currentSelectionChannel === message.channel_id);
            const isSelected = inSelectionModeForChannel && isMessageSelected(message.id);

            return {
                label: inSelectionModeForChannel
                    ? (isSelected ? "Deselect" : "Select")
                    : "Translate",
                icon: TranslateIcon,
                message,
                channel: ChannelStore.getChannel(message.channel_id),
                onClick: inSelectionModeForChannel
                    ? () => toggleMessageSelection(message.id, message.channel_id)
                    : async () => {
                        startProgress(1);
                        startTranslating(message.id);
                        try {
                            const trans = await translate("received", content);
                            handleTranslate(message.id, trans);
                            TranslationStore.save(message.id, trans, settings.store.service === "openrouter" ? settings.store.openrouterModel : undefined);
                        } catch (e) {
                            handleTranslateError(message.id, e instanceof Error ? e.message : "Translation failed");
                        } finally {
                            endProgress();
                        }
                    }
            };
        }
    },




    async onBeforeMessageSend(_, messageObj) {
        if (!settings.store.autoTranslate) return;
        if (!messageObj.content) return;

        setShouldShowTranslateEnabledTooltip?.(true);
        clearTimeout(tooltipTimeout);
        tooltipTimeout = setTimeout(() => setShouldShowTranslateEnabledTooltip?.(false), 2000);

        const trans = await translate("sent", messageObj.content);
        messageObj.content = trans.text;
    }
});
