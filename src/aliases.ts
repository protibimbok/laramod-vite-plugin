import fs from 'node:fs'
import path from 'node:path'
import { normalizePath, type Alias, type AliasOptions } from 'vite'
import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser'
import type { ModuleInfo } from './config.js'

/** The alias names the user's own vite config already defines. */
export function userAliasNames(alias?: AliasOptions): Set<string> {
    if (!alias) {
        return new Set()
    }
    if (Array.isArray(alias)) {
        return new Set(
            alias.map((entry: Alias) => entry.find).filter((find): find is string => typeof find === 'string'),
        )
    }
    return new Set(Object.keys(alias))
}

/**
 * The aliases the plugin registers: `@<module>` for every module that has a
 * resources directory, so `@blog/js/app.js` is Modules/Blog/resources/js/app.js.
 */
export function moduleAliases(root: string, modules: ModuleInfo[]): Record<string, string> {
    const aliases: Record<string, string> = {}

    for (const module of modules) {
        const resources = path.resolve(root, module.path, 'resources')

        if (fs.existsSync(resources)) {
            aliases[`@${module.name}`] = normalizePath(resources)
        }
    }

    return aliases
}

const CONFIG_FILES = ['tsconfig.app.json', 'tsconfig.json', 'jsconfig.json']

/**
 * Mirrors the vite aliases into `compilerOptions.paths` of the project's
 * ts/jsconfig, so editors resolve `@blog/...` imports too. Only aliases the
 * plugin owns (present in `aliases` and not claimed by the user's vite
 * config) are written or replaced; everything else in the file is kept.
 */
export function writeAliases(
    root: string,
    aliases: Record<string, string>,
    userClaimed: Set<string>,
    createIfMissing: boolean,
): void {
    let cfgPath = CONFIG_FILES.map((name) => path.join(root, name)).find((candidate) => fs.existsSync(candidate))
    if (!cfgPath) {
        if (!createIfMissing) {
            return
        }
        cfgPath = path.join(root, 'jsconfig.json')
        fs.writeFileSync(cfgPath, JSON.stringify({ exclude: ['node_modules'] }, null, 2))
    }

    const fileContent = fs.readFileSync(cfgPath, 'utf8')
    const errors: ParseError[] = []
    const jsonNode = parse(fileContent, errors, {
        disallowComments: false,
        allowTrailingComma: true,
    })
    if (errors.length > 0 || typeof jsonNode !== 'object' || jsonNode === null || Array.isArray(jsonNode)) {
        console.warn(`laramod-vite-plugin: ${cfgPath} is not valid JSON, so the aliases were not written into it`)
        return
    }

    const old: Record<string, string[]> = jsonNode.compilerOptions?.paths || {}

    const isOurs = (alias: string): boolean => {
        const name = alias.endsWith('/*') ? alias.slice(0, -2) : alias
        return Object.hasOwn(aliases, name) && !userClaimed.has(name)
    }

    const updatedPaths: Record<string, string[]> = {}
    for (const alias in old) {
        if (!isOurs(alias)) {
            updatedPaths[alias] = old[alias]
        }
    }
    for (const alias in aliases) {
        if (userClaimed.has(alias)) {
            continue
        }
        let val = normalizePath(path.relative(root, aliases[alias]))
        if (val !== '.') {
            val = './' + val
        }
        updatedPaths[alias + '/*'] = [val + '/*']
    }

    const edits = modify(fileContent, ['compilerOptions', 'paths'], updatedPaths, {
        formattingOptions: {
            tabSize: 2,
            insertSpaces: true,
            keepLines: true,
        },
    })
    const newContent = applyEdits(fileContent, edits)
    if (newContent !== fileContent) {
        fs.writeFileSync(cfgPath, newContent, 'utf-8')
    }
}
