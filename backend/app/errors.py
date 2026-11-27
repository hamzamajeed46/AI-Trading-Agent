import logging

from groq import APIError, RateLimitError

from graph.validation import InvalidRecommendationError

logger = logging.getLogger(__name__)


def friendly_error_message(exc: Exception) -> str:
    """Maps a raised exception to a message that's safe to show a user --
    the raw provider error (e.g. Groq's 429 body) includes our org ID and a
    billing-upgrade link, which has no business reaching an end user. The
    real exception is still logged server-side so it's debuggable."""
    logger.exception("Signal graph run failed: %r", exc)

    if isinstance(exc, InvalidRecommendationError):
        return f"The agent proposed an invalid trade, so it was blocked. {exc}"
    if isinstance(exc, RateLimitError):
        return "The AI provider (Groq) is temporarily rate-limited. Wait a minute and try again."
    if isinstance(exc, APIError):
        return "The AI provider had a problem processing this request. Please try again."
    return "Something went wrong while running the analysis. Please try again."
