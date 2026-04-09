import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useAccount, useWalletClient, useSwitchChain } from "wagmi";
import { Input } from "../components/ui/input";
import {
  getWallets,
  getBalances,
  getSubscriptions,
  getTrades,
  addSubscription,
  removeSubscription,
  markHlRegistered,
} from "../api/copyTrading";
import { getUser } from "../api/backend";
import { postExchange, buildApproveAgentAction } from "../api/hlExchange";
import { buildL1TypedData } from "../utils/hlSigning";
import { HL_SIGNATURE_CHAIN_ID } from "../config/hyperliquid";
import { useVerifiedAuth } from "../hooks/useVerifiedAuth";
import { useToast } from "../components/Toast";
import { getUserDisplayName, getUserHandle } from "../utils/user";
import Avatar from "../components/Avatar";
import PageHeader from "../components/PageHeader";
import { Button } from "../components/ui/button";
import WalletStatusOrb from "../components/WalletStatusOrb";

export default function CopyWallet({ user }) {
  const { id } = useParams();
  const walletId = parseInt(id);
  const { chain } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const [wallet, setWallet] = useState(null);
  const [balance, setBalance] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [trades, setTrades] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [source, setSource] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingSource, setRemovingSource] = useState(null);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [authorizing, setAuthorizing] = useState(false);
  const { requireVerified } = useVerifiedAuth(user);
  const toast = useToast();

  const handleAuthorize = requireVerified(async () => {
    if (!walletClient || !wallet) return;
    setAuthorizing(true);
    try {
      const requiredChainId = parseInt(HL_SIGNATURE_CHAIN_ID);
      if (chain?.id !== requiredChainId) {
        await switchChainAsync({ chainId: requiredChainId });
      }
      const action = buildApproveAgentAction(wallet.address);
      const typedData = buildL1TypedData({
        action,
        types: [
          { name: "hyperliquidChain", type: "string" },
          { name: "agentAddress", type: "address" },
          { name: "agentName", type: "string" },
          { name: "nonce", type: "uint64" },
        ],
        primaryType: "HyperliquidTransaction:ApproveAgent",
      });
      const signature = await walletClient.signTypedData({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      });
      try {
        await postExchange(action, action.nonce, signature);
      } catch (hlErr) {
        if (!hlErr?.message?.includes("Extra agent already used")) {
          throw hlErr;
        }
      }
      const updated = await markHlRegistered(walletId);
      setWallet((prev) => ({ ...prev, ...updated }));
      toast.success("Wallet authorized on Hyperliquid");
    } catch (err) {
      if (
        err?.code === 4001 ||
        err?.message?.includes("User rejected") ||
        err?.message?.includes("User denied")
      ) {
        // User cancelled
      } else {
        toast.error(err.message || "Authorization failed");
      }
    }
    setAuthorizing(false);
  }, "Authorizing wallet");

  const loadProfiles = useCallback(
    async (subs) => {
      const addresses = subs.map((s) => s.source).filter((a) => !profiles[a]);
      if (addresses.length === 0) return;
      const results = await Promise.all(
        addresses.map((a) => getUser(a).catch(() => null)),
      );
      const newProfiles = {};
      addresses.forEach((a, i) => {
        if (results[i]) newProfiles[a] = results[i];
      });
      if (Object.keys(newProfiles).length > 0) {
        setProfiles((prev) => ({ ...prev, ...newProfiles }));
      }
    },
    [profiles],
  );

  const loadTrades = useCallback(
    async (p) => {
      try {
        const data = await getTrades(walletId, p);
        if (data) {
          setTrades(data.trades || []);
          setTotalPages(data.totalPages || 1);
        }
      } catch (err) {
        console.error("Failed to load trades:", err);
      }
    },
    [walletId],
  );

  const load = useCallback(async () => {
    try {
      const [walletsData, balancesData, subsData] = await Promise.all([
        getWallets(),
        getBalances().catch(() => ({})),
        getSubscriptions().catch(() => []),
      ]);

      const w = (walletsData || []).find((w) => w.id === walletId);
      setWallet(w || null);

      if (w && balancesData) {
        const b = balancesData[w.hlAddress];
        setBalance(b ? parseFloat(b.committed) : null);
      }

      const walletSubs =
        subsData && w
          ? (Array.isArray(subsData) ? subsData : []).filter(
              (s) => s.subscriber === w.hlAddress,
            )
          : [];
      setSubscriptions(walletSubs);

      if (walletSubs.length > 0) {
        loadProfiles(walletSubs);
      }

      await loadTrades(1);
    } catch (err) {
      toast.error(err.message || "Failed to load wallet");
    }
    setLoading(false);
  }, [walletId, loadTrades, toast, loadProfiles]);

  useEffect(() => {
    load();
  }, [load]);

  const goToPage = (p) => {
    setPage(p);
    loadTrades(p);
  };

  const handleAddSub = requireVerified(async (e) => {
    e.preventDefault();
    if (!source.trim()) return;
    setAdding(true);
    try {
      await addSubscription(source.trim(), walletId);
      setSource("");
      toast.success("Subscription added");
      await load();
    } catch (err) {
      toast.error(err.message || "Failed to add subscription");
    }
    setAdding(false);
  }, "Adding subscription");

  const handleRemoveSub = requireVerified(async (sourceAddr) => {
    setRemovingSource(sourceAddr);
    try {
      await removeSubscription(sourceAddr, walletId);
      toast.success("Unsubscribed");
      await load();
    } catch (err) {
      toast.error(err.message || "Failed to unsubscribe");
    }
    setRemovingSource(null);
  }, "Removing subscription");

  if (loading) {
    return (
      <div>
        <PageHeader title="Wallet" showBack />
        <div className="profile-gate">
          <div className="profile-gate-title">Loading...</div>
        </div>
      </div>
    );
  }

  if (!wallet) {
    return (
      <div>
        <PageHeader title="Wallet" showBack />
        <div className="profile-gate">
          <div className="profile-gate-title">Wallet not found</div>
          <p className="profile-gate-subtitle">
            <Link to="/copy" style={{ color: "var(--primary)" }}>
              Back to wallets
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={
          <>
            {wallet.emoji || "💼"} {wallet.name}{" "}
            <span
              className="cw-header-addr"
              onClick={() => {
                navigator.clipboard.writeText(wallet.hlAddress);
                toast.success("Address copied");
              }}
            >
              {wallet.hlAddress.slice(0, 6)}...{wallet.hlAddress.slice(-4)}
            </span>
          </>
        }
        showBack
      />

      <div className="cw-grid">
        {/* Status orb */}
        <WalletStatusOrb
          status={!wallet.hlRegistered ? 'unauthorized' : subscriptions.length > 0 ? 'active' : 'inactive'}
        />

        {/* Stats row */}
        <div className="trader-row trader-row--2">
          <div className="trader-card">
            <span className="trader-card__label">Balance</span>
            <span className="trader-card__value">
              {balance !== null
                ? `$${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : "—"}
            </span>
            <div className="trader-card__sub">
              <span className="trader-card__sub-label">Subscriptions</span>
              <span className="trader-card__sub-value">
                {subscriptions.length}
              </span>
            </div>
          </div>
          <div className="trader-card">
            <span className="trader-card__label">Trades</span>
            <span className="trader-card__value">{trades.length}</span>
            <div className="trader-card__sub">
              <span className="trader-card__sub-label">Status</span>
              <span
                className="trader-card__sub-value"
                style={{
                  color:
                    subscriptions.length > 0
                      ? "var(--profit-green)"
                      : "var(--text-third)",
                }}
              >
                {subscriptions.length > 0 ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
        </div>

        {/* Authorization */}
        {!wallet.hlRegistered && (
          <div className="cw-authorize-banner">
            <div className="cw-authorize-info">
              <span className="cw-authorize-title">Wallet not authorized</span>
              <span className="cw-authorize-desc">
                Authorize this wallet on Hyperliquid to enable copy trading.
              </span>
            </div>
            <Button
              size="sm"
              className="rounded-full bg-[var(--primary)] text-[#060a0e] font-bold flex-shrink-0"
              disabled={authorizing || !walletClient}
              loading={authorizing}
              onClick={handleAuthorize}
            >
              Authorize
            </Button>
          </div>
        )}

        {wallet.hlRegistered && (
          <>
            {/* Subscriptions */}
            <div className="cw-section">
              <div className="section-header">
                <span className="section-title">Subscriptions</span>
                <span className="section-count">{subscriptions.length}</span>
              </div>

              {subscriptions.length > 0 && (
                <div className="cw-sub-list">
                  {subscriptions.map((s, i) => {
                    const profile = profiles[s.source];
                    return (
                      <div key={i} className="cw-sub-item">
                        <Link
                          to={`/profile/${s.source}`}
                          className="cw-sub-profile"
                        >
                          <Avatar
                            address={s.source}
                            size={32}
                            avatarUrl={profile?.avatarUrl}
                          />
                          <div className="cw-sub-profile-info">
                            <span className="cw-sub-name">
                              {profile
                                ? getUserDisplayName(profile)
                                : `${s.source.slice(0, 6)}...${s.source.slice(-4)}`}
                            </span>
                            <span className="cw-sub-handle">
                              {profile
                                ? getUserHandle(profile)
                                : s.source.slice(0, 10) + "..."}
                            </span>
                          </div>
                        </Link>
                        <button
                          className="cw-sub-remove"
                          disabled={removingSource === s.source}
                          onClick={() => handleRemoveSub(s.source)}
                          aria-label="Unsubscribe"
                        >
                          {removingSource === s.source ? "..." : "×"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <form onSubmit={handleAddSub} className="cw-sub-form">
                <Input
                  placeholder="Source address (0x...)"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  size="sm"
                  className="text-[13px]"
                  wrapperClassName="border-[var(--border)] bg-transparent"
                  required
                />
                <Button
                  type="submit"
                  size="sm"
                  className="rounded-full bg-[var(--primary)] text-[#060a0e] font-bold flex-shrink-0"
                  disabled={adding || !source.trim()}
                  loading={adding}
                >
                  Add
                </Button>
              </form>
            </div>

            {/* Trades */}
            <div className="cw-section">
              <div className="section-header">
                <span className="section-title">Trades</span>
              </div>

              {trades.length === 0 ? (
                <div className="empty-text">No trades yet.</div>
              ) : (
                <>
                  <div className="cw-trades-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Coin</th>
                          <th>Side</th>
                          <th>Size</th>
                          <th>Price</th>
                          <th>Reduce</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trades.map((t, i) => {
                          const isBuy = t.is_buy ?? t.b;
                          const size = t.sz ?? t.s;
                          const price = t.limit_px ?? t.p;
                          const reduce = t.reduce_only ?? t.r;
                          return (
                            <tr key={t.id ?? i}>
                              <td>{new Date(t.time).toLocaleTimeString()}</td>
                              <td style={{ fontWeight: 600 }}>{t.coin}</td>
                              <td
                                style={{
                                  color: isBuy
                                    ? "var(--profit-green)"
                                    : "var(--loss-red)",
                                  fontWeight: 600,
                                }}
                              >
                                {isBuy ? "Buy" : "Sell"}
                              </td>
                              <td>{size}</td>
                              <td>{price}</td>
                              <td style={{ color: "var(--text-secondary)" }}>
                                {reduce ? "Yes" : "No"}
                              </td>
                              <td>
                                <span
                                  className={`copy-trade-status copy-trade-status--${t.status || "pending"}`}
                                >
                                  {t.status || "pending"}
                                </span>
                                {t.error && (
                                  <div className="copy-trade-error">
                                    {t.error}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {totalPages > 1 && (
                    <div className="cw-pagination">
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full border-[var(--border)] text-[var(--text)]"
                        disabled={page <= 1}
                        onClick={() => goToPage(page - 1)}
                      >
                        Prev
                      </Button>
                      <span className="cw-pagination-label">
                        Page {page} of {totalPages}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full border-[var(--border)] text-[var(--text)]"
                        disabled={page >= totalPages}
                        onClick={() => goToPage(page + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
