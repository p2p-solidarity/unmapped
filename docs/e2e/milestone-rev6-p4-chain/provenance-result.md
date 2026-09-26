# WorldProvenance dry run (rev 6 phase 4, D6)

- When: 2026-09-26T01:29:34.096Z; `bun run provenance --dry-run --from $SCR/service --out $SCR/prov`
- Chain: Ethereum Sepolia (11155111) via https://ethereum-sepolia-rpc.publicnode.com, simulated with eth_simulateV1; nothing sent
- Contract: 0xF625ec3c228e3BCE34977C0b7e97BD591291Ef02 (CREATE2 through 0x4e59b44847b379578588920cA78FbF26c0B4956C, salt 0xa3557ee888ab4a72b65d7348d4170ce528dc0953da38bd851239920a1aa7622d); solc 0.8.37+commit.f401782d.Emscripten.clang
- Recorder (simulated sender): 0xa1803ab20502712479f4369574ad04288f781b65; service key kd7z7css756dolp5afymgjlpxc5gqnvawzxnqc6suqmyjeaed656a
- Worlds: `$SCR/service`, 1 worlds, 4 beats

| World | Entries | Beats | Recompute | Record requested |
| --- | ---: | ---: | ---: | --- |
| hmx3uh22ofakymbirjzn3gof6vkvt5a3bslexza6gydrfbh5wmraa | 10 | 4 | 4 | true |

## Gas per step

| Step | Gas | Gas per beat |
| --- | ---: | ---: |
| deploy WorldProvenance | 609,729 |  |
| open the stream of hmx3uh22ofak… | 98,476 |  |
| record 2 beats (catch-up batch) | 39,610 | 19,805 |
| record 1 beats (one pass) | 34,013 | 34,013 |
| record 1 beats (one pass) | 34,013 | 34,013 |

## Refused

- a beat before its stream is open (3): StreamNotOpen
- a second open of one stream (2): StreamAlreadyOpen
- a falling upTo (4): UpToNotRising
- the same upTo again (4): UpToNotRising
- one upTo twice in one batch (4): UpToNotRising

## Read back (main's reader over the simulated blocks)

- hmx3uh22ofakymbirjzn3gof6vkvt5a3bslexza6gydrfbh5wmraa: matches at 9 (4 beats walked back); a changed copy: differs at 4; one cut before the first beat: not synced
