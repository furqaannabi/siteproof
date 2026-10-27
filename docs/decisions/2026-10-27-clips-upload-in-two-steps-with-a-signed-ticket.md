# Clips upload in two steps: a presigned link, then a signed ticket that registers the clip

**Date:** 27 October 2026
**Decided by:** William
**Status:** Accepted. The request and response shapes and the new `POST /clips/complete` are contract surface — proposed, awaiting Furqaan's approval

## Context

Clips go straight to R2 through a presigned link ([documents go through the API](2026-10-27-documents-are-uploaded-through-the-api.md); clips are too large). The server never sees the video arrive, and on mobile data a 30 MB upload can take minutes or never finish. The jobs rule says a clip and its ingest job are inserted in one transaction, and a new clip's only starting status is `uploaded`. The data contract described `POST /clips` as "register a clip and hand back a presigned upload URL", which would register the clip and its job before the video exists.

## Decisions

**1. Two steps, and nothing saved until the video is in R2.**

1. `POST /clips { project_id, content_type }` returns `{ upload_url, ticket, expires_at }`. Nothing is saved.
2. The phone sends the video to `upload_url`.
3. `POST /clips/complete { ticket }`: the server checks the video is really in R2, then inserts the clip and its `ingest_clip` job in one transaction, and returns the contract's `Clip` with status `uploaded`.

The ticket says "project X may register the file at this key until this time", signed with HMAC-SHA256 under `UPLOAD_TICKET_SECRET`, so it cannot be forged or altered, and no table is needed to remember it. Rejected: saving the clip and its job at once and having the job poll R2 for the video — its status would say `uploaded` before it was, and an abandoned upload would leave a clip and a job waiting for up to half an hour.

**2. Limits, each where it can be enforced.**

| Limit | Value | Where |
| --- | --- | --- |
| Type | MP4 or MOV (`video/mp4`, `video/quicktime`): what phones and WhatsApp make, and what SAM accepts | At `/clips/complete`, by the file's first bytes: a file that is not an MP4 or MOV container is deleted and refused. Not by the upload link: checked live, R2 stored a WebM sent to a link signed for MP4, and a type header is only a label anyway |
| Size | 250 MB | At `/clips/complete`: an upload link cannot cap its own size, so an oversized file is deleted and refused ("Film at 1080p rather than 4K") |
| Length | 60 seconds | Furqaan's ingest step, which already refuses longer clips. The server cannot read a video's length without downloading it. Apurva's upload screen can check it in the browser first |
| Time | Link 30 minutes, ticket 60 | 250 MB over slow mobile data fits; the ticket outlives the link so a slow upload can still be completed |

**3. Completing twice returns the same clip.** A phone that loses the reply retries; the second call finds the clip already saved under that ticket's key and returns it. No second clip or job: `object_key` is unique, so even two calls at once cannot make two.

Also: `GET /clips/:id/status` returns the contract's `Clip`, its `url` a presigned read link valid for 15 minutes, signed locally on each read; the job's payload is `{ clip_id }` only; `UPLOAD_TICKET_SECRET` lives in `backend/.env` on every machine and the server, never in the repo.

## Consequences

- One more endpoint for Apurva's upload screen, and a contract change: `POST /clips` no longer registers anything; `POST /clips/complete` does. For Furqaan.
- A presigned link, for uploading or for viewing (the contract's `Clip.url`), necessarily carries its object key in its path. Keys stay random, are never logged, and never appear in a response other than inside such a link.
- An upload that is abandoned leaves at most an unregistered object in R2: private, under a random key, harmless.
- No auth yet: none of these routes may be deployed open.
