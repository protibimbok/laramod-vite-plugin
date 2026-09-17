import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'
import { normalizePath, resolveConfig } from 'vite'
import laramod from '../dist/index.js'

const blog = { name: 'blog', path: 'Modules/Blog', entries: ['Modules/Blog/resources/js/app.js'] }
const shop = { name: 'shop', path: 'Modules/Shop', entries: [] }

const appInput = ['resources/css/app.css', 'resources/js/app.js']

const roots = []

afterEach(() => {
    for (const root of roots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true })
    }
})

/** A project root with a resources directory for the given modules. */
function project(modules = [blog]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'laramod-vite-'))
    roots.push(root)

    for (const module of modules) {
        fs.mkdirSync(path.join(root, module.path, 'resources', 'js'), { recursive: true })
    }

    return root
}

function resolve(root, plugins, inlineConfig = {}, isSsrBuild = false) {
    return resolveConfig(
        { configFile: false, logLevel: 'silent', root, plugins, ...inlineConfig, build: { ssr: isSsrBuild } },
        'build',
    )
}

/** The paths laravel-vite-plugin hands to its full-reload plugins, which only apply to the dev server. */
function refreshedPaths(plugins) {
    return plugins.flat(Infinity).flatMap((plugin) => plugin.__laravel_plugin_config?.paths ?? [])
}

test("builds the modules' entries with the application's own", async () => {
    const root = project()
    const config = await resolve(root, laramod({ input: appInput }, { root, modules: [blog, shop] }))

    assert.ok(config.plugins.some((plugin) => plugin.name === 'laravel'))
    assert.deepEqual(config.build.rolldownOptions.input, [...appInput, 'Modules/Blog/resources/js/app.js'])
})

test('accepts every input laravel-vite-plugin accepts', async () => {
    const root = project()

    const single = await resolve(root, laramod('resources/js/app.js', { root, modules: [blog] }))
    assert.deepEqual(single.build.rolldownOptions.input, ['resources/js/app.js', 'Modules/Blog/resources/js/app.js'])

    const list = await resolve(root, laramod(appInput, { root, modules: [blog] }))
    assert.deepEqual(list.build.rolldownOptions.input, [...appInput, 'Modules/Blog/resources/js/app.js'])

    const named = await resolve(root, laramod({ input: { app: 'resources/js/app.js' } }, { root, modules: [blog] }))
    assert.deepEqual(named.build.rolldownOptions.input, {
        app: 'resources/js/app.js',
        'Modules/Blog/resources/js/app': 'Modules/Blog/resources/js/app.js',
    })
})

test('leaves the input alone when no module declares entries', async () => {
    const root = project([shop])
    const config = await resolve(root, laramod({ input: appInput }, { root, modules: [shop] }))

    assert.deepEqual(config.build.rolldownOptions.input, appInput)
})

test("keeps the modules' client entries out of the SSR build", async () => {
    const root = project()

    const implicit = await resolve(root, laramod({ input: appInput }, { root, modules: [blog] }), {}, true)
    assert.deepEqual(implicit.build.rolldownOptions.input, appInput)

    const explicit = await resolve(root, laramod({ input: appInput, ssr: 'resources/js/ssr.js' }, { root, modules: [blog] }), {}, true)
    assert.deepEqual(explicit.build.rolldownOptions.input, 'resources/js/ssr.js')
})

test('refresh: true also watches the module directories that exist', () => {
    const root = project([blog, shop])

    fs.mkdirSync(path.join(root, 'Modules/Blog/resources/views'), { recursive: true })
    fs.mkdirSync(path.join(root, 'Modules/Blog/routes'))
    fs.mkdirSync(path.join(root, 'Modules/Shop/lang'))

    const plugins = laramod({ input: appInput, refresh: true }, { root, modules: [blog, shop] })

    assert.deepEqual(
        refreshedPaths(plugins).filter((pattern) => pattern.startsWith('Modules/')),
        ['Modules/Blog/resources/views/**', 'Modules/Blog/routes/**', 'Modules/Shop/lang/**'],
    )
})

test('a refresh option other than true is handed over untouched', () => {
    const root = project([blog])

    fs.mkdirSync(path.join(root, 'Modules/Blog/routes'))

    const custom = laramod({ input: appInput, refresh: ['resources/views/**'] }, { root, modules: [blog] })
    assert.deepEqual(refreshedPaths(custom), ['resources/views/**'])

    const off = laramod({ input: appInput }, { root, modules: [blog] })
    assert.deepEqual(refreshedPaths(off), [])
})

