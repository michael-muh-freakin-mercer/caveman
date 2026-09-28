import pytest

from walter.usage import UsageBudget, UsageBudgetExceeded, token_counts, usage_mapping


def test_fake_provider_usage_counts_are_normalized():
    usage = {"prompt_tokens": "12", "completion_tokens": 8}
    assert token_counts(usage) == (12, 8, 20)
    assert usage_mapping(usage) == usage


def test_missing_fake_provider_usage_remains_unknown():
    assert token_counts({}) == (None, None, None)


def test_preflight_call_budget_rejects_before_call():
    budget = UsageBudget(max_calls=1, max_total_tokens=20)
    budget.check(calls_used=0, input_tokens_used=0, output_tokens_used=0,
                 total_tokens_used=0, requested_input_tokens=10,
                 requested_output_tokens=10)
    try:
        budget.check(calls_used=1, input_tokens_used=10, output_tokens_used=10,
                     total_tokens_used=20, requested_input_tokens=1,
                     requested_output_tokens=1)
    except UsageBudgetExceeded as error:
        assert str(error) == "Model-call budget exhausted"
    else:
        raise AssertionError("expected pre-call budget rejection")


def test_preflight_token_budget_rejects_without_provider_call():
    budget = UsageBudget(max_input_tokens=10)
    try:
        budget.check(calls_used=0, input_tokens_used=9, output_tokens_used=0,
                     total_tokens_used=9, requested_input_tokens=2)
    except UsageBudgetExceeded as error:
        assert str(error) == "Input-token budget exhausted"
    else:
        raise AssertionError("expected pre-call budget rejection")


def test_spend_ceiling_counts_only_reported_cost():
    from walter.usage import UsageBudget, UsageBudgetExceeded, cached_tokens, usage_cost

    assert usage_cost({"prompt_tokens": 3, "cost": 0.0021}) == 0.0021
    assert usage_cost({"prompt_tokens": 3}) is None
    assert usage_cost({"cost": "not-a-number"}) is None
    assert cached_tokens({"prompt_tokens_details": {"cached_tokens": 4}}) == 4
    budget = UsageBudget(max_cost_usd=0.01)
    budget.check(calls_used=0, input_tokens_used=0, output_tokens_used=0,
                 total_tokens_used=0, cost_used_usd=0.009)
    with pytest.raises(UsageBudgetExceeded, match="Spend"):
        budget.check(calls_used=0, input_tokens_used=0, output_tokens_used=0,
                     total_tokens_used=0, cost_used_usd=0.01)
