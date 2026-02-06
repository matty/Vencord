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

import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { Margins } from "@utils/margins";
import { ModalCloseButton, ModalContent, ModalHeader, ModalProps, ModalRoot, ModalSize } from "@utils/modal";
import { ScrollerThin, SearchableSelect, showToast, Text, TextArea, Toasts, useEffect, useMemo, useState } from "@webpack/common";

import { fetchModels, OpenRouterModel } from "./openrouter";
import { settings } from "./settings";
import { TranslationStore } from "./translationStore";
import { cl, getLanguages } from "./utils";

const LanguageSettingKeys = ["receivedInput", "receivedOutput", "sentInput", "sentOutput"] as const;

type LanguageSettingKey = typeof LanguageSettingKeys[number];

// Helper to extract value from potentially legacy object-based setting
function normalizeSelectValue(v: any): string {
    if (typeof v === "string") return v;
    if (v && typeof v === "object" && "value" in v) return v.value;
    return "";
}

function LanguageSelect({ settingsKey, includeAuto }: { settingsKey: LanguageSettingKey; includeAuto: boolean; }) {
    const rawValue = settings.use([settingsKey])[settingsKey];
    const currentValue = normalizeSelectValue(rawValue);
    const service = settings.use(["service"]).service;

    const options = useMemo(
        () => {
            const options = Object.entries(getLanguages()).map(([value, label]) => ({ value, label }));
            if (!includeAuto)
                options.shift();

            return options;
        }, [service]
    );

    // Find current option or create fallback if value exists but not in options
    const currentOption = options.find(o => o.value === currentValue)
        ?? (currentValue ? { value: currentValue, label: currentValue } : undefined);

    return (
        <section className={Margins.bottom16}>
            <Heading tag="h3">
                {settings.def[settingsKey].description}
            </Heading>

            <SearchableSelect
                options={options}
                value={options.find(o => o.value === currentValue)?.value}
                placeholder="Select a language"
                maxVisibleItems={5}
                closeOnSelect={true}
                onChange={v => settings.store[settingsKey] = v as string}
            />
        </section>
    );
}


function AutoTranslateToggle() {
    const value = settings.use(["autoTranslate"]).autoTranslate;

    return (
        <FormSwitch
            title="Auto Translate"
            description={settings.def.autoTranslate.description}
            value={value}
            onChange={v => settings.store.autoTranslate = v}
            hideBorder
        />
    );
}

function OpenRouterModelSelect() {
    const rawModel = settings.use(["openrouterModel"]).openrouterModel;
    const currentModel = normalizeSelectValue(rawModel);
    const [models, setModels] = useState<OpenRouterModel[]>(
        () => settings.store.openrouterModelsCache ?? []
    );
    const [isLoading, setIsLoading] = useState(false);

    const options = useMemo(
        () => models.map(m => ({ value: m.id, label: m.name })),
        [models]
    );

    const handleRefresh = async () => {
        setIsLoading(true);
        try {
            const freshModels = await fetchModels();
            setModels(freshModels);
            showToast(`Loaded ${freshModels.length} models`, Toasts.Type.SUCCESS);
        } catch (e) {
            showToast(e instanceof Error ? e.message : "Failed to fetch models", Toasts.Type.FAILURE);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <section className={Margins.bottom16}>
            <Heading tag="h3">
                Model
            </Heading>

            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                    <SearchableSelect
                        options={options}
                        value={options.find(o => o.value === currentModel) ?? { value: currentModel, label: currentModel }}
                        placeholder={"Select a model"}
                        maxVisibleItems={5}
                        closeOnSelect={true}
                        onChange={v => settings.store.openrouterModel = v as string}
                    />
                </div>
                <Button
                    size="small"
                    onClick={handleRefresh}
                    disabled={isLoading}
                >
                    {isLoading ? "Loading..." : "Refresh"}
                </Button>
            </div>

            <Paragraph style={{ marginTop: "4px" }}>
                Click Refresh to load available models from OpenRouter
            </Paragraph>
        </section>
    );
}

function OpenRouterPromptEditor() {
    const currentPrompt = settings.use(["openrouterPrompt"]).openrouterPrompt;
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <section className={Margins.bottom16}>
            <Heading tag="h3" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                Prompt Template
                <Button
                    size="min"
                    variant="link"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    {isExpanded ? "Hide" : "Edit"}
                </Button>
            </Heading>

            {isExpanded && (
                <>
                    <TextArea
                        value={currentPrompt}
                        onChange={v => settings.store.openrouterPrompt = v}
                        rows={8}
                        style={{ fontFamily: "monospace", fontSize: "12px" }}
                    />
                    <Paragraph style={{ marginTop: "4px" }}>
                        Use {"{{targetLanguage}}"} and {"{{message}}"} as placeholders
                    </Paragraph>
                </>
            )}
        </section>
    );
}

function formatRelativeTime(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
}

