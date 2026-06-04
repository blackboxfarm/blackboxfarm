All edits happen inside `src/components/social/ShareCardDemo.tsx` (the No Lube tab block, lines ~683–786) and `src/components/social/NoLubeChannelPanel.tsx`. No backend or data changes.

## New top-level No Lube tab bar

From left to right:

1. Default
2. 🌐 Public Channel
3. 🔒 Private Channel
4. 🎯 Templates  ← becomes a parent with sub-tabs
5. 💳 Subscriptions  ← promoted from inside Private Channel
6. 🕘 History  ← new parent tab

Removed from the top row (folded into the parents above):
- Asset Library, Archive, Dailies, Steps Log

## Templates parent — 3 sub-tabs

```text
Templates
├── 🖼️ Backgrounds     → renders <NoLubeTemplateManager />
│                        (this is the component that already contains the
│                         "Active background per channel" section plus the
│                         background uploader/list)
├── 🎨 Asset Library    → renders <NoLubeAssetLibrary />
└── 🏆 Dailies          → renders <NoLubeDailiesPanel />
```

Default sub-tab: Backgrounds.

## History parent — 2 sub-tabs

```text
History
├── 📦 Archive    → renders <NoLubeArchivePanel />
└── 📜 Steps Log  → renders <NoLubeFlowLog />
```

Default sub-tab: Archive.

## Subscriptions parent (promoted)

The Subscriptions panel currently lives inside `NoLubeChannelPanel` as one of three inner tabs (Compose & Settings / Process / 💳 Subscriptions). It will be lifted out:

- In `ShareCardDemo.tsx`, add a new top-level `TabsContent value="subscriptions"` that renders:
  `<SubscriptionAdminPanel profileKey="no_lube" displayName="No Lube" />`
- In `NoLubeChannelPanel.tsx`, remove the `💳 Subscriptions` TabsTrigger and its TabsContent so the inner channel tabs become just "Compose & Settings" and "Process". The `SubscriptionAdminPanel` import is removed.
- The entire SubscriptionAdminPanel (with its own internal sub-tabs: Bot & Channel, Pricing, Subscribers, Affiliates, Contacts & Broadcast, Treasury, Attrition) moves up as one block — no internal changes to that component.

## Resulting structure

```text
🐸 No Lube
├── Default
├── 🌐 Public Channel        (unchanged: Public Channel / 💧 Leaks Post)
├── 🔒 Private Channel       (now shows only Compose & Settings / Process
│                             for Private / Snapshot / Intel Update)
├── 🎯 Templates
│   ├── 🖼️ Backgrounds       → NoLubeTemplateManager
│   ├── 🎨 Asset Library     → NoLubeAssetLibrary
│   └── 🏆 Dailies           → NoLubeDailiesPanel
├── 💳 Subscriptions         → SubscriptionAdminPanel (Bot & Channel / Pricing /
│                              Subscribers / Affiliates / Contacts & Broadcast /
│                              Treasury / Attrition)
└── 🕘 History
    ├── 📦 Archive           → NoLubeArchivePanel
    └── 📜 Steps Log         → NoLubeFlowLog
```

## Files touched

- `src/components/social/ShareCardDemo.tsx` — rewrite the No Lube `TabsList` and reorganize `TabsContent` blocks.
- `src/components/social/NoLubeChannelPanel.tsx` — drop the 💳 Subscriptions inner tab and its import.

No new components, no API changes, no migrations.
