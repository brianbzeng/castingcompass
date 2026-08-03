# Marketing homepage frontend API contract

Status: frontend foundation only. These routes do not authorize or imply a production deployment, database mutation, or provider change.

## Opportunity card

The homepage first requests browser location permission. When coordinates are available, the client requests:

`GET /v1/opportunities?species=california-halibut&from={ISO-8601}&hours=72&lat={latitude}&lng={longitude}`

If location is denied, unavailable, or yields no usable nearby window, the request omits `lat` and `lng` and uses the strongest currently usable California-halibut window across the service. The response uses the existing opportunity schema. The homepage displays the relative opportunity score, location scope, window time, conditions, and source timestamp. It must not describe the score as catch probability.

States:

- `loading`: looking for a California-halibut window.
- `ready`: display the strongest active or next usable window.
- `empty`: no comparable window is available.
- `error`: current conditions could not be loaded.

## Community preview

When coordinates are available, the client selects a supported place within 80 km and reads existing public preview routes:

- `GET /api/community/{siteId}/preview`
- `GET /api/discussions/{siteId}`

If no supported place is nearby or the local preview is empty, it falls back to:

`GET /api/marketing/community-preview?limit=3&sort=recent`

Expected aggregate response:

```json
{
  "threads": [
    {
      "id": "string",
      "title": "string",
      "excerpt": "string",
      "placeName": "string",
      "href": "/community/{siteId}/{threadId}",
      "createdAt": "ISO-8601"
    }
  ]
}
```

The interface labels local versus service-wide results and always formats `createdAt` as a visible timestamp. Loading, empty, and error states remain in place without fabricated threads.

## Approved catch reports

`GET /api/marketing/recent-catches?limit=4&status=approved`

Expected response:

```json
{
  "reports": [
    {
      "id": "string",
      "species": "string",
      "measurement": "string",
      "placeName": "string",
      "handle": "string",
      "createdAt": "ISO-8601",
      "imageUrl": "approved image URL",
      "imageAlt": "descriptive alternative text",
      "href": "/community/{siteId}/{threadId}"
    }
  ]
}
```

Only reports with both an approved image URL and alternative text render. A non-success response, an absent route returning non-JSON, or an empty array produces the intentional empty state during this frontend-only phase. A network failure or malformed successful response produces the error state. No sample catches or people are substituted.

## Mailing list

`POST /api/marketing/mailing-list`

Request:

```json
{
  "email": "angler@example.com",
  "source": "marketing-home"
}
```

Success response:

```json
{
  "message": "You're on the list."
}
```

The client exposes idle, submitting, success, and error states and does not imply enrollment until the service confirms it.
