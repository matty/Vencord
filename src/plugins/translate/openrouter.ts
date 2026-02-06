/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PluginNative } from "@utils/types";
import { showToast, Toasts } from "@webpack/common";

import { settings } from "./settings";
import { TranslationValue } from "./utils";

const Native = VencordNative.pluginHelpers.Translate as PluginNative<typeof import("./native")>;

export interface OpenRouterModel {
    id: string;
    name: string;
    pricing?: {
        prompt: string;
        completion: string;
    };
}

interface OpenRouterModelsResponse {
    data: Array<{
        id: string;
        name: string;
        pricing?: {
            prompt: string;
            completion: string;
        };
    }>;
}

interface OpenRouterChatResponse {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
    error?: {
        message: string;
        code: number;
    };
}

/**
 * Fetches available models from OpenRouter API
 */
export async function fetchModels(): Promise<OpenRouterModel[]> {
    const apiKey = settings.store.openrouterApiKey;

    if (!apiKey) {
        throw new Error("OpenRouter API key is not set");
    }

    const { status, data } = await Native.fetchOpenRouterModels(apiKey);

    if (status === -1) {
        throw new Error("Failed to connect to OpenRouter API: " + data);
    }

    if (status === 401) {
        throw new Error("Invalid OpenRouter API key");
    }

    if (status !== 200) {
        throw new Error(`Failed to fetch models: ${status} ${data}`);
    }

    const response: OpenRouterModelsResponse = JSON.parse(data);

    // Filter to models that support chat/completions and sort by name
    const models = response.data
        .map(m => ({
            id: m.id,
            name: m.name,
            pricing: m.pricing
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

    // Cache the models
    settings.store.openrouterModelsCache = models.map(m => ({ id: m.id, name: m.name }));

    return models;
}

/**
 * Gets cached models or fetches fresh ones if cache is empty
 */
export async function getModels(): Promise<OpenRouterModel[]> {
    const cached = settings.store.openrouterModelsCache;

    if (cached && cached.length > 0) {
        return cached;
    }

    return fetchModels();
}

/**
 * Gets the display name for a model ID
 */
export function getModelDisplayName(modelId: string): string {
    const cached = settings.store.openrouterModelsCache;
    const model = cached?.find(m => m.id === modelId);
    return model?.name ?? modelId;
}

// Helper to normalize potentially object-based settings to strings
function normalizeValue(v: any, fallback: string = ""): string {
    if (typeof v === "string") return v;
    if (v && typeof v === "object" && "value" in v) return v.value;
    return fallback;
}

/**
 * Translates text using OpenRouter LLM
 */
export async function translateWithLLM(text: string, targetLang: string): Promise<TranslationValue> {
    const apiKey = settings.store.openrouterApiKey;
    const model = normalizeValue(settings.store.openrouterModel, "openai/gpt-4o-mini");
    const promptTemplate = normalizeValue(settings.store.openrouterPrompt, "Translate to {{targetLanguage}}: {{message}}");

    if (!apiKey) {
        showToast("OpenRouter API key is not set. Please configure it in settings.", Toasts.Type.FAILURE);
        throw new Error("OpenRouter API key is not set");
    }

    // Build the prompt from template
    const prompt = promptTemplate
        .replace(/\{\{targetLanguage\}\}/g, targetLang)
        .replace(/\{\{message\}\}/g, text);

    const { status, data } = await Native.makeOpenRouterTranslateRequest(apiKey, model, prompt);

    if (status === -1) {
        throw new Error("Failed to connect to OpenRouter API: " + data);
    }

    if (status === 401) {
        throw new Error("Invalid OpenRouter API key");
    }

    if (status === 402) {
        throw new Error("OpenRouter API: Insufficient credits");
    }

    if (status === 429) {
        throw new Error("OpenRouter API: Rate limit exceeded. Please try again later.");
    }

    if (status !== 200) {
        throw new Error(`OpenRouter API error: ${status} ${data}`);
    }

    const response: OpenRouterChatResponse = JSON.parse(data);

    if (response.error) {
        throw new Error(`OpenRouter error: ${response.error.message}`);
    }

    const translatedText = response.choices?.[0]?.message?.content;

    if (!translatedText) {
        throw new Error("No translation returned from OpenRouter");
    }

    return {
        sourceLanguage: "LLM",
        text: translatedText.trim()
    };
}

/**
 * Translates multiple texts at once using a single LLM request for efficiency.
 */
export async function translateBatchWithLLM(texts: string[], targetLang: string): Promise<TranslationValue[]> {
    const apiKey = settings.store.openrouterApiKey;
    const model = normalizeValue(settings.store.openrouterModel, "openai/gpt-4o-mini");

    if (!apiKey) {
        showToast("OpenRouter API key is not set. Please configure it in settings.", Toasts.Type.FAILURE);
        throw new Error("OpenRouter API key is not set");
    }

    if (texts.length === 0) return [];

    const prompt = `Translate the following ${texts.length} messages to ${targetLang}. 
Return ONLY a JSON array of strings, where each element corresponds to the input message. 
Preserve formatting, emojis, and markdown inside each string.
Do not include any commentary.

Input messages:
${JSON.stringify(texts, null, 2)}`;

    const { status, data } = await Native.makeOpenRouterTranslateRequest(apiKey, model, prompt);

    if (status !== 200) {
        throw new Error(`OpenRouter Batch API error: ${status} ${data}`);
    }

    const response: OpenRouterChatResponse = JSON.parse(data);
    const content = response.choices?.[0]?.message?.content;

    if (!content) throw new Error("No translation returned from OpenRouter");

    try {
        // Find JSON array in content (handles potential markdown blocks)
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error("Could not find JSON array in response");

        const results: string[] = JSON.parse(jsonMatch[0]);

        if (results.length !== texts.length) {
            console.warn("[Translate] Batch result length mismatch", { expected: texts.length, received: results.length });
        }

        return results.map(text => ({
            sourceLanguage: "LLM",
            text: text.trim()
        }));
    } catch (e) {
        console.error("[Translate] Failed to parse batch translation response", e, content);
        throw new Error("Failed to parse batch translation results");
    }
}
