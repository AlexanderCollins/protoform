"""
Job Application demo view.

Demonstrates ProtoFormView with custom server-side validation via validate().
These checks simulate real business logic that the rule engine can't express:
  - Disposable email screening (would call a verification service)
  - Phone number sanity checks
  - Experience cross-checks (policy checks)
  - Duplicate-application detection on final submission
"""

from __future__ import annotations

from protoform.views import ProtoFormView

from .schema import JOB_APPLICATION_SCHEMA


class JobApplicationView(ProtoFormView):
    schema = JOB_APPLICATION_SCHEMA

    def validate(
        self,
        values: dict,
        errors: dict[str, list[str]],
        *,
        step_id: str | None = None,
    ) -> None:
        """
        Custom server-side validation that runs AFTER the rule engine.

        This demonstrates checks the rule engine can't do:
        database lookups, cross-field business rules, external API calls.
        """

        # ── Step: about_you ──
        if step_id in ("about_you", None):
            # Disposable email screening
            email = (values.get("email") or "").lower()
            if email.endswith(("@mailinator.com", "@example.com")):
                errors.setdefault("email", []).append(
                    "Please use a personal or work email address — "
                    "disposable addresses are not accepted."
                )

            # Phone sanity: all-identical digits is almost certainly a typo
            digits = "".join(ch for ch in (values.get("phone") or "") if ch.isdigit())
            if digits and len(set(digits)) == 1:
                errors.setdefault("phone", []).append(
                    "This phone number doesn't look right. Please double-check it."
                )

        # ── Step: experience ──
        if step_id in ("experience", None):
            years = values.get("years_experience")

            # Sanity ceiling (the rule engine caps at 60; this simulates an
            # HR-policy check against a configurable threshold)
            if years is not None and years > 50:
                errors.setdefault("years_experience", []).append(
                    "Please double-check your years of experience."
                )

            # Cross-field consistency check
            if values.get("employment_type") == "student" and (years or 0) > 10:
                errors.setdefault("employment_type", []).append(
                    "More than 10 years of experience is unusual for a student — "
                    "please review your answers."
                )

        # ── Step: documents ──
        if step_id in ("documents", None):
            # Word-count quality gate (character count is handled client-side)
            letter = values.get("cover_letter") or ""
            if isinstance(letter, str) and letter and len(letter.split()) < 10:
                errors.setdefault("cover_letter", []).append(
                    "Your cover letter is quite short — aim for at least 10 words, "
                    "or leave it blank."
                )

        # ── Final submission only ──
        if step_id is None:
            # Simulated duplicate-application lookup
            full_name = (
                f"{values.get('first_name') or ''} {values.get('last_name') or ''}"
            ).strip().lower()
            if full_name == "test user":
                errors.setdefault("first_name", []).append(
                    "An application under this name already exists. "
                    "Contact recruiting@example.org if this is a mistake."
                )

    def save(self, grouped_values: dict, request) -> None:
        """In a real app, this would persist to the database."""
        import json
        import sys
        vals = grouped_values.get("__default__", grouped_values)
        print(
            f"\n{'='*60}\n"
            f"  JOB APPLICATION RECEIVED\n"
            f"{'='*60}\n"
            f"{json.dumps(vals, indent=2, default=str)}\n"
            f"{'='*60}\n",
            file=sys.stderr,
        )

    def save_step(self, step_id: str, grouped_values: dict, request) -> None:
        """Log step completion (in production: save draft)."""
        import sys
        vals = grouped_values.get("__default__", grouped_values)
        field_count = len(vals)
        print(
            f"  Step '{step_id}' validated OK ({field_count} fields)",
            file=sys.stderr,
        )
