import { Suspense, lazy, useCallback, useEffect } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useMatch,
  useNavigate,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NotificationProvider, useNotifications } from './contexts/NotificationContext';
import { FarmProvider, useFarm } from './contexts/FarmContext';
import { ToastContainer } from './components/Toast';
import { Auth } from './pages/Auth';

/*
 * WI-22. Every page below was a static import until 6 Sep 2026, so all thirteen — and
 * everything they reach — were in the first paint. Two libraries dominated that:
 * `recharts`, used by eleven report sub-pages and nothing else, and `jspdf`, reached
 * through the `lib/exportUtils` barrel that every report page and `useSprayPlanner`
 * import. Neither is needed to render the Dashboard, which is where every session starts.
 *
 * `Auth` stays EAGER on purpose. It is the first thing a signed-out visitor sees, and
 * putting a spinner in front of the login form to save bytes on a screen that has almost
 * none is the wrong trade.
 *
 * The `.then(m => ({ default: m.X }))` shape is because these are named exports, not
 * default ones. It matches the three lazy boundaries that already existed inside pages.
 */
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Fields = lazy(() => import('./pages/Fields').then((m) => ({ default: m.Fields })));
const FieldDetail = lazy(() => import('./pages/FieldDetail').then((m) => ({ default: m.FieldDetail })));
const Products = lazy(() => import('./pages/Products').then((m) => ({ default: m.Products })));
const CostTemplates = lazy(() => import('./pages/CostTemplates').then((m) => ({ default: m.CostTemplates })));
const Yields = lazy(() => import('./pages/Yields').then((m) => ({ default: m.Yields })));
const Harvest = lazy(() => import('./pages/Harvest').then((m) => ({ default: m.Harvest })));
const SalesTracking = lazy(() => import('./pages/SalesTracking').then((m) => ({ default: m.SalesTracking })));
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })));
const SprayPlanner = lazy(() => import('./pages/SprayPlanner').then((m) => ({ default: m.SprayPlanner })));
const AccountSettings = lazy(() => import('./pages/AccountSettings').then((m) => ({ default: m.AccountSettings })));
const FarmSettings = lazy(() => import('./pages/FarmSettings').then((m) => ({ default: m.FarmSettings })));
const Team = lazy(() => import('./pages/Team').then((m) => ({ default: m.Team })));

import { DashboardLayout } from './components/DashboardLayout';
import { AppLoadErrorBanner, AppRefreshIndicator, PageLoadFallback } from './components/AppLoadStatus';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  AppLoadFailedScreen,
  AppLoadingScreen,
  CreateSeasonScreen,
  DeleteSeasonScreen,
  FirstSeasonScreen,
} from './components/app/AppFullScreens';
import { resolveAppLoadPresentation } from './lib/appLoadState';
import { SeasonImportWizard } from './components/SeasonImportWizard';
import { useCascadeTaskNotifications } from './hooks/useCascadeTaskNotifications';
import { useSeasonData } from './hooks/useSeasonData';
import { useSeasonCrud } from './hooks/useSeasonCrud';
import { useFarmSwitching } from './hooks/useFarmSwitching';
import {
  DASHBOARD_PAGE,
  FIELD_DETAIL_PATTERN,
  PAGE_PATHS,
  fieldDetailPath,
  pageKeyFromPath,
  pathForPage,
} from './lib/appRoutes';

/*
 * R-6. Names the failing region in the error panel, so a crash on one screen reads as
 * that screen rather than as "the app broke". Falls back to neutral wording for an
 * unlisted page rather than printing a raw route key at the user.
 */
const PAGE_LABELS: Record<string, string> = {
  dashboard: 'the Dashboard',
  fields: 'the Fields page',
  products: 'the Products page',
  templates: 'the Cost Templates page',
  yields: 'the Yields page',
  harvest: 'the Harvest page',
  sales: 'the Sales page',
  'spray-planner': 'the Spray Planner',
  reports: 'the Reports page',
  'account-settings': 'Account Settings',
  'farm-settings': 'Farm Settings',
  team: 'the Team page',
};

/*
 * WI-29b. What is left in this component after the decomposition, and what is
 * deliberately still here.
 *
 * Gone: season loading and its three-part load state (`useSeasonData`), season create /
 * import / delete (`useSeasonCrud`), the five farm handlers (`useFarmSwitching`), and
 * the five full-screen presentational blocks (`components/app/AppFullScreens`).
 *
 * Still here on purpose: routing, and the ORDER of the gates below. Which surface a
 * load state earns is R-1's whole subject, and the sequence — fatal error, first load,
 * signed out, confirmed-empty seasons, wizard, page — is the thing that was wrong
 * before R-1 and must stay readable in one place rather than being distributed across
 * the hooks that produce the states. A hook that decided when to take the screen would
 * be the amplifier coming back by another route.
 */
