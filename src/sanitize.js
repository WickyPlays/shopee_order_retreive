import fs from "node:fs/promises";
import path from "node:path";

const PRICE_SCALE = 100_000;
const SHOPEE_ORDER_EPOCH = 1_546_300_800; // 2019-01-01T00:00:00Z
const ROOT_DIR = path.resolve(import.meta.dirname, "..");
const INPUT_PATH = path.join(ROOT_DIR, "input", "orders.json");
const OUTPUT_DIR = path.join(ROOT_DIR, "output");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "orders_sanitized.json");

/**
 * Format a Unix timestamp (in seconds) as an ISO 8601 string, or null if missing.
 * @param {number | undefined | null} unixSeconds
 * @returns {string | null}
 */
function formatTimestamp(unixSeconds) {
  return typeof unixSeconds === "number" && unixSeconds > 0
    ? new Date(unixSeconds * 1000).toISOString()
    : null;
}

/**
 * Derive approximate purchase time from Shopee's 15-digit order_id
 * (upper digits encode seconds since 2019-01-01T00:00:00Z).
 * @param {number | undefined | null} orderId
 * @returns {string | null}
 */
function derivePurchaseTime(orderId) {
  if (typeof orderId !== "number" || orderId <= 0) {
    return null;
  }
  const unixSeconds = Math.floor(orderId / 1_000_000) + SHOPEE_ORDER_EPOCH;
  return formatTimestamp(unixSeconds);
}

/**
 * Normalize Shopee's status label (e.g. "label_order_delivered" -> "delivered").
 * @param {Record<string, any> | undefined} statusObj
 * @returns {string}
 */
function normalizeStatus(statusObj) {
  const raw =
    statusObj?.status_label?.text ??
    statusObj?.list_view_status_label?.text ??
    "";
  return raw.replace(/^label_(?:order_)?/, "") || "unknown";
}

/**
 * Convert Shopee's scaled integer price (1e-5 VND) to standard VND.
 * @param {number | undefined} rawPrice
 * @returns {number}
 */
function normalizePrice(rawPrice) {
  return typeof rawPrice === "number" ? rawPrice / PRICE_SCALE : 0;
}

/**
 * Calculate rounded discount percentage from normalized prices.
 * @param {number} price
 * @param {number} priceBeforeDiscount
 * @returns {number}
 */
function calculateDiscountPercentage(price, priceBeforeDiscount) {
  if (priceBeforeDiscount <= 0 || priceBeforeDiscount <= price) {
    return 0;
  }
  return Math.round(((priceBeforeDiscount - price) / priceBeforeDiscount) * 100);
}

/**
 * Sanitize a single Shopee order item.
 * @param {Record<string, any>} item
 */
function sanitizeItem(item) {
  const shopId = item.shop_id;
  const itemId = item.item_id;
  const price = normalizePrice(item.item_price);
  const rawBeforeDiscount = item.price_before_discount;
  const priceBeforeDiscount =
    typeof rawBeforeDiscount === "number" && rawBeforeDiscount > 0
      ? normalizePrice(rawBeforeDiscount)
      : price;

  return {
    item_id: itemId,
    shop_id: shopId,
    link: `https://shopee.vn/product/${shopId}/${itemId}`,
    name: item.name ?? "",
    model_name: item.model_name ?? "",
    price,
    price_before_discount: priceBeforeDiscount,
    discount_percentage: calculateDiscountPercentage(price, priceBeforeDiscount),
    order_price: normalizePrice(item.order_price),
    item_amount: item.amount ?? 0,
  };
}

/**
 * Sanitize a single Shopee order entry into a clean order structure.
 * @param {Record<string, any>} entry
 */
function sanitizeOrder(entry) {
  const detail = entry?.order_list_detail;
  const infoCard = detail?.info_card;
  if (!infoCard) {
    return null;
  }

  const cards = infoCard.order_list_cards ?? [];
  const primaryShop = cards[0]?.shop_info ?? {};

  const items = cards.flatMap((card) =>
    (card.product_info?.item_groups ?? []).flatMap((group) =>
      (group.items ?? []).map(sanitizeItem)
    )
  );

  return {
    order_id: infoCard.order_id,
    status: normalizeStatus(detail.status),
    time_purchased: derivePurchaseTime(infoCard.order_id),
    time_delivered: formatTimestamp(detail.shipping?.tracking_info?.ctime),
    shop_id: primaryShop.shop_id ?? items[0]?.shop_id ?? null,
    user_id: primaryShop.user_id ?? null,
    user_name: primaryShop.username ?? "",
    product_count: infoCard.product_count ?? items.length,
    total_price: {
      subtotal: normalizePrice(infoCard.subtotal),
      total: normalizePrice(infoCard.final_total),
    },
    items,
  };
}

async function main() {
  const raw = await fs.readFile(INPUT_PATH, "utf8");
  const orders = JSON.parse(raw);

  if (!Array.isArray(orders)) {
    throw new Error(`Expected an array in ${INPUT_PATH}`);
  }

  const sanitized = orders.map(sanitizeOrder).filter(Boolean);
  const totalItems = sanitized.reduce((sum, order) => sum + order.items.length, 0);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(sanitized, null, 2), "utf8");

  console.log(
    `Sanitized ${sanitized.length} orders (${totalItems} items) -> ${OUTPUT_PATH}`
  );
}

main().catch((err) => {
  console.error("Failed to sanitize orders:", err);
  process.exit(1);
});
