#!/usr/bin/env python3
"""Reject Python source files that mutate sys.path.

This prevents in-source path hacks such as:
    sys.path.insert(0, "/home/.../src")

Use proper package installation / editable installs, or configure PYTHONPATH
in tooling instead of mutating sys.path inside repository code.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

CHECK_ROOTS = (Path("backend/lumo_dashboard"), Path("backend/tests"))
MUTATOR_METHODS = {"insert", "append", "extend"}


class SysPathMutationVisitor(ast.NodeVisitor):
    def __init__(self) -> None:
        self.sys_aliases: set[str] = set()
        self.path_aliases: set[str] = set()
        self.violations: list[tuple[int, int, str]] = []

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            if alias.name == "sys":
                self.sys_aliases.add(alias.asname or "sys")
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        if node.module == "sys":
            for alias in node.names:
                if alias.name == "path":
                    self.path_aliases.add(alias.asname or "path")
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:
        target = self._mutated_sys_path_target(node.func)
        if target is not None:
            self.violations.append((node.lineno, node.col_offset + 1, target))
        self.generic_visit(node)

    def _mutated_sys_path_target(self, func: ast.expr) -> str | None:
        if not isinstance(func, ast.Attribute) or func.attr not in MUTATOR_METHODS:
            return None

        value = func.value

        if isinstance(value, ast.Attribute) and value.attr == "path":
            base = value.value
            if isinstance(base, ast.Name) and base.id in self.sys_aliases:
                return f"{base.id}.path.{func.attr}"

        if isinstance(value, ast.Name) and value.id in self.path_aliases:
            return f"{value.id}.{func.attr}"

        return None


def iter_python_files() -> list[Path]:
    files: list[Path] = []
    for root in CHECK_ROOTS:
        if not root.exists():
            continue
        files.extend(sorted(root.rglob("*.py")))
    return files


def check_file(path: Path) -> list[str]:
    try:
        source = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        return [f"{path}:1:1: failed to read file as UTF-8 ({exc})"]

    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as exc:
        lineno = exc.lineno or 1
        offset = exc.offset or 1
        return [f"{path}:{lineno}:{offset}: syntax error while parsing ({exc.msg})"]

    visitor = SysPathMutationVisitor()
    visitor.visit(tree)

    return [
        (
            f"{path}:{lineno}:{col}: forbidden {target} call. "
            "Do not mutate sys.path in source files."
        )
        for lineno, col, target in visitor.violations
    ]


def main() -> int:
    errors: list[str] = []
    for path in iter_python_files():
        errors.extend(check_file(path))

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        print(
            "Use package installs/editable installs or PYTHONPATH in tooling instead.",
            file=sys.stderr,
        )
        return 1

    print("No sys.path mutations found.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
