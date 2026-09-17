import type { ModuleInfo } from './config.js'

export type Input = string | string[] | Record<string, string> | undefined

/** The source files the modules want built, without duplicates. */
export function moduleEntries(modules: ModuleInfo[]): string[] {
    return [...new Set(modules.flatMap((module) => module.entries))]
}

/**
 * Adds the entries to whatever build input is already configured, keeping
 * its shape: a list stays a list, named inputs stay named.
 */
export function appendEntries(input: Input, entries: string[]): Exclude<Input, undefined> {
    if (input === undefined) {
        return entries
    }

    if (typeof input === 'string' || Array.isArray(input)) {
        return [...new Set([...(Array.isArray(input) ? input : [input]), ...entries])]
    }

    const known = new Set(Object.values(input))

    return {
        ...input,
        ...Object.fromEntries(
            entries
                .filter((entry) => !known.has(entry))
                .map((entry) => [entry.replace(/\.[^./\\]+$/, ''), entry]),
        ),
    }
}
