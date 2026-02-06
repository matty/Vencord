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

import { Message } from "@vencord/discord-types";
import { Parser, useEffect, useRef, useState } from "@webpack/common";

import { TranslateIcon } from "./TranslateIcon";
import { isMessageSelected, useSelectionState } from "./selectionMode";
import { cl, TranslationValue } from "./utils";

import { TranslationStore } from "./translationStore";

// Component to highlight selected messages by setting data attribute on parent
export function MessageSelectionIndicator({ messageId }: { messageId: string; }) {
    const ref = useRef<HTMLSpanElement>(null);
    const { isSelectionMode } = useSelectionState();
    const isSelected = isSelectionMode && isMessageSelected(messageId);

    useEffect(() => {
        // Find the parent message list item element
        const messageEl = ref.current?.closest('[class*="messageListItem"]');
        if (messageEl) {
            if (isSelected) {
                messageEl.setAttribute("data-vc-trans-selected", "true");
            } else {
                messageEl.removeAttribute("data-vc-trans-selected");
            }
        }

        return () => {
            // Cleanup on unmount
            const el = ref.current?.closest('[class*="messageListItem"]');
            el?.removeAttribute("data-vc-trans-selected");
        };
    }, [isSelected]);

    // Invisible marker element just to get a ref into the DOM
    return <span ref={ref} style={{ display: "none" }} />;
}


interface TranslationState {
    loading?: boolean;
    translation?: TranslationValue;
    error?: string;
}

const TranslationSetters = new Map<string, (v: TranslationState) => void>();

export function startTranslating(messageId: string, trans?: TranslationValue) {
    TranslationSetters.get(messageId)?.({
        loading: !trans,
        translation: trans
    });
}

export function handleTranslate(messageId: string, data: TranslationValue) {
    TranslationSetters.get(messageId)?.({ translation: data });
}

export function handleTranslateError(messageId: string, error: string) {
    TranslationSetters.get(messageId)?.({ error });
}

function Dismiss({ onDismiss }: { onDismiss: () => void; }) {
    return (
        <button
            onClick={onDismiss}
            className={cl("dismiss")}
        >
            Dismiss
        </button>
    );
}

export function TranslationAccessory({ message }: { message: Message; }) {
    const [state, setState] = useState<TranslationState>(() => {
        const saved = TranslationStore.get(message.id);
        if (saved) {
            return {
                translation: {
                    text: saved.text,
                    sourceLanguage: saved.sourceLanguage
                }
            };
        }
        return {};
    });

    useEffect(() => {
        // Ignore MessageLinkEmbeds messages
        if ((message as any).vencordEmbeddedBy) return;

        TranslationSetters.set(message.id, setState);

        return () => void TranslationSetters.delete(message.id);
    }, []);

    const dismiss = () => {
        setState({});
        TranslationStore.delete(message.id);
    };

    if (state.loading) {
        return (
            <span className={cl("accessory")}>
                <TranslateIcon width={16} height={16} className={cl("accessory-icon")} />
                <em>Translating...</em>
                {" "}<Dismiss onDismiss={dismiss} />
            </span>
        );
    }

    if (state.error) {
        return (
            <span className={cl("accessory")}>
                <TranslateIcon width={16} height={16} className={cl("accessory-icon")} />
                <span style={{ color: "var(--text-danger)" }}>Error: {state.error}</span>
                {" "}<Dismiss onDismiss={dismiss} />
            </span>
        );
    }

    if (!state.translation) return null;

    return (
        <span className={cl("accessory")}>
            <TranslateIcon width={16} height={16} className={cl("accessory-icon")} />
            {Parser.parse(state.translation.text)}
            <br />
            (translated from {state.translation.sourceLanguage} - <Dismiss onDismiss={dismiss} />)
        </span>
    );
}

