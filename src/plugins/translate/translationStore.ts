import { DataStore } from "@api/index";
import type { TranslationValue } from "./utils";
import type { SavedTranslation } from "./settings";

/**
 * Manages persistent storage of translations using Vencord's DataStore (IndexedDB).
 */
const DB_KEY = "translate:savedTranslations";
let _cache: Record<string, SavedTranslation> = {};
let _loaded = false;

async function ensureLoaded() {
    if (_loaded) return;
    _cache = await DataStore.get(DB_KEY) ?? {};
    _loaded = true;
}

export const TranslationStore = {
    /**
     * Retrieves a saved translation by message ID.
     */
    get(messageId: string): SavedTranslation | undefined {
        return _cache[messageId];
    },

    /**
     * Persists a translation result.
     */
    async save(messageId: string, result: TranslationValue, model?: string) {
        await ensureLoaded();
        const saved: SavedTranslation = {
            text: result.text,
            sourceLanguage: result.sourceLanguage,
            model,
            timestamp: Date.now()
        };

        _cache[messageId] = saved;
        await DataStore.set(DB_KEY, _cache);
    },

    /**
     * Removes a single translation from storage.
     */
    async delete(messageId: string) {
        await ensureLoaded();
        delete _cache[messageId];
        await DataStore.set(DB_KEY, _cache);
    },

    /**
     * Deletes all saved translations.
     */
    async clearAll() {
        _cache = {};
        await DataStore.del(DB_KEY);
    },

    /**
     * Returns all saved translations, sorted by timestamp (newest first).
     */
    async getAll(): Promise<Array<[string, SavedTranslation]>> {
        await ensureLoaded();
        return Object.entries(_cache)
            .sort(([, a], [, b]) => b.timestamp - a.timestamp);
    },

    /**
     * Returns the total number of saved translations.
     */
    count(): number {
        return Object.keys(_cache).length;
    },

    /**
     * Initial load of the store.
     */
    async load() {
        await ensureLoaded();
    }
};
