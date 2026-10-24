export type Row = { id: number; [key: string]: any };
export type User = {
  id: number;
  username: string;
  role: "admin" | "user";
  must_change_password: boolean;
  active: boolean;
};
export async function api<T = any>(
  path: string,
  method = "GET",
  data?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const csrf =
    document.cookie
      .split("; ")
      .find((v) => v.startsWith("farm_csrf="))
      ?.split("=")[1] || "";
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    signal,
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const body = await response.json();
  if (!response.ok) {
    const details = body.error?.details
      ?.map(
        (d: { field: string; message: string }) => `${d.field}: ${d.message}`,
      )
      .join(" · ");
    throw new Error(
      [body.error?.message || "Permintaan gagal.", details]
        .filter(Boolean)
        .join(" "),
    );
  }
  return body;
}
export const rupiah = (v: unknown) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(v ?? 0));
export const number = (v: unknown, digits = 1) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(
    Number(v ?? 0),
  );
export const dateLabel = (v: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${v}T12:00:00+07:00`));
