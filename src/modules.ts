import { execFileSync } from 'node:child_process'
import { validateModule, type ModuleInfo, type ResolvedPluginConfig } from './config.js'

/**
 * The registered modules. PHP's module registry is the only source of truth,
 * so they are asked for with `php artisan laramod:vite` instead of being
 * guessed from the file system.
 */
export function loadModules(config: ResolvedPluginConfig): ModuleInfo[] {
    const root = config.root

    if (config.modules) {
        return config.modules
    }

    let output: string
    try {
        output = execFileSync(config.php, ['artisan', 'laramod:vite'], {
            cwd: root,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        })
    } catch (error) {
        const { stderr, stdout, message } = error as { stderr?: string; stdout?: string; message: string }

        throw new Error(
            `laramod-vite-plugin: could not run "${config.php} artisan laramod:vite" in ${root}.\n` +
                (stderr || stdout || message).trim() +
                "\nWhen the build cannot run PHP, pass the command's output as the 'modules' option instead.",
        )
    }

    let parsed: { modules?: unknown }
    try {
        parsed = JSON.parse(output)
    } catch {
        throw new Error(
            `laramod-vite-plugin: "${config.php} artisan laramod:vite" did not print JSON:\n${output.trim()}`,
        )
    }

    if (!Array.isArray(parsed.modules)) {
        throw new Error('laramod-vite-plugin: "artisan laramod:vite" printed no "modules" list.')
    }

    return parsed.modules.map(validateModule)
}
