const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts = [...config.resolver.sourceExts, 'sql'];

// Force a single copy of React / React DOM into the bundle. In this pnpm
// monorepo `@react-native-async-storage/async-storage` resolves react@19.2.7
// while the rest of the app uses react@19.1.0; two React copies in one bundle
// null out the hooks dispatcher ("Invalid hook call" / "useReducer of null").
// Resolve the app's canonical copies once (dynamically, so pnpm hashes aren't
// hard-coded) and redirect every react/react-dom import to them.
const reactDir = path.dirname(require.resolve('react/package.json'));
const reactDomDir = path.dirname(require.resolve('react-dom/package.json'));
const DEDUPE = [
  { name: 'react', dir: reactDir },
  { name: 'react-dom', dir: reactDomDir },
];

// Shared workspace packages (@utral/types, @utral/sync-share, @utral/sync-client)
// resolve to their raw TypeScript source, which uses NodeNext-style relative
// imports with explicit `.js` extensions (required by tsc/Vite). Metro does not
// rewrite `.js` -> `.ts`, so map relative `.js` specifiers back to their source
// files before falling through to the default resolver.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  for (const { name, dir } of DEDUPE) {
    if (moduleName === name || moduleName.startsWith(name + '/')) {
      const subpath = moduleName.slice(name.length); // '' or '/jsx-runtime' etc.
      return context.resolveRequest(context, dir + subpath, platform);
    }
  }

  if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    for (const ext of ['.ts', '.tsx']) {
      try {
        return context.resolveRequest(
          context,
          moduleName.slice(0, -'.js'.length) + ext,
          platform
        );
      } catch {
        // try next extension, then fall back to the original specifier
      }
    }
  }
  const resolve = defaultResolveRequest ?? context.resolveRequest;
  return resolve(context, moduleName, platform);
};

module.exports = config;
