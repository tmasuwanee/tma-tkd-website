import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Minus, Plus, Loader2, ShoppingBag, Info } from "lucide-react";
import { formatCents } from "../../../shared/bakeSaleProducts";

/**
 * Public bake-sale menu (/bake-sale). One QR beside the table points here.
 *
 * Flow: pick quantities, optional fundraiser contribution, hosted Stripe
 * Checkout, then /bake-sale/success. Prices shown here are for display only.
 * The server rebuilds every line item from shared/bakeSaleProducts.ts, so
 * editing a price in the browser changes nothing about what gets charged.
 *
 * Mobile first on purpose: this is read one-handed, at a table, in bad light.
 * Large type, 48px touch targets, a sticky checkout bar that never scrolls away.
 *
 * The cart survives a cancelled checkout via sessionStorage, so someone who
 * backs out of Stripe lands back on their own cart instead of an empty page.
 */
const CART_KEY = "tma_bake_sale_cart";

function loadCart(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default function BakeSale() {
  const menu = trpc.bakeSale.menu.useQuery();
  const createCheckout = trpc.bakeSale.createCheckout.useMutation();

  const [cart, setCart] = useState<Record<string, number>>(loadCart);
  const [contribution, setContribution] = useState(0); // never preselected
  const [isStarting, setIsStarting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    try { sessionStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* private mode */ }
  }, [cart]);

  // Someone backed out of Stripe. Tell them nothing was charged.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("checkout") === "cancelled") {
      toast.info("Checkout cancelled. Nothing was charged. Your items are still here.");
      window.history.replaceState({}, "", "/bake-sale");
    }
  }, []);

  const products = menu.data?.products ?? [];

  const { itemCount, subtotal } = useMemo(() => {
    let count = 0, sum = 0;
    for (const p of products) {
      const q = cart[p.id] ?? 0;
      count += q;
      sum += q * p.unitAmount;
    }
    return { itemCount: count, subtotal: sum };
  }, [cart, products]);

  const total = subtotal + contribution;

  function adjust(id: string, delta: number, max: number) {
    setCart(prev => {
      const next = Math.max(0, Math.min(max, (prev[id] ?? 0) + delta));
      const copy = { ...prev };
      if (next === 0) delete copy[id]; else copy[id] = next;
      return copy;
    });
  }

  async function checkout() {
    if (itemCount === 0 || submittingRef.current) return;
    submittingRef.current = true;
    setIsStarting(true);
    try {
      const r = await createCheckout.mutateAsync({
        items: Object.entries(cart).map(([productId, quantity]) => ({ productId, quantity })),
        ...(contribution > 0 ? { contributionCents: contribution } : {}),
        origin: window.location.origin,
      });
      if (!r.url) throw new Error("No checkout URL returned.");
      window.location.href = r.url;   // hosted Stripe Checkout
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not start checkout. Please ask us at the table.");
      submittingRef.current = false;
      setIsStarting(false);
    }
  }

  const goal = menu.data?.goal;
  const goalPct = goal?.showGoal && goal.targetAmount > 0
    ? Math.min(100, Math.round((goal.raisedAmount / goal.targetAmount) * 100))
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-40">
      <header className="bg-[#1a2d5a] px-5 pt-8 pb-7 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Bake Sale</h1>
        <p className="mt-2 text-base text-white/80">Choose your treats and support our fundraiser.</p>
        <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-white/50">
          Top Martial Arts Suwanee
        </p>
      </header>

      {goal?.showGoal && (
        <div className="border-b border-gray-200 bg-white px-5 py-4">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-semibold text-[#1a2d5a]">{goal.label}</span>
            <span className="text-sm text-gray-600">
              {formatCents(goal.raisedAmount)} of {formatCents(goal.targetAmount)}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
            <div className="h-full rounded-full bg-[#c41e3a]" style={{ width: `${goalPct}%` }} />
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-md space-y-4 px-4 py-5">
        {menu.isLoading && (
          <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading the menu
          </div>
        )}

        {menu.isError && (
          <Card className="border border-gray-200 bg-white p-6 text-center">
            <p className="text-gray-700">We could not load the menu. Please refresh, or pay us at the table.</p>
          </Card>
        )}

        {products.map(p => {
          const qty = cart[p.id] ?? 0;
          const selected = qty > 0;
          return (
            <Card
              key={p.id}
              className={`overflow-hidden border bg-white transition-colors ${
                selected ? "border-[#c41e3a] ring-2 ring-[#c41e3a]/20" : "border-gray-200"
              }`}
            >
              {p.image && (
                <img
                  src={p.image}
                  alt=""
                  className="h-40 w-full object-cover"
                  loading="lazy"
                  // The card must look right even before the photos are dropped in.
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-bold leading-tight text-[#1a2d5a]">{p.name}</h2>
                  <span className="shrink-0 text-lg font-extrabold text-[#1a2d5a]">{formatCents(p.unitAmount)}</span>
                </div>
                <p className="mt-1 text-sm leading-snug text-gray-600">{p.description}</p>

                {p.allergenWarning && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-gray-500">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{p.allergenWarning}</span>
                  </p>
                )}

                <div className="mt-4 flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 w-12 p-0"
                    onClick={() => adjust(p.id, -1, p.maxQuantity)}
                    disabled={qty <= 0}
                    aria-label={`Remove one ${p.name}`}
                  >
                    <Minus className="h-5 w-5" />
                  </Button>
                  <span
                    className={`w-10 text-center text-2xl font-bold ${selected ? "text-[#1a2d5a]" : "text-gray-300"}`}
                    aria-live="polite"
                    aria-label={`${qty} ${p.name} selected`}
                  >
                    {qty}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 w-12 p-0"
                    onClick={() => adjust(p.id, 1, p.maxQuantity)}
                    disabled={qty >= p.maxQuantity}
                    aria-label={`Add one ${p.name}`}
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                  {selected && (
                    <span className="ml-auto text-base font-semibold text-[#1a2d5a]">
                      {formatCents(qty * p.unitAmount)}
                    </span>
                  )}
                </div>
              </div>
            </Card>
          );
        })}

        {itemCount > 0 && (
          <Card className="border border-gray-200 bg-white p-4">
            <h3 className="text-base font-bold text-[#1a2d5a]">Add a little extra to support the fundraiser?</h3>
            <p className="mt-1 text-sm text-gray-600">Completely optional. Every dollar goes to the school.</p>
            <div className="mt-3 grid grid-cols-5 gap-2">
              <Button
                type="button"
                variant={contribution === 0 ? "default" : "outline"}
                className={`h-12 px-1 text-xs font-semibold ${contribution === 0 ? "bg-[#1a2d5a] text-white hover:bg-[#1a2d5a]/90" : ""}`}
                onClick={() => setContribution(0)}
              >
                No thanks
              </Button>
              {(menu.data?.contributionOptions ?? []).map(cents => (
                <Button
                  key={cents}
                  type="button"
                  variant={contribution === cents ? "default" : "outline"}
                  className={`h-12 px-1 text-sm font-bold ${contribution === cents ? "bg-[#c41e3a] text-white hover:bg-[#c41e3a]/90" : ""}`}
                  onClick={() => setContribution(cents)}
                >
                  +${cents / 100}
                </Button>
              ))}
            </div>
          </Card>
        )}

        <p className="pt-2 text-center text-xs text-gray-400">
          Payment is processed by Stripe. We never see your card number.
        </p>
      </main>

      {/* Sticky checkout bar. Always visible, thumb height, safe-area padded. */}
      <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-2px_12px_rgba(0,0,0,0.08)] backdrop-blur">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="flex items-center gap-1.5 text-sm text-gray-600">
              <ShoppingBag className="h-4 w-4" aria-hidden="true" />
              {itemCount} item{itemCount === 1 ? "" : "s"}
              {contribution > 0 && <span className="text-[#c41e3a]"> + {formatCents(contribution)} donation</span>}
            </span>
            <span className="text-2xl font-extrabold text-[#1a2d5a]">{formatCents(total)}</span>
          </div>
          <Button
            type="button"
            onClick={checkout}
            disabled={itemCount === 0 || isStarting}
            className="h-14 w-full bg-[#c41e3a] text-base font-bold text-white hover:bg-[#c41e3a]/90 disabled:bg-gray-300 disabled:text-gray-500"
          >
            {isStarting ? (
              <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Opening secure checkout</>
            ) : itemCount === 0 ? (
              "Select an item to continue"
            ) : (
              `Continue to Payment · ${formatCents(total)}`
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
