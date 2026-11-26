// A throwaway test: can browsers meet at a poker table with no server, and can
// scores live on public Nostr relays? Results are also kept on window.__test
// so an automated browser can read them.
import { joinRoom, roles } from 'trystero'
import { finalizeEvent, generateSecretKey, getPublicKey, SimplePool, verifyEvent } from 'nostr-tools'

const APP = 'mmdev94/ms-club'
const RELAYS = ['wss://nos.lol', 'wss://relay.primal.net', 'wss://relay.nostr.net', 'wss://nostr.mom', 'wss://offchain.pub']
const $ = (id: string) => document.getElementById(id)!
const T: Record<string, unknown> = { log: [] as string[], peers: 0, rtt: null, tableSeen: null, forgedRejected: null, posted: null, loaded: null }
;(window as unknown as { __test: typeof T }).__test = T
const t0 = performance.now()
const log = (m: string) => {
  const line = `${((performance.now() - t0) / 1000).toFixed(1)}s  ${m}`
  ;(T.log as string[]).push(line)
  $('log').textContent = (T.log as string[]).join('\n')
}

// ── results panel: what a person testing on a phone needs to see ─────────────
function browserName(ua = navigator.userAgent): string {
  const v = (re: RegExp) => re.exec(ua)?.[1]
  const b = v(/Edg\/(\d+)/) ? `Edge ${v(/Edg\/(\d+)/)}` : v(/Firefox\/(\d+)/) ? `Firefox ${v(/Firefox\/(\d+)/)}` : v(/CriOS\/(\d+)/) ? `Chrome ${v(/CriOS\/(\d+)/)}` : v(/Chrome\/(\d+)/) ? `Chrome ${v(/Chrome\/(\d+)/)}` : v(/Version\/([\d.]+).*Safari/) ? `Safari ${v(/Version\/([\d.]+).*Safari/)}` : 'Unknown browser'
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '?'
  return `${b} on ${os}`
}
const R: Record<string, string> = { browser: browserName(), relays: 'checking…', table: 'not joined yet', host: '—', board: '—', forge: '—', scores: '—' }
T.results = R
function show() {
  const mark = (v: string) => (/^(✓|✗)/.test(v) ? `<b class="${v.startsWith('✓') ? 'ok' : 'bad'}">${v}</b>` : v)
  $('results').innerHTML = Object.entries({
    'Your browser': R.browser,
    'Relays reachable': R.relays,
    'Table connection': R.table,
    'Host verified': R.host,
    'Saw the host’s deal': R.board,
    'Fake change refused': R.forge,
    'Scores on relays': R.scores,
  })
    .map(([k, v]) => `<tr><td>${k}</td><td>${mark(v)}</td></tr>`)
    .join('')
}
show()
$('copy').onclick = async () => {
  const text = [`MS Club room test — ${new Date().toISOString()}`, ...Object.entries(R).map(([k, v]) => `${k}: ${v}`), '', ...(T.log as string[])].join('\n')
  try {
    await navigator.clipboard.writeText(text)
    $('copy').textContent = 'Copied ✓'
  } catch {
    $('log').textContent = text
  }
}
// each relay: can this browser open a connection to it under the site's security rules?
Promise.all(
  RELAYS.map(
    (u) =>
      new Promise<boolean>((res) => {
        try {
          const s = new WebSocket(u)
          const t = setTimeout(() => res(false), 8000)
          s.onopen = () => (clearTimeout(t), s.close(), res(true))
          s.onerror = () => (clearTimeout(t), res(false))
        } catch {
          res(false)
        }
      }),
  ),
).then((ok) => {
  const n = ok.filter(Boolean).length
  R.relays = n ? `✓ ${n} of ${RELAYS.length}` : `✗ none (${RELAYS.length} tried) — blocked or offline`
  log(`Relays: ${ok.map((o, i) => `${RELAYS[i].replace('wss://', '')} ${o ? 'ok' : 'failed'}`).join(', ')}`)
  show()
})
window.addEventListener('securitypolicyviolation', (e) => log(`Security rule blocked: ${e.blockedURI} (${e.violatedDirective})`))

// ── 1. table ──────────────────────────────────────────────────────────────────
type Table = { hand: number; board: string[]; dealer: string; note: string }
const params = new URLSearchParams(location.search)
const invited = params.get('table')

