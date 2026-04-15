# Remote Access

Use this when you want to connect to an Androdex server from another device such as a phone, tablet, or separate desktop app.

## Recommended Setup

Use a trusted private network that meshes your devices together, such as a tailnet.

That gives you:

- a stable address to connect to
- transport security at the network layer
- less exposure than opening the server to the public internet

## Enabling Network Access

There are two ways to expose your server for remote connections: from the desktop app or from the CLI.

### Option 1: Desktop App

If you are already running the desktop app and want to make it reachable from other devices:

1. Open **Settings** → **Connections**.
2. Under **Manage Local Backend**, toggle **Network access** on. This will restart the app and keep the backend reachable for other devices.
3. By default, the desktop app advertises a stable public tunnel route on `https://relay.androdex.xyz`, so the same pairing link can keep working even when the phone is away from your home network.
4. The settings panel will show the remote entrypoint that pairing links use.
5. Use **Create Link** to generate a pairing link you can share with another device.

If you self-host the tunnel service instead of using the default relay, point the desktop app at it with:

```bash
ANDRODEX_REMOTE_TUNNEL_ORIGIN=https://remote.example.com /path/to/androdex-desktop
```

Set `ANDRODEX_REMOTE_TUNNEL_ORIGIN=off` if you want to disable the automatic desktop tunnel and go back to LAN-only advertised endpoints.

### Option 2: Headless Server (CLI)

Use this when you want to run the server without a GUI, for example on a remote machine over SSH.

Run the server with `androdex serve`.

```bash
npx androdex serve --host "$(tailscale ip -4)"
```

`androdex serve` starts the server without opening a browser and prints:

- a connection string
- a pairing token
- a pairing URL
- a QR code for the pairing URL

From there, connect from another device in either of these ways:

- scan the QR code on your phone
- in the desktop app, enter the full pairing URL
- in the desktop app, enter the host and token separately

Use `androdex serve --help` for the full flag reference. It supports the same general startup options as the normal server command, including an optional `cwd` argument.

> Note
> The GUIs do not currently support adding projects on remote environments.
> For now, use `androdex project ...` on the server machine instead.
> Full GUI support for remote project management is coming soon.

## Stable Public Endpoints

If you put Androdex behind a tunnel, reverse proxy, or other transport-forwarding layer, set a
public base URL so pairing links always point at the stable remote address instead of a transient
LAN IP.

Examples:

```bash
npx androdex serve --host 127.0.0.1 --public-base-url https://remote.example.com/androdex
```

```bash
ANDRODEX_PUBLIC_BASE_URL=https://remote.example.com/androdex androdex serve
```

That keeps the backend contract the same while letting pairing URLs and auth posture reflect the
real remote entrypoint your phone should use.

The desktop app's built-in tunnel uses the same idea automatically. It keeps a stable random route
ID on disk, advertises that public base URL to Android, and reconnects the transport behind the
same route whenever the app relaunches.

## How Pairing Works

The remote device does not need a long-lived secret up front.

Instead:

1. `androdex serve` issues a one-time owner pairing token.
2. The remote device exchanges that token with the server.
3. The server creates an authenticated session for that device.

After pairing, future access is session-based. You do not need to keep reusing the original token unless you are pairing a new device.

## Managing Access Later

Use `androdex auth` to manage access after the initial pairing flow.

Typical uses:

- issue additional pairing credentials
- inspect active sessions
- revoke old pairing links or sessions

Use `androdex auth --help` and the nested subcommand help pages for the full reference.

## Security Notes

- Treat pairing URLs and pairing tokens like passwords.
- Prefer binding `--host` to a trusted private address, such as a Tailnet IP, instead of exposing the server broadly.
- Anyone with a valid pairing credential can create a session until that credential expires or is revoked.
- Use `androdex auth` to revoke credentials or sessions you no longer trust.