function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const { addNotification } = useNotifications();
  const {
    activeFarm,
    ownedFarms,
    setOwnedFarms,
    setOwnFarm,
    setOwnFarmById,
    setSharedFarm,
    activeFarmId,
  } = useFarm();

  /*
   * WI-29a. `activePage` was React state seeded from `sessionStorage`, which meant the
   * browser's history stack had exactly one entry for the whole session: the back
   * gesture left the app rather than going back a screen. On a desktop that reads as a
   * papercut; on a phone, back is the primary navigation control, and "the app closed
   * itself" is precisely the report the random-reload thread has spent a week chasing.
   *
   * The URL is now the state, so back, forward and a shared link all work. It stays a
   * plain string here because `DashboardLayout` identifies pages that way and is
   * untouched by this change — the mapping between the two lives in lib/appRoutes.ts,
   * where it can be tested.
   */
  const location = useLocation();
  const navigate = useNavigate();
  const activePage = pageKeyFromPath(location.pathname);
  /*
   * WI-29a. Which field is open was `selectedFieldId` in React state, so it survived
   * exactly as long as this component instance did — a remount landed on the Fields
   * page with no explanation, and the URL never said which field you were looking at.
   * It is a route parameter now, which also makes a field's screen linkable.
   */
  const fieldDetailMatch = useMatch(FIELD_DETAIL_PATTERN);
  const selectedFieldId = fieldDetailMatch?.params.fieldId
    ? decodeURIComponent(fieldDetailMatch.params.fieldId)
    : null;

  const isOwnFarm = activeFarm?.isOwn !== false;
  const activeRole = activeFarm?.role ?? 'admin';

  const data = useSeasonData({
    user,
    authLoading,
    activeFarmId,
    setOwnedFarms,
    setOwnFarmById,
    setOwnFarm,
  });
  const {
    seasons,
    currentSeason,
    loading,
    dataLoadError,
    hasLoadedOnce,
    sharedFarms,
    wasAuthenticated,
    loadSharedFarms,
    retryInitialLoad,
    beginFullScreenLoad,
  } = data;

  /*
   * WI-29a. This is a `useCallback` where the old one was a plain function, and the
   * reason is worth recording because it is the lint telling the truth.
   *
   * The old body touched only `sessionStorage` and a `setState` setter, both of which
   * exhaustive-deps knows are stable, so it never asked the farm-switch callbacks to
   * declare it. `navigate` is a hook return value, so the new body is reactive and
   * those callbacks genuinely do depend on it. Memoising here keeps them stable —
   * `navigate` itself does not change between renders — rather than silencing correct
   * warnings.
   */
  const handleNavigate = useCallback(
    (page: string) => {
      navigate(pathForPage(page));
    },
    [navigate]
  );

  const goToDashboard = useCallback(() => handleNavigate(DASHBOARD_PAGE), [handleNavigate]);

  const crud = useSeasonCrud({ user, activeFarmId, isOwnFarm, data });
  const farms = useFarmSwitching({
    user,
    activeFarm,
    ownedFarms,
    setOwnedFarms,
    setOwnFarm,
    setOwnFarmById,
    setSharedFarm,
    addNotification,
    data,
    goToDashboard,
  });

  useCascadeTaskNotifications(user?.id ?? null);

  /*
   * R-4, item 2 ONLY. This side effect used to sit in the render body, immediately
   * above `return <Auth />`. A mutation during render is a bug independent of
   * everything else in the reload diagnosis, and StrictMode runs it twice.
   *
   * The BEHAVIOUR is deliberately unchanged: losing the page on a sign-out the user did
   * not ask for is the rest of R-4, and the diagnosis says not to implement that until
   * a real session log shows which sign-out is actually firing. This moves the side
   * effect somewhere legal without deciding that question.
   *
   * WI-29a: this was `sessionStorage.removeItem('activePage')`, and that key no longer
   * exists. Forgetting the page is now a replace-navigation to the dashboard, which is
   * the same OBSERVABLE behaviour and is still deliberately unchanged. `replace` rather
   * than a push, so signing out does not leave a history entry that back would return
   * to — the old code changed no URL at all, and a push would have been a new behaviour
   * smuggled in under a refactor.
   */
  useEffect(() => {
    if (!user && wasAuthenticated.current) {
      navigate(PAGE_PATHS[DASHBOARD_PAGE], { replace: true });
      /*
       * R-1. A sign-out ends the session that made the loaded state worth keeping, so
       * the next sign-in is a first load again. Without this, signing back in — as
       * anyone, including a different account — would skip the full-screen load and
       * briefly render the PREVIOUS session's seasons behind a refresh bar.
       */
      beginFullScreenLoad();
    }
  }, [user, navigate, wasAuthenticated, beginFullScreenLoad]);

  /*
   * A block body, not a concise one. `navigate` returns `void | Promise<void>` in
   * react-router 7, and a concise arrow would make that the handler's return type —
   * which does not match `Fields`' `onViewFieldDetail: (id: string) => void`.
   */
  const handleViewFieldDetail = useCallback(
    (fieldId: string) => {
      navigate(fieldDetailPath(fieldId));
    },
    [navigate]
  );

  /*
   * WI-29a. An explicit destination rather than `navigate(-1)`. A field screen is now
   * reachable by link and by refresh, so "back" from it may have no history entry
   * behind it at all — and history.back() with nothing to go back to leaves the app,
   * which is the exact failure this work item exists to remove.
   */
  const handleBackFromFieldDetail = useCallback(() => {
    navigate(PAGE_PATHS.fields);
  }, [navigate]);

  /*
   * R-1, the amplifier. The gates below used to fire unconditionally, from ABOVE
   * DashboardLayout and all fourteen pages, so a load error or one frame of `loading`
   * discarded the entire tree. Which surface a load state earns is now a pure decision
   * in lib/appLoadState.ts with a truth table under it, because App.tsx itself cannot
   * be exercised without Supabase credentials.
   */
  const chrome = resolveAppLoadPresentation({
    authLoading,
    loading,
    hasLoadedOnce,
    loadError: dataLoadError,
  });

  if (chrome.fullScreen === 'error') {
    return <AppLoadFailedScreen message={dataLoadError} onRetry={retryInitialLoad} />;
  }

  if (chrome.fullScreen === 'loading') {
    return <AppLoadingScreen authLoading={authLoading} dataLoading={loading} signedIn={!!user} />;
  }

  /*
   * WI-29b. This was two consecutive `if` statements — `!user && !wasAuthenticated` and
   * `!user && wasAuthenticated` — returning the SAME thing. Two branches that differ in
   * their condition and not in their result read as a distinction that exists, and there
   * was none.
   *
   * Recorded rather than silently tidied, because R-4 is where the distinction may
   * genuinely belong: "never signed in" and "signed out unexpectedly" plausibly deserve
   * different screens, and that is the open question the diagnosis says not to answer
   * until a real session log arrives. `wasAuthenticated` is still returned by
   * useSeasonData for exactly that, and is what the effect above reads.
   */
  if (!user) {
    return <Auth />;
  }

  /*
   * R-5. `emptySeasonsIsConfirmed` is the third state. Seasons being empty now means
   * one of two things — a load that succeeded and found none, or a load that never
   * completed — and only the first may show the first-run welcome screen. Without this
   * test a failed load still reads as "this farm has no seasons", which is the defect.
   */
  if (isOwnFarm && seasons.length === 0 && !crud.showSeasonForm && chrome.emptySeasonsIsConfirmed) {
    return (
      <FirstSeasonScreen
        farmName={activeFarm?.farmName}
        formData={crud.seasonFormData}
        onChange={crud.setSeasonFormData}
        onSubmit={crud.handleCreateSeason}
      />
    );
  }

  if (crud.showSeasonForm) {
    return (
      <CreateSeasonScreen
        formData={crud.seasonFormData}
        seasons={seasons}
        onChange={crud.setSeasonFormData}
        onSubmit={crud.handleCreateSeason}
        onCancel={crud.closeSeasonForm}
      />
    );
  }

  if (crud.showImportWizard && crud.pendingSeasonId && crud.seasonFormData.importFromSeason) {
    return (
      <SeasonImportWizard
        sourceSeasonId={crud.seasonFormData.importFromSeason}
        newSeasonId={crud.pendingSeasonId}
        userId={user.id}
        onComplete={crud.handleImportComplete}
        onCancel={crud.handleImportCancel}
      />
    );
  }

  if (crud.showDeleteConfirm && crud.seasonToDelete) {
    return (
      <DeleteSeasonScreen
        seasonName={crud.seasonToDelete.name}
        onConfirm={crud.confirmDeleteSeason}
        onCancel={crud.cancelDeleteSeason}
      />
    );
  }

  /*
   * R-1. Both indicators are fixed-position overlays rendered beside the page rather
   * than in place of it. They are repeated across the two remaining return paths on
   * purpose — FieldDetail renders outside DashboardLayout, and it is exactly the kind
   * of screen someone is mid-edit on when a refresh lands.
   */
  const loadStatusOverlays = (
    <>
      {chrome.overlay === 'refreshing' && <AppRefreshIndicator />}
      {chrome.overlay === 'error' && (
        <AppLoadErrorBanner message={dataLoadError ?? ''} onRetry={retryInitialLoad} />
      )}
    </>
  );

  if (selectedFieldId && currentSeason?.id) {
    return (
      <>
        {/*
         * R-6. This screen renders outside DashboardLayout, so it carries its own only
         * route back. If it throws, the boundary's panel has to supply that route or the
         * user is stranded on a blank page with no navigation at all.
         */}
        <ErrorBoundary
          label="this field"
          resetKey={selectedFieldId}
          action={{ label: 'Back to Fields', onClick: handleBackFromFieldDetail }}
        >
          <Suspense fallback={<PageLoadFallback />}>
            <FieldDetail
              fieldId={selectedFieldId}
              seasonId={currentSeason.id}
              onBack={handleBackFromFieldDetail}
            />
          </Suspense>
        </ErrorBoundary>
        {loadStatusOverlays}
      </>
    );
  }

  return (
    <DashboardLayout
      activePage={activePage}
      onNavigate={handleNavigate}
      currentSeason={currentSeason}
      seasons={seasons}
      onSeasonChange={crud.handleSeasonChange}
      onCreateSeason={isOwnFarm ? crud.openSeasonForm : undefined}
      onDeleteSeason={isOwnFarm ? crud.handleDeleteSeason : undefined}
      activeFarmContext={activeFarm}
      sharedFarms={sharedFarms}
      onSwitchToOwnedFarm={farms.handleSwitchToOwnedFarm}
      onSwitchToSharedFarm={farms.handleSwitchToSharedFarm}
      onSwitchToOwnFarm={farms.handleSwitchToOwnFarm}
      onFarmCreated={farms.handleFarmCreated}
      onInviteAccepted={farms.handleInviteAccepted}
      activeRole={activeRole}
    >
      {/*
       * R-6. Inside DashboardLayout, so the sidebar and season picker survive a page
       * crash and the user can navigate away — which `resetKey={activePage}` then
       * clears the error for. `loadStatusOverlays` stays OUTSIDE the boundary on
       * purpose: R-1's refresh indicator and retry banner must keep working even
       * while a page is showing the error panel.
       */}
      <ErrorBoundary label={PAGE_LABELS[activePage]} resetKey={activePage}>
      {/*
       * WI-22. The Suspense sits INSIDE the ErrorBoundary and inside DashboardLayout,
       * which is two deliberate placements rather than one.
       *
       * Inside the layout, because a fallback hoisted above it would blank the sidebar
       * and the season picker every time a page is opened for the first time — the exact
       * full-screen takeover R-1 removed, reintroduced by a different route.
       *
       * Inside the boundary, because a rejected dynamic import() throws where the lazy
       * component renders, so the boundary must be the outer of the two to catch it.
       * That is the case R-6's chunk-load classifier was written for, and until now it
       * could only fire for the three lazy panels; every page is now reachable that way.
       */}
      <Suspense fallback={<PageLoadFallback />}>
      {/*
       * WI-29a. This was a chain of `activePage === '…' &&` tests. Two things the
       * switch to <Routes> changes beyond the back button:
       *
       *  - An unknown path now lands somewhere. The old chain rendered NOTHING for a
       *    key it did not recognise, so the content area went blank with the sidebar
       *    still lit — indistinguishable from a page that failed to load.
       *  - The three owner-only screens redirect instead of rendering nothing. On a
       *    shared farm, `isOwnFarm && <Team/>` produced exactly that blank area; a
       *    collaborator who reached /team saw an empty page rather than being told
       *    anything. They are now sent to the dashboard, which is at least a screen.
       */}
      <Routes>
        <Route path={PAGE_PATHS.dashboard} element={<Dashboard seasonId={currentSeason?.id || null} />} />
        <Route
          path={PAGE_PATHS.fields}
          element={
            <Fields
              seasonId={currentSeason?.id || null}
              onViewFieldDetail={handleViewFieldDetail}
              readOnly={activeRole === 'viewer'}
            />
          }
        />
        <Route
          path={PAGE_PATHS.products}
          element={<Products seasonId={currentSeason?.id || null} readOnly={activeRole === 'viewer'} />}
        />
        <Route
          path={PAGE_PATHS.templates}
          element={<CostTemplates seasonId={currentSeason?.id || null} readOnly={activeRole === 'viewer'} />}
        />
        <Route
          path={PAGE_PATHS.yields}
          element={<Yields seasonId={currentSeason?.id || null} readOnly={activeRole === 'viewer'} />}
        />
        <Route
          path={PAGE_PATHS.harvest}
          element={<Harvest seasonId={currentSeason?.id || null} readOnly={activeRole === 'viewer'} />}
        />
        <Route
          path={PAGE_PATHS.sales}
          element={<SalesTracking seasonId={currentSeason?.id || null} readOnly={activeRole === 'viewer'} />}
        />
        <Route
          path={PAGE_PATHS['spray-planner']}
          element={
            <SprayPlanner
              currentSeasonId={currentSeason?.id || null}
              effectiveUserId={activeFarm ? activeFarm.ownerId ?? user?.id ?? null : user?.id ?? null}
              farmId={activeFarm?.farmId ?? null}
              readOnly={activeRole === 'viewer'}
            />
          }
        />
        <Route path={PAGE_PATHS.reports} element={<Reports currentSeasonId={currentSeason?.id || null} />} />
        <Route
          path={PAGE_PATHS['account-settings']}
          element={isOwnFarm ? <AccountSettings /> : <Navigate to={PAGE_PATHS.dashboard} replace />}
        />
        <Route
          path={PAGE_PATHS['farm-settings']}
          element={
            isOwnFarm ? (
              <FarmSettings onFarmsUpdated={farms.handleFarmsUpdated} />
            ) : (
              <Navigate to={PAGE_PATHS.dashboard} replace />
            )
          }
        />
        <Route
          path={PAGE_PATHS.team}
          element={
            isOwnFarm ? (
              <Team
                onSwitchToFarm={farms.handleSwitchToSharedFarm}
                onSwitchToOwnFarm={farms.handleSwitchToOwnFarm}
                sharedFarms={sharedFarms}
                onRefreshSharedFarms={loadSharedFarms}
              />
            ) : (
              <Navigate to={PAGE_PATHS.dashboard} replace />
            )
          }
        />
        {/*
         * `replace`, so a mistyped or stale URL does not leave a history entry that
         * back would bounce off forever.
         */}
        <Route path="*" element={<Navigate to={PAGE_PATHS.dashboard} replace />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
      {loadStatusOverlays}
    </DashboardLayout>
  );
}