test('aliases every module that has a resources directory', async () => {
    const root = project([blog])
    const config = await resolve(root, laramod({ input: appInput }, { root, modules: [blog, shop] }))

    const aliases = Object.fromEntries(
        config.resolve.alias.filter(({ find }) => typeof find === 'string').map(({ find, replacement }) => [find, replacement]),
    )

    assert.equal(aliases['@blog'], normalizePath(path.join(root, 'Modules/Blog/resources')))
    assert.equal(aliases['@shop'], undefined)
})

test("does not override an alias of the user's own config", async () => {
    const root = project([blog])
    const config = await resolve(root, laramod({ input: appInput }, { root, modules: [blog] }), {
        resolve: { alias: { '@blog': '/somewhere/else' } },
    })

    assert.deepEqual(
        config.resolve.alias.filter(({ find }) => find === '@blog').map(({ replacement }) => replacement),
        ['/somewhere/else'],
    )
})

test('mirrors the aliases into an existing tsconfig and keeps the rest of it', async () => {
    const root = project([blog])
    const tsconfig = path.join(root, 'tsconfig.json')

    fs.writeFileSync(
        tsconfig,
        '{\n  // editor settings\n  "compilerOptions": {\n    "strict": true,\n    "paths": { "@/*": ["./resources/js/*"], "@gone/*": ["./old/*"] }\n  }\n}\n',
    )

    await resolve(root, laramod({ input: appInput }, { root, modules: [blog] }))

    const written = fs.readFileSync(tsconfig, 'utf8')

    assert.match(written, /\/\/ editor settings/)
    assert.match(written, /"@\/\*": \[\s*"\.\/resources\/js\/\*"\s*\]/)
    assert.match(written, /"@gone\/\*"/)
    assert.match(written, /"@blog\/\*": \[\s*"\.\/Modules\/Blog\/resources\/\*"\s*\]/)
})

test('creates no jsconfig unless asked to', async () => {
    const root = project([blog])

    await resolve(root, laramod({ input: appInput }, { root, modules: [blog] }))
    assert.equal(fs.existsSync(path.join(root, 'jsconfig.json')), false)

    await resolve(root, laramod({ input: appInput }, { root, modules: [blog], addAliases: true }))
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'jsconfig.json'), 'utf8')).compilerOptions.paths, {
        '@blog/*': ['./Modules/Blog/resources/*'],
    })
})

test('asks artisan for the modules, once', async () => {
    const root = project([blog])

    // Node stands in for PHP: "node artisan laramod:vite" runs this script.
    fs.writeFileSync(
        path.join(root, 'artisan'),
        `require('node:fs').appendFileSync(${JSON.stringify(path.join(root, 'calls.log'))}, process.argv.slice(2).join(' ') + '\\n')
        console.log(JSON.stringify({ modules: [${JSON.stringify(blog)}] }))`,
    )

    const config = await resolve(root, laramod({ input: appInput }, { root, php: process.execPath }))

    assert.deepEqual(config.build.rolldownOptions.input, [...appInput, 'Modules/Blog/resources/js/app.js'])
    assert.equal(fs.readFileSync(path.join(root, 'calls.log'), 'utf8'), 'laramod:vite\n')
})

test('explains a failing artisan call', () => {
    const root = project([])

    fs.writeFileSync(path.join(root, 'artisan'), "console.error('Command \"laramod:vite\" is not defined.'); process.exit(1)")

    assert.throws(
        () => laramod({ input: appInput }, { root, php: process.execPath }),
        (error) => /could not run/.test(error.message) && /is not defined/.test(error.message) && /'modules' option/.test(error.message),
    )
})

test('rejects malformed options', async () => {
    const { resolvePluginConfig } = await import('../dist/config.js')

    assert.throws(() => resolvePluginConfig({ modules: [{ name: 'blog' }] }), /a module must look like/)
    assert.throws(() => resolvePluginConfig({ php: ' ' }), /must not be empty/)
    assert.deepEqual(resolvePluginConfig(), { root: process.cwd(), php: 'php', modules: null, addAliases: 'update-only' })
})
