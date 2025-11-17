# authentication.md

Authentication is handled by monday.com, since the app is embedded within their platform. Users log in to monday.com, and the app leverages monday.com's authentication system to identify users.

## Guidelines

- Do not implement a separate authentication mechanism within the app.
- Use the context data provided by monday.com to identify users and their permissions.
- Ensure that sensitive operations are only performed for authenticated users.
- Log relevant authentication events for auditing purposes.

## Example Context Data

```json
{
  "method": "get",
  "type": "context",
  "data": {
    "themeConfig": null,
    "theme": "black",
    "account": {
      "id": "6813290"
    },
    "user": {
      "id": "15557978",
      "isAdmin": false,
      "isGuest": false,
      "isViewOnly": false,
      "countryCode": "DE",
      "currentLanguage": "en",
      "timeFormat": "24H",
      "timeZoneOffset": 1
    },
    "region": "use1",
    "productKind": "10093110",
    "app": {
      "id": 10644582,
      "clientId": "191fdfff61a917f3b3e23d65b522f157"
    },
    "appVersion": {
      "id": 11612959,
      "name": "DKI TimeTracker",
      "status": "draft",
      "type": "major",
      "versionData": {
        "major": 1,
        "minor": 0,
        "patch": 0,
        "number": 1,
        "type": "major",
        "displayNumber": "v1"
      }
    },
    "boardIds": [
      1222601478,
      18231288114,
      9876857688
    ],
    "widgetId": 589401115,
    "viewMode": "widget",
    "editMode": true,
    "instanceId": 589401115,
    "instanceType": "dashboard_widget",
    "appFeature": {
      "type": "AppFeatureDashboardWidget",
      "name": "DKI TimeTracker - v1"
    },
    "permissions": {
      "approvedScopes": [
        "me:read",
        "boards:read",
        "docs:read",
        "workspaces:read",
        "users:read",
        "account:read",
        "updates:read",
        "assets:read",
        "tags:read",
        "teams:read",
        "webhooks:read"
      ],
      "requiredScopes": [
        "me:read",
        "boards:read",
        "docs:read",
        "workspaces:read",
        "users:read",
        "account:read",
        "updates:read",
        "assets:read",
        "tags:read",
        "teams:read",
        "webhooks:read"
      ]
    }
  },
  "requestId": "omcji7l"
}
```
