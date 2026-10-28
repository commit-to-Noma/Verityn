# SAM 3.1 spike: "Snap the Real Thing" (World-As-Lab)

2-hour isolated technical spike. Status: **HALTED BY DIRECTION**
(extra models out of scope; scaffold kept, never run). No live SAM
request has been made.

## Official contract (no guessing)

Sources: Meta's `meta-models/meta-sam` repository.

- Request: `POST https://api.meta.ai/v1/responses`, unary
  (`stream: false`; streaming image requests answer
  `response.failed`), model `sam-3.1`
  (`typescript/examples/api-playground/server/openai-request.ts`,
  playground README `SAM_MODEL` / `SAM_API_BASE_URL`).
- Body: `{model, stream: false, input: [{type: "message",
  role: "user", content: [{type: "input_text", text: "<noun phrase>"},
  {type: "input_image", image_url: "data:<mime>;base64,..."}]}],
  metadata?: {include_confidence: "true"}}`. A request must not
  combine a noun phrase with object prompts.
- Response: unary `{status, output: [{content: [{type:
  "output_text", text}]}]}`; the lane carries the `protocol/sam3.md`
  wire grammar (`<0f>id<|box;...|><|mask;...|>` per record).
- Empty lane = zero matches (valid, counts as not-found). Mask
  payloads are opaque base85 and are never logged or stored.

## Spike design

- Module `src/verityn/sam.py`: stdlib only, no core imports, refuses
  to run unless `VERITYN_SAM_ENABLED=1`. Nothing in the learning
  journey imports it.
- Runner `scripts/sam_spike.py`: one request per (image, prompt),
  no retries. Exit 0 pass / 2 threshold missed / 3 setup problem.
- Images (10): 4 hand-drawn sketches, 3 textbook schematics,
  3 digital screenshots, under one directory (optional
  `hand/`, `textbook/`, `digital/` subfolders for the breakdown).
- Prompts: `battery`, `light bulb`, `switch`.

## Run it

```sh
VERITYN_SAM_ENABLED=1 MODEL_API_KEY=... .venv/bin/python \
    scripts/sam_spike.py --images spike-images/ \
    --out docs/sam-spike-results.json
```

Requires explicit live-call authorization. The runner only checks
that the key is set; it never prints it.

## Success gate

Proceed to a UI overlay ONLY if SAM detects **both** the battery
**and** the bulb in at least **7 of 10** images, reported strictly
as "x of 10". Malformed lanes and transport failures count as
errors, never as detections. If the gate fails or the payload is
rejected, halt, keep this log, and leave Snap & Build intact.

## Results

| Image | Category | Battery | Bulb | Switch | Notes |
| ----- | -------- | ------- | ---- | ------ | ----- |
| _not run_ | | | | | |

Summary: _pending_ — `docs/sam-spike-results.json` not generated.
