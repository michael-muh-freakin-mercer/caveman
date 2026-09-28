"""PostgreSQL behind the same connection surface the SQLite stores use.

The stores speak a small SQLite dialect: ``?`` placeholders, ``rowid`` for
insertion order, and ``BEGIN IMMEDIATE`` to take the single write lock before
a read-modify-write. This adapter maps that dialect onto PostgreSQL so the
stores keep one implementation and one set of semantics:

- ``BEGIN IMMEDIATE`` opens a transaction and takes a transaction-scoped
  advisory lock for the store's schema. Writers are serialized exactly as with
  SQLite, so the kernel's optimistic version check and the job queue's
  claim/enqueue rules hold across processes and hosts.
- ``?`` becomes ``%s`` and ``rowid`` becomes the ``seq`` identity column that
  each PostgreSQL table relying on insertion order declares last.
- Rows can be read by position or by column name, like ``sqlite3.Row``.

Each store lives in its own schema, so the kernel's and the platform's tables
never collide.
"""
from __future__ import annotations

import re
import threading
import zlib

POSTGRES_SCHEMES = ("postgres://", "postgresql://")
_SCHEMA_NAME = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")


def is_postgres_url(location: object) -> bool:
    return isinstance(location, str) and location.startswith(POSTGRES_SCHEMES)


class Row(tuple):
    """A result row readable by index or by column name."""

    __slots__ = ()
    _names: dict[str, int] = {}

    def __getitem__(self, key):
        if isinstance(key, str):
            return tuple.__getitem__(self, self._names[key])
        return tuple.__getitem__(self, key)

    def keys(self):
        return list(self._names)


def _row_factory(cursor):
    names = {column.name: index for index, column in enumerate(cursor.description or ())}
    row_type = type("Row", (Row,), {"__slots__": (), "_names": names})
    return lambda values: row_type(values)


class _Cursor:
    def __init__(self, cursor):
        self._cursor = cursor

    @property
    def rowcount(self) -> int:
        return self._cursor.rowcount

    def fetchone(self):
        return self._cursor.fetchone() if self._cursor.description else None

    def fetchall(self):
        return self._cursor.fetchall() if self._cursor.description else []

    def __iter__(self):
        return iter(self.fetchall())


def _translate(sql: str) -> str:
    return re.sub(r"\browid\b", "seq", sql.replace("%", "%%").replace("?", "%s"))


class PostgresConnection:
    """A psycopg connection presented with the sqlite3 calls the stores make."""

    def __init__(self, url: str, schema: str):
        import psycopg

        if not _SCHEMA_NAME.fullmatch(schema):
            raise ValueError(f"Invalid PostgreSQL schema name {schema!r}")
        self.schema = schema
        self._lock_key = zlib.crc32(schema.encode())
        self._connection = psycopg.connect(url, autocommit=True, row_factory=_row_factory)
        self._guard = threading.RLock()
        with self._guard:
            # Concurrent first connections would race on CREATE SCHEMA IF NOT EXISTS.
            with self._connection.transaction():
                self._connection.execute("SELECT pg_advisory_xact_lock(%s)", (self._lock_key,))
                self._connection.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')
            self._connection.execute(f'SET search_path TO "{schema}"')

    @property
    def in_transaction(self) -> bool:
        from psycopg.pq import TransactionStatus
        return self._connection.info.transaction_status != TransactionStatus.IDLE

    def execute(self, sql: str, params: tuple | list = ()) -> _Cursor:
        statement = sql.strip().upper()
        with self._guard:
            if statement == "BEGIN IMMEDIATE":
                self._connection.execute("BEGIN")
                self._connection.execute("SELECT pg_advisory_xact_lock(%s)", (self._lock_key,))
                return _Cursor(self._connection.cursor())
            return _Cursor(self._connection.execute(_translate(sql), tuple(params)))

    def executemany(self, sql: str, rows) -> None:
        with self._guard, self._connection.cursor() as cursor:
            cursor.executemany(_translate(sql), [tuple(row) for row in rows])

    def executescript(self, script: str) -> None:
        with self._guard:
            for statement in (part.strip() for part in script.split(";")):
                if statement:
                    self._connection.execute(statement)

    def close(self) -> None:
        with self._guard:
            self._connection.close()
