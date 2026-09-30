"""Cavman: the product layer (API, worker, delivery) around the orchestration core.

The orchestration core lives in the ``walter`` package, its historical name. It
remains the single authority for runs, tasks, artifacts, validation, review,
approvals, recovery and completion. This package only observes that state,
queues durable execution, and exposes it to authenticated users.
"""

from .legacy import alias_environment

__version__ = "0.2.0"

# Installs configured before the Caveman -> Cavman rename keep working.
alias_environment()