function AppWithFarm() {
  const { user } = useAuth();
  return (
    <FarmProvider currentUserId={user?.id ?? null}>
      <AppContent />
    </FarmProvider>
  );
}

/*
 * WI-29a chose HashRouter; the move to Netlify (6 Sep 2026) made this BrowserRouter.
 * It has always been a deployment decision rather than a routing one, and the deployment
 * is what changed — nothing about the routes did.
 *
 * Clean paths require the host to rewrite every unknown path to index.html, and until
 * there was a committed host that promise could not be made: a BrowserRouter without the
 * rewrite means a refresh on /fields returns a 404, which reads to the owner as the app
 * being broken rather than as a missing config file. The rewrite now exists and is
 * committed — `public/_redirects`, which Vite copies into dist/ so it travels inside the
 * deployed artifact. Vite's own dev server does the same fallback natively, so `npm run
 * dev` and production agree.
 *
 * IF THIS IS EVER SERVED FROM SOMEWHERE WITHOUT THAT RULE, THIS LINE GOES BACK TO
 * HashRouter. That is the whole change — every path is declared in lib/appRoutes.ts and
 * nothing else in the app knows which router it is under. The symptom that says you need
 * it: navigation inside the app works perfectly, and a refresh or a pasted link 404s.
 *
 * It sits ABOVE the providers so that anything inside them, including the Auth screen,
 * may navigate. It sits INSIDE main.tsx's root error boundary, so a router failure is
 * still caught rather than blanking the page.
 */
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <AppWithFarm />
          <ToastContainer />
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
