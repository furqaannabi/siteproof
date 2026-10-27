# Clips, frames and masks live in a private Cloudflare R2 bucket, read only through presigned URLs

**Date:** 27 October 2026
**Decided by:** Furqaan
**Status:** Accepted

## Context

The pipeline stores every uploaded clip, the frames sampled from it and the masks SAM 3.1 returns. All three are real site footage: they can show people and neighbouring property, and a buyer must see only their own flat. CLAUDE.md requires them to be private, reachable only through short-lived presigned URLs. William's presigned-upload service and the report's evidence frames both need a bucket to build against.

## Options

1. **Amazon S3.** The reference API. Pays for egress, and evidence frames are read every time a buyer or bank opens a report.
2. **Cloudflare R2.** S3-compatible API, no egress fees, and Furqaan already has an account and a bucket.

## Decision

R2, in the existing `hack` bucket (Asia-Pacific), through its S3 API at `https://<account id>.r2.cloudflarestorage.com` with region `auto`. Credentials are an R2 API token with Object Read & Write.

When it was chosen, the bucket's custom domain `hack-s3.furqaannabi.com` had public access enabled: an object could be read from it with no signature. Public access was turned off the same day. Checked after the change: a presigned read returns 200, an unsigned read through the custom domain returns 401, and an unsigned read through the S3 endpoint returns 400.

## Consequences

- Every read of a clip, frame or mask goes through a presigned URL minted by the backend. Nothing builds a link on the custom domain, so turning public access back on would expose files without any code changing: keep it off.
- Bun's built-in `Bun.S3Client` speaks to R2 directly, including presigning, so no AWS SDK is needed.
- `hack` is shared with other projects. SiteProof's object keys should be random ids, never names a person could guess (`flat-302/kitchen.mp4`), and should never be logged or shown — the same rule as for presigned URLs.
- Moving to S3 later is a change of endpoint, region and credentials, not of code.
