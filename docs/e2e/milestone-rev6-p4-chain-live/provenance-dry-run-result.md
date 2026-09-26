# WorldProvenance dry run (rev 6 phase 4, D6)

- When: 2026-09-26T07:08:19.974Z; `bun run provenance --dry-run --out $SCRATCH/prov-dry`
- Chain: Ethereum Sepolia (11155111) via https://ethereum-sepolia-rpc.publicnode.com, simulated with eth_simulateV1; nothing sent
- Contract: 0xF625ec3c228e3BCE34977C0b7e97BD591291Ef02 (CREATE2 through 0x4e59b44847b379578588920cA78FbF26c0B4956C, salt 0xa3557ee888ab4a72b65d7348d4170ce528dc0953da38bd851239920a1aa7622d); solc 0.8.37+commit.f401782d.Emscripten.clang
- Recorder (simulated sender): 0xfc3d4983944ffc878639158f9cd525c3b37b63fa; service key kki4flg5ooh3k7xaryov5lolgvbeikxo4nuaiujixnbrtjun77daa
- Worlds: two made in memory, 2 worlds, 8 beats

| World | Entries | Beats | Recompute | Record requested |
| --- | ---: | ---: | ---: | --- |
| hfzpkuw27rmr6kzip34qj4nnx3h2iwq7injfwnf64ith5roahfk7q | 11 | 4 | 4 | false |
| hx56uqhfcxguhw4eu2qhxthi364vydm7att6sag5tmlpisetfne5q | 11 | 4 | 4 | false |

## Gas per step

| Step | Gas | Gas per beat |
| --- | ---: | ---: |
| deploy WorldProvenance | 609,729 |  |
| open the stream of hfzpkuw27rmr… | 98,464 |  |
| open the stream of hx56uqhfcxgu… | 98,476 |  |
| record 4 beats (catch-up batch) | 55,556 | 13,889 |
| record 2 beats (one pass) | 44,398 | 22,199 |
| record 2 beats (one pass) | 44,398 | 22,199 |

## Refused

- a beat before its stream is open (3): StreamNotOpen
- a second open of one stream (2): StreamAlreadyOpen
- a falling upTo (4): UpToNotRising
- the same upTo again (4): UpToNotRising
- one upTo twice in one batch (4): UpToNotRising

## Read back (main's reader over the simulated blocks)

- hfzpkuw27rmr6kzip34qj4nnx3h2iwq7injfwnf64ith5roahfk7q: matches at 9 (4 beats walked back); a changed copy: differs at 3; one cut before the first beat: not synced
- hx56uqhfcxguhw4eu2qhxthi364vydm7att6sag5tmlpisetfne5q: matches at 9 (4 beats walked back); a changed copy: differs at 3; one cut before the first beat: not synced
