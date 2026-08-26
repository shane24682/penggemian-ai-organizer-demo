# Workspace architecture

The root route is intentionally thin:

- `app/page.tsx` mounts the product workspace and contains no product state.
- `PenggemianWorkspace.tsx` coordinates state and transitions shared by several views.
- `components/WorkspaceShell.tsx` owns the persistent navigation rail and top bar.
- `views/` contains page-level presentation components.
- `types.ts` contains the shared workspace domain types.

## Where to make common edits

- Home page cards and wording: `views/HomeView.tsx`
- Friend page wording and layout: `views/FriendsView.tsx`
- Activity history wording and layout: `views/HistoryView.tsx`
- Personal tag page: `views/PersonalTagsView.tsx`
- Partner and brand pages: `views/PartnerView.tsx`, `views/BusinessView.tsx`
- Matching, discovery plaza and test flows: `PenggemianWorkspace.tsx`
- Shared colors, typography and buttons: `styles/`

## Boundary rules

1. Route files compose features; they should not contain demo data or business state.
2. A view receives data and event callbacks through props. It should not know how another view is opened.
3. Cross-view transitions and persisted demo state stay in the workspace controller until a dedicated hook or backend API owns them.
4. Matching calculations, venue selection and other domain logic stay in `lib/`, not in JSX components.
5. New independent screens should be created in `views/` instead of adding another large conditional JSX block to the controller.
