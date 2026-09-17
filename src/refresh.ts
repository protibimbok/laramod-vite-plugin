import fs from 'node:fs'
import path from 'node:path'
import type { ModuleInfo } from './config.js'

/**
 * What laravel-vite-plugin reloads the page for inside app/ and resources/,
 * looked for inside a module instead.
 */
const MODULE_PATHS = ['Livewire/**', 'View/Components/**', 'lang/**', 'resources/views/**', 'routes/**']

/**
 * The module files a change of which reloads the page. Like
 * laravel-vite-plugin's own list, directories that do not exist are left out.
 */
export function moduleRefreshPaths(root: string, modules: ModuleInfo[]): string[] {
    return modules.flatMap((module) =>
        MODULE_PATHS.map((pattern) => path.posix.join(module.path.replace(/\\/g, '/'), pattern)).filter((pattern) =>
            fs.existsSync(path.resolve(root, pattern.replace(/\*\*$/, ''))),
        ),
    )
}