function TranslationHistoryRow({
    messageId,
    translation,
    onDelete
}: {
    messageId: string;
    translation: { text: string; sourceLanguage: string; model?: string; timestamp: number; };
    onDelete: () => void;
}) {
    const [isExpanded, setIsExpanded] = useState(false);
    const needsTruncation = translation.text.length > 80;
    const displayText = !needsTruncation || isExpanded
        ? translation.text
        : translation.text.substring(0, 80) + "...";

    return (
        <div
            className={cl("history-row", { "history-row-expanded": isExpanded })}
            onClick={() => needsTruncation && setIsExpanded(!isExpanded)}
        >
            <div className={cl("history-row-content")}>
                <div className={cl("history-row-header")}>
                    {needsTruncation && (
                        <span className={cl("history-row-expand")}>
                            {isExpanded ? "▾" : "▸"}
                        </span>
                    )}
                    <span className={cl("history-row-meta")}>
                        {translation.sourceLanguage}
                        {translation.model && ` • ${translation.model}`}
                        {` • ${formatRelativeTime(translation.timestamp)}`}
                    </span>
                </div>
                <div className={cl("history-row-text", { "history-row-text-truncated": !isExpanded && needsTruncation })}>
                    {displayText}
                </div>
            </div>
            <Button
                size="min"
                variant="dangerSecondary"
                onClick={e => { e.stopPropagation(); onDelete(); }}
                className={cl("history-row-delete")}
            >
                ✕
            </Button>
        </div>
    );
}

// Settings Tab Content
function SettingsTab() {
    const service = settings.use(["service"]).service;
    const isOpenRouter = service === "openrouter";

    const languageKeys = isOpenRouter
        ? (["receivedOutput", "sentOutput"] as const)
        : LanguageSettingKeys;

    return (
        <div className={cl("settings-tab")}>
            {/* OpenRouter-specific settings */}
            {isOpenRouter && (
                <>
                    <OpenRouterModelSelect />
                    <OpenRouterPromptEditor />
                    <Divider className={Margins.bottom16} />
                </>
            )}

            {/* Language selectors */}
            {languageKeys.map(s => (
                <LanguageSelect
                    key={s}
                    settingsKey={s}
                    includeAuto={s.endsWith("Input")}
                />
            ))}

            <Divider className={Margins.bottom16} />

            <AutoTranslateToggle />
        </div>
    );
}

// History Tab Content
function HistoryTab() {
    const [history, setHistory] = useState<Array<[string, { text: string; sourceLanguage: string; model?: string; timestamp: number; }]>>([]);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        TranslationStore.getAll().then(setHistory);
    }, []);

    const filteredHistory = useMemo(() => {
        if (!searchQuery.trim()) return history;
        const query = searchQuery.toLowerCase();
        return history.filter(([, t]) => t.text.toLowerCase().includes(query));
    }, [history, searchQuery]);

    const handleDelete = async (messageId: string) => {
        await TranslationStore.delete(messageId);
        setHistory(h => h.filter(([id]) => id !== messageId));
        showToast("Translation removed", Toasts.Type.SUCCESS);
    };

    const handleClearAll = async () => {
        await TranslationStore.clearAll();
        setHistory([]);
        showToast("Translation history cleared", Toasts.Type.SUCCESS);
    };

    if (history.length === 0) {
        return (
            <div className={cl("history-tab")}>
                <div className={cl("history-empty")}>
                    <Text variant="text-md/normal">No saved translations yet.</Text>
                    <Text variant="text-sm/normal" style={{ color: "var(--text-muted)" }}>
                        Translated messages will appear here.
                    </Text>
                </div>
            </div>
        );
    }

    return (
        <div className={cl("history-tab")}>
            <div className={cl("history-header")}>
                <input
                    type="text"
                    placeholder="Search translations..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className={cl("history-search")}
                />
                <Button
                    size="small"
                    variant="dangerSecondary"
                    onClick={handleClearAll}
                >
                    Clear All
                </Button>
            </div>

            <ScrollerThin className={cl("history-scroller")} orientation="vertical">
                <div className={cl("history-list")}>
                    {filteredHistory.length === 0 ? (
                        <div className={cl("history-empty")}>
                            <Text variant="text-md/normal">No translations match your search.</Text>
                        </div>
                    ) : (
                        filteredHistory.map(([messageId, translation]) => (
                            <TranslationHistoryRow
                                key={messageId}
                                messageId={messageId}
                                translation={translation}
                                onDelete={() => handleDelete(messageId)}
                            />
                        ))
                    )}
                </div>
            </ScrollerThin>
        </div>
    );
}

type TabType = "settings" | "history";

export function TranslateModal({ rootProps }: { rootProps: ModalProps; }) {
    const [activeTab, setActiveTab] = useState<TabType>("settings");

    return (
        <ModalRoot {...rootProps} size={ModalSize.MEDIUM}>
            <ModalHeader className={cl("modal-header")}>
                <Text variant="heading-lg/semibold" className={cl("modal-title")}>
                    Translate
                </Text>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>

            {/* Tab Bar */}
            <div className={cl("tab-bar")}>
                <div
                    className={cl("tab", { "tab-active": activeTab === "settings" })}
                    onClick={() => setActiveTab("settings")}
                >
                    Settings
                </div>
                <div
                    className={cl("tab", { "tab-active": activeTab === "history" })}
                    onClick={() => setActiveTab("history")}
                >
                    History
                </div>
            </div>

            <ModalContent className={cl("modal-content")}>
                {activeTab === "settings" ? <SettingsTab /> : <HistoryTab />}
            </ModalContent>
        </ModalRoot>
    );
}
