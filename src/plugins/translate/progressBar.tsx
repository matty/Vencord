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

import { useEffect, useState } from "@webpack/common";

import { cl } from "./utils";

// Global progress state
let _isTranslating = false;
let _progress = 0; // 0-100
let _total = 0;
let _current = 0;
let _listeners: Array<() => void> = [];

function notifyListeners() {
    _listeners.forEach(fn => fn());
}

export function startProgress(total: number = 1) {
    _isTranslating = true;
    _total = total;
    _current = 0;
    _progress = 0;
    notifyListeners();
}

export function updateProgress(current?: number) {
    if (current !== undefined) {
        _current = current;
    } else {
        _current++;
    }
    _progress = _total > 0 ? Math.round((_current / _total) * 100) : 0;
    notifyListeners();
}

export function endProgress() {
    _isTranslating = false;
    _progress = 100;
    notifyListeners();
    // Reset after animation completes
    setTimeout(() => {
        _progress = 0;
        _total = 0;
        _current = 0;
        notifyListeners();
    }, 500);
}

export function useProgressState() {
    const [, forceUpdate] = useState({});

    useEffect(() => {
        const listener = () => forceUpdate({});
        _listeners.push(listener);
        return () => {
            _listeners = _listeners.filter(l => l !== listener);
        };
    }, []);

    return {
        isTranslating: _isTranslating,
        progress: _progress,
        current: _current,
        total: _total
    };
}

// Progress bar component - renders at top of screen with fixed positioning
export function TranslationProgressBar() {
    const { isTranslating, progress, current, total } = useProgressState();

    if (!isTranslating && progress === 0) return null;

    const showDeterminate = total > 1;

    return (
        <div className={cl("progress-container")}>
            <div
                className={cl("progress-bar", { "progress-bar-pulse": !showDeterminate })}
                style={showDeterminate ? { width: `${progress}%` } : undefined}
            />
            {showDeterminate && total > 1 && (
                <span className={cl("progress-text")}>
                    Translating {current}/{total}
                </span>
            )}
        </div>
    );
}
