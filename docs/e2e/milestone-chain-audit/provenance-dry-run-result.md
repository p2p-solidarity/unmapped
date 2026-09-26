# WorldProvenance dry run (rev 6 phase 4, D6)

- When: 2026-09-26T08:50:40.110Z; `bun run provenance --dry-run --out $SCR/out/prov-dry`
- Chain: Ethereum Sepolia (11155111) via https://ethereum-sepolia-rpc.publicnode.com, simulated with eth_simulateV1; nothing sent
- Contract: 0xF625ec3c228e3BCE34977C0b7e97BD591291Ef02 (CREATE2 through 0x4e59b44847b379578588920cA78FbF26c0B4956C, salt 0xa3557ee888ab4a72b65d7348d4170ce528dc0953da38bd851239920a1aa7622d); solc 0.8.37+commit.f401782d.Emscripten.clang
- Recorder (simulated sender): 0x20b57904277fbedc1f78277ca8ce41ea8a734e16; service key k5ues7vcqmuzoklr3o4scju2r2oovougbobj6d46sxcpsn6p2om4a
- Worlds: two made in memory, 2 worlds, 8 beats

| World | Entries | Beats | Recompute | Record requested |
| --- | ---: | ---: | ---: | --- |
| hdqwpd4myo6tgkr5lbbs5ef6gdy2onsldppinuosruxrjp2r5ybwa | 11 | 4 | 4 | false |
| hh77476zlfnhbznsn5h6nbc4pyk3ztashvvyfymi5nt2tovvdmi5q | 11 | 4 | 4 | false |

## Gas per step

| Step | Gas | Gas per beat |
| --- | ---: | ---: |
| open the stream of hdqwpd4myo6t… | 98,488 |  |
| open the stream of hh77476zlfnh… | 98,488 |  |
| record 4 beats (catch-up batch) | 55,592 | 13,898 |
| record 2 beats (one pass) | 44,386 | 22,193 |
| record 2 beats (one pass) | 44,410 | 22,205 |

## Refused

- a beat before its stream is open (3): StreamNotOpen
- a second open of one stream (2): StreamAlreadyOpen
- a falling upTo (4): UpToNotRising
- the same upTo again (4): UpToNotRising
- one upTo twice in one batch (4): UpToNotRising

## Read back (main's reader over the simulated blocks)

- hdqwpd4myo6tgkr5lbbs5ef6gdy2onsldppinuosruxrjp2r5ybwa: matches at 9 (4 beats walked back); a changed copy: differs at 3; one cut before the first beat: not synced
- hh77476zlfnhbznsn5h6nbc4pyk3ztashvvyfymi5nt2tovvdmi5q: matches at 9 (4 beats walked back); a changed copy: differs at 3; one cut before the first beat: not synced
