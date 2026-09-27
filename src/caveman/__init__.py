"""Caveman: the product layer (API, worker, delivery) around the orchestration core.

The orchestration core lives in the ``walter`` package, its historical name. It
remains the single authority for runs, tasks, artifacts, validation, review,
approvals, recovery and completion. This package only observes that state,
queues durable execution, and exposes it to authenticated users.
"""

__version__ = "0.2.0"
