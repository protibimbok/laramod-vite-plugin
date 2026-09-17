import laravel, { refreshPaths } from 'laravel-vite-plugin'
import type { Plugin } from 'vite'
import { moduleAliases, userAliasNames, writeAliases } from './aliases.js'
import { resolvePluginConfig, type ModuleInfo, type PluginConfig, type ResolvedPluginConfig } from './config.js'
import { appendEntries, moduleEntries } from './entries.js'
import { loadModules } from './modules.js'
import { moduleRefreshPaths } from './refresh.js'

export type { ModuleInfo, PluginConfig, ResolvedPluginConfig } from './config.js'

/** Whatever laravel-vite-plugin accepts: an entry point, a list of them or its full configuration. */
export type LaravelConfig = Parameters<typeof laravel>[0]

/**
 * Laramod plugin for Vite. It wraps laravel-vite-plugin, so use it in its place
 * and hand it the same configuration:
 *
 *     plugins: [laramod({ input: ['resources/js/app.js'], refresh: true })]
 *
 * The modules are asked for with `php artisan laramod:vite`. The entries they
 * declare are built with the application's own, `refresh: true` also watches
 * the modules, and every module gets an `@<module>` alias.
 */
export function laramod(laravelConfig: LaravelConfig, config: PluginConfig = {}): Plugin[] {
    const resolved = resolvePluginConfig(config)
    const modules = loadModules(resolved)

    return [...laravel(withModules(laravelConfig, resolved.root, modules)), aliases(resolved, modules)]
}

/** Adds what the modules need to the configuration of laravel-vite-plugin, through its public options only. */
function withModules(config: LaravelConfig, root: string, modules: ModuleInfo[]): LaravelConfig {
    const laravelConfig = typeof config === 'string' || Array.isArray(config) ? { input: config } : config

    return {
        ...laravelConfig,
        input: appendEntries(laravelConfig.input, moduleEntries(modules)),
        // The modules' entries are client code, so the SSR build keeps the input it would have had.
        ssr: laravelConfig.ssr ?? laravelConfig.input,
        // Only the defaults are extended: whoever lists the paths themselves decides what is watched.
        refresh:
            laravelConfig.refresh === true
                ? [{ paths: [...refreshPaths, ...moduleRefreshPaths(root, modules)] }]
                : laravelConfig.refresh,
    }
}

/** Registers `@<module>` for every module and mirrors it into ts/jsconfig. */
function aliases(config: ResolvedPluginConfig, modules: ModuleInfo[]): Plugin {
    return {
        name: 'laramod:aliases',
        enforce: 'pre',
        config(userConfig) {
            const all = moduleAliases(config.root, modules)
            const userClaimed = userAliasNames(userConfig.resolve?.alias)
            const ours = Object.fromEntries(Object.entries(all).filter(([name]) => !userClaimed.has(name)))

            if (config.addAliases !== false) {
                writeAliases(config.root, all, userClaimed, config.addAliases === true)
            }

            return {
                resolve: {
                    alias: Array.isArray(userConfig.resolve?.alias)
                        ? Object.entries(ours).map(([find, replacement]) => ({ find, replacement }))
                        : ours,
                },
            }
        },
    }
}

export default laramod
