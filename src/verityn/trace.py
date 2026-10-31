"""Trace events: what a model did, what code checked.

Every AI-route response carries one trace object describing the single
serving decision behind it. Only real events are recorded: refusals and
malformed requests carry no trace because no provider was touched.
"""

from datetime import datetime, timezone

DETERMINISTIC_TOOL = "deterministic"


def _utcnow_iso():
    return datetime.now(timezone.utc).isoformat()


def guard_for(serving, primary, failed_stage=None):
    """Return (guard, decided_by) for a served provider name.

    Meta output that passed validation is accepted; deterministic rungs
    are computed from solver facts; anything else served a fixed
    template. A failover caused by validation credits the validator;
    other failovers and configured templates credit nothing.
    """
    if serving == DETERMINISTIC_TOOL:
        return "accepted", "solver"
    if serving.startswith("meta-"):
        return "accepted", "validator"
    if serving != primary and failed_stage == "validate":
        return "fallback:template", "validator"
    return "fallback:template", "none"


def build_trace(*, tool, input_kind, output_kind, serving, primary, ms,
               failed_stage=None, decided_by=None):
    """Build one trace event for a served AI response."""
    guard, derived = guard_for(serving, primary, failed_stage)
    decided_by = derived if decided_by is None else decided_by
    return {
        "tool": tool,
        "input": input_kind,
        "output": output_kind,
        "guard": guard,
        "decided_by": decided_by,
        "ms": ms,
        "t": _utcnow_iso(),
    }


def rejection_trace(*, tool, input_kind, output_kind, reason, ms):
    """Build a trace event for a provider failure with no usable response."""
    code = reason if isinstance(reason, str) and reason else "unknown"
    return {
        "tool": tool,
        "input": input_kind,
        "output": output_kind,
        "guard": f"rejected:{code}",
        "decided_by": "validator",
        "ms": ms,
        "t": _utcnow_iso(),
    }
