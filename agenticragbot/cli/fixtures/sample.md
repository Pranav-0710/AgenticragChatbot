---
title: "Sample KB Page"
source_url: "https://example.com/sample"
scraped_at: "2026-01-01T00:00:00.000Z"
word_count: 120
description: "A tiny committed fixture for smoke-testing the CLI pipeline."
---

# Sample KB Page

> **Source:** https://example.com/sample
> **Scraped:** Jan 1, 2026

This is a small fixture document used to smoke-test the clean, chunk, and
memory stages of the pipeline without hitting the network. It has enough
structure — a title, a couple of sections, and a nested subsection — to
produce more than one chunk and exercise the topic tree.

## What This Fixture Covers

The cleaner should reflow these hard-wrapped sentences into whole paragraphs,
build a topic tree from the headings below, and hand the tree to the chunker.

**Key Idea**

A bold line like the one above should be promoted to a real heading by the
clean phase, which is one of the behaviors worth exercising here.

### A Nested Detail

Nested headings become child chunks with a parent_id pointing back up the
hierarchy, so the graph roles (root / branch / leaf) are all represented.

## Why It Matters

Running `pipeline run --doc sample` over this file should always succeed and
produce a chunks.json, a memory.json, a memory.md, and update memory-index.md.
