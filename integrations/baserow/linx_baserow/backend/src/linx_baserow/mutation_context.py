from contextlib import contextmanager
from contextvars import ContextVar


_source = ContextVar("linx_mutation_source", default=None)


@contextmanager
def mutation_source(value):
    token = _source.set(value)
    try:
        yield
    finally:
        _source.reset(token)


def current_mutation_source():
    return _source.get()
