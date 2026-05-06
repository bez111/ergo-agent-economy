"""Golden BLAKE2b-256 vectors. Must match the TypeScript SDK byte-for-byte."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from ergo_agent_pay import ErgoAgentPay


REPO_ROOT = Path(__file__).resolve().parents[3]
VECTORS_PATH = REPO_ROOT / "test-vectors" / "task-hash.json"


def _load_vectors() -> dict:
    with VECTORS_PATH.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _decode(case: dict) -> bytes:
    if case["kind"] == "utf8":
        return case["input"].encode("utf-8")
    if case["kind"] == "hex":
        return bytes.fromhex(case["input"])
    raise ValueError(f"unknown kind: {case['kind']}")


class TestGoldenTaskHash(unittest.TestCase):
    def setUp(self) -> None:
        self.file = _load_vectors()

    def test_algorithm_metadata(self) -> None:
        self.assertEqual(self.file["algorithm"], "BLAKE2b-256")
        self.assertEqual(self.file["digest_size_bytes"], 32)

    def test_each_vector_matches(self) -> None:
        for case in self.file["cases"]:
            with self.subTest(name=case["name"]):
                data = _decode(case)
                self.assertEqual(
                    ErgoAgentPay.compute_task_hash(data),
                    case["expected_blake2b_256"],
                )

    def test_string_input_path_matches(self) -> None:
        for case in self.file["cases"]:
            if case["kind"] != "utf8":
                continue
            with self.subTest(name=case["name"]):
                self.assertEqual(
                    ErgoAgentPay.compute_task_hash(case["input"]),
                    case["expected_blake2b_256"],
                )

    def test_output_is_hex_string_of_64_chars(self) -> None:
        for case in self.file["cases"]:
            with self.subTest(name=case["name"]):
                digest = ErgoAgentPay.compute_task_hash(_decode(case))
                self.assertEqual(len(digest), 64)
                int(digest, 16)  # parses as hex


if __name__ == "__main__":
    unittest.main()
