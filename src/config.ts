import path from 'node:path'

/**
 * What `php artisan laramod:vite` reports about a registered module. Paths
 * are relative to the project root unless the module lives outside of it.
 */
export interface ModuleInfo {
    name: string
    path: string
    /** The file of the module class, where the entries are declared. */
    file?: string
    entries: string[]
}

export interface PluginConfig {
    /**
     * The Laravel project: where `artisan` lives and what the modules' paths
     * are relative to.
     *
     * @default process.cwd()
     */
    root?: string

    /**
     * The PHP binary that runs `artisan laramod:vite`.
     *
     * @default 'php'
     */
    php?: string

    /**
     * The modules, for builds that cannot run PHP. When given, Artisan is
     * not called at all. It is what `php artisan laramod:vite` prints under
     * its "modules" key.
     */
    modules?: ModuleInfo[]

    /**
     * Mirror the module aliases into `compilerOptions.paths` of the
     * project's tsconfig.json / jsconfig.json so editors resolve them too.
     * By default an existing file is updated and none is created; `true`
     * creates a jsconfig.json when there is none, `false` leaves the files
     * alone.
     */
    addAliases?: boolean
}

export interface ResolvedPluginConfig {
    root: string
    php: string
    modules: ModuleInfo[] | null
    /** false: leave js/tsconfig alone; true: create one when missing;
     * 'update-only': update an existing file, create none (the default). */
    addAliases: boolean | 'update-only'
}

export function resolvePluginConfig(config: PluginConfig = {}): ResolvedPluginConfig {
    const php = (config.php ?? 'php').trim()

    if (php === '') {
        throw new Error("laramod-vite-plugin: the 'php' option must not be empty.")
    }

    return {
        root: path.resolve(config.root ?? process.cwd()),
        php,
        modules: config.modules ? config.modules.map(validateModule) : null,
        addAliases: config.addAliases ?? 'update-only',
    }
}

/** Checks one module of the `modules` option or of Artisan's output. */
export function validateModule(module: unknown): ModuleInfo {
    const { name, path, file, entries } = (module ?? {}) as Partial<ModuleInfo>

    if (
        typeof name !== 'string' ||
        typeof path !== 'string' ||
        (file !== undefined && typeof file !== 'string') ||
        !Array.isArray(entries) ||
        entries.some((entry) => typeof entry !== 'string')
    ) {
        throw new Error(
            'laramod-vite-plugin: a module must look like ' +
                '{ name: string, path: string, file?: string, entries: string[] }, got ' +
                JSON.stringify(module),
        )
    }

    return file === undefined ? { name, path, entries } : { name, path, file, entries }
}
