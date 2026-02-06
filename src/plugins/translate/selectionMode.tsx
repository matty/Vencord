/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2024 Vendicated and contributors
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

import { Button } from "@components/Button";
import { Message } from "@vencord/discord-types";
import { MessageStore, showToast, Toasts, useEffect, useState } from "@webpack/common";

import { settings } from "./settings";
import { handleTranslate } from "./TranslationAccessory";
import { endProgress, startProgress, updateProgress } from "./progressBar";
import { TranslationStore } from "./translationStore";
import { cl, translate } from "./utils";


// Selection state - simple global toggle
let _isSelectionMode = false;
const _selectedIds = new Set<string>();
let _currentChannelId: string | null = null;
let _lastSelectedId: string | null = null;
let _listeners: Array<() => void> = [];

function notifyListeners() {
    _listeners.forEach(fn => fn());
}

export function isInSelectionMode(): boolean {
    return _isSelectionMode;
}

export function getSelectionChannelId(): string | null {
    return _currentChannelId;
}

export function toggleSelectionMode(): void {
    _isSelectionMode = !_isSelectionMode;
    if (!_isSelectionMode) {
        _selectedIds.clear();
        _currentChannelId = null;
        _lastSelectedId = null;
    }
    notifyListeners();
    showToast(
        _isSelectionMode ? "Multi-select mode ON - Click messages to select" : "Multi-select mode OFF",
        Toasts.Type.MESSAGE
    );
}

export function exitSelectionMode(): void {
    _isSelectionMode = false;
    _selectedIds.clear();
    _currentChannelId = null;
    _lastSelectedId = null;
    notifyListeners();
}

export function isMessageSelected(messageId: string): boolean {
    return _selectedIds.has(messageId);
}

export function toggleMessageSelection(messageId: string, channelId: string): void {
    if (!_isSelectionMode) return;

    // Auto-set channel on first selection
    if (!_currentChannelId) {
        _currentChannelId = channelId;
    } else if (_currentChannelId !== channelId) {
        // Switched channels - clear and restart
        _selectedIds.clear();
        _currentChannelId = channelId;
        _lastSelectedId = null;
    }

    // Toggle single
    if (_selectedIds.has(messageId)) {
        _selectedIds.delete(messageId);
    } else {
        _selectedIds.add(messageId);
    }
    _lastSelectedId = messageId;

    notifyListeners();
}

export function getSelectedCount(): number {
    return _selectedIds.size;
}

// Hook to subscribe to selection state changes
export function useSelectionState() {
    const [, forceUpdate] = useState({});

    useEffect(() => {
        const listener = () => forceUpdate({});
        _listeners.push(listener);
        return () => {
            _listeners = _listeners.filter(l => l !== listener);
        };
    }, []);

    return {
        isSelectionMode: _isSelectionMode,
        selectedCount: _selectedIds.size,
        channelId: _currentChannelId
    };
}

// Floating action bar component - only shows when messages are actually selected
export function SelectionActionBar() {
    const { isSelectionMode, selectedCount, channelId } = useSelectionState();
    const [isTranslating, setIsTranslating] = useState(false);

    // Only show bar when in selection mode AND at least one message is selected
    if (!isSelectionMode || selectedCount === 0) return null;

    const handleTranslateSelected = async () => {
        if (!channelId || selectedCount === 0) return;

        setIsTranslating(true);
        const messages = MessageStore.getMessages(channelId).toArray();
        const selectedMessages = messages.filter((m: Message) => _selectedIds.has(m.id) && m.content);

        startProgress(selectedMessages.length);

        try {
            for (let i = 0; i < selectedMessages.length; i++) {
                const msg = selectedMessages[i];
                // Don't call startTranslating - progress bar handles feedback for batch mode
                const trans = await translate("received", msg.content);
                handleTranslate(msg.id, trans);
                TranslationStore.save(
                    msg.id,
                    trans,
                    settings.store.service === "openrouter" ? settings.store.openrouterModel : undefined
                );
                updateProgress(i + 1);
            }
            showToast(`Translated ${selectedMessages.length} messages`, Toasts.Type.SUCCESS);
        } catch (e) {
            showToast(e instanceof Error ? e.message : "Translation failed", Toasts.Type.FAILURE);
        } finally {
            endProgress();
            setIsTranslating(false);
            exitSelectionMode();
        }
    };


    return (
        <div className={cl("selection-bar")}>
            <span className={cl("selection-bar-count")}>
                {selectedCount} message{selectedCount !== 1 ? "s" : ""} selected
            </span>
            <div className={cl("selection-bar-actions")}>
                <Button
                    size="small"
                    variant="primary"
                    onClick={handleTranslateSelected}
                    disabled={selectedCount === 0 || isTranslating}
                >
                    {isTranslating ? "Translating..." : "Translate All"}
                </Button>
                <Button
                    size="small"
                    variant="secondary"
                    onClick={exitSelectionMode}
                >
                    Cancel
                </Button>
            </div>
        </div>
    );
}
