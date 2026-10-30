# SAM 3.1 spike: "Snap the Real Thing" (World-As-Lab)

2-hour isolated technical spike. Status: **RUN 2026-10-28  -  GATE
FAILED (2 of 10)**. Ran once with explicit authorization: 30 live
requests (10 images × 3 prompts), no retries, no errors. Per the
spike contract the open-ended overlay is halted and Snap & Build stays
intact. Follow-up (Path 1): the two passing diagrams shipped as
curated Reality Lens samples (`src/verityn/lessons/lens_samples.json`,
images under `frontend/public/lens/`).

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

Raw cells in `docs/sam-spike-results.json` (boxes + confidences,
no image bytes or mask payloads). Fixtures were flat, so categories
below follow the filename prefixes.

| Image | Category | Battery | Bulb | Switch | Notes |
| ----- | -------- | ------- | ---- | ------ | ----- |
| 01_hand_simple | hand | no | no | no | all zero-match |
| 02_hand_open_switch | hand | no | no | no | all zero-match |
| 03_hand_two_bulbs | hand | no | no | no | all zero-match |
| 04_hand_crude_pictorial | hand | no | yes (0.52) | no | bulb only |
| 05_textbook_simple | textbook | yes (0.91) | yes (0.95) | no | **both** |
| 06_textbook_switch | textbook | no | no | no | all zero-match |
| 07_textbook_parallel | textbook | no | no | no | all zero-match |
| 08_digital_verityn | digital | yes (0.51) | yes (0.71) | no | **both** |
| 09_digital_phet | digital | no | yes (0.67) | no | bulb only |
| 10_digital_schematic_cad | digital | no | no | no | all zero-match |

Summary: **2 of 10** images detected both battery and bulb
(threshold 7 of 10): FAIL. All 30 responses parsed cleanly  -  no
transport, envelope, or grammar errors  -  so the misses are genuine
zero-match lanes, not integration failures. Notably the switch
prompt matched nothing anywhere, and hand-drawn sketches yielded a
single bulb. The payload contract itself is verified working.
