# Publishing @mfkvault/mcp-server to NPM

The tarball is built and ready: `publish-ready.tar.gz` (7.2 kB, 4 files).

## One-time setup (if you've never published)

1. Sign up (free): https://www.npmjs.com/signup
2. Verify your email address
3. Create the `@mfkvault` organization on npm:
   https://www.npmjs.com/org/create (choose **Free** plan, name it `mfkvault`)
4. (Optional) Enable 2FA: `npm profile enable-2fa auth-and-writes`

## Publish — easiest path (one command)

```bash
cd /app/mcp-server
npm login                   # opens browser, authenticates once
npm publish --access public # publishes the current source tree
```

## Publish from the pre-built tarball

If you want to audit the exact contents first:

```bash
cd /app/mcp-server
tar -tzf publish-ready.tar.gz                       # inspect
npm publish publish-ready.tar.gz --access public
```

Expected output:
```
+ @mfkvault/mcp-server@1.0.0
```

## Verify

```bash
npm view @mfkvault/mcp-server
npx -y @mfkvault/mcp-server --help
```

## Version bumps

Any edit to `src/index.js` should bump the version:

```bash
cd /app/mcp-server
npm version patch    # 1.0.0 → 1.0.1
npm publish --access public
git push origin main --tags
```

## Tarball details (as of 2026-04-23)

```
name:        @mfkvault/mcp-server
version:     1.0.0
size:        7.2 kB
unpacked:    20.9 kB
files:       4  (LICENSE, README.md, package.json, src/index.js)
shasum:      579b9f98995bdfd73e8180e43d84eca075183ef2
```

## Troubleshooting

- **402 Payment Required** → `@mfkvault` org needs the free plan selected (public packages are free).
- **403 Forbidden** → run `npm whoami` to confirm login; confirm you're a member of the `mfkvault` org.
- **409 Conflict / cannot overwrite** → version already published. Bump with `npm version patch`.
- **E400 package-name-cannot-be-bumped** → org must exist first.

## After publishing

1. Update the MFKVault homepage (already done — `MCPToolsBand` + `/mcp` page).
2. Submit to the Anthropic MCP registry: see `anthropic-registry-pr.md`.
3. Announce on Twitter/LinkedIn with a demo GIF.
