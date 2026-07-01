import os
import tempfile
from pathlib import Path


os.environ.setdefault("SQLITE_DB_PATH", str(Path(tempfile.gettempdir()) / "perler-beads-tests.sqlite3"))
