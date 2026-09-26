# Model licences

One row per licence record in `src/shared/licence.ts` (rev 6 phase 4, D4). Every picture a
revision holds names one of these ids in its `licences.json`, or `player-supplied` (a file the
player picked) or `unknown` (a picture made before phase 4, or one nobody recorded). With commercial
mode on (`UNMAPPED_COMMERCIAL=1`, or the gateway's `/v1/status` saying `commercial: true`) only a
record marked commercial may draw, and a revision may not add or change a picture whose licence is
not commercial.

A claim is written here only with its source and the day it was read. A claim that could not be
read at its source is marked **reported, unconfirmed**. This file is a record for a person's legal
review, not legal advice.

| Record | Covers (image provider id) | Commercial | Source | Read on | What was read |
| --- | --- | --- | --- | --- | --- |
| `qwen-research` | Qwen-Image-2.1 (`qwen-image-2.1`, model `Qwen/Qwen-Image-2.1`) | no | <https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE>, model card <https://huggingface.co/Qwen/Qwen-Image-2.1> | 2026-09-26 | The licence is the Qwen Research License Agreement. Commercial use needs a separate commercial licence from Alibaba (contact named in the licence). Products built on it must show "Built with Qwen" or "Improved using Qwen" (its section 4.b). The model card states 7B parameters for generation, transparent (RGBA) output, up to 10 reference images, and the `QwenImage21Pipeline` diffusers class. |
| `apache-2.0` | Qwen-Image-2512 (`qwen-image-2512`, model `Qwen/Qwen-Image-2512`), and Qwen-Image | yes | <https://github.com/QwenLM/Qwen-Image>, model card <https://huggingface.co/Qwen/Qwen-Image-2512> | 2026-09-26 | The repository states that Qwen-Image is licensed under Apache 2.0. The 2512 model card's licence tag is `apache-2.0`. Apache 2.0 allows commercial use if the licence and notices are kept. |
| `openai-terms` | OpenAI images (`openai`, `gpt-image-1-mini` by default or `OPENAI_IMAGE_MODEL`; also `actors.png`, recorded in `src/assets/generated/actors.json`) | yes (a contract, not a model licence) | <https://openai.com/policies/row-terms-of-use/> and the OpenAI API Services Agreement | not read: the page returned 403 to this session's fetcher on 2026-09-26 | **Reported, unconfirmed.** From the D4 plan: the terms assign output to the customer. The assignment is not exclusive, third-party rights in the output are not cleared, and the terms can change. A person must re-read them before charging. |
| `cc0` | The built-in CC0 art (not a model) | yes | [`ninja-adventure-cc0.md`](ninja-adventure-cc0.md) | 2026-09-26 (this repository) | CC0 1.0 Universal, as the asset page declares. |

## Values that are not records

| Value | Meaning | Commercial mode |
| --- | --- | --- |
| `player-supplied` | The player picked the file (AI world → Replace image). | Allowed. The file is the player's responsibility. |
| `unknown` | Drawn before phase 4, or no record exists (for example a received work pack or an edited sidecar). | New or changed pictures are refused. Pictures inherited unchanged from the parent revision are only listed. |

## Serving Qwen-Image (read 2026-09-26)

- vLLM-Omni's image API documentation
  (<https://docs.vllm.ai/projects/vllm-omni/en/latest/serving/image_generation_api/>) documents only
  `POST /v1/images/generations`. It lists `model`, `prompt`, `n`, `size` and `response_format` (plus
  sampling extensions). It does **not** list `/v1/images/edits`, `background` or `output_format`.
- The serve command it shows is `vllm serve <model> --omni --port <port>`. The app's hint uses
  `vllm serve Qwen/Qwen-Image-2.1 --omni --port 8091`. Whether this vLLM-Omni build serves
  Qwen-Image-2.1 at all is **reported, unconfirmed**: its examples show `Qwen/Qwen-Image`, and the
  Qwen-Image repository says that vLLM-Omni serves Qwen-Image-2512.
- The app therefore:
  - uses a reference picture only when the server's `/openapi.json` lists `/v1/images/edits`
    (otherwise the picture says `usedReference: false`);
  - refuses an asset that comes back without transparency (`image-no-alpha`);
  - refuses to draw when `/v1/models` does not list the provider's exact model, so it never claims
    one model's licence for another model's picture.
- **Reported, unconfirmed** (from the D4 plan, not read at a source): Qwen-Image-2.1 was released on
  2026-09-20, there is no paid 2.1 API, and it needs about 16 GB of GPU memory at Q8.
- No real Qwen-Image call has been made from this app yet. The provider is tested only against a
  local fake server (`tests/images/qwen.test.ts`). Its first real run needs a GPU endpoint that a
  person provides.

## For a person to decide

- Review every row above before charging. The OpenAI row could not be re-read from this session.
- Decide what happens to pictures made before launch that carry `unknown` or a non-commercial
  licence. Today they are listed in the audit when inherited, and refused when added or changed.
- Ask Alibaba for a commercial grant, but only if Qwen-Image-2.1 must stay in a commercial build.
  Show "Built with Qwen" wherever it is used.