async function open(host: boolean) {
  const roomId = invited ?? `t-${Math.random().toString(36).slice(2, 8)}`
  log(host ? `Creating table ${roomId}…` : `Joining table ${roomId.split('~')[0]}…`)
  const room = joinRoom({ appId: APP, identity: 'none', use: [roles(host ? { selfAsAdmin: true } : {})] }, roomId)
  const self = await room.getSelf()
  T.isHost = self.isAdmin
  log(`I am ${self.isAdmin ? 'the host (verified admin)' : 'a guest'} · user ${self.userId.slice(0, 8)}`)
  const table = room.makeState<Table>('table', { hand: 0, board: [], dealer: '', note: 'waiting' })
  const chat = room.makeAction<string>('chat')

  if (host) {
    const link = `${location.origin}${location.pathname}?table=${encodeURIComponent(self.roomId)}`
    T.invite = link
    $('table').innerHTML = `<p>Invite link (open it in another browser or on your phone):</p><p id="invite"><a href="${link}" target="_blank">${link}</a></p><button id="deal">Deal a test hand</button>`
    $('deal').onclick = async () => {
      const cards = ['A♠', 'K♥', '7♦', '7♣', '2♠', 'J♦', '9♥', '3♣'].sort(() => Math.random() - 0.5).slice(0, 5)
      await table.set((p) => ({ hand: p.hand + 1, board: cards, dealer: self.userId.slice(0, 8), note: 'dealt by host' }))
      log(`Dealt hand: ${cards.join(' ')}`)
    }
  } else {
    R.table = 'joining… (if this takes over 30 s, the two networks can’t connect directly)'
    show()
    $('table').innerHTML = `<p>Seated as a guest.</p><button id="cheat" class="alt">Try to change the board (should be refused)</button>`
    $('cheat').onclick = async () => {
      try {
        await table.set({ hand: 99, board: ['A♠', 'A♥', 'A♦', 'A♣', 'K♠'], dealer: 'guest', note: 'forged' })
        T.forgedRejected = false
        R.forge = '✗ accepted on this side (see whether the host’s board changed)'
        show()
        log('Forged edit was accepted locally (checking whether the host accepted it…)')
      } catch (e) {
        T.forgedRejected = true
        log(`Forged edit refused: ${(e as Error).message}`)
        R.forge = '✓ refused'
        show()
      }
    }
  }

  room.onPeerJoin(async ({ peerId, roles: r }) => {
    T.peers = Object.keys(room.getPeers()).length
    T.joinedAt = Math.round(performance.now() - t0)
    const info = room.getPeers()[peerId]
    R.table = `✓ connected in ${(Number(T.joinedAt) / 1000).toFixed(1)} s${info?.direct ? ', direct' : ', through another player'}`
    if (!host) R.host = r.includes('admin') ? '✓ the other browser is the verified host' : '✗ host not verified'
    show()
    log(`Peer joined after ${(Number(T.joinedAt) / 1000).toFixed(1)}s · direct=${info?.direct} · roles=${r.join(',') || 'none'}`)
    try {
      T.rtt = await room.ping(peerId)
      log(`Ping ${T.rtt} ms`)
      R.table += ` · ping ${T.rtt} ms`
      show()
    } catch (e) {
      log(`Ping failed: ${(e as Error).message}`)
    }
    chat.send(host ? 'hello from the host' : 'hello from a guest')
  })
  room.onPeerLeave(() => {
    T.peers = Object.keys(room.getPeers()).length
    log('Peer left')
  })
  chat.onMessage((m) => {
    T.chat = m
    log(`Chat: ${m}`)
  })
  table.onChange((v, ctx) => {
    T.tableSeen = v
    if (!host && v.hand > 0) {
      R.board = v.note === 'forged' ? '✗ a forged board got through' : `✓ hand ${v.hand}: ${v.board.join(' ')}`
      show()
    }
    log(`Table hand ${v.hand}: ${v.board.join(' ')} (${v.note}; written by ${ctx.userId.slice(0, 8)}, roles ${ctx.roles.join(',') || 'none'})`)
  })
}

if (invited) open(false)
else {
  $('table').innerHTML = `<button id="create">Create a table</button>`
  $('create').onclick = () => open(true)
}
;(window as unknown as { __create: () => Promise<void> }).__create = () => open(true)

// ── 2. leaderboard on relays ──────────────────────────────────────────────────
const day = new Date().toISOString().slice(0, 10)
const TAG = `msclub-test-${day}`
const pool = new SimplePool()
let sk: Uint8Array
try {
  const saved = localStorage.getItem('msclub-test-key')
  sk = saved ? Uint8Array.from(saved.match(/../g)!.map((h) => parseInt(h, 16))) : generateSecretKey()
  localStorage.setItem('msclub-test-key', [...sk].map((b) => b.toString(16).padStart(2, '0')).join(''))
} catch {
  sk = generateSecretKey()
}
const pk = getPublicKey(sk)

$('post').onclick = async () => {
  const score = Math.floor(Math.random() * 5000)
  const ev = finalizeEvent(
    { kind: 30078, created_at: Math.floor(Date.now() / 1000), tags: [['d', `${TAG}:${pk}`], ['t', TAG]], content: JSON.stringify({ name: `tester-${pk.slice(0, 4)}`, score, moves: ['call', 'raise:200', 'fold'] }) },
    sk,
  )
  const results = await Promise.allSettled(pool.publish(RELAYS, ev))
  const okCount = results.filter((r) => r.status === 'fulfilled').length
  R.scores = okCount ? `✓ posted to ${okCount} of ${RELAYS.length}` : '✗ no relay accepted it'
  show()
  T.posted = results.map((r, i) => `${RELAYS[i]}: ${r.status === 'fulfilled' ? 'ok' : `refused (${(r.reason as Error)?.message ?? r.reason})`}`)
  log(`Posted score ${score}:\n  ${(T.posted as string[]).join('\n  ')}`)
}
$('load').onclick = async () => {
  const t = performance.now()
  const events = await pool.querySync(RELAYS, { kinds: [30078], '#t': [TAG], limit: 100 })
  const valid = events.filter((e) => verifyEvent(e))
  const rows = valid.map((e) => ({ ...(JSON.parse(e.content) as { name: string; score: number }), pk: e.pubkey })).sort((a, b) => b.score - a.score)
  T.loaded = { count: rows.length, ms: Math.round(performance.now() - t), mine: rows.some((r) => r.pk === pk) }
  R.scores = `${R.scores.startsWith('✓ posted') ? `${R.scores}; ` : ''}✓ read ${rows.length} in ${(T.loaded as { ms: number }).ms} ms`
  show()
  $('scores').textContent = rows.length ? rows.map((r, i) => `${i + 1}. ${r.name}  ${r.score}`).join('\n') : 'none yet'
  log(`Loaded ${rows.length} signed scores in ${T.loaded && (T.loaded as { ms: number }).ms} ms (mine included: ${(T.loaded as { mine: boolean }).mine})`)
}
