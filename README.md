# MS Club

Texas Hold'em with friends and funny AI players, in the browser — no account, no game server. Play chips only, never real money.

**Right now this repo holds a connection test**, not the game: it checks that two browsers can sit at one table with no server (WebRTC rooms via [trystero](https://github.com/dmotz/trystero), meeting through public Nostr relays), that only the host can change the table, and that scores can be posted to and read from public relays. The game replaces it soon.

## Run it

```bash
pnpm install
pnpm build && pnpm preview     # serves with the same security policy ms.computer adds
```

MIT licensed.
