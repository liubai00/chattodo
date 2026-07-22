from contextlib import contextmanager
from contextvars import ContextVar


CONFIRMED_ACTIONS = {
    "row.delete",
    "field.delete",
    "field.type_change",
}

_confirmed_action = ContextVar("linx_confirmed_action", default=None)


@contextmanager
def confirmed_action(value):
    action = value if value in CONFIRMED_ACTIONS else None
    token = _confirmed_action.set(action)
    try:
        yield
    finally:
        _confirmed_action.reset(token)


def is_confirmed(action):
    return _confirmed_action.get() == action
