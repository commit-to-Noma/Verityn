"""Lens sample pack: curated diagrams against the real solver.

Each Reality Lens sample ships a verified SAM box pair plus a
hand-authored netlist. Code stays the source of truth for physics:
these tests prove the solver really produces the pack's expected
numbers (closed and, where modeled, switch-open), and that every
box, path, and switch rect lies inside its image.
"""

import copy
import json
import pathlib

import pytest

from verityn.solver import solve

PACK_PATH = (
    pathlib.Path(__file__).resolve().parents[2]
    / "src" / "verityn" / "lessons" / "lens_samples.json"
)


@pytest.fixture(scope="module")
def pack():
    return json.loads(PACK_PATH.read_text())


@pytest.fixture(scope="module")
def samples(pack):
    assert len(pack["samples"]) == 2
    return {sample["id"]: sample for sample in pack["samples"]}


def check_rect(rect, width, height, label):
    for key in ("left", "top", "right", "bottom"):
        assert isinstance(rect[key], int), (label, key)
    assert 0 <= rect["left"] < rect["right"] <= width, label
    assert 0 <= rect["top"] < rect["bottom"] <= height, label


def test_samples_have_honest_metadata(samples):
    assert set(samples) == {"textbook-loop", "workbench-switch"}
    for sample in samples.values():
        assert sample["modelNote"], sample["id"]
        assert sample["guide"], sample["id"]
        assert sample["claim"]["type"] == "lit"
        source = PACK_PATH.parents[3] / sample["source"]
        assert source.is_file(), sample["id"]


def test_boxes_and_paths_fit_the_image(samples):
    for sample in samples.values():
        width, height = sample["width"], sample["height"]
        for name in ("battery", "bulb"):
            box = sample["boxes"][name]
            check_rect(box, width, height, (sample["id"], name))
            assert 0 <= box["confidence"] <= 1
        assert len(sample["paths"]) >= 1
        for path in sample["paths"]:
            assert len(path) >= 2, sample["id"]
            for x, y in path:
                assert 0 <= x <= width and 0 <= y <= height, sample["id"]
        if sample["switch"] is not None:
            check_rect(sample["switch"], width, height,
                       (sample["id"], "switch"))


def check_expected(netlist, expected):
    result = solve(netlist)
    assert result.ok is True
    measurement = result.components[expected["component"]]
    assert measurement["current"] == pytest.approx(expected["current"])
    assert measurement["power"] == pytest.approx(expected["power"])
    assert (measurement["power"] > 1e-9) is expected["lit"]


def test_sample_netlists_solve_as_expected(samples):
    for sample in samples.values():
        check_expected(sample["netlist"], sample["expected"])


def test_open_switch_freezes_sample_2(samples):
    sample = samples["workbench-switch"]
    opened = copy.deepcopy(sample["netlist"])
    for component in opened["components"]:
        if component["id"] == sample["switch"]["id"]:
            component["closed"] = False
    check_expected(opened, sample["expectedOpen"])


def test_sample_1_has_no_switch(samples):
    sample = samples["textbook-loop"]
    assert sample["switch"] is None
    assert sample["expectedOpen"] is None
    kinds = [c["type"] for c in sample["netlist"]["components"]]
    assert "switch" not in kinds
