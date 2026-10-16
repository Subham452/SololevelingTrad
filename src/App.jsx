import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import MarketingLayout from "./layouts/MarketingLayout.jsx";
import DashboardLayout from "./layouts/DashboardLayout.jsx";
import { LoadingState } from "./components/ui.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { CallProvider } from "./components/calls/CallProvider.jsx";
import Landing from "./pages/Landing.jsx";
import Solutions from "./pages/Solutions.jsx";
const Markets = lazy(() => import("./pages/Markets.jsx"));
const CoinDetail = lazy(() => import("./pages/CoinDetail.jsx"));
const Watchlist = lazy(() => import("./pages/Watchlist.jsx"));
const News = lazy(() => import("./pages/News.jsx"));
const Alerts = lazy(() => import("./pages/Alerts.jsx"));
const Trade = lazy(() => import("./pages/Trade.jsx"));
const Portfolio = lazy(() => import("./pages/Portfolio.jsx"));
const Wallet = lazy(() => import("./pages/Wallet.jsx"));
const WalletTransactions = lazy(() => import("./pages/wallet/Transactions.jsx"));
const WalletAddMoney = lazy(() => import("./pages/wallet/AddMoney.jsx"));
const Subscription = lazy(() => import("./pages/Subscription.jsx"));
const Community = lazy(() => import("./pages/Community.jsx"));
const AlgoTrading = lazy(() => import("./pages/AlgoTrading.jsx"));
const Rooms = lazy(() => import("./pages/Rooms.jsx"));
const RoomSession = lazy(() => import("./pages/RoomSession.jsx"));
const Live = lazy(() => import("./pages/Live.jsx"));
const LiveCreate = lazy(() => import("./pages/LiveCreate.jsx"));
const LiveStudio = lazy(() => import("./pages/LiveStudio.jsx"));
const LiveViewer = lazy(() => import("./pages/LiveViewer.jsx"));
const CallsHistory = lazy(() => import("./pages/CallsHistory.jsx"));
const Signals = lazy(() => import("./pages/Signals.jsx"));
const Pricing = lazy(() => import("./pages/Pricing.jsx"));
const Documentation = lazy(() => import("./pages/Documentation.jsx"));
const Terminal = lazy(() => import("./pages/Terminal.jsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
const Account = lazy(() => import("./pages/Account.jsx"));
const Purchases = lazy(() => import("./pages/Purchases.jsx"));

// Unified checkout (review → details → payment → result)
const Checkout = lazy(() => import("./pages/checkout/Checkout.jsx"));
const CheckoutOrders = lazy(() => import("./pages/checkout/CheckoutOrders.jsx"));
const CheckoutResult = lazy(() => import("./pages/checkout/CheckoutResult.jsx"));

// Admin Control Center (own layout, staff-gated)
const AdminLayout = lazy(() => import("./layouts/AdminLayout.jsx"));
const AdminOverview = lazy(() => import("./pages/admin/Overview.jsx"));
const AdminAnalytics = lazy(() => import("./pages/admin/Analytics.jsx"));
const AdminUsers = lazy(() => import("./pages/admin/Users.jsx"));
const AdminUserDetail = lazy(() => import("./pages/admin/UserDetail.jsx"));
const AdminTransactions = lazy(() => import("./pages/admin/Transactions.jsx"));
const AdminWallet = lazy(() => import("./pages/admin/Wallet.jsx"));
const AdminSubscriptions = lazy(() => import("./pages/admin/Subscriptions.jsx"));
const AdminPlans = lazy(() => import("./pages/admin/Plans.jsx"));
const AdminActivity = lazy(() => import("./pages/admin/Activity.jsx"));
const AdminSecurity = lazy(() => import("./pages/admin/Security.jsx"));
const AdminMessages = lazy(() => import("./pages/admin/Messages.jsx"));
const AdminCalls = lazy(() => import("./pages/admin/Calls.jsx"));
const AdminModeration = lazy(() => import("./pages/admin/Moderation.jsx"));
const AdminHealth = lazy(() => import("./pages/admin/Health.jsx"));
const AdminAnnouncements = lazy(() => import("./pages/admin/Announcements.jsx"));
const AdminSettings = lazy(() => import("./pages/admin/Settings.jsx"));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

const Fallback = () => <div className="mx-auto max-w-6xl px-5 py-16"><LoadingState label="Loading workspace…" /></div>;

export default function App() {
  return (
    <AuthProvider>
    <CallProvider>
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={<Fallback />}>
        <Routes>
          {/* Marketing site */}
          <Route element={<MarketingLayout />}>
            <Route index element={<Landing />} />
            <Route path="solutions" element={<Solutions />} />
            <Route path="terminal" element={<Terminal />} />
            <Route path="community" element={<ProtectedRoute><Community /></ProtectedRoute>} />
            <Route path="rooms" element={<ProtectedRoute><Rooms /></ProtectedRoute>} />
            <Route path="rooms/join/:token" element={<ProtectedRoute><RoomSession /></ProtectedRoute>} />
            <Route path="rooms/:roomId" element={<ProtectedRoute><RoomSession /></ProtectedRoute>} />
            <Route path="live" element={<ProtectedRoute><Live /></ProtectedRoute>} />
            <Route path="live/create" element={<ProtectedRoute><LiveCreate /></ProtectedRoute>} />
            <Route path="live/:liveId/studio" element={<ProtectedRoute><LiveStudio /></ProtectedRoute>} />
            <Route path="live/:liveId" element={<ProtectedRoute><LiveViewer /></ProtectedRoute>} />
            <Route path="calls/history" element={<ProtectedRoute><CallsHistory /></ProtectedRoute>} />
            <Route path="algo-trading" element={<ProtectedRoute><AlgoTrading /></ProtectedRoute>} />
            <Route path="pricing" element={<Pricing />} />
            <Route path="documentation" element={<Documentation />} />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route path="forgot-password" element={<ForgotPassword />} />
          </Route>

          {/* Authenticated application shell */}
          <Route element={<DashboardLayout />}>
            <Route path="dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="markets" element={<Markets />} />
            <Route path="markets/:id" element={<CoinDetail />} />
            <Route path="watchlist" element={<Watchlist />} />
            <Route path="news" element={<News />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="signals" element={<Signals />} />
            <Route path="trade" element={<ProtectedRoute><Trade /></ProtectedRoute>} />
            <Route path="trade/:pair" element={<ProtectedRoute><Trade /></ProtectedRoute>} />
            <Route path="orders" element={<ProtectedRoute><Trade /></ProtectedRoute>} />
            <Route path="portfolio" element={<ProtectedRoute><Portfolio /></ProtectedRoute>} />
            <Route path="wallet" element={<ProtectedRoute><Wallet /></ProtectedRoute>} />
            <Route path="wallet/transactions" element={<ProtectedRoute><WalletTransactions /></ProtectedRoute>} />
            <Route path="wallet/add" element={<ProtectedRoute><WalletAddMoney /></ProtectedRoute>} />
            <Route path="subscription" element={<ProtectedRoute><Subscription /></ProtectedRoute>} />
            <Route path="purchases" element={<ProtectedRoute><Purchases /></ProtectedRoute>} />
            {/* Unified checkout — one flow for plans and purchases. */}
            <Route path="checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
            <Route path="checkout/orders" element={<ProtectedRoute><CheckoutOrders /></ProtectedRoute>} />
            <Route path="checkout/success" element={<ProtectedRoute><CheckoutResult state="success" /></ProtectedRoute>} />
            <Route path="checkout/pending" element={<ProtectedRoute><CheckoutResult state="pending" /></ProtectedRoute>} />
            <Route path="checkout/failed" element={<ProtectedRoute><CheckoutResult state="failed" /></ProtectedRoute>} />
            <Route path="checkout/cancelled" element={<ProtectedRoute><CheckoutResult state="cancelled" /></ProtectedRoute>} />
            <Route path="account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
          </Route>

          {/* Admin Control Center — staff-only shell with its own layout */}
          <Route
            path="admin"
            element={<ProtectedRoute requireStaff><AdminLayout /></ProtectedRoute>}
          >
            <Route index element={<AdminOverview />} />
            <Route path="analytics" element={<AdminAnalytics />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="users/:id" element={<AdminUserDetail />} />
            <Route path="transactions" element={<AdminTransactions />} />
            <Route path="wallet" element={<AdminWallet />} />
            <Route path="subscriptions" element={<AdminSubscriptions />} />
            <Route path="plans" element={<AdminPlans />} />
            <Route path="activity" element={<AdminActivity />} />
            <Route path="security" element={<AdminSecurity />} />
            <Route path="messages" element={<AdminMessages />} />
            <Route path="calls" element={<AdminCalls />} />
            <Route path="moderation" element={<AdminModeration />} />
            <Route path="announcements" element={<AdminAnnouncements />} />
            <Route path="health" element={<AdminHealth />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>
          <Route path="*" element={<MarketingLayout />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
    </CallProvider>
    </AuthProvider>
  );
}
