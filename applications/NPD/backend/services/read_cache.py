"""
Short-lived cache for the heavy read-only screens (dashboard, the Tracking
and APQP lists, analytics).

With thousands of projects these take a second or more to build. Most
visits happen without anything having changed in between, so the finished
result is kept and handed out again instantly.

When is it thrown away?
  * after ANY change - every successful POST / PUT / PATCH / DELETE calls
    bump() (see the middleware in main.py), so nobody ever sees old data
    after saving;
  * when the date changes (overdue counts depend on "today");
  * after MAX_AGE seconds regardless, as a safety net.

It lives in the memory of one backend process. Run the backend as a single
process (the default for uvicorn), which is also what the daily email
scheduler needs. With several processes, each keeps its own copy and
another process could show data up to MAX_AGE seconds old.
"""

import asyncio
import time
from datetime import date
from typing import Any, Awaitable, Callable

MAX_AGE = 900          # seconds (15 min) - writes clear it immediately anyway
_MAX_KEYS = 64         # analytics filters create a key each; keep it small

_version = 0
_store: dict[tuple, tuple[float, Any]] = {}
_inflight: dict[tuple, asyncio.Future] = {}


def bump() -> None:
    """Something changed - forget every cached result."""
    global _version
    _version += 1
    _store.clear()


async def get(name: str, build: Callable[[], Awaitable[Any]], *args) -> Any:
    """Cached result of build(), keyed by name + args + data version + today."""
    key = (name, args, _version, date.today())
    hit = _store.get(key)
    now = time.monotonic()
    if hit and now - hit[0] < MAX_AGE:
        return hit[1]

    # Two people opening the dashboard at once share one computation.
    pending = _inflight.get(key)
    if pending is not None:
        return await asyncio.shield(pending)

    fut: asyncio.Future = asyncio.get_running_loop().create_future()
    _inflight[key] = fut
    try:
        value = await build()
    except BaseException as exc:
        fut.set_exception(exc)
        fut.exception()          # mark retrieved - no "never retrieved" warning
        raise
    else:
        fut.set_result(value)
        # Only keep it if nothing changed while it was being built.
        if key[2] == _version:
            if len(_store) >= _MAX_KEYS:
                _store.clear()
            _store[key] = (time.monotonic(), value)
        return value
    finally:
        _inflight.pop(key, None)
