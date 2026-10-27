# The demand letter is what gets judged; the BOQ is a ceiling

**Date:** 27 October 2026
**Decided by:** William
**Status:** Accepted — affects the comparison engine, so Furqaan to agree

## Context

`docs/PRODUCT.md` step 5 says the comparison is "claimed vs counted vs plan" — three numbers. Only two of them were ever specified. The demand letter says `windows complete: 12`, the BOQ says the flat has 10 windows in total, and the footage shows 9.

## Options

1. **The demand letter is judged; the BOQ bounds what can exist.**
2. **The BOQ wins, the letter is ignored.**
3. **They must agree, or the claim is unverified.**
4. **Cap the claim at the BOQ quantity** and judge the capped number.

## Decision

Option 1. The demand letter is the claim, because payment moves against the letter and nobody pays against a BOQ. The BOQ is the plan: it bounds what can physically exist.

When the letter exceeds the plan for an item, no footage can ever verify it, so it is a paper discrepancy rather than a coverage one. It is caught before a single frame is examined, the claim gets **no `Result` row and a note**, and it goes to a person with both quotes side by side. That reuses the mechanism already agreed for non-countable claims rather than inventing a fourth outcome.

Option 3 breaks the normal case: a construction-linked plan bills in stages, so "8 of the 10 windows" is what an honest letter looks like, and option 3 would flag every legitimate partial stage. Option 4 is the dangerous one — it silently rewrites the builder's claim to a number that appears in neither document and traces back to no source line.

**Where the BOQ is silent** on that item for that room there is no ceiling. The letter is judged on its own, and the report says no plan quantity was found rather than inventing one.

## Consequences

- Reading both documents against each other catches a class of error footage cannot: a claim for more than the flat contains. A site engineer on an occasional visit would miss it too, which makes it worth showing in the demo.
- The comparison engine needs the plan quantity available per item and room, not just the claimed quantity. That is an input Furqaan's engine must receive from the document side.
- No change to the three outcomes.
