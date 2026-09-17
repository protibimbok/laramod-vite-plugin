# laramod-vite-plugin

Vite plugin for Laravel applications built with [Laramod](https://github.com/protibimbok/laramod) modules.

It wraps [`laravel-vite-plugin`](https://github.com/laravel/vite-plugin): use it in its place, with the same options. On top of what Laravel's plugin does, it

- builds the entry points your modules declare in PHP,
- reloads the page when a module's views, translations or routes change,
- adds an `@<module>` alias for every module,
- restarts the dev server when a module is added or its entries change.

The modules are not guessed from the file system. The plugin asks the application with `php artisan laramod:vite`, so local modules and modules installed through Composer are treated alike.

## Requirements

- Node 20.19+ or 22.12+
- Vite 7 or 8
- `laravel-vite-plugin` 2 or 3
- `protibimbok/laramod` installed in the application, and PHP available where Vite runs (see [Building without PHP](#building-without-php))

## Installation

```bash
npm install --save-dev laramod-vite-plugin
```

In `vite.config.js`, call `laramod()` where you called `laravel()`:

```diff
 import { defineConfig } from 'vite';
-import laravel from 'laravel-vite-plugin';
+import laramod from 'laramod-vite-plugin';

 export default defineConfig({
     plugins: [
-        laravel({
+        laramod({
             input: ['resources/css/app.css', 'resources/js/app.js'],
             refresh: true,
         }),
     ],
 });
```

The first argument is handed to `laravel-vite-plugin`, so everything it accepts works: a single entry, a list of entries or its full configuration. Other imports from `laravel-vite-plugin`, such as `laravel-vite-plugin/fonts`, stay as they are.

## Entries

A module declares the files it wants built on its module class:

```php
use Laramod\Contracts\ProvidesViteEntries;

class BlogModule implements Module, ProvidesViteEntries
{
    public function viteEntries(): array
    {
        return ['resources/js/app.js'];
    }
}
```

They are added to your `input` and end up in the manifest under their path from the project root: `Modules/Blog/resources/js/app.js`, or `vendor/acme/blog/resources/js/app.js` for an installed module. A module's own views load them without knowing that path:

```blade
{{ Modules::vite('blog', 'resources/js/app.js') }}
```

The application's views may also use the stock `@vite('Modules/Blog/resources/js/app.js')`.

The SSR build is left as it was: module entries are client code.

## Reloading

With `refresh: true`, the page also reloads when one of these changes inside a module: `Livewire/**`, `View/Components/**`, `lang/**`, `resources/views/**`, `routes/**`. Directories that do not exist are skipped, like `laravel-vite-plugin` does for its own list.

Any other value of `refresh` is handed over untouched. If you list the paths yourself, you decide what is watched.

## Restarting

Which modules and entries exist is decided in PHP, so the dev server restarts by itself when `bootstrap/modules.php` or a module class changes. The restart evaluates `vite.config` again and asks Artisan anew. If Artisan fails, for example while the file is half edited, Vite logs the error and keeps the running server.

Modules registered elsewhere, such as in a service provider, are picked up after a manual restart.

## Aliases

Every module with a `resources` directory gets an alias named after the module:

```js
import { greeting } from '@blog/js/greeting.js'; // Modules/Blog/resources/js/greeting.js
```

An alias you define yourself in `resolve.alias` is never overridden.

The aliases are mirrored into `compilerOptions.paths` of an existing `tsconfig.app.json`, `tsconfig.json` or `jsconfig.json`, so editors resolve them too. Only the plugin's own aliases are written or replaced, comments and everything else in the file are kept.

## Options

The second argument configures the plugin itself. Everything is optional.

```js
laramod({ input: 'resources/js/app.js' }, { php: '/usr/bin/php8.4' })
```

| Option | Default | |
| --- | --- | --- |
| `root` | `process.cwd()` | The Laravel project: where `artisan` lives and what module paths are relative to |
| `php` | `'php'` | The PHP binary that runs `artisan laramod:vite` |
| `modules` | | The modules, for builds that cannot run PHP. Artisan is then not called |
| `addAliases` | | `true` creates a `jsconfig.json` when there is no config file to update, `false` never touches the files. By default an existing file is updated and none is created |

## Building without PHP

When assets are built where PHP is not available, for example in a Node-only Docker stage, give the plugin the output of `php artisan laramod:vite` yourself:

```bash
php artisan laramod:vite > modules.json
```

```js
import { readFileSync } from 'node:fs';

const { modules } = JSON.parse(readFileSync('modules.json', 'utf8'));

laramod({ input: 'resources/js/app.js' }, { modules })
```

## Development

```bash
pnpm install
pnpm test
```

The tests run against the real `laravel-vite-plugin`. Node stands in for PHP, so PHP is not needed to run them.

## License

MIT, see [LICENSE](LICENSE).
